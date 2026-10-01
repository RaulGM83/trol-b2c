-- 207 · Candado contra semillas huecas en el puente public → trol3 (1-oct-2026).
--
-- Caso Jorge Antonio Miramontes (MILJ690723HDFRRR09): tenía Jordan del 24-sep (Ley 73,
-- 1,474 semanas). El 30-sep se subió una constancia de semanas; el Waterfall PDF SISEC de
-- n8n no leyó nada (nombre «Usuario», NSS «N/A», fecha SISEC vacía) pero marcó «Consulta
-- exitosa», corrió el motor con 0 semanas (Ley 97, Negativa) y lo escribió en
-- public.clientes. sync_desde_cliente lo pasó a trol3 como validado/sisec y pisó lo bueno.
-- Mismo patrón (semilla con 0 semanas sobre persona con semanas > 0) en los recálculos
-- v5.6/v5.7 de Ana Cecilia, Beatriz y Ricardo.
--
-- Regla: una semilla con 0 semanas cotizadas NO pisa nada cuando (a) la persona ya tiene
-- semanas > 0, o (b) viene sin identidad SISEC (nombre «Usuario»/vacío o fecha vacía).
-- Se registra el evento `semilla_hueca_ignorada` y se sigue con el resto (contactos,
-- documentos, identidad). El arreglo de fondo (que n8n termine en error) es aparte.

do $$
declare def text; a text; b text;
begin
  def := pg_get_functiondef('trol3.sync_desde_cliente(uuid)'::regprocedure);

  -- 1. variable
  a := 'declare c record; pid uuid; cp jsonb; fs timestamptz; at timestamptz; n int := 0; t10 text;';
  if position(a in def) = 0 then raise exception '207: ancla declare no encontrada'; end if;
  def := replace(def, a, 'declare c record; pid uuid; cp jsonb; fs timestamptz; at timestamptz; n int := 0; t10 text; v_hueca boolean := false;');

  -- 2. detectar la semilla hueca antes de escribir
  a := '  if cp is not null and (cp->''meta''->>''version_semilla'') like ''2%'' then' || E'\n' ||
       '    perform trol3._dato_si_cambio(pid,''ley'', to_jsonb(cp->''perfil''->>''ley''),''validado'',''sisec'',fs);';
  if position(a in def) = 0 then raise exception '207: ancla rama semilla no encontrada'; end if;
  b := '  -- 207: semilla hueca (0 semanas sin identidad SISEC, o 0 semanas sobre quien ya tiene) no pisa nada.' || E'\n' ||
       '  if cp is not null and coalesce(trol3.to_num_safe(cp->''perfil''->''semanas''->>''cotizadas''), 0) = 0 and (' || E'\n' ||
       '       coalesce(cp->''meta''->>''nombre_sisec'','''') in ('''',''Usuario'') or coalesce(cp->''meta''->>''fecha_sisec'','''') = ''''' || E'\n' ||
       '       or exists (select 1 from trol3.v_mejor_dato m where m.persona_id = pid and m.campo = ''semanas_cotizadas'' and trol3.to_num_safe(m.valor#>>''{}'') > 0)) then' || E'\n' ||
       '    v_hueca := true;' || E'\n' ||
       '    perform trol3.emitir_evento(pid, ''semilla_hueca_ignorada'', ''sistema'', null,' || E'\n' ||
       '      jsonb_build_object(''cliente_id'', c.id, ''nombre_sisec'', cp->''meta''->>''nombre_sisec'', ''fecha_sisec'', cp->''meta''->>''fecha_sisec'',' || E'\n' ||
       '                         ''version_sistema'', cp->''meta''->>''version_sistema'', ''calculo_pensional_at'', at));' || E'\n' ||
       '  end if;' || E'\n' ||
       '  if v_hueca then' || E'\n' ||
       '    null;' || E'\n' ||
       '  elsif cp is not null and (cp->''meta''->>''version_semilla'') like ''2%'' then' || E'\n' ||
       '    perform trol3._dato_si_cambio(pid,''ley'', to_jsonb(cp->''perfil''->>''ley''),''validado'',''sisec'',fs);';
  def := replace(def, a, b);

  execute def;
end $$;

comment on function trol3.sync_desde_cliente(uuid) is
  'Puente public.clientes → trol3. 207: una semilla con 0 semanas (sin identidad SISEC, o sobre quien ya tiene semanas) no escribe datos; emite semilla_hueca_ignorada.';
