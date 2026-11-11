import type { ReactNode } from "react";

import type { ContextMenuContext, ContextMenuItem } from "./context-menu";
import type { AppConfig, LayoutConfig, PaneBinding, PaneInstanceConfig } from "./config";

import type { CachePolicy, PersistedResourceValue } from "./persistence";
import type { TickerRecord } from "./ticker";
import type { BrokerContractRef, InstrumentSearchResult, TickerInstrumentKind, TickerListingRef } from "./instrument";

/**
 * Named render slots. The host renders only `status:widget`; the other names
 * are never drawn and are kept so existing plugins still type-check.
 */
export interface WorkstationSlots {
  "status:widget": Record<string, never>;
}

export interface PaneProps {
  paneId: string;
  paneType: string;
  focused: boolean;
  width: number;
  height: number;
  close?: () => void;
}

export type PaneSharePrivateFields = true | readonly string[];

export interface PanePortableShareDef {
  /** Fields excluded before pane configuration or state leaves the device. */
  private?: {
    title?: boolean;
    params?: PaneSharePrivateFields;
    settings?: PaneSharePrivateFields;
    state?: PaneSharePrivateFields;
  };
  /**
   * Rewrites the instance before it leaves the device, on every publish. The
   * receiver has none of the sender's local ticker records, so anything
   * resolved through them (a listing's venue, for example) must be pinned into
   * the instance here; a layout published to the gallery passes none.
   */
  prepare?(pane: PaneInstanceConfig, context: {
    tickers: ReadonlyMap<string, TickerRecord>;
    /** The moment the pane's layout tab has its crosshair pinned at, so a link opens there. */
    pinnedTime?: number;
  }): PaneInstanceConfig;
}

/** What covers a pane when a report of it is refused: see `PaneDef.reportLockNote`. */
export interface PaneLock {
  /** Sign-in is the wall of a session that is missing or unverified; pro the one of a plan without access. */
  gate: "sign-in" | "pro";
  /** The first symbol the report was asked for, or null. */
  symbol: string | null;
  /** The function code the report was run for, for a pane that serves several (EM and GUID). */
  token?: string;
  /** The session is signed in and its email is not verified yet. */
  verifyEmail?: boolean;
  /**
   * Reads data as the report does, so a note can check that a free route it
   * would name has data for the symbol before naming it. Absent where nothing
   * can be read.
   */
}

