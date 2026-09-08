import { IMC, Energia, Embarazo, PlanAlimentacion, SoporteNutricional, Pediatria } from './calc-engine.js';

console.log('=== CASO 1: Adulto 80 kg, 1.70 m -> IMC 27.7, sobrepeso ===');
const imc1 = IMC.calcular(80, 1.70);
console.log('IMC calculado:', imc1, '| Esperado: 27.7 | Clasificación:', IMC.clasificarAdulto(imc1));
console.assert(imc1 === 27.68, 'IMC caso 1 no coincide exacto (redondeo esperado ~27.68-27.7)');

console.log('\n=== CASO 2: Niña 7a 2m, 24 kg, 1.20 m -> IMC 16.67 ===');
const imc2 = IMC.calcular(24, 1.20);
console.log('IMC calculado:', imc2, '| Esperado: 16.67');

console.log('\n=== CASO 3: Embarazo 60 kg, 1.60 m pregestacional -> IMC 23.4 ===');
const imc3 = Embarazo.imcPregestacional(60, 1.60);
console.log('IMC pregestacional:', imc3, '| Esperado: 23.4');
console.log('Categoría y ganancia recomendada:', Embarazo.categoriaGanancia(imc3));

console.log('\n=== CASO 4: Adulto mayor 68 -> 62 kg -> Pérdida ~8.8% ===');
const perdida = PlanAlimentacion.porcentajePerdidaPeso(68, 62);
console.log('% pérdida de peso:', perdida, '| Esperado: ~8.8%');

console.log('\n=== CASO 5: Enteral 1750 kcal, 1.5 kcal/mL -> ~1167 mL/d; en 20h -> ~58 mL/h ===');
const volumen = SoporteNutricional.volumenEnteral(1750, 1.5);
const velocidad = SoporteNutricional.velocidadInfusion(volumen, 20);
console.log('Volumen (mL/d):', volumen, '| Esperado: ~1167');
console.log('Velocidad (mL/h):', velocidad, '| Esperado: ~58');

console.log('\n=== EXTRA: Energía adulto (Mifflin kit) hombre 43a, 61kg, 1.61m, AF Muy Ligera ===');
const geb = Energia.mifflin({ peso_kg: 61, talla_cm: 161, edad: 43, sexo: 'H' });
const get = Energia.gastoEnergeticoTotal(geb, Energia.FACTORES_ACTIVIDAD['Muy ligera']);
console.log('GEB Mifflin:', geb, 'kcal');
console.log('GET (con ETA 10%):', get);

console.log('\n=== EXTRA: Plan alimenticio 1600 kcal, ejemplo desayuno (SMAE) ===');
const menuDesayuno = {
  cereales_sin_grasa: 1,
  aoa_bajo_aporte_grasa: 1.5,
  aoa_muy_bajo_aporte_grasa: 1,
  frutas: 1.7,
};
const adecuacion = PlanAlimentacion.calcularAdecuacionMenu(menuDesayuno, {
  kcal: 400, proteina_g: 20, lipidos_g: 15, hc_g: 45,
});
console.log(JSON.stringify(adecuacion, null, 2));

console.log('\n=== EXTRA: Pediatría - Schofield niña 7 años, 24kg, 120cm ===');
const schofield = Pediatria.schofield(24, 120, 7, 'M');
console.log(schofield);

console.log('\nTodas las pruebas ejecutaron sin errores de tipo.');
