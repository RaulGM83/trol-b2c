-- 202 · El resumen visible del aviso "consulta_lista" decía «información oficial» (lo escribe api-trol desde su tabla).
-- El trigger manda su propio resumen (en el body manda sobre la tabla) y se corrige el historial ya escrito.
-- (También se corrigió el texto en trol3_backend/edge/api-trol/index.ts para el próximo deploy.)
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.tg_avisar_consulta_lista()'::regprocedure);
  src := replace(src, $a$      'plantilla', plantilla,
$a$, $b$      'plantilla', plantilla,
      'resumen', 'Llegó tu información del IMSS y actualizamos tus números.',
$b$);
  if position('Llegó tu información del IMSS' in src) = 0 then raise exception 'parche 202 no encajó'; end if;
  execute src;
end $$;
update trol3.interacciones set contenido = 'Llegó tu información del IMSS y actualizamos tus números.'
 where contenido = 'Llegó tu información oficial del IMSS y actualizamos tus números.';
