-- 29-oct-2026 · Aplicadas en producción vía MCP (orgagfdxygtjiwqvgckw). Este archivo es el registro.
--
-- 273/274 · Precalix: costo $4 por consulta nueva (duplicados gratis), goteo de lotes y campañas.
--   update trol3.proveedores set costo_unitario = 4 where codigo = 'precalix';
--   trol3.goteo_precalix(p_clave, p_motivo, p_n, p_tope default 20, p_gratis default false):
--     lanza hasta p_n consultas de la lista config.<p_clave> (ids de persona o NSS) con
--     pedir_consulta(...,'infonavit','sistema',...,p_motivo, forzar=true); tope de p_tope en curso;
--     no lanza si hay alguna sin aceptar > 3 min y nada terminó en 10 min (salud de Precalix);
--     se des-programa (cron 'trol3-goteo-'||p_motivo) al terminar la lista.
--   Campaña 29-oct: config.campana_precalix_20261029 (200 personas: < 55 años, Infonavit estimado
--     >= $300k, empleadas, cotizando desde agosto), cron cada 5 min, 10 a la vez.
--   Relote broker→Precalix: config.relote_precalix_nss (81 NSS), costo 0. Terminado.
--
-- 275 · evaluar_persona: relación laboral de Infonavit (Precalix/broker) vs IMSS.
--   Si relacion_laboral_vigente (validado) es más reciente que status_empleo validado:
--     false + IMSS 'empleado'  → no cuenta como empleado para compra/inversión de inmueble y
--                                checklist datos_vigentes = alerta "actualiza el historial IMSS".
--     true  + IMSS no empleado → cuenta como empleado para Infonavit + misma alerta.
--   Nunca pide Jordan solo (decisión Raúl).
--
-- 276 · Tarea "Cotización inicial Infonavit lista" para el asesor de cabecera.
insert into trol3.config(clave, valor) values ('cotizacion_infonavit_saldo_min', '370000')
on conflict (clave) do update set valor = excluded.valor, updated_at = now();

create or replace function trol3.tg_tarea_cotizacion_infonavit()
returns trigger language plpgsql security definer set search_path to 'trol3','public' as $$
declare v_cab uuid; v_saldo numeric; v_monto numeric;
begin
  if new.capa <> 'validado' or coalesce(new.proveedor,'') <> 'precalix' or new.consulta_id is null then return new; end if;
  select cabecera_id into v_cab from trol3.personas where id = new.persona_id;
  if v_cab is null then return new; end if;
  select max((d.valor#>>'{}')::numeric) filter (where d.campo = 'saldo_infonavit'),
         max((d.valor#>>'{}')::numeric) filter (where d.campo = 'infonavit_monto_credito')
    into v_saldo, v_monto
    from trol3.datos d where d.consulta_id = new.consulta_id and d.campo in ('saldo_infonavit','infonavit_monto_credito');
  if v_saldo is null or v_monto is null then return new; end if;
  if v_saldo < coalesce((select valor::numeric from trol3.config where clave = 'cotizacion_infonavit_saldo_min'), 370000) then return new; end if;
  if exists (select 1 from trol3.tareas t where t.persona_id = new.persona_id and t.origen = 'cotizacion_infonavit' and t.estado = 'pendiente') then return new; end if;
  insert into trol3.tareas (persona_id, titulo, detalle, responsable_id, vence_el, estado, origen, origen_id)
  values (new.persona_id, 'Cotización inicial Infonavit lista',
          'Precalix: saldo $' || to_char(round(v_saldo), 'FM999,999,999') || ', crédito hasta $' || to_char(round(v_monto), 'FM999,999,999') ||
          '. Compártela por WhatsApp desde la pestaña Infonavit (18 y 60 meses).',
          v_cab, trol3._hoy_mx() + 2, 'pendiente', 'cotizacion_infonavit', new.consulta_id);
  return new;
end $$;

drop trigger if exists tg_tarea_cotizacion_infonavit on trol3.datos;
create trigger tg_tarea_cotizacion_infonavit after insert on trol3.datos
  for each row when (new.campo in ('infonavit_monto_credito','saldo_infonavit')) execute function trol3.tg_tarea_cotizacion_infonavit();
