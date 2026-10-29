import json, math, heapq, sys, itertools
data=json.load(open(sys.argv[1]))
lat0=45.2;kx=111320*math.cos(math.radians(lat0));ky=111320
P=lambda lat,lon:((lon-11.2)*kx,(lat-lat0)*ky)
places=[e for e in data['elements'] if e['type']=='node' and 'place' in e.get('tags',{})]
ways=[e for e in data['elements'] if e['type']=='way']
adj={};coord={}
for w in ways:
    ids=w['nodes'];geo=w['geometry']
    for (a,ga),(b,gb) in zip(zip(ids,geo),zip(ids[1:],geo[1:])):
        pa,pb=P(ga['lat'],ga['lon']),P(gb['lat'],gb['lon']);coord[a]=pa;coord[b]=pb
        d=math.dist(pa,pb);adj.setdefault(a,[]).append((b,d));adj.setdefault(b,[]).append((a,d))
nodes=list(coord)
def nearest(p):return min(nodes,key=lambda n:math.dist(coord[n],p))
def dijkstra(src):
    dist={src:0};q=[(0,src)]
    while q:
        d,u=heapq.heappop(q)
        if d>dist[u]:continue
        for v,w in adj[u]:
            if d+w<dist.get(v,1e18):dist[v]=d+w;heapq.heappush(q,(d+w,v))
    return dist
main=['Cerea','Legnago','Bovolone','Sanguinetto','Nogara','Casaleone']
byname={}
for p in places:
    n=p['tags'].get('name');t=p['tags']['place']
    if n in main and (n not in byname or t=='town'):byname[n]=p
print('Main towns found:',{n:byname[n]['tags']['place'] for n in byname},'missing:',[n for n in main if n not in byname])
snap={n:nearest(P(p['lat'],p['lon'])) for n,p in byname.items()}
for n,p in byname.items():print(f"  {n:12s} snapped {math.dist(coord[snap[n]],P(p['lat'],p['lon'])):.0f} m from its place node")
dist={n:dijkstra(snap[n]) for n in byname}
SPEED=17
print('\nPair                      straight km   road km   game min at 17 m/s')
rows=[]
for a,b in itertools.combinations(byname,2):
    s=math.dist(P(byname[a]['lat'],byname[a]['lon']),P(byname[b]['lat'],byname[b]['lon']))/1000
    r=dist[a].get(snap[b]);r=r/1000 if r is not None else float('nan')
    rows.append((r,a,b,s))
for r,a,b,s in sorted(rows):print(f"  {a+' - '+b:24s} {s:8.1f}   {r:7.1f}   {r*1000/SPEED/60:6.1f}")
others=sorted({(p['tags'].get('name'),p['tags']['place']) for p in places if p['tags'].get('name') not in main and p['tags']['place'] in ('village','town')})
print('\nOther towns and villages in the box:',len(others));print('  '+', '.join(n for n,t in others))
print('hamlets/suburbs:',sum(1 for p in places if p['tags']['place'] in ('hamlet','suburb')))
print('main-road ways:',len(ways),'km of main road:',round(sum(w for u in adj for v,w in adj[u])/2/1000,1))
