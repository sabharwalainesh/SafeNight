import React from 'react';
import {AbsoluteFill, Audio, getStaticFiles, interpolate, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import film from './film.json';
import subtitles from './subtitles.json';

type Shot = typeof film.shots[number];
const clamp={extrapolateLeft:'clamp',extrapolateRight:'clamp'} as const;
const time=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const findAudio=(id:string,files:Set<string>)=>['wav','mp3','m4a'].map(ext=>`audio/${id}.${ext}`).find(x=>files.has(x));

function ShotView({shot,available}:{shot:Shot;available:Set<string>}) {
 const frame=useCurrentFrame();
 const hasClip=Boolean(shot.clip&&available.has(`clips/${shot.clip}`));
 const fade=interpolate(frame,[0,8],[0,1],clamp);
 if(shot.kind==='stat')return <AbsoluteFill className="stat-card" style={{opacity:fade}}><div className="stat-number">{Math.round(interpolate(frame,[0,36],[0,Number(shot.value.replace('%',''))],clamp))}%</div><div className="stat-detail">{shot.detail}</div><div className="stat-source">{shot.sourceLabel}<br/>{new URL(shot.sourceUrl).hostname} · Full source in SOURCES.md</div></AbsoluteFill>;
 if(shot.kind==='reason')return <AbsoluteFill className="reason-card"><h1>A request needs<br/>a response.</h1><div className="reason-steps">{['Ask for help','Confirm the details','Coordinate a response'].map((text,i)=><span key={text} style={{opacity:interpolate(frame,[i*35,i*35+18],[0,1],clamp)}}>{text}{i<2?' →':''}</span>)}</div><p>Design goal · not a measured safety outcome</p></AbsoluteFill>;
 if(shot.kind==='close')return <AbsoluteFill className="closing" style={{opacity:fade}}><div className="closing-brand">SafeNight</div><h1>Go out together.<br/>Get home together.</h1></AbsoluteFill>;
 if(hasClip)return <AbsoluteFill style={{padding:shot.start<18?'0':'145px 72px 194px'}}><OffthreadVideo src={staticFile(`clips/${shot.clip}`)} muted style={{width:'100%',height:'100%',objectFit:'contain'}}/></AbsoluteFill>;
 return <AbsoluteFill className="placeholder" style={{opacity:fade}}>
  <div className="add-label">Add this clip</div>
  <h1>{shot.title}</h1>
  <p>{shot.instruction}</p>
  <div className="filename">{shot.clip}</div>
  <div className="slot-time">{time(shot.start)}–{time(shot.end)} · {shot.end-shot.start} seconds · {shot.format}</div>
 </AbsoluteFill>;
}

export function Film(){
 const frame=useCurrentFrame();
 const seconds=frame/film.fps;
 const available=new Set(getStaticFiles().map(x=>x.name));
 const continuous=findAudio('voiceover',available);
 const music=findAudio('music',available);
 const opening=findAudio('opening-happy',available);
 const ambience=findAudio('outside-ambience',available);
 const currentShot=film.shots.find(s=>seconds>=s.start&&seconds<s.end);
 const chapter=film.chapters.find(c=>seconds>=c.start&&seconds<c.end)??film.chapters[film.chapters.length-1];
 const subtitle=subtitles.find(c=>seconds>=c.start&&seconds<c.end);
 return <AbsoluteFill className="film">
  {film.shots.map(shot=><Sequence key={shot.id} from={shot.start*film.fps} durationInFrames={(shot.end-shot.start)*film.fps}><ShotView shot={shot} available={available}/></Sequence>)}
  {seconds>=18&&<div className="topline"><span className="brand">SafeNight</span><span>{time(chapter.start)} / {chapter.title}</span></div>}
  {currentShot?.disclosure&&<div className="disclosure">{currentShot.disclosure}</div>}
  {subtitle&&<div className="subtitles"><span>{subtitle.speaker&&<div className="speaker">{subtitle.speaker}</div>}{subtitle.text}</span></div>}
  {continuous?<Audio src={staticFile(continuous)}/>:film.chapters.map(c=>{const audio=findAudio(c.id,available);return audio?<Sequence key={c.id} from={c.start*film.fps} durationInFrames={(c.end-c.start)*film.fps}><Audio src={staticFile(audio)}/></Sequence>:null;})}
  {opening&&<Sequence durationInFrames={9*film.fps}><Audio src={staticFile(opening)} volume={.65}/></Sequence>}
  {ambience&&<Sequence from={9*film.fps} durationInFrames={9*film.fps}><Audio src={staticFile(ambience)}/></Sequence>}
  {music&&<Sequence from={86*film.fps}><Audio src={staticFile(music)} loop volume={f=>interpolate(f,[0,60,84*film.fps,93*film.fps-1],[0,.07,.07,0],clamp)}/></Sequence>}
 </AbsoluteFill>;
}
