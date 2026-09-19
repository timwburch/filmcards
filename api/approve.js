import { createToken, hashToken, tokensMatch } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { sendAccessGranted } from './_lib/email.js';
import { applyCors, escapeHtml, requireMethod, sendHtml } from './_lib/http.js';

const readToken = (request) => {
  if (request.method === 'POST') return String(request.body?.token ?? '').trim();
  const url = new URL(request.url, 'http://localhost');
  return (url.searchParams.get('token') || '').trim();
};

export default async function handler(request, response) {
  if (applyCors(request, response)) return;
  if (!requireMethod(request, response, 'GET', 'POST')) return;

  const token = readToken(request);
  if (!token) {
    sendHtml(response, 400, 'Missing token', 'That approval link is incomplete.');
    return;
  }

  try {
    const [pending] = await sql`
      select id, email, status, approval_token_hash, approval_expires_at
      from access_requests
      where approval_token_hash = ${hashToken(token)}
      limit 1
    `;

    if (!pending || !tokensMatch(hashToken(token), pending.approval_token_hash)) {
      sendHtml(response, 404, 'Link not valid', 'This approval link has already been used or never existed.');
      return;
    }

    if (pending.status === 'revoked') {
      sendHtml(response, 403, 'Access revoked', 'This address has been revoked and cannot be approved.');
      return;
    }

    if (new Date(pending.approval_expires_at).getTime() < Date.now()) {
      sendHtml(response, 410, 'Link expired', 'This approval link has expired. Ask the requester to try again.');
      return;
    }

    // GET only ever shows a confirmation form. Mail scanners and link
    // prefetchers follow GETs, so the state change is kept behind a POST.
    if (request.method === 'GET') {
      sendHtml(
        response,
        200,
        'Approve access?',
        `Approving lets ${pending.email} save and overwrite Film Cards sessions in your database.`,
        `<form method="post">
           <input type="hidden" name="token" value="${escapeHtml(token)}">
           <button type="submit">Approve ${escapeHtml(pending.email)}</button>
         </form>`
      );
      return;
    }

    const accessToken = createToken();
    await sql`
      update access_requests
      set status = 'approved',
          approved_at = now(),
          approval_token_hash = null,
          approval_expires_at = null,
          access_token_hash = ${hashToken(accessToken)}
      where id = ${pending.id}
    `;

    const siteUrl = process.env.SITE_URL?.replace(/\/$/, '');
    await sendAccessGranted({
      requesterEmail: pending.email,
      accessUrl: `${siteUrl}/?access=${encodeURIComponent(accessToken)}`
    });

    sendHtml(
      response,
      200,
      'Approved',
      `${pending.email} can now save sessions. A sign-in link has been emailed to them.`
    );
  } catch (error) {
    console.error('[filmcards:approve]', error);
    sendHtml(response, 500, 'Something went wrong', 'The approval could not be completed. Please try again.');
  }
}
