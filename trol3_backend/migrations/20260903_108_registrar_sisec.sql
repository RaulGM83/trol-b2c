-- 108 — registrar el SISEC generado por un proveedor (Jordan/Belvo) en trol3.documentos
--
-- Hasta hoy el PDF del SISEC que baja el Waterfall PDF Jordan subía a la carpeta
-- compartida "Sisec clientes" de Drive y ahí se quedaba: NUNCA se registró un
-- documento tipo 'sisec' en trol3 (cero en toda la historia), así que ni /trabajo
-- ni /mi sabían que existía. El diagnóstico y el checkup sí se registran (los
-- escribe el workflow de Cálculos); el SISEC era el único que no.
--
-- Esta RPC la llama n8n (nodo "Registrar SISEC en trol3", después de "Upload
-- file") con la URL de Drive. Resuelve la persona desde la consulta de trol3 que
-- originó el trámite; si no viene, por CURP. Es idempotente por consulta: volver
-- a correr el mismo webhook actualiza la URL en vez de duplicar la fila.
--
-- Decisión de Raúl (3-sep-2026): "no me importa dónde se guarde, pero sí que esté
-- disponible en web 3.0 en documentos". Se guarda como url_externa (Drive), que
-- es lo que ya hacen diagnóstico y checkup; /mi/doc/[id] y /trabajo/doc/[id]
-- redirigen a url_externa cuando no hay storage_path. El gating sale del
-- catálogo (tipo 'sisec' = pago, docs_premium), así que el asesor lo ve libre y
-- el cliente lo ve como documento por desbloquear, igual que estaba diseñado.

create or replace function trol3.registrar_sisec(
  p_consulta uuid,
  p_url text,
  p_curp text default null,
  p_nombre text default null
) returns uuid
language plpgsql security definer set search_path to 'trol3', 'public'
as $$
declare
  v_persona uuid;
  v_doc uuid;
  c record;
begin
  if p_url is null or length(trim(p_url)) = 0 then
    raise exception 'url_requerida';
  end if;

  if p_consulta is not null then
    select persona_id into v_persona from trol3.consultas where id = p_consulta;
  end if;
  if v_persona is null and p_curp is not null then
    select id into v_persona from trol3.personas where curp = upper(trim(p_curp)) limit 1;
  end if;
  if v_persona is null then
    raise exception 'persona_no_resuelta: consulta=% curp=%', p_consulta, p_curp;
  end if;

  select * into c from trol3.catalogo_documentos where tipo = 'sisec';

  -- Idempotente por consulta: el mismo webhook dos veces no duplica.
  if p_consulta is not null then
    select id into v_doc from trol3.documentos
    where consulta_id = p_consulta and tipo = 'sisec' limit 1;
  end if;

  if v_doc is not null then
    update trol3.documentos
       set url_externa = p_url,
           nombre = coalesce(p_nombre, nombre)
     where id = v_doc;
    return v_doc;
  end if;

  insert into trol3.documentos
    (persona_id, tipo, nombre, url_externa, origen_tipo, consulta_id,
     gating, precio_mxn, max_pct_puntos, visibilidad)
  values
    (v_persona, 'sisec', coalesce(p_nombre, c.nombre, 'Reporte oficial de semanas cotizadas (SISEC)'),
     p_url, 'sistema', p_consulta,
     coalesce(c.gating, 'gratis'), c.precio_mxn, coalesce(c.max_pct_puntos, 100),
     '{trol,cliente}'::text[])
  returning id into v_doc;

  perform trol3.emitir_evento(v_persona, 'documento_subido', 'sistema', null,
    jsonb_build_object('documento_id', v_doc, 'tipo', 'sisec', 'consulta_id', p_consulta, 'parseable', false));

  return v_doc;
end $$;

revoke all on function trol3.registrar_sisec(uuid, text, text, text) from public, anon;
grant execute on function trol3.registrar_sisec(uuid, text, text, text) to service_role;

comment on function trol3.registrar_sisec is
  'Registra en documentos el SISEC generado por un proveedor (URL de Drive). Idempotente por consulta. La llama n8n (Waterfall PDF Jordan).';
