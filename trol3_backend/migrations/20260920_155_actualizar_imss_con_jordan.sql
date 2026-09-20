-- 155: "Actualizar mi información del IMSS" hace algo de verdad, y cuesta.
--
-- El botón de /mi prometía una actualización que era imposible: antes de los 90
-- días lo frenaba el candado de frescura, y después lo frenaba el de Belvo —que
-- devuelve el reporte congelado del link y no mira antigüedad—. Un cliente con
-- datos cargados estaba bloqueado para siempre, por un camino o por el otro, y
-- encima /mi le decía "ya hay una consulta en curso", que era mentira.
--
-- Ahora: sólo se ofrece cuando su información tiene más de 3 meses, la trae
-- Jordan (consulta viva, $13 de costo real) y el cliente paga 50 pesos o 50
-- puntos. Así `pagador = 'cliente'` por fin dice la verdad.
update trol3.productos
   set precio_mxn = 50, max_pct_puntos = 100,
       nombre = 'Actualizar mi información del IMSS'
 where codigo = 'actualizacion_datos';

/**
 * Lo pide el cliente desde su cuenta. Cobra primero y consulta después: al revés
 * gastaríamos los $13 de Jordan sin haber cobrado, y con el cobro hecho una
 * negativa de pedir_consulta dejaría al cliente pagando por nada. Por eso todas
 * las comprobaciones van antes del cargo, y la consulta va forzada: ya se validó
 * aquí lo que los candados genéricos volverían a mirar.
 */
create or replace function trol3.actualizar_imss_mia()
returns jsonb
language plpgsql
security definer
set search_path to 'trol3','public'
as $$
declare
  pid uuid := trol3.current_persona_id();
  pr record; saldo int; desde timestamptz; r jsonb; oid uuid;
begin
  if pid is null then raise exception 'sin_persona'; end if;
  select * into pr from trol3.productos where codigo = 'actualizacion_datos' and activo;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'producto_no_disponible'); end if;

  -- ¿Hay algo que actualizar? Sin dato previo esto no es una actualización:
  -- es la primera búsqueda, y ésa es gratis y la dispara la CURP.
  select max(d.obtenido_en) into desde from trol3.datos d
   where d.persona_id = pid and d.campo = 'semanas_cotizadas' and d.capa = 'validado';
  if desde is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_datos_previos');
  end if;
  if desde > now() - interval '3 months' then
    return jsonb_build_object('ok', false, 'motivo', 'aun_reciente', 'desde', desde);
  end if;

  -- Que no haya una en vuelo: cobrar dos veces por el mismo dato no se arregla solo.
  if exists (select 1 from trol3.consultas c
              where c.persona_id = pid and c.tipo = 'imss_historial'
                and c.estado in ('solicitada','en_proceso')) then
    return jsonb_build_object('ok', false, 'motivo', 'consulta_en_curso');
  end if;

  -- El cobro: puntos si alcanzan; si no, que pase por caja.
  saldo := trol3.mi_saldo_puntos();
  if saldo < pr.precio_mxn then
    return jsonb_build_object('ok', false, 'motivo', 'requiere_pago',
      'precio', pr.precio_mxn, 'saldo', saldo, 'producto', pr.codigo);
  end if;

  insert into trol3.puntos (persona_id, tipo, motivo, puntos, referencia_tipo)
  values (pid, 'cargo', 'Canje: '||pr.nombre, pr.precio_mxn::int, 'canje:'||pr.codigo);
  insert into trol3.ordenes (persona_id, producto, monto, puntos_aplicados, estado, payment_provider, paid_at)
  values (pid, pr.codigo, 0, pr.precio_mxn::int, 'cumplida', 'puntos', now())
  returning id into oid;

  -- Jordan, no Belvo: Belvo es caché y no puede traer nada nuevo. Forzada porque
  -- los candados de frescura ya se comprobaron arriba, y notificando porque el
  -- cliente la pidió y espera el aviso (150).
  r := trol3.pedir_consulta(pid, 'imss_historial', 'cliente', pid, 'cliente', true,
                            'actualización pagada desde /mi', true, 'jordan');
  if not coalesce((r->>'ok')::boolean, false) then
    -- Devolver los puntos: el cliente no se queda sin ellos y sin dato.
    insert into trol3.puntos (persona_id, tipo, motivo, puntos, referencia_tipo)
    values (pid, 'abono', 'Devolución: no se pudo pedir la actualización', pr.precio_mxn::int, 'canje:'||pr.codigo);
    update trol3.ordenes set estado = 'cancelada' where id = oid;
    return jsonb_build_object('ok', false, 'motivo', 'no_se_pudo_pedir', 'detalle', r);
  end if;

  return jsonb_build_object('ok', true, 'orden_id', oid, 'saldo', saldo - pr.precio_mxn::int,
                            'consulta_id', r->>'consulta_id');
end $$;

grant execute on function trol3.actualizar_imss_mia() to authenticated;
