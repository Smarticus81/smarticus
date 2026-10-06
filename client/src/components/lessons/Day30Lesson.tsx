import type { LessonView } from "../../lib/types";
import { HoverBuilderLesson } from "./HoverBuilderLesson";
import { LPlan, MirrorLab } from "./Day30Visuals";

const subjects:Record<string,{name:string;time:string;line:string;image?:string;alt?:string}>={
 mathematics:{name:"Mathematics",time:"9:30–10:20",line:"Two pieces. One whole."},
 writing:{name:"Writing",time:"10:30–11:20",line:"Tell me why.",image:"2026-10-06/headphone-comparison.jpg",alt:"Illustration of the invented headphone test: Leo compares two cables using the same laptop and headphones."},
 french:{name:"French",time:"11:20–11:45",line:"Let’s make a plan.",image:"2026-10-05/french-conversation.jpg",alt:"Two classmates talking at their art table."},
 science:{name:"Science",time:"11:45–12:20",line:"Turn it. Follow the light."},
 history_geography:{name:"History & geography",time:"1:00–1:35",line:"Who knows the rules?",image:"2026-10-06/rome-written-laws.jpg",alt:"Artist’s imagined scene of people discussing publicly posted laws in ancient Rome."},
 computer_science:{name:"AI Builder",time:"1:35–2:35",line:"Your car. The next step.",image:"2026-10-06/hover-reference.jpg",alt:"Assistant-made reference car: blue and gold, with wheels and a rear wing. This is not submitted student work."},
 literature:{name:"Literature",time:"2:45–3:20",line:"A clue needs a reason."}
};
export function Day30Lesson({lesson,onExplore}:{lesson:LessonView;onExplore:()=>void}){
 const subject=subjects[lesson.subject];const number=Object.keys(subjects).indexOf(lesson.subject)+1;
 return <div className="day29-lesson day30-lesson">
 <header className="day29-title-page"><div className="day29-title-copy"><span className="eyebrow">TUESDAY · DAY 30 · CHAPTER {String(number).padStart(2,"0")}</span><p className="day29-subject">{subject.name}<span>{subject.time}</span></p><h2>{subject.line}</h2><p>{lesson.learning_objectives[0]}</p><div className="day29-route"><span>1 · Learn</span><span>2 · See examples</span><span>3 · Type & hand in</span></div></div>{subject.image&&<img className="day30-cover" src={`/lesson-visuals/${subject.image}`} alt={subject.alt}/>}</header>
 <aside className="day30-paperless"><strong>Everything stays on screen.</strong> Read the lesson, open Practice, then click <strong>Hand in my answers</strong>. A saved draft is not a hand-in.</aside>
 <section className="day29-section"><span className="eyebrow">01 / LEARN THE IDEA</span><h3>{lesson.lesson_title}</h3><p className="day29-purpose">{lesson.why_it_matters}</p>
 {lesson.subject==="mathematics"&&<LPlan interactive/>}{lesson.subject==="science"&&<MirrorLab/>}
 {lesson.subject==="writing"&&<div className="day30-comparison"><div><b>Cable A</b><p>Sound cuts out 3 times in 2 minutes.</p></div><div><b>Cable B</b><p>Clear sound for 2 minutes.</p></div><div><b>A again</b><p>The sound cuts out again.</p></div><small>Invented test. Same laptop, headphones, song and volume. The picture illustrates the story; these words give the results.</small></div>}
 {lesson.subject==="french"&&<div className="day30-talk"><p><b>Ava</b> Est-ce que tu vas dessiner demain ?</p><p><b>Noah</b> Oui, je vais dessiner.</p><p><b>Ava</b> Nous allons dessiner ensemble.</p></div>}
 {lesson.subject==="history_geography"&&<div className="day30-comparison"><div><b>Around 450 BCE</b><p>Rome’s laws are written and displayed.</p></div><div><b>People can check</b><p>A reader can share the words aloud.</p></div><div><b>Fair for everyone?</b><p>A public rule can still be unfair.</p></div><small>The image is an artist’s imagined reconstruction, not evidence of the tablets’ exact appearance.</small></div>}
 {lesson.subject==="computer_science"&&<p className="day30-paperless">Project status: <strong>Still in progress.</strong> Keep your saved model and its existing features. The picture is our reference car.</p>}
 <div className="day29-vocabulary">{lesson.vocabulary.map(w=><div key={w.term}><strong>{w.term}</strong><p>{w.definition}</p></div>)}</div>
 <div className="day29-instruction">{lesson.written_instruction.split(/\n+/).filter(Boolean).map((p,i)=>p.startsWith("VIDEO LINK: ")?<p key={i}><a className="button outline" href={p.slice(12).trim()} target="_blank" rel="noreferrer">Watch: Roman social and political groups ↗</a></p>:<p key={i}>{p}</p>)}</div>
 {lesson.subject==="computer_science"&&<details className="day30-guide"><summary>Open the original illustrated build guide</summary><p>Use the step you have not finished. Its Monday times and starter downloads are for the first session; today, keep your current file and the schedule above.</p><HoverBuilderLesson continuation/></details>}
 </section>
 <section className="day29-section"><span className="eyebrow">02 / SEE HOW IT WORKS</span><h3>Follow a complete example.</h3>{lesson.worked_examples.map((e,i)=><article className="day29-model" key={e.title}><span className="eyebrow">EXAMPLE {i+1}</span><h4>{e.title}</h4><p>{e.problem}</p><div className="day29-result"><strong>Worked result</strong><p>{e.solution}</p></div><p><strong>Why it works:</strong> {e.explanation}</p></article>)}</section>
 <section className="day29-next"><div><span className="eyebrow">03 / YOUR TURN</span><h3>{lesson.subject==="computer_science"?"Save your progress update.":"Now try it yourself."}</h3><p>Your answer boxes and hand-in button are in Practice.</p></div><button className="button dark" onClick={onExplore}>Open Practice →</button></section>
 </div>;
}
