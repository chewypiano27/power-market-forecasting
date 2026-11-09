/**
 * Series a plugin registers for the data catalog and the chart composer.
 *
 * One definition is one catalog entry: a named line with a unit and a
 * frequency that the composer can draw next to any other entry. A definition
 * either loads its own history (`load`) or points at something the composer
 * already draws (`expression`), such as a FRED series or a ticker field.
 */

/** Who a chart of a series cites, when the loaded data names it: the dataset (`FRED series ECBDFR`) and who published it. */
export interface SeriesAttribution {
  source: string;
  publisher?: string;
}
