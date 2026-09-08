/**
 * ============================================================================
 * food-database.js
 * Base de datos de alimentos — Sistema Mexicano de Alimentos Equivalentes
 * (SMAE), 4ª edición.
 * ============================================================================
 *
 * Fuente: SMAE 4a. Edición (tu Google Sheet en Drive), 20 grupos de
 * intercambio, 1,941 alimentos con su equivalencia estándar (porción, peso
 * bruto/neto, energía, macronutrientes y algunos micronutrientes clave).
 *
 * Este archivo NO trae los datos embebidos (el JSON pesa ~530 KB) — los
 * carga desde food-database.json, que debe estar accesible en la misma ruta
 * relativa (o pásale la que uses en tu proyecto).
 *
 * Uso típico:
 *
 *   import { cargarBaseDeAlimentos, buscarAlimento, aporteDeAlimento }
 *     from './food-database.js';
 *
 *   const db = await cargarBaseDeAlimentos('/data/food-database.json');
 *   const resultados = buscarAlimento(db, 'pechuga de pollo');
 *   const aporte = aporteDeAlimento(resultados[0], 1.5); // 1.5 porciones
 *
 * Grupos disponibles (`slug`):
 *   verduras, frutas, cereales_sin_grasa, cereales_con_grasa, leguminosas,
 *   aoa_muy_bajo_aporte_grasa, aoa_bajo_aporte_grasa,
 *   aoa_moderado_aporte_grasa, aoa_alto_aporte_grasa, leche_descremada,
 *   leche_semidescremada, leche_entera, leche_con_azucar,
 *   aceites_sin_proteina, aceites_con_proteina, azucares_sin_grasa,
 *   azucares_con_grasa, alimentos_libres, bebidas_alcoholicas,
 *   lacteos_fermentados_yakult
 *
 * Estos slugs coinciden 1:1 con las claves de `PlanAlimentacion.GRUPOS_SMAE`
 * en calc-engine.js (salvo `alimentos_libres`, `bebidas_alcoholicas` y
 * `lacteos_fermentados_yakult`, que son informativos y no cuentan como
 * porción de macro dentro del reparto de dieta).
 * ============================================================================
 */

/**
 * Carga y parsea el JSON de la base de alimentos.
 * @param {string} url Ruta al archivo food-database.json
 * @returns {Promise<object>} objeto { slug: { nombre_grupo, alimentos: [...] } }
 */
async function cargarBaseDeAlimentos(url = './food-database.json') {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`No se pudo cargar la base de alimentos (${res.status})`);
  }
  return res.json();
}

/**
 * Quita acentos y normaliza a minúsculas, para búsqueda tolerante a tildes.
 */
function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca alimentos por nombre (substring, insensible a acentos/mayúsculas),
 * en toda la base o restringido a un grupo.
 * @param {object} db resultado de cargarBaseDeAlimentos()
 * @param {string} query texto a buscar, ej. "pechuga de pollo"
 * @param {string} [grupoSlug] opcional, restringe la búsqueda a un solo grupo
 * @returns {Array<object>} alimentos con su `grupo` (slug) anexado
 */
function buscarAlimento(db, query, grupoSlug = null) {
  const q = normalizar(query);
  const grupos = grupoSlug ? [grupoSlug] : Object.keys(db).filter((k) => !k.startsWith('_'));
  const resultados = [];
  for (const slug of grupos) {
    const grupo = db[slug];
    if (!grupo) continue;
    for (const alimento of grupo.alimentos) {
      if (normalizar(alimento.alimento).includes(q)) {
        resultados.push({ ...alimento, grupo: slug, nombre_grupo: grupo.nombre_grupo });
      }
    }
  }
  return resultados;
}

/** Devuelve todos los alimentos de un grupo. */
function alimentosPorGrupo(db, grupoSlug) {
  const grupo = db[grupoSlug];
  if (!grupo) throw new Error(`Grupo desconocido: ${grupoSlug}`);
  return grupo.alimentos;
}

/**
 * Calcula el aporte nutrimental de N porciones/equivalentes de un alimento
 * (tal como viene en la base: 1 porción = su `cantidad_sugerida` +
 * `unidad`, ej. "1/2 taza").
 * @param {object} alimento un elemento de la base (con kcal, proteina_g, etc.)
 * @param {number} numPorciones cuántas veces la porción sugerida (ej. 1.5)
 */
function aporteDeAlimento(alimento, numPorciones = 1) {
  const round = (v) => (v == null ? null : Math.round(v * 10) / 10);
  return {
    alimento: alimento.alimento,
    porciones: numPorciones,
    gramos: round(alimento.peso_neto_g * numPorciones),
    kcal: round(alimento.kcal * numPorciones),
    proteina_g: round(alimento.proteina_g * numPorciones),
    lipidos_g: round(alimento.lipidos_g * numPorciones),
    hc_g: round(alimento.hc_g * numPorciones),
  };
}

