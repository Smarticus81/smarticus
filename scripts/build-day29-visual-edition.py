import json,html,re,math,shutil
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF
from PIL import Image
import fitz
import argparse
a=argparse.ArgumentParser();a.add_argument('--workspace',required=True);args=a.parse_args();R=Path(args.workspace);REPO=Path(__file__).resolve().parents[1];A=REPO/'client/public/lesson-visuals/2026-10-05';O=R/'output/pdf';D=REPO/'curriculum/2026-27/daily/2026-10-05.json'
N='#153A52';G='#C99A3D';INK='#243847';BG='#FAF8F3';BLUE='#EAF2F6';GREEN='#EAF3E8';PINK='#F7EAE5'
day=json.loads(D.read_text());games=[]
for name,path in [('Body','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),('Bold','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),('Display','/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')]:pdfmetrics.registerFont(TTFont(name,path))
pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
sty=ParagraphStyle('text',fontName='Body',fontSize=11,leading=16,textColor=HexColor(INK),spaceAfter=8)
class Book:
 def __init__(self,path,kind):self.c=canvas.Canvas(str(path),pagesize=(612,792));self.c.setTitle('Atticus Day 29 Monday — '+kind.title());self.c.setAuthor('Atticus Homeschool');self.path=path;self.kind=kind;self.pages=[];self.y=740;self.open=False;self.subject='';self.section=''
 def finishpage(self):
  if not self.open:return
  c=self.c;c.setStrokeColor(HexColor('#DDD9CC'));c.line(38,40,574,40);c.setFont('Body',8);c.setFillColor(HexColor(N));c.drawString(38,25,'ATTICUS  /  DAY 29  /  05 OCT 2026');c.drawRightString(574,25,str(len(self.pages)));c.showPage()
 def page(self,title,section,subject=''):
  self.finishpage();self.pages.append(dict(title=title,section=section,subject=subject));self.open=True;self.subject=subject;self.section=section;c=self.c;c.setFillColor(HexColor(BG));c.rect(0,0,612,792,fill=1,stroke=0);c.setFillColor(HexColor(N));c.rect(0,716,612,76,fill=1,stroke=0);c.setFillColor(HexColor(G));c.setFont('Bold',9);c.drawString(38,765,section.upper());c.setFillColor(HexColor('#FFFFFF'));c.setFont('Display',20);c.drawString(38,733,title[:55]);self.y=693
  if section.startswith('NEXT UP'):
   self.c.bookmarkPage(self.kind+'-'+subject);self.c.addOutlineEntry(title,self.kind+'-'+subject,level=0)
 def ensure(self,h):
  if self.y-h<58:self.page('Continue: '+self.subject.replace('_',' ').title(),self.section,self.subject)
 def text(self,t,size=11,bold=False,color=INK,width=536,x=38,after=9):
  s=ParagraphStyle('p',parent=sty,fontName='Bold' if bold else 'Body',fontSize=size,leading=size*1.45,textColor=HexColor(color));p=Paragraph(html.escape(t),s);_,h=p.wrap(width,800);self.ensure(h+after);p.drawOn(self.c,x,self.y-h);self.y-=h+after
 def heading(self,t):self.ensure(52);self.text(t,14,True,N,after=9)
 def card(self,label,body,fill=BLUE):
  p=Paragraph(html.escape(body),sty);_,h=p.wrap(504,800);self.ensure(h+65);self.c.setFillColor(HexColor(fill));self.c.roundRect(38,self.y-h-54,536,h+54,10,fill=1,stroke=0);self.c.setFillColor(HexColor(N));self.c.setFont('Bold',10);self.c.drawString(54,self.y-21,label.upper());p.drawOn(self.c,54,self.y-h-36);self.y-=h+68
 def graphic(self,name,maxh=225):
  d=svg2rlg(str(A/(name+'.svg')));scale=min(536/d.width,maxh/d.height);h=d.height*scale;self.ensure(h+15);self.c.saveState();self.c.translate(38,self.y-h);self.c.scale(scale,scale);renderPDF.draw(d,self.c,0,0);self.c.restoreState();self.y-=h+15
 def bitmap(self,name,maxh=335):
  im=Image.open(A/name);scale=min(536/im.width,maxh/im.height);w,h=im.width*scale,im.height*scale;self.ensure(h+15);self.c.drawImage(str(A/name),38+(536-w)/2,self.y-h,width=w,height=h);self.y-=h+15
 def subject_picture(self,sub):
  order=['mathematics','writing','french','science','history_geography','literature'];i=order.index(sub);col=i%2;row=i//2
  h=200;w=536;self.ensure(h+15);im=Image.open(A/'subject-characters.jpg');fullw=w*2;fullh=fullw*im.height/im.width;cellh=fullh/3;y=self.y-h
  self.c.saveState();clip=self.c.beginPath();clip.rect(38,y,w,h);self.c.clipPath(clip,stroke=0);self.c.drawImage(str(A/'subject-characters.jpg'),38-col*w,y-(2-row)*cellh-(cellh-h)/2,width=fullw,height=fullh);self.c.restoreState();self.y-=h+15
 def lines(self,n=3):
  self.ensure(n*24+10);self.c.setStrokeColor(HexColor('#AABAC3'));self.c.setLineWidth(.55)
  for _ in range(n):self.y-=24;self.c.line(38,self.y,574,self.y)
  self.y-=12
 def drawspace(self,h):self.ensure(h+15);self.c.setStrokeColor(HexColor('#AABAC3'));self.c.roundRect(38,self.y-h,536,h,7,fill=0,stroke=1);self.y-=h+15
 def save(self):self.finishpage();self.c.save();return self.pages
