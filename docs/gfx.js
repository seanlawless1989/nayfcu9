// Matchday graphics (squad, full time, player of the match, fixtures, milestones). Coaches only:
// app.js loads this once a coach signs in, so parents' phones never download it.

(function(){
const $=id=>document.getElementById(id);const ROOT=document.getElementById("gfxView");
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},
             set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){return false}}};

const TEAM=window.TEAM||{},SK=TEAM.storageKey||"team",TC=TEAM.colours||{};
const PP=/girl/i.test(TEAM.players||"")?"her":/boy|lad/i.test(TEAM.players||"")?"his":"their";
document.getElementById("potmPhotoLabel").textContent=PP.charAt(0).toUpperCase()+PP.slice(1)+" photo with the award";
const POTM_UP=(((TEAM.potm&&TEAM.potm.sponsor)?TEAM.potm.sponsor+" ":"")+"player of the match").toUpperCase();
const OWN=!!TC.club&&TC.club.toUpperCase()!=="#2235E8";// another team's colours: derive the extra graphics shades from theirs
const C={blue:TC.club||"#2235E8",blueDeep:OWN?(TC.clubDeep||TC.club):"#1424B8",yellow:TC.gold||"#FFD200",ink:"#111111",white:"#FFFFFF",pink:TC.accent||"#F7A3D3",pinkDeep:TC.accentDeep||"#E5559F",teal:"#1AA8A0",faint:"#E7EAF4"};
const KITS=TEAM.kits||{home:{label:"Home",body:C.blue,trim:C.yellow,ink:C.white,band:C.yellow,bandInk:C.ink}};
Object.values(KITS).forEach(k=>{if(k.sponsor&&TEAM.kitSponsor)k.octopus=true});// "octopus" = draw the shirt sponsor
// kit buttons and sponsor-dependent upload rows come from the team settings
document.getElementById("kitSeg").innerHTML=Object.entries(KITS).map(([k,v])=>`<button id="kit-${k}" aria-pressed="false" data-kit="${k}">${v.label||k}</button>`).join("");
document.getElementById("pkitSeg").innerHTML=Object.entries(KITS).map(([k,v])=>`<button id="pk-${k}" aria-pressed="false" data-pkit="${k}">${v.label||k}</button>`).join("");
{const ks=TEAM.kitSponsor,sk=Object.values(KITS).find(k=>k.sponsor);if(!ks||!sk)document.getElementById("octopusRow").hidden=true;else document.getElementById("octopusLabel").textContent=`${ks.name} logo (shown on the ${(sk.label||"").toLowerCase()} kit; a white logo works best)`;
  const built=["the club badge",TEAM.sponsor&&TEAM.sponsor.logo&&TEAM.sponsor.name,TEAM.potm&&TEAM.potm.logo&&TEAM.potm.sponsor].filter(Boolean);
  document.getElementById("logoHint").textContent=`${built.length>1?built.slice(0,-1).join(", ")+" and "+built[built.length-1]+" logos are":"The club badge is"} built in. Upload a replacement here only if one changes; it's kept in this browser.`.replace(/^t/,"T")}

// ---------- state ----------
const DEFAULT_SQUAD=[];// the real squad arrives from the database (GFX.setSquad)
let squad=DEFAULT_SQUAD.map(([name,num])=>({name,num}));
let S=Object.assign({
  mode:"squad",opp:"",date:new Date().toISOString().slice(0,10),ko:"",venue:"",comp:"League",ha:"H",
  picked:[],kit:Object.keys(KITS)[0],
  goals:{},us:0,them:0,usManual:false,ftPotm:"",potm:"",pkit:Object.keys(KITS)[0],captain:TEAM.captain||"",sponsorName:(TEAM.sponsor&&TEAM.sponsor.name)||"",assists:{},month:"",msPlayer:"",msLabel:""
},store.get(SK+".state",{}));
const save=()=>store.set(SK+".state",S);

const IMG={octopus:null,coffeyLogo:null,crest:null,sponsor:null,coffey:null,opp:null,squadPhoto:null,ftPhoto:null,potmPhoto:null};
const logos=store.get(SK+".logos",{});
const oppCrests=store.get(SK+".oppCrests",{});

function loadImg(src){return new Promise((res)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>res(null);i.src=src})}
function shrink(img,max){const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);c.getContext("2d").drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/png")}
function readFile(file){return new Promise(res=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>res(null);r.readAsDataURL(file)})}

