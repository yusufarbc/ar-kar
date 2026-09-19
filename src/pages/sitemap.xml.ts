import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Her `astro build` calistiginda yeniden uretilir; elle guncellenen bir
// dosya degildir. Google Search Console'a https://ar-kar.com/sitemap.xml
// olarak eklenmelidir.
//
// Adres artik sabit degil, astro.config.mjs'teki `site` degerinden gelir —
// staging derlemesi kendi adresini yazar, canli sitenin adreslerini degil.
export const prerender = true;

const FALLBACK_SITE = 'https://ar-kar.com';

// Site genelindeki .html konvansiyonuna uyan sabit sayfalar.
const STATIC_PAGES: Array<{
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}> = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/projeler', changefreq: 'weekly', priority: '0.9' },
  { path: '/hakkimizda', changefreq: 'monthly', priority: '0.8' },
  { path: '/iletisim', changefreq: 'monthly', priority: '0.8' },
  { path: '/muteahhitlik', changefreq: 'monthly', priority: '0.8' },
  { path: '/insaat', changefreq: 'monthly', priority: '0.8' },
  { path: '/pvc', changefreq: 'monthly', priority: '0.8' },
  { path: '/tarim', changefreq: 'monthly', priority: '0.7' },
  { path: '/ziraat', changefreq: 'monthly', priority: '0.7' },
  { path: '/mimar', changefreq: 'monthly', priority: '0.7' },
  { path: '/sss', changefreq: 'monthly', priority: '0.6' },
  { path: '/haberler', changefreq: 'weekly', priority: '0.7' },
];

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toLastmod(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return fallback;
}

export const GET: APIRoute = async ({ site }) => {
  const SITE = (site ?? new URL(FALLBACK_SITE)).origin;
  const today = new Date().toISOString().split('T')[0];

  const [blogPosts, projects] = await Promise.all([
    getCollection('blog'),
    getCollection('projects'),
  ]);

  type Entry = { loc: string; lastmod?: string; changefreq: string; priority: string };

  const entries: Entry[] = [
    // Sabit sayfalarda lastmod BILEREK yazilmaz. Her derlemede "bugun"
    // yazmak, her deploy'da tum sayfalar degismis gibi gorunmesine yol acar
    // ve Google bir sure sonra bu alani tamamen yok saymaya baslar. Gercek
    // bir tarih yalnizca icerik kayitlarinda var.
    ...STATIC_PAGES.map((p) => ({
      loc: `${SITE}${p.path}`,
      changefreq: p.changefreq,
      priority: p.priority,
    })),
    ...blogPosts.map((post) => {
      const slug = post.id.replace(/\/index$/, '');
      return {
        loc: `${SITE}/haberler/${slug}`,
        lastmod: toLastmod(post.data.date, today),
        changefreq: 'monthly',
        priority: '0.6',
      };
    }),
    ...projects.map((project) => {
      const slug = project.id.replace(/\/index$/, '');
      return {
        loc: `${SITE}/projeler/${slug}`,
        lastmod: toLastmod(project.data.date, today),
        changefreq: 'monthly',
        priority: '0.7',
      };
    }),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries
  .map(
    (e) => `  <url>
    <loc>${xmlEscape(e.loc)}</loc>${e.lastmod ? `\n    <lastmod>${e.lastmod}</lastmod>` : ''}
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