export interface PaneDef {
  id: string;
  name: string;
  icon?: string;
  component: (props: PaneProps) => ReactNode;
  defaultPosition: "left" | "right";
  defaultWidth?: string;
  defaultFloatingSize?: { width: number; height: number };
  defaultMode?: "docked" | "floating";
  /** Pane publishes its selected symbol as pane-state `cursorSymbol`, so ticker panes can follow it. */
  tickerSource?: boolean;
  /**
   * Pane shows one ticker read through its binding (`usePaneTicker`, `usePaneTickerIdentity`), so
   * its pane menu offers "Link to" each visible list, scanner, and other single-ticker pane, and
   * it then follows that pane's selection. A function decides per instance (a chart with one
   * security, not a comparison). A follower must never write its own `cursorSymbol`: that would
   * win over the binding.
   */
  tickerFollower?: boolean | ((pane: PaneInstanceConfig) => boolean);
  /**
   * Instrument kinds this pane has data for, such as `["equity"]` for company
   * data, as a research tab declares them. Bound to a ticker of another known
   * kind (an index, an ETF), the pane says so in place of its data, and `fn`
   * and `shot` answer before loading. Omit when every ticker has it.
   */
  instruments?: readonly TickerInstrumentKind[];
  /**
   * For a pane type that two or more functions open (ERN and EVTS): the settings that say
   * what a window shows, as against how (a range, a toggle, a column choice). Opening a
   * function again focuses a window whose binding, params and settings match what the
   * function opens; a window with a setting of its own that is not listed here is still that
   * window, and one with a listed setting the function does not set belongs to another
   * function and is left alone. Without it, a pane type opened by several functions is
   * matched on its settings exactly, and a window that picked up any setting is not found.
   * An empty list says binding and params alone name the window.
   */
  identitySettings?: readonly string[];
  /**
   * The title a saved window of this pane has, from its params and settings,
   * for lists that name windows without rendering them (the Layouts browser).
   * A pane that titles itself by what it shows ("Curve \u00b7 BZ") gives the same
   * title here, so two of its windows are told apart before either is opened.
   */
  instanceTitle?(pane: PaneInstanceConfig): string | null;
  /** Renderer-neutral data model used by CLI functions, automation, and hosted tools. */
  /**
   * Source and status a rendered-view report (`fn` on a pane without a
   * `headless` model) cites, when "Workstation Cloud" with the state the footer
   * shows would be wrong: local data, a calculator, filed records.
   */
  /**
   * Options a rendered-view report takes (`fn OMON AAPL --strikes 10`):
   * each sets the pane setting of its key, is checked by its `normalize`, and
   * is listed with its example by `power catalog`.
   */
  /**
   * A rendered-view report that takes its `reportOptions` and nothing else:
   * any other option is refused with the ones it takes (`fn FUT --bogus 1`),
   * as a `headless` report refuses one, instead of being set as a pane
   * setting of that name.
   */
  reportOptionsOnly?: boolean;
  /**
   * What a rendered-view report takes after the function, for a pane whose
   * template reads it with no shortcut to say so (X Feed's query): the
   * catalog lists it, and `fn` refuses an argument from a function that
   * declares none here, in its shortcut or in a `headless` model.
   */
  /**
   * Lines a rendered-view report prints above its table, from the settings it
   * ran with: what the default view leaves out and how to see more. `--json`
   * carries them in `data.metadata.notices`.
   */
  reportNotices?(settings: Readonly<Record<string, unknown>>): string[];
  /**
   * What a rendered-view report prints in place of the pane when a sign-in
   * wall or the Pro lock covers all of it: what is locked, what can still be
   * read without it and where, and how to unlock it. A `headless` pane's report
   * prints it when the server refuses the read (401, 402 or 403). Without it
   * the report prints the wall's own words, or the refusal. Either way it cites
   * no source, since nothing was read. A free route it names must have data
   * for the symbol (`lock.context` reads it), so the note may resolve later.
   */
  reportLockNote?(lock: PaneLock): string | Promise<string>;
  /**
   * What a rendered-view report needs before it shows anything, such as a
   * sign-in: `power catalog` lists it under Requires, as it does a
   * `headless` model's `discovery.dataRequirements`.
   */
  reportRequirements?: readonly string[];
  /**
   * A `shot` without `--height` grows to the pane's natural height, up to the
   * height limit, so a fixed board (FUT) shows every row instead of cutting
   * the last ones. Leave it off for long or paged lists; a pane with tabs
   * answers for the instance shown, so only its fixed board's tab grows.
   */
  shotFitsRows?: true | ((pane: PaneInstanceConfig) => boolean);
  /**
   * A report of the pane grows to the whole text of the page its reader has
   * open (a docs page), so it is not cut at the first screen. A list the reader
   * opens from keeps its height.
   */
  shotFitsReader?: true;
  /** Add an Excel-compatible CSV action for the pane's single active DataTable. */
  tableExport?: true;
  settings?: PaneSettingsDef | ((context: PaneSettingsContext) => PaneSettingsDef | null);
  /** Portable sharing is public by default; list the few pane-owned fields that must remain local. */
  portableShare?: PanePortableShareDef;
  /**
   * The person's own data the pane shows, so copying a public link to it,
   * posting its picture in a bug report and attaching it to an Ask Workstation
   * question ask first. A function decides
   * per instance from what it shows now (a chat pane on a public channel, a
   * quote of a ticker not held), and a function that returns null opts that
   * instance out. Leave it off for market data. A pane that says nothing is
   * still asked about when its plugin connects a broker (`holdings`) or the
   * pane keeps fields private when shared (`portableShare.private`,
   * `personal`), for plugins written before this field existed; declare it
   * to say exactly what the pane shows.
   */
  personalData?: PanePersonalData | ((context: PanePersonalDataContext) => PanePersonalData | null);
  /**
   * Compact controls surfaced next to the pane title. A key references a
   * toggle field in settings, or a two-option select field when `onValue` is set.
   */
  quickSettings?: readonly PaneQuickSettingDef[];
}

