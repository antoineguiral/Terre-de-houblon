"""Brassins version table : pose d'ouvriers, clients en cartes, prix partagés. IA gloutonne.
Usage : python3 table.py [parties] [joueurs] [variante]"""
import random, statistics as stt, sys, collections

STYLES=['blonde','ipa','stout','garde']
REC={'blonde':dict(malt=2,houb=1,lev=1,ferm=1,prix=3,rep=1),'ipa':dict(malt=2,houb=3,lev=1,ferm=2,prix=5,rep=2),
     'stout':dict(malt=3,houb=1,lev=1,ferm=2,prix=6,rep=3,exige='touraille'),'garde':dict(malt=3,houb=1,lev=1,ferm=3,prix=7,rep=4)}
MAT=['malt','houb','lev']; ACHAT={'malt':2,'houb':2,'lev':3}
# production des cases par saison P E A H
CASES0={'gchamp':('malt',[2,3,3,0]),'pchamp':('malt',[1,2,2,0]),'ghoub':('houb',[1,1,3,0]),'phoub':('houb',[0,1,2,0])}
CASES1={'gchamp':('malt',[3,4,4,0]),'pchamp':('malt',[2,3,3,0]),'ghoub':('houb',[2,2,4,0]),'phoub':('houb',[1,2,3,0])}
CASES2={'champA':('malt',[3,4,4,0]),'champB':('malt',[3,4,4,0]),'houbA':('houb',[2,2,4,0]),'houbB':('houb',[2,2,4,0])}
CASES=CASES0
UPG0={'cuve':8,'ferm':6,'touraille':6,'embauche':10,'camion':8,'salle':10}
UPG1={'cuve':6,'ferm':4,'touraille':4,'embauche':7,'camion':5,'salle':7}
UPG=UPG0
SAISONS=['printemps','ete','automne','hiver']
CARTES={0:[('doux',{},['blonde','ipa'],None),('pluvieux',{'champ':1},['blonde','garde'],None),('froid',{'houb':-1},['stout','ipa'],'contam')],
        1:[('bel',{},['blonde','ipa'],None),('canicule',{'champ':-1},['blonde','stout'],'canicule'),('orageux',{'houb':-1},['ipa','garde'],None)],
        2:[('recolte',{'houb':1},['ipa','stout'],None),('humide',{},['stout','garde'],'concours'),('sec',{'champ':-1},['garde','ipa'],None)],
        3:[('tranquille',{},['stout','garde'],None),('rude',{},['garde','blonde'],'douanes'),('fete',{},['blonde','stout'],'fete')]}
STOCK_MAX=6; NB=12; DIV={3:2,4:5}; ARGENT_PT=8

def deck_clients(R):
    d=[]
    for _ in range(8): d.append(dict(kind='bar',style=None,n=1,bonus=0,rep=1))
    for st in STYLES:
        for _ in range(3): d.append(dict(kind='bar',style=st,n=1,bonus=1,rep=2))
    for st,rep in (('stout',3),('garde',4)):
        for _ in range(4): d.append(dict(kind='cave',style=st,n=1,bonus=3,rep=rep))
    fest={0:['blonde','ipa','blonde'],1:['blonde','ipa','ipa'],2:['stout','ipa','garde'],3:['garde','stout','stout']}
    for s,l in fest.items():
        for st in l: d.append(dict(kind='fest',style=st,n=2,bonus=1,rep=2,saison=s))
    R.shuffle(d); return d

class P:
    def __init__(s,i):
        s.i=i; s.res={'malt':3,'houb':2,'lev':2}; s.argent=5; s.ouv=2; s.nferm=2; s.ferms=[]; s.cuve=2; s.stock=collections.Counter()
        s.upg=set(); s.rep=0; s.styles=set(); s.clients=[]; s.stats=collections.Counter()
    def u(s): return sum(s.stock.values())

