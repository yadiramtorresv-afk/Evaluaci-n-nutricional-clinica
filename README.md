# calc-engine.js — Motor de cálculo de Nutrición Clínica

Traducción a JavaScript de las fórmulas del **Manual Maestro de Nutrición
Clínica México 2026** y del **CÁLCULO EXCEL KIT-2.xlsx** (hojas CÁLCULO,
ANTROPOMÉTRICO, EMBARAZO, LACTANCIA, NIÑOS).

## Validación

Se probó contra los 5 casos clínicos del Módulo 11 del manual:

| Caso | Resultado esperado | Resultado del motor |
|---|---|---|
| Adulto 80 kg, 1.70 m | IMC 27.7, sobrepeso | IMC 27.68, Sobrepeso ✅ |
| Niña 7a2m, 24 kg, 1.20 m | IMC 16.67 | IMC 16.67 ✅ |
| Embarazo 60 kg, 1.60 m pregestacional | IMC 23.4 | IMC 23.44 ✅ |
| Adulto mayor 68→62 kg | Pérdida ≈8.8% | 8.8% ✅ |
| Enteral 1750 kcal, 1.5 kcal/mL, 20 h | ≈1167 mL/d, ≈58 mL/h | 1166.7 mL/d, 58.3 mL/h ✅ |

Ver `test-cases.mjs` para correr las pruebas de nuevo (`node test-cases.mjs`).

## Uso básico

```js
import { IMC, Energia, Antropometria, Embarazo, Lactancia,
         Pediatria, SoporteNutricional, PlanAlimentacion } from './calc-engine.js';

// --- IMC y clasificación ---
const imc = IMC.calcular(80, 1.70);               // 27.68
IMC.clasificarAdulto(imc);                         // "Sobrepeso"

// --- Energía (adulto) ---
const geb = Energia.mifflin({ peso_kg: 61, talla_cm: 161, edad: 43, sexo: 'H' });
const get = Energia.gastoEnergeticoTotal(geb, Energia.FACTORES_ACTIVIDAD['Muy ligera']);
// { geb_x_af, eta_10pct, get }

// --- Embarazo ---
const imcPre = Embarazo.imcPregestacional(60, 1.60);        // 23.44
Embarazo.categoriaGanancia(imcPre);                          // { categoria, ganancia_kg }
Embarazo.pesoEsperadoPorSDG(60, 28, imcPre);                 // { incremento_esperado_kg, peso_esperado_kg }

// --- Pediatría ---
Pediatria.schofield(24, 120, 7, 'M');              // { geb_schofield, get, kcal_por_kg }

// --- Soporte nutricional ---
SoporteNutricional.volumenEnteral(1750, 1.5);      // 1166.7 mL/día
SoporteNutricional.velocidadInfusion(1166.7, 20);  // 58.3 mL/h

// --- Plan de alimentación (SMAE) ---
PlanAlimentacion.calcularAdecuacionMenu(
  { cereales_sin_grasa: 1, aoa_bajo_aporte_grasa: 1.5, frutas: 1.7 },
  { kcal: 400, proteina_g: 20, lipidos_g: 15, hc_g: 45 }
);
```

## Qué falta / próximos pasos

1. **Percentiles OMS (peso/talla/IMC para edad)** — el módulo `Pediatria`
   incluye las funciones de interpretación (`interpretarIMCedadOMS`, etc.)
   pero requieren un z-score ya calculado. Falta digitalizar las tablas LMS
   oficiales de who.int para poder calcular ese z-score a partir de peso/talla
   crudos — es la pieza pendiente que ya tenías identificada.
2. **Base SMAE completa** — `PlanAlimentacion.GRUPOS_SMAE` solo trae el aporte
   promedio por grupo (para calcular porciones), no el listado completo de
   alimentos del SMAE 2014.xlsx (eso va en una base de datos aparte, no en el
   motor de cálculo).
3. **Verificar con tu compañero de cómputo** el bug corregido en la celda
   `J17` del Excel original (ver comentario al inicio del archivo) — quedó
   corregido en el JS, pero vale la pena que ambos lo confirmen contra el
   Excel fuente.
4. Los umbrales de **`Energia.mifflin`** (9.99/6.25/4.92) vienen del Excel
   kit; el Manual Maestro usa la variante "clásica" (10/6.25/5) —
   dejé ambas como `mifflin()` y `mifflinClasico()` para que decidan cuál
   estandarizar en el software.

## percentiles.js — percentiles y Z-score OMS (0-19 años)

Datos oficiales de la OMS, de dominio público:
- **0-5 años** (estándar OMS 2006): peso/edad, talla/edad (resolución diaria, día 0-1856), peso/talla (751 puntos, 45-120 cm)
- **5-19 años** (referencia OMS 2007): IMC/edad, talla/edad (resolución mensual, mes 61-228)

Método LMS oficial (Cole & Green, 1992) — el mismo que usa la calculadora de la OMS.

### Validación

| Caso | Resultado |
|---|---|
| Niña 7a2m, IMC 16.67 (caso del manual) | Z=0.67, percentil 75, Normal |
| Lactante 6 meses, 7.9 kg (cerca de la mediana OMS) | Z=-0.03 ✅ |
| Niño 75 cm, 9.5 kg (peso/talla) | Z≈0 ✅ |
| Adolescente 15 años, IMC 30 | Z=2.5, Obesidad ✅ |
| Verificación matemática pura: Z=0→50%, Z=2→97.7%, Z=-2→2.3% | Exacto ✅ |

### Uso

```js
import { cargarTablasOMS, Percentiles } from './percentiles.js';

const tablas = await cargarTablasOMS('./who-growth-lms.json');

Percentiles.zScoreIMCedad(tablas, { imc: 16.67, edad_meses: 86, sexo: 'M' });
// { z: 0.67, percentil: 75, interpretacion: 'Normal' }

Percentiles.zScorePesoEdad(tablas, { peso_kg: 7.9, edad_dias: 182, sexo: 'H' });
Percentiles.zScoreTallaEdad(tablas, { talla_cm: 175, edad_meses: 180, sexo: 'H' });
Percentiles.zScorePesoTalla(tablas, { peso_kg: 9.5, talla_cm: 75, sexo: 'H' });
```

### Qué falta

- **Peso/edad 5-19 años**: la OMS deja de publicar este indicador después de los 10 años a propósito (no distingue talla de masa corporal en el estirón puberal) — usa IMC/edad en su lugar, que sí cubre todo el rango.
- **Circunferencia cefálica** y **perímetro braquial** (0-5 años): no incluidos, agregable después si se necesita.
