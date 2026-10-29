import json,math,heapq,sys,itertools
data=json.load(open(sys.argv[1]));K=float(sys.argv[2]) if len(sys.argv)>2 else 0.6;BAND=float(sys.argv[3]) if len(sys.argv)>3 else 400.0;SPEED=17
lat0=45.2;kx=111320*math.cos(math.radians(lat0));P=lambda lat,lon:((lon-11.2)*kx,-(lat-lat0)*111320)
towns={'Cerea':550,'Legnago':870,'Bovolone':500,'Sanguinetto':500,'Nogara':500,'Casaleone':450}
place={}
for e in data['elements']:
    t=e.get('tags',{})
    if e['type']=='node' and t.get('name') in towns and (t['name'] not in place or t.get('place')=='town'):place[t['name']]=P(e['lat'],e['lon'])
C=(sum(p[0] for p in place.values())/len(place),sum(p[1] for p in place.values())/len(place))
def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)
def weight(p,c,r):d=math.dist(p,c);return 1.0 if d<=r else 1-smooth((d-r)/BAND)
def f(p):
    x=C[0]+K*(p[0]-C[0]);z=C[1]+K*(p[1]-C[1])
    for n,c in place.items():
        w=weight(p,c,towns[n])
        if w:x-=w*(K-1)*(p[0]-c[0]);z-=w*(K-1)*(p[1]-c[1])
    return (x,z)
adj={};coord={}
for w in data['elements']:
    if w['type']!='way':continue
    for (a,ga),(b,gb) in zip(zip(w['nodes'],w['geometry']),zip(w['nodes'][1:],w['geometry'][1:])):
        pa,pb=P(ga['lat'],ga['lon']),P(gb['lat'],gb['lon']);coord[a]=pa;coord[b]=pb;d=math.dist(pa,pb)
        adj.setdefault(a,[]).append((b,d));adj.setdefault(b,[]).append((a,d))
def nearest(p):return min(coord,key=lambda n:math.dist(coord[n],p))
snap={n:nearest(c) for n,c in place.items()}
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
    return out[::-1],dist[t]
print(f'k={K}, band {BAND:.0f} m, zone radii {towns}')
print('Pair                      real km  min    compressed km  min')
for a,b in [('Cerea','Casaleone'),('Casaleone','Sanguinetto'),('Cerea','Sanguinetto'),('Nogara','Sanguinetto'),('Legnago','Cerea'),('Cerea','Bovolone'),('Bovolone','Sanguinetto'),('Legnago','Casaleone'),('Legnago','Nogara')]:
    nodes,real=path(snap[a],snap[b]);mapped=[f(coord[n]) for n in nodes];comp=sum(math.dist(p,q) for p,q in zip(mapped,mapped[1:]))
    print(f'  {a+" - "+b:24s} {real/1000:6.1f} {real/SPEED/60:5.1f}   {comp/1000:10.1f} {comp/SPEED/60:6.1f}')
# Fold check: Jacobian determinant on a 50 m grid over the towns' extent plus 2 km.
xs=[c[0] for c in place.values()];zs=[c[1] for c in place.values()];h=1.0;mindet=1e9;where=None;n=0
x=min(xs)-2000
while x<=max(xs)+2000:
    z=min(zs)-2000
    while z<=max(zs)+2000:
        fx1,fx0=f((x+h,z)),f((x-h,z));fz1,fz0=f((x,z+h)),f((x,z-h))
        det=((fx1[0]-fx0[0])*(fz1[1]-fz0[1])-(fz1[0]-fz0[0])*(fx1[1]-fx0[1]))/(4*h*h);n+=1
        if det<mindet:mindet,where=det,(round(x),round(z))
        z+=50
    x+=50
print(f'Jacobian on {n} grid points: minimum {mindet:.3f} at {where} (folds if <= 0; inside towns it is 1, far away k^2 = {K*K:.2f})')
for a,b in itertools.combinations(place,2):
    gap=math.dist(f(place[a]),f(place[b]))-towns[a]-towns[b]-2*BAND
    if gap<0:print(f'  zones+bands overlap after mapping: {a} - {b} by {-gap:.0f} m')
bearing=lambda p,q:math.degrees(math.atan2(q[0]-p[0],-(q[1]-p[1])))%360
worst=max(abs((bearing(f(place[a]),f(place[b]))-bearing(place[a],place[b])+180)%360-180) for a,b in itertools.combinations(place,2))
print(f'largest change in a town-to-town bearing: {worst:.4f} degrees')
fx=[f(c)[0] for c in place.values()];fz=[f(c)[1] for c in place.values()]
w=(max(fx)-min(fx)+2*870)/1000;hh=(max(fz)-min(fz)+2*870)/1000
print(f'compressed extent with outer zones: about {w:.1f} x {hh:.1f} km -> {math.ceil(w*1000/250)*math.ceil(hh*1000/250)} tiles of 250 m in the bounding box')
