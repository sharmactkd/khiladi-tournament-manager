import jwt from "jsonwebtoken";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const identityUrl = () => String(process.env.KHILADI_IDENTITY_API_URL || "https://khiladi-identity-api.onrender.com").replace(/\/+$/, "");

export async function exchangeCentralCode({ code, codeVerifier }) {
  const response = await fetch(`${identityUrl()}/api/sso/exchange`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "X-Khiladi-Request": "identity-v1" },
    body: JSON.stringify({ code, codeVerifier, product: "tournament", redirectUri: process.env.TOURNAMENT_SSO_REDIRECT_URI || "https://tournaments.khiladi-khoj.com/auth/sso/callback" }),
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.assertion) throw fail(payload.message || "Central SSO exchange failed", response.status || 502);
  return payload.data.assertion;
}

export function verifyCentralAssertion(assertion) {
  const secret = process.env.TOURNAMENT_SSO_ASSERTION_SECRET;
  if (!secret) throw fail("Tournament SSO is not configured", 503);
  let claims;
  try {
    claims = jwt.verify(assertion, secret, { algorithms: ["HS256"], issuer: process.env.KHILADI_IDENTITY_ISSUER || "https://khiladi-khoj.com", audience: "khiladi-tournament", clockTolerance: 5 });
  } catch { throw fail("Central SSO assertion is invalid or expired", 401); }
  if (claims.type !== "khiladi_sso" || !claims.sub || !claims.email || claims.emailVerified !== true) throw fail("Central SSO identity is incomplete or unverified", 403);
  return claims;
}
