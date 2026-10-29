import { readFileSync } from 'node:fs';
/** District ids listed in a registry file (maps/towns.json); an unreadable or malformed registry lists none. */
export function districtIds(file) {
  try {
    const towns = JSON.parse(readFileSync(file, 'utf8')).towns;
    return Array.isArray(towns) ? towns.map(town => town?.id).filter(id => typeof id === 'string' && /^[a-z0-9-]+$/.test(id)) : [];
  } catch { return []; }
}
/** The district a launcher opens: a listed id, otherwise an error that names the listed ones. */
export function chooseDistrict(requested, ids) {
  if (!ids.length) throw new Error('No districts are listed in maps/towns.json.');
  if (!ids.includes(requested)) throw new Error(`Unknown district "${requested}". Choose one of: ${ids.join(', ')}.`);
  return requested;
}
