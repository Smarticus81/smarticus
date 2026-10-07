import {test,expect,type Page} from "@playwright/test";
import {readFileSync} from "node:fs";
const raw=JSON.parse(readFileSync("curriculum/2026-27/daily/2026-10-07.json","utf8"));
const day={...raw,lessons:raw.lessons.map((l:any)=>({...l,external_id:l.id,teacher_notes:"",answer_key:{},guided_practice:[],independent_practice:l.independent_practice.map(({id,prompt,hint}:any)=>({id,prompt,hint})),exit_ticket:l.exit_ticket.map(({id,prompt}:any)=>({id,prompt}))}))};
async function mock(page:Page){const saved:Record<string,any[]>={};await page.route("**/api/**",async route=>{const u=new URL(route.request().url());let data:any;
 if(u.pathname==="/api/schedule/today")data=day;
 else if(u.pathname==="/api/schedule/dates")data=[day.date];
 else if(u.pathname==="/api/student/snapshot")data={student:{id:"test",preferredName:"Atticus",gradeLevel:6},mastery:[],recentSessions:[],attendance:[]};
 else if(u.pathname==="/api/lessons/select")data=day.lessons.find((l:any)=>l.id===route.request().postDataJSON().lesson_id);
 else if(u.pathname.endsWith("/submissions"))data=saved[u.pathname.split('/')[3]]??[];
 else if(u.pathname==="/api/lessons/submit"){const body=route.request().postDataJSON();data={id:"test-receipt",lesson_id:body.lesson_id,mode:body.mode,submitted_at:"2026-10-07T16:40:00Z",answered:body.answers.filter((a:any)=>a.answer.trim()).length,total:body.answers.length,photos:0,note:body.note??null,answers:body.answers};saved[body.lesson_id]=[data];}
 else return route.fulfill({status:503,json:{error:"No live service calls in this check."}});
 return route.fulfill({json:data});});}
async function open(page:Page,subject:string){const l=day.lessons.find((l:any)=>l.subject===subject);await page.goto('/tests/browser/index.html?date=2026-10-07&view=today');await page.getByRole('button').filter({hasText:l.lesson_title}).first().click();await expect(page.locator('#lesson-menu')).toBeVisible();await expect(page.locator('.day31-lesson')).toBeVisible();}
test('Wednesday screens, interactive models and online speaking receipt',async({page})=>{test.setTimeout(120000);await mock(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const subject of ['mathematics','writing','french','science','history_geography','computer_science','literature']){await open(page,subject);await expect(page.getByRole('button',{name:'Open Practice →',exact:true})).toBeVisible();const imgs=page.locator('.day31-lesson img');for(let i=0;i<await imgs.count();i++)await expect(imgs.nth(i)).toHaveJSProperty('naturalWidth',subject==='computer_science'?960:1536);
 if(subject==='mathematics'){await page.getByRole('button',{name:'Split across',exact:true}).click();await expect(page.locator('.day31-floor svg')).toHaveAttribute('aria-label',/Bottom 9 by 2; top left 6 by 2/);}
 if(subject==='science'){await page.getByRole('slider').fill('0');await expect(page.locator('.day31-live-note')).toContainText('direction stays the same');await page.getByRole('slider').fill('45');await page.getByRole('button',{name:'Reverse the light',exact:true}).click();await expect(page.locator('.day31-live-note')).toContainText('farther away');await page.locator('.day31-refraction').screenshot({path:'/workspace/scratch/3e7d50cba7dc/day31-science.png'});}
 if(subject==='computer_science'){await page.locator('.day31-builder-map').screenshot({path:'/workspace/scratch/3e7d50cba7dc/day31-builder.png'});}
 }
 await open(page,'french');await page.getByRole('button',{name:'Open Practice →',exact:true}).click();await expect(page.getByRole('button',{name:'Did it on paper? Open the camera',exact:true})).toHaveCount(0);
 for(let i=1;i<=4;i++){await page.getByRole('button',{name:new RegExp(`^Question ${i}:`)}).click();await page.locator('.focused-question textarea').fill('Test written answer '+i);}
 for(let i=5;i<=7;i++){await page.getByRole('button',{name:new RegExp(`^Question ${i}:`)}).click();await page.getByLabel('Parent’s observed result').selectOption(i===5?'Correct first try':i===6?'Correct after retry':'Not checked');}
 await page.getByRole('button',{name:/^Question 8:/}).click();await page.locator('.focused-question textarea').fill('TEST 10/7/26');await page.getByRole('button',{name:'Hand in my answers',exact:true}).click();await expect(page.locator('.hand-in-receipt')).toContainText('8 of 8 answers sent');
 await open(page,'french');await page.getByRole('button',{name:'Open Practice →',exact:true}).click();await page.getByRole('button',{name:/^Question 7:/}).click();await expect(page.getByLabel('Parent’s observed result')).toHaveValue('Not checked');await expect(page.locator('.hand-in-receipt')).toContainText('8 of 8');
 await page.setViewportSize({width:390,height:844});await open(page,'history_geography');await page.locator('.day29-title-page').screenshot({path:'/workspace/scratch/3e7d50cba7dc/day31-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(errors).toEqual([]);
});
