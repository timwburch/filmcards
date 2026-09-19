import { authenticate } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { applyCors, fail, requireMethod, sendJson } from './_lib/http.js';

const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_CARDS = 500;
const MAX_TEXT_LENGTH = 2000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const readId = (request) => {
  const fromBody = request.method === 'POST' ? request.body?.id : null;
  const fromQuery = new URL(request.url, 'http://localhost').searchParams.get('id');
  const id = String(fromBody ?? fromQuery ?? '').trim();
  return UUID_PATTERN.test(id) ? id : null;
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

const text = (value) => String(value ?? '').slice(0, MAX_TEXT_LENGTH);

/** Coerces the client payload into exactly the shape `jsonb_to_recordset` expects. */
const normaliseCards = (cards) => cards.map((card, position) => ({
  card_index: Number.isInteger(card?.card_index) && card.card_index >= 0 ? card.card_index : position,
  title: text(card?.title),
  year: text(card?.year),
  runtime: text(card?.runtime),
  director: text(card?.director),
  writer: text(card?.writer),
  starring: text(card?.starring),
  genre: text(card?.genre),
  still_filename: text(card?.still_filename),
  still_url: card?.still_url ? String(card.still_url) : null
}));

const writeSession = async (request, response) => {
  const account = await authenticate(request);
  if (!account) {
    sendJson(response, 401, { error: 'Approved access is required to save.' });
    return;
  }

  const { cards, name } = request.body ?? {};
  if (!Array.isArray(cards)) {
    sendJson(response, 400, { error: 'cards must be an array.' });
    return;
  }

  if (cards.length > MAX_CARDS) {
    sendJson(response, 400, { error: `A session cannot hold more than ${MAX_CARDS} cards.` });
    return;
  }

  if (cards.some(card => card === null || typeof card !== 'object' || Array.isArray(card))) {
    sendJson(response, 400, { error: 'Every card must be an object.' });
    return;
  }

  const normalised = normaliseCards(cards);

  if (new Set(normalised.map(card => card.card_index)).size !== normalised.length) {
    sendJson(response, 400, { error: 'Card indexes must be unique within a session.' });
    return;
  }

  const serialised = JSON.stringify(normalised);
  if (Buffer.byteLength(serialised, 'utf8') > MAX_PAYLOAD_BYTES) {
    sendJson(response, 413, {
      error: 'This session is larger than 4 MB. Remove some uploaded stills and try again.'
    });
    return;
  }

  const sessionName = String(name ?? '').trim().slice(0, 120) || 'Film cards session';
  const id = readId(request);
  const saved = id
    ? await replaceSession({ id, ownerId: account.id, sessionName, serialised })
    : await createSession({ ownerId: account.id, sessionName, serialised });

  if (!saved) {
    sendJson(response, 404, { error: 'That session does not exist, or is not yours to overwrite.' });
    return;
  }

  sendJson(response, id ? 200 : 201, { ...saved, card_count: normalised.length });
};

/** Session row and its cards land in one statement, so a failure leaves nothing behind. */
const createSession = async ({ ownerId, sessionName, serialised }) => {
  const [created] = await sql`
    with new_session as (
      insert into sessions (owner_id, name)
      values (${ownerId}, ${sessionName})
      returning id, name, created_at, updated_at
    ), new_cards as (
      insert into cards (
        session_id, card_index, title, year, runtime, director,
        writer, starring, genre, still_filename, still_url
      )
      select new_session.id, c.*
      from new_session, jsonb_to_recordset(${serialised}::jsonb) as c(
        card_index int, title text, year text, runtime text, director text,
        writer text, starring text, genre text, still_filename text, still_url text
      )
      returning 1
    )
    select id, name, created_at, updated_at from new_session
  `;
  return created;
};

/**
 * Delete-then-insert rather than upsert, so cards removed in the browser also
 * disappear here. Every statement re-checks ownership, and they are split
 * across a transaction because a delete and insert hitting the same
 * (session_id, card_index) key in one statement can trip the unique index.
 */
const replaceSession = async ({ id, ownerId, sessionName, serialised }) => {
  const [updated] = await sql.transaction([
    sql`
      update sessions
      set name = ${sessionName}, updated_at = now()
      where id = ${id} and owner_id = ${ownerId}
      returning id, name, created_at, updated_at
    `,
    sql`
      delete from cards
      where session_id in (select id from sessions where id = ${id} and owner_id = ${ownerId})
    `,
    sql`
      insert into cards (
        session_id, card_index, title, year, runtime, director,
        writer, starring, genre, still_filename, still_url
      )
      select owned.id, c.*
      from (select id from sessions where id = ${id} and owner_id = ${ownerId}) as owned,
           jsonb_to_recordset(${serialised}::jsonb) as c(
             card_index int, title text, year text, runtime text, director text,
             writer text, starring text, genre text, still_filename text, still_url text
           )
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
