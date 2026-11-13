-- 306 · Correo "Tu consulta está lista" para aliados del portal trol.mx (13-nov-2026). Aplicada por MCP.
-- La base arma el correo y lo deja en una cola; n8n (workflow Calculos 6Ry0jm62ahFNmibR, webhook
-- aviso-aliado-correo → Aviso leer → Aviso pendiente → Aviso enviar (Resend) → Aviso marcar enviado)
-- sólo lee la fila por id, la manda y la marca. Un correo por persona y aliado, la primera vez que llega su cálculo.
-- Sin Infonavit y sin equivalentes en pesos. Liga: https://app.trol.mx/aliado.
--
-- OJO: el cuerpo de trol3.correo_resultado_aliado(p_persona, p_aliado, p_cp) (plantilla HTML) NO está copiado aquí;
-- la versión vigente vive en la base: select pg_get_functiondef('trol3.correo_resultado_aliado(uuid,uuid,jsonb)'::regprocedure);
create table if not exists public.avisos_aliado_correo (
  id uuid primary key default gen_random_uuid(),
  aliado_id uuid not null,
  persona_id uuid not null,
  para text,
  asunto text,
  html text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  unique (aliado_id, persona_id)
);
alter table public.avisos_aliado_correo enable row level security;

insert into trol3.config (clave, valor) values ('webhook_aviso_aliado', 'https://eltrolfinanciero.app.n8n.cloud/webhook/aviso-aliado-correo')
on conflict (clave) do update set valor = excluded.valor;

create or replace function trol3.tg_aviso_aliado_resultado()
returns trigger language plpgsql security definer set search_path to 'trol3','public','extensions' as $fn$
declare r record; c jsonb; v_id uuid; v_url text;
begin
  if new.campo <> 'semilla' then return new; end if;
  begin
    for r in
      select rf.aliado_id from trol3.referidos rf join trol3.aliados a on a.id = rf.aliado_id
       where rf.persona_id = new.persona_id and rf.estado = 'atribuido' and rf.visible_para_aliado
         and a.activo and coalesce(a.email,'') like '%@%'
    loop
      c := trol3.correo_resultado_aliado(new.persona_id, r.aliado_id, new.valor);
      v_id := null;
      insert into public.avisos_aliado_correo (aliado_id, persona_id, para, asunto, html)
      values (r.aliado_id, new.persona_id, c->>'para', c->>'asunto', c->>'html')
      on conflict (aliado_id, persona_id) do nothing returning id into v_id;
      if v_id is not null then
        select valor into v_url from trol3.config where clave = 'webhook_aviso_aliado';
        if coalesce(v_url,'') <> '' then
          perform net.http_post(url := v_url, body := jsonb_build_object('id', v_id), headers := '{"content-type":"application/json","X-Supabase-Source":"trol3"}'::jsonb);
        end if;
      end if;
    end loop;
  exception when others then
    raise warning 'tg_aviso_aliado_resultado: %', sqlerrm;
  end;
  return new;
end $fn$;

drop trigger if exists zz_aviso_aliado_resultado on trol3.datos;
create trigger zz_aviso_aliado_resultado after insert on trol3.datos for each row when (new.campo = 'semilla') execute function trol3.tg_aviso_aliado_resultado();

-- Los que ya tenían resultado no reciben correo cuando se refresquen (sembrados como enviados).
insert into public.avisos_aliado_correo (aliado_id, persona_id, para, asunto, enviado_en)
select rf.aliado_id, rf.persona_id, 'presembrado', 'ya tenía resultado al activar 306', now()
  from trol3.referidos rf
 where rf.estado = 'atribuido' and exists (select 1 from trol3.datos d where d.persona_id = rf.persona_id and d.campo = 'semilla')
on conflict do nothing;

-- 305 (mismo día): partners.entregables_config.portal_url = 'https://app.trol.mx/aliado' en el partner de Resolut;
-- el nodo "Liga del portal" del mismo workflow cambia la liga del correo del portal viejo cuando ese dato existe.
