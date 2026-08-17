import ExcelJS from 'exceljs';
import { t3, requireMiembro, type Any } from '@/lib/trol3/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requireMiembro();
  const { data: a } = await t3().from('viraal_autorizaciones').select('*').eq('id', Number(params.id)).maybeSingle();
  if (!a) return new Response('No encontrado', { status: 404 });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Trol · Mesa Viraal';

  const s1 = wb.addWorksheet('Autorización');
  s1.columns = [{ header: 'Concepto', key: 'k', width: 34 }, { header: 'Valor', key: 'v', width: 26 }];
  s1.getRow(1).font = { bold: true };
  const money = (n: Any) => (n == null || n === '' ? '' : Number(n));
  const rows: [string, Any][] = [
    ['Fecha', new Date(a.created_at).toLocaleString('es-MX')],
    ['Banda', a.banda], ['Nivel', a.nivel], ['Escenario que rige', a.escenario],
    ['Margen total de Viraal', money(a.margen)],
    ['Margen sobre costo', a.margen_costo != null ? Number(a.margen_costo) : ''],
    ['Margen sobre crédito', a.margen_credito != null ? Number(a.margen_credito) : ''],
    ['Total a pagar del proyecto', money(a.precio)],
    ['Costo total', money(a.costo)],
    ['Ingreso total', money(a.ingreso)],
    ['Nota', a.nota ?? ''],
  ];
  rows.forEach(([k, v]) => s1.addRow({ k, v }));
  s1.getColumn('v').eachCell((c, r) => { if (r > 1 && typeof c.value === 'number' && r <= 10) c.numFmt = r <= 4 ? '#,##0' : (r === 6 || r === 7 ? '0.0%' : '#,##0'); });

  const s2 = wb.addWorksheet('Inputs');
  s2.columns = [{ header: 'Campo', key: 'k', width: 30 }, { header: 'Valor', key: 'v', width: 20 }];
  s2.getRow(1).font = { bold: true };
  Object.entries((a.inputs ?? {}) as Record<string, Any>).forEach(([k, v]) => s2.addRow({ k, v: typeof v === 'object' ? JSON.stringify(v) : v }));

  const s3 = wb.addWorksheet('Resultado');
  s3.columns = [{ header: 'Campo', key: 'k', width: 30 }, { header: 'Valor', key: 'v', width: 24 }];
  s3.getRow(1).font = { bold: true };
  Object.entries((a.resultado ?? {}) as Record<string, Any>).forEach(([k, v]) => s3.addRow({ k, v: typeof v === 'object' ? JSON.stringify(v) : v }));

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="viraal-autorizacion-${a.id}.xlsx"`,
    },
  });
}
