// Node metadata-only sizing; not a ten-town rendering or connected-world benchmark.
import fs from 'node:fs';import {performance} from 'node:perf_hooks';
import {District} from '../src/world/district.ts';
if(!globalThis.gc)throw new Error('Run node --expose-gc --import tsx tools/profile-tile-model.mjs');
const text=fs.readFileSync('public/maps/cerea-outskirts/manifest.json','utf8');let begin=performance.now();const data=JSON.parse(text),decodeMs=performance.now()-begin;
globalThis.gc();const base=process.memoryUsage().heapUsed,contexts=[];
const build=()=>{const start=performance.now(),ctx=new District(structuredClone(data));ctx.graph.search(ctx.district.taxi.stops[0].nodeId,'test-square');contexts.push(ctx);return performance.now()-start;};
const firstContextMs=build();globalThis.gc();const one=process.memoryUsage().heapUsed-base;
const additional=[];for(let i=1;i<10;i++)additional.push(build());globalThis.gc();
const result={manifestBytes:Buffer.byteLength(text),tileFiles:data.streaming.tiles.length,tilePayloadBytes:data.streaming.tiles.reduce((s,t)=>s+t.bytes,0),jsonDecodeMs:decodeMs,firstContextMs,oneContextHeapBytes:one,tenIndependentContextsHeapBytes:process.memoryUsage().heapUsed-base,additionalContextMeanMs:additional.reduce((a,b)=>a+b,0)/additional.length,note:'Retained independent logical-context copies with routing used once; no rendered meshes, GPU memory, streaming textures, inter-town combined graph or actual ten-town content.'};
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/C-model-memory.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
