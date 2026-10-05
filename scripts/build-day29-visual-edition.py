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
args=argparse.ArgumentParser();args.add_argument('--workspace',required=True,help='Folder containing output/pdf');opts=args.parse_args()
R=Path(opts.workspace);REPO=Path(__file__).resolve().parents[1];A=REPO/'client/public/lesson-visuals/2026-10-05';O=R/'output/pdf';D=REPO/'curriculum/2026-27/daily/2026-10-05.json'
N='#153A52';G='#C99A3D';INK='#243847';BG='#FAF8F3';BLUE='#EAF2F6';GREEN='#EAF3E8';PINK='#F7EAE5'
O.mkdir(parents=True,exist_ok=True)
day=json.loads(D.read_text());cs=next(l for l in day['lessons'] if l['subject']=='computer_science')
games=[
 ['Fortnite','Effects + world building','UEFN combines lighting, animation, effects and game rules.','Try a portal that opens when a hand gesture is recognised.','https://www.fortnite.com/developer/tools?lang=en-US'],
 ['GTA','A city that feels alive','Use the series as a reference for streets, landmarks and a sense of place.','Direct a calm camera tour of an original floating neighbourhood.','https://www.rockstargames.com/VI'],
 ['EA SPORTS FC 27','Movement + presentation','Player movement and camera presentation help make an action readable.','Direct a short entrance or celebration for an original character.','https://www.ea.com/games/ea-sports-fc/fc-27'],
 ['Rocket League','Responsive controls','A clear arena and vehicle-and-ball action connect an input to a visible result.','Build a hover-puck toy with a satisfying trail when it moves.','https://www.rocketleague.com/'],
 ['Roblox','Reusable world rules','Studio Assistant can help create objects, scripts and materials.','Invent a room rule that works on several different objects.','https://create.roblox.com/docs/assistant/guide'],
 ['Forza Horizon 6','Environment + camera','A newer racing-world reference for landscape and visual presentation.','Make a short cinematic reveal of your own imaginary vehicle.','https://forza.net/forzahorizon6']]
cs['written_instruction']='\n'.join([
'TIME CAP: 60 minutes. 1:35-2:35. Stop at the end of this block. LAPTOP ONLY.',
'1:35-1:50 DISCOVER. Read the game-to-creator gallery. Each reference connects something familiar to a capability you can learn. You are studying a design idea, not recreating a whole commercial game. The project ideas are our proposals, not claims that these games use the same AI tool.',
'FORTNITE: effects and world rules. A visual effect is an animated glow, spark or trail. GTA: streets, landmarks and atmosphere. A landmark is a feature that helps you know where you are. FC 27: movement and camera presentation. Animation means making an object or character appear to move.',
'ROCKET LEAGUE: responsive controls and clear feedback. Feedback is the change you see or hear after an action. ROBLOX: reusable rules. One rule can work on many objects. FORZA HORIZON 6: environments and camera movement. A camera path is the route the viewer follows through a scene.',
'1:50-2:05 LEARN THE THREE PATHS. DIGITAL MAGIC: a camera finds hand positions; your rule turns them into light, art or creature movement. DIRECT A TRAILER: build one scene, choose lighting and camera movement, then export a short video. IMPOSSIBLE WORLD: choose one surprising rule and make several objects respond to it. Themes can include architecture, music, nature, fantasy or something you have never explored.',
'AI can help draft code, create original assets and explain mistakes. Your job is to choose the result, try it, and judge whether it matches your idea. Generated code still needs a real test. Look at the complete examples before the Your turn page.',
'2:05-2:25 CREATE. Follow B1-B3 after the examples. Use a parent-tested local drawing or slide app to make a visual plan. If the selected build tool has already passed its real laptop setup test, you may make the first working feature instead. Otherwise save your plan and identify the setup need; do not spend the lesson installing unfamiliar tools.',
'2:25-2:35 SHOW. Save, close and reopen your work. Then explain the first feature and the test you would use. Show the Museum After Dark reset repair briefly if available. This is evidence for the earlier explanation point, not an automatic score change.',
'These references do not require purchases, new game accounts, public posting or playing the named games. The GTA connection is limited to city design and camera work. An adult handles restricted AI services and checks hardware, age terms and camera privacy before a selected build.'])
cs['source_references']=list(dict.fromkeys(cs['source_references']+[g[4] for g in games]))
cs['teacher_notes']=cs['teacher_notes'].split(' Current-game connections added')[0]+' Current-game connections added October 5: Fortnite, GTA, EA SPORTS FC 27, Rocket League, Roblox and Forza Horizon 6. These are design references, not mandatory installations or claims of equivalent features. GTA is used only for nonviolent city/camera design; no mature gameplay assignment. All teaching and worked models precede independent questions. Digital Magic, Trailer and Impossible World remain learner choices.'
cs['voice_prompt']=cs['voice_prompt'].split(' Use the current-game gallery')[0]+' Use the current-game gallery to connect familiar experiences to creative capabilities, then introduce non-game applications. Present the complete lesson and examples before requesting answers.'
day['todays_goal']=day['todays_goal'].split(' Visual edition:')[0]+' Visual edition: each subject opens with a title page. Sequence: learn, see complete examples, then answer questions.'
D.write_text(json.dumps(day,ensure_ascii=False,indent=2)+'\n')

