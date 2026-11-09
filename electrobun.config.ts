import type { ElectrobunConfig } from "electrobun/bun";
import pkg from "./package.json";
import { DESKTOP_APP_IDENTIFIER, DESKTOP_APP_NAME } from "./src/renderers/electrobun/shared/app-name";
export default {
  app: { name: DESKTOP_APP_NAME, identifier: DESKTOP_APP_IDENTIFIER, version: pkg.version, description: pkg.description, urlSchemes: ["vic1-power"] },
  build: {
    bun: { entrypoint: "src/renderers/electrobun/bun/index.ts", sourcemap: "external" },
    copy: { "dist/electrobun-view": "views/mainview" },
    mac: { codesign: false, notarize: false, createDmg: false, icons: "", defaultRenderer: "native" },
    win: { bundleCEF: true, defaultRenderer: "cef" },
  },
  scripts: { preBuild: "scripts/build-electrobun-view.ts" },
  runtime: { exitOnLastWindowClosed: true },
} satisfies ElectrobunConfig;
