'use client';
// Modo "Compartiendo" de la asesoría (Raul, 21-sep): en la videollamada se comparte la pantalla
// de trabajo —historial, calculadora, Infonavit—, no sólo "Presentar". Con el modo prendido, lo
// que es del equipo (guion, notas, valores internos, PnL del aliado) no se pinta. Todo lo demás
// es transparente con el cliente.
import { createContext, useContext } from 'react';

export const CompartirContext = createContext(false);
export const useCompartiendo = () => useContext(CompartirContext);
