import type { WorkstationPlugin } from "../../../types/plugin";
import { attachVicPowerPersistence, resetVicPowerPersistence } from "./cache";
import { VicDemandPricePane, VicMarketGlancePane, VicSpotArbitragePane } from "./panes";

import { attachPeakPersistence, resetPeakPersistence } from "./demand-peak-service";
import { attachDemandPersistence, resetDemandPersistence } from "./demand-service";

export const vicPowerPlugin: WorkstationPlugin = {
  id: "vic-power",
  name: "VIC1 Power",
  version: "1.0.0",
  description: "Victorian demand, price and temperature-risk workstation.",
  toggleable: false,
  targets: ["desktop"],
  hosts: [
    "www.aemo.com.au",
    "visualisations.aemo.com.au",
    "api.open-meteo.com",
    "archive-api.open-meteo.com",
    "previous-runs-api.open-meteo.com",
    "reg.bom.gov.au",
  ],
  setup(ctx) {
    attachVicPowerPersistence(ctx.persistence);
    attachDemandPersistence(ctx.persistence);
    attachPeakPersistence(ctx.persistence);
  },
  dispose() {
    resetVicPowerPersistence();
    resetDemandPersistence();
    resetPeakPersistence();
  },
  panes: [
    { id: "vic-market-glance", name: "Market Desk", icon: "M", component: VicMarketGlancePane, defaultPosition: "left" },
    { id: "vic-demand-price", name: "Weather & Load Risk", icon: "W", component: VicDemandPricePane, defaultPosition: "right" },
    { id: "vic-spot-arbitrage", name: "Regional Spot", icon: "R", component: VicSpotArbitragePane, defaultPosition: "right" },
    // Compatibility for layouts saved before the calendar was consolidated.
    { id: "vic-trader-calendar", name: "Regional Spot", icon: "R", component: VicSpotArbitragePane, defaultPosition: "right" },
  ],
  paneTemplates: [
    { id: "vic-market-glance-pane", paneId: "vic-market-glance", label: "Market Desk", description: "VIC1 price, demand, flow and AEMO notices.", shortcut: { prefix: "VIC" }, keywords: ["vic", "power", "market", "demand", "notice"] },
    { id: "vic-demand-price-pane", paneId: "vic-demand-price", label: "Weather & Load Risk", description: "Calendar-led temperature stress and peak risk windows.", shortcut: { prefix: "VICW" }, keywords: ["vic", "weather", "calendar", "temperature", "demand", "price"] },
    { id: "vic-spot-arbitrage-pane", paneId: "vic-spot-arbitrage", label: "Regional Spot", description: "VIC, NSW and SA price separation with constraint context.", shortcut: { prefix: "VICS" }, keywords: ["spot", "spread", "regional", "separation", "interconnector"] },
  ],
};
