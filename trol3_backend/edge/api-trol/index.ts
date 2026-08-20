// Trol 3.0 — API para Tako (bot), N8N y aliados. Auth por header x-trol-key.
// Rutas (POST salvo indicado):
//   /alta            {telefono, canal?, nombre?, campania?, actor?}            -> {persona_id, nueva}
//   /expediente      GET ?telefono= | ?persona_id=                              -> resumen para bot
//   /declarar        {persona_id|telefono, campo, valor, actor?, actor_id?}     -> {dato_id}
//   /declarar-varios {persona_id|telefono, datos:{campo:valor}, actor?}         -> {ok, n}
//   /interaccion     {persona_id|telefono, canal, direccion, contenido, actor?, visible_cliente?, meta?}
//   /handoff         {persona_id|telefono, motivo?}
//   /consulta        {persona_id|telefono, tipo, actor?, actor_id?, pagador?, notificar?, motivo?, forzar?, proveedor?}
//   /consulta/resultado {consulta_id, estado, datos?, documentos?, resultado?, error?, fecha_dato?}
//                       documentos: [{tipo, nombre, base64?|storage_path?|url?, gating?}] — el base64 se sube a la bóveda
//   /eventos/pendientes GET ?limit=  (para N8N: eventos no procesados) ; POST /eventos/ack {ids:[...]}
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
let API_KEY = Deno.env.get("TROL_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "trol3" }, auth: { persistSession: false } });

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-trol-key", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

const AFORES = ["Azteca", "Banorte", "Citibanamex", "Coppel", "Inbursa", "Invercap", "PensionISSSTE", "Principal", "Profuturo", "SURA"];
function normalizaAfore(v: string): string {
  const k = v.toLowerCase().replace(/[^a-z]/g, "");
  const hit = AFORES.find((a) => a.toLowerCase().replace(/[^a-z]/g, "") === k) ?? AFORES.find((a) => k.includes(a.toLowerCase().replace(/[^a-z]/g, "")));
  if (hit) return hit;
  if (k.includes("banamex") || k.includes("citi")) return "Citibanamex";
  if (k.includes("issste")) return "PensionISSSTE";
  return v;
}

function curpNormalizada(v: string): string { return v.toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function curpValida(v: string): boolean { return /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$/.test(v); }

async function personaId(b: Record<string, unknown>): Promise<string> {
  if (b.persona_id) return String(b.persona_id);
  if (b.telefono) {
    const { data, error } = await db.rpc("persona_por_telefono", { p_tel: String(b.telefono) });
    if (error) throw error;
    if (data) return data as string;
    // alta implícita si viene teléfono desconocido
    const { data: alta, error: e2 } = await db.rpc("alta_por_telefono", { p_tel: String(b.telefono), p_canal: b.canal ?? "organico", p_actor: b.actor ?? "bot", p_nombre: b.nombre ?? null, p_campania: b.campania ?? null, p_verificacion: "wa" });
    if (e2) throw e2;
    return (alta as { persona_id: string }).persona_id;
  }
  throw new Error("falta persona_id o telefono");
}

type DocEntrada = { tipo?: string; nombre?: string; base64?: string; contenido?: string; storage_path?: string; url?: string; gating?: string; precio_mxn?: unknown };

/**
 * Sube a la bóveda privada (bucket `expediente`) los documentos que lleguen como base64
 * y los deja listos para trol3.resultado_consulta con su storage_path.
 * Los que ya traen storage_path o url pasan sin cambios; si la subida falla se conserva la entrada
 * sin archivo para no perder el resto del resultado.
 */
async function subirDocumentosBase64(consultaId: string, docs: DocEntrada[]): Promise<DocEntrada[]> {
  if (!Array.isArray(docs) || !docs.length) return [];
  const conBase64 = docs.some((d) => d?.base64 || d?.contenido);
  if (!conBase64) return docs;
  const { data: c } = await db.from("consultas").select("persona_id").eq("id", consultaId).maybeSingle();
  const pid = (c as { persona_id?: string } | null)?.persona_id;
  if (!pid) return docs.map(({ base64: _b, contenido: _c, ...resto }) => resto);
  const out: DocEntrada[] = [];
  for (const d of docs) {
    const raw = d?.base64 ?? d?.contenido;
    if (!raw || d?.storage_path) { const { base64: _b, contenido: _c, ...resto } = d ?? {}; out.push(resto); continue; }
    try {
      const limpio = String(raw).replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
      const bin = Uint8Array.from(atob(limpio), (ch) => ch.charCodeAt(0));
      const tipo = d.tipo ?? "otro";
      const nombreArchivo = (d.nombre ?? tipo).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60);
      const path = `${pid}/${tipo}/${Date.now()}-${nombreArchivo}.pdf`;
      const up = await db.storage.from("expediente").upload(path, bin, { contentType: "application/pdf", upsert: false });
      const { base64: _b, contenido: _c, ...resto } = d;
      out.push(up.error ? resto : { ...resto, storage_path: path });
    } catch {
      const { base64: _b, contenido: _c, ...resto } = d ?? {};
      out.push(resto);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api-trol/, "") || "/";
  const key = req.headers.get("x-trol-key") ?? url.searchParams.get("key");
  if (!API_KEY) {
    const { data } = await db.from("config").select("valor").eq("clave", "api_key").maybeSingle();
    API_KEY = (data?.valor as string) ?? "";
  }
  if (!API_KEY || key !== API_KEY) return json({ error: "no autorizado" }, 401);

  try {
    if (req.method === "GET" && path === "/expediente") {
      const b: Record<string, unknown> = { persona_id: url.searchParams.get("persona_id") ?? undefined, telefono: url.searchParams.get("telefono") ?? undefined };
      if (!b.persona_id && b.telefono) {
        const { data } = await db.rpc("persona_por_telefono", { p_tel: String(b.telefono) });
        if (!data) return json({ existe: false });
        b.persona_id = data;
      }
      const { data, error } = await db.rpc("resumen_bot", { p_persona: b.persona_id });
      if (error) throw error;
      return json({ existe: true, ...(data as object) });
    }
    if (req.method === "GET" && path === "/eventos/pendientes") {
      const limit = Number(url.searchParams.get("limit") ?? 100);
      const { data, error } = await db.from("eventos").select("*").is("procesado_at", null).order("id").limit(limit);
      if (error) throw error;
      return json({ eventos: data });
    }
    if (req.method !== "POST") return json({ error: "método" }, 405);
    const bRaw = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    // Tako deja "{{param}}" literal cuando el modelo no llena un parámetro: se trata como ausente
    const b: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(bRaw)) b[k] = (typeof v === "string" && (/^\{\{.*\}\}$/.test(v.trim()) || v.trim() === "")) ? undefined : v;

    switch (path) {
      case "/alta": {
        const { data, error } = await db.rpc("alta_por_telefono", { p_tel: b.telefono, p_canal: b.canal ?? "organico", p_actor: b.actor ?? "bot", p_nombre: b.nombre ?? null, p_campania: b.campania ?? null, p_verificacion: b.verificacion ?? "wa" });
        if (error) throw error;
        if (b.apellidos && (data as { persona_id?: string })?.persona_id) {
          await db.from("personas").update({ apellidos: String(b.apellidos) }).eq("id", (data as { persona_id: string }).persona_id).is("apellidos", null);
        }
        return json(data);
      }
      case "/declarar": {
        const pid = await personaId(b);
        if (b.campo === "curp" && typeof b.valor === "string") {
          b.valor = curpNormalizada(b.valor as string);
          if (!curpValida(b.valor as string)) return json({ ok: false, error: "curp_formato_invalido", mensaje: "CURP no válida (18 caracteres, formato oficial). Pídela de nuevo." }, 400);
        }
        const { data, error } = await db.rpc("declarar", { p_persona: pid, p_campo: b.campo, p_valor: b.valor, p_actor: b.actor ?? "bot", p_actor_id: b.actor_id ?? null, p_capa: "declarado" });
        if (error) return json({ ok: false, error: error.message, hint: (error as { hint?: string }).hint }, 400);
        return json({ ok: true, dato_id: data, persona_id: pid });
      }
      case "/declarar-varios": {
        const pid = await personaId(b);
        // Acepta: {datos:{...}}, {datos:"json string"} o campos planos junto a telefono/actor (formato Tako)
        const RESERVADOS = new Set(["persona_id", "telefono", "actor", "actor_id", "canal", "nombre", "campania", "datos"]);
        let datos: Record<string, unknown> = {};
        if (typeof b.datos === "string") { try { datos = JSON.parse(b.datos as string); } catch { datos = {}; } }
        else if (b.datos && typeof b.datos === "object") datos = b.datos as Record<string, unknown>;
        for (const [k, v] of Object.entries(b)) if (!RESERVADOS.has(k) && !(k in datos)) datos[k] = v;
        const esVacio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && (v.trim() === "" || /^\{\{.*\}\}$/.test(v.trim()) || ["null", "undefined", "n/a", "na"].includes(v.trim().toLowerCase())));
        const out: Record<string, unknown> = {};
        const ALIAS: Record<string, string> = { credito_infonavit: "credito_infonavit_vigente", infonavit_usado: "credito_infonavit_vigente", afore: "afore_actual", semanas: "semanas_cotizadas" };
        for (const [campoRaw, valorRaw] of Object.entries(datos)) {
          if (esVacio(valorRaw)) continue;
          const campo = ALIAS[campoRaw] ?? campoRaw;
          let valor: unknown = valorRaw;
          if (typeof valor === "string") {
            const s = valor.trim();
            if (/^-?\d+(\.\d+)?$/.test(s)) valor = Number(s);
            else if (/^(true|false)$/i.test(s)) valor = s.toLowerCase() === "true";
            else valor = s;
          }
          if (campo === "curp" && typeof valor === "string") {
            valor = curpNormalizada(valor);
            if (!curpValida(valor as string)) { out["curp"] = { error: "formato_invalido", mensaje: "CURP no válida: deben ser 18 caracteres con el formato oficial. Pídela de nuevo." }; continue; }
          }
          if (campo === "afore_actual" && typeof valor === "string") valor = normalizaAfore(valor);
          if (campo === "status_empleo" && typeof valor === "string") valor = valor.toLowerCase();
          const { data, error } = await db.rpc("declarar", { p_persona: pid, p_campo: campo, p_valor: valor, p_actor: b.actor ?? "bot", p_actor_id: b.actor_id ?? null, p_capa: "declarado" });
          out[campo] = error ? { error: error.message } : { dato_id: data };
        }
        return json({ ok: true, persona_id: pid, resultados: out });
      }
      case "/interaccion": {
        const pid = await personaId(b);
        const { data, error } = await db.rpc("registrar_interaccion", { p_persona: pid, p_canal: b.canal ?? "wa", p_actor: b.actor ?? "bot", p_actor_id: b.actor_id ?? null, p_direccion: b.direccion ?? "entrante", p_contenido: b.contenido ?? "", p_visible_cliente: b.visible_cliente ?? false, p_meta: b.meta ?? {} });
        if (error) throw error;
        return json({ ok: true, interaccion_id: data, persona_id: pid });
      }
      case "/handoff": {
        const pid = await personaId(b);
        const { data, error } = await db.rpc("handoff", { p_persona: pid, p_motivo: b.motivo ?? null, p_actor: b.actor ?? "bot" });
        if (error) throw error;
        return json({ ok: true, evento_id: data, persona_id: pid });
      }
      case "/consulta": {
        const pid = await personaId(b);
        const { data, error } = await db.rpc("pedir_consulta", { p_persona: pid, p_tipo: b.tipo ?? "imss_historial", p_actor: b.actor ?? "sistema", p_actor_id: b.actor_id ?? null, p_pagador: b.pagador ?? null, p_notificar: b.notificar ?? false, p_motivo: b.motivo ?? null, p_forzar: b.forzar ?? false, p_proveedor: b.proveedor ?? null });
        if (error) throw error;
        return json({ persona_id: pid, ...(data as object) });
      }
      case "/consulta/resultado": {
        // Los documentos pueden venir como base64 (p.ej. el PDF del ISSSTE de Nubarium):
        // se suben a la bóveda privada y se guarda su storage_path, no la URL del proveedor.
        const docs = await subirDocumentosBase64(String(b.consulta_id ?? ""), (b.documentos ?? []) as DocEntrada[]);
        const { data, error } = await db.rpc("resultado_consulta", { p_consulta: b.consulta_id, p_estado: b.estado ?? "completada", p_datos: b.datos ?? {}, p_documentos: docs, p_resultado: b.resultado ?? null, p_error: b.error ?? null, p_fecha_dato: b.fecha_dato ?? null });
        if (error) throw error;
        return json(data);
      }
      case "/eventos/ack": {
        const ids = (b.ids ?? []) as number[];
        const { error } = await db.from("eventos").update({ procesado_at: new Date().toISOString() }).in("id", ids);
        if (error) throw error;
        return json({ ok: true, n: ids.length });
      }
      default:
        return json({ error: "ruta desconocida", path }, 404);
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
