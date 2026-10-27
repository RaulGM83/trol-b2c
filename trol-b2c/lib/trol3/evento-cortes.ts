// 262 · Sin 'use client': lo usan la página (servidor) y EventoPanel (cliente).
// 262 · cortes por envío: cada correo del organizador abre un corte [su fecha, la del siguiente).
export type CorteEvento = { clave: string; nombre: string; desde?: string; hasta?: string };
export function cortesEvento(envios: { fecha: string; nombre: string }[] | undefined, hoy: string): CorteEvento[] {
  const lista: CorteEvento[] = [{ clave: 'todos', nombre: 'Todos' }, { clave: 'hoy', nombre: 'Hoy', desde: hoy }];
  const ord = [...(envios ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
  ord.forEach((e, i) => lista.push({ clave: e.fecha, nombre: e.nombre, desde: e.fecha, hasta: ord[i + 1]?.fecha }));
  return lista;
}
