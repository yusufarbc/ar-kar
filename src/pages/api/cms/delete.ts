import type { APIRoute } from 'astro';
import { requireAccess } from '../../../lib/access';
import { requireGithubToken } from '../../../lib/secrets';
import { getCollection } from '../../../lib/cms-schema';
import { deleteFile, getFileSha } from '../../../lib/github';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** POST /api/cms/delete  { collection, slug } */
export const POST: APIRoute = async ({ request }) => {
  const auth = requireAccess(request);
  if (!auth.ok) return auth.response;

  const gh = await requireGithubToken();
  if (!gh.ok) return gh.response;

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const collection = getCollection(input.collection);
  if (!collection) return json({ error: 'Geçersiz koleksiyon.' }, 400);

  const slug = typeof input.slug === 'string' ? input.slug : '';
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return json({ error: 'Geçersiz slug.' }, 400);
  }

  const editor = auth.identity.email;

  try {
    let path = `${collection.dir}/${slug}/index.md`;
    if (!(await getFileSha(gh.token, path))) {
      path = `${collection.dir}/${slug}/index.mdoc`;
    }

    await deleteFile({
      token: gh.token,
      path,
      message: `cms: "${slug}" silindi (${editor})`,
    });

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Beklenmeyen hata' }, 500);
  }
};
