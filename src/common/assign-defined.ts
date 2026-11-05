/**
 * Copies only the keys whose value is not `undefined`. DTO instances carry
 * every declared field as an own property (ES2022+ class fields), so a plain
 * Object.assign(entity, dto) would blank fields the client didn't send.
 */
export function assignDefined<T extends object>(target: T, patch: object): T {
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
  return target;
}
