#!/usr/bin/env python3
"""Build a district from a town spec (towns/<id>.town.json) and its checked-in OSM extract.
No network is needed. Coordinates preserve local metre scale and north. See docs/TOWNS.md.

  python3 tools/import-town.py towns/cerea.town.json [--output path/to/district.json]
"""
import argparse, json, math, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PRESETS={'town'}  # 'sketch' and 'full' arrive with #24.

class SpecError(Exception):pass

def validate(spec):
    """Check a town spec before any work, naming the first problem."""
    def need(cond,message):
        if not cond:raise SpecError(message)
    need(isinstance(spec,dict),'the spec must be a JSON object')
    need(spec.get('specVersion')==1,'specVersion must be 1')
    for key in ['id','name','description','attribution','sourceUrl','output']:
        need(isinstance(spec.get(key),str) and spec[key],f'"{key}" must be a non-empty string')
    need(isinstance(spec.get('dataVersion'),int) and spec['dataVersion']>=1,'"dataVersion" must be a positive integer')
    need(spec.get('stoppingPolicy') in ('anywhere','marked-bays'),'"stoppingPolicy" must be "anywhere" or "marked-bays"')
    need(spec.get('preset') in ('sketch','town','full'),'"preset" must be "sketch", "town" or "full"')
    need(spec['preset'] in PRESETS,f'preset "{spec["preset"]}" is not implemented yet; use "town"')
    source=spec.get('source',{});need(isinstance(source.get('extract'),str) and isinstance(source.get('label'),str),'"source" needs "extract" and "label"')
    area=spec.get('area',{});origin=area.get('origin',{});bbox=area.get('bbox',{})
    need(all(isinstance(origin.get(k),(int,float)) for k in ('lat','lon')),'"area.origin" needs numeric "lat" and "lon"')
    need(all(isinstance(bbox.get(k),(int,float)) for k in ('south','west','north','east')),'"area.bbox" needs numeric south, west, north and east')
    need(bbox['south']<bbox['north'] and bbox['west']<bbox['east'],'"area.bbox" must have south < north and west < east')
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
    # Confirmed landmarks that are buildings or named sites (ways), and mapped points (nodes).
    landmark_specs={item['osmId']:(item['id'],item['name'],item['road'],item['kind'],item['height']) for item in spec['landmarks'] if not item.get('point')}
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
    missing=[item['id'] for item in spec['landmarks'] if not item.get('point') and not any(p['id']==item['id'] for p in landmarks)]
    if missing:raise RuntimeError('Confirmed landmarks not found in the extract or outside the area: '+', '.join(missing))

    # Mapped points (cinemas in Cerea) have a precise position rather than their own named
    # footprint. Associate each with the containing/nearest building, retaining the position.
    for item in [item for item in spec['landmarks'] if item.get('point')]:
        element=next((e for e in source['elements'] if e['id']==item['osmId']),None)
        if element is None:raise RuntimeError(f'Mapped point {item["osmId"]} for landmark {item["id"]} is not in the extract')
        location=point(element)
        candidates=[building for building in buildings if inside(location,building['points'])]
        chosen=min(candidates or buildings,key=lambda building:dist(building,location))
        if dist(chosen,location)>45:raise RuntimeError('No close building for '+item['kind']+' '+item['id'])
        landmarks.append({'id':item['id'],'name':item.get('name',element['tags']['name']),'road':item['road'],'kind':item['kind'],'height':chosen['height'],'osmId':chosen['osmId'],**{key:chosen[key] for key in ['x','z','width','depth','points']}})

    # Some confirmed POIs use their nearest mapped street as the game stopping
    # frontage. This is a practical pickup location, not a claim about a postal address.
    nearest={item['id'] for item in spec['landmarks'] if item.get('frontage')=='nearest'}
    for place in landmarks:
        if place['id'] in nearest:
            place['road']=min(roads,key=lambda road:dist(place,project(place,nodes[road['a']],nodes[road['b']])) )['name']

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
    bay_names={stop['landmark']:stop['bay'] for stop in spec['stops']}
    content=spec['content'];start,target=content['start'],content['mission']['target']
    bays=[];stop_data=[]
    for place in landmarks:
        if place['id'] not in bay_names:continue
        zone,road,node=bay_for(place['id'],bay_names[place['id']]);bays.append(zone)
        stop_data.append({'id':place['id'],'name':place['name'],'road':road['name'],'bayId':zone['id'],'nodeId':node,'description':'Stop in '+zone['name']+'.'})
        if place['id']==start:spawn_bay,spawn_road=zone,road
        if place['id']==target:target_node=node
    # Keep the starting bay first for legacy district tools.
    bays.sort(key=lambda zone:(zone['id']!=start,zone['id']))
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

    centre={'x':(bounds['minX']+bounds['maxX'])/2,'z':(bounds['minZ']+bounds['maxZ'])/2}
    areas=[{'name':item['name'],'x':item.get('x',centre['x']),'z':item.get('z',centre['z']),'width':bounds['maxX']-bounds['minX'],'depth':bounds['maxZ']-bounds['minZ']} for item in spec.get('areas',[])]
    mission=content['mission']
    district={'version':1,'id':spec['id'],'stoppingPolicy':spec['stoppingPolicy'],'name':spec['name'],'description':spec['description'],'attribution':spec['attribution'],'sourceUrl':spec['sourceUrl'],'bounds':bounds,'nodes':sorted(nodes.values(),key=lambda n:n['id']),'roads':roads,'parkingZones':bays,'taxi':taxi,'landmarks':landmarks,'buildings':buildings,'features':features,'areas':areas,'spawn':{'x':spawn_bay['x'],'z':spawn_bay['z'],'heading':math.atan2(b['x']-a['x'],-(b['z']-a['z'])),'name':spawn_bay['name']},'mission':{'name':mission['name'],'objective':mission['objective'],'hint':mission['hint'],'duration':mission['duration'],'bayId':target,'nodeId':target_node},'provenance':{'source':spec['source']['label'],'osmTimestamp':source['osm3s']['timestamp_osm_base'],'origin':{'lat':lat0,'lon':lon0},'bbox':{'south':south,'west':west,'north':north,'east':east},'omittedConflictingFootprints':omitted,'notes':spec.get('notes',[])}}
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(district,ensure_ascii=False,separators=(',',':'))+'\n')
    subprocess.run(['node',str(ROOT/'tools/prepare-town.mjs'),str(output)],check=True)
    prepared=json.loads(output.read_text())
    print(f'{spec["name"]}:',len(nodes),'road shape/junction nodes,',len(roads),'segments,',len({r['name'] for r in roads}),'streets,',len(prepared['buildings']),'prepared building masses')

def main(argv=None):
    parser=argparse.ArgumentParser(description='Build a district from a town spec.')
    parser.add_argument('spec',type=Path,help='towns/<id>.town.json')
    parser.add_argument('--output',type=Path,help='write the district here instead of the spec\'s "output"')
    args=parser.parse_args(argv)
    spec=json.loads(args.spec.read_text())
    try:validate(spec)
    except SpecError as error:raise SystemExit(f'{args.spec}: {error}')
    build(spec,(args.output or ROOT/spec['output']).resolve())

if __name__=='__main__':main()
