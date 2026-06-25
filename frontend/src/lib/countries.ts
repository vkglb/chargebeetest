// Curated list of common billing countries (ISO 3166-1 alpha-2). Not exhaustive
// — enough for the customer form without shipping a 250-entry dataset.
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "NL", name: "Netherlands" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" },
  { code: "MX", name: "Mexico" },
  { code: "ZA", name: "South Africa" },
];

const NAME_BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c.name]));

// Resolve an ISO code to a display name, falling back to the raw code.
export function countryName(code?: string | null): string {
  if (!code) return "—";
  return NAME_BY_CODE.get(code) ?? code;
}
