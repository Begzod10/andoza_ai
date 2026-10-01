// @ts-nocheck
/* Ported verbatim from the owner's scroll-story (AndozaAI.html).
   Wrapped so it runs after React mounts the markup; returns a cleanup
   that removes listeners + cancels rAF on unmount. */
export function initScrollStory(): () => void {
  let __cleanup = () => {};
'use strict';
var $=function(s,r){return (r||document).querySelector(s);};
var clamp=function(v,a,b){a=a===undefined?0:a;b=b===undefined?1:b;return Math.min(b,Math.max(a,v));};
var lerp=function(a,b,t){return a+(b-a)*t;};
var ease=function(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;};
var easeOutBack=function(t){var c1=1.70158,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2);};
var seg=function(u,a,b){return clamp((u-a)/(b-a));};
var smooth=function(a,b,x){var t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
var h2r=function(h){return [1,3,5].map(function(i){return parseInt(h.slice(i,i+2),16);});};
var mix=function(a,b,t){var A=h2r(a),B=h2r(b);return '#'+A.map(function(v,i){return Math.round(lerp(v,B[i],t)).toString(16).padStart(2,'0');}).join('');};
var shade=function(c,a){return a>=0?mix(c,'#ffffff',a):mix(c,'#000000',-a);};
var fmt=function(n){return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,' ');};

var MONO="'IBM Plex Mono', ui-monospace, Menlo, Consolas, monospace";
var DISP="'Archivo', 'Arial Narrow', Arial, sans-serif";
var BODYF="'Instrument Sans', system-ui, sans-serif";
var ACC='#FF9340',PAPER='#F3F6FD',INK='#0C1E54';
var IC=0.8660254,IS=0.5;

/* room (metres): corners A..F of an L-shaped bedroom */
var PTS=[[0,0],[4.7,0],[4.7,2.1],[3.6,2.1],[3.6,3.3],[0,3.3]];
var N=PTS.length,H=2.8;
var JIT=[[.14,.10],[-.12,.18],[.16,-.14],[-.14,-.16],[.12,.14],[-.16,.10]];
var DOOR={y0:.6,y1:1.5,h:2.1};
var WIN={w:1.4,z0:.9,z1:2.2,center:2.35};
var PLAIN='#C6D1EA';
var LENS=PTS.map(function(q,i){var b=PTS[(i+1)%N];return Math.hypot(b[0]-q[0],b[1]-q[1]);});
var CUM=[];var PER=0;LENS.forEach(function(L){CUM.push(PER);PER+=L;});
var AREA=0;PTS.forEach(function(q,i){var b=PTS[(i+1)%N];AREA+=q[0]*b[1]-b[0]*q[1];});AREA=Math.abs(AREA)/2;
var DT1=(3.3-DOOR.y1)/3.3,DT2=(3.3-DOOR.y0)/3.3;

/* seeded noise */
var seed=7;function rnd(){seed=(seed*16807)%2147483647;return (seed-1)/2147483646;}

/* LiDAR: a phone in the room, 180 rays, each hits the nearest wall */
var LO=[2.15,1.35],NR=180,HITS=[],NOI=[];
(function(){
  for(var i=0;i<NR;i++){
    var a=i/NR*Math.PI*2,dx=Math.cos(a),dy=Math.sin(a),best=1e9;
    for(var k=0;k<N;k++){
      var p=PTS[k],q=PTS[(k+1)%N],ex=q[0]-p[0],ey=q[1]-p[1];
      var den=dx*ey-dy*ex;if(Math.abs(den)<1e-9)continue;
      var t=((p[0]-LO[0])*ey-(p[1]-LO[1])*ex)/den;
      var s=((p[0]-LO[0])*dy-(p[1]-LO[1])*dx)/den;
      if(t>0&&s>=0&&s<=1&&t<best)best=t;
    }
    HITS.push([LO[0]+dx*best,LO[1]+dy*best]);
    NOI.push([(rnd()-.5)*.14,(rnd()-.5)*.14]);
  }
})();

/* wallpapers: six kinds, the hand cycles through all of them and settles on the second */
var WPS=[
  {name:'Yo‘l-yo‘l',price:189000},
  {name:'Romb',price:215000},
  {name:'Gulli',price:245000},
  {name:'Tropik barg',price:268000},
  {name:'Beton',price:175000},
  {name:'Yog‘och panel',price:298000}
];
var SEQ=[0,1,2,3,4,5,1];
var TS=[.10,.20,.30,.40,.50,.60,.71];
var FINAL=1;

/* furniture: min-corner x,y in metres, footprint dx,dy, height h */
var PIECES=[
  {id:'gilam',x:1.35,y:1.6,dx:2.0,dy:1.4,h:.02,solid:false},
  {id:'karavot',x:1.55,y:0,dx:1.6,dy:2.0,h:.95,solid:true},
  {id:'tumba',x:1.0,y:0,dx:.45,dy:.4,h:.5,solid:true},
  {id:'shkaf',x:3.52,y:0,dx:1.18,dy:.6,h:2.1,solid:true},
  {id:'stol',x:0,y:2.1,dx:.6,dy:1.2,h:.75,solid:true},
  {id:'stul',x:.85,y:2.4,dx:.42,dy:.42,h:.9,solid:true}
];
var TSF=[.04,.19,.34,.49,.64,.79];
var LIFT=.55;
var SOLIDA=PIECES.reduce(function(s,p){return s+(p.solid?p.dx*p.dy:0);},0);

/* estimate, derived from the same geometry */
var doorW=DOOR.y1-DOOR.y0;
var wallNet=PER*H-(doorW*DOOR.h+WIN.w*(WIN.z1-WIN.z0));
var rolls=Math.ceil(wallNet*1.1/5.33);
var lam=Math.ceil(AREA*1.1);
var plinth=Math.ceil((PER-doorW)/2.5);
var labour=Math.round(wallNet*12000/1000)*1000+Math.round(AREA*40000/1000)*1000;
var ROWS=[
  {q:rolls+' rulon',a:rolls*WPS[FINAL].price},
  {q:lam+' m²',a:lam*145000},
  {q:plinth+' dona',a:plinth*68000},
  {q:AREA.toFixed(1)+' m²',a:labour}
];
var TOTAL=ROWS.reduce(function(s,r){return s+r.a;},0);

/* scene timing: LiDAR, hand-drawn plan, 3D, wallpaper, window, furniture, estimate */
var SW=[1.3,1,1,2.4,1.1,2.2,1.1],SWT=SW.reduce(function(a,b){return a+b;},0);
var BND=[0];SW.forEach(function(w){BND.push(BND[BND.length-1]+w/SWT);});
function sceneU(p){return SW.map(function(_,i){return clamp((p-BND[i])/(BND[i+1]-BND[i]));});}
function sceneIdx(p){for(var i=SW.length-1;i>0;i--){if(p>=BND[i]-1e-9)return i;}return 0;}

/* dom */
var story=$('#story'),stage=$('#stage'),cv=$('#cv'),ctx=cv.getContext('2d');
var caps=Array.prototype.slice.call(document.querySelectorAll('.cap'));
var rails=Array.prototype.slice.call(document.querySelectorAll('.rail li'));
var wls=Array.prototype.slice.call(document.querySelectorAll('.cap:nth-child(4) .wl li[data-k]'));
var fls=Array.prototype.slice.call(document.querySelectorAll('.cap:nth-child(6) .wl li[data-k]'));
var swFloor=$('#swFloor');
var rrs=Array.prototype.slice.call(document.querySelectorAll('.rr'));
var el={r0a:$('#r0a'),r1a:$('#r1a'),r1b:$('#r1b'),r2a:$('#r2a'),r2b:$('#r2b'),r3a:$('#r3a'),r3b:$('#r3b'),r4a:$('#r4a'),r4b:$('#r4b'),r5a:$('#r5a'),r5b:$('#r5b'),tbArea:$('#tbArea'),tbView:$('#tbView'),tbSheet:$('#tbSheet')};
var W=0,Hc=0,dpr=1,curIdx=-1;

function setText(node,s){if(node._t!==s){node.textContent=s;node._t=s;}}
function setOp(node,v){var s=v.toFixed(2);if(node._o!==s){node.style.opacity=s;node._o=s;}}

