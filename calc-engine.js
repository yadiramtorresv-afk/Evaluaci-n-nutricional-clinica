/**
 * ============================================================================
 * calc-engine.js
 * Motor de cálculo de Nutrición Clínica
 * ============================================================================
 *
 * Fuente de las fórmulas:
 *  - Manual Maestro de Nutrición Clínica México 2026 (Michel Torres, 12 módulos)
 *  - CÁLCULO EXCEL KIT-2.xlsx (hojas: CÁLCULO, ANTROPOMÉTRICO, EMBARAZO,
 *    LACTANCIA, NIÑOS)
 *
 * Cómo está organizado:
 *  - Cada bloque de funciones es un objeto exportable independiente, para que
 *    puedas importar solo lo que necesites en cada pestaña de la app:
 *
 *      import { Energia, IMC, Antropometria, Embarazo, Lactancia, Pediatria,
 *               SoporteNutricional, PlanAlimentacion } from './calc-engine.js';
 *
 *  - Todas las funciones son puras (mismo input -> mismo output), sin efectos
 *    secundarios, para que sean fáciles de probar antes de conectarlas a la UI.
 *  - Unidades esperadas SIEMPRE: peso en kg, talla en metros (salvo que la
 *    función diga explícitamente "_cm"), edad en años.
 *
 * NOTA IMPORTANTE sobre una fórmula del Excel original:
 *  - En la hoja ANTROPOMÉTRICO, la celda J17 (%masa muscular mujeres) hace
 *    referencia a J16 (%masa muscular HOMBRES) en vez de a J15 (masa muscular
 *    total MUJERES). Esto parece un error de arrastre de fórmula del Excel
 *    original. Aquí se corrigió para calcular %MM mujeres a partir de la masa
 *    muscular total de mujeres. Está marcado con un comentario en el código.
 * ============================================================================
 */

// ============================================================================
// UTILIDADES
// ============================================================================

