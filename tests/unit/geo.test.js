/** @file Geometry helpers for paddocks and todo pins. */
import { describe, it, expect } from 'vitest';
import {
  ringToGeojson, polygonAreaHectares, polygonCentroid, pointInPolygon,
  haversineMeters, findLocationAtPoint, validateImportedRing,
} from '../../src/utils/geo.js';

const square = ringToGeojson([
  [-80.85, 35.22],
  [-80.84, 35.22],
  [-80.84, 35.23],
  [-80.85, 35.23],
]);

describe('geo helpers', () => {
  it('closes an open ring', () => {
    expect(square.coordinates[0][0]).toEqual(square.coordinates[0][4]);
  });

  it('computes a positive area', () => {
    const ha = polygonAreaHectares(square);
    expect(ha).toBeGreaterThan(50);
    expect(ha).toBeLessThan(150);
  });

  it('finds the centroid inside the ring', () => {
    const c = polygonCentroid(square);
    expect(pointInPolygon(c.lat, c.lng, square)).toBe(true);
    expect(pointInPolygon(35.225, -80.845, square)).toBe(true);
    expect(pointInPolygon(35.3, -80.9, square)).toBe(false);
  });

  it('measures distance in meters', () => {
    expect(haversineMeters(35.22, -80.85, 35.22, -80.85)).toBeCloseTo(0, 5);
    expect(haversineMeters(35.22, -80.85, 35.23, -80.85)).toBeGreaterThan(1000);
  });

  it('identifies the paddock containing a point', () => {
    const locs = [
      { id: 'a', geojson: square },
      { id: 'b', geojson: ringToGeojson([[-81, 36], [-80.99, 36], [-80.99, 36.01], [-81, 36.01]]) },
    ];
    expect(findLocationAtPoint(locs, 35.225, -80.845)?.id).toBe('a');
    expect(findLocationAtPoint(locs, 0, 0)).toBeNull();
  });

  it('rejects garbage coordinates', () => {
    expect(validateImportedRing({ type: 'Polygon', coordinates: [[[999, 999], [1, 2]]] }).valid).toBe(false);
    expect(validateImportedRing(square).valid).toBe(true);
  });
});
