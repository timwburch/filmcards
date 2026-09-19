import { APPROVAL_TTL_HOURS, createToken, hashToken, isValidEmail, normaliseEmail } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { sendAccessGranted, sendApprovalRequest } from './_lib/email.js';
import { applyCors, fail, requireMethod, sendJson } from './_lib/http.js';

const RESEND_COOLDOWN_SECONDS = 60;

export default async function handler(request, response) {
  if (applyCors(request, response)) return;
  if (!requireMethod(request, response, 'POST')) return;

  const email = normaliseEmail(request.body?.email);
  if (!isValidEmail(email)) {
    sendJson(response, 400, { error: 'Enter a valid email address.' });
    return;
  }

  const ownerEmail = process.env.OWNER_EMAIL;
  const apiBaseUrl = process.env.API_BASE_URL?.replace(/\/$/, '');
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, '');

  if (!ownerEmail || !apiBaseUrl || !siteUrl) {
    fail(response, new Error('OWNER_EMAIL, API_BASE_URL and SITE_URL must be configured.'), 'request-access:config');
    return;
  }

  try {
    const [existing] = await sql`
      select id, status, last_request_at
      from access_requests
      where email = ${email}
      limit 1
    `;

    if (existing) {
      const secondsSinceLast = (Date.now() - new Date(existing.last_request_at).getTime()) / 1000;
      if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
        sendJson(response, 429, {
          error: `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast)}s before requesting again.`
        });
        return;
      }

      if (existing.status === 'revoked') {
        sendJson(response, 403, { error: 'Access for this address has been revoked.' });
        return;
      }

      // Already approved: rotate the access token and mail a fresh magic link,
      // which only ever reaches the address that owns the account.
      if (existing.status === 'approved') {
        const accessToken = createToken();
        await sql`
          update access_requests
          set access_token_hash = ${hashToken(accessToken)},
              last_request_at = now(),
              request_count = request_count + 1
          where id = ${existing.id}
        `;
        await sendAccessGranted({
          requesterEmail: email,
          accessUrl: `${siteUrl}/?access=${encodeURIComponent(accessToken)}`
        });
        sendJson(response, 200, {
          status: 'approved',
          message: 'Already approved — a fresh sign-in link is on its way to your inbox.'
        });
        return;
      }
    }

    const approvalToken = createToken();
    const approvalHash = hashToken(approvalToken);

    await sql`
      insert into access_requests (email, status, approval_token_hash, approval_expires_at)
      values (
        ${email},
        'pending',
        ${approvalHash},
        now() + ${`${APPROVAL_TTL_HOURS} hours`}::interval
      )
      on conflict (email) do update
      set status = 'pending',
          approval_token_hash = excluded.approval_token_hash,
          approval_expires_at = excluded.approval_expires_at,
          last_request_at = now(),
          request_count = access_requests.request_count + 1
    `;

    await sendApprovalRequest({
      ownerEmail,
      requesterEmail: email,
      approveUrl: `${apiBaseUrl}/api/approve?token=${encodeURIComponent(approvalToken)}`
    });

    sendJson(response, 202, {
      status: 'pending',
      message: 'Request sent. Saving unlocks once the owner approves it.'
    });
  } catch (error) {
    fail(response, error, 'request-access');
  }
}
