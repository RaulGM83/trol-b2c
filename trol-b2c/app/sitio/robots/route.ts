// robots.txt de trol.mx (el middleware lo sirve sólo en el sitio público).
// Se permite todo, con mención explícita de los rastreadores de asistentes de IA
// para que quede claro que el contenido se puede leer y citar.
const IA = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot', 'Bingbot'];

export function GET() {
  const cuerpo =
    'User-agent: *\nAllow: /\nDisallow: /i/\n\n' +
    IA.map((a) => `User-agent: ${a}\nAllow: /\nDisallow: /i/\n`).join('\n') +
    '\nSitemap: https://trol.mx/sitemap.xml\n';
  return new Response(cuerpo, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}
