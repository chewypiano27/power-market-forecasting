import { csvFields, finiteInput } from "./csv";

export const VIC_REGION_ID = "VIC1";
export const AEMO_PRICE_DEMAND_COLUMNS = ["REGION", "SETTLEMENTDATE", "TOTALDEMAND", "RRP", "PERIODTYPE"] as const;

export interface AemoPriceDemandRow {
  region: string;
  settlementDate: string;
  totalDemand: number;
  rrp: number;
  periodType: string;
}

export function parseAemoPriceDemandCsv(csv: string, regionId = VIC_REGION_ID): AemoPriceDemandRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("AEMO returned an empty price and demand file.");
  const header = csvFields(lines[0]!).map((column) => column.toUpperCase());
  const missing = AEMO_PRICE_DEMAND_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length) throw new Error(`AEMO price and demand columns changed; missing ${missing.join(", ")}.`);
  const index = Object.fromEntries(header.map((column, position) => [column, position]));
  return lines.slice(1).flatMap((line) => {
    const fields = csvFields(line);
    const region = fields[index.REGION!] ?? "";
    const totalDemand = finiteInput(fields[index.TOTALDEMAND!]);
    const rrp = finiteInput(fields[index.RRP!]);
    if (region !== regionId || totalDemand === null || rrp === null) return [];
    return [{
      region,
      settlementDate: (fields[index.SETTLEMENTDATE!] ?? "").replaceAll("/", "-"),
      totalDemand,
      rrp,
      periodType: fields[index.PERIODTYPE!] ?? "",
    }];
  });
}