names={'mathematics':'Mathematics','writing':'Writing','french':'French','science':'Science','history_geography':'History & geography','computer_science':'AI Builder','literature':'Literature'}
times=['9:30-10:20','10:30-11:20','11:20-11:45','11:45-12:20','1:00-1:35','1:35-2:35','2:45-3:20']
taglines=['Measure the space.','Make your reason clear.','Say what you will do.','Follow the light.','Meet the people in power.','Build Sky Run.','Follow a clue carefully.']
def divider(b,l,i):
 sub=l['subject'];b.page(names[sub],'NEXT UP  /  '+str(i+1).zfill(2),sub);b.text(times[i]+'  |  '+str(l['estimated_minutes'])+' MINUTES',11,True,G);b.text(taglines[i],30,False,N,after=18);
 if sub=='computer_science':
  b.bitmap('sky-run-characters.jpg');b.text('YOUR PROJECT: A ROBLOX-STYLE OBSTACLE COURSE',10,True,N);b.text('Build a real course in the workshop. The cover is story art, not a game screenshot.',9)
 else:
  b.subject_picture(sub);b.graphic(sub,180)
 b.card('Today you will',l['learning_objectives'][0],GREEN);b.text('LEARN  →  SEE AN EXAMPLE  →  YOUR TURN',11,True,N);b.text('Read the teaching first. Use the picture. Then try the questions.',11)
def cover(b,parent=False):
 b.page('A day of discovery','ATTICUS HOMESCHOOL  /  '+('PARENT GUIDE' if parent else 'STUDENT EDITION'))
 b.text('Monday, October 5',30,False,N);b.text('GRADE 6  •  DAY 29  •  9:30 AM-3:30 PM',11,True,G)
 b.c.drawImage(str(A/'sky-run-characters.jpg'),38,248,width=536,height=357,mask='auto');b.y=230;b.text('Look closely. Understand the idea. Make something of your own.',20,False,N);b.text('Seven subjects, one clear flow. Original illustrations and precise learning diagrams guide each step.',11)
