/**
 * El mismo material en PNG vertical (1080×1350) para mandar por WhatsApp.
 * Espejo del PDF: co-branding, la promesa, los tres niveles, la liga y el QR.
 *
 * OJO satori: divs con más de un hijo llevan display flex; sin 'space-evenly';
 * guion ASCII (el subset de Inter no trae U+2212).
 */
import { ImageResponse } from 'next/og';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';
import { materialDelAliado, archivoBase } from '@/lib/aliado/material';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DARK = '#26282B', LIME = '#D1F069', MUTED = '#A9ADB3', LIGHT = '#D9DBDE', RULE = '#3A3E44';
const W = 1080, H = 1350;

const NIVELES = [
  ['Poner en orden', 'Semanas, ley, derechos, AFORE e Infonavit en un solo expediente.'],
  ['Aprovechar las oportunidades de hoy', 'Retroactivo, Modalidad 40, derechos vencidos, Infonavit, crédito de pensión.'],
  ['Maximizar tu futuro', 'Escenarios con tus números reales y un plan con pasos y fechas.'],
];

export async function GET() {
  const m = await materialDelAliado();
  if (!m) return new Response('Todavía no tienes liga', { status: 404 });

  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: DARK, padding: '84px 84px 76px 84px', fontFamily: 'Inter', color: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <img src={LOGO_TROL_BLANCO} width={150 * LOGO_TROL_RATIO} height={150} style={{ width: 150 * LOGO_TROL_RATIO, height: 150 }} />
          <div style={{ display: 'flex', width: 2, height: 118, backgroundColor: LIME, opacity: 0.7, margin: '0 34px' }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 17, letterSpacing: 2.4, color: MUTED }}>EN ALIANZA CON</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff', marginTop: 4 }}>{m.empresa || m.nombre}</div>
            {m.empresa ? <div style={{ fontSize: 20, color: MUTED, marginTop: 2 }}>{m.nombre}</div> : null}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 60, lineHeight: 1.1, color: '#fff' }}>
            <div>Tu pensión del IMSS,</div>
            <div style={{ color: LIME, fontWeight: 700 }}>en orden y trabajando para ti.</div>
          </div>
          <div style={{ fontSize: 25, lineHeight: 1.5, color: LIGHT, marginTop: 22, maxWidth: 860 }}>
            Revisamos tu historial oficial del IMSS y te decimos dónde estás, qué te corresponde hoy y cómo llegar mejor al retiro.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {NIVELES.map(([t, p], i) => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', marginTop: i ? 22 : 0 }}>
              <div style={{ display: 'flex', width: 68, height: 68, borderRadius: 14, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: DARK, flexShrink: 0 }}>{`0${i + 1}`}</div>
              <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 26 }}>
                <div style={{ fontSize: 30, fontWeight: 700, color: '#fff' }}>{t}</div>
                <div style={{ fontSize: 20, color: MUTED, marginTop: 2 }}>{p}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${RULE}`, paddingTop: 44 }}>
          <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 620 }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#fff' }}>Diagnóstico inicial sin costo.</div>
            <div style={{ fontSize: 20, lineHeight: 1.45, color: LIGHT, marginTop: 10 }}>Escanea o abre la liga y escríbenos por WhatsApp con tu CURP.</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: LIME, marginTop: 14 }}>{m.linkCorto}</div>
          </div>
          <div style={{ display: 'flex', backgroundColor: '#fff', borderRadius: 16, padding: 12 }}>
            <img src={m.qr} width={200} height={200} style={{ width: 200, height: 200 }} />
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen() },
  );
  const buf = Buffer.from(await img.arrayBuffer());
  return new Response(buf, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${archivoBase(m.codigo)}-whatsapp.png"`,
      'Cache-Control': 'no-store',
    },
  });
}
