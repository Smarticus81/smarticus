import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { newRunner, readCourse, starterCourse, stepRunner, type Platform } from "../lib/skyRun";
import "../styles/sky-run.css";

const SAVE = "atticus-sky-run-v1";
function initialCourse() { try { return readCourse(JSON.parse(localStorage.getItem(SAVE) || "null")); } catch { return starterCourse(); } }
export function SkyRunWorkshop() {
  const [course, setCourse] = useState<Platform[]>(initialCourse);
  const [selected, setSelected] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [restart, setRestart] = useState(0);
  const [status, setStatus] = useState("Build five platforms. Put a gold checkpoint on number 3 and a finish on number 5.");
  const [score, setScore] = useState({ seconds:0, falls:0, checkpoint:1, won:false });
  const host = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const jump = useRef(false);
  const touch = useRef({x:0,z:0});
  const active = course.find(p => p.id === selected) ?? course[0];
  useEffect(() => { try { localStorage.setItem(SAVE,JSON.stringify(course)); } catch { setStatus("Browser saving is off. Press Download save to keep your course."); } }, [course]);
  useEffect(() => {
    if (!host.current) return;
    const node = host.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true}); }
    catch { setStatus("The 3D view could not open. Try Edge or Chrome with graphics acceleration on. Ask your parent for help; this is a setup issue."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    node.appendChild(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color("#dcecf2");scene.fog=new THREE.Fog("#dcecf2",35,90);
    const camera=new THREE.PerspectiveCamera(48,1,.1,180);
    scene.add(new THREE.HemisphereLight(0xf6f5df,0x688c99,2.4));
    const sun=new THREE.DirectionalLight(0xffedcd,3);sun.position.set(10,20,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;scene.add(sun);
    const materials:THREE.Material[]=[];const geometries:THREE.BufferGeometry[]=[];
    function box(w:number,h:number,d:number,color:string,x:number,y:number,z:number,parent:THREE.Object3D=scene){const g=new THREE.BoxGeometry(w,h,d);const m=new THREE.MeshStandardMaterial({color,roughness:.7});geometries.push(g);materials.push(m);const mesh=new THREE.Mesh(g,m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
    const colors={plain:"#78b5a0",checkpoint:"#d5a23f",finish:"#49cad0",bounce:"#b191dc"};
    const animated:THREE.Mesh[]=[];
    for(const p of course){
      box(p.size,.65,p.size,"#d7d6c5",p.x,-.43,p.z);
      box(p.size,.2,p.size,colors[p.kind],p.x,-.1,p.z);
      if(!playing&&p.id===active.id){const edge=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(p.size+.1,.3,p.size+.1)),new THREE.LineBasicMaterial({color:0x153a52}));edge.position.set(p.x,.05,p.z);scene.add(edge);}
      if(p.kind==="checkpoint"){box(.09,2,.09,"#725a39",p.x+1,1,p.z);box(.85,.5,.09,"#e8b34c",p.x+.6,1.75,p.z);}
      if(p.kind==="finish"){box(.2,2.5,.2,"#153a52",p.x-1.1,1.25,p.z);box(.2,2.5,.2,"#153a52",p.x+1.1,1.25,p.z);animated.push(box(2.4,.25,.3,"#72edf1",p.x,2.5,p.z));}
      if(p.kind==="bounce")box(p.size*.65,.1,p.size*.65,"#6b4792",p.x,.05,p.z);
    }
    // Friendly original block character. Facial features are real scene geometry.
    const hero=new THREE.Group();scene.add(hero);
    box(.7,.8,.4,"#183d59",0,.95,0,hero);box(.15,.12,.43,"#d8a442",0,1.1,.02,hero);
    box(.57,.58,.5,"#9a6040",0,1.66,0,hero);box(.62,.19,.55,"#262326",0,1.98,0,hero);
    for(const x of [-.15,.15]){box(.13,.13,.03,"#ffffff",x,1.73,.265,hero);box(.065,.085,.035,"#242733",x,1.715,.287,hero);}
    box(.2,.04,.03,"#f0c9a3",0,1.52,.27,hero);
    const arms=[box(.2,.7,.25,"#183d59",-.49,.96,0,hero),box(.2,.7,.25,"#183d59",.49,.96,0,hero)];
    for(const x of [-.49,.49])box(.21,.2,.26,"#9a6040",x,.56,0,hero);
    const legs=[box(.26,.5,.3,"#4a6478",-.2,.34,0,hero),box(.26,.5,.3,"#4a6478",.2,.34,0,hero)];
    for(const x of [-.2,.2])box(.29,.15,.45,"#faf4da",x,.1,.08,hero);
    let player=newRunner(course);let elapsed=0;let then=performance.now();let lastReport=0;let frame=0;
    const keys=new Set<string>();
    const keydown=(e:KeyboardEvent)=>{if(!playing||e.target instanceof HTMLInputElement)return;if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","w","a","s","d","W","A","S","D"].includes(e.key)){e.preventDefault();keys.add(e.key.toLowerCase());if(e.key===" "&&!e.repeat)jump.current=true;}};
    const keyup=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());const blur=()=>{keys.clear();touch.current={x:0,z:0};jump.current=false;};
    window.addEventListener("keydown",keydown);window.addEventListener("keyup",keyup);window.addEventListener("blur",blur);
    const resize=()=>{const w=node.clientWidth,h=node.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(node);resize();
    setScore({seconds:0,falls:0,checkpoint:course[0].id,won:false});
    const draw=(now:number)=>{
      frame=requestAnimationFrame(draw);const dt=Math.min((now-then)/1000,.033);then=now;
      if(playing){const dx=(keys.has("d")||keys.has("arrowright")?1:0)-(keys.has("a")||keys.has("arrowleft")?1:0)+touch.current.x;const dz=(keys.has("s")||keys.has("arrowdown")?1:0)-(keys.has("w")||keys.has("arrowup")?1:0)+touch.current.z;
        player=stepRunner(player,course,dx,dz,jump.current,dt);jump.current=false;if(!player.won)elapsed+=dt;
        hero.position.set(player.x,player.y,player.z);if(dx||dz)hero.rotation.y=Math.atan2(dx,dz);
        legs.forEach((leg,i)=>leg.rotation.x=(dx||dz)?Math.sin(now/110+i*Math.PI)*.4:0);arms.forEach((arm,i)=>arm.rotation.x=(dx||dz)?Math.sin(now/110-i*Math.PI)*.35:0);
        camera.position.lerp(new THREE.Vector3(player.x+1,Math.max(7,player.y+6),player.z+11),.09);camera.lookAt(player.x,Math.max(.8,player.y+1),player.z-3);
        if(now-lastReport>150){setScore({seconds:Math.floor(elapsed),falls:player.falls,checkpoint:player.checkpoint,won:player.won});lastReport=now;}
      }else{const end=course[course.length-1];camera.position.set(active.x+12,18,active.z+17);camera.lookAt(active.x,0,active.z-3);hero.position.set(course[0].x,0,course[0].z);hero.rotation.y=.4;void end;}
      animated.forEach(m=>m.rotation.y=Math.sin(now/500)*.05);renderer.render(scene,camera);
    };frame=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(frame);ro.disconnect();window.removeEventListener("keydown",keydown);window.removeEventListener("keyup",keyup);window.removeEventListener("blur",blur);renderer.dispose();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());node.replaceChildren();};
  },[course,selected,playing,restart]);
  function edit(change:Partial<Platform>){setCourse(old=>old.map(p=>p.id===active.id?{...p,...change}:p));}
  function download(){const url=URL.createObjectURL(new Blob([JSON.stringify(course,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="My-Sky-Run.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),500);setStatus("Saved as My-Sky-Run.json. Use Open save to bring it back.");}
  return <main className="sky-workshop">
    <header className="sky-top"><a href="/?date=2026-10-05">← Back to Virgil</a><strong>SKY RUN <span>BUILDER WORKSHOP</span></strong><span>Inspired by Roblox obstacle courses</span></header>
    <div className="sky-layout"><aside className="sky-controls">
      <img className="sky-characters" src="/lesson-visuals/2026-10-05/sky-run-characters.jpg" alt="A smiling young builder and robot guide beside a floating obstacle course." />
      <h1>Build it. Jump it. Show it.</h1><p>Make five platforms. Add a checkpoint to 3 and a finish to 5. Then try your course.</p>
      <div className="sky-mode"><button onClick={()=>{setPlaying(false);setStatus("Build mode: pick a platform, then use the buttons below.");}} aria-pressed={!playing}>Build</button><button onClick={()=>{setPlaying(true);setRestart(n=>n+1);setStatus("WASD or arrow keys to move. Space to jump. Try reaching the finish.");}} aria-pressed={playing}>Play</button></div>
      {!playing&&<><h2>Pick a platform to change</h2><div className="sky-platforms">{course.map((p,i)=><button key={p.id} aria-pressed={p.id===active.id} onClick={()=>setSelected(p.id)}>{i+1}{p.kind==="checkpoint"?" ⚑":p.kind==="finish"?" ★":""}</button>)}</div>
      <button className="sky-primary" disabled={course.length>=30} onClick={()=>{const last=course[course.length-1];const id=Math.max(...course.map(p=>p.id))+1;setCourse([...course,{id,x:last.x,z:last.z-5,size:3.6,kind:"plain"}]);setSelected(id);}}>+ Add platform</button>
      <h2>Move platform {course.indexOf(active)+1}</h2><div className="sky-button-grid"><button onClick={()=>edit({z:Math.max(-150,active.z-1)})}>Farther away ↑</button><button onClick={()=>edit({z:Math.min(150,active.z+1)})}>Closer ↓</button><button onClick={()=>edit({x:Math.max(-100,active.x-1)})}>Left ←</button><button onClick={()=>edit({x:Math.min(100,active.x+1)})}>Right →</button><button onClick={()=>edit({size:Math.min(7,active.size+.5)})}>Make wider</button><button onClick={()=>edit({size:Math.max(2,active.size-.5)})}>Make smaller</button></div>
      <h2>Give it a job</h2><div className="sky-button-grid">{([['plain','Normal'],['checkpoint','Checkpoint'],['finish','Finish'],['bounce','Bounce pad']] as const).map(([kind,label])=><button key={kind} aria-pressed={active.kind===kind} onClick={()=>edit({kind})}>{label}</button>)}</div><p className="sky-small">Checkpoint = where you return after a fall. Bounce pad = a platform that throws you higher.</p></>}
      {playing&&<><h2>Try your course</h2><p>Hold W to go forward. Press Space just before the edge. Release Space before your next jump.</p><button onClick={()=>setRestart(n=>n+1)}>Restart from the beginning</button><p className="sky-small">Restart clears your timer and checkpoint. Falling keeps your checkpoint.</p></>}
      <div className="sky-save"><button onClick={download}>Download save</button><button onClick={()=>file.current?.click()}>Open save</button><input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{try{const f=e.target.files?.[0];if(!f)return;if(f.size>100000)throw new Error("That file is too large for a course save.");const loaded=readCourse(JSON.parse(await f.text()));setCourse(loaded);setSelected(loaded[0].id);setPlaying(false);setStatus("Your saved course is open.");}catch(error){setStatus(error instanceof Error?error.message:"That save could not open.");}finally{e.target.value="";}}}/></div>
    </aside><section className="sky-stage"><div className="sky-status" role="status">{status}</div><div className="sky-view" ref={host} aria-label="3D Sky Run obstacle course" />
      <div className="sky-hud"><span>{playing?`${score.seconds}s · ${score.falls} falls · checkpoint ${score.checkpoint}`:`${course.length} platforms · Build mode`}</span><span>WASD / arrows · Space = jump</span></div>
      {score.won&&playing&&<div className="sky-win"><strong>You reached the finish!</strong><p>{score.seconds} seconds. Now let someone else try it.</p><button onClick={()=>setRestart(n=>n+1)}>Play again</button></div>}
      {playing&&<div className="sky-touch">{([['←',-1,0],['↑',0,-1],['↓',0,1],['→',1,0]] as const).map(([label,x,z])=><button key={label} onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);touch.current={x,z};}} onPointerUp={()=>touch.current={x:0,z:0}} onPointerCancel={()=>touch.current={x:0,z:0}}>{label}</button>)}<button onPointerDown={()=>jump.current=true}>Jump</button></div>}
      <div className="sky-help"><strong>Stuck?</strong> Return to Virgil and say exactly what happened: “I fall before I reach platform 3. What should I change?” Your course stays saved in this browser.</div>
    </section></div>
  </main>;
}