// ---------- canvas helpers ----------
const cv=$("cv"),X=cv.getContext("2d");
const W=1080;
function cover(img,x,y,w,h){const s=Math.max(w/img.width,h/img.height);const sw=w/s,sh=h/s;X.drawImage(img,(img.width-sw)/2,(img.height-sh)/2*0.6,sw,sh,x,y,w,h)}
function contain(img,x,y,w,h){const s=Math.min(w/img.width,h/img.height);const dw=img.width*s,dh=img.height*s;X.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function font(px,fam,weight){return `${weight||""} ${px}px ${fam}`.trim()}
const DISPLAY='"Archivo Black","Arial Black",sans-serif', SHIRT='"Oswald","Arial Narrow",sans-serif', BODY='"Archivo",Arial,sans-serif';
function fit(text,maxW,start,fam,weight){let px=start;X.font=font(px,fam,weight);while(px>10&&X.measureText(text).width>maxW){px-=2;X.font=font(px,fam,weight)}return px}
function arcText(text,cx,cy,r,mid,inside){// mid = centre angle (radians), text along arc; inside=true reads along bottom
  const chars=[...text];const widths=chars.map(c=>X.measureText(c).width);const total=widths.reduce((a,b)=>a+b,0);
  let a=mid+(inside?1:-1)*total/2/r;
  X.save();X.textAlign="center";X.textBaseline="middle";
  chars.forEach((c,i)=>{const w=widths[i];a+=(inside?-1:1)*w/2/r;X.save();X.translate(cx+r*Math.cos(a),cy+r*Math.sin(a));X.rotate(a+(inside?-Math.PI/2:Math.PI/2));X.fillText(c,0,0);X.restore();a+=(inside?-1:1)*w/2/r});
  X.restore();
}
function ordinal(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0])}
function niceDate(iso,withYear){if(!iso)return"";const d=new Date(iso+"T12:00:00");if(isNaN(d))return"";
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],m=["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${days[d.getDay()]} ${ordinal(d.getDate())} ${m[d.getMonth()]}${withYear?" "+d.getFullYear():""}`}
function koText(t){return t?`${t} KO`:""}

function footballs(seed,color){ // faint ball pattern like the Canva backgrounds
  let s=seed;const rnd=()=>(s=(s*9301+49297)%233280)/233280;
  X.save();X.strokeStyle=color;X.lineWidth=3;
  for(let i=0;i<26;i++){const x=rnd()*W,y=rnd()*W,r=22+rnd()*26;
    X.beginPath();X.arc(x,y,r,0,Math.PI*2);X.stroke();
    X.beginPath();for(let k=0;k<5;k++){const a=-Math.PI/2+k*2*Math.PI/5;const px=x+r*.38*Math.cos(a),py=y+r*.38*Math.sin(a);k?X.lineTo(px,py):X.moveTo(px,py)}X.closePath();X.stroke();
    for(let k=0;k<5;k++){const a=-Math.PI/2+k*2*Math.PI/5;X.beginPath();X.moveTo(x+r*.38*Math.cos(a),y+r*.38*Math.sin(a));X.lineTo(x+r*Math.cos(a),y+r*Math.sin(a));X.stroke()}}
  X.restore();
}

function octopusBadge(cx,cy,w){
  if(IMG.octopus&&IMG.octopus.width/IMG.octopus.height>2){contain(IMG.octopus,cx-w/2,cy-w*.16,w,w*.32);return}
  if(IMG.octopus){// mascot beside the wordmark
    const m=w*.36;X.save();X.font=font(Math.round(w*.24),BODY,800);const KW=(TEAM.kitSponsor&&TEAM.kitSponsor.word)||"";const tw=X.measureText(KW).width;const total=m*.95+w*.04+tw,x0=cx-total/2;
    contain(IMG.octopus,x0,cy-m/2,m*.95,m);X.fillStyle=C.white;X.textAlign="left";X.textBaseline="middle";
    X.fillText(KW,x0+m*.95+w*.04,cy-w*.05);X.font=font(Math.round(w*.1),BODY,600);X.fillText("energy",x0+m*.95+w*.05,cy+w*.12);X.restore();return}
  X.save();X.fillStyle=C.white;X.textAlign="center";X.textBaseline="middle";
  {const KW=(TEAM.kitSponsor&&TEAM.kitSponsor.word)||"";fit(KW,w,Math.round(w*.26),BODY,800);X.fillText(KW,cx,cy-w*.04)}
  X.font=font(Math.round(w*.11),BODY,600);X.fillText("energy",cx,cy+w*.13);X.restore();
}
function shirt(cx,top,w,kit,name,num,captain){
  const h=w*1.02,x=cx-w/2,y=top,P=(px,py)=>[x+px*w/100,y+py*h/100];
  const K=KITS[kit]||KITS[Object.keys(KITS)[0]], body=K.body, trim=K.trim;
  X.save();X.shadowColor="rgba(0,0,0,.18)";X.shadowBlur=w*.06;X.shadowOffsetY=w*.03;
  X.beginPath();
  X.moveTo(...P(36,2));X.quadraticCurveTo(...P(50,11),...P(64,2));
  X.lineTo(...P(84,7));X.lineTo(...P(100,32));X.lineTo(...P(88,42));X.lineTo(...P(80,34));
  X.lineTo(...P(81,100));X.lineTo(...P(19,100));X.lineTo(...P(20,34));X.lineTo(...P(12,42));X.lineTo(...P(0,32));X.lineTo(...P(16,7));X.closePath();
  X.fillStyle=body;X.fill();X.restore();
  // trims
  X.save();X.strokeStyle=trim;X.lineCap="round";X.lineWidth=w*.045;
  X.beginPath();X.moveTo(...P(36,2.5));X.quadraticCurveTo(...P(50,11),...P(64,2.5));X.stroke();
  X.beginPath();X.moveTo(...P(97,35));X.lineTo(...P(89,41));X.stroke();
  X.beginPath();X.moveTo(...P(3,35));X.lineTo(...P(11,41));X.stroke();
  X.restore();
  if(captain){// armband on the left sleeve
    X.save();X.fillStyle=K.band;X.beginPath();X.moveTo(...P(3.4,26.5));X.lineTo(...P(7.4,20.3));X.lineTo(...P(15.8,37.6));X.lineTo(...P(13.4,40.2));X.closePath();X.fill();
    const [bx,by]=P(10,31.2);X.translate(bx,by);X.rotate(Math.atan2(-(25*h/100),16*w/100)+Math.PI/2);
    X.fillStyle=K.bandInk;X.textAlign="center";X.textBaseline="middle";X.font=font(Math.round(w*.085),SHIRT,700);X.fillText("C",0,w*.005);X.restore();
  }
  if(K.octopus)octopusBadge(cx,y+h*.15,w*.34);
  // name on a gentle arc + number
  X.fillStyle=K.ink;
  const nm=(name||"").toUpperCase();
  let px=fit(nm,w*.62,w*.17,SHIRT,700);X.font=font(px,SHIRT,700);
  arcText(nm,cx,y+h*.36+w*2.4,w*2.4,-Math.PI/2,false);
  X.textAlign="center";X.textBaseline="alphabetic";
  const n=String(num??"");fit(n,w*.6,Math.round(w*.5),SHIRT,700);X.fillText(n,cx,y+h*.86);
}

function drawCrest(x,y,w,h){
  if(IMG.crest){const s=Math.min(w/IMG.crest.width,h/IMG.crest.height),dw=IMG.crest.width*s,dh=IMG.crest.height*s;
    X.save();X.fillStyle=C.white;X.beginPath();X.ellipse(x+w/2,y+h/2,dw/2-2,dh/2-2,0,0,Math.PI*2);X.fill();X.restore();contain(IMG.crest,x,y,w,h);return}
  const cx=x+w/2,cy=y+h/2,rx=w/2-4,ry=h/2-4;
  X.save();X.fillStyle=C.white;X.strokeStyle=C.blue;X.lineWidth=Math.max(3,w*.02);
  X.beginPath();X.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);X.fill();X.stroke();
    X.fillStyle=C.blue;X.textAlign="center";X.textBaseline="middle";
  {const T1=String(TEAM.name||"").toUpperCase(),T2=String(TEAM.fullName||"").replace(TEAM.name||"","").trim().toUpperCase();fit(T1,rx*1.5,Math.round(h*.16),DISPLAY);X.fillText(T1,cx,cy-ry*.62);
  fit(T2,rx*1.3,Math.round(h*.1),DISPLAY);X.fillText(T2,cx,cy+ry*.64)}
  X.beginPath();X.arc(cx,cy,h*.14,0,Math.PI*2);X.fill();
  X.strokeStyle=C.white;X.lineWidth=Math.max(2,h*.012);X.beginPath();X.arc(cx,cy,h*.055,0,Math.PI*2);X.stroke();
  X.restore();
}
const HAS_SP=()=>!!(IMG.sponsor||TEAM.sponsor);
function drawSponsor(cx,cy,r){
  if(!HAS_SP())return;
  if(IMG.sponsor){contain(IMG.sponsor,cx-r,cy-r,r*2,r*2);return}
  X.save();X.beginPath();X.arc(cx,cy,r,0,Math.PI*2);X.fillStyle=C.teal;X.fill();
  X.fillStyle=C.white;X.textAlign="center";X.textBaseline="middle";X.font=`700 ${Math.round(r*.9)}px Georgia,serif`;X.fillText((TEAM.sponsor&&TEAM.sponsor.mark)||"",cx,cy+r*.05);
  X.font=font(Math.round(r*.15),BODY,600);arcText((S.sponsorName||"").toUpperCase()||"SPONSOR",cx,cy,r*.8,-Math.PI/2-.35,false);
  X.restore();
}
function drawOppCrest(x,y,w,h,name){
  if(IMG.opp){contain(IMG.opp,x,y,w,h);return}
  const cx=x+w/2,cy=y+h/2,r=Math.min(w,h)/2-4;
  X.save();X.beginPath();X.arc(cx,cy,r,0,Math.PI*2);X.fillStyle=C.white;X.fill();X.lineWidth=5;X.strokeStyle=C.ink;X.stroke();
  const ini=(name||"?").split(/\s+/).filter(Boolean).map(w=>w[0]).join("").slice(0,3).toUpperCase();
  X.fillStyle=C.ink;X.textAlign="center";X.textBaseline="middle";fit(ini,r*1.4,Math.round(r*.8),DISPLAY);X.fillText(ini,cx,cy+r*.05);X.restore();
}
function drawCoffey(cx,cy,r){
  if(IMG.coffey){contain(IMG.coffey,cx-r,cy-r,r*2,r*2);return}
  X.save();
  X.beginPath();X.arc(cx,cy,r,0,Math.PI*2);X.fillStyle="#141414";X.fill();
  X.lineWidth=r*.04;X.strokeStyle=C.white;X.beginPath();X.arc(cx,cy,r*.93,0,Math.PI*2);X.stroke();
  X.fillStyle=C.white;X.font=font(Math.round(r*.15),DISPLAY);arcText(S.potmKind==="tournament"?"PLAYER OF THE TOURNAMENT":"PLAYER OF THE MATCH",cx,cy,r*.76,-Math.PI/2,false);
  X.textAlign="center";X.textBaseline="middle";
  if(IMG.coffeyLogo){X.beginPath();X.arc(cx,cy+r*.02,r*.58,0,Math.PI*2);X.fillStyle=C.white;X.fill();X.save();X.clip();contain(IMG.coffeyLogo,cx-r*.56,cy-r*.54,r*1.12,r*1.12);X.restore()}
  else{X.fillStyle=C.pink;X.font=font(Math.round(r*.2),DISPLAY);const w2=String((TEAM.potm&&TEAM.potm.sponsor)||"⭐").toUpperCase().split(/\s+/);X.fillText(w2[0],cx,cy-(w2[1]?r*.12:0));if(w2[1])X.fillText(w2.slice(1).join(" "),cx,cy+r*.12)}
  // ribbon
  const rw=r*1.7,rh=r*.26,ry=cy+r*.62;X.fillStyle=C.pink;X.strokeStyle="#141414";X.lineWidth=r*.03;
  X.beginPath();X.moveTo(cx-rw/2,ry);X.lineTo(cx+rw/2,ry);X.lineTo(cx+rw/2-rh*.4,ry+rh/2);X.lineTo(cx+rw/2,ry+rh);X.lineTo(cx-rw/2,ry+rh);X.lineTo(cx-rw/2+rh*.4,ry+rh/2);X.closePath();X.fill();X.stroke();
  X.fillStyle="#141414";X.font=font(Math.round(rh*.55),DISPLAY);X.fillText((TEAM.potm&&TEAM.potm.ribbon)||`${TEAM.abbr||""} ${TEAM.ageShort||""}`.trim(),cx,ry+rh*.54);
  X.restore();
}
const tint=a=>{const h=C.blue.replace("#","");return `rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`};// club colour, see-through
function photoSlot(img,x,y,w,h,label){
  if(img){X.save();X.beginPath();X.rect(x,y,w,h);X.clip();cover(img,x,y,w,h);X.restore();return}
  X.save();X.fillStyle=tint(.08);X.fillRect(x,y,w,h);X.setLineDash([16,12]);X.strokeStyle=tint(.45);X.lineWidth=4;X.strokeRect(x+8,y+8,w-16,h-16);
  X.fillStyle=tint(.7);X.font=font(30,BODY,800);X.textAlign="center";X.textBaseline="middle";
  label.split("\n").forEach((l,i,a)=>X.fillText(l,x+w/2,y+h/2+(i-(a.length-1)/2)*38));X.restore();
}
function playerNum(name){const p=squad.find(p=>p.name===name);return p?p.num:""}

