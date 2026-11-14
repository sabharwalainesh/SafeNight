"""Prepare real supplied phone footage; holds repeat only the last frame, not the scene."""
import subprocess,pathlib,json
root=pathlib.Path(__file__).resolve().parents[1];src=pathlib.Path('/Users/aineshsab/Downloads/ScreenRecording_11-08-2026 07-38-03_1.mov')
out=root/'public/clips'
shots=[('group',0,2.5,7),('actions',2.9,.5,5),('messages',5.8,2.7,5),('plan',8.5,3.5,7),('accept',12,5.5,8),('route',18,11,11),('compass',32,5.5,7),('chat',44,9,9),('arrival',61,8,8)]
for name,start,play,duration in shots:
 dest=out/f'product-{name}.mp4'
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(src),'-t',str(duration),'-an','-vf',f'trim=duration={play},setpts=PTS-STARTPTS,fps=30,scale=720:-2,tpad=stop_mode=clone:stop_duration={duration-play},setsar=1','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(dest)],check=True)
 # A precise still for magnified detail: use final visible frame (or a selected map/chat frame).
 focus=start+play-.1
 if name=='route':focus=25
 if name=='chat':focus=50
 if name=='arrival':focus=66
 subprocess.run(['ffmpeg','-v','error','-y','-ss',str(focus),'-i',str(src),'-frames:v','1','-vf','scale=1000:-2',str(root/f'public/clips/product-{name}.jpg')],check=True)
 print(name,flush=True)
# Deliberate pause / scroll / pause for the group overview.
subprocess.run(['ffmpeg','-v','error','-y','-i',str(src),'-filter_complex','[0:v]trim=start=0:end=1.2,setpts=PTS-STARTPTS,fps=30,scale=720:-2,tpad=stop_mode=clone:stop_duration=2.5[a];[0:v]trim=start=1.2:end=2.5,setpts=PTS-STARTPTS,fps=30,scale=720:-2,tpad=stop_mode=clone:stop_duration=2[b];[a][b]concat=n=2:v=1:a=0[v]','-map','[v]','-an','-t','7','-c:v','libx264','-crf','17','-pix_fmt','yuv420p',str(out/'product-group.mp4')],check=True)
subprocess.run(['ffmpeg','-v','error','-y','-ss','18','-i',str(src),'-frames:v','1','-vf','scale=720:-2',str(out/'product-route-first.jpg')],check=True)
