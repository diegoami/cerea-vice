#!/usr/bin/env python3
"""Cloud/local map authoring: scaffold, fetch, inspect candidates, build/validate/register."""
import argparse,datetime,hashlib,json,math,re,shutil,ssl,subprocess,time,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
UA='CereaViceMapBuilder/1.0 (https://github.com/diegoami/cerea-vice)'
def read(path):return json.loads(Path(path).read_text())
def write(path,data):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def scaffold(a):
 if not re.fullmatch(r'[a-z][a-z0-9-]*',a.id):raise SystemExit('Use a lowercase map id with hyphens')
 s,w,n,e=map(float,a.bbox.split(','))
 if not (-85<s<n<85 and -180<=w<e<=180):raise SystemExit('Invalid south,west,north,east bounds; split antimeridian areas')
 target=ROOT/'towns'/f'{a.id}.town.json'
 if target.exists():raise SystemExit('Spec already exists; edit it deliberately instead of overwriting')
 spec={'specVersion':1,'id':a.id,'name':a.name,'townName':a.name,'description':f'Real streets of {a.name}.','dataVersion':1,'subtitle':'REAL STREETS / DAY AND NIGHT','attribution':'© OpenStreetMap contributors · ODbL 1.0','sourceUrl':'https://www.openstreetmap.org/copyright','output':f'public/maps/{a.id}/manifest.json','delivery':'tiled','preset':'town','stoppingPolicy':'anywhere','drivingSide':a.driving_side,'signLanguage':'en','source':{'extract':f'data/sources/{a.id}-osm.json','label':'OpenStreetMap / Overpass API'},'area':{'origin':{'lat':(s+n)/2,'lon':(w+e)/2},'bbox':{'south':s,'west':w,'north':n,'east':e}},'landmarks':[],'stops':[],'features':{'waterWidth':3,'railWidth':3,'buildingRelations':True,'waterAreas':True,'pavedAreas':True,'unnamed':{'water':'Waterway','rail':'Railway','square':'Square'}},'areas':[{'name':a.name}], 'content':{'start':'','taxi':{'endless':True,'startHour':7,'endHour':17,'clockRate':30,'baseCents':400,'perKmCents':120,'maxBonusCents':600},'fares':[],'mission':{'name':f'{a.name} taxi driving','objective':'Serve passengers at any hour.','hint':'Stop and request fares.','duration':360,'target':''}},'notes':['Real OSM geometry. Heights, colours, stopping bays and scenery are game interpretations.']}
 write(target,spec);print(target.relative_to(ROOT));print('Fetch its extract, inspect candidates, and author at least three real landmark stops before building.')
