import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {combineRegions} from '../src/world/Unified';
import {District} from '../src/world/district';
const map=combineRegions(['lower-verona','verona-plain'].map(id=>JSON.parse(readFileSync(`public/maps/${id}/manifest.json`,'utf8'))));
new District(map);
mkdirSync('public/maps/veronese',{recursive:true});writeFileSync('public/maps/veronese/manifest.json',JSON.stringify({...map,provenance:{source:'Existing OSM-derived lower-verona and verona-plain manifests; see data/README.md',licence:'ODbL-1.0',composition:'Unmodified source geometry joined at OSM node 1027266513; source tile files reused.'}})+'\n');
console.log({nodes:map.nodes.length,roads:map.roads.length,buildings:map.buildings.length,stops:map.taxi!.stops.length,tiles:map.streaming!.tiles.length});
