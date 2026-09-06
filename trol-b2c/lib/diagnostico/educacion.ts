// ============================================================================
// "Cómo funciona tu pensión" — el capítulo que va ANTES del diagnóstico.
//
// Del docx de Cristian salió el orden que funciona: enseñar y luego
// diagnosticar. Un cliente que no entiende de dónde sale su número no puede
// juzgar la recomendación, sólo obedecerla o desconfiar.
//
// Es TEXTO FIJO, no generado. Las reglas de una ley no cambian por cliente, y
// es justo donde un modelo inventando cuesta caro: aquí un porcentaje mal
// puesto se lee como un dato oficial. Sale de la base de conocimiento del
// prompt —la misma que lleva meses afinándose— traducida a segunda persona y
// sin la jerga interna. Lo personalizado sigue viviendo en las secciones que
// sí escribe la IA.
//
// Se muestra SÓLO el capítulo de la ley que le aplica. Si le aplican dos
// (IMSS + ISSSTE), van los dos, en ese orden.
// ============================================================================

export type Capitulo = {
  titulo: string;
  /** Cada bloque es un subtítulo con sus párrafos. Sin markdown: el PDF pinta. */
  bloques: { titulo?: string; parrafos: string[]; lista?: string[] }[];
  /** Va al pie, en letra chica. */
  nota?: string;
};

const LEY73: Capitulo = {
  titulo: 'Cómo funciona tu pensión: Ley 73',
  bloques: [
    {
      parrafos: [
        'Cotizaste por primera vez antes del 1º de julio de 1997, así que te toca la Ley 73. Es un régimen distinto al de quienes empezaron después: tu pensión no depende de cuánto dinero juntaste, sino de tu salario, tus semanas y la edad a la que te retires. Por eso se puede trabajar: los tres se pueden mover.',
      ],
    },
    {
      titulo: 'Lo que necesitas para pensionarte',
      lista: [
        'Haber cotizado por primera vez antes del 1º de julio de 1997.',
        'Tener vigentes tus derechos ante el IMSS.',
        'Al menos 500 semanas cotizadas.',
        'Cumplir 60 años.',
      ],
      parrafos: [],
    },
    {
      titulo: 'Tus derechos se conservan, pero no para siempre',
      parrafos: [
        'Cuando dejas de cotizar, el IMSS te mantiene tus derechos por un tiempo equivalente al 25% de todo lo que cotizaste. Si cotizaste 20 años, los conservas 5 años después de tu última baja.',
        'Si ese plazo ya se venció, no perdiste tus semanas: están guardadas y se reactivan volviendo a cotizar. Cuánto tiempo depende de cuánto llevas fuera: menos de 3 años, basta una sola cotización; entre 3 y 6 años, se necesitan 26 semanas; más de 6 años, 52 semanas.',
      ],
    },
    {
      titulo: 'Los tres factores que deciden tu pensión',
      parrafos: [
        'Los tres trabajan juntos. Mover uno solo y dejar los otros como están casi no cambia el resultado — es el error más común y la razón por la que mucha gente cotiza años de más sin ganar nada.',
      ],
      lista: [
        'Semanas cotizadas. A partir de las 500, cada 52 semanas más mejoran el factor con el que se calcula tu pensión. Pero pasar de 2,000 semanas no sirve de nada si el salario es bajo.',
        'Salario promedio. Se calcula sobre tus últimas 250 semanas cotizadas, unos 5 años. Es el factor con más peso, y también el más fácil de mejorar a tiempo.',
        'Edad de retiro. A los 60 recibes el 75% de lo calculado; a los 61.5 el 85%; a los 62.5 el 90%; a los 63.5 el 95%; y de los 64.5 en adelante, el 100%. Cada año que esperas vale dinero.',
      ],
    },
    {
      titulo: 'La pensión mínima garantizada',
      parrafos: [
        'Si cumples los requisitos, el IMSS te garantiza una pensión mínima aunque tu cálculo salga por debajo. Además de esa pensión recibes en efectivo el saldo de tu subcuenta de vivienda que no hayas usado y los saldos de SAR 92 y Retiro 97 de tu AFORE.',
        'Alcanzar al menos la pensión mínima casi siempre vale más que quedarse con el dinero acumulado en la AFORE: es un pago de por vida y trae los servicios médicos del IMSS de por vida.',
      ],
    },
  ],
  nota: 'Los porcentajes y plazos de este capítulo son las reglas generales de la Ley 73. Tus cifras están en las secciones siguientes.',
};

