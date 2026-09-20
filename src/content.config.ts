import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/** Keystatic `fields.date` ISO string yazar; Date objesi gelirse YYYY-MM-DD'ye indirger. */
const dateField = z
  .string()
  .or(z.date())
  .transform((val) => (typeof val === 'string' ? val : val.toISOString().split('T')[0]));

const blog = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdoc}', base: 'src/content/blog' }),
  schema: z.object({
    title: z.string(),
    date: dateField,
    description: z.string().min(1),
    coverImage: z.string().min(1),
    gallery: z.array(z.string()).optional(),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdoc}', base: 'src/content/projects' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['insaat', 'pvc', 'mimar']).default('insaat'),
    status: z.enum(['tamamlandi', 'guncel']).default('tamamlandi'),
    location: z.string().optional(),
    specs: z.string().optional(),
    date: dateField,
    description: z.string().min(1),
    coverImage: z.string().min(1),
    gallery: z.array(z.string()).optional(),
  }),
});

export const collections = {
  blog,
  projects,
};
