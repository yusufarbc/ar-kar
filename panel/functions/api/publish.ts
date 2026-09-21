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

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1600;
const MAX_GALLERY_IMAGES = 8;

type ImageDimensions = { width: number; height: number; animated: boolean };

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

function readU32LE(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

/** WebP kapsayıcısından piksel ölçüsünü okur (VP8, VP8L ve VP8X). */
function webpDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    return null;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const size = readU32LE(bytes, offset + 4);
    const data = offset + 8;
    if (data + size > bytes.length) return null;

    if (type === 'VP8X' && size >= 10) {
      const width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
      const height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16);
      return { width, height, animated: Boolean(bytes[data] & 0x02) };
    }
    if (type === 'VP8L' && size >= 5 && bytes[data] === 0x2f) {
      const bits = readU32LE(bytes, data + 1);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        animated: false,
      };
    }
    if (
      type === 'VP8 ' && size >= 10 &&
      bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a
    ) {
      const width = (bytes[data + 6] | (bytes[data + 7] << 8)) & 0x3fff;
      const height = (bytes[data + 8] | (bytes[data + 9] << 8)) & 0x3fff;
      return { width, height, animated: false };
    }

    offset = data + size + (size % 2);
  }
  return null;
}

function decodeBase64(payload: string): Uint8Array | null {
  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function validateWebpPayload(payloadInput: string, label: string): { payload: string; dimensions: ImageDimensions } | string {
  const payload = payloadInput.replace(/\s/g, '');
  if (!payload || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) {
    return `${label} geçerli bir Base64 WebP dosyası değil.`;
  }
  const paddingBytes = payload.endsWith('==') ? 2 : (payload.endsWith('=') ? 1 : 0);
  const estimatedBytes = Math.floor((payload.length * 3) / 4) - paddingBytes;
  if (estimatedBytes > MAX_IMAGE_BYTES) {
    return `${label} 5 MB sınırını aşıyor.`;
  }
  const bytes = decodeBase64(payload);
  if (!bytes || bytes.length > MAX_IMAGE_BYTES) {
    return `${label} geçerli bir WebP dosyası değil veya 5 MB sınırını aşıyor.`;
  }
  const dimensions = webpDimensions(bytes);
  if (!dimensions) return `${label} gerçek bir WebP dosyası değil.`;
  if (dimensions.animated) return `${label} hareketli olamaz.`;
  if (dimensions.width > MAX_IMAGE_WIDTH) {
    return `${label} en fazla ${MAX_IMAGE_WIDTH}px genişliğinde olabilir.`;
  }
  if (dimensions.width * 3 !== dimensions.height * 4) {
    return `${label} tam 4:3 oranında olmalıdır (gelen: ${dimensions.width}×${dimensions.height}px).`;
  }
  return { payload, dimensions };
}

function payloadFromDataUrl(value: unknown, label: string): { payload: string; dimensions: ImageDimensions } | string {
  const match = /^data:image\/webp;base64,([\s\S]+)$/i.exec(String(value ?? ''));
  if (!match) return `${label} WebP formatında olmalıdır.`;
  return validateWebpPayload(match[1], label);
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

async function getFileContent(token: string, path: string): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${BRANCH}`,
    { headers: ghHeaders(token) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Görsel doğrulanamadı (${res.status})`);
  const data = (await res.json()) as { content?: string; encoding?: string };
  if (data.encoding !== 'base64' || !data.content) throw new Error('Görsel içeriği GitHub’dan okunamadı.');
  return data.content;
}

