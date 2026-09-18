/**
 * Kayıt listeleme / tek kayıt okuma / silme.
 *   GET    /api/entries?collection=blog            -> liste
 *   GET    /api/entries?collection=blog&slug=xyz   -> tek kayıt (düzenleme)
 *   DELETE /api/entries?collection=blog&slug=xyz   -> sil
 */

interface Env {
  GITHUB_TOKEN: string;
}

const REPO_OWNER = 'yusufarbc';
const REPO_NAME = 'ar-kar';
const BRANCH = 'production';
const GITHUB_API = 'https://api.github.com';

const DIRS: Record<string, string> = {
  blog: 'src/content/blog',
  projects: 'src/content/projects',
};

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

function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

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

/** --- frontmatter (yalnızca düz string alanlar) --- */
function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) {
      try { v = JSON.parse(v); } catch { v = v.slice(1, -1); }
    } else if (v.startsWith("'") && v.endsWith("'")) {
      v = v.slice(1, -1);
    }
    data[kv[1]] = v;
  }
  return { data, body: (m[2] ?? '').trim() };
}

async function readFile(token: string, path: string): Promise<string | null> {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${BRANCH}`,
    { headers: ghHeaders(token) }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`okuma hatası (${res.status})`);
  const data = (await res.json()) as { content?: string };
  return data.content ? fromBase64(data.content) : null;
}

async function listDir(token: string, path: string) {
  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${BRANCH}`,
    { headers: ghHeaders(token) }
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`listeleme hatası (${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!editorEmail(request)) return json({ error: 'Yetkisiz.' }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN tanımlı değil.' }, 500);

  const url = new URL(request.url);
  const dir = DIRS[url.searchParams.get('collection') ?? ''];
  if (!dir) return json({ error: 'Geçersiz koleksiyon.' }, 400);

  const slug = url.searchParams.get('slug');

  try {
    if (slug) {
      const raw = await readFile(env.GITHUB_TOKEN, `${dir}/${slug}/index.md`);
      if (raw === null) return json({ error: 'Kayıt bulunamadı.' }, 404);
      const { data, body } = parseFrontmatter(raw);
      return json({ slug, data, body });
    }

    const items = await listDir(env.GITHUB_TOKEN, dir);
    const entries = [];
    for (const it of items) {
      if (it.type !== 'dir') continue;
      const raw = await readFile(env.GITHUB_TOKEN, `${dir}/${it.name}/index.md`);
      if (raw === null) continue;
      const { data } = parseFrontmatter(raw);
      entries.push({
        slug: it.name,
        title: data.title ?? it.name,
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

export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  const editor = editorEmail(request);
  if (!editor) return json({ error: 'Yetkisiz.' }, 401);
  if (!env.GITHUB_TOKEN) return json({ error: 'GITHUB_TOKEN tanımlı değil.' }, 500);

  const url = new URL(request.url);
  const dir = DIRS[url.searchParams.get('collection') ?? ''];
  const slug = url.searchParams.get('slug') ?? '';
  if (!dir) return json({ error: 'Geçersiz koleksiyon.' }, 400);
  if (!/^[a-z0-9-]+$/.test(slug)) return json({ error: 'Geçersiz adres.' }, 400);

  try {
    const path = `${dir}/${slug}/index.md`;
    const shaRes = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${BRANCH}`,
      { headers: ghHeaders(env.GITHUB_TOKEN) }
    );
    if (shaRes.status === 404) return json({ error: 'Kayıt bulunamadı.' }, 404);
    const { sha } = (await shaRes.json()) as { sha: string };

    const res = await fetch(
      `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}`,
      {
        method: 'DELETE',
        headers: ghHeaders(env.GITHUB_TOKEN),
        body: JSON.stringify({ message: `cms: "${slug}" silindi (${editor})`, sha, branch: BRANCH }),
      }
    );
    if (!res.ok) throw new Error(`silme hatası (${res.status}): ${await res.text()}`);

    return json({ success: true });
  } catch (err: any) {
    return json({ error: err?.message ?? 'Beklenmeyen hata' }, 500);
  }
};
