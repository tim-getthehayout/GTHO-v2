/** Fixed UUIDv5 URL namespace: https://getthehayout.com/units/<table>/<name>.
 * Legacy production IDs supplied by Design; match by ID ONLY, never name. */
export const UNIT_STANDARDS = Object.freeze([
  {
    "table": "dose_units",
    "name": "capsule",
    "legacyId": "bfc9a0da-5186-4d39-af87-67b58da4de18",
    "id": "ce6066fe-4b4d-5933-8520-aab9102ee8cf"
  },
  {
    "table": "dose_units",
    "name": "cc",
    "legacyId": "a8c3b815-e986-4c4a-8eb5-c06114301f50",
    "id": "804cd2da-47d9-55e5-8af8-cce5f6a251d7"
  },
  {
    "table": "dose_units",
    "name": "mg",
    "legacyId": "79b1056a-3b9d-4dff-8aea-75c58be371a7",
    "id": "22dc0057-e4e5-507d-88e8-cc6c4ef5883b"
  },
  {
    "table": "dose_units",
    "name": "ml",
    "legacyId": "fb6b6211-5477-4297-8724-f020c5d71ba0",
    "id": "aa226668-ae0b-5b58-8258-2f8cc72d1bb6"
  },
  {
    "table": "dose_units",
    "name": "pump",
    "legacyId": "db85f2ab-2dc8-4c36-969c-97e6ad9bb395",
    "id": "70513fd4-a913-5af3-a793-5eeddfc8426f"
  },
  {
    "table": "dose_units",
    "name": "tablet",
    "legacyId": "b66dee72-af92-4edb-b0d9-7b5ec6acabbf",
    "id": "16f780e7-59ea-57fd-a36b-50d0f7afc933"
  },
  {
    "table": "input_product_units",
    "name": "bag",
    "legacyId": "3b1a5ced-39a8-441e-8f1b-21e1e0474bad",
    "id": "3ce85e47-0115-5268-b89e-2b41b9a157e4"
  },
  {
    "table": "input_product_units",
    "name": "gallon",
    "legacyId": "57b4b90d-94c8-42c9-853c-16d34e673a87",
    "id": "a3b40dcd-8d5b-55f9-8cc6-b56296911778"
  },
  {
    "table": "input_product_units",
    "name": "kg",
    "legacyId": "893d8d0b-b88b-4ad2-a027-fa8842b17bfe",
    "id": "d9a7f557-ee57-5b35-bf32-cfb9b0cfa362"
  },
  {
    "table": "input_product_units",
    "name": "lb",
    "legacyId": "37a25a17-1a9c-47c7-9545-571279f7988e",
    "id": "1fbea7aa-d109-5fe1-b44a-b41d5fe844b8"
  },
  {
    "table": "input_product_units",
    "name": "ton",
    "legacyId": "23deec76-a3a0-49dc-ade8-d69e1b37b8dc",
    "id": "7b8594d1-029e-5f99-9314-45c2d9163497"
  }
].map(Object.freeze));
export const UNIT_TABLES = Object.freeze(['dose_units', 'input_product_units']);
export const UNIT_ENTITIES = Object.freeze({ doseUnits: 'dose_units', inputProductUnits: 'input_product_units' });
export const normalizeUnitName = name => typeof name === 'string' ? name.normalize('NFC').trim() : '';
export const foldUnitName = name => normalizeUnitName(name).toLowerCase();
export const fixedUnitId = id => UNIT_STANDARDS.find(row => row.legacyId === id)?.id ?? id;
