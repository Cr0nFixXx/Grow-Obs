import numpy as np
from scipy import signal
from scipy.io import wavfile
SR=44100; DUR=44.0; N=int(SR*DUR)
BPM=120; BEAT=60/BPM
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

# ---------- arrangement
bars=int(DUR/(4*BEAT))+1
ROOT=[mid(33),mid(29),mid(36),mid(31)]            # A1 F1 C2 G1
CH=[[57,60,64],[57,60,65],[60,64,67],[59,62,67]]  # Am F C G (upper voicing)
def chord_at(t): return int(t//(4*BEAT))%4
duck=np.ones(N)
def kick_env(t0):
    i=int(t0*SR); n=int(.32*SR); e=1-0.75*np.exp(-np.arange(n)/SR*9)
    j=min(N,i+n)
    duck[i:j]=np.minimum(duck[i:j],e[:j-i])

# pad bed
pad_buf_L=np.zeros(N); pad_buf_R=np.zeros(N)
for b in range(bars):
    t0=b*4*BEAT
    if t0>=DUR: break
    ch=CH[b%4] if t0>=3 else CH[0]
    freqs=[mid(m-12) for m in ch]+[mid(ch[0])]
    cutoff=900+ min(1,t0/30)*1400
    p=pad(freqs,4*BEAT+.4,vol=0.55,att=.5,cut=cutoff)
    add(pad_buf_L,p,t0); add(pad_buf_R,p,t0+.014)
    send(p,t0,0.25)

# kicks
def kick_on(t):
    if 3<=t<34: return True
    if 34<=t<38: return True
    if 38<=t<42: return (round(t/BEAT)%2==0)
    return False
kicks=[]
t=0.0; k=0
while t<DUR:
    if kick_on(t):
        # drop for 0.5s before bar boundaries of big changes? keep
        kicks.append(t)
    t+=BEAT
# remove kick in the beat right before transitions for a gap
for tb in (12,16,20,24,29): 
    kicks=[x for x in kicks if not (tb-BEAT*0.99<=x<tb)]
for x in kicks:
    stereo(kick(1.0),x,0.95); kick_env(x)
# slams
for x in (3.0,4.0,5.0):
    stereo(bass(mid(33),.9,1.2),x,0.9)
# clap/snare
for x in np.arange(5,34,BEAT):
    if int(round((x/BEAT)))%2==1: 
        c=clap(); stereo(c,x,0.7); send(c,x,0.35)
# snare roll before 34 (33->34)
for k,x in enumerate(np.arange(32.0,34.0,BEAT/4)):
    v=0.25+0.75*((x-32)/2)
    c=clap(v); stereo(c,x,0.55*v+0.1)
for x in np.arange(34,38,BEAT):
    c=clap(); stereo(c,x,0.75); send(c,x,0.3)
# hats
for x in np.arange(4,38,BEAT):
    stereo(hat(.05,0.8),x+BEAT/2,0.55,pan=0.25)
for x in np.arange(34,38,BEAT/4):
    stereo(hat(.03,0.6),x,0.45,pan=-0.2)
for x in np.arange(12,34,BEAT*2):
    stereo(hat(.18,0.9),x+BEAT*1.5,0.5,pan=0.3)
# bass line 7..38
pat=[0,0,12,0, 0,7,0,10]  # semitone offsets per 8th
for x in np.arange(7,38,BEAT/2):
    if 7<=x<38:
        bi=chord_at(x); idx=int(round((x%(4*BEAT))/(BEAT/2)))%8
        if idx in (0,1,3,4,6,7) or True:
            off=pat[idx]
            if idx in (2,5): continue
            f=ROOT[bi]*2**(off/12)
            stereo(bass(f,.38,1.0),x,0.8)
# bass outro sustain
for b in range(int(38/(4*BEAT)),int(42/(4*BEAT))+1):
    stereo(bass(ROOT[b%4]*2,1.9,.9),b*4*BEAT,0.7)
# arps
arp_steps=[0,1,2,1,2,1,0,1, 2,1,2,3,2,1,0,1]
for x in np.arange(7,34,BEAT/4):
    bi=chord_at(x); i=int(round((x%(4*BEAT))/(BEAT/4)))%16
    ch=CH[bi]+[CH[bi][0]+12]
    note=ch[arp_steps[i]%4]+12
    g=0.55*(0.6+0.4*min(1,(x-7)/10))
    p=pluck(mid(note),.45,g,bright=2200+1800*min(1,(x-7)/12))
    stereo(p,x,0.5,pan=0.4*np.sin(x))
    send(p,x,0.35)
# rapid stabs 34-38 ascending
for k,x in enumerate(np.arange(34,38,BEAT)):
    f=[57,60,64,67,69,72,76,79][k]
    for m in (f,f+7,f+12):
        p=pluck(mid(m),.5,0.8,bright=5000); stereo(p,x,0.5); send(p,x,0.4)
# outro bell arp 38-42.5
bell=[69,72,76,81,76,72,69,64]
for k,x in enumerate(np.arange(38.0,43.0,BEAT/2)):
    n=bell[k%8]+ (12 if k%16>=8 else 0)
    p=pluck(mid(n),.8,0.7*np.exp(-(x-38)*.25),bright=3500); stereo(p,x,0.5,pan=0.5*np.sin(k)); send(p,x,0.5)
# risers & impacts
def riser(t_end,d,vol=1.0):
    r=noise_riser(d,vol); stereo(r,t_end-d,0.6); send(r,t_end-d,0.2)
riser(3.0,2.0,0.9); riser(7.0,1.0,.8); riser(12.0,1.0,.8); riser(16.0,1.0,.8); riser(20.0,1.0,.8); riser(24.0,1.0,.8); riser(29.0,1.0,.8); riser(34.0,2.0,1.0); riser(38.0,1.0,.7)
for x,v in ((0.12,.7),(3.0,1.1),(7.0,1.0),(12.0,.9),(16.0,.9),(20.0,.9),(24.0,.9),(29.0,.95),(34.0,1.2),(38.0,1.2)):
    im=impact(v,2.4 if v>1 else 1.8); stereo(im,x,0.8); send(im,x,0.3)
    sweep=sweep_down(.5); stereo(sweep,x,0.5,pan=0.2)
# intro bloop plucks
for x,n in ((1.2,69),(1.55,76),(1.9,81),(2.25,88)):
    p=pluck(mid(n),.9,0.8,bright=6000); stereo(p,x,0.5,pan=0.3); send(p,x,0.6)

# ---------- reverb IR
def make_ir(d=2.2,seed=1):
    r=np.random.default_rng(seed); t=np.arange(int(SR*d))/SR
    ir=r.standard_normal(len(t))*np.exp(-t*2.3); ir=lp(ir,6500,2); ir[:int(.02*SR)]*=np.linspace(0,1,int(.02*SR)); return ir/np.sqrt((ir**2).sum())
irL=make_ir(2.2,1); irR=make_ir(2.2,2)
wetL=signal.fftconvolve(RL,irL)[:N]; wetR=signal.fftconvolve(RR,irR)[:N]

# ---------- mix
padg=duck**1.0
L+=pad_buf_L*padg*0.9; R+=pad_buf_R*padg*0.9
L+=wetL*0.55; R+=wetR*0.55
# fix: duck bass+pluck lightly handled through arrangement; add global gentle compress
mix=np.stack([L,R],axis=1)
# master: highpass 25Hz, soft clip
mix=np.stack([hp(mix[:,0],25,2),hp(mix[:,1],25,2)],axis=1)
peak=np.max(np.abs(mix)); mix=mix/peak*1.8
mix=np.tanh(mix*0.95)
mix=mix/np.max(np.abs(mix))*0.89
# fades
tt_=np.arange(N)/SR
fin=np.clip(tt_/0.25,0,1); fout=np.clip((DUR-tt_)/1.2,0,1)**1.5
mix*= (fin*fout)[:,None]
wavfile.write("promo/music.wav",SR,(mix*32767).astype(np.int16))
print("peak",np.max(np.abs(mix)),"rms",np.sqrt((mix**2).mean()))
