// Markdown → HTML para el contenido del sitio (trol3.contenidos).
// Sin dependencias. Todo el texto se escapa: el Markdown no puede meter HTML.
// Soporta: ## ### #### títulos, párrafos, **negritas**, *cursivas*, `código`,
// [enlaces](url), listas (- y 1.), citas (>), tablas con | y --- (separador).

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const urlSegura = (u: string) => /^(https?:\/\/|\/|#|mailto:)/i.test(u.trim());

function inline(crudo: string): string {
  return esc(crudo)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, t: string, u: string) => {
      const url = u.replace(/&amp;/g, '&');
      if (!urlSegura(url)) return t;
      const externo = /^https?:\/\//i.test(url) && !/^https?:\/\/([a-z0-9-]+\.)?trol\.mx/i.test(url);
      return `<a href="${esc(url)}"${externo ? ' target="_blank" rel="noopener"' : ''}>${t}</a>`;
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
}

const esTabla = (l: string) => l.trim().startsWith('|');
const esLista = (l: string) => /^\s*[-*]\s+/.test(l);
const esNumerada = (l: string) => /^\s*\d+[.)]\s+/.test(l);
const esCita = (l: string) => /^\s*>/.test(l);
const esTitulo = (l: string) => /^#{1,4}\s+/.test(l.trim());
const esSeparador = (l: string) => /^\s*(-{3,}|\*{3,})\s*$/.test(l);

export function mdToHtml(md: string): string {
  const lines = (md ?? '').replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }

    if (esSeparador(l)) { out.push('<hr />'); i++; continue; }

    if (esTitulo(l)) {
      const m = l.trim().match(/^(#{1,4})\s+(.*)$/)!;
      // El # (h1) es el título de la página: dentro del cuerpo baja a h2.
      const nivel = Math.min(4, Math.max(2, m[1].length));
      out.push(`<h${nivel}>${inline(m[2].replace(/\s+#+\s*$/, ''))}</h${nivel}>`);
      i++; continue;
    }

    if (esTabla(l)) {
      const filas: string[][] = [];
      while (i < lines.length && esTabla(lines[i])) {
        const celdas = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!celdas.every((c) => /^:?-{2,}:?$/.test(c))) filas.push(celdas);
        i++;
      }
      if (filas.length) {
        const [head, ...body] = filas;
        out.push(
          '<div class="overflow-x-auto"><table><thead><tr>' +
            head.map((c) => `<th>${inline(c)}</th>`).join('') +
            '</tr></thead><tbody>' +
            body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') +
            '</tbody></table></div>',
        );
      }
      continue;
    }

    if (esLista(l) || esNumerada(l)) {
      const numerada = esNumerada(l);
      const es = numerada ? esNumerada : esLista;
      const items: string[] = [];
      while (i < lines.length && (es(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (es(lines[i])) items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      const tag = numerada ? 'ol' : 'ul';
      out.push(`<${tag}>` + items.map((t) => `<li>${inline(t)}</li>`).join('') + `</${tag}>`);
      continue;
    }

    if (esCita(l)) {
      const partes: string[] = [];
      while (i < lines.length && esCita(lines[i])) { partes.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${mdToHtml(partes.join('\n'))}</blockquote>`);
      continue;
    }

    // Párrafo: líneas seguidas hasta una línea vacía u otro bloque.
    const p: string[] = [];
    while (i < lines.length && lines[i].trim() && !esTitulo(lines[i]) && !esTabla(lines[i]) && !esLista(lines[i]) && !esNumerada(lines[i]) && !esCita(lines[i]) && !esSeparador(lines[i])) {
      p.push(lines[i].trim()); i++;
    }
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}