// ---------- the three posts ----------
function drawSquad(){
  X.fillStyle=C.white;X.fillRect(0,0,W,W);footballs(7,C.faint);
  // diagonal bands
  X.fillStyle=C.blue;X.beginPath();X.moveTo(0,0);X.lineTo(250,0);X.lineTo(0,150);X.closePath();X.fill();
  X.fillStyle=C.yellow;X.beginPath();X.moveTo(0,270);X.lineTo(W,175);X.lineTo(W,200);X.lineTo(0,295);X.closePath();X.fill();
  X.fillStyle=C.blue;X.beginPath();X.moveTo(0,296);X.lineTo(W,201);X.lineTo(W,213);X.lineTo(0,308);X.closePath();X.fill();
  drawCrest(330,18,270,170);
  X.fillStyle=C.ink;X.textAlign="left";X.textBaseline="alphabetic";X.font=font(46,DISPLAY);
  [String(TEAM.ageGroup||"").toUpperCase(),"SQUAD","ANNOUNCEMENT"].forEach((t,i)=>{fit(t,440,46,DISPLAY);X.fillText(t,625,70+i*52)});
  const players=S.picked.filter(n=>squad.some(p=>p.name===n));
  const hasPhoto=!!IMG.squadPhoto;
  const gx=hasPhoto?330:40, gw=W-gx-30;
  if(hasPhoto){X.save();X.beginPath();X.rect(0,250,340,600);X.clip();contain(IMG.squadPhoto,-10,250,360,600);X.restore()}
  const n=Math.max(players.length,1),cols=n<=8?4:(n<=10?5:6),rows=Math.ceil(n/cols);
  const cellW=gw/cols, sw=Math.min(cellW*.9,rows>2?150:185), rowH=rows>2?190:255, gy=rows>2?300:325;
  players.forEach((nm,i)=>{const r=Math.floor(i/cols),c=i%cols;const inRow=Math.min(cols,n-r*cols);const off=(cols-inRow)*cellW/2;
    shirt(gx+off+cellW*c+cellW/2,gy+r*rowH,sw,S.kit,nm,playerNum(nm),nm===S.captain)});
  if(!players.length){X.fillStyle=C.blue;X.font=font(34,BODY,800);X.textAlign="center";X.fillText("Tick players to add their shirts",gx+gw/2,520)}
  // bottom band
  X.fillStyle=C.yellow;X.beginPath();X.moveTo(0,860);X.lineTo(W,800);X.lineTo(W,W);X.lineTo(0,W);X.closePath();X.fill();
  X.fillStyle=C.blue;X.beginPath();X.moveTo(0,875);X.lineTo(W,815);X.lineTo(W,W);X.lineTo(0,W);X.closePath();X.fill();
  drawOppCrest(28,895,165,165,S.opp);
  X.fillStyle=C.yellow;X.textAlign="left";X.textBaseline="alphabetic";
  const opp=("v "+(S.opp||"Opponent")).toUpperCase();fit(opp,560,48,DISPLAY);X.fillText(opp,215,940);
  X.fillStyle=C.white;X.font=font(38,DISPLAY);fit(niceDate(S.date),560,38,DISPLAY);X.fillText(niceDate(S.date),215,992);
  X.font=font(38,DISPLAY);const ln=[koText(S.ko),S.venue].filter(Boolean).join("  ·  ");fit(ln,560,38,DISPLAY);X.fillText(ln,215,1040);
  X.fillStyle=C.white;X.font=font(26,BODY,800);X.textAlign="center";if(HAS_SP())X.fillText("Proudly sponsored by",925,860);
  drawSponsor(925,965,95);
}