def scaffold_region(a):
 if not re.fullmatch(r'[a-z][a-z0-9-]*',a.id):raise SystemExit('Invalid map id')
 if not 0<a.k<=1:raise SystemExit('Compression k must be in (0,1]')
 paths=a.towns.split(',');towns=[read(ROOT/p) for p in paths]
 if len(towns)<2:raise SystemExit('A region needs at least two authored town specs')
 if any(not t['content'].get('start') or t['content']['start'] not in {s['landmark'] for s in t['stops']} for t in towns):raise SystemExit('Author town landmark stops before scaffolding the region')
 origin={'lat':sum(t['area']['origin']['lat'] for t in towns)/len(towns),'lon':sum(t['area']['origin']['lon'] for t in towns)/len(towns)}
 zone=min(60,max(1,int((origin['lon']+180)//6)+1));south=origin['lat']<0
 frame=f'regions/{a.id}.frame.json';target=ROOT/'regions'/f'{a.id}.region.json'
 if target.exists() or (ROOT/frame).exists():raise SystemExit('Region/frame already exists')
 write(ROOT/frame,{'specVersion':1,'id':a.id,'name':a.name+' frame','projection':f'UTM zone {zone}{"S" if south else "N"} (EPSG:{327 if south else 326}{zone:02d})','origin':origin,'k':a.k,'northAligned':True})
 stops=[t['id']+':'+t['content']['start'] for t in towns]
 spec={'specVersion':1,'id':a.id,'name':a.name,'description':'Real towns and their real connecting roads.','dataVersion':1,'subtitle':'REAL TOWNS / DAY AND NIGHT','attribution':'© OpenStreetMap contributors · ODbL 1.0','sourceUrl':'https://www.openstreetmap.org/copyright','output':f'public/maps/{a.id}/manifest.json','frame':frame,'zoneMargin':200,'towns':[{'spec':p} for p in paths],'corridors':{'extract':f'data/sources/{a.id}-main-roads.json','pairs':[[towns[i]['id'],towns[i+1]['id']] for i in range(len(towns)-1)]},'drivingSide':a.driving_side,'signLanguage':'en','unnamedRoadName':'Unnamed road','content':{'start':stops[0],'taxi':{'endless':True,'mixedTownFares':True,'interTownPremiumCents':1200,'startHour':7,'endHour':17,'clockRate':30,'baseCents':400,'perKmCents':120,'maxBonusCents':600},'fares':[[name,stops[i%len(stops)],stops[(i+1)%len(stops)]] for i,name in enumerate(['Alex','Sam','Morgan','Charlie','Taylor','Jamie'])],'mission':{'name':a.name+' taxi service','objective':'Take passengers between real towns.','hint':'Stop and request fares.','duration':360,'target':stops[-1]}}}
 write(target,spec);print(target.relative_to(ROOT))
def fetch(a):
 spec=read(a.spec)
 if 'towns' in spec:
  boxes=[read(ROOT/t['spec'])['area']['bbox'] for t in spec['towns']];b={k:(min(x[k] for x in boxes)-.02 if k in ['south','west'] else max(x[k] for x in boxes)+.02) for k in ['south','west','north','east']};extract=spec['corridors']['extract']
 else:b=spec['area']['bbox'];extract=spec['source']['extract']
 bbox=','.join(str(b[k]) for k in ['south','west','north','east'])
 target=ROOT/extract
 if not target.resolve().is_relative_to(ROOT/'data/sources'):raise SystemExit('Extract must live in data/sources')
 if target.exists() and not a.force:raise SystemExit('Extract already exists; use the checked-in snapshot or --force to refresh deliberately')
 query=f'[out:json][timeout:90];(way[highway]({bbox});way[building]({bbox});relation[building]({bbox});way[waterway]({bbox});way[railway=rail]({bbox});nwr[natural=water]({bbox});nwr[place=square]({bbox});nwr[amenity]({bbox});nwr[tourism]({bbox});nwr[historic]({bbox}););out geom;'
 if 'towns' in spec:query=f'[out:json][timeout:90];way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified)(_link)?$"]({bbox});out geom;'
 url=urllib.parse.urlsplit(a.endpoint)
 if url.scheme!='https' or url.username or url.password:raise SystemExit('Use a public HTTPS Overpass endpoint without credentials')
 body=urllib.parse.urlencode({'data':query}).encode();error=None
 for attempt in range(3):
  try:
   request=urllib.request.Request(a.endpoint,data=body,headers={'User-Agent':UA,'Content-Type':'application/x-www-form-urlencoded'})
   with urllib.request.urlopen(request,timeout=120,context=ssl.create_default_context()) as response:raw=response.read(64*1024*1024+1)
   if len(raw)>64*1024*1024:raise ValueError('Extract exceeds 64 MiB; split the area')
   data=json.loads(raw)
   if not isinstance(data.get('elements'),list) or data.get('remark'):raise ValueError(data.get('remark','Invalid Overpass output'))
   target.parent.mkdir(parents=True,exist_ok=True);pending=target.with_suffix('.pending');pending.write_bytes(raw);pending.replace(target)
   target.with_suffix('.overpassql').write_text(query+'\n')
   write(target.with_suffix('.provenance.json'),{'endpoint':a.endpoint,'bbox':b,'fetchedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'osmTimestamp':data.get('osm3s',{}).get('timestamp_osm_base'),'sha256':hashlib.sha256(raw).hexdigest(),'licence':'ODbL-1.0','source':'OpenStreetMap contributors'})
   print(f'{target.relative_to(ROOT)}: {len(data["elements"])} OSM elements');return
  except Exception as exc:error=exc;time.sleep(2**attempt)
 raise SystemExit(f'Extract download failed; existing data kept: {error}')
def candidates(a):
 spec=read(a.spec);source=read(ROOT/spec['source']['extract']);result=[]
 for e in source['elements']:
  tags=e.get('tags',{})
  if not tags.get('name') or not any(k in tags for k in ['amenity','tourism','historic']):continue
  result.append({'osmId':e['id'],'type':e['type'],'name':tags['name'],'kind':tags.get('amenity') or tags.get('tourism') or tags.get('historic'),'street':tags.get('addr:street'),'lat':e.get('lat'),'lon':e.get('lon')})
 print(json.dumps(result,ensure_ascii=False,indent=2))
def build(a):
 spec_path=Path(a.spec).resolve();spec=read(spec_path);id=spec['id']
 if not re.fullmatch(r'[a-z][a-z0-9-]*',id):raise SystemExit('Invalid map id')
 target=(ROOT/spec['output']).resolve()
 if not target.is_relative_to(ROOT/'public/maps'/id):raise SystemExit('Workflow output must be public/maps/<id>/manifest.json')
 stage=ROOT/'build/maps'/id;stage.mkdir(parents=True,exist_ok=True);manifest=stage/'manifest.json'
 if 'towns' in spec:
  raw=stage/'region.json';subprocess.run(['python3','tools/build-region.py',str(spec_path),'--output',str(raw)],cwd=ROOT,check=True)
  subprocess.run(['node','--import','tsx','tools/tile-district.mjs',str(raw),str(stage),str(raw.with_suffix('.tiling.json'))],cwd=ROOT,check=True)
 else:subprocess.run(['python3','tools/import-town.py',str(spec_path),'--output',str(manifest)],cwd=ROOT,check=True)
 subprocess.run(['node','--import','tsx','tools/validate-map.ts',str(manifest)],cwd=ROOT,check=True)
 target.parent.mkdir(parents=True,exist_ok=True)
 if (target.parent/'tiles').exists():shutil.rmtree(target.parent/'tiles')
 if read(manifest).get('streaming'):shutil.copytree(stage/'tiles',target.parent/'tiles')
 shutil.copyfile(manifest,target)
 if 'towns' not in spec:
  digest=hashlib.sha256()
  for file in [spec_path,ROOT/spec['source']['extract'],ROOT/'tools/import-town.py',ROOT/'tools/prepare-town.mjs']:digest.update(file.read_bytes())
  stamp=ROOT/'build/towns'/f'{id}.inputs.sha256';stamp.parent.mkdir(parents=True,exist_ok=True);stamp.write_text(digest.hexdigest()+'\n')
 registry_path=ROOT/'public/maps/towns.json';registry=read(registry_path)
 entry={'id':id,'name':spec['name'],'map':target.relative_to(ROOT/'public/maps').as_posix(),'dataVersion':spec['dataVersion'],'attribution':spec['attribution'],'frame':'regional' if 'towns' in spec else 'local','taxi':True,'provenance':True,'spec':spec_path.relative_to(ROOT).as_posix(),'hidden':a.hidden}
 old=next((t for t in registry['towns'] if t['id']==id),None)
 if old:old.update(entry)
 else:registry['towns'].append(entry)
 if a.default:registry['default']=id
 write(registry_path,registry);print(f'{id} validated and registered as selectable. Review save signatures before updating an already-shipped map. Commit source/spec/map/registry and provenance through a PR; this command does not commit or publish.')
def main():
 p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest='command',required=True)
 s=sub.add_parser('scaffold');s.add_argument('id');s.add_argument('--name',required=True);s.add_argument('--bbox',required=True);s.add_argument('--driving-side',choices=['left','right'],default='right');s.set_defaults(run=scaffold)
 s=sub.add_parser('scaffold-region');s.add_argument('id');s.add_argument('--name',required=True);s.add_argument('--towns',required=True,help='Comma-separated town spec paths');s.add_argument('--k',type=float,default=.6);s.add_argument('--driving-side',choices=['left','right'],default='right');s.set_defaults(run=scaffold_region)
 s=sub.add_parser('fetch');s.add_argument('spec');s.add_argument('--endpoint',default='https://overpass-api.de/api/interpreter');s.add_argument('--force',action='store_true');s.set_defaults(run=fetch)
 s=sub.add_parser('candidates');s.add_argument('spec');s.set_defaults(run=candidates)
 s=sub.add_parser('build');s.add_argument('spec');s.add_argument('--default',action='store_true');s.add_argument('--hidden',action='store_true',help='Build a component map without showing it in the chooser');s.set_defaults(run=build)
 a=p.parse_args();a.run(a)
if __name__=='__main__':main()
