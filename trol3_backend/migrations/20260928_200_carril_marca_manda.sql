-- 200 · Carriles: la marca del asesor manda sobre lo que pasó antes (claude/84; Vero, 28-sep).
-- Bug: carril_de revisaba "reaccionó en 7 días", "llegó hoy", "cita" y "tocado hoy" ANTES que la marca
-- frío/favorito. Enfriar (o marcar favorito) a alguien que había contestado o que se tocó hoy no lo movía:
-- seguía en Calientes hasta que pasaran 7 días, y el lugar del tope no se liberaba.
-- Regla nueva: una marca frío/favorito puesta DESPUÉS del último gesto y del último toque manda.
-- Lo que pase después (el cliente escribe, lo volvemos a tocar) la vence, como antes.
-- También _toques_hoy.abiertos deja de contar a los que se enfriaron, descartaron, marcaron favorito
-- o pasaron a trámite después del toque.

do $$
declare src text;
begin
  src := pg_get_functiondef('trol3.carril_de(uuid)'::regprocedure);
  src := replace(src, 'carril text; origen text; vuelve date; toques int;',
                      'carril text; origen text; vuelve date; toques int; manda boolean := false;');
  src := replace(src,
    $a$  if hay_marca and m.marca <> 'descartado' and g is not null and g > m.created_at then hay_marca := false; end if;
$a$,
    $b$  if hay_marca and m.marca <> 'descartado' and g is not null and g > m.created_at then hay_marca := false; end if;
  -- 200: frío/favorito puesto después del último gesto y del último toque manda sobre Calientes.
  manda := hay_marca and m.marca in ('frio', 'favorito') and (t is null or m.created_at >= t);
$b$);
  src := replace(src, $a$  elsif g is not null and g >= now() - make_interval(days => gd) then$a$,
                      $b$  elsif not manda and g is not null and g >= now() - make_interval(days => gd) then$b$);
  src := replace(src, $a$  elsif (per.created_at at time zone 'America/Mexico_City')::date = hoy then$a$,
                      $b$  elsif not manda and (per.created_at at time zone 'America/Mexico_City')::date = hoy then$b$);
  src := replace(src, $a$  elsif cita is not null then$a$,
                      $b$  elsif not manda and cita is not null then$b$);
  src := replace(src, $a$  elsif t is not null and (t at time zone 'America/Mexico_City')::date = hoy then$a$,
                      $b$  elsif not manda and t is not null and (t at time zone 'America/Mexico_City')::date = hoy then$b$);
  if (length(src) - length(replace(src, 'not manda and', ''))) / length('not manda and') <> 4
     or position('manda := hay_marca' in src) = 0 then
    raise exception 'parche 200 a carril_de no encajó';
  end if;
  execute src;

  src := pg_get_functiondef('trol3._toques_hoy(uuid)'::regprocedure);
  src := replace(src,
    $a$(select count(*) from t where coalesce(trol3._ultimo_gesto(t.persona_id), '-infinity') < t.t))$a$,
    $b$(select count(*) from t where coalesce(trol3._ultimo_gesto(t.persona_id), '-infinity') < t.t
        -- 200: enfriado, descartado o favorito después del toque, sin contacto o ya en trámite: libera el lugar
        and not exists (select 1 from trol3.carril_marcas k where k.persona_id = t.persona_id and k.activa
                          and k.marca in ('frio', 'descartado', 'favorito') and k.created_at >= t.t)
        and not exists (select 1 from trol3.contactos c where c.persona_id = t.persona_id and c.no_contactar)
        and not exists (select 1 from trol3.oportunidades o where o.persona_id = t.persona_id and o.estado = 'en_proceso')))$b$);
  if position('200: enfriado' in src) = 0 then raise exception 'parche 200 a _toques_hoy no encajó'; end if;
  execute src;
end $$;
