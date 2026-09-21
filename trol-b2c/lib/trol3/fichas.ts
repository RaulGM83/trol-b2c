// 170 · Fichas de conocimiento: "la versión oficial de Trol" de cada tema y oportunidad.
// Campos en markdown ligero. `solo_asesor` nunca se pinta en Presentar, en el PDF ni en modo Compartiendo.
export type Ficha = {
  codigo: string; tipo: 'tema' | 'oportunidad'; titulo: string; oportunidades: string[]; orden: number;
  frase: string; cuando_aplica: string | null; como_explicarlo: string | null; preguntas: string | null;
  documentos: string | null; solo_asesor: string | null; en_diagnostico: string | null; updated_at?: string;
};

export const SECCIONES_FICHA: { k: keyof Ficha; titulo: string; ayuda: string; interno?: boolean }[] = [
  { k: 'frase', titulo: 'En una frase', ayuda: 'Para decirlo sin leer. También la ve el cliente en Presentar.' },
  { k: 'cuando_aplica', titulo: 'Cuándo aplica', ayuda: 'La regla con la que el sistema lo detecta.' },
  { k: 'como_explicarlo', titulo: 'Cómo explicarlo', ayuda: 'La versión oficial, en orden. Alimenta al redactor del diagnóstico.' },
  { k: 'preguntas', titulo: 'Qué te van a preguntar', ayuda: 'Objeciones reales y cómo se contestan.' },
  { k: 'documentos', titulo: 'Documentos y proceso', ayuda: 'Qué se pide, quién lo trae, cuánto tarda.' },
  { k: 'solo_asesor', titulo: 'Sólo para ti', ayuda: 'Honorario, quién ejecuta, qué NO prometer. Nunca sale al cliente.', interno: true },
  { k: 'en_diagnostico', titulo: 'En el diagnóstico', ayuda: 'En qué sección del diagnóstico avanzado cae.' },
];
