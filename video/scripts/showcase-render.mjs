import {existsSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const film=JSON.parse(readFileSync('src/showcase.json'));
let last=0;
for(const s of film.shots){if(s.start!==last)throw Error(`Gap before ${s.id}`);last=s.end;if(s.clip){const p=`public/clips/${s.clip}`;if(!existsSync(p))throw Error(`Missing ${p}`);const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',p],{encoding:'utf8'});const d=JSON.parse(r.stdout).format.duration;if(+d<(s.end-s.start)+(s.trim||0)-.05)throw Error(`Short footage: ${s.id}`);}}
if(last!==180)throw Error('Timeline must be exactly 180 seconds');
const caps=JSON.parse(readFileSync('src/showcase-captions.json'));let end=0;for(const c of caps){if(c.start<end-.001||c.end<=c.start||c.end>180)throw Error('Invalid subtitle timing');end=c.end;}
const final=process.argv.includes('--final');
const narration=JSON.parse(readFileSync('src/narration.json'));
for(const n of narration){const file=`public/audio/narration/${n.id}.wav`;if(!existsSync(file)){if(final)throw Error(`Missing your narration: ${file}`);continue;}const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file],{encoding:'utf8'});if(+JSON.parse(r.stdout).format.duration>n.end-n.start+.05)throw Error(`Narration ${n.id} exceeds its slot; adjust timing before export.`);}
if(process.argv.includes('--check')){console.log('180 seconds; all supplied footage segments present; subtitle cues valid.');process.exit(0);}
const output=`out/SafeNight-product-showcase-${final?'final':'review'}.mp4`;
const r=spawnSync('node_modules/.bin/remotion',['render','src/index.tsx','SafeNight',output,'--codec=h264','--pixel-format=yuv420p','--concurrency=4','--crf=18'],{stdio:'inherit'});process.exit(r.status??1);
