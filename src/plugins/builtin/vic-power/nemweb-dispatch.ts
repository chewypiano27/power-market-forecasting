import type { HttpFetchTransport } from "../../../utils/http-transport";
import type { AemoPriceDemandRow, RegionalMarketSnapshot, RegionalPricePoint } from "./data";
import type { VicMarketPoint } from "./model";
import { dispatchTime } from "./analytics";
import { csvFields } from "./csv";
import { dispatchArchiveCsv } from "./dispatch-archive";

const DIRECTORY = "https://nemweb.com.au/Reports/CURRENT/DispatchIS_Reports/";
const REGIONS = ["VIC1", "NSW1", "SA1"];
type DispatchPoint = RegionalPricePoint & { netInterchange: number | null; priceStatus: string };
const finite = (text: string | undefined): number | null => text?.trim() && Number.isFinite(Number(text)) ? Number(text) : null;

/** Price and demand must come from the same actual dispatch run and intervention case. */
export function parseNemwebDispatch(csv: string, now: number): DispatchPoint[] {
  const headers = new Map<string, string[]>(), prices = new Map<string, Record<string, string>>(), demand = new Map<string, Record<string, string>>();
  for (const line of csv.replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const fields = csvFields(line);
    if (fields[1] !== "DISPATCH" || !["PRICE", "REGIONSUM"].includes(fields[2] ?? "")) continue;
    const table = fields.slice(1, 4).join(":");
    if (fields[0] === "I") { headers.set(table, fields.slice(4)); continue; }
    const header = headers.get(table);
    if (fields[0] !== "D" || !header) continue;
    const row = Object.fromEntries(header.map((name, index) => [name, fields[index + 4] ?? ""]));
    const timestamp = row.SETTLEMENTDATE?.replaceAll("/", "-").replace(" ", "T");
    const instant = dispatchTime(timestamp ?? "");
    if (!timestamp || !REGIONS.includes(row.REGIONID ?? "") || row.INTERVENTION !== "0" || !Number.isFinite(instant)
      || instant > now + 300_000 || instant < now - 2 * 86_400_000) continue;
    row.SETTLEMENTDATE = timestamp;
    const key = `${timestamp}:${row.REGIONID}:${row.RUNNO}`;
    (fields[2] === "PRICE" ? prices : demand).set(key, row);
  }
  return [...prices].flatMap(([key, price]): DispatchPoint[] => {
    const load = demand.get(key), value = finite(price.RRP), total = finite(load?.TOTALDEMAND);
    if (!load || value === null || total === null) return [];
    return [{ regionId: price.REGIONID as DispatchPoint["regionId"], timestamp: price.SETTLEMENTDATE!, price: value, demand: total,
      netInterchange: finite(load.NETINTERCHANGE), priceStatus: price.PRICE_STATUS || "DISPATCH" }];
  });
}

export async function fetchNemwebDispatch(fetcher: HttpFetchTransport, now: Date) {
  const listing = await fetcher(DIRECTORY);
  if (!listing.ok) throw new Error("NEMWeb dispatch directory unavailable");
  const names = [...new Set([...(await listing.text()).matchAll(/PUBLIC_DISPATCHIS_\d{12}_\d+\.zip/gi)].map(match => match[0]))].sort().reverse();
  const selected: string[] = [], timestamps = new Set<string>();
  for (const name of names) {
    const stamp = name.slice("PUBLIC_DISPATCHIS_".length, "PUBLIC_DISPATCHIS_".length + 12);
    const instant = dispatchTime(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:00`);
    if (timestamps.has(stamp) || !Number.isFinite(instant) || instant > now.getTime() + 300_000 || instant < now.getTime() - 2 * 86_400_000) continue;
    timestamps.add(stamp); selected.push(name);
    if (selected.length === 12) break;
  }
  const observations: DispatchPoint[] = [];
  // Four at a time keeps refreshes bounded while recovering enough actual history for a 30-minute move.
  for (let offset = 0; offset < selected.length; offset += 4) {
    const batch = await Promise.all(selected.slice(offset, offset + 4).map(async name => {
      try {
        const response = await fetcher(new URL(name, DIRECTORY).href);
        if (!response.ok) return [];
        return parseNemwebDispatch(await dispatchArchiveCsv(await response.arrayBuffer()), now.getTime());
      } catch { return []; }
    }));
    observations.push(...batch.flat());
  }
  const regionalMarket = [...new Map(observations.map(row => [`${row.regionId}:${row.timestamp}`, row])).values()]
    .sort((a, b) => dispatchTime(a.timestamp) - dispatchTime(b.timestamp) || a.regionId.localeCompare(b.regionId));
  const regions: RegionalMarketSnapshot[] = REGIONS.flatMap(regionId => {
    const row = regionalMarket.findLast(point => point.regionId === regionId);
    return row ? [{ regionId, settlementDate: row.timestamp, price: row.price, totalDemand: row.demand, netInterchange: row.netInterchange,
      scheduledGeneration: null, semiScheduledGeneration: null, priceStatus: row.priceStatus, interconnectorFlows: [], fcas: {} }] : [];
  });
  const vic = regions.find(region => region.regionId === "VIC1");
  if (!vic) throw new Error("No actual VIC1 dispatch observations available");
  const market: VicMarketPoint[] = regionalMarket.filter(row => row.regionId === "VIC1").map(row => ({ hour: Number(row.timestamp.slice(11, 13)), timestamp: row.timestamp, price: row.price, demand: row.demand }));
  const latest: AemoPriceDemandRow = { region: "VIC1", settlementDate: vic.settlementDate, totalDemand: vic.totalDemand, rrp: vic.price, periodType: "ACTUAL" };
  return { regions, market, regionalMarket, latest, sourceUrl: DIRECTORY };
}
