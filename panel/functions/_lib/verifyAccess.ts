/**
 * Cloudflare Access JWT doğrulaması.
 *
 * KRİTİK: Bu modül olmadan (yani yalnızca JWT'yi base64-decode edip
 * imzayı kontrol etmeden) panel API'leri sahte kimlikle çağrılabilir.
 * `ar-kar-admin.pages.dev` ham adresi Access tarafından korunmuyor
 * (Access yalnızca panel.ar-kar.com özel adına bağlı); yani bu doğrulama
 * olmadan internetteki HERKES sahte bir Cf-Access-Jwt-Assertion header'ı
 * uydurup doğrudan bu API'leri çağırabilir ve GITHUB_TOKEN'ın yetkisiyle
 * içerik yazıp silebilir. Bu dosya, imzayı Cloudflare'in kendi genel
 * anahtarlarına (JWKS) karşı doğrulayarak bunu engeller.
 *
 * `_lib/` altındaki dosyalar Cloudflare Pages Functions tarafından rota
 * olarak yorumlanmaz (alt çizgiyle başlayan dizinler hariç tutulur),
 * yalnızca diğer function dosyalarından import edilebilir.
 */

const TEAM_DOMAIN = 'nalbur-tech.cloudflareaccess.com';
const CERTS_URL = `https://${TEAM_DOMAIN}/cdn-cgi/access/certs`;
const CERTS_TTL_MS = 60 * 60 * 1000; // 1 saat

interface Jwk {
  kty: string;
  n: string;
  e: string;
  kid: string;
  alg: string;
}

let cachedJwks: { keys: Jwk[] } | null = null;
let cachedAt = 0;

async function getJwks(): Promise<{ keys: Jwk[] }> {
  const now = Date.now();
  if (cachedJwks && now - cachedAt < CERTS_TTL_MS) return cachedJwks;
  const res = await fetch(CERTS_URL);
  if (!res.ok) throw new Error(`JWKS alınamadı (${res.status})`);
  cachedJwks = (await res.json()) as { keys: Jwk[] };
  cachedAt = now;
  return cachedJwks;
}

function base64urlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function decodeJsonPart(part: string): any {
  return JSON.parse(new TextDecoder().decode(base64urlToBytes(part)));
}

export interface AccessIdentity {
  email: string;
}

/**
 * JWT'yi Cloudflare Access'in genel anahtarına karşı doğrular.
 * Geçersizse (imza uyuşmuyor, süresi dolmuş, format bozuk) null döner.
 */
export async function verifyAccessJwt(jwt: string | null): Promise<AccessIdentity | null> {
  if (!jwt) return null;

  const parts = jwt.split('.');
  if (parts.length !== 3) return null;

  let header: any;
  let payload: any;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256') return null;
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) return null;

  let jwks: { keys: Jwk[] };
  try {
    jwks = await getJwks();
  } catch {
    return null;
  }

  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  } catch {
    return null;
  }

  const signature = base64urlToBytes(parts[2]);
  const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);

  let valid = false;
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signedData);
  } catch {
    return null;
  }
  if (!valid) return null;

  if (typeof payload.email !== 'string' || !payload.email) return null;
  return { email: payload.email };
}
