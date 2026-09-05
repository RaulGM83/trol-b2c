-- 108b — v_segmentos_campana: definición final vigente (3-sep-2026).
--
-- NOTA DE EXPORTACIÓN (4-sep-2026): esta vista se redefinió once veces entre el
-- 1 y el 3 de septiembre (099, 099b, 099c, 100b, 102, 103, 104, 105, 106, 107b, 108b).
-- Cada versión reescribía la definición completa, así que sólo la última manda y es
-- la que se guarda aquí. El detalle de qué cambió cada una está en README_campanas_099-108b.md
-- y el razonamiento en los docs claude/31 … claude/39 del proyecto.
--
-- Reglas acumuladas que viven en esta definición:
--   · 100/100b  fin_conservacion manda sobre la bandera conserva_derechos
--   · 102       segmentos r1 partidos por consecuencia (negativa vs pensión chica)
--   · 103       piso de 450 semanas para prometer Ley 73 (r1_lejos por debajo)
--   · 104       los r* sólo aplican de 59 años en adelante (salvo r2)
--   · 105       r4 por fecha de cumpleaños 60 dentro de 14 meses, no por edad entera
--   · 106       r2 sin piso de edad
--   · 107b      el saludo usa trol3.nombre_saludo (requiere la migración 107)
--   · 108b      retroactivo desde la más tardía entre la baja y los 60, topado a 12 meses
--               (requiere la migración 108: trol3.meses_retro)
--
-- Depende de: trol3.v_expediente, trol3.v_mejor_dato, trol3.to_date_safe,
--             trol3.to_num_safe, trol3.nombre_saludo, trol3.nombre_dudoso, trol3.meses_retro.

drop view if exists trol3.v_segmentos_campana;

