-- ============================================================================
-- trol3.escenarios — snapshot INMUTABLE y auto-contenido de una autorización.
-- 24-ago-2026. Spec: claude/20-fecha-tramite-mod40-spec.md + sesión de snapshots.
--
-- Por qué existe: la fecha de trámite dejó de ser "hoy" (ver 20260824162316 y
-- siguientes). Un proyecto autorizado el martes con fecha de trámite de octubre
-- ya no se puede reconstruir el jueves: el motor cambia, la semilla se refresca
-- y la ventana del art. 220 se mueve sola con el calendario. Lo que se autorizó
-- tiene que quedar escrito completo, no derivable.
--
-- Reglas duras:
--   · Una autorización = una fila. Nunca se actualiza ni se borra.
--   · La fila trae TODO lo necesario para releerla sin volver a calcular:
--     semilla, historial, fecha de trámite, límite usado y versión del motor.
--   · Se inserta SOLO por trol3.autorizar_escenario() (security definer).
--
-- OJO con la tabla previa: `escenarios` ya existía con otro diseño (escenario
-- editable del cliente: nombre, dueno_tipo, overrides, compartido_con_cliente,
-- updated_at). Estaba VACÍA y sin uso en la app, así que se reconstruye. El
-- bloque de abajo aborta si alguien alcanzó a escribir algo.
-- ============================================================================

do $$
declare n bigint;
begin
  if to_regclass('trol3.escenarios') is null then
    return; -- nada que proteger
  end if;
  execute 'select count(*) from trol3.escenarios' into n;
  if n > 0 then
    raise exception 'trol3.escenarios tiene % fila(s): esta migración la reconstruye y las perdería. Revisar antes de aplicar.', n;
  end if;
end $$;

drop table if exists trol3.escenarios cascade;

create table trol3.escenarios (
  id                 uuid primary key default gen_random_uuid(),
  -- Hoy solo 'autorizacion'. El check se amplía cuando haya otro tipo; se deja
  -- explícito para que un typo no cree una categoría fantasma.
  tipo               text        not null default 'autorizacion'
                                 check (tipo in ('autorizacion')),

  -- El sujeto es un expediente (persona) O una consulta de aliado. Son los dos
  -- contextos desde los que la Mesa Viraal autoriza hoy, igual que
  -- trol3.viraal_autorizaciones. `restrict` a propósito: borrar a la persona no
  -- puede llevarse por delante la evidencia de lo que se le autorizó.
  persona_id         uuid        references trol3.personas(id) on delete restrict,
  consulta_aliado_id uuid        references trol3.consultas_aliados(id) on delete restrict,

  -- Semilla completa + historial + fecha de trámite + límite + palancas +
  -- motor_version. Todo lo que hace falta para recalcular y comparar.
  inputs             jsonb       not null,
  -- Los bloques numéricos tal como los devuelve computeProyectoMod40.
  resultado          jsonb       not null,
  -- Salida completa de ventanaMod40, avisos incluidos.
  ventana            jsonb       not null,

  creado_por         uuid        references trol3.miembros(id),
  creado_en          timestamptz not null default now(),

  -- Exactamente un sujeto, nunca cero ni dos.
  constraint escenarios_sujeto_unico check (
    (persona_id is not null)::int + (consulta_aliado_id is not null)::int = 1
  ),
  constraint escenarios_inputs_obj    check (jsonb_typeof(inputs)    = 'object'),
  constraint escenarios_resultado_obj check (jsonb_typeof(resultado) = 'object'),
  constraint escenarios_ventana_obj   check (jsonb_typeof(ventana)   = 'object'),
  -- Sin versión del motor el snapshot no sirve para lo que se hizo: saber si lo
  -- calculó un motor viejo.
  constraint escenarios_motor_version check (inputs ? 'motor_version')
);

comment on table trol3.escenarios is
  'Snapshot inmutable de un escenario autorizado. No se actualiza ni se borra: una autorización nueva es una fila nueva.';
comment on column trol3.escenarios.inputs is
  'Entrada completa del cálculo: semilla, historial, fecha_tramite, limite_inscripcion_mod40, palancas y motor_version.';
comment on column trol3.escenarios.resultado is
  'Bloques numéricos de computeProyectoMod40 al momento de autorizar. Manda sobre cualquier recálculo posterior.';
comment on column trol3.escenarios.ventana is
  'Salida de ventanaMod40 (art. 219/220 LSS) a la fecha de trámite, con sus avisos.';

create index escenarios_persona_idx
  on trol3.escenarios (persona_id, creado_en desc) where persona_id is not null;
create index escenarios_aliado_idx
  on trol3.escenarios (consulta_aliado_id, creado_en desc) where consulta_aliado_id is not null;

