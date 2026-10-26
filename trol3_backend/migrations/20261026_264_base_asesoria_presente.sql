-- 264 · «Lo que ya sabemos» (paso 0): sin pensión estimada; en su lugar el presente —si cotiza,
-- último salario de cotización, desde cuándo no cotiza— (Raúl, 26-oct).
do $mig$
declare src text; a1 text;
begin
  select pg_get_functiondef('trol3.base_asesoria(uuid)'::regprocedure) into src;
  a1 := $a$'edad', e.edad, 'edad_decimal', edad_dec, 'status_empleo', e.status_empleo,$a$;
  if position(a1 in src) = 0 then raise exception '264: ancla base_asesoria'; end if;
  src := replace(src, a1, a1 || $b$
      'salario_diario', (select md.valor from trol3.v_mejor_dato md where md.persona_id = p_persona and md.campo = 'salario_diario'),
      'ultima_cotizacion', (select md.valor from trol3.v_mejor_dato md where md.persona_id = p_persona and md.campo = 'ultima_cotizacion'),
      'gap_meses', (select md.valor from trol3.v_mejor_dato md where md.persona_id = p_persona and md.campo = 'gap_meses'),
      'cotiza_hoy', (select md.valor from trol3.v_mejor_dato md where md.persona_id = p_persona and md.campo = 'relacion_laboral_vigente'),$b$);
  execute src;
end $mig$;
