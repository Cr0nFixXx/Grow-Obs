# Scene-driven soundtrack synth (E minor, deterministic/seeded). Reads bpm, station boundaries and cue indices
# from the scene JSON ("audio" block + stations[].dur) so the music always follows the picture.
#   python3 audio/audio.py [--scene scenes/promo-60s.json] [--out music.wav]
# audio block: {bpm, drop, breakdown, finale, outro, rolls:[...], arps?, hats16?, stabs?}  (indices refer to stations[])
import numpy as np, json, os, sys
from scipy import signal
from scipy.io import wavfile
KIT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def _arg(n,d):
    return sys.argv[sys.argv.index(n)+1] if n in sys.argv else d
SC=json.load(open(os.path.join(KIT,_arg("--scene","scenes/promo-60s.json"))))
A=SC["audio"]; ST=[0.0]
for _s in SC["stations"]: ST.append(ST[-1]+_s["dur"])
SR=44100; DUR=ST[-1]; N=int(SR*DUR)
BPM=A["bpm"]; BEAT=60/BPM; BAR=4*BEAT
I_DROP,I_BRK,I_FIN,I_OUT=A["drop"],A["breakdown"],A["finale"],A["outro"]
I_ROLLS=A.get("rolls",[]); I_HATS16=A.get("hats16",3); I_ARP=A.get("arps",2); I_STABS=A.get("stabs",[5,I_FIN])
INTRO_KICK=(SC.get("beat",{}).get("on") or [[ST[I_DROP]-BAR*2]])[0][0]   # first kick of the intro build
rng=np.random.default_rng(7)
L=np.zeros(N,dtype=np.float64); R=np.zeros(N,dtype=np.float64)
def add(buf,sig,t0,gain=1.0):
    i=int(t0*SR)
    if i>=N: return
    j=min(N,i+len(sig)); buf[i:j]+=sig[:j-i]*gain
def stereo(sig,t0,gain=1.0,pan=0.0,delay=0.0):
    gl=gain*np.cos((pan+1)*np.pi/4); gr=gain*np.sin((pan+1)*np.pi/4)
    add(L,sig,t0,gl); add(R,sig,t0+delay,gr)
def lp(x,f,o=2): return signal.sosfilt(signal.butter(o,f,'low',fs=SR,output='sos'),x)
def hp(x,f,o=2): return signal.sosfilt(signal.butter(o,f,'high',fs=SR,output='sos'),x)
def bp(x,a,b,o=2): return signal.sosfilt(signal.butter(o,[a,b],'band',fs=SR,output='sos'),x)
def tt(d): return np.arange(int(SR*d))/SR
def mid(m): return 440*2**((m-69)/12)
def saw(f,t,det=0.0): 
    ph=np.cumsum(2*np.pi*f*(1+det)*np.ones_like(t)/SR) if np.isscalar(f) else np.cumsum(2*np.pi*f*(1+det)/SR)
    return 2*((ph/(2*np.pi))%1)-1
def kick(vol=1.0):
    t=tt(.45); f=45+110*np.exp(-t*28); ph=np.cumsum(2*np.pi*f/SR)
    s=np.sin(ph)*np.exp(-t*7.5); s+=0.35*np.sin(ph*2)*np.exp(-t*30)
    s+=0.25*hp(rng.standard_normal(len(t)),2500)*np.exp(-t*200)
    return s*vol
def clap(vol=1.0):
    t=tt(.3); n=bp(rng.standard_normal(len(t)),900,3800)
    env=np.exp(-t*22)+0.8*np.exp(-np.clip(t-.011,0,None)*40)*(t>.011)+0.7*np.exp(-np.clip(t-.022,0,None)*40)*(t>.022)
    return n*env*0.6*vol
def hat(d=.06,vol=1.0):
    t=tt(d*5); n=hp(rng.standard_normal(len(t)),7500,3); return n*np.exp(-t/d*3)*0.35*vol
def bass(f,d=.45,vol=1.0):
    t=tt(d); s=saw(f,t)+0.8*np.sin(2*np.pi*f*t)
    env=np.exp(-t*4.5)*np.minimum(1,t*200)
    cut=lp(s,420+900*np.exp(-t*10).mean()) 
    s=lp(s,500,2)
    return s*env*0.55*vol
def pluck(f,d=.5,vol=1.0,bright=3200):
    t=tt(d); s=saw(f,t)+0.6*saw(f,t,0.004)
    env=np.exp(-t*9)*np.minimum(1,t*500)
    # decaying lowpass via two-band crossfade
    a=lp(s,bright,2); b=lp(s,500,2)
    m=np.exp(-t*14)
    return (a*m+b*(1-m))*env*0.3*vol
def pad(freqs,d,vol=1.0,att=.8,rel=.6,cut=1500):
    t=tt(d); s=np.zeros_like(t)
    for f in freqs:
        for det in (-.006,0,.006):
            s+=saw(f,t,det)
    s=lp(s,cut,2)/ (len(freqs)*3)
    env=np.minimum(1,t/att)*np.minimum(1,(d-t)/rel)
    return s*env*vol
