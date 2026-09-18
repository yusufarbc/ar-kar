/**
 * Proje kategorileri — Keystatic `category` select alanı ile birebir aynı.
 *
 * Bu sabit bilerek `content.config.ts` dışında tutulur: içerik yapılandırma
 * dosyası Astro tarafından özel olarak ele alınır ve sayfalardan import
 * edilmesi build (prerender) aşamasını bozar.
 */
export const PROJECT_CATEGORIES = {
  insaat: 'İnşaat',
  pvc: 'PVC & Alüminyum',
  mimar: 'Mimarlık',
} as const;

export type ProjectCategory = keyof typeof PROJECT_CATEGORIES;
