import guide from "../../../public/lesson-visuals/2026-10-05/hover-guide.json";

const base = "/lesson-visuals/2026-10-05/";
export function HoverBuilderLesson() {
 return <div className="day29-lesson hover-builder">
  <header className="day29-title-page">
   <img className="hover-hero" src={base+"hover-car-poster.jpg"} alt="Teacher-built example: a blue hover-car with a dark canopy, four gold engines and a rear wing on a lit studio stage."/>
   <div className="day29-title-copy"><span className="eyebrow">MONDAY · DAY 29 · 1:35–2:35</span><p className="day29-subject">AI Builder · Session 1</p><h2>HOVER ONE</h2><p>{guide.subtitle}</p><p>Inspired by Rocket League’s vehicle showcases. Your own model, made in Blender.</p></div>
  </header>
  <section className="day29-section">
   <h3>Everything you need to begin</h3><p>Build in <strong>Blender 5.2 on your Windows laptop</strong>. Keep Virgil open for help. Save in <strong>Documents → Atticus-AI-Builder</strong>.</p>
   <div className="hover-downloads"><a className="button dark" href={base+"Hover-Studio.blend"} download>Download starting studio</a><a className="button" href={base+"Atticus_AI_Builder_2026-10-05.pdf"} download>Download illustrated lesson PDF</a></div>
   <p>The starting file has the stage, camera, lights and paint. <strong>You build the car.</strong> The pictures show a teacher-made example. No GitHub or new account is needed.</p>
   <details className="hover-parent"><summary>Parent: check the setup before the lesson</summary>{guide.parent.slice(0,5).map(p=><p key={p}>{p}</p>)}<a href="https://www.blender.org/download/" target="_blank" rel="noreferrer">Official Blender download — choose Windows ARM ↗</a></details>
  </section>
  <nav className="hover-contents" aria-label="Builder lesson steps">{guide.sections.map((s,i)=><a key={s.title} href={"#hover-step-"+i}>{i+1}. {s.title}</a>)}</nav>
  {guide.sections.map((s,i)=><section className="day29-section hover-step" id={"hover-step-"+i} key={s.title}>
   <span className="eyebrow">{s.time}</span><h3><span className="hover-number">{i+1}</span>{s.title}</h3><p className="day29-purpose">{s.intro}</p>
   {[0,2,3].includes(i)&&<figure><img src={base+(i===0?"empty-studio.jpg":s.image)} alt={i===0?"Starting studio: an empty stage, with no car yet.":i===2?"The first two parts: a low blue body with a dark canopy on top.":"Finished seven-part car: body, canopy, four side engines and rear wing."}/><figcaption>Actual Blender render · {i===0?"Your starting point":i===2?"After the first two parts":"The taught model"}</figcaption></figure>}
   <ol className="hover-actions">{s.steps.map(t=><li key={t}>{t}</li>)}</ol>
   <div className="day29-result"><strong>What you should see</strong><p>{s.check}</p></div>
  </section>)}
  <section className="day29-section"><span className="eyebrow">HELP WHEN YOU NEED IT</span><h3>Stuck? Start here.</h3>{guide.fixes.map(([issue,fix])=><details className="hover-fix" key={issue}><summary>{issue}</summary><p>{fix}</p></details>)}</section>
  <section className="day29-next"><div><span className="eyebrow">NEXT SESSION</span><h3>Make your car move.</h3><p>Keep your .blend file. We will use this same car for a hover-and-turn shot, then a short reveal trailer.</p></div></section>
 </div>;
}
