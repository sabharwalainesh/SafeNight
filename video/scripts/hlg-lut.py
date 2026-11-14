import math
p='/Users/aineshsab/SafeNight/video/public/hlg-to-sdr.cube'
def inv(x):return x*x/3 if x<=.5 else (math.exp((x-.55991073)/.17883277)+.28466892)/12
with open(p,'w') as f:
 f.write('TITLE "HLG to SDR BT709"\nLUT_3D_SIZE 33\n')
 for b in range(33):
  for g in range(33):
   for r in range(33):
    R,G,B=[inv(x/32) for x in (r,g,b)]; Y=.2627*R+.678*G+.0593*B
    gain=10*max(Y,1e-8)**.2;R*=gain;G*=gain;B*=gain
    rgb=[1.6605*R-.5876*G-.0728*B,-.1246*R+1.1329*G-.0083*B,-.0182*R-.1006*G+1.1187*B]
    lum=max(.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2],0);k=1/(1+lum)
    vals=[max(0,min(1,x*k)) for x in rgb]
    vals=[12.92*x if x<=.0031308 else 1.055*x**(1/2.4)-.055 for x in vals]
    f.write(' '.join(str(x) for x in vals)+'\n')
