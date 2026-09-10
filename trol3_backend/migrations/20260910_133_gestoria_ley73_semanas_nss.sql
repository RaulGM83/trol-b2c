-- 133 · Oportunidades de gestoría: recuperar Ley 73, recuperar semanas,
-- unificar NSS, corregir datos IMSS (bloque D de claude/57, segmentos de claude/56).
--
-- Se separa lo que DETECTAMOS (oportunidad) de lo que VENDEMOS (producto de
-- gestoría con honorario y costo). Recuperar Ley 73 es un resultado que se
-- logra con uno de dos productos; el asesor elige cuál al ganar. Precios de
-- Raul (10-sep-2026): unificación $10,000 / costo $4,300; búsqueda manual de
-- semanas $20,000 / $15,000; actualización de datos $8,000 / $3,500. El
-- honorario es ajustable por caso (puede incluir varios temas).

-- ── 1. Productos de gestoría ────────────────────────────────────────────────
create table if not exists trol3.catalogo_productos_gestoria (
  codigo text primary key,
  nombre text not null,
  descripcion text,
  honorario_default numeric not null,
  costo_default numeric not null,
  activo boolean not null default true,
  orden int not null default 100
);
alter table trol3.catalogo_productos_gestoria enable row level security;
drop policy if exists productos_gestoria_lectura on trol3.catalogo_productos_gestoria;
create policy productos_gestoria_lectura on trol3.catalogo_productos_gestoria for select to authenticated using (trol3.es_miembro());
grant select on trol3.catalogo_productos_gestoria to authenticated, service_role;

insert into trol3.catalogo_productos_gestoria (codigo, nombre, descripcion, honorario_default, costo_default, orden) values
  ('unificacion_nss',          'Unificación de cuentas (dos NSS)',      'Unificar dos números de seguridad social en una sola cuenta ante el IMSS.', 10000, 4300, 1),
  ('busqueda_semanas',         'Búsqueda manual de semanas',            'Localizar y reconocer semanas cotizadas que el IMSS no refleja (puede regresar a Ley 73).', 20000, 15000, 2),
  ('actualizacion_datos_imss', 'Actualización de datos ante el IMSS',   'Corregir nombre, CURP, fecha de nacimiento u otra inconsistencia de la cuenta.', 8000, 3500, 3)
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, honorario_default = excluded.honorario_default, costo_default = excluded.costo_default;

-- ── 2. La oportunidad ganada dice qué producto fue y cuánto costó el gestor ─
alter table trol3.oportunidades add column if not exists producto text;
alter table trol3.oportunidades add column if not exists costo_gestoria numeric;
comment on column trol3.oportunidades.producto is 'Producto de gestoría vendido (catalogo_productos_gestoria); null para oportunidades sin gestoría.';
comment on column trol3.oportunidades.costo_gestoria is 'Lo que Trol pagó al gestor por esta operación. Margen = honorario_trol - costo_gestoria.';

-- ── 3. Segundo NSS: dato del expediente que el asesor captura (o un servicio futuro) ─
insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, orden, editable_cliente, visible_cliente, visible_aliado)
values ('nss_alterno', 'Segundo NSS (si existe otra cuenta)', 'identidad', 'text', 6, false, true, false)
on conflict (campo) do nothing;

-- ── 4. Oportunidades nuevas y producto sugerido de las existentes ───────────
insert into trol3.catalogo_oportunidades (codigo, nombre, nivel, descripcion, producto, proveedor_externo, umbrales, datos_requeridos, activo, orden, en_lista_trabajo, prioridad) values
  ('recuperar_ley73', 'Recuperar Ley 73', 1,
   'Ley 97 con NSS anterior a julio de 1997: hay semanas anteriores al cambio de ley que el IMSS no reconoce; recuperarlas lo regresa a Ley 73.',
   'busqueda_semanas', null, '{"anio_nss_max": 1996}'::jsonb, array['ley','nss','primera_cotizacion'], true, 8, true, 1),
  ('unificacion_nss', 'Unificación de cuentas (dos NSS)', 1,
   'La persona tiene dos números de seguridad social; las semanas están repartidas.',
   'unificacion_nss', null, '{}'::jsonb, array['nss','nss_alterno'], true, 9, true, 1)
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, producto = excluded.producto, umbrales = excluded.umbrales, datos_requeridos = excluded.datos_requeridos, activo = true, orden = excluded.orden, prioridad = excluded.prioridad;

