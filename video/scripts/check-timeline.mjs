import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const film=JSON.parse(readFileSync('src/film.json','utf8'));
const cues=JSON.parse(readFileSync('src/subtitles.json','utf8'));
assert.deepEqual(film.chapters.map(c=>c.start).concat(film.duration),[0,18,48,78,120,144,179]);
let cursor=0;
for(const c of film.chapters){assert.equal(c.start,cursor);assert.ok(c.end>c.start);cursor=c.end;}
assert.equal(cursor,179);cursor=0;
const used=new Set();
for(const shot of film.shots){assert.equal(shot.start,cursor,`${shot.id}: gap or overlap`);assert.ok(shot.end>shot.start);cursor=shot.end;const chapter=film.chapters[shot.chapter];assert.ok(shot.start>=chapter.start&&shot.end<=chapter.end);if(shot.clip){assert.ok(!used.has(shot.clip),'Repeated footage filename');used.add(shot.clip);}assert.ok(shot.voice.length>0||shot.caption.length>0);}
assert.equal(cursor,179);
let last=0;
for(const c of cues){assert.ok(c.start>=last,'Overlapping subtitle cues');assert.ok(c.end>c.start);assert.ok(c.end<=179);assert.ok(c.text.split('\n').length<=2,'Subtitle exceeds two lines');assert.ok(c.text.split('\n').every(l=>l.length<=43),'Subtitle line too long');last=c.end;}
const normalize=s=>s.replace(/\s+/g,' ').trim();
assert.equal(normalize(cues.filter(c=>c.type!=='sound').map(c=>c.text).join(' ')),normalize(film.shots.map(s=>s.voice).join(' ')),'Captions must include the whole script exactly once');
assert.equal((readFileSync('SafeNight-subtitles.srt','utf8').match(/ --> /g)||[]).length,cues.length);
console.log(`PASS: reference boundaries, 179s contiguous timeline, ${used.size} unique clip slots, ${cues.length} non-overlapping two-line subtitle cues, full script coverage, SRT export.`);
