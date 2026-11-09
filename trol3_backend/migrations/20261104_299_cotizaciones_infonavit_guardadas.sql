-- 299 — Propuesta Infonavit guardada y lista para el asesor (Raúl, 4-nov-2026: "si Precalix dice que tiene
-- empleo, siempre hay que generarle propuesta y calculadora, también a nuestra base" · opción 1: lista para el asesor).
--
-- Hasta hoy la cotización inicial se calculaba al pintar la pestaña y nadie la mandaba sola (links_cotizacion: 0 filas).
-- Ahora se guarda una foto por persona (`cotizaciones_infonavit`): números, texto, token de la imagen pública y si ya
-- se envió. La genera la app (motor pension-core) con un cron horario y el botón "Generar pendientes" de
-- /trabajo/infonavit; `v_cotizaciones_pendientes` dice a quién le toca y con qué `huella` (si cambian saldo, monto,
-- pago, catálogo o supuestos, la huella cambia y se regenera).
-- Candidato = Precalix con relación laboral vigente + saldo validado ≥ config.cotizacion_infonavit_saldo_min + sin
-- crédito vigente + menos de 62 años (regla compra_inmueble). Aplicada por MCP el 4-nov-2026.

create table if not exists trol3.cotizaciones_infonavit (
  persona_id uuid primary key references trol3.personas(id) on delete cascade,
  generada_en timestamptz not null default now(),
  motor_version text,
  estado text not null check (estado in ('lista','enviada','sin_cotizacion')),
  motivo text,
  huella text,
  saldo numeric, credito_max numeric, salario_mensual numeric,
  preliminar boolean not null default false,
  edad_por_nss boolean not null default false,
  opciones jsonb,
  texto text,
  token text references trol3.links_cotizacion(token),
  enviada_en timestamptz,
  enviada_por uuid references trol3.miembros(id),
  enviada_huella text,
  medio text
);
comment on table trol3.cotizaciones_infonavit is 'Propuesta (cotización inicial Infonavit) guardada por persona, lista para que el asesor la mande (299).';
comment on column trol3.cotizaciones_infonavit.huella is 'saldo|monto|pago|catálogo|supuestos con que se generó; si cambia, se regenera.';
comment on column trol3.cotizaciones_infonavit.enviada_huella is 'Huella de la versión que se envió; si difiere de huella, las cifras cambiaron después de enviarla.';

alter table trol3.cotizaciones_infonavit enable row level security;
drop policy if exists cotizaciones_infonavit_miembros on trol3.cotizaciones_infonavit;
create policy cotizaciones_infonavit_miembros on trol3.cotizaciones_infonavit for all using (trol3.es_miembro()) with check (trol3.es_miembro());

-- Huella de insumos de una persona (lo que mueve la cotización).
create or replace function trol3.huella_cotizacion_infonavit(p_persona uuid)
returns text language sql stable as $$
  select concat_ws('|',
    (select d.valor #>> '{}' from trol3.datos d where d.persona_id = p_persona and d.campo = 'saldo_infonavit' and d.capa = 'validado' order by d.obtenido_en desc limit 1),
    (select d.valor #>> '{}' from trol3.datos d where d.persona_id = p_persona and d.campo = 'infonavit_monto_credito' and d.capa = 'validado' order by d.obtenido_en desc limit 1),
    (select d.valor #>> '{}' from trol3.datos d where d.persona_id = p_persona and d.campo = 'infonavit_pago_mensual' and d.capa = 'validado' order by d.obtenido_en desc limit 1),
    (select d.valor #>> '{}' from trol3.datos d where d.persona_id = p_persona and d.campo = 'relacion_laboral_vigente' and d.capa = 'validado' order by d.obtenido_en desc limit 1),
    (select to_char(max(updated_at), 'YYYYMMDDHH24MI') from trol3.proyectos_inmobiliarios where disponible),
    (select to_char(actualizado_at, 'YYYYMMDDHH24MI') from trol3.infonavit_supuestos where id = 'default'));
$$;

-- A quién le toca propuesta y si la que hay sigue vigente.
create or replace view trol3.v_cotizaciones_pendientes as
with rel as (
  select distinct on (persona_id) persona_id, (valor #>> '{}')::boolean vigente
  from trol3.datos where campo = 'relacion_laboral_vigente' and capa = 'validado' order by persona_id, obtenido_en desc
)
select e.persona_id, e.nombre, e.apellidos, e.cabecera_id, e.saldo_infonavit as saldo, e.edad,
       trol3.huella_cotizacion_infonavit(e.persona_id) as huella,
       c.estado as cotizacion_estado, c.huella as cotizacion_huella, c.generada_en
  from trol3.v_expediente e
  join rel on rel.persona_id = e.persona_id and rel.vigente
  left join trol3.cotizaciones_infonavit c on c.persona_id = e.persona_id
 where e.saldo_infonavit_capa = 'validado'
   and e.saldo_infonavit >= coalesce((select valor::numeric from trol3.config where clave = 'cotizacion_infonavit_saldo_min'), 100000)
   and coalesce(e.credito_infonavit, false) = false
   and e.fecha_nacimiento is not null and e.fecha_nacimiento > current_date - interval '62 years'
   and (c.persona_id is null or c.huella is distinct from trol3.huella_cotizacion_infonavit(e.persona_id));
comment on view trol3.v_cotizaciones_pendientes is 'Personas que deben tener propuesta Infonavit guardada y no la tienen o cambió la huella (299).';
