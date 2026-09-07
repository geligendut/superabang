export interface PlateInventoryItem { weightKg: number; quantity: number }
export interface LoadPlan { feasible: boolean; targetKg: number; barKg: number; perSideKg: number; platesPerSide: number[]; reason?: string }

export function planBarbellLoad(targetKg: number, barKg: number, inventory: PlateInventoryItem[]): LoadPlan {
  if (targetKg < barKg) return { feasible: false, targetKg, barKg, perSideKg: 0, platesPerSide: [], reason: 'TARGET_BELOW_BAR_WEIGHT' };
  const remainder = targetKg - barKg;
  if (Math.abs(remainder) < 1e-9) return { feasible: true, targetKg, barKg, perSideKg: 0, platesPerSide: [] };
  if (remainder < 0 || Math.abs(remainder / 2 * 1000 - Math.round(remainder / 2 * 1000)) > 1e-6) return { feasible: false, targetKg, barKg, perSideKg: remainder / 2, platesPerSide: [], reason: 'ASYMMETRIC_LOAD' };
  const targetPerSide = remainder / 2;
  const availablePerSide = inventory.map(p => ({ weightKg: p.weightKg, pairs: Math.floor(p.quantity / 2) })).filter(p => p.pairs > 0).sort((a,b)=>b.weightKg-a.weightKg);
  let remain = Math.round(targetPerSide * 1000);
  const plates: number[] = [];
  for (const p of availablePerSide) {
    const w = Math.round(p.weightKg * 1000);
    const count = Math.min(p.pairs, Math.floor(remain / w));
    for (let i=0;i<count;i++) plates.push(p.weightKg);
    remain -= count * w;
  }
  if (remain !== 0) return { feasible: false, targetKg, barKg, perSideKg: targetPerSide, platesPerSide: plates, reason: 'INSUFFICIENT_PLATE_COMBINATION' };
  return { feasible: true, targetKg, barKg, perSideKg: targetPerSide, platesPerSide: plates };
}