/* geometry helpers */
function proj(x,y,z,e){var ix=(x-y)*IC,iy=(x+y)*IS;return [lerp(x,ix,e),lerp(y,iy,e)-z*e];}
function poly(pts){var p=new Path2D();p.moveTo(pts[0][0],pts[0][1]);for(var i=1;i<pts.length;i++)p.lineTo(pts[i][0],pts[i][1]);p.closePath();return p;}
function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function line(a,b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();}
function pill(cx,cy,text,alpha,size,hot){
  if(alpha<=.01)return;
  ctx.save();ctx.globalAlpha=alpha;ctx.font='500 '+size+'px '+MONO;
  var tw=ctx.measureText(text).width,w=tw+20,h=size+13;
  rr(cx-w/2,cy-h/2,w,h,h/2);ctx.fillStyle=hot?ACC:'rgba(12,30,84,.95)';ctx.fill();
  ctx.lineWidth=1.2;ctx.strokeStyle=ACC;ctx.stroke();
  ctx.fillStyle=hot?'#2A1200':ACC;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,cx,cy+.5);
  ctx.restore();
}
function handle(c,dir,alpha){
  if(alpha<=.01)return;
  ctx.save();ctx.globalAlpha=alpha;
  ctx.beginPath();ctx.arc(c[0],c[1],12,0,Math.PI*2);ctx.fillStyle='rgba(12,30,84,.95)';ctx.fill();
  ctx.lineWidth=2.2;ctx.strokeStyle=ACC;ctx.stroke();
  ctx.fillStyle=ACC;
  [-1,1].forEach(function(sgn){
    ctx.beginPath();
    if(dir==='v'){ctx.moveTo(c[0]-4,c[1]+sgn*1.5);ctx.lineTo(c[0]+4,c[1]+sgn*1.5);ctx.lineTo(c[0],c[1]+sgn*6.5);}
    else{ctx.moveTo(c[0]+sgn*1.5,c[1]-4);ctx.lineTo(c[0]+sgn*1.5,c[1]+4);ctx.lineTo(c[0]+sgn*6.5,c[1]);}
    ctx.closePath();ctx.fill();
  });
  ctx.restore();
}
function tag(a,dx,dy,l1,l2,alpha,VH){
  if(alpha<=.01)return;
  var w=W<520?150:168,h=W<520?46:54;
  var cx=clamp(a[0]+dx,8+w/2,W-8-w/2),cy=clamp(a[1]+dy,8+h/2,VH-8-h/2);
  ctx.save();ctx.globalAlpha=alpha;
  ctx.strokeStyle=ACC;ctx.lineWidth=1.8;line(a,[cx,cy]);
  ctx.beginPath();ctx.arc(a[0],a[1],4.5,0,Math.PI*2);ctx.fillStyle=ACC;ctx.fill();
  rr(cx-w/2,cy-h/2,w,h,4);ctx.fillStyle=PAPER;ctx.fill();
  ctx.fillStyle=INK;ctx.textAlign='left';ctx.textBaseline='alphabetic';
  ctx.font='700 '+(W<520?14:16.5)+'px '+BODYF;ctx.fillText(l1,cx-w/2+12,cy-4);
  ctx.font='500 '+(W<520?12:13.5)+'px '+MONO;ctx.fillStyle='#34478A';ctx.fillText(l2,cx-w/2+12,cy+(W<520?14:16));
  ctx.restore();
}
function planLabels(S,pts,fr,alpha,d1,size){
  for(var i=0;i<N;i++){
    var fi=fr[i];if(fi<=0)continue;
    var pa=pts[i],pb=pts[(i+1)%N],nl=LENS[i];
    var nx=(PTS[(i+1)%N][1]-PTS[i][1])/nl,ny=-(PTS[(i+1)%N][0]-PTS[i][0])/nl;
    var mxp=lerp(pa[0],pb[0],fi/2),myp=lerp(pa[1],pb[1],fi/2);
    var lc=S(mxp+nx*.4,myp+ny*.4,0);
    var L=Math.hypot(pb[0]-pa[0],pb[1]-pa[1])*fi;
    pill(lc[0],lc[1],L.toFixed(2)+' m',alpha,size,fi<.999&&d1<1);
  }
}
function areaLabel(S,alpha,val){
  if(alpha<=.01)return;
  var ac=S(2.2,1.3,0);
  ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';
  ctx.fillStyle=PAPER;ctx.font='800 '+(W<520?26:36)+'px '+DISP;ctx.textBaseline='alphabetic';
  ctx.fillText(val.toFixed(1)+' m²',ac[0],ac[1]+10);
  ctx.fillStyle=ACC;ctx.font='500 '+(W<520?11:12.5)+'px '+MONO;ctx.fillText('MAYDON',ac[0],ac[1]-(W<520?22:28));
  ctx.restore();
}

/* concrete blobs */
var BLOBS=[];for(var bi=0;bi<110;bi++){BLOBS.push({x:rnd()*5,y:rnd()*2.9,r:.05+rnd()*.32,a:.04+rnd()*.07,d:rnd()>.5});}