# Precise teaching graphics are vectors; generated artwork is decorative only.
def svg(name,body,h=480):
 p=A/(name+'.svg');p.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{h}" viewBox="0 0 1200 {h}"><rect width="1200" height="{h}" rx="24" fill="{BG}"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6" fill="{N}"/></marker></defs>'+body+'</svg>');return p
def tx(x,y,t,size=24,c=N,weight='normal',anchor='start'):
 return f'<text x="{x}" y="{y}" font-family="DejaVu Sans" font-size="{size}" font-weight="{weight}" text-anchor="{anchor}" fill="{c}">{html.escape(t)}</text>'
def line(x,y,X,Y,c=N,w=4,arrow=False,dash=False):return f'<line x1="{x}" y1="{y}" x2="{X}" y2="{Y}" stroke="{c}" stroke-width="{w}"'+(' marker-end="url(#arrow)"' if arrow else '')+(' stroke-dasharray="10 9"' if dash else '')+'/>'
def rect(x,y,w,h,fill=BLUE):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="16" fill="{fill}"/>'
def dot(x,y,r=8,fill=G):return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"/>'
# Maths: exact height, with a separate count of the gaps.
b=tx(35,42,'HEIGHT IS A DISTANCE, NOT AN ADDRESS',26,weight='bold')
for x in range(8):b+=line(75+x*55,90,75+x*55,365,'#C8D5DC',1)
for y in range(6):b+=line(75,90+y*55,460,90+y*55,'#C8D5DC',1)
b+='<rect x="130" y="145" width="275" height="220" fill="#EAF2F6" fill-opacity=".5" stroke="#153A52" stroke-width="4"/>'
b+=line(405,365,405,145,G,8)+dot(405,365)+dot(405,145)+tx(425,370,'B (7,1)',21)+tx(425,140,'C (7,5)',21)
b+=rect(610,100,550,280)+tx(640,145,'1  Choose the SAME vertical side.',25,weight='bold')+tx(640,192,'2  The x address stays 7.',24)+tx(640,239,'3  y changes from 1 to 5.',24)+tx(640,299,'Height: 5 - 1 = 4 units',29,weight='bold')+tx(640,346,'Count four gaps to check.',23)
b+=tx(150,425,'Width: 7 - 2 = 5 units',25)+tx(620,430,'Area: 5 × 4 = 20 square units',25,weight='bold');svg('mathematics',b)
b=tx(35,45,'TWO MATCHING TRIANGLES FILL ONE RECTANGLE',26,weight='bold')+'<rect x="75" y="140" width="400" height="150" fill="#EAF2F6" stroke="#153A52" stroke-width="4"/><path d="M75 290 L475 290 L475 140 Z" fill="#C99A3D" fill-opacity=".75"/>'+line(75,290,475,140)+tx(255,330,'8 units',25)+tx(15,200,'3',25)+tx(590,130,'Rectangle: 8 × 3 = 24',29,weight='bold')+tx(590,195,'One triangle is half.',29)+tx(590,260,'24 ÷ 2 = 12 square units',29,weight='bold')+tx(75,400,'A square unit is one 1-by-1 square of area.',26);svg('math_half',b)
# Writing: illustrated evidence rather than more text in boxes.
b=tx(35,45,'THE FACT TELLS WHAT HAPPENED. THE REASON CONNECTS IT.',25,weight='bold')
for x,on,label in [(200,False,'Bulb A: dark'),(535,True,'Bulb B: lights')]:
 b+=rect(x-135,80,280,265,GREEN if on else BLUE)+f'<circle cx="{x}" cy="170" r="44" fill="{G if on else "#B6C4CD"}"/>'+rect(x-18,211,36,24,N)+line(x,235,x,270)+line(x-60,280,x+60,280)+tx(x,321,label,23,anchor='middle')
 if on:
  for ang in range(0,360,45):
   t=ang*math.pi/180;b+=line(x+55*math.cos(t),170+55*math.sin(t),x+70*math.cos(t),170+70*math.sin(t),G,3)
