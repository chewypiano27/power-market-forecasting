import { join } from "path";
import { AppPersistence } from "../data/app-persistence";
import type { AppServicesFactoryOptions } from "./app-service-ports";
import { createAppRuntime } from "./app-runtime";

export type AppServices = ReturnType<typeof createAppServices>;
export function createAppServices({ config, plugins, externalPlugins }: AppServicesFactoryOptions) {
  const persistence = new AppPersistence(join(config.dataDir, ".vic1-cache.db"));
  const runtime = createAppRuntime({ config, plugins, externalPlugins, persistence });
  return { ...runtime, persistence };
}