const LEY97: Capitulo = {
  titulo: 'Cómo funciona tu pensión: Ley 97',
  bloques: [
    {
      parrafos: [
        'Empezaste a cotizar a partir de julio de 1997, así que te toca la Ley 97. Aquí tu pensión no sale de tu salario promedio: sale del dinero que lograste juntar. Al retirarte, ese saldo se convierte en un pago mensual de por vida. Por eso todo lo que hagamos apunta a lo mismo: que ese saldo sea más grande y que rinda mejor.',
      ],
    },
    {
      titulo: 'Lo que necesitas para pensionarte',
      parrafos: [
        'Cumplir 60 años, y tener las semanas mínimas que pide el año en que te retires. Ese mínimo sube cada año: 875 semanas en 2026, 900 en 2027, y así hasta llegar a 1,000 semanas de 2031 en adelante. La cifra que te toca a ti está en las secciones siguientes.',
      ],
    },
    {
      titulo: 'De dónde sale tu pensión',
      parrafos: [
        'Tu pensión es la suma de varias bolsas, y no todas se comportan igual. Hay dos capas, y la diferencia entre ellas es la que decide buena parte de tu estrategia.',
      ],
      lista: [
        'Tu cuenta individual: el ahorro para el retiro (RCV) que el IMSS acumula con tus aportaciones, más tu subcuenta de vivienda del Infonavit si la dejas ahí. A esta capa la topa la pensión mínima garantizada.',
        'Lo que va encima: tu ahorro voluntario en la AFORE, el plan de retiro de tu empresa si lo tienes, y tus planes por fuera (PPR, fondos, cajas). La mínima garantizada no toca esta capa, así que cada peso aquí siempre suma.',
      ],
    },
    {
      titulo: 'La pensión mínima garantizada, y por qué importa saber si caes en ella',
      parrafos: [
        'Si cumples requisitos pero tu cuenta individual no alcanza para cubrir tu pensión mínima, el IMSS toma ese saldo y lo complementa hasta llegar a ella. El monto depende de tu edad, de tus semanas y de tu salario a lo largo de toda tu vida laboral, no sólo de los últimos años.',
        'Aquí está el punto que casi nadie ve: si caes en la mínima, cada peso que tengas en tu cuenta individual sólo sustituye un peso que iba a poner el gobierno. No te sube la pensión ni un centavo. En cambio, cada peso que tengas por encima sí se suma completo.',
      ],
    },
    {
      titulo: 'Tu subcuenta de vivienda tiene tres caminos',
      parrafos: [
        'El dinero del Infonavit que no usaste en un crédito es tuyo, y decidir qué haces con él es una de las decisiones que más mueve tu resultado.',
      ],
      lista: [
        'Dejarlo para la pensión: se queda en tu cuenta individual. Dentro del Infonavit rinde alrededor del 4% anual, que descontando la inflación es prácticamente cero: ahí el dinero no crece, apenas se conserva. Y si caes en la mínima garantizada, no te suma nada.',
        'Rescatarlo: sale de tu cuenta individual y queda líquido y a tu nombre, donde puede colocarse en opciones que sí rindan por encima de la inflación. Queda por encima de la mínima, así que siempre suma. Es la opción que te devuelve el control del dinero.',
        'Usarlo para tu casa: lo destinas a una vivienda o ya tienes un crédito vigente. En ese caso no entra al cálculo de tu pensión, pero tampoco se pierde: se convierte en patrimonio.',
      ],
    },
    {
      titulo: 'Los dos factores que puedes mover',
      lista: [
        'El tamaño de tu saldo: tu pensión se calcula dividiendo lo acumulado entre un factor que estima cuántos años te la van a pagar. Más saldo, más pensión, y el ahorro que va encima de la cuenta individual es el que rinde sin tope.',
        'La edad a la que te retires: esperar hace crecer el saldo por aportaciones y rendimientos, y al mismo tiempo baja el factor de conversión porque se estiman menos años de pago. Cuenta doble.',
      ],
      parrafos: [],
    },
  ],
  nota: 'Este capítulo describe las reglas generales de la Ley 97. Tus cifras y el camino que elegimos juntos están en las secciones siguientes.',
};

