import { createContext, createElement, useContext, type ReactNode } from "react";

export interface PluginRuntimeAccess {
  setConfigState(pluginId: string, key: string, value: unknown): Promise<void>;
}

interface PluginRenderContextValue {
  pluginId: string;
  runtime: PluginRuntimeAccess;
}

const PluginRenderContext = createContext<PluginRenderContextValue | null>(null);

export function PluginRenderProvider({
  pluginId,
  runtime,
  children,
}: {
  pluginId: string;
  runtime: PluginRuntimeAccess;
  children: ReactNode;
}) {
  return (
    <PluginRenderContext value={{ pluginId, runtime }}>
      {children}
    </PluginRenderContext>
  );
}

/**
 * Renders a plugin's pane, tab or slot inside its render context. Pass the
 * plugin's state namespace so every surface of one plugin reads the same state.
 */
export function withPluginRender<P>(
  pluginId: string,
  runtime: PluginRuntimeAccess,
  component: (props: P) => ReactNode,
): (props: P) => ReactNode {
  return (props) => (
    <PluginRenderProvider pluginId={pluginId} runtime={runtime}>
      {createElement(component as (props: any) => ReactNode, props)}
    </PluginRenderProvider>
  );
}

export function usePluginRenderContext(): PluginRenderContextValue {
  const context = useContext(PluginRenderContext);
  if (!context) {
    throw new Error("Plugin runtime hooks must be used inside a plugin render context");
  }
  return context;
}
