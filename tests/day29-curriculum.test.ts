import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {it} from "node:test";
import {DailyScheduleSchema} from "../shared/schemas/lesson.js";
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
