import { authenticate } from './_lib/auth.js';
import { isUuid, normaliseCard, validateCard } from './_lib/cards.js';
import { sql } from './_lib/db.js';
import { applyCors, fail, requireMethod, sendJson } from './_lib/http.js';

/** One card per request, so a single 4 MB still never shares the body limit. */
export default async function handler(request, response) {
  if (applyCors(request, response)) return;
  if (!requireMethod(request, response, 'POST')) return;

  try {
    const account = await authenticate(request);
    if (!account) {
      sendJson(response, 401, { error: 'Approved access is required to save.' });
      return;
    }

    const { session_id: sessionId, card } = request.body ?? {};
    if (!isUuid(sessionId)) {
      sendJson(response, 400, { error: 'A valid session_id is required.' });
      return;
    }

    const problem = validateCard(card);
    if (problem) {
      sendJson(response, problem.includes('4 MB') ? 413 : 400, { error: problem });
      return;
    }

    const value = normaliseCard(card);

    // Selecting from the ownership check means an unowned session inserts nothing.
    const [saved] = await sql`
      insert into cards (
        session_id, card_index, title, year, runtime, director,
        writer, starring, genre, still_filename, still_url
      )
      select owned.id, ${value.card_index}, ${value.title}, ${value.year}, ${value.runtime},
             ${value.director}, ${value.writer}, ${value.starring}, ${value.genre},
             ${value.still_filename}, ${value.still_url}
      from (select id from sessions where id = ${sessionId} and owner_id = ${account.id}) as owned
      on conflict (session_id, card_index) do update
      set title = excluded.title,
          year = excluded.year,
          runtime = excluded.runtime,
          director = excluded.director,
          writer = excluded.writer,
          starring = excluded.starring,
          genre = excluded.genre,
          still_filename = excluded.still_filename,
          still_url = excluded.still_url
      returning card_index
    `;

    if (!saved) {
      sendJson(response, 404, { error: 'That session does not exist, or is not yours to write to.' });
      return;
    }

    sendJson(response, 200, { card_index: saved.card_index, saved: true });
  } catch (error) {
    fail(response, error, 'card');
  }
}
