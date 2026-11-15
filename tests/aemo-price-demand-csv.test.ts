import { expect, test } from "bun:test";
import { parseAemoPriceDemandCsv } from "../src/plugins/builtin/vic-power/data";

const header = "REGION,SETTLEMENTDATE,TOTALDEMAND,RRP,PERIODTYPE";

test("AEMO price and demand parser keeps valid VIC rows and quoted fields", () => {
  const rows = parseAemoPriceDemandCsv([
    header,
    'VIC1,"2026/11/12 00:05:00",6000,40,ACTUAL',
    "NSW1,2026/11/12 00:05:00,7000,50,ACTUAL",
    "VIC1,2026/11/12 00:10:00,6100,41,ACTUAL",
  ].join("\n"));
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ region: "VIC1", settlementDate: "2026-11-12 00:05:00", totalDemand: 6000, rrp: 40, periodType: "ACTUAL" });
});

test("AEMO parser rejects missing columns and ignores invalid numeric rows", () => {
  expect(() => parseAemoPriceDemandCsv("REGION,SETTLEMENTDATE\nVIC1,2026/11/12")).toThrow("missing TOTALDEMAND");
  expect(parseAemoPriceDemandCsv([header, "VIC1,2026/11/12 00:05:00,bad,40,ACTUAL"].join("\n"))).toEqual([]);
});