/**
 * Kinds of personal data a pane can show: `holdings` (positions, balances,
 * orders, profit and loss), `account` (account numbers, email, plan),
 * `messages` (private conversations) and `personal` (the person's own data
 * of a kind the pane does not name).
 */
export type PanePersonalData = "holdings" | "account" | "messages" | "personal";

/**
 * An option of a rendered-view report, which sets the pane setting of its key,
 * or of `settingKey` when the flag reads better than the setting's name
 * (`--columns` for `optionColumnIds`); with `pluginState`, the pane state the
 * view reads it from (a workspace's tab), and the setting too when it also
 * names a `settingKey`.
 */

export interface PaneQuickSettingDef {
  type: "toggle";
  key: string;
  icon: "zap" | "sqrt";
  label?: string;
  /**
   * For a two-option select field: the option the control turns on. Turning
   * it off picks the field's other option.
   */
  onValue?: string;
  /**
   * Shows the control only where it changes something, for a setting that
   * applies to some of what the pane can show. The field stays in the
   * settings dialog either way.
   */
  visible?: (context: PaneSettingsContext) => boolean;
}

export interface PaneSettingsContext {
  config: AppConfig;
  layout: LayoutConfig;
  paneId: string;
  paneType: string;
  pane: PaneInstanceConfig;
  settings: Record<string, unknown>;
  paneState: Record<string, unknown>;
  activeTicker: string | null;
  activeCollectionId: string | null;
}

/** What `PaneDef.personalData` decides from: the pane's settings context and the tickers with their positions. */
export interface PanePersonalDataContext extends PaneSettingsContext {
  tickers: ReadonlyMap<string, TickerRecord>;
}

export interface PaneSettingOption {
  value: string;
  label: string;
  description?: string;
}

interface PaneSettingFieldBase {
  key: string;
  label: string;
  description?: string;
  storage?: "pane" | "plugin";
  /** Keys in the same storage scope that should be reset when this value changes. */
  clearOnChange?: string[];
}

interface PaneSettingToggleField extends PaneSettingFieldBase {
  type: "toggle";
}

export interface PaneSettingTextField extends PaneSettingFieldBase {
  type: "text";
  placeholder?: string;
}

interface PaneSettingSelectField extends PaneSettingFieldBase {
  type: "select";
  options: PaneSettingOption[];
}

interface PaneSettingMultiSelectField extends PaneSettingFieldBase {
  type: "multi-select";
  options: PaneSettingOption[];
  /** A long list: a filter box, each description beside its label. */
  searchable?: boolean;
}

interface PaneSettingOrderedMultiSelectField extends PaneSettingFieldBase {
  type: "ordered-multi-select";
  options: PaneSettingOption[];
  /** A long list: a filter box, each description beside its label and each selection's position. */
  searchable?: boolean;
}

/** What an action row says of its own action (docs/pane-conventions.md, "Row messages"). */
export interface PaneSettingRowNote {
  /** A short state, where the row's action label is: `Connecting…`, `Sign-in failed`. */
  status: string;
  /** The full reason or the next step, in place of the row's description. */
  text?: string;
  tone: "warning" | "negative";
}

export interface PaneSettingActionContext extends PaneSettingsContext {
  surface: "pane-dialog" | "command-bar";
  close(): void;
  openCommandBar(query?: string): void;
  notify(notification: AppNotificationRequest): void;
  /**
   * Says on the row the action runs from what it is doing or what stopped it,
   * or clears that with null. A success the row's own description and label
   * show once they change needs no note. False once the row is off screen
   * (the dialog closed, or the action removed its own field): say it with
   * `notify` then, as a row that has left a list is a toast. Older hosts do
   * not pass it.
   */
  setRowNote?(note: PaneSettingRowNote | null): boolean;
}

