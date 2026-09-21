// Markdown ligero de las fichas: listas numeradas y con guion, **negritas**, *cursivas* y `código`.
// Sin dependencias ni hooks (sirve en servidor y en cliente). No interpreta HTML: todo es texto.
import type { ReactNode } from 'react';

function enLinea(t: string, base: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g; let i = 0; let m: RegExpExecArray | null; let n = 0;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push(t.slice(i, m.index));
    const x = m[0]; const k = `${base}-${n++}`;
    if (x.startsWith('**')) out.push(<b key={k}>{x.slice(2, -2)}</b>);
    else if (x.startsWith('`')) out.push(<code key={k} className="rounded bg-cream px-1 font-mono text-[0.9em]">{x.slice(1, -1)}</code>);
    else out.push(<i key={k}>{x.slice(1, -1)}</i>);
    i = m.index + x.length;
  }
  if (i < t.length) out.push(t.slice(i));
  return out;
}

export function FichaTexto({ texto, className = '' }: { texto: string | null | undefined; className?: string }) {
  if (!texto?.trim()) return null;
  const bloques: { tipo: 'ol' | 'ul' | 'p'; items: string[] }[] = [];
  for (const l of texto.split('\n').map((x) => x.trim()).filter(Boolean)) {
    const ol = /^\d+\.\s+(.*)$/.exec(l); const ul = /^[-•]\s+(.*)$/.exec(l);
    const tipo = ol ? 'ol' : ul ? 'ul' : 'p'; const v = ol?.[1] ?? ul?.[1] ?? l;
    const u = bloques[bloques.length - 1];
    if (u && u.tipo === tipo && tipo !== 'p') u.items.push(v); else bloques.push({ tipo, items: [v] });
  }
  return (
    <div className={`space-y-2 leading-relaxed ${className}`}>
      {bloques.map((b, i) => b.tipo === 'ol' ? <ol key={i} className="list-decimal space-y-1.5 pl-5">{b.items.map((x, j) => <li key={j}>{enLinea(x, `${i}-${j}`)}</li>)}</ol>
        : b.tipo === 'ul' ? <ul key={i} className="list-disc space-y-1.5 pl-5">{b.items.map((x, j) => <li key={j}>{enLinea(x, `${i}-${j}`)}</li>)}</ul>
        : <p key={i}>{enLinea(b.items[0], `${i}`)}</p>)}
    </div>
  );
}
