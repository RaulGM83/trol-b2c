-- 234b · No avisar «llegó tu información» cuando lo que llegó era más viejo que lo que ya tenía (11-oct-2026)
--
-- Con la cascada 234 un cliente que ya tenía historial (p. ej. «ya era cliente» del FIP) puede recibir
-- una consulta Belvo que termina `completada` pero cuyo reporte el candado 233b tiró por viejo
-- (`dato_viejo_ignorado` con ese consulta_id). Para él no llegó nada nuevo: no se le avisa.

do $mig$
declare src text;
begin
  select pg_get_functiondef('trol3.tg_avisar_consulta_lista()'::regprocedure) into src;
  if position($a$  select valor into interruptor from trol3.config where clave = 'avisar_consulta_lista';$a$ in src) = 0 then
    raise exception '234b: ancla no encontrada';
  end if;
  src := replace(src, $a$  select valor into interruptor from trol3.config where clave = 'avisar_consulta_lista';$a$,
$b$  -- 234b: si el candado de frescura tiró lo que trajo esta consulta, no hay nada nuevo que avisar.
  if exists (
    select 1 from trol3.eventos x
    where x.persona_id = new.persona_id and x.tipo = 'dato_viejo_ignorado'
      and x.payload ->> 'consulta_id' = new.payload ->> 'consulta_id'
      and x.created_at > now() - interval '1 hour'
  ) then return new; end if;

  select valor into interruptor from trol3.config where clave = 'avisar_consulta_lista';$b$);
  execute src;
end $mig$;
