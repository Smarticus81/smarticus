import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {it} from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {DailyScheduleSchema} from "../shared/schemas/lesson.js";
import {Day31Lesson} from "../client/src/components/lessons/Day31Lesson.js";
import {waterAngle,SplitFloor,OralResult} from "../client/src/components/lessons/Day31Visuals.js";
it("Wednesday preserves continuity and teaches before assessment",async()=>{
 const day=DailyScheduleSchema.parse(JSON.parse(await readFile("curriculum/2026-27/daily/2026-10-07.json","utf8")));
 assert.equal(day.day_number,31);assert.equal(day.lessons.length,7);assert.equal(day.lessons.reduce((s,l)=>s+l.estimated_minutes,0),290);
 const ids=new Set();for(const l of day.lessons){assert.equal(l.status,"scheduled");assert.equal(l.date,day.date);const html=renderToStaticMarkup(createElement(Day31Lesson,{lesson:l,onExplore:()=>{}}));assert.ok(html.indexOf("LEARN THE IDEA")<html.indexOf("SEE HOW IT WORKS"));assert.ok(html.indexOf("Worked result")<html.lastIndexOf("Open Practice"));assert.doesNotMatch(html,/<textarea/);for(const q of [...l.independent_practice,...l.exit_ticket]){assert.ok(!ids.has(q.id));ids.add(q.id);assert.ok(l.answer_key[q.id]);}}
 const builder=day.lessons.find(l=>l.subject==="computer_science")!;assert.match(builder.written_instruction,/tmuso/);assert.match(builder.written_instruction,/Hover-One-Day31.blend/);assert.match(builder.written_instruction,/project can still be ongoing/);
 assert.match(day.lessons.find(l=>l.subject==="literature")!.written_instruction,/page 115/);
 for(const n of ["library-readers.jpg","tribune-veto.jpg","hover-tested-poster.jpg"])assert.ok((await readFile(`client/public/lesson-visuals/2026-10-07/${n}`)).length>10000);
});
it("refraction preserves the optical rule in both travel directions and at normal incidence",()=>{
 assert.equal(waterAngle(0),0);for(const air of [1,15,30,45,65]){const water=waterAngle(air);assert.ok(water>0&&water<air);assert.ok(water<Math.asin(1/1.333)*180/Math.PI);assert.ok(Math.abs(Math.sin(air*Math.PI/180)-1.333*Math.sin(water*Math.PI/180))<1e-12);}
});
it("assessment dimensions support equal-area partitions without exposing the result",()=>{
 const w=7,h=5,r=3,b=2;assert.equal(w*h+r*b,(w+r)*b+w*(h-b));
 for(const initial of ["vertical","horizontal"] as const){const html=renderToStaticMarkup(createElement(SplitFloor,{leftWidth:w,height:h,rightWidth:r,lowerHeight:b,initial}));assert.doesNotMatch(html,/>41</);assert.match(html,/units/);}
 const oral=renderToStaticMarkup(createElement(OralResult,{itemId:"fe31-1",answer:"",onAnswer:()=>{}}));assert.match(oral,/Not checked/);assert.match(oral,/Correct after retry/);assert.match(oral,/<option value="" selected="">Record what happened/);
});