create view trol3.v_segmentos_campana as
with base as (
  select
    v.persona_id,
    split_part(coalesce(nullif(trim(v.nombre),''),'—'),' ',1) as primer_nombre,
    v.nombre, v.apellidos, v.edad, v.fecha_nacimiento, v.semanas, v.ley, v.pension_base,
    v.conserva_derechos, v.fin_conservacion, v.limite_mod40,
    v.mod40_retro_aplica, v.pension_mod40_retro, v.estatus_nomina,
    v.capacidad_credito, coalesce(v.prestamos_nomina,0) as prestamos,
    v.status_empleo, v.saldo_rcv97,
    coalesce(trol3.to_num_safe(v.kv->'saldo_sar92'->>'v'),0) as saldo_sar92,
    coalesce(v.saldo_infonavit_estimado,0) as saldo_infonavit_est,
    trol3.to_date_safe(v.kv->'ultima_cotizacion'->>'v') as ultima_cotizacion,
    (select md.valor #>> '{}' from trol3.v_mejor_dato md
      where md.persona_id = v.persona_id and md.campo = 'ultima_modalidad') as ultima_modalidad,
    (select max(d.obtenido_en) from trol3.datos d
      where d.persona_id = v.persona_id and d.campo = 'status_empleo') as empleo_en,
    (select c.valor from trol3.contactos c
      where c.persona_id = v.persona_id and c.tipo = 'telefono'
        and coalesce(c.no_contactar,false) = false
      order by c.principal desc nulls last, c.created_at limit 1) as telefono,
    exists (select 1 from trol3.contactos c
             where c.persona_id = v.persona_id and coalesce(c.no_contactar,false)) as opt_out,
    exists (select 1 from trol3.oportunidades o
             where o.persona_id = v.persona_id and o.codigo = 'pension_hoy'
               and o.estado::text = any(array['detectada','presentada','interesada','en_proceso'])) as op_pension,
    exists (select 1 from trol3.oportunidades o
             where o.persona_id = v.persona_id and o.codigo = 'credito_pension'
               and o.estado::text = any(array['detectada','presentada','interesada','en_proceso'])) as op_credito
  from trol3.v_expediente v
  where v.persona_id in (
    select o.persona_id from trol3.oportunidades o
     where o.codigo = any(array['pension_hoy','credito_pension','reactivar_derechos'])
       and o.estado::text = any(array['detectada','presentada','interesada','en_proceso'])
  )
),
marcado as (
  select b.*,
    case when b.fin_conservacion is not null then b.fin_conservacion >= current_date
         else coalesce(b.conserva_derechos, true) end as derechos_ok,
    (b.empleo_en is not null and b.empleo_en > now() - interval '90 days') as dato_fresco,
    round(extract(epoch from now() - b.empleo_en)/86400)::int as dias_dato,
    round((coalesce(b.saldo_rcv97,0)/3.0 + b.saldo_sar92) * 0.8) as dinero_en_riesgo,
    (b.fecha_nacimiento + interval '60 years')::date as cumple_60,
    ((current_date + 364) + ((coalesce(b.semanas,0) + 60)/4.0*7)::int) as derechos_hasta_post
  from base b
),
seg as (
  select m.*,
    (m.op_pension and coalesce(m.pension_base,0) > 0 and m.pension_base <= 11000
      and (m.ultima_cotizacion is null or m.ultima_cotizacion >= current_date - interval '2 years')) as en_c1,
    (m.op_pension and coalesce(m.pension_base,0) > 0 and m.pension_base <= 11000
      and m.ultima_cotizacion < current_date - interval '2 years') as en_c2,
    (m.op_pension and coalesce(m.pension_base,0) > 11000) as en_c3,
    (m.op_pension and coalesce(m.pension_base,0) = 0) as en_c4,
    (m.op_credito and m.prestamos = 0) as en_c5,
    (m.op_credito and m.prestamos > 0) as en_c5_revisar,
    (m.ley = 'Ley73' and not m.derechos_ok
      and coalesce(m.estatus_nomina,'') <> 'pensionado') as vencido,
    (m.ley = 'Ley73' and m.derechos_ok
      and m.fin_conservacion >= current_date and m.fin_conservacion <= current_date + 180
      and coalesce(m.estatus_nomina,'') <> 'pensionado') as en_r2,
    (m.limite_mod40 >= current_date and m.limite_mod40 <= current_date + 180
      and coalesce(m.estatus_nomina,'') <> 'pensionado'
      and m.ultima_modalidad = 'mod40') as en_r3a,
    (m.limite_mod40 >= current_date and m.limite_mod40 <= current_date + 180
      and coalesce(m.estatus_nomina,'') <> 'pensionado'
      and coalesce(m.ultima_modalidad,'') <> 'mod40') as en_r3b,
    (m.ley = 'Ley73' and not m.derechos_ok
      and coalesce(m.estatus_nomina,'') <> 'pensionado'
      and m.cumple_60 is not null
      and m.cumple_60 >  current_date
      and m.cumple_60 <= (current_date + interval '14 months')::date
      and coalesce(m.semanas,0) >= 450) as en_r4,
    (m.cumple_60 is not null and m.cumple_60 <= m.derechos_hasta_post) as mod10_alcanza_60
  from marcado m
)
select
  persona_id,
  trol3.nombre_saludo(primer_nombre) as primer_nombre,
  nombre, apellidos, telefono, opt_out,
  case
    when en_r3a and edad >= 59 then 'r3a'
    when en_r3b and edad >= 59 then 'r3b'
    when en_c2  then 'c2'
    when en_c5  then 'c5'
    when en_c5_revisar then 'c5_revisar'
    when en_c3  then 'c3'
    when en_c1  then 'c1'
    when en_c4  then 'c4'
    when en_r2  then 'r2'
    when en_r4 and dinero_en_riesgo >= 200000 then 'r4_asesor'
    when en_r4 then 'r4'
    when vencido and edad >= 59 and coalesce(semanas,0) < 450 then 'r1_lejos'
    when vencido and edad >= 59 and dinero_en_riesgo >= 200000 then 'r1c'
    when vencido and edad >= 59 and coalesce(semanas,0) < 875   then 'r1a'
    when vencido and edad >= 59                                 then 'r1b'
    when vencido or en_r3a or en_r3b then 'r_menor59'
    else 'x_revisar'
  end as segmento,
  case
    when not dato_fresco then 'neutral'
    when status_empleo = 'empleado'    then 'emp'
    when status_empleo = 'desempleado' then 'des'
    else 'neutral'
  end as variante,
  dato_fresco, dias_dato, status_empleo, ultima_modalidad, derechos_ok,
  semanas as var_semanas,
  greatest(0, 500 - coalesce(semanas,0))::int as semanas_para_500,
  (coalesce(semanas,0) + 60) as semanas_post_programa,
  mod10_alcanza_60,
  cumple_60,
  -- 108: el reloj del retroactivo arranca en la mas tardia entre la baja y los 60
  greatest(cumple_60, coalesce(ultima_cotizacion, cumple_60))::date as inicio_retro,
  trol3.meses_retro(cumple_60, ultima_cotizacion) as meses_retro,
  round(coalesce(round(pension_base),0) * coalesce(trol3.meses_retro(cumple_60, ultima_cotizacion),0)) as retroactivo_estimado,
  extract(year from ultima_cotizacion)::int as var_anio_ultima_cot,
  to_char(fin_conservacion::timestamptz,'DD/MM/YYYY') as var_fecha_derechos,
  to_char(limite_mod40::timestamptz,'DD/MM/YYYY')     as var_fecha_mod40,
  to_char(cumple_60::timestamptz,'DD/MM/YYYY')        as var_fecha_60,
  '$' || to_char(dinero_en_riesgo,'FM999,999,999')    as var_dinero_riesgo,
  dinero_en_riesgo,
  round(saldo_rcv97) as saldo_rcv97,
  round(saldo_sar92) as saldo_sar92,
  round(saldo_infonavit_est) as saldo_infonavit_est,
  round(pension_base) as pension_estimada,
  edad, fecha_nacimiento, ultima_cotizacion,
  coalesce(mod40_retro_aplica,false) as mod40_retro,
  round(pension_mod40_retro - coalesce(pension_base,0)) as delta_mod40,
  round(capacidad_credito) as capacidad,
  prestamos, conserva_derechos, fin_conservacion, limite_mod40,
  array_remove(array[
    case when en_c1 then 'c1' end,
    case when en_c2 then 'c2' end,
    case when en_c3 then 'c3' end,
    case when en_c4 then 'c4' end,
    case when en_c5 then 'c5' end,
    case when en_c5_revisar then 'c5_revisar' end,
    case when vencido then 'vencido' end,
    case when en_r2 then 'r2' end,
    case when en_r3a then 'r3a' end,
    case when en_r3b then 'r3b' end,
    case when en_r4 then 'r4' end
  ], null) as todos_los_segmentos,
  trol3.nombre_dudoso(primer_nombre) as nombre_dudoso
from seg
where telefono is not null;

comment on view trol3.v_segmentos_campana is
'Segmentos de campana Tako. 103 piso 450 semanas; 104/105 los r* de 59+ y r4 por fecha de cumpleanos; 106 r2 sin piso de edad; 107 nombre_saludo; 108 retroactivo desde la mas tardia entre la baja y los 60, topado a 12 meses (meses_retro, retroactivo_estimado, inicio_retro).';

-- Añadido al exportar (4-sep): en producción el grant llega por los default privileges
-- del esquema trol3, pero explicitarlo hace la migración autosuficiente en una base limpia.
grant select on trol3.v_segmentos_campana to authenticated;
