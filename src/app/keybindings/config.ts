import type { AppConfig, KeybindingsConfig } from "../../types/config";

function withoutEmpty(config: KeybindingsConfig): KeybindingsConfig | undefined {
  const actions = config.actions && Object.keys(config.actions).length > 0 ? config.actions : undefined;
  const commands = config.commands && Object.keys(config.commands).length > 0 ? config.commands : undefined;
  if (!actions && !commands) return undefined;
  return { ...(actions ? { actions } : {}), ...(commands ? { commands } : {}) };
}

/** A config with `keybindings` replaced, and the key dropped once nothing is customised. */
export function updateKeybindingsConfig(config: AppConfig, keybindings: KeybindingsConfig | undefined): AppConfig {
  const next = keybindings ? withoutEmpty(keybindings) : undefined;
  const { keybindings: _previous, ...rest } = config;
  return next ? { ...rest, keybindings: next } : rest;
}
