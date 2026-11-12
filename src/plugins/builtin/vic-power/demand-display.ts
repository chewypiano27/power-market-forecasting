import { getUiLocale } from "../../../i18n";
import { demandIssue, shiftDemandDate } from "./demand-features";
import type { DemandProbabilityResult } from "./demand-probability";

/** Keep a fixed NEM-day target separate from calendar selection and local display time. */
export function demandDisplay(result: DemandProbabilityResult | null, targetDate: string, selectedDate: string, loading: boolean, modelAvailable: boolean) {
  const scoped = targetDate === selectedDate;
  const current = scoped && result?.status === "ready" && result.targetDate === targetDate ? result : null;
  const issue = new Date(demandIssue(targetDate).issueAt);
  const format = new Intl.DateTimeFormat(getUiLocale(), { timeZone: "Australia/Melbourne", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = format.formatToParts(issue);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value ?? "";
  const localIssue = getUiLocale() === "en-AU" ? `${part("day")} ${part("month")} ${part("hour")}:${part("minute")}` : format.format(issue);
  const zone = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", timeZoneName: "short" }).formatToParts(issue).find(part => part.type === "timeZoneName")?.value ?? "Melbourne";
  const day = (value: string) => new Date(`${value}T00:00:00+10:00`).toLocaleDateString(getUiLocale(), { day: "numeric", month: "short", timeZone: "Australia/Brisbane" });
  const status = !scoped ? "Day-ahead only" : !modelAvailable ? "Model pending" : loading && !current ? "Loading" : result?.status === "pending" ? "Pending" : "Unavailable";
  const value = current ? current.probability < .01 ? "<1%" : current.probability > .99 ? ">99%" : `${Math.round(current.probability * 100)}%` : status;
  return { scoped, current, value, eventLabel: current ? `Demand > ${current.thresholdMw.toLocaleString("en-AU")} MW` : "Demand probability",
    selectedDay: day(selectedDate), forecastDay: day(targetDate), issue: localIssue, issueZone: zone };
}

/** Today's previously issued forecast remains valid until the next fixed-AEST midnight. */
export function selectedDemandTarget(nextTarget: string, selectedDate?: string): string {
  return selectedDate === shiftDemandDate(nextTarget, -1) ? selectedDate : nextTarget;
}
