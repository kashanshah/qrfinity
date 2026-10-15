// Builds every file in brand/logo/ from the traced QR mark (mark-trace.json) and outlined "finity".
// Run: npm i opentype.js @fontsource/bricolage-grotesque && node brand/scripts/logo/build-logo.js
const fs=require('fs'),path=require('path'),ot=require('opentype.js');
const n=v=>(Math.round(v*100)/100).toString();
function pd(p){return p.commands.map(c=>c.type==='M'||c.type==='L'?`${c.type}${n(c.x)} ${n(c.y)}`:c.type==='Q'?`Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`:c.type==='C'?`C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`:'Z').join('');}
const fontFile=path.join(path.dirname(require.resolve('@fontsource/bricolage-grotesque/package.json')),'files/bricolage-grotesque-latin-800-normal.woff');
const b=fs.readFileSync(fontFile);const font=ot.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));
const G='#0F5132',Y='#F5C542',INK='#14201A',P='#FAFAF7';
const GAP=4;          // space between the mark and "finity", in mark units (mark is 100 tall)
const ASC=70;         // height of "f" in mark units; baseline at 90
const T=JSON.parse(fs.readFileSync(path.join(__dirname,'mark-trace.json')));
const [,,TW,TH]=T.vb.split(' ').map(Number);const PAD=40;          // trace canvas has 40px padding
const s=100/(TH-2*PAD), MW=(TW-2*PAD)*s;                         // mark: 100 tall, MW wide
const mark=c=>`<g transform="scale(${s.toFixed(6)}) translate(-${PAD} -${PAD})"><path fill="${c}" d="${T.d}"/></g>`;
function word(x,baseline,ink,dot){const fh=font.charToGlyph('f').getPath(0,0,1000).getBoundingBox();const size=ASC/(-fh.y1/1000);
  const sc=size/font.unitsPerEm;let cx=x,out='';const t='finity';const gl=[...t].map(c=>font.charToGlyph(c));
  gl.forEach((g,i)=>{const d=pd(g.getPath(cx,baseline,size));
    if(t[i]==='i'){const parts=d.split(/(?=M)/);const ys=parts.map(q=>Math.min(...(q.match(/-?\d+\.?\d*/g)||[]).map(Number).filter((_,k)=>k%2==1)));const top=ys.indexOf(Math.min(...ys));parts.forEach((q,k)=>out+=`<path fill="${k===top?dot:ink}" d="${q}"/>`);}
    else out+=`<path fill="${ink}" d="${d}"/>`;
    let a=g.advanceWidth*sc;if(i<gl.length-1){const k=font.getKerningValue(g,gl[i+1]);a+=(Number.isFinite(k)?k:0)*sc;}cx+=a;});return{svg:out,end:cx};}
const svg=(vb,body)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="QRfinity"><title>QRfinity</title>${body}</svg>\n`;
const out=path.join(__dirname,'../../logo');
const lock=(mc,wc,dot)=>{const w=word(MW+GAP,90,wc,dot);return svg(`-4 -4 ${Math.ceil(w.end)+8} 124`,mark(mc)+w.svg);};
fs.writeFileSync(`${out}/qrfinity-logo.svg`,lock(G,INK,Y));
fs.writeFileSync(`${out}/qrfinity-logo-reversed.svg`,lock(P,P,Y));
fs.writeFileSync(`${out}/qrfinity-logo-mono.svg`,lock(INK,INK,INK));
const mvb=`-4 -4 ${Math.ceil(MW)+8} 108`;
fs.writeFileSync(`${out}/qrfinity-mark.svg`,svg(mvb,mark(G)));
fs.writeFileSync(`${out}/qrfinity-mark-reversed.svg`,svg(mvb,mark(P)));
fs.writeFileSync(`${out}/qrfinity-mark-mono.svg`,svg(mvb,mark(INK)));
const k=1.9;fs.writeFileSync(`${out}/qrfinity-app-icon.svg`,svg('0 0 512 512',`<rect width="512" height="512" rx="112" fill="${G}"/><g transform="translate(${n(256-MW*k/2)} ${n(256-50*k)}) scale(${k})">${mark(P)}</g>`));
console.log('logo files written; mark width',n(MW));