const ISSSTE_CI: Capitulo = {
  titulo: 'Cómo funciona tu pensión del ISSSTE (Cuentas Individuales)',
  bloques: [
    {
      parrafos: [
        'Tus cotizaciones al ISSSTE corren por su cuenta: son un derecho aparte del IMSS y no se mezclan con él. Funcionan parecido a la Ley 97 del IMSS — tu pensión sale del saldo que juntaste en tu cuenta individual.',
      ],
    },
    {
      titulo: 'Lo que necesitas',
      lista: [
        'Cumplir 60 años.',
        '25 años de servicio cotizados para tener derecho a la pensión mínima garantizada.',
      ],
      parrafos: [],
    },
    {
      titulo: 'Portabilidad: la decisión que hay que revisar',
      parrafos: [
        'Si cotizaste en los dos institutos, vale la pena revisar cuántas de tus semanas del ISSSTE no se traslapan con las del IMSS. Esas se pueden portar y sumar a tu conteo del IMSS. Conviene o no según qué tan cerca estés de cumplir los requisitos en cada lado; es una cuenta que hay que hacer con números, no de memoria.',
      ],
    },
  ],
};

const ISSSTE_DT: Capitulo = {
  titulo: 'Cómo funciona tu pensión del ISSSTE (Décimo Transitorio)',
  bloques: [
    {
      parrafos: [
        'Cotizaste en el ISSSTE antes de 2007 y elegiste quedarte en el régimen anterior. Es un derecho independiente del IMSS y no se mezcla con él. A diferencia de las cuentas individuales, aquí tu pensión no sale de un saldo: sale de un porcentaje de tu sueldo básico del último año.',
      ],
    },
    {
      titulo: 'Hay tres tipos de pensión, y aplica el que te toque',
      lista: [
        'Cesantía en edad avanzada: 65 años cumplidos y 10 años de servicio. Te corresponde el 50% de tu sueldo básico del último año.',
        'Retiro por edad y tiempo de servicio: 60 años cumplidos y al menos 15 años de servicio. El porcentaje sube con los años cotizados: 50% con 15 años, 75% con 25, y 100% con 30.',
        'Jubilación: 30 años cotizados si eres hombre, 28 si eres mujer, más una edad mínima que baja con los años (en 2026 y 2027, 58 para hombres y 56 para mujeres). Te corresponde el 100% de tu sueldo básico del último año, con un tope de 10 UMAs.',
      ],
      parrafos: [],
    },
  ],
};

/**
 * Qué capítulos le tocan a este cliente.
 *
 * Se devuelve una lista porque quien cotizó en los dos institutos tiene dos
 * pensiones distintas y necesita entender las dos. Lo que NO se hace es
 * imprimir el capítulo de una ley que no le aplica: la regla de sólo hablar de
 * lo que aplica vale igual para el texto fijo que para el que escribe la IA.
 */
export function capitulosDe({
  ley,
  regimenIssste,
}: {
  ley?: string | null;
  regimenIssste?: string | null;
}): Capitulo[] {
  const out: Capitulo[] = [];
  if (ley === 'Ley73') out.push(LEY73);
  else if (ley === 'Ley97') out.push(LEY97);

  const r = (regimenIssste ?? '').toUpperCase();
  if (r) {
    // "SIN REGIMEN" se trata exactamente igual que Cuentas Individuales.
    out.push(r.includes('TRANSITORIO') || r.includes('DECIMO') || r.includes('DÉCIMO') ? ISSSTE_DT : ISSSTE_CI);
  }
  return out;
}

export const CAPITULOS = { LEY73, LEY97, ISSSTE_CI, ISSSTE_DT };
