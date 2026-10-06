import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {it} from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {DailyScheduleSchema} from "../shared/schemas/lesson.js";
import {Day30Lesson} from "../client/src/components/lessons/Day30Lesson.js";
import {MirrorAnswer,LPlan,parseMirrorAnswer,reflectedDirection} from "../client/src/components/lessons/Day30Visuals.js";
import {answersChanged,parseStoredSubmission,submissionView} from "../shared/submissionRecord.js";
import {lessonWork} from "../client/src/voice/workStore.js";
const path="curriculum/2026-27/daily/2026-10-06.json";
it("Tuesday is a seven-subject paper-free day with current Builder and reading continuity",async()=>{
 const day=DailyScheduleSchema.parse(JSON.parse(await readFile(path,"utf8")));
 assert.equal(day.day_number,30);assert.equal(day.lessons.length,7);assert.equal(day.lessons.reduce((n,l)=>n+l.estimated_minutes,0),290);
 assert.match(day.todays_goal,/9:30/);assert.match(day.todays_goal,/3:30/);
 for(const lesson of day.lessons){assert.equal(lesson.date,day.date);assert.ok(lesson.worked_examples.length>=2);assert.ok(lesson.exit_ticket.length);const html=renderToStaticMarkup(createElement(Day30Lesson,{lesson,onExplore:()=>{}}));assert.ok(html.indexOf("LEARN THE IDEA")<html.indexOf("SEE HOW IT WORKS"));assert.ok(html.indexOf("Worked result")<html.lastIndexOf("Open Practice"));assert.doesNotMatch(html,/<textarea/);}
 assert.match(day.lessons.find(l=>l.subject==="computer_science")!.written_instruction,/still ongoing/);
 assert.match(day.lessons.find(l=>l.subject==="literature")!.written_instruction,/actual bookmark/);
 for(const name of ["headphone-comparison.jpg","rome-written-laws.jpg","hover-reference.jpg"])assert.ok((await readFile(`client/public/lesson-visuals/2026-10-06/${name}`)).length>10000);
});
it("mirror model follows the reflection rule; assessment keeps independent choices",()=>{
 const close=(actual:number[],expected:number[])=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
 close(reflectedDirection([1,0],"up-right"),[0,1]);close(reflectedDirection([1,0],"down-right"),[0,-1]);close(reflectedDirection([0,1],"down-right"),[-1,0]);close(reflectedDirection([0,-1],"up-right"),[-1,0]);
 const text="Mirror: upright\nNormal: up-right\nReason: My first try.";
 assert.deepEqual(parseMirrorAnswer(text),{mirror:"upright",normal:"up-right",reason:"My first try."});
 const html=renderToStaticMarkup(createElement(MirrorAnswer,{itemId:"s30-1",answer:text,onAnswer:()=>{}}));assert.match(html,/mirror upright, normal up-right/);assert.doesNotMatch(html,/correct answer|data-correct|35 degrees/);
 const area=renderToStaticMarkup(createElement(LPlan,{width:8,height:4,sideWidth:3,sideHeight:2}));assert.match(area,/8 by 4 units/);assert.match(area,/3 by 2 units/);assert.doesNotMatch(area,/>38</);
});
it("submission records preserve answers, reject malformed entries, and distinguish unsent edits",()=>{
 const answers=[{item_id:"a",section:"independent_practice" as const,prompt:"Why?",answer:"Because it changed."}];
 const view=submissionView({id:"r",content:JSON.stringify({mode:"platform",answers:[...answers,{answer:42}],note:"Still working"}),submittedAt:new Date("2026-10-06T16:00:00Z"),createdAt:new Date()},"lesson");
 assert.equal(view.answered,1);assert.deepEqual(view.answers,answers);assert.equal(view.note,"Still working");assert.equal(answersChanged(answers,view.answers),false);assert.equal(answersChanged([{...answers[0],answer:"Revised"}],view.answers),true);assert.equal(parseStoredSubmission("legacy non-JSON"),null);
});
it("a slow hand-in cannot put its receipt on a different lesson",async()=>{
 let resolve!:(v:ReturnType<typeof submissionView>)=>void;const pending=new Promise<ReturnType<typeof submissionView>>(r=>resolve=r);
 lessonWork.reset();lessonWork.register({collect:()=>[],submit:()=>pending});const request=lessonWork.submit({mode:"platform"});lessonWork.register(null);lessonWork.register({collect:()=>[],submit:async()=>{throw Error("unused")}});
 resolve(submissionView({id:"old",content:null,submittedAt:new Date(),createdAt:new Date()},"old-lesson"));await request;assert.equal(lessonWork.getSnapshot().last,null);lessonWork.register(null);
});
