#!/usr/bin/env python3
"""Convert the checked-in OSM extract into the small, offline Cerea Centro district.
No network is needed to rebuild. Coordinates preserve local metre scale and north.
"""
import json, math, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=json.loads((ROOT/'data/sources/cerea-osm.json').read_text())
lat0,lon0=45.1943,11.2112
west,south,east,north=11.207,45.1908,11.2155,45.1978

def point(geo):
    return {'x':round((geo['lon']-lon0)*111320*math.cos(math.radians(lat0)),2),'z':round(-(geo['lat']-lat0)*111320,2)}
bounds={'minX':point({'lat':north,'lon':west})['x'],'maxX':point({'lat':south,'lon':east})['x'],'minZ':point({'lat':north,'lon':west})['z'],'maxZ':point({'lat':south,'lon':east})['z']}
def within(p):return bounds['minX']+3<=p['x']<=bounds['maxX']-3 and bounds['minZ']+3<=p['z']<=bounds['maxZ']-3
def rect(points):
    xs=[p['x'] for p in points];zs=[p['z'] for p in points]
    return {'x':round((min(xs)+max(xs))/2,2),'z':round((min(zs)+max(zs))/2,2),'width':round(max(xs)-min(xs),2),'depth':round(max(zs)-min(zs),2)}
def inside(p,poly):
    result=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a['z']>p['z'])!=(b['z']>p['z']) and p['x']<(b['x']-a['x'])*(p['z']-a['z'])/(b['z']-a['z'])+a['x']:result=not result
    return result
nodes={};roads=[]
for element in source['elements']:
    tags=element.get('tags',{});geo=element.get('geometry',[])
    if not tags.get('highway') or tags.get('access') in ('private','no'):continue
    if tags.get('highway')=='service' and not tags.get('name'):continue
    if not tags.get('name'):continue
    ids=element.get('nodes',[])
    # Keep original shape points and shared OSM node IDs: crossroads remain connected;
    # roads passing over/under one another do not acquire invented intersections.
    for i,(a,b) in enumerate(zip(geo,geo[1:])):
        pa,pb=point(a),point(b)
        if not within(pa) or not within(pb):continue
        if math.dist((pa['x'],pa['z']),(pb['x'],pb['z']))<0.1:continue
        aid,bid=str(ids[i]),str(ids[i+1])
        nodes[aid]={'id':aid,**pa,'label':tags['name']};nodes[bid]={'id':bid,**pb,'label':tags['name']}
        if tags.get('oneway')=='-1':aid,bid=bid,aid
        width=float(tags.get('width','8').split(';')[0]) if tags.get('width','8').replace('.','',1).isdigit() else 8
        width=max(6,min(10,width))
        roads.append({'a':aid,'b':bid,'name':tags['name'],'width':width,'roadClass':tags['highway'],'oneWay':tags.get('oneway') in ('yes','1','-1') or tags.get('junction')=='roundabout','bridge':tags.get('bridge')=='yes','osmId':element['id']})
# Keep one coherent connected road network; discard severed pieces outside the selected boundary.
adjacency={id:set() for id in nodes}
for r in roads:adjacency[r['a']].add(r['b']);adjacency[r['b']].add(r['a'])
components=[];remaining=set(nodes)
while remaining:
    seed=min(remaining);seen={seed};stack=[seed]
    while stack:
        for nxt in adjacency[stack.pop()]:
            if nxt not in seen:seen.add(nxt);stack.append(nxt)
    remaining-=seen;components.append(seen)
keep=max(components,key=len);nodes={id:n for id,n in nodes.items() if id in keep};roads=[r for r in roads if r['a'] in keep and r['b'] in keep]
for id,node in nodes.items():
    names=sorted({r['name'] for r in roads if id in (r['a'],r['b'])})
    node['label']=' / '.join(names) if len(names)>1 else names[0]

def project(p,a,b):
    dx,dz=b['x']-a['x'],b['z']-a['z'];t=max(0,min(1,((p['x']-a['x'])*dx+(p['z']-a['z'])*dz)/(dx*dx+dz*dz)))
    return {'x':a['x']+dx*t,'z':a['z']+dz*t}
