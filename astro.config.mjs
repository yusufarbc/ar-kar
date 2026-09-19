import { defineConfig } from 'astro/config';

// Ana site tamamen statiktir (SSG) — hiçbir sunucu tarafı rota yoktur.
// Cloudflare Pages'e düz dosya olarak yüklenir.
//
// İçerik yönetimi ayrı bir projede: panel/ (panel.ar-kar.com).
// Panel, GitHub'a .md commit'ler; commit CI/CD'yi tetikler; bu site yeniden
// derlenip yayına çıkar.
//
// --------------------------------------------------------------------------
// ORTAMLAR
// --------------------------------------------------------------------------
// PUBLIC_DEPLOY_ENV derleme anında ortamı belirler. Tanımlı değilse
// 'production' varsayılır — yani yerel `npm run build` ve elle yapılan
// derlemeler her zaman canlı davranışını üretir, yanlışlıkla noindex'li
// çıktı oluşmaz.
//
//   production → https://ar-kar.com                (indekslenir)
//   staging    → https://staging.ar-kar.pages.dev  (noindex + robots Disallow)
//
// Bu değer üç yeri birden besler: canonical adresleri (BaseLayout),
// sitemap.xml ve robots.txt. Tek kaynaktan yönetilir ki staging kopyası
// canlı sitenin SEO'suna hiçbir noktada karışmasın.
const DEPLOY_ENV = process.env.PUBLIC_DEPLOY_ENV ?? 'production';

const SITE_URLS = {
  production: 'https://ar-kar.com',
  staging: 'https://staging.ar-kar.pages.dev',
};

const site = SITE_URLS[DEPLOY_ENV] ?? SITE_URLS.production;

export default defineConfig({
  site,
  output: 'static',
  build: {
    // Sayfalar insaat.html, pvc.html ... olarak üretilir (mevcut URL yapısı korunur).
    format: 'file',
  },
});
