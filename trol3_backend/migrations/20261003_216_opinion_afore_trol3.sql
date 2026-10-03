-- 216 · Opinión sobre la AFORE, dentro de trol3 (claude/97). 3-oct-2026. Decisión de Raul.
--
-- La encuesta de AFORE vivía en el mundo legacy: `public.encuesta_afore` por cliente_id, un
-- trigger que encolaba avisos y un workflow de n8n (cada 5 min, anon key) que mandaba un correo
-- por respuesta. 47 respuestas, la última el 21-ago; el workflow se apaga hoy.
--
-- Qué queda: de las ~15 preguntas, 12 ya las cubren «los cinco» del paso 0 y los datos. Lo que
-- aporta es la OPINIÓN: atención (1–5), herramientas de asesoría (1–5), recomendaría (0–10) y un
-- comentario. Eso es lo que se guarda aquí, por persona, y es la base del «Índice Trol de AFOREs».
--
--   · `trol3.opiniones_afore` (una por persona, se actualiza).
--   · `opinar_afore(...)`: la llama el cliente desde /encuesta. Guarda la opinión, declara
--     `afore_actual` como dato del cliente, deja una línea en su historia (gesto → Calientes),
--     da los 50 puntos de `encuesta_afore` (una vez) y emite el evento `opinion_afore`.
--   · `indice_afores()`: NPS, atención y asesoría por AFORE con n (sólo equipo; publicable a
--     partir de n ≥ 30 por AFORE).
--   · Las 47 respuestas legacy se migran con `origen = 'legacy'`.
--   · `public.responder_encuesta_afore` deja de ser ejecutable por clientes.

create table if not exists trol3.opiniones_afore (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references trol3.personas(id) on delete cascade,
  afore text not null,
  atencion smallint check (atencion between 1 and 5),
  asesoria smallint check (asesoria between 1 and 5),
  recomendaria smallint check (recomendaria between 0 and 10),
  comentario text,
  origen text not null default 'app',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (persona_id)
);
comment on table trol3.opiniones_afore is '216: cómo califica cada cliente a su AFORE (atención, herramientas de asesoría, recomendaría 0–10). Una por persona; base del Índice Trol de AFOREs.';
create index if not exists ix_opiniones_afore_afore on trol3.opiniones_afore (afore);

alter table trol3.opiniones_afore enable row level security;
do $$ begin
  execute 'create policy opiniones_miembro on trol3.opiniones_afore for all to authenticated using (trol3.es_miembro()) with check (trol3.es_miembro())';
  execute 'create policy opiniones_propia on trol3.opiniones_afore for select to authenticated using (persona_id = trol3.current_persona_id())';
  execute 'grant select on trol3.opiniones_afore to authenticated';
  execute 'grant all on trol3.opiniones_afore to service_role';
end $$;

