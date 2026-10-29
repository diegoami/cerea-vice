#!/usr/bin/env python3
"""Join town districts into one region: real-scale towns, real main roads between them, shortened.

  python3 tools/build-region.py regions/lower-verona.region.json [--output build/regions/x.json]

Design: docs/TOWNS.md ("Regions and compression"), measured in docs/REGION_SPIKE.md.
- Every town keeps its own streets unchanged and moves rigidly to k x its position in the regional frame
  (UTM zone 32N, false origin at the region centre, turned by the grid convergence there).
- The corridor roads between towns are the shortest real main-road paths between the towns' own road
  networks, joined through shared OSM node ids. Each chain of corridor road between two fixed points
  (town nodes, or junctions outside towns) is mapped by one similarity transform, so its shape is kept.
- The build fails if towns overlap, if mapping creates a road crossing, or if a town-to-town bearing
  moves by more than 1 degree.
Writes the merged district (unstreamed) plus a sidecar with town zones and direction boards for
tools/tile-district.mjs, which produces the streamed manifest and tiles.
"""
import argparse, hashlib, heapq, itertools, json, math, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

# --- Projection: WGS84 transverse Mercator, UTM zone 32N ---------------------------------------
A,F=6378137.0,1/298.257223563;E2=F*(2-F);EP2=E2/(1-E2);K0=0.9996;LON0=math.radians(9.0)
def utm(lat,lon):
    p,l=math.radians(lat),math.radians(lon);n=A/math.sqrt(1-E2*math.sin(p)**2);t=math.tan(p)**2;c=EP2*math.cos(p)**2;a=(l-LON0)*math.cos(p)
    m=A*((1-E2/4-3*E2**2/64-5*E2**3/256)*p-(3*E2/8+3*E2**2/32+45*E2**3/1024)*math.sin(2*p)+(15*E2**2/256+45*E2**3/1024)*math.sin(4*p)-(35*E2**3/3072)*math.sin(6*p))
    x=K0*n*(a+(1-t+c)*a**3/6+(5-18*t+t*t+72*c-58*EP2)*a**5/120)+500000
    y=K0*(m+n*math.tan(p)*(a*a/2+(5-t+9*c+4*c*c)*a**4/24+(61-58*t+t*t+600*c-330*EP2)*a**6/720))
    return x,y
def convergence(lat,lon):return math.atan(math.tan(math.radians(lon)-LON0)*math.sin(math.radians(lat)))

REGION_KEYS={'specVersion','id','name','description','dataVersion','subtitle','attribution','sourceUrl','output','k','zoneMargin','villages','villageMargin','towns','corridors','content','views'}
def check_spec(region):
    """Reject unknown or missing settings, so a value the builder ignores cannot look meaningful."""
    unknown=set(region)-REGION_KEYS
    if unknown:raise SystemExit(f'Unknown region settings: {", ".join(sorted(unknown))}')
    for key in ('id','name','k','zoneMargin','towns','corridors','content','output'):
        if key not in region:raise SystemExit(f'Region spec is missing "{key}"')
    if not isinstance(region['zoneMargin'],(int,float)) or region['zoneMargin']<0:raise SystemExit('"zoneMargin" must be a non-negative number of metres')
    if 'villages' in region and not isinstance(region.get('villageMargin'),(int,float)):raise SystemExit('"villageMargin" is required with "villages"')
    for entry in region['towns']+region.get('villages',[]):
        if set(entry)!={'spec'}:raise SystemExit(f'A town entry takes only "spec"; got {sorted(entry)} (zones are each town\'s area plus "zoneMargin")')

def town_inputs(spec_path,spec):
    """Hash of everything a town build depends on: its spec, its extract and the import tools."""
    digest=hashlib.sha256()
    for path in (spec_path,ROOT/spec['source']['extract'],ROOT/'tools/import-town.py',ROOT/'tools/prepare-town.mjs'):digest.update(path.read_bytes())
    return digest.hexdigest()

