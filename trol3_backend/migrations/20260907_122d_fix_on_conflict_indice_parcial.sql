-- 122d — `on conflict (col)` no encuentra un índice PARCIAL si no se repite su
-- predicado. El índice que impide devengar dos veces por la misma oportunidad
-- es `... where oportunidad_id is not null`, así que el ON CONFLICT tiene que
-- decir lo mismo. Sin esto, ganar una oportunidad revienta con
-- "no unique or exclusion constraint matching" — y lo que revienta es el UPDATE
-- de la oportunidad, no la comisión: un aliado mal configurado habría impedido
-- cerrar una venta.

create or replace function trol3.tg_devengar_comision()
returns trigger
language plpgsql
security definer
set search_path to 'trol3', 'public'
as $$
declare v_ref record; v_pct numeric; v_base numeric;
begin
  if new.estado <> 'ganada' or coalesce(old.estado::text, '') = 'ganada' then
    return new;
  end if;

  select r.id, r.aliado_id, a.comision_pct
    into v_ref
    from trol3.referidos r
    join trol3.aliados a on a.id = r.aliado_id
   where r.persona_id = new.persona_id
     and r.estado = 'atribuido'
     and a.activo
   order by r.creado_en
   limit 1;

  if v_ref.id is null then return new; end if;

  v_pct := v_ref.comision_pct;
  if v_pct is null then return new; end if;

  v_base := coalesce(new.valor_estimado, 0);
  if v_base <= 0 then return new; end if;

  -- Nada de lo que pase aquí debe poder impedir que una venta se cierre. La
  -- comisión es un efecto secundario del negocio, no un requisito suyo.
  begin
    insert into trol3.comisiones
      (aliado_id, referido_id, persona_id, oportunidad_id, base, pct, monto)
    values
      (v_ref.aliado_id, v_ref.id, new.persona_id, new.id,
       v_base, v_pct, round(v_base * v_pct, 2))
    on conflict (oportunidad_id) where oportunidad_id is not null do nothing;
  exception when others then
    raise warning 'no se pudo devengar la comisión de la oportunidad %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

comment on function trol3.tg_devengar_comision is
  'Devenga la comisión al cruzar una oportunidad a ganada. Congela base y pct. Nunca impide cerrar la venta. 122b, 122d.';