def roadmap(b):
 b.page('Your Monday route','START HERE')
 rows=[('9:30-10:20','Mathematics','Correct height endpoints'),('10:20-10:30','Break','Water and movement'),('10:30-11:20','Writing','Explain why evidence matters'),('11:20-11:45','French','Tu asks; je answers'),('11:45-12:20','Science','Mirror direction and normals'),('12:20-1:00','Lunch','Eat and move'),('1:00-1:35','History','Who had a voice in Rome?'),('1:35-2:35','AI Builder','Build a Roblox-style obstacle course'),('2:35-2:45','Break','Step away from the screen'),('2:45-3:20','Literature','Read and connect a clue'),('3:20-3:30','Closeout','Check and file')]
 for tm,n,t in rows:
  
  top=b.y;b.text(tm+'   '+n,12,True,after=2);b.text(t,10,after=12)
  target=next((key for key,val in names.items() if val==n or (key=='history_geography' and n=='History')),None)
  if target:b.c.linkRect('',b.kind+'-'+target,(38,b.y,574,top),relative=0,thickness=0)
 b.card('Bring','Pencil, ruler, Friday’s work, The Westing Game, and your laptop. Stop each block on time.',GREEN)
def teach(b,l):
 sub=l['subject'];b.page('Learn the idea','01  /  INSTRUCTION',sub)
 b.text(l['lesson_title'],20,False,N)
 for v in l['vocabulary']:b.text(v['term']+' — '+v['definition'],10,after=5)
 b.y-=8
 if sub=='computer_science':
  b.graphic('sky-run-steps',180);b.text('Open the workshop: smarticus-production.up.railway.app/workshops/sky-run',9);b.c.linkURL('https://smarticus-production.up.railway.app/workshops/sky-run',(38,b.y,574,b.y+20),relative=0)
 for t in l['written_instruction'].split('\n')[1:]:
  # No tasks appear here. Assignment directions come after complete examples.
  if 'VIDEO LINK:' in t:
   url=t.split('VIDEO LINK: ')[1];b.text('Watch: Roman social and political structures (Khan Academy)',11,True);b.c.linkURL(url,(38,b.y,574,b.y+20),relative=0);continue
  b.text(t,10.7,after=10)
def examples(b,l):
 sub=l['subject'];b.page('See how it works','02  /  WORKED EXAMPLES',sub)
 extra={'mathematics':'math_half','writing':'writing_steps','science':'science_angles','computer_science':'sky-run-steps'}
 b.graphic(extra.get(sub,sub),215)
 for i,e in enumerate(l['worked_examples']):
  b.heading(str(i+1)+'. '+e['title']);b.text(e['problem'],11);b.card('Worked result',e['solution'],GREEN);b.text('Why: '+e['explanation'],11)
def practice(b,l):
 sub=l['subject'];b.page('Your turn','03  /  PRACTICE',sub)
 b.text('You have read the instruction and examples. Now show your own thinking.',10,color=N)
 if sub=='literature':b.text('Start page ____   End page ____   Minutes ____',11)
 for i,q in enumerate(l['independent_practice']):
  need=420 if sub=='mathematics' and i==0 else 300 if sub=='science' and i==0 else 220 if sub=='writing' and i==1 else 110
  b.ensure(need);b.text(q['prompt'],11,True)
  if sub=='mathematics' and i==0:
   b.graphic('blank_grid',285);b.lines(2)
  elif sub=='science' and i==0:b.drawspace(210)
  elif sub=='computer_science':b.card('Do this in Sky Run','Use the workshop buttons. Show your work in the game.',BLUE)
  elif sub=='literature' and i==0:b.text('Use the reading log at the top of this page.',10)
  elif sub=='literature' and i==1:
   for f in ['Exact detail + page/chapter','My named theory','Another possible meaning','Keep/change because...']:b.text(f,10,True);b.lines(2)
  else:b.lines(5 if sub=='writing' and i==1 else 3 if sub=='writing' else 1 if sub=='french' else 2)
 b.ensure(170);b.heading('Exit check');b.text('Cover the model. Try this on your own.',10,color=N)
 for q in l['exit_ticket']:
  b.text(q['prompt'],11,True)
  if sub=='french':
   b.text('Cue 1: correct / retry     Cue 2: correct / retry     Cue 3: correct / retry',10);b.text('Observer: __________________   Date: __________',10)
  elif sub=='science':b.drawspace(100)
  elif sub!='computer_science':b.lines(2)

