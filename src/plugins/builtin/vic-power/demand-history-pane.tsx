import { useAppLanguage } from "../../../i18n/react";
import { useMemo } from "react";
import { ChartTableHeader, DataTableView, PaneStatusBody, QueryBar, scalarPoint, staticSeries, useChartTableSelection, type DataTableColumn } from "../../../components";
import { usePluginPaneState } from "../../../public/react";
import { useThemeColors } from "../../../theme/theme-context";
import type { PaneProps } from "../../../types/plugin";
import { demandDayStart } from "./demand-features";
import { demandHistoryOutcome, demandHistoryRows, validateDemandHistory, type DemandHistoryFilter, type DemandHistoryRow } from "./demand-history";
import candidate from "./demand-history.json";
import { bundledDemandModel } from "./demand-service";

let history: ReturnType<typeof validateDemandHistory> | null = null;
try { history = validateDemandHistory(candidate, bundledDemandModel); } catch { /* A mismatched bundle must not display unrelated results. */ }
const columns: DataTableColumn[] = [
  {id:"targetDate",label:"NEM DAY (AEST)",width:16,align:"left"},
  {id:"probability",label:"PROBABILITY",width:15,align:"right"},
  {id:"observedPeak",label:"ACTUAL PEAK MW",width:18,align:"right"},
  {id:"event",label:">7,800 MW",width:12,align:"left"},
  {id:"outcome",label:"AT 50% ALERT",width:20,flexGrow:1,align:"left"},
];
const rowId = (row: DemandHistoryRow) => row.targetDate;
const rowDate = (row: DemandHistoryRow) => new Date(demandDayStart(row.targetDate));
const probabilityText = (value: number) => value < .01 ? "<1%" : value > .99 ? ">99%" : `${Math.round(value * 100)}%`;
const panels = [{id:"probability",label:"Probability %",height:1},{id:"demand",label:"Actual peak MW",height:1}];

export function DemandHistoryPane({width,height,focused}: Pick<PaneProps,"width"|"height"|"focused">) {
  useAppLanguage();
  const colors = useThemeColors();
  const [filter,setFilter] = usePluginPaneState<DemandHistoryFilter>("demand-history-filter","all");
  const [selectedId,setSelectedId] = usePluginPaneState<string|null>("demand-history-selected",null);
  const rows = useMemo(() => history ? demandHistoryRows(history,filter) : [],[filter]);
  const selectedIndex = Math.max(0,rows.findIndex(row=>row.targetDate===selectedId));
  const selection = useChartTableSelection({rows,getId:rowId,getDate:rowDate,selectedId:rows[selectedIndex]?.targetDate??null,onSelect:setSelectedId,focused});
  const series = useMemo(() => {
    const source = history?.rows ?? [];
    return [
      {...staticSeries(source.map(row=>scalarPoint(rowDate(row),row.probability*100)),{id:"backtest-probability",label:"Held-out probability %",color:colors.borderFocused,calendarSpaced:true}),panelId:"probability",unit:"%",unitGroup:"probability"},
      {...staticSeries(source.map(row=>scalarPoint(rowDate(row),row.observedPeak)),{id:"backtest-demand",label:"Actual daily peak MW",color:colors.warning,calendarSpaced:true}),panelId:"demand",unit:"MW",unitGroup:"demand"},
      {...staticSeries(source.map(row=>scalarPoint(rowDate(row),row.thresholdMw)),{id:"backtest-threshold",label:"7,800 MW threshold",color:colors.textDim,calendarSpaced:true}),panelId:"demand",unit:"MW",unitGroup:"demand"},
    ];
  },[colors.borderFocused,colors.warning,colors.textDim]);
  if(!history) return <PaneStatusBody empty subject="Model history" emptyTitle="Approved model history unavailable." />;
  return <DataTableView<DemandHistoryRow> focused={focused} rootWidth={width} rootHeight={height} columns={columns} items={rows} getItemKey={rowId} freezeFirstColumn sortColumnId="targetDate" sortDirection="asc"
    emptyStateTitle="No results for this filter." resetScrollKey={filter}
    selection={{kind:"index",selectedIndex:rows.length?selectedIndex:-1,onChange:index=>setSelectedId(rows[index]?.targetDate??null)}}
    renderCell={(row,column) => ({text:column.id==="targetDate" ? row.targetDate : column.id==="probability" ? probabilityText(row.probability) : column.id==="observedPeak" ? row.observedPeak.toLocaleString("en-AU",{maximumFractionDigits:0}) : column.id==="event" ? row.event ? "Yes" : "No" : demandHistoryOutcome(row),
      value:column.id==="probability" ? row.probability : column.id==="observedPeak" ? row.observedPeak : undefined,
      color:row.event && row.probability<.5 ? colors.negative : undefined})}
    rootBefore={<ChartTableHeader width={width} height={height} tableRows={rows.length} tableColumns={columns}
      query={<QueryBar width={width} filters={[{id:"history-outcome",label:"Held-out backtest",value:filter,defaultValue:"all",options:[{value:"all",label:"All days"},{value:"events",label:"Demand exceeded 7,800 MW"},{value:"misses",label:"Misses at 50%"},{value:"false-alarms",label:"False alarms at 50%"}],onChange:value=>setFilter(value as DemandHistoryFilter)}]} />}
      figures={[{label:"Test period",value:"1 Jan - 31 Oct 2026"},{label:"Test days / events",value:`${history.days} / ${history.events}`},{label:"Brier / baseline",value:`${history.brier.toFixed(4)} / ${history.baselineBrier.toFixed(4)}`} ]}
      chart={{series,panels,...selection,timeZone:"Australia/Brisbane",remoteKind:"vic-demand-held-out-history",formatValue:(value,entry)=>entry?.unit==="%"?`${value.toFixed(1)}%`:`${Math.round(value).toLocaleString("en-AU")} MW`}} />}
  />;
}
