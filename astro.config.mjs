import { defineConfig } from 'astro/config';

// Ana site tamamen statiktir (SSG) — hiçbir sunucu tarafı rota yoktur.
// Cloudflare Pages'e düz dosya olarak yüklenir.
//
// İçerik yönetimi ayrı bir projede: panel/ (panel.ar-kar.com).
// Panel, GitHub'a .md commit'ler; commit CI/CD'yi tetikler; bu site yeniden
// derlenip yayına çıkar.
export default defineConfig({
  site: 'https://ar-kar.com',
  output: 'static',
  build: {
    // Sayfalar insaat.html, pvc.html ... olarak üretilir (mevcut URL yapısı korunur).
    format: 'file',
  },
});