student=Book(O/'Atticus_Day29_Monday_2026-10-05_Student.pdf','student');cover(student);roadmap(student)
for i,l in enumerate(day['lessons']):divider(student,l,i);teach(student,l);examples(student,l);practice(student,l)
student.page('Finish with a clear desk','3:20-3:30  /  CLOSEOUT');student.card('Check and file','Keep your original attempts. Add corrections beside them or on a new sheet. Save your Builder file and reading log.',GREEN)
for t in ['One idea I understand better now','One step I still want explained','One part of my Sky Run course I want to show']:student.text(t,12,True);student.lines(2)
sp=student.save()
parent=Book(O/'Atticus_Day29_Monday_2026-10-05_Parent.pdf','parent');cover(parent,True);roadmap(parent);parent.page('Friday informs Monday','REVIEW & PREPARATION')
rev=next(x for x in json.loads((REPO/'curriculum/2026-27/records/gradebook.json').read_text())['days'] if x['date']=='2026-10-02')
for x in rev['subjects']:parent.text(names[x['subject']]+': '+str(x['score'])+'%',13,True)
parent.card('Keep assessment fair','Monday has not been graded. Corrections do not silently replace Friday’s scores. The Builder explanation can be observed and submitted as new evidence.',GREEN)
parent.card('Prepare before teaching','Have the book and ruler ready. Preview the history link; if playback fails, use the included reading. Open Sky Run in Edge or Chrome before the Builder block and check that the 3D view loads.',BLUE)
for i,l in enumerate(day['lessons']):
 divider(parent,l,i);parent.page('Teaching notes and answers','PARENT ONLY',l['subject']);parent.text(l['teacher_notes'],10.5)
 for q in l['independent_practice']+l['exit_ticket']:parent.ensure(90);parent.text(q['prompt'],10.5,True);parent.text(q['answer'],10.5,after=15)
 if l['subject']=='computer_science':
  parent.page('Sky Run: quick parent guide','PARENT ONLY',l['subject'])
  parent.card('What he is making','A five-platform obstacle course. The third platform is a checkpoint. The fifth is the finish. He changes the fourth platform and tests the jumps.',GREEN)
  parent.heading('Open and check')
  parent.text('Open https://smarticus-production.up.railway.app/workshops/sky-run in Edge or Chrome. Check that the 3D scene appears, the character moves, and Space makes it jump. No Roblox installation, new account or payment is required. This is a custom browser workshop inspired by Roblox, not Roblox Studio.',11)
  parent.c.linkURL('https://smarticus-production.up.railway.app/workshops/sky-run',(38,parent.y,574,parent.y+75),relative=0)
  parent.heading('Keep the file')
  parent.text('Download save writes My-Sky-Run.json. Open save loads that file. The browser also keeps a local copy, but the download is the backup to keep. Do not clear browser storage before saving.',11)
  parent.heading('Help without taking over')
  parent.text('Ask him to show the jump that fails. Help him find Closer or Make wider. Let him change the course and try it again. For the checkpoint check, have him touch the flag, fall, then try a full restart. Do not deduct points for a browser or setup problem.',11)
  parent.heading('Game connection and next lesson')
  parent.text('Roblox calls these obstacle courses obbies. Its official building guide teaches platforms, playtesting and checkpoints. Today uses the same familiar kind of game in our own workshop. Keep this course for the next session; add a new feature only after today’s route works.',11)
  parent.text('Source: https://create.roblox.com/docs/tutorials/curriculums/building',9)
pp=parent.save();(R/'output/day29_page_map.json').write_text(json.dumps(dict(student=sp,parent=pp),indent=2));print('Visual edition:',len(sp),'student pages;',len(pp),'parent pages')
