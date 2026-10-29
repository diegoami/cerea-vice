#!/usr/bin/env python3
"""Build a district from a town spec (towns/<id>.town.json) and its checked-in OSM extract.
No network is needed. Coordinates preserve local metre scale and north. See docs/TOWNS.md.

  python3 tools/import-town.py towns/cerea.town.json [--output path/to/district.json]
"""
import argparse, json, math, os, subprocess, tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PRESETS={'sketch','town','full'}
# Building detail per preset (#24). Every preset keeps every named street; presets change buildings,
# scenery and plates only. 'town' is the reference (Cerea's map); 'sketch' also merges touching
# footprints into blocks (prepare-town.mjs) and shows fewer plates and no props at runtime.
SKETCH_MIN_AREA=40    # m²: sheds, garages and kiosks are left out of a sketch
SKETCH_TOLERANCE=1.0  # m: outline simplification in a sketch

class SpecError(Exception):pass

def validate(spec):
    """Check a town spec before any work, naming the first problem."""
    def need(cond,message):
        if not cond:raise SpecError(message)
    need(isinstance(spec,dict),'the spec must be a JSON object')
    need(spec.get('specVersion')==1,'specVersion must be 1')
    for key in ['id','name','description','attribution','sourceUrl','output']:
        need(isinstance(spec.get(key),str) and spec[key],f'"{key}" must be a non-empty string')
    need(spec.get('subtitle') is None or (isinstance(spec['subtitle'],str) and 0<len(spec['subtitle'])<=60 and '<' not in spec['subtitle'] and '>' not in spec['subtitle']),'"subtitle" must be plain text of at most 60 characters')
    need(isinstance(spec.get('dataVersion'),int) and spec['dataVersion']>=1,'"dataVersion" must be a positive integer')
    need(spec.get('stoppingPolicy') in ('anywhere','marked-bays'),'"stoppingPolicy" must be "anywhere" or "marked-bays"')
    need(spec.get('preset') in ('sketch','town','full'),'"preset" must be "sketch", "town" or "full"')
    source=spec.get('source',{});need(isinstance(source.get('extract'),str) and isinstance(source.get('label'),str),'"source" needs "extract" and "label"')
    area=spec.get('area',{});origin=area.get('origin',{});bbox=area.get('bbox',{})
    need(all(isinstance(origin.get(k),(int,float)) for k in ('lat','lon')),'"area.origin" needs numeric "lat" and "lon"')
    need(all(isinstance(bbox.get(k),(int,float)) for k in ('south','west','north','east')),'"area.bbox" needs numeric south, west, north and east')
    need(bbox['south']<bbox['north'] and bbox['west']<bbox['east'],'"area.bbox" must have south < north and west < east')
    need(spec.get('kind','town') in ('town','village'),'"kind" must be "town" or "village"')
    need(spec.get('delivery','single') in ('single','tiled'),'"delivery" must be "single" or "tiled"')
    need(spec.get('delivery','single')=='single' or spec['output'].endswith('/manifest.json'),'a tiled town\'s "output" is its <folder>/manifest.json')
    if spec.get('kind')=='village':
        # A village on a region's corridors: real streets and buildings, no stops or shift of its own.
        need(not spec.get('landmarks') and not spec.get('stops') and not spec.get('content'),'a village has no landmarks, stops or content')
        return
    landmarks=spec.get('landmarks');need(isinstance(landmarks,list) and landmarks,'"landmarks" must be a confirmed, non-empty list')
    ids=set()
    for item in landmarks:
        need(isinstance(item.get('osmId'),int) and isinstance(item.get('id'),str) and isinstance(item.get('road'),str) and isinstance(item.get('kind'),str),f'landmark {item} needs "osmId", "id", "road" and "kind"')
        need(item['id'] not in ids,f'landmark id "{item["id"]}" is repeated');ids.add(item['id'])
        need(item.get('point') or (isinstance(item.get('name'),str) and isinstance(item.get('height'),(int,float))),f'landmark "{item["id"]}" needs "name" and "height" unless it is a mapped point')
        need(item.get('frontage','mapped') in ('mapped','nearest'),f'landmark "{item["id"]}" has an unknown "frontage"')
    stops=spec.get('stops');need(isinstance(stops,list) and stops,'"stops" must be a confirmed, non-empty list')
    stop_ids=set()
    for stop in stops:
        need(stop.get('landmark') in ids,f'stop {stop} names no confirmed landmark');need(isinstance(stop.get('bay'),str),f'stop "{stop.get("landmark")}" needs a "bay" name')
        stop_ids.add(stop['landmark'])
    content=spec.get('content',{})
    need(content.get('start') in stop_ids,'"content.start" must be a stop');need(content.get('mission',{}).get('target') in stop_ids,'"content.mission.target" must be a stop')
    taxi=content.get('taxi',{})
    need(all(isinstance(taxi.get(k),(int,float)) for k in ('startHour','endHour','clockRate','baseCents','perKmCents','maxBonusCents')),'"content.taxi" is missing a number')
    for fare in content.get('fares',[]):
        need(isinstance(fare,list) and len(fare)==3 and fare[1] in stop_ids and fare[2] in stop_ids and fare[1]!=fare[2],f'fare {fare} must be [passenger, pickup stop, different destination stop]')
    mission=content['mission']
    need(all(isinstance(mission.get(k),str) for k in ('name','objective','hint')) and isinstance(mission.get('duration'),(int,float)),'"content.mission" needs name, objective, hint and duration')

