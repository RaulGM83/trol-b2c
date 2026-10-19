// Runner de broker_infonavit — se pega/ejecuta en la pestaña https://www.asesores.broker/solicitudes
// (sesión del broker abierta). No guarda ni lee credenciales: usa los clics de la propia página.
//
// 1) instalar():   intercepta el blob que genera el botón "Descargar" (no descarga nada al disco).
// 2) entregar({consulta_id, folio, nss, datos, leyenda, completado_en}):
//      busca la fila por NSS, pulsa su botón de descarga, toma el PNG y lo manda junto con los
//      datos leídos al webhook n8n "Trol3 — Broker Infonavit → trol3 (resultado)".
//      El webhook valida que el folio corresponda a la consulta en trol3 antes de escribir.
//
// datos = { saldo_infonavit, infonavit_monto_credito, infonavit_capacidad_compra,
//           infonavit_ahorro_minimo, infonavit_pago_mensual, relacion_laboral_vigente (bool), rfc }
const WEBHOOK = 'https://eltrolfinanciero.app.n8n.cloud/webhook/broker-infonavit-resultado';

window.brokerInfonavit = {
  instalar() {
    if (window.__biInstalado) return 'ya';
    window.__biBlobs = [];
    const oc = URL.createObjectURL;
    URL.createObjectURL = function (b) { const u = oc.call(URL, b); if (b && b.type) window.__biBlobs.push({ u, blob: b, t: Date.now() }); return u; };
    const ocl = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.hasAttribute('download') && window.__biCapturando) return; return ocl.call(this); };
    window.__biInstalado = true;
    return 'ok';
  },
  async imagen(nss) {
    const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('Descargar Documento de respuesta de NSS ' + nss));
    if (!btn) throw new Error('No encontré la fila del NSS ' + nss);
    const desde = Date.now();
    window.__biCapturando = true;
    btn.click();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
      const hit = window.__biBlobs.find(x => x.t >= desde && /^image\//.test(x.blob.type));
      if (hit) { window.__biCapturando = false; return hit; }
    }
    window.__biCapturando = false;
    throw new Error('No llegó la imagen');
  },
  async entregar({ consulta_id, folio, nss, datos, leyenda, completado_en }) {
    const hit = await this.imagen(nss);
    const b64 = await new Promise((ok, ko) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.onerror = ko; fr.readAsDataURL(hit.blob); });
    const r = await fetch(WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ consulta_id, folio, datos, leyenda, completado_en, png_base64: b64 }) });
    return { status: r.status, body: (await r.text()).slice(0, 500) };
  },
  // Muestra la imagen del resultado encima de la página para leerla (no la guarda).
  async ver(nss) {
    const hit = await this.imagen(nss);
    document.getElementById('__biPrev')?.remove();
    const im = document.createElement('img'); im.id = '__biPrev'; im.src = hit.u;
    im.style = 'position:fixed;top:10px;left:10px;z-index:99999;max-width:95vw;max-height:95vh;background:#fff;border:3px solid #c00';
    im.onclick = () => im.remove();
    document.body.appendChild(im);
    return 'mostrando';
  },
};