update trol3.catalogo_oportunidades set producto = 'actualizacion_datos_imss',
  descripcion = 'La cuenta IMSS presenta inconsistencias o no fue posible obtener información con la CURP. Corregir datos ante el IMSS.'
  where codigo = 'inconsistencia_imss';
update trol3.catalogo_oportunidades set producto = 'busqueda_semanas',
  descripcion = 'Semanas declaradas mayores a las reconocidas, o NSS anterior a la primera cotización registrada: hay semanas por localizar.'
  where codigo = 'reconocimiento_semanas';

-- ── 5. Quién ejecuta: Trol o el gestor de Jordan ────────────────────────────
insert into trol3.catalogo_proveedores (codigo, nombre, lineas, activo, orden)
values ('jordan_gestor', 'Gestor Jordan', array['inconsistencia_imss','reconocimiento_semanas','recuperar_ley73','unificacion_nss'], true, 8)
on conflict (codigo) do update set nombre = excluded.nombre, lineas = excluded.lineas, activo = true;
update trol3.catalogo_proveedores set lineas = (select array_agg(distinct x) from unnest(lineas || array['recuperar_ley73','unificacion_nss']) x) where codigo = 'trol';

-- ── 6. Checklist de cada gestoría ───────────────────────────────────────────
insert into trol3.checklist_catalogo (codigo_oportunidad, item, detalle, quien, orden, activo)
select c.codigo, i.item, i.detalle, i.quien, i.orden, true
from (values
  ('Identificación oficial vigente', 'INE por ambos lados', 'cliente', 10),
  ('CURP', null, 'cliente', 20),
  ('Acta de nacimiento', 'Se puede pedir a Jordan desde Documentos', 'equipo', 30),
  ('Constancia de semanas cotizadas', 'Del NSS conocido (y del segundo si existe)', 'equipo', 110),
  ('Entregado al gestor', 'Expediente completo enviado; anotar fecha', 'equipo', 120),
  ('Resultado del gestor recibido', 'Nueva constancia o resolución del IMSS en Documentos', 'equipo', 130),
  ('Consulta IMSS de verificación', 'Refrescar con Jordan para confirmar el cambio', 'equipo', 140)
) as i(item, detalle, quien, orden)
cross join (values ('recuperar_ley73'), ('unificacion_nss'), ('reconocimiento_semanas'), ('inconsistencia_imss')) as c(codigo)
where not exists (select 1 from trol3.checklist_catalogo k where k.codigo_oportunidad = c.codigo and k.item = i.item);

-- ── 7. Detección (G1 ya la cubre inconsistencia_imss; aquí G2 y los dos NSS) ─
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
  v_busq numeric; v_unif numeric;
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

  -- Dos NSS distintos y válidos: unificar.
  if length(v_nss) = 11 and length(v_nss2) = 11 and v_nss <> v_nss2 then
    codigos := codigos || trol3._up_op(p_id, p_cabecera, 'unificacion_nss', v_unif,
      jsonb_build_object('nss', v_nss, 'nss_alterno', v_nss2), 'Dos NSS registrados: unificar cuentas', null);
  end if;

  -- Año de afiliación del NSS (dígitos 3-4) contra la primera cotización que el IMSS reconoce.
  if length(v_nss) = 11 and v_pc ~ '^\d{4}' then
    anio_nss := case when substr(v_nss,3,2)::int > 26 then 1900 else 2000 end + substr(v_nss,3,2)::int;
    anio_pc  := substr(v_pc,1,4)::int;
    if anio_pc > anio_nss then
      if v_ley = 'Ley97' and anio_nss <= 1996 then
        codigos := codigos || trol3._up_op(p_id, p_cabecera, 'recuperar_ley73', v_busq,
          jsonb_build_object('anio_nss', anio_nss, 'anio_primera_cotizacion', anio_pc, 'brecha_anios', anio_pc - anio_nss),
          'Ley 97 con NSS de '||anio_nss||': las semanas anteriores a 1997 podrían regresarlo a Ley 73', null);
      else
        -- Conserva lo que ya dijo evaluar_persona (delta de semanas declaradas) y suma la brecha.
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