b+=line(698,207,758,207,arrow=True)+tx(800,155,'The lamp CAN work.',25,weight='bold')+tx(800,205,'That points toward',23)+tx(800,242,'A as the problem.',23)+tx(65,415,'Careful conclusion: Bulb A may be faulty.',27,weight='bold');svg('writing',b)
b=tx(35,45,'ONE PARAGRAPH, FOUR CLEAR JOBS',27,weight='bold')
for i,(h,t) in enumerate([('1  MY IDEA','State the claim.'),('2  EXACT RESULTS','Compare the tests.'),('3  WHY','Explain the connection.'),('4  CHECK AGAIN','Name a useful next test.')]):
 y=85+i*84;b+=rect(50,y,1100,68,[BLUE,GREEN,PINK,BLUE][i])+tx(75,y+43,h,24,weight='bold')+tx(440,y+43,t,24)
svg('writing_steps',b)
# French speaker change, not a conjugation-only table.
b=tx(35,45,'YOU ASK WITH TU. I ANSWER WITH JE.',29,weight='bold')
for x,label in [(140,'YOU'),(1030,'ME')]:b+=dot(x,180,45,N)+f'<path d="M{x-65} 300 Q{x} 210 {x+65} 300" fill="{G}"/>'+tx(x,350,label,27,weight='bold',anchor='middle')
b+=rect(255,90,650,105,BLUE)+tx(280,140,'Est-ce que tu vas dessiner ?',28)+tx(280,178,'Are you going to draw?',21)
b+=rect(255,230,650,105,GREEN)+tx(280,276,'Oui, je vais dessiner.',28)+tx(280,314,'Yes, I am going to draw.',21)+tx(260,415,'No: Je ne vais pas dessiner.',28,weight='bold');svg('french',b)
# Science: single mirror right-angle plus separate measured reflection.
b=tx(35,43,'MEASURE FROM THE DASHED NORMAL',28,weight='bold')
b+=line(70,350,510,350,N,8)+line(290,65,290,350,G,4,dash=True)+line(110,170,290,350,N,4,arrow=True)+line(290,350,470,170,N,4,arrow=True)+dot(290,350)
b+='<path d="M290 320 L320 320 L320 350" fill="none" stroke="#153A52" stroke-width="3"/>'
b+=tx(62,398,'mirror',25)+tx(310,90,'normal',25)+tx(320,333,'90°',22)+tx(155,275,'45°',26)+tx(355,275,'45°',26)+tx(70,130,'incoming',22)+tx(400,130,'outgoing',22)
b+=rect(660,100,500,280)+tx(690,150,'1  Mark the hit point.',25,weight='bold')+tx(690,210,'2  Add the normal at 90°.',25)+tx(690,270,'3  Match both ray angles.',25)+tx(690,330,'The normal turns with the mirror.',22);svg('science_angles',b)
# History: government topology is explained as distinct roles, not modern branches.
b=tx(35,43,'ROME SHARED SOME POWER. IT DID NOT INCLUDE EVERYONE.',25,weight='bold')
for x,h,t1,t2 in [(35,'CONSULS','Two leading officials','Usually one-year terms'),(435,'SENATE','Influential advisers','Helped shape decisions'),(835,'ASSEMBLIES','Groups of male citizens','Voted on laws or officials')]:
 b+=rect(x,85,330,220,BLUE)+tx(x+165,135,h,25,weight='bold',anchor='middle')
 if h=='CONSULS':b+=dot(x+135,180,19,N)+dot(x+195,180,19,N)
 else:
  for q in range(5):b+=dot(x+75+q*45,180,12,N)
 b+=tx(x+165,241,t1,21,anchor='middle')+tx(x+165,275,t2,20,anchor='middle')
