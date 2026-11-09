/** DOM-free field-definition helpers for the normal entry sheets. Each sheet owns a
 * definition module next to it and binds its review fields THROUGH that
 * definition (bindEntryFields), so the definition cannot drift from the sheet.
 * Dynamic names ending in ':*' match any suffix (e.g. 'feed:*'). */
/** Proposal key carrying the names the user said; it never binds to a sheet field. */
export const ENTRY_TARGET_KEY = 'entryTarget';

export function defineEntryFields(ui, statics, dynamics = {}) {
  const freeze = specs => Object.freeze(Object.fromEntries(Object.entries(specs).map(([name, spec]) => [name, Object.freeze({ required: spec.required === true, ...(spec.when ? { when: spec.when } : {}) })])));
  return Object.freeze({ ui, static: freeze(statics), dynamic: freeze(dynamics) });
}

export function entryFieldSpec(definition, name) {
  if (Object.hasOwn(definition.static, name)) return definition.static[name];
  if (Object.hasOwn(definition.dynamic, name)) return definition.dynamic[name];
  const pattern = Object.keys(definition.dynamic).find(key => key.endsWith(':*') && name.startsWith(key.slice(0, -1)) && name.length > key.length - 1);
  return pattern ? definition.dynamic[pattern] : null;
}

/** Sheet side: every implemented field must be declared; every static field must
 * be implemented; required comes from the definition. */
export function bindEntryFields(definition, implementations) {
  const bound = {};
  for (const [name, field] of Object.entries(implementations)) {
    const spec = entryFieldSpec(definition, name);
    if (!spec) throw new Error(`undeclared-entry-field:${definition.ui}.${name}`);
    bound[name] = { ...field, required: spec.required };
  }
  for (const name of Object.keys(definition.static)) if (!bound[name]) throw new Error(`missing-entry-field:${definition.ui}.${name}`);
  return bound;
}

/** Model-facing hints derived from a definition (no hand-written catalog). */
export function entryFieldHints(definition) {
  return {
    fields: Object.entries(definition.static).map(([name, spec]) => ({ name, required: spec.required })),
    dynamicFields: Object.entries(definition.dynamic).map(([name, spec]) => ({ name, required: spec.required, when: spec.when })),
  };
}