function drawFT(){
  X.fillStyle=C.white;X.fillRect(0,0,W,W);footballs(11,C.faint);
  // header
  X.fillStyle=C.yellow;X.fillRect(0,0,W,150);
  X.fillStyle=C.blue;X.fillRect(0,150,W,16);
  drawSponsor(110,95,80);
  X.fillStyle=C.ink;X.textAlign="left";X.textBaseline="alphabetic";X.font=font(108,DISPLAY);X.fillText("FULL TIME",230,125);
  // photo
  const px=70,py=200,pw=880,ph=470;
  X.save();X.shadowColor="rgba(0,0,0,.25)";X.shadowBlur=24;X.shadowOffsetY=8;X.fillStyle=C.white;X.fillRect(px-12,py-12,pw+24,ph+24);X.restore();
  photoSlot(IMG.ftPhoto,px,py,pw,ph,"Add a team photo");
  X.fillStyle=C.blue;X.save();X.translate(px+pw-40,py-26);X.rotate(.06);X.fillRect(0,0,130,40);X.restore();
  // vertical date
  X.save();X.translate(1030,py+ph);X.rotate(-Math.PI/2);X.fillStyle=C.ink;X.textAlign="left";X.font=font(30,DISPLAY);fit(niceDate(S.date,true),ph,30,DISPLAY);X.fillText(niceDate(S.date,true),0,0);X.restore();
  // bottom
  X.fillStyle=C.blue;X.fillRect(0,712,W,14);
  X.fillStyle=C.yellow;X.fillRect(0,726,W,W-726);
  const homeUs=S.ha==="H";
  const left={x:40,y:752,w:260,h:200}, right={x:780,y:752,w:260,h:200};
  if(homeUs){drawCrest(left.x,left.y,left.w,left.h);drawOppCrest(right.x+30,right.y,right.w-60,right.h,S.opp)}
  else{drawOppCrest(left.x+30,left.y,left.w-60,left.h,S.opp);drawCrest(right.x,right.y,right.w,right.h)}
  const us=S.us??"",them=S.them??"";const score=homeUs?`${us} - ${them}`:`${them} - ${us}`;
  X.fillStyle=C.ink;X.textAlign="center";X.font=font(132,DISPLAY);X.fillText(score,540,900);
  X.font=font(26,BODY,800);const oppLine=(homeUs?"v ":"at ")+(S.opp||"");fit(oppLine,420,26,BODY,800);X.fillText(oppLine,540,945);
  // scorers under our crest
  const sc=Object.entries(S.goals).filter(([n,g])=>g>0&&squad.some(p=>p.name===n));
  const sx=homeUs?left.x+left.w/2:right.x+right.w/2;
  const as=Object.entries(S.assists||{}).filter(([n,a])=>a>0&&squad.some(p=>p.name===n));
  const lines=sc.map(([n,g])=>({t:n.toUpperCase()+(g>1?` X${g}`:""),a:false}));
  if(as.length)lines.push({t:"ASSISTS: "+as.map(([n,a])=>n.toUpperCase()+(a>1?` X${a}`:"")).join(", "),a:true});
  const step=lines.length>4?21:28;X.textAlign="center";
  lines.slice(0,5).forEach((l,i)=>{X.fillStyle=l.a?C.blueDeep:C.ink;const sz=l.a?(lines.length>4?16:19):(lines.length>4?20:26);fit(l.t,250,sz,DISPLAY);X.fillText(l.t,sx,982+i*step)});X.fillStyle=C.ink;
  // potm pill
  if(S.ftPotm){const t=POTM_UP+": "+S.ftPotm.toUpperCase();X.font=font(22,DISPLAY);const tw=Math.min(X.measureText(t).width,440)+40;
    X.fillStyle=C.pink;X.beginPath();X.roundRect(540-tw/2,968,tw,46,23);X.fill();X.fillStyle=C.ink;fit(t,440,22,DISPLAY);X.fillText(t,540,999)}
}

