"""Original 32-second instrumental underscore, synthesized without samples."""
import numpy as np,wave
from pathlib import Path
sr=44100;n=32*sr;t=np.arange(n)/sr;rng=np.random.default_rng(17);out=np.zeros(n)
chords=[[130.81,164.81,196,246.94],[110,130.81,164.81,196],[87.31,130.81,174.61,220],[98,146.83,196,246.94]]
for bar in range(8):
 start=bar*4;local=t-start;mask=(local>=0)&(local<4);x=local[mask];ch=chords[bar%4]
 env=np.minimum(x/.7,1)*np.minimum((4-x)/.7,1)
 pad=sum(np.sin(2*np.pi*h*x)+.2*np.sin(2*np.pi*(h*1.002)*x) for h in ch)*.025*env
 out[mask]+=pad
 for k in range(8):
  z=x-k*.5;active=z>=0;pluck=np.zeros(len(x));freq=ch[k%4]*4
  pluck[active]=np.sin(2*np.pi*freq*z[active])*np.exp(-z[active]*7)*.09
  out[mask]+=pluck
 for k in range(4):
  z=x-k;active=z>=0;beat=np.zeros(len(x));beat[active]=.07*np.sin(2*np.pi*(52*z[active]+2*(1-np.exp(-z[active]*25))))*np.exp(-z[active]*20);out[mask]+=beat
out*=np.minimum(t/.5,1)*np.minimum((32-t)/.5,1)
p=Path(__file__).resolve().parents[1]/'public/audio/underscore.wav'
with wave.open(str(p),'w') as f:f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes((np.clip(out,-1,1)*32767).astype('<i2').tobytes())
