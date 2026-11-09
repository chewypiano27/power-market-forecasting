import type { AppServicesFactoryOptions } from "../../../core/app-service-ports";
import { createAppRuntime } from "../../../core/app-runtime";
import { RemotePersistence } from "./remote/persistence";

export function createElectrobunAppServices({ config, plugins, externalPlugins }: AppServicesFactoryOptions) {
  return createAppRuntime({ config, plugins, externalPlugins, persistence: new RemotePersistence() });
}
