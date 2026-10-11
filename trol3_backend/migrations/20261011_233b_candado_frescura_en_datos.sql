-- 233b · Candado de frescura en trol3.datos (11-oct-2026)
--
-- La 233 protege el puente public.clientes → trol3, pero Calculos también escribe directo
-- vía api-trol /consulta/resultado (filas validado/belvo). Este trigger cubre TODOS los caminos:
-- un dato `validado` de un proveedor de historial IMSS (belvo · sisec · jordan · pdf_semanas)
-- con `obtenido_en` (= fecha del reporte) MENOR al que ya tenemos para esa persona y campo
-- no entra. Emite `dato_viejo_ignorado` una vez por consulta (sólo en semanas_cotizadas).
-- Igual fecha sí entra (idempotente con _dato_si_cambio). Capas declarado/calculado no se tocan.

create or replace function trol3.tg_datos_candado_frescura()
returns trigger
language plpgsql
set search_path to 'trol3', 'public'
as $$
declare v_max timestamptz;
begin
  if new.capa <> 'validado' or coalesce(new.proveedor, '') not in ('belvo', 'sisec', 'jordan', 'pdf_semanas') then
    return new;
  end if;
  if new.obtenido_en is null then return new; end if;
  select max(d.obtenido_en) into v_max
    from trol3.datos d
   where d.persona_id = new.persona_id and d.campo = new.campo and d.capa = 'validado'
     and d.proveedor in ('belvo', 'sisec', 'jordan', 'pdf_semanas');
  if v_max is not null and new.obtenido_en < v_max then
    if new.campo = 'semanas_cotizadas' then
      perform trol3.emitir_evento(new.persona_id, 'dato_viejo_ignorado', 'sistema', null,
        jsonb_build_object('campo', new.campo, 'proveedor', new.proveedor, 'obtenido_en', new.obtenido_en,
                           'vigente_en_base', v_max, 'consulta_id', new.consulta_id));
    end if;
    return null;
  end if;
  return new;
end $$;

revoke all on function trol3.tg_datos_candado_frescura() from public, anon, authenticated;

create trigger aa_candado_frescura
  before insert on trol3.datos
  for each row execute function trol3.tg_datos_candado_frescura();
