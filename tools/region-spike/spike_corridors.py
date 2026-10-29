import json,math,heapq,sys,itertools
data=json.load(open(sys.argv[1]));K=float(sys.argv[2]);SPEED=17
lat0=45.2;kx=111320*math.cos(math.radians(lat0));P=lambda lat,lon:((lon-11.2)*kx,-(lat-lat0)*111320)
towns={'Cerea':550,'Legnago':870,'Bovolone':500,'Sanguinetto':500,'Nogara':500,'Casaleone':450}
place={}
for e in data['elements']:
    t=e.get('tags',{})
    if e['type']=='node' and t.get('name') in towns and (t['name'] not in place or t.get('place')=='town'):place[t['name']]=P(e['lat'],e['lon'])
C=(sum(p[0] for p in place.values())/len(place),sum(p[1] for p in place.values())/len(place))
adj={};coord={}
for w in data['elements']:
    if w['type']!='way':continue
    for (a,ga),(b,gb) in zip(zip(w['nodes'],w['geometry']),zip(w['nodes'][1:],w['geometry'][1:])):
        pa,pb=P(ga['lat'],ga['lon']),P(gb['lat'],gb['lon']);coord[a]=pa;coord[b]=pb;d=math.dist(pa,pb)
        adj.setdefault(a,[]).append((b,d));adj.setdefault(b,[]).append((a,d))
snap={n:min(coord,key=lambda m:math.dist(coord[m],c)) for n,c in place.items()}
def path(s,t):
    dist={s:0};prev={};q=[(0,s)]
    while q:
        d,u=heapq.heappop(q)
        if u==t:break
        if d>dist[u]:continue
        for v,w in adj[u]:
            if d+w<dist.get(v,1e18):dist[v]=d+w;prev[v]=u;heapq.heappush(q,(d+w,v))
    out=[t]
    while out[-1]!=s:out.append(prev[out[-1]])
    return out[::-1]
pairs=[('Cerea','Casaleone'),('Casaleone','Sanguinetto'),('Cerea','Sanguinetto'),('Nogara','Sanguinetto'),('Legnago','Cerea'),('Cerea','Bovolone'),('Bovolone','Sanguinetto'),('Legnago','Casaleone')]
paths={p:path(snap[p[0]],snap[p[1]]) for p in pairs}
edges=set()
for ns in paths.values():
    for a,b in zip(ns,ns[1:]):edges.add((min(a,b),max(a,b)))
g={};[g.setdefault(a,set()).add(b) or g.setdefault(b,set()).add(a) for a,b in edges]
zone_of=lambda n:next((t for t,c in place.items() if math.dist(coord[n],c)<=towns[t]),None)
# Rigid zones: towns move by T = (k-1)(c - C); a junction of corridors outside towns becomes a tiny rigid zone at g(p).
shift={}
for n in g:
    z=zone_of(n)
    if z:shift[n]=((K-1)*(place[z][0]-C[0]),(K-1)*(place[z][1]-C[1]))
junctions=[n for n in g if not zone_of(n) and len(g[n])>2]
for n in junctions:shift[n]=((K-1)*(coord[n][0]-C[0]),(K-1)*(coord[n][1]-C[1]))
mapped={n:(coord[n][0]+s[0],coord[n][1]+s[1]) for n,s in shift.items()}
# Chains between fixed nodes: one similarity transform per chain (scale and turn to fit its two new ends).
fixed=set(shift);seen=set();chains=0;scales=[]
for start in fixed:
    for nxt in g[start]:
        if (start,nxt) in seen:continue
        chain=[start,nxt]
        while chain[-1] not in fixed:
            options=[m for m in g[chain[-1]] if m!=chain[-2]]
            if not options:break
            chain.append(options[0])
        for a,b in zip(chain,chain[1:]):seen.add((a,b));seen.add((b,a))
        if chain[-1] not in fixed:continue
        a0,b0=coord[chain[0]],coord[chain[-1]];a1,b1=mapped[chain[0]],mapped[chain[-1]]
        v0=complex(b0[0]-a0[0],b0[1]-a0[1]);v1=complex(b1[0]-a1[0],b1[1]-a1[1])
        if abs(v0)<1e-6:
            for n in chain[1:-1]:mapped[n]=(coord[n][0]+shift[chain[0]][0],coord[n][1]+shift[chain[0]][1])
            continue
        s=v1/v0;chains+=1;scales.append(abs(s))
        for n in chain[1:-1]:
            z=s*complex(coord[n][0]-a0[0],coord[n][1]-a0[1])
            mapped[n]=(a1[0]+z.real,a1[1]+z.imag)
length=lambda ns,m:sum(math.dist(m[a],m[b]) for a,b in zip(ns,ns[1:]))
print(f'k={K}: {len(edges)} corridor segments, {len(junctions)} junction zones outside towns, {chains} chains; chain scale min {min(scales):.2f} median {sorted(scales)[len(scales)//2]:.2f} max {max(scales):.2f}')
print('Pair                      real km  min    compressed km  min')
for p,ns in paths.items():
    real=length(ns,coord);comp=length(ns,mapped)
    print(f'  {p[0]+" - "+p[1]:24s} {real/1000:6.1f} {real/SPEED/60:5.1f}   {comp/1000:10.1f} {comp/SPEED/60:6.1f}')
# New crossings: mapped segments of different chains that intersect where the real ones did not.
segs=[(a,b) for a,b in edges]
def cross(p1,p2,q1,q2):
    d=lambda a,b,c:(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    return d(p1,p2,q1)*d(p1,p2,q2)<0 and d(q1,q2,p1)*d(q1,q2,p2)<0
new=0
for (a,b),(c,d) in itertools.combinations(segs,2):
    if len({a,b,c,d})<4:continue
    if cross(mapped[a],mapped[b],mapped[c],mapped[d]) and not cross(coord[a],coord[b],coord[c],coord[d]):new+=1
zones_overlap=[(a,b) for a,b in itertools.combinations(place,2) if math.dist(mapped[snap[a]],mapped[snap[b]])<towns[a]+towns[b]]
bearing=lambda p,q:math.degrees(math.atan2(q[0]-p[0],-(q[1]-p[1])))%360
worst=max(abs((bearing(mapped[snap[a]],mapped[snap[b]])-bearing(coord[snap[a]],coord[snap[b]])+180)%360-180) for a,b in itertools.combinations(place,2))
print(f'new road crossings created: {new}; town zones overlapping after mapping: {zones_overlap or "none"}; largest town-to-town bearing change: {worst:.3f} degrees')
