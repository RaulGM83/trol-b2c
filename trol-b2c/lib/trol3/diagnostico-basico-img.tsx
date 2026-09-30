/**
 * Dibujo del diagnóstico básico en PNG vertical (1080x1350) para mandar por WhatsApp (claude/91).
 * Los datos los arma `armarDiagnosticoBasico`; aquí sólo se dibuja.
 *
 * OJO satori (ver infonavit/resumen): divs con más de un hijo llevan display flex; el subset
 * de Inter no trae emoji, flechas ni guion largo — sólo ASCII, acentos y $. Las negritas de
 * `sub` (**así**) se parten palabra por palabra para que el renglón se acomode solo.
 */
import { ImageResponse } from 'next/og';
import { LOGO_TROL_BLANCO, LOGO_TROL_RATIO } from '@/lib/marca/logo';
import { fuentesResumen } from '@/lib/marca/fuente';
import type { DiagnosticoBasico } from '@/lib/trol3/diagnostico-basico';


const DARK = '#26282B', LIME = '#D1F069', GRAY = '#7B7F86', CREAM = '#F4F4F2', LINEA = '#E4E4E1', TXT = '#4A4D52';
const W = 1080, H = 1350;

/** "Ya ganaste **tu derecho**" → palabras con su peso, en un renglón que se acomoda. */
function Rica({ texto, size, color }: { texto: string; size: number; color: string }) {
  const palabras: { t: string; b: boolean }[] = [];
  texto.split('**').forEach((trozo, i) => trozo.split(/\s+/).filter(Boolean).forEach((t, j) => {
    // "**2025**." → el punto se pega a la palabra anterior, no queda suelto.
    const prev = palabras[palabras.length - 1];
    if (j === 0 && prev && /^[.,;:)]/.test(t) && !/^\s/.test(trozo)) {
      const m = t.match(/^[.,;:)]+/)![0];
      prev.t += m;
      if (t.length > m.length) palabras.push({ t: t.slice(m.length), b: i % 2 === 1 });
      return;
    }
    palabras.push({ t, b: i % 2 === 1 });
  }));
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', fontSize: size, color, lineHeight: 1.4 }}>
      {palabras.map((p, i) => (
        <span key={i} style={{ fontWeight: p.b ? 700 : 400, color: p.b ? DARK : color, marginRight: size * 0.28 }}>{p.t}</span>
      ))}
    </div>
  );
}

/** La imagen a partir de los datos ya armados (el arnés de pruebas la llama directo). */
export function imagenDiagnosticoBasico(d: DiagnosticoBasico) {
  const logoW = Math.round(56 * LOGO_TROL_RATIO);
  const h = d.hero;
  const tituloOps = d.opsTotal === 0 ? 'Lo que sigue' : d.opsTotal === 1 ? 'Encontramos una oportunidad para ti' : `Encontramos ${d.opsTotal} oportunidades para ti`;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: 'flex', flexDirection: 'column', backgroundColor: CREAM, fontFamily: 'Inter', color: DARK }}>
        {/* ---- banda oscura: quién ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: DARK, padding: '44px 72px 72px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_TROL_BLANCO} width={logoW} height={56} alt="" />
            <div style={{ fontSize: 26, color: '#B9BCC1' }}>{d.fecha}</div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: LIME, marginTop: 26 }}>{d.nombre ? `Hola, ${d.nombre}` : 'Hola'}</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: '#fff', lineHeight: 1.08, marginTop: 4 }}>Tu diagnóstico de pensión</div>
          <div style={{ display: 'flex', marginTop: 22 }}>
            {d.chips.map((c) => (
              <div key={c} style={{ display: 'flex', border: '2px solid #4A4D52', borderRadius: 999, padding: '8px 22px', fontSize: 24, fontWeight: 700, color: '#E7E8EA', marginRight: 12 }}>{c}</div>
            ))}
          </div>
        </div>

        {/* ---- el número ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: '-40px 56px 0', backgroundColor: '#fff', borderRadius: 32, padding: '30px 44px', boxShadow: '0 12px 40px rgba(38,40,43,0.10)' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: GRAY }}>{h.etiqueta}</div>
          {h.tipo === 'monto' ? (
            <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}>
              <div style={{ fontSize: 84, fontWeight: 700, letterSpacing: -2 }}>{h.monto}</div>
              <div style={{ fontSize: 34, color: GRAY, marginLeft: 16 }}>{h.sufijo}</div>
            </div>
          ) : (
            <div style={{ fontSize: h.tipo === 'rango' ? 72 : 60, fontWeight: 700, letterSpacing: -1.5, marginTop: 4 }}>{h.tipo === 'rango' ? h.monto : h.titulo}</div>
          )}
          {h.sub ? <div style={{ display: 'flex', marginTop: 12 }}><Rica texto={h.sub} size={26} color={TXT} /></div> : null}
        </div>

        {/* ---- una alerta, si la hay ---- */}
        {d.alerta ? (
          <div style={{ display: 'flex', alignItems: 'center', margin: '22px 56px 0', backgroundColor: LIME, borderRadius: 24, padding: '20px 30px' }}>
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, backgroundColor: DARK, marginRight: 18, flexShrink: 0 }} />
            <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.3 }}>{d.alerta}</div>
          </div>
        ) : null}

        {/* ---- oportunidades, sin montos ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', margin: '28px 72px 0', flexGrow: 1 }}>
          <div style={{ fontSize: 31, fontWeight: 700 }}>{tituloOps}</div>
          {d.ops.length ? (
            d.ops.map((o, i) => (
              <div key={o.titulo} style={{ display: 'flex', alignItems: 'flex-start', padding: '15px 0', borderBottom: i < d.ops.length - 1 ? `2px solid ${LINEA}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 22, backgroundColor: DARK, marginRight: 20, marginTop: 2, flexShrink: 0 }}>
                  <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, backgroundColor: LIME }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 29, fontWeight: 700, lineHeight: 1.2 }}>{o.titulo}</div>
                  {o.linea ? <div style={{ fontSize: 23, color: GRAY, marginTop: 4 }}>{o.linea}</div> : null}
                </div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 26, color: TXT, marginTop: 12, lineHeight: 1.4 }}>Hay decisiones sobre tu retiro que conviene tomar con tiempo. Revisémoslas juntos.</div>
          )}
          {d.opsTotal > 3 ? <div style={{ fontSize: 23, color: GRAY, marginTop: 8 }}>{`y ${d.opsTotal - 3} más en tu cuenta`}</div> : null}
        </div>

        {/* ---- cierre ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderTop: `2px solid ${LINEA}`, padding: '28px 72px 30px' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 32, fontWeight: 700 }}>
            <div>Agenda tu asesoría de</div>
            <div style={{ display: 'flex', backgroundColor: LIME, borderRadius: 10, padding: '2px 12px', marginLeft: 10 }}>20 minutos</div>
          </div>
          <div style={{ fontSize: 26, color: TXT, marginTop: 8 }}>
            {d.asesor ? `Te acompaña ${d.asesor}, de El Trol. La liga viene en el mensaje.` : 'Tu asesor de El Trol te acompaña. La liga viene en el mensaje.'}
          </div>
          <div style={{ fontSize: 18, color: '#9A9EA5', marginTop: 12, lineHeight: 1.35 }}>
            {`Estimación hecha con tu historial del IMSS${d.corte ? ` al ${d.corte}` : ''}. Los montos finales los determina el IMSS al momento de tu trámite.`}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fuentesResumen(), headers: { 'Cache-Control': 'private, no-store' } },
  );
}
