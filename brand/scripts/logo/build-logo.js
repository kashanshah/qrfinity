const fs=require('fs'),ot=require('opentype.js');
const n=v=>(Math.round(v*100)/100).toString();
function pd(p){return p.commands.map(c=>c.type==='M'||c.type==='L'?`${c.type}${n(c.x)} ${n(c.y)}`:c.type==='Q'?`Q${n(c.x1)} ${n(c.y1)} ${n(c.x)} ${n(c.y)}`:c.type==='C'?`C${n(c.x1)} ${n(c.y1)} ${n(c.x2)} ${n(c.y2)} ${n(c.x)} ${n(c.y)}`:'Z').join('');}
const load=f=>{const b=fs.readFileSync(f);return ot.parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));};
const fonts={
  bricolage:load(require.resolve('@fontsource/bricolage-grotesque/package.json').replace('package.json','')+'../../@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff'),
  manrope:load(require.resolve('@fontsource/bricolage-grotesque/package.json').replace('package.json','')+'../../@fontsource/manrope/files/manrope-latin-500-normal.woff'),
  manrope7:load(require.resolve('@fontsource/bricolage-grotesque/package.json').replace('package.json','')+'../../@fontsource/manrope/files/manrope-latin-700-normal.woff'),
};
function word(font,text,x,baseline,asc,ink,dot,square){const fh=font.charToGlyph('f').getPath(0,0,1000).getBoundingBox();const size=asc/(-fh.y1/1000);
  const sc=size/font.unitsPerEm;let cx=x,out='';const gl=[...text].map(c=>font.charToGlyph(c));
  gl.forEach((g,i)=>{const d=pd(g.getPath(cx,baseline,size));
    if(text[i]==='i'){const parts=d.split(/(?=M)/);const nums=parts.map(s=>(s.match(/-?\d+\.?\d*/g)||[]).map(Number));const ys=nums.map(a=>Math.min(...a.filter((_,k)=>k%2==1)));const top=ys.indexOf(Math.min(...ys));
      parts.forEach((s,k)=>{if(k!==top){out+=`<path fill="${ink}" d="${s}"/>`;return;}
        if(!square){out+=`<path fill="${dot}" d="${s}"/>`;return;}
        const st=nums[top===0?1:0];const sx=st.filter((_,k)=>k%2==0);const w=Math.max(...sx)-Math.min(...sx);const yy=nums[top].filter((_,k)=>k%2==1);
        const cxm=(Math.max(...sx)+Math.min(...sx))/2,cym=(Math.max(...yy)+Math.min(...yy))/2;out+=`<rect x="${n(cxm-w/2)}" y="${n(cym-w/2)}" width="${n(w)}" height="${n(w)}" fill="${dot}"/>`;});}
    else out+=`<path fill="${ink}" d="${d}"/>`;
    let a=g.advanceWidth*sc;if(i<gl.length-1){const k=font.getKerningValue(g,gl[i+1]);a+=(Number.isFinite(k)?k:0)*sc;}cx+=a;});return{svg:out,end:cx};}
const G='#0F5132',Y='#F5C542',INK='#14201A',P='#FAFAF7';
const S=20, GAP=3.5;
// Woven infinity: straight diagonals through the crossing (78,28)-(122,72) and (78,72)-(122,28)
const LOOP="M78 72 L122 28 C130 20 140 12 154 12 C174 12 188 24 188 40 C188 58 174 70 156 70 C146 70 132 82 122 72 L78 28 C70 20 60 10 46 10 C24 10 8 28 8 50 C8 72 22 90 46 90 C60 90 70 80 78 72 Z";
const OVER="M114 64 L86 36"; // the strand on top at the crossing
let uid=0;
function mark(c,acc,opts={}){
  const id='m'+(uid++);
  // Q = circle centre (48,50) r 40; strands leave at -30deg and +30deg and cross at (94.05,50) at 60deg
  const b1=[86.25,63.5], b2=[101.85,36.5]; // under-strand (Q bottom -> R top) broken around the crossing
  const RIB=`M${b2[0]} ${b2[1]} L105.5 30 C112 18 124 12 140 12 L152 12 C172 12 188 24 188 41 C188 58 172 70 152 70 L122 70 C113 70 108 74 105.5 70 L82.64 30 A40 40 0 1 0 82.64 70 L${b1[0]} ${b1[1]}`;
  const tail = opts.pixelTail
    ? `<path d="M50 64 L 64 84" stroke="${c}" stroke-width="${S}"/><rect x="62" y="86" width="14" height="14" fill="${c}"/><rect x="78" y="86" width="14" height="14" fill="${acc}"/>`
    : `<path d="M50 64 L 80 106" stroke="${opts.tailColor||c}" stroke-width="${S}"/>`;
  return `<defs><clipPath id="${id}c"><rect x="-20" y="-20" width="260" height="120"/></clipPath></defs>
   <g clip-path="url(#${id}c)" fill="none" stroke-linejoin="round">
     <path d="${RIB}" stroke="${c}" stroke-width="${S}" stroke-linecap="butt"/>
     <path d="M148 72 L 180 110" stroke="${c}" stroke-width="${S}"/>
     ${tail}
   </g>`;
}

const REF=JSON.parse(fs.readFileSync(__dirname+'/refined.json')).d;
function markFilled(c){return `<path fill="${c}" d="${REF}"/>`;}
// ---- final QRfinity logo set (option 4: woven ribbon + Bricolage 800 "finity") ----
const out=__dirname+'/../../logo';fs.mkdirSync(out,{recursive:true});
const svg=(vb,body,title='QRfinity')=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
function lockup(mc,wc,dot){const w=word(fonts.bricolage,'finity',212,100,78,wc,dot,false);return svg(`-5 -3 ${Math.ceil(w.end)+10} 134`,markFilled(mc)+w.svg);}
fs.writeFileSync(`${out}/qrfinity-logo.svg`,lockup(G,INK,Y));
fs.writeFileSync(`${out}/qrfinity-logo-reversed.svg`,lockup(P,P,Y));
fs.writeFileSync(`${out}/qrfinity-logo-mono.svg`,lockup(INK,INK,INK));
fs.writeFileSync(`${out}/qrfinity-mark.svg`,svg('-5 -3 205 106',markFilled(G)));
fs.writeFileSync(`${out}/qrfinity-mark-reversed.svg`,svg('-5 -3 205 106',markFilled(P)));
fs.writeFileSync(`${out}/qrfinity-mark-mono.svg`,svg('-5 -3 205 106',markFilled(INK)));
const sc=1.95;fs.writeFileSync(`${out}/qrfinity-app-icon.svg`,svg('0 0 512 512',`<rect width="512" height="512" rx="112" fill="${G}"/><g transform="translate(${n(256-97.5*sc)} ${n(256-50*sc)}) scale(${sc})">${markFilled(P)}</g>`));
console.log('done');