function mediaRepoPath(publicPath: string, mediaPublic: string): string | null {
  if (
    !publicPath.startsWith(`${mediaPublic}/`) ||
    !publicPath.toLowerCase().endsWith('.webp') ||
    publicPath.includes('..') || publicPath.includes('\\') || publicPath.includes('?') || publicPath.includes('#')
  ) return null;
  const fileName = publicPath.slice(mediaPublic.length + 1);
  if (!fileName || fileName.includes('/')) return null;
  return `public${publicPath}`;
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

  const date = String(body.date ?? '').trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'Geçerli bir tarih zorunludur (YYYY-AA-GG).' }, 400);
  }

  const description = String(body.description ?? '').trim();
  if (!description) return json({ error: 'Özet açıklama zorunludur.' }, 400);

  try {
    // Tüm alan ve görseller, GitHub'a herhangi bir dosya yazılmadan önce
    // doğrulanır. Böylece hatalı bir istek yarım kalmış medya commit'i bırakmaz.
    let projectCategory = '';
    let projectStatus = 'tamamlandi';
    if (body.collection === 'projects') {
      // Panel yalnızca inşaat projeleri için kullanılır; kategori seçimi
      // kullanıcıya gösterilmez ve istemciden gelen değer kabul edilmez.
      projectCategory = 'insaat';
      projectStatus = String(body.status ?? 'tamamlandi').trim();
      if (!['tamamlandi', 'guncel'].includes(projectStatus)) {
        return json({ error: `Geçersiz proje durumu: ${projectStatus}` }, 400);
      }
    }

    let coverImage = String(body.coverImage ?? '').trim();
    let newCoverPayload: string | null = null;
    let newCoverFileName: string | null = null;
    if (body.imageBase64) {
      const checked = payloadFromDataUrl(body.imageBase64, 'Kapak görseli');
      if (typeof checked === 'string') return json({ error: checked }, 400);
      newCoverPayload = checked.payload;
      newCoverFileName = `${date}-${slug}.webp`;
      coverImage = `${collection.mediaPublic}/${newCoverFileName}`;
    } else if (!coverImage) {
      return json({ error: 'Kapak görseli zorunludur (4:3 WebP formatında).' }, 400);
    } else {
      const repoPath = mediaRepoPath(coverImage, collection.mediaPublic);
      if (!repoPath) {
        return json({ error: 'Mevcut kapak görseli bu koleksiyona ait güvenli bir WebP yolu değil.' }, 400);
      }
      const existingPayload = await getFileContent(env.GITHUB_TOKEN, repoPath);
      if (!existingPayload) {
        return json({ error: 'Mevcut kapak görseli bulunamadı. Lütfen yeni bir 4:3 WebP yükleyin.' }, 400);
      }
      const checked = validateWebpPayload(existingPayload, 'Mevcut kapak görseli');
      if (typeof checked === 'string') return json({ error: checked }, 400);
    }

    const existingGallery = Array.isArray(body.existingGallery)
      ? body.existingGallery.filter((p: unknown) => typeof p === 'string' && p)
      : [];
    const galleryInput = Array.isArray(body.galleryImages) ? body.galleryImages : [];
    if (existingGallery.length + galleryInput.length > MAX_GALLERY_IMAGES) {
      return json({ error: `En fazla ${MAX_GALLERY_IMAGES} galeri görseli olabilir.` }, 400);
    }
    if (existingGallery.some((path: string) => !mediaRepoPath(path, collection.mediaPublic))) {
      return json({ error: 'Galeride bu koleksiyona ait olmayan veya geçersiz bir görsel yolu var.' }, 400);
    }

    const validatedGallery: Array<{ payload: string; fileName: string }> = [];
    for (let i = 0; i < galleryInput.length; i++) {
      const item = galleryInput[i] ?? {};
      const checked = payloadFromDataUrl(item.base64, `${i + 1}. galeri görseli`);
      if (typeof checked === 'string') return json({ error: checked }, 400);
      const fileName = `${date}-${slug}-${Date.now()}-${i + 1}.webp`;
      validatedGallery.push({ payload: checked.payload, fileName });
    }

    if (newCoverPayload && newCoverFileName) {
      await putFile(
        env.GITHUB_TOKEN,
        `${collection.mediaDir}/${newCoverFileName}`,
        newCoverPayload,
        `media: ${newCoverFileName} (${editor})`
      );
    }

    const gallery: string[] = [...existingGallery];
    for (const { payload, fileName } of validatedGallery) {
      await putFile(
        env.GITHUB_TOKEN,
        `${collection.mediaDir}/${fileName}`,
        payload,
        `media: ${fileName} (${editor})`
      );
      gallery.push(`${collection.mediaPublic}/${fileName}`);
    }

    // 2) Frontmatter — alanlar ana sitedeki Zod şemasıyla uyumlu olmalı
    const fm: Record<string, string> = {
      title,
      date,
      description,
      coverImage,
    };

    if (body.collection === 'projects') {
      fm.category = projectCategory;
      fm.status = projectStatus;
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
