from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
import fitz, html
from PIL import Image
R=Path(__file__).resolve().parents[1]
A=R/'client/public/lesson-visuals/2026-10-05'
OUT=R/'tmp/day29-panels';OUT.mkdir(parents=True,exist_ok=True)
for f,n in [('DejaVuSans.ttf','Body'),('DejaVuSans-Bold.ttf','Bold')]:pdfmetrics.registerFont(TTFont(n,'/usr/share/fonts/truetype/dejavu/'+f))
N='#153A52';G='#C99A3D';BG='#FAF8F3';B='#EAF2F6'
def rect(c,x,y,w,h,color,stroke=None):
 c.setFillColor(HexColor(color));c.setStrokeColor(HexColor(stroke or color));c.rect(x,y,w,h,fill=1,stroke=bool(stroke))
def text(c,x,y,t,size=13,bold=False,color=N):
 c.setFont('Bold' if bold else 'Body',size);c.setFillColor(HexColor(color));c.drawString(x,y,t)
def para(c,x,top,t,w=540,size=13,bold=False,color=N):
 p=Paragraph(t,ParagraphStyle('p',fontName='Bold' if bold else 'Body',fontSize=size,leading=size*1.4,textColor=HexColor(color)));_,h=p.wrap(w,500);p.drawOn(c,x,top-h);return h
def start(name,title,subtitle,h=590):
 c=canvas.Canvas(str(OUT/(name+'.pdf')),pagesize=(600,h));rect(c,0,0,600,h,BG);text(c,28,h-35,title,22,True);para(c,28,h-49,subtitle,size=12);return c
def end(c,name):
 c.save();d=fitz.open(OUT/(name+'.pdf'));pix=d[0].get_pixmap(matrix=fitz.Matrix(2.5,2.5));pix.save(A/(name+'-v2.png'));Image.frombytes('RGB',[pix.width,pix.height],pix.samples).save(A/(name+'-v2.jpg'),quality=93)
def line(c,x,y,xx,yy,color=N,width=1):c.setStrokeColor(HexColor(color));c.setLineWidth(width);c.line(x,y,xx,yy)
def polygon(c,pts,color,stroke=N):
 p=c.beginPath();p.moveTo(*pts[0]);[p.lineTo(*pnt) for pnt in pts[1:]];p.close();c.setFillColor(HexColor(color));c.setStrokeColor(HexColor(stroke));c.setLineWidth(1);c.drawPath(p,fill=1,stroke=1)
def picture(c,name,x,y,w,h):c.drawImage(str(A/name),x,y,w,h,preserveAspectRatio=True,anchor='c')
# An exact top-down tile diagram. Values, tick positions and area are code-controlled.
c=start('mathematics','Height: count the gaps','This is a top-down plan of a tiled rectangle. Each tile is 1 unit by 1 unit.')
x0=62;y0=223;s=37
for x in range(9):
 line(c,x0+x*s,y0,x0+x*s,y0+6*s,'#D8DDD9',.6);text(c,x0+x*s-3,y0-18,str(x),10)
for y in range(7):
 line(c,x0,y0+y*s,x0+8*s,y0+y*s,'#D8DDD9',.6);text(c,x0-18,y0+y*s-4,str(y),10)
for x in range(2,7):
 for y in range(1,5):
  xx=x0+x*s;yy=y0+y*s;rect(c,xx+1,yy+1,s-2,s-2,'#D0B277');line(c,xx+2,yy+s-2,xx+s-2,yy+s-2,'#F1DFB7',2);line(c,xx+s-2,yy+2,xx+s-2,yy+s-3,'#A4854D',1)
line(c,x0,y0,x0+8*s+8,y0,N,1.5);line(c,x0,y0,x0,y0+6*s+8,N,1.5)
text(c,360,198,'across (x)',10);text(c,29,467,'up (y)',10)
for t,x,y,dx,dy in [('A (2,1)',2,1,-42,-17),('B (7,1)',7,1,12,-4),('C (7,5)',7,5,12,5),('D (2,5)',2,5,-58,8)]:
 c.setFillColor(HexColor(N));c.circle(x0+x*s,y0+y*s,3,fill=1,stroke=0);text(c,x0+x*s+dx,y0+y*s+dy,t,11,True)
line(c,x0+7*s,y0+s,x0+7*s,y0+5*s,G,4)
for i in range(4):
 y=y0+(i+1)*s;line(c,445,y,455,y,G,2);line(c,451,y,451,y+s,G,2);text(c,465,y+13,'gap '+str(i+1),11)
