-- 247 · Crédito Infonavit vigente (respuesta del broker "CREDITO VIGENTE: <num>")
-- Si hay crédito vigente VERIFICADO (capa validado), el saldo de vivienda deja de contar como
-- disponible en v_expediente (expediente, calculadora, oportunidades, /mi): saldo = 0, origen
-- 'credito_vigente'. El estimado sigue en saldo_infonavit_estimado como referencia.
-- Excepción: un saldo validado MÁS NUEVO que el crédito (p.ej. lo liquidó) vuelve a mandar.

insert into trol3.catalogo_campos (campo, nombre, grupo, tipo, unidad, vigencia_dias, editable_cliente, visible_cliente, visible_aliado, orden)
values ('numero_credito_infonavit', 'Número de crédito Infonavit', 'infonavit', 'text', null, 180, false, true, true, 47)
on conflict (campo) do update set nombre = excluded.nombre, grupo = excluded.grupo, tipo = excluded.tipo, orden = excluded.orden;

do $mig$
declare d text; cv text; n int;
begin
  d := pg_get_viewdef('trol3.v_expediente'::regclass);
  cv := $c$(((md.kv -> 'credito_infonavit_vigente') ->> 'capa') = 'validado'
      AND COALESCE(trol3.jbool((md.kv -> 'credito_infonavit_vigente') -> 'v'), false)
      AND NOT (COALESCE((md.kv -> 'saldo_infonavit') ->> 'capa', '') = 'validado'
               AND (((md.kv -> 'saldo_infonavit') ->> 'en'))::timestamptz > (((md.kv -> 'credito_infonavit_vigente') ->> 'en'))::timestamptz))$c$;

  n := length(d);
  d := replace(d,
    $o$COALESCE(trol3.jnum(((md.kv -> 'saldo_infonavit'::text) -> 'v'::text)), trol3.jnum(((md.kv -> 'infonavit_estimado'::text) -> 'v'::text))) AS saldo_infonavit,$o$,
    'CASE WHEN ' || cv || $o$ THEN 0::numeric ELSE COALESCE(trol3.jnum(((md.kv -> 'saldo_infonavit'::text) -> 'v'::text)), trol3.jnum(((md.kv -> 'infonavit_estimado'::text) -> 'v'::text))) END AS saldo_infonavit,$o$);
  if length(d) = n then raise exception '247: no encontré saldo_infonavit'; end if;

  n := length(d);
  d := replace(d,
    $o$        CASE
            WHEN ((md.kv -> 'saldo_infonavit'::text) IS NOT NULL) THEN ((md.kv -> 'saldo_infonavit'::text) ->> 'capa'::text)$o$,
    $o$        CASE
            WHEN $o$ || cv || $o$ THEN 'validado'::text
            WHEN ((md.kv -> 'saldo_infonavit'::text) IS NOT NULL) THEN ((md.kv -> 'saldo_infonavit'::text) ->> 'capa'::text)$o$);
  if length(d) = n then raise exception '247: no encontré saldo_infonavit_capa'; end if;

  n := length(d);
  d := replace(d,
    $o$        CASE
            WHEN ((md.kv -> 'saldo_infonavit'::text) IS NOT NULL) THEN ((md.kv -> 'saldo_infonavit'::text) ->> 'orig'::text)$o$,
    $o$        CASE
            WHEN $o$ || cv || $o$ THEN 'credito_vigente'::text
            WHEN ((md.kv -> 'saldo_infonavit'::text) IS NOT NULL) THEN ((md.kv -> 'saldo_infonavit'::text) ->> 'orig'::text)$o$);
  if length(d) = n then raise exception '247: no encontré saldo_infonavit_origen'; end if;

  execute 'create or replace view trol3.v_expediente as ' || d;
end $mig$;
