export function isReachedCity(city: { city: string; country: string; views: number }) {
  return city.views > 0 && city.country !== "ZZ" && !!city.city.trim() &&
    !/^(unknown|unknown city|city not recorded|location not recorded|unavailable)$/i.test(city.city.trim());
}
