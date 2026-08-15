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
//   /eventos/pendientes GET ?limit=  (para N8N: eventos no procesados) ; POST /eventos/ack {ids:[...]}
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
let API_KEY = Deno.env.get("TROL_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "trol3" }, auth: { persistSession: false } });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
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
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    switch (path) {
      case "/alta": {
        const { data, error } = await db.rpc("alta_por_telefono", { p_tel: b.telefono, p_canal: b.canal ?? "organico", p_actor: b.actor ?? "bot", p_nombre: b.nombre ?? null, p_campania: b.campania ?? null, p_verificacion: b.verificacion ?? "wa" });
        if (error) throw error;
        return json(data);
      }
      case "/declarar": {
        const pid = await personaId(b);
        const { data, error } = await db.rpc("declarar", { p_persona: pid, p_campo: b.campo, p_valor: b.valor, p_actor: b.actor ?? "bot", p_actor_id: b.actor_id ?? null, p_capa: "declarado" });
        if (error) return json({ ok: false, error: error.message, hint: (error as { hint?: string }).hint }, 400);
        return json({ ok: true, dato_id: data, persona_id: pid });
      }
      case "/declarar-varios": {
        const pid = await personaId(b);
        const datos = (b.datos ?? {}) as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [campo, valor] of Object.entries(datos)) {
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
        const { data, error } = await db.rpc("resultado_consulta", { p_consulta: b.consulta_id, p_estado: b.estado ?? "completada", p_datos: b.datos ?? {}, p_documentos: b.documentos ?? [], p_resultado: b.resultado ?? null, p_error: b.error ?? null, p_fecha_dato: b.fecha_dato ?? null });
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
