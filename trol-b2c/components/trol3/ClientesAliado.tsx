'use client';
// 291 · "Tus clientes" (claude/116): UNA lista por persona, con pensión e Infonavit juntos.
// Cada fila resume dónde va cada quien y qué le toca al aliado; al abrirla, dos pestañas con el
// detalle que ya existía (PensionDetalle, InfonavitDetalle). Lo que requiere acción del aliado va
// primero; después, por actividad reciente. Con muchos clientes: buscador y filtros.
import { useMemo, useState } from 'react';
import { PensionDetalle, estadoPension, type FilaResultadoAliado, type ProductoAliado } from '@/components/trol3/ResultadoAliado';
import { InfonavitDetalle, RES_INFONAVIT, docsFaltantes, etapaIndice, etapaNombre, money, type FilaInfonavitAliado } from '@/components/trol3/InfonavitAliado';
import { AgregarCliente } from '@/components/trol3/AgregarCliente';

export interface ClienteAliado {
  persona_id: string;
  nombre: string;
  fecha: string; // última actividad conocida
  pension: FilaResultadoAliado | null;
  infonavit: FilaInfonavitAliado | null;
}

type Filtro = 'todos' | 'accion' | 'pension' | 'infonavit' | 'tramite';
const fecha = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—');

/** Qué le toca al aliado (prioridad 2), qué está en curso (1) o nada (0). */
function queSigue(c: ClienteAliado): { texto: string; prioridad: 0 | 1 | 2 } {
  const p = c.pension, i = c.infonavit;
  const tramite = i?.resultado === 'con_monto' || i?.resultado === 'en_tramite';
  if (i && tramite) {
    const idx = etapaIndice(i.etapa);
    const faltan = docsFaltantes(i.docs, !!i.conyugal);
    if (idx <= 1 && faltan > 0) return { texto: `Subir documentos (faltan ${faltan})`, prioridad: 2 };
  }
  if (i?.resultado === 'falta_nss') return { texto: 'Mandarnos su NSS', prioridad: 2 };
  if (p && (p.estado === 'fallida' || p.estado === 'falta_curp')) return { texto: 'Revisar su CURP', prioridad: 2 };
  if (p?.diagnostico_estado === 'listo') return { texto: 'Diagnóstico listo: compártelo', prioridad: 1 };
  if (p && (p.compras ?? []).length) return { texto: 'Trol está haciendo los cálculos', prioridad: 1 };
  if (p?.estado === 'listo') return { texto: 'Puedes pedir cálculos o asesoría', prioridad: 1 };
  if (i && tramite && i.etapa === 'entregado') return { texto: 'Inmueble entregado', prioridad: 0 };
  if (i && tramite && etapaIndice(i.etapa) >= 2) return { texto: 'Trol lleva el trámite', prioridad: 1 };
  if (p?.estado === 'consultando' || i?.resultado === 'procesando' || i?.resultado === 'buscando_nss') return { texto: 'Esperando al IMSS', prioridad: 0 };
  return { texto: '', prioridad: 0 };
}

function chipInfonavit(i: FilaInfonavitAliado | null): [string, string] | null {
  if (!i) return null;
  if (i.resultado === 'con_monto' || i.resultado === 'en_tramite') {
    const idx = etapaIndice(i.etapa);
    const etapa = idx >= 1 ? `${idx + 1}/7 ${etapaNombre(i.etapa)}` : '';
    const monto = i.monto_credito != null ? `hasta ${money(i.monto_credito)}` : '';
    const texto = [monto, etapa].filter(Boolean).join(' · ') || 'En trámite';
    return [`Infonavit: ${texto}`, i.etapa === 'entregado' ? 'bg-emerald-100 text-emerald-900' : idx >= 1 ? 'bg-ink text-white' : 'bg-emerald-100 text-emerald-900'];
  }
  const [label, cls] = RES_INFONAVIT[i.resultado] ?? [i.resultado, 'bg-cream text-ink'];
  return [`Infonavit: ${label}`, cls];
}

