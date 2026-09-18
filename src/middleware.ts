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

export const onRequest = defineMiddleware(async (context, next) => {
  const host = context.request.headers.get('host') ?? context.url.host;
  const hostname = host.split(':')[0];
  const onPanelHost = hostname === PANEL_HOST;
  const requestsPanelPath = isPanelPath(context.url.pathname);

  // Panel rotaları başka bir host'tan istenirse: yok say (404).
  if (requestsPanelPath && !onPanelHost) {
    return new Response('Not found', { status: 404 });
  }

  const response = await next();

  // Panel host'unda servis edilen her şey arama motorlarından/LLM'lerden
  // gizli kalsın — WAF zaten yurtdışı erişimi engelliyor, bu ek bir katman.
  if (onPanelHost) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return response;
});
