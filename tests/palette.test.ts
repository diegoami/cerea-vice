import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ground, paving, features, facades, shutters, facadeTrim, props, light, haze, cockpit } from '../src/world/palette';

const rgb=(c:number|string)=>{const n=typeof c==='number'?c:parseInt(c.slice(1),16);return [n>>16&255,n>>8&255,n&255];};
const luminance=(c:number|string)=>{const [r,g,b]=rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*b;};
/** WCAG 2 contrast ratio. */
const contrast=(a:number|string,b:number|string)=>{const [x,y]=[luminance(a),luminance(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
const hue=(c:number|string)=>{const [r,g,b]=rgb(c),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min||1;
 const h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return (h*60+360)%360;};
const signText='#f6f0d3',plateInk='#233e4a',plateFace='#eeeadd',plateBorder='#344b56';
// Board colours drawn by World.ts / HarborWorld.ts and baked into the outskirts tiles.
const boards=['#31594e','#774e3c','#943f37','#755e46','#163b3d','#315b59','#713f3b','#234b72','#6d5733','#546963'];

test('sign, plate and board text keeps strong contrast on its own background',()=>{
 for(const board of boards)assert.ok(contrast(signText,board)>=4.5,`${board}: ${contrast(signText,board).toFixed(2)}`);
 assert.ok(contrast(plateInk,plateFace)>=7);
 // Every board colour the code paints is listed above, so a new one cannot skip this check.
 const used=new Set([...readFileSync('src/world/World.ts','utf8'),...readFileSync('src/world/HarborWorld.ts','utf8')].join('').match(/"#[0-9a-f]{6}"/g)!.map(s=>s.slice(1,-1)));
 for(const colour of used)assert.ok(boards.includes(colour),`${colour} is not checked for sign legibility`);
});

test('façade-mounted names and plates stand out from every façade colour',()=>{
 for(const facade of facades){
  // 0.9's weakest pairing was 2.99 (board on the old rose façade); never go below it.
  assert.ok(contrast('#31594e',facade)>=2.99,`landmark board on ${facade.toString(16)}`);
  assert.ok(contrast(plateBorder,facade)>=3,`plate border on ${facade.toString(16)}`);
  assert.ok(contrast(facadeTrim.glass,facade)>=3,'windows stay readable as openings');
 }
 for(const [i,s] of shutters.entries())assert.ok(contrast(s,facades[i])>=2.5,`shutters on façade ${i}`);
});

test('neutral town surfaces no longer lean green, and the palette is not one uniform cast',()=>{
 // Grey-green neutrals multiplied by warm daylight produced the olive town (docs/COLOUR_AND_RESOLUTION.md).
 const neutrals={town:ground.town,...paving,ballast:features.ballast,bank:features.bank,rail:features.rail,
  post:props.post,platePole:props.platePole,carGlass:props.carGlass,window:facadeTrim.simpleWindow,...cockpit,bounce:light.bounce};
 for(const [name,colour] of Object.entries(neutrals)){const [r,g,b]=rgb(colour);assert.ok(g<=Math.max(r,b),`${name} leans green`);}
 for(const colour of facades){const [r,g]=rgb(colour);assert.ok(r>g,'façades are warm or neutral masonry');}
 // Variety: façade hues and lightness spread; vegetation remains recognisably green.
 const hues=facades.map(hue);assert.ok(Math.max(...hues)-Math.min(...hues)>=20,`façade hues ${hues.map(Math.round)}`);
 const light_=facades.map(luminance);assert.ok(Math.max(...light_)/Math.min(...light_)>=1.3);
 for(const green of [props.crown,ground.meadow,ground.crop]){const [r,g,b]=rgb(green);assert.ok(g>r&&g>b,'vegetation stays green');}
 // Midday haze is cool grey-blue rather than teal: blue exceeds green.
 const [,hg,hb]=rgb(haze.high);assert.ok(hb>hg);
});

test('roads, verges and stopping bays stay distinguishable under the new palette',()=>{
 assert.ok(contrast(paving.verge,paving.road)>=3);
 assert.ok(contrast(paving.dash,paving.road)>=4.5);
 assert.ok(contrast(paving.bayLine,paving.bay)>=3);
 assert.ok(contrast(paving.square,paving.road)>=1.8,'squares read as stone, not asphalt');
 assert.ok(contrast(paving.bay,paving.road)>=1.3,'bays are a different surface from the carriageway');
 assert.ok(contrast(ground.town,paving.road)>=2);
});
