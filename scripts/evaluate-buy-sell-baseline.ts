// Compare the same-weekday price baseline only on the frozen model’s called hours.
import {decideBuySell} from '../src/plugins/builtin/vic-power/buy-sell-model';
import {victorianCalendarAnnotation} from '../src/plugins/builtin/vic-power/victoria-calendar';
const groups=new Map<string,{price:number,demand:number,count:number}>();
if (Bun.argv.length !== 4) throw new Error('Usage: bun scripts/evaluate-buy-sell-baseline.ts october.csv november.csv');
for(const path of Bun.argv.slice(2)) {
 for(const line of (await Bun.file(path).text()).trim().split(/\r?\n/).slice(1)) {
 const [region,date,demand,price,type]=line.split(','); if(region!=='VIC1'||type!=='TRADE')continue;
 const stamp=date!.replaceAll('/','-').replace(' ','T'); const time=new Date(Math.floor((Date.parse(stamp+'Z')-300000)/3600000)*3600000).toISOString().slice(0,19);
 const g=groups.get(time)??{price:0,demand:0,count:0};g.price+=Number(price);g.demand+=Number(demand);g.count++;groups.set(time,g);
 }
}
const history=[...groups].filter(([,g])=>g.count===12).map(([time,g])=>({time,price:g.price/g.count,demand:g.demand/g.count})).sort((a,b)=>a.time.localeCompare(b.time));
const byTime=new Map(history.map(r=>[r.time,r]));let hours=0,calls=0,correct=0,baselineCorrect=0,ties=0;
for(let i=168;i<history.length;i++) {const actual=history[i]!;if(actual.time<'2026-11-01'||actual.time>='2026-11-16')continue;
const prior=history.slice(i-168,i);const d=decideBuySell(prior,actual.time,victorianCalendarAnnotation(actual.time.slice(0,10)));if(d.status!=='ready')continue;hours++;if(d.action==='HOLD')continue;
const entry=prior.at(-1)!.price;const move=actual.price-entry;const weekly=byTime.get(new Date(Date.parse(actual.time+'Z')-168*3600000).toISOString().slice(0,19))!;calls++; if((d.action==='BUY'?1:-1)*move>0)correct++;const baselineMove=weekly.price-entry;if(baselineMove*move>0)baselineCorrect++;if(baselineMove===0)ties++;
}
console.log(JSON.stringify({hours,calls,correct,baselineCorrect,ties,hitRate:correct/calls,baselineHitRate:baselineCorrect/calls},null,2));
