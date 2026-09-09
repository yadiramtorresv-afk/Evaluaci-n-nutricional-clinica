/**
 * ============================================================================
 * percentiles.js
 * Percentiles y puntuación Z antropométrica — Estándares/Referencia OMS
 * ============================================================================
 *
 * Fuente de los datos (parámetros L, M, S oficiales, de dominio público,
 * publicados por la OMS para uso en herramientas clínicas):
 *  - 0-5 años: "WHO Child Growth Standards" (2006) — peso/edad y talla/edad
 *    en resolución DIARIA (día 0 a día 1856); peso/talla en incrementos de
 *    0.5 cm (45-120 cm). Fuente original: who.int/tools/child-growth-standards
 *  - 5-19 años: "WHO Reference 2007" — IMC/edad y talla/edad en resolución
 *    MENSUAL (mes 61 a 228). Fuente original:
 *    who.int/tools/growth-reference-data-for-5to19-years
 *
 * Los datos viven en who-growth-lms.json (cárgalo con fetch, igual que
 * food-database.json).
 *
 * Método: LMS (Cole & Green, 1992), el mismo que usa la OMS:
 *   Z = ((X / M)^L - 1) / (L * S)     si L ≠ 0
 *   Z = ln(X / M) / S                  si L = 0 (talla/edad, L siempre = 1
 *                                        en las tablas OMS, así que esta
 *                                        rama no se usa para talla, pero se
 *                                        deja por completitud del método)
 *
 * Uso típico:
 *
 *   import { cargarTablasOMS, Percentiles } from './percentiles.js';
 *   const tablas = await cargarTablasOMS('./who-growth-lms.json');
 *
 *   const z = Percentiles.zScoreIMCedad(tablas, { imc: 16.67, edad_meses: 86, sexo: 'M' });
 *   // { z: -0.02, percentil: 49.2, interpretacion: 'Normal' }
 * ============================================================================
 */

// ============================================================================
// CARGA DE DATOS
// ============================================================================

