
// The time-series chart: one or more panels of resolved series with axes,
// a cursor, and range selection. Ticker overview, polls, econ statistics,
// and prediction markets all draw with it.
export { CompositeChart } from "./chart/composite";
// Figures, then a chart, then a table: the header zone, its size rule at every
// pane size, and the selection the chart and the table share.
export { ChartTableHeader, useChartTableSelection } from "./chart-table";
export { scalarPoint, staticSeries } from "./chart/static/series";
export { DataTableView } from "./data-table/view";
export { usePaneFooter, usePaneMenuItems } from "./layout/pane/footer";
export { usePaneTabs } from "./layout/pane/pane-tabs";
// The common footer shapes on top of `usePaneFooter`: a status segment that
// changes with loading/error state, and one that also carries a link.
export { usePaneStatusFooter } from "./layout/pane/status-footer";
export { usePaneNoticeFooter } from "./use-pane-notice-footer";
// The shared UI kit. Listed by name rather than re-exported with `*` because
// this file is the public `vic1/components` surface: a kit component
// reaches plugins only once it is added here.
export { ActionRow, Badge, Button, Card, KeyValueRow, PaneStatusBody, QueryBar, RatioBar, SectionHeading, SliderField, StatGrid, statGridRows } from "./ui";
export type { DataTableColumn, StatItem } from "./ui";
