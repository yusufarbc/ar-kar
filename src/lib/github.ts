/**
 * GitHub Contents API yardımcıları.
 *
 * Token ASLA tarayıcıya gönderilmez — yalnızca Worker içinde, Cloudflare
 * Secret'ından okunur. Panel formu sadece bu sunucu uç noktalarına istek atar.
 */

const GITHUB_API = 'https://api.github.com';

export const REPO_OWNER = 'yusufarbc';
export const REPO_NAME = 'ar-kar';
export const TARGET_BRANCH = 'production';

const UA = 'ar-kar-cms';

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': UA,
    'Content-Type': 'application/json',
  };
}

/** UTF-8 güvenli base64 (btoa tek başına Türkçe karakterlerde bozulur). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): string {
  const binary = atob(b64.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Dosyanın mevcut sha'sını döndürür; dosya yoksa null. */
export async function getFileSha(token: string, path: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${TARGET_BRANCH}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub sha okunamadı (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { sha?: string };
  return data.sha ?? null;
}

/** Dosyayı oluşturur veya günceller (varsa sha otomatik eklenir). */
export async function putFile(opts: {
  token: string;
  path: string;
  contentBase64: string;
  message: string;
}): Promise<void> {
  const sha = await getFileSha(opts.token, opts.path);

  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(opts.path)}`,
    {
      method: 'PUT',
      headers: headers(opts.token),
      body: JSON.stringify({
        message: opts.message,
        content: opts.contentBase64,
        branch: TARGET_BRANCH,
        ...(sha ? { sha } : {}),
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub yazma hatası (${res.status}): ${await res.text()}`);
  }
}

/** Dosyayı siler. */
export async function deleteFile(opts: {
  token: string;
  path: string;
  message: string;
}): Promise<void> {
  const sha = await getFileSha(opts.token, opts.path);
  if (!sha) return;

  const res = await fetch(
    `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(opts.path)}`,
    {
      method: 'DELETE',
      headers: headers(opts.token),
      body: JSON.stringify({ message: opts.message, sha, branch: TARGET_BRANCH }),
    }
  );

  if (!res.ok) {
    throw new Error(`GitHub silme hatası (${res.status}): ${await res.text()}`);
  }
}

/** Bir klasördeki dosyaları listeler. */
export async function listDir(
  token: string,
  path: string
): Promise<Array<{ name: string; path: string; type: string }>> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${TARGET_BRANCH}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub listeleme hatası (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Dosya içeriğini düz metin olarak okur; yoksa null. */
export async function readFile(token: string, path: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodeURI(path)}?ref=${TARGET_BRANCH}`;
  const res = await fetch(url, { headers: headers(token) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub okuma hatası (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as { content?: string };
  return data.content ? fromBase64(data.content) : null;
}
