/**
 * Keep the first occurrence of each dress URL so URL-keyed UI and analysis state have
 * one unambiguous owner. Order is preserved.
 */
export function uniqueDressesByUrl<T extends { url: string }>(dresses: T[]): T[] {
  const seen = new Set<string>();

  return dresses.filter((dress) => {
    if (!dress.url || seen.has(dress.url)) return false;
    seen.add(dress.url);
    return true;
  });
}
