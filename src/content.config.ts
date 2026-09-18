import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdoc', base: 'src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: z.string().or(z.date()).transform((val) => (typeof val === 'string' ? val : val.toISOString().split('T')[0])),
    description: z.string().optional(),
    coverImage: z.string().optional(),
  }),
});

export const collections = {
  blog,
};