export type PaneSettingActionHandler = (
  context: PaneSettingActionContext,
) => void | Promise<void>;

export type PaneSettingActionField = Omit<PaneSettingFieldBase, "storage" | "clearOnChange"> & {
  type: "action";
  actionId: string;
  actionLabel?: string;
  disabled?: boolean;
  action: PaneSettingActionHandler;
};

export type PaneSettingField =
  | PaneSettingToggleField
  | PaneSettingTextField
  | PaneSettingSelectField
  | PaneSettingMultiSelectField
  | PaneSettingOrderedMultiSelectField
  | PaneSettingActionField;

export interface PaneSettingsDef {
  title?: string;
  values?: Record<string, unknown>;
  fields: PaneSettingField[];
  applyValue?: (
    settings: Record<string, unknown>,
    field: PaneSettingField,
    value: unknown,
    context: PaneSettingsContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

export interface PaneTemplateContext {
  config: AppConfig;
  layout: LayoutConfig;
  focusedPaneId: string | null;
  activeTicker: string | null;
  activeInstrument?: BrokerContractRef | null;
  activeListing?: TickerListingRef;
  activeCollectionId: string | null;
}

/** One value a shortcut argument accepts: `value` is typed after the prefix, `label` says what it is. */
export interface ShortcutArgOption {
  value: string;
  label: string;
}

/** Why a typed argument opens nothing: the row's text, and the line under it saying what to type instead. */
export interface ShortcutArgError {
  message: string;
  detail?: string;
}

interface PaneTemplateShortcut {
  prefix: string;
  /** Other mnemonics for the same view (FFIP for WIRP). They open it when typed but are not listed as separate rows. */
  aliases?: readonly string[];
  /** Keep this shortcut executable when typed, but omit its pane from command-bar browse rows. Defaults to true. */
  showInBrowse?: boolean;
  /**
   * What the shortcut takes after the prefix. Left out, it takes the argument
   * the template's `headless` definition declares, as `power catalog` lists it.
   */
  argPlaceholder?: string;
  argKind?: "text" | "ticker" | "ticker-list";
  /**
   * For a ticker list, entries kept as typed instead of resolved as tickers:
   * CORR keeps map series (`GEO:HORMUZ`) beside its tickers.
   */
  keepArgToken?: (token: string) => boolean;
  argOptional?: boolean;
  /**
   * With no argument typed and none to infer from the active ticker, open
   * the pane without one instead of asking for it (ERN alone is the market
   * board). Without it an optional argument still falls back to the form.
   */
  openWithoutArg?: boolean;
  /**
   * Named values the argument accepts, for an argument mostly drawn from a
   * small set (a statistic, a futures root). The command-bar assistant picks
   * from it instead of guessing the text; the command may accept others too.
   */
  argOptions?: () => readonly ShortcutArgOption[];
  /**
   * Why a typed argument opens nothing, or null when it opens the view:
   * `PF Nope` names no portfolio or watchlist. The command bar shows it in
   * place of the function's row, and the pane does not open for it.
   */
  argError?: (arg: string, context: PaneTemplateContext) => ShortcutArgError | null;
}

export interface PaneTemplateCreateOptions {
  arg?: string;
  values?: Record<string, string>;
  symbol?: string | null;
  symbols?: string[] | null;
  ticker?: TickerRecord | null;
  searchResult?: InstrumentSearchResult | null;
  instrument?: BrokerContractRef | null;
  listing?: TickerListingRef;
  /** Template-owned, validated data restored from a public pane share. */
  shareData?: unknown;
}

export interface PaneTemplateInstanceConfig {
  instanceId?: string;
  title?: string;
  binding?: PaneBinding;
  params?: Record<string, string>;
  settings?: Record<string, unknown>;
  placement?: "default" | "docked" | "floating";
  relativeToPaneId?: string;
  relativePosition?: "left" | "right" | "above" | "below";
}

export interface PaneTemplatePublicShareContext {
  pane: PaneInstanceConfig;
  paneState: Record<string, unknown>;
}

export interface PaneTemplatePublicShareSnapshot {
  title: string;
  description?: string;
  data: Record<string, unknown>;
}

export interface PaneTemplatePublicShareDef {
  serialize(context: PaneTemplatePublicShareContext): PaneTemplatePublicShareSnapshot | null;
  restore(data: Record<string, unknown>): PaneTemplateCreateOptions | null;
}

export interface PaneTemplateDef {
  id: string;
  paneId: string;
  label: string;
  description: string;
  keywords?: string[];
  shortcut?: PaneTemplateShortcut;
  /**
   * False leaves the function out of every list and search of functions
   * (command-bar browse, search and assistant, Help, `power catalog` and
   * search, the plugin directory, chat suggestions) while typing its code
   * still opens it, `fn` and `shot` still run it and its help still answers.
   * ATTN until it publishes (attention/listing.ts).
   */
  listed?: boolean;
  /** Template-specific headless model. Takes precedence over the pane-level model. */
  /**
   * Source and status of the view this template opens, for a template that
   * opens one view of a pane hosting several (Fixed Income's Issuer Debt).
   * Captures and rendered-view reports merge it over the pane's own
   * `reportFreshness`: each field set here wins, the rest are the pane's. So
   * they date the filings on screen, not the issuer's stock quote.
   */
  wizard?: WizardStep[];
  canCreate?: (context: PaneTemplateContext, options?: PaneTemplateCreateOptions) => boolean;
  createInstance?: (
    context: PaneTemplateContext,
    options?: PaneTemplateCreateOptions,
  ) => PaneTemplateInstanceConfig | null | Promise<PaneTemplateInstanceConfig | null>;
  /** Legacy v1 restoration or an explicit transformed snapshot; normal pane shares use portableShare. */
  publicShare?: PaneTemplatePublicShareDef;
}

export interface WizardStep {
  key: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  type?: "text" | "password" | "info" | "select" | "number" | "textarea";
  options?: Array<{ label: string; value: string }>;
  /** Shown only while the earlier answer holds the value; with several, while every one does. */
  dependsOn?: { key: string; value: string } | ReadonlyArray<{ key: string; value: string }>;
  /** Later wizard values to clear when this selection changes from its default. */
  clearOnChange?: string[];
  body?: string[];
}

export interface CommandShortcutArgContext {
  activeTicker: string | null;
}

interface CommandShortcutArgDef {
  placeholder?: string;
  kind?: "text" | "ticker" | "ticker-list";
  parse?: (
    arg: string,
    context: CommandShortcutArgContext,
  ) => Record<string, string>;
}

export interface CommandResultDef {
  id: string;
  label: string;
  detail?: string;
  category?: string;
  /** Short tag drawn left of the label, as on a search provider's row. Six characters at most. */
  badge?: string;
  /** Drawn muted after the label, e.g. a person's full name after their @username. */
  name?: string;
  right?: string;
  keywords?: string[];
  current?: boolean;
  disabled?: boolean;
  execute: () => void | Promise<void>;
}

export interface CommandBarResultLineSegment {
  text: string;
  emphasis?: "match" | "muted";
}

export interface CommandBarResultLine {
  segments: CommandBarResultLineSegment[];
}

export interface CommandBarResultDef {
  id: string;
  label: string;
  detail?: string;
  /** Rendered under the label. Each entry is one additional row. */
  lines?: CommandBarResultLine[];
  category?: string;
  /** Short tag drawn left of the label, e.g. a document type. Six characters at most. */
  badge?: string;
  /** Drawn muted after the label, e.g. a person's full name after their @username. */
  name?: string;
  right?: string;
  keywords?: string[];
  disabled?: boolean;
  execute: () => void | Promise<void>;
}

export interface CommandBarSearchContext {
  activeTicker: string | null;
  activeCollectionId: string | null;
}

export interface CommandBarSearchProvider {
  id: string;
  /** Section heading for these rows, e.g. "Documents". */
  category: string;
  /** Sort position of the section. Higher sinks. Navigation sections are negative; use a positive value to sit below them. */
  priority?: number;
  /** Skip the provider below this length. Default 3. */
  minQueryLength?: number;
  /** Default 300. Ignored by `match`. */
  debounceMs?: number;
  /**
   * How long `provide` may take once it starts, in ms. Default 8000. Past it
   * the bar aborts `signal`, drops a late answer and stops showing Searching.
   * Ignored by `match`.
   */
  timeoutMs?: number;
  /**
   * Codes (`CHAT`) after which the provider is still asked, typed alone or
   * with text after them, with the whole query. Every other provider stays
   * quiet once a code claims the text.
   */
  shortcuts?: readonly string[];
  provide(
    query: string,
    context: CommandBarSearchContext,
    signal: AbortSignal,
  ): Promise<CommandBarResultDef[]>;
  /**
   * Rows from what the app already holds in memory. When set, the bar calls
   * this instead of `provide`, as it renders and on every keystroke, so it
   * must be cheap: no request, no waiting. Its rows are ranked with the bar's
   * own matches as they are typed and sit under Suggested in the empty bar.
   * Keep `provide` answering the same rows for older versions of the app.
   */
  match?(query: string, context: CommandBarSearchContext): CommandBarResultDef[];
}

export interface CommandDef {
  id: string;
  label: string;
  keywords: string[];
  shortcut?: string;
  shortcutArg?: CommandShortcutArgDef;
  buildResults?: (arg: string) => CommandResultDef[];
  execute: (values?: Record<string, string>) => void | Promise<void>;
  category: "navigation" | "data" | "portfolio" | "config";
  description?: string;
  wizard?: WizardStep[];
  confirm?: CommandConfirmDef | ((context: CommandConfirmContext) => CommandConfirmDef | null);
  /** @deprecated Ignored: a wizard always opens as one form with every step at once. */
  wizardLayout?: "steps" | "form";
  hidden?: () => boolean;
}

interface CommandConfirmContext {
  config: AppConfig;
  layout: LayoutConfig;
  activeTicker: string | null;
  activeCollectionId: string | null;
}

interface CommandConfirmDef {
  title: string;
  body: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

export interface KeyboardShortcut {
  id: string;
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  description: string;
  execute: () => void;
}

export interface ContextMenuProviderDef {
  id: string;
  order?: number;
  contexts?: ContextMenuContext["kind"][];
  getItems(context: ContextMenuContext): ContextMenuItem[] | null | undefined;
}

export interface PluginPersistence {
  getState<T = unknown>(key: string, options?: { schemaVersion?: number }): T | null;
  setState(key: string, value: unknown, options?: { schemaVersion?: number }): void;
  deleteState(key: string): void;
  getResource<T = unknown>(
    kind: string,
    key: string,
    options?: { sourceKey?: string; schemaVersion?: number; allowExpired?: boolean },
  ): PersistedResourceValue<T> | null;
  setResource<T = unknown>(
    kind: string,
    key: string,
    value: T,
    options: {
      cachePolicy: CachePolicy;
      sourceKey?: string;
      schemaVersion?: number;
      provenance?: unknown;
    },
  ): PersistedResourceValue<T>;
  deleteResource(kind: string, key: string, options?: { sourceKey?: string }): void;
}

export type AppNotificationType = "info" | "success" | "error";
type AppDesktopNotificationMode = "never" | "when-inactive" | "always";

export interface AppNotificationDelivery {
  toastVisible: boolean;
  desktopRequested: boolean;
}

export interface AppNotificationRequest {
  title?: string;
  body: string;
  subtitle?: string;
  duration?: number;
  type?: AppNotificationType;
  toast?: boolean;
  /** If true, in-app toast stays visible until user dismisses it */
  persistent?: boolean;
  desktop?: AppDesktopNotificationMode;
  /** macOS sound name (e.g., "Glass", "Ping", "Hero"). Ignored on other platforms. */
  sound?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  /**
   * What a built-in notice is about, so the Unread list can keep it after the
   * toast is gone and open it again: `price:<alertId>`, `catalyst:<eventId>`,
   * `econ:<eventId>`, `team:<cardId>` or `scan:<paneId>`. Other values are not kept.
   */
  refId?: string;
  /** Rendered next to `action`. Use for a dismissing counterpart such as snooze. */
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
}

export interface WorkstationPluginContext {
  readonly persistence: PluginPersistence;
}

/**
 * Where a plugin can actually run.
 *
 * `cli` and `tui` run in Bun and may use Node APIs. `desktop` runs in the
 * Electrobun view. `web` runs in the browser at term.power.sh, which rules out
 * Node builtins entirely — a plugin opening a TCP socket (IBKR Gateway) can
 * never be web-capable, no matter what it declares.
 *
 * Plugins may declare this, but the registry derives it from a static import
 * scan and overwrites the declaration. Treat an author-supplied value as a hint.
 */
export type PluginTarget = "cli" | "tui" | "desktop" | "web";

export const ALL_PLUGIN_TARGETS: readonly PluginTarget[] = ["cli", "tui", "desktop", "web"];

/**
 * One setting a plugin needs from the user before it is useful, such as an API
 * key. Values are stored in the plugin's `configState` under `key`.
 */
export interface PluginConfigField {
  key: string;
  label: string;
  type?: "text" | "password" | "number" | "select";
  /** Shown under the field. Say where to get the value, not what the plugin does. */
  description?: string;
  placeholder?: string;
  defaultValue?: string;
  /** The plugin counts as "needs setup" while a required field is empty. Default true. */
  required?: boolean;
  options?: Array<{ label: string; value: string }>;
}

export interface WorkstationPlugin {
  id: string;
  /**
   * Where this plugin's saved state lives: its `pluginConfig` entry, its resume
   * state, and the per-pane state its panes write. Defaults to `id`.
   *
   * Set it when a plugin is renamed, or moves out of this repository under a
   * new id, so the threads, tabs, and defaults a user already has stay theirs.
   * Everything else (the toggle, the marketplace, seeding) keys off `id`.
   */
  stateId?: string;
  name: string;
  version: string;
  description?: string;
  toggleable?: boolean;
  order?: number;
  /** Defaults to every target when omitted. */
  targets?: readonly PluginTarget[];
  /**
   * Third-party hosts the plugin fetches from, as bare domains
   * (`"api.example.com"`; a parent domain also covers its subdomains).
   *
   * Terminal and desktop reach anything, so this is informational there and
   * is what the plugin directory shows under "Network access". On the web the
   * browser cannot call a host that sends no CORS headers, so the hosted app
   * proxies exactly the hosts the bundled plugins declare here and refuses
   * the rest. A plugin that leaves a host out works on the desktop and fails
   * on the web.
   *
   * Hosts reached by a plugin's dependencies count too: declare every host
   * contacted on the plugin's behalf, including authentication endpoints.
   */
  hosts?: readonly string[];
  /** Shown in the marketplace pane and on the website. */
  homepage?: string;
  /**
   * Settings the plugin cannot work without. Declaring them gives the plugin a
   * "Set up <name>" command, a form the marketplace opens from its `s` key, and
   * a `needs setup` status until every required field has a value. Read the
   * values back with `ctx.configState.get(key)`.
   */
  configSchema?: PluginConfigField[];
  /**
   * Overrides the default readiness rule (every required `configSchema` field
   * has a value) for plugins whose setup is not a plain form, such as a broker
   * login or a file that must exist.
   */
  isConfigured?(values: Record<string, unknown>): boolean;

  setup?(ctx: WorkstationPluginContext): void | Promise<void>;
  dispose?(): void;

  panes?: PaneDef[];
  paneTemplates?: PaneTemplateDef[];
  /**
   * Series the plugin adds to the data catalog, chartable against any other
   * catalog entry. A definition that fails validation is skipped and logged;
   * `ctx.registerSeries` adds series later and throws instead.
   */
  slots?: Partial<{
    [K in keyof WorkstationSlots]: (props: WorkstationSlots[K]) => ReactNode;
  }>;
}
