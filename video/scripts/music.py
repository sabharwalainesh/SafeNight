"""Original synthesized nine-second major-key cue + quiet exterior texture. No samples."""
import math,random,wave
from array import array
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'public'/'audio';root.mkdir(parents=True,exist_ok=True)
sr=44100; random.seed(17)
def write(name,values):
 with wave.open(str(root/name),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(sr);f.writeframes(array('h',(int(max(-1,min(1,x))*32767) for x in values)).tobytes())
chords=[(261.63,329.63,392),(220,261.63,329.63),(174.61,220,261.63),(196,246.94,293.66)]
melody=[523.25,659.25,783.99,659.25,440,523.25,659.25,523.25,698.46,659.25,523.25,440,587.33,783.99,659.25,587.33]
score=[];air=[];smooth=0
for i in range(9*sr):
 t=i/sr;beat=t%0.5;half=t%0.25;bar=int(t/2)%4;chord=chords[bar]
 pluck=sum(math.sin(2*math.pi*hz*beat)*math.exp(-beat*9) for hz in chord)*.07
 note=melody[int(t/.5)%len(melody)];lead=(math.sin(2*math.pi*note*beat)+.2*math.sin(4*math.pi*note*beat))*.1*math.exp(-beat*6)
 bass=.12*math.sin(2*math.pi*(chord[0]/2)*beat)*math.exp(-beat*5)
 kick=.18*math.sin(2*math.pi*(60*beat+2*(1-math.exp(-beat*30))))*math.exp(-beat*24)
 hat=random.uniform(-1,1)*.045*math.exp(-half*100)
 score.append((pluck+lead+bass+kick+hat)*min(1,t/.025))
 smooth=.994*smooth+.006*random.uniform(-1,1)
 air.append(smooth*.15)
write('opening-happy.wav',score);write('outside-ambience.wav',air)
print('Wrote original upbeat opening and quiet exterior ambience; hard cut at 9 seconds.')
