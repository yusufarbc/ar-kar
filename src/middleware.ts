import { defineMiddleware } from 'astro:middleware';

// Yönetim paneli yalnızca panel.ar-kar.com üzerinden hizmet vermeli.
// Cloudflare WAF kuralı (scripts/setup-cloudflare.sh) yurtdışı IP'leri
// panel.ar-kar.com host'unda engeller, ama aynı worker tüm custom domain'lere
// (ar-kar.com dahil) bağlı olduğundan bu kontrol olmadan /keystatic ve
// /api/keystatic rotaları ana site üzerinden de (herhangi bir ülkeden)
// erişilebilir kalırdı. Bu middleware, WAF'ın tamamlayıcısı olarak ikinci
// bir savunma katmanı sağlar: panel rotaları başka hiçbir host'ta çalışmaz.
const PANEL_HOST = 'panel.ar-kar.com';
const PANEL_PATH_PREFIXES = ['/keystatic', '/api/keystatic', '/admin', '/api/cms'];

function isPanelPath(pathname: string): boolean {
  return PANEL_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/** Statik dosyayı Cloudflare ASSETS binding'inden okur. */
async function fetchAsset(url: string): Promise<Response | null> {
  try {
    const specifier = 'cloudflare:workers';
    const mod: any = await import(/* @vite-ignore */ specifier);
    const assets = mod?.env?.ASSETS;
    if (!assets?.fetch) return null;
    const res = await assets.fetch(url);
    return res.status === 404 ? null : res;
  } catch {
    return null;
  }
}

export const onRequest = defineMiddleware(async (context, next) => {
  const host = context.request.headers.get('host') ?? context.url.host;
  const hostname = host.split(':')[0];
  const onPanelHost = hostname === PANEL_HOST;
  const requestsPanelPath = isPanelPath(context.url.pathname);

  // Panel rotaları başka bir host'tan istenirse: yok say (404).
  if (requestsPanelPath && !onPanelHost) {
    return new Response('Not found', { status: 404 });
  }

  // Kök istek (wrangler.jsonc > assets.run_worker_first sayesinde buraya gelir):
  if (context.url.pathname === '/') {
    // Panel host'unda doğrudan paneli göster — tarayıcı adresi
    // "panel.ar-kar.com" olarak kalır, /admin görünmez.
    if (onPanelHost) {
      return context.rewrite('/admin');
    }

    // Ana sitede index.html'i asset binding'inden servis et.
    // Adapter'ın kendi fallback'i kullanılamaz: o, yolun sonundaki ".html"i
    // kırpıyor; bizde ise assets.html_handling "none" olduğu için dosyalar
    // tam adlarıyla (index.html) adreslenir, kırpılınca 404 döner.
    const asset = await fetchAsset(new URL('/index.html', context.url).toString());
    if (asset) return asset;
  }

  const response = await next();

  // Panel host'unda servis edilen her şey arama motorlarından/LLM'lerden
  // gizli kalsın — WAF zaten yurtdışı erişimi engelliyor, bu ek bir katman.
  if (onPanelHost) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return response;
});
