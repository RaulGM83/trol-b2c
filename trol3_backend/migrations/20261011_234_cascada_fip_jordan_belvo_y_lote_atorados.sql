-- 234 · Cascada del evento en los dos sentidos + «reintentar a los atorados» en lote (11-oct-2026)
--
-- Hasta hoy la cascada sólo iba Belvo → Jordan (190, config `evento_fallback_jordan`), pero el FIP
-- va `jordan_first` (222) y Jordan esta semana cerró 10 de 20 (timeouts de 10 min, 503). Un
-- registrado del FIP que caía en eso se quedaba en «seguimos buscando» hasta que alguien lo tocara.
--
-- 1) config `evento_fallback_belvo` = ["fip2026"]: Jordan `sin_resultado`/`error` → Belvo automático
--    (una vez por día por persona; forzar=true porque Belvo caché; el candado 233/233b decide si entra).
--    Hereda `notificar_cliente` de la consulta que falló, así el aviso «cuenta lista» sale igual.
-- 2) El trigger existente Belvo → Jordan se conserva; los candados de «ya se pidió en el último día»
--    en ambos sentidos cortan el ping-pong (Jordan ✗ → Belvo ✗ → alto).
-- 3) RPC `evento_reintentar_atorados(codigo, proveedor)` para el panel del evento: a todos los del
--    código sin historial cuya última consulta esté atorada les pide `proveedor` (belvo|jordan) de una
--    vez. Devuelve cuántos se pidieron y cuántos se saltaron (y por qué). Sólo miembros.

insert into trol3.config (clave, valor)
values ('evento_fallback_belvo', '["fip2026"]')
on conflict (clave) do nothing;

create or replace function trol3.tg_consulta_fallback_evento()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare cods text[]; cod text; ya boolean; destino text; avisar boolean;
begin
  if new.tipo <> 'imss_historial' then return null; end if;
  if new.estado not in ('sin_resultado', 'error') or old.estado is not distinct from new.estado then return null; end if;

  -- el código del evento es el de origen O el de un consentimiento (222: «ya era cliente», p. ej. Jorge López)
  select array_remove(array_agg(distinct x), null) into cods from (
    select p.codigo_origen as x from trol3.personas p where p.id = new.persona_id
    union all
    select ev.payload ->> 'codigo' from trol3.eventos ev where ev.persona_id = new.persona_id and ev.tipo = 'consentimiento') s;
  if coalesce(array_length(cods, 1), 0) = 0 then return null; end if;

  if coalesce(new.proveedor, '') = 'belvo' then
    select c into cod from unnest(cods) c
     where exists (select 1 from trol3.config cf where cf.clave = 'evento_fallback_jordan' and (cf.valor::jsonb) ? c) limit 1;
    destino := 'jordan';
  elsif coalesce(new.proveedor, '') = 'jordan' then
    select c into cod from unnest(cods) c
     where exists (select 1 from trol3.config cf where cf.clave = 'evento_fallback_belvo' and (cf.valor::jsonb) ? c) limit 1;
    destino := 'belvo';
  end if;
  if cod is null then return null; end if;

  -- una sola vez por día y por proveedor destino (corta el ping-pong)
  select exists (select 1 from trol3.consultas c where c.persona_id = new.persona_id and c.tipo = 'imss_historial'
                   and c.proveedor = destino and c.created_at > now() - interval '1 day') into ya;
  if ya then return null; end if;

  -- al cliente se le avisa si se le iba a avisar: notificar_cliente, o la pidió él/el bot (tg_avisar_consulta_lista)
  avisar := coalesce(new.notificar_cliente, false) or coalesce(new.solicitante_tipo::text, '') in ('cliente', 'bot');

  perform trol3.pedir_consulta(new.persona_id, 'imss_historial', 'sistema', null, 'trol', avisar,
                               'evento ' || cod || ': ' || new.proveedor || ' ' || new.estado::text || ', va ' || destino,
                               true, destino);
  perform trol3.emitir_evento(new.persona_id, 'consulta_reintentada', 'sistema', null,
                              jsonb_build_object('de', new.proveedor, 'a', destino, 'consulta_id', new.id, 'codigo', cod,
                                                 'motivo', coalesce(new.error, new.estado::text)));
  return null;
exception when others then return null;  -- la cascada nunca tumba el cierre de la consulta
end $$;

-- 3) lote desde el panel
create or replace function trol3.evento_reintentar_atorados(p_codigo text, p_proveedor text default 'belvo')
returns jsonb
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare r record; res jsonb; pedidas int := 0; saltadas jsonb := '[]'::jsonb; ids uuid[] := '{}';
begin
  if not trol3.es_miembro() then raise exception 'no_autorizado'; end if;
  if p_proveedor not in ('belvo', 'jordan') then raise exception 'proveedor_invalido'; end if;

  for r in
    with per as (
      select p.id, p.curp
        from trol3.personas p
       where p.merged_into is null
         and (p.codigo_origen = p_codigo
              or exists (select 1 from trol3.eventos ev where ev.persona_id = p.id and ev.tipo = 'consentimiento' and ev.payload ->> 'codigo' = p_codigo))
    )
    select per.id, per.curp,
           (select x.estado from trol3.consultas x where x.persona_id = per.id and x.tipo in ('imss_historial','imss_ventanilla') order by x.created_at desc limit 1) as ultima,
           exists (select 1 from trol3.consultas x where x.persona_id = per.id and x.tipo = 'imss_historial' and x.estado = 'completada') as tiene_historial,
           exists (select 1 from trol3.documentos d where d.persona_id = per.id and d.tipo = 'constancia_semanas') as tiene_constancia,
           exists (select 1 from trol3.consultas x where x.persona_id = per.id and x.tipo = 'imss_historial' and x.proveedor = p_proveedor and x.created_at > now() - interval '1 day') as ya_hoy
      from per
  loop
    if r.curp is null then saltadas := saltadas || jsonb_build_object('persona_id', r.id, 'por', 'sin_curp'); continue; end if;
    if r.tiene_historial or r.tiene_constancia then continue; end if;
    if r.ultima is null or r.ultima not in ('sin_resultado', 'error') then continue; end if;
    if r.ya_hoy then saltadas := saltadas || jsonb_build_object('persona_id', r.id, 'por', 'ya_pedida_hoy'); continue; end if;
    res := trol3.pedir_consulta(r.id, 'imss_historial', 'asesor', trol3.current_miembro_id(), 'trol', true,
                                'evento ' || p_codigo || ': lote atorados → ' || p_proveedor, true, p_proveedor);
    if coalesce(res ->> 'ok', 'false') = 'true' then
      pedidas := pedidas + 1; ids := ids || r.id;
    else
      saltadas := saltadas || jsonb_build_object('persona_id', r.id, 'por', coalesce(res ->> 'motivo', 'error'));
    end if;
  end loop;

  return jsonb_build_object('pedidas', pedidas, 'personas', to_jsonb(ids), 'saltadas', saltadas, 'proveedor', p_proveedor);
end $$;

revoke all on function trol3.evento_reintentar_atorados(text, text) from public, anon;
grant execute on function trol3.evento_reintentar_atorados(text, text) to authenticated;
