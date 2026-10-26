-- 248 · Pedido automático de precalificación Infonavit (broker) — decisión de Raúl 21-oct-2026
-- Cuando una consulta imss_historial o calculo_base (no de aliado) pasa a completada y la persona:
-- tiene NSS, cotiza (status_empleo validado = empleado), semilla con fecha_sisec ≤ 30 días,
-- su periodo abierto del historial empezó hace ≥ 90 días, y no tuvo consulta broker en 60 días,
-- se pide broker_infonavit como 'sistema'. Interruptor y tope en trol3.config
-- (21-oct: tope subido a 100000 = sin tope, por indicación de Raúl).
do $mig$ begin
execute $q$ insert into trol3.config (clave, valor) values ('broker_infonavit_auto', 'on'), ('broker_infonavit_auto_max_dia', '40') on conflict (clave) do nothing $q$;

execute $q$
create or replace function trol3.broker_infonavit_auto(p_persona uuid, p_origen text default null)
 returns jsonb language plpgsql security definer set search_path to 'trol3','public' as $function$
declare v_nss text; v_st text; v_fs date; v_ini date; n_hoy int; tope int; r jsonb;
begin
  if coalesce((select valor from trol3.config where clave='broker_infonavit_auto'),'off') <> 'on' then
    return jsonb_build_object('ok', false, 'motivo', 'apagado'); end if;
  select coalesce(nullif(trim(p.nss),''), nullif(trim(cl.nss),'')) into v_nss
    from trol3.personas p left join public.clientes cl on cl.id = p.legacy_cliente_id where p.id = p_persona and p.merged_into is null;
  if v_nss is null or v_nss !~ '^\d{11}$' then return jsonb_build_object('ok', false, 'motivo', 'sin_nss'); end if;
  select valor#>>'{}' into v_st from trol3.v_mejor_dato where persona_id = p_persona and campo = 'status_empleo' and capa = 'validado';
  if coalesce(v_st,'') <> 'empleado' then return jsonb_build_object('ok', false, 'motivo', 'no_cotiza'); end if;
  select trol3.to_date_safe(d.valor->'meta'->>'fecha_sisec'),
         (select min(trol3.to_date_safe(h->>'fecha_inicio')) from jsonb_array_elements(case when jsonb_typeof(d.valor->'historial')='array' then d.valor->'historial' else '[]'::jsonb end) h
           where coalesce(h->>'fecha_fin','') = '')
    into v_fs, v_ini from trol3.v_mejor_dato d where d.persona_id = p_persona and d.campo = 'semilla';
  if v_fs is null or v_fs < current_date - 30 then return jsonb_build_object('ok', false, 'motivo', 'sisec_viejo'); end if;
  if v_ini is null or v_ini > current_date - 90 then return jsonb_build_object('ok', false, 'motivo', 'menos_de_3_meses', 'inicio', v_ini); end if;
  if exists (select 1 from trol3.consultas c where c.persona_id = p_persona and c.proveedor = 'broker_infonavit' and c.created_at > now() - interval '60 days') then
    return jsonb_build_object('ok', false, 'motivo', 'ya_consultado'); end if;
  tope := coalesce((select valor::int from trol3.config where clave='broker_infonavit_auto_max_dia'), 40);
  select count(*) into n_hoy from trol3.consultas c where c.proveedor = 'broker_infonavit' and c.motivo like 'auto:%'
     and c.created_at >= (date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City');
  if n_hoy >= tope then return jsonb_build_object('ok', false, 'motivo', 'tope_diario', 'tope', tope); end if;
  r := trol3.pedir_consulta(p_persona, 'infonavit', 'sistema', null, 'trol', false,
         'auto: cotiza desde ' || v_ini::text || coalesce(' (' || p_origen || ')', ''), false, 'broker_infonavit');
  return r;
end $function$ $q$;

execute $q$ revoke all on function trol3.broker_infonavit_auto(uuid, text) from public $q$;
execute $q$ grant execute on function trol3.broker_infonavit_auto(uuid, text) to service_role $q$;

execute $q$
create or replace function trol3.tg_broker_infonavit_auto()
 returns trigger language plpgsql security definer set search_path to 'trol3','public' as $function$
begin
  if new.estado = 'completada' and old.estado is distinct from 'completada'
     and new.tipo in ('imss_historial','calculo_base')
     and coalesce(new.solicitante_tipo::text,'') <> 'aliado' then
    begin
      perform trol3.broker_infonavit_auto(new.persona_id, new.tipo);
    exception when others then null;
    end;
  end if;
  return null;
end $function$ $q$;

if not exists (select 1 from pg_trigger where tgname = 'broker_infonavit_auto' and tgrelid = 'trol3.consultas'::regclass) then
  execute $q$ create trigger broker_infonavit_auto after update of estado on trol3.consultas for each row execute function trol3.tg_broker_infonavit_auto() $q$;
end if;
end $mig$;
