/**
 * CMS şema tanımı — hem sunucu (doğrulama) hem panel arayüzü (form üretimi)
 * bu tek kaynaktan beslenir. Alanlar src/content.config.ts'teki Zod
 * şemalarıyla birebir uyumlu olmalıdır; aksi hâlde commit sonrası build kırılır.
 */

import { PROJECT_CATEGORIES } from './projects';

export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'image' | 'markdown';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export interface CollectionDef {
  key: string;
  label: string;
  /** Repo içindeki içerik klasörü */
  dir: string;
  /** Görsellerin commit edileceği klasör (repo yolu) */
  mediaDir: string;
  /** Görsellerin sitedeki public yolu */
  mediaPublicPath: string;
  fields: FieldDef[];
}

const commonBody: FieldDef = {
  name: 'body',
  label: 'İçerik (Markdown)',
  type: 'markdown',
  required: true,
  placeholder: '## Alt başlık\n\nParagraf metni...\n\n- Madde 1\n- Madde 2',
};

export const COLLECTIONS: Record<string, CollectionDef> = {
  blog: {
    key: 'blog',
    label: 'Blog & Duyurular',
    dir: 'src/content/blog',
    mediaDir: 'public/img/blog',
    mediaPublicPath: '/img/blog',
    fields: [
      { name: 'title', label: 'Başlık', type: 'text', required: true },
      { name: 'date', label: 'Tarih', type: 'date', required: true },
      { name: 'description', label: 'Özet Açıklama', type: 'textarea' },
      { name: 'coverImage', label: 'Kapak Görseli', type: 'image' },
      commonBody,
    ],
  },
  projects: {
    key: 'projects',
    label: 'Projeler',
    dir: 'src/content/projects',
    mediaDir: 'public/img/projects',
    mediaPublicPath: '/img/projects',
    fields: [
      { name: 'title', label: 'Proje Adı', type: 'text', required: true },
      {
        name: 'category',
        label: 'Kategori',
        type: 'select',
        required: true,
        options: Object.entries(PROJECT_CATEGORIES).map(([value, label]) => ({ value, label })),
      },
      { name: 'location', label: 'Konum', type: 'text', placeholder: 'Çarşamba, Samsun' },
      { name: 'date', label: 'Tarih', type: 'date', required: true },
      { name: 'description', label: 'Kısa Açıklama', type: 'textarea' },
      { name: 'coverImage', label: 'Proje Görseli', type: 'image' },
      commonBody,
    ],
  },
};

export function getCollection(key: unknown): CollectionDef | null {
  if (typeof key !== 'string') return null;
  return COLLECTIONS[key] ?? null;
}

/** Başlıktan URL-güvenli slug üretir (Türkçe karakterler dönüştürülür). */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return input
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
