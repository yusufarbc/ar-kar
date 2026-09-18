/**
 * Basit YAML frontmatter okuma/yazma.
 *
 * Kapsam bilinçli olarak dar: yalnızca düz string/sayı alanları desteklenir,
 * çünkü CMS şemamızdaki tüm alanlar bu türden. Harici bir YAML bağımlılığı
 * eklemek yerine bu küçük yardımcı tercih edildi.
 */

export interface ParsedContent {
  data: Record<string, string>;
  body: string;
}

/** Değeri her zaman çift tırnaklı YAML skaleri olarak yazar (güvenli kaçış). */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function stringifyFrontmatter(data: Record<string, string>, body: string): string {
  const lines = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${yamlString(String(v))}`);

  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}

export function parseFrontmatter(raw: string): ParsedContent {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      try {
        value = value.startsWith('"') ? JSON.parse(value) : value.slice(1, -1);
      } catch {
        value = value.slice(1, -1);
      }
    }
    data[m[1]] = value;
  }

  return { data, body: (match[2] ?? '').trim() };
}
