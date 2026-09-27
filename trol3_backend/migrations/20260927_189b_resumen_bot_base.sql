-- 189b · Lukas ve qué falta del paso cero (claude/86): `trolExpediente.base = {listos, faltan[]}`.
-- Con eso pregunta sólo lo que falta y no repite lo que el asesor o el cliente ya contestaron.
do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.resumen_bot(uuid)'::regprocedure);
  if position('''base'', (select jsonb_build_object(''listos''' in src) = 0 then
    src := replace(src,
      '    ''declarados'', (select jsonb_object_agg(campo, valor)',
      '    ''base'', (select jsonb_build_object(''listos'', b->''listos'', ''total'', b->''total'', ''faltan'', coalesce((select jsonb_agg(q->>''titulo'') from jsonb_array_elements(b->''preguntas'') q where q->>''estado'' = ''falta''), ''[]''::jsonb)) from trol3.base_asesoria(e.persona_id) b),' || chr(10) ||
      '    ''declarados'', (select jsonb_object_agg(campo, valor)');
    execute src;
  end if;
end $$;
