import { authenticate } from './_lib/auth.js';
import { applyCors, fail, requireMethod, sendJson } from './_lib/http.js';

/** Lets the page verify a stored access token before enabling the save button. */
export default async function handler(request, response) {
  if (applyCors(request, response)) return;
  if (!requireMethod(request, response, 'GET')) return;

  try {
    const account = await authenticate(request);
    if (!account) {
      sendJson(response, 401, { error: 'Not approved.' });
      return;
    }
    sendJson(response, 200, { email: account.email, status: 'approved' });
  } catch (error) {
    fail(response, error, 'me');
  }
}
