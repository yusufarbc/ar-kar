import { config, fields, collection } from '@keystatic/core';

export default config({
  storage:
    process.env.NODE_ENV === 'production'
      ? ({
          kind: 'github',
          repo: 'yusufarbc/ar-kar',
          branch: 'production',
        } as any)
      : {
          kind: 'local',
        },
  ui: {
    brand: { name: 'AR-KAR İnşaat' },
    navigation: {
      İçerik: ['blog', 'projects'],
    },
  },
  collections: {
    blog: collection({
      label: 'Blog & Duyurular',
      slugField: 'title',
      path: 'src/content/blog/*/',
      entryLayout: 'content',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Başlık' } }),
        date: fields.date({ label: 'Tarih', defaultValue: { kind: 'today' } }),
        description: fields.text({ label: 'Özet Açıklama', multiline: true }),
        coverImage: fields.image({
          label: 'Kapak Görseli',
          directory: 'public/img/blog',
          publicPath: '/img/blog/',
        }),
        content: fields.markdoc({ label: 'İçerik' }),
      },
    }),
    projects: collection({
      label: 'Projeler',
      slugField: 'title',
      path: 'src/content/projects/*/',
      entryLayout: 'content',
      format: { contentField: 'content' },
      schema: {
        title: fields.slug({ name: { label: 'Proje Adı' } }),
        category: fields.select({
          label: 'Kategori',
          options: [
            { label: 'İnşaat', value: 'insaat' },
            { label: 'PVC & Alüminyum', value: 'pvc' },
            { label: 'Dekorasyon', value: 'dekorasyon' },
            { label: 'Mimarlık', value: 'mimar' },
          ],
          defaultValue: 'insaat',
        }),
        location: fields.text({ label: 'Konum', defaultValue: 'Çarşamba, Samsun' }),
        date: fields.date({ label: 'Tarih', defaultValue: { kind: 'today' } }),
        description: fields.text({ label: 'Kısa Açıklama', multiline: true }),
        coverImage: fields.image({
          label: 'Proje Görseli',
          directory: 'public/img/projects',
          publicPath: '/img/projects/',
        }),
        content: fields.markdoc({ label: 'Detaylı Bilgi' }),
      },
    }),
  },
});
