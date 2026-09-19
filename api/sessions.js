import { authenticate } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { applyCors, fail, requireMethod, sendJson } from './_lib/http.js';

export default async function handler(request, response) {
  if (applyCors(request, response)) return;
  if (!requireMethod(request, response, 'GET')) return;

  try {
    const account = await authenticate(request);
    if (!account) {
      sendJson(response, 401, { error: 'Approved access is required.' });
      return;
    }

    // Card rows are counted rather than returned, so the picker stays small.
    const sessions = await sql`
      select s.id,
             s.name,
             s.created_at,
             s.updated_at,
             count(c.id)::int as card_count
      from sessions s
      left join cards c on c.session_id = s.id
      where s.owner_id = ${account.id}
      group by s.id
      order by s.updated_at desc
      limit 50
    `;

    sendJson(response, 200, { email: account.email, sessions });
  } catch (error) {
    fail(response, error, 'sessions');
  }
}
