// 172 · Los botones del copiloto por paso (lo único que ve el navegador). Las instrucciones al modelo
// viven en lib/trol3/copiloto.ts, que sólo corre en el servidor. Las claves deben coincidir.
export const BOTONES_COPILOTO: Record<number, { clave: string; texto: string }[]> = {
  1: [{ clave: 'abrir', texto: '¿Cómo abro con este cliente?' }, { clave: 'resumen', texto: 'Resúmeme su caso en 3 líneas' }, { clave: 'historia', texto: '¿Qué veo en su historia laboral?' }],
  2: [{ clave: 'orden', texto: '¿En qué orden presento lo que encontramos?' }, { clave: 'objeciones', texto: '¿Qué objeciones espero?' }],
  3: [{ clave: 'caminos', texto: '¿Qué caminos le armo?' }, { clave: 'esperar', texto: '¿Le conviene esperar o tramitar ya?' }],
  4: [{ clave: 'porque', texto: 'Ayúdame a decir el porqué' }, { clave: 'dinero', texto: '¿Y si dice que no tiene el dinero?' }],
  5: [{ clave: 'cierre', texto: '¿Qué acuerdos no se me deben olvidar?' }],
};

export type PreparacionVista = {
  resumen: string; orden: string[]; objeciones: { pregunta: string; respuesta: string; ficha: string | null }[]; cuidado: string[]; generado_en: string;
};
