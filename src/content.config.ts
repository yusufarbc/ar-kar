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
    description: z.string().optional(),
    coverImage: z.string().optional(),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdoc}', base: 'src/content/projects' }),
  schema: z.object({
    title: z.string(),
    category: z.enum(['insaat', 'pvc', 'mimar']).default('insaat'),
    location: z.string().optional(),
    specs: z.string().optional(),
    date: dateField.optional(),
    description: z.string().optional(),
    coverImage: z.string().optional(),
  }),
});

export const collections = {
  blog,
  projects,
};