function drawPotm(){
  X.fillStyle=C.pink;X.fillRect(0,0,W,W);
  X.fillStyle=C.yellow;X.beginPath();X.moveTo(0,90);X.lineTo(330,0);X.lineTo(420,0);X.lineTo(0,160);X.closePath();X.fill();
  X.fillStyle=C.pinkDeep;X.beginPath();X.moveTo(0,190);X.lineTo(500,0);X.lineTo(540,0);X.lineTo(0,220);X.closePath();X.fill();
  X.fillStyle=C.yellow;X.beginPath();X.moveTo(W,880);X.lineTo(W,960);X.lineTo(640,W);X.lineTo(560,W);X.closePath();X.fill();
  X.fillStyle=C.pinkDeep;X.beginPath();X.moveTo(W,990);X.lineTo(W,1030);X.lineTo(880,W);X.lineTo(840,W);X.closePath();X.fill();
  photoSlot(IMG.potmPhoto,0,0,560,W,`Add ${PP} photo\nwith the award`);
  drawCrest(30,24,250,150);
  drawCoffey(810,240,215);
  const nm=S.potm||"";shirt(820,500,390,S.pkit,nm,playerNum(nm),nm===S.captain);
  drawSponsor(820,960,42);
}

let MONTH_LIST=[];
function drawMonth(){
  X.fillStyle=C.blue;X.fillRect(0,0,W,W);footballs(9,"rgba(255,255,255,.06)");
  X.fillStyle=C.yellow;X.beginPath();X.moveTo(0,0);X.lineTo(W,0);X.lineTo(W,170);X.lineTo(0,230);X.closePath();X.fill();
  drawCrest(26,20,250,160);
  const mn=S.month?new Date(S.month+"-01T12:00:00").toLocaleDateString("en-GB",{month:"long"}).toUpperCase():"";
  X.fillStyle=C.ink;X.textAlign="left";X.textBaseline="alphabetic";fit(mn+" FIXTURES",760,84,DISPLAY);X.fillText(mn+" FIXTURES",300,110);
  X.font=font(32,DISPLAY);{const AG=`${TEAM.ageGroup||""} ${TEAM.players||""}`.toUpperCase().trim();fit(AG,700,32,DISPLAY);X.fillText(AG,304,156)}
  const L=MONTH_LIST.slice(0,7);const rowH=Math.min(118,640/Math.max(L.length,1));const top=270+Math.max(0,(660-rowH*L.length)/2);
  if(!L.length){X.fillStyle=C.white;X.textAlign="center";X.font=font(44,DISPLAY);X.fillText("NO FIXTURES THIS MONTH",540,520)}
  L.forEach((m,i)=>{const y=top+i*rowH,h=rowH-14;const d=new Date(m.date+"T12:00:00");
    X.fillStyle=C.white;X.beginPath();X.roundRect(50,y,980,h,18);X.fill();
    X.fillStyle=C.yellow;X.beginPath();X.roundRect(50,y,150,h,[18,0,0,18]);X.fill();
    X.fillStyle=C.ink;X.textAlign="center";X.font=font(Math.round(h*.42),DISPLAY);X.fillText(String(d.getDate()),125,y+h*.55);
    X.font=font(Math.round(h*.2),DISPLAY);X.fillText(d.toLocaleDateString("en-GB",{weekday:"short"}).toUpperCase(),125,y+h*.85);
    X.textAlign="left";const opp=(m.ha==="A"?"AT ":"V ")+(m.opp||"").toUpperCase();fit(opp,600,Math.round(h*.36),DISPLAY);X.fillText(opp,225,y+h*.46);
    X.fillStyle="#555";const sub=[m.ko?m.ko+" KO":"KO TBC",m.venue,m.comp==="League"?(TEAM.league||"League"):m.comp].filter(Boolean).join("  ·  ").toUpperCase();fit(sub,600,Math.round(h*.22),BODY,800);X.fillText(sub,225,y+h*.8);
    const pill=m.res?`${m.res} ${m.us}-${m.them}`:(m.ha==="A"?"AWAY":"HOME");const pc=m.res?({W:"#1E8E3E",D:"#888",L:"#C62828"})[m.res]:(m.ha==="A"?C.blue:C.yellow);
    X.fillStyle=pc;X.beginPath();X.roundRect(870,y+h/2-26,140,52,26);X.fill();X.fillStyle=(!m.res&&m.ha!=="A")?C.ink:C.white;X.textAlign="center";X.font=font(28,DISPLAY);X.fillText(pill,940,y+h/2+10)});
  X.fillStyle=C.yellow;X.fillRect(0,950,W,130);X.fillStyle=C.ink;X.textAlign="left";X.font=font(28,BODY,800);if(HAS_SP())X.fillText("Proudly sponsored by",60,1025);
  drawSponsor(960,1015,60);
}
function drawMilestone(){
  X.fillStyle=C.yellow;X.fillRect(0,0,W,W);footballs(10,"rgba(0,0,0,.05)");
  X.fillStyle=C.blue;X.beginPath();X.moveTo(0,0);X.lineTo(W,0);X.lineTo(W,120);X.lineTo(0,220);X.closePath();X.fill();
  drawCrest(30,18,240,150);
  X.fillStyle=C.white;X.textAlign="left";X.textBaseline="alphabetic";fit("CONGRATULATIONS",740,92,DISPLAY);X.fillText("CONGRATULATIONS",300,120);
  const nm=S.msPlayer||"";shirt(300,300,380,S.pkit||"yellow",nm,playerNum(nm),false);
  X.fillStyle=C.ink;X.textAlign="center";const lab=(S.msLabel||"").toUpperCase();
  fit(nm.toUpperCase(),440,96,DISPLAY);X.fillText(nm.toUpperCase(),790,420);
  X.fillStyle=C.blue;X.beginPath();X.roundRect(570,470,440,130,65);X.fill();X.fillStyle=C.white;fit(lab||"MILESTONE",380,64,DISPLAY);X.fillText(lab||"MILESTONE",790,560);
  X.fillStyle=C.ink;X.font=font(30,BODY,800);X.fillText("WHAT A STAR!",790,680);
  X.fillStyle=C.blue;X.fillRect(0,900,W,180);X.fillStyle=C.white;X.textAlign="left";X.font=font(28,BODY,800);if(HAS_SP())X.fillText("Proudly sponsored by",60,1000);drawSponsor(960,990,62);
}
function render(){
  X.save();X.clearRect(0,0,W,W);
  if(S.mode==="ft")drawFT();else if(S.mode==="potm")drawPotm();else if(S.mode==="month")drawMonth();else if(S.mode==="ms")drawMilestone();else drawSquad();
  X.restore();caption();
}

