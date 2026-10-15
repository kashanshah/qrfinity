# Refinement pass: optical corrections + strokes converted to one filled outline
import json, math, pathops
from fontTools.svgLib.path import parse_path
from fontTools.pens.svgPathPen import SVGPathPen

S=20.0      # ribbon weight (wordmark stem is 17.1 -> mark ~1.17x, intentionally a touch heavier)
GAP=4.0     # weave gap each side of the over-strand (was 3.5; a hair wider so it survives small sizes and print)
R=41.0      # Q circle radius (was 40): outer edge overshoots the baseline/cap line by 1 unit, as round letters should
CX,CY=48.0,50.0
ANG=math.radians(52)               # Q tail and R leg now share one angle (were 54.5 and 49.9 deg)
D=(math.cos(ANG), math.sin(ANG))   # direction down-right

# strands leave the circle at -30 / +30 deg and cross at 60 deg
top=(CX+R*math.cos(math.radians(30)), CY-R*math.sin(math.radians(30)))   # (83.5, 29.5)
bot=(CX+R*math.cos(math.radians(30)), CY+R*math.sin(math.radians(30)))   # (83.5, 70.5)
t30=math.tan(math.radians(30))
X=(top[0]+(CY-top[1])*t30, CY)                                            # crossing
u=(0.5,-math.sqrt(3)/2)                                                    # under-strand direction (bottom -> top)
dd=(S/2+GAP)/math.sin(math.radians(60))
b1=(X[0]-u[0]*dd, X[1]-u[1]*dd); b2=(X[0]+u[0]*dd, X[1]+u[1]*dd)
ut=(top[0]+(top[1]-30)*t30*-1*-1, 30)  # where the under-strand reaches y=30
ut=(bot[0]+(bot[1]-30)*t30, 30)
ov=(top[0]+(61-top[1])*t30, 61)        # over-strand meets the rounded corner into the bowl
f=lambda p:f"{p[0]:.2f} {p[1]:.2f}"
ribbon=(f"M{f(b2)} L{f(ut)} C{ut[0]+5.7:.2f} {30-9.9:.2f} 124 10 140 10 L154 10 C172 10 188 22 188 40.5 "
        f"C188 59 172 71 152 71 L120 71 C110 71 {ov[0]+2.9:.2f} {61+5.4:.2f} {f(ov)} L{f(top)} "
        f"A{R} {R} 0 1 0 {f(bot)} L{f(b1)}")
tail0=(52.0,66.0); tail1=(tail0[0]+D[0]*60, tail0[1]+D[1]*60)
leg0=(146.0,73.0); leg1=(leg0[0]+D[0]*60, leg0[1]+D[1]*60)

def P(d):
    p=pathops.Path(); parse_path(d,p.getPen()); return p
def stroked(d,width):
    p=P(d); p.stroke(width, pathops.LineCap.BUTT_CAP, pathops.LineJoin.ROUND_JOIN, 4); p.convertConicsToQuads(); return p
def rect(x,y,w,h): return P(f"M{x} {y} H{x+w} V{y+h} H{x} Z")

rib=stroked(ribbon,S)
bars=pathops.op(stroked(f"M{f(tail0)} L{f(tail1)}",S), stroked(f"M{f(leg0)} L{f(leg1)}",S), pathops.PathOp.UNION)
bars=pathops.op(bars, rect(-50,-50,400,150), pathops.PathOp.INTERSECTION)   # flat cut on the baseline (y=100)
mark=pathops.op(rib, bars, pathops.PathOp.UNION)
mark.simplify()
pen=SVGPathPen(None, ntos=lambda v: f"{v:.2f}".rstrip('0').rstrip('.'))
mark.draw(pen)
d=pen.getCommands()
xs=[];ys=[]
for c in mark:
    pass
bounds=mark.bounds
json.dump({"d":d,"bounds":bounds,"ribbon":ribbon},open(__import__('os').path.join(__import__('os').path.dirname(__file__),'refined.json'),'w'))
print("bounds",[round(b,2) for b in bounds], "chars",len(d))
