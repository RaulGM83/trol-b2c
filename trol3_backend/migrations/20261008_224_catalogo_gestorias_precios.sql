-- 224 · Catálogo de gestorías con la lista de precios de Raul (8-oct-2026, IVA incluido). Lo usa «Registrar un cobro».
-- Página para el equipo y aliados: «Precios de gestoría Trol» (artifact). Documentos chicos (actas $50, checkup $20,
-- página amarilla $50, SINDO $300) viven sólo en la página por ahora.
insert into trol3.catalogo_productos_gestoria (codigo, nombre, descripcion, honorario_default, costo_default, activo, orden) values
 ('revision_expediente', 'Revisión de expediente', 'SINDO, CANASE y SISEC; análisis del equipo y explicación. Pago anticipado. Se descuenta de acompañamiento, unificación o corrección.', 1500, 0, true, 10),
 ('actualizacion_datos_imss', 'Corrección de datos ante el IMSS', 'Incluye revisión de expediente. 50% al iniciar, 50% al quedar corregido y sin inconsistencias.', 8000, 0, true, 20),
 ('unificacion_nss', 'Unificación de cuentas (dos NSS)', 'Incluye revisión de expediente. 50% al iniciar, 50% al quedar unificado y sin inconsistencias.', 10000, 0, true, 30),
 ('busqueda_semanas', 'Búsqueda manual de semanas', '50% al iniciar, 50% al concluir sólo si se encuentran semanas.', 20000, 0, true, 40),
 ('acompanamiento_pension', 'Acompañamiento para pensión', 'La persona hace el trámite con nuestra guía: asesorías, revisión de documentos y de expediente, hasta recuperar Infonavit y AFORE. 50% al iniciar, 50% al tener la pensión.', 5000, 0, true, 50),
 ('pension_directa', 'Pensión directa sin Modalidad 40', 'Hacemos el trámite de pensión. 50% al iniciar, 50% al concluir.', 20000, 0, true, 60),
 ('pension_directa_m40', 'Pensión directa con Modalidad 40', 'Hacemos el trámite de pensión con Modalidad 40. 50% al iniciar, 50% al concluir.', 25000, 0, true, 70),
 ('modalidad40_completo', 'Trámite completo de Modalidad 40', 'Líneas de captura, alta, baja y resolución de pensión. 50% al iniciar, 50% al concluir.', 38000, 0, true, 80)
on conflict (codigo) do update set nombre = excluded.nombre, descripcion = excluded.descripcion, honorario_default = excluded.honorario_default, activo = true, orden = excluded.orden;
