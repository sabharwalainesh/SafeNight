import React from 'react';
import {AbsoluteFill,Img,interpolate,staticFile,useCurrentFrame} from 'remotion';
const nodes=Array.from({length:28},(_,i)=>({x:180+(i%7)*245+(Math.floor(i/7)%2)*35,y:220+Math.floor(i/7)*205}));
const edges:number[][]=[];
nodes.forEach((_,i)=>{if(i%7<6)edges.push([i,i+1]);if(i<21)edges.push([i,i+7]);});
const dist=nodes.map(()=>Infinity),prev=nodes.map(()=>-1),visited=new Set<number>();dist[7]=0;
for(let k=0;k<nodes.length;k++){let u=-1;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&(u===-1||dist[i]<dist[u]))u=i;visited.add(u);for(const [a,b]of edges){const v=a===u?b:b===u?a:-1;if(v<0)continue;const w=Math.hypot(nodes[u].x-nodes[v].x,nodes[u].y-nodes[v].y);if(dist[u]+w<dist[v]){dist[v]=dist[u]+w;prev[v]=u;}}}
const path=[26];while(prev[path[0]]!==-1)path.unshift(prev[path[0]]);
export function RouteSearch(){const f=useCurrentFrame();const p=interpolate(f,[8,100],[0,Math.max(...dist)],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});const morph=interpolate(f,[143,185],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});return <AbsoluteFill style={{background:'#07141c'}}>
 <div style={{position:'absolute',inset:0,opacity:1-morph,transform:`scale(${1+morph*.35})`}}>
 <svg width="1920" height="1080"><defs><filter id="glow"><feGaussianBlur stdDeviation="6"/></filter></defs>
 {Array.from({length:18},(_,i)=><rect key={i} x={220+i%6*245} y={265+Math.floor(i/6)*205} width={150} height={110} rx={15} fill={i%5===0?'#164437':'#172b36'} transform={`rotate(${i%3-1} ${220+i%6*245} ${265+Math.floor(i/6)*205})`}/>)}
 {edges.map(([a,b])=><line key={`${a}-${b}`} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="#2b4654" strokeWidth={10}/>)}
 {edges.map(([a,b])=>{const d=Math.min(dist[a],dist[b]);const q=interpolate(p,[d,d+230],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});const u=dist[a]<=dist[b]?a:b,v=u===a?b:a;return <line key={`${a}-${b}`} x1={nodes[u].x} y1={nodes[u].y} x2={nodes[u].x+(nodes[v].x-nodes[u].x)*q} y2={nodes[u].y+(nodes[v].y-nodes[u].y)*q} stroke="#49d7c2" strokeOpacity={.45} strokeWidth={4}/>})}
 {nodes.map((n,i)=><g key={i}><circle cx={n.x} cy={n.y} r={dist[i]<p?12:7} fill={dist[i]<p?'#7cebd2':'#49616d'}/>{Math.abs(dist[i]-p)<140&&<circle cx={n.x} cy={n.y} r={22+(f%16)} fill="none" stroke="#8dfce2" opacity={.5}/>}</g>)}
 <polyline points={path.map(i=>`${nodes[i].x},${nodes[i].y}`).join(' ')} fill="none" stroke="#75beff" strokeWidth={35} filter="url(#glow)" opacity={.65} pathLength={1} strokeDasharray={1} strokeDashoffset={1-interpolate(f,[100,145],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
 <polyline points={path.map(i=>`${nodes[i].x},${nodes[i].y}`).join(' ')} fill="none" stroke="#76acff" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1-interpolate(f,[100,145],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
 <circle cx={nodes[7].x} cy={nodes[7].y} r={23} fill="#78aaff" stroke="white" strokeWidth={5}/><circle cx={nodes[26].x} cy={nodes[26].y} r={23} fill="#70ebcb" stroke="white" strokeWidth={5}/>
 <text x={nodes[7].x-45} y={nodes[7].y-45} fill="white" fontSize={28}>YOU</text><text x={nodes[26].x-45} y={nodes[26].y+64} fill="white" fontSize={28}>FRIEND</text>
 </svg></div>
 <div style={{position:'absolute',left:105,top:80,fontSize:56,fontWeight:800,opacity:1-morph}}>Find a way back.</div>
 <div style={{position:'absolute',bottom:140,left:110,color:'#8ba9b7',fontSize:20,opacity:1-morph}}>Route-search illustration</div>
 <div style={{position:'absolute',left:230,top:85,width:407,height:883,borderRadius:51,overflow:'hidden',border:'7px solid #47606c',opacity:morph,transform:`translateX(${(1-morph)*170}px) scale(${.85+.15*morph})`}}><Img src={staticFile('clips/product-route-first.jpg')} style={{width:'100%'}}/></div>
 </AbsoluteFill>}
