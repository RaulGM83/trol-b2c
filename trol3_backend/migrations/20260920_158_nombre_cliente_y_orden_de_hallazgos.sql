-- 158: el catálogo de oportunidades aprende a hablarle al cliente.
--
-- La 157 probada contra los activos le decía a la gente "La más importante:
-- Crédito Infonavit (saldo alto ≥ 500k)" o "Reactivar derechos con Modalidad 10
-- (Viraal)": `nombre` es NUESTRO nombre (segmento, umbral, aliado). De cara al
-- cliente manda `nombre_cliente`; `nombre` sigue siendo el de /trabajo.
--
-- Y "la más importante" deja de elegirse sólo por pesos (Raul, 20-sep): primero
-- lo que pone en orden su situación —nivel 1 y recuperar derechos—, y después
-- todo lo demás, Infonavit incluido, por valor. `entender_situacion`,
-- `asesoria_avanzada` y `referidos` no son hallazgos: no compiten.

alter table trol3.catalogo_oportunidades add column if not exists nombre_cliente text;
comment on column trol3.catalogo_oportunidades.nombre_cliente is 'Cómo se le nombra al cliente en /mi (157/158). null = se usa nombre.';

update trol3.catalogo_oportunidades c set nombre_cliente = v.n
from (values
  ('mod40_retro', 'Subir tu pensión con Modalidad 40'),
  ('mod40_prospectiva', 'Subir tu pensión con Modalidad 40'),
  ('pension_hoy', 'Ya podrías pensionarte'),
  ('reconocimiento_semanas', 'Recuperar semanas que el IMSS no te reconoce'),
  ('reactivacion_mod10', 'Recuperar tus derechos de Ley 73'),
  ('recuperar_ley73', 'Recuperar tus derechos de Ley 73'),
  ('inconsistencia_imss', 'Corregir tu registro en el IMSS'),
  ('unificacion_nss', 'Corregir tu registro en el IMSS'),
  ('cuenta_sin_registrar', 'Registrar tu cuenta AFORE'),
  ('mejoravit_activo', 'Usar tu Infonavit para mejorar tu casa'),
  ('credito_infonavit_activo', 'Usar tu crédito Infonavit'),
  ('compra_inmueble', 'Comprar casa con tu Infonavit'),
  ('credito_pension', 'Un crédito sobre tu pensión'),
  ('cambio_afore', 'Cambiarte a una mejor AFORE'),
  ('ahorro_voluntario', 'Ahorrar para cerrar la brecha'),
  ('seguros', 'Proteger a los tuyos')
) as v(c, n)
where c.codigo = v.c;

do $patch$
declare
  def text := pg_get_functiondef('trol3.parada_de(uuid)'::regprocedure);
  r record;
begin
  for r in select * from (values
    (1, $a$o1.urgencia_fecha, c.nombre$a$,
        $b$o1.urgencia_fecha, coalesce(c.nombre_cliente, c.nombre) as nombre$b$),
    (1, $a$and o1.estado in ('ganada','en_proceso','interesada','presentada','detectada')$a$,
        $b$and o1.estado in ('ganada','en_proceso','interesada','presentada','detectada')
     and o1.codigo not in ('entender_situacion','asesoria_avanzada','referidos')$b$),
    (1, $a$when 'ganada' then 3 else 4 end,$a$,
        $b$when 'ganada' then 3 else 4 end,
            -- 158: primero lo que pone en orden su situación; lo demás, por valor
            case when c.nivel = 1 or o1.codigo = 'reactivacion_mod10' then 0 else 1 end,$b$),
    (1, $a$o2.estado in ('detectada','presentada','interesada'))$a$,
        $b$o2.estado in ('detectada','presentada','interesada')
                                                 and o2.codigo not in ('entender_situacion','asesoria_avanzada','referidos'))$b$),
    (2, $a$case when total > 0 then 'Vamos ' || hechos || ' de ' || total || '. ' else '' end$a$,
        $b$case when total > 0 and hechos > 0 then 'Vamos ' || hechos || ' de ' || total || '. ' when total > 0 then 'Apenas arrancamos. ' else '' end$b$)
  ) as t(veces, ancla, nuevo) loop
    if (length(def) - length(replace(def, r.ancla, ''))) / length(r.ancla) <> r.veces then
      raise exception '158: el ancla no aparece % vez/veces: %', r.veces, r.ancla;
    end if;
    def := replace(def, r.ancla, r.nuevo);
  end loop;
  execute def;
end $patch$;