import subprocess,json,pathlib
names=['IMG_2447.mov','IMG_2442.mov','IMG_2443.MOV','IMG_2444.mov','IMG_6794.mov','IMG_6794 2.MOV','IMG_6799 2.mov']
out=pathlib.Path('/Users/aineshsab/SafeNight/video/public/clips');out.mkdir(exist_ok=True)
for i,name in enumerate(names,1):
 src='/Users/aineshsab/Downloads/'+name
 probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-of','json',src]))
 v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s.get('codec_name')=='aac')
 vf='scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1'
 if v.get('color_transfer')=='arib-std-b67':vf=vf+',format=rgb24,lut3d=/Users/aineshsab/SafeNight/video/public/hlg-to-sdr.cube,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709'
 p=subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',src,'-map','0:v:0','-map',f'0:{a["index"]}','-vf',vf,'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-af','highpass=f=75,loudnorm=I=-18:TP=-2:LRA=11','-movflags','+faststart',str(out/f'scene-{i}.mp4')]);print(i,p.returncode,flush=True)
