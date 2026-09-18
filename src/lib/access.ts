/**
 * Cloudflare Access entegrasyonu.
 *
 * Asıl yetkilendirme edge'de yapılır: Access, panel.ar-kar.com'a gelen
 * kimliksiz istekleri worker'a hiç ulaştırmaz. Buradaki kontrol ikinci
 * katmandır ve ayrıca commit mesajına yazmak üzere editörün e-postasını
 * çıkarır, böylece "kim ne yaptı" git geçmişinde görünür.
 */

const ACCESS_JWT_HEADER = 'Cf-Access-Jwt-Assertion';

export interface AccessIdentity {
  email: string;
  raw: string;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Access kimliğini döndürür. Header yoksa null (istek reddedilmeli).
 *
 * NOT: İmza doğrulaması burada yapılmaz — bu header'ı yalnızca Cloudflare
 * edge'i ekler ve Access uygulaması host'un tamamını kapsadığı için
 * doğrulanmamış bir istek worker'a zaten ulaşamaz. İmza doğrulaması
 * (JWKS) ileride sertleştirme adımı olarak eklenebilir.
 */
export function getAccessIdentity(request: Request): AccessIdentity | null {
  const jwt = request.headers.get(ACCESS_JWT_HEADER);
  if (!jwt) return null;

  const payload = decodeJwtPayload(jwt);
  const email =
    (typeof payload?.email === 'string' && payload.email) ||
    (typeof payload?.sub === 'string' && payload.sub) ||
    'bilinmeyen';

  return { email, raw: jwt };
}

/** Access header'ı yoksa 401 döndürür, varsa kimliği verir. */
export function requireAccess(
  request: Request
): { ok: true; identity: AccessIdentity } | { ok: false; response: Response } {
  const identity = getAccessIdentity(request);
  if (!identity) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error:
            'Yetkisiz. Bu uç nokta yalnızca Cloudflare Access ile kimlik doğrulanmış isteklere açıktır.',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { ok: true, identity };
}