b+=rect(35,340,1130,90,PINK)+tx(65,378,'LIMIT: women and enslaved people could not vote.',26,weight='bold')+tx(65,412,'Even among citizens, wealth and social position affected power.',23);svg('history_geography',b)
# Literary clue: source versus interpretation.
b=tx(35,45,'A CLUE CAN FIT MORE THAN ONE STORY',28,weight='bold')
b+=rect(40,100,335,250,BLUE)+tx(75,145,'INVENTED DETAIL',23,weight='bold')+tx(75,195,'Mina has a wet umbrella.',21)+tx(75,235,'Page 6',22)+tx(75,303,'This is what we know.',21)
b+=line(395,205,470,150,arrow=True)+line(395,235,470,315,arrow=True)+rect(490,85,660,130,GREEN)+tx(525,131,'IDEA A: she walked in the rain.',24,weight='bold')+tx(525,177,'Possible, but not proved.',22)+rect(490,255,660,130,PINK)+tx(525,301,'IDEA B: she borrowed a wet umbrella.',24,weight='bold')+tx(525,347,'A different explanation also fits.',22)+tx(50,438,'Next: look for a new detail that separates the two ideas.',26);svg('literature',b)
# Six familiar references, with an actual capability and original build connection.
b=tx(35,43,'FROM PLAYER TO CREATOR',30,weight='bold')
for i,g in enumerate(games):
 x=35+(i%2)*585;y=80+(i//2)*165;b+=rect(x,y,550,145,[BLUE,GREEN,PINK][i//2])+tx(x+22,y+35,g[0],26,weight='bold')+tx(x+22,y+69,g[1],22)
 for k,t in enumerate(__import__('textwrap').wrap(g[3],45)):b+=tx(x+22,y+103+k*25,t,20)
svg('game_connections',b,605)
b=tx(35,43,'THREE PATHS. YOUR OWN THEME.',28,weight='bold')
for i,(title,a,c) in enumerate([('DIGITAL MAGIC','HAND MOVES','GLOW RESPONDS'),('DIRECT A TRAILER','CAMERA MOVES','WORLD IS REVEALED'),('IMPOSSIBLE WORLD','PLAYER ACTS','OBJECTS CHANGE')]):
 x=35+i*400;b+=rect(x,85,330,320,[BLUE,GREEN,PINK][i])+tx(x+165,135,title,24,weight='bold',anchor='middle')+dot(x+165,200,30,N)+line(x+165,240,x+165,288,arrow=True)+tx(x+165,331,a,21,anchor='middle')+tx(x+165,375,c,21,weight='bold',anchor='middle')
svg('computer_science',b)

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
 def lines(self,n=3):
  self.ensure(n*24+10);self.c.setStrokeColor(HexColor('#AABAC3'));self.c.setLineWidth(.55)
  for _ in range(n):self.y-=24;self.c.line(38,self.y,574,self.y)
  self.y-=12
 def drawspace(self,h):self.ensure(h+15);self.c.setStrokeColor(HexColor('#AABAC3'));self.c.roundRect(38,self.y-h,536,h,7,fill=0,stroke=1);self.y-=h+15
 def save(self):self.finishpage();self.c.save();return self.pages
names={'mathematics':'Mathematics','writing':'Writing','french':'French','science':'Science','history_geography':'History & geography','computer_science':'AI Builder','literature':'Literature'}
times=['9:30-10:20','10:30-11:20','11:20-11:45','11:45-12:20','1:00-1:35','1:35-2:35','2:45-3:20']
taglines=['Measure the space.','Make your reason clear.','Say what you will do.','Follow the light.','Meet the people in power.','Turn inspiration into a creation.','Follow a clue carefully.']
def divider(b,l,i):
 sub=l['subject'];b.page(names[sub],'NEXT UP  /  '+str(i+1).zfill(2),sub);b.text(times[i]+'  |  '+str(l['estimated_minutes'])+' MINUTES',11,True,G);b.text(taglines[i],30,False,N,after=18);
 if sub=='computer_science':
  b.bitmap('builder-concepts.jpg');b.text('DIGITAL MAGIC    •    DIRECT A TRAILER    •    IMPOSSIBLE WORLD',9,True,N);b.text('Concept art: the look we can work toward over several sessions.',9)
 else:b.graphic(sub,240)
 b.card('Today you will',l['learning_objectives'][0],GREEN);b.text('LEARN  →  SEE AN EXAMPLE  →  YOUR TURN',11,True,N);b.text('Read the teaching first. Use the picture. Then try the questions.',11)
def cover(b,parent=False):
 b.page('A day of discovery','ATTICUS HOMESCHOOL  /  '+('PARENT GUIDE' if parent else 'STUDENT EDITION'))
 b.text('Monday, October 5',30,False,N);b.text('GRADE 6  •  DAY 29  •  9:30 AM-3:30 PM',11,True,G)
 b.c.drawImage(str(A/'discovery-cover.jpg'),38,248,width=536,height=357,mask='auto');b.y=230;b.text('Look closely. Understand the idea. Make something of your own.',20,False,N);b.text('Seven subjects, one clear flow. Original illustrations and precise learning diagrams guide each step.',11)
def roadmap(b):
 b.page('Your Monday route','START HERE')
 rows=[('9:30-10:20','Mathematics','Correct height endpoints'),('10:20-10:30','Break','Water and movement'),('10:30-11:20','Writing','Explain why evidence matters'),('11:20-11:45','French','Tu asks; je answers'),('11:45-12:20','Science','Mirror direction and normals'),('12:20-1:00','Lunch','Eat and move'),('1:00-1:35','History','Who had a voice in Rome?'),('1:35-2:35','AI Builder','Discover, choose and plan'),('2:35-2:45','Break','Step away from the screen'),('2:45-3:20','Literature','Read and connect a clue'),('3:20-3:30','Closeout','Check and file')]
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
  b.graphic('game_connections',285);b.text('These are original project ideas inspired by design capabilities, not official game features or tutorials.',9)
 for t in l['written_instruction'].split('\n')[1:]:
  # No tasks appear here. Assignment directions come after complete examples.
  if 'VIDEO LINK:' in t:
   url=t.split('VIDEO LINK: ')[1];b.text('Watch: Roman social and political structures (Khan Academy)',11,True);b.c.linkURL(url,(38,b.y,574,b.y+20),relative=0);continue
  b.text(t,10.7,after=10)
def examples(b,l):
 sub=l['subject'];b.page('See how it works','02  /  WORKED EXAMPLES',sub)
 extra={'mathematics':'math_half','writing':'writing_steps','science':'science_angles','computer_science':'computer_science'}
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
  elif sub=='computer_science':b.card('Save on your laptop','Use your digital plan or a tested prototype. Keep the file you can reopen.',BLUE)
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
for t in ['One idea I understand better now','One step I still want explained','My chosen Builder project and its first milestone']:student.text(t,12,True);student.lines(2)
sp=student.save()
parent=Book(O/'Atticus_Day29_Monday_2026-10-05_Parent.pdf','parent');cover(parent,True);roadmap(parent);parent.page('Friday informs Monday','REVIEW & PREPARATION')
rev=next(x for x in json.loads((REPO/'curriculum/2026-27/records/gradebook.json').read_text())['days'] if x['date']=='2026-10-02')
for x in rev['subjects']:parent.text(names[x['subject']]+': '+str(x['score'])+'%',13,True)
parent.card('Keep assessment fair','Monday has not been graded. Corrections do not silently replace Friday’s scores. The Builder explanation can be observed and submitted as new evidence.',GREEN)
parent.card('Prepare before teaching','Have the book and ruler ready. Preview the history link; if playback fails, use the included reading. Check the chosen local planning app can save and reopen. Full creative-tool setup on the Windows ARM laptop is still pending.',BLUE)
for i,l in enumerate(day['lessons']):
 divider(parent,l,i);parent.page('Teaching notes and answers','PARENT ONLY',l['subject']);parent.text(l['teacher_notes'],10.5)
 for q in l['independent_practice']+l['exit_ticket']:parent.ensure(90);parent.text(q['prompt'],10.5,True);parent.text(q['answer'],10.5,after=15)
 if l['subject']=='computer_science':
  parent.page('Creative tools: setup and references','PARENT ONLY',l['subject']);parent.card('Before assigning a build','Check the exact account age terms and ARM-compatible tool version. Run a tiny example, test input and performance, then save, close, reopen and export. For hand tracking, test the real webcam and check how frames are handled. Adult conducts restricted AI-service interactions. Setup failures are not student failures.',BLUE)
  for g in games:parent.text(g[0]+' — '+g[1],12,True);parent.text(g[2],10);parent.text(g[4],8.5)
  parent.text('References checked October 5, 2026. The game-to-project mappings are instructional suggestions, not claims about internal game technology. No games or paid services need to be installed. GTA is a nonviolent city-design reference only.',10)
pp=parent.save();(R/'output/day29_page_map.json').write_text(json.dumps(dict(student=sp,parent=pp),indent=2));print('Visual edition:',len(sp),'student pages;',len(pp),'parent pages')
# Keep tutor context aligned with revised lesson.
plan=REPO/'curriculum/2026-27/reference/00-master/day29-monday-plan.md';plan.write_text('# Day 29 Monday October 5, 2026\n\n'+day['todays_goal']+'\n\n'+'\n\n'.join(l['subject']+': '+l['previous_learning']+' '+l['teacher_notes'] for l in day['lessons'])+'\n')
