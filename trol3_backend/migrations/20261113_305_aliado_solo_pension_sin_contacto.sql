-- 305 · Aliado "solo pensión" y "Trol no contacta" (Resolut/Astuto, 13-nov-2026). Aplicada por MCP.
-- Resolut pasa del portal control-financiero al de trol.mx: mismo alta v2 (1 crédito) y calculadora (20 cr),
-- sin nada de Infonavit, y el cliente es suyo (sin teléfono, sin asesor, sin tareas; queda precliente).
alter table trol3.aliados
  add column if not exists solo_pension boolean not null default false,
  add column if not exists trol_contacta boolean not null default true;
comment on column trol3.aliados.solo_pension is '305 · Usa el alta v2 (1 crédito, calculadora) pero sin Infonavit: no se pide precalificación ni se le enseña nada de Infonavit.';
comment on column trol3.aliados.trol_contacta is '305 · false = el cliente es del aliado: no se captura teléfono, no se asigna asesor ni se crean tareas; queda como precliente.';

create or replace view trol3.v_aliado_yo as
 SELECT id, nombre, empresa, email, telefono, tipo, comision_pct, activo,
    ( SELECT ci.codigo FROM trol3.codigos_invitacion ci WHERE (ci.aliado_id = a.id) ORDER BY ci.activo DESC, ci.created_at LIMIT 1) AS codigo,
    programa_infonavit, comision_infonavit,
    ( SELECT p.balance_credits FROM partners p WHERE (p.id = a.partner_id)) AS creditos,
    (partner_id IS NOT NULL) AS tiene_wallet,
    solo_pension, trol_contacta
   FROM trol3.aliados a
  WHERE (id = trol3.current_aliado_id());

-- Parches sobre las funciones vigentes (301): se reescriben a partir de su definición actual.
do $$
declare d text; n text;
begin
  d := pg_get_functiondef('trol3.alta_por_aliado_v2(text,text,text,text,text)'::regprocedure);
  n := replace(d, 'v_ref uuid; v_disp int; v_prog boolean; v_precliente boolean;', 'v_ref uuid; v_disp int; v_prog boolean; v_precliente boolean; v_solo boolean; v_contacta boolean;');
  n := replace(n, 'select programa_infonavit into v_prog from trol3.aliados where id = v_aliado and activo;
  if v_prog is null then raise exception ''no_autorizado''; end if;',
  'select programa_infonavit, solo_pension, trol_contacta into v_prog, v_solo, v_contacta from trol3.aliados where id = v_aliado and activo;
  if v_prog is null then raise exception ''no_autorizado''; end if;
  -- 305 · solo pensión: sin CURP no hay consulta IMSS. Trol no contacta: el teléfono no se guarda y queda precliente.
  if v_solo and v_curp is null then raise exception ''curp_invalida''; end if;
  if not v_contacta then t10 := null; v_precliente := true; end if;');
  n := replace(n, 'pide_infonavit_en = coalesce(pide_infonavit_en, now()),', 'pide_infonavit_en = case when v_solo then pide_infonavit_en else coalesce(pide_infonavit_en, now()) end,');
  if n = d or position('v_solo and v_curp' in n) = 0 or position('case when v_solo' in n) = 0 then raise exception 'alta_por_aliado_v2: no se aplicó el parche'; end if;
  execute n;

  d := pg_get_functiondef('trol3.tg_referido_cabecera()'::regprocedure);
  n := replace(d, 'if new.estado <> ''atribuido'' then return new; end if;', 'if new.estado <> ''atribuido'' then return new; end if;
  -- 305 · cliente del aliado: ni asesor ni tarea.
  if not coalesce((select a.trol_contacta from trol3.aliados a where a.id = new.aliado_id), true) then return new; end if;');
  if n = d then raise exception 'tg_referido_cabecera: no se aplicó el parche'; end if;
  execute n;

  d := pg_get_functiondef('trol3.agregar_telefono_por_aliado(uuid,text)'::regprocedure);
  n := replace(d, 'if v_aliado is null then raise exception ''no_autorizado''; end if;', 'if v_aliado is null then raise exception ''no_autorizado''; end if;
  if not coalesce((select a.trol_contacta from trol3.aliados a where a.id = v_aliado), true) then raise exception ''no_autorizado''; end if;');
  if n = d then raise exception 'agregar_telefono_por_aliado: no se aplicó el parche'; end if;
  execute n;
end $$;

-- Alta de Resolut (dato, ya aplicado): aliados(nombre 'Resolut', email mesadecontrol@resolut.com.mx, partner y usuario
-- del portal viejo, programa_infonavit=false, solo_pension=true, trol_contacta=false, sin cabecera).
