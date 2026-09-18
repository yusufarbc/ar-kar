/**
 * Worker secret okuma.
 *
 * Cloudflare, `nodejs_compat` açıkken secret ve var'ları process.env üzerinde
 * de sunar; çalışmadığı durumlar için `cloudflare:workers` env binding'ine
 * düşülür. Dinamik import kullanılır, böylece `astro dev` (Node) ortamında
 * modül bulunamadığında hata vermez.
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

export async function getSecret(name: string): Promise<string | undefined> {
  const fromProcess = (globalThis as any)?.process?.env?.[name];
  if (typeof fromProcess === 'string' && fromProcess) return fromProcess;

  const env = await workerEnv();
  const value = env[name];
  return typeof value === 'string' && value ? value : undefined;
}

/** GITHUB_TOKEN yoksa anlamlı bir hata yanıtı üretir. */
export async function requireGithubToken():
  | Promise<{ ok: true; token: string } | { ok: false; response: Response }> {
  const token = await getSecret('GITHUB_TOKEN');
  if (!token) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({
          error:
            'GITHUB_TOKEN tanımlı değil. Cloudflare Worker secret olarak ekleyin: npx wrangler secret put GITHUB_TOKEN',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      ),
    };
  }
  return { ok: true, token };
}
