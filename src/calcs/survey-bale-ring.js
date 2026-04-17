/** @file Survey bale-ring residue calc — SP-9. Estimates forage cover from bale-ring footprints. */

import { registerCalc } from '../utils/calc-registry.js';

registerCalc({
  name: 'BRC-1',
  category: 'survey',
  description: 'Estimate forage cover % from bale-ring residue count. Reduces cover by the fraction of paddock area occupied by ring footprints.',
  formula: 'coverReducedPct = min(100, (ringCount × π × (d/2)² ) / (paddockAcres × 43560) × 100); computedForageCoverPct = max(0, round(100 - coverReducedPct))',
  source: 'SP-9 bale-ring residue helper',
  inputs: [
    { name: 'ringCount', type: 'integer', unit: 'rings' },
    { name: 'ringDiameterFt', type: 'number', unit: 'ft', notes: 'Default 12 from farm_settings.bale_ring_residue_diameter_ft' },
    { name: 'paddockAcres', type: 'number', unit: 'acres' },
  ],
  output: { type: 'object', shape: '{ ringAreaSqFt, totalAreaSqFt, coverReducedPct, computedForageCoverPct }', unit: 'sq ft / %' },
  example: {
    inputs: { ringCount: 14, ringDiameterFt: 12, paddockAcres: 0.25 },
    output: { ringAreaSqFt: 113.1, totalAreaSqFt: 1583.4, coverReducedPct: 14.54, computedForageCoverPct: 85 },
  },
  fn({ ringCount, ringDiameterFt = 12, paddockAcres }) {
    const r = ringDiameterFt / 2;
    const ringAreaSqFt = Math.PI * r * r;
    const totalAreaSqFt = (ringCount || 0) * ringAreaSqFt;
    const paddockSqFt = (paddockAcres || 0) * 43560;
    if (!paddockSqFt) return { ringAreaSqFt, totalAreaSqFt, coverReducedPct: null, computedForageCoverPct: null };
    const coverReducedPct = Math.min(100, (totalAreaSqFt / paddockSqFt) * 100);
    const computedForageCoverPct = Math.max(0, Math.round(100 - coverReducedPct));
    return { ringAreaSqFt, totalAreaSqFt, coverReducedPct, computedForageCoverPct };
  },
});
