import { api } from "../api/client";
import { parseCSV } from "./csv";

// Sample import file: every header the importer understands. `email` is
// required; `name`, `country` (2-letter ISO code) and `gateway_customer_ref`
// are optional.
export const IMPORT_TEMPLATE_CSV =
  "email,name,country,gateway_customer_ref\n" +
  "jane@acme.com,Jane Doe,US,cus_12345\n" +
  "john@example.com,John Smith,GB,\n" +
  "maria@empresa.es,Maria Garcia,ES,cus_67890\n" +
  "sample@no-optionals.com,,,\n";

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
  total: number;
}

// Parse a customers CSV and create each row through the existing endpoint,
// reporting progress and a created/skipped summary. `email` is required; other
// columns are matched case-insensitively by header name.
export async function importCustomersCSV(
  text: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportResult> {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    return { created: 0, skipped: 0, errors: ["No data rows found in the file."], total: 0 };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iEmail = header.indexOf("email");
  if (iEmail === -1) {
    return { created: 0, skipped: 0, errors: ['The file needs an "email" column.'], total: 0 };
  }
  const iName = header.indexOf("name");
  const iCountry = header.indexOf("country");
  const iRef = header.findIndex((h) => h === "gateway_customer_ref" || h === "reference");

  const dataRows = rows.slice(1);
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];
  for (let r = 0; r < dataRows.length; r++) {
    const cols = dataRows[r];
    onProgress?.(r + 1, dataRows.length);
    const email = (cols[iEmail] ?? "").trim();
    if (!email) {
      skipped++;
      continue;
    }
    try {
      await api.post("/v1/customers", {
        email,
        name: iName >= 0 ? (cols[iName] ?? "").trim() : "",
        country: iCountry >= 0 ? (cols[iCountry] ?? "").trim() || "US" : "US",
        gateway_customer_ref: iRef >= 0 ? (cols[iRef] ?? "").trim() : "",
      });
      created++;
    } catch (err) {
      skipped++;
      if (errors.length < 8) errors.push(`${email}: ${(err as Error).message}`);
    }
  }
  return { created, skipped, errors, total: dataRows.length };
}
