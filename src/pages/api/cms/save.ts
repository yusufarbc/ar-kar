import type { APIRoute } from 'astro';
import { requireAccess } from '../../../lib/access';
import { requireGithubToken } from '../../../lib/secrets';
import { getCollection, slugify, type CollectionDef } from '../../../lib/cms-schema';
import { putFile, toBase64 } from '../../../lib/github';
import { stringifyFrontmatter } from '../../../lib/frontmatter';

export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

/** Şemaya göre alanları doğrular ve frontmatter verisini üretir. */
function buildData(
  collection: CollectionDef,
  input: Record<string, unknown>
): { ok: true; data: Record<string, string>; body: string } | { ok: false; error: string } {
  const data: Record<string, string> = {};

  for (const field of collection.fields) {
    if (field.name === 'body') continue;

    const raw = input[field.name];
    const value = typeof raw === 'string' ? raw.trim() : '';

    if (!value) {
      if (field.required) return { ok: false, error: `"${field.label}" alanı zorunlu.` };
      continue;
    }

    if (field.type === 'select' && field.options) {
      const allowed = field.options.map((o) => o.value);
      if (!allowed.includes(value)) {
        return { ok: false, error: `"${field.label}" için geçersiz değer: ${value}` };
      }
    }

    if (field.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return { ok: false, error: `"${field.label}" YYYY-AA-GG biçiminde olmalı.` };
    }

    data[field.name] = value;
  }

  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) return { ok: false, error: '"İçerik" alanı zorunlu.' };

  return { ok: true, data, body };
}

/** POST /api/cms/save */
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

  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return json({ error: '"Başlık" alanı zorunlu.' }, 400);

  const slug =
    (typeof input.slug === 'string' && slugify(input.slug)) || slugify(title);
  if (!slug) return json({ error: 'Geçerli bir slug üretilemedi.' }, 400);

  const editor = auth.identity.email;

  try {
    // 1) Kapak görseli varsa önce onu commit et
    let coverImage = typeof input.coverImage === 'string' ? input.coverImage : '';

    const imageBase64 = typeof input.imageBase64 === 'string' ? input.imageBase64 : '';
    const imageName = typeof input.imageName === 'string' ? input.imageName : '';

    if (imageBase64 && imageName) {
      const payload = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;
      const approxBytes = Math.floor((payload.length * 3) / 4);
      if (approxBytes > MAX_IMAGE_BYTES) {
        return json({ error: 'Görsel 5 MB sınırını aşıyor.' }, 400);
      }

      const safeName = slugify(imageName.replace(/\.[^.]+$/, ''));
      const ext = (imageName.match(/\.[^.]+$/)?.[0] ?? '.jpg').toLowerCase();
      const fileName = `${Date.now()}-${safeName}${ext}`;

      await putFile({
        token: gh.token,
        path: `${collection.mediaDir}/${fileName}`,
        contentBase64: payload,
        message: `media: ${fileName} yuklendi (${editor})`,
      });

      coverImage = `${collection.mediaPublicPath}/${fileName}`;
    }

    // 2) Frontmatter + gövdeyi doğrula ve markdown dosyasını commit et
    const built = buildData(collection, { ...input, coverImage });
    if (!built.ok) return json({ error: built.error }, 400);

    const fileContent = stringifyFrontmatter(built.data, built.body);
    const path = `${collection.dir}/${slug}/index.md`;

    await putFile({
      token: gh.token,
      path,
      contentBase64: toBase64(fileContent),
      message: `cms: "${title}" kaydedildi (${editor})`,
    });

    return json({ success: true, slug, path });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Beklenmeyen hata' }, 500);
  }
};
