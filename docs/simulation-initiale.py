"""Simulateur Brassins. La configuration 'v3' correspond aux règles du prompt ; 'defaut' est la version initiale, les autres sont les étapes intermédiaires.
Usage : python3 brassins.py 200 v3        (200 parties à 4)
        python3 brassins.py 100 v3:2 v3:3  (à 2 et 3 joueurs)"""
import random, statistics as stt, sys, collections, json

DIRS=[(1,0),(1,-1),(0,-1),(-1,0),(-1,1),(0,1)]
def hdist(a,b): dq=a[0]-b[0]; dr=a[1]-b[1]; return (abs(dq)+abs(dr)+abs(dq+dr))//2
def neigh(h): return [(h[0]+d[0],h[1]+d[1]) for d in DIRS]

STYLES={ # malt,houb,lev,eau,torr, ferm, prix, rep
 'blonde':(2,1,1,1,0,1,3,1),'blanche':(1,1,1,2,0,1,3,1),'ipa':(2,3,1,1,0,1,5,2),
 'ambree':(2,1,1,1,1,2,4,2),'stout':(1,1,1,1,2,2,5,2),'lager':(2,1,1,2,0,3,4,2),'garde':(3,1,1,1,1,3,6,3)}
DARK={'ambree','stout','lager','garde'}
ING=['malt','houb','lev','eau','torr']
BUY={'malt':2,'houb':2,'lev':3,'eau':1,'torr':4}
PROD={'orge':[0,2,1,0],'houb':[0,1,2,0],'source':[2,0,1,1]}
CARDS={0:[('doux',{}, ('blanche','blonde'),None),('pluvieux',{'source':1},('blonde','lager'),None),('froid',{'source':-1},('ambree','stout'),'contam')],
       1:[('bel',{},('blonde','ipa'),None),('canicule',{'source':'zero'},('blanche','lager'),'canicule'),('orageux',{'orge':-1},('ipa','blanche'),None)],
       2:[('recolte',{'houb':1},('ipa','ambree'),None),('humide',{},('ambree','stout'),'concours'),('sec',{'houb':-1},('garde','ipa'),None)],
       3:[('tranquille',{},('stout','garde'),None),('rude',{'source':-1},('ambree','garde'),'douanes'),('fete',{},('blonde','stout'),'fete')]}
UPG={'cuve2':8,'cuve3':14,'ferm':6,'touraille':7,'touraille2':6,'froide':10,'labo':6,'puits':4,'cave':5,'camion':8,'salle':12}
FOIRE_SEASON=[1,1,2,3,3,0]

DEFAULT=dict(v3=False,argent_div=5,order='rot',place_res=0,v2=False,keep_tile=False,prod_boost=False,free_place=False,overflow_end=False,ipa_ferm=1,stock=6,place_bonus=[0,0,0,0],radius=2,years=3,start_ferm=2,start_lev=2,floor=1,recover=1,rep_per_upg=0,start_argent=6,max_ferm=5)

class Player:
    def __init__(s,i,prof):
        s.i=i; s.prof=prof; s.res={'malt':4,'houb':2,'lev':2,'eau':2,'torr':0}; s.argent=6
        s.nferm=2; s.ferms=[]; s.cuve=2; s.stockmax=6; s.stock=collections.Counter(); s.upg=set()
        s.tournees=set(); s.rep=0; s.styles=set(); s.hex=None
        s.stats=collections.Counter(); s.repsrc=collections.Counter()
    def units(s): return sum(s.stock.values())

