import {newRunner,stepRunner,type Platform} from "./skyRun";
type Point={x:number;y:number;z:number};
type Score={seconds:number;falls:number;checkpoint:number;won:boolean};
/** The same world and game rules, drawn without WebGL when the browser lacks it. */
export function startCanvasWorkshop(node:HTMLElement,course:Platform[],active:Platform,playing:boolean,jump:{current:boolean},touch:{current:{x:number;z:number}},report:(score:Score)=>void){
 const canvas=document.createElement("canvas");const ctx=canvas.getContext("2d");if(!ctx)throw new Error("This browser cannot draw the workshop.");node.appendChild(canvas);
 let w=800,h=600,frame=0,last=performance.now(),lastReport=0,elapsed=0;let p=newRunner(course);const keys=new Set<string>();
 const resize=()=>{w=node.clientWidth;h=node.clientHeight;const ratio=Math.min(devicePixelRatio,1.5);canvas.width=w*ratio;canvas.height=h*ratio;canvas.style.width=w+"px";canvas.style.height=h+"px";ctx.setTransform(ratio,0,0,ratio,0,0);};const ro=new ResizeObserver(resize);ro.observe(node);resize();
 const down=(e:KeyboardEvent)=>{if(!playing||e.target instanceof HTMLInputElement)return;if(["arrowup","arrowdown","arrowleft","arrowright"," ","w","a","s","d"].includes(e.key.toLowerCase())){e.preventDefault();keys.add(e.key.toLowerCase());if(e.key===" "&&!e.repeat)jump.current=true;}};
 const up=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());const blur=()=>{keys.clear();touch.current={x:0,z:0};jump.current=false;};window.addEventListener("keydown",down);window.addEventListener("keyup",up);window.addEventListener("blur",blur);
 const sub=(a:Point,b:Point):Point=>({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y+a.z*b.z;const norm=(a:Point)=>{const n=Math.hypot(a.x,a.y,a.z);return{x:a.x/n,y:a.y/n,z:a.z/n};};const cross=(a:Point,b:Point):Point=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
 report({seconds:0,falls:0,checkpoint:course[0].id,won:false});
 function draw(now:number){
  frame=requestAnimationFrame(draw);const dt=Math.min((now-last)/1000,.033);last=now;
  const dx=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+touch.current.x;
  const dz=(keys.has('s')||keys.has('arrowdown')?1:0)-(keys.has('w')||keys.has('arrowup')?1:0)+touch.current.z;
  if(playing){p=stepRunner(p,course,dx,dz,jump.current,dt);jump.current=false;if(!p.won)elapsed+=dt;}else p=newRunner(course);
  const camera:Point=playing?{x:p.x+1,y:Math.max(7,p.y+6),z:p.z+11}:{x:active.x+10,y:15,z:active.z+17};
  const target:Point=playing?{x:p.x,y:Math.max(.8,p.y+1),z:p.z-3}:{x:active.x,y:0,z:active.z-3};
  const forward=norm(sub(target,camera)),right=norm(cross(forward,{x:0,y:1,z:0})),top=cross(right,forward),scale=Math.min(w,h)*1.28;
  const project=(a:Point)=>{const v=sub(a,camera),depth=dot(v,forward);return{x:w/2+dot(v,right)*scale/depth,y:h/2-dot(v,top)*scale/depth,depth};};
  const sky=ctx!.createLinearGradient(0,0,0,h);sky.addColorStop(0,"#bdd9e9");sky.addColorStop(.65,"#e5f0ed");sky.addColorStop(1,"#f9eedb");ctx!.fillStyle=sky;ctx!.fillRect(0,0,w,h);
  for(let i=0;i<9;i++){const x=((i*193+now/1300)%(w+220))-110,y=h*.2+(i%4)*h*.18;ctx!.fillStyle="#ffffff70";ctx!.beginPath();ctx!.ellipse(x,y,110,25,0,0,Math.PI*2);ctx!.fill();}
  const faces:{points:Point[];color:string;selected:boolean}[]=[];
  const palette={plain:'#76b8a0',checkpoint:'#e3b04b',finish:'#58ccd0',bounce:'#b299d8'};
  for(const b of course){const s=b.size/2,x=b.x,z=b.z;const a={x:x-s,y:0,z:z-s},c={x:x+s,y:0,z:z-s},d={x:x+s,y:0,z:z+s},e={x:x-s,y:0,z:z+s};const bottom=(q:Point)=>({...q,y:-.9});faces.push({points:[a,c,d,e],color:palette[b.kind],selected:!playing&&b.id===active.id},{points:[e,d,bottom(d),bottom(e)],color:'#b8b7a8',selected:false},{points:[d,c,bottom(c),bottom(d)],color:'#d7d2bd',selected:false},{points:[a,e,bottom(e),bottom(a)],color:'#a0afa5',selected:false});}
  faces.sort((a,b)=>b.points.reduce((n,q)=>n+project(q).depth,0)-a.points.reduce((n,q)=>n+project(q).depth,0));
  for(const f of faces){const q=f.points.map(project);if(q.some(a=>a.depth<.2))continue;ctx!.beginPath();q.forEach((a,i)=>i?ctx!.lineTo(a.x,a.y):ctx!.moveTo(a.x,a.y));ctx!.closePath();ctx!.fillStyle=f.color;ctx!.fill();ctx!.strokeStyle=f.selected?'#c49330':'#426d6d45';ctx!.lineWidth=f.selected?3:1;ctx!.stroke();}
  function strokePath(points:Point[],color:string,width:number){const q=points.map(project);if(q.some(a=>a.depth<.2))return;ctx!.beginPath();q.forEach((a,i)=>i?ctx!.lineTo(a.x,a.y):ctx!.moveTo(a.x,a.y));ctx!.strokeStyle=color;ctx!.lineWidth=width*scale/q[0].depth;ctx!.lineCap='round';ctx!.stroke();}
  for(const b of course){const q=project({x:b.x,y:.05,z:b.z});if(q.depth<.2)continue;ctx!.fillStyle='#153a52';ctx!.textAlign='center';ctx!.font=`bold ${Math.max(10,scale/q.depth*.35)}px Arial`;ctx!.fillText(String(course.indexOf(b)+1),q.x,q.y);
   if(b.kind==='checkpoint'){strokePath([{x:b.x+1,y:0,z:b.z},{x:b.x+1,y:2,z:b.z}],'#8f702e',.07);const a=project({x:b.x+1,y:2,z:b.z});ctx!.fillStyle='#edb541';ctx!.beginPath();ctx!.moveTo(a.x,a.y);ctx!.lineTo(a.x-30*scale/q.depth/25,a.y+7);ctx!.lineTo(a.x,a.y+18*scale/q.depth/25);ctx!.fill();}
   if(b.kind==='finish'){ctx!.shadowColor='#75f5f1';ctx!.shadowBlur=18;strokePath([{x:b.x-1,y:0,z:b.z},{x:b.x-1,y:2.6,z:b.z},{x:b.x+1,y:2.6,z:b.z},{x:b.x+1,y:0,z:b.z}],'#47d0d5',.16);ctx!.shadowBlur=0;}
   if(b.kind==='bounce'){ctx!.fillStyle='#745797';ctx!.font=`bold ${scale/q.depth*.45}px Arial`;ctx!.fillText('↑',q.x,q.y-7);}
  }
  const foot=project({x:p.x,y:p.y,z:p.z});const head=project({x:p.x,y:p.y+2.1,z:p.z});
  if(foot.depth>.2){const size=Math.max(8,foot.y-head.y),x=foot.x,y=foot.y,walk=playing&&(dx||dz)?Math.sin(now/95)*size*.045:0;ctx!.save();ctx!.translate(x,y);
   ctx!.fillStyle='#476071';ctx!.fillRect(-size*.18,-size*.3,size*.14,size*.3+walk);ctx!.fillRect(size*.035,-size*.3,size*.14,size*.3-walk);
   ctx!.fillStyle='#fbf4da';ctx!.fillRect(-size*.2,-size*.045+walk,size*.18,size*.06);ctx!.fillRect(size*.015,-size*.045-walk,size*.18,size*.06);
   ctx!.fillStyle='#153a52';ctx!.beginPath();ctx!.roundRect(-size*.23,-size*.67,size*.46,size*.41,size*.06);ctx!.fill();ctx!.fillRect(-size*.34,-size*.65,size*.12,size*.35);ctx!.fillRect(size*.22,-size*.65,size*.12,size*.35);
   ctx!.fillStyle='#d0a052';ctx!.fillRect(-size*.02,-size*.65,size*.04,size*.32);
   ctx!.fillStyle='#ab724d';ctx!.beginPath();ctx!.roundRect(-size*.22,-size*1.02,size*.44,size*.4,size*.1);ctx!.fill();
   ctx!.fillStyle='#29242a';for(let i=0;i<5;i++){ctx!.beginPath();ctx!.arc((- .18+i*.09)*size,-size*1.015,size*.075,0,Math.PI*2);ctx!.fill();}
   for(const eye of [-.1,.1]){ctx!.fillStyle='#fff9ef';ctx!.beginPath();ctx!.ellipse(eye*size,-size*.84,size*.065,size*.075,0,0,Math.PI*2);ctx!.fill();ctx!.fillStyle='#242c39';ctx!.beginPath();ctx!.arc(eye*size,-size*.83,size*.029,0,Math.PI*2);ctx!.fill();}
   ctx!.strokeStyle='#fbe0bb';ctx!.lineWidth=size*.024;ctx!.beginPath();ctx!.arc(0,-size*.76,size*.065,0,Math.PI);ctx!.stroke();ctx!.restore();
  }
  if(playing&&now-lastReport>150){report({seconds:Math.floor(elapsed),falls:p.falls,checkpoint:p.checkpoint,won:p.won});lastReport=now;}
 }
 frame=requestAnimationFrame(draw);
 return()=>{cancelAnimationFrame(frame);ro.disconnect();window.removeEventListener('keydown',down);window.removeEventListener('keyup',up);window.removeEventListener('blur',blur);node.replaceChildren();};
}
