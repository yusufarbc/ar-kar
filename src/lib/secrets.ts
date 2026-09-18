/**
 * Worker secret okuma.
 *
 * Üç kaynağı da destekler, sırayla denenir:
 *  1. process.env  — `wrangler secret put` ile eklenen klasik worker secret'ı
 *                    (nodejs_compat açıkken burada görünür) ve yerel .env
 *  2. Secrets Store binding — hesap seviyesindeki Secrets Store'a bağlanmış
 *                    secret. Bu bir nesnedir ve değeri `await binding.get()`
 *                    ile alınır (bkz. wrangler.jsonc > secrets_store_secrets)
 *  3. Düz env binding — doğrudan string olarak tanımlanmış değişkenler
 *
 * `cloudflare:workers` dinamik import ile yüklenir; böylece `astro dev`
 * (Node) ortamında modül bulunamadığında hata vermez.
 */

let cachedEnv: Record<string, unknown> | null = null;

async function workerEnv(): Promise<Record<string, unknown>> {
  if (cachedEnv) return cachedEnv;
  try {
    const specifier = 'cloudflare:workers';
    const mod: any = await import(/* @vite-ignore */ specifier);
    cachedEnv = (mod?.env ?? {}) as Record<string, unknown>;
  } catch {
    cachedEnv = {};
  }
  return cachedEnv;
}

/** Secrets Store binding'i mi? (get() metodu olan nesne) */
function isSecretsStoreBinding(value: unknown): value is { get: () => Promise<string> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { get?: unknown }).get === 'function'
  );
}

export async function getSecret(name: string): Promise<string | undefined> {
  // 1) process.env
  const fromProcess = (globalThis as any)?.process?.env?.[name];
  if (typeof fromProcess === 'string' && fromProcess) return fromProcess;

  const env = await workerEnv();
  const binding = env[name];

  // 2) Secrets Store binding
  if (isSecretsStoreBinding(binding)) {
    try {
      const value = await binding.get();
      if (typeof value === 'string' && value) return value;
    } catch {
      return undefined;
    }
  }

  // 3) Düz string binding
  if (typeof binding === 'string' && binding) return binding;

  return undefined;
}

/** GITHUB_TOKEN yoksa anlamlı bir hata yanıtı üretir. */
export async function requireGithubToken(): Promise<
  { ok: true; token: string } | { ok: false; response: Response }
> {
  const token = await getSecret('GITHUB_TOKEN');
  if (!token) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error:
            'GITHUB_TOKEN okunamadı. Cloudflare Secrets Store bağlantısını (wrangler.jsonc > secrets_store_secrets) veya worker secret tanımını kontrol edin.',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { ok: true, token };
}
