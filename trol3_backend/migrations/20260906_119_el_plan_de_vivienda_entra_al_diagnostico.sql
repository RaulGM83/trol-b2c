-- 119 — el plan de vivienda entra al diagnóstico.
--
-- La asesoría Infonavit vivía en su propia pestaña y no llegaba al documento:
-- el mismo hueco que motivó todo el rediseño, sólo que en la otra puerta. Un
-- cliente con Laureles apalabrado recibía una sección de Infonavit genérica.
--
-- Encuadre (Raúl, 6-sep-2026): comprar la casa NO compite con la pensión, es el
-- primer tiempo de la misma estrategia — se compra, y al corte el efectivo que
-- sale alimenta el ahorro que sí levanta la pensión. Por eso no hace falta que
-- los horizontes del plan cuadren con los del escenario: son dos tramos, no dos
-- versiones de lo mismo.
--
-- Cuáles entran lo decide el asesor, como con los escenarios: hay quien guarda
-- tres tanteando, y ninguna debe colarse al documento sola.
--
-- Va como columna propia y no dentro de `contenido` porque es una liga a filas
-- que existen aparte, igual que `escenario_ids`.

alter table trol3.diagnosticos
  add column if not exists asesoria_ids uuid[] not null default '{}';

comment on column trol3.diagnosticos.asesoria_ids is
  'Asesorías Infonavit que el asesor eligió incluir. Vacío = el documento no habla de un plan concreto. 119.';


-- Función aparte, no un parámetro más de `abrir_diagnostico`: agregarle
-- parámetros habría creado una SOBRECARGA y PostgREST deja de saber a cuál
-- llamar. Ya rompió dos veces (109b, 110b).
create or replace function trol3.ligar_asesorias(
  p_diagnostico uuid,
  p_asesorias   uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_persona uuid; v_n int;
begin
  if trol3.current_miembro_id() is null then raise exception 'no_autorizado'; end if;

  select persona_id into v_persona from trol3.diagnosticos where id = p_diagnostico;
  if v_persona is null then raise exception 'diagnostico_no_encontrado'; end if;

  if p_asesorias is not null and array_length(p_asesorias, 1) is not null then
    -- Que sean de esta persona. Cuenta como suya también donde es cotitular:
    -- el plan de la pareja es tan suyo como el propio, y ese caso ya existe.
    select count(*) into v_n
      from trol3.infonavit_asesorias a
     where a.id = any(p_asesorias)
       and (a.persona_id = v_persona or a.cotitular_persona_id = v_persona);
    if v_n <> array_length(p_asesorias, 1) then
      raise exception 'asesoria_ajena'
        using hint = 'Todas las asesorías deben existir y ser de esta persona o de un plan donde sea cotitular.';
    end if;
  end if;

  update trol3.diagnosticos
     set asesoria_ids = coalesce(p_asesorias, '{}'::uuid[]),
         actualizado_por = trol3.current_miembro_id()
   where id = p_diagnostico;
end $$;

comment on function trol3.ligar_asesorias is
  'Fija qué asesorías Infonavit entran al diagnóstico. Acepta las de cotitular. 119.';

grant execute on function trol3.ligar_asesorias(uuid, uuid[]) to authenticated;