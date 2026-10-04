/** @file FieldMargin / GeoJSON / KML import parser. */
import { describe, it, expect } from 'vitest';
import { collectGeojsonFeatures, parseKmlDocument, matchImportedFeatures } from '../../src/utils/geo-import.js';

const poly = {
  type: 'Polygon',
  coordinates: [[
    [-80.85, 35.22], [-80.84, 35.22], [-80.84, 35.23], [-80.85, 35.23], [-80.85, 35.22],
  ]],
};

describe('geo-import', () => {
  it('reads a GeoJSON FeatureCollection and keeps names', () => {
    const features = collectGeojsonFeatures({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { name: 'G5' }, geometry: poly },
        { type: 'Feature', properties: { field_code: 'H2' }, geometry: poly },
      ],
    });
    expect(features).toHaveLength(2);
    expect(features[0].name).toBe('G5');
    expect(features[1].name).toBe('H2');
    expect(features[0].geojson.type).toBe('Polygon');
  });

  it('reads KML placemarks', () => {
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
      <kml xmlns="http://www.opengis.net/kml/2.2"><Document>
        <Placemark><name>North</name><Polygon><outerBoundaryIs><LinearRing>
          <coordinates>
            -80.85,35.22,0 -80.84,35.22,0 -80.84,35.23,0 -80.85,35.23,0 -80.85,35.22,0
          </coordinates>
        </LinearRing></outerBoundaryIs></Polygon></Placemark>
      </Document></kml>`;
    const features = parseKmlDocument(kml);
    expect(features).toHaveLength(1);
    expect(features[0].name).toBe('North');
  });

  it('matches imported names onto existing locations', () => {
    const features = [{ name: 'G5', geojson: poly }, { name: 'New cell', geojson: poly }];
    const locations = [
      { id: '1', name: 'G5', fieldCode: '07', geojson: null, archived: false },
      { id: '2', name: 'Other', fieldCode: 'G5', geojson: poly, archived: false },
    ];
    const rows = matchImportedFeatures(features, locations);
    expect(rows[0].action).toBe('attach');
    expect(rows[0].matchId).toBe('1');
    expect(rows[1].action).toBe('create');
  });
});
