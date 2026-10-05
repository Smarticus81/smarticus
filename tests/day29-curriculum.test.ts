import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {it} from "node:test";
import {DailyScheduleSchema} from "../shared/schemas/lesson.js";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {Day29Lesson} from "../client/src/components/lessons/Day29Lesson.js";
it("Monday Day 29 has seven taught lessons, 9:30 start, bounded Builder and current continuity", async()=>{
 const day=DailyScheduleSchema.parse(JSON.parse(await readFile("curriculum/2026-27/daily/2026-10-05.json","utf8")));
 assert.equal(day.day_number,29);assert.equal(day.lessons.length,7);
 assert.match(day.todays_goal,/9:30 AM to 3:30 PM/);
 assert.equal(day.lessons.reduce((a,l)=>a+l.estimated_minutes,0),290);
 for(const l of day.lessons){assert.equal(l.date,day.date);assert.ok(l.worked_examples.length>=2);assert.ok(l.independent_practice.length);assert.ok(l.exit_ticket.length);await readFile(`client/public/lesson-visuals/${day.date}/${l.subject}.svg`);}
 assert.match(day.lessons.find(l=>l.subject==='literature')!.previous_learning,/81-93/);
 assert.match(day.lessons.find(l=>l.subject==='computer_science')!.teacher_notes,/No Windows-device tests performed/);
 assert.match(day.lessons.find(l=>l.subject==='french')!.previous_learning,/parent-observed/);
});
it("the visual lesson shows complete teaching before the learner is asked to practise", async()=>{
 const day=DailyScheduleSchema.parse(JSON.parse(await readFile("curriculum/2026-27/daily/2026-10-05.json","utf8")));
 for(const lesson of day.lessons){
  const page=renderToStaticMarkup(createElement(Day29Lesson,{lesson,onExplore:()=>{}}));
  assert.ok(page.indexOf("LEARN THE IDEA") < page.indexOf("SEE HOW IT WORKS"));
  assert.ok(page.indexOf("Worked result") < page.indexOf("Ready to try the idea?"));
  assert.equal((page.match(/Worked result/g)||[]).length,lesson.worked_examples.length);
  assert.doesNotMatch(page,/<textarea|<input|What would you try first/);
 }
 const builder=day.lessons.find(l=>l.subject==="computer_science")!;
 for(const game of ["FORTNITE", "GTA", "FC 27", "ROCKET LEAGUE", "ROBLOX", "FORZA HORIZON 6"]) assert.ok(builder.written_instruction.includes(game));
});