-- El cliente opina sobre su AFORE.
create or replace function trol3.opinar_afore(p_afore text, p_atencion int, p_asesoria int, p_recomendaria int, p_comentario text default null)
returns jsonb language plpgsql security definer set search_path to 'trol3', 'public' as $function$
declare pid uuid := trol3.current_persona_id(); v_afore text; v_pts int; v_txt text; v_nueva boolean;
begin
  if pid is null then raise exception 'sin_persona'; end if;
  -- La AFORE con el nombre del catálogo (misma lista que `afore_actual`).
  select o into v_afore from trol3.catalogo_campos c, unnest(c.opciones) o
   where c.campo = 'afore_actual' and lower(o) = lower(trim(coalesce(p_afore, ''))) limit 1;
  if v_afore is null then raise exception 'afore_invalida'; end if;
  if p_atencion not between 1 and 5 or p_asesoria not between 1 and 5 or p_recomendaria not between 0 and 10 then raise exception 'valores_fuera_de_rango'; end if;

  v_nueva := not exists (select 1 from trol3.opiniones_afore where persona_id = pid);
  insert into trol3.opiniones_afore (persona_id, afore, atencion, asesoria, recomendaria, comentario, origen)
  values (pid, v_afore, p_atencion, p_asesoria, p_recomendaria, nullif(trim(coalesce(p_comentario, '')), ''), 'app')
  on conflict (persona_id) do update set afore = excluded.afore, atencion = excluded.atencion, asesoria = excluded.asesoria,
    recomendaria = excluded.recomendaria, comentario = excluded.comentario, origen = 'app', actualizado_en = now();

  -- Su AFORE es un dato declarado como cualquier otro: alimenta el paso 0 y `cambio_afore`.
  perform trol3.declarar(pid, 'afore_actual', to_jsonb(v_afore), 'cliente', pid, 'declarado');

  v_txt := 'Evaluó su AFORE (' || v_afore || '): atención ' || p_atencion || '★, herramientas de asesoría ' || p_asesoria || '★, la recomendaría ' || p_recomendaria || '/10'
           || coalesce('. «' || nullif(trim(coalesce(p_comentario, '')), '') || '»', '') || '.';
  perform trol3.registrar_interaccion(pid, 'nota', 'cliente', pid, 'entrante', v_txt, true,
    jsonb_build_object('via', 'opinion_afore', 'afore', v_afore, 'recomendaria', p_recomendaria));
  perform trol3.emitir_evento(pid, 'opinion_afore', 'cliente', pid,
    jsonb_build_object('afore', v_afore, 'atencion', p_atencion, 'asesoria', p_asesoria, 'recomendaria', p_recomendaria, 'detractor', p_recomendaria <= 6, 'nueva', v_nueva));
  v_pts := trol3.otorgar_puntos_accion(pid, 'encuesta_afore');
  return jsonb_build_object('ok', true, 'afore', v_afore, 'puntos', v_pts, 'nueva', v_nueva);
end $function$;

-- Índice Trol de AFOREs: sólo equipo. `publicable` = n ≥ 30.
create or replace function trol3.indice_afores() returns jsonb
language plpgsql stable security definer set search_path to 'trol3', 'public' as $function$
declare r jsonb;
begin
  perform trol3._guard_miembro();
  select coalesce(jsonb_agg(jsonb_build_object(
      'afore', afore, 'n', n, 'recomendaria', rec, 'atencion', ate, 'asesoria', ase,
      'promotores', prom, 'detractores', det, 'nps', case when n > 0 then round(100.0 * (prom - det) / n) end,
      'publicable', n >= 30, 'ultima', ult) order by n desc, rec desc), '[]'::jsonb)
    into r
    from (select afore, count(*) n, round(avg(recomendaria), 1) rec, round(avg(atencion), 1) ate, round(avg(asesoria), 1) ase,
                 count(*) filter (where recomendaria >= 9) prom, count(*) filter (where recomendaria <= 6) det, max(actualizado_en) ult
            from trol3.opiniones_afore group by afore) x;
  return r;
end $function$;

-- Migración de las 47 respuestas legacy (la opinión; lo demás ya vive en datos / los cinco).
do $$
declare n int;
begin
  execute $q$
    insert into trol3.opiniones_afore (persona_id, afore, atencion, asesoria, recomendaria, comentario, origen, creado_en, actualizado_en)
    select p.id, e.afore, e.atencion, e.asesoria, e.recomendaria, e.comentario, 'legacy', e.creado_at, coalesce(e.actualizado_at, e.creado_at)
      from public.encuesta_afore e
      join trol3.personas p on p.legacy_cliente_id = e.cliente_id and p.merged_into is null
     where e.afore is not null and e.afore <> 'No sé'
    on conflict (persona_id) do nothing
  $q$;
  get diagnostics n = row_count;
  raise notice '216: migradas %', n;
end $$;

-- El flujo viejo deja de ser alcanzable por clientes (el workflow de n8n se apaga aparte).
do $$ begin
  execute 'revoke execute on function public.responder_encuesta_afore(jsonb) from authenticated, anon';
end $$;

comment on function trol3.opinar_afore is '216: el cliente califica su AFORE desde /encuesta. Declara afore_actual, deja gesto en la historia, da 50 pts (una vez), emite opinion_afore.';
comment on function trol3.indice_afores is '216: NPS/atención/asesoría por AFORE con n; publicable a partir de n ≥ 30.';