// ---------- captions ----------
function caption(){
  const sp=S.sponsorName?` Thanks as always to our sponsor ${S.sponsorName}.`:"";
  const d=niceDate(S.date), opp=S.opp||"our opponents";let t="";
  if(S.mode==="squad"||S.mode==="setup"){
    const names=S.picked.filter(n=>squad.some(p=>p.name===n));
    t=`⚽ ${String(TEAM.ageGroup||"").toUpperCase().replace(/S$/,"s")} SQUAD ANNOUNCEMENT ⚽\n\nHere's our squad for ${d||"this weekend"}${S.ha==="A"?" away at":" at home to"} ${opp}${S.ko?`, ${S.ko} kick-off`:""}${S.venue?` at ${S.venue}`:""}.\n\n${names.map(n=>`${n} (${playerNum(n)})${n===S.captain?" ©":""}`).join("\n")}${(h=>h&&h.length?`\n\nLast time we played them: ${h[0].us>h[0].them?"won":h[0].us==h[0].them?"drew":"lost"} ${h[0].us}-${h[0].them}.`:"")(window.H2H&&window.H2H(S.opp))}\n\nCome on ${TEAM.players||"team"}! ${TEAM.cheer||""}${sp}\n\n${TEAM.hashtags||""}`;
  } else if(S.mode==="ft"){
    const us=S.us??"?",them=S.them??"?";const res=+us>+them?"WIN":(+us===+them?"DRAW":"DEFEAT");
    const sc=Object.entries(S.goals).filter(([n,g])=>g>0).map(([n,g])=>`⚽ ${n}${g>1?` x${g}`:""}`).join("\n");
    const opener=res==="WIN"?"What a performance! 🎉":(res==="DRAW"?"Honours even today.":"Not our day, but so proud of the effort. 💪");
    const asl=Object.entries(S.assists||{}).filter(([n,a])=>a>0).map(([n,a])=>`🅰️ ${n}${a>1?` x${a}`:""}`).join("\n");
    t=`FULL TIME: ${TEAM.name} ${us} - ${them} ${opp}\n\n${opener}\n\n${sc?`Our scorers:\n${sc}\n\n`:""}${asl?`Assists:\n${asl}\n\n`:""}${S.ftPotm?`${(TEAM.potm&&TEAM.potm.icon)||"⭐"} ${(TEAM.potm&&TEAM.potm.sponsor?TEAM.potm.sponsor+" ":"")}Player of the Match: ${S.ftPotm}\n\n`:""}${sp.trim()}\n\n${TEAM.hashtags||""}`;
  } else if(S.mode==="month"){
    const mn=S.month?new Date(S.month+"-01T12:00:00").toLocaleDateString("en-GB",{month:"long"}):"";
    t=`📅 ${mn.toUpperCase()} FIXTURES 📅\n\n${MONTH_LIST.map(m=>`${new Date(m.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${m.ha==="A"?"away at":"v"} ${m.opp}${m.ko?`, ${m.ko} KO`:""}${m.venue?` (${m.venue})`:""}`).join("\n")||"No fixtures this month."}\n\nCome and support the ${TEAM.players||"team"}! ${TEAM.cheer||""}${sp}\n\n${TEAM.shortHashtags||""}`;
  } else if(S.mode==="ms"){
    t=`🎉 MILESTONE 🎉\n\nHuge congratulations to ${S.msPlayer||"…"}: ${S.msLabel||""}! ⭐\n\nWe're so proud of you.${sp}\n\n${TEAM.shortHashtags||""}`;
  } else if(S.mode==="potm"){
    t=S.potmKind==="tournament"?`⭐ PLAYER OF THE TOURNAMENT ⭐\n\nCongratulations to ${S.potm||"…"}, our player of the tournament${S.tname?` at the ${S.tname}`:""}! 🌟`:`${(TEAM.potm&&TEAM.potm.icon)||"⭐"} ${POTM_UP} ${(TEAM.potm&&TEAM.potm.icon)||"⭐"}\n\nCongratulations to ${S.potm||"…"}, our player of the match${S.opp?` against ${S.opp}`:""}! 🌟${TEAM.potm&&TEAM.potm.sponsor?`\n\nThanks to ${TEAM.potm.sponsor} for supporting the ${TEAM.ageGroup||"team"}.`:""}${sp}\n\n${TEAM.hashtags||""}`;
  }
  $("caption").value=t;
}

// ---------- UI wiring ----------
function playerOptions(sel,val,allowNone){sel.innerHTML=(allowNone?'<option value="">(none yet)</option>':"")+squad.map(p=>`<option>${esc(p.name)}</option>`).join("");sel.value=val||(allowNone?"":squad[0]?.name||"")}
function esc(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]))}
function buildPickers(){
  $("squadPick").innerHTML=squad.map((p,i)=>`<label class="pl${S.picked.includes(p.name)?" on":""}" for="pk${i}"><input type="checkbox" id="pk${i}" data-n="${esc(p.name)}"${S.picked.includes(p.name)?" checked":""}><b>${esc(p.num)}</b><span>${esc(p.name)}</span></label>`).join("");
  $("squadCount").textContent=`${S.picked.filter(n=>squad.some(p=>p.name===n)).length} picked. Shirts appear in squad-list order.`;
  $("goalPick").innerHTML=squad.map((p,i)=>{const g=S.goals[p.name]||0;return `<div class="gl${g?" on":""}"><span class="n">${esc(p.name)}</span><button aria-label="One less goal for ${esc(p.name)}" data-g="-1" data-n="${esc(p.name)}">−</button><output>${g}</output><button aria-label="One more goal for ${esc(p.name)}" data-g="1" data-n="${esc(p.name)}">+</button></div>`}).join("");
  $("astPick").innerHTML=squad.map(p=>{const a=(S.assists||{})[p.name]||0;return `<div class="gl${a?" on":""}"><span class="n">${esc(p.name)}</span><button aria-label="One less assist for ${esc(p.name)}" data-ga="-1" data-n="${esc(p.name)}">−</button><output>${a}</output><button aria-label="One more assist for ${esc(p.name)}" data-ga="1" data-n="${esc(p.name)}">+</button></div>`}).join("");
  playerOptions($("msPlayer"),S.msPlayer,false);$("msLabel").value=S.msLabel||"";$("gMonth").value=S.month||"";
  playerOptions($("ftPotm"),S.ftPotm,true);playerOptions($("potmPlayer"),S.potm,false);
  const picked=S.picked.filter(n=>squad.some(p=>p.name===n));
  $("captain").innerHTML='<option value="">No captain</option>'+picked.map(n=>`<option>${esc(n)}</option>`).join("");$("captain").value=picked.includes(S.captain)?S.captain:"";
  if($("squadEdit"))$("squadEdit").innerHTML=squad.map((p,i)=>`<div class="sq-row"><input type="text" id="sqn${i}" aria-label="Player name" value="${esc(p.name)}" data-i="${i}" data-k="name"><input type="number" id="sqk${i}" aria-label="Shirt number" value="${esc(p.num)}" data-i="${i}" data-k="num"><button class="x" aria-label="Remove ${esc(p.name)}" data-rm="${i}">×</button></div>`).join("");
}
function syncInputs(){
  ["opp","date","ko","venue","comp"].forEach(k=>$(k).value=S[k]||"");
  $("usScore").value=S.us??"";$("themScore").value=S.them??"";$("sponsorName").value=S.sponsorName||"";
  ROOT.querySelectorAll("[data-gha]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.gha===S.ha));
  document.querySelectorAll("[data-kit]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.kit===S.kit));
  document.querySelectorAll("[data-pkit]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.pkit===S.pkit));
}
function setMode(m){S.mode=m;ROOT.querySelectorAll(".gtabs button").forEach(b=>b.setAttribute("aria-selected",b.dataset.mode===m));
  ROOT.querySelectorAll("[data-for]").forEach(p=>p.hidden=p.dataset.for!==m);
  $("matchPanel").hidden=(m==="month"||m==="ms");if(m==="month"){if(!S.month)S.month=new Date().toISOString().slice(0,7);MONTH_LIST=window.monthFixtures?window.monthFixtures(S.month):[];if($("gMonth"))$("gMonth").value=S.month}save();render()}
function thumbs(){[["crestThumb","crest"],["sponsorThumb","sponsor"],["coffeyThumb","coffey"],["oppCrestThumb","opp"],["squadPhotoThumb","squadPhoto"],["ftPhotoThumb","ftPhoto"],["potmPhotoThumb","potmPhoto"],["octopusThumb","octopus"]]
  .forEach(([id,k])=>{$(id).style.backgroundImage=IMG[k]?`url("${IMG[k].src}")`:"none"})}
async function setOppCrestFor(name){const src=(window.oppBadge&&window.oppBadge(name))||oppCrests[(name||"").trim().toLowerCase()];IMG.opp=src?await loadImg(src):null;thumbs();render()}

ROOT.querySelector(".gtabs").addEventListener("click",e=>{const b=e.target.closest("button[data-mode]");if(b)setMode(b.dataset.mode)});
["opp","date","ko","venue","comp"].forEach(k=>$(k).addEventListener("input",()=>{S[k]=$(k).value;save();if(k==="opp")setOppCrestFor(S.opp);else render()}));
ROOT.addEventListener("click",e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.dataset.gha){S.ha=b.dataset.gha;syncInputs();save();render()}
  if(b.dataset.kit){S.kit=b.dataset.kit;syncInputs();save();render()}
  if(b.dataset.pkit){S.pkit=b.dataset.pkit;syncInputs();save();render()}
  if(b.dataset.g){const n=b.dataset.n;S.goals[n]=Math.max(0,(S.goals[n]||0)+ +b.dataset.g);if(!S.goals[n])delete S.goals[n];
    if(!S.usManual)S.us=Object.values(S.goals).reduce((a,c)=>a+c,0);buildPickers();syncInputs();save();render()}
  if(b.dataset.ga){const n=b.dataset.n;S.assists=S.assists||{};S.assists[n]=Math.max(0,(S.assists[n]||0)+ +b.dataset.ga);if(!S.assists[n])delete S.assists[n];buildPickers();save();render()}
  if(b.dataset.rm){squad.splice(+b.dataset.rm,1);store.set(SK+".squad",squad);buildPickers();render()}
});
$("squadPick").addEventListener("change",e=>{const n=e.target.dataset.n;if(!n)return;
  if(e.target.checked){if(!S.picked.includes(n))S.picked.push(n)}else S.picked=S.picked.filter(x=>x!==n);
  S.picked.sort((a,b)=>squad.findIndex(p=>p.name===a)-squad.findIndex(p=>p.name===b));buildPickers();save();render()});
$("usScore").addEventListener("input",()=>{S.us=$("usScore").value===""?null:+$("usScore").value;S.usManual=$("usScore").value!=="";save();render()});
$("themScore").addEventListener("input",()=>{S.them=$("themScore").value===""?null:+$("themScore").value;save();render()});
$("ftPotm").addEventListener("change",()=>{S.ftPotm=$("ftPotm").value;save();render()});
$("captain").addEventListener("change",()=>{S.captain=$("captain").value;save();render()});
ROOT.querySelector(".gtabs").addEventListener("click",e=>{const b=e.target.closest("button[data-mode]");if(b&&b.dataset.mode!=="potm")S.potmKind="match"});
$("potmPlayer").addEventListener("change",()=>{S.potm=$("potmPlayer").value;save();render()});
$("msPlayer").addEventListener("change",()=>{S.msPlayer=$("msPlayer").value;save();render()});
$("msLabel").addEventListener("input",()=>{S.msLabel=$("msLabel").value;save();render()});
$("gMonth").addEventListener("change",()=>{S.month=$("gMonth").value;MONTH_LIST=window.monthFixtures?window.monthFixtures(S.month):[];save();render()});
$("sponsorName").addEventListener("input",()=>{S.sponsorName=$("sponsorName").value;save();render()});

function onUpload(id,key,persist){$(id).addEventListener("change",async e=>{const f=e.target.files[0];if(!f)return;const raw=await readFile(f);let img=await loadImg(raw);if(!img)return;
  if(persist){const small=shrink(img,700);img=await loadImg(small);
    if(persist==="logo"){logos[key]=small;if(!store.set(SK+".logos",logos))toast("Couldn't remember that logo in this browser, it'll work until you close the page.")}
    if(persist==="opp"&&S.opp){oppCrests[S.opp.trim().toLowerCase()]=small;store.set(SK+".oppCrests",oppCrests);window.saveBadgeFile&&window.saveBadgeFile(S.opp,f)}}
  else{img=await loadImg(shrink(img,1600))}
  IMG[key]=img;thumbs();render()})}
onUpload("crestUp","crest","logo");onUpload("sponsorUp","sponsor","logo");onUpload("coffeyUp","coffey","logo");onUpload("octopusUp","octopus","logo");onUpload("oppCrest","opp","opp");
onUpload("squadPhoto","squadPhoto");onUpload("ftPhoto","ftPhoto");onUpload("potmPhoto","potmPhoto");
$("clearLogos").addEventListener("click",async()=>{const BUILTIN={crest:TEAM.crest||"crest.png",sponsor:TEAM.sponsor&&TEAM.sponsor.logo,octopus:TEAM.kitSponsor&&TEAM.kitSponsor.logo};for(const k of["crest","sponsor","coffey","octopus"]){delete logos[k];IMG[k]=BUILTIN[k]?await loadImg(BUILTIN[k]):null}store.set(SK+".logos",logos);thumbs();render();toast("Back to the club's standard logos.")});

function toast(t){$("gtoast").textContent=t;clearTimeout(toast.t);toast.t=setTimeout(()=>$("gtoast").textContent="",5000)}
function fileName(){const opp=(S.mode==="month"?S.month:S.mode==="ms"?S.msPlayer:(S.opp||"match")||"post").replace(/[^a-z0-9]+/gi,"-").replace(/^-|-$/g,"");const kind={squad:"Squad",ft:"FullTime",potm:"PotM",month:"Fixtures",ms:"Milestone"}[S.mode]||"Post";return `${S.date||"date"}_${TEAM.ageShort||"team"}_${kind}_${opp}.png`}
let downloads=null;
// which sponsors this post shows, for the sponsor report
const LOGGED=new Set();// one log per post, however often it's saved or its caption copied
function logThis(){const k=fileName();if(LOGGED.has(k))return;LOGGED.add(k);window.logPost&&window.logPost(S.mode,postSponsors())}
function postSponsors(){const k=KITS[S.pkit]||{};return [HAS_SP()?(S.sponsorName||(TEAM.sponsor&&TEAM.sponsor.name)):"",S.mode==="potm"&&TEAM.potm&&TEAM.potm.sponsor,S.mode==="squad"&&k.octopus&&TEAM.kitSponsor&&TEAM.kitSponsor.name]}
$("saveBtn").addEventListener("click",async()=>{
  if(S.mode==="setup"){setMode("squad")}
  logThis();
  const blob=await new Promise(r=>cv.toBlob(r,"image/png"));
  if(downloads){try{await downloads.save({filename:fileName(),data:blob});toast("Saved.");return}catch(e){if(e&&e.code==="declined"){toast("Not saved.");return}}}
  try{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=fileName();document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);toast("Image downloaded.");return}catch(e){}
  showImageFallback();
});
function showImageFallback(){const url=cv.toDataURL("image/png");let im=$("fallbackImg");if(!im){im=document.createElement("img");im.id="fallbackImg";im.alt="Post image";cv.after(im)}im.src=url;cv.hidden=true;im.hidden=false;
  toast("Press and hold (or right-click) the image and choose Save image.");setTimeout(()=>{cv.hidden=false;im.hidden=true},20000)}
