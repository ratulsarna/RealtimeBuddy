import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_DELIMITER = ".";
const DEFAULT_BACKEND_ACCESS_TOKEN_TTL_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 30_000;

export function createBackendAccessToken(
  secret: string,
  now = Date.now(),
  ttlMs = DEFAULT_BACKEND_ACCESS_TOKEN_TTL_MS
) {
  const expiresAt = now + ttlMs;
  const payload = `${now}${TOKEN_DELIMITER}${expiresAt}`;
  const signature = signPayload(payload, secret);

  return `${payload}${TOKEN_DELIMITER}${signature}`;
}

export function verifyBackendAccessToken(
  token: string | undefined,
  secret: string,
  now = Date.now()
) {
  if (!token) {
    return false;
  }

  const [issuedAtRaw, expiresAtRaw, providedSignature] = token.split(TOKEN_DELIMITER);
  if (!issuedAtRaw || !expiresAtRaw || !providedSignature) {
    return false;
  }

  const issuedAt = Number(issuedAtRaw);
  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    return false;
  }

  if (issuedAt - now > MAX_CLOCK_SKEW_MS || now > expiresAt) {
    return false;
  }

  const payload = `${issuedAtRaw}${TOKEN_DELIMITER}${expiresAtRaw}`;
  const expectedSignature = signPayload(payload, secret);

  return safeCompare(expectedSignature, providedSignature);
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeCompare(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(actual, "utf8");
  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, actualBuffer);
}