class Game:
    def __init__(s,n=4,seed=0,cfg=None,profiles=None):
        s.R=random.Random(seed); s.cfg=dict(DEFAULT,**(cfg or {})); s.n=n
        s.T=s.cfg['years']*4; s.log=collections.Counter()
        global PROD,STYLES,BUY,UPG,DIV,CONCOURS
        STYLES={'blonde':(2,1,1,1,0,1,3,1),'blanche':(1,1,1,2,0,1,3,1),'ipa':(2,3,1,1,0,s.cfg['ipa_ferm'],5,2),
                'ambree':(2,1,1,1,1,2,4,2),'stout':(1,1,1,1,2,2,5,2),'lager':(2,1,1,2,0,3,4,2),'garde':(3,1,1,1,1,3,6,3)}
        BUY={'malt':2,'houb':2,'lev':3,'eau':1,'torr':4}
        UPG={'cuve2':8,'cuve3':14,'ferm':6,'touraille':7,'touraille2':6,'froide':10,'labo':6,'puits':4,'cave':5,'camion':8,'salle':12}
        DIV={0:0,1:0,2:0,3:1,4:1,5:3,6:3,7:6}; CONCOURS=(3,1)
        if s.cfg['v2']:
            STYLES.update({'ipa':(2,3,1,1,0,2,s.cfg.get('ipa_price',5),2),'ambree':(2,1,1,1,1,2,4,3),'stout':(1,1,1,1,2,2,6,3),'lager':(2,1,1,2,0,2,4,3)})
            BUY['torr']=5
            UPG={'cuve2':8,'cuve3':14,'ferm':6,'touraille':7,'froide':6,'labo':6,'cave':5,'camion':8,'salle':8}
            DIV={0:0,1:0,2:0,3:2,4:2,5:5,6:5,7:9}; CONCOURS=(5,2)
            s.cfg.update(keep_tile=True,free_place=True,overflow_end=True,ipa_ferm=2,prod_boost=True,stock=5)
        if s.cfg['v3']:
            STYLES['garde']=(3,1,1,1,1,3,7,4); UPG['salle']=10; del UPG['cave']
            s.cfg.update(order='catchup',argent_div=8)
        PROD={'orge':[0,3,2,0],'houb':[0,2,3,0],'source':[3,0,2,1]} if s.cfg['prod_boost'] else {'orge':[0,2,1,0],'houb':[0,1,2,0],'source':[2,0,1,1]}
        s.build_board()
        profs=profiles or [s.R.choice(['clients','marche','equilibre']) for _ in range(n)]
        s.P=[Player(i,profs[i]) for i in range(n)]
        for p in s.P:
            p.nferm=s.cfg['start_ferm']; p.res['lev']=s.cfg['start_lev']; p.argent=s.cfg['start_argent']; p.stockmax=s.cfg['stock']
        s.first=s.R.randrange(n); s.order0=s.first
        s.price={k:v[6] for k,v in STYLES.items()}
        s.deck={k:s.R.sample(v,3)+s.R.sample(v,3) for k,v in CARDS.items()}
        s.place()
    def build_board(s):
        R=s.cfg['radius']
        hexes=[(q,r) for q in range(-R,R+1) for r in range(-R,R+1) if hdist((q,r),(0,0))<=R]
        import math
        ring2=sorted([h for h in hexes if hdist(h,(0,0))==2],key=lambda h:math.atan2(h[1]*1.5, (h[0]+h[1]/2)*1.732))
        off=s.R.randrange(4); s.villages=[ring2[(off+4*k)%12] for k in range(3)]
        nt=len(hexes)-4
        terr=['orge']*round(nt*6/15)+['houb']*round(nt*5/15); terr+=['source']*(nt-len(terr)); s.R.shuffle(terr)
        s.tiles={}
        for h in hexes:
            if h==(0,0): s.tiles[h]='bourg'
            elif h in s.villages: s.tiles[h]='village'
            else: s.tiles[h]=terr.pop()
        s.foires=[((R+1)*d[0],(R+1)*d[1]) for d in DIRS]
        # clients: id -> (pos, cap, bonus, kind, data)
        s.clients={'bar_bourg':((0,0),3,1,'bar',None),'cave':((0,0),2,3 if s.cfg['v2'] else 2,'cave',None)}
        for k,v in enumerate(s.villages): s.clients[f'village{k}']=(v,2,0,'village',tuple(s.R.sample(list(STYLES),2)))
        for k,f in enumerate(s.foires): s.clients[f'foire{k}']=(f,4,2,'foire',FOIRE_SEASON[k])
    def place(s):
        order=[(s.first-1-k)%s.n for k in range(s.n)]  # inverse de l'ordre de jeu
        for i in order:
            p=s.P[i]; best=None
            for h,t in s.tiles.items():
                if t in('bourg','village','cour') or h in [q.hex for q in s.P if q.hex]: continue
                if not s.cfg['free_place'] and any(nb in [q.hex for q in s.P if q.hex] for nb in neigh(h)): continue
                sc=sum({'orge':1.1,'houb':1.0,'source':0.9}.get(s.tiles.get(nb),0) for nb in neigh(h))
                sc+=0.5/(1+hdist(h,(0,0)))+s.R.random()*0.3
                kinds=set(s.tiles.get(nb) for nb in neigh(h))
                sc+=0.6*len(kinds&{'orge','houb','source'})
                if best is None or sc>best[0]: best=(sc,h)
            if best is None:
                s.log['placement_fallback']+=1
                for h,t in s.tiles.items():
                    if t in('bourg','village','cour') or h in [q.hex for q in s.P if q.hex] or any(nb in [q.hex for q in s.P if q.hex] for nb in neigh(h)): continue
                    sc=sum({'orge':1.1,'houb':1.0,'source':0.9}.get(s.tiles.get(nb),0) for nb in neigh(h))
                    if best is None or sc>best[0]: best=(sc,h)
            if best is None:
                s.log['placement_adjacent']+=1
                for h,t in s.tiles.items():
                    if t in('bourg','village','cour'): continue
                    sc=sum({'orge':1.1,'houb':1.0,'source':0.9}.get(s.tiles.get(nb),0) for nb in neigh(h))
                    if best is None or sc>best[0]: best=(sc,h)
            p.hex=best[1]; p.tile=s.tiles[p.hex]
            if not s.cfg['keep_tile']: s.tiles[p.hex]='cour'
            p.rank=order.index(i); p.argent+=s.cfg['place_bonus'][p.rank]; p.res['malt']+=s.cfg['place_res']*p.rank; p.res['houb']+=s.cfg['place_res']*p.rank
            p.dbourg=hdist(p.hex,(0,0)); p.nterr=sum(1 for nb in list(neigh(p.hex))+[p.hex] if s.tiles.get(nb) in PROD); p.nkinds=len(set(s.tiles.get(nb) for nb in list(neigh(p.hex))+[p.hex])&set(PROD)); p.nvil=sum(1 for nb in neigh(p.hex) if s.tiles.get(nb) in('village','bourg')); p.potential=sum(sum(PROD[s.tiles[nb]]) for nb in list(neigh(p.hex))+[p.hex] if s.tiles.get(nb) in PROD)
            # tournée gratuite
            cands=[c for c,(pos,*_)in s.clients.items() if hdist(p.hex,pos)<=2 and not c.startswith('foire')]
            if not cands: cands=[c for c,(pos,*_)in s.clients.items() if hdist(p.hex,pos)<=2]
            if cands: p.tournees.add(max(cands,key=lambda c:s.clients[c][1]+s.clients[c][2]))
    # ---------- déroulé ----------
    def run(s):
        for t in range(s.T):
            s.t=t; s.season=t%4; s.card=s.deck[s.season][t//4]; s.demand=set(s.card[2])
            s.cap={c:v[1]*(2 if s.card[3]=='fete' and v[3]=='village' else 1) for c,v in s.clients.items()}
            s.produce(); s.event()
            for k in range(s.n): s.turn(s.P[(s.first+k)%s.n])
            s.end_season()
            if s.cfg['order']=='rot': s.first=(s.first+1)%s.n
            elif s.cfg['order']=='shift': s.first=(s.order0+(t+1)+(t+1)//4)%s.n
            elif s.cfg['order']=='catchup': s.first=min(range(s.n),key=lambda i:(s.P[i].rep,s.P[i].argent,s.R.random()))
        return s.score()
    def produce(s):
        for p in s.P:
            for nb in list(neigh(p.hex))+[p.hex]:
                t=s.tiles.get(nb)
                if t in PROD:
                    q=PROD[t][s.season]; m=s.card[1].get(t,0)
                    q=0 if m=='zero' else max(0,q+m)
                    p.res[{'orge':'malt','houb':'houb','source':'eau'}[t]]+=q
            p.res['eau']+=1+('puits' in p.upg); p.res['lev']+=('labo' in p.upg); p.res['houb']+=('labo' in p.upg and s.cfg['v2'])
            # brassins terminés
            done=[f for f in p.ferms if f[1]<=0]
            for st,_,u in done:
                if s.cfg['overflow_end']: p.stock[st]+=u
                else:
                    space=p.stockmax-p.units(); put=min(u,space); p.stock[st]+=put; p.stats['lost']+=u-put
                p.res['lev']+=1
                p.stats['brassins_done']+=1
            p.ferms=[f for f in p.ferms if f[1]>0]
            p.tour_uses=collections.Counter(); p.torr_uses=0
    def event(s):
        ev=s.card[3]
        if ev in('contam','canicule'):
            for p in s.P:
                if (ev=='contam' and 'labo' in p.upg) or (ev=='canicule' and 'froide' in p.upg) or not p.ferms: continue
                f=min(p.ferms,key=lambda f:STYLES[f[0]][6]*f[2]); i=p.ferms.index(f); p.ferms[i]=(f[0],f[1],max(0,f[2]-1)); p.stats['ev_loss']+=1
        elif ev=='douanes':
            for p in s.P: c=p.units()//3; pay=min(c,p.argent); p.argent-=pay; p.stats['douanes']+=pay
        elif ev=='concours':
            sc=[]
            for p in s.P:
                if not p.units(): sc.append((-1,p)); continue
                st=max(p.stock,key=lambda st:STYLES[st][7]+(st in s.demand)); p.stock[st]-=1
                if p.stock[st]==0: del p.stock[st]
                sc.append((STYLES[st][7]+(st in s.demand),p))
            vals=sorted(set(v for v,_ in sc if v>=0),reverse=True)
            for v,p in sc:
                if v<0: continue
                if v==vals[0]: p.rep+=CONCOURS[0]; p.repsrc['concours']+=CONCOURS[0]
                elif len(vals)>1 and v==vals[1]: p.rep+=CONCOURS[1]; p.repsrc['concours']+=CONCOURS[1]
    def end_season(s):
        for p in s.P:
            p.ferms=[(st,r-1,u) for st,r,u in p.ferms]
            if p.ferms: p.stats['ferm_busy']+=len(p.ferms)
            p.stats['ferm_total']+=p.nferm
            if 'salle' in p.upg and s.season==3: p.rep+=1; p.repsrc['salle']+=1
        for k in s.price: s.price[k]=min(STYLES[k][6],s.price[k]+s.cfg['recover'])
    def score(s):
        out=[]
        for p in s.P:
            div=DIV[len(p.styles)]
            total=p.rep+div+p.argent//s.cfg['argent_div']+s.cfg['rep_per_upg']*len(p.upg)
            p.repsrc['diversite']=div; p.repsrc['argent']=p.argent//s.cfg['argent_div']; p.repsrc['upg']=s.cfg['rep_per_upg']*len(p.upg)
            out.append(total)
        return out
    # ---------- IA ----------
    def W(s,p): return {'clients':2.5,'marche':1.2,'equilibre':1.8}[p.prof]
    def remaining(s): return s.T-s.t  # saisons incluant celle-ci
    def turn(s,p):
        s.sell(p); s.open_tournee(p); s.upgrade(p); s.brew(p); s.upgrade(p); s.brew(p); s.sell(p,final=True)
        while p.units()>p.stockmax:
            st=min(p.stock,key=lambda st:STYLES[st][6]); p.stock[st]-=1; p.stats['lost']+=1
            if p.stock[st]==0: del p.stock[st]
    def sell_value(s,p,st,c):
        pos,cap,bonus,kind,data=s.clients[c]; base=STYLES[st][6]; rep=STYLES[st][7]+(st in s.demand)
        if kind=='cave' and st not in DARK: return None
        if kind=='foire':
            if data!=s.season: return None
            rep+=1
        if kind=='village' and st not in data: bonus=-1; rep=0
        return base+bonus, rep
    def sell(s,p,final=False):
        W=s.W(p)
        # clients
        while True:
            best=None
            for st,u in list(p.stock.items()):
                if u<=0: continue
                for c in p.tournees:
                    if s.cap[c]<=0 or p.tour_uses[c]>=(2 if 'camion' in p.upg else 1): continue
                    v=s.sell_value(p,st,c)
                    if not v: continue
                    val=v[0]+W*v[1]
                    if best is None or val>best[0]: best=(val,st,c,v)
            if not best: break
            _,st,c,(a,r)=best; p.stock[st]-=1
            if p.stock[st]==0: del p.stock[st]
            s.cap[c]-=1; p.tour_uses[c]+=1; p.argent+=a; p.rep+=r; p.repsrc['livraison']+=r
            p.stats['u_client']+=1; p.stats['cl_'+s.clients[c][3]]+=1
        for _ in range(2 if s.cfg['v2'] else 1):
            if 'salle' in p.upg and p.units() and p.stats.get('salle_used_'+str(s.t),0)<(2 if s.cfg['v2'] else 1):
                st=max(p.stock,key=lambda st:STYLES[st][6]); p.stock[st]-=1
                if p.stock[st]==0: del p.stock[st]
                p.argent+=STYLES[st][6]+1; p.stats['salle_used_'+str(s.t)]+=1; p.stats['u_salle']+=1
        # marché : vendre ce qui dépasse une réserve, ou tout si le stock va déborder
        incoming=sum(u for _,r,u in p.ferms if r<=1)
        keep=0 if p.prof=='marche' else min(2,len(p.tournees))
        keep=min(keep,max(0,p.stockmax-incoming))
        while p.units()>keep:
            st=max(p.stock,key=lambda st:s.price[st]+2*(st in s.demand))
            pr=s.price[st]+2*(st in s.demand)
            if pr<2 and p.units()+incoming<=p.stockmax: break
            p.stock[st]-=1
            if p.stock[st]==0: del p.stock[st]
            p.argent+=pr; s.price[st]=max(s.cfg['floor'],s.price[st]-1); p.stats['u_marche']+=1; p.stats['argent_marche']+=pr
    def open_tournee(s,p):
        best=None; rem=s.remaining()
        for c,(pos,cap,bonus,kind,data) in s.clients.items():
            if c in p.tournees: continue
            d=hdist(p.hex,pos); cost=d*(1 if 'camion' in p.upg else 2)
            if cost>p.argent: continue
            if kind=='foire':
                uses=sum(1 for t in range(s.t,s.T) if t%4==data)
                val=uses*(bonus+s.W(p)*2.5)
            else:
                val=(rem-1)*(bonus+s.W(p)*(1.5 if kind!='village' else 1.0))*(0.6 if kind=='cave' else 1)
            if val-cost>0 and (best is None or val/cost>best[0]): best=(val/cost,c,cost)
        if best and len(p.tournees)<rem: p.argent-=best[2]; p.tournees.add(best[1]); p.stats['tournees']+=1
    def brew(s,p):
        while len(p.ferms)<p.nferm:
            rem=s.remaining(); best=None
            for st,(m,h,l,e,tr,f,pr,rp) in STYLES.items():
                if f>rem-1: continue  # doit être en stock avant la fin
                if st=='lager' and 'froide' not in p.upg: continue
                need={'malt':m,'houb':h,'lev':l,'eau':e,'torr':tr}
                cost=0; plan={}
                for k,q in need.items():
                    miss=max(0,q-p.res[k])
                    if k=='torr' and miss:
                        # touraille
                        tour=0
                        if 'touraille2' in p.upg: tour=min(miss,2-p.torr_uses)
                        elif 'touraille' in p.upg: tour=min(miss,1-p.torr_uses)
                        mneed=tour*(1 if 'touraille2' in p.upg else 2)
                        if p.res['malt']-need['malt']>=mneed: plan['tour']=tour; miss-=tour
                        else: tour=0
                    plan[k]=miss; cost+=miss*BUY[k]
                if cost>p.argent-(2 if p.prof!='marche' else 0): continue
                if plan.get('torr',0) and 'touraille' not in p.upg and rem>4: continue
                val=(p.cuve*(pr+s.W(p)*rp)-cost-0.6*sum(need.values()))/(f**0.8)
                if st not in p.styles: val+=1.5+(s.W(p) if s.cfg['v2'] else 0)
                val+=s.R.random()*0.5
                if best is None or val>best[0]: best=(val,st,plan,need)
            if not best:
                p.stats['starved']+=p.nferm-len(p.ferms); break
            _,st,plan,need=best
            for _ in range(plan.get('tour',0)):
                p.res['malt']-=(1 if 'touraille2' in p.upg else 2); p.res['torr']+=1; p.torr_uses+=1
            for k,q in plan.items():
                if k=='tour': continue
                p.argent-=q*BUY[k]; p.res[k]+=q; p.stats['achat_'+k]+=q
            for k,q in need.items(): p.res[k]-=q
            if st not in p.styles and s.cfg['v2']: p.rep+=1; p.repsrc['premiere']+=1
            p.ferms.append((st,STYLES[st][5],p.cuve)); p.styles.add(st); p.stats['brew_'+st]+=1; p.stats['brassins']+=1
    def upgrade(s,p):
        rem=s.remaining()-1
        while True:
            best=None
            busy=len(p.ferms)>=p.nferm
            for u,cost in UPG.items():
                if u in p.upg and u!='ferm': continue
                if u=='ferm' and p.nferm>=s.cfg['max_ferm']: continue
                if u=='cuve3' and 'cuve2' not in p.upg: continue
                if u=='touraille2' and 'touraille' not in p.upg: continue
                reserve=6 if rem>2 else 0
                if cost>p.argent-reserve or rem<2: continue
                uv=4.0+s.W(p)*0.8  # valeur d'une unité
                bps=min(2.0,p.nferm/1.8)  # brassins par saison
                gain={'cuve2':rem*bps*uv*0.8,'cuve3':rem*bps*uv*0.8,'ferm':rem*(0.55*(p.cuve*uv-6) if busy else 0.3),
                      'touraille':rem*1.0+p.stats['achat_torr']*1.5,'touraille2':rem*0.5,
                      'froide':rem*(1.2 if s.cfg['v2'] else 0.8),'labo':rem*(1.3 if s.cfg['v2'] else 0.6),'puits':rem*0.3,'cave':rem*0.4+p.stats['lost']*2,'camion':rem*(0.4+0.4*len(p.tournees)),
                      'salle':rem*((10.0 if s.cfg['v2'] else 5.0)/3)+(rem//4)*s.W(p)}[u]
                gain*={'clients':0.9,'marche':1.1,'equilibre':1.0}[p.prof]
                if gain-cost>0 and (best is None or gain-cost>best[0]): best=(gain-cost,u,cost)
            if not best: break
            _,u,cost=best; p.argent-=cost; p.upg.add(u); p.stats['upg_'+u]+=1; p.stats['upg_turn_'+u]+=s.t
            if u=='cuve2': p.cuve=3
            if u=='cuve3': p.cuve=4
            if u=='ferm': p.nferm+=1
            if u=='cave': p.stockmax=s.cfg['stock']+4
            if u=='ferm' and p.nferm>=s.cfg['max_ferm']: pass

def simulate(N=100,cfg=None,n=4,seed0=0):
    agg=collections.Counter(); reps=collections.Counter(); wins=collections.Counter(); scores=[]; spreads=[]
    posw=collections.Counter(); profw=collections.Counter(); profc=collections.Counter(); upgturn=collections.Counter(); upgcount=collections.Counter()
    first_scores=[]; other_scores=[]
    for g in range(N):
        G=Game(n=n,seed=seed0+g,cfg=cfg); sc=G.run(); agg['placement_fallback']+=G.log['placement_fallback']; agg['placement_adjacent']+=G.log['placement_adjacent']
        scores+=sc; spreads.append(max(sc)-min(sc))
        w=sc.index(max(sc)); wins['first' if w==G.order0 else 'other']+=1
        first_scores.append(sc[G.order0]); other_scores+=[sc[i] for i in range(n) if i!=G.order0]
        order=[(G.order0-1-k)%n for k in range(n)]
        posw[order.index(w)]+=1
        for i,p in enumerate(G.P):
            agg[f'pot_{p.rank}']+=p.potential; agg[f'db_{p.rank}']+=p.dbourg; agg[f'nt_{p.rank}']+=p.nterr; agg[f'nk_{p.rank}']+=p.nkinds; agg[f'nv_{p.rank}']+=p.nvil; agg[f'sc_{p.rank}']+=sc[i]
            profc[p.prof]+=1
            if i==w: profw[p.prof]+=1
            agg.update({k:v for k,v in p.stats.items() if not k.startswith('salle_used') and not k.startswith('upg_turn')})
            for k,v in p.stats.items():
                if k.startswith('upg_turn'): upgturn[k[9:]]+=v; upgcount[k[9:]]+=p.stats['upg_'+k[9:]]
            reps.update(p.repsrc)
    tot=N*n
    print(f"=== {N} parties à {n}, cfg={cfg or 'défaut'} ===")
    print(f"Score final : moyenne {stt.mean(scores):.1f}, min {min(scores)}, max {max(scores)}, écart-type {stt.pstdev(scores):.1f}; écart 1er-dernier moyen {stt.mean(spreads):.1f}")
    print(f"Sources de points par joueur : "+", ".join(f"{k} {v/tot:.1f}" for k,v in reps.most_common()))
    print(f"Victoires du premier joueur : {wins['first']/N*100:.0f}% (attendu {100/n:.0f}%) ; score moyen 1er joueur {stt.mean(first_scores):.1f} vs autres {stt.mean(other_scores):.1f}")
    print("Victoires par ordre de placement (0 = a choisi en premier) : "+", ".join(f"{k}:{v/N*100:.0f}%" for k,v in sorted(posw.items())))
    print("Par rang de placement : production annuelle potentielle / score moyen : "+", ".join(f"rang {k}: {agg[f'pot_{k}']/N:.1f} / {agg[f'sc_{k}']/N:.1f} (terroirs {agg[f'nt_{k}']/N:.1f}, types {agg[f'nk_{k}']/N:.2f}, clients voisins {agg[f'nv_{k}']/N:.2f})" for k in range(n)))
    print("Victoires par profil : "+", ".join(f"{k} {profw[k]/profc[k]*100:.0f}% ({profc[k]} joueurs)" for k in profc))
    print(f"Brassins par joueur : {agg['brassins']/tot:.1f}, terminés {agg['brassins_done']/tot:.1f}, unités perdues (stock plein) {agg['lost']/tot:.2f}, unités perdues événements {agg['ev_loss']/tot:.2f}")
    print(f"Taux d'occupation des fermenteurs : {agg['ferm_busy']/max(1,agg['ferm_total'])*100:.0f}% ; fermenteurs vides faute d'ingrédients ou d'argent : {agg['starved']/tot:.1f} saisons-fermenteur par joueur")
    print("Styles brassés (par joueur) : "+", ".join(f"{k[5:]} {v/tot:.2f}" for k,v in sorted(agg.items()) if k.startswith('brew_')))
    print(f"Ventes : clients {agg['u_client']/tot:.1f} u, marché {agg['u_marche']/tot:.1f} u (prix moyen {agg['argent_marche']/max(1,agg['u_marche']):.2f}), salle {agg['u_salle']/tot:.1f} u")
    print("Livraisons par type de client : "+", ".join(f"{k[3:]} {v/tot:.1f}" for k,v in sorted(agg.items()) if k.startswith('cl_')))
    print(f"Parties où la règle de placement a dû être assouplie : voisin d'un village {agg['placement_fallback']}, voisin d'une brasserie {agg['placement_adjacent']}")
    print(f"Tournées ouvertes (payantes) par joueur : {agg['tournees']/tot:.1f} ; douanes payées {agg['douanes']/tot:.1f}")
    print("Achats au marché par joueur : "+", ".join(f"{k[6:]} {v/tot:.1f}" for k,v in sorted(agg.items()) if k.startswith('achat_')))
    print("Améliorations (part des joueurs, saison moyenne d'achat 1-12) : "+", ".join(f"{k} {upgcount[k]/tot*100:.0f}% s{upgturn[k]/max(1,upgcount[k])+1:.1f}" for k in UPG if upgcount[k]))
    print()

if __name__=='__main__':
    N=int(sys.argv[1]) if len(sys.argv)>1 else 100
    cfgs={'defaut':None,'v2':dict(v2=True),'v3':dict(v2=True,v3=True),'v2shift':dict(v2=True,order='shift'),'v2catch':dict(v2=True,order='catchup'),'v2b1':dict(v2=True,place_bonus=[0,1,2,3]),'v2r1':dict(v2=True,place_res=1),'v2b2':dict(v2=True,place_bonus=[0,2,4,6]),'v2b4':dict(v2=True,place_bonus=[0,4,8,12]),
          'v2ipa4':dict(v2=True,ipa_price=4),'v2ipa4b2':dict(v2=True,ipa_price=4,place_bonus=[0,2,4,6]),
          'tuile':dict(free_place=True,overflow_end=True,ipa_ferm=2,keep_tile=True),
          'tuile+prod':dict(free_place=True,overflow_end=True,ipa_ferm=2,keep_tile=True,prod_boost=True),
          'tuile+prod+bonus':dict(free_place=True,overflow_end=True,ipa_ferm=2,keep_tile=True,prod_boost=True,place_bonus=[0,2,4,6]),'libre':dict(free_place=True),'libre+stock':dict(free_place=True,overflow_end=True),
          'libre+stock+ipa2':dict(free_place=True,overflow_end=True,ipa_ferm=2),
          'pack':dict(free_place=True,overflow_end=True,ipa_ferm=2,start_ferm=3,start_lev=3,floor=2,recover=2,rep_per_upg=1,stock=8),'bonus':dict(place_bonus=[0,3,6,9]),'carte3+bonus':dict(radius=3,place_bonus=[0,3,6,9]),'carte3':dict(radius=3),'carte3+demarrage':dict(radius=3,start_ferm=3,start_lev=3,floor=2,recover=2,rep_per_upg=1),
          'carte3+4ans':dict(radius=3,years=4),'carte3+demarrage+4ans':dict(radius=3,start_ferm=3,start_lev=3,floor=2,recover=2,rep_per_upg=1,years=4)}
    which=sys.argv[2:] or list(cfgs)
    for k in which:
        n=4
        if ':' in k: k,n=k.split(':'); n=int(n)
        simulate(N,cfg=cfgs[k],n=n)
