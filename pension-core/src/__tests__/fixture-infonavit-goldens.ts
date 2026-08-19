// Casos golden del motor de asesoría Infonavit, validados celda a celda contra
// Trol_Asesoria_Infonavit_v4_2.xlsx (hoja `Asesoria`). Generado desde casos_golden.json;
// si el Excel cambia, regenerar, NO editar a mano.
// Casos golden validados celda a celda contra Trol_Asesoria_Infonavit_v4.xlsx. Tolerancia sugerida: 0.05 absoluto en montos, 1e-5 en tasas.
import type { ClienteInfonavit, InmuebleInfonavit, PalancasInfonavit, SupuestosInfonavit } from '../infonavit-asesoria';

export interface CasoGolden {
  nombre: string;
  entrada: {
    cliente: ClienteInfonavit;
    inmueble: InmuebleInfonavit;
    supuestos: Partial<SupuestosInfonavit> | null;
    palancas: Partial<PalancasInfonavit> | null;
  };
  esperado: {
    credito: number; pmt: number; remanente: number; notariales_cliente: number;
    ventaja_venta: number[]; ventaja_corte: number[]; plusvalia_equilibrio: number[];
    efectivo: number[]; contrafactual_corte: number; mejor_horizonte: number;
    fuente_dominante: string;
  };
}

export const CASOS_GOLDEN: CasoGolden[] = [
  {
    "nombre": "vistalagua_pareja_default",
    "entrada": {
      "cliente": {
        "titulares": [
          {
            "regimen": 97,
            "edad": 45.6,
            "salario_imss": 89132.8,
            "ssv": 1250000,
            "meses_cotizando": 173,
            "ingreso_real": 150000,
            "deducciones_usadas": 0,
            "conserva_valor": 1.0
          },
          {
            "regimen": 97,
            "edad": 49.4,
            "salario_imss": 89132.8,
            "ssv": 1450000,
            "meses_cotizando": 127,
            "ingreso_real": 150000,
            "deducciones_usadas": 0,
            "conserva_valor": 1.0
          }
        ]
      },
      "inmueble": {
        "avaluo": 6349000,
        "escrituracion": 6349000,
        "costo_aliado": 6349000,
        "renta": 25000,
        "plusvalia": 0.06,
        "notariales_credito": 113000,
        "notariales_adicionales": 140000,
        "comision_desarrollador": 0.03,
        "aliado_cubre_notariales": false
      },
      "supuestos": null,
      "palancas": null
    },
    "esperado": {
      "credito": 3762000,
      "pmt": 37112.47,
      "remanente": 0.0,
      "notariales_cliente": 140000,
      "ventaja_venta": [
        -334119.13,
        -239427.3,
        -23922.8,
        518882.4
      ],
      "ventaja_corte": [
        1587777.17,
        1678716.22,
        1848478.74,
        2141281.13
      ],
      "plusvalia_equilibrio": [
        0.095573,
        0.078562,
        0.061175,
        0.046007
      ],
      "efectivo": [
        2834472.68,
        3043061.75,
        3493172.21,
        4533717.4
      ],
      "contrafactual_corte": 5304201.42,
      "mejor_horizonte": 60,
      "fuente_dominante": "plusvalia"
    }
  },
  {
    "nombre": "toledo_pmg_parcial_sin_credito",
    "entrada": {
      "cliente": {
        "titulares": [
          {
            "regimen": 97,
            "edad": 45.6,
            "salario_imss": 89132.8,
            "ssv": 1250000,
            "meses_cotizando": 173,
            "ingreso_real": 150000,
            "deducciones_usadas": 0,
            "conserva_valor": 0.6
          },
          {
            "regimen": 97,
            "edad": 49.4,
            "salario_imss": 89132.8,
            "ssv": 1450000,
            "meses_cotizando": 127,
            "ingreso_real": 150000,
            "deducciones_usadas": 0,
            "conserva_valor": 1.0
          }
        ]
      },
      "inmueble": {
        "avaluo": 2600000,
        "escrituracion": 2450000,
        "costo_aliado": 2150000,
        "renta": 12005,
        "plusvalia": 0.06,
        "notariales_credito": 30000,
        "notariales_adicionales": 78000,
        "comision_desarrollador": 0.06,
        "aliado_cubre_notariales": true
      },
      "supuestos": null,
      "palancas": null
    },
    "esperado": {
      "credito": 0.0,
      "pmt": 0.0,
      "remanente": 220000,
      "notariales_cliente": 0,
      "ventaja_venta": [
        426386.73,
        453125.95,
        507422.82,
        620085.12
      ],
      "ventaja_corte": [
        2691693.88,
        2586349.29,
        2371424.59,
        1938683.44
      ],
      "plusvalia_equilibrio": [
        -0.062217,
        -0.036197,
        -0.009081,
        0.013966
      ],
      "efectivo": [
        2924680.52,
        3054815.0,
        3322085.82,
        3886593.67
      ],
      "contrafactual_corte": 4564079.28,
      "mejor_horizonte": 18,
      "fuente_dominante": "liquidez"
    }
  },
  {
    "nombre": "vistalagua_plusvalia_8_deuda_40",
    "entrada": {
      "cliente": {
        "titulares": [
          {
            "regimen": 97,
            "edad": 45.6,
            "salario_imss": 89132.8,
            "ssv": 1250000,
            "meses_cotizando": 173,
            "ingreso_real": 150000,
            "deducciones_usadas": 0,
            "conserva_valor": 1.0
          },
          {
            "regimen": 97,
            "edad": 49.4,
            "salario_imss": 89132.8,
            "ssv": 1450000,
            "meses_cotizando": 127,
            "ingreso_real": 150000,
            "deducciones_usadas": 0,
            "conserva_valor": 1.0
          }
        ]
      },
      "inmueble": {
        "avaluo": 6349000,
        "escrituracion": 6349000,
        "costo_aliado": 6349000,
        "renta": 25000,
        "plusvalia": 0.06,
        "notariales_credito": 113000,
        "notariales_adicionales": 140000,
        "comision_desarrollador": 0.03,
        "aliado_cubre_notariales": false
      },
      "supuestos": null,
      "palancas": {
        "plusvalia": 0.08,
        "pct_deuda": 0.4,
        "tasa_deuda": 0.4,
        "corte_anios": 5
      }
    },
    "esperado": {
      "credito": 3762000,
      "pmt": 37112.47,
      "remanente": 0.0,
      "notariales_cliente": 140000,
      "ventaja_venta": [
        -146947.3,
        18723.04,
        390420.56,
        1309633.68
      ],
      "ventaja_corte": [
        2282805.5,
        2103721.28,
        1783292.89,
        1309633.68
      ],
      "plusvalia_equilibrio": [
        0.095573,
        0.078562,
        0.061175,
        0.046007
      ],
      "efectivo": [
        3021644.52,
        3301212.09,
        3907515.57,
        5324468.68
      ],
      "contrafactual_corte": 3874835.0,
      "mejor_horizonte": 18,
      "fuente_dominante": "liquidez"
    }
  }
];