def dist(a,b):return math.hypot(a['x']-b['x'],a['z']-b['z'])

buildings=[];landmarks=[]
landmark_specs={125815115:('library','Biblioteca di Cerea','Viale della Vittoria','library',9),208200123:('church','San Zeno in Santa Maria Assunta','Via Cordioli','church',22),208200127:('municipio','Municipio di Cerea','Via Venticinque Aprile','civic',13),327164664:('school','Scuola Olga Visentini','Via Canonica','school',9)}
for e in source['elements']:
    tags=e.get('tags',{});geo=e.get('geometry',[])
    if not tags.get('building') or len(geo)<4:continue
    pts=[point(p) for p in geo[:-1]]
    if not all(within(p) for p in pts):continue
    footprint=rect(pts)
    if footprint['width']<2 or footprint['depth']<2:continue
    height=7+(e['id']%4)*1.2
    try:height=float(tags.get('height',str(float(tags.get('building:levels','2'))*3.3)).replace(' m',''))
    except ValueError:pass
    if e['id'] in landmark_specs:
        id,name,road,kind,h=landmark_specs[e['id']]
        landmarks.append({'id':id,'name':name,'road':road,'kind':kind,'height':h,'osmId':e['id'],**footprint,'points':pts})
        height=h
    buildings.append({**footprint,'points':pts,'height':min(30,max(3,height)),'color':[0xb9a287,0xc7b08c,0xb8a58f,0xc2bda6,0xb79a83][e['id']%5],'osmId':e['id']})

# Some named POIs describe grounds rather than the building. Use a building on those
# grounds for the landmark mass; do not turn the entire school/library site into a block.
for e in source['elements']:
    if e['id'] not in landmark_specs or any(p['id']==landmark_specs[e['id']][0] for p in landmarks):continue
    poly=[point(p) for p in e.get('geometry',[])[:-1]]
    candidates=[b for b in buildings if inside(b,poly)]
    if not candidates:raise RuntimeError('Missing building on named site '+str(e['id']))
    chosen=max(candidates,key=lambda b:b['width']*b['depth'])
    id,name,road,kind,height=landmark_specs[e['id']]
    chosen['height']=height
    landmarks.append({'id':id,'name':name,'road':road,'kind':kind,'height':height,'osmId':chosen['osmId'],**{k:chosen[k] for k in ['x','z','width','depth','points']}})

# Building/road clearance is applied by the polygon preparation step after export.
omitted=[]

def bay_for(landmark_id,name):
    place=next(p for p in landmarks if p['id']==landmark_id)
    candidates=[]
    for r in roads:
        if r['name']!=place['road']:continue
        a,b=nodes[r['a']],nodes[r['b']];q=project(place,a,b);length=dist(a,b)
        nx,nz=-(b['z']-a['z'])/length,(b['x']-a['x'])/length
        for offset in [9,12,16,-9,-12,-16,0]:
            p={'x':round(q['x']+nx*offset,2),'z':round(q['z']+nz*offset,2)}
            for size in [14,10,6]:
                samples=[{'x':p['x']+dx,'z':p['z']+dz} for dx in [-size/2,0,size/2] for dz in [-size/2,0,size/2]]
                if not within(p) or any(inside(sample,building['points']) for building in buildings for sample in samples):continue
                candidates.append((dist(p,place)+abs(offset)*0.1+(14-size),p,r,size))
    if not candidates:raise RuntimeError('No accessible stopping bay for '+landmark_id)
    _,p,r,size=min(candidates,key=lambda item:item[0]);node=min((r['a'],r['b']),key=lambda id:dist(nodes[id],p))
    return {'id':landmark_id,'name':name,**p,'width':size,'depth':size},r,node
