/**
 * Public React runtime surface for external plugins (`vic1/react`).
 *
 * These hooks are the renderer-neutral way for plugin panes to reach app
 * services. Plugin render code must use them instead of importing OpenTUI,
 * Electrobun, or DOM APIs directly — the renderer decides how each one is
 * fulfilled, which is what lets the same plugin run in the terminal, on the
 * desktop, and (for web-capable plugins) in the browser.
 *
 * Compatibility commitment: see the note in `./utils.ts`.
 */
export { usePluginConfigState, usePluginPaneState } from "../plugins/runtime";

// Loading one thing asynchronously into a pane: data, loading, error, reload.
// Every data pane needs this, and a plugin that hand-rolls it drifts from the
// host's cancellation and stale-response handling.
export { useAsyncResource } from "../react/async-resource";
// Periodic refresh tied to pane visibility, and the "updated 2m ago" label
// that goes with it, so plugin panes refresh on the same cadence as built-ins
// and stop while they cannot be seen. `AGE_TICK_MS` is that cadence, for
// a pane that re-renders its own age column on the same clock.
export { useAutoRefresh, useUpdatedAgo } from "../react/auto-refresh";
// Whether market data should flow: `usePaneVisible()` is true while the app
// can be seen and the pane is not covered by other windows; `useAppVisible()`
// is the app half alone. Gate streams, polls and clocks on these, not on pane
// focus: a user watches quotes in one pane while typing in another.
export { usePaneVisible } from "../state/app/activity";
