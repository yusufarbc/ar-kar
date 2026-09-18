import type { APIRoute } from 'astro';
import { requireAccess } from '../../../lib/access';
import { requireGithubToken } from '../../../lib/secrets';
import { getCollection } from '../../../lib/cms-schema';
import { listDir, readFile } from '../../../lib/github';
import { parseFrontmatter } from '../../../lib/frontmatter';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * GET /api/cms/entries?collection=blog          -> kayıt listesi
 * GET /api/cms/entries?collection=blog&slug=xyz -> tek kayıt (düzenleme için)
 */
export const GET: APIRoute = async ({ request, url }) => {
  const auth = requireAccess(request);
  if (!auth.ok) return auth.response;

  const gh = await requireGithubToken();
  if (!gh.ok) return gh.response;

  const collection = getCollection(url.searchParams.get('collection'));
  if (!collection) return json({ error: 'Geçersiz koleksiyon.' }, 400);

  const slug = url.searchParams.get('slug');

  try {
    if (slug) {
      const path = `${collection.dir}/${slug}/index.md`;
      let raw = await readFile(gh.token, path);
      let filePath = path;

      // Keystatic döneminden kalan .mdoc kayıtları da düzenlenebilsin.
      if (raw === null) {
        filePath = `${collection.dir}/${slug}/index.mdoc`;
        raw = await readFile(gh.token, filePath);
      }
      if (raw === null) return json({ error: 'Kayıt bulunamadı.' }, 404);

      const { data, body } = parseFrontmatter(raw);
      return json({ slug, path: filePath, data, body });
    }

    const dirs = await listDir(gh.token, collection.dir);
    const entries = [];

    for (const d of dirs.filter((x) => x.type === 'dir')) {
      let raw = await readFile(gh.token, `${collection.dir}/${d.name}/index.md`);
      if (raw === null) raw = await readFile(gh.token, `${collection.dir}/${d.name}/index.mdoc`);
      if (raw === null) continue;
      const { data } = parseFrontmatter(raw);
      entries.push({
        slug: d.name,
        title: data.title ?? d.name,
        date: data.date ?? '',
        description: data.description ?? '',
      });
    }

    entries.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return json({ entries });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Beklenmeyen hata' }, 500);
  }
};
