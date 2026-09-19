import { escapeHtml } from './http.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const sendEmail = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey || !from) {
    throw new Error('RESEND_API_KEY and RESEND_FROM must be configured.');
  }

  const response = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to: [to], subject, html })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Resend rejected the message (${response.status}): ${detail}`);
  }

  return response.json();
};

const layout = (heading, bodyHtml) => `
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#EDEAE3;color:#181614;padding:28px;border-radius:8px;max-width:520px">
  <h1 style="font-size:19px;margin:0 0 14px">${escapeHtml(heading)}</h1>
  ${bodyHtml}
</div>`;

const button = (href, label) => `
<p style="margin:22px 0">
  <a href="${escapeHtml(href)}"
     style="display:inline-block;background:#9C3B2E;color:#fff;text-decoration:none;
            padding:11px 20px;border-radius:6px;font-weight:600">${escapeHtml(label)}</a>
</p>
<p style="font-size:12px;color:#6b6862;word-break:break-all;margin:0">
  Or paste this link: ${escapeHtml(href)}
</p>`;

export const sendApprovalRequest = async ({ ownerEmail, requesterEmail, approveUrl }) =>
  sendEmail({
    to: ownerEmail,
    subject: `Film Cards: access request from ${requesterEmail}`,
    html: layout('Approve cloud sync access?', `
      <p style="margin:0">
        <strong>${escapeHtml(requesterEmail)}</strong> is asking to save Film Cards sessions
        to your database. Approve only if you recognise this address.
      </p>
      ${button(approveUrl, 'Approve this request')}
      <p style="font-size:12px;color:#6b6862;margin:18px 0 0">
        This link expires in 7 days. Ignore this email to leave the request pending.
      </p>`)
  });

export const sendAccessGranted = async ({ requesterEmail, accessUrl }) =>
  sendEmail({
    to: requesterEmail,
    subject: 'Film Cards: your access was approved',
    html: layout('You can now save sessions', `
      <p style="margin:0">
        Your request was approved. Open the link below to unlock the
        <strong>Save to cloud</strong> button in Film Cards.
      </p>
      ${button(accessUrl, 'Open Film Cards')}
      <p style="font-size:12px;color:#6b6862;margin:18px 0 0">
        Treat this link like a password &mdash; anyone holding it can save sessions as you.
      </p>`)
  });
