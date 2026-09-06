export function toJsonCompatible(value) {
  return JSON.parse(JSON.stringify(value, (_key, item) => item instanceof Set ? [...item] : item));
}
