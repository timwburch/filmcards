const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim().replace(/\/$/, ''))
  .filter(Boolean);

/**
 * Reflects only origins on the allow-list. An unlisted origin gets no CORS
 * header at all, so the browser blocks the response.
 */
export const applyCors = (request, response) => {
  const origin = (request.headers.origin || '').replace(/\/$/, '');
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.setHeader('Access-Control-Max-Age', '86400');

  if (request.method === 'OPTIONS') {
    response.status(204).end();
    return true;
  }
  return false;
};

export const sendJson = (response, statusCode, body) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(statusCode).send(JSON.stringify(body));
};

/** `trustedHtml` is only ever markup this module builds; never caller input. */
export const sendHtml = (response, statusCode, title, message, trustedHtml = '') => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.status(statusCode).send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
 body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#3a3733;color:#EDEAE3;font:16px/1.6 system-ui,sans-serif;padding:24px}
 main{max-width:460px;background:#2c2a27;border:1px solid #46433e;border-radius:10px;padding:28px 30px}
 h1{font-size:20px;margin:0 0 10px}
 p{margin:0;color:#c9c6bd}
 button{margin-top:20px;background:#9C3B2E;color:#fff;border:0;border-radius:6px;
        padding:11px 20px;font:600 14px system-ui,sans-serif;cursor:pointer}
</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${trustedHtml}</main></body></html>`);
};

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

export const requireMethod = (request, response, ...methods) => {
  if (methods.includes(request.method)) return true;
  response.setHeader('Allow', methods.join(', '));
  sendJson(response, 405, { error: 'Method not allowed' });
  return false;
};

/** Never surface driver/stack details to the browser. */
export const fail = (response, error, context) => {
  console.error(`[filmcards:${context}]`, error);
  sendJson(response, 500, { error: 'Something went wrong. Please try again.' });
};
