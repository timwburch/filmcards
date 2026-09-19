import { authenticate } from './_lib/auth.js';
import { MAX_CARDS, isUuid } from './_lib/cards.js';
import { sql } from './_lib/db.js';
import { applyCors, fail, requireMethod, sendJson } from './_lib/http.js';

const readId = (request) => {
  const fromBody = request.method === 'POST' ? request.body?.id : null;
  const fromQuery = new URL(request.url, 'http://localhost').searchParams.get('id');
  const id = String(fromBody ?? fromQuery ?? '').trim();
  return isUuid(id) ? id : null;
};

export default async function handler(request, response) {
  if (applyCors(request, response)) return;
  if (!requireMethod(request, response, 'GET', 'POST', 'DELETE')) return;

  try {
    if (request.method === 'GET') return await readSession(request, response);
    if (request.method === 'POST') return await writeSession(request, response);
    return await deleteSession(request, response);
  } catch (error) {
    fail(response, error, 'session');
  }
}

/**
 * Public read by unguessable UUID — this is the shareable "load a stored
 * session" link, so it deliberately does not require a token.
 */
const readSession = async (request, response) => {
  const id = readId(request);
  if (!id) {
    sendJson(response, 400, { error: 'A valid session id is required.' });
    return;
  }

  const [session] = await sql`
    select id, name, created_at, updated_at
    from sessions
    where id = ${id}
    limit 1
  `;

  if (!session) {
    sendJson(response, 404, { error: 'No session found for that link.' });
    return;
  }

  const cards = await sql`
    select card_index, title, year, runtime, director,
           writer, starring, genre, still_filename, still_url
    from cards
    where session_id = ${id}
    order by card_index
  `;

  sendJson(response, 200, { ...session, card_count: cards.length, cards });
};

/**
 * Handles session metadata only. Card rows are written one request at a time
 * through /api/card, so a single large still cannot exhaust the body limit.
 * `card_indexes` lists the cards the browser still holds; anything else is
 * pruned so a save replaces rather than merges.
 */
const writeSession = async (request, response) => {
  const account = await authenticate(request);
  if (!account) {
    sendJson(response, 401, { error: 'Approved access is required to save.' });
    return;
  }

  const { name, card_indexes: cardIndexes } = request.body ?? {};

  if (cardIndexes !== undefined) {
    const invalid = !Array.isArray(cardIndexes)
      || cardIndexes.some(index => !Number.isInteger(index) || index < 0);

    if (invalid) {
      sendJson(response, 400, { error: 'card_indexes must be an array of non-negative integers.' });
      return;
    }

    if (cardIndexes.length > MAX_CARDS) {
      sendJson(response, 400, { error: `A session cannot hold more than ${MAX_CARDS} cards.` });
      return;
    }
  }

  const sessionName = String(name ?? '').trim().slice(0, 120) || 'Film cards session';
  const id = readId(request);
  const saved = id
    ? await updateSession({ id, ownerId: account.id, sessionName, cardIndexes })
    : await createSession({ ownerId: account.id, sessionName });

  if (!saved) {
    sendJson(response, 404, { error: 'That session does not exist, or is not yours to overwrite.' });
    return;
  }

  sendJson(response, id ? 200 : 201, saved);
};

const createSession = async ({ ownerId, sessionName }) => {
  const [created] = await sql`
    insert into sessions (owner_id, name)
    values (${ownerId}, ${sessionName})
    returning id, name, created_at, updated_at
  `;
  return created;
};

const updateSession = async ({ id, ownerId, sessionName, cardIndexes }) => {
  const rename = sql`
    update sessions
    set name = ${sessionName}, updated_at = now()
    where id = ${id} and owner_id = ${ownerId}
    returning id, name, created_at, updated_at
  `;

  if (cardIndexes === undefined) {
    const [updated] = await rename;
    return updated;
  }

  const [updated] = await sql.transaction([
    rename,
    sql`
      delete from cards
      where session_id in (select id from sessions where id = ${id} and owner_id = ${ownerId})
        and not (card_index = any(${cardIndexes}::int[]))
    `
  ]);

  return updated?.[0];
};

const deleteSession = async (request, response) => {
  const account = await authenticate(request);
  if (!account) {
    sendJson(response, 401, { error: 'Approved access is required.' });
    return;
  }

  const id = readId(request);
  if (!id) {
    sendJson(response, 400, { error: 'A valid session id is required.' });
    return;
  }

  // Cards are removed with it via `on delete cascade`.
  const [deleted] = await sql`
    delete from sessions
    where id = ${id} and owner_id = ${account.id}
    returning id
  `;
  if (!deleted) {
    sendJson(response, 404, { error: 'That session does not exist, or is not yours to delete.' });
    return;
  }

  sendJson(response, 200, { id: deleted.id, deleted: true });
};
