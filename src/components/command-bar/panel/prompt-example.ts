/** Electricity-workstation queries suggested by the empty command bar. */
const COMMAND_BAR_EXAMPLES = [
  "Market Desk",
  "Weather & Load Risk",
  "Regional Spot",
] as const;

let nextExampleIndex = Math.floor(Math.random() * COMMAND_BAR_EXAMPLES.length);

/** The example for this opening of the bar; the next opening gets the next one. */
export function takeCommandBarExample(): string {
  const example = COMMAND_BAR_EXAMPLES[nextExampleIndex % COMMAND_BAR_EXAMPLES.length]!;
  nextExampleIndex = (nextExampleIndex + 1) % COMMAND_BAR_EXAMPLES.length;
  return example;
}
