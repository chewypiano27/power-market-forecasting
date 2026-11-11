import type { StarPromptConfig } from "../../types/config";
import { isRecord } from "../../utils/guards";

/**
 * The one-time line in the terminal's status bar asking to star the
 * repository. It waits for the third distinct day the terminal app is opened
 * on, then for a minute on screen that day, shows once, and never again:
 * opening the repository, dismissing it and its timeout all end it, and so
 * does quitting while it shows. `starPrompt.enabled: false` turns it off.
 */

export const STAR_PROMPT_REPO_URL = "https://github.com/chewypiano27/power-market-forecasting";
/** The line waits for this many distinct days of use, today included. */
const STAR_PROMPT_SESSION_DAYS = 3;
/** On-screen time on the due day before the line shows. */
export const STAR_PROMPT_DELAY_MS = 60_000;
/** On-screen time the line stays before it times out. */
export const STAR_PROMPT_VISIBLE_MS = 5 * 60_000;

type StarPromptOutcome = NonNullable<StarPromptConfig["outcome"]>;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const OUTCOMES = new Set<StarPromptOutcome>(["opened", "dismissed", "expired"]);

/** Only the fields that hold a valid value survive; an empty object is the same as none. */
export function sanitizeStarPrompt(value: unknown): StarPromptConfig | undefined {
  if (!isRecord(value)) return undefined;
  const days = Array.isArray(value.days)
    ? [...new Set(value.days.filter((day): day is string => typeof day === "string" && DAY_PATTERN.test(day)))]
      .slice(0, STAR_PROMPT_SESSION_DAYS)
    : [];
  const state: StarPromptConfig = {
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    ...(days.length > 0 ? { days } : {}),
    ...(typeof value.shownAt === "string" && value.shownAt ? { shownAt: value.shownAt } : {}),
    ...(typeof value.outcome === "string" && OUTCOMES.has(value.outcome as StarPromptOutcome)
      ? { outcome: value.outcome as StarPromptOutcome }
      : {}),
  };
  return Object.keys(state).length > 0 ? state : undefined;
}
