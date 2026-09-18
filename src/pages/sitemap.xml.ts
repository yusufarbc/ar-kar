import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

// Her `astro build` calistiginda yeniden uretilir; elle guncellenen bir
// dosya degildir. Google Search Console'a https://ar-kar.com/sitemap.xml
// olarak eklenmelidir.
export const prerender = true;

const SITE = 'https://ar-kar.com';

// Site genelindeki .html konvansiyonuna uyan sabit sayfalar.
const STATIC_PAGES: Array<{
  path: string;
  changefreq: 'daily' | 'weekly' | 'monthly';
  priority: string;
}> = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/projeler.html', changefreq: 'weekly', priority: '0.9' },
  { path: '/muteahhitlik.html', changefreq: 'monthly', priority: '0.8' },
  { path: '/insaat.html', changefreq: 'monthly', priority: '0.8' },
  { path: '/pvc.html', changefreq: 'monthly', priority: '0.8' },
  { path: '/tarim.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/ziraat.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/otomotiv.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/mimar.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/dekorasyon.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/sss.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/blog.html', changefreq: 'weekly', priority: '0.7' },
];

function xmlEscape(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toLastmod(value: unknown, fallback: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return fallback;
}

export const GET: APIRoute = async () => {
  const today = new Date().toISOString().split('T')[0];

  const [blogPosts, projects] = await Promise.all([
    getCollection('blog'),
    getCollection('projects'),
  ]);

  type Entry = { loc: string; lastmod: string; changefreq: string; priority: string };

  const entries: Entry[] = [
    ...STATIC_PAGES.map((p) => ({
      loc: `${SITE}${p.path}`,
      lastmod: today,
      changefreq: p.changefreq,
      priority: p.priority,
    })),
    ...blogPosts.map((post) => {
      const slug = post.id.replace(/\/index$/, '');
      return {
        loc: `${SITE}/blog/${slug}.html`,
        lastmod: toLastmod(post.data.date, today),
        changefreq: 'monthly',
        priority: '0.6',
      };
    }),
    ...projects.map((project) => {
      const slug = project.id.replace(/\/index$/, '');
      return {
        loc: `${SITE}/projeler/${slug}.html`,
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
    <loc>${xmlEscape(e.loc)}</loc>
    <lastmod>${e.lastmod}</lastmod>
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