-- ---------------------------------------------------------------------------
-- Inmutabilidad. Tres candados, porque cada uno tapa un hueco distinto:
--   1. RLS sin política de INSERT/UPDATE/DELETE  → frena a `authenticated`.
--   2. REVOKE de privilegios de tabla            → frena aunque RLS se apague.
--   3. Trigger                                   → frena a service_role y al
--      dueño, que se saltan RLS (la app usa t3admin() en varios caminos).
-- ---------------------------------------------------------------------------
create or replace function trol3.tg_escenarios_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'escenario_inmutable'
    using errcode = '42501',
          detail  = format('trol3.escenarios no admite %s.', tg_op),
          hint    = 'Un escenario autorizado es un snapshot. Para cambiar algo, autoriza uno nuevo.';
  return null;
end $$;

create trigger escenarios_no_update
  before update on trol3.escenarios
  for each row execute function trol3.tg_escenarios_inmutable();

create trigger escenarios_no_delete
  before delete on trol3.escenarios
  for each row execute function trol3.tg_escenarios_inmutable();

-- TRUNCATE no dispara triggers de fila: necesita el suyo.
create trigger escenarios_no_truncate
  before truncate on trol3.escenarios
  for each statement execute function trol3.tg_escenarios_inmutable();

-- ---------------------------------------------------------------------------
-- RLS. Se replica el patrón del resto de trol3 (`trol3.es_miembro()`), el mismo
-- que usa trol3.viraal_autorizaciones, que es el análogo directo de esta tabla.
--
-- Deliberadamente NO se agrega la política de cliente (`persona_id =
-- trol3.current_persona_id()`) que sí tienen `documentos` y `oportunidades`: el
-- snapshot arrastra costos, gestorías y márgenes del despacho. Si algún día el
-- cliente debe ver su escenario, va por una vista que recorte `resultado`.
--
-- Sin FORCE ROW LEVEL SECURITY a propósito: el dueño de la tabla tiene que poder
-- insertar desde la función SECURITY DEFINER. Ese es justo el único camino de
-- entrada que queremos.
-- ---------------------------------------------------------------------------
alter table trol3.escenarios enable row level security;

create policy escenarios_lectura_miembro on trol3.escenarios
  for select to authenticated
  using (trol3.es_miembro());

revoke all on trol3.escenarios from anon, authenticated;
grant select on trol3.escenarios to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: única puerta de entrada.
-- ---------------------------------------------------------------------------
create or replace function trol3.autorizar_escenario(
  p_persona         uuid,
  p_consulta_aliado uuid,
  p_inputs          jsonb,
  p_resultado       jsonb,
  p_ventana         jsonb,
  p_tipo            text default 'autorizacion'
)
returns uuid
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_id uuid; v_miembro uuid;
begin
  v_miembro := trol3.current_miembro_id();
  if v_miembro is null then
    raise exception 'no_autorizado';
  end if;

  if (p_persona is not null) = (p_consulta_aliado is not null) then
    raise exception 'sujeto_invalido'
      using hint = 'Manda exactamente uno: p_persona o p_consulta_aliado.';
  end if;

  if p_persona is not null
     and not exists (select 1 from trol3.personas where id = p_persona) then
    raise exception 'persona_no_encontrada';
  end if;

  if p_consulta_aliado is not null
     and not exists (select 1 from trol3.consultas_aliados where id = p_consulta_aliado) then
    raise exception 'consulta_no_encontrada';
  end if;

  if jsonb_typeof(p_inputs) is distinct from 'object' or not (p_inputs ? 'motor_version') then
    raise exception 'inputs_invalidos'
      using hint = 'inputs debe ser un objeto e incluir motor_version.';
  end if;
  if jsonb_typeof(p_resultado) is distinct from 'object'
     or jsonb_typeof(p_ventana) is distinct from 'object' then
    raise exception 'snapshot_invalido'
      using hint = 'resultado y ventana deben ser objetos.';
  end if;

  insert into trol3.escenarios
    (tipo, persona_id, consulta_aliado_id, inputs, resultado, ventana, creado_por)
  values
    (coalesce(p_tipo, 'autorizacion'), p_persona, p_consulta_aliado,
     p_inputs, p_resultado, p_ventana, v_miembro)
  returning id into v_id;

  return v_id;
end $$;

comment on function trol3.autorizar_escenario(uuid, uuid, jsonb, jsonb, jsonb, text) is
  'Inserta un snapshot inmutable en trol3.escenarios y devuelve su id. Único camino de escritura.';

revoke all on function trol3.autorizar_escenario(uuid, uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function trol3.autorizar_escenario(uuid, uuid, jsonb, jsonb, jsonb, text) to authenticated;
