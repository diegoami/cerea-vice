export type Stage='physics-step'|'nearest-road'|'route-search'|'render';
/** Opt-in, bounded CPU timings only. No position, route or destination data. */
export class Profiler {
 private stats=new Map<Stage,{count:number;total:number;max:number}>();
 constructor(readonly enabled=false){}
 start(){return this.enabled?performance.now():0;}
 end(stage:Stage,start:number){if(!this.enabled)return;const elapsed=performance.now()-start,entry=this.stats.get(stage)??{count:0,total:0,max:0};entry.count++;entry.total+=elapsed;entry.max=Math.max(entry.max,elapsed);this.stats.set(stage,entry);}
 measure<T>(stage:Stage,work:()=>T):T {if(!this.enabled)return work();const start=this.start();try{return work();}finally{this.end(stage,start);}}
 snapshot(){return Object.fromEntries((['physics-step','nearest-road','route-search','render'] as const).map(name=>{const value=this.stats.get(name);return [name,{count:value?.count??0,meanMs:value?value.total/value.count:0,maxMs:value?.max??0}];}));}
 text(){return Object.entries(this.snapshot()).map(([name,v])=>`${name}: ${v.meanMs.toFixed(3)} ms mean / ${v.maxMs.toFixed(3)} max (${v.count})`).join('\n');}
}
