import type { APIRoute } from 'astro';

/**
 * robots.txt — her derlemede ortama göre üretilir.
 *
 * Eskiden public/robots.txt sabit bir dosyaydı ve staging kopyası da aynı
 * "Allow: /" içeriğini sunuyordu; yani canlı sitenin birebir kopyası
 * taranabilir durumdaydı. Artık production dışındaki her ortam tüm siteyi
 * taramaya kapatır (BaseLayout'taki noindex meta'sı ile birlikte çalışır).
 *
 * Ortam değişkeni: PUBLIC_DEPLOY_ENV (bkz. astro.config.mjs)
 */
export const prerender = true;

/**
 * İçeriğe erişimi bilinçli olarak açık tuttuğumuz yapay zeka / LLM botları.
 * Hepsi arama motorlarıyla aynı kuralları alır; ayrı ayrı listelenmelerinin
 * sebebi bazı botların yalnızca kendi adlarına yazılmış blokları okumasıdır.
 */
const AI_BOTS = [
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'Google-Extended',
  'Applebot-Extended',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'Meta-ExternalAgent',
  'FacebookBot',
  'Amazonbot',
  'Bytespider',
  'YouBot',
  'cohere-ai',
  'Diffbot',
];

export const GET: APIRoute = async ({ site }) => {
  const deployEnv = import.meta.env.PUBLIC_DEPLOY_ENV ?? 'production';
  const isProduction = deployEnv === 'production';
  const origin = (site ?? new URL('https://ar-kar.com')).origin;

  // ---- Production dışı: her şey kapalı ------------------------------------
  if (!isProduction) {
    return new Response(
      `# AR-KAR — ${deployEnv} ortamı
#
# Bu, canlı sitenin önizleme kopyasıdır. Arama motorlarında görünmesi
# canlı site ile çift içerik (duplicate content) yaratır; bu yüzden
# tamamen taramaya kapalıdır.

User-agent: *
Disallow: /
`,
      { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }

  // ---- Production ---------------------------------------------------------
  //
  // NOT: CSS/JS dizinleri BİLEREK engellenmez. Google sayfayı sizin gördüğünüz
  // gibi render edebilmek için stil ve script dosyalarına erişmek zorundadır;
  // /lib/ veya /css/ engellenirse mobil uyumluluk ve düzen değerlendirmesi
  // hatalı çıkar.
  const lines: string[] = [
    '# AR-KAR İnşaat — robots.txt',
    '#',
    '# Site tüm arama motorlarına ve yapay zeka/LLM botlarına açıktır.',
    '# Yönetim paneli bu sitede değil, ayrı bir projede (panel.ar-kar.com)',
    '# yayınlanır; Cloudflare Access ve WAF ile korunur, buradan erişilemez.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
  ];

  for (const bot of AI_BOTS) {
    lines.push(`User-agent: ${bot}`, 'Allow: /', '');
  }

  lines.push(
    '# Sitemap (her derlemede otomatik üretilir)',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
    '# LLM bağlamı için: /llm.txt ve /llms.txt',
    '# Ekip/site bilgisi için: /humans.txt',
    ''
  );

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
