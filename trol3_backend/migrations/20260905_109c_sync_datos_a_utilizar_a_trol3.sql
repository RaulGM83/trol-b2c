-- 109c — lo que el asesor captura llega hasta trol3.datos.
--
-- sync_saldos_corregidos ya bajaba dos campos del jsonb de public.clientes a
-- la capa 'declarado' de trol3.datos. Ahora baja los nueve, para que el
-- expediente, las vistas de campaña y el motor vean el mismo número que el
-- asesor tecleó en la calculadora.
--
-- El nombre del campo en trol3 no siempre coincide con la clave del jsonb
-- (rcv97 → saldo_rcv97, infonavit → saldo_infonavit), así que el mapeo vive
-- aquí, explícito, en vez de deducirse.

create or replace function trol3.sync_saldos_corregidos(p_cliente uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'trol3', 'public'
as $function$
declare
  pid uuid; sc jsonb; at timestamptz;
  par text[][] := array[
    ['rcv97',                     'saldo_rcv97'],
    ['disponible_afore',          'disponible_afore'],
    ['infonavit',                 'saldo_infonavit'],
    ['ahorro_voluntario',         'ahorro_voluntario'],
    ['ahorro_voluntario_mensual', 'ahorro_voluntario_mensual'],
    ['plan_corporativo',          'plan_corporativo'],
    ['plan_corporativo_mensual',  'plan_corporativo_mensual'],
    ['otros_planes',              'otros_planes'],
    ['otros_planes_mensual',      'otros_planes_mensual']
  ];
  i int;
begin
  select p.id, c.saldos_corregidos into pid, sc
    from public.clientes c
    join trol3.personas p on p.legacy_cliente_id = c.id
   where c.id = p_cliente;
  if pid is null or sc is null then return; end if;

  at := coalesce(trol3.to_date_safe(sc->>'actualizado_at')::timestamptz, now());
  perform set_config('trol3.skip_reeval','1',true);

  for i in 1 .. array_length(par, 1) loop
    -- Sólo los campos que el asesor realmente capturó: una clave ausente no
    -- debe escribir un null encima de un dato validado.
    if sc ? par[i][1] and jsonb_typeof(sc->par[i][1]) <> 'null' then
      perform trol3._dato_si_cambio(
        pid, par[i][2], to_jsonb(trol3.to_num_safe(sc->>par[i][1])),
        'declarado', 'asesor_portal', at);
    end if;
  end loop;

  perform set_config('trol3.skip_reeval','',true);
  perform trol3.evaluar_persona(pid);
end $function$;

comment on function trol3.sync_saldos_corregidos is
  'Baja los datos a utilizar capturados en el portal (public.clientes.saldos_corregidos) a la capa declarado de trol3.datos. 109c: los nueve campos, y sólo los que vienen con valor.';
