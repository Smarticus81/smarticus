import {it} from "node:test";
import assert from "node:assert/strict";
import {newRunner,stepRunner,starterCourse,readCourse,type Platform} from "../client/src/lib/skyRun.js";
import {buildVoiceInstructions,RESPONSE_QUALITY_RULES} from "../server/services/voicePrompt.js";
const course:Platform[]=[...starterCourse(),{id:3,x:0,z:-10,size:3.6,kind:"checkpoint"},{id:4,x:-1,z:-15,size:3.6,kind:"plain"},{id:5,x:0,z:-20,size:3.6,kind:"finish"}];
it("landing on a checkpoint changes fall recovery, while full restart clears it",()=>{
 let p={...newRunner(course),x:0,z:-10,y:.01,vy:-1,grounded:false};p=stepRunner(p,course,0,0,false,1/60);assert.equal(p.checkpoint,3);
 p=stepRunner({...p,y:-10,x:50},course,0,0,false,1/60);assert.equal(p.x,0);assert.equal(p.z,-10);assert.equal(p.falls,1);
 const restart=newRunner(course);assert.equal(restart.checkpoint,1);assert.equal(restart.falls,0);assert.equal(restart.z,0);
});
it("jumping rises, gravity returns the runner, finish wins, and save preserves the course",()=>{
 let p=stepRunner(newRunner(course),course,0,0,true,1/60);assert.ok(p.y>0);
 for(let i=0;i<70;i++)p=stepRunner(p,course,0,0,false,1/60);assert.equal(p.y,0);assert.equal(p.grounded,true);
 p=stepRunner({...p,z:-20,y:.01,vy:-1},course,0,0,false,1/60);assert.equal(p.won,true);
 assert.deepEqual(readCourse(JSON.parse(JSON.stringify(course))),course);
 assert.throws(()=>readCourse([{id:1,x:0,z:0,size:1e9,kind:"plain"}]));
});
it("Virgil keeps the assigned Blender build and knows when he can see it",()=>{
 const voice=buildVoiceInstructions({studentName:"Atticus",lessonTitle:"Hover One",subject:"computer_science"});
 for(const rules of [RESPONSE_QUALITY_RULES,voice]){
  assert.match(rules,/HOVER ONE car project/);
  assert.match(rules,/Give one clear action and check what he sees/);
  // He can see Blender only through a whole-screen or window share, and must say so otherwise.
  assert.match(rules,/sharing his whole screen or the Blender window/);
  assert.match(rules,/press Share screen and choose Entire screen/);
  assert.match(rules,/Never claim to see Blender when no such share is on/);
  assert.match(rules,/never claim to control it/);
 }
});
