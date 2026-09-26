-- 187b — Carriles: primero el carril, luego la fila (claude/84, 26-sep-2026)
-- mi_calientes / mi_favoritos / mi_frios calculaban _cartera_fila (parada_de) para todos los candidatos antes de filtrar
-- por carril: Andrea 3.4 s, equipo 5.5 s. Ahora carril_de decide y _cartera_fila sólo se pinta para los que quedan.

create or replace function trol3.mi_calientes(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); hoy date := trol3._hoy_mx();
        gd int := trol3._cfg_int('carril_gesto_dias', 7); tope int := trol3._cfg_int('toques_tope', 25);
        filas jsonb; tocados int; react int;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  create temp table if not exists _cal (persona_id uuid primary key) on commit drop;
  truncate _cal;
  insert into _cal
  select distinct x.id from (
    select m id from trol3._carril_mios(me, p_vista) m
    union all
    select p.id from trol3.personas p where p_vista = 'equipo' and p.cabecera_id is null and p.merged_into is null
       and (greatest(p.tako_visto_en, p.app_visto_en) > now() - make_interval(days => gd)
            or exists (select 1 from trol3.oportunidades o join trol3.oportunidad_checklist oc on oc.oportunidad_id = o.id and oc.estado = 'pendiente'
                         join trol3.checklist_catalogo cc on cc.id = oc.item_id and cc.quien = 'equipo' where o.persona_id = p.id and o.estado = 'en_proceso'))
  ) x
  join trol3.personas p on p.id = x.id
  where greatest(p.tako_visto_en, p.app_visto_en, p.created_at) > now() - make_interval(days => gd + 1)
     or exists (select 1 from trol3.interacciones i where i.persona_id = p.id and i.created_at > now() - make_interval(days => gd + 1))
     or exists (select 1 from trol3.eventos e where e.persona_id = p.id and e.created_at > now() - make_interval(days => gd + 1))
     or exists (select 1 from trol3.citas c where c.persona_id = p.id and c.estado = 'programada' and c.inicio > now() - interval '2 hours' and c.inicio < (hoy + 2) at time zone 'America/Mexico_City')
     or exists (select 1 from trol3.carril_marcas k where k.persona_id = p.id and k.activa and ((k.marca = 'favorito' and k.hasta <= hoy) or (k.marca = 'despertado' and k.directo)))
     or exists (select 1 from trol3.oportunidades o where o.persona_id = p.id and o.estado = 'en_proceso');

  with k as (select c.persona_id, trol3.carril_de(c.persona_id) k from _cal c),
       f as (select trol3._cartera_fila(k.persona_id) || k.k f from k where k.k->>'carril' = 'calientes')
  select coalesce(jsonb_agg(f order by
           case f->>'origen' when 'reacciono' then 1 when 'cita' then 2 when 'llego_hoy' then 3 when 'tramite' then 4 when 'favorito' then 5 when 'asignado' then 6 else 7 end,
           (f->>'ultimo_gesto')::timestamptz desc nulls last), '[]'::jsonb),
         count(*) filter (where f->>'origen' = 'tocado'),
         count(*) filter (where f->>'origen' <> 'tocado')
    into filas, tocados, react
    from f;

  return jsonb_build_object('tope', tope, 'tocados', coalesce(tocados, 0), 'reaccionaron', coalesce(react, 0),
                            'libres', greatest(0, tope - coalesce(tocados, 0)), 'filas', filas);
end $$;

create or replace function trol3.mi_favoritos(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); en_proceso jsonb; favoritos jsonb;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  with cand as (
    select m id from trol3._carril_mios(me, p_vista) m
    union select o.persona_id from trol3.oportunidades o join trol3.personas p on p.id = o.persona_id
           where p_vista = 'equipo' and o.estado = 'en_proceso' and p.cabecera_id is null and p.merged_into is null
    union select k.persona_id from trol3.carril_marcas k where k.activa and k.marca = 'favorito' and (k.miembro_id = me or p_vista = 'equipo')
  ), k as (
    select c.id, trol3.carril_de(c.id) k from cand c
  ), f as (
    select trol3._cartera_fila(k.id) || k.k fila from k
     where k.k->>'carril' in ('favoritos','calientes')
       and ((k.k->>'en_proceso')::boolean or k.k->'marca'->>'marca' = 'favorito')
  )
  select coalesce(jsonb_agg(fila order by (fila->>'ultimo_gesto')::timestamptz desc nulls last) filter (where (fila->>'en_proceso')::boolean), '[]'::jsonb),
         coalesce(jsonb_agg(fila order by (fila->'marca'->>'hasta')::date asc nulls last) filter (where not (fila->>'en_proceso')::boolean), '[]'::jsonb)
    into en_proceso, favoritos
    from f;
  return jsonb_build_object('en_proceso', en_proceso, 'favoritos', favoritos);
end $$;

create or replace function trol3.mi_frios(p_vista text default 'mios') returns jsonb
language plpgsql security definer set search_path to 'trol3','public' as $$
declare me uuid := trol3.current_miembro_id(); hoy date := trol3._hoy_mx(); filas jsonb; det jsonb;
begin
  if me is null then raise exception 'no_autorizado'; end if;
  create temp table if not exists _fri (persona_id uuid primary key, fila jsonb) on commit drop;
  truncate _fri;
  insert into _fri
  select k.id, trol3._cartera_fila(k.id) || k.k
    from (select c.id, trol3.carril_de(c.id) k from trol3._carril_mios(me, p_vista) c(id)) k
   where k.k->>'carril' = 'frios';

  select coalesce(jsonb_agg(fila order by (fila->>'ultimo_toque')::timestamptz asc nulls first), '[]'::jsonb) into filas from _fri;

  with d as (
    select f.persona_id, p.fecha_nacimiento,
           (select min(o.urgencia_fecha) from trol3.oportunidades o where o.persona_id = f.persona_id and o.estado in ('detectada','presentada','interesada') and o.urgencia_fecha >= hoy) ventana
      from _fri f join trol3.personas p on p.id = f.persona_id
  )
  select coalesce(jsonb_agg(x) filter (where (x->>'n')::int > 0), '[]'::jsonb) into det from (
    select jsonb_build_object('codigo', 'cumple_60', 'nombre', 'Cumplen 60 en los próximos 90 días', 'n', count(*), 'personas', coalesce(jsonb_agg(persona_id), '[]'::jsonb)) x
      from d where fecha_nacimiento + interval '60 years' between hoy and hoy + 90
    union all
    select jsonb_build_object('codigo', 'cumple_65', 'nombre', 'Cumplen 65 en los próximos 90 días', 'n', count(*), 'personas', coalesce(jsonb_agg(persona_id), '[]'::jsonb))
      from d where fecha_nacimiento + interval '65 years' between hoy and hoy + 90
    union all
    select jsonb_build_object('codigo', 'ventana_6m', 'nombre', 'La ventana legal cierra en 6 meses', 'n', count(*), 'personas', coalesce(jsonb_agg(persona_id), '[]'::jsonb))
      from d where ventana <= hoy + 183
  ) q;
  return jsonb_build_object('detonadores', det, 'filas', filas);
end $$;