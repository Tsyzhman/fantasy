export const compactPriceHeaderThreshold = 60;

export function responsivePriceHeaderLabel(width: number, language: "en" | "ru") {
  if (width < compactPriceHeaderThreshold) return "$";
  return language === "ru" ? "Цена" : "Price";
}