line(c,445,y0+5*s,455,y0+5*s,G,2)
rect(c,28,85,544,90,B);text(c,44,150,'Same side: B to C',15,True);text(c,44,123,'Height: 5 − 1 = 4 units',17,True);text(c,320,150,'Width: 7 − 2 = 5 units',12,True);text(c,320,125,'Area: 5 × 4 = 20',15,True);text(c,320,103,'square units (20 tiles)',12)
para(c,28,64,'The corner’s up address is 5. The height is 4: start at 1 and count four gaps.',size=12)
end(c,'mathematics')
# Exact matching paper triangles, then assembled 8x3 rectangle.
c=start('math_half','Why divide by two?','Two matching paper triangles fit together to cover one whole rectangle.')
text(c,28,485,'1  Two equal pieces',14,True)
polygon(c,[(50,391),(218,391),(218,454)],'#D6B36E');polygon(c,[(294,454),(462,454),(294,391)],'#9EBCCB')
text(c,70,369,'Gold triangle',12);text(c,313,369,'Blue triangle',12)
text(c,28,325,'2  Put the pieces together',14,True)
x=80;y=177;s=44
rect(c,x+3,y-4,8*s,3*s,'#DDD7CB');polygon(c,[(x,y),(x+8*s,y),(x+8*s,y+3*s)],'#D6B36E');polygon(c,[(x,y),(x,y+3*s),(x+8*s,y+3*s)],'#A8C2CD')
for i in range(1,8):line(c,x+i*s,y,x+i*s,y+3*s,'#F8F3E6',.8)
for j in range(1,3):line(c,x,y+j*s,x+8*s,y+j*s,'#F8F3E6',.8)
line(c,x,y,x+8*s,y+3*s,N,2)
text(c,183,150,'8 units across',12,True);text(c,451,255,'3 units',12,True);text(c,451,237,'high',12)
line(c,x+8*s-10,y,x+8*s-10,y+10,N,1);line(c,x+8*s-10,y+10,x+8*s,y+10,N,1)
rect(c,28,47,544,77,B);text(c,44,99,'Whole rectangle: 8 × 3 = 24 square units',15,True);text(c,44,72,'One triangle: 24 ÷ 2 = 12 square units',15,True)
text(c,28,23,'Each small square is 1 square unit. The pieces have the same area.',11)
end(c,'math_half')
# Photographic comparison, readable teaching labels separate from generated artwork.
if (A/'lamp-study.jpg').exists():
 c=start('writing','A fact and a reason','An invented test: use the same lamp and change only the bulb.',620)
 picture(c,'lamp-study.jpg',28,251,544,281)
 rect(c,28,230,265,28,N);rect(c,307,230,265,28,N);text(c,42,239,'BULB A: stays dark',12,True,'#FFFFFF');text(c,321,239,'BULB B: lights up',12,True,'#FFFFFF')
 para(c,28,216,'The test sequence: A stays dark → B lights → A stays dark again.',size=12)
 rect(c,28,100,544,80,B);text(c,44,157,'FACT: The lamp lit with Bulb B.',14,True);para(c,44,139,'REASON: This shows the lamp can work. That makes Bulb A a more likely cause of the problem.',w=512,size=13)
 para(c,28,82,'Careful conclusion: Bulb A may be faulty. This test does not prove that every other part is perfect.',size=13,bold=True)
 text(c,28,19,'Illustrated example. Do not change real bulbs without an adult.',10)
 end(c,'writing')
if (A/'french-conversation.jpg').exists():
 c=start('french','A real conversation','Speak to someone with tu. Speak about yourself with je.',680)
 picture(c,'french-conversation.jpg',28,271,544,310)
 rect(c,28,245,265,30,N);rect(c,307,245,265,30,N);text(c,42,255,'GIRL: asks the boy',12,True,'#FFFFFF');text(c,321,255,'BOY: answers for himself',12,True,'#FFFFFF')
 rect(c,28,166,544,65,B);text(c,44,208,'Est-ce que tu vas dessiner ?',18,True);text(c,44,182,'Are you going to draw?',13)
 rect(c,28,89,544,65,'#EAF3E8');text(c,44,131,'Oui, je vais dessiner.',18,True);text(c,44,105,'Yes, I am going to draw.',13)
 text(c,28,63,'If the boy says no:',12,True);text(c,28,39,'Non, je ne vais pas dessiner.',16,True);text(c,28,17,'No, I am not going to draw. Put ne and pas around vais.',11)
 end(c,'french')
if (A/'rome-republic.jpg').exists():
 c=start('history_geography','Who had a say in Rome?','The Roman Republic shared some power. It did not include everyone.',710)
 picture(c,'rome-republic.jpg',28,253,544,365)
 for i,(title,body) in enumerate([('CONSULS','Two leading officials.<br/>Usually served for one year.'),('SENATE','Powerful advisers.<br/>Helped shape decisions.'),('ASSEMBLIES','Groups of male citizens.<br/>Voted on laws or officials.')]):
  x=28+i*185;rect(c,x,139,174,118,B);text(c,x+10,230,title,14,True);para(c,x+10,212,body,w=154,size=12)
 rect(c,28,43,544,80,'#F4E8DC');text(c,44,100,'Who was left out?',15,True);para(c,44,84,'Women and enslaved people could not vote. Wealth and social position also affected how much power people had.',w=510,size=12)
 text(c,28,20,'Artist’s reconstruction of groups, not named people. Rome’s rules changed over time.',10)
 end(c,'history_geography')
print('Teaching panels built')
