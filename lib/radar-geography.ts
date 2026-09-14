export type CityCenter = [
  string,
  string,
  string,
  string,
  string,
  string,
  number,
  number,
];
export const locationKey = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
export function cityLookup(rows: CityCenter[]) {
  const byName = new Map<string, CityCenter[]>();
  const countries = new Map<string, string>();
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  for (const row of rows) {
    countries.set(locationKey(names.of(row[0]) ?? row[0]), row[0]);
    for (const name of new Set([locationKey(row[1]), locationKey(row[2])])) {
      if (!name) continue;
      const key = row[0] + "|" + name;
      byName.set(key, [...(byName.get(key) ?? []), row]);
    }
  }
  const countryCode = (country: string) =>
    country.trim().toUpperCase() === "UK"
      ? "GB"
      : /^[a-z]{2}$/i.test(country.trim())
        ? country.trim().toUpperCase()
        : countries.get(locationKey(country));
  return {
    countryCode,
    find: (city: string, country: string): [number, number] | null => {
      const candidates =
        byName.get(countryCode(country) + "|" + locationKey(city)) ?? [];
      const points = new Map(
        candidates.map((row) => [
          `${row[6]},${row[7]}`,
          [row[6], row[7]] as [number, number],
        ]),
      );
      return points.size === 1 ? [...points.values()][0] : null;
    },
  };
}
