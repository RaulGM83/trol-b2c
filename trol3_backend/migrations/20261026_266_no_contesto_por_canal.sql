-- 266 · «No contestó» según cómo se le buscó (Raúl, 26-oct):
--   · Sólo plantilla/WhatsApp, nunca una llamada → a los 7 días vuelve a Tibios como «Toca llamar».
--   · Una llamada sin respuesta → un segundo intento a los 14 días.
--   · Dos llamadas sin respuesta (o ya agotó sus vueltas) → se queda en Fríos hasta que reaccione.
-- Las vueltas van al final de Tibios y el toque sugerido es llamada. Tope de vueltas por número de
-- marcas «no contestó» para que no cicle si nadie llama.
do $mig$
declare src text; a1 text; a2 text; a3 text; a4 text;
begin
  select pg_get_functiondef('trol3.carril_de(uuid)'::regprocedure) into src;
  a1 := $a$  pase record;$a$;
  a2 := $a$    vuelve := case m.motivo
                when 'lo_va_a_pensar' then m.created_at::date + 30
              end;
    if vuelve is not null and vuelve <= hoy and (pot->>'potencial')::numeric > 0 and tel then
      carril := 'tibios'; origen := 'cadencia';$a$;
  a3 := $a$    'toque', jsonb_build_object('n', least(toques + 1, 4),
                                'tipo', case least(toques + 1, 4) when 1 then 'plantilla' when 2 then 'lukas' when 3 then 'llamada' else 'plantilla' end)$a$;
  if position(a1 in src) = 0 or position(a2 in src) = 0 or position(a3 in src) = 0 then raise exception '266: ancla carril_de'; end if;
  src := replace(src, a1, a1 || $b$
  llamadas int; vueltas int; reintento text;$b$);
  src := replace(src, a2, $b$    if m.motivo = 'no_contesto' then
      select count(*) into llamadas from trol3.interacciones i
       where i.persona_id = p and i.direccion = 'saliente' and i.canal = 'llamada' and i.actor_tipo::text = 'asesor'
         and i.created_at <= m.created_at + interval '1 minute';
      select count(*) into vueltas from trol3.carril_marcas k where k.persona_id = p and k.marca = 'frio' and k.motivo = 'no_contesto';
      if llamadas = 0 and vueltas <= 2 then vuelve := m.created_at::date + 7; reintento := 'toca_llamar';
      elsif llamadas = 1 and vueltas <= 3 then vuelve := m.created_at::date + 14; reintento := 'segundo_intento';
      end if;
    elsif m.motivo = 'lo_va_a_pensar' then
      vuelve := m.created_at::date + 30; reintento := 'cadencia';
    end if;
    if vuelve is not null and vuelve <= hoy and (pot->>'potencial')::numeric > 0 and tel then
      carril := 'tibios'; origen := reintento;$b$);
  src := replace(src, a3, $b$    'toque', jsonb_build_object('n', least(toques + 1, 4),
                                'tipo', case when origen in ('toca_llamar', 'segundo_intento') then 'llamada'
                                             else case least(toques + 1, 4) when 1 then 'plantilla' when 2 then 'lukas' when 3 then 'llamada' else 'plantilla' end end)$b$);
  execute src;

  select pg_get_functiondef('trol3.mi_tibios(text,text,integer)'::regprocedure) into src;
  a4 := $a$when 'cadencia' then 10$a$;
  if position(a4 in src) = 0 then raise exception '266: ancla mi_tibios'; end if;
  src := replace(src, a4, $b$when 'cadencia' then 10 when 'toca_llamar' then 10 when 'segundo_intento' then 10$b$);
  execute src;
end $mig$;
