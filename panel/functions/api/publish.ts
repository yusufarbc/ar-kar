/**
 * AR-KAR Panel — içerik yayınlama uç noktası (Cloudflare Pages Function).
 *
 * GITHUB_TOKEN yalnızca burada, Pages ortam değişkeni olarak yaşar.
 * Tarayıcıya asla gönderilmez.
 *
 * KİMLİK DOĞRULAMA: Cloudflare Access yalnızca panel.ar-kar.com özel adını
 * korur — bu projenin ham *.pages.dev adresi Access'ten geçmez. Bu yüzden
 * Cf-Access-Jwt-Assertion header'ının İMZASI burada, _lib/verifyAccess.ts
 * ile Cloudflare'in genel anahtarına (JWKS) karşı doğrulanır. İmza kontrolü
 * olmadan bu uç nokta, sahte bir header ile internetten doğrudan
 * çağrılabilir ve GITHUB_TOKEN'ın yetkisiyle repoya yazılabilirdi.
 */

import { verifyAccessJwt } from '../_lib/verifyAccess';

interface Env {
  GITHUB_TOKEN: string;
}

const REPO_OWNER = 'yusufarbc';
const REPO_NAME = 'ar-kar';
const BRANCH = 'production';
const GITHUB_API = 'https://api.github.com';

const COLLECTIONS: Record<string, { dir: string; mediaDir: string; mediaPublic: string }> = {
  blog: {
    dir: 'src/content/blog',
    mediaDir: 'public/img/blog',
    mediaPublic: '/img/blog',
  },
  projects: {
    dir: 'src/content/projects',
    mediaDir: 'public/img/projects',
    mediaPublic: '/img/projects',
  },
};

