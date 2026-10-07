import {useId,useState} from "react";

export function SplitFloor({leftWidth=6,height=4,rightWidth=3,lowerHeight=2,initial="vertical",interactive=false}:{leftWidth?:number;height?:number;rightWidth?:number;lowerHeight?:number;initial?:"vertical"|"horizontal";interactive?:boolean}){
 const [split,setSplit]=useState(initial);const x=70,y=55,s=36,w=leftWidth*s,h=height*s,r=rightWidth*s,b=lowerHeight*s;
 const horizontal=split==="horizontal";
 return <figure className="day30-diagram day31-floor">
 {interactive&&<div className="day30-controls">{(["vertical","horizontal"] as const).map(v=><button className="button outline" key={v} aria-pressed={split===v} onClick={()=>setSplit(v)}>{v==="vertical"?"Split up and down":"Split across"}</button>)}</div>}
 <svg viewBox={`0 0 ${w+r+150} ${h+145}`} role="img" aria-label={`L-shaped floor, ${split} split. ${horizontal?`Bottom ${leftWidth+rightWidth} by ${lowerHeight}; top left ${leftWidth} by ${height-lowerHeight}`:`Left ${leftWidth} by ${height}; right ${rightWidth} by ${lowerHeight}`} units.`}>
 <path d={`M${x},${y}h${w}v${h-b}h${r}v${b}H${x}Z`} fill="#dce9ed"/>
 {horizontal?<><rect x={x} y={y+h-b} width={w+r} height={b} fill="#edca7b"/><path d={`M${x},${y+h-b}h${w}`} stroke="#173c50" strokeWidth="3" strokeDasharray="7 5"/></>:<><rect x={x+w} y={y+h-b} width={r} height={b} fill="#edca7b"/><path d={`M${x+w},${y+h-b}v${b}`} stroke="#173c50" strokeWidth="3" strokeDasharray="7 5"/></>}
 <path d={`M${x},${y}h${w}v${h-b}h${r}v${b}H${x}Z`} fill="none" stroke="#173c50" strokeWidth="3"/>
 <g fill="#173c50" fontSize="17" textAnchor="middle"><text x={x+w/2} y={y-17}>{leftWidth} units</text><text x={x-35} y={y+h/2}>{height}</text><text x={x+w+r/2} y={y+h-b-15}>{rightWidth}</text><text x={x+w+r+30} y={y+h-b/2+6}>{lowerHeight}</text><text x={x+(w+r)/2} y={y+h+32}>Full width: {leftWidth+rightWidth} units</text>
 {horizontal?<><text x={x+w/2} y={y+(h-b)/2+6}>{leftWidth} × {height-lowerHeight}</text><text x={x+(w+r)/2} y={y+h-b/2+6}>{leftWidth+rightWidth} × {lowerHeight}</text></>:<><text x={x+w/2} y={y+h/2+6}>{leftWidth} × {height}</text><text x={x+w+r/2} y={y+h-b/2+6}>{rightWidth} × {lowerHeight}</text></>}
 </g></svg><figcaption>{horizontal?`Across: bottom strip ${leftWidth+rightWidth} by ${lowerHeight}; top left piece ${leftWidth} by ${height-lowerHeight}.`:`Up and down: left piece ${leftWidth} by ${height}; right piece ${rightWidth} by ${lowerHeight}.`} All lengths are in units. The dashed line is the split.</figcaption>
 </figure>;
}
export function waterAngle(airDegrees:number){return Math.asin(Math.sin(airDegrees*Math.PI/180)/1.333)*180/Math.PI;}
export function RefractionLab(){
 const [angle,setAngle]=useState(45),[reverse,setReverse]=useState(false);const id=useId().replace(/:/g,"");
 const a=angle*Math.PI/180,b=waterAngle(angle)*Math.PI/180,cx=300,cy=230,len=165;
 const start=[cx-len*Math.sin(a),cy-len*Math.cos(a)],end=[cx+len*Math.sin(b),cy+len*Math.cos(b)];
 return <figure className="day30-diagram day31-refraction"><div className="day30-controls"><label>Light angle in air: {angle}°<input type="range" min="0" max="65" value={angle} onChange={e=>setAngle(Number(e.target.value))}/></label><button className="button outline" aria-pressed={reverse} onClick={()=>setReverse(!reverse)}>{reverse?"Run air → water":"Reverse the light"}</button></div>
 <svg viewBox="0 0 600 450" role="img" aria-label={`${reverse?"Water to air":"Air to water"}: ${angle===0?"light goes straight along the normal":reverse?"light bends away from the normal":"light bends toward the normal"}. Only the transmitted ray is shown.`}>
 <defs><linearGradient id={id+"water"} x2="0" y2="1"><stop stopColor="#c8e4e9"/><stop offset="1" stopColor="#8fbcca"/></linearGradient><marker id={id+"arrow"} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#ac6e11"/></marker></defs>
 <rect x="10" y="50" width="580" height="180" rx="12" fill="#f7f1e6"/><path d="M10 230H590V422Q590 434 578 434H22Q10 434 10 422Z" fill={`url(#${id}water)`}/><path d="M10 230H590" stroke="#4c8394" strokeWidth="3"/>
 <path d="M300 45V428" stroke="#183e54" strokeWidth="2" strokeDasharray="7 6"/><path d="M300 212H318V230" stroke="#183e54" strokeWidth="2" fill="none"/>
 <g fill="#183e54" fontSize="18"><text x="30" y="90">AIR</text><text x="30" y="405">WATER</text><text x="315" y="36">Normal</text><text x="435" y="217">Surface</text><text x="328" y="201" fontSize="14">90°</text></g>
 <path d={reverse?`M${end[0]},${end[1]}L${cx},${cy}L${start[0]},${start[1]}`:`M${start[0]},${start[1]}L${cx},${cy}L${end[0]},${end[1]}`} fill="none" stroke="#ac6e11" strokeWidth="5" markerMid={`url(#${id}arrow)`} markerEnd={`url(#${id}arrow)`}/>
 </svg><div className="day31-live-note" aria-live="polite">{angle===0?"Straight along the normal: speed changes, direction stays the same.":reverse?"Water → air: faster, and farther away from the normal.":"Air → water: slower, and closer to the normal."}</div><figcaption>Move the slider, then try 0°. This exact model follows only light passing through the surface. Some light also reflects; that part is not drawn. The reversed paths shown can all pass out into air.</figcaption></figure>;
}
export function OralResult({itemId,answer,onAnswer}:{itemId:string;answer:string;onAnswer:(v:string)=>void}){
 const options=["Correct first try","Correct after retry","Needs help","Not checked"];
 return <div className="day31-oral"><label htmlFor={itemId+"-result"}>Parent’s observed result</label><select id={itemId+"-result"} value={answer} onChange={e=>onAnswer(e.target.value)}><option value="">Record what happened</option>{options.map(o=><option key={o}>{o}</option>)}</select><p>Choose a result only after listening. “Not checked” keeps this cue pending.</p></div>;
}
export function BuilderSteps(){return <div className="day31-builder-map"><h4>Your edge-setting guide</h4><p>This is a labelled settings guide, not a screenshot of your laptop. Your body part may have a different name.</p><ol className="day31-step-cards">
 <li><b>Select the body</b><span>Top-left mode menu → Object Mode. Click the car body. An outline shows the selected object.</span></li>
 <li><b>Open the wrench tab</b><span>In the Properties panel on the right, click the wrench icon. Look for an existing Bevel modifier.</span></li>
 <li><b>Find Bevel</b><span>Use the existing Bevel, or Add Modifier → search “Bevel”. Keep the original shape editable.</span></li>
 <li><b>Start small</b><div className="day31-settings"><p><span>Width Type</span><strong>Percent</strong></p><p><span>Amount / Width Percent</span><strong>1%</strong></p><p><span>Segments</span><strong>2</strong></p><p><span>Clamp Overlap</span><strong>On</strong></p></div></li>
 <li><b>Look before keeping it</b><span>Hide/show with the small monitor icon. Too round? Try 0.5%. Broken or stretched? Undo and ask with a screenshot.</span></li>
 <li><b>Save two files</b><span>File → Save As saves your .blend project. After Render → Render Image, Image → Save As saves your .png poster.</span></li>
 </ol><details className="day30-guide"><summary>Stuck? Read this to Virgil.</summary><p>“I am using Blender on Windows. I opened my saved HOVER ONE car and selected its body in Object Mode. I want a small bevel that catches light. My screen shows ____. Here is a screenshot. Give me the next click, then wait for me to check it. Keep my engines and animation.”</p></details></div>;}
