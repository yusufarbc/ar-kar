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
  collections: {
    blog: collection({
      label: 'Blog',
      slugField: 'title',
      path: 'src/content/blog/*/',
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
  },
});

