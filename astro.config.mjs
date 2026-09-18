import { defineConfig } from 'astro/config';
import keystatic from '@keystatic/astro';
import markdoc from '@astrojs/markdoc';
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
  integrations: [keystatic(), markdoc()],
});