def noise_riser(d,vol=1.0,f0=300,f1=9000):
    t=tt(d); n=rng.standard_normal(len(t)); out=np.zeros_like(t)
    steps=40; seg=len(t)//steps
    for k in range(steps):
        f=f0*(f1/f0)**(k/steps); a=bp(n[k*seg:(k+1)*seg+seg//2],f*.7,min(f*1.5,20000),2)
        out[k*seg:k*seg+len(a)]+=a[:len(out)-k*seg][:len(a)]*0.5
    env=(t/d)**2.2
    tone=np.sin(2*np.pi*np.cumsum(200*(8**(t/d)))/SR)*0.25
    return (out*0.6+tone)*env*vol
def impact(vol=1.0,d=2.2):
    t=tt(d); f=60*np.exp(-t*0.5)+25; ph=np.cumsum(2*np.pi*f/SR)
    s=np.sin(ph)*np.exp(-t*2.0)*1.0
    n=hp(rng.standard_normal(len(t)),3000)*np.exp(-t*2.6)*0.45
    n2=bp(rng.standard_normal(len(t)),200,1200)*np.exp(-t*4)*0.5
    return (s+n+n2)*vol
def sweep_down(d=.5,vol=1.0):
    t=tt(d); n=bp(rng.standard_normal(len(t)),300,8000); return n*np.exp(-t*7)*0.25*vol


# ---------- reverb send buffers
RL=np.zeros(N); RR=np.zeros(N)
def send(sig,t0,amt,pan=0):
    add(RL,sig,t0,amt); add(RR,sig,t0+.011,amt)

ROOT=[mid(40),mid(36),mid(43),mid(38)]            # E2 C2 G2 D2
CH=[[64,67,71],[60,64,67],[62,67,71],[62,66,69]]  # Em C G D
CUTS=ST[1:I_OUT+1]
def chord_at(t): return int(t//BAR)%4
duck=np.ones(N)
def kick_env(t0):
    i=int(t0*SR); n=int(.28*SR); e=1-0.82*np.exp(-np.arange(n)/SR*11)
    j=min(N,i+n); duck[i:j]=np.minimum(duck[i:j],e[:j-i])
BREAK=(ST[I_BRK],ST[I_BRK]+BAR)
def kick_on(t):
    if INTRO_KICK<=t<ST[I_DROP]: return round((t-INTRO_KICK)/BEAT)%1==0 and (t>=INTRO_KICK+1.7 or round((t-INTRO_KICK)/BEAT)%2==0)
    return (ST[I_DROP]<=t<ST[I_OUT] and not (BREAK[0]<=t<BREAK[1])) or (ST[I_OUT]<=t<ST[I_OUT]+BAR*1.0)
def whoosh_up(d=.6,vol=1.0):
    t=tt(d); n=rng.standard_normal(len(t)); out=np.zeros_like(t); steps=24; seg=len(t)//steps
    for k in range(steps):
        f=400*(14**(k/steps)); a=bp(n[k*seg:(k+1)*seg],f*.6,min(f*1.6,19000),2); out[k*seg:k*seg+len(a)]+=a
    return out*(t/d)**1.6*0.5*vol
def whoosh_down(d=.7,vol=1.0): return whoosh_up(d,vol)[::-1]*np.exp(-tt(d)*1.5)*1.2

# pad bed
pL=np.zeros(N); pR=np.zeros(N)
for b in range(int(DUR/BAR)):
    t0=b*BAR; ch=CH[b%4]; freqs=[mid(m-12) for m in ch]+[mid(ch[0])]
    p=pad(freqs,BAR+.4,vol=0.55,att=.4,cut=800+min(1,t0/40)*1800)
    add(pL,p,t0); add(pR,p,t0+.014); send(p,t0,0.28)
# kicks
kicks=[x for x in np.arange(0,DUR,BEAT) if kick_on(x) and not any(c-BEAT*0.99<=x<c for c in CUTS)]
for x in kicks: stereo(kick(1.0),x,0.95); kick_env(x)
# offbeat bass
pat={1:0,3:0,5:12,7:7}
for x in np.arange(ST[I_DROP],ST[I_OUT],BEAT/2):
    if BREAK[0]<=x<BREAK[1]: continue
    idx=int(round((x%BAR)/(BEAT/2)))%8
    if idx in pat: stereo(bass(ROOT[chord_at(x)]*2**(pat[idx]/12),.3,1.0),x,0.8)
for c in CUTS: stereo(bass(ROOT[chord_at(c)],1.3,1.25),c,0.9)
# claps on 2 and 4
for x in np.arange(ST[I_DROP]+BEAT,ST[I_OUT],BEAT*2):
    if BREAK[0]<=x<BREAK[1]: continue
    c=clap(); stereo(c,x,0.7); send(c,x,0.35)
# snare rolls into cuts S3, S5, S7, S8
for end in [ST[i] for i in I_ROLLS]:
    for x in np.arange(end-BAR,end,BEAT/4):
        v=0.2+0.8*((x-(end-BAR))/BAR); stereo(clap(v),x,0.5*v+0.1)
# hats: 8ths from S1, 16ths from S3, double 16ths in finale
for x in np.arange(ST[I_DROP],ST[I_OUT],BEAT): stereo(hat(.05,0.8),x+BEAT/2,0.55,pan=0.25)
for x in np.arange(ST[I_HATS16],ST[I_OUT],BEAT/4): stereo(hat(.028,0.5),x,0.35,pan=-0.2)
# arps
arp=[0,1,2,1,2,1,0,1, 2,1,2,3,2,1,0,1]
for x in np.arange(ST[I_ARP],ST[I_OUT],BEAT/4):
    if BREAK[0]<=x<BREAK[1]-0.5: continue
    bi=chord_at(x); i=int(round((x%BAR)/(BEAT/4)))%16
    ch=CH[bi]+[CH[bi][0]+12]; note=ch[arp[i]%4]+12
    g=0.55*(0.5+0.5*min(1,(x-ST[I_ARP])/18))
    p=pluck(mid(note),.4,g,bright=2400+1800*min(1,(x-ST[I_ARP])/24)); stereo(p,x,0.5,pan=0.4*np.sin(x)); send(p,x,0.35)
# stabs on S5, S7
for c in [ST[i] for i in I_STABS]:
    for k,m in enumerate((64,71,76,79)):
        p=pluck(mid(m),.6,0.8,bright=5200); stereo(p,c+k*BEAT/2,0.5); send(p,c+k*BEAT/2,0.4)
# intro: ring pings (accelerating) + whooshes
for k in range(14):
    x=1.0+5.6*(k/14)**0.8
    p=pluck(mid(76+[0,3,7,12][k%4]),.7,0.55,bright=6500); stereo(p,x,0.5,pan=0.6*np.sin(k*1.7)); send(p,x,0.55)
    w=whoosh_up(.35,0.5); stereo(w,x-.2,0.5,pan=0.5*np.sin(k*2.3))
# outro bells
bell=[71,76,79,83,79,76,71,67]
for k,x in enumerate(np.arange(ST[I_OUT],DUR,BEAT/2)):
    n=bell[k%8]+(12 if k%16>=8 else 0)
    p=pluck(mid(n),.8,0.7*np.exp(-(x-ST[I_OUT])*.28),bright=3600); stereo(p,x,0.5,pan=0.5*np.sin(k)); send(p,x,0.5)
# risers, whooshes, impacts
def riser(t_end,d,vol=1.0):
    r=noise_riser(d,vol); stereo(r,max(0,t_end-d),0.6); send(r,max(0,t_end-d),0.2)
riser(ST[I_DROP],5.0,0.9); riser(BREAK[1],BAR,.8)
for c in CUTS[1:]: riser(c,1.2,.8)
for c in CUTS:
    stereo(whoosh_up(.5,1.0),c-.5,0.6); stereo(whoosh_down(.7,0.9),c,0.6,pan=0.2)
for x,v in ((0.1,.9),)+tuple((c,1.2 if c in (ST[I_DROP],ST[I_OUT]) else 1.0) for c in CUTS):
    im=impact(v,2.4 if v>1 else 1.8); stereo(im,x,0.8); send(im,x,0.3); stereo(sweep_down(.5),x,0.5,pan=0.2)

def make_ir(d=2.4,seed=1):
    r=np.random.default_rng(seed); t=np.arange(int(SR*d))/SR
    ir=r.standard_normal(len(t))*np.exp(-t*2.2); ir=lp(ir,6500,2); ir[:int(.02*SR)]*=np.linspace(0,1,int(.02*SR)); return ir/np.sqrt((ir**2).sum())
wetL=signal.fftconvolve(RL,make_ir(2.4,1))[:N]; wetR=signal.fftconvolve(RR,make_ir(2.4,2))[:N]
L+=pL*duck*0.9; R+=pR*duck*0.9; L+=wetL*0.55; R+=wetR*0.55
mix=np.stack([hp(L,25,2),hp(R,25,2)],axis=1)
mix=mix/np.max(np.abs(mix))*1.8; mix=np.tanh(mix*0.95); mix=mix/np.max(np.abs(mix))*0.89
tt_=np.arange(N)/SR
mix*=(np.clip(tt_/0.25,0,1)*np.clip((DUR-tt_)/1.8,0,1)**1.5)[:,None]
out=_arg("--out",os.environ.get("MUSIC",os.path.expanduser("~/.cache/pm/music.wav"))); os.makedirs(os.path.dirname(out),exist_ok=True)
wavfile.write(out,SR,(mix*32767).astype(np.int16)); print("wrote",out,"peak",np.max(np.abs(mix)))
