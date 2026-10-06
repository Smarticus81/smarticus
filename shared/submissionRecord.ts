export interface SubmittedAnswer {
 item_id:string; section:"guided_practice"|"independent_practice"|"exit_ticket"; prompt:string; answer:string;
}
export interface SubmissionView {
 id:string; lesson_id:string; mode:"platform"|"paper"; submitted_at:string; answered:number; total:number; photos:number; note:string|null; answers:SubmittedAnswer[];
}
/** Read only the student's submitted fields, never the lesson's answer key. */
export function parseStoredSubmission(content:string|null){
 if(!content)return null;
 try{
  const p:unknown=JSON.parse(content);if(!p||typeof p!=="object")return null;
  const v=p as Record<string,unknown>;
  const answers=(Array.isArray(v.answers)?v.answers:[]).filter((a):a is SubmittedAnswer=>!!a&&typeof a==="object"&&typeof a.item_id==="string"&&typeof a.prompt==="string"&&typeof a.answer==="string"&&["guided_practice","independent_practice","exit_ticket"].includes(a.section));
  return {mode:v.mode==="paper"?"paper" as const:"platform" as const,answers,photo_ids:(Array.isArray(v.photo_ids)?v.photo_ids:[]).filter((p):p is string=>typeof p==="string"),note:typeof v.note==="string"?v.note:null};
 }catch{return null;}
}
export function submissionView(row:{id:string;content:string|null;submittedAt:Date|null;createdAt:Date},lessonId:string):SubmissionView{
 const p=parseStoredSubmission(row.content);const answers=p?.answers??[];
 return {id:row.id,lesson_id:lessonId,mode:p?.mode??"platform",submitted_at:(row.submittedAt??row.createdAt).toISOString(),answered:answers.filter(a=>a.answer.trim()).length,total:answers.length,photos:p?.photo_ids.length??0,note:p?.note??null,answers};
}
export function answersChanged(current:SubmittedAnswer[],saved:SubmittedAnswer[]){
 const prior=new Map(saved.map(a=>[`${a.section}:${a.item_id}`,a.answer]));
 return current.some(a=>(prior.get(`${a.section}:${a.item_id}`)??"")!==a.answer);
}
