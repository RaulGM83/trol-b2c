-- 156: que /mi sepa si tiene sentido ofrecer la actualización, antes de ofrecerla.
--
-- Un botón que sólo puede fallar es peor que no tener botón: el cliente lo
-- aprieta, se lleva una negativa y aprende que la app no sirve. Con esto la
-- pantalla decide antes de pintarlo, y cuando lo pinta dice el precio.
create or replace function trol3.mi_actualizacion_imss()
returns jsonb
language plpgsql
stable security definer
set search_path to 'trol3','public'
as $$
declare pid uuid := trol3.current_persona_id(); desde timestamptz; precio numeric; saldo int; enCurso boolean;
begin
  if pid is null then return null; end if;
  select precio_mxn into precio from trol3.productos where codigo = 'actualizacion_datos' and activo;
  select max(d.obtenido_en) into desde from trol3.datos d
   where d.persona_id = pid and d.campo = 'semanas_cotizadas' and d.capa = 'validado';
  select exists (select 1 from trol3.consultas c
                  where c.persona_id = pid and c.tipo = 'imss_historial'
                    and c.estado in ('solicitada','en_proceso')) into enCurso;
  saldo := trol3.mi_saldo_puntos();
  return jsonb_build_object(
    'ofrecer', desde is not null and desde < now() - interval '3 months' and not enCurso and precio is not null,
    'desde', desde,
    'en_curso', enCurso,
    'precio', precio,
    'saldo', saldo,
    'alcanzan_puntos', saldo >= coalesce(precio, 0)
  );
end $$;

grant execute on function trol3.mi_actualizacion_imss() to authenticated;
