import { logFailure } from "../../utils/log-failure";
import { lstatSync } from "fs";
import { homedir } from "os";
import { isAbsolute, join } from "path";

/**
 * Where Vic1 keeps everything local: the global config that records the
 * data directory, the data directory itself unless that record says
 * otherwise, installed plugins, and the plugin bundle cache.
 *
 * `~/.vic1` by default. `VIC1_HOME` moves the whole folder (#728):
 * editing `dataDir` in config.json alone could never do that, because the
 * file holding the edit lives in the folder being moved, and a launch that
 * did not find it there started a fresh `~/.vic1`.
 *
 * On Linux a new install follows the XDG Base Directory spec instead (#1267):
 * config.json in `$XDG_CONFIG_HOME/vic1`, the data directory, plugins
 * and the terminal media pid file in `$XDG_DATA_HOME/vic1`, the plugin
 * and native caches in `$XDG_CACHE_HOME/vic1`. An existing `~/.vic1` keeps
 * winning, so no install moves. Once an XDG config.json exists it wins over
 * a `~/.vic1` created later (an older version, a stray `mkdir`), so the
 * choice cannot flip and leave the data behind.
 *
 * Every caller goes through `getVic1Dirs`, so the terminal, the desktop
 * app and the CLI resolve the same folders from the same environment.
 */
const VIC1_HOME_ENV = "VIC1_HOME";
const XDG_FOLDER = "vic1";

export interface Vic1Dirs {
  /**
   * `override`: everything under `VIC1_HOME`. `home`: everything under
   * `~/.vic1`. `xdg`: split across the XDG base directories.
   */
  kind: "override" | "home" | "xdg";
  /** The global config.json, which records the data directory. */
  configFile: string;
  /** The data directory used when config.json records none. */
  data: string;
  /** Installed plugins. */
  plugins: string;
  /** Host-owned scratch space for plugins: bundles, update state. */
  pluginCache: string;
  /**
   * The standalone binary's render library, copied out of the binary when the
   * temp folder cannot hold or run it (see renderers/opentui/render-lib).
   */
  nativeCache: string;
}

function getUserHome(env: NodeJS.ProcessEnv): string {
  return env.HOME || homedir();
}

/** Expands a leading `~` the way a shell would, so `VIC1_HOME=~/power` works from any launcher. */
export function expandUserHome(path: string, env: NodeJS.ProcessEnv = process.env): string {
  if (path === "~") return getUserHome(env);
  if (path.startsWith("~/") || path.startsWith("~\\")) return join(getUserHome(env), path.slice(2));
  return path;
}

/** Any entry counts, a dangling symlink included: an unmounted drive behind `~/.vic1` is still an install. */
function pathExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    // An absent optional file or directory is expected.
    if ((error as { code?: unknown } | null)?.code !== "ENOENT") logFailure("data.config.home", "Checking the existing config directory failed")(error);
    return false;
  }
}

/** One folder for everything, as on every platform before #1267. */
function singleFolder(kind: "override" | "home", home: string): Vic1Dirs {
  return {
    kind,
    configFile: join(home, "config.json"),
    data: home,
    plugins: join(home, "plugins"),
    pluginCache: join(home, "plugin-cache"),
    nativeCache: join(home, "native-cache"),
  };
}

/** An XDG base directory: the variable when it holds an absolute path, the spec's default otherwise. */
function xdgBase(env: NodeJS.ProcessEnv, variable: string, fallback: string): string {
  const value = env[variable];
  return value && isAbsolute(value) ? value : join(getUserHome(env), fallback);
}

function xdgFolders(env: NodeJS.ProcessEnv): Vic1Dirs {
  const data = join(xdgBase(env, "XDG_DATA_HOME", join(".local", "share")), XDG_FOLDER);
  const cache = join(xdgBase(env, "XDG_CACHE_HOME", ".cache"), XDG_FOLDER);
  return {
    kind: "xdg",
    configFile: join(xdgBase(env, "XDG_CONFIG_HOME", ".config"), XDG_FOLDER, "config.json"),
    data,
    plugins: join(data, "plugins"),
    pluginCache: join(cache, "plugin-cache"),
    nativeCache: join(cache, "native-cache"),
  };
}

/**
 * The folders this launch uses. Resolved per call rather than cached, so a
 * test can point `HOME` or `VIC1_HOME` at a scratch directory.
 */
export function getVic1Dirs(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Vic1Dirs {
  const override = env[VIC1_HOME_ENV]?.trim();
  if (override) return singleFolder("override", expandUserHome(override, env));

  const legacyHome = join(getUserHome(env), ".vic1");
  if (platform !== "linux") return singleFolder("home", legacyHome);

  const xdg = xdgFolders(env);
  if (pathExists(xdg.configFile)) return xdg;
  if (pathExists(legacyHome)) return singleFolder("home", legacyHome);
  return xdg;
}
