// 307 · Lo que devuelve trol3.ficha_previa(persona): la ficha previa de Relación (claude/122).
// Módulo plano (sin 'use client') para que la página de servidor y el componente compartan tipos.

type J = string | number | boolean | null | undefined;

export type FichaFalta = {
  codigo: 'sin_curp' | 'identidad' | 'sin_imss' | 'imss_viejo' | 'sin_infonavit' | 'sin_telefono' | 'consulta_fallo';
  nivel: 'alto' | 'medio';
  texto: string;
  accion?: 'imss_historial' | 'infonavit' | 'ingresos';
  dias?: number;
  consulta_id?: string;
  tipo?: string;
  en?: string;
};

export type FichaConsulta = {
  id: string; tipo: string; proveedor: string | null; estado: string; error: string | null;
  creada: string; completada: string | null; motivo: string | null;
};

export type FichaProveedor = { nombre: string; costo: number | null; habilitado: boolean; salud: string | null };

export type FichaPreviaData = {
  persona_id: string;
  hoy: string;
  imss: {
    al: string | null; dias: number | null; vigente: boolean; solo_declarado: boolean;
    ley: string | null; semanas: number | null; semanas_capa: string | null; edad: number | null;
    status_empleo: string | null; cotiza_hoy: J; salario_diario: J; ultima_cotizacion: J;
    conserva_derechos: boolean | null; fin_conservacion: string | null;
    pension_base: number | null; pension_maxima: number | null; edad_base: J;
  };
  infonavit: {
    al: string | null; dias: number | null;
    saldo: number | null; saldo_capa: string | null; saldo_estimado: number | null;
    monto_credito: J; capacidad_compra: J; pago_mensual: J;
    relacion_laboral: J; credito_vigente: J; credito_uso: J; numero_credito: J;
    oportunidad: { estado: string; solo_cotitular: boolean | null; efectivo_minimo: number | null; etapa: string | null } | null;
  };
  afore: {
    afore: string | null; saldo: number | null; saldo_capa: string | null;
    rango: { central?: number; piso?: number; techo?: number } | null;
    expectativa: J; edad_retiro: J; listos: number; total: number;
    preguntas: { n: number; titulo: string; estado: 'tenemos' | 'no_sabe' | 'falta' }[];
  };
  identidad: {
    curp: string | null; nss: string | null; estatus: J; estatus_cda: J; telefono: string | null;
    registrado_en: string | null; origen: unknown; app_visto_en: string | null;
    parada: { parada: number | null; toca: string | null; titulo: string | null } | null;
    documentos: { tipo: string; nombre: string; n: number }[];
    cita: { inicio: string; miembro: string | null } | null;
  };
  ingresos: {
    al: string | null; dias: number | null;
    bruto: J; neto: J; isr: J; patron: J; ultima_nomina: J; periodicidad: J; empleo_vigente: J;
    deducciones: Record<string, number> | null;
  };
  issste: {
    al: string | null; estatus: J; antiguedad: J; ingreso_gobierno: J; alta: J; baja: J;
    ramo: J; sueldo_basico: J; regimen: J; empalme: J;
  };
  faltas: FichaFalta[];
  guion: string[];
  oportunidades: { id: string; codigo: string; nombre: string; estado: string; frase: string | null; solo_cotitular: boolean | null; efectivo_minimo: number | null }[];
  consultas: FichaConsulta[];
  proveedores: Record<string, FichaProveedor>;
};