-- evaluar_persona cierra como no_aplica toda oportunidad que no esté en `codigos`,
-- así que la gestoría tiene que evaluarse DENTRO, antes de ese cierre. Se
-- parcha la función viva en vez de reescribirla (11 KB): si el ancla no
-- aparece exactamente una vez, la migración aborta.
do $$
declare src text; n int;
begin
  select pg_get_functiondef(oid) into src from pg_proc where proname = 'evaluar_persona' and pronamespace = 'trol3'::regnamespace;
  if src like '%evaluar_gestoria%' then return; end if;
  n := (length(src) - length(replace(src, 'update trol3.oportunidades o set estado = ''no_aplica''', ''))) / length('update trol3.oportunidades o set estado = ''no_aplica''');
  if n <> 1 then raise exception 'ancla en evaluar_persona aparece % veces', n; end if;
  src := replace(src, 'update trol3.oportunidades o set estado = ''no_aplica''',
                      'codigos := codigos || trol3.evaluar_gestoria(p_id, e.cabecera_id); update trol3.oportunidades o set estado = ''no_aplica''');
  execute src;
end $$;

-- ── 8. Segmentos para campañas y para el gestor (G1 / G2) ───────────────────
create or replace view trol3.v_segmentos_gestoria as
with base as (
  select e.persona_id, e.curp, e.nombre, e.apellidos, e.edad, e.ley, e.semanas, e.etapa, e.cabecera_id,
    (select valor#>>'{}' from trol3.v_mejor_dato m where m.persona_id = e.persona_id and m.campo = 'nss' limit 1) nss,
    (select valor#>>'{}' from trol3.v_mejor_dato m where m.persona_id = e.persona_id and m.campo = 'primera_cotizacion' limit 1) pc,
    (select c.normalizado from trol3.contactos c where c.persona_id = e.persona_id and c.tipo = 'telefono' order by c.principal desc limit 1) telefono,
    (select bool_or(c.no_contactar) from trol3.contactos c where c.persona_id = e.persona_id) no_contactar,
    (select count(*) from trol3.consultas q where q.persona_id = e.persona_id and q.tipo = 'imss_historial') consultas_imss,
    (select count(*) from trol3.consultas q where q.persona_id = e.persona_id and q.tipo = 'imss_historial' and q.estado = 'completada') consultas_ok
  from trol3.v_expediente e
  where e.curp ~ '^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9][0-9]$'
), calc as (
  select b.*,
    case when b.nss ~ '^[0-9]{11}$' then (case when substr(b.nss,3,2)::int > 26 then 1900 else 2000 end + substr(b.nss,3,2)::int) end anio_nss,
    (case when substr(b.curp,5,2)::int > 26 then 1900 else 2000 end + substr(b.curp,5,2)::int) anio_nac,
    case when b.pc ~ '^\d{4}' then substr(b.pc,1,4)::int end anio_pc
  from base b
)
select persona_id, curp, nombre, apellidos, telefono, coalesce(no_contactar,false) no_contactar, edad, ley, semanas, etapa, cabecera_id,
  nss, anio_nss, anio_pc, anio_nac, case when anio_pc is not null and anio_nss is not null then anio_pc - anio_nss end brecha_anios,
  consultas_imss, consultas_ok,
  case
    when semanas is null and consultas_imss >= 2 and consultas_ok = 0 then 'g1'
    when anio_pc > anio_nss and ley = 'Ley97' and anio_nss <= 1996 then 'g2_ley73'
    when anio_pc > anio_nss and (anio_nss < 1987 or not (anio_nss - anio_nac between 15 and 25)) then 'g2a'
    when anio_pc > anio_nss then 'g2b'
  end segmento
from calc
where (semanas is null and consultas_imss >= 2 and consultas_ok = 0) or (anio_pc > anio_nss);
comment on view trol3.v_segmentos_gestoria is 'G1: CURP sin info del IMSS tras 2+ consultas fallidas. g2_ley73: Ley 97 con NSS ≤1996 y primera cotización posterior. g2a: NSS pre-1987 o fuera de edad universitaria. g2b: posible seguro facultativo (15–25 años al NSS).';
grant select on trol3.v_segmentos_gestoria to authenticated, service_role;
