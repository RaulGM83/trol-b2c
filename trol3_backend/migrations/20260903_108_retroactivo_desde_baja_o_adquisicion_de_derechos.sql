-- 108: el retroactivo corre desde la MAS TARDIA de dos fechas (regla de Raul):
--   a) la fecha de baja (ultima cotizacion), y
--   b) la fecha en que adquirio el derecho (cumplir 60).
-- Antes se calculaba solo desde los 60, lo que inflaba el retroactivo de todo el que
-- siguio cotizando despues de cumplirlos. Tope de 12 meses.
--
-- Salvedad de dato (Raul): cuando el calculo se hizo con la persona empleada, el modelo
-- asume que siguio cotizando hasta hoy, asi que ultima_cotizacion puede venir corrida.
-- El numero fino sale al refrescar, y refrescar solo a quien reacciona es lo correcto.

create or replace function trol3.meses_retro(p_cumple_60 date, p_ultima_cot date)
returns int language sql immutable as $$
  select case when p_cumple_60 is null then null
         else least(12, greatest(0,
           floor(extract(epoch from age(current_date,
             greatest(p_cumple_60, coalesce(p_ultima_cot, p_cumple_60))))/2629800)::int))
         end
$$;

comment on function trol3.meses_retro(date, date) is
'Meses de retroactivo de pension disponibles hoy: corren desde la mas tardia entre la baja y el cumplimiento de los 60, topados a 12.';