/* wallpaper patterns, drawn in wall-plane metres (x along the wall, y up) */
function drawWP(k,w,h){
  var i,j,x;
  if(k===0){
    ctx.fillStyle='#E4E8F3';ctx.fillRect(0,0,w,h);
    for(x=.05;x<w;x+=.212){ctx.fillStyle='#BCC7E4';ctx.fillRect(x,0,.09,h);ctx.fillStyle='#A3B1D8';ctx.fillRect(x+.11,0,.012,h);}
  }else if(k===1){
    ctx.fillStyle='#D3E1D6';ctx.fillRect(0,0,w,h);
    ctx.strokeStyle='#A3BFAB';ctx.lineWidth=.014;ctx.beginPath();
    for(x=-h;x<=w;x+=.42){ctx.moveTo(x,0);ctx.lineTo(x+h,h);}
    for(x=0;x<=w+h;x+=.42){ctx.moveTo(x,0);ctx.lineTo(x-h,h);}
    ctx.stroke();
    ctx.fillStyle='#F2F7F0';
    for(i=0;i*.42<=w+.42;i++)for(j=0;j*.42<=h+.42;j++){
      if((i+j)%2)continue;
      var cx=i*.42,cy=j*.42;ctx.beginPath();ctx.moveTo(cx,cy-.075);ctx.lineTo(cx+.075,cy);ctx.lineTo(cx,cy+.075);ctx.lineTo(cx-.075,cy);ctx.closePath();ctx.fill();
    }
  }else if(k===2){
    ctx.fillStyle='#E2BFBF';ctx.fillRect(0,0,w,h);
    for(j=0;j*.42<=h+.4;j++)for(i=0;i*.48<=w+.4;i++){
      var fx=i*.48+(j%2)*.24,fy=j*.42;
      ctx.fillStyle='#9DB89A';ctx.beginPath();ctx.ellipse(fx+.11,fy-.05,.07,.028,-.6,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.ellipse(fx-.11,fy+.06,.07,.028,.6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#FAF1EA';
      for(var pn=0;pn<5;pn++){var an=pn*Math.PI*2/5;ctx.beginPath();ctx.arc(fx+Math.cos(an)*.05,fy+Math.sin(an)*.05,.042,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#D48F8F';ctx.beginPath();ctx.arc(fx,fy,.026,0,Math.PI*2);ctx.fill();
    }
  }else if(k===3){
    ctx.fillStyle='#1F4D3E';ctx.fillRect(0,0,w,h);
    for(j=0;j*.5<=h+.5;j++)for(i=0;i*.55<=w+.55;i++){
      var lx=i*.55+(j%2)*.275,ly=j*.5,ang=((i+j)%2?-.9:.9)+(((i*7+j*13)%5)-2)*.08;
      ctx.fillStyle=(i+j)%3?'#2C7A58':'#256B4C';
      ctx.beginPath();ctx.ellipse(lx,ly,.21,.078,ang,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#8CCBA8';ctx.lineWidth=.011;ctx.beginPath();
      ctx.moveTo(lx-Math.cos(ang)*.19,ly-Math.sin(ang)*.19);ctx.lineTo(lx+Math.cos(ang)*.19,ly+Math.sin(ang)*.19);ctx.stroke();
    }
  }else if(k===4){
    ctx.fillStyle='#98A1B0';ctx.fillRect(0,0,w,h);
    BLOBS.forEach(function(b){ctx.fillStyle=b.d?'rgba(30,42,68,'+b.a+')':'rgba(255,255,255,'+b.a+')';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();});
    ctx.strokeStyle='rgba(25,36,60,.28)';ctx.lineWidth=.008;ctx.beginPath();
    for(x=.6;x<w;x+=1.2){ctx.moveTo(x,0);ctx.lineTo(x,h);}
    ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
    ctx.fillStyle='rgba(25,36,60,.4)';
    for(x=.6;x<w;x+=1.2){ctx.beginPath();ctx.arc(x,.7,.013,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(x,2.1,.013,0,Math.PI*2);ctx.fill();}
  }else{
    var cols=['#A26A3E','#94602F','#B27848','#8A5731'];
    ctx.fillStyle='#4A2C14';ctx.fillRect(0,0,w,h);
    for(i=0;i*.113<=w;i++){
      x=i*.113;ctx.fillStyle=cols[(i*3)%4];ctx.fillRect(x,0,.105,h);
      ctx.strokeStyle='rgba(60,30,10,.25)';ctx.lineWidth=.006;ctx.beginPath();ctx.moveTo(x+.03+(i%3)*.02,0);ctx.lineTo(x+.03+(i%3)*.02,h);ctx.stroke();
    }
  }
}

/* furniture drawn as lit boxes; S is any x,y,z -> screen projection */
function box(S,x,y,z,dx,dy,dz,c){
  var faces=[
    [[S(x+dx,y,z),S(x+dx,y+dy,z),S(x+dx,y+dy,z+dz),S(x+dx,y,z+dz)],shade(c,-.2)],
    [[S(x,y+dy,z),S(x+dx,y+dy,z),S(x+dx,y+dy,z+dz),S(x,y+dy,z+dz)],c],
    [[S(x,y,z+dz),S(x+dx,y,z+dz),S(x+dx,y+dy,z+dz),S(x,y+dy,z+dz)],shade(c,.16)]
  ];
  ctx.lineWidth=1;ctx.strokeStyle='rgba(8,20,60,.32)';ctx.lineJoin='round';
  faces.forEach(function(fc){var pt=poly(fc[0]);ctx.fillStyle=fc[1];ctx.fill(pt);ctx.stroke(pt);});
}
function pieceDraw(id,S,x,y,z){
  var i;
  if(id==='gilam'){
    var q=[S(x,y,z+.01),S(x+2,y,z+.01),S(x+2,y+1.4,z+.01),S(x,y+1.4,z+.01)];
    ctx.fillStyle='#2F6F73';ctx.fill(poly(q));
    var q2=[S(x+.12,y+.12,z+.011),S(x+1.88,y+.12,z+.011),S(x+1.88,y+1.28,z+.011),S(x+.12,y+1.28,z+.011)];
    ctx.strokeStyle='#8FC4C2';ctx.lineWidth=1.6;ctx.stroke(poly(q2));
    var q3=[S(x+.3,y+.3,z+.012),S(x+1.7,y+.3,z+.012),S(x+1.7,y+1.1,z+.012),S(x+.3,y+1.1,z+.012)];
    ctx.fillStyle='#3E878B';ctx.fill(poly(q3));
  }else if(id==='karavot'){
    box(S,x,y,z,1.6,2.0,.30,'#8A5A36');
    box(S,x,y,z,1.6,.10,.95,'#7A4E2D');
    box(S,x+.04,y+.10,z+.30,1.52,1.86,.20,'#EFEAF6');
    box(S,x+.04,y+.9,z+.30,1.52,.96,.215,'#5F78B8');
    box(S,x+.15,y+.16,z+.50,.55,.32,.10,'#FFFFFF');
    box(S,x+.90,y+.16,z+.50,.55,.32,.10,'#FFFFFF');
  }else if(id==='tumba'){
    box(S,x,y,z,.45,.40,.50,'#8A5A36');
    ctx.strokeStyle='rgba(30,14,4,.55)';ctx.lineWidth=1.2;line(S(x+.05,y+.40,z+.27),S(x+.40,y+.40,z+.27));
    var hd=S(x+.225,y+.40,z+.38);ctx.fillStyle='#E9D9B8';ctx.beginPath();ctx.arc(hd[0],hd[1],1.8,0,Math.PI*2);ctx.fill();
  }else if(id==='shkaf'){
    box(S,x,y,z,1.18,.6,2.1,'#DAD4C8');
    ctx.strokeStyle='rgba(60,50,30,.5)';ctx.lineWidth=1.3;line(S(x+.59,y+.6,z+.08),S(x+.59,y+.6,z+2.02));
    ctx.fillStyle='#7A6A50';
    [.5,.68].forEach(function(hx){var hp=S(x+hx,y+.6,z+1.05);ctx.beginPath();ctx.arc(hp[0],hp[1],1.9,0,Math.PI*2);ctx.fill();});
  }else if(id==='stol'){
    [[.03,.03],[.53,.03],[.03,1.13],[.53,1.13]].forEach(function(l){box(S,x+l[0],y+l[1],z,.04,.04,.71,'#6E4A2A');});
    box(S,x,y,z+.71,.6,1.2,.04,'#C9A27A');
  }else if(id==='stul'){
    [[.02,.02],[.36,.02],[.02,.36],[.36,.36]].forEach(function(l){box(S,x+l[0],y+l[1],z,.04,.04,.42,'#6E4A2A');});
    box(S,x,y,z+.42,.42,.42,.05,'#E0E6F5');
    box(S,x+.38,y,z+.47,.04,.42,.43,'#E0E6F5');
  }
}

/* keyframed path for the hand: pts = [[t,[x,y]],...] with non-decreasing t */
function kf(t,pts){
  if(t<=pts[0][0])return pts[0][1];
  for(var j=1;j<pts.length;j++){
    if(t<=pts[j][0]){var a=pts[j-1],b=pts[j],s=ease(seg(t,a[0],b[0]));return [lerp(a[1][0],b[1][0],s),lerp(a[1][1],b[1][1],s)];}
  }
  return pts[pts.length-1][1];
}
var SLV=null;
function sleeveImg(){
  if(SLV)return SLV;
  var c=document.createElement('canvas');c.width=240;c.height=760;
  var g=c.getContext('2d');if(!g)return null;
  g.scale(2,2);g.translate(50,-90);
  var gr=g.createLinearGradient(-48,0,56,0);
  gr.addColorStop(0,'#A9B8DF');gr.addColorStop(.28,'#DCE4F7');gr.addColorStop(.55,'#EEF2FC');gr.addColorStop(1,'#A2B1DA');
  g.beginPath();g.moveTo(-35,104);g.lineTo(42,104);g.bezierCurveTo(46,190,50,300,56,470);g.lineTo(-50,470);g.bezierCurveTo(-44,300,-39,190,-35,104);g.closePath();
  g.fillStyle=gr;g.fill();
  g.lineWidth=1;g.strokeStyle='rgba(60,80,150,.16)';
  [[-18,150,-24,330],[4,140,6,340],[26,150,34,320]].forEach(function(f){g.beginPath();g.moveTo(f[0],f[1]);g.bezierCurveTo(f[0]-5,f[1]+60,f[2]+6,f[3]-60,f[2],f[3]);g.stroke();});
  var cg=g.createLinearGradient(0,104,0,128);cg.addColorStop(0,'#FAFCFF');cg.addColorStop(1,'#D4DDF3');
  g.beginPath();g.moveTo(-35,104);g.lineTo(42,104);g.lineTo(43.5,128);g.lineTo(-37,128);g.closePath();g.fillStyle=cg;g.fill();
  g.strokeStyle='rgba(60,80,150,.35)';g.beginPath();g.moveTo(-37,128);g.lineTo(43.5,128);g.stroke();
  g.strokeStyle='rgba(60,80,150,.2)';g.beginPath();g.moveTo(-35,104);g.lineTo(42,104);g.stroke();
  g.setTransform(1,0,0,1,0,0);g.globalCompositeOperation='destination-in';
  var fg=g.createLinearGradient(0,0,0,760);fg.addColorStop(0,'rgba(0,0,0,1)');fg.addColorStop(.5,'rgba(0,0,0,1)');fg.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=fg;g.fillRect(0,0,240,760);
  SLV=c;return c;
}
function hand2D(x,y,press,alpha){
  if(alpha<=.01)return;
  var hi='#F8D9BD',skin='#E8B58E',lo='#C68A64',ed='rgba(105,58,30,.5)',cr='rgba(120,66,36,.4)';
  ctx.save();ctx.globalAlpha=alpha;
  /* contact shadow on the surface under the fingertip */
  ctx.save();ctx.translate(x+4,y+6);ctx.scale(1,.42);
  var cs=ctx.createRadialGradient(0,0,1,0,0,24);cs.addColorStop(0,'rgba(2,8,36,'+(.46-press*.14).toFixed(2)+')');cs.addColorStop(1,'rgba(2,8,36,0)');
  ctx.fillStyle=cs;ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.translate(x,y);ctx.rotate(-.5);ctx.translate(0,press*8);var sc=1.15-press*.05;ctx.scale(sc,sc);
  ctx.lineWidth=1.1;ctx.strokeStyle=ed;ctx.lineJoin='round';
  ctx.shadowColor='rgba(2,8,36,.42)';ctx.shadowBlur=16;ctx.shadowOffsetY=10;
  /* back of hand */
  var pg=ctx.createLinearGradient(-30,0,38,0);pg.addColorStop(0,hi);pg.addColorStop(.45,skin);pg.addColorStop(1,lo);
  ctx.beginPath();ctx.moveTo(-22,122);ctx.bezierCurveTo(-28,102,-31,84,-29,66);ctx.bezierCurveTo(-28,52,-22,44,-12,42);
  ctx.lineTo(28,44);ctx.bezierCurveTo(36,48,38,58,37,70);ctx.bezierCurveTo(36,90,31,106,26,122);ctx.closePath();
  ctx.fillStyle=pg;ctx.fill();ctx.stroke();
  ctx.shadowColor='transparent';
  /* faint tendons / veins */
  ctx.strokeStyle='rgba(150,95,95,.2)';ctx.lineWidth=1.3;
  [[-4,66,-6,112],[8,66,12,112],[19,70,22,110]].forEach(function(v){ctx.beginPath();ctx.moveTo(v[0],v[1]);ctx.quadraticCurveTo(v[0]+(v[2]-v[0])*.2-3,(v[1]+v[3])/2,v[2],v[3]);ctx.stroke();});
  ctx.lineWidth=1.1;ctx.strokeStyle=ed;
  /* curled fingers */
  [[9,36,15,34],[22,43,14,32],[34,51,12,28]].forEach(function(f,i){
    var fg=ctx.createLinearGradient(0,f[1],0,f[1]+f[3]);fg.addColorStop(0,hi);fg.addColorStop(.55,skin);fg.addColorStop(1,lo);
    rr(f[0],f[1],f[2],f[3],f[2]/2);ctx.fillStyle=fg;ctx.fill();ctx.stroke();
    ctx.strokeStyle=cr;ctx.lineWidth=1;ctx.beginPath();var cy=f[1]+f[3]*.58;ctx.moveTo(f[0]+3,cy);ctx.quadraticCurveTo(f[0]+f[2]/2,cy+2.4,f[0]+f[2]-3,cy);ctx.stroke();
    ctx.strokeStyle=ed;ctx.lineWidth=1.1;
  });
  /* thumb */
  ctx.save();ctx.translate(-21,94);ctx.rotate(-.8);
  var tg=ctx.createLinearGradient(-8,0,8,0);tg.addColorStop(0,hi);tg.addColorStop(.5,skin);tg.addColorStop(1,lo);
  rr(-7.5,-34,15,42,7.5);ctx.fillStyle=tg;ctx.fill();ctx.stroke();
  ctx.strokeStyle=cr;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-4,-13);ctx.quadraticCurveTo(0,-11,4,-13);ctx.stroke();
  ctx.fillStyle='rgba(255,238,226,.8)';ctx.strokeStyle='rgba(150,90,60,.35)';ctx.beginPath();ctx.ellipse(-1,-26,3.8,5.8,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.restore();
  /* shade between index and curled fingers */
  ctx.strokeStyle='rgba(90,45,15,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(9.5,34);ctx.lineTo(10,68);ctx.stroke();
  /* index finger */
  var ig=ctx.createLinearGradient(-9,0,9,0);ig.addColorStop(0,skin);ig.addColorStop(.35,hi);ig.addColorStop(1,lo);
  ctx.lineWidth=1.1;ctx.strokeStyle=ed;
  ctx.beginPath();ctx.moveTo(-9,70);ctx.lineTo(-8.4,10);ctx.bezierCurveTo(-8.4,-3.5,8.4,-3.5,8.4,10);ctx.lineTo(9,70);ctx.closePath();
  ctx.fillStyle=ig;ctx.fill();ctx.stroke();
  ctx.strokeStyle=cr;ctx.lineWidth=1;
  [26,43].forEach(function(cy){ctx.beginPath();ctx.moveTo(-5.5,cy);ctx.quadraticCurveTo(0,cy+2.6,5.5,cy);ctx.stroke();ctx.beginPath();ctx.moveTo(-3.5,cy+3.4);ctx.quadraticCurveTo(0,cy+5,3.5,cy+3.4);ctx.stroke();});
  /* fingernail */
  var ng=ctx.createLinearGradient(0,2,0,16);ng.addColorStop(0,'rgba(255,244,236,.95)');ng.addColorStop(1,'rgba(255,214,200,.9)');
  ctx.beginPath();ctx.moveTo(-5.4,15);ctx.lineTo(-5.4,8);ctx.bezierCurveTo(-5.4,1,5.4,1,5.4,8);ctx.lineTo(5.4,15);ctx.quadraticCurveTo(0,17.5,-5.4,15);ctx.closePath();
  ctx.fillStyle=ng;ctx.fill();ctx.strokeStyle='rgba(150,90,60,.4)';ctx.lineWidth=.9;ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.7)';ctx.beginPath();ctx.ellipse(-2,6,1.3,3.2,0,0,Math.PI*2);ctx.fill();
  /* knuckle highlight */
  ctx.fillStyle='rgba(255,236,220,.35)';ctx.beginPath();ctx.ellipse(-1,60,5,3.2,0,0,Math.PI*2);ctx.fill();
  /* sleeve with cuff */
  var sv=sleeveImg();
  if(sv){ctx.shadowColor='rgba(2,8,36,.45)';ctx.shadowBlur=14;ctx.shadowOffsetY=8;ctx.drawImage(sv,-50,90,120,380);ctx.shadowColor='transparent';}
  ctx.restore();
}

/* ---------- hand: the 3D hand image supplied by the owner, used as-is (cut from its background) ---------- */
var PH={sprite:null,tip:[29,32],S:.125,W:1964,Hh:1602};
(function(){var im=new Image();im.onload=function(){PH.sprite=im;};im.src='/hand-sprite.webp';})();
function hand(x,y,press,alpha){
  if(alpha<=.01)return;
  if(!PH.sprite)return hand2D(x,y,press,alpha);
  ctx.save();ctx.globalAlpha=alpha;
  ctx.save();ctx.translate(x+4,y+6);ctx.scale(1,.42);
  var cs=ctx.createRadialGradient(0,0,1,0,0,24);cs.addColorStop(0,'rgba(2,8,36,'+(.46-press*.14).toFixed(2)+')');cs.addColorStop(1,'rgba(2,8,36,0)');
  ctx.fillStyle=cs;ctx.beginPath();ctx.arc(0,0,24,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.translate(x,y);ctx.translate(0,press*6);var sc=PH.S*(1-press*.04);ctx.scale(sc,sc);
  ctx.shadowColor='rgba(2,8,36,.45)';ctx.shadowBlur=22;ctx.shadowOffsetY=16;
  ctx.drawImage(PH.sprite,-PH.tip[0],-PH.tip[1],PH.W,PH.Hh);
  ctx.restore();
}

/* wallpaper timeline inside the wallpaper scene */
function wpState(u2){
  var s={base:-1,over:-1,q:0};
  for(var j=0;j<SEQ.length;j++){
    var pt=TS[j]+.04;
    if(u2>=pt){s.base=j?SEQ[j-1]:-1;s.over=SEQ[j];s.q=ease(seg(u2,pt,pt+.05));}
  }
  return s;
}

/* model: everything the frame depends on, derived from scroll progress */
function model(p){
  var u=sceneU(p);
  var m={p:p,u:u};
  m.k=ease(seg(u[1],.74,.98));
  m.d1=seg(u[1],.08,.74);
  m.e=ease(seg(u[2],.06,.78));
  m.f=ease(seg(u[3],.86,1));
  m.wp=wpState(u[3]);
  m.pop=ease(seg(u[4],.28,.42));
  m.v=seg(u[4],.42,.82);
  m.s=lerp(3.55,WIN.center,easeOutBack(m.v));
  m.lab=ease(seg(u[0],.90,1));
  return m;
}

function draw(m){
  var u=m.u,e=m.e,k=m.k,d1=m.d1,f=m.f,wp=m.wp;
  var uL=u[0],uD=u[1],uW=u[3],uN=u[4],uF=u[5],uE=u[6];
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,Hc);
  if(W<10||Hc<10)return;
  var wide=W>640;
  var padB=wide?50:0,VH=Hc-padB;

  /* picker geometry: shared by the wallpaper and furniture scenes */
  var Tsz=wide?clamp((VH-50)/6-10,44,80):clamp((W-24-40)/6,38,64),gap=wide?10:8;
  var pkW=smooth(0,.07,uW)*(1-smooth(0,.10,uN));
  var pkF=smooth(0,.05,uF)*(1-smooth(.93,1,uF));
  var pkMax=Math.max(pkW,pkF);
  var resW=wide?pkMax*(Tsz+34):0,resH=wide?0:pkMax*(Tsz+22);
  var availW=W-resW,availH=VH-resH;
  var tile;
  if(wide){
    var px0=W-Tsz-8,py0=(VH-(6*Tsz+5*gap))/2+8;
    tile=function(n){return [px0+Tsz/2,py0+n*(Tsz+gap)+Tsz/2];};
  }else{
    var px1=(W-(6*Tsz+5*gap))/2,py1=Hc-Tsz-6;
    tile=function(n){return [px1+n*(Tsz+gap)+Tsz/2,py1+Tsz/2];};
  }

  var x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,i,j;
  for(i=0;i<N;i++){for(j=0;j<2;j++){var c=proj(PTS[i][0],PTS[i][1],j?H:0,e);
    if(c[0]<x0)x0=c[0];if(c[0]>x1)x1=c[0];if(c[1]<y0)y0=c[1];if(c[1]>y1)y1=c[1];}}
  var sc=Math.min(170,availW/((x1-x0)+1.0),availH/((y1-y0)+1.1));
  var ox=availW/2-(x0+x1)/2*sc,oy=availH/2-(y0+y1)/2*sc;
  var S=function(x,y,z){var c=proj(x,y,z||0,e);return [ox+c[0]*sc,oy+c[1]*sc];};
  var invS=function(X,Y,z){var a=(X-ox)/sc/IC,b=((Y-oy)/sc+z)/IS;return [(b+a)/2,(b-a)/2];};

  var eff=PTS.map(function(q,n){return [q[0]+JIT[n][0]*(1-k),q[1]+JIT[n][1]*(1-k)];});
  var dist=d1*PER;
  var fr=LENS.map(function(L,n){return clamp((dist-CUM[n])/L);});
  var closed=seg(d1,.92,1);
  var fp=poly(eff.map(function(q){return S(q[0],q[1],0);}));

  /* scene 1: LiDAR scan. A phone in the room sweeps 360 degrees; points snap to walls. */
  var lidFade=1-smooth(0,.10,uD);
  if(lidFade>.01){
    var scanA=seg(uL,.06,.72),snap=ease(seg(uL,.74,.88)),outA=ease(seg(uL,.84,.94));
    var oc=S(LO[0],LO[1],0),cnt=Math.floor(scanA*NR);
    ctx.save();ctx.globalAlpha=lidFade;
    if(outA>.01){
      ctx.save();ctx.globalAlpha=lidFade*outA*.55;ctx.fillStyle='#1B3A8C';ctx.fill(poly(PTS.map(function(q){return S(q[0],q[1],0);})));ctx.restore();
    }
    var rings=scanA>0&&scanA<1;
    for(j=0;j<3;j++){
      var ph=rings?((scanA*4+j/3)%1):(.25+j*.3);
      ctx.beginPath();ctx.arc(oc[0],oc[1],ph*2.6*sc,0,Math.PI*2);
      ctx.strokeStyle='rgba(255,147,64,'+((rings?(1-ph)*.34:.12)*(1-outA)).toFixed(3)+')';ctx.lineWidth=1.6;ctx.stroke();
    }
    ctx.lineWidth=1;
    for(j=Math.max(0,cnt-14);j<cnt;j++){
      var hp=S(HITS[j][0],HITS[j][1],0);
      ctx.strokeStyle='rgba(255,147,64,'+(((j-(cnt-14))/14)*.4*(1-snap)).toFixed(3)+')';line(oc,hp);
    }
    for(j=0;j<cnt;j++){
      var dp=S(HITS[j][0]+NOI[j][0]*(1-snap),HITS[j][1]+NOI[j][1]*(1-snap),0);
      var fresh=cnt-j<10;
      ctx.globalAlpha=lidFade*(fresh?1:.8-.3*snap);
      ctx.fillStyle=fresh?ACC:PAPER;ctx.beginPath();ctx.arc(dp[0],dp[1],fresh?3.4:2.6,0,Math.PI*2);ctx.fill();
    }
    ctx.globalAlpha=lidFade;
    if(outA>.01){
      ctx.save();ctx.globalAlpha=lidFade*outA;ctx.strokeStyle=PAPER;ctx.lineWidth=3.6;ctx.lineJoin='round';
      ctx.stroke(poly(PTS.map(function(q){return S(q[0],q[1],0);})));
      ctx.fillStyle=ACC;PTS.forEach(function(q){var cp=S(q[0],q[1],0);ctx.beginPath();ctx.arc(cp[0],cp[1],5.5,0,Math.PI*2);ctx.fill();});
      ctx.restore();
      var full=[1,1,1,1,1,1];
      planLabels(S,PTS,full,lidFade*m.lab,1,W<520?12:14.5);
      areaLabel(S,lidFade*m.lab,AREA);
    }
    /* the phone itself */
    if(outA<.99){
      ctx.save();ctx.globalAlpha=lidFade*(1-outA);ctx.translate(oc[0],oc[1]);ctx.rotate(scanA*Math.PI*2);
      rr(-10,-18,20,36,5);ctx.fillStyle='#0C1E54';ctx.fill();ctx.lineWidth=2.2;ctx.strokeStyle=PAPER;ctx.stroke();
      ctx.beginPath();ctx.arc(0,-11,3,0,Math.PI*2);ctx.fillStyle=ACC;ctx.fill();
      ctx.beginPath();ctx.moveTo(-5,-20);ctx.lineTo(5,-20);ctx.lineTo(0,-28);ctx.closePath();ctx.fill();
      ctx.restore();
      pill(oc[0],oc[1]+34,'LiDAR',lidFade*(1-outA),13,true);
    }
    ctx.restore();
  }

  /* floor */
  if(closed>.01){
    var base=mix('#1B3A8C','#4F659B',e);
    var floorCol=mix(base,'#C4905A',f);
    ctx.save();ctx.globalAlpha=closed;
    if(e>.02){ctx.shadowColor='rgba(2,8,36,.55)';ctx.shadowBlur=28*e;ctx.shadowOffsetY=16*e;}
    ctx.fillStyle=floorCol;ctx.fill(fp);ctx.restore();

    if(e<.99){
      ctx.save();ctx.clip(fp);ctx.strokeStyle='rgba(205,220,255,'+(.2*closed*(1-e)).toFixed(3)+')';ctx.lineWidth=1;ctx.beginPath();
      for(var gx=.5;gx<4.7;gx+=.5){var ga=S(gx,-.1),gb=S(gx,3.4);ctx.moveTo(ga[0],ga[1]);ctx.lineTo(gb[0],gb[1]);}
      for(var gy=.5;gy<3.3;gy+=.5){var gc=S(-.1,gy),gd=S(4.8,gy);ctx.moveTo(gc[0],gc[1]);ctx.lineTo(gd[0],gd[1]);}
      ctx.stroke();ctx.restore();
    }
    if(f>.01){
      ctx.save();ctx.clip(fp);ctx.strokeStyle='rgba(70,38,14,'+(.36*f).toFixed(3)+')';ctx.lineWidth=1;ctx.beginPath();
      var row=0;
      for(var py=.19;py<3.4;py+=.19,row++){
        var pa=S(-.1,py),pb=S(4.8,py);ctx.moveTo(pa[0],pa[1]);ctx.lineTo(pb[0],pb[1]);
        for(var pxx=(row*.63)%1.3;pxx<4.8;pxx+=1.3){var ja=S(pxx,py),jb=S(pxx,py+.19);ctx.moveTo(ja[0],ja[1]);ctx.lineTo(jb[0],jb[1]);}
      }
      ctx.stroke();ctx.restore();
    }
  }

  /* back walls with wallpaper */
  var A0=S(0,0,0),B0=S(4.7,0,0),F0=S(0,3.3,0),A1=S(0,0,H),B1=S(4.7,0,H),F1=S(0,3.3,H);
  if(e>.01){
    var wAB=poly([A0,B0,B1,A1]),wFA=poly([F0,A0,A1,F1]);
    var gx0=F0[0]-2,gx1=B0[0]+2;
    var uAB=[(B0[0]-A0[0])/4.7,(B0[1]-A0[1])/4.7],vAB=[(A1[0]-A0[0])/H,(A1[1]-A0[1])/H];
    var uFA=[(A0[0]-F0[0])/3.3,(A0[1]-F0[1])/3.3],vFA=[(F1[0]-F0[0])/H,(F1[1]-F0[1])/H];
    var paintWall=function(kk,limitX){
      [[wAB,A0,uAB,vAB,4.7],[wFA,F0,uFA,vFA,3.3]].forEach(function(o){
        ctx.save();ctx.clip(o[0]);
        if(limitX!==null){ctx.beginPath();ctx.rect(-10,-10,limitX+10,Hc+20);ctx.clip();}
        ctx.transform(o[2][0],o[2][1],o[3][0],o[3][1],o[1][0],o[1][1]);
        drawWP(kk,o[4],H);
        ctx.restore();
      });
    };
    ctx.save();ctx.globalAlpha=smooth(0,.15,e);
    ctx.fillStyle=PLAIN;ctx.fill(wAB);ctx.fill(wFA);
    if(wp.base>=0)paintWall(wp.base,null);
    if(wp.over>=0){
      if(wp.q>=.999){paintWall(wp.over,null);}
      else if(wp.q>.001){
        var lx=gx0+(gx1-gx0)*wp.q;
        paintWall(wp.over,lx);
        [wAB,wFA].forEach(function(pt){
          ctx.save();ctx.clip(pt);
          var cg=ctx.createLinearGradient(lx,0,lx+22,0);cg.addColorStop(0,'rgba(6,16,50,.34)');cg.addColorStop(1,'rgba(6,16,50,0)');
          ctx.fillStyle=cg;ctx.fillRect(lx,0,22,Hc);
          ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.6;line([lx,0],[lx,Hc]);
          ctx.restore();
        });
      }
    }
    ctx.fillStyle='rgba(8,22,70,.20)';ctx.fill(wFA);
    var sh=ctx.createLinearGradient(0,Math.min(A1[1],B1[1]),0,Math.max(A0[1],B0[1]));
    sh.addColorStop(0,'rgba(255,255,255,.10)');sh.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=sh;ctx.fill(wAB);
    if(f>.01){
      ctx.fillStyle='rgba(245,242,233,'+(.95*f).toFixed(3)+')';
      ctx.fill(poly([S(0,0,0),S(4.7,0,0),S(4.7,0,.11),S(0,0,.11)]));
      ctx.fill(poly([S(0,3.3,0),S(0,0,0),S(0,0,.11),S(0,3.3,.11)]));
    }
    ctx.strokeStyle='rgba(238,244,255,.9)';ctx.lineWidth=2.2;ctx.lineJoin='round';
    ctx.beginPath();ctx.moveTo(F1[0],F1[1]);ctx.lineTo(A1[0],A1[1]);ctx.lineTo(B1[0],B1[1]);ctx.stroke();
    ctx.strokeStyle='rgba(238,244,255,.5)';ctx.lineWidth=1.5;line(A0,A1);
    ctx.restore();

    /* door on the left wall */
    var da=smooth(0,.3,e);
    var d0=S(0,DOOR.y0,0),d1p=S(0,DOOR.y1,0),d2=S(0,DOOR.y1,DOOR.h),d3=S(0,DOOR.y0,DOOR.h);
    ctx.save();ctx.globalAlpha=da;
    ctx.fillStyle='#A06F43';ctx.fill(poly([d0,d1p,d2,d3]));
    ctx.strokeStyle='#F0E6D2';ctx.lineWidth=2.8;ctx.lineJoin='round';ctx.stroke(poly([d0,d1p,d2,d3]));
    var hd=S(0,DOOR.y1-.13,1.0);ctx.fillStyle='#F0E6D2';ctx.beginPath();ctx.arc(hd[0],hd[1],3,0,Math.PI*2);ctx.fill();
    ctx.restore();

    /* window on the back-right wall */
    if(m.pop>.01){
      var hw=WIN.w/2*m.pop,zc=(WIN.z0+WIN.z1)/2,hh=(WIN.z1-WIN.z0)/2*m.pop,xs=m.s;
      var wpts=[S(xs-hw,0,zc-hh),S(xs+hw,0,zc-hh),S(xs+hw,0,zc+hh),S(xs-hw,0,zc+hh)];
      ctx.save();ctx.globalAlpha=Math.min(1,m.pop*1.4);
      ctx.fillStyle='rgba(176,214,255,.5)';ctx.fill(poly(wpts));
      ctx.strokeStyle='#F4F8FF';ctx.lineWidth=3.4;ctx.lineJoin='round';ctx.stroke(poly(wpts));
      ctx.lineWidth=1.8;line(S(xs,0,zc-hh),S(xs,0,zc+hh));line(S(xs-hw,0,zc),S(xs+hw,0,zc));
      ctx.restore();
    }
  }

  /* outline, drawn stroke by stroke in scene 2 (the door leaves a gap in the left wall) */
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=PAPER;
  ctx.lineWidth=lerp(3.8,1.8,e);ctx.globalAlpha=lerp(1,.75,e);
  for(i=0;i<N;i++){
    var fi=fr[i];if(fi<=0)continue;
    var a=eff[i],b=eff[(i+1)%N];
    var ivs=i===5?[[0,DT1],[DT2,1]]:[[0,1]];
    for(j=0;j<ivs.length;j++){
      var t0=ivs[j][0],te=Math.min(fi,ivs[j][1]);if(te<=t0)continue;
      line(S(lerp(a[0],b[0],t0),lerp(a[1],b[1],t0)),S(lerp(a[0],b[0],te),lerp(a[1],b[1],te)));
    }
  }
  ctx.restore();

  /* furniture */
  var furGuide=0;
  if(uF>0){
    var items=[];
    var tiles=PIECES.map(function(pc,n){return tile(n);});
    PIECES.forEach(function(pc,n){
      var ts=TSF[n];
      if(uF<ts+.02)return;
      var xx=pc.x,yy=pc.y,zz=0,tdrag=1,dimA=0;
      if(uF<ts+.09){
        tdrag=ease(seg(uF,ts+.02,ts+.09));
        var tgt=S(pc.x+pc.dx/2,pc.y+pc.dy/2,LIFT+pc.h);
        var an=[lerp(tiles[n][0],tgt[0],tdrag),lerp(tiles[n][1],tgt[1],tdrag)];
        var cc=invS(an[0],an[1],LIFT+pc.h);
        xx=cc[0]-pc.dx/2;yy=cc[1]-pc.dy/2;zz=LIFT;
        dimA=seg(tdrag,.55,.95);
      }else if(uF<ts+.12){
        zz=LIFT*(1-ease(seg(uF,ts+.09,ts+.12)));dimA=1;
      }else{
        dimA=1-seg(uF,ts+.14,ts+.17);
        if(n===TSF.length-1)dimA=1-seg(uF,ts+.15,ts+.19);
      }
      items.push({n:n,pc:pc,x:xx,y:yy,z:zz,dimA:dimA*(uF<ts+.02?0:1),drag:uF<ts+.09});
    });
    items.sort(function(a,b){return (a.pc.solid?1:0)-(b.pc.solid?1:0)||((a.x+a.pc.dx/2)+(a.y+a.pc.dy/2))-((b.x+b.pc.dx/2)+(b.y+b.pc.dy/2));});
    items.forEach(function(it){
      var pc=it.pc;
      if(pc.solid||it.z>0){
        ctx.save();ctx.globalAlpha=.28*(1-it.z*.9);
        ctx.fillStyle='rgba(2,8,36,1)';ctx.fill(poly([S(it.x-.04,it.y-.04,0),S(it.x+pc.dx+.05,it.y-.04,0),S(it.x+pc.dx+.05,it.y+pc.dy+.05,0),S(it.x-.04,it.y+pc.dy+.05,0)]));
        ctx.restore();
      }
      pieceDraw(pc.id,S,it.x,it.y,it.z);
    });
    /* live distances to the walls */
    items.forEach(function(it){
      if(it.dimA<=.02)return;
      var pc=it.pc,xc=it.x+pc.dx/2,yc=it.y+pc.dy/2,Rw=yc<2.1?4.7:3.6;
      var dl=it.x,dr=Rw-(it.x+pc.dx),useR=dr<dl-1e-6,gapX=useR?dr:dl;
      var Bw=xc<3.6?3.3:2.1,dt=it.y,db=Bw-(it.y+pc.dy),useB=db<dt-1e-6,gapY=useB?db:dt;
      var sz=W<520?12:14;
      ctx.save();ctx.globalAlpha=it.dimA;ctx.strokeStyle=ACC;ctx.lineWidth=1.8;
      if(gapX>.02){
        var xa=useR?it.x+pc.dx:0,xb=useR?Rw:it.x,pa=S(xa,yc,0),pb=S(xb,yc,0);
        line(pa,pb);line([pa[0]-5,pa[1]-4],[pa[0]+5,pa[1]+4]);line([pb[0]-5,pb[1]-4],[pb[0]+5,pb[1]+4]);
        ctx.restore();pill((pa[0]+pb[0])/2,(pa[1]+pb[1])/2,gapX.toFixed(2)+' m',it.dimA,sz,false);ctx.save();ctx.globalAlpha=it.dimA;ctx.strokeStyle=ACC;ctx.lineWidth=1.8;
      }
      if(gapY>.02){
        var ya=useB?it.y+pc.dy:0,yb=useB?Bw:it.y,qa=S(xc,ya,0),qb=S(xc,yb,0);
        line(qa,qb);line([qa[0]-5,qa[1]+4],[qa[0]+5,qa[1]-4]);line([qb[0]-5,qb[1]+4],[qb[0]+5,qb[1]-4]);
        ctx.restore();pill((qa[0]+qb[0])/2,(qa[1]+qb[1])/2,gapY.toFixed(2)+' m',it.dimA,sz,false);ctx.save();
      }
      ctx.restore();
      if(pc.id==='karavot'){
        var off=Math.abs(xc-WIN.center);
        furGuide=Math.max(furGuide,(1-smooth(.04,.3,off))*it.dimA);
      }
    });
    if(furGuide>.01){
      var g0=S(WIN.center,0,0),g1=S(WIN.center,0,H);
      ctx.save();ctx.globalAlpha=furGuide;ctx.strokeStyle=ACC;ctx.lineWidth=1.8;ctx.setLineDash([6,5]);line(g0,g1);ctx.restore();
      pill(g1[0],g1[1]-16,'markaz',furGuide,13,true);
    }
  }

  /* plan-only overlays: door swing, corner dots, live lengths, area */
  var planA=(1-smooth(0,.25,e))*smooth(0,.05,uD);
  if(planA>.01){
    var swA=planA*smooth(DT2,1,fr[5]);
    if(swA>.01){
      ctx.save();ctx.globalAlpha=swA;ctx.strokeStyle='rgba(238,244,255,.85)';ctx.lineWidth=1.6;
      line(S(0,DOOR.y1,0),S(doorW,DOOR.y1,0));
      ctx.beginPath();
      for(var t=0;t<=16;t++){var an2=-Math.PI/2*(1-t/16);var q=S(doorW*Math.cos(an2),DOOR.y1+doorW*Math.sin(an2),0);if(t)ctx.lineTo(q[0],q[1]);else ctx.moveTo(q[0],q[1]);}
      ctx.setLineDash([4,4]);ctx.stroke();ctx.restore();
    }
    planLabels(S,eff,fr,planA,d1,W<520?12:14.5);
    var ar=seg(uD,.76,.98);
    if(ar>.01)areaLabel(S,planA*smooth(0,.3,ar),AREA*ar);
  }
  if(uD>0){
    for(i=0;i<N;i++){
      if(i>0&&dist<CUM[i]-1e-6)continue;
      var cp=S(eff[i][0],eff[i][1],0);
      ctx.save();ctx.globalAlpha=(1-.75*e)*smooth(0,.05,uD);ctx.beginPath();ctx.arc(cp[0],cp[1],lerp(5.5,3.4,e),0,Math.PI*2);ctx.fillStyle=ACC;ctx.fill();ctx.restore();
    }
  }
  if(uD>0&&d1<1){
    var ai=0;for(i=0;i<N;i++){if(dist>=CUM[i])ai=i;}
    var fa=fr[ai]>=1?0:fr[ai];
    var ta=eff[ai],tb=eff[(ai+1)%N];
    var tip=S(lerp(ta[0],tb[0],fa),lerp(ta[1],tb[1],fa),0);
    ctx.save();ctx.globalAlpha=smooth(0,.06,uD);
    ctx.strokeStyle='rgba(255,147,64,.32)';ctx.lineWidth=1;ctx.setLineDash([4,6]);
    line([0,tip[1]],[W,tip[1]]);line([tip[0],0],[tip[0],VH]);ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(tip[0],tip[1],12,0,Math.PI*2);ctx.strokeStyle='rgba(255,147,64,.6)';ctx.lineWidth=1.6;ctx.stroke();
    ctx.beginPath();ctx.arc(tip[0],tip[1],6,0,Math.PI*2);ctx.fillStyle=ACC;ctx.fill();
    ctx.restore();
    if(d1<.03)pill(tip[0]+72,tip[1]-24,'boshlang',smooth(0,.06,uD),14,true);
  }

  /* scene 3: drag handles and live height */
  var hA=smooth(.45,.7,e)*(1-seg(uW,0,.2));
  if(hA>.01){
    handle(A1,'v',hA);handle(B1,'h',hA);
    var dx=A0[0]-34;
    ctx.save();ctx.globalAlpha=hA;ctx.strokeStyle=ACC;ctx.lineWidth=1.8;
    line([dx,A1[1]],[dx,A0[1]]);line([dx-6,A1[1]],[dx+6,A1[1]]);line([dx-6,A0[1]],[dx+6,A0[1]]);
    ctx.restore();
    pill(dx-4,(A0[1]+A1[1])/2,(H*e).toFixed(2)+' m',hA,W<520?12:14.5,false);
  }

  /* pickers: wallpapers (scene 4) or furniture (scene 6) with the hand that uses them */
  var ent=[W+60,VH+150];
  if(pkW>.01){
    ctx.save();ctx.globalAlpha=pkW;
    var shown=wp.over<0?-1:(wp.q>.5?wp.over:wp.base);
    var hp0=tile(0);
    ctx.fillStyle=ACC;ctx.font='500 '+(wide?12:11)+'px '+MONO;ctx.textBaseline='alphabetic';
    if(wide){ctx.textAlign='center';ctx.fillText('OBOY',hp0[0],hp0[1]-Tsz/2-9);}
    else{ctx.textAlign='left';ctx.fillText('OBOY',hp0[0]-Tsz/2,hp0[1]-Tsz/2-8);}
    for(var tk=0;tk<6;tk++){
      var tc=tile(tk),tx=tc[0]-Tsz/2,ty=tc[1]-Tsz/2;
      ctx.save();rr(tx,ty,Tsz,Tsz,5);ctx.clip();
      ctx.transform(Tsz,0,0,-Tsz,tx,ty+Tsz);
      drawWP(tk,1,1);
      ctx.restore();
      rr(tx,ty,Tsz,Tsz,5);
      if(tk===shown){ctx.lineWidth=3.4;ctx.strokeStyle=ACC;}else{ctx.lineWidth=1.2;ctx.strokeStyle='rgba(238,244,255,.55)';}
      ctx.stroke();
      ctx.fillStyle='rgba(12,30,84,.85)';rr(tx+3,ty+3,17,17,4);ctx.fill();
      ctx.fillStyle=PAPER;ctx.font='500 11.5px '+MONO;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(tk+1),tx+11.5,ty+12);
    }
    ctx.restore();
    for(j=0;j<SEQ.length;j++){
      var rp=seg(uW,TS[j]+.04,TS[j]+.09);
      if(rp>0&&rp<1){
        var rc=tile(SEQ[j]);ctx.save();ctx.globalAlpha=(1-rp)*.9*pkW;ctx.strokeStyle=ACC;ctx.lineWidth=2.4;
        ctx.beginPath();ctx.arc(rc[0],rc[1],lerp(8,Tsz*.8,rp),0,Math.PI*2);ctx.stroke();ctx.restore();
      }
    }
    var hAlpha=smooth(.02,.06,uW)*(1-smooth(.88,.93,uW));
    if(hAlpha>.01){
      var press=0;
      for(j=0;j<SEQ.length;j++){press=Math.max(press,Math.sin(Math.PI*seg(uW,TS[j]+.04,TS[j]+.075)));}
      var wpts2=[[.02,ent]];
      for(j=0;j<SEQ.length;j++){
        wpts2.push([TS[j]+.04,tile(SEQ[j])]);
        if(j<SEQ.length-1)wpts2.push([TS[j+1],tile(SEQ[j])]);
      }
      wpts2.push([.86,tile(SEQ[SEQ.length-1])]);wpts2.push([.94,ent]);
      var hpz=kf(uW,wpts2);
      hand(hpz[0],hpz[1],press,hAlpha);
    }
  }
  if(pkF>.01){
    ctx.save();ctx.globalAlpha=pkF;
    var hf0=tile(0);
    ctx.fillStyle=ACC;ctx.font='500 '+(wide?12:11)+'px '+MONO;ctx.textBaseline='alphabetic';
    if(wide){ctx.textAlign='center';ctx.fillText('MEBEL',hf0[0],hf0[1]-Tsz/2-9);}
    else{ctx.textAlign='left';ctx.fillText('MEBEL',hf0[0]-Tsz/2,hf0[1]-Tsz/2-8);}
    for(var fk=0;fk<6;fk++){
      var pc2=PIECES[fk],fc=tile(fk),fx=fc[0]-Tsz/2,fy=fc[1]-Tsz/2;
      var placed=uF>=TSF[fk]+.12,active=uF>=TSF[fk]&&!placed;
      ctx.save();ctx.globalAlpha=pkF*(placed?.4:1);
      rr(fx,fy,Tsz,Tsz,5);ctx.fillStyle='rgba(20,44,110,.95)';ctx.fill();
      ctx.save();rr(fx,fy,Tsz,Tsz,5);ctx.clip();
      var ssc=Tsz*.66/Math.max((pc2.dx+pc2.dy)*IC,(pc2.dx+pc2.dy)*IS+pc2.h);
      var cx0=(pc2.dx/2-pc2.dy/2)*IC,cy0=(pc2.dx/2+pc2.dy/2)*IS-pc2.h/2;
      var Sl=function(x,y,z){return [fc[0]+((x-y)*IC-cx0)*ssc,fc[1]+((x+y)*IS-z-cy0)*ssc];};
      if(!placed||true)pieceDraw(pc2.id,Sl,0,0,0);
      ctx.restore();
      rr(fx,fy,Tsz,Tsz,5);
      if(active){ctx.lineWidth=3.4;ctx.strokeStyle=ACC;}else{ctx.lineWidth=1.2;ctx.strokeStyle='rgba(238,244,255,.55)';}
      ctx.stroke();
      ctx.restore();
      if(placed){
        ctx.save();ctx.globalAlpha=pkF;ctx.strokeStyle=ACC;ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';
        ctx.beginPath();ctx.moveTo(fc[0]-8,fc[1]);ctx.lineTo(fc[0]-2,fc[1]+7);ctx.lineTo(fc[0]+10,fc[1]-8);ctx.stroke();ctx.restore();
      }
    }
    ctx.restore();
    var hAf=smooth(0,.03,uF)*(1-smooth(.92,.96,uF));
    if(hAf>.01){
      var fpts=[[0,ent]];
      PIECES.forEach(function(pc3,n){
        var ts=TSF[n],tg=S(pc3.x+pc3.dx/2,pc3.y+pc3.dy/2,LIFT+pc3.h);
        fpts.push([ts,tile(n)]);fpts.push([ts+.02,tile(n)]);fpts.push([ts+.09,tg]);fpts.push([ts+.12,tg]);
      });
      fpts.push([TSF[5]+.15,ent]);
      var hz=kf(uF,fpts);
      var fpress=0,dragging=false;
      PIECES.forEach(function(pc4,n){
        fpress=Math.max(fpress,Math.sin(Math.PI*seg(uF,TSF[n],TSF[n]+.02)));
        if(uF>TSF[n]+.02&&uF<TSF[n]+.09)dragging=true;
      });
      hand(hz[0],hz[1],dragging?Math.max(fpress,.3):fpress,hAf);
    }
  }

  /* scene 5: tap, menu, live distances, snap guide */
  var fadeOut=1-seg(uE,0,.12);
  if(uN>0&&fadeOut>.01){
    var T=S(3.1,0,1.55);
    var tp=seg(uN,.02,.2);
    if(tp>0&&uN<.34){
      ctx.save();ctx.strokeStyle=ACC;ctx.fillStyle=ACC;
      ctx.globalAlpha=(1-tp)*.9;ctx.lineWidth=2.4;ctx.beginPath();ctx.arc(T[0],T[1],lerp(5,40,tp),0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=(1-tp)*.5;ctx.beginPath();ctx.arc(T[0],T[1],lerp(3,24,tp),0,Math.PI*2);ctx.stroke();
      ctx.globalAlpha=1-seg(uN,.2,.3);ctx.beginPath();ctx.arc(T[0],T[1],6,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    var ma=smooth(.08,.14,uN)*(1-smooth(.30,.36,uN));
    if(ma>.01){
      var mw=208,mh=88,mxl=clamp(T[0]+22,8,W-mw-8),myl=clamp(T[1]-mh-18,8,VH-mh-8);
      ctx.save();ctx.globalAlpha=ma;
      ctx.shadowColor='rgba(2,8,36,.5)';ctx.shadowBlur=18;ctx.shadowOffsetY=8;
      rr(mxl,myl,mw,mh,8);ctx.fillStyle=PAPER;ctx.fill();ctx.shadowColor='transparent';
      var hot=uN>.22;
      if(hot){rr(mxl+5,myl+5,mw-10,37,5);ctx.fillStyle=ACC;ctx.fill();}
      ctx.strokeStyle=INK;ctx.lineWidth=1.8;
      rr(mxl+15,myl+16,16,16,2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(mxl+23,myl+16);ctx.lineTo(mxl+23,myl+32);ctx.moveTo(mxl+15,myl+24);ctx.lineTo(mxl+31,myl+24);ctx.stroke();
      rr(mxl+16,myl+53,14,24,2);ctx.stroke();
      ctx.fillStyle=INK;ctx.font='600 16px '+BODYF;ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText('Deraza qo‘shish',mxl+44,myl+24);ctx.fillText('Eshik qo‘shish',mxl+44,myl+65);
      ctx.restore();
    }
    var dA=smooth(.3,.42,uN)*fadeOut;
    if(dA>.01){
      var zm=(WIN.z0+WIN.z1)/2,wl=m.s-WIN.w/2,wr=m.s+WIN.w/2;
      ctx.save();ctx.globalAlpha=dA;ctx.strokeStyle=ACC;ctx.lineWidth=2;
      var q0=S(0,0,zm),q1=S(wl,0,zm),q2=S(wr,0,zm),q3=S(4.7,0,zm);
      line(q0,q1);line(q2,q3);
      [q0,q1,q2,q3].forEach(function(pt){line([pt[0],pt[1]-7],[pt[0],pt[1]+7]);});
      ctx.restore();
      pill((q0[0]+q1[0])/2,(q0[1]+q1[1])/2,wl.toFixed(2)+' m',dA,W<520?12:14.5,false);
      pill((q2[0]+q3[0])/2,(q2[1]+q3[1])/2,(4.7-wr).toFixed(2)+' m',dA,W<520?12:14.5,false);
      var gA=(1-smooth(.05,.35,Math.abs(m.s-WIN.center)))*dA;
      if(gA>.01){
        var g0=S(WIN.center,0,0),g1=S(WIN.center,0,H);
        ctx.save();ctx.globalAlpha=gA;ctx.strokeStyle=ACC;ctx.lineWidth=1.8;ctx.setLineDash([6,5]);line(g0,g1);ctx.restore();
        pill(g1[0],g1[1]-16,'markaz',gA,13,true);
      }
    }
  }

  /* scene 7: material callouts */
  if(uE>0){
    tag(S(1.0,0,2.0),-76,-72,'Oboy',rolls+' rulon · Romb',ease(seg(uE,.05,.19)),VH);
    tag(S(1.0,1.75,0),-40,84,'Laminat',lam+' m²',ease(seg(uE,.2,.34)),VH);
    tag(S(.5,0,.06),-40,-64,'Plintus',plinth+' dona',ease(seg(uE,.35,.49)),VH);
  }
}

function ui(m){
  var u=m.u,idx=sceneIdx(m.p);
  if(idx!==curIdx){
    curIdx=idx;
    caps.forEach(function(c,i){c.classList.toggle('on',i===idx);});
    rails.forEach(function(r,i){r.classList.toggle('on',i===idx);r.classList.toggle('done',i<idx);});
  }
  var walls=0;for(var i=0;i<N;i++){if(m.d1*PER>=CUM[i]+LENS[i]-1e-6)walls++;}
  var ar=seg(u[1],.76,.98);
  var scanA=seg(u[0],.06,.72);
  setText(el.r0a,fmt(Math.floor(scanA*180)*7));
  setText(el.r1a,walls+'/6');
  setText(el.r1b,ar>0?(AREA*ar).toFixed(1)+' m²':'—');
  setText(el.r2a,(H*m.e).toFixed(2)+' m');
  setText(el.r2b,m.e>.5?'3D':'Reja');
  var wl=m.s-WIN.w/2,wr=4.7-(m.s+WIN.w/2);
  setText(el.r4a,m.pop>.01?wl.toFixed(2)+' m':'—');
  setText(el.r4b,m.pop>.01?wr.toFixed(2)+' m':'—');
  setText(el.tbArea,(ar>.5||m.lab>.5)?(AREA).toFixed(1)+' m²':'—');
  setText(el.tbView,idx===0?'LiDAR':(idx===1?'Reja':(m.e>.5?'3D':'Reja')));
  setText(el.tbSheet,'0'+(idx+1)+'/07');
  var shown=m.wp.over<0?-1:(m.wp.q>.5?m.wp.over:m.wp.base);
  wls.forEach(function(s,n){s.classList.toggle('on',n===shown);});
  swFloor.classList.toggle('on',m.f>.5);
  setText(el.r3a,shown<0?'Gips':WPS[shown].name);
  setText(el.r3b,shown<0?'—':rolls+' ta · '+fmt(rolls*WPS[shown].price)+' so‘m');
  var uF=u[5],placedN=0,solidPlaced=0;
  fls.forEach(function(s,n){
    var done=uF>=TSF[n]+.12;
    s.classList.toggle('on',uF>=TSF[n]+.02);
    if(done){placedN++;if(PIECES[n].solid)solidPlaced+=PIECES[n].dx*PIECES[n].dy;}
  });
  setText(el.r5a,placedN+'/6');
  setText(el.r5b,uF>0?(AREA-solidPlaced).toFixed(1)+' m²':'—');
  var a5=u[6];
  for(var r=0;r<rrs.length;r++){
    var row=rrs[r],tot=r===ROWS.length;
    var t0=tot?.72:.06+.15*r;
    var vis=ease(seg(a5,t0,t0+.12));
    var cnt=ease(seg(a5,t0,t0+(tot?.23:.2)));
    setOp(row,vis);
    var cells=row.children;
    setText(cells[1],tot?'':ROWS[r].q);
    setText(cells[2],fmt((tot?TOTAL:ROWS[r].a)*cnt));
  }
}

function render(p){var m=model(p);draw(m);ui(m);}

function resize(){
  var r=cv.getBoundingClientRect();
  dpr=Math.min(2,window.devicePixelRatio||1);
  W=r.width;Hc=r.height;
  cv.width=Math.max(1,Math.round(W*dpr));cv.height=Math.max(1,Math.round(Hc*dpr));
  render(cur);
}

var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var target=0,cur=0,raf=0;
function readTarget(){
  var r=story.getBoundingClientRect();
  var total=story.offsetHeight-stage.offsetHeight;
  target=total>0?clamp(-r.top/total):0;
}
function tick(){
  raf=0;
  cur=reduce?target:lerp(cur,target,.16);
  if(Math.abs(target-cur)<.0004)cur=target;
  render(cur);
  if(cur!==target)raf=requestAnimationFrame(tick);
}
function onScroll(){readTarget();if(!raf)raf=requestAnimationFrame(tick);}

readTarget();cur=target;
var __onResize=function(){readTarget();cur=target;resize();};
window.addEventListener('scroll',onScroll,{passive:true});
window.addEventListener('resize',__onResize);
__cleanup=function(){window.removeEventListener('scroll',onScroll);window.removeEventListener('resize',__onResize);if(raf)cancelAnimationFrame(raf);};
resize();
if(document.fonts&&document.fonts.load){
  Promise.all([
    document.fonts.load("500 12px 'IBM Plex Mono'"),
    document.fonts.load("800 24px 'Archivo'"),
    document.fonts.load("600 13px 'Instrument Sans'")
  ]).then(function(){render(cur);}).catch(function(){});
}

  return __cleanup;
}