const PROJECT_CATEGORIES = ['insaat', 'pvc', 'mimar'];

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ar-kar-panel',
    'Content-Type': 'application/json',
  };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function slugify(input: string): string {
  const map: Record<string, string> = {
    ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
    ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  };
  return input
    .split('')
    .map((c) => map[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** Var olan dosyanın sha'sı (güncelleme için gerekir); yoksa null. */
async function getSha(token: string, path: string): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${BRANCH}`,
    { headers: ghHeaders(token) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sha okunamadı (${res.status})`);
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

async function putFile(token: string, path: string, contentB64: string, message: string) {
  const sha = await getSha(token, path);
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}`,
    {
      method: 'PUT',
      headers: ghHeaders(token),
      body: JSON.stringify({
        message,
        content: contentB64,
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }
  );
  if (!res.ok) throw new Error(`GitHub yazma hatası (${res.status}): ${await res.text()}`);
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  const identity = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'));
  if (!identity) {
    return json({ error: 'Yetkisiz: Cloudflare Access kimliği doğrulanamadı.' }, 401);
  }
  const editor = identity.email;

  if (!env.GITHUB_TOKEN) {
    return json(
      { error: 'GITHUB_TOKEN tanımlı değil. Pages projesi ayarlarına ekleyin.' },
      500
    );
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Geçersiz istek gövdesi.' }, 400);
  }

  const collection = COLLECTIONS[body.collection];
  if (!collection) return json({ error: 'Geçersiz koleksiyon.' }, 400);

  const title = String(body.title ?? '').trim();
  if (!title) return json({ error: 'Başlık zorunlu.' }, 400);

  const content = String(body.content ?? '').trim();
  if (!content) return json({ error: 'İçerik zorunlu.' }, 400);

  const slug = slugify(String(body.slug ?? '') || title);
  if (!slug) return json({ error: 'Geçerli bir adres (slug) üretilemedi.' }, 400);

  const date = String(body.date ?? '').trim() || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Tarih YYYY-AA-GG biçiminde olmalı.' }, 400);
  }

  const MAX_GALLERY_IMAGES = 8;

  try {
    // 1) Kapak görseli (tarayıcıda webp'ye çevrilmiş olarak gelir)
    let coverImage = String(body.coverImage ?? '').trim();
    if (body.imageBase64) {
      const payload = String(body.imageBase64).split(',').pop() ?? '';
      if (Math.floor((payload.length * 3) / 4) > 5 * 1024 * 1024) {
        return json({ error: 'Kapak görseli 5 MB sınırını aşıyor.' }, 400);
      }
      const fileName = `${date}-${slug}.webp`;
      await putFile(
        env.GITHUB_TOKEN,
        `${collection.mediaDir}/${fileName}`,
        payload,
        `media: ${fileName} (${editor})`
      );
      coverImage = `${collection.mediaPublic}/${fileName}`;
    }

    // 1b) Galeri görselleri: düzenlemede korunan mevcut yollar (existingGallery)
    // + yeni yüklenenler (galleryImages, tarayıcıda webp'ye çevrilmiş).
    // existingGallery client'tan gelir çünkü GitHub'daki dosyanın "sha"sını
    // burada tutmuyoruz; client düzenleme ekranında hangi görsellerin
    // kaldığını (kullanıcı "x" ile kaldırmadığı sürece) bilir.
    const existingGallery = Array.isArray(body.existingGallery)
      ? body.existingGallery.filter((p: unknown) => typeof p === 'string' && p)
      : [];
    const galleryInput = Array.isArray(body.galleryImages) ? body.galleryImages : [];
    if (existingGallery.length + galleryInput.length > MAX_GALLERY_IMAGES) {
      return json({ error: `En fazla ${MAX_GALLERY_IMAGES} galeri görseli olabilir.` }, 400);
    }
    const gallery: string[] = [...existingGallery];
    for (let i = 0; i < galleryInput.length; i++) {
      const item = galleryInput[i] ?? {};
      const dataUrl = String(item.base64 ?? '');
      const payload = dataUrl.split(',').pop() ?? '';
      if (!payload) continue;
      if (Math.floor((payload.length * 3) / 4) > 5 * 1024 * 1024) {
        return json({ error: `${i + 1}. galeri görseli 5 MB sınırını aşıyor.` }, 400);
      }
      // Zaman damgası + sıra numarası: düzenlemede korunan (existingGallery)
      // dosyalarla ada çakışıp üzerine yazma riskini engeller.
      const fileName = `${date}-${slug}-${Date.now()}-${i + 1}.webp`;
      await putFile(
        env.GITHUB_TOKEN,
        `${collection.mediaDir}/${fileName}`,
        payload,
        `media: ${fileName} (${editor})`
      );
      gallery.push(`${collection.mediaPublic}/${fileName}`);
    }

    // 2) Frontmatter — alanlar ana sitedeki Zod şemasıyla uyumlu olmalı
    const fm: Record<string, string> = { title, date };
    const description = String(body.description ?? '').trim();
    if (description) fm.description = description;
    if (coverImage) fm.coverImage = coverImage;

    if (body.collection === 'projects') {
      const category = String(body.category ?? 'insaat').trim();
      if (!PROJECT_CATEGORIES.includes(category)) {
        return json({ error: `Geçersiz kategori: ${category}` }, 400);
      }
      fm.category = category;
      const location = String(body.location ?? '').trim();
      if (location) fm.location = location;
      const specs = String(body.specs ?? '').trim();
      if (specs) fm.specs = specs;
    }

    const scalarLines = Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    const galleryLines =
      gallery.length > 0
        ? [`gallery:`, ...gallery.map((g) => `  - ${JSON.stringify(g)}`)]
        : [];
    const frontmatter = [...scalarLines, ...galleryLines].join('\n');
    const fileContent = `---\n${frontmatter}\n---\n\n${content}\n`;

    await putFile(
      env.GITHUB_TOKEN,
      `${collection.dir}/${slug}/index.md`,
      toBase64(fileContent),
      `cms: "${title}" yayinlandi (${editor})`
    );

    return json({ success: true, slug, coverImage, gallery });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Beklenmeyen hata' }, 500);
  }
};