async function cargarTablasOMS(url = './who-growth-lms.json') {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudieron cargar las tablas OMS (${res.status})`);
  }
  return res.json();
}

// ============================================================================
// MÉTODO LMS — núcleo matemático
// ============================================================================

/** Busca la fila L,M,S más cercana a x (por edad en días/meses, o por talla en cm). */
function filaMasCercana(tabla, x) {
  // Búsqueda binaria simple asumiendo tabla ordenada ascendente por 'x' o 'month'.
  let mejor = tabla[0];
  let mejorDist = Infinity;
  for (const fila of tabla) {
    const valor = fila.x ?? fila.month;
    const dist = Math.abs(valor - x);
    if (dist < mejorDist) {
      mejorDist = dist;
      mejor = fila;
    }
    if (dist === 0) break;
  }
  return mejor;
}

/** Puntuación Z por método LMS a partir de L, M, S y el valor medido. */
function zScoreLMS(valorMedido, L, M, S) {
  if (Math.abs(L) < 1e-9) {
    return Math.log(valorMedido / M) / S;
  }
  return (Math.pow(valorMedido / M, L) - 1) / (L * S);
}

/**
 * Inversa del método LMS: dado un Z deseado (ej. -2, 0, +2), devuelve el
 * valor medido correspondiente (peso, talla o IMC). Se usa para dibujar
 * las curvas de referencia (percentiles) en una gráfica de crecimiento.
 */
function valorParaZ(z, L, M, S) {
  if (Math.abs(L) < 1e-9) {
    return M * Math.exp(S * z);
  }
  return M * Math.pow(1 + L * S * z, 1 / L);
}

/**
 * Aproximación de la función de distribución normal acumulada (Zelen & Severo),
 * para convertir Z a percentil sin depender de una librería externa.
 */
function percentilDesdeZ(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  let prob =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) prob = 1 - prob;
  return Math.round(prob * 1000) / 10; // percentil con 1 decimal
}

// ============================================================================
// API DE ALTO NIVEL
// ============================================================================

const Percentiles = {
  /**
   * Z-score de IMC para la edad (5-19 años, Referencia OMS 2007).
   * @param {object} tablas resultado de cargarTablasOMS()
   * @param {{imc:number, edad_meses:number, sexo:'M'|'H'}} datos
   */
  zScoreIMCedad(tablas, { imc, edad_meses, sexo }) {
    const grupo = sexo === 'M' ? 'girls' : 'boys';
    const tabla = tablas.bmi_for_age['5_19'][grupo];
    const fila = filaMasCercana(tabla, edad_meses);
    const z = zScoreLMS(imc, fila.L, fila.M, fila.S);
    return {
      z: Math.round(z * 100) / 100,
      percentil: percentilDesdeZ(z),
      interpretacion: interpretarIMCedad(z),
    };
  },

  /**
   * Z-score de talla/estatura para la edad.
   * 0-5 años usa el estándar OMS 2006 (resolución diaria, `edad_dias`).
   * 5-19 años usa la referencia OMS 2007 (resolución mensual, `edad_meses`).
   */
  zScoreTallaEdad(tablas, { talla_cm, edad_dias, edad_meses, sexo }) {
    const grupo = sexo === 'M' ? 'girls' : 'boys';
    let fila, z;
    if (edad_dias != null && edad_dias <= 1856) {
      fila = filaMasCercana(tablas.height_for_age['0_5'][grupo], edad_dias);
    } else {
      const meses = edad_meses ?? Math.round(edad_dias / 30.4375);
      fila = filaMasCercana(tablas.height_for_age['5_19'][grupo], meses);
    }
    z = zScoreLMS(talla_cm, fila.L, fila.M, fila.S);
    return {
      z: Math.round(z * 100) / 100,
      percentil: percentilDesdeZ(z),
      interpretacion:
        edad_dias != null && edad_dias <= 1856
          ? interpretarTallaEdad0a5(z)
          : interpretarTallaEdad5a19(z),
    };
  },

  /** Z-score de peso para la edad (0-5 años únicamente, estándar OMS 2006). */
  zScorePesoEdad(tablas, { peso_kg, edad_dias, sexo }) {
    const grupo = sexo === 'M' ? 'girls' : 'boys';
    const fila = filaMasCercana(tablas.weight_for_age['0_5'][grupo], edad_dias);
    const z = zScoreLMS(peso_kg, fila.L, fila.M, fila.S);
    return {
      z: Math.round(z * 100) / 100,
      percentil: percentilDesdeZ(z),
      interpretacion: interpretarPesoEdad(z),
    };
  },

  /** Z-score de peso para la talla/longitud (0-5 años, estándar OMS 2006). */
  zScorePesoTalla(tablas, { peso_kg, talla_cm, sexo }) {
    const grupo = sexo === 'M' ? 'girls' : 'boys';
    const fila = filaMasCercana(tablas.weight_for_height['0_5'][grupo], talla_cm);
    const z = zScoreLMS(peso_kg, fila.L, fila.M, fila.S);
    return {
      z: Math.round(z * 100) / 100,
      percentil: percentilDesdeZ(z),
      interpretacion: interpretarPesoTalla(z),
    };
  },
};

// ============================================================================
// INTERPRETACIÓN CLÍNICA (cortes del Manual Maestro, Módulo 5)
// ============================================================================

function interpretarIMCedad(z) {
  if (z > 2) return 'Obesidad';
  if (z > 1) return 'Sobrepeso';
  if (z < -3) return 'Delgadez severa';
  if (z < -2) return 'Delgadez';
  return 'Normal';
}

function interpretarTallaEdad0a5(z) {
  if (z < -3) return 'Retraso en talla severo';
  if (z < -2) return 'Retraso en talla';
  return 'Normal';
}

/** Para 5-19 años el manual no da cortes específicos de talla/edad más allá
 * del retraso; se reutiliza el mismo criterio que 0-5 por consistencia. */
function interpretarTallaEdad5a19(z) {
  return interpretarTallaEdad0a5(z);
}

function interpretarPesoEdad(z) {
  if (z < -3) return 'Bajo peso severo';
  if (z < -2) return 'Bajo peso';
  return 'Normal';
}

function interpretarPesoTalla(z) {
  if (z > 3) return 'Obesidad';
  if (z > 2) return 'Sobrepeso';
  if (z < -3) return 'Emaciación severa';
  if (z < -2) return 'Emaciación';
  return 'Normal';
}

export { cargarTablasOMS, Percentiles, zScoreLMS, valorParaZ, percentilDesdeZ };
