import test from 'node:test';
import assert from 'node:assert/strict';
import { planBarbellLoad } from '../src/domain/load-feasibility.ts';
const inventory = [{ weightKg: 20, quantity: 2 }, { weightKg: 10, quantity: 2 }, { weightKg: 5, quantity: 2 }, { weightKg: 2.5, quantity: 2 }, { weightKg: 1.25, quantity: 2 }];
test('20 kg target is empty 20 kg bar, not 0 kg', () => {
  const p = planBarbellLoad(20, 20, inventory);
  assert.equal(p.feasible, true); assert.deepEqual(p.platesPerSide, []); assert.equal(p.barKg, 20);
});
test('55 kg target includes bar + symmetric plates', () => {
  const p = planBarbellLoad(55, 20, inventory);
  assert.equal(p.feasible, true); assert.equal(p.perSideKg, 17.5); assert.deepEqual(p.platesPerSide, [10,5,2.5]);
});
