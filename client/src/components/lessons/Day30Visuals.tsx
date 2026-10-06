import { useId, useState } from "react";

export function LPlan({ width=6, height=4, sideWidth=3, sideHeight=2, interactive=false }: {width?:number;height?:number;sideWidth?:number;sideHeight?:number;interactive?:boolean}) {
 const [split,setSplit]=useState(!interactive);
 const s=42, x=70,y=50,w=width*s,h=height*s,bw=sideWidth*s,bh=sideHeight*s;
 return <figure className="day30-diagram"><svg viewBox={`0 0 ${w+bw+145} ${h+115}`} role="img" aria-label={`L-shaped plan: main rectangle ${width} by ${height} units, side rectangle ${sideWidth} by ${sideHeight} units; the pieces share an edge without overlapping.`}>
 <path d={`M${x},${y} h${w} v${h-bh} h${bw} v${bh} H${x} Z`} fill="#deebee" stroke="#173c50" strokeWidth="3"/>
 {split&&<><rect x={x+w} y={y+h-bh} width={bw} height={bh} fill="#edcb80"/><path d={`M${x+w},${y+h-bh} v${bh}`} stroke="#173c50" strokeWidth="3" strokeDasharray="7 5"/></>}
 <g fill="#173c50" fontSize="18" textAnchor="middle"><text x={x+w/2} y={y-18}>{width} units</text><text x={x-38} y={y+h/2}>{height}</text><text x={x+w+bw/2} y={y+h-bh-15}>{sideWidth} units</text><text x={x+w+bw+30} y={y+h-bh/2}>{sideHeight}</text><text x={x+w/2} y={y+h/2+8}>Main part</text><text x={x+w+bw/2} y={y+h-bh/2+25}>Side</text></g>
 </svg><figcaption>Every length is in units. The shared edge has no area.</figcaption>{interactive&&<button className="button outline" aria-pressed={split} onClick={()=>setSplit(!split)}>{split?"Hide the split":"Show the two pieces"}</button>}</figure>;
}
export type Tilt=""|"up-right"|"down-right"|"upright";
const angles:Record<Exclude<Tilt,"">,number>={"up-right":45,"down-right":-45,upright:90};
export function reflectedDirection(incoming:[number,number],mirror:Exclude<Tilt,"">):[number,number]{const t=angles[mirror]*Math.PI/180,m=[Math.cos(t),Math.sin(t)],d=incoming[0]*m[0]+incoming[1]*m[1];return [2*m[0]*d-incoming[0],2*m[1]*d-incoming[1]];}
function RayPicture({mirror,normal,incoming=[1,0],teaching=false}:{mirror:Tilt;normal:Tilt;incoming?:[number,number];teaching?:boolean}){
 const id=useId().replace(/:/g,""); const cx=260,cy=190;
 const line=(tilt:Tilt,length:number)=>{const t=(tilt?angles[tilt]:0)*Math.PI/180;return {x1:cx-Math.cos(t)*length,y1:cy+Math.sin(t)*length,x2:cx+Math.cos(t)*length,y2:cy-Math.sin(t)*length};};
 const corner=mirror?line(mirror,22):null;
 const normalCorner=normal?line(normal,22):null;
 const out=teaching&&mirror?reflectedDirection(incoming,mirror):[-1,0];
 return <svg viewBox="0 0 520 370" role="img" aria-label={teaching?`Light travels right; mirror ${mirror}; dashed normal ${normal}.`:`Your choices: mirror ${mirror||"not chosen"}, normal ${normal||"not chosen"}. Gold is the given incoming ray; green is the required path to the left, not a checked result.`}>
 <defs><marker id={id+"a"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10Z" fill="#a86e16"/></marker><marker id={id+"b"} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#157061"/></marker></defs>
 {normal&&<line {...line(normal,145)} stroke="#718591" strokeWidth="3" strokeDasharray="8 7"/>}
 {mirror&&<line {...line(mirror,100)} stroke="#173c50" strokeWidth="10" strokeLinecap="round"/>}
 <line x1={cx-incoming[0]*160} y1={cy+incoming[1]*160} x2={cx-incoming[0]*18} y2={cy+incoming[1]*18} stroke="#a86e16" strokeWidth="4" markerEnd={`url(#${id}a)`}/>
 <line x1={cx+out[0]*8} y1={cy-out[1]*8} x2={cx+out[0]*160} y2={cy-out[1]*160} stroke="#157061" strokeWidth="4" markerEnd={`url(#${id}b)`}/>
 {teaching&&corner&&normalCorner&&<><path d={`M${corner.x2},${corner.y2} L${corner.x2+normalCorner.x2-cx},${corner.y2+normalCorner.y2-cy} L${normalCorner.x2},${normalCorner.y2}`} fill="none" stroke="#173c50" strokeWidth="2"/><text x={cx+48} y={cy+5} fill="#173c50" fontSize="15">90°</text></>}
 <circle cx={cx} cy={cy} r="6" fill="#173c50"/>
 <text x="22" y="26" fill="#173c50" fontSize="16">{teaching?"Change the mirror. Watch the light.":"Given route — add your mirror and normal."}</text>
 <text x="22" y="345" fill="#173c50" fontSize="14">Gold: incoming · Green: {teaching?"outgoing":"required outgoing"} · Dashed: normal</text>
 </svg>;
}
export function MirrorLab(){const [mirror,setMirror]=useState<Exclude<Tilt,"">>("up-right");return <figure className="day30-diagram"><div className="day30-controls">{(["up-right","down-right"] as const).map(v=><button className="button outline" key={v} aria-pressed={mirror===v} onClick={()=>setMirror(v)}>{v==="up-right"?"/ Up-right mirror":"\\ Down-right mirror"}</button>)}</div><RayPicture mirror={mirror} normal={mirror==="up-right"?"down-right":"up-right"} teaching/><figcaption>The solid line is the mirror. The dashed normal makes a square corner with it. Each ray is 45° from the normal on the light’s side.</figcaption></figure>;}
export function parseMirrorAnswer(answer:string){return {mirror:(answer.match(/^Mirror: (.*)$/m)?.[1]??"") as Tilt,normal:(answer.match(/^Normal: (.*)$/m)?.[1]??"") as Tilt,reason:answer.includes("Reason: ")?answer.split("Reason: ").slice(1).join("Reason: "):answer.startsWith("Mirror:")?"":answer};}
export function MirrorAnswer({itemId,answer,onAnswer}:{itemId:string;answer:string;onAnswer:(v:string)=>void}){const value=parseMirrorAnswer(answer);const update=(key:keyof typeof value,v:string)=>{const n={...value,[key]:v};onAnswer(`Mirror: ${n.mirror}\nNormal: ${n.normal}\nReason: ${n.reason}`);};return <div className="day30-mirror-answer"><p>These controls keep your choices. They do not mark them right or wrong.</p><div className="day30-controls">{(["mirror","normal"] as const).map(k=><label key={k}>{k==="mirror"?"Mirror tilt":"Normal direction"}<select value={value[k]} onChange={e=>update(k,e.target.value)}><option value="">Choose a direction</option><option value="up-right">/ Up-right</option><option value="down-right">\ Down-right</option><option value="upright">Upright</option></select></label>)}</div><RayPicture mirror={value.mirror} normal={value.normal} incoming={itemId==="s30-1"?[0,1]:[0,-1]}/><label htmlFor={itemId+"-reason"}>Your explanation</label><textarea id={itemId+"-reason"} rows={3} value={value.reason} onChange={e=>update("reason",e.target.value)} placeholder="Explain how your normal should meet the mirror."/></div>;}
