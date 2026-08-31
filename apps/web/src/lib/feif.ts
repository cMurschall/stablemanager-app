import type { HorseSex } from "@stablemanager/shared";

export type ParsedFeifId = {
  feifId: string;
  country: string;
  birthYear: number;
  /** From FEIF digit: 1 = male (stallion), 2 = female (mare). Gelding is never encoded. */
  sex: Extract<HorseSex, "mare" | "stallion">;
};

/**
 * FEIF-ID layout: CC + YYYY + sexDigit(1|2) + serial
 * e.g. DE2017222618 → DE, 2017, mare
 */
export function parseFeifId(raw: string): ParsedFeifId | null {
  const feifId = raw.trim().toUpperCase();
  const m = feifId.match(/^([A-Z]{2})(\d{4})([12])(\d{5,9})$/);
  if (!m) return null;

  const country = m[1];
  const birthYearStr = m[2];
  const sexDigit = m[3];

  if (!country || !birthYearStr || !sexDigit) return null;

  const birthYear = Number(birthYearStr);
  if (birthYear < 1980 || birthYear > 2100) return null;

  return {
    feifId,
    country,
    birthYear,
    sex: sexDigit === "2" ? "mare" : "stallion",
  };
}