def build(spec,output):
    village=spec.get('kind')=='village'
    source=json.loads((ROOT/spec['source']['extract']).read_text())
    lat0,lon0=spec['area']['origin']['lat'],spec['area']['origin']['lon']
    box=spec['area']['bbox'];west,south,east,north=box['west'],box['south'],box['east'],box['north']

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
    def join(parts):
        # Chain member ways into closed rings (multipolygon relations).
        rings=[];parts=[list(p) for p in parts if len(p)>1]
        while parts:
            ring=parts.pop(0)
            while ring[0]!=ring[-1]:
                nxt=next((i for i,p in enumerate(parts) if p[0]==ring[-1] or p[-1]==ring[-1]),None)
                if nxt is None:break
                part=parts.pop(nxt);ring+=(part if part[0]==ring[-1] else part[::-1])[1:]
            if ring[0]==ring[-1] and len(ring)>=4:rings.append(ring)
        return rings
    key=lambda g:(g['lat'],g['lon'])
    def polygons(e):
        # (outer, inners) rings in lat/lon for a closed way or a multipolygon relation.
        if e['type']=='way':return [(ring,[]) for ring in join([[key(g) for g in e.get('geometry',[])]])]
        if e['type']!='relation':return []
        inners=join([[key(g) for g in m.get('geometry',[])] for m in e.get('members',[]) if m.get('role')=='inner'])
        result=[]
        for outer in join([[key(g) for g in m.get('geometry',[])] for m in e.get('members',[]) if m.get('role')=='outer']):
            ring=[point({'lat':a,'lon':b}) for a,b in outer[:-1]]
            result.append((outer,[inner for inner in inners if inside(point({'lat':inner[0][0],'lon':inner[0][1]}),ring)]))
        return result
    features_on=spec.get('features',{})
    nodes={};roads=[]
    for element in source['elements']:
        tags=element.get('tags',{});geo=element.get('geometry',[])
        if not tags.get('highway') or tags.get('access') in ('private','no'):continue
        if tags.get('highway') in ('construction','proposed'):continue
        # With paved areas on, a square mapped as a highway area is ground to cross, not a road around its edge.
        if features_on.get('pavedAreas') and tags.get('area')=='yes':continue
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
    if not components:
        # A hamlet may hold no named road of its own: the corridor through it moves with its zone anyway.
        if not village:raise SystemExit(f'{spec["id"]}: no named road inside its area')
        components=[set()]
    keep=max(components,key=len);nodes={id:n for id,n in nodes.items() if id in keep};roads=[r for r in roads if r['a'] in keep and r['b'] in keep]
    for id,node in nodes.items():
        names=sorted({r['name'] for r in roads if id in (r['a'],r['b'])})
        node['label']=' / '.join(names) if len(names)>1 else names[0]

    def project(p,a,b):
        dx,dz=b['x']-a['x'],b['z']-a['z'];t=max(0,min(1,((p['x']-a['x'])*dx+(p['z']-a['z'])*dz)/(dx*dx+dz*dz)))
        return {'x':a['x']+dx*t,'z':a['z']+dz*t}
    def dist(a,b):return math.hypot(a['x']-b['x'],a['z']-b['z'])

    preset=spec['preset']
    def ring_area(pts):
        return abs(sum(a['x']*b['z']-b['x']*a['z'] for a,b in zip(pts,pts[1:]+pts[:1])))/2
    def simplify(pts,tolerance):
        # Douglas-Peucker on a closed ring, split at the vertex farthest from the first one.
        def line(run):
            if len(run)<3:return run
            far,index=0,0
            for i in range(1,len(run)-1):
                d=dist(run[i],project(run[i],run[0],run[-1]))
                if d>far:far,index=d,i
            return line(run[:index+1])[:-1]+line(run[index:]) if far>tolerance else [run[0],run[-1]]
        split=max(range(len(pts)),key=lambda i:dist(pts[0],pts[i]))
        if split==0:return pts
        result=line(pts[:split+1])[:-1]+line(pts[split:]+[pts[0]])[:-1]
        return result if len(result)>=3 and ring_area(result)>0 else pts
    buildings=[];landmarks=[]
    # Confirmed landmarks that are buildings or named sites (ways), and mapped points (nodes).
    landmark_specs={item['osmId']:(item['id'],item['name'],item['road'],item['kind'],item['height']) for item in spec.get('landmarks',[]) if not item.get('point')}
    def add_building(e,tags,pts,holes=()):
        if not all(within(p) for p in pts):return
        if preset=='sketch' and e['id'] not in landmark_specs:
            if ring_area(pts)<SKETCH_MIN_AREA:return
            if not holes:pts=simplify(pts,SKETCH_TOLERANCE)
        footprint=rect(pts)
        if footprint['width']<(1 if preset=='full' else 2) or footprint['depth']<(1 if preset=='full' else 2):return
        height=7+(e['id']%4)*1.2
        try:height=float(tags.get('height',str(float(tags.get('building:levels','2'))*3.3)).replace(' m',''))
        except ValueError:pass
        if e['id'] in landmark_specs:
            if any(place['osmId']==e['id'] for place in landmarks):return
            id,name,road,kind,h=landmark_specs[e['id']]
            landmarks.append({'id':id,'name':name,'road':road,'kind':kind,'height':h,'osmId':e['id'],**footprint,'points':pts})
            # A confirmed landmark keeps its height (Torre dei Lamberti is 84 m); other buildings are capped at 30 m.
            height=h
        buildings.append({**footprint,'points':pts,**({'holes':[list(h) for h in holes]} if holes else {}),'height':height if e['id'] in landmark_specs else min(30,max(3,height)),'color':[0xb9a287,0xc7b08c,0xb8a58f,0xc2bda6,0xb79a83][e['id']%5],'osmId':e['id']})
    for e in source['elements']:
        tags=e.get('tags',{});geo=e.get('geometry',[])
        if not tags.get('building') or len(geo)<4 or e['type']!='way':continue
        add_building(e,tags,[point(p) for p in geo[:-1]])
    if features_on.get('buildingRelations'):
        # Multipolygon buildings (#25): each outer ring with its courtyards as holes, largest first so a
        # landmark takes its main mass. An outer member already tagged as a building is not doubled.
        tagged={e['id'] for e in source['elements'] if e['type']=='way' and e.get('tags',{}).get('building')}
        for e in source['elements']:
            tags=e.get('tags',{})
            if e['type']!='relation' or not tags.get('building'):continue
            if any(m.get('type')=='way' and m.get('ref') in tagged and m.get('role')=='outer' for m in e.get('members',[])):continue
            rings=[([point({'lat':a,'lon':b}) for a,b in outer[:-1]],[[point({'lat':a,'lon':b}) for a,b in inner[:-1]] for inner in inners]) for outer,inners in polygons(e)]
            for pts,holes in sorted(rings,key=lambda r:-ring_area(r[0])):add_building(e,tags,pts,holes)

    # Some named POIs describe grounds rather than the building. Use a building on those
    # grounds for the landmark mass; do not turn the entire school/library site into a block.
    for e in source['elements']:
        if e['id'] not in landmark_specs or any(p['id']==landmark_specs[e['id']][0] for p in landmarks):continue
        poly=[point(p) for p in e.get('geometry',[])[:-1]]
        candidates=[b for b in buildings if inside(b,poly)]
        id,name,road,kind,height=landmark_specs[e['id']]
        if not candidates:
            # A mapped site with no building inside is usually the building itself without a building tag.
            if len(poly)<3 or not all(within(p) for p in poly):raise RuntimeError('Missing building on named site '+str(e['id']))
            candidates=[{**rect(poly),'points':poly,'height':height,'color':[0xb9a287,0xc7b08c,0xb8a58f,0xc2bda6,0xb79a83][e['id']%5],'osmId':e['id']}]
            buildings.append(candidates[0])
        chosen=max(candidates,key=lambda b:b['width']*b['depth'])
        chosen['height']=height
        landmarks.append({'id':id,'name':name,'road':road,'kind':kind,'height':height,'osmId':chosen['osmId'],**{k:chosen[k] for k in ['x','z','width','depth','points']}})
    missing=[item['id'] for item in spec.get('landmarks',[]) if not item.get('point') and not any(p['id']==item['id'] for p in landmarks)]
    if missing:raise RuntimeError('Confirmed landmarks not found in the extract or outside the area: '+', '.join(missing))

    # Mapped points (cinemas in Cerea) have a precise position rather than their own named
    # footprint. Associate each with the containing/nearest building, retaining the position.
    for item in [item for item in spec.get('landmarks',[]) if item.get('point')]:
        element=next((e for e in source['elements'] if e['id']==item['osmId']),None)
        if element is None:raise RuntimeError(f'Mapped point {item["osmId"]} for landmark {item["id"]} is not in the extract')
        # A mapped way as a point (a gate the street runs through, which clearance removes) uses its centre.
        geo=element.get('geometry') or []
        location=point(element) if element['type']=='node' else {'x':round(sum(point(g)['x'] for g in geo[:-1])/max(1,len(geo)-1),2),'z':round(sum(point(g)['z'] for g in geo[:-1])/max(1,len(geo)-1),2)}
        others=[building for building in buildings if building['osmId']!=item['osmId']]
        candidates=[building for building in others if inside(location,building['points'])]
        chosen=min(candidates or others,key=lambda building:dist(building,location))
        if dist(chosen,location)>45:raise RuntimeError('No close building for '+item['kind']+' '+item['id'])
        landmarks.append({'id':item['id'],'name':item.get('name',element['tags']['name']),'road':item['road'],'kind':item['kind'],'height':chosen['height'],'osmId':chosen['osmId'],**{key:chosen[key] for key in ['x','z','width','depth','points']}})

    # Some confirmed POIs use their nearest mapped street as the game stopping
    # frontage. This is a practical pickup location, not a claim about a postal address.
    nearest={item['id'] for item in spec.get('landmarks',[]) if item.get('frontage')=='nearest'}
    for place in landmarks:
        if place['id'] in nearest:
            place['road']=min(roads,key=lambda road:dist(place,project(place,nodes[road['a']],nodes[road['b']])) )['name']

    # Building/road clearance is applied by the polygon preparation step after export.
    omitted=[]

    def edge_distance(p,poly):
        return min(dist(p,project(p,a,b)) for a,b in zip(poly,poly[1:]+poly[:1]))
    def approach_clear(q,p,road,size):
        # The car (a point with a 1.05 m margin) must get from the street into the bay, not only find the
        # bay empty (#73). Try straight approaches from the street beside the bay, up to 20 m either side,
        # checked outside what clearance will cut away anyway: the road plus its 1.6 m verge, and the bay
        # plus 0.5 m. Footprints are still untrimmed here, so this errs strict.
        a,b=nodes[road['a']],nodes[road['b']];length=dist(a,b);half=road['width']/2+1.6
        near=[x for x in buildings if abs(x['x']-p['x'])<x['width']/2+60 and abs(x['z']-p['z'])<x['depth']/2+60]
        def clear(start):
            steps=max(1,math.ceil(dist(start,p)/.5))
            for i in range(steps+1):
                s={'x':start['x']+(p['x']-start['x'])*i/steps,'z':start['z']+(p['z']-start['z'])*i/steps}
                if dist(s,project(s,a,b))<=half or (abs(s['x']-p['x'])<=size/2+.5 and abs(s['z']-p['z'])<=size/2+.5):continue
                if any(inside(s,x['points']) or edge_distance(s,x['points'])<=1.05 for x in near):return False
            return True
        for shift in [0,5,-5,10,-10,15,-15,20,-20]:
            start={'x':q['x']+(b['x']-a['x'])/length*shift,'z':q['z']+(b['z']-a['z'])/length*shift}
            if dist(project(start,a,b),start)<.01 and clear(start):return True
        return False
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
                    # Only buildings whose box reaches the bay can hold a sample (same answer, much faster).
                    close=[building for building in buildings if abs(building['x']-p['x'])<=building['width']/2+size and abs(building['z']-p['z'])<=building['depth']/2+size]
                    if not within(p) or any(inside(sample,building['points']) for building in close for sample in samples):continue
                    if not approach_clear(q,p,r,size):continue
                    candidates.append((dist(p,place)+abs(offset)*0.1+(14-size),p,r,size))
        if not candidates:raise RuntimeError('No accessible stopping bay for '+landmark_id)
        _,p,r,size=min(candidates,key=lambda item:item[0]);node=min((r['a'],r['b']),key=lambda id:dist(nodes[id],p))
        return {'id':landmark_id,'name':name,**p,'width':size,'depth':size},r,node
    bay_names={stop['landmark']:stop['bay'] for stop in spec.get('stops',[])}
    content=spec.get('content',{});start,target=(None,None) if village else (content['start'],content['mission']['target'])
    bays=[];stop_data=[]
    unplaced=[]
    for place in landmarks:
        if place['id'] not in bay_names:continue
        try:zone,road,node=bay_for(place['id'],bay_names[place['id']])
        except RuntimeError:unplaced.append(f"{place['id']} (on {place['road']})");continue
        bays.append(zone)
        stop_data.append({'id':place['id'],'name':place['name'],'road':road['name'],'bayId':zone['id'],'nodeId':node,'description':'Stop in '+zone['name']+'.'})
        if place['id']==start:spawn_bay,spawn_road=zone,road
        if place['id']==target:target_node=node
    if unplaced:raise RuntimeError('No accessible stopping bay for '+', '.join(unplaced)+'; name a wider street as the landmark\'s "road"')
    # Keep the starting bay first for legacy district tools.
    bays.sort(key=lambda zone:(zone['id']!=start,zone['id']))
    if not village:
     t=content['taxi']
     taxi={'startHour':t['startHour'],'endHour':t['endHour'],'clockRate':t['clockRate'],'baseCents':t['baseCents'],'perKmCents':t['perKmCents'],'maxBonusCents':t['maxBonusCents'],'stops':stop_data,'fares':[{'passenger':name,'pickupId':pickup,'destinationId':dropoff} for name,pickup,dropoff in content['fares']]}
     a,b=nodes[spawn_road['a']],nodes[spawn_road['b']]
     if not spawn_road['oneWay'] and b['z']>a['z']:a,b=b,a
    feature_spec=spec.get('features',{});widths=feature_spec.get('waterWidths',{});unnamed=feature_spec.get('unnamed',{'water':'Canale','rail':'Ferrovia'})
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
            if len(run)>1:features.append({'name':t.get('name',unnamed['rail'] if t.get('railway') else unnamed['water']),'kind':'rail' if t.get('railway') else 'water','width':feature_spec.get('railWidth',3) if t.get('railway') else widths.get(t.get('name'),feature_spec.get('waterWidth',3)),'points':run})

    # Rivers and lakes as areas, when the spec asks for them (Cerea does not, so its map is unchanged).
    # Closed ways are rings; multipolygon relations are joined from their member ways. Clipping to the
    # bounds and the collision shape (water minus road corridors) are done by prepare-town.mjs.
    water_areas=[]
    if feature_spec.get('waterAreas'):
        unnamed_area=unnamed.get('waterArea','Acqua')
        for e in source['elements']:
            t=e.get('tags',{})
            if not (t.get('natural')=='water' or t.get('waterway')=='riverbank'):continue
            for outer,inners in polygons(e):
                ring=[point({'lat':a,'lon':b}) for a,b in outer[:-1]]
                holes=[[point({'lat':a,'lon':b}) for a,b in inner[:-1]] for inner in inners]
                water_areas.append({'name':t.get('name',unnamed_area),'points':ring,**({'holes':holes} if holes else {})})
    # Squares as paved open ground (#25), when the spec asks: place=square outlines and highway areas.
    # They are not roads: no routing, no plates; buildings are drawn over them; clipped by prepare-town.mjs.
    paved_areas=[]
    if feature_spec.get('pavedAreas'):
        for e in source['elements']:
            t=e.get('tags',{})
            if not (t.get('place')=='square' or (t.get('highway') and t.get('area')=='yes')):continue
            for outer,inners in polygons(e):
                ring=[point({'lat':a,'lon':b}) for a,b in outer[:-1]]
                holes=[[point({'lat':a,'lon':b}) for a,b in inner[:-1]] for inner in inners]
                paved_areas.append({'name':t.get('name',unnamed.get('square','Piazza')),'points':ring,**({'holes':holes} if holes else {})})

    centre={'x':(bounds['minX']+bounds['maxX'])/2,'z':(bounds['minZ']+bounds['maxZ'])/2}
    areas=[{'name':item['name'],'x':item.get('x',centre['x']),'z':item.get('z',centre['z']),'width':bounds['maxX']-bounds['minX'],'depth':bounds['maxZ']-bounds['minZ']} for item in spec.get('areas',[])]
    if village:
        district={'version':1,'kind':'village','id':spec['id'],'dataVersion':spec['dataVersion'],**({} if preset=='town' else {'preset':preset}),'name':spec['name'],'description':spec['description'],'attribution':spec['attribution'],'sourceUrl':spec['sourceUrl'],'bounds':bounds,'nodes':sorted(nodes.values(),key=lambda n:n['id']),'roads':roads,'parkingZones':[],'landmarks':[],'buildings':buildings,'features':features,**({'waterAreas':water_areas} if water_areas else {}),**({'pavedAreas':paved_areas} if paved_areas else {}),'areas':areas,'provenance':{'source':spec['source']['label'],'osmTimestamp':source['osm3s']['timestamp_osm_base'],'origin':{'lat':lat0,'lon':lon0},'bbox':{'south':south,'west':west,'north':north,'east':east},'omittedConflictingFootprints':omitted,'notes':spec.get('notes',[])}}
    mission=content.get('mission',{})
    if not village:
     district={'version':1,'id':spec['id'],'dataVersion':spec['dataVersion'],**({} if preset=='town' else {'preset':preset}),**({'subtitle':spec['subtitle']} if spec.get('subtitle') else {}),'stoppingPolicy':spec['stoppingPolicy'],'name':spec['name'],'description':spec['description'],'attribution':spec['attribution'],'sourceUrl':spec['sourceUrl'],'bounds':bounds,'nodes':sorted(nodes.values(),key=lambda n:n['id']),'roads':roads,'parkingZones':bays,'taxi':taxi,'landmarks':landmarks,'buildings':buildings,'features':features,**({'waterAreas':water_areas} if water_areas else {}),**({'pavedAreas':paved_areas} if paved_areas else {}),'areas':areas,'spawn':{'x':spawn_bay['x'],'z':spawn_bay['z'],'heading':math.atan2(b['x']-a['x'],-(b['z']-a['z'])),'name':spawn_bay['name']},'mission':{'name':mission['name'],'objective':mission['objective'],'hint':mission['hint'],'duration':mission['duration'],'bayId':target,'nodeId':target_node},'provenance':{'source':spec['source']['label'],'osmTimestamp':source['osm3s']['timestamp_osm_base'],'origin':{'lat':lat0,'lon':lon0},'bbox':{'south':south,'west':west,'north':north,'east':east},'omittedConflictingFootprints':omitted,'notes':spec.get('notes',[])}}
    output.parent.mkdir(parents=True,exist_ok=True)
    # Prepare a temporary file and rename it into place, so a reader (the game, a test, a region build)
    # never sees a district that has been written but not yet prepared.
    pending=output.with_name(f'.{output.name}.{os.getpid()}.tmp')
    try:
        pending.write_text(json.dumps(district,ensure_ascii=False,separators=(',',':'))+'\n')
        subprocess.run(['node',str(ROOT/'tools/prepare-town.mjs'),str(pending)],check=True)
        prepared=json.loads(pending.read_text())
        os.replace(pending,output)
    finally:
        pending.unlink(missing_ok=True)
    print(f'{spec["name"]}:',len(nodes),'road shape/junction nodes,',len(roads),'segments,',len({r['name'] for r in roads}),'streets,',len(prepared['buildings']),'prepared building masses')