$("copyCap").addEventListener("click",()=>{const ta=$("caption");const done=()=>toast("Caption copied.");logThis();
  try{navigator.clipboard.writeText(ta.value).then(done,()=>{ta.select();toast("Selected, now copy it.")})}catch(e){ta.select();toast("Selected, now copy it.")}});

// ---------- portal hooks ----------
window.GFX={
  setSquad(list){squad=list.map(p=>({name:p.name,num:p.num??""}));buildPickers();render()},
  async loadMatch(m,mode){
    Object.assign(S,{opp:m.opp||"",date:m.date||"",ko:m.ko||"",venue:m.venue||"",comp:m.comp||"League",ha:m.ha==="A"?"A":"H",
      picked:Object.keys(m.played||{}).length?Object.keys(m.played):(m.squad||[]).slice(),goals:Object.fromEntries(Object.entries(m.played||{}).filter(([,g])=>g>0)),
      us:m.us??null,them:m.them??null,usManual:m.us!=null,ftPotm:m.potm||"",assists:Object.assign({},m.assists||{})});
    if(m.potm)S.potm=m.potm;S.potmKind="match";
    S.picked.sort((a,b)=>squad.findIndex(p=>p.name===a)-squad.findIndex(p=>p.name===b));
    buildPickers();syncInputs();save();await setOppCrestFor(S.opp);setMode(mode||"squad")},
  async loadTournament(t){Object.assign(S,{potm:t.potm,potmKind:"tournament",tname:t.name,date:t.date||S.date,venue:t.venue||"",opp:""});buildPickers();syncInputs();save();setMode("potm")},
  loadMilestone(n,label){Object.assign(S,{msPlayer:n,msLabel:label});buildPickers();save();setMode("ms")},
  loadMonth(ym){S.month=ym;MONTH_LIST=window.monthFixtures?window.monthFixtures(ym):[];buildPickers();save();setMode("month")},
  refresh(){if(S.mode==="month")MONTH_LIST=window.monthFixtures?window.monthFixtures(S.month):[];render()}
};
// ---------- boot ----------
(async function(){
  const BUILTIN={crest:TEAM.crest||"crest.png",sponsor:TEAM.sponsor&&TEAM.sponsor.logo,octopus:TEAM.kitSponsor&&TEAM.kitSponsor.logo};
  for(const k of["crest","sponsor","coffey","octopus"])IMG[k]=logos[k]?await loadImg(logos[k]):(BUILTIN[k]?await loadImg(BUILTIN[k]):null);
  IMG.coffeyLogo=TEAM.potm&&TEAM.potm.logo?await loadImg(TEAM.potm.logo):null;
  if(S.opp){const src=oppCrests[S.opp.trim().toLowerCase()];if(src)IMG.opp=await loadImg(src)}
  buildPickers();syncInputs();setMode(S.mode==="setup"?"squad":S.mode);thumbs();
  try{await Promise.all([document.fonts.load('40px "Archivo Black"'),document.fonts.load('40px "Luckiest Guy"'),document.fonts.load('700 40px "Oswald"'),document.fonts.load('800 20px "Archivo"')])}catch(e){}
  render();
  
  $("saveBtn").textContent="Download image";
})();
})();

