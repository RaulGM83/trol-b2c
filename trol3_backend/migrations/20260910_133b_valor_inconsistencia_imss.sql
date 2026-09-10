-- 133b · inconsistencia_imss nace sin valor_estimado (la regla vieja de
-- evaluar_persona pasa null). Ahora vale el honorario del producto sugerido
-- (actualización de datos, $8,000), como las demás gestorías. Se corrige
-- dentro de evaluar_gestoria para que sobreviva a cada reevaluación.
create or replace function trol3.evaluar_gestoria(p_id uuid, p_cabecera uuid)
returns text[]
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  codigos text[] := '{}';
  v_nss text; v_nss2 text; v_pc text; v_ley text;
  anio_nss int; anio_pc int;
  v_busq numeric; v_unif numeric; v_act numeric;
  det jsonb;
begin
  select valor#>>'{}' into v_nss  from trol3.v_mejor_dato where persona_id = p_id and campo = 'nss' limit 1;
  select valor#>>'{}' into v_nss2 from trol3.v_mejor_dato where persona_id = p_id and campo = 'nss_alterno' limit 1;
  select valor#>>'{}' into v_pc   from trol3.v_mejor_dato where persona_id = p_id and campo = 'primera_cotizacion' limit 1;
  select valor#>>'{}' into v_ley  from trol3.v_mejor_dato where persona_id = p_id and campo = 'ley' limit 1;
  v_nss  := regexp_replace(coalesce(v_nss,''),  '\D', '', 'g');
  v_nss2 := regexp_replace(coalesce(v_nss2,''), '\D', '', 'g');
  select honorario_default into v_busq from trol3.catalogo_productos_gestoria where codigo = 'busqueda_semanas';
  select honorario_default into v_unif from trol3.catalogo_productos_gestoria where codigo = 'unificacion_nss';
  select honorario_default into v_act  from trol3.catalogo_productos_gestoria where codigo = 'actualizacion_datos_imss';

  -- La regla vieja de evaluar_persona acaba de upsertear inconsistencia_imss sin valor.
  update trol3.oportunidades set valor_estimado = v_act
   where persona_id = p_id and codigo = 'inconsistencia_imss' and valor_estimado is null and estado in ('posible','detectada','presentada','interesada','en_proceso');

  if length(v_nss) = 11 and length(v_nss2) = 11 and v_nss <> v_nss2 then
    codigos := codigos || trol3._up_op(p_id, p_cabecera, 'unificacion_nss', v_unif,
      jsonb_build_object('nss', v_nss, 'nss_alterno', v_nss2), 'Dos NSS registrados: unificar cuentas', null);
  end if;

  if length(v_nss) = 11 and v_pc ~ '^\d{4}' then
    anio_nss := case when substr(v_nss,3,2)::int > 26 then 1900 else 2000 end + substr(v_nss,3,2)::int;
    anio_pc  := substr(v_pc,1,4)::int;
    if anio_pc > anio_nss then
      if v_ley = 'Ley97' and anio_nss <= 1996 then
        codigos := codigos || trol3._up_op(p_id, p_cabecera, 'recuperar_ley73', v_busq,
          jsonb_build_object('anio_nss', anio_nss, 'anio_primera_cotizacion', anio_pc, 'brecha_anios', anio_pc - anio_nss),
          'Ley 97 con NSS de '||anio_nss||': las semanas anteriores a 1997 podrían regresarlo a Ley 73', null);
      else
        select coalesce(valor_detalle,'{}'::jsonb) into det from trol3.oportunidades where persona_id = p_id and codigo = 'reconocimiento_semanas';
        codigos := codigos || trol3._up_op(p_id, p_cabecera, 'reconocimiento_semanas', v_busq,
          coalesce(det,'{}'::jsonb) || jsonb_build_object('anio_nss', anio_nss, 'anio_primera_cotizacion', anio_pc, 'brecha_anios', anio_pc - anio_nss,
            'clase', case when anio_nss < 1987 then 'nss_pre1987' when anio_nss - (case when substr((select curp from trol3.personas where id = p_id),5,2)::int > 26 then 1900 else 2000 end + substr((select curp from trol3.personas where id = p_id),5,2)::int) between 15 and 25 then 'posible_facultativo' else 'edad_no_universitaria' end),
          'NSS de '||anio_nss||' y primera cotización en '||anio_pc||': posibles semanas no reconocidas', null);
      end if;
    end if;
  end if;
  return codigos;
end $$;

-- Las que ya existen.
update trol3.oportunidades o set valor_estimado = (select honorario_default from trol3.catalogo_productos_gestoria where codigo = 'actualizacion_datos_imss')
 where o.codigo = 'inconsistencia_imss' and o.valor_estimado is null and o.estado in ('posible','detectada','presentada','interesada','en_proceso');
