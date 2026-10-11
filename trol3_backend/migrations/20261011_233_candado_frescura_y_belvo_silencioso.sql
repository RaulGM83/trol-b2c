-- 233 · Candado de frescura en el puente + Belvo silencioso de verdad (11-oct-2026)
--
-- 1) sync_desde_cliente: una semilla cuya fecha SISEC es MÁS VIEJA que la última validada
--    que ya tenemos no escribe datos (ni validados ni calculados) y emite
--    `semilla_vieja_ignorada`. La consulta trol3 sí se cierra como completada con
--    resultado.ignorada = 'vieja' (para medir frescura de Belvo sin pisar Jordan).
--    Con esto el orden Belvo/Jordan deja de importar: gana el reporte más reciente.
--
-- 2) tg_consulta_despachar (Belvo): n8n decide "modo silencioso" por
--    tipo_servicio = 'Refresh Belvo' (Identidad Belvo v2 → Waterfall PDF Belvo → Calculos
--    mass_refresh), que sale de `interes_reciente` del payload. Hasta hoy mandábamos
--    c."Interes_reciente", así que pedir_consulta(notificar=false) por Belvo NO era silencioso
--    salvo que alguien pusiera 'Refresh Belvo' a mano en public.clientes (lote 1-sep).
--    Ahora: notificar_cliente=false → interes_reciente='Refresh Belvo' y notify_client=false
--    (If4 de Identidad Belvo v2 deja de mandar a Jordan por su cuenta en modo silencioso).
--
-- Se aplica parchando las funciones vivas con replace() (sin DML de nivel superior).

do $mig$
declare src text; n int;
begin
  -- ---------- 1) sync_desde_cliente ----------
  select pg_get_functiondef('trol3.sync_desde_cliente(uuid)'::regprocedure) into src;

  if position($a$v_hueca boolean := false;$a$ in src) = 0 then raise exception '233: ancla 1a no encontrada'; end if;
  src := replace(src, $a$v_hueca boolean := false;$a$,
                      $b$v_hueca boolean := false; v_vieja boolean := false; v_fs_actual timestamptz;$b$);

  if position($a$  if v_hueca then
    null;$a$ in src) = 0 then raise exception '233: ancla 1b no encontrada'; end if;
  src := replace(src, $a$  if v_hueca then
    null;$a$,
$b$  -- 233: semilla más vieja que la última SISEC validada que ya tenemos (Belvo caché) no pisa nada.
  if not v_hueca and cp is not null then
    select max(d.obtenido_en) into v_fs_actual from trol3.datos d
     where d.persona_id = pid and d.campo = 'semanas_cotizadas' and d.capa = 'validado' and d.proveedor = 'sisec';
    if v_fs_actual is not null and fs < v_fs_actual then
      v_vieja := true;
      perform trol3.emitir_evento(pid, 'semilla_vieja_ignorada', 'sistema', null,
        jsonb_build_object('cliente_id', c.id, 'fecha_sisec_semilla', fs, 'fecha_sisec_actual', v_fs_actual,
                           'version_sistema', cp->'meta'->>'version_sistema', 'calculo_pensional_at', at));
    end if;
  end if;
  if v_hueca or v_vieja then
    null;$b$);

  if position($a$jsonb_build_object('via','puente_public','fecha_sisec',fs)$a$ in src) = 0 then raise exception '233: ancla 1c no encontrada'; end if;
  src := replace(src, $a$jsonb_build_object('via','puente_public','fecha_sisec',fs)$a$,
                      $b$jsonb_build_object('via','puente_public','fecha_sisec',fs,'ignorada', case when v_hueca then 'hueca' when v_vieja then 'vieja' end)$b$);

  execute src;

  -- ---------- 2) tg_consulta_despachar ----------
  select pg_get_functiondef('trol3.tg_consulta_despachar()'::regprocedure) into src;

  if position($a$'interes_reciente', c."Interes_reciente",$a$ in src) = 0 then raise exception '233: ancla 2a no encontrada'; end if;
  src := replace(src, $a$'interes_reciente', c."Interes_reciente",$a$,
                      $b$'interes_reciente', case when coalesce(new.notificar_cliente, false) then c."Interes_reciente" else 'Refresh Belvo' end, 'notify_client', coalesce(new.notificar_cliente, false),$b$);

  execute src;

  raise notice '233 aplicada';
end $mig$;
