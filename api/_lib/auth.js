import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { sql } from './db.js';

export const APPROVAL_TTL_HOURS = 168; // 7 days

export const createToken = () => randomBytes(32).toString('base64url');

export const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/** Constant-time compare of two hex digests, so token lookups don't leak via timing. */
export const tokensMatch = (candidateHash, storedHash) => {
  if (typeof storedHash !== 'string' || candidateHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(storedHash, 'hex'));
};

export const normaliseEmail = (value) => String(value ?? '').trim().toLowerCase();

export const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;

const readBearer = (request) => {
  const header = request.headers.authorization || request.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : null;
};

/**
 * Resolves the caller's approved account from the Bearer access token.
 * Returns null when absent, unknown, or no longer approved.
 */
export const authenticate = async (request) => {
  const token = readBearer(request);
  if (!token) return null;

  const [account] = await sql`
    select id, email, status, access_token_hash
    from access_requests
    where access_token_hash = ${hashToken(token)}
    limit 1
  `;

  if (!account || account.status !== 'approved') return null;
  if (!tokensMatch(hashToken(token), account.access_token_hash)) return null;

  return { id: account.id, email: account.email };
};
