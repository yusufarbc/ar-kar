/**
 * AR-KAR Panel — içerik yayınlama uç noktası (Cloudflare Pages Function).
 *
 * GITHUB_TOKEN yalnızca burada, Pages ortam değişkeni olarak yaşar.
 * Tarayıcıya asla gönderilmez.
 *
 * Kimlik doğrulama Cloudflare Access tarafından yapılır (panel.ar-kar.com
 * uygulaması). Buradaki Cf-Access-Jwt-Assertion kontrolü ikinci katmandır
 * ve editörün e-postasını commit mesajına yazmak için kullanılır.
 */

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

const PROJECT_CATEGORIES = ['insaat', 'pvc', 'dekorasyon', 'mimar'];

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

/** Editörün e-postasını Access JWT'sinden okur. */
function editorEmail(request: Request): string | null {
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return null;
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)))
    );
    return payload.email ?? payload.sub ?? 'bilinmeyen';
  } catch {
    return 'bilinmeyen';
  }
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

  const editor = editorEmail(request);
  if (!editor) {
    return json({ error: 'Yetkisiz: Cloudflare Access kimliği bulunamadı.' }, 401);
  }

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

  try {
    // 1) Görsel (tarayıcıda webp'ye çevrilmiş olarak gelir)
    let coverImage = String(body.coverImage ?? '').trim();
    if (body.imageBase64) {
      const payload = String(body.imageBase64).split(',').pop() ?? '';
      if (Math.floor((payload.length * 3) / 4) > 5 * 1024 * 1024) {
        return json({ error: 'Görsel 5 MB sınırını aşıyor.' }, 400);
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
    }

    const frontmatter = Object.entries(fm)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join('\n');
    const fileContent = `---\n${frontmatter}\n---\n\n${content}\n`;

    await putFile(
      env.GITHUB_TOKEN,
      `${collection.dir}/${slug}/index.md`,
      toBase64(fileContent),
      `cms: "${title}" yayinlandi (${editor})`
    );

    return json({ success: true, slug, coverImage });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Beklenmeyen hata' }, 500);
  }
};
