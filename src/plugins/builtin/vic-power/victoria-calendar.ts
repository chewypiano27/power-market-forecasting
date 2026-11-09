interface DateRange {
  start: string;
  end: string;
}

export interface VictorianCalendarAnnotation {
  isPublicHoliday: boolean;
  isSchoolHoliday: boolean;
  publicHoliday?: string;
  label?: string;
}

// Victorian government-school terms, published by the Department of Education.
// This workstation is intentionally scoped to 2026. Private schools may use different dates.
const SCHOOL_TERMS: Record<number, readonly DateRange[]> = {
  2026: [
    { start: "2026-01-27", end: "2026-04-02" }, { start: "2026-04-20", end: "2026-06-26" },
    { start: "2026-07-13", end: "2026-09-18" }, { start: "2026-10-05", end: "2026-12-18" },
  ],
};

// Official Business Victoria / Fair Work historical holiday calendars.
const AFL_GRAND_FINAL_EVE: Record<number, string> = {
  2024: "2024-09-27",
  2025: "2025-09-26",
  2026: "2026-09-25",
};

function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function atNoon(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12);
}

function shifted(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function nthWeekday(year: number, month: number, weekday: number, nth: number): Date {
  const first = atNoon(year, month, 1);
  return shifted(first, (weekday - first.getDay() + 7) % 7 + (nth - 1) * 7);
}

// Anonymous Gregorian computus; sufficient for the calendar feature range.
function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  return atNoon(year, month, day);
}

function publicHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const add = (date: Date, name: string) => holidays.set(iso(date), name);
  const addWeekendSubstitute = (date: Date, name: string) => {
    add(date, name);
    if (date.getDay() === 6) add(shifted(date, 2), `${name} (additional day)`);
    if (date.getDay() === 0) add(shifted(date, 1), `${name} (additional day)`);
  };
  addWeekendSubstitute(atNoon(year, 1, 1), "New Year's Day");
  addWeekendSubstitute(atNoon(year, 1, 26), "Australia Day");
  add(nthWeekday(year, 3, 1, 2), "Labour Day");
  const easter = easterSunday(year);
  add(shifted(easter, -2), "Good Friday");
  add(shifted(easter, -1), "Saturday before Easter Sunday");
  add(easter, "Easter Sunday");
  add(shifted(easter, 1), "Easter Monday");
  add(atNoon(year, 4, 25), "ANZAC Day");
  add(nthWeekday(year, 6, 1, 2), "King's Birthday");
  const grandFinalEve = AFL_GRAND_FINAL_EVE[year];
  if (grandFinalEve) holidays.set(grandFinalEve, "Friday before AFL Grand Final");
  add(nthWeekday(year, 11, 2, 1), "Melbourne Cup Day");
  const christmas = atNoon(year, 12, 25);
  const boxingDay = atNoon(year, 12, 26);
  add(christmas, "Christmas Day");
  add(boxingDay, "Boxing Day");
  if (christmas.getDay() === 6 || christmas.getDay() === 0) {
    add(atNoon(year, 12, 27), "Christmas Day (additional day)");
    add(atNoon(year, 12, 28), "Boxing Day (additional day)");
  } else if (boxingDay.getDay() === 6 || boxingDay.getDay() === 0) {
    add(atNoon(year, 12, 28), "Boxing Day (additional day)");
  }
  return holidays;
}

export function victorianCalendarAnnotation(date: string): VictorianCalendarAnnotation {
  const year = Number(date.slice(0, 4));
  const publicHoliday = publicHolidays(year).get(date);
  const terms = SCHOOL_TERMS[year];
  const isSchoolHoliday = !!terms && !terms.some((term) => date >= term.start && date <= term.end);
  const labels = [publicHoliday, isSchoolHoliday ? "School holidays" : undefined].filter(Boolean);
  return {
    isPublicHoliday: !!publicHoliday,
    isSchoolHoliday,
    ...(publicHoliday ? { publicHoliday } : {}),
    ...(labels.length ? { label: labels.join(" · ") } : {}),
  };
}
