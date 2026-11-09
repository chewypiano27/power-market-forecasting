/** What a cell or figure reads when the source gave no value; an export writes it as an empty cell. */
export const MISSING_VALUE = "—";

const numberFormatters = new Map<number, Intl.NumberFormat>();

/** Currencies whose minor unit is a thousandth (ISO 4217 exponent 3): an Omani share is OMR 1.366, not OMR 1.37.
 * IQD is left out on purpose: it has the exponent in ISO 4217 but trades in whole units. */
const THREE_DECIMAL_CURRENCIES = new Set(["BHD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** Decimals a price or amount in this currency is shown to: 3 for the thousandth currencies, 2 for everything else. */
export function currencyPriceDigits(currency: string | undefined): 2 | 3 {
  return currency != null && THREE_DECIMAL_CURRENCIES.has(currency.trim().toUpperCase()) ? 3 : 2;
}

function getNumberFormatter(decimals: number): Intl.NumberFormat {
  let formatter = numberFormatters.get(decimals);
  if (!formatter) {
    formatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    numberFormatters.set(decimals, formatter);
  }
  return formatter;
}

/** Signs a fixed-decimal move; one that rounds to zero is unsigned (0.00, never +0.00 or -0.00). */
function signedFixed(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (!/[1-9]/.test(fixed)) return fixed;
  return `${value > 0 ? "+" : "-"}${fixed}`;
}

/** Format a percentage that's already in percent form (e.g., 1.23 -> +1.23%) */
export function formatPercentRaw(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return MISSING_VALUE;
  return `${signedFixed(value, 2)}%`;
}

/** Format a plain number with commas */
export function formatNumber(value: number | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return MISSING_VALUE;
  return getNumberFormatter(decimals).format(value);
}

const COMBINING_MARK_RE = /\p{Mark}/u;
const EMOJI_PRESENTATION_RE = /\p{Emoji_Presentation}/u;
const EXTENDED_PICTOGRAPHIC_RE = /\p{Extended_Pictographic}/u;
const REGIONAL_INDICATOR_RE = /\p{Regional_Indicator}/u;

/**
 * Printable ASCII is always one cell per code unit. Table cells are mostly
 * numbers, tickers, and dates, so this skips grapheme segmentation on the
 * render hot path.
 */
const SINGLE_WIDTH_ASCII_RE = /^[\x20-\x7e]*$/;

let graphemeSegmenter: { segment(value: string): Iterable<{ segment: string }> } | null | undefined;

// Constructing Intl.Segmenter costs about 10us; segmenting with a shared one
// costs a fraction of that, and the instance carries no per-call state.
function getGraphemeSegmenter(): typeof graphemeSegmenter {
  if (graphemeSegmenter === undefined) {
    const Segmenter = (Intl as any).Segmenter;
    graphemeSegmenter = typeof Segmenter === "function"
      ? new Segmenter(undefined, { granularity: "grapheme" })
      : null;
  }
  return graphemeSegmenter;
}

function segmentGraphemes(value: string): string[] {
  const segmenter = getGraphemeSegmenter();
  if (segmenter) {
    return Array.from(segmenter.segment(value), (entry) => entry.segment);
  }
  return Array.from(value);
}

function isFullwidthCodePoint(codePoint: number): boolean {
  return codePoint >= 0x1100 && (
    codePoint <= 0x115f ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff) ||
    (codePoint >= 0x20000 && codePoint <= 0x3fffd)
  );
}

function graphemeWidth(segment: string): number {
  if (
    REGIONAL_INDICATOR_RE.test(segment) ||
    EMOJI_PRESENTATION_RE.test(segment) ||
    EXTENDED_PICTOGRAPHIC_RE.test(segment)
  ) {
    return 2;
  }

  let width = 0;
  for (const char of Array.from(segment)) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (
      codePoint === 0 ||
      codePoint < 32 ||
      (codePoint >= 0x7f && codePoint < 0xa0) ||
      codePoint === 0x200d ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
      COMBINING_MARK_RE.test(char)
    ) {
      continue;
    }
    width += isFullwidthCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

export function displayWidth(value: string): number {
  if (SINGLE_WIDTH_ASCII_RE.test(value)) return value.length;
  return segmentGraphemes(value).reduce((total, segment) => total + graphemeWidth(segment), 0);
}

function truncateToWidth(value: string, width: number): string {
  if (width <= 0) return "";
  if (SINGLE_WIDTH_ASCII_RE.test(value)) return value.slice(0, width);
  let output = "";
  let used = 0;
  for (const segment of segmentGraphemes(value)) {
    const nextWidth = graphemeWidth(segment);
    if (used + nextWidth > width) break;
    output += segment;
    used += nextWidth;
  }
  return output;
}

export function truncateToDisplayWidth(value: string, width: number): string {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  if (width <= 3) return ".".repeat(width);
  return `${truncateToWidth(value, width - 3)}...`;
}

/**
 * Clips to a display width behind a single `…`, which gives a narrow cell back
 * two characters that `...` would spend on the marker.
 */
export function clipToDisplayWidth(value: string, width: number): string {
  if (width <= 0) return "";
  if (displayWidth(value) <= width) return value;
  if (width === 1) return "…";
  return `${truncateToWidth(value, width - 1).trimEnd()}…`;
}

/**
 * Clips a styled run of text to a display width. A highlighted snippet is many
 * text nodes rather than one string, so the clipping cannot go through
 * `truncateToDisplayWidth`; the ellipsis is built by the caller so the returned
 * segments keep whatever styling flags the caller's segment type carries.
 */
export function truncateTextSegments<T extends { text: string }>(
  segments: T[],
  width: number,
  makeEllipsis: (ellipsis: string) => T,
): T[] {
  if (width <= 0) return [];
  const total = segments.reduce((sum, segment) => sum + displayWidth(segment.text), 0);
  if (total <= width) return segments;
  if (width <= 1) return [makeEllipsis("\u2026".slice(0, width))];

  const budget = width - 1;
  const clipped: T[] = [];
  let used = 0;
  for (const segment of segments) {
    const remaining = budget - used;
    if (remaining <= 0) break;
    const segmentWidth = displayWidth(segment.text);
    if (segmentWidth <= remaining) {
      clipped.push(segment);
      used += segmentWidth;
      continue;
    }
    clipped.push({ ...segment, text: truncateToWidth(segment.text, remaining) });
    break;
  }
  clipped.push(makeEllipsis("\u2026"));
  return clipped;
}

/** Pad/truncate a string to a fixed display width */
export function padTo(str: string, width: number, align: "left" | "right" | "center" = "left"): string {
  const clipped = displayWidth(str) > width ? truncateToWidth(str, width) : str;
  const clippedWidth = displayWidth(clipped);
  const padding = Math.max(0, width - clippedWidth);
  if (align === "right") return " ".repeat(padding) + clipped;
  if (align === "center") {
    const leftPadding = Math.floor(padding / 2);
    const rightPadding = padding - leftPadding;
    return " ".repeat(leftPadding) + clipped + " ".repeat(rightPadding);
  }
  return clipped + " ".repeat(padding);
}