spawn_bay,spawn_road,_=bay_for('municipio','Sosta Municipio')
library_bay,_,target_node=bay_for('library','Sosta Biblioteca')
church_bay,_,_=bay_for('church','Sosta San Zeno')
school_bay,_,_=bay_for('school','Sosta Olga Visentini')
a,b=nodes[spawn_road['a']],nodes[spawn_road['b']]
if not spawn_road['oneWay'] and b['z']>a['z']:a,b=b,a
features=[]
for e in source['elements']:
    t=e.get('tags',{});geo=e.get('geometry',[])
    if not (t.get('waterway') or t.get('railway')=='rail') or t.get('tunnel') in ('yes','culvert'):continue
    # Clip line segments to the chosen district, including crossings whose endpoints lie outside it.
    runs=[];run=[]
    for ga,gb in zip(geo,geo[1:]):
        pa,pb=point(ga),point(gb);dx,dz=pb['x']-pa['x'],pb['z']-pa['z'];low,high=0,1
        for pp,qq in [(-dx,pa['x']-bounds['minX']),(dx,bounds['maxX']-pa['x']),(-dz,pa['z']-bounds['minZ']),(dz,bounds['maxZ']-pa['z'])]:
            if pp==0:
                if qq<0:low,high=1,0;break
            elif pp<0:low=max(low,qq/pp)
            else:high=min(high,qq/pp)
        if low<=high:
            aa={'x':round(pa['x']+dx*low,2),'z':round(pa['z']+dz*low,2)};bb={'x':round(pa['x']+dx*high,2),'z':round(pa['z']+dz*high,2)}
            if run and dist(run[-1],aa)>0.1:runs.append(run);run=[]
            if not run:run.append(aa)
            run.append(bb)
        elif run:runs.append(run);run=[]
    if run:runs.append(run)
    for run in runs:
        if len(run)>1:features.append({'name':t.get('name','Ferrovia' if t.get('railway') else 'Canale'),'kind':'rail' if t.get('railway') else 'water','width':3 if t.get('railway') else 7 if t.get('name')=='Menago' else 3,'points':run})

district={'version':1,'id':'cerea','stoppingPolicy':'anywhere','name':'Cerea Centro','description':'Modern Cerea: Via Paride, Piazza Fratelli Sommariva, San Zeno and Viale della Vittoria. Real street connections and building footprints; simplified scenery and game stopping bays.','attribution':'© OpenStreetMap contributors · ODbL 1.0','sourceUrl':'https://www.openstreetmap.org/copyright','bounds':bounds,'nodes':sorted(nodes.values(),key=lambda n:n['id']),'roads':roads,'parkingZones':[spawn_bay,library_bay,church_bay,school_bay],'landmarks':landmarks,'buildings':buildings,'features':features,'areas':[{'name':'Centro di Cerea','x':(bounds['minX']+bounds['maxX'])/2,'z':0,'width':bounds['maxX']-bounds['minX'],'depth':bounds['maxZ']-bounds['minZ']}],'spawn':{'x':spawn_bay['x'],'z':spawn_bay['z'],'heading':math.atan2(b['x']-a['x'],-(b['z']-a['z'])),'name':spawn_bay['name']},'mission':{'name':'Biblioteca di Cerea','objective':'Reach Biblioteca di Cerea on Viale della Vittoria and stop in Sosta Biblioteca.','hint':'Start beside the Municipio on Via Venticinque Aprile. Find the Biblioteca on Viale della Vittoria, north of here. Use the street signs and the atlas; stop anywhere to ask for information.','duration':360,'bayId':'library','nodeId':target_node},'provenance':{'source':'OpenStreetMap / Overpass API','osmTimestamp':source['osm3s']['timestamp_osm_base'],'origin':{'lat':lat0,'lon':lon0},'bbox':{'south':south,'west':west,'north':north,'east':east},'omittedConflictingFootprints':omitted,'notes':['Modern road geometry at local metre scale; no claim of historical reconstruction.','Designated stopping bays are gameplay placements, not verified real parking permissions.','Building footprints are sourced; heights, materials and landmark silhouettes are simplified.','One-way tags are used for directions; road-rule enforcement and traffic are not simulated.']}}
(ROOT/'public/maps/cerea.json').write_text(json.dumps(district,ensure_ascii=False,separators=(',',':'))+'\n')
subprocess.run(['node', str(ROOT/'tools/prepare-cerea.mjs')], check=True)
prepared=json.loads((ROOT/'public/maps/cerea.json').read_text())
print('Cerea:',len(nodes),'road shape/junction nodes,',len(roads),'segments,',len({r['name'] for r in roads}),'streets,',len(prepared['buildings']),'prepared building masses')