class G:
    def __init__(s,n=4,seed=0,var=None):
        s.R=random.Random(seed); s.n=n; s.var=var or {}; s.P=[P(i) for i in range(n)]
        global CASES,UPG; CASES=CASES2 if s.var.get('egal') else CASES1 if s.var.get('prod') else CASES0; UPG=UPG1 if s.var.get('upg') else UPG0
        if s.var.get('kit'):
            for p in s.P: p.res=dict(s.var['kit'])
        s.tslots=['tournee%d'%k for k in range(s.var.get('tournees',2))]
        global REC; REC={'blonde':dict(malt=2,houb=1,lev=1,ferm=1,prix=3,rep=1),'ipa':dict(malt=2,houb=3,lev=1,ferm=2,prix=5,rep=2),
             'stout':dict(malt=3,houb=1,lev=1,ferm=2,prix=6,rep=3,exige='touraille'),'garde':dict(malt=3,houb=1,lev=1,ferm=3,prix=7,rep=4)}
        if s.var.get('rec'): REC['ipa']['houb']=2; REC['garde']['malt']=4
        if s.var.get('nolev'):
            for r in REC.values(): r['lev']=0
        s.fermmax=s.var.get('fermmax',4)
        for p in s.P: p.ouv=s.var.get('ouv',2); p.cuve=s.var.get('cuve',2)
        s.deck=deck_clients(s.R); s.file=[s.deck.pop() for _ in range(s.var.get('file',5))]; s.defausse=[]
        s.prix={st:REC[st]['prix'] for st in STYLES}; s.cards={k:s.R.sample(v,3) for k,v in CARTES.items()}
        s.log=collections.Counter(); s.first=s.R.randrange(n)
        for k in range(1,n):
            p=s.P[(s.first+k)%n]; p.argent+=k*s.var.get('comp_argent',0)
            if s.var.get('comp_mat'): p.res['malt']+=k; p.res['houb']+=(k>=2)
            p.rep+=s.var.get('comp_rep',{}).get(k,0)
            cm=s.var.get('comp')
            if cm: 
                for m,q in cm.get(k,{}).items(): p.res[m]+=q
    def run(s):
        for t in range(NB):
            s.t=t; s.si=t%4
            if s.var.get('des'):
                meteo=s.R.randint(1,6); ev=s.R.randint(1,6)
                mod={} if 2<=meteo<=5 else {'champ':1,'houb':1} if meteo==6 else {'champ':-1,'houb':-1}
                DEM={0:['blonde','ipa'],1:['blonde','ipa'],2:['stout','ipa'],3:['stout','garde']}
                EVT={0:{3:'mildiou',4:'contam',5:'critique',6:'invite'},1:{3:'canicule',4:'fete_prix',5:'penurie',6:'inspection'},
                     2:{3:'recolte',4:'mairie',5:'concours',6:'salon'},3:{3:'greve',4:'douanes',5:'noel',6:'fete_village'}}
                e=EVT[s.si].get(ev); s.carte=('dés',mod,DEM[s.si],e); s.log['evt_'+str(e)]+=1
            else: s.carte=s.cards[s.si][t//4]
            s.demande=s.carte[2]
            s.saison_debut(); s.poses(); s.saison_fin()
        return s.scores()
    # ---- saison
    def saison_debut(s):
        for p in s.P:
            done=[f for f in p.ferms if f['left']<=0]; p.ferms=[f for f in p.ferms if f['left']>0]
            for f in done: p.stock[f['st']]+=f['u']; p.res['lev']+=1
        ev=s.carte[3]
        if ev in('contam','canicule'):
            for p in s.P:
                if not p.ferms: continue
                f=min(p.ferms,key=lambda f:f['u']*REC[f['st']]['prix']); f['u']=max(0,f['u']-1); p.stats['perte']+=1
        elif ev=='douanes':
            for p in s.P: n=min(p.argent,p.u()//3); p.argent-=n
        elif ev=='concours':
            notes=[]
            for p in s.P:
                if not p.u(): continue
                st=max(p.stock,key=lambda x:REC[x]['rep']+(x in s.demande)); p.stock[st]-=1
                if p.stock[st]==0: del p.stock[st]
                notes.append((REC[st]['rep']+(st in s.demande),p))
            vals=sorted(set(v for v,_ in notes),reverse=True)
            for v,p in notes:
                if v==vals[0]: p.rep+=5; p.stats['concours']+=5
                elif len(vals)>1 and v==vals[1]: p.rep+=2; p.stats['concours']+=2
        s.occ={}  # case -> joueur
        s.ferme=set(); s.prix_bonus=0; s.critique=False; s.invite=False
        if ev in('fete','noel'): s.file+= [s.deck.pop() for _ in range(2) if s.deck]
        if ev=='fete_village': s.file+= [s.deck.pop() for _ in range(2) if s.deck]; s.prix_bonus=1
        if ev=='fete_prix': s.prix_bonus=1
        if ev=='mildiou': s.ferme={'ghoub','phoub','houbA','houbB'}
        if ev=='penurie': s.ferme={'marche_mat'}
        if ev=='greve': s.ferme=set(s.tslots)
        if ev=='recolte': s.carte=(s.carte[0],{'champ':s.carte[1].get('champ',0)+1,'houb':s.carte[1].get('houb',0)+1},s.carte[2],ev)
        if ev=='critique': s.critique=True
        if ev=='invite': s.invite=True
        if ev=='salon':
            notes=[]
            for p in s.P:
                if not p.u(): continue
                st=max(p.stock,key=lambda x:REC[x]['rep']+(x in s.demande)); p.stock[st]-=1
                if p.stock[st]==0: del p.stock[st]
                notes.append((REC[st]['rep']+(st in s.demande),p))
            vals=sorted(set(v for v,_ in notes),reverse=True)
            for v,p in notes:
                if v==vals[0]: p.rep+=8; p.stats['concours']+=8
                elif len(vals)>1 and v==vals[1]: p.rep+=3; p.stats['concours']+=3
        if ev=='inspection':
            for p in s.P:
                for f in p.ferms: f['u']=max(0,f['u']-1); p.stats['perte']+=1
        if ev=='mairie': s.file.append(dict(kind='mairie',style=s.R.choice(STYLES),n=3,bonus=2,rep=4))
    def saison_fin(s):
        for p in s.P:
            for f in p.ferms: f['left']-=1
            if 'salle' in p.upg and s.si==3: p.rep+=1
            while p.u()>STOCK_MAX:
                st=max(p.stock,key=lambda x:s.prix[x]); s.vendre(p,st,1,force=True)
        for st in STYLES: s.prix[st]=min(REC[st]['prix'],s.prix[st]+1)
        if s.file and s.var.get('rot',True): s.defausse.append(s.file.pop(0)); s.log['pourris']+=1
        while len(s.file)<s.var.get('file',5) and s.deck: s.file.append(s.deck.pop())
        if not s.deck: s.deck=s.defausse; s.R.shuffle(s.deck); s.defausse=[]
    # ---- poses
    def ordre(s):
        if s.t==0: f=s.first
        elif s.var.get('order')=='rot': f=(s.first+s.t)%s.n
        elif s.var.get('order')=='rot2': f=(s.first+s.t+s.t//4)%s.n
        elif s.var.get('order')=='rotback': f=(s.first-s.t)%s.n
        elif s.var.get('order')=='rotback2': f=(s.first-s.t-s.t//4)%s.n
        else: f=min(range(s.n),key=lambda i:(s.P[i].rep,s.P[i].argent,s.R.random()))
        return [(f+k)%s.n for k in range(s.n)]
    def poses(s):
        left={p.i:p.ouv for p in s.P}; order=s.ordre()
        snake=s.var.get('snake')=='all' or (s.var.get('snake')=='first' and s.t==0)
        tour=0
        while any(left.values()):
            seq=order if (not snake or tour%2==0) else list(reversed(order)); tour+=1
            for i in seq:
                if not left[i]: continue
                p=s.P[i]
                s.brasser(p)
                c=s.choix(p)
                if c is None: p.stats['passe']+=1; left[i]=0; continue
                s.occ[c]=i; left[i]-=1; p.stats['case_'+c]+=1; s.agir(p,c)
                s.brasser(p)
    def dispo(s,c):
        if c in getattr(s,'ferme',()): return False
        if c in s.var.get('libres',()): return True
        return c not in s.occ
    def prod(s,c):
        m,tab=CASES[c]; q=tab[s.si]; mod=s.carte[1].get('champ' if m=='malt' else 'houb',0)
        if s.t==0 and s.var.get('p1'): q=min(q,s.var['p1'])
        return m,(max(0,q+mod) if q else 0)
    def besoin(s,p):
        """matières manquantes pour le prochain brassin souhaité"""
        plan=s.plan(p)
        if not plan: return {}
        r=REC[plan]; return {m:max(0,r[m]-p.res[m]) for m in MAT}
    def plan(s,p):
        if len(p.ferms)>=p.nferm: return None
        best=None
        for st in STYLES:
            r=REC[st]
            if r['ferm']>NB-s.t-1: continue
            if r.get('exige') and r['exige'] not in p.upg and not getattr(s,'invite',False): continue
            miss=sum(max(0,r[m]-p.res[m]) for m in MAT)
            want=sum(1 for c in s.file if c['style'] in(None,st))
            v=(p.cuve*(r['prix']+2.2*r['rep'])+1.5*want+(3 if st not in p.styles else 0))/(r['ferm']**0.65)-1.5*miss
            if best is None or v>best[0]: best=(v,st)
        return best and best[1]
    def brasser(s,p):
        while len(p.ferms)<p.nferm:
            st=s.plan(p)
            if not st or any(p.res[m]<REC[st][m] for m in MAT): return
            if REC[st].get('exige') and REC[st]['exige'] not in p.upg and not getattr(s,'invite',False): return
            for m in MAT: p.res[m]-=REC[st][m]
            u=p.cuve
            if s.var.get('de_brassage'):
                d=s.R.randint(1,6)
                if d==1: u-=1; p.stats['rate']+=1
                elif d==6: u+=1; p.stats['cuvee']+=1
            p.ferms.append(dict(st=st,left=REC[st]['ferm'],u=u)); p.stats['brew_'+st]+=1
            if st not in p.styles: p.styles.add(st); p.rep+=1
    def livrable(s,p,c):
        if c['style'] is None: return max((st for st in STYLES if p.stock[st]>=c['n']),key=lambda st:s.prix[st],default=None)
        return c['style'] if p.stock[c['style']]>=c['n'] else None
    def val_client(s,p,c):
        st=s.livrable(p,c)
        if not st: return None
        rep=c['rep']+(1 if st in s.demande else 0)+(2 if c['kind']=='fest' and c['saison']==s.si else 0)
        arg=c['n']*(REC[st]['prix']+c['bonus']+getattr(s,'prix_bonus',0))
        if c['kind']=='cave' and getattr(s,'critique',False): rep+=3
        return arg+2.2*rep,st,arg,rep
    def choix(s,p):
        opts=[]
        rem=NB-s.t
        # tournées
        best_cl=max([s.val_client(p,c) or (0,) for c in s.file]+[(0,)],key=lambda x:x[0])
        if best_cl[0]>0:
            for c in s.tslots:
                if s.dispo(c): opts.append((best_cl[0]+ (3 if 'camion' in p.upg else 0),c)); break
            else: p.stats['tournee_bloquee']+=1
        # champs
        need=s.besoin(p)
        for c in CASES:
            if not s.dispo(c): continue
            m,q=s.prod(c)
            if not q: continue
            v=q*ACHAT[m]*(1.0 if need.get(m,0)>0 else 0.45)
            opts.append((v,c))
        if s.dispo('levurerie') and not s.var.get('nolev'): opts.append(((3.5 if p.res['lev']==0 else 1.0),'levurerie'))
        if s.dispo('marche_mat') and p.argent>=4:
            tot=sum(need.values())
            if tot: opts.append((min(3,tot)*2.2 if p.argent>=sum(ACHAT[m]*n for m,n in need.items()) else 1,'marche_mat'))
        if s.dispo('marche_bieres') and p.u()>0:
            v=sum(s.prix[st]*min(p.stock[st],2) for st in STYLES)*0.5
            if p.u()>=4 or p.argent<3: v*=1.6
            opts.append((v,'marche_bieres'))
        if s.dispo('chantier') and rem>2:
            u=s.meilleur_upg(p)
            if u: opts.append((u[0],'chantier'))
        if not opts: return None
        opts.sort(reverse=True)
        v,c=opts[0]
        if v<s.var.get('seuil',1.2): return None
        return c
    def meilleur_upg(s,p):
        rem=NB-s.t-1; best=None
        for u,cout in UPG.items():
            if u in p.upg and u!='ferm': continue
            if u=='ferm' and p.nferm>=s.fermmax: continue
            if cout>p.argent-2: continue
            gain={'cuve':rem*2.5,'ferm':rem*(1.8 if len(p.ferms)>=p.nferm else 0.5),'touraille':rem*1.2,'embauche':rem*2.0,'camion':rem*1.0,'salle':rem*1.3+rem//4*2}[u]
            if gain-cout>0 and (best is None or gain-cout>best[0]): best=(gain-cout,u)
        return best
    def vendre(s,p,st,n,force=False):
        for _ in range(n):
            if p.stock[st]<=0: break
            pr=s.prix[st]+(2 if st in s.demande else 0)+getattr(s,'prix_bonus',0); p.stock[st]-=1; p.argent+=pr; s.prix[st]=max(1,s.prix[st]-1)
            p.stats['vendu']+=1; p.stats['argent_marche']+=pr
            if force: p.stats['force']+=1
        if p.stock[st]<=0 and st in p.stock: del p.stock[st]
    def agir(s,p,c):
        if c in CASES:
            m,q=s.prod(c); p.res[m]+=q; return
        if c=='levurerie':
            p.res['lev']+=1
            if p.argent>=2 and p.res['lev']<2: p.argent-=2; p.res['lev']+=1
            return
        if c=='marche_mat':
            need=s.besoin(p); n=0
            for m in MAT:
                while need.get(m,0)>0 and n<s.var.get('achat',3) and p.argent>=ACHAT[m]:
                    p.argent-=ACHAT[m]; p.res[m]+=1; need[m]-=1; n+=1; p.stats['achat']+=1
            return
        if c.startswith('tournee'):
            k=2 if 'camion' in p.upg else 1
            for _ in range(k):
                best=None
                for idx,cl in enumerate(s.file):
                    v=s.val_client(p,cl)
                    if v and (best is None or v[0]>best[0][0]): best=(v,idx)
                if not best: break
                (v,st,arg,rep),idx=best; cl=s.file.pop(idx)
                p.stock[st]-=cl['n']
                if p.stock[st]<=0: del p.stock[st]
                p.argent+=arg; p.rep+=rep; p.clients.append(cl); p.stats['cl_'+cl['kind']]+=1; p.stats['rep_cl']+=rep
                if cl['kind']=='cave' and getattr(s,'critique',False): s.critique=False
                if s.deck: s.file.append(s.deck.pop())
            return
        if c=='marche_bieres':
            keep=1 if any(s.livrable(p,cl) for cl in s.file) else 0
            while p.u()>keep:
                st=max(p.stock,key=lambda x:s.prix[x]+(2 if x in s.demande else 0))
                if s.prix[st]<2 and p.u()<=STOCK_MAX-1: break
                s.vendre(p,st,1)
            return
        if c=='chantier':
            u=s.meilleur_upg(p)
            if not u: return
            u=u[1]; p.argent-=UPG[u]; p.stats['upg_'+u]+=1
            if u=='ferm': p.nferm+=1
            else:
                p.upg.add(u)
                if u=='cuve': p.cuve=s.var.get('cuve',2)+1
                if u=='embauche': p.ouv=3
    def scores(s):
        out=[]
        for p in s.P:
            d=max([v for k,v in DIV.items() if len(p.styles)>=k],default=0)
            p.stats['div']=d; p.stats['pts_argent']=p.argent//ARGENT_PT
            out.append(p.rep+d+p.argent//ARGENT_PT)
        return out

def simulate(N=200,n=4,var=None):
    sc=[]; spreads=[]; wins=collections.Counter(); agg=collections.Counter(); rep=[]; pour=0
    for g in range(N):
        G_=G(n,g,var); r=G_.run(); sc+=r; spreads.append(max(r)-min(r)); wins[r.index(max(r))]+=1; pour+=G_.log['pourris']
        for p in G_.P: agg.update(p.stats); rep.append(p.rep)
    P_=N*n
    print(f"=== {N} parties à {n}, variante {var or 'base'} ===")
    print(f"Score {stt.mean(sc):.1f} (σ {stt.pstdev(sc):.1f}, min {min(sc)}, max {max(sc)}), écart 1er-dernier {stt.mean(spreads):.1f} ; victoires par siège {' / '.join(f'{wins[i]/N*100:.0f}%' for i in range(n))}")
    print(f"Points : réputation {stt.mean(rep):.1f} (clients {agg['rep_cl']/P_:.1f}, concours {agg['concours']/P_:.1f}), diversité {agg['div']/P_:.1f}, argent {agg['pts_argent']/P_:.1f}")
    print("Brassins : "+", ".join(f"{st} {agg['brew_'+st]/P_:.1f}" for st in STYLES)+f" ; pertes {agg['perte']/P_:.1f}")
    print(f"Clients livrés : bars {agg['cl_bar']/P_:.1f}, caves {agg['cl_cave']/P_:.1f}, festivals {agg['cl_fest']/P_:.1f} ; clients pourris par partie {pour/N:.1f} ; tournée voulue mais bloquée {agg['tournee_bloquee']/P_:.1f} fois")
    print(f"Marché : {agg['vendu']/P_:.1f} u vendues à {agg['argent_marche']/max(1,agg['vendu']):.1f} (dont forcées {agg['force']/P_:.1f}) ; achats de matières {agg['achat']/P_:.1f} ; ouvriers passés {agg['passe']/P_:.1f}")
    print("Cases : "+", ".join(f"{k[5:]} {v/P_:.1f}" for k,v in sorted(agg.items()) if k.startswith('case_')))
    print("Équipements : "+", ".join(f"{u} {agg['upg_'+u]/P_*100:.0f}%" for u in UPG)); print()

if __name__=='__main__':
    N=int(sys.argv[1]) if len(sys.argv)>1 else 200; n=int(sys.argv[2]) if len(sys.argv)>2 else 4
    V={'base':None,'A':dict(prod=1,seuil=0.3,tournees=4,upg=1,libres=('marche_bieres','chantier'),rec=1),
       'B':dict(prod=1,seuil=0.3,tournees=4,upg=1,libres=('marche_bieres','chantier'),rec=1,fermmax=3),
       'C':dict(prod=1,seuil=0.3,tournees=4,upg=1,libres=('marche_bieres','chantier'),rec=1,fermmax=3,rot=False),'t4':dict(prod=1,seuil=0.3,tournees=4),'t4+upg':dict(prod=1,seuil=0.3,tournees=4,upg=1),
       't4+upg+libres':dict(prod=1,seuil=0.3,tournees=4,upg=1,libres=('marche_bieres','chantier')),
       't4+upg+libres+3ouv':dict(prod=1,seuil=0.3,tournees=4,upg=1,libres=('marche_bieres','chantier'),ouv=3),'prod':dict(prod=1,seuil=0.3),'prod+3ouv':dict(prod=1,seuil=0.3,ouv=3),'prod+cuve3':dict(prod=1,seuil=0.3,cuve=3),'prod+3ouv+cuve3':dict(prod=1,seuil=0.3,ouv=3,cuve=3)}
    for k in (sys.argv[3:] or V): simulate(N,n,V[k])
