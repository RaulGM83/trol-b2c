-- 189c · Paso cero, ajustes de Raul (27-sep): edad con un decimal, semanas recuperadas en los
-- highlights, y en "otros ahorros" también la aportación mensual, no sólo el saldo.

update trol3.catalogo_campos set base_asesoria = 5
 where campo in ('ahorro_voluntario_mensual', 'plan_corporativo_mensual', 'otros_planes_mensual');

create or replace function trol3.base_asesoria(p_persona uuid) returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $$
declare e record; pregs jsonb := '[]'::jsonb; n int; est text; campos jsonb; listos int := 0;
        titulos text[] := array['¿En qué AFORE estás?', '¿Cuánto tienes en tu AFORE, más o menos?', '¿Has usado tu Infonavit?',
                                '¿Con cuánto te gustaría retirarte y a qué edad?', '¿Tienes otros ahorros para tu retiro?'];
        sem_desc numeric; sem_rec numeric; edad_base numeric; edad_dec numeric;
begin
  if auth.uid() is not null and not trol3.es_miembro() and p_persona <> trol3.current_persona_id() then raise exception 'no_autorizado'; end if;
  select * into e from trol3.v_expediente where persona_id = p_persona;
  if e.persona_id is null then return null; end if;
  select (valor #>> '{}')::numeric into sem_desc from trol3.v_mejor_dato where persona_id = p_persona and campo = 'semanas_descontadas';
  select (valor #>> '{}')::numeric into sem_rec  from trol3.v_mejor_dato where persona_id = p_persona and campo = 'semanas_recuperadas';
  select (valor #>> '{}')::numeric into edad_base from trol3.v_mejor_dato where persona_id = p_persona and campo = 'edad_base';
  -- edad con un decimal: años + meses/12 (la misma que pinta el encabezado del expediente)
  if e.fecha_nacimiento is not null then
    edad_dec := round((extract(year from age(current_date, e.fecha_nacimiento)) + extract(month from age(current_date, e.fecha_nacimiento)) / 12.0)::numeric, 1);
  end if;

  for n in 1..5 loop
    est := trol3._base_estado(p_persona, n);
    if est <> 'falta' then listos := listos + 1; end if;
    select coalesce(jsonb_agg(jsonb_build_object(
             'campo', c.campo, 'nombre', c.nombre, 'tipo', c.tipo, 'unidad', c.unidad, 'opciones', c.opciones,
             'valor', r.valor, 'capa', r.capa, 'en', r.obtenido_en,
             'estimado', case when r.valor is null and md.capa = 'calculado' then md.valor end,
             'no_sabe', s.en is not null
           ) order by c.orden), '[]'::jsonb)
      into campos
      from trol3.catalogo_campos c
      left join lateral (select d.valor, d.capa, d.obtenido_en from trol3.datos d
                          where d.persona_id = p_persona and d.campo = c.campo and d.capa in ('declarado', 'validado')
                          order by (d.capa = 'validado') desc, d.obtenido_en desc nulls last, d.id desc limit 1) r on true
      left join trol3.v_mejor_dato md on md.persona_id = p_persona and md.campo = c.campo
      left join trol3.no_sabe s on s.persona_id = p_persona and s.campo = c.campo
     where c.base_asesoria = n;
    pregs := pregs || jsonb_build_object('n', n, 'titulo', titulos[n], 'estado', est, 'campos', campos);
  end loop;

  return jsonb_build_object(
    'highlights', jsonb_build_object(
      'ley', e.ley, 'semanas', e.semanas, 'semanas_capa', e.semanas_capa, 'semanas_descontadas', sem_desc, 'semanas_recuperadas', sem_rec,
      'edad', e.edad, 'edad_decimal', edad_dec, 'status_empleo', e.status_empleo,
      'conserva_derechos', e.conserva_derechos, 'fin_conservacion', e.fin_conservacion,
      'pension_base', e.pension_base, 'edad_base', edad_base, 'datos_al', e.ley_en, 'datos_vigentes', e.ley_vigente),
    'preguntas', pregs, 'listos', listos, 'total', 5);
end $$;