/**
 * Convierte una cantidad en gramos consumidos a número de porciones
 * equivalentes de ese alimento (útil para el R24 o el diario de alimentos,
 * cuando el paciente registra gramos en vez de porciones).
 */
function porcionesDesdeGramos(alimento, gramosConsumidos) {
  if (!alimento.peso_neto_g) return null;
  return Math.round((gramosConsumidos / alimento.peso_neto_g) * 100) / 100;
}

/**
 * Suma el aporte de una lista de "renglones de menú"
 * [{ alimento, porciones }, ...] — pensado para una comida completa
 * (desayuno, comida, etc.), igual que la tabla "Dieta 1 - Desayuno" del
 * software de referencia.
 */
function totalizarComida(renglones) {
  const total = { kcal: 0, proteina_g: 0, lipidos_g: 0, hc_g: 0 };
  const detalle = renglones.map(({ alimento, porciones }) => {
    const aporte = aporteDeAlimento(alimento, porciones);
    total.kcal += aporte.kcal;
    total.proteina_g += aporte.proteina_g;
    total.lipidos_g += aporte.lipidos_g;
    total.hc_g += aporte.hc_g;
    return aporte;
  });
  const round = (v) => Math.round(v * 10) / 10;
  return {
    detalle,
    total: {
      kcal: round(total.kcal),
      proteina_g: round(total.proteina_g),
      lipidos_g: round(total.lipidos_g),
      hc_g: round(total.hc_g),
    },
  };
}

/** Nombre legible de cada grupo, en el orden del SMAE 4a. edición. */
const NOMBRES_GRUPOS = {
  verduras: 'Verduras',
  frutas: 'Frutas',
  cereales_sin_grasa: 'Cereales sin grasa',
  cereales_con_grasa: 'Cereales con grasa',
  leguminosas: 'Leguminosas',
  aoa_muy_bajo_aporte_grasa: 'AOA muy bajo aporte de grasa',
  aoa_bajo_aporte_grasa: 'AOA bajo aporte de grasa',
  aoa_moderado_aporte_grasa: 'AOA moderado aporte de grasa',
  aoa_alto_aporte_grasa: 'AOA alto aporte de grasa',
  leche_descremada: 'Leche descremada',
  leche_semidescremada: 'Leche semidescremada',
  leche_entera: 'Leche entera',
  leche_con_azucar: 'Leche con azúcar',
  aceites_sin_proteina: 'Aceites y grasas sin proteína',
  aceites_con_proteina: 'Aceites y grasas con proteína',
  azucares_sin_grasa: 'Azúcares sin grasa',
  azucares_con_grasa: 'Azúcares con grasa',
  alimentos_libres: 'Alimentos libres en energía',
  bebidas_alcoholicas: 'Bebidas alcohólicas',
  lacteos_fermentados_yakult: 'Lácteos fermentados (Yakult)',
};

/**
 * Busca un platillo compuesto (desayuno, guarnición, sopa, plato fuerte,
 * postre, bebida) por nombre. Cada platillo trae su composición en
 * equivalentes ya en texto legible (ej. "1 Cereal s/grasa", "1 Leche entera"),
 * lista para mostrar tal cual en la interfaz.
 * @param {object} db
 * @param {string} query
 */
function buscarPlatillo(db, query) {
  const q = normalizar(query);
  const platillos = db._platillos || [];
  return platillos.filter((p) => normalizar(p.nombre).includes(q));
}

/** Devuelve los platillos de una categoría (ej. "PLATOS FUERTES", "SOPAS"). */
function platillosPorCategoria(db, categoria) {
  const platillos = db._platillos || [];
  return platillos.filter((p) => p.categoria === categoria);
}

/**
 * Busca un producto de comida rápida por nombre, opcionalmente restringido
 * a una marca. Cada producto trae su aporte en equivalentes por grupo
 * (ej. { aoamag: 2, grasa_sin_proteina: 1, cereal_sin_grasa: 2 }).
 * @param {object} db
 * @param {string} query
 * @param {string} [marca]
 */
function buscarComidaRapida(db, query, marca = null) {
  const q = normalizar(query);
  const cr = db._comida_rapida || {};
  const marcas = marca ? [marca] : Object.keys(cr);
  const resultados = [];
  for (const m of marcas) {
    const items = cr[m] || [];
    for (const item of items) {
      if (normalizar(item.nombre).includes(q)) {
        resultados.push({ ...item, marca: m });
      }
    }
  }
  return resultados;
}

/** Lista las marcas de comida rápida disponibles en la base. */
function marcasComidaRapida(db) {
  return Object.keys(db._comida_rapida || {});
}

export {
  cargarBaseDeAlimentos,
  buscarAlimento,
  alimentosPorGrupo,
  aporteDeAlimento,
  porcionesDesdeGramos,
  totalizarComida,
  buscarPlatillo,
  platillosPorCategoria,
  buscarComidaRapida,
  marcasComidaRapida,
  NOMBRES_GRUPOS,
};
