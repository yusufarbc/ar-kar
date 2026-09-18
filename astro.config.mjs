import { defineConfig } from 'astro/config';
import keystatic from '@keystatic/astro';
import markdoc from '@astrojs/markdoc';
import react from '@astrojs/react';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://ar-kar.com',
  output: 'static',
  build: {
    format: 'file',
  },
  adapter: cloudflare({
    imageService: 'passthrough',
  }),
  // react(): Keystatic paneli `<Keystatic client:only="react" />` ile render
  // ediliyor. Bu direktifin çalışması için Astro'ya bir React renderer'ı
  // tanıtılmalı; @keystatic/astro bunu kendisi eklemiyor. Eksik olduğunda
  // panel sayfası 0 byte döner (boş beyaz ekran).
  integrations: [react(), keystatic(), markdoc()],
});