def ensure_town(spec_path):
    """Build a town unless its output exists and was built from the same inputs."""
    spec=json.loads(spec_path.read_text());output=ROOT/spec['output'];stamp=ROOT/'build/towns'/f'{spec["id"]}.inputs.sha256'
    wanted=town_inputs(spec_path,spec)
    if output.is_file() and stamp.is_file() and stamp.read_text().strip()==wanted:
        print(f'{spec["id"]}: up to date');return spec
    print(f'{spec["id"]}: building ({"inputs changed" if output.is_file() else "no output yet"})')
    subprocess.run([sys.executable,str(ROOT/'tools/import-town.py'),str(spec_path)],check=True)
    stamp.parent.mkdir(parents=True,exist_ok=True);stamp.write_text(wanted+'\n')
    return spec

def main(argv=None):
    parser=argparse.ArgumentParser(description='Build a region from its town districts.')
    parser.add_argument('spec',type=Path);parser.add_argument('--output',type=Path,help='merged district, before tiling (default build/regions/<id>.json)')
    parser.add_argument('--towns-only',action='store_true',help='bring the town builds up to date, then stop')
    args=parser.parse_args(argv)
    region=json.loads(args.spec.read_text());check_spec(region);k=region['k'];zone_margin=region['zoneMargin']
    if not (0<k<=1):raise SystemExit('k must be in (0, 1]')
    towns=[];villages=[]
    for entry in region['towns']:
        spec=ensure_town((ROOT/entry['spec']).resolve())
        towns.append({'spec':spec,'data':json.loads((ROOT/spec['output']).read_text()),'margin':zone_margin})
    # Villages on the corridors: real streets at real scale, placed rigidly like towns, with no stops.
    for entry in region.get('villages',[]):
        spec=ensure_town((ROOT/entry['spec']).resolve())
        if spec.get('kind')!='village':raise SystemExit(f'{entry["spec"]} is listed as a village but is not "kind": "village"')
        villages.append({'spec':spec,'data':json.loads((ROOT/spec['output']).read_text()),'margin':region['villageMargin']})
    if args.towns_only:return
    places=towns+villages
    ids=[t['spec']['id'] for t in towns]
    # Regional frame: false origin and rotation at the centre of the town origins.
    origins=[(t['spec']['area']['origin']['lat'],t['spec']['area']['origin']['lon']) for t in towns]
    clat,clon=sum(o[0] for o in origins)/len(origins),sum(o[1] for o in origins)/len(origins)
    E0,N0=utm(clat,clon);gamma=convergence(clat,clon);cg,sg=math.cos(gamma),math.sin(gamma)
    def frame(lat,lon):
        e,n=utm(lat,lon);de,dn=e-E0,n-N0
        # Grid north is turned by gamma from true north; turn back so negative z is true north.
        x=de*cg-dn*sg;y=de*sg+dn*cg
        return (x,-y)
    for t in places:
        o=t['spec']['area']['origin'];rx,rz=frame(o['lat'],o['lon']);t['real']=(rx,rz);t['offset']=(k*rx,k*rz)
        b=t['data']['bounds'];ox,oz=t['offset'];t['box']=(b['minX']+ox,b['maxX']+ox,b['minZ']+oz,b['maxZ']+oz)
        t['nodes']={n['id']:n for n in t['data']['nodes']}
    # A town's zone is its map's area plus zoneMargin: everything in it moves rigidly with the town.
    for a,b in itertools.combinations(places,2):
        A_,B_=[(x['box'][0]-x['margin'],x['box'][1]+x['margin'],x['box'][2]-x['margin'],x['box'][3]+x['margin']) for x in (a,b)]
        if A_[0]<B_[1] and B_[0]<A_[1] and A_[2]<B_[3] and B_[2]<A_[3]:raise SystemExit(f'Zones overlap after compression: {a["spec"]["id"]} and {b["spec"]["id"]}; raise k or lower the margin')
    owner={}
    for t in places:
        for nid in t['nodes']:
            if nid in owner:raise SystemExit(f'OSM node {nid} is in two towns ({owner[nid]} and {t["spec"]["id"]})')
            owner[nid]=t['spec']['id']
    by_id={t['spec']['id']:t for t in places}
    def world_of_town_node(nid):
        t=by_id[owner[nid]];n=t['nodes'][nid];return (n['x']+t['offset'][0],n['z']+t['offset'][1])

    # --- Corridor graph from the main-road extract -------------------------------------------
    extract=json.loads((ROOT/region['corridors']['extract']).read_text())
    coord={};geo={};adj={};edge_way={};directed={}
    for w in extract['elements']:
        if w['type']!='way' or 'highway' not in w.get('tags',{}):continue
        tags=w['tags']
        if tags.get('access') in ('private','no'):continue
        for (a,ga),(b,gb) in zip(zip(w['nodes'],w['geometry']),zip(w['nodes'][1:],w['geometry'][1:])):
            a,b=str(a),str(b);coord[a]=frame(ga['lat'],ga['lon']);coord[b]=frame(gb['lat'],gb['lon']);geo[a]=ga;geo[b]=gb
            d=math.dist(coord[a],coord[b])
            if d<0.1:continue
            adj.setdefault(a,[]).append((b,d));adj.setdefault(b,[]).append((a,d))
            edge_way[(a,b)]=(tags,w['id'],1);edge_way[(b,a)]=(tags,w['id'],-1)
            # Directed graph for corridor search: one-way roads and roundabouts only in their own direction.
            oneway=tags.get('oneway') in ('yes','1','-1') or tags.get('junction')=='roundabout'
            forward=(a,b) if tags.get('oneway')!='-1' else (b,a)
            directed.setdefault(forward[0],[]).append((forward[1],d))
            if not oneway:directed.setdefault(forward[1],[]).append((forward[0],d))
    def path(src_ids,dst_ids,graph_=None):
        graph_=graph_ or adj
        dist={s:0 for s in src_ids};prev={};q=[(0,s) for s in src_ids];heapq.heapify(q);dst=set(dst_ids)
        while q:
            d,u=heapq.heappop(q)
            if d>dist.get(u,1e18):continue
            if u in dst:
                out=[u]
                while out[-1] in prev:out.append(prev[out[-1]])
                return out[::-1],d
            for v,w in graph_.get(u,[]):
                if d+w<dist.get(v,1e18):dist[v]=d+w;prev[v]=u;heapq.heappush(q,(d+w,v))
        return None,None
    shared={tid:[n for n in by_id[tid]['nodes'] if n in adj] for tid in ids}
    edges=set();primary=set();real_km={}
    for a,b in region['corridors']['pairs']:
        for tid in (a,b):
            if not shared[tid]:raise SystemExit(f'{tid}: none of its road nodes is on the corridor road network')
        # The primary corridor is one route; the directed routes both ways add the other carriageway or
        # junction side wherever a one-way piece would otherwise make the corridor impassable one way.
        main_route,_=path(shared[a],shared[b])
        there,_=path(shared[a],shared[b],directed);back,_=path(shared[b],shared[a],directed)
        if main_route is None or there is None or back is None:raise SystemExit(f'No corridor road in both directions between {a} and {b}')
        for u,v in zip(main_route,main_route[1:]):primary.add((u,v) if (u,v) in edge_way else (v,u))
        # Real distance between the town centres along real roads, for the direction boards.
        ca=min(shared[a],key=lambda n:math.dist(coord[n],by_id[a]['real']));cb=min(shared[b],key=lambda n:math.dist(coord[n],by_id[b]['real']))
        _,centre=path([ca],[cb]);real_km[(a,b)]=real_km[(b,a)]=centre/1000
        for p in (there,back):
            for u,v in zip(p,p[1:]):edges.add((u,v) if (u,v) in edge_way else (v,u))
    # Drop edges that a town already has as one of its own roads.
    town_edges={(r['a'],r['b']) for t in places for r in t['data']['roads']}|{(r['b'],r['a']) for t in places for r in t['data']['roads']}
    edges={e for e in edges|primary if e not in town_edges};primary={e for e in primary if e not in town_edges}
    graph={}
    for u,v in primary:graph.setdefault(u,set()).add(v);graph.setdefault(v,set()).add(u)
    every={}
    for u,v in edges:every.setdefault(u,set()).add(v);every.setdefault(v,set()).add(u)
    # Everything inside a town's area moves rigidly with the town, including corridor nodes the town's own
    # map did not keep; junctions outside towns are small rigid zones at their contracted position.
    def town_local(t,n):
        # The town's own projection (as tools/import-town.py), so corridor nodes line up exactly with its streets.
        o=t['spec']['area']['origin'];g=geo[n]
        return (round((g['lon']-o['lon'])*111320*math.cos(math.radians(o['lat'])),2),round(-(g['lat']-o['lat'])*111320,2))
    margin=zone_margin
    def zone_town(n):
        # A town's zone is its area plus a margin, so roundabouts and junctions at its edge move with it.
        x,z=coord[n]
        for t in places:
            b=t['data']['bounds'];rx,rz=t['real'];m=t['margin']
            if b['minX']+rx-m<=x<=b['maxX']+rx+m and b['minZ']+rz-m<=z<=b['maxZ']+rz+m:return t
    fixed={}
    for n in sorted(graph):
        if n in owner:fixed[n]=world_of_town_node(n)
        elif (t:=zone_town(n)):x,z=town_local(t,n);fixed[n]=(x+t['offset'][0],z+t['offset'][1])
        elif len(graph[n])>2:fixed[n]=(k*coord[n][0],k*coord[n][1])
    def map_with(fixed):
        mapped=dict(fixed);seen=set();transform={}
        for start in sorted(fixed):
            for nxt in sorted(graph.get(start,())):
                if (start,nxt) in seen:continue
                chain=[start,nxt]
                while chain[-1] not in fixed:
                    options=sorted(m for m in graph[chain[-1]] if m!=chain[-2])
                    if not options:break
                    chain.append(options[0])
                for a,b in zip(chain,chain[1:]):seen.add((a,b));seen.add((b,a))
                if chain[-1] not in fixed:raise SystemExit(f'Corridor road ends outside any town at node {chain[-1]}')
                a0,b0=coord[chain[0]],coord[chain[-1]];a1,b1=fixed[chain[0]],fixed[chain[-1]]
                v0=complex(b0[0]-a0[0],b0[1]-a0[1]);v1=complex(b1[0]-a1[0],b1[1]-a1[1])
                s=v1/v0 if abs(v0)>1e-6 else 1
                for n in chain:transform.setdefault(n,(a0,a1,s))
                for n in chain[1:-1]:
                    z=s*complex(coord[n][0]-a0[0],coord[n][1]-a0[1]);mapped[n]=(a1[0]+z.real,a1[1]+z.imag)
        # Extra nodes from the return routes: inside a town zone they move with the town; elsewhere they take
        # the displacement of the nearest primary-corridor node, so a parallel carriageway stays parallel.
        # Each primary node carries the similarity of its chain, so a roundabout or carriageway beside it is
        # scaled and turned the same way rather than only shifted.
        anchors=[(coord[n],transform[n]) for n in sorted(graph) if n in transform and n not in owner and not zone_town(n)]
        for n in sorted(every):
            if n in mapped:continue
            if n in owner:mapped[n]=world_of_town_node(n);continue
            t=zone_town(n)
            if t:x,z=town_local(t,n);mapped[n]=(x+t['offset'][0],z+t['offset'][1]);continue
            _,(a0,a1,sim)=min(anchors,key=lambda a:math.dist(a[0],coord[n]))
            z=sim*complex(coord[n][0]-a0[0],coord[n][1]-a0[1]);mapped[n]=(a1[0]+z.real,a1[1]+z.imag)
        return mapped,transform
    # A chain mapped outside every zone can still swing into a town's or village's placed area. Fix any
    # corridor node that lands there (or whose road passes through it) rigidly with that place: it keeps its
    # real position relative to the place, where it does not meet the place's streets. Remap and repeat.
    placed_boxes=[(t,(t['box'][0]-10,t['box'][1]+10,t['box'][2]-10,t['box'][3]+10)) for t in places]
    def segment_in_box(p,q,box):
        x0,x1,z0,z1=box;low,high=0.0,1.0;dx,dz=q[0]-p[0],q[1]-p[1]
        for pp,qq in ((-dx,p[0]-x0),(dx,x1-p[0]),(-dz,p[1]-z0),(dz,z1-p[1])):
            if pp==0:
                if qq<0:return False
            else:
                r=qq/pp
                if pp<0:low=max(low,r)
                else:high=min(high,r)
                if low>high:return False
        return True
    absorbed={}
    # REGION_NO_ABSORB reproduces the 0.12.0-rc.1 mapping, to show the checks below catch what it got wrong.
    for _ in range(0 if __import__('os').environ.get('REGION_NO_ABSORB') else 20):
        mapped,transform=map_with({**fixed,**absorbed})
        intruding={}
        for u,v in edges:
            for t,box in placed_boxes:
                if not segment_in_box(mapped[u],mapped[v],box):continue
                for n in (u,v):
                    if n in owner or n in fixed or n in absorbed:continue
                    if zone_town(n) is t:continue
                    intruding[n]=t
        if not intruding:break
        for n,t in intruding.items():x,z=town_local(t,n);absorbed[n]=(x+t['offset'][0],z+t['offset'][1])
    else:
        if not __import__('os').environ.get('REGION_NO_ABSORB'):raise SystemExit('Corridor roads still enter a town or village area after 20 rounds')
        mapped,transform=map_with(fixed)
    if absorbed:print(f'{len(absorbed)} corridor nodes fixed with the town or village they would otherwise enter')
    graph=every
    # Checks: no new crossings, bearings kept.
    segs=sorted(edges)
    def cross(p1,p2,q1,q2):
        d=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
        return d(p1,p2,q1)*d(p1,p2,q2)<0 and d(q1,q2,p1)*d(q1,q2,p2)<0
    pos=lambda n:mapped[n]
    # Real geometry for the comparison, in the same terms as the mapping: town-local inside towns.
    def real(n):
        if n in owner:t=by_id[owner[n]];nd=t['nodes'][n];return (nd['x']+t['real'][0],nd['z']+t['real'][1])
        t=zone_town(n)
        if t:x,z=town_local(t,n);return (x+t['real'][0],z+t['real'][1])
        return coord[n]
    new_crossings=sum(1 for (a,b),(c,d) in itertools.combinations(segs,2) if len({a,b,c,d})==4 and cross(pos(a),pos(b),pos(c),pos(d)) and not cross(real(a),real(b),real(c),real(d)))
    if new_crossings:
        where=[(a,b,c,d) for (a,b),(c,d) in itertools.combinations(segs,2) if len({a,b,c,d})==4 and cross(pos(a),pos(b),pos(c),pos(d)) and not cross(real(a),real(b),real(c),real(d))]
        for a,b,c,d in where[:6]:
            near=min(towns,key=lambda t:math.dist(pos(a),t['offset']));wa,wb=edge_way[(a,b)],edge_way[(c,d)]
            print(f'  crossing near {near["spec"]["id"]} ({math.dist(pos(a),near["offset"]):.0f} m): way {wa[1]} "{wa[0].get("name") or wa[0].get("ref")}" ({wa[0].get("highway")},{wa[0].get("oneway","")},{wa[0].get("junction","")}) x way {wb[1]} "{wb[0].get("name") or wb[0].get("ref")}" ({wb[0].get("highway")},{wb[0].get("oneway","")},{wb[0].get("junction","")}); real gap {min(math.dist(real(a),real(c)),math.dist(real(a),real(d)),math.dist(real(b),real(c)),math.dist(real(b),real(d))):.0f} m',file=sys.stderr)
        if not __import__('os').environ.get('REGION_ALLOW_CROSSINGS'):raise SystemExit(f'Compression created {new_crossings} road crossings; raise k')
    # The complete merged network: a corridor road must not cross a town's or village's street where the
    # real roads do not cross, and the car must be able to drive every corridor centreline past buildings.
    def placed_node(t,nid):n=t['nodes'][nid];return (n['x']+t['offset'][0],n['z']+t['offset'][1])
    def real_node(t,nid):n=t['nodes'][nid];return (n['x']+t['real'][0],n['z']+t['real'][1])
    def cells(p,q,size):
        return [(i,j) for i in range(int(min(p[0],q[0])//size),int(max(p[0],q[0])//size)+1) for j in range(int(min(p[1],q[1])//size),int(max(p[1],q[1])//size)+1)]
    streets={}
    for t in places:
        for r in t['data']['roads']:
            pa,pb=placed_node(t,r['a']),placed_node(t,r['b'])
            for key in cells(pa,pb,100):streets.setdefault(key,[]).append((t,r['a'],r['b'],pa,pb,r['name']))
    street_crossings=set()
    for u,v in edges:
        p,q=mapped[u],mapped[v]
        for key in cells(p,q,100):
            for t,a,b,pa,pb,name in streets.get(key,[]):
                if len({u,v,a,b})<4 or not cross(p,q,pa,pb):continue
                if not cross(real(u),real(v),real_node(t,a),real_node(t,b)):street_crossings.add((t['spec']['id'],name,edge_way[(u,v)][0].get('name') or edge_way[(u,v)][0].get('ref'),u,v))
    if street_crossings:
        for c in sorted(street_crossings)[:6]:print(f'  corridor {c[2]} ({c[3]}-{c[4]}) crosses {c[1]} in {c[0]}',file=sys.stderr)
        raise SystemExit(f'Compression made corridor roads cross {len(street_crossings)} town or village streets they do not cross in reality')
    def inside(p,ring):
        result=False
        for (ax,az),(bx,bz) in zip(ring,ring[1:]+ring[:1]):
            if (az>p[1])!=(bz>p[1]) and p[0]<(bx-ax)*(p[1]-az)/(bz-az)+ax:result=not result
        return result
    def near_ring(p,ring,margin):
        for (ax,az),(bx,bz) in zip(ring,ring[1:]+ring[:1]):
            dx,dz=bx-ax,bz-az;l=dx*dx+dz*dz;t=0 if l==0 else max(0,min(1,((p[0]-ax)*dx+(p[1]-az)*dz)/l))
            if math.dist(p,(ax+dx*t,az+dz*t))<margin:return True
        return False
    footprints={}
    for t in places:
        for bld in t['data']['buildings']:
            ring=[(q['x']+t['offset'][0],q['z']+t['offset'][1]) for q in bld['points']]
            xs=[q[0] for q in ring];zs=[q[1] for q in ring]
            for key in cells((min(xs)-2,min(zs)-2),(max(xs)+2,max(zs)+2),50):footprints.setdefault(key,[]).append((t['spec']['id'],bld.get('osmId'),ring))
    blocked=set()
    for u,v in edges:
        p,q=mapped[u],mapped[v];steps=max(1,int(math.dist(p,q)))
        for i in range(steps+1):
            pt=(p[0]+(q[0]-p[0])*i/steps,p[1]+(q[1]-p[1])*i/steps)
            hit=next(((tid,osm) for tid,osm,ring in footprints.get((int(pt[0]//50),int(pt[1]//50)),[]) if inside(pt,ring) or near_ring(pt,ring,1.05)),None)
            if hit:blocked.add((hit[0],hit[1],edge_way[(u,v)][0].get('name') or edge_way[(u,v)][0].get('ref'),u,v));break
    if blocked:
        for c in sorted(blocked,key=str)[:6]:print(f'  corridor {c[2]} ({c[3]}-{c[4]}) runs into building {c[1]} in {c[0]}',file=sys.stderr)
        raise SystemExit(f'{len(blocked)} corridor road segments run into a town or village building')
    bearing=lambda p,q:math.degrees(math.atan2(q[0]-p[0],-(q[1]-p[1])))%360
    worst=max(abs((bearing(a['offset'],b['offset'])-bearing(a['real'],b['real'])+180)%360-180) for a,b in itertools.combinations(towns,2))
    if worst>1:raise SystemExit(f'A town-to-town bearing moved by {worst:.2f} degrees')

    # --- Merge ---------------------------------------------------------------------------------
    def shift(value,dx,dz):
        if isinstance(value,dict):
            out={k:shift(v,dx,dz) for k,v in value.items()}
            if isinstance(value.get('x'),(int,float)) and isinstance(value.get('z'),(int,float)):out['x']=round(value['x']+dx,2);out['z']=round(value['z']+dz,2)
            return out
        if isinstance(value,list):return [shift(v,dx,dz) for v in value]
        return value
    nodes=[];roads=[];bays=[];landmarks=[];buildings=[];features=[];water=[];areas=[];stops=[];zones=[];boards=[]
    for t in places:
        tid,name,d=t['spec']['id'],t['spec']['name'],t['data'];dx,dz=t['offset'];pref=lambda i:f'{tid}:{i}'
        named=lambda text:text if name.lower() in text.lower() else f'{text} ({name})'
        nodes+=shift(d['nodes'],dx,dz)
        roads+=[{**r,'region':'region'} for r in d['roads']]
        bays+=[{**shift(b,dx,dz),'id':pref(b['id']),'name':named(b['name'])} for b in d['parkingZones']]
        landmarks+=[{**shift(l,dx,dz),'id':pref(l['id'])} for l in d['landmarks']]
        buildings+=shift(d['buildings'],dx,dz);features+=shift(d['features'],dx,dz);water+=shift(d.get('waterAreas',[]),dx,dz)
        areas+=[{**shift(a,dx,dz)} for a in d['areas']]
        stops+=[{**s,'id':pref(s['id']),'bayId':pref(s['bayId']),'name':named(s['name']),'description':f'Stop in {named(next(b["name"] for b in d["parkingZones"] if b["id"]==s["bayId"]))}.'} for s in d.get('taxi',{}).get('stops',[])]
        b=t['box'];zones.append({'id':tid,'name':name,'minX':b[0],'maxX':b[1],'minZ':b[2],'maxZ':b[3]})
    for n in sorted(graph):
        if n in owner:continue
        x,z=mapped[n];names=sorted({(edge_way.get((n,m)) or edge_way.get((m,n)))[0].get('name') or (edge_way.get((n,m)) or edge_way.get((m,n)))[0].get('ref') or 'Strada provinciale' for m in graph[n]})
        nodes.append({'id':n,'x':round(x,2),'z':round(z,2),'label':' / '.join(names)})
    for u,v in sorted(edges):
        tags,wid,direction=edge_way[(u,v)]
        oneway=tags.get('oneway') in ('yes','1','-1') or tags.get('junction')=='roundabout'
        a,b=(u,v) if (direction==1)!=(tags.get('oneway')=='-1') else (v,u)
        width=float(tags.get('width','8').split(';')[0]) if tags.get('width','8').replace('.','',1).isdigit() else 8
        roads.append({'a':a,'b':b,'name':tags.get('name') or tags.get('ref') or 'Strada provinciale','width':max(6,min(10,width)),'roadClass':tags['highway'],'oneWay':oneway,'bridge':tags.get('bridge')=='yes','osmId':wid,'region':'region'})
    # Direction boards where each corridor leaves a town: the neighbouring town and its real road distance.
    for a,b in region['corridors']['pairs']:
        for here,there in ((a,b),(b,a)):
            exits=[n for n in by_id[here]['nodes'] if n in graph]
            if not exits:continue
            target=by_id[there]['offset']
            exit_node=min(exits,key=lambda n:math.dist(world_of_town_node(n),target))
            x,z=world_of_town_node(exit_node);away=math.atan2(target[0]-x,-(target[1]-z))
            boards.append({'position':{'x':round(x+math.cos(away)*7,2),'z':round(z+math.sin(away)*7,2)},'angle':-away,'rows':[f'{by_id[there]["spec"]["name"].upper()} {real_km[(here,there)]:.0f} km'],'width':3.2,'height':2.6,'color':'#1f4f8a'})
    xs=[n['x'] for n in nodes];zs=[n['z'] for n in nodes]
    for zone in zones:xs+=[zone['minX'],zone['maxX']];zs+=[zone['minZ'],zone['maxZ']]
    bounds={'minX':round(min(xs)-250,2),'maxX':round(max(xs)+250,2),'minZ':round(min(zs)-250,2),'maxZ':round(max(zs)+250,2)}
    content=region['content'];stop_ids={s['id'] for s in stops}
    for ref in [content['start'],content['mission']['target']]+[x for f in content['fares'] for x in f[1:]]:
        if ref not in stop_ids:raise SystemExit(f'Region content names an unknown stop: {ref}')
    spawn_bay=next(b for b in bays if b['id']==content['start']);target_stop=next(s for s in stops if s['id']==content['mission']['target'])
    start_stop=next(s for s in stops if s['id']==content['start']);sb=next(r for r in roads if start_stop['nodeId'] in (r['a'],r['b']))
    na=next(n for n in nodes if n['id']==sb['a']);nb=next(n for n in nodes if n['id']==sb['b'])
    spawn={'x':spawn_bay['x'],'z':spawn_bay['z'],'heading':math.atan2(nb['x']-na['x'],-(nb['z']-na['z'])),'name':spawn_bay['name']}
    stamps=sorted({t['data']['provenance']['osmTimestamp'] for t in places}|{extract['osm3s']['timestamp_osm_base']})
    district={'version':1,'id':region['id'],'dataVersion':region['dataVersion'],**({'subtitle':region['subtitle']} if region.get('subtitle') else {}),'stoppingPolicy':'anywhere','name':region['name'],'description':region['description'],
      'attribution':region['attribution'],'sourceUrl':region['sourceUrl'],'bounds':bounds,'nodes':nodes,'roads':roads,'parkingZones':bays,
      'taxi':{**content['taxi'],'stops':stops,'fares':[{'passenger':p,'pickupId':a,'destinationId':b} for p,a,b in content['fares']]},
      'landmarks':landmarks,'buildings':buildings,'features':features,**({'waterAreas':water} if water else {}),'areas':areas,'spawn':spawn,
      'mission':{'name':content['mission']['name'],'objective':content['mission']['objective'],'hint':content['mission']['hint'],'duration':content['mission']['duration'],'bayId':target_stop['bayId'],'nodeId':target_stop['nodeId']},
      'provenance':{'source':'OpenStreetMap / Overpass API: town extracts and the region\'s main roads','osmTimestamp':stamps[-1],'osmTimestamps':stamps,
        'frame':{'projection':'UTM zone 32N (EPSG:32632)','falseOrigin':{'lat':round(clat,6),'lon':round(clon,6),'easting':round(E0,2),'northing':round(N0,2)},'rotationDegrees':round(math.degrees(gamma),4)},
        'compression':{'k':k,'model':'corridor','towns':{t['spec']['id']:{'real':[round(t['real'][0],1),round(t['real'][1],1)],'placed':[round(t['offset'][0],1),round(t['offset'][1],1)]} for t in towns},'villages':{t['spec']['id']:{'real':[round(t['real'][0],1),round(t['real'][1],1)],'placed':[round(t['offset'][0],1),round(t['offset'][1],1)]} for t in villages},'zoneMargin':zone_margin,**({'villageMargin':region['villageMargin']} if villages else {})},
        'notes':['Towns keep their real streets at real scale; the real main roads between them are shortened by k, keeping their junctions, one-way tags and names.','Direction boards between towns show real road distances.','Designated stopping bays are gameplay placements, not verified real parking permissions.']}}
    output=(args.output or ROOT/'build/regions'/f'{region["id"]}.json').resolve();output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(district,ensure_ascii=False,separators=(',',':'))+'\n')
    sidecar=output.with_suffix('.tiling.json')
    sidecar.write_text(json.dumps({'zones':zones,'zoneMargin':zone_margin,'boards':boards,'regionName':region['name']},ensure_ascii=False)+'\n')
    corridor_km=sum(math.dist(mapped[u],mapped[v]) for u,v in edges)/1000;real_corridor_km=sum(math.dist(coord[u],coord[v]) for u,v in edges)/1000
    print(f'{region["name"]}: {len(towns)} towns, {len(stops)} stops, {len(nodes)} nodes, {len(roads)} road segments ({len(edges)} corridor segments, {real_corridor_km:.1f} km real -> {corridor_km:.1f} km driven), {len(buildings)} buildings, {len(boards)} direction boards; worst bearing change {worst:.2f} deg; extent {(bounds["maxX"]-bounds["minX"])/1000:.1f} x {(bounds["maxZ"]-bounds["minZ"])/1000:.1f} km')
    print(f'Wrote {output} and {sidecar.name}')

if __name__=='__main__':main()