/** Redondea a n decimales (por defecto 1), evitando errores de punto flotante. */
function round(value, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Convierte cm a metros. */
function cmToM(cm) {
  return cm / 100;
}

// ============================================================================
// MÓDULO: IMC Y CLASIFICACIÓN (Manual Maestro Módulo 1 + CÁLCULO/ANTROPOMÉTRICO)
// ============================================================================

const IMC = {
  /**
   * Índice de Masa Corporal.
   * @param {number} peso_kg
   * @param {number} talla_m
   * @returns {number}
   */
  calcular(peso_kg, talla_m) {
    return round(peso_kg / talla_m ** 2, 2);
  },

  /**
   * Clasificación de IMC para adultos (18-64 años).
   * Fuente: Manual Maestro, Módulo 1.
   */
  clasificarAdulto(imc) {
    if (imc < 18.5) return 'Bajo peso';
    if (imc < 25.0) return 'Rango normal';
    if (imc < 30.0) return 'Sobrepeso';
    if (imc < 35.0) return 'Obesidad I';
    if (imc < 40.0) return 'Obesidad II';
    return 'Obesidad III';
  },

  /**
   * Clasificación de IMC para adultos mayores (+65 años).
   * Fuente: CÁLCULO EXCEL KIT, hoja CÁLCULO, B11:C15.
   * Nota: usa puntos de corte distintos a los del adulto general.
   */
  clasificarAdultoMayor(imc) {
    if (imc < 23) return 'Bajo peso';
    if (imc <= 27.9) return 'Normal';
    if (imc <= 31.9) return 'Sobrepeso';
    return 'Obesidad';
  },

  /**
   * Clasificación de IMC pediátrico simplificada (0-19 años), a partir de un
   * IMC ya calculado sobre 100 (ver hoja NIÑOS, celda D14). Ojo: para uso
   * clínico real se debe preferir `Pediatria.interpretarIMCedadOMS`, que usa
   * puntuación Z de referencias OMS. Esta función queda solo como screening
   * rápido tomado tal cual del Excel original.
   */
  clasificarPediatricoRapido(imc_x100) {
    if (imc_x100 < 10) return 'DN1 (desnutrición)';
    if (imc_x100 < 25) return 'Riesgo de desnutrición';
    if (imc_x100 < 75) return 'Normal';
    if (imc_x100 < 89) return 'Sobrepeso';
    return 'Obesidad';
  },
};

// ============================================================================
// MÓDULO: ENERGÍA (GEB / GET) — adultos
// Fuente: Manual Maestro Módulo 2 + CÁLCULO EXCEL KIT hoja CÁLCULO (H4:T6)
// ============================================================================

const Energia = {
  /**
   * Mifflin-St Jeor (coeficientes tal como vienen en el CÁLCULO EXCEL KIT).
   * @param {'M'|'H'} sexo
   */
  mifflin({ peso_kg, talla_cm, edad, sexo }) {
    const base = 9.99 * peso_kg + 6.25 * talla_cm - 4.92 * edad;
    return round(sexo === 'M' ? base - 161 : base + 5);
  },

  /**
   * Mifflin-St Jeor, coeficientes "clásicos" tal como aparecen en el Manual
   * Maestro Módulo 2 (10*W en vez de 9.99*W). Se deja como alternativa porque
   * ambas variantes circulan en la literatura; usa la que tu institución siga.
   */
  mifflinClasico({ peso_kg, talla_cm, edad, sexo }) {
    const base = 10 * peso_kg + 6.25 * talla_cm - 5 * edad;
    return round(sexo === 'M' ? base - 161 : base + 5);
  },

  /** Harris-Benedict. */
  harrisBenedict({ peso_kg, talla_cm, edad, sexo }) {
    if (sexo === 'M') {
      return round(655.1 + 9.563 * peso_kg + 1.85 * talla_cm - 4.676 * edad);
    }
    return round(66.5 + 13.75 * peso_kg + 5.003 * talla_cm - 6.775 * edad);
  },

  /** Cunningham, a partir de masa libre de grasa (Manual Maestro Módulo 2). */
  cunningham(masa_libre_grasa_kg) {
    return round(500 + 22 * masa_libre_grasa_kg);
  },

  /**
   * Gasto Energético Total = GEB x Factor de Actividad, más 10% de Efecto
   * Térmico de los Alimentos (ETA). Fuente: CÁLCULO EXCEL KIT (L5, M5).
   * @param {number} geb
   * @param {number} factorActividad
   */
  gastoEnergeticoTotal(geb, factorActividad) {
    const geb_af = geb * factorActividad;
    const eta = geb_af * 0.1;
    return {
      geb_x_af: round(geb_af),
      eta_10pct: round(eta),
      get: round(geb_af + eta),
    };
  },

  /** Factores de actividad física de referencia usados en el kit. */
  FACTORES_ACTIVIDAD: {
    'Muy ligera': 1.2,
    Ligera: 1.375,
    Moderada: 1.55,
    Intensa: 1.725,
    'Muy intensa': 1.9,
  },

  /** Macronutrientes: g = kcal x % / (4 o 9). Manual Maestro Módulo 2/12. */
  macronutrientes({ kcal_totales, pct_proteina, pct_hc, pct_lipidos }) {
    const kcal_pro = kcal_totales * (pct_proteina / 100);
    const kcal_hc = kcal_totales * (pct_hc / 100);
    const kcal_lip = kcal_totales * (pct_lipidos / 100);
    return {
      proteina: { kcal: round(kcal_pro), gr: round(kcal_pro / 4) },
      hc: { kcal: round(kcal_hc), gr: round(kcal_hc / 4) },
      lipidos: { kcal: round(kcal_lip), gr: round(kcal_lip / 9) },
    };
  },
};

// ============================================================================
// MÓDULO: ANTROPOMETRÍA ADULTOS
// Fuente: CÁLCULO EXCEL KIT, hoja ANTROPOMÉTRICO
// ============================================================================

const Antropometria = {
  /** Peso ideal adultos (fórmula del kit, NO usar en adultos mayores). */
  pesoIdealAdulto(talla_cm) {
    const f17 = talla_cm - 150;
    const f18 = 0.75 * f17;
    return round(f18 + 50);
  },

  /** Peso ideal en adolescentes mujeres. */
  pesoIdealAdolescenteMujer(talla_cm) {
    const factor = 2.27 / 2.54;
    return round((talla_cm - 152) * factor + 45);
  },

  /** Peso ideal en adolescentes hombres. */
  pesoIdealAdolescenteHombre(talla_cm) {
    const factor = 2.27 / 2.54;
    return round((talla_cm - 152) * factor + 50);
  },

  /** Rango de peso saludable (mínimo/máximo) por IMC 18.5-24.99. */
  rangoPesoSaludable(talla_m) {
    return {
      minimo: round(talla_m ** 2 * 18.5),
      maximo: round(talla_m ** 2 * 24.99),
    };
  },

  /** Rango de peso saludable en adulto mayor (IMC 23.1-27.9). */
  rangoPesoSaludableAdultoMayor(talla_m) {
    return {
      minimo: round(talla_m ** 2 * 23.1),
      maximo: round(talla_m ** 2 * 27.9),
    };
  },

  /** Índice cintura-cadera. */
  indiceCinturaCadera(cintura_cm, cadera_cm) {
    return round(cintura_cm / cadera_cm, 2);
  },

  /**
   * Distribución de grasa por Índice Cintura-Cadera (ICC).
   * Umbrales del kit: mujer >0.8 = androide / <0.8 = ginecoide;
   * varón >1.0 = androide / <1.0 = ginecoide.
   */
  distribucionGrasaICC(icc, sexo) {
    const umbral = sexo === 'M' ? 0.8 : 1.0;
    return icc > umbral ? 'Androide' : 'Ginecoide';
  },

  /** % de agua corporal total estimado (kit): (peso x 60) / 100. */
  porcentajeAguaCorporal(peso_kg) {
    return round((peso_kg * 60) / 100);
  },

  /**
   * Complexión física por índice altura/muñeca.
   * Fuente: CÁLCULO EXCEL KIT, hoja ANTROPOMÉTRICO (C19, B24:D26).
   */
  complexion(talla_cm, circunferencia_muneca_cm, sexo) {
    const r = round(talla_cm / circunferencia_muneca_cm, 2);
    if (sexo === 'M') {
      if (r > 10.9) return { indice: r, complexion: 'Pequeña' };
      if (r >= 9.9) return { indice: r, complexion: 'Mediana' };
      return { indice: r, complexion: 'Grande' };
    }
    if (r > 10.4) return { indice: r, complexion: 'Pequeña' };
    if (r >= 9.6) return { indice: r, complexion: 'Mediana' };
    return { indice: r, complexion: 'Grande' };
  },

  /**
   * Densidad corporal por suma de 4 pliegues cutáneos (bicipital,
   * subescapular, suprailiaco, tricipital), método Durnin-Womersley (1974),
   * ecuaciones tal como están en el CÁLCULO EXCEL KIT por grupo de edad/sexo.
   * @param {number} suma_pliegues_mm  Bicipital + Subescapular + Suprailiaco + Tricipital
   * @param {number} edad
   * @param {'M'|'H'} sexo
   */
  densidadCorporal(suma_pliegues_mm, edad, sexo) {
    const logSuma = Math.log10(suma_pliegues_mm);
    // coeficientes [intercepto, pendiente] por grupo de edad, kit original
    const tablas = {
      H: [
        { max: 19, a: 1.162, b: 0.063 },
        { max: 29, a: 1.1631, b: 0.0632 },
        { max: 39, a: 1.1422, b: 0.0544 },
        { max: 49, a: 1.162, b: 0.07 },
        { max: Infinity, a: 1.1715, b: 0.0779 },
      ],
      M: [
        { max: 19, a: 1.1549, b: 0.0678 },
        { max: 29, a: 1.1599, b: 0.0717 },
        { max: 39, a: 1.1423, b: 0.0632 },
        { max: 49, a: 1.1333, b: 0.0612 },
        { max: Infinity, a: 1.1339, b: 0.0645 },
      ],
    };
    const grupo = tablas[sexo].find((g) => edad <= g.max);
    const densidad = grupo.a - grupo.b * logSuma;
    return round(densidad, 4);
  },

  /** % de grasa corporal por Siri y Brozek a partir de densidad corporal. */
  porcentajeGrasaCorporal(densidad_corporal) {
    const siri = 495 / densidad_corporal - 450;
    const brozek = 457 / densidad_corporal - 414;
    return {
      siri: round(siri),
      brozek: round(brozek),
      promedio: round((siri + brozek) / 2),
    };
  },

  /** Rango de % de grasa corporal ideal por edad y sexo (kit, L9:M15). */
  RANGO_GRASA_IDEAL: {
    H: [
      { max: 39, min: 8, max_pct: 19 },
      { max: 59, min: 11, max_pct: 21 },
      { max: Infinity, min: 13, max_pct: 24 },
    ],
    M: [
      { max: 39, min: 21, max_pct: 31 },
      { max: 59, min: 23, max_pct: 33 },
      { max: Infinity, min: 24, max_pct: 35 },
    ],
  },
  rangoGrasaIdeal(edad, sexo) {
    const grupo = this.RANGO_GRASA_IDEAL[sexo].find((g) => edad <= g.max);
    return { min: grupo.min, max: grupo.max_pct };
  },

  /** Kg de grasa total y masa libre de grasa a partir de % grasa. */
  composicionCorporal(peso_kg, pct_grasa) {
    const kgGrasa = round((peso_kg * pct_grasa) / 100);
    return {
      kg_grasa_total: kgGrasa,
      masa_libre_grasa_kg: round(peso_kg - kgGrasa),
    };
  },

  /**
   * Área muscular del brazo (cm²), a partir de circunferencia de brazo (cm)
   * y pliegue tricipital (mm). Constantes del kit: 4π=12.56; mujeres -6.5;
   * hombres -10.
   */
  areaMuscularBrazo(circunferencia_brazo_cm, pliegue_tricipital_mm, sexo) {
    const cmbCorregido =
      circunferencia_brazo_cm - 0.31416 * pliegue_tricipital_mm;
    const constante = sexo === 'M' ? 10 : 6.5;
    return round(cmbCorregido ** 2 / 12.56 - constante);
  },

  /**
   * Masa muscular total y % de masa muscular.
   * K21=0.0029, K22=0.0264 son constantes del kit (Heymsfield et al.).
   * OJO: se corrigió el bug de referencia circular de la celda J17 del Excel
   * original (ver nota al inicio del archivo).
   */
  masaMuscularTotal(talla_cm, area_muscular_brazo_cm2, peso_kg) {
    const factor = area_muscular_brazo_cm2 * 0.0029 + 0.0264;
    const masaMuscularTotalKg = round((talla_cm * factor) / 1);
    return {
      masa_muscular_total_kg: masaMuscularTotalKg,
      porcentaje_masa_muscular: round((masaMuscularTotalKg * 100) / peso_kg),
    };
  },
};

// ============================================================================
// MÓDULO: EMBARAZO
// Fuente: Manual Maestro Módulo 4A + CÁLCULO EXCEL KIT, hojas EMBARAZO y CÁLCULO
// ============================================================================

const Embarazo = {
  /** IMC pregestacional. */
  imcPregestacional(peso_pregest_kg, talla_m) {
    return IMC.calcular(peso_pregest_kg, talla_m);
  },

  /** Categoría de IMC pregestacional y ganancia de peso total recomendada. */
  categoriaGanancia(imc_pregestacional) {
    if (imc_pregestacional < 18.5) {
      return { categoria: 'Bajo peso', ganancia_kg: '12.5 a 18' };
    }
    if (imc_pregestacional < 25.0) {
      return { categoria: 'Normal', ganancia_kg: '11.5 a 16' };
    }
    if (imc_pregestacional < 30.0) {
      return { categoria: 'Sobrepeso', ganancia_kg: '7 a 11.5' };
    }
    return { categoria: 'Obesidad', ganancia_kg: '5 a 9' };
  },

  /** kcal extra por trimestre. Fuente: Manual Maestro Módulo 4A / kit B28:C30. */
  ENERGIA_EXTRA_TRIMESTRE: { 1: 300, 2: 340, 3: 452 },
  energiaExtraTrimestre(trimestre) {
    return this.ENERGIA_EXTRA_TRIMESTRE[trimestre] ?? 0;
  },

  /** GET de la embarazada = GET pregestacional + kcal extra del trimestre. */
  getEmbarazada(get_pregestacional, trimestre) {
    return round(get_pregestacional + this.energiaExtraTrimestre(trimestre));
  },

  /**
   * Peso esperado según semana de gestación e IMC pregestacional.
   * Fuente: kit, hoja EMBARAZO, filas 19-44 (tabla por SDG).
   * Devuelve el incremento esperado sobre el peso pregestacional.
   */
  TABLA_GANANCIA_POR_SDG: [
    { sdg: 16, '<18.5': 5.15, '18.6-24.9': 4.27, '25-29.9': 3.79, '>30': 2.93 },
    { sdg: 17, '<18.5': 5.47, '18.6-24.9': 4.54, '25-29.9': 4.03, '>30': 3.11 },
    { sdg: 18, '<18.5': 5.8, '18.6-24.9': 4.81, '25-29.9': 4.27, '>30': 3.29 },
    { sdg: 19, '<18.5': 6.12, '18.6-24.9': 5.07, '25-29.9': 4.5, '>30': 3.48 },
    { sdg: 20, '<18.5': 6.44, '18.6-24.9': 5.34, '25-29.9': 4.74, '>30': 3.66 },
    { sdg: 21, '<18.5': 6.76, '18.6-24.9': 5.61, '25-29.9': 4.98, '>30': 3.84 },
    { sdg: 22, '<18.5': 7.08, '18.6-24.9': 5.87, '25-29.9': 5.21, '>30': 4.03 },
    { sdg: 23, '<18.5': 7.41, '18.6-24.9': 6.14, '25-29.9': 5.45, '>30': 4.21 },
    { sdg: 24, '<18.5': 7.73, '18.6-24.9': 6.41, '25-29.9': 5.69, '>30': 4.39 },
    { sdg: 25, '<18.5': 8.05, '18.6-24.9': 6.68, '25-29.9': 5.93, '>30': 4.58 },
    { sdg: 26, '<18.5': 8.37, '18.6-24.9': 6.94, '25-29.9': 6.16, '>30': 4.76 },
    { sdg: 27, '<18.5': 8.69, '18.6-24.9': 6.21, '25-29.9': 6.4, '>30': 4.94 },
    { sdg: 28, '<18.5': 9.02, '18.6-24.9': 7.48, '25-29.9': 6.64, '>30': 5.12 },
    { sdg: 29, '<18.5': 9.34, '18.6-24.9': 7.74, '25-29.9': 6.87, '>30': 5.31 },
    { sdg: 30, '<18.5': 9.66, '18.6-24.9': 8.01, '25-29.9': 7.11, '>30': 5.49 },
    { sdg: 31, '<18.5': 9.98, '18.6-24.9': 8.28, '25-29.9': 7.35, '>30': 5.67 },
    { sdg: 32, '<18.5': 10.3, '18.6-24.9': 8.54, '25-29.9': 7.58, '>30': 5.86 },
    { sdg: 33, '<18.5': 10.63, '18.6-24.9': 8.81, '25-29.9': 7.82, '>30': 6.04 },
    { sdg: 34, '<18.5': 10.95, '18.6-24.9': 9.08, '25-29.9': 8.06, '>30': 6.22 },
    { sdg: 35, '<18.5': 11.27, '18.6-24.9': 9.35, '25-29.9': 8.3, '>30': 6.41 },
    { sdg: 36, '<18.5': 11.59, '18.6-24.9': 9.61, '25-29.9': 8.53, '>30': 6.59 },
    { sdg: 37, '<18.5': 11.91, '18.6-24.9': 9.88, '25-29.9': 8.77, '>30': 6.77 },
    { sdg: 38, '<18.5': 12.24, '18.6-24.9': 10.15, '25-29.9': 9.01, '>30': 6.95 },
    { sdg: 39, '<18.5': 12.56, '18.6-24.9': 10.41, '25-29.9': 9.24, '>30': 7.14 },
    { sdg: 40, '<18.5': 12.88, '18.6-24.9': 10.68, '25-29.9': 9.48, '>30': 7.32 },
  ],
  pesoEsperadoPorSDG(peso_pregest_kg, sdg, imc_pregestacional) {
    let columna;
    if (imc_pregestacional < 18.5) columna = '<18.5';
    else if (imc_pregestacional < 25.0) columna = '18.6-24.9';
    else if (imc_pregestacional < 30.0) columna = '25-29.9';
    else columna = '>30';

    const fila = this.TABLA_GANANCIA_POR_SDG.reduce((prev, curr) =>
      Math.abs(curr.sdg - sdg) < Math.abs(prev.sdg - sdg) ? curr : prev
    );
    const incremento = fila[columna];
    return {
      incremento_esperado_kg: incremento,
      peso_esperado_kg: round(peso_pregest_kg + incremento),
    };
  },

  /**
   * IDR de vitaminas y minerales clave, comparando estado no-gestante,
   * embarazo y lactancia. Fuente: kit hoja EMBARAZO (P3:T17) + Manual
   * Maestro Módulo 4A/4B.
   */
  IDR_MICRONUTRIENTES: {
    hierro_mg: { no_embarazo: 22, embarazo: 29, lactancia_temprana: 19, lactancia_tardia: 25 },
    zinc_mg: { no_embarazo: 11, embarazo: 14, lactancia: 14 },
    calcio_mg: { menor_19: 1300, mayor_19: 1000 },
    vitaminaA_ugER: { no_embarazo: 700, embarazo: 770, lactancia: 1300 },
    vitaminaC_mg: { no_embarazo: 75, embarazo: 138, lactancia: 128 },
    vitaminaD_ugER: { no_embarazo: 5, embarazo: 5, lactancia: 5 },
    vitaminaE_mg: { no_embarazo: 15, embarazo: 15, lactancia: 19 },
    folato_ugDFE: { embarazo: 600, lactancia: 500 },
  },
};

// ============================================================================
// MÓDULO: LACTANCIA
// Fuente: Manual Maestro Módulo 4B + CÁLCULO EXCEL KIT, hoja LACTANCIA
// ============================================================================

const Lactancia = {
  /** kcal extra según etapa de lactancia. */
  energiaExtra(meses_postparto) {
    return meses_postparto <= 6 ? 500 : 400;
  },

  /** Recomendaciones de micronutrientes por grupo de edad de la madre. */
  MICRONUTRIENTES: {
    '14-18': {
      vitaminaA_mcg: 1200, vitaminaC_mg: 115, vitaminaD_mcg: 5, vitaminaE_mg: 19,
      vitaminaK_mcg: 75, tiamina_mg: 1.4, riboflavina_mg: 1.6, niacina_mg: 17,
      vitaminaB6_mg: 2, folato_mcg: 500, vitaminaB12_mcg: 2.8,
      calcio_mg: 1300, cromo_mcg: 44, cobre_mg: 1300, fluor_mg: 3, yodo_mcg: 290,
      hierro_mg: 10, magnesio_mg: 360, fosforo_mg: 1250, selenio_mcg: 70,
      zinc_mg: 13, potasio_g: 5.1, sodio_g: 1.5, cloro_g: 2.3,
    },
    '19-30': {
      vitaminaA_mcg: 1300, vitaminaC_mg: 120, vitaminaD_mcg: 5, vitaminaE_mg: 19,
      vitaminaK_mcg: 90, tiamina_mg: 1.4, riboflavina_mg: 1.6, niacina_mg: 17,
      vitaminaB6_mg: 2, folato_mcg: 500, vitaminaB12_mcg: 2.8,
      calcio_mg: 1000, cromo_mcg: 45, cobre_mg: 1300, fluor_mg: 3, yodo_mcg: 290,
      hierro_mg: 9, magnesio_mg: 310, fosforo_mg: 700, selenio_mcg: 70,
      zinc_mg: 12, potasio_g: 5.1, sodio_g: 1.5, cloro_g: 2.3,
    },
    '31-50': {
      vitaminaA_mcg: 1300, vitaminaC_mg: 120, vitaminaD_mcg: 5, vitaminaE_mg: 19,
      vitaminaK_mcg: 90, tiamina_mg: 1.4, riboflavina_mg: 1.6, niacina_mg: 17,
      vitaminaB6_mg: 2, folato_mcg: 500, vitaminaB12_mcg: 2.8,
      calcio_mg: 1000, cromo_mcg: 45, cobre_mg: 1300, fluor_mg: 3, yodo_mcg: 290,
      hierro_mg: 9, magnesio_mg: 320, fosforo_mg: 700, selenio_mcg: 70,
      zinc_mg: 12, potasio_g: 5.1, sodio_g: 1.5, cloro_g: 2.3,
    },
  },
  micronutrientesPorEdad(edad) {
    if (edad <= 18) return this.MICRONUTRIENTES['14-18'];
    if (edad <= 30) return this.MICRONUTRIENTES['19-30'];
    return this.MICRONUTRIENTES['31-50'];
  },
};

// ============================================================================
// MÓDULO: PEDIATRÍA
// Fuente: Manual Maestro Módulo 5 + CÁLCULO EXCEL KIT, hoja NIÑOS
// ============================================================================

const Pediatria = {
  /**
   * Ecuación de Schofield (GET) por edad, sexo y actividad, en kcal/día.
   * Coeficientes tal como aparecen en el kit (Q15:Q17, Q22:Q24), luego se
   * multiplica por el factor de estrés/actividad (P12 = 1.2 por defecto).
   * @param {number} peso_kg
   * @param {number} talla_cm
   * @param {number} edad_anios
   * @param {'M'|'H'} sexo
   * @param {number} [factorEstres=1.2]
   */
  schofield(peso_kg, talla_cm, edad_anios, sexo, factorEstres = 1.2) {
    let base;
    if (sexo === 'H') {
      if (edad_anios < 3) base = 0.167 * peso_kg + 15.17 * talla_cm - 617.6;
      else if (edad_anios <= 10) base = 19.59 * peso_kg + 1.303 * talla_cm + 414.9;
      else base = 16.25 * peso_kg + 1.372 * talla_cm + 515.5;
    } else {
      if (edad_anios < 3) base = 16.252 * peso_kg + 10.232 * talla_cm - 413.5;
      else if (edad_anios <= 10) base = 16.969 * peso_kg + 1.618 * talla_cm + 371.2;
      else base = 8.365 * peso_kg + 4.65 * talla_cm + 200;
    }
    return {
      geb_schofield: round(base),
      get: round(base * factorEstres),
      kcal_por_kg: round((base * factorEstres) / peso_kg),
    };
  },

  /**
   * Requerimiento calórico por componentes (IMB + GEA + GTA + GEC), método
   * usado en la hoja NIÑOS (columnas F-L) por grupo etario/actividad.
   * Grupo: 'lactante_menor' | 'lactante_mayor' | 'preescolar' | 'escolar' | 'adolescente'
   */
  requerimientoPorComponentes(peso_kg, grupo, sexo) {
    // IMB (kcal/kg equiv. Harris-Benedict simplificado por rango de edad),
    // los coeficientes de IMB dependen solo de edad, no de sexo, en el kit.
    const IMB_COEF = {
      lactante_menor: { a: 0.249, b: -0.127 }, // <3 años
      lactante_mayor: { a: 0.249, b: -0.127 }, // <3 años
      preescolar: { a: 0.095, b: 2.11 }, // 3-10 años
      escolar: { a: 0.074, b: 2.754 }, // 3-10 años
      adolescente: { a: 0.074, b: 2.754 }, // >10 años (usa el de escolar)
    };
    const GEA_GTA_GEC = {
      // gastos de actividad(GEA)/termogénesis(GTA)/crecimiento(GEC) en kcal/kg
      lactante_menor: { gea: 25, gta: 8, gec: 20 },
      lactante_mayor: { gea: 20, gta: 7, gec: 15 },
      preescolar: { gea: 15, gta: 6, gec: 10 },
      escolar: { gea: 10, gta: 5, gec: 10 },
      adolescente: { gea: 5, gta: 4, gec: 10 },
    };
    const c = IMB_COEF[grupo];
    const g = GEA_GTA_GEC[grupo];
    const imb = (c.a * peso_kg + c.b) * 239.2;
    const gea = g.gea * peso_kg;
    const gta = g.gta * peso_kg;
    const gec = g.gec * peso_kg;
    return {
      imb: round(imb),
      gea: round(gea),
      gta: round(gta),
      gec: round(gec),
      total: round(imb + gea + gta + gec),
    };
  },

  /**
   * Requerimiento de proteína en lactantes (g/día), fórmula del kit
   * (H22, H23): ((kcal_ref * peso * 1.3 * 1.3 * 6.25) / 0.75) / 1000
   * kcal_ref: 154 (lactante menor) / 130 (lactante mayor) / 120 (preescolar)
   * / 112 (escolar) / 90 (adolescente)
   */
  PROTEINA_KCAL_REF: {
    lactante_menor: 154,
    lactante_mayor: 130,
    preescolar: 120,
    escolar: 112,
    adolescente: 90,
  },
  requerimientoProteinaLactante(peso_kg, grupo) {
    const kcalRef = this.PROTEINA_KCAL_REF[grupo];
    return round(((kcalRef * peso_kg * 1.3 * 1.3 * 6.25) / 0.75) / 1000);
  },

  /** Peso ajustado pediátrico: ((peso actual - peso ideal) x 0.25) + peso ideal. */
  pesoAjustado(peso_actual_kg, peso_ideal_kg) {
    return round((peso_actual_kg - peso_ideal_kg) * 0.25 + peso_ideal_kg);
  },

  /** Índice de Riesgo Nutricional (IRN): (P.act/Talla) / (P.ideal/Talla) x 100. */
  indiceRiesgoNutricional(peso_actual_kg, peso_ideal_kg, talla_cm) {
    return round(
      (peso_actual_kg / talla_cm / (peso_ideal_kg / talla_cm)) * 100
    );
  },

  /** % de peso estándar y su clasificación (Gómez), a modo histórico/educativo. */
  porcentajePesoEstandar(peso_actual_kg, peso_ideal_kg) {
    const pct = round((peso_actual_kg / peso_ideal_kg) * 100);
    let clasificacion;
    if (pct < 60) clasificacion = 'Desnutrición severa';
    else if (pct < 80) clasificacion = 'Desnutrición moderada';
    else if (pct < 90) clasificacion = 'Desnutrición leve';
    else if (pct < 110) clasificacion = 'Normal';
    else if (pct < 120) clasificacion = 'Sobrepeso';
    else clasificacion = 'Obesidad';
    return { porcentaje: pct, clasificacion };
  },

  /**
   * Interpretación de IMC/edad para 5-19 años según puntuación Z OMS.
   * Requiere el z-score ya calculado (con tablas LMS oficiales OMS —
   * ver TODO en el módulo de percentiles). Aquí solo se aplica el corte.
   * Fuente: Manual Maestro Módulo 5.
   */
  interpretarIMCedadOMS(z_score) {
    if (z_score > 2) return 'Obesidad';
    if (z_score > 1) return 'Sobrepeso';
    if (z_score < -3) return 'Delgadez severa';
    if (z_score < -2) return 'Delgadez';
    return 'Normal';
  },

  /** Interpretación de talla/edad y peso/talla en <5 años por Z-score OMS. */
  interpretarTallaEdadOMS(z_score) {
    if (z_score < -3) return 'Retraso en talla severo';
    if (z_score < -2) return 'Retraso en talla';
    return 'Normal';
  },
  interpretarPesoTallaOMS(z_score) {
    if (z_score > 3) return 'Obesidad';
    if (z_score > 2) return 'Sobrepeso';
    if (z_score < -3) return 'Emaciación severa';
    if (z_score < -2) return 'Emaciación';
    return 'Normal';
  },
};

// ============================================================================
// MÓDULO: SOPORTE NUTRICIONAL (enteral / parenteral)
// Fuente: Manual Maestro Módulo 8
// ============================================================================

const SoporteNutricional = {
  /** Volumen de fórmula enteral (mL/día) = kcal objetivo / kcal por mL. */
  volumenEnteral(kcal_objetivo, kcal_por_ml) {
    return round(kcal_objetivo / kcal_por_ml);
  },

  /** Velocidad de infusión (mL/h) = volumen total / horas de infusión. */
  velocidadInfusion(volumen_total_ml, horas) {
    return round(volumen_total_ml / horas);
  },

  /** Requerimiento proteico simple = kg x g/kg/día. */
  requerimientoProteina(peso_kg, g_por_kg) {
    return round(peso_kg * g_por_kg);
  },

  /**
   * Tasa de infusión de glucosa (GIR) en mg/kg/min.
   * GIR = (gramos de glucosa x 1000) / (kg x 1440)
   */
  gir(gramos_glucosa, peso_kg) {
    return round((gramos_glucosa * 1000) / (peso_kg * 1440), 2);
  },

  /** kcal aportadas por macronutrientes parenterales. */
  KCAL_POR_GRAMO: { dextrosa: 3.4, aminoacidos: 4, lipidos: 9 },

  /** Agua adicional requerida = necesidad total - agua aportada por la fórmula y otros. */
  aguaAdicional(necesidad_total_ml, agua_aportada_ml) {
    return round(necesidad_total_ml - agua_aportada_ml);
  },
};

// ============================================================================
// MÓDULO: PLAN DE ALIMENTACIÓN POR EQUIVALENTES (SMAE)
// Fuente: CÁLCULO EXCEL KIT, hoja CÁLCULO (E11:O28) y ANEXO SMAE 2014
// Aporte nutrimental por 1 porción de cada grupo, tal como está en el kit.
// ============================================================================

const PlanAlimentacion = {
  /**
   * Aporte energético y de macronutrientes por 1 porción/equivalente,
   * por grupo de alimento. kcal, PT=proteína(g), LP=lípidos(g), HC=hidratos(g).
   */
  GRUPOS_SMAE: {
    verduras: { kcal: 25, pt: 2, lp: 0, hc: 4 },
    frutas: { kcal: 60, pt: 0, lp: 0, hc: 15 },
    cereales_sin_grasa: { kcal: 70, pt: 2, lp: 0, hc: 15 },
    cereales_con_grasa: { kcal: 115, pt: 2, lp: 5, hc: 15 },
    leguminosas: { kcal: 120, pt: 8, lp: 1, hc: 20 },
    aoa_muy_bajo_aporte_grasa: { kcal: 40, pt: 7, lp: 1, hc: 0 },
    aoa_bajo_aporte_grasa: { kcal: 55, pt: 7, lp: 3, hc: 0 },
    aoa_moderado_aporte_grasa: { kcal: 75, pt: 7, lp: 5, hc: 0 },
    aoa_alto_aporte_grasa: { kcal: 100, pt: 7, lp: 8, hc: 0 },
    leche_descremada: { kcal: 95, pt: 9, lp: 2, hc: 12 },
    leche_semidescremada: { kcal: 110, pt: 9, lp: 4, hc: 12 },
    leche_entera: { kcal: 150, pt: 9, lp: 8, hc: 12 },
    leche_con_azucar: { kcal: 200, pt: 8, lp: 5, hc: 30 },
    aceites_sin_proteina: { kcal: 45, pt: 0, lp: 5, hc: 0 },
    aceites_con_proteina: { kcal: 70, pt: 3, lp: 5, hc: 3 },
    azucares_sin_grasa: { kcal: 40, pt: 0, lp: 0, hc: 10 },
    azucares_con_grasa: { kcal: 85, pt: 0, lp: 5, hc: 10 },
  },

  /** Calcula el aporte de N porciones de un grupo. */
  aportePorGrupo(grupo, porciones) {
    const g = this.GRUPOS_SMAE[grupo];
    if (!g) throw new Error(`Grupo SMAE desconocido: ${grupo}`);
    return {
      kcal: round(g.kcal * porciones),
      proteina_g: round(g.pt * porciones),
      lipidos_g: round(g.lp * porciones),
      hc_g: round(g.hc * porciones),
    };
  },

  /**
   * Suma el aporte total de un menú (objeto { grupo: porciones, ... }) y lo
   * compara contra la meta calórica y de macros (para la barra
   * "Ideal / Menú / Faltan-Sobran" tipo la del software de referencia).
   */
  calcularAdecuacionMenu(menu, meta) {
    const totales = { kcal: 0, proteina_g: 0, lipidos_g: 0, hc_g: 0 };
    for (const [grupo, porciones] of Object.entries(menu)) {
      const aporte = this.aportePorGrupo(grupo, porciones);
      totales.kcal += aporte.kcal;
      totales.proteina_g += aporte.proteina_g;
      totales.lipidos_g += aporte.lipidos_g;
      totales.hc_g += aporte.hc_g;
    }
    const adecuacion = (real, ideal) => (ideal ? round((real / ideal) * 100) : 0);
    return {
      totales: {
        kcal: round(totales.kcal),
        proteina_g: round(totales.proteina_g),
        lipidos_g: round(totales.lipidos_g),
        hc_g: round(totales.hc_g),
      },
      meta,
      adecuacion_pct: {
        kcal: adecuacion(totales.kcal, meta.kcal),
        proteina: adecuacion(totales.proteina_g, meta.proteina_g),
        lipidos: adecuacion(totales.lipidos_g, meta.lipidos_g),
        hc: adecuacion(totales.hc_g, meta.hc_g),
      },
    };
  },

  /** % y g/día de pérdida de peso (Manual Maestro, fórmula estándar). */
  porcentajePerdidaPeso(peso_usual_kg, peso_actual_kg) {
    return round(((peso_usual_kg - peso_actual_kg) / peso_usual_kg) * 100, 1);
  },

  /** Superficie corporal (Mosteller). */
  superficieCorporal(peso_kg, talla_cm) {
    return round(Math.sqrt((peso_kg * talla_cm) / 3600), 2);
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export {
  IMC,
  Energia,
  Antropometria,
  Embarazo,
  Lactancia,
  Pediatria,
  SoporteNutricional,
  PlanAlimentacion,
};
