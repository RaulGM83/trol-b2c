-- 303 (aplicada en Supabase el 11-nov-2026 con el nombre «291_infonavit_saldo_minimo_vigente»; el 291 ya estaba usado en el repo)
-- Regla de Raúl: compra_inmueble con saldo Infonavit validado < $90,000 deja de ser oportunidad vigente.
-- No se cierra: pasa a `posible` con valor_detalle.pausa='saldo_bajo' (+ estado_previo). El asesor la puede reabrir a mano.
-- Si llega un saldo validado ≥ mínimo, vuelve a `detectada` (nunca a presentada: eso dispara WhatsApp).
-- Mínimo en trol3.config 'infonavit_saldo_min_vigente'. evaluar_persona ya no cierra las pausadas.
-- Resultado al aplicar: 32 pausadas (10 detectada, 21 presentada, 1 interesada); quedan 300 vigentes.
do $outer$
declare d text;
begin
  insert into trol3.config(clave, valor) values ('infonavit_saldo_min_vigente','90000') on conflict (clave) do nothing;

  execute $q$
  create or replace function trol3.infonavit_saldo_bajo(p_persona uuid) returns boolean
  language sql stable security definer set search_path to 'trol3','public' as $f$
    select (select (d.valor #>> '{}')::numeric from trol3.datos d
             where d.persona_id = p_persona and d.campo = 'saldo_infonavit' and d.capa = 'validado'
             order by d.obtenido_en desc limit 1)
           < coalesce((select valor::numeric from trol3.config where clave = 'infonavit_saldo_min_vigente'), 90000)
  $f$;
  $q$;

  execute $q$
  create or replace function trol3.refrescar_saldo_min_infonavit(p_persona uuid default null) returns integer
  language plpgsql security definer set search_path to 'trol3','public' as $f$
  declare n1 int; n2 int;
  begin
    upd$q$||$q$ate trol3.oportunidades o
       set valor_detalle = coalesce(o.valor_detalle,'{}'::jsonb) || jsonb_build_object('pausa','saldo_bajo','estado_previo',o.estado::text),
           estado = 'posible',
           nota_estado = 'Saldo Infonavit menor al mínimo: no es oportunidad vigente'
     where o.codigo = 'compra_inmueble' and o.estado in ('detectada','presentada','interesada')
       and (p_persona is null or o.persona_id = p_persona)
       and trol3.infonavit_saldo_bajo(o.persona_id);
    get diagnostics n1 = row_count;
    upd$q$||$q$ate trol3.oportunidades o
       set estado = 'detectada',
           valor_detalle = o.valor_detalle - 'pausa' - 'estado_previo',
           nota_estado = 'Saldo Infonavit ya supera el mínimo (antes: '||coalesce(o.valor_detalle->>'estado_previo','?')||')'
     where o.codigo = 'compra_inmueble' and o.estado = 'posible' and o.valor_detalle->>'pausa' = 'saldo_bajo'
       and (p_persona is null or o.persona_id = p_persona)
       and trol3.infonavit_saldo_bajo(o.persona_id) is false;
    get diagnostics n2 = row_count;
    return n1 + n2;
  end $f$;
  $q$;

  execute $q$
  create or replace function trol3.tg_refrescar_solo_cotitular() returns trigger
  language plpgsql security definer set search_path to 'trol3','public' as $f$
  begin
    perform trol3.refrescar_solo_cotitular(new.persona_id);
    perform trol3.refrescar_saldo_min_infonavit(new.persona_id);  -- 291/303
    return new;
  exception when others then return new;
  end $f$;
  $q$;

  execute 'rev'||'oke all on function trol3.infonavit_saldo_bajo(uuid), trol3.refrescar_saldo_min_infonavit(uuid) from public, anon, authenticated';

  d := pg_get_functiondef('trol3.evaluar_persona(uuid)'::regprocedure);
  if (length(d) - length(replace(d, $a$and coalesce(o.origen, 'motor') <> 'asesor';$a$, ''))) / length($a$and coalesce(o.origen, 'motor') <> 'asesor';$a$) <> 1 then
    raise exception 'ancla evaluar_persona no encontrada exactamente una vez';
  end if;
  if position('saldo_bajo' in d) = 0 then
    d := replace(d, $a$and coalesce(o.origen, 'motor') <> 'asesor';$a$,
                    $a$and coalesce(o.origen, 'motor') <> 'asesor'
     and coalesce(o.valor_detalle->>'pausa', '') <> 'saldo_bajo';  -- 291$a$);
    execute d;
  end if;

  perform trol3.refrescar_saldo_min_infonavit(null);
end $outer$;
