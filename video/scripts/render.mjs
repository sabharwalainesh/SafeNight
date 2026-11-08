import {existsSync,mkdirSync,readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const film=JSON.parse(readFileSync('src/film.json','utf8'));
const mode=process.argv[2]??'preview';
if(!['preview','final','check'].includes(mode))throw new Error('Use preview, final, or check.');
const audio=id=>['wav','mp3','m4a'].map(ext=>`public/audio/${id}.${ext}`).find(existsSync);
const problems=[];
function duration(file){const r=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','json',file],{encoding:'utf8'});if(r.error||r.status!==0){problems.push(`Cannot inspect ${file}; check the file and ffprobe installation.`);return null;}const d=Number(JSON.parse(r.stdout).format.duration);if(!Number.isFinite(d)){problems.push(`Invalid duration: ${file}`);return null;}return d;}
for(const s of film.shots){if(!s.required)continue;const file=`public/clips/${s.clip}`;if(!existsSync(file)){problems.push(`Missing ${s.clip}: ${s.start}–${s.end}s`);continue;}const d=duration(file);if(d!==null&&d<s.end-s.start-.1)problems.push(`${s.clip}: ${d.toFixed(1)}s, needs ${s.end-s.start}s. Clips never loop.`);}
const continuous=audio('voiceover');
if(continuous){const d=duration(continuous);if(d!==null&&d>film.duration)problems.push('Continuous voiceover exceeds the 179-second timeline.');}
else for(const c of film.chapters){if(c.start===0)continue;const file=audio(c.id);if(!file){problems.push(`Missing narration ${c.id}.wav (or MP3/M4A)`);continue;}const d=duration(file);if(d!==null&&d>c.end-c.start)problems.push(`${file} exceeds its ${c.end-c.start}s chapter.`);}
console.log('SafeNight reference cut · 2:59 · 1080p · 30fps · burned-in subtitles');
console.log('Subtitle timings are scripted; verify against the final voice recording.');
if(problems.length)console.log(problems.map(p=>`  • ${p}`).join('\n'));
if(mode==='check'||(mode==='final'&&problems.length))process.exit(problems.length?1:0);
mkdirSync('out',{recursive:true});const preview=mode==='preview';
const output=`out/SafeNight-story-cut-${preview?'preview':'final'}.mp4`;
const args=['render','src/index.tsx','SafeNight',output,'--codec=h264','--pixel-format=yuv420p','--concurrency=4',`--scale=${preview?.5:1}`,`--crf=${preview?23:18}`];
const result=spawnSync(path.join(root,'node_modules','.bin','remotion'),args,{stdio:'inherit'});if(result.error)console.error(result.error.message);process.exit(result.status??1);
