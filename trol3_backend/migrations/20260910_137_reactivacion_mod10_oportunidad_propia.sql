-- 137 · La reactivación genérica de derechos NO es una oportunidad de servicio:
-- es parte de la asesoría (ya se ve en "Orden de situación"). La oportunidad
-- es la que un aliado ejecuta: `reactivacion_mod10` (Viraal financia el
-- reingreso por Modalidad 10). Se apaga `reactivar_derechos`, se mueven las
-- marcadas mod10_viraal (687) y se cierran las demás (1,695) como no_aplica.

-- 1. Oportunidad propia.
insert into trol3.catalogo_oportunidades (codigo, nombre, nivel, descripcion, producto, proveedor_externo, umbrales, datos_requeridos, activo, orden, en_lista_trabajo, prioridad)
values ('reactivacion_mod10', 'Reactivar derechos con Modalidad 10 (Viraal)', 2,
  'Ley 73 con derechos vencidos o por vencer, más de 450 semanas cotizadas y 58.8+ años: Viraal financia el reingreso por Modalidad 10 para recuperar la vigencia.',
  'reactivacion_mod10', 'viraal', '{"semanas_min": 450, "edad_min": 58.8, "por_vencer_dias": 180}'::jsonb,
  array['ley','semanas_cotizadas','fecha_nacimiento','conserva_derechos'], true, 14, true, 1)
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, producto = excluded.producto, proveedor_externo = excluded.proveedor_externo,
  umbrales = excluded.umbrales, datos_requeridos = excluded.datos_requeridos, activo = true, orden = excluded.orden, en_lista_trabajo = true, prioridad = excluded.prioridad;

-- 2. La genérica se apaga (queda en el catálogo por historia).
update trol3.catalogo_oportunidades set activo = false, en_lista_trabajo = false, orden = 99,
  descripcion = 'APAGADA (137): la reactivación genérica es asesoría, no servicio. Ver reactivacion_mod10.'
 where codigo = 'reactivar_derechos';

-- 3. Proveedores y checklist siguen a la oportunidad nueva.
update trol3.catalogo_proveedores set lineas = (select array_agg(distinct x) from unnest(array_remove(lineas, 'reactivar_derechos') || array['reactivacion_mod10']) x) where codigo in ('viraal','trol');
insert into trol3.checklist_catalogo (codigo_oportunidad, item, detalle, quien, orden, activo)
select 'reactivacion_mod10', k.item, k.detalle, k.quien, k.orden, true from trol3.checklist_catalogo k
 where k.codigo_oportunidad = 'reactivar_derechos' and k.activo
   and not exists (select 1 from trol3.checklist_catalogo j where j.codigo_oportunidad = 'reactivacion_mod10' and j.item = k.item);
update trol3.checklist_catalogo set activo = false where codigo_oportunidad = 'reactivar_derechos';

-- 4. Detección: la regla vive en evaluar_gestoria (sustituye a marcar_mod10_viraal).
create or replace function trol3.evaluar_reactivacion_mod10(p_id uuid, p_cabecera uuid)
returns text
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  u jsonb; v_min_sem numeric; v_min_edad numeric; v_dias int;
  v_ley text; v_sem numeric; v_edad numeric; v_pens boolean; v_fin date; v_cons boolean; v_pb numeric;
  v_derechos_ok boolean; v_aplica boolean; v_hon numeric;
