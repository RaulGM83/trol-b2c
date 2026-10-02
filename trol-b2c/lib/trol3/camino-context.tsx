'use client';
// 209 · El camino que la asesoría le pide a la calculadora embebida (claude/94).
//
// La calculadora entra al paso 3 como un slot de servidor (`herramientas.calculadora`),
// así que la sesión no puede pasarle props: le habla por contexto, igual que
// "Compartiendo". Sin proveedor (pestaña Calculadoras), la calculadora usa su
// propia selección.
import { createContext, useContext } from 'react';
import type { CaminoModo } from '@/lib/trol3/caminos';

export type CaminoSel = { modo: CaminoModo; id: string };

export type CaminoCtx = {
  sel: CaminoSel | null;
  setSel: (s: CaminoSel | null) => void;
  /** En "Ver" compartiendo pantalla: costos y honorarios sólo si la sesión los muestra. */
  mostrarCostos: boolean;
};

export const CaminoContext = createContext<CaminoCtx | null>(null);
export const useCaminoCtx = () => useContext(CaminoContext);
