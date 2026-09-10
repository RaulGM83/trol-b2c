-- 136 · Reactivación de derechos con Modalidad 10 vía Viraal (crédito).
-- No es una oportunidad nueva: `reactivar_derechos` ya detecta a todo Ley 73
-- con derechos vencidos. Aquí se marca el subconjunto que Viraal atiende
-- (semanas brutas > 450, edad > 58.8, no pensionado: 659 el 10-sep) con
-- `valor_detalle.mod10_viraal = true`, se sube su urgencia, se agrega Viraal
-- como proveedor de la línea y un producto con honorario/costo en cero hasta
-- que Raul defina el cobro al cliente y la comisión.

insert into trol3.catalogo_productos_gestoria (codigo, nombre, descripcion, honorario_default, costo_default, orden)
values ('reactivacion_mod10', 'Reactivación de derechos con Modalidad 10 (Viraal)', 'Reingreso al IMSS por Modalidad 10 financiado por Viraal para recuperar la vigencia de derechos Ley 73. Cobro al cliente y comisión por definir.', 0, 0, 4)
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion;

update trol3.catalogo_oportunidades
   set producto = 'reactivacion_mod10',
       umbrales = coalesce(umbrales,'{}'::jsonb) || '{"mod10_semanas_min": 450, "mod10_edad_min": 58.8}'::jsonb,
       descripcion = 'Derechos no vigentes o por vencer; habilita pensión Ley 73. Con más de 450 semanas y 58.8+ años, Viraal financia la reactivación por Modalidad 10 (valor_detalle.mod10_viraal).'
 where codigo = 'reactivar_derechos';

update trol3.catalogo_proveedores set lineas = (select array_agg(distinct x) from unnest(lineas || array['reactivar_derechos']) x) where codigo = 'viraal';

insert into trol3.checklist_catalogo (codigo_oportunidad, item, detalle, quien, orden, activo)
select 'reactivar_derechos', i.item, i.detalle, i.quien, i.orden, true
from (values
  ('Alta en Modalidad 10 (Viraal)', 'Viraal gestiona el alta y financia las cuotas', 'equipo', 130),
  ('Comprobante del primer pago de Modalidad 10', null, 'cliente', 140),
  ('Consulta IMSS de verificación', 'Refrescar con Jordan a las 4–6 semanas para confirmar la vigencia', 'equipo', 150)
) as i(item, detalle, quien, orden)
where not exists (select 1 from trol3.checklist_catalogo k where k.codigo_oportunidad = 'reactivar_derechos' and k.item = i.item);

-- La marca se pone en evaluar_gestoria, que corre al final de evaluar_persona
-- (después de que la regla vieja upserteó reactivar_derechos y pisó valor_detalle).
create or replace function trol3.marcar_mod10_viraal(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  v_sem numeric; v_edad numeric; v_pens boolean; v_ley text; u jsonb; v_min_sem numeric; v_min_edad numeric; v_aplica boolean;
begin
  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'reactivar_derechos';
  v_min_sem := coalesce((u->>'mod10_semanas_min')::numeric, 450);
  v_min_edad := coalesce((u->>'mod10_edad_min')::numeric, 58.8);
  select valor#>>'{}' into v_ley from trol3.v_mejor_dato where persona_id = p_id and campo = 'ley' limit 1;
  select (valor#>>'{}')::numeric into v_sem from trol3.v_mejor_dato where persona_id = p_id and campo = 'semanas_cotizadas' limit 1;
  select extract(epoch from (now() - fecha_nacimiento::timestamp))/31557600.0 into v_edad from trol3.personas where id = p_id;
  select coalesce((valor#>>'{}') = 'pensionado', false) into v_pens from trol3.v_mejor_dato where persona_id = p_id and campo = 'estatus_nomina_imss' limit 1;
  v_aplica := v_ley = 'Ley73' and coalesce(v_sem,0) > v_min_sem and coalesce(v_edad,0) > v_min_edad and not coalesce(v_pens,false);
  update trol3.oportunidades
     set valor_detalle = coalesce(valor_detalle,'{}'::jsonb) || jsonb_build_object('mod10_viraal', v_aplica, 'semanas_brutas', v_sem, 'edad', round(v_edad,1)),
         urgencia_score = case when v_aplica then greatest(coalesce(urgencia_score,0), 80) else urgencia_score end
   where persona_id = p_id and codigo = 'reactivar_derechos' and estado not in ('no_aplica','perdida','ganada');
  return v_aplica;
end $$;

-- evaluar_gestoria: se agrega la marca al final, sin tocar lo demás.
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

  -- 136: Mod 10 con Viraal, sobre la reactivar_derechos que evaluar_persona acaba de dejar.
  perform trol3.marcar_mod10_viraal(p_id);
  return codigos;
end $$;

-- Segmento para la lista de Viraal / campaña.
create or replace view trol3.v_segmento_mod10_viraal as
select o.persona_id, p.curp, p.nombre, p.apellidos,
       (select c.normalizado from trol3.contactos c where c.persona_id = p.id and c.tipo = 'telefono' order by c.principal desc limit 1) telefono,
       coalesce((select bool_or(c.no_contactar) from trol3.contactos c where c.persona_id = p.id), false) no_contactar,
       (o.valor_detalle->>'edad')::numeric edad, (o.valor_detalle->>'semanas_brutas')::numeric semanas_brutas,
       (o.valor_detalle->>'fin_conservacion')::date fin_conservacion, o.estado estado_oportunidad, o.id oportunidad_id, p.cabecera_id, p.etapa
from trol3.oportunidades o join trol3.personas p on p.id = o.persona_id
where o.codigo = 'reactivar_derechos' and (o.valor_detalle->>'mod10_viraal')::boolean is true and o.estado not in ('no_aplica','perdida','ganada');
grant select on trol3.v_segmento_mod10_viraal to authenticated, service_role;