begin
  select umbrales into u from trol3.catalogo_oportunidades where codigo = 'reactivacion_mod10';
  v_min_sem := coalesce((u->>'semanas_min')::numeric, 450);
  v_min_edad := coalesce((u->>'edad_min')::numeric, 58.8);
  v_dias := coalesce((u->>'por_vencer_dias')::int, 180);
  select valor#>>'{}' into v_ley from trol3.v_mejor_dato where persona_id = p_id and campo = 'ley' limit 1;
  select (valor#>>'{}')::numeric into v_sem from trol3.v_mejor_dato where persona_id = p_id and campo = 'semanas_cotizadas' limit 1;
  select (valor#>>'{}')::date into v_fin from trol3.v_mejor_dato where persona_id = p_id and campo = 'fin_conservacion_derechos' limit 1;
  select (valor#>>'{}')::boolean into v_cons from trol3.v_mejor_dato where persona_id = p_id and campo = 'conserva_derechos' limit 1;
  select (valor#>>'{}')::numeric into v_pb from trol3.v_mejor_dato where persona_id = p_id and campo = 'pension_base' limit 1;
  select coalesce((valor#>>'{}') = 'pensionado', false) into v_pens from trol3.v_mejor_dato where persona_id = p_id and campo = 'estatus_nomina_imss' limit 1;
  select extract(epoch from (now() - fecha_nacimiento::timestamp))/31557600.0 into v_edad from trol3.personas where id = p_id;
  -- 100: la fecha manda sobre la bandera.
  v_derechos_ok := case when v_fin is not null then v_fin >= current_date else coalesce(v_cons, true) end;
  v_aplica := v_ley = 'Ley73' and not coalesce(v_pens,false) and coalesce(v_sem,0) > v_min_sem and coalesce(v_edad,0) > v_min_edad
              and (not v_derechos_ok or (v_fin is not null and v_fin < current_date + v_dias));
  if not v_aplica then return null; end if;
  select honorario_default into v_hon from trol3.catalogo_productos_gestoria where codigo = 'reactivacion_mod10';
  return trol3._up_op(p_id, p_cabecera, 'reactivacion_mod10', nullif(coalesce(v_hon,0),0),
    jsonb_build_object('semanas_brutas', v_sem, 'edad', round(v_edad,1), 'fin_conservacion', v_fin, 'derechos_vigentes', v_derechos_ok, 'pension_base', v_pb, 'mod10_viraal', true),
    case when not v_derechos_ok then 'Derechos vencidos: reactivar con Modalidad 10 (Viraal financia)' else 'Derechos por vencer: reactivar con Modalidad 10 (Viraal financia)' end,
    v_fin);
end $$;

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
  det jsonb; v_cod text;
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

  -- 137: reactivación con Mod 10 (Viraal) como oportunidad propia.
  v_cod := trol3.evaluar_reactivacion_mod10(p_id, p_cabecera);
  if v_cod is not null then codigos := codigos || v_cod; end if;
  return codigos;
end $$;
drop function if exists trol3.marcar_mod10_viraal(uuid);

-- 5. evaluar_persona deja de crear reactivar_derechos (parche en vivo, ancla verificada = 1).
do $$
declare src text; n int; ancla text := $a$if not ya_pens and e.ley = 'Ley73' and (not derechos_ok or$a$;
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'evaluar_persona' and pronamespace = 'trol3'::regnamespace;
  if src like '%-- 137: reactivar_derechos apagada%' then return; end if;
  n := (length(src) - length(replace(src, ancla, ''))) / length(ancla);
  if n <> 1 then raise exception 'ancla reactivar_derechos aparece % veces', n; end if;
  src := replace(src, ancla, $b$if false /* -- 137: reactivar_derechos apagada; ver evaluar_reactivacion_mod10 */ and not ya_pens and e.ley = 'Ley73' and (not derechos_ok or$b$);
  execute src;
end $$;

-- 6. Datos: mover las marcadas y cerrar las demás.
insert into trol3.oportunidades (persona_id, codigo, estado, valor_estimado, valor_detalle, motivo, urgencia_fecha, urgencia_score, datos_faltantes, dueno_id, detectada_en, origen)
select o.persona_id, 'reactivacion_mod10', o.estado, null,
       o.valor_detalle || jsonb_build_object('movida_de', 'reactivar_derechos'),
       case when coalesce((o.valor_detalle->>'fin_conservacion')::date >= current_date, false) then 'Derechos por vencer: reactivar con Modalidad 10 (Viraal financia)' else 'Derechos vencidos: reactivar con Modalidad 10 (Viraal financia)' end,
       o.urgencia_fecha, greatest(coalesce(o.urgencia_score,0), 80), o.datos_faltantes, o.dueno_id, o.detectada_en, o.origen
  from trol3.oportunidades o
 where o.codigo = 'reactivar_derechos' and (o.valor_detalle->>'mod10_viraal')::boolean is true and o.estado not in ('no_aplica','perdida','ganada')
on conflict (persona_id, codigo) do nothing;

update trol3.oportunidades set estado = 'no_aplica', cerrada_en = now(), nota_estado = coalesce(nota_estado,'') || ' [137: la reactivación genérica es asesoría; ver reactivacion_mod10]'
 where codigo = 'reactivar_derechos' and estado not in ('no_aplica','perdida','ganada');

-- 7. La vista de segmento apunta a la oportunidad nueva.
create or replace view trol3.v_segmento_mod10_viraal as
select o.persona_id, p.curp, p.nombre, p.apellidos,
       (select c.normalizado from trol3.contactos c where c.persona_id = p.id and c.tipo = 'telefono' order by c.principal desc limit 1) telefono,
       coalesce((select bool_or(c.no_contactar) from trol3.contactos c where c.persona_id = p.id), false) no_contactar,
       (o.valor_detalle->>'edad')::numeric edad, (o.valor_detalle->>'semanas_brutas')::numeric semanas_brutas,
       (o.valor_detalle->>'fin_conservacion')::date fin_conservacion, o.estado estado_oportunidad, o.id oportunidad_id, p.cabecera_id, p.etapa
from trol3.oportunidades o join trol3.personas p on p.id = o.persona_id
where o.codigo = 'reactivacion_mod10' and o.estado not in ('no_aplica','perdida','ganada');
