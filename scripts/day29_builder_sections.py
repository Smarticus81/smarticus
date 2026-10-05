import json
from reportlab.lib.colors import HexColor

def builder_pages(b,A,parent=False):
 g=json.loads((A/'hover-guide.json').read_text());sub='computer_science'
 b.page('AI Builder: HOVER ONE','NEXT UP  /  06',sub)
 b.text('MONDAY  /  1:35-2:35  /  SESSION 1',11,True,'#C99A3D')
 b.text('Build your first 3D vehicle.',27,color='#153A52');b.bitmap('hover-car-poster.jpg',335)
 b.card('Your mission','Make an original hover-car in Blender. Save a picture of it today. Next session, make this same car move.','#EAF3E8')
 b.text('Inspired by Rocket League vehicle showcases. This is an original model, not a game mod. The picture is the teacher-built example.',11)
 b.text('BUILD IN BLENDER  /  ASK VIRGIL FOR HELP  /  KEEP BOTH FILES',10,True)
 if parent:
  parent_pages(b,A);return
 for i,s in enumerate(g['sections']):
  b.page(s['title'],'STEP '+str(i+1)+'  /  '+s['time'],sub)
  b.text(s['intro'],11)
  if i in [0,2,3]:
   b.bitmap('empty-studio.jpg' if i==0 else s['image'],190)
   b.text('ACTUAL BLENDER RENDER  /  '+('YOUR STARTING POINT' if i==0 else 'THE TAUGHT MODEL'),8,True,'#536C7B')
  for n,t in enumerate(s['steps'],1):
   b.ensure(100);b.text(str(n)+'. '+t,10.3,after=11)
  b.card('What you should see',s['check'],'#EAF3E8')
  if i==0:
   b.text('Download the starting file in Virgil’s Monday AI Builder lesson.',10,True)
   b.c.linkURL('https://smarticus-production.up.railway.app/lesson-visuals/2026-10-05/Hover-Studio.blend',(38,b.y,574,b.y+20),relative=0)
  if i==1:controls(b)
  if i==3:parts_table(b)
 b.page('Stuck? Start here.','HELP  /  KEEP THIS PAGE OPEN',sub)
 for issue,fix in g['fixes']:b.ensure(80);b.heading(issue);b.text(fix,10.5)

def controls(b):
 b.page('A small control guide','REFERENCE  /  NOT A BLENDER SCREENSHOT','computer_science')
 b.heading('Two groups of boxes do different jobs.')
 b.card('Location = where it sits','X: across the stage. Y: front to back. Z: up from the stage. Change these when you want to move a part.')
 b.card('Dimensions = how big it is','X: width. Y: length. Z: height. Change these when you want to reshape a part.')
 b.heading('The body: a complete example')
 rows=[('SETTING','X','Y','Z'),('Dimensions','3','4.4','0.6'),('Location','0','0','1.1')]
 table(b,rows,[190,110,110,126])
 b.text('Double-click one field, type the number, press Enter. Repeat for the next field. Use Dimensions, not Scale, for the size numbers above.',11)
 b.heading('The moves you will repeat')
 for title,t in [('Add','Shift+A > Mesh > Cube'),('Name','F2 > type the name > Enter'),('Copy','Shift+D > Esc > change Location'),('Trim edges','Ctrl+A > Scale; F3 > Add Bevel Modifier'),('Keep work','Ctrl+S')]:b.text(title+': '+t,12,True,after=15)


def table(b,rows,widths):
 b.ensure(len(rows)*37+15)
 for ri,row in enumerate(rows):
  x=38;y=b.y-34;b.c.setFillColor(HexColor('#153A52' if ri==0 else '#EAF2F6' if ri%2 else '#F3EFE5'));b.c.rect(x,y,536,34,fill=1,stroke=0)
  for j,v in enumerate(row):
   b.c.setFont('Bold' if ri==0 else 'Body',10);b.c.setFillColor(HexColor('#FFFFFF' if ri==0 else '#243847'));b.c.drawString(x+10,y+12,str(v));x+=widths[j]
  b.y-=37
 b.y-=12

def parts_table(b):
 b.page('Your seven-part build map','REFERENCE  /  COPY THESE SETTINGS','computer_science')
 b.bitmap('hover-car-poster.jpg',220)
 b.text('Numbers below are X / Y / Z. Copy them into the named fields. All parts keep Rotation at 0 / 0 / 0.',10)
 rows=[('PART','DIMENSIONS','LOCATION'),('Body','3 / 4.4 / 0.6','0 / 0 / 1.1'),('Canopy','1.8 / 2.1 / 0.65','0 / 0.15 / 1.72'),('Front left','0.65 / 1.35 / 0.55','-1.65 / -1.4 / 0.85'),('Front right','same as first engine','1.65 / -1.4 / 0.85'),('Back right','same as first engine','1.65 / 1.4 / 0.85'),('Back left','same as first engine','-1.65 / 1.4 / 0.85'),('Rear wing','3.8 / 0.55 / 0.18','0 / 1.7 / 1.8')]
 table(b,rows,[140,192,204]);b.text('Paint: Body = Racing blue. Canopy = Dark canopy. All engines and wing = Gold trim.',10.5,True)

def parent_pages(b,A):
 g=json.loads((A/'hover-guide.json').read_text())
 b.page('Parent: prepare the studio','BEFORE THE LESSON  /  NOT STUDENT WORK','computer_science')
 for i,t in enumerate(g['parent'][:4],1):b.ensure(130);b.heading(str(i)+'. '+['Install the correct Blender','Set the tested render route','Check on his laptop','Keep setup outside class'][i-1]);b.text(t,10.5)
 b.page('Parent: observe the build','TEACHING NOTES  /  MONDAY IS NOT YET GRADED','computer_science')
 for t in g['parent'][4:]:b.text(t,10.5,after=15)
 b.card('The next session','Continue with Hover-One-v02.blend. Group the seven parts, animate a short hover-and-turn shot, then add lighting, sound and a title in a later session. Do not restart with a different project.','#EAF3E8')
 for label,url in [('Blender download','https://www.blender.org/download/'),('Windows on Arm background','https://code.blender.org/2025/08/blender-for-windows-on-arm/')]:
  b.text(label+': '+url,9);b.c.linkURL(url,(38,b.y,574,b.y+30),relative=0)
