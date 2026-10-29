// Render mínimo de Markdown para documentos legales (trol3.documentos_legales).
// Soporta: ### y #### títulos, **negritas**, tablas con |, y una línea = un párrafo.
// Sin dependencias; el contenido lo escribe el equipo, pero igual se escapa.

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/([\w.+-]+@[\w-]+\.[\w.]+)/g, '<a href="mailto:$1">$1</a>');

export function legalMdToHtml(md: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) continue;
    if (l.startsWith('#### ')) { out.push(`<h3>${inline(l.slice(5))}</h3>`); continue; }
    if (l.startsWith('### ')) { out.push(`<h2>${inline(l.slice(4))}</h2>`); continue; }
    if (l.startsWith('|')) {
      const filas: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const celdas = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!celdas.every((c) => /^:?-{2,}:?$/.test(c))) filas.push(celdas);
        i++;
      }
      i--;
      const [head, ...body] = filas;
      out.push(
        '<div class="overflow-x-auto"><table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>',
      );
      continue;
    }
    out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('\n');
}
