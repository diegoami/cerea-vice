import json,sys
from collections import Counter
for path in sys.argv[1:]:
    d=json.load(open(path));E=d['elements']
    ways=[e for e in E if e['type']=='way'];rels=[e for e in E if e['type']=='relation'];nodes=[e for e in E if e['type']=='node']
    T=lambda e:e.get('tags',{})
    hw=Counter(T(w)['highway'] for w in ways if 'highway' in T(w))
    named=Counter(T(w)['highway'] for w in ways if 'highway' in T(w) and T(w).get('name'))
    ped_named=sorted({T(w)['name'] for w in ways if T(w).get('highway') in ('pedestrian','footway','steps','path','cycleway','living_street','track') and T(w).get('name')})
    squares=sorted({T(w).get('name','(unnamed)') for w in ways if T(w).get('highway')=='pedestrian' and T(w).get('area')=='yes'})
    access=Counter(f"{k}={T(w)[k]}" for w in ways if 'highway' in T(w) and T(w).get('name') for k in ('access','motor_vehicle','vehicle') if k in T(w))
    bways=sum(1 for w in ways if 'building' in T(w));brels=[r for r in rels if 'building' in T(r)]
    inner=sum(1 for r in brels for m in r.get('members',[]) if m.get('role')=='inner')
    water_areas=[e for e in ways+rels if T(e).get('natural')=='water' or T(e).get('waterway')=='riverbank']
    rivers=sorted({T(w).get('name','(unnamed)')+':'+T(w)['waterway'] for w in ways if 'waterway' in T(w)})
    bridges=sorted({T(w).get('name','(unnamed)') for w in ways if T(w).get('bridge')=='yes' and 'highway' in T(w)})
    cand=[]
    for e in nodes+ways+rels:
        t=T(e);n=t.get('name')
        if not n:continue
        score=0
        if t.get('amenity') in ('place_of_worship','townhall','theatre','cinema','library','school','post_office','hospital','marketplace','courthouse','college'):score+=3
        if t.get('historic'):score+=2
        if t.get('tourism') in ('museum','attraction','artwork','gallery'):score+=2
        if 'wikidata' in t:score+=2
        if e['type']!='node' and 'building' in t:score+=1
        if score>=3:cand.append((score,e['type'],e['id'],n,t.get('amenity') or t.get('historic') or t.get('tourism') or t.get('building')))
    cand.sort(key=lambda c:(-c[0],c[3]))
    print(f"== {path.split('/')[-1]}: {len(E)} elements ({len(ways)} ways, {len(rels)} relations, {len(nodes)} nodes)")
    print('  highway classes:',dict(hw.most_common(12)))
    print('  named highway classes:',dict(named))
    print(f'  named footways/steps/pedestrian/paths ({len(ped_named)}):',', '.join(ped_named[:25]))
    print('  pedestrian areas (area=yes):',squares)
    print('  access tags on named roads:',dict(access))
    print(f'  buildings: {bways} ways, {len(brels)} relations with {inner} inner rings (courtyards)')
    print(f'  water areas (natural=water/riverbank): {len(water_areas)}; waterways:',rivers[:12])
    print('  named road bridges:',bridges[:12])
    print(f'  landmark candidates (score>=3): {len(cand)}')
    for c in cand[:16]:print('    ',c)