REGISTRY=ROOT/'public/maps/towns.json'
def update_registry(spec,spec_path,output):
    """Record a spec-built town in public/maps/towns.json, keeping other entries and extra fields such as views."""
    registry=json.loads(REGISTRY.read_text())
    entry={'id':spec['id'],'name':spec['name'],'map':output.relative_to(REGISTRY.parent).as_posix(),'dataVersion':spec['dataVersion'],'attribution':spec['attribution'],'frame':'local','taxi':True,'provenance':True,'spec':spec_path.resolve().relative_to(ROOT).as_posix()}
    existing=next((town for town in registry['towns'] if town['id']==spec['id']),None)
    if existing is None:registry['towns'].append(entry)
    else:existing.update(entry)
    REGISTRY.write_text(json.dumps(registry,ensure_ascii=False,indent=2)+'\n')

def main(argv=None):
    parser=argparse.ArgumentParser(description='Build a district from a town spec.')
    parser.add_argument('spec',type=Path,help='towns/<id>.town.json')
    parser.add_argument('--output',type=Path,help='write the district here instead of the spec\'s "output" (for a tiled town: <folder>/manifest.json)')
    parser.add_argument('--check',action='store_true',help='validate the spec and its extract path only')
    args=parser.parse_args(argv)
    spec=json.loads(args.spec.read_text())
    try:validate(spec)
    except SpecError as error:raise SystemExit(f'{args.spec}: {error}')
    if args.check:
        if not (ROOT/spec['source']['extract']).is_file():raise SystemExit(f'{args.spec}: extract {spec["source"]["extract"]} is missing')
        print(f'{args.spec}: valid');return
    output=(args.output or ROOT/spec['output']).resolve()
    if spec.get('delivery')=='tiled' and output.name!='manifest.json':
        # A tiled town fills a folder (manifest.json and tiles/); refuse a file name before any work (#81).
        raise SystemExit(f'{args.spec}: a tiled town is written as <folder>/manifest.json; got --output {args.output}')
    if spec.get('delivery')=='tiled':
        # Over the single-file budget (npm run town:check): build the district, then tile it into the
        # output's folder (manifest and 250 m tiles), as a region is.
        with tempfile.TemporaryDirectory() as scratch:
            district=Path(scratch)/f"{spec['id']}.json"
            build(spec,district)
            subprocess.run(['node','--import','tsx',str(ROOT/'tools/tile-district.mjs'),str(district),str(output.parent)],check=True,cwd=ROOT)
    else:build(spec,output)
    # Only a town's own map under public/maps/ is registered; builds written elsewhere (tests, spikes) are not.
    if args.output is None and output.is_relative_to(REGISTRY.parent):update_registry(spec,args.spec,output)
    elif args.output is None:print(f'Not registered: {output} is outside {REGISTRY.parent}')

if __name__=='__main__':main()