export function ClientesAliado({ clientes, productos, creditos, tieneWallet, aliado, comisionInfonavit, programaInfonavit }: {
  clientes: ClienteAliado[]; productos: ProductoAliado[]; creditos: number | null; tieneWallet: boolean;
  aliado: string; comisionInfonavit: number; programaInfonavit: boolean;
}) {
  const [q, setQ] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [abierto, setAbierto] = useState<string | null>(clientes.length === 1 ? clientes[0].persona_id : null);
  const [tab, setTab] = useState<Record<string, 'pension' | 'infonavit'>>({});

  const filas = useMemo(() => {
    const conMeta = clientes.map((c) => ({ c, sigue: queSigue(c) }));
    conMeta.sort((a, b) => b.sigue.prioridad - a.sigue.prioridad || (b.c.fecha > a.c.fecha ? 1 : b.c.fecha < a.c.fecha ? -1 : 0));
    const qq = q.trim().toLowerCase();
    return conMeta.filter(({ c, sigue }) => {
      if (qq && !c.nombre.toLowerCase().includes(qq)) return false;
      if (filtro === 'accion') return sigue.prioridad === 2;
      if (filtro === 'pension') return !!c.pension && (c.pension.estado === 'listo' || (c.pension.compras ?? []).length > 0);
      if (filtro === 'infonavit') return !!c.infonavit;
      if (filtro === 'tramite') return !!c.infonavit && (c.infonavit.resultado === 'con_monto' || c.infonavit.resultado === 'en_tramite') && etapaIndice(c.infonavit.etapa) >= 1 && etapaIndice(c.infonavit.etapa) < 6;
      return true;
    });
  }, [clientes, q, filtro]);

  const n = clientes.length;
  const precalificados = clientes.filter((c) => c.infonavit?.resultado === 'con_monto').length;
  const enTramite = clientes.filter((c) => !!c.infonavit && (c.infonavit.resultado === 'con_monto' || c.infonavit.resultado === 'en_tramite') && etapaIndice(c.infonavit.etapa) >= 1 && etapaIndice(c.infonavit.etapa) < 6).length;
  const asesorias = clientes.filter((c) => (c.pension?.compras ?? []).length > 0).length;
  const accion = clientes.filter((c) => queSigue(c).prioridad === 2).length;

  const FILTROS: [Filtro, string, number | null][] = [
    ['todos', 'Todos', n], ['accion', 'Te toca', accion], ['pension', 'Pensión', null],
    ...(programaInfonavit ? ([['infonavit', 'Infonavit', precalificados], ['tramite', 'En trámite', enTramite]] as [Filtro, string, number | null][]) : []),
  ];

  return (
    <section className="rounded-2xl border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">Tus clientes</h2>
          <p className="text-xs text-muted">
            {n} {n === 1 ? 'cliente' : 'clientes'}
            {programaInfonavit ? ` · ${precalificados} con Infonavit precalificado · ${enTramite} en trámite` : ''}
            {` · ${asesorias} con cálculos o asesoría pedidos`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {programaInfonavit ? <a href="/aliado/inventario" className="rounded-xl border border-ink px-3 py-2 text-sm font-bold text-ink hover:bg-cream">Inventario Infonavit</a> : null}
          <AgregarCliente aliado={aliado} programaInfonavit={programaInfonavit} abiertoInicial={n === 0} />
        </div>
      </div>

      {n > 0 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre" className="w-full rounded-lg border border-line px-3 py-1.5 text-xs sm:w-56" />
          <div className="flex flex-wrap gap-1">
            {FILTROS.map(([k, label, cnt]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${filtro === k ? 'bg-ink text-white' : 'bg-cream text-ink hover:bg-line'}`}>
                {label}{cnt != null ? ` ${cnt}` : ''}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {n === 0 ? (
        <p className="mt-4 text-sm text-muted">Todavía no llega nadie por tu liga. Agrega a alguien aquí o comparte tu liga; en cuanto escriba, aparece en esta lista.</p>
      ) : filas.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nadie con ese filtro.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {filas.map(({ c, sigue }) => {
            const open = abierto === c.persona_id;
            const chipP = c.pension ? estadoPension(c.pension) : null;
            const chipI = chipInfonavit(c.infonavit);
            const t = tab[c.persona_id] ?? (c.pension ? 'pension' : 'infonavit');
            return (
              <li key={c.persona_id}>
                <button onClick={() => setAbierto(open ? null : c.persona_id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-left hover:bg-cream/60">
                  <span className="min-w-[160px] flex-1">
                    <b className="text-sm">{c.nombre}</b>
                    <span className="ml-2 text-[11px] text-muted">{fecha(c.fecha)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {chipP ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipP[1]}`}>Pensión: {chipP[0]}</span> : null}
                    {chipI ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chipI[1]}`}>{chipI[0]}</span> : null}
                  </span>
                  <span className={`min-w-[150px] text-xs ${sigue.prioridad === 2 ? 'font-semibold text-amber-900' : 'text-muted'}`}>{sigue.prioridad === 2 ? '→ ' : ''}{sigue.texto}</span>
                  <span className="text-xs text-muted">{open ? '▴' : '▾'}</span>
                </button>

                {open ? (
                  <div className="mb-3 rounded-xl border border-line bg-cream/40 p-3">
                    {programaInfonavit ? (
                      <div className="mb-3 flex gap-1 border-b border-line">
                        {(['pension', 'infonavit'] as const).map((k) => (
                          <button key={k} onClick={() => setTab({ ...tab, [c.persona_id]: k })} className={`-mb-px border-b-2 px-3 py-1.5 text-xs font-semibold ${t === k ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'}`}>
                            {k === 'pension' ? 'Pensión' : 'Infonavit'}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {t === 'pension' || !programaInfonavit ? (
                      c.pension
                        ? <PensionDetalle r={c.pension} productos={productos} creditos={creditos} tieneWallet={tieneWallet} aliado={aliado} />
                        : <p className="text-xs text-muted">Esta persona llegó por Infonavit; su pensión la revisa Trol por dentro.</p>
                    ) : (
                      <InfonavitDetalle r={c.infonavit} comision={comisionInfonavit} />
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
