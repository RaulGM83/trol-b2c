-- 159: los documentos, como los ve el cliente.
--
-- Las cuatro actas (nacimiento, matrimonio, divorcio, defunción) se dieron de
-- alta el 10-sep para el flujo del asesor (132, Jordan, $19.50 c/u) y quedaron
-- visibles en /mi como "Solicitar (gratis)": ni son gratis para Trol ni el
-- botón conseguía nada. Se piden dentro de un trámite, no sueltas: se ocultan
-- del catálogo del cliente, PERO si ya existe una en su cuenta la sigue viendo
-- (un documento suyo no desaparece porque cambiamos el catálogo).
--
-- Y mi_solicitar_documento deja de disparar la consulta al IMSS para la
-- constancia: lo hacía al instante y sin cobrar los $100 que anunciaba. Hasta
-- que exista el checkout, pedir un documento con precio pasa por el chat y el
-- experto cobra y dispara. La función sigue registrando la solicitud.

update trol3.catalogo_documentos set visible_cliente = false
 where tipo in ('acta_nacimiento','acta_matrimonio','acta_divorcio','acta_defuncion');

do $patch$
declare def text; ancla text; nuevo text;
begin
  def := pg_get_functiondef('trol3.mi_expediente()'::regprocedure);
  ancla := $a$from trol3.catalogo_documentos where visible_cliente)$a$;
  nuevo := $b$from trol3.catalogo_documentos cd where cd.visible_cliente
               -- 159: oculto en catálogo, pero si ya tiene uno lo sigue viendo
               or exists (select 1 from trol3.documentos dx where dx.persona_id = pid and dx.tipo = cd.tipo and 'cliente' = any(dx.visibilidad)))$b$;
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '159: ancla de mi_expediente'; end if;
  execute replace(def, ancla, nuevo);

  def := pg_get_functiondef('trol3.mi_solicitar_documento(text)'::regprocedure);
  ancla := $a$  if p_tipo in ('sisec','constancia_semanas') then r := trol3.pedir_consulta(pid, 'imss_historial', 'cliente', pid, 'cliente', true, 'solicitud documento SISEC', false, null); end if;
$a$;
  nuevo := $b$  -- 159: ya no dispara la consulta al IMSS: lo hacía sin cobrar. Cobra y dispara el experto.
$b$;
  if (length(def) - length(replace(def, ancla, ''))) / length(ancla) <> 1 then raise exception '159: ancla de mi_solicitar_documento'; end if;
  execute replace(def, ancla, nuevo);
end $patch$;