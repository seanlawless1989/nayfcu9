// Team site: everything parents and coaches use. Loaded by index.html after the page markup.
// Team-specific settings come from team.js and the Team setup page, never from this file.
(function(){
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let db=null, canWrite=false;
// team settings (docs/team.js)
const TEAM=window.TEAM||{},SK=TEAM.storageKey||"team",PL=TEAM.players||"players";
// pronouns for a player: "Can she make it?", "Can he make it?", or they for mixed teams
const PRN=/girl/i.test(PL)?{s:"she",p:"her",o:"her",sh:"she's",kid:"daughter"}:/boy|lad/i.test(PL)?{s:"he",p:"his",o:"him",sh:"he's",kid:"son"}:{s:"they",p:"their",o:"them",sh:"they've",kid:"child"};
// Sports (TEAM.sport): what changes between football and rugby. A site with no sport set is football, so existing sites don't change.
// Rugby keeps each player's tries where football keeps goals (matches.played), each player's kicks in matches.kicks
// ({"Mia":{"con":2,"pen":1}}, supabase/11_rugby.sql), and the score in points. Live events: {k:"goal"|"them", t:"try"|"con"|"pen"|"drop"|"pt", p:points}.
const SPORTS={
  football:{key:"football",ball:"⚽",goal:"goal",goals:"goals",Goals:"Goals",keeper:true,assists:true,pts:{}},
  "rugby-union":{key:"rugby-union",name:"rugby union",rugby:true,ball:"🏉",goal:"try",goals:"tries",Goals:"Tries",keeper:false,assists:false,
    pts:{try:5,con:2,pen:3,drop:3,pt:7},sinBin:10,formats:["15s","13s","12s","10s","9s","8s","7s","6s","5s","4s"],
    // England Rugby age grade rules: tries only to Under 10s, conversions from Under 11s, penalty and drop goals from Under 13s
    kinds:n=>n&&n<=10?[]:n&&n<=12?["con"]:["con","pen","drop"]},
  "rugby-league":{key:"rugby-league",name:"rugby league",rugby:true,league:true,ball:"🏉",goal:"try",goals:"tries",Goals:"Tries",keeper:false,assists:false,
    // a penalty try in league is 4 points and the conversion is taken in front of the posts
    pts:{try:4,con:2,pen:2,drop:1,pt:4},ptConv:true,sinBin:10,formats:["13s","11s","9s","7s","6s"],
    kinds:n=>n&&n<=9?[]:n&&n<=11?["con"]:["con","pen","drop"]}};
const SP=SPORTS[TEAM.sport]||SPORTS.football,RUGBY=!!SP.rugby;window.SPORT=SP;
const AGE_N=+((String(TEAM.ageGroup||"").match(/\d+/)||[])[0]||0);
// the kicks a team's age group plays with (TEAM.kicks overrides): "con", "pen", "drop"
const KINDS=RUGBY?(Array.isArray(TEAM.kicks)?TEAM.kicks:SP.kinds(AGE_N)):[];
const KICK={con:["Conversion","con","cons"],pen:["Penalty goal","pen","pens"],drop:["Drop goal","drop goal","drop goals"]};
const WELFARE=RUGBY?"safeguarding officer":"welfare officer";
function kicksOf(m){return m.kicks||{}}
// a player's points in one game: tries plus kicks
function ptsIn(m,n){const k=kicksOf(m)[n]||{};return (+played(m)[n]||0)*(SP.pts.try||0)+["con","pen","drop"].reduce((a,t)=>a+(+k[t]||0)*(SP.pts[t]||0),0)}
// "2 cons, 1 pen"
function kickText(k){return ["con","pen","drop"].filter(t=>+k[t]>0).map(t=>`${k[t]} ${+k[t]>1?KICK[t][2]:KICK[t][1]}`).join(", ")}
function kicksLine(m){return Object.entries(kicksOf(m)).filter(([,k])=>kickText(k)).map(([n,k])=>`${n} (${kickText(k)})`).join(", ")}
// FA rules stop U7-U11 scores, results and scorers being published; a club can switch public scores off (TEAM.publicScores=false).
// Visitors then get each game without its score or goals; coaches who sign in still see everything.
const noScores=()=>TEAM.publicScores===false&&!canWrite;
function maskScore(m){if(!m)return m;const o=Object.assign({},m,{us:null,them:null,assists:{},hidden:result(m)!=null||!!(m.live&&["live","ht","ft"].includes(m.live.status))});// hidden = played or under way, score kept back
  if(m.played)o.played=Object.fromEntries(Object.keys(m.played).map(n=>[n,0]));
  if(m.keepers)o.keepers=Object.fromEntries(Object.keys(m.keepers).map(n=>[n,0]));
  if(m.kicks)o.kicks={};
  if(m.live)o.live=Object.assign({},m.live,{events:(m.live.events||[]).filter(e=>e.k!=="goal"&&e.k!=="them").map(e=>{const x=Object.assign({},e);delete x.s;return x})});
  return o}
let RAW=[];const pubMatches=()=>noScores()?RAW.map(maskScore):RAW.slice();
const POTM=((TEAM.potm&&TEAM.potm.sponsor)?TEAM.potm.sponsor+" ":"")+"player of the match",POTM_IC=(TEAM.potm&&TEAM.potm.icon)||"⭐";
const SITE=(TEAM.siteUrl||location.origin).replace(/\/$/,""),APP=TEAM.appName||document.title,CREST=TEAM.crest||"crest.png";
const fileTag=APP.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
(function applyTeam(){const t=TEAM;if(!t.name)return;document.title=`${t.name} ${t.ageGroup||""}`.trim();
  const age=String(t.ageGroup||""),h=document.getElementById("teamTitle");if(h)h.innerHTML=`${esc(t.name)} <em>${esc(age).replace(/(\d)s\b/,'$1<span class="lc">s</span>')}</em>`;
  const tl=document.getElementById("teamTagline");if(tl)tl.textContent=t.tagline||"";
  // a club with several teams: TEAM.club = {name, url} links back to the club page (tools/package_club.py)
  if(tl&&t.club&&/^https?:\/\//.test(t.club.url||"")){const a=document.createElement("a");a.className="clublink";a.href=t.club.url;a.textContent=`All ${t.club.name||"club"} teams →`;tl.after(a)}
  // teams in the same age group that follow each other: TEAM.sisterTeams = [{name, url}] adds a link to each one's site
  const sis=(t.sisterTeams||[]).filter(x=>x&&x.name&&/^https?:\/\//.test(x.url||""));
  if(tl&&sis.length){const d=document.createElement("div");d.className="sisters";d.innerHTML=sis.map(x=>`<a class="clublink" href="${esc(x.url)}">${esc(x.name)} →</a>`).join("");tl.after(d)}
  document.querySelectorAll("[data-potm]").forEach(el=>el.textContent=POTM.charAt(0).toUpperCase()+POTM.slice(1));
  const c=t.colours||{},css={club:"--club",clubDeep:"--clubDeep",clubInk:"--clubInk",gold:"--gold",goldInk:"--goldInk"};Object.entries(css).forEach(([k,v])=>c[k]&&document.documentElement.style.setProperty(v,c[k]));
  const rgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||"");return m?[0,2,4].map(i=>parseInt(m[1].substr(i,2),16)):null},set=(k,v)=>document.documentElement.style.setProperty(k,v);
  const mix=(a,b,k)=>"#"+a.map((v,i)=>Math.round(v*(1-k)+b[i]*k).toString(16).padStart(2,"0")).join("");
  const cl=rgb(c.club),gd=rgb(c.gold);if(gd)set("--goldRGB",gd.join(" "));
  // the masthead and hero use lighter and darker shades of the club colour; Newton Aycliffe's are tuned by hand in the CSS
  if(cl&&c.club.toUpperCase()!=="#2235E8"){const W=[255,255,255],K=[0,0,0];set("--clubRGB",cl.join(" "));set("--clubHi",mix(cl,W,.15));set("--clubMid",mix(cl,K,.12));set("--clubSoft",mix(cl,W,.3));set("--clubDark",mix(cl,K,.45));set("--clubDarker",mix(cl,K,.6));set("--shadowRGB",cl.map(v=>Math.round(v*.45)).join(" "))}
  document.querySelectorAll('img.crest,link[rel=icon]').forEach(el=>el.tagName==="LINK"?el.href=CREST:el.src=CREST)})();
// Footer: a Privacy link (always) and a small "Powered by Touchline Tales" credit (unless team.js sets poweredBy: false).
// The ref names the team (TEAM.slug, or the same slug tools/package_team.py uses) so sign-ups can be traced back.
(function poweredBy(){const f=document.getElementById("siteFoot");if(!f)return;
  const slug=String(TEAM.slug||`${TEAM.name||""} ${TEAM.ageShort||""}`).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"team";
  const priv=`<button type="button" data-view="privacy" style="background:none;border:0;padding:0;font:inherit;color:var(--muted);opacity:.85;cursor:pointer">Privacy</button>`;
  f.innerHTML=TEAM.poweredBy===false?priv:`${priv} · <a href="https://touchlinetales.club/?ref=powered-${slug}" target="_blank" rel="noopener">Powered by Touchline Tales</a>`;f.hidden=false})();
let tournaments=[], honours=[], T=null, H=null;
let matches=[], players=[], view="home", season=null, editing=null, playerView=null, oppView=null;
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const LONGM=["January","February","March","April","May","June","July","August","September","October","November","December"];

function seasonOf(iso){if(!iso)return"";const y=+iso.slice(0,4),m=+iso.slice(5,7);const s=m>=7?y:y-1;return `${s}-${String((s+1)%100).padStart(2,"0")}`}
function todaySeason(){const d=new Date();return seasonOf(d.toISOString().slice(0,10))}
function result(m){if(m.us==null||m.them==null||m.us===""||m.them==="")return null;return m.us>m.them?"W":m.us===m.them?"D":"L"}
function played(m){return m.played||{}}
// opponents: names vary between sheets ("CLS", "FC", "Juniors"...), so compare on a cleaned-up key
function oppKey(n){return String(n||"").toLowerCase().replace(/\bcls\b/g,"chester le street").replace(/[^a-z0-9 ]+/g," ")
  .replace(/\b(a?fc|jfc|youth|juniors?|girls|the|c ?a|football club|club)\b/g," ").replace(/\s+/g," ").trim()}
// opposition badges: public.badges {key: oppKey(name), name, img: small PNG data URL}; coaches upload, everyone sees
// built-in club logos (docs/badges/); a coach upload for the same key replaces one
const BADGE_FILES={"beamish lionesses":"beamish-lionesses","brandon community":"brandon-community","chester le street town":"chester-le-street-town",
  "felling magpies":"felling-magpies","chester le street hilda park":"chester-le-street-hilda-park","chester le street amazons":"chester-le-street-amazons",
  "belmont united bluebirds":"belmont-united","birtley town":"birtley-town","bishop auckland":"bishop-auckland","clegwell buzzards":"clegwell",
  "darlington locomotive arrows":"darlington-locomotive","darlington locomotive rockets":"darlington-locomotive","durham united leopards":"durham-united",
  "east end":"newcastle-east-end","hartlepool divas":"fc-hartlepool","gateshead cleveland hall":"gateshead-cleveland-hall",
  "gateshead leam rangers":"leam-rangers","gateshead leam rangers boys":"leam-rangers","guisborough town":"guisborough-town",
  "heaton stannington":"heaton-stannington","hebburn":"hebburn","horden cw":"horden-cw","middleton rangers":"middleton-rangers",
  "newcastle city":"newcastle-city-juniors","north east sports sapphires":"north-east-sport-youth","rutherford":"rutherford-afc",
  "seaham reds":"seaham-afc","washington wildcats":"washington-afc","washington association":"washington-afc","washington":"washington-juniors",
  "washington united":"washington-united","wearside pinks":"wearside-fc","whickham phoenix":"whickham-fc","whitley bay sporting":"whitley-bay-sporting"};
const badgeDefaults=()=>Object.fromEntries(Object.entries(BADGE_FILES).map(([k,f])=>[k,`badges/${f}.png`]));
let BADGES=badgeDefaults();
async function loadBadges(){try{const {data}=await sb.from("badges").select("*");BADGES=badgeDefaults();(data||[]).forEach(r=>BADGES[r.key]=r.img)}catch(e){}}
function oppIni(n){return (n||"?").split(/\s+/).filter(w=>w&&!/^(fc|afc|the)$/i.test(w)).map(w=>w[0]).join("").slice(0,3).toUpperCase()}
function badge(n,cls){const b=BADGES[oppKey(n)];return b?`<img class="badge ${cls||""}" src="${b}" alt="">`:`<span class="badge ini ${cls||""}">${esc(oppIni(n))}</span>`}
window.oppBadge=n=>BADGES[oppKey(n)]||null;window.saveBadgeFile=(n,f)=>canWrite&&saveBadge(n,f);
function shrinkBadge(file){return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const S=200,c=document.createElement("canvas");const k=Math.min(S/im.width,S/im.height,1);c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);ok(c.toDataURL("image/png"))};im.onerror=bad;im.src=r.result};r.onerror=bad;r.readAsDataURL(file)})}
async function saveBadge(name,file){try{const img=await shrinkBadge(file);const {error}=await sb.from("badges").upsert({key:oppKey(name),name,img});if(error)throw error;BADGES[oppKey(name)]=img;toast(`Badge saved for ${name}.`);render()}catch(e){toast("Couldn't save that badge. Try a PNG or JPG.")}}
// tournament logos live in the badges table too, under "t:" + the tournament's id
const tLogo=t=>t&&BADGES["t:"+t.id]||null;
async function saveTLogo(id,file){const t=tournaments.find(x=>x.id===id);if(!t)return;try{const img=await shrinkBadge(file);const {error}=await sb.from("badges").upsert({key:"t:"+id,name:t.name||"Tournament",img});if(error)throw error;BADGES["t:"+id]=img;toast(`Logo saved for ${t.name||"the tournament"}.`);render()}catch(e){toast("Couldn't save that logo. Try a PNG or JPG.")}}
function meetings(opp,before){const k=oppKey(opp);return sortMatches(matches.filter(m=>result(m)&&oppKey(m.opp)===k&&(!before||m.date<before))).reverse()}
function scChip(m){const r=result(m);return `<span class="sc-chip ${r}" title="${esc(m.date)} ${esc(m.comp||"")}">${r} ${m.us}–${m.them}</span>`}
window.H2H=opp=>meetings(opp,new Date().toISOString().slice(0,10));
function assistsOf(m){return m.assists||{}}
const ASSISTS_FROM=TEAM.assistsFrom||"2000-01";
function assistsTracked(s){return s>=ASSISTS_FROM}
function sortMatches(a){return a.slice().sort((x,y)=>(x.date||"").localeCompare(y.date||""))}
function seasonMatches(){return sortMatches(matches.filter(m=>!m.practice&&seasonOf(m.date)===season))}
function pname(id){return id}
function numOf(name){const p=players.find(p=>p.name===name);return p&&p.num!=null&&p.num!==""?p.num:""}
function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3500)}
function slug(s){return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60)||"match"}

// ---------- stats ----------
function teamStats(list){const s={P:0,W:0,D:0,L:0,F:0,A:0};list.forEach(m=>{const r=result(m);if(!r)return;s.P++;s[r]++;s.F+=+m.us;s.A+=+m.them});s.GD=s.F-s.A;return s}
// keepers: {name: 1 = kept a clean sheet, 0 = in goal but conceded}. Older rows only have a single gk name.
function keepersOf(m){if(m.keepers&&Object.keys(m.keepers).length)return m.keepers;return m.gk?{[m.gk]:result(m)&&+m.them===0?1:0}:{}}
// a game counts once it has a score, is live, or its date has passed (some old games have no score recorded)
function counted(m){return (result(m)||isLive(m)||(m.date||"9")<todayLocal())&&!m.postponed&&m.stage!=="placeholder"}
function playerStats(list){list=list.filter(counted);const out={};const get=n=>out[n]||(out[n]={apps:0,ta:0,goals:0,tg:0,assists:0,potm:0,appsKnown:0,gk:0,cs:0});
  list.forEach(m=>{const pl=played(m);for(const [n,g] of Object.entries(pl)){const o=get(n);if(m.apps!==false){o.apps++;o.ta++;o.tg+=+g||0}else if(+g>0)o.apps++;o.goals+=+g||0}
    if(m.apps===false&&m.potm&&!(m.potm in pl))get(m.potm).apps++;// no team sheet: scorers and PotM definitely played
    for(const [n,a] of Object.entries(assistsOf(m)))get(n).assists+=+a||0;
    for(const [n,c] of Object.entries(keepersOf(m))){const o=get(n);o.gk++;o.cs+=+c?1:0}
    if(RUGBY)for(const [n,k] of Object.entries(kicksOf(m))){const o=get(n);["con","pen","drop"].forEach(t=>o[t]=(o[t]||0)+(+k[t]||0))}
    if(m.potm)get(m.potm).potm++; if(m.apps!==false)Object.keys(out).forEach(()=>{})});
  // rugby: points = tries plus kicks
  if(RUGBY)Object.values(out).forEach(o=>{["con","pen","drop"].forEach(t=>o[t]=o[t]||0);o.pts=o.goals*SP.pts.try+o.con*SP.pts.con+o.pen*SP.pts.pen+o.drop*SP.pts.drop});
  return out}
function seasons(){const set=new Set(matches.map(m=>seasonOf(m.date)).filter(Boolean));set.add(todaySeason());return [...set].sort().reverse()}
function appsTracked(list){return list.length>0}// scorers and PotM count as apps even without a team sheet

// ---------- views ----------
function setView(v){if(v!=="tactics"&&document.body.classList.contains("tbfs-on"))tbFsOff();view=v;if(v!=="md"&&/[?&]match=/.test(location.search))try{history.replaceState(null,"",location.pathname)}catch(e){}document.querySelectorAll("nav.tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.view===v?"page":"false"));render();window.scrollTo({top:0})}
function render(){
  const sel=$("#season");const ss=seasons();if(!season||!ss.includes(season))season=ss[0];
  sel.innerHTML=ss.map(s=>`<option${s===season?" selected":""}>${s}</option>`).join("");
  const main=$("#main");const gv=view==="gfx";main.hidden=gv;$("#gfxView").hidden=!gv;if(gv){window.GFX&&GFX.refresh();document.body.classList.toggle("ro",!canWrite);return}
  if(view==="privacy"){main.innerHTML=privacyView();return}
  if(!db||window.SETUP_WAIT){main.innerHTML=`<div class="card empty">Loading the results…</div>`;return}
  if(PRACTICE&&view!=="live"&&view!=="tl"){matches=matches.filter(m=>!m.practice);PRACTICE=null;if(LV&&LV.id==="practice")LV=null}
  if(setupPending()&&!canWrite&&view!=="login"){main.innerHTML=settingUpView();document.body.classList.toggle("ro",true);return}
  renderTicker();
  if(view==="home")main.innerHTML=(canWrite&&setupPending()?setupBanner():"")+homeView();
  else if(view==="setup")main.innerHTML=setupView();
  else if(view==="results")main.innerHTML=resultsView();
  else if(view==="fixtures")main.innerHTML=fixturesView();
  else if(view==="honours")main.innerHTML=honoursView();
  else if(view==="review")main.innerHTML=reviewView();
  else if(view==="live")main.innerHTML=liveView();
  else if(view==="tl")main.innerHTML=tlView();
  else if(view==="md")main.innerHTML=mdView();
  else if(view==="reports")main.innerHTML=reportsView();
  else if(view==="pick")main.innerHTML=pickView();
  else if(view==="avail")main.innerHTML=availView();
  else if(view==="msg")main.innerHTML=msgChase?chaseView():msgView();
  else if(view==="alerts")main.innerHTML=alertsView();
  else if(view==="app")main.innerHTML=appView();
  else if(view==="gallery")main.innerHTML=PHOTOS_ON?galleryView():homeView();
  else if(view==="calendar")main.innerHTML=calendarView();
  else if(view==="training")main.innerHTML=trainingView();
  else if(view==="tactics")main.innerHTML=tacticsView();
  else if(view==="votes")main.innerHTML=votesView();
  else if(view==="parents")main.innerHTML=parentsView();
  else if(view==="matchday")main.innerHTML=matchdayView();
  else if(view==="ftimport")main.innerHTML=ftView();
  else if(view==="help")main.innerHTML=helpView();
  else if(view==="book")main.innerHTML=bookView();
  else if(view==="tnew"||view==="tedit")main.innerHTML=tFormView();
  else if(view==="hnew"||view==="hedit")main.innerHTML=hFormView();
  else if(view==="players")main.innerHTML=playerView?playerDetail(playerView):playersView();
  else if(view==="squad")main.innerHTML=squadView();
  else if(view==="opps")main.innerHTML=oppView?oppDetail(oppView):oppsView();
  else if(view==="new"||view==="edit")main.innerHTML=formView();
  document.body.classList.toggle("ro",!canWrite);
}

// a tournament we've entered whose games aren't on the site yet comes before the next match when it's sooner
function nextTournament(before){const today=todayLocal();return tournaments.filter(t=>t.date&&tEnd(t)>=today&&!tGames(t).some(isFixture)&&(!before||t.date<before)).sort((a,b)=>a.date.localeCompare(b.date))[0]}
function tHeroHtml(t){const d=new Date(t.date+"T12:00:00");const days=Math.max(0,Math.round((d-new Date(todayLocal()+"T12:00:00"))/864e5));
  const ini=(t.name||"?").split(/\s+/).filter(w=>!/^(the|of)$/i.test(w)).map(w=>w[0]).join("").slice(0,3).toUpperCase()||"🏆";
  const cd=days===0?"Today":days===1?"Tomorrow":`In ${days} days`;
  return `<section class="hero"><div class="kick">Next up · Tournament</div>
    <div class="vs"><div class="side"><img src="${CREST}" alt=""><span>${esc(TEAM.name)}</span></div><div class="mid"><b>🏆</b><span>Tournament</span></div><div class="side">${tLogo(t)?`<img src="${tLogo(t)}" alt="">`:`<span class="ini">${esc(ini)}</span>`}<span>${esc(t.name||"Tournament")}</span></div></div>
    <div class="meta"><span class="pill cd">${cd}</span><span class="pill">${tDays(t).length>1?esc(tRange(t,true)):d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long"})}</span>${t.venue?`<span class="pill">📍 ${esc(t.venue)}</span>`:""}</div>
    <div class="hpv">${tSquad(t).length?`Squad: ${esc(tSquad(t).join(", "))}. `:""}${esc(tTeamsLine(t))}${tGames(t).length?"Games and kick-off times are on the Fixtures page.":"We're entered. Games and kick-off times to follow."}${t.notes?` ${esc(clip(t.notes,140))}`:""}</div>
    <div class="btns"><button class="btn gold" data-view="fixtures">🏆 Tournament details</button><button class="btn ghost" data-view="alerts">🔔 Match alerts</button></div></section>`}
function heroHtml(){const live=liveNow().find(m=>m.live.status!=="ft");const nm=live?null:nextFixture(),tn=live?null:nextTournament(nm&&nm.date);if(tn)return tHeroHtml(tn);const m=live||nm;if(!m)return "";
  const d=new Date(m.date+"T12:00:00");const days=Math.round((d-new Date(todayLocal()+"T12:00:00"))/864e5);
  const ini=(m.opp||"?").split(/\s+/).filter(w=>!/^(fc|afc|the)$/i.test(w)).map(w=>w[0]).join("").slice(0,3).toUpperCase();
  const us=`<div class="side"><img src="${CREST}" alt=""><span>${esc(TEAM.name)}</span></div>`,them=`<div class="side">${window.oppBadge(m.opp)?`<img src="${window.oppBadge(m.opp)}" alt="">`:`<span class="ini">${esc(ini)}</span>`}<span>${esc(m.opp)}</span></div>`;
  const home=m.ha!=="A";const h=meetings(m.opp,m.date);
  const mid=live?`<div class="mid"><b>${m.us??0}–${m.them??0}</b><span>${m.live.status==="ht"?"Half time":"Live "+minuteOf(m.live)}</span></div>`:`<div class="mid"><b>${m.ko?esc(m.ko):"VS"}</b><span>${m.ko?"Kick-off":"Kick-off TBC"}</span></div>`;
  const cd=live?"🔴 Live now":days===0?"Today":days===1?"Tomorrow":`In ${days} days`;
  return `<section class="hero"><div class="kick">${live?"Live now":"Next match"} · ${esc(compName(m.comp||""))}</div>
    <div class="vs">${home?us:them}${mid}${home?them:us}</div>
    <div class="meta"><span class="pill cd">${cd}</span><span class="pill">${d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"long"})}</span>${m.venue?`<span class="pill">📍 ${esc(m.venue)}</span>`:""}${m.ha==="A"||m.ha==="H"?`<span class="pill">${m.ha==="A"?"Away":"Home"}</span>`:m.venue?"":`<span class="pill">Venue TBC</span>`}</div>
    ${!live&&h.length?`<div class="h2hrow">Last time: ${h.slice(0,3).map(scChip).join(" ")}</div>`:""}
    ${!live&&hasPreview(m)?`<div class="hpv"><b>Match preview:</b> ${esc(clip(m.preview,170))}</div>`:""}
    <div class="btns">${live?`<button class="btn gold" data-tl="${esc(m.id)}">Follow live</button>`:hasPreview(m)?`<button class="btn gold" data-md="${esc(m.id)}">📰 Read preview</button>`:""}${days<=1||live?`<button class="btn gold" data-mday="${esc(m.id)}">📣 Matchday</button>`:""}<button class="btn ghost" data-view="alerts">🔔 Match alerts</button></div></section>`}

const HOME_ITEMS=[["matchday","📣","Matchday","The next game: when, where, kit and the squad"],["fixtures","📅","Fixtures","Next games, kick-off times and venues"],["results",SP.ball,"Results","Every score, scorer and player of the match"],["reports","📝","Match reports","Write-ups from the coaches"],["players",/girl/i.test(PL)?"👧":/boy|lad/i.test(PL)?"👦":"🧒","Players",`${RUGBY?"Tries, points":"Goals"}, games and awards for each ${PL.replace(/s$/,"")}`],["alerts","🔔","Match alerts",`Kick-off, ${SP.goals} and full time on your phone`],["parents","👪","Parents","Sign in with your family code"],["app","📲","Get the app","On your home screen, like any other app"],["calendar","🗓️","Add to calendar","Every game in your phone's calendar"],["training","🏃","Training","When, where and what to bring"],["gallery","📸","Photos","Match-day pictures"],["honours","🏆","Honours","Trophies and tournaments we've won"],["review","📊","Season review","Records and milestones"],["opps","🆚","Opponents","Our record against every team"],["squad","👕","Squad","Shirt numbers and kits"]];
const HOME_COACH=[["new","➕","Add a match","Fixture or result"],["gfx","🎨","Graphics","Posts for Facebook and WhatsApp"],["book","📒","Sticker book","Print the season book"],["tnew","🏅","Tournament","Add a tournament day"],["help","🛟","Help and changes","Ask for a fix or a change"]];
function homeMenu(){const tile=([v,ic,t,d],c)=>{if(v==="training"&&TR)d=`Every ${TR.day} ${clock(TR.start)}, ${TR.venue.split(",")[0]}`;if(v==="parents"&&myKids().length)d="Signed in for "+myKids().join(" and ");if(noScores())d=({results:"Every game and "+POTM,players:`Games and awards for each ${PL.replace(/s$/,"")}`,alerts:"Kick-off, half time and full time on your phone",opps:"Every team we play",review:"Appearances and milestones"})[v]||d;return `<button class="hm-tile${c}" data-view="${v}"><span class="ic">${ic}</span><b>${t}</b><span>${esc(d)}</span></button>`};
  const pics=GAL.slice(-6).reverse(),openPolls=POLLS.filter(pollOpen);
  if(openPolls.length||canWrite)HOME_ITEMS.some(x=>x[0]==="votes")||HOME_ITEMS.splice(4,0,["votes","🗳️","Votes",`${RUGBY?"Try":"Goal"} of the month and more`]);
  const vt=HOME_ITEMS.find(x=>x[0]==="votes");if(vt)vt[3]=openPolls.length?`${openPolls.length} vote${openPolls.length>1?"s":""} open now`:`${RUGBY?"Try":"Goal"} of the month and more`;
  return `<h2 class="sect">What's on the site</h2><div class="hm-tiles">${HOME_ITEMS.filter(x=>(x[0]!=="app"||!alStandalone())&&(x[0]!=="gallery"||PHOTOS_ON)&&(x[0]!=="parents"||(PL_ON&&!canWrite))).map(x=>tile(x,"")).join("")}${canWrite?(hasSetup()?[...HOME_COACH,["setup","🛠️","Team setup","Name, colours, squad and coaches"]]:HOME_COACH).map(x=>tile(x," coach")).join(""):""}</div>${pics.length?`<h2 class="sect">Latest photos</h2>${albums(4)}<div class="btns" style="margin-top:10px"><button class="btn ghost" data-view="gallery">All photos (${GAL.length})</button></div>`:""}`}
function homeView(){if(noScores())return homeNoScores();
  const list=seasonMatches(),t=teamStats(list),ps=playerStats(list);
  const done=list.filter(result);const last=done.slice(-6);
  const flagged=list.filter(m=>m.check).length;
  const scorers=Object.entries(ps).filter(([,o])=>o.goals>0).sort((a,b)=>b[1].goals-a[1].goals||a[0].localeCompare(b[0]));
  const assisters=Object.entries(ps).filter(([,o])=>o.assists>0).sort((a,b)=>b[1].assists-a[1].assists||a[0].localeCompare(b[0]));
  const potms=Object.entries(ps).filter(([,o])=>o.potm>0).sort((a,b)=>b[1].potm-a[1].potm||a[0].localeCompare(b[0]));
  const max=scorers[0]?.[1].goals||1;
  const latest=done[done.length-1];
  const upcoming=list.filter(m=>!result(m)&&!m.postponed&&m.date>=new Date().toISOString().slice(0,10))[0];
  const lg=list.filter(m=>m.comp==="League"),lt=teamStats(lg),lps=playerStats(lg),ldone=lg.filter(result);
  const lsc=Object.entries(lps).filter(([,o])=>o.goals>0).sort((a,b)=>b[1].goals-a[1].goals||a[0].localeCompare(b[0]));const lmax=lsc[0]?.[1].goals||1;
  const lnext=lg.filter(m=>!result(m)&&!m.postponed&&m.date>=new Date().toISOString().slice(0,10))[0];
  const REC=t=>`<div class="record">${[["P","Played",""],["W","Won","w"],["D","Drawn","d"],["L","Lost","l"],["F","Scored",""],["A","Conceded",""],["GD",RUGBY?"Points diff":"Goal diff",""]].map(([k,l,c])=>`<div class="rec ${c}"><b>${k==="GD"&&t.GD>0?"+":""}${t[k]}</b><span>${l}</span></div>`).join("")}</div>`;
  return `<div class="stack">
  ${flagged&&canWrite?`<div class="note">${flagged} match${flagged>1?"es need":" needs"} checking. Look for the orange tag on the Results page.</div>`:""}
  ${homeLive()||heroHtml()}
  ${homeMenu()}
  <h2 class="sect"><span class="ctag c-league">${LEAGUE_NAME}</span> ${season}</h2>
  <section class="card"><h3>${LEAGUE_NAME} record</h3>${REC(lt)}
      ${ldone.length?`<div style="margin-top:12px" class="btns"><span class="hint">Form</span><div class="form">${ldone.slice(-6).map(m=>`<span class="chip ${result(m)}" title="${esc(m.opp)} ${m.us}-${m.them}">${result(m)}</span>`).join("")}</div></div>`:""}</section>
  <div class="cols">
    <section class="card">${ldone.length?`<h3>Latest ${LEAGUE_NAME} result</h3>${matchRow(ldone[ldone.length-1])}`:""}
      ${lnext?`<h3 style="margin-top:14px">Next ${LEAGUE_NAME} game</h3>${matchRow(lnext)}`:""}</section>
    <section class="card"><h3>${LEAGUE_NAME} ${RUGBY?"try scorers":"goalscorers"}</h3>${lsc.length?`<table class="lb"><tbody>${lsc.map(([n,o])=>`<tr class="click" data-player="${esc(n)}"><td>${esc(n)}</td><td style="width:55%"><div class="bar"><i style="width:${Math.max(6,o.goals/lmax*100)}%"></i><b>${o.goals}</b></div></td></tr>`).join("")}</tbody></table>`:`<p class="hint">No league ${SP.goals} yet.</p>`}</section>
  </div>
  <h2 class="sect">All games ${season} <span class="hint">league, cup, friendlies and tournaments</span></h2>
  <section class="card"><h3>Overall record</h3>
    <div class="record">
      ${[["P","Played",""],["W","Won","w"],["D","Drawn","d"],["L","Lost","l"],["F","Scored",""],["A","Conceded",""],["GD",RUGBY?"Points diff":"Goal diff",""]].map(([k,l,c])=>`<div class="rec ${c}"><b>${k==="GD"&&t.GD>0?"+":""}${t[k]}</b><span>${l}</span></div>`).join("")}
    </div>
    ${last.length?`<div style="margin-top:12px" class="btns"><span class="hint">Form</span><div class="form">${last.map(m=>`<span class="chip ${result(m)}" title="${esc(m.opp)} ${m.us}-${m.them}">${result(m)}</span>`).join("")}</div></div>`:""}
  </section>
  <div class="cols">
    <section class="card"><h3>Latest result, any competition</h3>${latest?matchRow(latest):`<p class="hint">No results yet this season.</p>`}
      ${(tn=>tn?`<h3 style="margin-top:14px">Next up</h3>${tCard(tn)}`:upcoming?`<h3 style="margin-top:14px">Next up</h3>${matchRow(upcoming)}`:"")(nextTournament(upcoming&&upcoming.date))}</section>
    ${(ms=>ms.length?`<section class="card"><h3>Recent milestones</h3>${ms.map(msRow).join("")}</section>`:"")(milestones().filter(x=>(x.date||"")>=new Date(Date.now()-60*864e5).toISOString().slice(0,10)).slice(0,6))}
    <section class="card"><h3>Top ${RUGBY?"try ":""}scorers, all games</h3>${scorers.length?`<table class="lb"><tbody>${scorers.slice(0,8).map(([n,o])=>`<tr class="click" data-player="${esc(n)}"><td>${esc(n)}</td><td style="width:55%"><div class="bar"><i style="width:${Math.max(6,o.goals/max*100)}%"></i><b>${o.goals}</b></div></td></tr>`).join("")}</tbody></table>`:`<p class="hint">No ${SP.goals} logged yet.</p>`}</section>
    ${RUGBY?(pp=>`<section class="card"><h3>Top points scorers</h3>${pp.length?`<table class="lb"><tbody>${pp.slice(0,8).map(([n,o])=>`<tr class="click" data-player="${esc(n)}"><td>${esc(n)}</td><td style="width:55%"><div class="bar"><i style="width:${Math.max(6,o.pts/pp[0][1].pts*100)}%"></i><b>${o.pts}</b></div></td></tr>`).join("")}</tbody></table>`:`<p class="hint">No points logged yet.</p>`}</section>`)(Object.entries(ps).filter(([,o])=>o.pts>0).sort((a,b)=>b[1].pts-a[1].pts||a[0].localeCompare(b[0]))):""}
    ${SP.assists&&assistsTracked(season)?`<section class="card"><h3>Top assists</h3>${assisters.length?`<table class="lb"><tbody>${assisters.slice(0,8).map(([n,o])=>`<tr class="click" data-player="${esc(n)}"><td>${esc(n)}</td><td style="width:55%"><div class="bar"><i style="width:${Math.max(6,o.assists/assisters[0][1].assists*100)}%"></i><b>${o.assists}</b></div></td></tr>`).join("")}</tbody></table>`:`<p class="hint">No assists logged yet.</p>`}</section>`:""}
    <section class="card"><h3>${esc(POTM.charAt(0).toUpperCase()+POTM.slice(1))}</h3>${potms.length?`<table class="lb"><tbody>${potms.map(([n,o])=>`<tr class="click" data-player="${esc(n)}"><td>${esc(n)}</td><td><span class="potm">${"☕".repeat(Math.min(o.potm,6))}</span> <b>${o.potm}</b></td></tr>`).join("")}</tbody></table>`:`<p class="hint">No awards logged yet.</p>`}</section>
  </div></div>`;
}

function homeNoScores(){const list=seasonMatches(),ps=playerStats(list);
  const done=list.filter(m=>!isFixture(m)&&!m.postponed),upcoming=list.filter(isFixture).filter(m=>!m.postponed&&!isLive(m))[0];
  const potms=Object.entries(ps).filter(([,o])=>o.potm>0).sort((a,b)=>b[1].potm-a[1].potm||a[0].localeCompare(b[0]));
  return `<div class="stack">${homeLive()||heroHtml()}${homeMenu()}
  <h2 class="sect">${esc(season)} season</h2>
  <div class="cols">
    <section class="card"><h3>Recent games</h3>${done.length?done.slice(-3).reverse().map(matchRow).join(""):`<p class="hint">No games played yet this season.</p>`}
      ${(tn=>tn?`<h3 style="margin-top:14px">Next up</h3>${tCard(tn)}`:upcoming?`<h3 style="margin-top:14px">Next up</h3>${matchRow(upcoming)}`:"")(nextTournament(upcoming&&upcoming.date))}</section>
    ${(ms=>ms.length?`<section class="card"><h3>Recent milestones</h3>${ms.map(msRow).join("")}</section>`:"")(milestones().filter(x=>(x.date||"")>=new Date(Date.now()-60*864e5).toISOString().slice(0,10)).slice(-5).reverse())}
    <section class="card"><h3>${esc(POTM.charAt(0).toUpperCase()+POTM.slice(1))}</h3>${potms.length?`<table class="lb"><tbody>${potms.map(([n,o])=>`<tr class="click" data-player="${esc(n)}"><td>${esc(n)}</td><td style="text-align:right"><b>${o.potm}</b></td></tr>`).join("")}</tbody></table>`:`<p class="hint">None yet.</p>`}</section>
  </div><p class="hint">${RUGBY?"Scores and scorers aren't shown publicly for this age group, as the club has chosen.":"Scores and scorers aren't shown publicly for this age group, in line with FA rules for youth football."}</p></div>`;
}
function matchRow(m){
  const d=m.date?new Date(m.date+"T12:00:00"):null;const r=result(m);
  const sc=Object.entries(played(m)).filter(([,g])=>g>0).map(([n,g])=>n+(g>1?` ×${g}`:"")).join(", ");
  const as=Object.entries(assistsOf(m)).filter(([,a])=>a>0).map(([n,a])=>n+(a>1?` ×${a}`:"")).join(", ");
  const cc=["League","Cup","Friendly","Tournament"].includes(m.comp)?" c-"+m.comp.toLowerCase():"";
  return `<div class="match${cc}" role="button" tabindex="0" data-edit="${esc(m.id)}">
    <div class="d">${d?`<b>${d.getDate()}</b>${MONTHS[d.getMonth()]}`:"?"}</div>
    <div style="min-width:0"><div class="o">${m.opp?badge(m.opp,"sm"):""}${m.ha==="A"?"at ":m.ha==="H"?"v ":""}${esc(m.opp||"Opponent to add")}${m.check?`<span class="flag">Check</span>`:""}</div>
      <div class="meta">${cc?`<span class="ctag">${esc(compName(m.comp))}</span>`:""}${[cc?"":m.comp,m.venue,m.ko?m.ko+" KO":!r&&!m.hidden&&!m.postponed?"KO TBC":""].filter(Boolean).map(esc).join(" · ")}</div>
      ${sc?`<div class="meta">${SP.ball} ${esc(sc)}</div>`:""}${RUGBY&&kicksLine(m)?`<div class="meta">🎯 ${esc(kicksLine(m))}</div>`:""}${as?`<div class="meta">🅰️ Assists: ${esc(as)}</div>`:""}${(k=>k.length?`<div class="meta">🧤 ${k.map(([n,c])=>esc(n)+(+c?" (clean sheet)":"")).join(", ")}</div>`:"")(Object.entries(keepersOf(m)))}${m.potm?`<div class="potm">☕ ${esc(m.potm)}</div>`:""}${m.report&&m.report.trim()?`<div class="meta">📝 Match report</div>`:!r&&hasPreview(m)?`<div class="meta">📰 Match preview</div>`:""}
      ${!r&&!m.hidden&&!m.postponed&&mdBits(m).length?`<div class="meta">🎒 ${mdBits(m).map(esc).join(" · ")}</div>`:""}${!r&&!m.hidden&&!m.postponed&&wxText(m)?`<div class="meta">${esc(wxText(m))} at kick-off</div>`:""}
      ${m.postponed?`<div class="meta"><b>Postponed.</b> New date to be confirmed.</div>`:""}
      ${!r&&!m.hidden&&m.comp!=="Tournament"?(h=>h.length?`<div class="h2h">Previously: ${h.slice(0,4).map(scChip).join("")}</div>`:`<div class="h2h">First time we've played them</div>`)(meetings(m.opp,m.date)):""}</div>
    <div class="sc">${r?`${m.us}–${m.them}<span class="chip ${r}">${r}</span>`:m.hidden&&!m.postponed?`<span class="chip N" title="Played">✓</span>`:m.postponed?`<span class="chip P" title="Postponed">P</span>`:`<span class="chip N">${m.comp==="Tournament"?"T":"–"}</span>`}</div>
    <div class="mg edit-only"><button class="mini" data-gfx="squad" data-mid="${esc(m.id)}">Squad post</button><button class="mini" data-gfx="ft" data-mid="${esc(m.id)}"${r?"":" disabled"}>Result post</button><button class="mini" data-gfx="potm" data-mid="${esc(m.id)}"${m.potm?"":" disabled"}>PotM post</button>${(!r||isLive(m))&&!m.postponed?`<button class="mini" data-pick="${esc(m.id)}">${m.squad&&m.squad.length?`Squad picked (${m.squad.length})`:"Pick squad"}</button><button class="mini" data-live="${esc(m.id)}">▶ Live match</button><button class="mini" data-tbmatch="${esc(m.id)}">📋 Tactics</button><button class="mini" data-msg="${esc(m.id)}">Parents' message</button>`:""}</div>
    ${m.live&&m.live.events&&m.live.events.length?`<div class="mg"><button class="mini" data-tl="${esc(m.id)}">${m.live.status==="live"||m.live.status==="ht"?"🔴 Follow live":"Match timeline"}</button></div>`:""}
    ${!r&&!m.postponed&&!m.hidden&&canWrite&&m.comp!=="Tournament"?`<div class="avsum">${avSummary(m.id)}</div>`:""}
  </div>`;
}

let compFilter=null;
const LEAGUE_NAME=TEAM.league||"League";const compName=c=>c==="League"?LEAGUE_NAME:c;
const CKEY=()=>`<div class="ckey" role="group" aria-label="Filter by competition"><button class="cf${compFilter?"":" on"}" data-cf="">All</button>${["League","Cup","Friendly","Tournament"].map(c=>`<button class="cf match c-${c.toLowerCase()}${compFilter===c?" on":""}" data-cf="${c}" aria-pressed="${compFilter===c}"><span class="ctag">${compName(c)}</span></button>`).join("")}</div>`;
const byComp=ms=>compFilter?ms.filter(m=>m.comp===compFilter):ms;
const tByComp=ts=>!compFilter||compFilter==="Tournament"?ts:[];
const STAGES=["Group stage","Round of 16","Quarter final","Semi final","Final","3rd place play-off","Plate","Shield","Friendly game"];
const TROPHIES=["Winners","Runners-up","Semi-finalists","Plate winners","Shield winners"];
function tGames(t){return matches.filter(m=>m.tournament_id===t.id).sort((a,b)=>(a.date||"").localeCompare(b.date||"")||STAGES.indexOf(a.stage||"Group stage")-STAGES.indexOf(b.stage||"Group stage"))}
// A tournament runs from date to end_date; end_date is blank for a one-day tournament.
const tEnd=t=>t.end_date&&t.end_date>(t.date||"")?t.end_date:t.date||"";
const nextDay=iso=>{const d=new Date(iso+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)};
function tDays(t){const out=[];for(let d=t.date;d&&d<=tEnd(t)&&out.length<14;d=nextDay(d))out.push(d);return out}
// "14 Jun", "14–15 Jun" or "30 May – 1 Jun"; long adds full month names and the year
function tRange(t,long){if(!t.date)return"";const M=long?LONGM:MONTHS,a=new Date(t.date+"T12:00:00"),b=new Date(tEnd(t)+"T12:00:00"),y=long?" "+b.getFullYear():"";
  if(t.date===tEnd(t))return `${a.getDate()} ${M[a.getMonth()]}${y}`;
  return a.getMonth()===b.getMonth()?`${a.getDate()}–${b.getDate()} ${M[b.getMonth()]}${y}`:`${a.getDate()} ${M[a.getMonth()]} – ${b.getDate()} ${M[b.getMonth()]}${y}`}
const dayLabel=iso=>(d=>`${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`)(new Date(iso+"T12:00:00"));
// Teams entered in a tournament: [{name,group}]. group "" means the groups haven't been drawn yet.
const GROUPS=["A","B","C","D","E","F","G","H"];
const tTeams=t=>(Array.isArray(t&&t.teams)?t.teams:[]).filter(x=>x&&x.name);
const tDrawn=t=>tTeams(t).some(x=>GROUPS.includes(x.group));
function isUs(n){const k=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");const a=k(n);return !!a&&[TEAM.name,TEAM.shortName,TEAM.abbr,TEAM.appName,`${TEAM.name} ${TEAM.ageShort||""}`,`${TEAM.name} ${TEAM.ageGroup||""}`].some(x=>x&&k(x)===a)}
function tTeamsHtml(t){const ts=tTeams(t);if(!ts.length)return "";
  const chips=l=>`<div class="tchips">${l.map(x=>`<span class="tteam${isUs(x.name)?" us":""}">${esc(x.name)}</span>`).join("")}</div>`;
  const drawn=GROUPS.filter(g=>ts.some(x=>x.group===g)),left=ts.filter(x=>!GROUPS.includes(x.group));
  if(!drawn.length)return `<div class="tteams"><div class="tday">${ts.length} team${ts.length>1?"s":""} entered · <span class="tdraw">Groups to be drawn</span></div>${chips(ts)}</div>`;
  return `<div class="tteams">${drawn.map(g=>`<div class="tday">Group ${g}</div>${chips(ts.filter(x=>x.group===g))}`).join("")}${left.length?`<div class="tday">Still to be drawn</div>${chips(left)}`:""}</div>`}
// one line for the home page: who's in and whether the groups are out
function tTeamsLine(t){const ts=tTeams(t);if(!ts.length)return "";const mine=ts.find(x=>isUs(x.name)&&GROUPS.includes(x.group));
  if(mine){const w=ts.filter(x=>x.group===mine.group&&x!==mine).map(x=>x.name);return `We're in Group ${mine.group}${w.length?` with ${w.join(", ")}`:""}. `}
  return tDrawn(t)?`${ts.length} teams entered and the groups are drawn. `:`${ts.length} teams entered. Groups to be drawn. `}
function trophyIcon(x){return /^winners|plate winners|shield winners/i.test(x||"")?"🏆":/runners/i.test(x||"")?"🥈":"🏅"}
// a multi-day tournament stays under Fixtures until its last day, even once the first day's results are in
function tIsFixture(t){const today=new Date().toISOString().slice(0,10);return tEnd(t)>=today&&((t.date!==tEnd(t)&&today<tEnd(t))||!tGames(t).some(result))}
function tGameRow(m){const r=result(m);return `<div class="tgame" role="button" tabindex="0" data-edit="${esc(m.id)}"><div style="min-width:0"><div class="o"><span class="stag">${esc(m.stage||"Group stage")}</span>${esc(m.opp||"Opponent to add")}</div>
      ${(sc=>sc?`<div class="meta">${SP.ball} ${esc(sc)}</div>`:"")(Object.entries(played(m)).filter(([,x])=>x>0).map(([n,x])=>n+(x>1?` ×${x}`:"")).join(", "))}${RUGBY&&kicksLine(m)?`<div class="meta">🎯 ${esc(kicksLine(m))}</div>`:""}</div>
      <div class="sc">${r?`${m.us}–${m.them}<span class="chip ${r}">${r}</span>`:`<span class="chip N">–</span>`}</div></div>`}
function tCard(t){
  const g=tGames(t),st=teamStats(g.filter(result));const d=t.date?new Date(t.date+"T12:00:00"):null;
  const days=tDays(t),multi=days.length>1,e=multi?new Date(tEnd(t)+"T12:00:00"):null;
  const games=multi?[...new Set(g.map(m=>m.date))].map(dt=>`<div class="tday">${days.includes(dt)?`Day ${days.indexOf(dt)+1} · `:""}${esc(dt?dayLabel(dt):"Date to add")}</div>`+g.filter(m=>m.date===dt).map(tGameRow).join("")).join(""):g.map(tGameRow).join("");
  return `<div class="match tcard c-tournament"><div class="thead">
    <div class="d">${d?multi?`<b>${d.getDate()}–${e.getDate()}</b>${MONTHS[d.getMonth()]}${e.getMonth()!==d.getMonth()?"–"+MONTHS[e.getMonth()]:""}`:`<b>${d.getDate()}</b>${MONTHS[d.getMonth()]}`:"?"}</div>
    <div style="min-width:0"><div class="o">${tLogo(t)?`<img class="badge sm" src="${tLogo(t)}" alt="">`:""}${esc(t.name||"Tournament")}${t.trophy?`<span class="trophy">${trophyIcon(t.trophy)} ${esc(t.trophy)}</span>`:""}</div>
      <div class="meta"><span class="ctag">Tournament</span>${multi?`${days.length} days${t.venue?" · ":""}`:""}${esc(t.venue||"")}${st.P?` · P${st.P} W${st.W} D${st.D} L${st.L}`:""}</div>
      ${t.potm?`<div class="potm">⭐ Player of the tournament: ${esc(t.potm)}</div>`:""}${t.notes?`<div class="meta">${esc(t.notes)}</div>`:""}</div>
    <div></div></div>${tTeamsHtml(t)}${tSquad(t).length&&tSquadOpen(t)?`<div class="tteams"><div class="tday">👕 Squad (${tSquad(t).length})</div><div class="tchips">${tSquad(t).map(n=>`<span class="tteam">${esc(n)}</span>`).join("")}</div></div>`:""}
    ${g.length?`<div class="tgames">${games}</div>`:`<p class="hint" style="margin-top:8px">${tEnd(t)>=new Date().toISOString().slice(0,10)?tTeams(t).length&&!tDrawn(t)?"Fixtures to follow once the groups are drawn.":"Tournament entered. Fixtures to follow.":"No games added yet."}</p>`}
    <div class="mg edit-only" style="margin-top:10px"><button class="mini" data-tedit="${esc(t.id)}">Edit tournament</button><button class="mini" data-tgame="${esc(t.id)}">+ Add a game</button>${tSquadOpen(t)?`<button class="mini" data-pick="t:${esc(t.id)}">${tSquad(t).length?`Squad picked (${tSquad(t).length})`:"Pick squad"}</button>`:""}<label class="mini bup">${tLogo(t)?"Change logo":"+ Logo"}<input type="file" accept="image/*" data-tlogo="${esc(t.id)}"></label><button class="mini" data-tpost="${esc(t.id)}"${t.potm?"":" disabled"}>Player of the tournament post</button>${(window.TEAM_CONFIG||window.NAYFC_CONFIG||{}).vapidPublicKey&&tEnd(t)>=todayLocal()?`<button class="mini" data-ttell="${esc(t.id)}">📣 Tell parents: groups and games confirmed</button>`:""}</div>
  </div>`;
}
// one list of cards: plain matches plus one card per tournament
function listItems(ms,ts){return [...ms.filter(m=>!m.tournament_id||!tournaments.some(t=>t.id===m.tournament_id)).map(m=>({date:m.date||"",pp:!!m.postponed,html:matchRow(m)})),...ts.map(t=>({date:t.date||"",pp:false,html:tCard(t)}))]}
function monthList(items){let out="",cur="";items.forEach(it=>{const d=new Date(it.date+"T12:00:00");const k=isNaN(d)?"Date to add":LONGM[d.getMonth()]+" "+d.getFullYear();if(k!==cur){out+=`<div class="month">${k}</div>`;cur=k}out+=it.html});return out}
function isLive(m){return !!(m.live&&(m.live.status==="live"||m.live.status==="ht"))}
function isFixture(m){if(isLive(m))return true;if(m.hidden&&m.live&&m.live.status==="ft")return false;return !result(m)&&(m.postponed||(m.date||"")>=new Date().toISOString().slice(0,10))}
// ---------- availability (parents answer; only coaches can read) ----------
let AV={};// {match_id:{player:status}}
let PHOTOS={};// player photos {name:dataURL}, everyone can see them, only coaches change them
async function loadPhotos(){if(!sb){PHOTOS={};return}const {data}=await sb.from("player_photos").select("player,img");PHOTOS={};(data||[]).forEach(r=>PHOTOS[r.player]=r.img)}
// Website visits: counts only (see page_views in supabase/1_schema.sql). Coaches' phones don't count.
let VIEWS=null;
async function loadViews(){if(!sb||!canWrite){VIEWS=null;return}const {data}=await sb.from("page_views").select("day,views,visitors").order("day");VIEWS=data||[]}
function logView(){try{
  if(canWrite)localStorage.setItem(SK+".coachDevice","1");
  if(localStorage.getItem(SK+".coachDevice"))return;
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Europe/London"}),isNew=localStorage.getItem(SK+".seen")!==today;
  localStorage.setItem(SK+".seen",today);sb.rpc("log_view",{p_new:isNew}).then(()=>{},()=>{});
}catch(e){}}
function viewsCard(){
  if(!VIEWS)return "";if(!VIEWS.length)return `<section class="card edit-only"><h3>Website visits</h3><p class="hint">Counting starts now. Check back tomorrow.</p></section>`;
  const today=new Date().toLocaleDateString("en-CA",{timeZone:"Europe/London"}),ago=n=>new Date(Date.now()-n*864e5).toLocaleDateString("en-CA",{timeZone:"Europe/London"});
  const sum=(from,k)=>VIEWS.filter(r=>r.day>=from).reduce((t,r)=>t+r[k],0),t0=VIEWS.find(r=>r.day===today)||{views:0,visitors:0};
  const last=VIEWS.slice(-14),mx=Math.max(1,...last.map(r=>r.views));
  return `<section class="card edit-only"><h3>Website visits</h3>
    <div class="kv" style="margin-top:10px">
      <div><span>Today</span><b>${t0.views}</b><small>${t0.visitors} ${t0.visitors===1?"person":"people"}</small></div>
      <div><span>Last 7 days</span><b>${sum(ago(6),"views")}</b></div>
      <div><span>Last 30 days</span><b>${sum(ago(29),"views")}</b></div>
      <div><span>Since ${esc(VIEWS[0].day)}</span><b>${sum("",'views')}</b></div>
    </div>
    <h3 style="margin-top:14px">Last 14 days</h3><div class="bars">${last.map(r=>`<div title="${r.visitors} people"><b>${r.views}</b><i style="height:${r.views/mx*100}%"></i>${+r.day.slice(8)}</div>`).join("")}</div>
    <p class="hint" style="margin-top:6px">Times the site was opened. "People" counts each phone or computer once a day. Coaches' phones aren't counted, and nothing about who visited is stored.</p></section>`;
}
// ---------- sponsor report (public.post_log, coaches only) ----------
// The graphics page logs each saved or copied post with the sponsors drawn on it; set beside website visits,
// that's the evidence for a sponsor's renewal. Nothing about children goes in it.
let POSTS=null;
async function loadPosts(){POSTS=null;if(!sb||!canWrite)return;try{const {data,error}=await sb.from("post_log").select("day,kind,sponsors");if(!error)POSTS=data||[]}catch(e){}}
window.logPost=(kind,sponsors)=>{if(!sb||!canWrite)return;const row={kind,sponsors:sponsors.filter(Boolean)};sb.from("post_log").insert(row).then(({error})=>{if(!error&&POSTS)POSTS.push(Object.assign({day:todayLocal()},row))},()=>{})};
const SPONSORS=()=>[...new Set([TEAM.sponsor&&TEAM.sponsor.name,TEAM.potm&&TEAM.potm.sponsor,TEAM.kitSponsor&&TEAM.kitSponsor.name].filter(Boolean))];
function sponsorReport(name,from){const vis=(VIEWS||[]).filter(r=>r.day>=from),posts=(POSTS||[]).filter(r=>r.day>=from&&(r.sponsors||[]).includes(name));
  const kinds={};posts.forEach(r=>kinds[r.kind]=(kinds[r.kind]||0)+1);
  return {views:vis.reduce((t,r)=>t+r.views,0),visitors:vis.reduce((t,r)=>t+r.visitors,0),posts:posts.length,kinds}}
const KIND_NAMES={squad:"squad announcement",ft:"full-time result",potm:"player of the match post",month:"fixture list",ms:"milestone post"},kindsText=k=>Object.entries(k).map(([x,v])=>`${v} ${KIND_NAMES[x]||x}${v===1?"":"s"}`).join(", ");
function sponsorCard(){const sp=SPONSORS();if(!canWrite||!sp.length||!POSTS||!VIEWS)return "";const from=`${season.slice(0,4)}-07-01`;
  return `<section class="card edit-only"><h3>Sponsor report</h3><p class="hint" style="margin-bottom:8px">Since 1 July ${season.slice(0,4)}. Posts are matchday graphics saved or copied from this site that show the sponsor. Only coaches see this.</p>
    ${sp.map(n=>{const r=sponsorReport(n,from);return `<div class="row" style="flex-wrap:wrap;gap:6px;padding:8px 0;border-bottom:1px solid var(--line)"><b style="flex:1 1 160px">${esc(n)}</b><span>${r.posts} post${r.posts===1?"":"s"}</span><span class="hint">${kindsText(r.kinds)}</span><button class="mini" data-sprep="${esc(n)}">Copy report</button></div>`}).join("")}
    <p class="hint" style="margin-top:8px">Visits to the site in the same period: ${sponsorReport("",from).views}.</p></section>`}
function sponsorText(n){const from=`${season.slice(0,4)}-07-01`,r=sponsorReport(n,from);
  return `${TEAM.name} ${TEAM.ageGroup||""}: thank you, ${n}\n\nSince 1 July ${season.slice(0,4)}:\n• ${r.posts} matchday post${r.posts===1?"":"s"} with your logo${Object.keys(r.kinds).length?` (${kindsText(r.kinds)})`:""}\n• ${r.views} visits to the team website\n\nThank you for supporting the team.`}
function pface(n,cls){return PHOTOS[n]?`<img class="${cls}" src="${PHOTOS[n]}" alt="">`:""}
function shrinkPhoto(file){return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const S=300,c=document.createElement("canvas"),k=Math.min(im.width,im.height);c.width=c.height=S;c.getContext("2d").drawImage(im,(im.width-k)/2,(im.height-k)/2,k,k,0,0,S,S);ok(c.toDataURL("image/jpeg",.82))};im.onerror=bad;im.src=r.result};r.onerror=bad;r.readAsDataURL(file)})}
async function savePhoto(n,file){try{const img=await shrinkPhoto(file);const {error}=await sb.from("player_photos").upsert({player:n,img});if(error)throw error;PHOTOS[n]=img;toast(`Photo saved for ${n}.`);render()}catch(e){toast("Couldn't save that photo. Try a JPG or PNG.")}}
async function loadAvail(){if(!sb||!canWrite){AV={};return}const {data}=await sb.from("availability").select("*");AV={};(data||[]).forEach(r=>{(AV[r.match_id]=AV[r.match_id]||{})[r.player]=r.status})}
function avSummary(id){const a=AV[id]||{};if(!Object.keys(a).length)return `Availability: no answers yet. Send the Parents' message to ask.`;const c={yes:[],maybe:[],no:[]};Object.entries(a).forEach(([n,v])=>c[v]&&c[v].push(n));const w=avWaiting(id);
  return `Availability: ✅ ${c.yes.length} ❔ ${c.maybe.length} ❌ ${c.no.length}${w.length?` ⏳ ${w.length}`:""}${c.no.length?` (can't make it: ${c.no.map(esc).join(", ")})`:""}${w.length?`<br>Not answered yet: ${w.map(esc).join(", ")} <button class="mini" data-chase="${esc(id)}">Chase replies</button>`:" · Everyone has answered."}`}
// current players with no answer yet for this fixture, in shirt-number order
function avWaiting(id){const a=AV[id]||{};return players.filter(p=>p.current&&!a[p.name]).sort((x,y)=>(+x.num||99)-(+y.num||99)).map(p=>p.name)}
function siteUrl(){return location.origin+location.pathname}
function availView(){
  const m=matches.find(x=>x.id===availMatch);if(!m)return `<div class="card empty">That fixture couldn't be found. Ask the coach for a new link.</div>`;
  const d=new Date(m.date+"T12:00:00"),kids=canWrite?[]:myKids();let roster=players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99));
  const head=`<h2>Can ${PRN.s} make it?</h2>
    <p><b>${esc(m.ha==="A"?"at ":"v ")}${esc(m.opp)}</b><br>${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}${m.ko?` · ${esc(m.ko)} kick-off`:""}${m.venue?` · ${esc(m.venue)}`:""}</p>`;
  if(kids.length)roster=roster.filter(p=>kids.includes(p.name));
  else if(PREQ&&!canWrite){parentNext="avail";return `<section class="card stack">${head}${joinBox(`To answer, type the family code the coach sent you. You only do this once on this phone.`)}</section>`}
  return `<section class="card stack">${head}
    <p class="hint">${kids.length?`Answering for ${kids.map(esc).join(" and ")}.`:`Tap the answer next to your ${PRN.kid}'s name.`} Only the coaches can see the answers.${!kids.length&&PL_ON&&!canWrite?` Got a family code? <button class="mini" data-view="parents" data-pnext="avail">Sign in</button>`:""}</p>
    <div class="av">${roster.map(p=>{const v=(AV_MINE[m.id]||{})[p.name];return `<div class="row"><span>${esc(p.name)}</span><div class="seg" role="group" aria-label="${esc(p.name)}"><button data-av="yes" data-n="${esc(p.name)}" aria-pressed="${v==="yes"}">Yes</button><button data-av="maybe" data-n="${esc(p.name)}" aria-pressed="${v==="maybe"}">Maybe</button><button data-av="no" data-n="${esc(p.name)}" aria-pressed="${v==="no"}">No</button></div></div>`}).join("")}</div></section>`;
}
let availMatch=null;const AV_MINE={};
// ---------- parent login (family codes, supabase/10_parent_login.sql) ----------
// Each player has a family code the coach sends privately. Typing it once gives this phone an anonymous sign-in
// (no email, no name) linked to that child: the parent then answers availability for their own child and gets one
// vote per family. With "parents must sign in" on, the open availability links and phone votes stop working.
let PL_ON=false,PREQ=false,KIDS=[],FAMV={},FAM=null,parentNext=null;
const isParent=()=>!!(me&&(me.is_anonymous||!me.email));
const myKids=()=>isParent()?KIDS:[];
const fmtCode=c=>c?c.slice(0,3)+"-"+c.slice(3):"";
async function copyOut(tx,msg){try{await navigator.clipboard.writeText(tx);toast(msg)}catch(e){prompt("Copy this",tx)}}
async function loadParentSettings(){if(!sb)return;try{const {data,error}=await sb.from("parent_settings").select("required").maybeSingle();if(error)return;PL_ON=true;PREQ=!!(data&&data.required)}catch(e){}}
async function loadParent(){KIDS=[];FAMV={};if(!sb||!isParent())return;
  try{const [k,a,v]=await Promise.all([sb.rpc("my_children"),sb.rpc("my_availability"),sb.rpc("my_votes")]);
    KIDS=(k.data||[]).map(r=>typeof r==="string"?r:r.my_children).filter(Boolean);
    (a.data||[]).forEach(r=>{(AV_MINE[r.match_id]=AV_MINE[r.match_id]||{})[r.player]=r.status});
    (v.data||[]).forEach(r=>{FAMV[r.poll_id]=r.choice})}catch(e){}}
function joinBox(why){return `${why?`<p class="hint" style="margin:0">${why}</p>`:""}<form id="pForm" class="btns"><input type="text" id="pCode" placeholder="Family code, e.g. 7K3-M9Q" aria-label="Family code" autocomplete="off" autocapitalize="characters" spellcheck="false" style="max-width:240px"><button class="btn gold" type="submit">Sign in</button></form>`}
async function parentJoin(){const el=$("#pCode"),code=(el&&el.value||"").replace(/[^a-z0-9]/gi,"").toUpperCase();
  if(code.length!==6){toast("Family codes are six letters and numbers, like 7K3-M9Q.");return}
  if(canWrite){toast("You're signed in as a coach. Sign out first to use a family code.");return}
  if(!me){const {data,error}=await sb.auth.signInAnonymously();if(error||!data||!data.user){toast("Parent sign-in isn't switched on for this site yet. Ask the coach.");return}me=data.user}
  const {data,error}=await sb.rpc("link_family",{p_code:code});
  if(error){toast(/too many/i.test(error.message)?"Too many tries. Wait an hour, or ask the coach to check the code.":"Couldn't check that code. Try again.");return}
  if(!data){toast("That code isn't right. Check it with the coach.");return}
  await loadParent();authBox();toast(`Signed in. This phone is linked to ${data}.`);
  const nx=parentNext;parentNext=null;if(nx)setView(nx);else render()}
async function parentLeave(n){
  if(n){await sb.rpc("unlink_family",{p_player:n});await loadParent();authBox();render();toast(`${n} is no longer linked to this phone.`);return}
  if(!confirm("Sign this phone out? You'll need the family code to sign in again."))return;
  await sb.rpc("unlink_family",{p_player:null});KIDS=[];FAMV={};await sb.auth.signOut();toast("This phone is signed out.")}
function parentsView(){const kid=PRN.kid,kids=myKids();
  const what=`<ul style="margin:0;padding-left:20px"><li>Tell the coaches whether your ${kid} can make each game</li><li>Vote in team votes, one vote per family</li></ul>`;
  if(!PL_ON)return `<section class="card stack"><h2>👪 Parents</h2><p>Parent sign-in isn't switched on for this team yet.</p></section>`;
  if(canWrite)return `<section class="card stack"><h2>👪 Parents</h2><p>You're signed in as a coach. Each family's code is on the Squad page.</p><div class="btns"><button class="btn gold" data-view="squad">Family codes</button></div></section>`;
  if(kids.length)return `<section class="card stack"><h2>👪 Parents</h2><p>This phone is signed in for <b>${kids.map(esc).join(" and ")}</b>. You can:</p>${what}
    <div class="av">${kids.map(n=>`<div class="row"><span>${esc(n)}</span><button class="mini" data-punlink="${esc(n)}">Remove</button></div>`).join("")}</div>
    <h3>Another ${kid} in the squad?</h3>${joinBox("Type their family code as well.")}
    <div class="btns"><button class="btn ghost" id="pLeave">Sign this phone out</button></div></section>`;
  return `<section class="card stack"><h2>👪 Parents</h2><p>Sign in with the family code the coach sent you. You only do this once on each phone. Then you can:</p>${what}${joinBox("")}
    <p class="hint">No code? Ask the coach. We don't ask for your name or email: the code just tells the site which ${kid} is yours, so please keep it to your family.</p></section>`}
// coaches: every player's code, how many phones use it, and the "parents must sign in" switch (on the Squad page)
async function loadFam(){if(!sb||!canWrite)return;const {data,error}=await sb.rpc("family_overview");FAM=error?[]:(data||[]);if(view==="squad")render()}
const famText=f=>`Hi! Here's ${f.player}'s family code for the ${TEAM.name||""} ${TEAM.ageGroup||""} website:\n\n${fmtCode(f.code)}\n\nOpen ${siteUrl()}?parents on your phone and type it in once. Then you can tell us whether ${f.player} can make each game, and vote in team votes.\n\nPlease keep it to your family. Thank you! ${TEAM.cheer||SP.ball}`;
function famCard(){if(!canWrite||!PL_ON)return "";const kid=PRN.kid;
  if(!FAM){loadFam();return `<section class="card edit-only"><h2>👪 Family codes</h2><p class="hint">Loading…</p></section>`}
  return `<section class="card stack edit-only"><h2>👪 Family codes</h2>
    <p class="hint">Send each family their ${kid}'s code privately, not in the group chat. They type it once on the Parents page, then they can answer availability for their own ${kid} and vote, one vote per family. "New code" stops the old one working and signs out every phone that used it.</p>
    ${FAM.length?`<div class="av">${FAM.map(f=>`<div class="row" style="flex-wrap:wrap;gap:6px"><span style="flex:1 1 140px"><b>${esc(f.player)}</b> <code>${esc(fmtCode(f.code))}</code></span><span class="hint">${f.phones?`${f.phones} phone${f.phones>1?"s":""}`:"No phones yet"}</span><button class="mini" data-famcopy="${esc(f.player_id)}">Copy message</button><button class="mini" data-famnew="${esc(f.player_id)}">New code</button></div>`).join("")}</div>
    <div class="btns"><button class="btn ghost" id="famAll">Copy all codes</button></div>`:`<p class="hint">Codes appear here once players are in the squad.</p>`}
    <h3>Parents must sign in</h3><p class="hint">${PREQ?"On: only signed-in parents can answer availability and vote.":"Off: anyone with the link can still answer availability and vote, as before. Turn this on once every family has their code."}</p>
    <div class="seg" role="group" aria-label="Parents must sign in"><button data-preq="1" aria-pressed="${PREQ}">On</button><button data-preq="0" aria-pressed="${!PREQ}">Off</button></div></section>`}

// ---------- pick the squad for a fixture (Live match uses it) ----------
let pickMatch=null,PICK=null;
// a tournament's squad (tournaments.squad, supabase/15_tournament_squad.sql) is picked before its games are on the site:
// pickMatch is then "t:<tournament id>", and every game added to the tournament starts with that squad
const pickTourn=()=>pickMatch&&String(pickMatch).startsWith("t:")?tournaments.find(t=>t.id===pickMatch.slice(2)):null;
const tSquad=t=>(t&&Array.isArray(t.squad)?t.squad:[]).filter(Boolean);
const tSquadOpen=t=>!!t&&tEnd(t)>=todayLocal();
function pickTView(t){const a=AV[pickMatch]||{};const roster=players.filter(p=>p.current).sort((x,y)=>(+x.num||99)-(+y.num||99));
  if(!PICK||PICK.id!==pickMatch)PICK={id:pickMatch,set:new Set(tSquad(t).length?tSquad(t):roster.filter(p=>a[p.name]!=="no").map(p=>p.name))};
  const lab={yes:"✅ Can make it",maybe:"❔ Maybe",no:"❌ Can't make it"};const d=new Date(t.date+"T12:00:00");
  return `<section class="card stack"><h2>Pick the tournament squad</h2><p><b>🏆 ${esc(t.name||"Tournament")}</b>, ${tDays(t).length>1?esc(tRange(t,true)):d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}${t.venue?` · ${esc(t.venue)}`:""}</p>
  <p class="hint">Tick who's going. Parents see the squad on the tournament card, every game you add to the tournament starts with these players, and Live match uses them on the day.</p>
  <div class="av">${roster.map(p=>`<label class="row" for="pk-${esc(p.id)}" style="cursor:pointer"><span><input type="checkbox" id="pk-${esc(p.id)}" data-pk="${esc(p.name)}"${PICK.set.has(p.name)?" checked":""} style="width:20px;height:20px;vertical-align:-4px;margin-right:8px"><b>${esc(p.num??"")}</b> ${esc(p.name)}</span><span class="hint">${lab[a[p.name]]||""}</span></label>`).join("")}</div>
  <p class="hint">${PICK.set.size} picked.</p>
  ${tSquadOpen(t)?`<label class="row" style="cursor:pointer"><span><input type="checkbox" id="pickAlert" checked style="width:20px;height:20px;vertical-align:-4px;margin-right:8px">📣 Send a squad alert to parents' phones</span></label><p class="hint">Only sent when the squad is new or has changed since the last alert.</p>`:""}
  <div class="btns"><button class="btn gold" id="pickSave">Save squad</button><button class="btn" id="pickSavePost">Save and make the squad post</button><button class="btn ghost" data-view="fixtures">Cancel</button></div></section>`}
async function pickTSave(t){const sq=[...PICK.set].sort((a,b)=>(+(players.find(p=>p.name===a)||{}).num||99)-(+(players.find(p=>p.name===b)||{}).num||99));
  const tell=!!($("#pickAlert")&&$("#pickAlert").checked&&sq.length);
  try{await db.collection("tournaments").doc(t.id).update({squad:sq});t.squad=sq}catch(e){toast(/squad/.test(e&&e.message||"")?"The site's database needs a quick update before it can save a tournament squad. Ask Touchline Tales.":"Couldn't save the squad. Try again.");return null}
  // games already added that haven't kicked off get the same squad
  for(const g of tGames(t).filter(g=>!result(g)&&!g.postponed&&!(g.live&&g.live.status&&g.live.status!=="pre"))){try{await db.collection("matches").doc(g.id).update({squad:sq});g.squad=sq;try{localStorage.removeItem(liveKey(g.id))}catch(e){}}catch(e){}}
  const r=tell?await alSend({tsquad:t.id}):null;
  toast(`Squad saved: ${sq.length} players.${r==null?"":r>=0?" Parents with alerts on have been told.":" No change since the last alert, so none sent."}`);return t}
function pickView(){const pt=pickTourn();if(pt)return pickTView(pt);if(String(pickMatch||"").startsWith("t:"))return `<div class="card empty">Tournament not found.</div>`;
  const m=matches.find(x=>x.id===pickMatch);if(!m)return `<div class="card empty">Fixture not found.</div>`;
  const a=AV[m.id]||{};const roster=players.filter(p=>p.current).sort((x,y)=>(+x.num||99)-(+y.num||99));
  const ts=m.tournament_id?tSquad(tournaments.find(t=>t.id===m.tournament_id)):[];
  if(!PICK||PICK.id!==m.id)PICK={id:m.id,set:new Set(m.squad&&m.squad.length?m.squad:ts.length?ts:roster.filter(p=>a[p.name]!=="no").map(p=>p.name))};
  const lab={yes:"✅ Can make it",maybe:"❔ Maybe",no:"❌ Can't make it"};const d=new Date(m.date+"T12:00:00");
  return `<section class="card stack"><h2>Pick the squad</h2><p><b>${m.ha==="A"?"at ":"v "}${esc(m.opp)}</b>, ${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}${m.ko?` · ${esc(m.ko)} KO`:""}</p>
  <p class="hint">Tick who's in the squad. Live match will use exactly these players on the day, and the squad post will use them too. Parents' answers are shown where they've replied.</p>
  <div class="av">${roster.map(p=>`<label class="row" for="pk-${esc(p.id)}" style="cursor:pointer"><span><input type="checkbox" id="pk-${esc(p.id)}" data-pk="${esc(p.name)}"${PICK.set.has(p.name)?" checked":""} style="width:20px;height:20px;vertical-align:-4px;margin-right:8px"><b>${esc(p.num??"")}</b> ${esc(p.name)}</span><span class="hint">${lab[a[p.name]]||"No answer"}</span></label>`).join("")}</div>
  <p class="hint">${PICK.set.size} picked.</p>
  ${pickAlertable(m)?`<label class="row" style="cursor:pointer"><span><input type="checkbox" id="pickAlert" checked style="width:20px;height:20px;vertical-align:-4px;margin-right:8px">📣 Send a squad alert to parents' phones</span></label><p class="hint">Only sent when the squad is new or has changed since the last alert.</p>`:""}
  <div class="btns"><button class="btn gold" id="pickSave">Save squad</button><button class="btn" id="pickSavePost">Save and make the squad post</button><button class="btn ghost" data-view="fixtures">Cancel</button></div></section>`}
function pickAlertable(m){return !m.practice&&!m.postponed&&!result(m)&&(m.date||"")>=todayLocal()&&!(m.live&&m.live.status&&m.live.status!=="pre")}
async function pickSave(){const pt=pickTourn();if(pt)return pickTSave(pt);const m=matches.find(x=>x.id===pickMatch);const roster=players.map(p=>p.name);const sq=[...PICK.set].sort((a,b)=>(+(players.find(p=>p.name===a)||{}).num||99)-(+(players.find(p=>p.name===b)||{}).num||99));
  const tell=!!($("#pickAlert")&&$("#pickAlert").checked&&sq.length);
  try{await db.collection("matches").doc(m.id).update({squad:sq});m.squad=sq;try{localStorage.removeItem(liveKey(m.id))}catch(e){}}catch(e){toast("Couldn't save the squad. Try again.");return null}
  // the alert goes to phones with kick-off reminders on; the function only sends it when the squad is new or changed
  const r=tell?await alSend({squad:m.id}):null;
  toast(`Squad saved: ${sq.length} players.${r==null?"":r>=0?" Parents with alerts on have been told.":" No change since the last alert, so none sent."}`);return m}
window.monthFixtures=ym=>sortMatches(matches.filter(m=>(m.date||"").startsWith(ym||"")&&!m.postponed&&m.stage!=="placeholder")).map(m=>Object.assign({},m,{res:result(m)}));
// ---------- matchday details (matches.matchday, supabase/9_matchday_and_more.sql): meet time, kit, pitch, postcode ----------
const MD=m=>m&&m.matchday||{};
const TKITS=()=>TEAM.kits||{home:{label:"Home"}},kitLabel=k=>!k?"":(TKITS()[k]&&TKITS()[k].label?TKITS()[k].label+" kit":k);
function mdBits(m){const d=MD(m);return [d.meet?`Meet ${d.meet}`:"",d.pitch?`Pitch ${d.pitch}`:"",kitLabel(d.kit)].filter(Boolean)}
const mapsUrl=m=>{const q=[m.venue,MD(m).postcode].filter(Boolean).join(", ");return q?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(q):""};
// weather for the venue at kick-off, from the postcode (postcodes.io) and Open-Meteo; neither needs a key or gets anything about the team
const WX={};const WXI={0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",53:"🌦️",55:"🌦️",61:"🌧️",63:"🌧️",65:"🌧️",66:"🌧️",67:"🌧️",71:"🌨️",73:"🌨️",75:"❄️",77:"🌨️",80:"🌦️",81:"🌧️",82:"⛈️",85:"🌨️",86:"❄️",95:"⛈️",96:"⛈️",99:"⛈️"};
function wxFor(m){const pc=(MD(m).postcode||"").replace(/\s+/g,"").toUpperCase();if(!pc||!m.date||m.postponed)return null;
  const days=(new Date(m.date+"T12:00:00")-Date.now())/864e5;if(days<-1||days>13)return null;
  const k=m.id+"|"+pc+"|"+(m.ko||"");if(k in WX)return WX[k];WX[k]=null;
  fetch("https://api.postcodes.io/postcodes/"+encodeURIComponent(pc)).then(r=>r.json()).then(j=>{const g=j&&j.result;if(!g)throw 0;
    return fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&wind_speed_unit=mph&timezone=Europe%2FLondon&start_date=${m.date}&end_date=${m.date}`)})
  .then(r=>r.json()).then(j=>{const h=j.hourly;if(!h)throw 0;const hr=+(/^(\d{1,2})/.exec(m.ko||"")||[0,12])[1];const i=Math.max(0,h.time.findIndex(t=>+t.slice(11,13)===hr));
    WX[k]={t:Math.round(h.temperature_2m[i]),p:h.precipitation_probability[i],c:h.weather_code[i],w:Math.round(h.wind_speed_10m[i])};if(["md","home","fixtures"].includes(view)&&!document.querySelector("#main form"))render()}).catch(()=>{});
  return null}
function wxText(m,bare){const w=wxFor(m);return w?`${bare?"":(WXI[w.c]||"🌡️")+" "}${w.t}°C${w.p!=null?`, ${w.p}% chance of rain`:""}${w.w>=15?`, windy (${w.w} mph)`:""}`:""}
// ---------- matchday: one screen for the whole day ----------
// Parents: arrival, directions, kit, weather, availability and last-minute changes. Coaches: squad, line-up and the
// live match (timer, subs, goals), plus messages. Afterwards: result, award, photos and the report.
let mdayMatch=null;
function mdayPick(){const t=todayLocal(),live=liveNow().find(m=>m.live.status!=="ft");if(live)return live;
  const today=sortMatches(matches.filter(m=>m.date===t&&!m.postponed));if(today.length)return today.find(m=>!result(m))||today[today.length-1];
  const recent=sortMatches(matches.filter(m=>result(m)&&m.date<t&&(new Date(t)-new Date(m.date))<=2*864e5));const nx=nextFixture();
  return nx&&(new Date(nx.date)-new Date(t))<=864e5?nx:recent[recent.length-1]||nx}
function matchdayView(){const m=matches.find(x=>x.id===mdayMatch)||mdayPick();if(!m)return `<div class="card empty">No game coming up yet.</div>`;mdayMatch=m.id;
  const r=result(m),live=isLive(m),done=!!r||(m.live&&m.live.status==="ft")||m.hidden&&!isFixture(m),d=MD(m),id=esc(m.id);
  const when=new Date(m.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const head=`<section class="card"><div class="kick hint" style="font-weight:800;text-transform:uppercase;letter-spacing:.08em">${live?"🔴 Live now":done?"Full time":"Matchday"} · ${esc(when)}</div><h2 style="margin:4px 0 0">${m.ha==="A"?"at":"v"} ${esc(m.opp||"TBC")}</h2>
    ${done&&!m.hidden&&r?`<p style="font:800 28px var(--body);margin:6px 0 0">${m.us}–${m.them} <span class="chip ${r}">${r}</span></p>`:""}${m.postponed?`<div class="note" style="margin-top:8px"><b>⚠️ Postponed.</b> New date to be confirmed.</div>`:""}${d.notice?`<div class="note" style="margin-top:8px"><b>📣 Latest:</b> ${esc(d.notice)}</div>`:""}</section>`;
  const facts=[["🕘",d.meet?`Arrive by ${d.meet}`:""],["⏰",m.ko?`${m.ko} kick-off`:"Kick-off TBC"],["📍",[m.venue,d.pitch?`Pitch ${d.pitch}`:""].filter(Boolean).join(" · ")],["👕",d.kit?`Wear the ${kitLabel(d.kit).toLowerCase()}`:""],[(w=>w&&WXI[w.c]||"🌡️")(wxFor(m)),(t=>t?t+" at kick-off":"")(wxText(m,true))]].filter(([,v])=>v);
  const parents=done?"":`<section class="card stack"><h3>For parents</h3><div class="mdinfo" style="display:flex;flex-direction:column;gap:6px;font-weight:600">${facts.map(([i,v])=>`<div><span style="display:inline-block;width:26px">${i}</span>${esc(v)}</div>`).join("")}</div>
    ${m.squad&&m.squad.length?`<p style="margin:0"><b>Squad:</b> ${m.squad.map(esc).join(", ")}</p>`:""}
    <div class="btns">${live?`<button class="btn gold" data-tl="${id}">Follow live</button>`:`<button class="btn gold" data-mdayav="${id}">Can your ${PRN.kid} make it?</button>`}${mapsUrl(m)?`<a class="btn ghost" href="${mapsUrl(m)}" target="_blank" rel="noopener">🧭 Directions</a>`:""}<button class="btn ghost" data-view="alerts">🔔 Alerts</button></div></section>`;
  const coach=!canWrite?"":done?`<section class="card stack edit-only"><h3>After the game</h3><div class="btns"><button class="btn gold" data-edit="${id}">Result and ${esc(POTM)}</button><button class="btn ghost" data-mdayrep="${id}">${m.report&&m.report.trim()?"Edit the report":"✨ Write the report"}</button><button class="btn ghost" data-gfx="ft" data-mid="${id}"${r?"":" disabled"}>Result post</button><button class="btn ghost" data-gfx="potm" data-mid="${id}"${m.potm?"":" disabled"}>PotM post</button></div><div class="btns">${galAdd(m.id)}</div></section>`
    :`<section class="card stack edit-only"><h3>For coaches</h3>${m.comp!=="Tournament"?`<div class="avsum" style="margin:0">${avSummary(m.id)}</div>`:""}
      <div class="btns"><button class="btn ghost" data-pick="${id}">${m.squad&&m.squad.length?`Squad picked (${m.squad.length})`:"Pick squad"}</button><button class="btn gold" data-live="${id}">▶ Line-up and live match</button><button class="btn ghost" data-tbmatch="${id}">📋 Tactics board</button><button class="btn ghost" data-msg="${id}">Parents' message</button><button class="btn ghost" data-medit="${id}">Matchday details</button></div>
      <p class="hint" style="margin:0">Live match has the line-up, the match timer, substitutions and ${SP.goals}; parents follow along and get alerts.</p></section>`;
  const after=!done?"":`${m.potm?`<section class="card"><h3>${esc(POTM.charAt(0).toUpperCase()+POTM.slice(1))}</h3><p style="font:800 22px var(--body);margin:0">${POTM_IC} ${esc(m.potm)}</p></section>`:""}
    ${m.report&&m.report.trim()?`<section class="card"><h3>Match report</h3><p style="margin:0">${esc(clip(m.report,320))}</p><div class="btns" style="margin-top:8px"><button class="btn ghost" data-md="${id}">Read it all</button></div></section>`:""}
    ${(ps=>ps.length?`<section class="card"><h3>Photos (${ps.length})</h3>${galGrid(ps)}</section>`:"")(galOf(m.id))}
    <div class="btns"><button class="btn ghost" data-md="${id}">Full match page</button>${m.live&&m.live.events&&m.live.events.length?`<button class="btn ghost" data-tl="${id}">Match timeline</button>`:""}</div>`;
  return `<div class="stack">${head}${parents}${coach}${after}</div>`}
function nextFixture(){const today=new Date().toISOString().slice(0,10);return sortMatches(matches.filter(m=>!result(m)&&!m.postponed&&!(m.hidden&&m.live&&m.live.status==="ft")&&(m.date||"")>=today))[0]}
function msgText(m){const d=new Date(m.date+"T12:00:00");
  return `${SP.ball} ${TEAM.ageGroup||"Match"}: ${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}\n\n${m.ha==="A"?"Away at":m.ha==="H"?"Home to":"v"} ${m.opp}${m.comp?` (${compName(m.comp)})`:""}\n${m.ko?`🕙 Kick-off ${m.ko}`:"🕙 Kick-off to be confirmed"}\n${MD(m).meet?`\n🕘 Meet at ${MD(m).meet}`:""}\n${m.venue?`📍 ${m.venue}${MD(m).pitch?`, pitch ${MD(m).pitch}`:""}`:"📍 Venue to be confirmed"}${MD(m).kit?`\n👕 ${kitLabel(MD(m).kit)}`:""}${mapsUrl(m)?`\n🧭 ${mapsUrl(m)}`:""}\n\nFollow the game live on the day:\n${siteUrl()}?live=${encodeURIComponent(m.id)}\n\nPlease let us know if your ${PRN.kid} can make it${PREQ?" (first time? type in your family code)":""}:\n${siteUrl()}?avail=${encodeURIComponent(m.id)}\n\nGet kick-off and ${SP.goal} alerts on your phone:\n${siteUrl()}?alerts\n\nThank you! ${TEAM.cheer||SP.ball}`}
function msgView(){const m=matches.find(x=>x.id===msgMatch)||nextFixture();if(!m)return `<div class="card empty">No upcoming fixtures.</div>`;
  return `<section class="card stack"><h2>Parents' message</h2><p class="hint">Copy this into the parents' WhatsApp group. The link lets each parent say whether their ${PRN.kid} can make it, and you'll see the answers on the Fixtures page.</p>
  <textarea id="msgText" rows="12" style="width:100%;font:15px var(--body)">${esc(msgText(m))}</textarea>
  <div class="btns"><button class="btn gold" id="copyMsg">Copy message</button><button class="btn ghost" data-view="fixtures">Back to fixtures</button></div></section>`}
let msgMatch=null,msgChase=false;
// a reminder for the parents' group naming only the players we haven't heard about
function chaseText(m){const d=new Date(m.date+"T12:00:00"),w=avWaiting(m.id);
  return `⏳ Still waiting to hear about ${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}${m.opp?` ${m.ha==="A"?"at":"v"} ${m.opp}`:""}.\n\nNot answered yet: ${w.join(", ")}\n\nPlease tap your ${PRN.kid}'s name and choose Yes, Maybe or No, so we can pick the squad:\n${siteUrl()}?avail=${encodeURIComponent(m.id)}\n\nThank you! ${TEAM.cheer||SP.ball}`}
function chaseView(){const m=matches.find(x=>x.id===msgMatch);if(!m)return `<div class="card empty">That fixture couldn't be found.</div>`;const w=avWaiting(m.id);
  if(!w.length)return `<section class="card stack"><h2>Chase replies</h2><p>Everyone has answered for this game. Nothing to chase.</p><div class="btns"><button class="btn ghost" data-view="fixtures">Back to fixtures</button></div></section>`;
  return `<section class="card stack"><h2>Chase replies</h2><p class="hint">${w.length} ${w.length===1?"player hasn't":"players haven't"} answered yet. Send this to the parents' WhatsApp group. It names only first names, and the answers stay private to the coaches.</p>
  <textarea id="msgText" rows="10" style="width:100%;font:15px var(--body)">${esc(chaseText(m))}</textarea>
  <div class="btns"><button class="btn" id="waMsg">Open in WhatsApp</button><button class="btn ghost" id="copyMsg">Copy message</button><button class="btn ghost" data-view="fixtures">Back to fixtures</button></div></section>`}

// ---------- match alerts (phone notifications) ----------
// Families turn these on per phone. The "notify" Supabase function sends kick-off reminders 10 and 2 minutes (not for tournament games)
// before and live updates (line-up, kick-off, goals, subs, half time, full time). iPhones only allow it from the home-screen app.
// Each phone picks what it gets: reminders (squad, preview, kick-off, postponed), goals, results (full time and player of the match), or everything live.
const AL={sub:null,checked:false,busy:false,prefs:{reminders:true,goals:false,results:false,live:true}};
try{Object.assign(AL.prefs,JSON.parse(localStorage.getItem(SK+".alerts")||"{}"))}catch(e){}
function alIos(){return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1)}
function alStandalone(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}
function alSupported(){return "serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window&&!!CFG.vapidPublicKey}
async function alCheck(){if(!alSupported()){AL.checked=true;return}try{const r=await navigator.serviceWorker.ready;AL.sub=await r.pushManager.getSubscription()}catch(e){}AL.checked=true;if(view==="alerts")render()}
function alKey(b64){const p=(b64+"=".repeat((4-b64.length%4)%4)).replace(/-/g,"+").replace(/_/g,"/");return Uint8Array.from(atob(p),c=>c.charCodeAt(0))}
async function alSave(sub){const j=sub.toJSON(),P=AL.prefs,a={p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth,p_reminders:P.reminders,p_live:P.live};
  let {error}=await sb.rpc("push_subscribe2",Object.assign({p_goals:!!P.goals,p_results:!!P.results},a));
  if(error)({error}=await sb.rpc("push_subscribe",Object.assign({},a,{p_live:P.live||P.goals||P.results})));// a database without supabase/9_matchday_and_more.sql
  if(error)throw error;try{localStorage.setItem(SK+".alerts",JSON.stringify(AL.prefs))}catch(e){}return j.endpoint}
async function alOn(){if(AL.busy)return;AL.busy=true;render();
  try{if(await Notification.requestPermission()!=="granted"){toast("Alerts weren't allowed on this phone.");return}
    const r=await navigator.serviceWorker.ready;const sub=(await r.pushManager.getSubscription())||await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:alKey(CFG.vapidPublicKey)});
    const ep=await alSave(sub);AL.sub=sub;sb.functions.invoke("notify",{body:fnBody({test:ep})}).catch(()=>{});toast("Alerts are on. You should get a test one now.")}
  catch(e){toast("Couldn't turn alerts on. Try again in a moment.")}finally{AL.busy=false;render()}}
async function alTest(){if(!AL.sub)return;AL.busy=true;render();try{const {data,error}=await sb.functions.invoke("notify",{body:fnBody({test:AL.sub.endpoint})});toast(!error&&data&&data.test>0?"Test alert sent. It should arrive in a few seconds.":"The test alert didn't go. Turn alerts off and on again.")}catch(e){toast("Couldn't send a test alert. Check your connection.")}finally{AL.busy=false;render()}}
async function alOff(){if(!AL.sub)return;AL.busy=true;render();try{const ep=AL.sub.endpoint;await AL.sub.unsubscribe();await sb.rpc("push_unsubscribe",{p_endpoint:ep});AL.sub=null;toast("Alerts are off on this phone.")}catch(e){toast("Couldn't turn alerts off. Try again.")}finally{AL.busy=false;render()}}
// after a live update from the coach's phone: send any new alerts straight away (the every-minute check is the back-up)
function alNotify(id){if(sb&&id&&id!=="practice"&&!CFG.schema)sb.functions.invoke("notify",{body:fnBody({match:id})}).catch(()=>{})}
// squad and player of the match alerts: resolves to how many phones were sent it, -1 when nothing needed sending, null when it failed
async function alSend(body){if(!sb||CFG.schema)return null;   // no match alerts yet for a team sharing a project
try{const {data,error}=await sb.functions.invoke("notify",{body:fnBody(body)});if(error||!data)return null;const v=data.squad??data.tsquad??data.potm??data.postponed??data.preview??data.tournament;return typeof v==="number"?v:null}catch(e){return null}}
function alertsView(){if(!AL.checked)alCheck();
  const head=`<h2>🔔 Match alerts</h2><p>Get a message on this phone when the squad is picked, before kick-off, and on match day. You choose how much.</p>`;
  let bodyHtml;
  if(!CFG.vapidPublicKey)bodyHtml=`<div class="note">${window.DEMO?"Match alerts are switched off in this demo. On a real team site, parents get them on their phones.":"Match alerts aren't switched on for this team yet. Everything else on the site works as normal."}</div>`;
  else if(alIos()&&!alStandalone())bodyHtml=`<div class="note">On an iPhone or iPad, alerts only work from the club app on your home screen:<br>1. Tap the Share button <b>⬆︎</b> in Safari (on newer iPhones tap <b>⋯</b> first, then <b>Share</b>).<br>2. Scroll down, tap <b>Add to Home Screen</b>, then <b>Add</b>.<br>3. Open <b>${esc(APP)}</b> from your home screen and come back to this page.</div>`;
  else if(!alSupported())bodyHtml=`<div class="note">This browser can't show alerts. On Android use Chrome; on iPhone add the site to your home screen first.</div>`;
  else if(Notification.permission==="denied")bodyHtml=`<div class="note">Alerts are blocked for this site on this phone. Allow notifications for it in your phone's settings, then come back here.</div>`;
  else{const on=!!AL.sub;
    const box=(id,k,label,hint)=>`<label class="row" style="cursor:pointer"><span style="white-space:nowrap"><input type="checkbox" id="${id}"${AL.prefs[k]?" checked":""}${k!=="reminders"&&k!=="live"&&AL.prefs.live?" disabled":""} style="width:20px;height:20px;vertical-align:-4px;margin-right:8px">${label}</span><span class="hint">${hint}</span></label>`;
    bodyHtml=`<p class="hint" style="margin:0">Choose what this phone gets:</p><div class="av">${box("al-rem","reminders","Reminders","squad picked, match previews, 10 and 2 minutes before kick-off, games postponed")}
      ${TEAM.publicScores===false?"":box("al-goals","goals",SP.Goals,`each ${SP.goal} as it goes in`)}
      ${box("al-res","results","Results",`full time and the ${esc(POTM)}`)}
      ${box("al-live","live","Everything live",`line-up, kick-off, ${TEAM.publicScores===false?"":SP.goals+", "}subs, half time and full time`)}</div>
      <div class="btns">${on?`<span class="pill">✅ On for this phone</span><button class="btn ghost" id="alTest"${AL.busy?" disabled":""}>Send a test alert</button><button class="btn ghost" id="alOff"${AL.busy?" disabled":""}>Turn off</button>`:`<button class="btn gold" id="alOn"${AL.busy?" disabled":""}>${AL.busy?"Turning on…":"Turn on alerts"}</button>`}</div>`}
  const help=`<details class="note"><summary><b>How to set it up on your phone</b></summary>
    <p><b>iPhone or iPad:</b> open this site in Safari, tap Share <b>⬆︎</b>, then <b>Add to Home Screen</b>. Open ${esc(APP)} from your home screen, come back to this page and tap <b>Turn on alerts</b>, then <b>Allow</b>. Needs iOS 16.4 or later.</p>
    <p><b>Android:</b> open this site in Chrome, tap <b>Turn on alerts</b>, then <b>Allow</b>. Adding it to your home screen (⋮ menu, <b>Add to Home screen</b>) makes it open like an app.</p>
    <p><b>Computer:</b> Chrome, Edge and Firefox all work. Tap <b>Turn on alerts</b> and allow notifications when asked.</p>
    <p><b>Nothing arriving?</b> Tap <b>Send a test alert</b>. If it doesn't come, check notifications are allowed for ${esc(APP)} (or your browser) in your phone's settings, and that Do Not Disturb or Focus is off.</p></details>`;
  return `<section class="card stack">${head}${bodyHtml}${help}<p class="hint">Each phone is set up on its own. We don't ask for your name, number or email, and alerts only use first names already on this site.</p></section>`}

// ---------- get the app: install the site on the home screen ----------
// Chrome and Edge offer a one-tap install (beforeinstallprompt); iPhones need Safari's Share > Add to Home Screen.
let INSTALL=null;
addEventListener("beforeinstallprompt",e=>{e.preventDefault();INSTALL=e;if(view==="app")render()});
addEventListener("appinstalled",()=>{INSTALL=null;toast(`${APP} is on your home screen.`);if(view==="app")render()});
function appView(){const link=`${SITE}/?app`,ua=navigator.userAgent,ios=alIos(),android=/android/i.test(ua),phone=ios||android;
  const notSafari=ios&&/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp|GSA\//.test(ua);
  const head=`<h2>📲 Get the app</h2><p>Put ${esc(APP)} on your home screen. It opens like any other app, works with a poor signal at the ground, and can send you match alerts.</p>`;
  let how;
  if(alStandalone())how=`<div class="note">✅ You're using the app. Turn on match alerts so you don't miss kick-off, ${SP.goals} and full time.</div><div class="btns"><button class="btn gold" data-view="alerts">🔔 Match alerts</button></div>`;
  else if(INSTALL)how=`<div class="btns"><button class="btn gold bigbtn" id="appInstall">Install ${esc(APP)}</button></div><p class="hint">Free, no app store needed, and it takes a couple of seconds.</p>`;
  else if(notSafari)how=`<div class="note">On an iPhone this needs Safari. Copy the link, open Safari, paste it in the address bar, then follow the steps that appear.</div><div class="btns"><button class="btn gold" data-appcopy="${esc(link)}">Copy the link</button></div>`;
  else if(ios)how=`<ol class="steps"><li>Tap the Share button <b>⬆︎</b> at the bottom of Safari (on newer iPhones tap <b>⋯</b> first, then <b>Share</b>).</li><li>Scroll down and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>. ${esc(APP)} is now on your home screen with the club crest.</li></ol>`;
  else if(android)how=`<ol class="steps"><li>Open this page in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu at the top right.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>, then <b>Install</b>.</li></ol>`;
  else how=`<p>You're on a computer. Send yourself this link and open it on your phone:</p><div class="btns"><button class="btn gold" data-appcopy="${esc(link)}">Copy the link</button></div>`;
  const next=alStandalone()?"":`<p class="hint">Then open ${esc(APP)} from your home screen and tap <b>🔔 Match alerts</b> to choose which alerts you get.${ios?" On an iPhone, alerts only work from the home-screen app.":""}</p>`;
  const share=phone||alStandalone()?`<p class="hint">Helping another parent? Send them <button class="mini" data-appcopy="${esc(link)}">this link</button> and it opens these steps.</p>`:"";
  return `<section class="card stack">${head}${how}${next}${share}</section>`}

// ---------- privacy notice for parents (footer link, or ?privacy) ----------
// The club is the data controller; Touchline Tales is its processor (touchlinetales.club/dpa/). Keep this in step with what the database stores.
function privacyView(){const club=esc((TEAM.club&&TEAM.club.name)||TEAM.fullName||TEAM.name||"the club"),team=esc(`${TEAM.name||""} ${TEAM.ageGroup||""}`.trim()||"team"),kid=esc(PL.replace(/s$/,""));
  const sec=(h,b)=>`<section class="card"><h3>${h}</h3>${b}</section>`;
  return `<div class="stack"><h2 style="margin:6px 0 -6px">🔒 Privacy</h2><p class="hint">How this site looks after your child's details. Last updated October 2026.</p>
  ${sec("Who's in charge",`<p>This site is run by <b>${club}</b> for its <b>${team}</b>. The club decides what goes on it and is responsible for your child's information (the "data controller"). Touchline Tales builds and hosts the site for the club and only uses the information to run it (the "data processor").</p>`)}
  ${sec("What's on the site about the children",`<ul><li>First names only, and a shirt number if the team uses them. Never surnames, ages, birthdays, schools or addresses.</li><li>Match details: who played, ${RUGBY?"tries, kicks and points":"goals, assists, saves"}, playing time, awards and milestones, and match reports the coaches write.</li><li>Availability answers for each game, and training attendance. Only the coaches can see these, and each signed-in family sees its own answers.</li><li>A small profile picture of a ${kid}, but only if the club has their parent's consent. Ask the coach to take one down at any time. There's no photo gallery.</li></ul>`)}
  ${sec("What we keep about you and your phone",`<ul><li>Nothing that names you. Parents never give us a name or email address.</li><li>If you sign in with your ${kid}'s family code: a random sign-in id for your phone, which ${kid} it's linked to and when. Your availability answers and votes then count for your family. The link is deleted when you sign the phone out, when the coach makes a new code, or when your ${kid} leaves the squad. Only the coaches see family codes, and only how many phones use each one. Supabase, which runs the sign-in, keeps short technical logs that include your phone's internet address.</li><li>If you turn on match alerts, the web address your phone's alert service gives us (from Apple, Google or Mozilla) and which alerts you picked. It's deleted when you turn alerts off.</li><li>If you vote in a poll, your family (when signed in) or a random code made on your phone, so each family or phone votes once.</li><li>If you send a cheer: which cheer, the first name you typed (if any) and a random code made on your phone, used only to stop floods of cheers. Cheers and the names on them show to anyone with the link, so only type your own first name. Coaches can hide any cheer. Cheers are deleted 30 days after they're sent.</li><li>Your settings, saved on your own phone. We also count visits each day (a number only, not who visited).</li></ul><p>Coaches sign in with an email link. We keep their email address, when they signed in, and any change requests they send through the site.</p>`)}
  ${sec("Why we use it",`<p>To run the team and keep families up to date. The club relies on its legitimate interest in doing that, and on consent for profile pictures.</p>`)}
  ${sec("Who can see it",`<p>Anyone with the link can see results, the squad's first names, stats, match reports and profile pictures. The site is kept out of Google and parents get the link from the club.${noScores()?" This team hides scores and scorers from visitors"+(RUGBY?" for younger age groups.":", as the FA asks for younger age groups."):""} Nobody's information is sold or used for advertising.</p>`)}
  ${sec("Who helps run it",`<p>Supabase stores the team's database in London. GitHub hosts the web pages. Google Fonts and jsDelivr supply the lettering and some code, so they see your phone's internet address when a page loads. Apple, Google or Mozilla deliver alerts. Touchline Tales uses Claude (Anthropic) to help handle coaches' change requests. Some of these are US companies; they protect information under UK-approved safeguards.</p>`)}
  ${sec("How long we keep it",`<p>Results and stats stay as the team's history while the club uses the site. A coach can remove a player at any time. If the club stops using Touchline Tales, everything is deleted within 30 days.</p>`)}
  ${sec("Your rights",`<p>You can ask to see, correct or delete your child's information, or object to it being shown. Speak to the team's coach or the club's ${WELFARE}, or email <a href="mailto:hello@touchlinetales.club">hello@touchlinetales.club</a> and we'll pass it on to the club.</p><p>If you're unhappy, you can complain to the Information Commissioner's Office at <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener">ico.org.uk/make-a-complaint</a> or on 0303 123 1113.</p>`)}
  <div class="btns"><button class="btn ghost" data-view="home">Back to the home page</button></div></div>`}

// ---------- photo gallery ----------
// public.match_photos rows point at files in the public "gallery" storage bucket (supabase/4_gallery_training.sql).
// Coaches add photos from a match page or the Photos page. Each one is re-drawn (1600px max, plus a 480px thumbnail),
// which also drops the location data phones put in pictures.
let GAL=[],galMatch="",LB=null;
// Edge functions serve the project's own team; another team sharing the project says which schema is theirs.
const fnBody=b=>CFG.schema?Object.assign({schema:CFG.schema},b):b;
const galBucket=()=>CFG.schema?CFG.schema+"-gallery":"gallery";
const galUrl=p=>CFG.supabaseUrl+"/storage/v1/object/public/"+galBucket()+"/"+String(p).split("/").map(encodeURIComponent).join("/");
// The Photos page is archived until parents have their own login: no tab, tile or match-page photos, and nothing is loaded.
// Player profile pictures (player_photos) are separate and stay. A team can bring Photos back with photos: true in team.js.
const PHOTOS_ON=TEAM.photos===true;
async function loadGallery(){if(!sb||!PHOTOS_ON){GAL=[];return}try{const {data}=await sb.from("match_photos").select("*").order("created");GAL=data||[]}catch(e){GAL=[]}}
const galOf=id=>GAL.filter(p=>p.match_id===id);
function galGrid(list){return `<div class="gal">${list.map(p=>`<button class="gal-th" data-photo="${esc(p.id)}" aria-label="${esc(p.caption||"Open photo")}"><img src="${galUrl(p.thumb)}" alt="" loading="lazy"></button>`).join("")}</div>`}
function galAdd(id){return canWrite&&id?`<label class="btn gold galadd edit-only">📷 Add photos<input type="file" accept="image/*" multiple data-galup="${esc(id)}" hidden></label>`:""}
function photosCard(m){if(!PHOTOS_ON)return "";const ps=galOf(m.id);if(!ps.length&&!(canWrite&&!isFixture(m)))return "";
  return `<section class="card"><h3>Photos${ps.length>1?` (${ps.length})`:""}</h3>${ps.length?galGrid(ps):`<p class="hint">No photos from this game yet.</p>`}${canWrite?`<div class="btns edit-only" style="margin-top:10px">${galAdd(m.id)}</div>`:""}</section>`}
// newest games with photos, each as an album card
function albums(n){const ids=[...new Set(GAL.slice().reverse().map(p=>p.match_id))].slice(0,n);
  return `<div class="albs">${ids.map(id=>{const ps=galOf(id),m=matches.find(x=>x.id===id),c=ps.find(p=>p.caption)||ps[0],rest=ps.filter(p=>p!==c),strip=rest.slice(0,3),more=ps.length-1-strip.length;
    const th=p=>`<button class="gal-th" data-photo="${esc(p.id)}" aria-label="${esc(p.caption||"Open photo")}"><img src="${galUrl(p.thumb)}" alt="${esc(p.caption||"")}" loading="lazy"></button>`;
    return `<div class="alb">${th(c)}${strip.length?`<div class="alb-strip">${strip.map((p,i)=>i===strip.length-1&&more>0?`<div class="alb-more">${th(p)}<span>+${more}</span></div>`:th(p)).join("")}</div>`:""}
      <button class="alb-meta" data-md="${esc(id)}" style="text-align:left;border:0;background:none;cursor:pointer"><b>${m?`${m.ha==="A"?"at ":"v "}${esc(m.opp||"")}`:"Match photos"}</b><small>${m?esc(shortDay(m.date)):""} · ${ps.length} photo${ps.length===1?"":"s"}</small>${c.caption?`<i>${esc(c.caption)}</i>`:""}</button></div>`}).join("")}</div>`}
function galLabel(m){return `${shortDay(m.date)} · v ${esc(m.opp||"")}${result(m)?` · ${m.us}–${m.them}`:""}`}
function shortDay(iso){const d=new Date((iso||"")+"T12:00:00");return isNaN(d)?"":d.toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}
if(!PHOTOS_ON)document.querySelectorAll('nav.tabs [data-view="gallery"]').forEach(b=>b.remove());
function galleryView(){
  const ids=new Set(GAL.map(p=>p.match_id));const ms=sortMatches(matches.filter(m=>ids.has(m.id))).reverse();
  let up="";
  if(canWrite){const recent=sortMatches(matches.filter(m=>!m.practice&&!m.postponed&&(result(m)||isLive(m)||(m.date||"")<=todayLocal()))).reverse().slice(0,15);
    if(!recent.some(m=>m.id===galMatch))galMatch=recent[0]?recent[0].id:"";
    up=`<section class="card edit-only"><h3>Add photos</h3><label class="f">Which game?<select id="galPick">${recent.map(m=>`<option value="${esc(m.id)}"${m.id===galMatch?" selected":""}>${galLabel(m)}</option>`).join("")}</select></label>
      <div class="btns" style="margin-top:10px">${galAdd(galMatch)}</div><p class="hint" style="margin-top:8px">Everyone can see photos once they're added. You can also add them from any match page.</p></section>`}
  const body=ms.length?ms.map(m=>`<section class="card"><button class="gal-h" data-md="${esc(m.id)}">${galLabel(m)} <span>Match page →</span></button>${galGrid(galOf(m.id))}</section>`).join("")
    :`<div class="card empty">No photos yet. The coaches will add match-day pictures here.</div>`;
  return `<div class="stack"><h2 style="margin:6px 0 -6px">📸 Photos</h2><p class="hint">Match-day pictures, newest game first. Tap a photo to see it full size.</p>${up}${body}</div>`}
function galShrink(file,max,q){return new Promise((ok,bad)=>{const url=URL.createObjectURL(file),im=new Image();
  im.onload=()=>{const k=Math.min(1,max/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement("canvas");c.width=Math.round(im.naturalWidth*k);c.height=Math.round(im.naturalHeight*k);
    c.getContext("2d").drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(b=>b?ok({b,w:c.width,h:c.height}):bad(new Error("encode")),"image/jpeg",q)};
  im.onerror=()=>{URL.revokeObjectURL(url);bad(new Error("decode"))};im.src=url})}
async function galUpload(mid,files){files=[...files];if(!files.length||!canWrite||!mid)return;let ok=0;
  for(let i=0;i<files.length;i++){toast(`Adding photo ${i+1} of ${files.length}…`);
    try{const id=crypto.randomUUID(),big=await galShrink(files[i],1600,.85),sm=await galShrink(files[i],480,.75),path=`${mid}/${id}.jpg`,thumb=`${mid}/${id}_t.jpg`;
      for(const [p,b] of [[path,big.b],[thumb,sm.b]]){const {error}=await sb.storage.from(galBucket()).upload(p,b,{contentType:"image/jpeg",cacheControl:"31536000"});if(error)throw error}
      const {data,error}=await sb.from("match_photos").insert({id,match_id:mid,path,thumb,w:big.w,h:big.h}).select().single();if(error)throw error;GAL.push(data);ok++}
    catch(e){console.warn("photo upload",e)}}
  toast(ok===files.length?`${ok} photo${ok>1?"s":""} added.`:ok?`${ok} of ${files.length} photos added. Try the others again.`:"Couldn't add those photos. Check your signal and try again.");render()}
// full-screen viewer: arrows or swipe for the next photo, Esc or ✕ to close
function lbOpen(id){const p=GAL.find(x=>x.id===id);if(!p)return;const list=galOf(p.match_id);LB={list,i:list.indexOf(p)};lbDraw()}
function lbClose(){LB=null;document.querySelectorAll(".lb-ov").forEach(x=>x.remove());document.body.classList.remove("lb-on")}
function lbStep(n){if(!LB||LB.list.length<2)return;LB.i=(LB.i+n+LB.list.length)%LB.list.length;lbDraw()}
function lbDraw(){document.querySelectorAll(".lb-ov").forEach(x=>x.remove());const p=LB&&LB.list[LB.i];if(!p){lbClose();return}
  const m=matches.find(x=>x.id===p.match_id),many=LB.list.length>1,d=document.createElement("div");d.className="lb-ov";d.setAttribute("role","dialog");d.setAttribute("aria-label","Photo");
  d.innerHTML=`<div class="lb-top"><span>${many?`${LB.i+1} of ${LB.list.length}`:""}${m?`${many?" · ":""}v ${esc(m.opp)}, ${shortDay(m.date)}`:""}</span><button class="lb-x" data-lb="x" aria-label="Close">✕</button></div>
    <div class="lb-img"><img src="${galUrl(p.path)}" alt="${esc(p.caption||"Match photo")}"></div>${p.caption?`<p class="lb-cap">${esc(p.caption)}</p>`:""}
    <div class="lb-bar">${many?`<button class="btn ghost" data-lb="prev" aria-label="Previous photo">←</button>`:""}<a class="btn ghost" href="${galUrl(p.path)}?download=${fileTag}-${esc(p.id.slice(0,8))}.jpg">Save</a>${canWrite?`<button class="btn ghost" data-lb="cap">${p.caption?"Edit caption":"Add caption"}</button><button class="btn ghost" data-lb="del">Delete</button>`:""}${many?`<button class="btn ghost" data-lb="next" aria-label="Next photo">→</button>`:""}</div>`;
  let sx=null;d.addEventListener("touchstart",e=>{sx=e.touches[0].clientX},{passive:true});d.addEventListener("touchend",e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>50)lbStep(dx<0?1:-1)});
  document.body.appendChild(d);document.body.classList.add("lb-on")}
async function lbAction(a){const p=LB&&LB.list[LB.i];if(a==="x"||a==="bg"){lbClose();return}if(a==="prev"){lbStep(-1);return}if(a==="next"){lbStep(1);return}if(!p||!canWrite)return;
  if(a==="cap"){const c=prompt("Caption (first names only)",p.caption||"");if(c==null)return;const {error}=await sb.from("match_photos").update({caption:c.trim()}).eq("id",p.id);if(error){toast("Couldn't save the caption.");return}p.caption=c.trim();lbDraw();return}
  if(a==="del"){if(!confirm("Delete this photo for everyone?"))return;const {error}=await sb.from("match_photos").delete().eq("id",p.id);if(error){toast("Couldn't delete it. Try again.");return}
    sb.storage.from(galBucket()).remove([p.path,p.thumb]).catch(()=>{});GAL=GAL.filter(x=>x.id!==p.id);LB.list.splice(LB.i,1);if(LB.i>=LB.list.length)LB.i=0;toast("Photo deleted.");lbDraw();render()}}
document.addEventListener("keydown",e=>{if(!LB)return;if(e.key==="Escape")lbClose();else if(e.key==="ArrowRight")lbStep(1);else if(e.key==="ArrowLeft")lbStep(-1)});

// ---------- calendar ----------
// The "calendar" Supabase function serves every fixture, tournament and training session as a feed that phones
// subscribe to and re-check by themselves (supabase/functions/calendar).
let calTraining=true;
const CAL_URL=()=>{const q=new URLSearchParams();if(!calTraining)q.set("training","0");
  if(CFG.schema){q.set("team",CFG.schema);q.set("site",location.origin+location.pathname)}
  return CFG.supabaseUrl+"/functions/v1/calendar"+(q.toString()?"?"+q:"")};
function calendarView(){const https=CAL_URL(),web=https.replace(/^https:/,"webcal:");
  return `<section class="card stack"><h2>🗓️ Fixtures in your calendar</h2>
    <p style="margin:0">Add every game to your phone's calendar in one go. When a kick-off time or venue is added or changes, your calendar updates by itself.</p>
    <label class="row" style="cursor:pointer;font-weight:700"><input type="checkbox" id="calTr"${calTraining?" checked":""} style="width:20px;height:20px;vertical-align:-4px;margin-right:8px">Include Wednesday training</label>
    <div class="calopts"><a class="btn gold" href="${web}">📱 iPhone or iPad</a><a class="btn gold" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(web)}" target="_blank" rel="noopener">Google Calendar (Android)</a><a class="btn ghost" href="https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent(APP)}" target="_blank" rel="noopener">Outlook</a><button class="btn ghost" id="calCopy" data-url="${esc(https)}">Copy link</button></div>
    <div class="note"><b>iPhone:</b> tap the button, then <b>Subscribe</b> and <b>Add</b>.<br><b>Android:</b> Google Calendar opens in your browser. Sign in if asked, tap <b>Add</b>, and the games appear in your Calendar app.<br><b>Anything else:</b> copy the link and add it as a calendar "from the internet" or "by URL".</div>
    <p class="hint">iPhones check for changes every few hours; Google can take up to a day. Games with no kick-off time yet show as all-day until the time is known.</p></section>`}
const ICS_TZ="BEGIN:VTIMEZONE\r\nTZID:Europe/London\r\nBEGIN:DAYLIGHT\r\nTZOFFSETFROM:+0000\r\nTZOFFSETTO:+0100\r\nTZNAME:BST\r\nDTSTART:19700329T010000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nEND:DAYLIGHT\r\nBEGIN:STANDARD\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0000\r\nTZNAME:GMT\r\nDTSTART:19701025T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nEND:STANDARD\r\nEND:VTIMEZONE";
// one game as a file, for "Add to calendar" on a match page (the feed above keeps it up to date; this doesn't)
function matchIcs(m){const e=s=>String(s||"").replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\n/g,"\\n"),k=/^(\d{1,2}):(\d{2})/.exec(m.ko||""),d=m.date.replace(/-/g,"");
  const nx=new Date(m.date+"T12:00:00Z");nx.setUTCDate(nx.getUTCDate()+1);const url=`${SITE}/?match=${encodeURIComponent(m.id)}`;
  const when=k?[`DTSTART;TZID=Europe/London:${d}T${k[1].padStart(2,"0")}${k[2]}00`,`DTEND;TZID=Europe/London:${d}T${String(Math.min(23,+k[1]+1)).padStart(2,"0")}${k[2]}00`]:[`DTSTART;VALUE=DATE:${d}`,`DTEND;VALUE=DATE:${nx.toISOString().slice(0,10).replace(/-/g,"")}`];
  return ["BEGIN:VCALENDAR","VERSION:2.0",`PRODID:-//${TEAM.fullName||APP}//${TEAM.ageShort||""}//EN`,ICS_TZ,"BEGIN:VEVENT",`UID:match-${m.id}@${SITE.replace(/^https?:\/\//,"")}`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").replace(/\.\d+/,"")}`,...when,
    `SUMMARY:${e(`${SP.ball} ${APP} v ${m.opp}${k?"":" (kick-off TBC)"}`)}`,m.venue?`LOCATION:${e(m.venue)}`:"",`DESCRIPTION:${e(`${compName(m.comp||"")}\n${k?`Kick-off ${m.ko}`:"Kick-off time to be confirmed"}\n${url}`)}`,`URL:${url}`,"END:VEVENT","END:VCALENDAR"].filter(Boolean).join("\r\n")+"\r\n"}
function downloadIcs(m){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([matchIcs(m)],{type:"text/calendar"}));a.download=`${fileTag}-${slug(m.opp||"match")}-${m.date}.ics`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}

// ---------- parent votes (public.polls, supabase/9_matchday_and_more.sql) ----------
// Goal of the month and players' player of the season. One vote per phone (a random id kept on it), or one per family
// once parents sign in with a family code; totals show to coaches straight away and to everyone once the vote closes.
let POLLS=[],PTOT={},pollNew=null;
const pollOpen=p=>!p.closed&&!(p.closes&&new Date(p.closes)<new Date());
const voterId=()=>{try{let v=localStorage.getItem(SK+".voter");if(!v){v=Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");localStorage.setItem(SK+".voter",v)}return v}catch(e){return null}};
const myVotes=()=>{if(myKids().length)return FAMV;try{return JSON.parse(localStorage.getItem(SK+".votes")||"{}")}catch(e){return {}}};
async function loadPolls(){if(!sb)return;try{const {data,error}=await sb.from("polls").select("*").order("created",{ascending:false});if(error)return;POLLS=data||[];
  await Promise.all(POLLS.filter(p=>canWrite||!pollOpen(p)).map(async p=>{const {data:t}=await sb.rpc("poll_totals",{p_poll:p.id});PTOT[p.id]=Object.fromEntries((t||[]).map(r=>[r.choice,+r.votes]))}))}catch(e){}}
// goals from live match mode in a month, as choices for goal of the month
function monthGoals(ym){return sortMatches(matches.filter(m=>(m.date||"").startsWith(ym))).flatMap(m=>((m.live&&m.live.events)||[]).filter(e=>e.k==="goal"&&e.n&&(!e.t||e.t==="try")).map(e=>`${e.n} v ${m.opp}${e.m?` (${e.m})`:""}`))}
function pollCard(p){const mine=myVotes()[p.id],fam=myKids().length>0,locked=PREQ&&!canWrite&&!fam,open=pollOpen(p),tot=PTOT[p.id],sum=tot?Object.values(tot).reduce((a,b)=>a+b,0):0,top=tot?Math.max(0,...Object.values(tot)):0;
  return `<section class="card stack"><h3>${p.kind==="gotm"?SP.ball:p.kind==="potss"?"🏅":"🗳️"} ${esc(p.title)}</h3>
    <p class="hint" style="margin:0">${open?`${p.closes?`Voting closes ${esc(new Date(p.closes).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"}))}. `:""}${fam?"One vote per family":"One vote per phone"}. You can change it until it closes.`:"Voting has closed."}</p>
    <div class="av">${(p.options||[]).map((o,i)=>{const n=tot?tot[i]||0:null;return `<div class="row"><span>${esc(o)}${n!=null?` <b>${n}</b>${n&&n===top&&!open?" 🏆":""}`:""}</span>${open&&!locked?`<button class="mini" data-vote="${esc(p.id)}|${i}" aria-pressed="${mine===i}">${mine===i?"✓ Your vote":"Vote"}</button>`:""}</div>${n!=null&&sum?`<div class="ptbar" style="margin:-4px 0 6px"><i style="width:${n/sum*100}%"></i></div>`:""}`}).join("")}</div>
    ${open&&locked?`<div class="btns"><span class="hint">Parents vote once they've signed in with their family code.</span><button class="mini" data-view="parents" data-pnext="votes">Sign in to vote</button></div>`:""}
    ${canWrite?`<div class="btns edit-only"><span class="hint">${sum} vote${sum===1?"":"s"} so far. Only coaches see totals before it closes.</span>${open?`<button class="mini" data-pollclose="${esc(p.id)}">Close the vote</button>`:""}<button class="mini" data-polldel="${esc(p.id)}">Delete</button></div>`:""}</section>`}
function votesView(){
  if(pollNew&&canWrite)return pollForm();
  const open=POLLS.filter(pollOpen),past=POLLS.filter(p=>!pollOpen(p));
  return `<div class="stack"><section class="card"><h2>🗳️ Votes</h2><p class="hint">${noScores()?"":`${RUGBY?"Try":"Goal"} of the month, `}players' player of the season and more. Tap to vote.</p>${canWrite?`<div class="btns edit-only" style="margin-top:8px">${noScores()?"":`<button class="btn gold" data-pollnew="gotm">${RUGBY?"Try":"Goal"} of the month</button>`}<button class="btn gold" data-pollnew="potss">Players' player of the season</button><button class="btn ghost" data-pollnew="other">Another vote</button></div>`:""}</section>
    ${open.length?open.map(pollCard).join(""):`<div class="card empty">No votes open right now.</div>`}
    ${past.length?`<h2 class="sect">Past votes</h2>${past.map(pollCard).join("")}`:""}</div>`}
function pollForm(){const k=pollNew.kind,lastMonth=(d=>{d.setDate(0);return d.toISOString().slice(0,7)})(new Date());
  return `<section class="card stack"><h2>New vote</h2>
    <label class="f">Title<input type="text" id="pf-title" value="${esc(pollNew.title)}" maxlength="80"></label>
    ${k==="gotm"?`<label class="f">Month<input type="month" id="pf-month" value="${esc(pollNew.month||lastMonth)}"></label><button class="mini" id="pfGoals" type="button">Fill in that month's ${SP.goals}</button>`:""}
    <label class="f">Choices, one per line (first names only)<textarea id="pf-opts" rows="8">${esc(pollNew.opts)}</textarea></label>
    <label class="f">Voting closes<input type="date" id="pf-closes" value="${esc(pollNew.closes)}"></label>
    <div class="btns"><button class="btn gold" id="pfSave">Open the vote</button><button class="btn ghost" id="pfCancel">Cancel</button></div></section>`}
function pollStart(kind){const d=new Date();d.setDate(d.getDate()+7);const lm=(x=>{x.setDate(0);return x})(new Date());
  pollNew={kind,closes:d.toISOString().slice(0,10),title:kind==="gotm"?`${RUGBY?"Try":"Goal"} of the month: ${LONGM[lm.getMonth()]}`:kind==="potss"?`Players' player of the season ${todaySeason()}`:"",
    month:lm.toISOString().slice(0,7),opts:kind==="gotm"?monthGoals(lm.toISOString().slice(0,7)).join("\n"):kind==="potss"?players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99)).map(p=>p.name).join("\n"):""};setView("votes")}
async function pollSave(){const v=id=>($("#"+id)||{}).value||"";const title=v("pf-title").trim(),opts=[...new Set(v("pf-opts").split("\n").map(x=>x.trim()).filter(Boolean))],closes=v("pf-closes");
  if(!title||opts.length<2){toast("Add a title and at least two choices.");return}
  const row={id:`${Date.now().toString(36)}-${slug(title).slice(0,30)}`,kind:pollNew.kind,title,options:opts,closes:closes?new Date(closes+"T21:00:00").toISOString():null};
  const {error}=await sb.from("polls").insert(row);if(error){toast("Couldn't open the vote. Has the database update been run?");return}
  pollNew=null;await loadPolls();toast("Vote opened. Share the Votes page link with parents.");render()}
async function castVote(id,i){const v=voterId();if(!v){toast("This phone can't vote (private browsing?).");return}
  const {error}=await sb.rpc("cast_vote",{p_poll:id,p_voter:v,p_choice:i});if(error){if(/family code/i.test(error.message)){parentNext="votes";setView("parents");toast("Sign in with your family code to vote.");return}toast(/closed/i.test(error.message)?"This vote has closed.":"Couldn't save your vote. Try again.");return}
  const m=myVotes();m[id]=i;if(!myKids().length)try{localStorage.setItem(SK+".votes",JSON.stringify(m))}catch(e){}toast("Thanks, your vote is in.");if(canWrite)await loadPolls();render()}

// ---------- training ----------
// public.training holds one row: the weekly session shown here and added to the calendar feed until "until".
const WEEKDAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
let TR=null,trEdit=null;
async function loadTraining(){if(!sb)return;try{const {data}=await sb.from("training").select("*").eq("id",1).maybeSingle();TR=data||null}catch(e){}}
function clock(t){const m=/^(\d{1,2}):(\d{2})/.exec(t||"");if(!m)return t||"";const h=+m[1];return `${h%12||12}${m[2]!=="00"?":"+m[2]:""}${h<12?"am":"pm"}`}
function trUpcoming(n){if(!TR)return [];const di=WEEKDAYS.indexOf(TR.day);if(di<0)return [];const out=[],off=TR.off||[],now=new Date(),hm=now.toTimeString().slice(0,5),d=new Date(todayLocal()+"T12:00:00");
  for(let i=0;i<120&&out.length<n;i++,d.setDate(d.getDate()+1)){const iso=d.toLocaleDateString("en-CA");if(TR.until&&iso>TR.until)break;if(d.getDay()!==di||(i===0&&hm>=TR.finish))continue;out.push({iso,off:off.includes(iso)})}return out}
// Training attendance (public.training_attendance, coaches only): {"2026-10-14": ["Ava","Mia"]}
let ATT=null,attDay=null;
async function loadAttendance(){ATT=null;if(!sb||!canWrite)return;try{const {data,error}=await sb.from("training_attendance").select("day,player");if(error)return;ATT={};(data||[]).forEach(r=>(ATT[r.day]=ATT[r.day]||[]).push(r.player))}catch(e){}}
// recent sessions to tick off: the weekly day going back eight weeks, skipping weeks off, plus any day already recorded
function trPast(){const out=new Set(Object.keys(ATT||{}));if(TR){const di=WEEKDAYS.indexOf(TR.day),d=new Date(todayLocal()+"T12:00:00");
  for(let i=0;i<63;i++,d.setDate(d.getDate()-1)){const iso=d.toLocaleDateString("en-CA");if(d.getDay()===di&&!(TR.off||[]).includes(iso))out.add(iso)}}
  return [...out].sort().reverse().slice(0,10)}
function attCard(){if(!canWrite||!ATT)return "";const days=trPast();if(!attDay||!days.includes(attDay))attDay=days[0]||todayLocal();
  const here=new Set(ATT[attDay]||[]),roster=players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99));
  return `<section class="card stack edit-only"><h3>Who came to training</h3><p class="hint" style="margin:0">Only coaches see this. It shows next to playing time on the Review page.</p>
    <label class="f">Session<select id="attDay">${days.map(d=>`<option value="${d}"${d===attDay?" selected":""}>${esc(shortDay(d))}${ATT[d]?` · ${ATT[d].length} came`:""}</option>`).join("")}</select></label>
    <div class="av">${roster.map(p=>`<label class="row" style="cursor:pointer"><span><input type="checkbox" data-att="${esc(p.name)}"${here.has(p.name)?" checked":""} style="width:20px;height:20px;vertical-align:-4px;margin-right:8px">${esc(p.name)}</span></label>`).join("")}</div>
    <div class="btns"><button class="btn gold" id="attSave">Save attendance</button><button class="mini" id="attAll">Tick everyone</button></div></section>`}
async function attSave(){const names=[...document.querySelectorAll("[data-att]")].filter(x=>x.checked).map(x=>x.dataset.att),day=attDay;
  try{let r=await sb.from("training_attendance").delete().eq("day",day);if(r.error)throw r.error;
    if(names.length){r=await sb.from("training_attendance").insert(names.map(player=>({day,player})));if(r.error)throw r.error}
    ATT[day]=names;if(!names.length)delete ATT[day];toast(`Saved: ${names.length} at training on ${shortDay(day)}.`);render()}catch(e){toast("Couldn't save attendance. Try again.")}}
// sessions recorded and attended per player, for one season
function attStats(seasonName){const out={},days=Object.keys(ATT||{}).filter(d=>seasonOf(d)===seasonName);days.forEach(d=>ATT[d].forEach(n=>out[n]=(out[n]||0)+1));return {sessions:days.length,out}}
function trainingView(){
  if(trEdit&&canWrite)return trFormView();
  if(!TR)return `<div class="card empty">Training details are on their way.</div>`;
  const up=trUpcoming(6),next=up.find(x=>!x.off),offSoon=up.filter(x=>x.off);
  const maps=TR.venue?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(TR.venue)}`:"";
  const facts=[["📍",TR.venue?`<a href="${maps}" target="_blank" rel="noopener">${esc(TR.venue)}</a>`:""],["🎒",TR.kit?`<b>Bring:</b> ${esc(TR.kit)}`:""],["📅",next?`<b>Next session:</b> ${longDate(next.iso)}`:""],
    ...offSoon.map(x=>["🚫",`<b>No training</b> on ${longDate(x.iso)}`]),["⏳",TR.until?`This runs until ${longDate(TR.until)}, then we move outside.`:""]].filter(([,v])=>v);
  return `<div class="stack"><section class="card stack train"><h2>🏃 Training</h2>
    <div class="trbig"><b>Every ${esc(TR.day)}</b><span>${esc(clock(TR.start))} to ${esc(clock(TR.finish))}</span></div>
    <div class="trfacts">${facts.map(([i,v])=>`<div><span>${i}</span><span>${v}</span></div>`).join("")}</div>
    ${TR.notes?`<p style="margin:0">${esc(TR.notes)}</p>`:""}
    <div class="btns"><button class="btn gold" data-view="calendar">🗓️ Add training to my calendar</button>${maps?`<a class="btn ghost" href="${maps}" target="_blank" rel="noopener">Directions</a>`:""}${canWrite?`<button class="btn ghost edit-only" id="trEditBtn">Edit training</button>`:""}</div></section>${attCard()}</div>`}
function trFormView(){const F2=trEdit;const off=(F2.off||[]).slice().sort();
  return `<section class="card stack"><h2>Edit training</h2>
    <div class="grid2"><label class="f">Day<select id="tr-day">${WEEKDAYS.map(d=>`<option${d===F2.day?" selected":""}>${d}</option>`).join("")}</select></label>
    <label class="f">Starts<input type="time" id="tr-start" value="${esc(F2.start)}"></label><label class="f">Finishes<input type="time" id="tr-finish" value="${esc(F2.finish)}"></label>
    <label class="f">Same every week until<input type="date" id="tr-until" value="${esc(F2.until||"")}"></label></div>
    <label class="f">Where<input type="text" id="tr-venue" value="${esc(F2.venue||"")}"></label>
    <label class="f">What to bring<input type="text" id="tr-kit" value="${esc(F2.kit||"")}"></label>
    <label class="f">Anything else parents should know<textarea id="tr-notes" rows="3">${esc(F2.notes||"")}</textarea></label>
    <div><b>Weeks off</b><div class="btns" style="margin-top:6px">${off.length?off.map(d=>`<span class="pill">${esc(shortDay(d))} <button class="mini" data-troff="${esc(d)}" aria-label="Remove">✕</button></span>`).join(""):`<span class="hint">None</span>`}</div>
      <div class="btns" style="margin-top:8px"><input type="date" id="tr-offnew"><button class="mini" id="trOffAdd">Add a week off</button></div></div>
    <p class="hint">Changes show here and in everyone's calendar (phones check every few hours).</p>
    <div class="btns"><button class="btn gold" id="trSave">Save training</button><button class="btn ghost" id="trCancel">Cancel</button></div></section>`}
function trRead(){if(!trEdit)return;const v=id=>{const el=$("#"+id);return el?el.value:""};Object.assign(trEdit,{day:v("tr-day"),start:v("tr-start"),finish:v("tr-finish"),until:v("tr-until")||null,venue:v("tr-venue").trim(),kit:v("tr-kit").trim(),notes:v("tr-notes").trim()})}
// help and changes: coaches send requests (public.help_requests); a scheduled Claude task answers them in "reply"
let HELP=[],helpShot=null,helpBusy=false;
const HELP_KINDS={fix:"Fix something wrong",change:"Change or add something",question:"Ask a question",problem:"Something isn't working"};
const HELP_STATUS={new:["📨","Sent"],working:["🛠️","Being worked on"],waiting:["⏳","Waiting for "+(TEAM.supportName||"a reply")],done:["✅","Done"],declined:["💬","Answered"]};
async function loadHelp(){HELP=[];if(!sb||!canWrite)return;try{const {data}=await sb.from("help_requests").select("id,created,email,kind,body,page,status,reply,link,updated").order("created",{ascending:false}).limit(50);HELP=data||[]}catch(e){}}
function shrinkShot(file){return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(1,1000/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);ok(c.toDataURL("image/jpeg",.7))};im.onerror=bad;im.src=r.result};r.onerror=bad;r.readAsDataURL(file)})}
function helpView(){
  if(!canWrite)return `<div class="card empty">Sign in as a coach to send help requests.</div>`;
  const when=t=>new Date(t).toLocaleString("en-GB",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"});
  const row=h=>{const [ic,st]=HELP_STATUS[h.status]||HELP_STATUS.new;return `<div class="helpreq"><div class="hr-top"><span class="pill hst-${esc(h.status)}">${ic} ${st}</span><span class="hint">${esc(HELP_KINDS[h.kind]||"")} · ${esc(when(h.created))} · ${esc((h.email||"").split("@")[0])}</span></div>
    <p>${esc(h.body)}</p>${h.reply?`<div class="hr-reply"><b>Reply</b><p>${esc(h.reply)}</p>${/^https:\/\//.test(h.link||"")?`<a href="${esc(h.link)}" target="_blank" rel="noopener">Have a look</a>`:""}</div>`:""}</div>`};
  return `<div class="stack"><section class="card stack"><h2>🛟 Help and changes</h2>
    <p class="hint" style="margin:0">Spotted a mistake, want something changed, or stuck? Send it here. Claude checks for new requests about every hour, fixes data straight away, and builds bigger changes for ${esc(TEAM.supportName||"the site admin")} to approve. You'll see the answer on this page.</p>
    <label class="f">What's it about?<select id="help-kind">${Object.entries(HELP_KINDS).map(([k,t])=>`<option value="${k}">${t}</option>`).join("")}</select></label>
    <label class="f">Tell us what you need<textarea id="help-body" rows="5" maxlength="4000" placeholder="e.g. The score for Saturday's game should be 3-2, not 3-1"></textarea></label>
    <label class="f">Screenshot (optional)<input type="file" id="help-shot" accept="image/*"></label>${helpShot?`<img src="${helpShot}" alt="Screenshot to send" style="max-width:180px;border-radius:8px">`:""}
    <div class="btns"><button class="btn gold" id="helpSend"${helpBusy?" disabled":""}>${helpBusy?"Sending…":"Send request"}</button></div>
    <p class="hint" style="margin:0">On matchday, if something's broken and you need it now, message ${esc(TEAM.supportName||"the site admin")} as well.</p></section>
    <section class="card stack"><h3>Requests</h3>${HELP.length?HELP.map(row).join(""):`<p class="hint">Nothing sent yet.</p>`}</section></div>`}
document.addEventListener("change",async e=>{if(e.target.id!=="help-shot"||!e.target.files[0])return;try{helpShot=await shrinkShot(e.target.files[0]);if(helpShot.length>600000){helpShot=null;toast("That screenshot is too big. Try a smaller one.")}}catch(er){helpShot=null;toast("Couldn't read that picture.")}const b=$("#help-body").value,k=$("#help-kind").value;render();$("#help-body").value=b;$("#help-kind").value=k});
document.addEventListener("click",async e=>{const t=e.target.closest("#helpSend");if(!t||!canWrite||helpBusy)return;
  const body=$("#help-body").value.trim(),kind=$("#help-kind").value;if(body.length<3){toast("Say what you need first.");return}
  helpBusy=true;t.disabled=true;t.textContent="Sending…";
  const {error}=await sb.from("help_requests").insert({kind,body,page:location.search||"home",screenshot:helpShot});
  helpBusy=false;if(error){toast("Couldn't send that. Check your connection and try again.");render();return}
  helpShot=null;toast("Sent. You'll see the answer here.");await loadHelp();render()});

// ---------- milestones ----------
const MS={apps:[[10,"10 games"],[25,"25 games"],[50,"50 games"],[75,"75 games"],[100,"100 games"]],goals:[[1,"First goal"],[10,"10 goals"],[25,"25 goals"],[50,"50 goals"],[100,"100 goals"]],assists:[[1,"First assist"],[10,"10 assists"],[25,"25 assists"]],cs:[[1,"First clean sheet"],[5,"5 clean sheets"],[10,"10 clean sheets"]],potm:[[1,"First player of the match"],[5,"5 player of the match awards"],[10,"10 player of the match awards"]]};
if(RUGBY){MS.goals=[[1,"First try"],[10,"10 tries"],[25,"25 tries"],[50,"50 tries"],[100,"100 tries"]];MS.pts=[[50,"50 points"],[100,"100 points"],[250,"250 points"],[500,"500 points"]]}
function milestones(){const tot={},out=[];sortMatches(matches.filter(counted)).forEach(m=>{
    const bump=(n,k,by)=>{if(!by)return;const t=tot[n]=tot[n]||{apps:0,goals:0,assists:0,potm:0,cs:0,pts:0};const before=t[k];t[k]+=by;MS[k].forEach(([v,label])=>{if(before<v&&t[k]>=v)out.push({n,label,date:m.date,opp:m.opp,id:m.id})})};
    (m.apps!==false?Object.keys(played(m)):[...new Set([...Object.entries(played(m)).filter(([,g])=>+g>0).map(([n])=>n),...(m.potm?[m.potm]:[])])]).forEach(n=>bump(n,"apps",1));
    Object.entries(played(m)).forEach(([n,g])=>bump(n,"goals",+g||0));Object.entries(assistsOf(m)).forEach(([n,a])=>bump(n,"assists",+a||0));Object.entries(keepersOf(m)).forEach(([n,c])=>bump(n,"cs",+c?1:0));if(m.potm)bump(m.potm,"potm",1);
    if(RUGBY)[...new Set([...Object.keys(played(m)),...Object.keys(kicksOf(m))])].forEach(n=>bump(n,"pts",ptsIn(m,n)))});
  return out.reverse()}
function msRow(x){return `<div class="ms"><span>🎉 <b>${esc(x.n)}</b>: ${esc(x.label)} <span class="hint">v ${esc(x.opp||"")}, ${esc(x.date||"")}</span></span><button class="mini edit-only" data-msgfx="${esc(x.n)}|${esc(x.label)}">Make graphic</button></div>`}

// ---------- playing time ----------
function halvesOf(m){return m.halves||{}}
function ptStats(list){const t=list.filter(m=>Object.keys(halvesOf(m)).length);const out={};t.forEach(m=>{Object.keys(played(m)).forEach(n=>{const o=out[n]=out[n]||{q:0,poss:0};o.poss+=2});Object.entries(halvesOf(m)).forEach(([n,q])=>{const o=out[n]=out[n]||{q:0,poss:0};o.q+=+q||0})});
  // minutes come from games run in live match mode: everyone in that day's squad could have played the whole game
  const lm=list.filter(liveMinsKept);lm.forEach(m=>{const L=m.live,len=(+L.halfLen||20)*2;L.squad.forEach(n=>{const o=out[n]=out[n]||{q:0,poss:0};o.min=(o.min||0)+(+L.mins[n]||0);o.avail=(o.avail||0)+len})});
  return {games:t.length,mg:lm.length,out}}
// on the match form: who in this game hasn't been player of the match yet this season (coaches only)
function potmNudge(names){if(!names.length)return "";const s=seasonOf(F.date),list=matches.filter(m=>!m.practice&&m.id!==F.id&&seasonOf(m.date)===s);if(!list.some(m=>m.potm))return "";
  const ps=playerStats(list),none=names.filter(n=>!(ps[n]&&ps[n].potm));return none.length?`<p class="hint" style="margin-top:-6px">Not been ${esc(POTM)} yet this season: ${none.map(esc).join(", ")}.</p>`:""}
function liveMinsKept(m){const L=m.live;return !!(L&&L.status==="ft"&&L.mins&&Object.keys(L.mins).length&&L.squad&&L.squad.length)}
// Playing time compares children, so only coaches see it unless the club turns TEAM.publicPlayingTime on.
// Training attendance (coaches only) sits alongside, so fairness covers training as well as matches.
function ptCard(pt){if(!canWrite&&TEAM.publicPlayingTime!==true)return "";const at=canWrite&&ATT?attStats(season):null,useAt=at&&at.sessions>0;
  const names=[...new Set([...Object.keys(pt.out),...(useAt?Object.keys(at.out):[])])].filter(n=>pt.out[n]||players.some(p=>p.name===n&&p.current));
  const pc=n=>{const o=pt.out[n];return !o?0:pt.mg&&o.avail?o.min/o.avail:o.poss?o.q/o.poss:0};
  if(!pt.games&&!useAt)return `<section class="card${canWrite?" edit-only":""}"><h3>Playing time</h3><p class="hint">Not recorded yet. Use <b>▶ Live match</b> on a fixture, or the halves counter on the match form, and it'll show here.${canWrite?" Tick off who came to training on the Training page to see that here too.":""}</p></section>`;
  return `<section class="card${canWrite?" edit-only":""}"><h3>Playing time${useAt?" and training":""}</h3><p class="hint" style="margin-bottom:8px">${pt.games?`Halves played out of halves available, from the ${pt.games} game${pt.games>1?"s":""} where it was recorded. `:""}${useAt?`Training: sessions attended out of the ${at.sessions} recorded. `:""}${pt.mg?`Minutes and time on the bench come from the ${pt.mg} game${pt.mg>1?"s":""} run in live match mode. `:""}Lowest playing time first, so you can see who's due more.${canWrite&&TEAM.publicPlayingTime!==true?" Only coaches see this.":""}</p>
    <table class="lb"><thead><tr><th>Player</th>${pt.games?`<th colspan="2">Halves</th>${pt.mg?"":"<th>%</th>"}`:""}${pt.mg?`<th>Mins</th>`:""}${useAt?`<th>Training</th>`:""}</tr></thead><tbody>${names.sort((a,b)=>pc(a)-pc(b)||a.localeCompare(b)).map(n=>{const o=pt.out[n]||{q:0,poss:0};return `<tr><td>${esc(n)}</td>${pt.games?`<td style="width:40%"><div class="ptbar"><i style="width:${o.poss?o.q/o.poss*100:0}%"></i></div></td><td>${o.q}/${o.poss}</td>${pt.mg?"":`<td>${o.poss?Math.round(o.q/o.poss*100):0}%</td>`}`:""}${pt.mg?`<td style="white-space:nowrap">${o.avail?`${Math.round(o.min)}'<br><small class="hint">bench ${Math.round(o.avail-o.min)}'</small>`:"–"}</td>`:""}${useAt?`<td>${at.out[n]||0}/${at.sessions}</td>`:""}</tr>`}).join("")}</tbody></table></section>`}
function keeperStats(list){const out={};list.filter(result).forEach(m=>{const k=Object.entries(keepersOf(m));k.forEach(([n,c])=>{const o=out[n]=out[n]||{g:0,cs:0,saves:0,shared:0};o.g++;if(+c)o.cs++;if(k.length>1)o.shared++;else o.saves+=+m.saves||0})});return out}

// ---------- season review + club records ----------
function runs(list,ok){let best=0,cur=0,bs=null,cs=null,be=null;list.forEach(m=>{if(ok(result(m))){if(!cur)cs=m;cur++;if(cur>best){best=cur;bs=cs;be=m}}else cur=0});return {n:best,from:bs,to:be}}
function reviewNoScores(){const ps=playerStats(seasonMatches()),career=playerStats(matches),pt=ptStats(seasonMatches());
  const top=(o,k)=>Object.entries(o).filter(([,x])=>x[k]>0).sort((a,b)=>b[1][k]-a[1][k])[0];
  const tp=top(ps,"potm"),ma=top(ps,"apps"),ca=top(career,"apps");
  return `<div class="stack">
  <section class="card"><h2>${season} season review</h2>
    <div class="kv" style="margin-top:10px">
      <div><span>Games played</span><b>${seasonMatches().filter(counted).length}</b></div>
      <div><span>Most appearances</span><b>${ma?`${esc(ma[0])} (${ma[1].apps})`:"–"}</b></div>
      <div><span>Most ${esc(POTM)}</span><b>${tp?`${esc(tp[0])} (${tp[1].potm})`:"–"}</b></div>
      <div><span>Most appearances, all time</span><b>${ca?`${esc(ca[0])} (${ca[1].apps})`:"–"}</b></div>
    </div><p class="hint" style="margin-top:10px">Scores and scorers aren't shown publicly for this age group.</p></section>
  ${ptCard(pt)}
  <section class="card"><h3>Milestones</h3>${(ms=>ms.length?ms.map(msRow).join(""):`<p class="hint">None yet this season.</p>`)(milestones().filter(x=>seasonOf(x.date)===season))}</section>
  ${viewsCard()}${sponsorCard()}</div>`;
}
function reviewView(){if(noScores())return reviewNoScores();
  const list=seasonMatches().filter(result),t=teamStats(list),ps=playerStats(list),ks=keeperStats(list),pt=ptStats(seasonMatches());
  const big=list.slice().sort((a,b)=>(b.us-b.them)-(a.us-a.them)||b.us-a.us)[0];
  const most=list.slice().sort((a,b)=>b.us-a.us)[0];
  const unb=runs(list,r=>r!=="L"),win=runs(list,r=>r==="W"),cs=list.filter(m=>+m.them===0).length;
  const months={};seasonMatches().filter(result).forEach(m=>{const k=m.date.slice(0,7);months[k]=(months[k]||0)+(+m.us||0)});
  const mk=Object.keys(months).sort(),mx=Math.max(1,...Object.values(months));
  const top=(k)=>Object.entries(ps).filter(([,o])=>o[k]>0).sort((a,b)=>b[1][k]-a[1][k])[0];
  const nice=m=>m?`${m.us}–${m.them} v ${esc(m.opp)} <small>${esc(m.date)}</small>`:"–";
  // all-time
  const all=sortMatches(matches.filter(result));const career=playerStats(matches);
  let bestGame=null;matches.forEach(m=>Object.entries(played(m)).forEach(([n,g])=>{if(!bestGame||g>bestGame.g)bestGame={n,g,m}}));
  const bySeason={};matches.forEach(m=>{const s=seasonOf(m.date);Object.entries(played(m)).forEach(([n,g])=>{const k=s+"|"+n;bySeason[k]=(bySeason[k]||0)+(+g||0)})});
  const bestSeason=Object.entries(bySeason).sort((a,b)=>b[1]-a[1])[0];
  const allBig=all.slice().sort((a,b)=>(b.us-b.them)-(a.us-a.them))[0];const allUnb=runs(all,r=>r!=="L");
  const mostApps=Object.entries(career).sort((a,b)=>b[1].apps-a[1].apps)[0];
  return `<div class="stack">
  <section class="card"><h2>${season} season review</h2>
    <div class="kv" style="margin-top:10px">
      <div><span>Biggest win</span><b>${big&&big.us>big.them?nice(big):"–"}</b></div>
      <div><span>Most ${RUGBY?"points":"goals"} in a game</span><b>${most?nice(most):"–"}</b></div>
      <div><span>Longest unbeaten run</span><b>${unb.n} game${unb.n===1?"":"s"}</b>${unb.n?`<small>${esc(unb.from.date)} to ${esc(unb.to.date)}</small>`:""}</div>
      <div><span>Longest winning run</span><b>${win.n}</b></div>
      ${SP.keeper?`<div><span>Clean sheets</span><b>${cs}</b></div>`:""}
      <div><span>${RUGBY?"Points":"Goals"} per game</span><b>${t.P?(t.F/t.P).toFixed(1):"–"}</b></div>
      <div><span>Top ${RUGBY?"try ":""}scorer</span><b>${top("goals")?`${esc(top("goals")[0])} (${top("goals")[1].goals})`:"–"}</b></div>
      ${RUGBY?`<div><span>Most points</span><b>${top("pts")?`${esc(top("pts")[0])} (${top("pts")[1].pts})`:"–"}</b></div>`:""}
      ${SP.assists&&assistsTracked(season)?`<div><span>Most assists</span><b>${top("assists")?`${esc(top("assists")[0])} (${top("assists")[1].assists})`:"–"}</b></div>`:""}
      <div><span>Most player of the match</span><b>${top("potm")?`${esc(top("potm")[0])} (${top("potm")[1].potm})`:"–"}</b></div>
    </div></section>
  <section class="card"><h3>Form</h3><div class="form" style="flex-wrap:wrap">${list.map(m=>`<span class="chip ${result(m)}" title="${esc(m.opp)} ${m.us}-${m.them}">${result(m)}</span>`).join("")||`<span class="hint">No results yet.</span>`}</div></section>
  <section class="card"><h3>${RUGBY?"Points":"Goals"} scored by month</h3>${mk.length?`<div class="bars">${mk.map(k=>`<div><b>${months[k]}</b><i style="height:${months[k]/mx*100}%"></i>${MONTHS[+k.slice(5)-1]}</div>`).join("")}</div>`:`<p class="hint">No ${RUGBY?"points":"goals"} yet.</p>`}</section>
  ${ptCard(pt)}
  ${SP.keeper?`<section class="card"><h3>Goalkeepers</h3>${Object.keys(ks).length?`<table class="lb"><thead><tr><th>Keeper</th><th>Games in goal</th><th>Shared games</th><th>Clean sheets</th><th>Saves</th></tr></thead><tbody>${Object.entries(ks).sort((a,b)=>b[1].cs-a[1].cs||b[1].g-a[1].g).map(([n,o])=>`<tr><td>🧤 ${esc(n)}</td><td>${o.g}</td><td>${o.shared}</td><td><b>${o.cs}</b></td><td>${o.saves}</td></tr>`).join("")}</tbody></table><p class="hint" style="margin-top:6px">Saves only count games with one keeper.</p>`:`<p class="hint">Tap 🧤 next to a player on the match form (or in Live match) to start keeper stats.</p>`}</section>`:""}
  <section class="card"><h3>Milestones</h3>${(ms=>ms.length?ms.map(msRow).join(""):`<p class="hint">None yet this season.</p>`)(milestones().filter(x=>seasonOf(x.date)===season))}</section>
  <section class="card"><h2>All-time club records</h2><div class="kv" style="margin-top:10px">
      <div><span>Most ${SP.goals} in a game</span><b>${bestGame&&bestGame.g?`${esc(bestGame.n)} (${bestGame.g})`:"–"}</b>${bestGame&&bestGame.g?`<small>v ${esc(bestGame.m.opp)}, ${esc(bestGame.m.date)}</small>`:""}</div>
      <div><span>Most ${SP.goals} in a season</span><b>${bestSeason&&bestSeason[1]?`${esc(bestSeason[0].split("|")[1])} (${bestSeason[1]})`:"–"}</b>${bestSeason?`<small>${esc(bestSeason[0].split("|")[0])}</small>`:""}</div>
      <div><span>Biggest win</span><b>${allBig&&allBig.us>allBig.them?nice(allBig):"–"}</b></div>
      <div><span>Longest unbeaten run</span><b>${allUnb.n} games</b>${allUnb.n?`<small>${esc(allUnb.from.date)} to ${esc(allUnb.to.date)}</small>`:""}</div>
      <div><span>Most appearances</span><b>${mostApps&&mostApps[1].apps?`${esc(mostApps[0])} (${mostApps[1].apps})`:"–"}</b><small>Counts only games where appearances were recorded</small></div>
    </div>
    <h3 style="margin-top:14px">All-time top ${RUGBY?"try ":""}scorers</h3><table class="lb"><tbody>${Object.entries(career).filter(([,o])=>o.goals).sort((a,b)=>b[1].goals-a[1].goals).slice(0,10).map(([n,o],i)=>`<tr class="click" data-player="${esc(n)}"><td>${i+1}. ${esc(n)}</td><td><b>${o.goals}</b></td></tr>`).join("")}</tbody></table></section>
  ${viewsCard()}${sponsorCard()}
  <section class="card edit-only"><h3>Backup</h3><p class="hint">Download everything (matches, players, tournaments, honours) to keep a copy. A copy is also saved automatically each month.</p><div class="btns" style="margin-top:8px"><button class="btn" id="bkJson">Download full backup</button><button class="btn ghost" id="bkCsv">Download results as a spreadsheet (CSV)</button></div></section>
  </div>`;
}
function dl(name,text,type){const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000)}
function backupJson(){return JSON.stringify({exported:new Date().toISOString(),players,matches,tournaments,honours},null,1)}
function backupCsv(){const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;const rows=[["date","season","opponent","competition","tournament","stage","home/away","venue","kick-off","us","them","result","scorers","assists","player of the match","goalkeepers","saves","notes","match report","match preview"].concat(RUGBY?["kicks"]:[])];
  sortMatches(matches).forEach(m=>{const tn=tournaments.find(t=>t.id===m.tournament_id);rows.push([m.date,seasonOf(m.date),m.opp,m.comp,tn?tn.name:"",m.stage||"",m.ha,m.venue,m.ko,m.us,m.them,result(m)||"",Object.entries(played(m)).filter(([,g])=>g>0).map(([n,g])=>`${n} ${g}`).join("; "),Object.entries(assistsOf(m)).map(([n,a])=>`${n} ${a}`).join("; "),m.potm,Object.entries(keepersOf(m)).map(([n,c])=>n+(+c?" (clean sheet)":"")).join("; "),m.saves,m.notes,m.report||"",m.preview||""].concat(RUGBY?[kicksLine(m)]:[]))});
  return rows.map(r=>r.map(q).join(",")).join("\r\n")}

// ---------- live match (coach) + live timeline (everyone) ----------
// matches.live = {status:"pre"|"live"|"ht"|"ft", half, halfStart (ms), halfLen, form, slots:[gk,...4], squad, events:[...], mins:{name:minutes}}
// line-ups for each match format; TEAM.format picks one (5v5 for U7-U10, 7v7 U9-U10, 9v9 U11-U12, 11v11 U13+)
const FORMATS={
  "5v5":{"1-2-1":{label:["GK","DEF","LM","RM","FWD"],xy:[[50,88],[50,66],[24,44],[76,44],[50,20]]},"2-2":{label:["GK","LB","RB","LF","RF"],xy:[[50,88],[28,62],[72,62],[28,28],[72,28]]}},
  "7v7":{"2-3-1":{label:["GK","LB","RB","LM","CM","RM","FWD"],xy:[[50,90],[30,72],[70,72],[18,48],[50,50],[82,48],[50,22]]},"3-2-1":{label:["GK","LB","CB","RB","LM","RM","FWD"],xy:[[50,90],[20,70],[50,72],[80,70],[32,46],[68,46],[50,22]]},"2-1-2-1":{label:["GK","LB","RB","CM","LW","RW","FWD"],xy:[[50,90],[30,74],[70,74],[50,56],[20,40],[80,40],[50,20]]}},
  "9v9":{"3-3-2":{label:["GK","LB","CB","RB","LM","CM","RM","LF","RF"],xy:[[50,91],[20,74],[50,76],[80,74],[18,52],[50,54],[82,52],[34,26],[66,26]]},"3-4-1":{label:["GK","LB","CB","RB","LM","LCM","RCM","RM","FWD"],xy:[[50,91],[20,74],[50,76],[80,74],[14,50],[38,54],[62,54],[86,50],[50,22]]},"2-4-2":{label:["GK","LB","RB","LM","LCM","RCM","RM","LF","RF"],xy:[[50,91],[32,76],[68,76],[14,52],[38,56],[62,56],[86,52],[34,26],[66,26]]}},
  "11v11":{"4-4-2":{label:["GK","LB","LCB","RCB","RB","LM","LCM","RCM","RM","LF","RF"],xy:[[50,92],[14,74],[38,78],[62,78],[86,74],[14,50],[38,54],[62,54],[86,50],[36,24],[64,24]]},"4-3-3":{label:["GK","LB","LCB","RCB","RB","LCM","CM","RCM","LW","FWD","RW"],xy:[[50,92],[14,74],[38,78],[62,78],[86,74],[28,54],[50,56],[72,54],[18,28],[50,22],[82,28]]},"3-5-2":{label:["GK","LCB","CB","RCB","LWB","LCM","CM","RCM","RWB","LF","RF"],xy:[[50,92],[28,78],[50,80],[72,78],[10,52],[32,56],[50,58],[68,56],[90,52],[36,24],[64,24]]}}};
// rugby line-ups: union 15s and league 13s by shirt number (attacking up the page, forwards in front); other sizes in two lines
const RFORMATS={
  "rugby-union":{"15s":{"Positions":{label:["LHP","HK","THP","LK","LK","BF","OF","N8","SH","FH","LW","IC","OC","RW","FB"],fwd:8,
    xy:[[32,17],[50,17],[68,17],[37,30],[63,30],[20,38],[80,38],[50,42],[44,54],[28,62],[10,78],[52,66],[72,71],[90,78],[50,88]]}}},
  "rugby-league":{"13s":{"Positions":{label:["FB","RW","RC","LC","LW","SO","SH","P","HK","P","2R","2R","LF"],fwd:-6,
    xy:[[50,86],[90,68],[68,68],[32,68],[10,68],[62,53],[38,53],[32,18],[50,18],[68,18],[22,30],[78,30],[50,38]]}}}};
function rugbyForms(fmt){const n=+String(fmt||"").replace(/\D/g,"")||7,known=(RFORMATS[SP.key]||{})[fmt];if(known)return known;
  const f=Math.ceil(n/2),b=n-f,row=(k,y,o)=>Array.from({length:k},(_,i)=>[Math.round(10+(80*(i+.5))/k),y+(o&&i%2?4:0)]);
  return {"Two lines":{label:Array.from({length:n},(_,i)=>String(i+1)),xy:[...row(f,32),...row(b,64,1)]}}}
const FORMS=RUGBY?rugbyForms(TEAM.format||SP.formats[0]):FORMATS[TEAM.format]||FORMATS["5v5"],FORM0=Object.keys(FORMS)[0],SIDE=FORMS[FORM0].label.length;
// forwards and backs for the line-up alert: fwd = the first n spots are forwards, or -n = the last n are
function fwdBacks(form,line){const F=FORMS[form]||FORMS[FORM0],k=F.fwd;if(!k)return null;const fw=k>0?line.slice(0,k):line.slice(k),bk=k>0?line.slice(k):line.slice(0,k);return {fw:fw.filter(Boolean),bk:bk.filter(Boolean)}}
let LV=null,PRACTICE=null;// PRACTICE = a pretend fixture that only lives on this phone; nothing is saved or shown to parents
function liveKey(id){return SK+".live3."+id}
function todayLocal(){return new Date().toLocaleDateString("en-CA")}
function liveStart(id){const m=matches.find(x=>x.id===id);if(!m)return;let saved=null;try{saved=JSON.parse(localStorage.getItem(liveKey(id))||"null")}catch(e){}
  const out=Object.entries(AV[id]||{}).filter(([,v])=>v==="no").map(([n])=>n);
  const tsq=m.tournament_id?tSquad(tournaments.find(t=>t.id===m.tournament_id)):[];
  const sq=(m.squad&&m.squad.length)?m.squad.slice():tsq.length&&!Object.keys(played(m)).length?tsq.slice():Object.keys(played(m)).length?Object.keys(played(m)):players.filter(p=>p.current&&!out.includes(p.name)).sort((a,b)=>(+a.num||99)-(+b.num||99)).map(p=>p.name);
  // another coach's phone may have started the game, or locked the line-up before kick-off
  const srv=m.live&&m.live.status&&(m.live.status!=="pre"||(m.live.events||[]).some(e=>e.k==="lu"))?m.live:null;
  // a game already finished on the server (by another phone, or fixed by hand) wins over this phone's copy
  LV=saved&&saved.v===3&&!(srv&&srv.status==="ft")?saved:srv?Object.assign({v:3,id,onSince:{},touched:{1:[],2:[]}},JSON.parse(JSON.stringify(srv))):{v:3,id,status:"pre",half:1,halfStart:null,halfLen:+TEAM.halfLength||20,form:FORM0,squad:sq,slots:sq.slice(0,SIDE).concat(Array(SIDE).fill("")).slice(0,SIDE),events:[],mins:{},onSince:{},touched:{1:[],2:[]}};
  if(!LV.squad||!LV.squad.length)LV.squad=sq;setView("live")}
function liveSaveLocal(){try{localStorage.setItem(liveKey(LV.id),JSON.stringify(LV))}catch(e){}}
function livePublic(){return {locked:!!LV.locked,status:LV.status,half:LV.half,halfStart:LV.halfStart,halfLen:LV.halfLen,form:LV.form,slots:LV.sin?LV.slots.map((n,i)=>n||(Object.entries(LV.sin).find(([,v])=>v.slot===i)||[""])[0]):LV.slots,squad:LV.squad,events:LV.events,mins:LV.mins}}
async function livePush(extra){const m=matches.find(x=>x.id===LV.id);if(!m)return;if(m.practice){m.live=livePublic();return}
  const body=Object.assign({played:m.played||{},assists:m.assists||{},us:m.us??0,them:m.them??0,keepers:m.keepers||{},live:livePublic(),check:""},RUGBY?{kicks:m.kicks||{}}:{},extra||{});
  const id=LV.id,last=(LV.events[LV.events.length-1]||{}).k;
  m.live=body.live;try{await db.collection("matches").doc(id).update(body);if(["ko","goal","them","sub","gk","ht","ft"].includes(last))alNotify(id)}catch(e){toast("Saved on this phone. It'll sync when you're back online.")}}
function minuteOf(L,at){if(!L||!L.halfStart)return "";const len=+L.halfLen||20;const el=Math.max(0,Math.floor(((at||Date.now())-L.halfStart)/60000))+1;
  if(L.status==="ht")return "HT";if(L.status==="ft")return "FT";
  const base=L.half===2?len:0;return el>len?`${base+len}+${el-len}'`:`${base+el}'`}
function onPitch(){return LV.slots.filter(Boolean)}
// current players who aren't in today's squad (a late arrival, or someone left off by mistake)
function notInSquad(){return players.filter(p=>p.current&&!LV.squad.includes(p.name)).sort((a,b)=>(+a.num||99)-(+b.num||99)).map(p=>p.name)}
function lateAddHtml(){const r=notInSquad();return `${r.length?`<label class="f" style="max-width:320px">Late arrival: add to the squad<select id="lvAdd"><option value="">Choose…</option>${r.map(n=>`<option>${esc(n)}</option>`).join("")}</select></label>`:""}
  <div class="btns"><input type="text" id="lvNewName" placeholder="Not listed? First name" aria-label="Player not listed: first name" style="max-width:220px"><button class="btn ghost" id="lvNewAdd">Add to squad</button></div>`}
// a player who isn't on the site yet (or was marked as left) joins today's squad, and the Squad page, from the live match screen
async function liveNewPlayer(name){const m=matches.find(x=>x.id===LV.id);name=name.trim();if(!name){toast("Type a first name.");return}
  const p=players.find(p=>p.name.toLowerCase()===name.toLowerCase());if(p)name=p.name;
  if(!m.practice){try{if(p){if(!p.current){await db.collection("players").doc(p.id).update({current:true});p.current=true}}else{await db.collection("players").doc(slug(name)).set({name,num:null,current:true});if(!players.some(x=>x.name===name))players.push({id:slug(name),name,num:null,current:true})}}catch(e){toast(`Couldn't add ${name}. Try again.`);return}}
  if(!LV.squad.includes(name))LV.squad.push(name);liveSaveLocal();render();toast(`${name} added to the squad.`)}
function bench(){return LV.squad.filter(n=>!LV.slots.includes(n)&&!(LV.sin&&LV.sin[n]))}
// ---------- sub plan (coaches only: it stays on the coach's phone and never goes to parents) ----------
// LV.plan = {mode:"off"|"equal"|"manual", gk2: keeper for the second half, ch:[{m,on,off}] for manual, at: last change point dealt with, due:{m,chs}}
const PLAN_N={off:"Off",equal:"Equal minutes",manual:"Choose my own"};
// change points: each quarter of a half (the middle of a short half) plus half time
function planPoints(len){const q=len>=12?[.25,.5,.75]:[.5],b=[];[0,len].forEach(h0=>{q.forEach(f=>b.push(h0+Math.round(len*f)));if(!h0)b.push(len)});return [...new Set(b)].filter(x=>x>0&&x<len*2).sort((a,c)=>a-c)}
function planOf(L){return L.plan||(L.plan={mode:"off",gk2:"",ch:[]})}
// the changes at minute b; xi is changed in place
function planStep(xi,mins,b,next,len,pl,sq){const out=[];
  if(pl.mode==="manual"){(pl.ch||[]).filter(c=>c.m===b).forEach(c=>{const i=xi.indexOf(c.off);if(i<0||xi.includes(c.on)||!sq.includes(c.on)){out.push({m:b,on:c.on,off:c.off,bad:1});return}xi[i]=c.on;out.push({m:b,on:c.on,off:c.off,i})});return out}
  if(SP.keeper&&b===len&&pl.gk2&&pl.gk2!==xi[0]&&sq.includes(pl.gk2)){const j=xi.indexOf(pl.gk2),old=xi[0];if(j>0){xi[j]=old;xi[0]=pl.gk2;out.push({m:b,on:pl.gk2,off:old,i:0,sw:1})}else{xi[0]=pl.gk2;out.push({m:b,on:pl.gk2,off:old,i:0})}}
  // at half time everyone has stopped anyway, so nobody gets a head start
  // players already on win ties, so changes only happen when someone is genuinely owed minutes;
  // the second-half keeper has a full half to come, so they take more of their rest in the first half
  const k0=SP.keeper?1:0,kp=SP.keeper?xi[0]:null,on=new Set(xi.slice(k0).filter(Boolean)),rest=len*(sq.length-xi.length)/sq.length,key=n=>(mins[n]||0)+(b<len&&n===pl.gk2?rest:0)-(on.has(n)&&b!==len?.5:0);
  const pool=sq.filter(n=>n!==kp).sort((a,c)=>key(a)-key(c)||on.has(c)-on.has(a)||sq.indexOf(a)-sq.indexOf(c));
  const keep=new Set(pool.slice(0,xi.length-k0)),incoming=pool.filter(n=>keep.has(n)&&!on.has(n));
  for(let i=k0;i<xi.length&&incoming.length;i++){if(xi[i]&&keep.has(xi[i]))continue;const n=incoming.shift();out.push({m:b,on:n,off:xi[i]||"",i});xi[i]=n}
  return out}
// play the plan through from the starting line-up to project everyone's minutes
function planSim(L){const len=+L.halfLen||20,end=len*2,pl=planOf(L),xi=L.slots.slice(),sq=L.squad.slice(),mins={},chs=[];sq.forEach(n=>mins[n]=0);
  const pts=[...planPoints(len),end];let t=0;
  pts.forEach((b,k)=>{xi.forEach(n=>{if(n in mins)mins[n]+=b-t});t=b;if(b>=end||pl.mode==="off")return;chs.push(...planStep(xi,mins,b,(pts[k+1]||end)-b,len,pl,sq))});
  return {mins,chs,end,len}}
function chLine(c){return !SP.keeper?(c.off?`${esc(c.on)} on for ${esc(c.off)}`:`${esc(c.on)} on`):c.sw?`${esc(c.on)} goes in goal, ${esc(c.off)} moves out`:c.i===0&&!c.bad?`${esc(c.on)} on in goal for ${esc(c.off)}`:c.off?`${esc(c.on)} on for ${esc(c.off)}`:`${esc(c.on)} on`}
// the game clock in whole minutes from kick-off (first half 0 to len, second half len to 2×len)
function gameMin(L){const len=+L.halfLen||20;if(L.status==="ht")return len;if(L.status!=="live"||!L.halfStart)return 0;const el=Math.floor((Date.now()-L.halfStart)/60000);return L.half===2?len+el:Math.min(el,len-1)}
// the next planned change once its minute arrives; worked out from the real minutes so far, so changes the coach made themselves are taken into account
function planDue(){const pl=LV&&LV.plan;if(!pl||pl.mode==="off"||!["live","ht"].includes(LV.status))return null;if(pl.due)return pl.due;
  const len=+LV.halfLen||20,end=len*2,now=Date.now(),gm=gameMin(LV),pts=planPoints(len);
  const ready=pts.filter(b=>b>(pl.at||0)&&(b===len?LV.status==="ht"||LV.half===2:b<len?gm>=b&&LV.half===1||LV.half===2:LV.half===2&&gm>=b));if(!ready.length)return null;
  const b=ready[ready.length-1],k=pts.indexOf(b),mins={};LV.squad.forEach(n=>mins[n]=(+LV.mins[n]||0)+(LV.onSince[n]?(now-LV.onSince[n])/60000:0));
  const chs=planStep(LV.slots.slice(),mins,b,(pts[k+1]||end)-b,len,pl,LV.squad).filter(c=>!c.bad);
  if(!chs.length){pl.at=b;liveSaveLocal();return null}
  pl.due={m:b,chs};liveSaveLocal();try{navigator.vibrate&&navigator.vibrate([300,150,300])}catch(e){}return pl.due}
function planCard(){const pl=planOf(LV),full=onPitch().length===SIDE,extra=LV.squad.length>SIDE;
  const head=`<section class="card stack" id="planCard"><h3>Sub plan</h3><div class="seg" role="group" aria-label="Sub plan">${Object.keys(PLAN_N).map(k=>`<button data-lvplan="${k}" aria-pressed="${pl.mode===k}">${PLAN_N[k]}</button>`).join("")}</div>`;
  const what={off:"No planned subs. You make every change yourself during the game.",equal:"Shares the minutes out as evenly as it can, changing at the quarter points of each half and at half time."+(SP.keeper?" The keeper stays in goal unless you pick a different one for the second half.":""),manual:"You choose each change: the minute, who comes on and who comes off."}[pl.mode];
  if(pl.mode==="off")return `${head}<p class="hint">${what} Turn on a plan and this phone buzzes when each sub is due.</p></section>`;
  if(!extra)return `${head}<p class="hint">${what}</p><p class="hint">Everyone in the squad is starting, so there's nobody to bring on.</p></section>`;
  if(!full)return `${head}<p class="hint">${what}</p><p class="hint">Fill every position on the pitch above and the plan appears here.</p></section>`;
  const sim=planSim(LV),pts=planPoints(sim.len),ms=LV.squad.map(n=>sim.mins[n]),lo=Math.min(...ms),hi=Math.max(...ms);
  const gk=pl.mode==="equal"&&SP.keeper?`<label class="f" style="max-width:320px">Keeper for the second half<select id="lvGk2"><option value="">${esc(LV.slots[0])} stays in goal</option>${LV.squad.filter(n=>n!==LV.slots[0]).map(n=>`<option${n===pl.gk2?" selected":""}>${esc(n)}</option>`).join("")}</select></label>`:"";
  const add=pl.mode==="manual"?`<div class="btns"><select id="plM" aria-label="Minute">${pts.map(b=>`<option value="${b}">${b===sim.len?"Half time":b+"'"}</option>`).join("")}</select><select id="plOn" aria-label="Coming on"><option value="">Coming on…</option>${LV.squad.map(n=>`<option>${esc(n)}</option>`).join("")}</select><select id="plOff" aria-label="Coming off"><option value="">Coming off…</option>${LV.squad.map(n=>`<option>${esc(n)}</option>`).join("")}</select><button class="btn ghost" id="lvPlanAdd">Add</button></div>
    <div class="btns"><button class="mini" id="lvPlanEq">Start from equal minutes</button></div>`:"";
  const list=sim.chs.length?`<ol class="tl">${sim.chs.map((c,k)=>`<li${c.bad?' class="bad"':""}><span class="mn">${c.m===sim.len?"HT":c.m+"'"}</span><span class="ic">🔁</span><span>${chLine(c)}${c.bad?" <b>(won't work: check who's on at that point)</b>":""}${pl.mode==="manual"?` <button class="mini" data-lvplandel="${(pl.ch||[]).findIndex(x=>x.m===c.m&&x.on===c.on&&x.off===c.off)}" aria-label="Remove this change">✕</button>`:""}</span></li>`).join("")}</ol>`:`<p class="hint">No changes planned yet.</p>`;
  const proj=LV.squad.slice().sort((a,b)=>sim.mins[b]-sim.mins[a]).map(n=>`<tr><td>${esc(n)}</td><td style="width:50%"><div class="ptbar"><i style="width:${sim.mins[n]/sim.end*100}%"></i></div></td><td>${sim.mins[n]}'</td></tr>`).join("");
  return `${head}<p class="hint">${what} This phone buzzes when a change is due and you make it with one tap. Parents don't see the plan.</p>${gk}${add}
    <h3 style="margin-top:6px">Planned changes</h3>${list}
    <h3 style="margin-top:6px">Projected minutes</h3><table class="lb"><tbody>${proj}</tbody></table><p class="hint">Everyone plays between ${lo} and ${hi} of ${sim.end} minutes.</p></section>`}
// a gentle nudge before kick-off: who's had the least of the game so far this season (coaches only)
function fairNudge(){const list=seasonMatches().filter(m=>m.id!==LV.id),pt=ptStats(list),ps=playerStats(list),sq=LV.squad,rows=[];
  if(pt.mg){const by=sq.filter(n=>pt.out[n]&&pt.out[n].avail).sort((a,b)=>pt.out[a].min/pt.out[a].avail-pt.out[b].min/pt.out[b].avail);
    if(by.length>2){rows.push(["⏱",`Fewest minutes so far: ${by.slice(0,3).map(n=>`${esc(n)} (${Math.round(pt.out[n].min/pt.out[n].avail*100)}%)`).join(", ")}`]);
      const bn=sq.filter(n=>pt.out[n]&&pt.out[n].avail).sort((a,b)=>(pt.out[b].avail-pt.out[b].min)-(pt.out[a].avail-pt.out[a].min))[0];if(bn)rows.push(["🪑",`Most time on the bench: ${esc(bn)} (${Math.round(pt.out[bn].avail-pt.out[bn].min)} minutes)`])}}
  const ks=keeperStats(list),noGk=Object.keys(ks).length?sq.filter(n=>!ks[n]):[];
  const none=list.some(m=>m.potm)?sq.filter(n=>!(ps[n]&&ps[n].potm)):[];if(none.length)rows.push([POTM_IC,`Not been ${esc(POTM)} yet this season: ${none.map(esc).join(", ")}`]);
  if(SP.keeper&&noGk.length&&noGk.length<sq.length)rows.push(["🧤",`Not had a go in goal yet: ${noGk.map(esc).join(", ")}`]);
  return rows.length?`<section class="card"><h3>Fair play check</h3><div class="pvfacts">${rows.map(([i,v])=>`<div><span>${i}</span>${v}</div>`).join("")}</div><p class="hint">From this season's games. Only coaches see this.</p></section>`:""}
function planDueHtml(){const d=planDue();if(!d)return "";
  return `<div class="note plandue"><b>🔁 ${d.m===+LV.halfLen?"Half-time changes":`Subs due (${d.m}')`}</b><ul>${d.chs.map(c=>`<li>${chLine(c)}</li>`).join("")}</ul><div class="btns"><button class="btn gold" id="lvPlanGo">Make ${d.chs.length>1?"these changes":"this change"}</button><button class="btn ghost" id="lvPlanSkip">Skip</button></div></div>`}
function clockOn(n,now){LV.onSince[n]=now;const t=LV.touched[LV.half]=LV.touched[LV.half]||[];if(!t.includes(n))t.push(n)}
function clockOff(n,now){if(LV.onSince[n]){LV.mins[n]=Math.round(((LV.mins[n]||0)+(now-LV.onSince[n])/60000)*10)/10;delete LV.onSince[n]}}
function addEv(e){const m=matches.find(x=>x.id===LV.id);e.m=minuteOf(LV);e.h=LV.half;e.s=`${m.us??0}–${m.them??0}`;e.at=Date.now();LV.events.push(e)}
function pitchHtml(L,editable){const F=FORMS[L.form]||FORMS[FORM0];
  return `<div class="pitch${RUGBY?" rugby":""}">${F.xy.map(([x,y],i)=>{const n=L.slots[i]||"";
    return `<div class="spot${i===0&&SP.keeper?" gk":""}" style="left:${x}%;top:${y}%">${editable?`<select data-slot="${i}" aria-label="${F.label[i]}"><option value="">${F.label[i]}</option>${L.squad.map(p=>`<option${p===n?" selected":""}>${esc(p)}</option>`).join("")}</select>`:`<b>${esc(numOf(n)||"")}</b><span>${esc(n||F.label[i])}</span>`}</div>`}).join("")}</div>`}
function commentary(e,m){const opp=esc(m.opp||"the opposition");if(RUGBY){const r=rugbyCommentary(e,opp);if(r!=null)return r}
  switch(e.k){case "lu":return `<b>${e.re?"Line-up change":"Line-up confirmed"}</b> (${esc(e.form)}): ${esc(e.line[0])} in goal, ${e.line.slice(1).map(esc).join(", ")}.${e.bench&&e.bench.length?` Subs: ${e.bench.map(esc).join(", ")}.`:""}`;
    case "ko":return `<b>Kick-off!</b> ${esc(TEAM.name)} line up in a ${esc(e.form)}: ${e.line.map(esc).join(", ")}.`;
    case "goal":return `<b>GOAL!</b> ${esc(e.n)} scores for ${esc(TEAM.name)}${e.a?`, set up by ${esc(e.a)}`:""}. ${e.s}`;
    case "them":return `Goal for ${opp}. ${e.s}`;
    case "sub":return `Substitution: <b>${esc(e.on)}</b> comes on for ${esc(e.off)}.`;
    case "gk":return `${esc(e.n)} goes in goal.`;
    case "form":return `${esc(TEAM.name)} switch to a ${esc(e.form)}.`;
    case "ht":return e.s?`<b>Half time:</b> ${e.s}.`:`<b>Half time.</b>`;
    case "2h":return `The second half is under way.`;
    case "ft":return `<b>Full time!</b> ${esc(TEAM.name)} ${e.s||"v"} ${opp}.`;}return ""}
const EVI={lu:"📋",ko:"🟢",goal:"⚽",them:"🥅",sub:"🔁",gk:"🧤",form:"📋",ht:"⏸",["2h"]:"▶️",ft:"🏁"};
// rugby: the score events say what kind of score it was (e.t) and how many points (e.p)
const RSCORE={try:"Try",con:"Conversion",pen:"Penalty goal",drop:"Drop goal",pt:"Penalty try"};
function rugbyCommentary(e,opp){const L=x=>x.map(esc).join(", ");
  if(e.k==="lu"){const fb=fwdBacks(e.form,e.line),h=`<b>${e.re?"Line-up change":"Line-up confirmed"}</b> (${esc(e.form)}): `;
    return h+(fb?`Forwards: ${L(fb.fw)}. Backs: ${L(fb.bk)}.`:`${L(e.line.filter(Boolean))}.`)+(e.bench&&e.bench.length?` Replacements: ${L(e.bench)}.`:"")}
  if(e.k==="goal")return e.t==="pt"?`<b>Penalty try</b> to ${esc(TEAM.name)}. ${e.s}`:e.t==="con"?`Conversion by ${esc(e.n)}. ${e.s}`:e.t==="pen"?`Penalty goal by ${esc(e.n)}. ${e.s}`:e.t==="drop"?`<b>Drop goal</b> by ${esc(e.n)}! ${e.s}`:`<b>TRY!</b> ${esc(e.n)} scores for ${esc(TEAM.name)}. ${e.s}`;
  if(e.k==="them")return `${RSCORE[e.t]||"Score"} for ${opp}. ${e.s}`;
  if(e.k==="sub")return `Replacement: <b>${esc(e.on)}</b> comes on for ${esc(e.off)}.`;
  return null}
const evIcon=e=>RUGBY&&e.k==="goal"?(e.t==="try"||e.t==="pt"||!e.t?"🏉":"🎯"):RUGBY&&e.k==="them"?"🔻":EVI[e.k]||"";
function timelineHtml(L,m,asc){const ev=(L&&L.events||[]).slice();if(!asc)ev.reverse();
  return ev.length?`<ol class="tl">${ev.map(e=>`<li class="${e.k}"><span class="mn">${esc(e.k==="ht"?"HT":e.k==="ft"?"FT":e.m||"")}</span><span class="ic">${evIcon(e)}</span><span>${commentary(e,m)}</span></li>`).join("")}</ol>`:`<p class="hint">Nothing yet. Updates appear here as they happen.</p>`}
function liveBoard(m,L){const st=L&&L.status;const lab=st==="live"?`<span class="lv">LIVE</span> ${minuteOf(L)}`:st==="ht"?"Half time":st==="ft"?"Full time":"Not started";
  const ev=(L&&L.events)||[];const by={};ev.filter(e=>e.k==="goal"&&(!RUGBY||e.t==="try")).forEach(e=>{(by[e.n]=by[e.n]||[]).push(e.m)});
  const ours=Object.entries(by).map(([n,ms])=>`${esc(n)} ${ms.map(esc).join(", ")}`);const theirs=ev.filter(e=>e.k==="them"&&(!RUGBY||e.t==="try")).map(e=>esc(e.m));
  const kicks=RUGBY?(kk=>{ev.filter(e=>e.k==="goal"&&e.n&&KICK[e.t]).forEach(e=>{const o=kk[e.n]=kk[e.n]||{};o[e.t]=(o[e.t]||0)+1});return Object.entries(kk).map(([n,k])=>`<span>🎯 ${esc(n)} (${kickText(k)})</span>`)})({}):[];
  const sc=ours.length||theirs.length||kicks.length?`<div class="scorers"><div>${ours.map(x=>`<span>${SP.ball} ${x}</span>`).join("")}${kicks.join("")}</div><div>${theirs.length?`<span>${SP.ball} ${theirs.join(", ")}</span>`:""}</div></div>`:"";
  return `<div class="board"><div class="tm"><img src="${CREST}" alt="">${esc(TEAM.name)}</div><div class="sc">${m.hidden?"v":`${m.us??0} – ${m.them??0}`}<small>${lab}</small></div><div class="tm">${badge(m.opp)}${esc(m.opp)}</div>${sc}</div>`}
// ---------- rugby live match: kicks, the opposition's scores and the sin bin ----------
// LV.ask = a try scorer waiting for the conversion; LV.askThem = picking what the opposition scored;
// LV.askKick = "pen" or "drop" waiting for the kicker; LV.sin = {name: {until, slot}} (coach's phone only: parents never see a sin bin)
const SIN_MINS=+TEAM.sinBinMins||SP.sinBin||10;
function rugbyLiveExtras(m){const sin=Object.entries(LV.sin||{});
  const kicks=[KINDS.includes("pen")?`<button class="btn ghost" data-lvkick="pen">🎯 Penalty goal (${SP.pts.pen})</button>`:"",KINDS.includes("drop")?`<button class="btn ghost" data-lvkick="drop">🎯 Drop goal (${SP.pts.drop})</button>`:"",KINDS.includes("pen")?`<button class="btn ghost" id="lvPt">Penalty try (${SP.pts.pt}${SP.ptConv?" + conversion":""})</button>`:""].join("");
  return `${kicks?`<div class="btns">${kicks}</div>`:""}${sin.length?`<div class="note"><b>🟨 Sin bin</b>${sin.map(([n,v])=>`<div class="row" style="gap:8px;margin-top:6px"><span>${esc(n)}: back at ${esc(minuteOf(LV,v.until)||`${SIN_MINS} minutes`)}${Date.now()>=v.until?" <b>(time's up)</b>":""}</span><button class="mini" data-lvsinback="${esc(n)}">Back on</button></div>`).join("")}<p class="hint" style="margin:6px 0 0">Only this phone sees the sin bin. The team plays a player short until you tap Back on.</p></div>`:""}`}
function rugbyAsk(m,on){
  if(LV.ask)return `<div class="ask"><b>Conversion for ${esc(LV.ask)}'s try?</b><div class="chips">${on.map(n=>`<button data-lvcon="${esc(n)}">✅ ${esc(n)} kicked it</button>`).join("")}<button data-lvcon="">Missed or not taken</button></div></div>`;
  if(LV.askKick)return `<div class="ask"><b>Who kicked the ${LV.askKick==="pen"?"penalty goal":"drop goal"}?</b><div class="chips">${on.map(n=>`<button data-lvkicker="${esc(n)}">${esc(n)}</button>`).join("")}<button data-lvkicker="" data-cancel="1">Cancel</button></div></div>`;
  if(LV.askThem)return `<div class="ask"><b>What did ${esc(m.opp)} score?</b><div class="chips">${["try",...KINDS,...(KINDS.includes("pen")?["pt"]:[])].map(t=>`<button data-lvthem="${t}">${RSCORE[t]} (${SP.pts[t]})</button>`).join("")}<button data-lvthem="">Cancel</button></div></div>`;
  return ""}
// a score for us: a try (n = the scorer), a kick (n = the kicker) or a penalty try (no name)
async function rugbyScore(t,n){const m=matches.find(x=>x.id===LV.id),p=SP.pts[t]||0,body={};
  if(t==="try"){const pl=Object.assign({},m.played||{});pl[n]=(pl[n]||0)+1;m.played=body.played=pl}
  if(KICK[t]&&n){const k=JSON.parse(JSON.stringify(m.kicks||{}));const o=k[n]=k[n]||{};o[t]=(o[t]||0)+1;m.kicks=body.kicks=k}
  m.us=body.us=(+m.us||0)+p;addEv(Object.assign({k:"goal",t,p,na:1},n?{n}:{}));
  LV.ask=(t==="try"||t==="pt"&&SP.ptConv)&&KINDS.includes("con")?(n||TEAM.name):null;LV.askKick=null;liveSaveLocal();render();
  if(t!=="con")goalFlash(n,`${TEAM.shortName||TEAM.name} ${m.us}-${+m.them||0} ${m.opp}`,t);await livePush(body)}
function liveView(){
  const m=LV&&matches.find(x=>x.id===LV.id);if(!m)return `<div class="card empty">Pick a fixture and tap ▶ Live match.</div>`;
  const pr=m.practice?`<div class="note"><b>Practice match.</b> Try anything: nothing is saved and parents can't see it. Tap "Practice live match" on Fixtures to start again.</div>`:"";
  if(LV.status==="pre")return `<div class="live">${pr}${liveBoard(m,LV)}
    <section class="card stack"><h3>Starting line-up</h3>
    <div class="btns">${RUGBY&&Object.keys(FORMS).length<2?"":`<span class="hint">Formation</span><div class="seg" role="group" aria-label="Formation">${Object.keys(FORMS).map(f=>`<button data-lvform="${f}" aria-pressed="${LV.form===f}"${LV.locked?" disabled":""}>${f}</button>`).join("")}</div>`}
      <label class="f" style="flex-direction:row;align-items:center;gap:8px">Minutes each half<input type="number" id="lvLen" min="5" max="45" value="${LV.halfLen}" style="width:70px"></label></div>
    ${pitchHtml(LV,!LV.locked)}
    <p class="hint">Subs: ${bench().map(esc).join(", ")||"none"}. ${LV.locked?`🔒 Line-up locked${m.practice?"":" and sent to parents"}. Unlock it to make a change; locking it again tells parents what changed.`:`Pick a player for each position.${SP.keeper?" The keeper is the GK spot.":""} Lock the line-up when it's final${m.practice?"":" and parents with alerts on get \"Line-up confirmed\""}.`}</p>
    ${lateAddHtml()}
    <div class="btns">${LV.locked?`<button class="btn gold bigbtn" id="lvKo">Kick off</button><button class="btn ghost" id="lvUnlock">🔓 Unlock line-up</button>`:`<button class="btn gold bigbtn" id="lvLock"${onPitch().length<SIDE?" disabled":""}>🔒 Lock line-up</button><button class="btn ghost" id="lvKo"${onPitch().length<5?" disabled":""}>Kick off</button>`}${m.practice?"":`<button class="btn ghost" data-tbmatch="${esc(m.id)}">📋 Tactics board</button>`}<button class="btn ghost" data-view="fixtures">Back</button></div></section>${planCard()}${fairNudge()}</div>`;
  const pl=played(m),as=assistsOf(m),on=onPitch(),F=FORMS[LV.form];
  return `<div class="live">${pr}${liveBoard(m,LV)}${planDueHtml()}
  <div class="btns">${LV.status==="live"&&LV.half===1?`<button class="btn" id="lvHt">Half time</button>`:""}${LV.status==="ht"?`<button class="btn gold" id="lv2h">Start 2nd half</button>`:""}
    <button class="btn ghost" id="lvOther">${RUGBY?"🏉 Try by someone else":"⚽ Someone else scored"}</button><button class="btn ghost" id="lvThem">+ ${esc(m.opp.split(" ")[0])} scored</button><button class="btn ghost" id="lvUndo">Undo last</button>
    ${RUGBY&&Object.keys(FORMS).length<2?"":`<div class="seg" role="group" aria-label="Formation">${Object.keys(FORMS).map(f=>`<button data-lvform="${f}" aria-pressed="${LV.form===f}">${f}</button>`).join("")}</div>`}</div>${RUGBY?rugbyLiveExtras(m):""}
  ${pitchHtml(LV,false)}
  <div class="lp">${LV.slots.map((n,i)=>n?`<div class="pl on"><div class="nm"><span>${esc(n)}</span><span class="tag">${F.label[i]}</span></div>
    <div class="acts"><button class="goal" data-lvgoal="${esc(n)}">${RUGBY?`🏉 Try ${pl[n]||0}`:`⚽ ${pl[n]||0}`}</button><button data-lvsub="${i}">🔁 Sub</button>${RUGBY?`<button data-lvsin="${i}" aria-label="Sin bin ${esc(n)}">🟨</button>`:""}</div></div>`:"").join("")}</div>
  <p class="hint"><b>Subs bench:</b> ${bench().map(esc).join(", ")||"none"}. Rolling subs: tap 🔁 on the player coming off.</p>
  ${lateAddHtml()}
  <div class="btns">${LV.half===2&&LV.status==="live"?`<button class="btn gold bigbtn" id="lvDone">Full time: save and finish</button>`:""}<button class="btn ghost" data-tl="${esc(m.id)}">Parents' view</button><button class="btn ghost" data-view="fixtures">${m.practice?"End practice":"Leave (keeps going)"}</button></div>
  <section class="card"><h3>Timeline</h3>${timelineHtml(LV,m)}</section>
  ${RUGBY?rugbyAsk(m,on):LV.ask?`<div class="ask"><b>Who assisted ${esc(LV.ask)}'s goal?</b><div class="chips">${on.filter(n=>n!==LV.ask).map(n=>`<button data-lvasg="${esc(n)}">${esc(n)}</button>`).join("")}<button data-lvasg="">No assist</button></div></div>`:""}
  ${LV.askOther?`<div class="ask"><b>Who scored${RUGBY?" the try":""}?</b><div class="chips">${bench().map(n=>`<button data-lvother="${esc(n)}">${esc(n)}</button>`).join("")}${notInSquad().map(n=>`<button data-lvother="${esc(n)}">${esc(n)} (not in squad)</button>`).join("")}<button data-lvother="">Cancel</button></div><p class="hint" style="margin:6px 0 0">Players on the pitch have their own ${RUGBY?"🏉":"⚽"} button. Anyone not in the squad is added to it. Not listed at all? Type their name under "Not listed?" below, then come back here.</p></div>`:""}
  ${LV.subSlot!=null?`<div class="ask"><b>Who's coming on for ${esc(LV.slots[LV.subSlot])}?</b><div class="chips">${bench().map(n=>`<button data-lvon="${esc(n)}">${esc(n)}</button>`).join("")}${notInSquad().map(n=>`<button data-lvon="${esc(n)}">${esc(n)} (not in squad)</button>`).join("")}</div>
    <b style="display:block;margin-top:10px">Or swap positions with</b><div class="chips">${on.filter(n=>n!==LV.slots[LV.subSlot]).map(n=>`<button data-lvswap="${esc(n)}">${esc(n)} (${F.label[LV.slots.indexOf(n)]})</button>`).join("")}<button data-lvcancel="1">Cancel</button></div></div>`:""}
  </div>`;
}
function tlView(){const m=matches.find(x=>x.id===tlMatch);if(!m)return `<div class="card empty">Match not found.</div>`;return `<div class="live">${tlBody(m)}</div>`}
// ---------- tactics board (coaches only: boards stay on the coach's phone; a coach can share a picture of one) ----------
// Pitch units: 100 wide by 150 long, our goal at the bottom. A board = {mid, title, form, kit, opp:colour, oppOn, ball, us:[{n,x,y,gk}], them:[{x,y}], arrows:[{t,x1,y1,x2,y2}], at}
// Kept in localStorage SK+".tactics" = {cur: board key, boards:{key: board}, saved:[{name, board}]}
const TB_OPP=[["#E53935","#FFFFFF","Red"],["#FFFFFF","#111111","White"],["#111111","#FFFFFF","Black"],["#1E5BD8","#FFFFFF","Blue"],["#FF8F1F","#111111","Orange"],["#7B2CBF","#FFFFFF","Purple"]];
const TB_ARROW=RUGBY?{run:["Run","#FFD200",""],pass:["Pass","#FFFFFF","2.2 1.6"],kick:["Kick","#FFFFFF",".4 1.6"]}:{run:["Run","#FFD200",""],pass:["Pass","#FFFFFF","2.2 1.6"],drib:["Dribble","#FFFFFF",""]};
// a classic black-and-white football: a black pentagon in the middle with seams out to five more, cut off by the edge of the ball
const TB_BALL=(()=>{const R=3,P=(cx,cy,r,a0)=>Array.from({length:5},(_,k)=>{const a=(a0+72*k)*Math.PI/180;return [cx+r*Math.cos(a),cy+r*Math.sin(a)]}),f=v=>v.toFixed(2),pg=pts=>`M${pts.map(p=>f(p[0])+" "+f(p[1])).join("L")}Z`;
  const mid=P(0,0,1.1,-90),outer=mid.map((_,k)=>{const a=-90+72*k,r=a*Math.PI/180;return P(3.1*Math.cos(r),3.1*Math.sin(r),1.1,a+180)});
  const seams=mid.map((p,k)=>`M${f(p[0])} ${f(p[1])}L${f(outer[k][0][0])} ${f(outer[k][0][1])}`).join("");
  return `<circle r="${R}" fill="#fff"/><g clip-path="url(#tbBallClip)"><path d="${pg(mid)}${outer.map(pg).join("")}" fill="#111"/><path d="${seams}" stroke="#111" stroke-width=".18" fill="none"/></g><circle r="${R}" fill="none" stroke="#111" stroke-width=".3"/>`})();
// a rugby ball: a white oval with a seam and stitches
const TB_OVAL=`<g transform="rotate(-35)"><ellipse rx="4.2" ry="2.6" fill="#fff" stroke="#111" stroke-width=".3"/><path d="M-2.6 0H2.6" stroke="#111" stroke-width=".25"/>${[-1.6,-.5,.6,1.7].map(x=>`<path d="M${x} -.5V.5" stroke="#111" stroke-width=".2"/>`).join("")}</g>`;
let TBS=null,tbMode="move",tbSel=null,tbUndo=[];
function tbStore(){if(TBS)return TBS;try{TBS=JSON.parse(localStorage.getItem(SK+".tactics")||"null")}catch(e){}if(!TBS||!TBS.boards)TBS={cur:"",boards:{},saved:[]};return TBS}
function tbSave(){const s=tbStore(),ks=Object.keys(s.boards).sort((a,b)=>(s.boards[b].at||0)-(s.boards[a].at||0));ks.slice(12).forEach(k=>{if(k!==s.cur)delete s.boards[k]});
  try{localStorage.setItem(SK+".tactics",JSON.stringify(s))}catch(e){toast("This phone's storage is full, so the board wasn't kept.")}}
function TB(){const s=tbStore();return s.boards[s.cur]}
function tbKits(){const k=TEAM.kits||{},ks=Object.keys(k);return ks.length?ks.map(id=>[id,k[id].body,k[id].ink||"#fff",k[id].label||id]):[["club",(TEAM.colours||{}).club||"#2235E8",(TEAM.colours||{}).clubInk||"#fff","Club"]]}
function tbKit(b){return tbKits().find(k=>k[0]===b.kit)||tbKits()[0]}
function tbOppCol(b){return TB_OPP.find(c=>c[0]===b.opp)||TB_OPP[0]}
// a formation laid out for a full pitch: ours in the bottom half, theirs mirrored in the top half
function tbShape(form){const F=FORMS[form]||FORMS[FORM0];return F.xy.map(([x,y],i)=>({x,y:Math.round((75+y*.75)*10)/10,gk:i===0&&SP.keeper}))}
function tbThem(n){return tbShape(FORM0).slice(0,n).map(p=>({x:100-p.x,y:Math.round((150-p.y)*10)/10}))}
function tbNew(mid){const m=mid&&matches.find(x=>x.id===mid),L=m&&m.live,cur=players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99)).map(p=>p.name);
  const squad=m&&m.squad&&m.squad.length?m.squad.slice():cur,form=L&&L.form&&FORMS[L.form]?L.form:FORM0;
  const names=L&&L.slots&&L.slots.filter(Boolean).length?L.slots.slice():squad.slice(0,SIDE);
  return {mid:mid||"",title:m?`v ${m.opp}`:"",form,kit:tbKits()[0][0],opp:TB_OPP[0][0],oppOn:true,ball:{x:50,y:75},
    us:tbShape(form).map((p,i)=>Object.assign(p,{n:names[i]||""})),them:tbThem(SIDE),arrows:[],squad,at:Date.now()}}
function tbOpen(mid){const s=tbStore(),k=mid||"general";if(!s.boards[k])s.boards[k]=tbNew(mid);s.cur=k;tbSel=null;tbUndo=[];tbMode="move";tbSave();setView("tactics")}
function tbPush(){const b=TB();if(!b)return;tbUndo.push(JSON.stringify(b));if(tbUndo.length>40)tbUndo.shift()}
function tbChanged(){const b=TB();if(b)b.at=Date.now();tbSave();render()}
function tbSquad(b){const sq=(b.squad&&b.squad.length?b.squad:players.filter(p=>p.current).map(p=>p.name));return sq.concat(b.us.map(p=>p.n).filter(n=>n&&!sq.includes(n)))}
function tbBench(b){const on=b.us.map(p=>p.n);return tbSquad(b).filter(n=>!on.includes(n))}
// the arrow's path: straight, or a wiggle for a dribble; it stops short so the arrowhead lands on the point
function tbPath(a){const dx=a.x2-a.x1,dy=a.y2-a.y1,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,end=Math.max(0,L-2.4);
  if(a.t!=="drib")return `M${a.x1.toFixed(1)} ${a.y1.toFixed(1)}L${(a.x1+ux*end).toFixed(1)} ${(a.y1+uy*end).toFixed(1)}`;
  const n=Math.max(2,Math.round(end/3.2)),st=end/n;let d=`M${a.x1.toFixed(1)} ${a.y1.toFixed(1)}`;
  for(let i=0;i<n;i++){const s=i*st,mx=a.x1+ux*(s+st/2)-uy*(i%2?1.6:-1.6),my=a.y1+uy*(s+st/2)+ux*(i%2?1.6:-1.6);d+=`Q${mx.toFixed(1)} ${my.toFixed(1)} ${(a.x1+ux*(s+st)).toFixed(1)} ${(a.y1+uy*(s+st)).toFixed(1)}`}return d}
function tbArrowSvg(a,i,live){const [,c,dash]=TB_ARROW[a.t]||TB_ARROW.run,d=tbPath(a);
  return `<g${live?` data-tbarrow="${i}"`:""}>${live?`<path d="${d}" stroke="transparent" stroke-width="5" fill="none"/>`:""}<path d="${d}" stroke="${tbSel==="a"+i&&live?"#FF4FA3":c}" stroke-width="1.1" fill="none" stroke-linecap="round"${dash?` stroke-dasharray="${dash}"`:""} marker-end="url(#tbh-${a.t})"/></g>`}
// a rugby pitch on the same 100 by 150 board: in-goal areas, try lines, 22s, 10-metre and 5-metre lines, and the posts
function tbRugbyMarks(line){const dash=(y,d)=>`<line x1="3" y1="${y}" x2="97" y2="${y}" ${line} stroke-dasharray="${d}"/>`,posts=(y,dir)=>`<path d="M46.5 ${y}V${y-dir*5}M53.5 ${y}V${y-dir*5}M46.5 ${y-dir*1.6}H53.5" stroke="#fff" stroke-width=".7" fill="none"/>`;
  return `<rect x="3" y="3" width="94" height="144" ${line}/><line x1="3" y1="11" x2="97" y2="11" ${line}/><line x1="3" y1="139" x2="97" y2="139" ${line}/><line x1="3" y1="75" x2="97" y2="75" ${line}/>
    <line x1="3" y1="39" x2="97" y2="39" ${line}/><line x1="3" y1="111" x2="97" y2="111" ${line}/>${dash(62,"2 2")}${dash(88,"2 2")}${dash(17,"1 2")}${dash(133,"1 2")}
    <line x1="8" y1="11" x2="8" y2="139" ${line} stroke-dasharray="1 2"/><line x1="92" y1="11" x2="92" y2="139" ${line} stroke-dasharray="1 2"/>${posts(11,1)}${posts(139,-1)}`}
function tbSvg(b,live,rot){const [,kb,ki]=tbKit(b),[ob,oi]=tbOppCol(b),line='stroke="rgba(255,255,255,.85)" stroke-width=".5" fill="none"';
  const stripes=Array.from({length:10},(_,i)=>`<rect x="0" y="${i*15}" width="100" height="15" fill="${i%2?"#2E8B3E":"#33963F"}"/>`).join("");
  const marks=RUGBY?tbRugbyMarks(line):`<rect x="3" y="3" width="94" height="144" ${line}/><line x1="3" y1="75" x2="97" y2="75" ${line}/><circle cx="50" cy="75" r="9" ${line}/><circle cx="50" cy="75" r=".7" fill="#fff"/>
    <rect x="21" y="3" width="58" height="21" ${line}/><rect x="36" y="3" width="28" height="7" ${line}/><circle cx="50" cy="17" r=".6" fill="#fff"/><rect x="44" y=".6" width="12" height="2.4" ${line}/>
    <rect x="21" y="126" width="58" height="21" ${line}/><rect x="36" y="140" width="28" height="7" ${line}/><circle cx="50" cy="133" r=".6" fill="#fff"/><rect x="44" y="147" width="12" height="2.4" ${line}/>`;
  const heads=Object.keys(TB_ARROW).map(t=>`<marker id="tbh-${t}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto"><path d="M0 0L10 5L0 10z" fill="${TB_ARROW[t][1]}"/></marker>`).join("");
  const tok=(x,y,fill,ink,txt,name,attr,sel,gk)=>`<g class="tbt" transform="translate(${x} ${y})"${attr}>${rot?'<g transform="rotate(-90)">':""}<circle r="4.2" fill="${gk?"#1AA8A0":fill}" stroke="${sel?"#FF4FA3":fill.toUpperCase()==="#FFFFFF"?"#111":"#fff"}" stroke-width="${sel?1:.6}"/><text y="1.5" text-anchor="middle" font-size="4" font-weight="800" fill="${gk?"#fff":ink}" font-family="Arial,sans-serif">${esc(txt)}</text>${name?`<text y="${(rot?x>92:y>140)?-5.6:8.4}" text-anchor="middle" font-size="3" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.75)" stroke-width=".9" stroke-linejoin="round" paint-order="stroke" font-family="Arial,sans-serif">${esc(name)}</text>`:""}${rot?"</g>":""}</g>`;
  const them=b.oppOn?b.them.map((p,i)=>tok(p.x,p.y,ob,oi,String(i+1),"",live?` data-tbtok="t${i}"`:"",tbSel==="t"+i&&live)).join(""):"";
  const us=b.us.map((p,i)=>tok(p.x,p.y,kb,ki,p.n?(numOf(p.n)||p.n.slice(0,1)):"?",p.n||"Empty",live?` data-tbtok="u${i}"`:"",tbSel==="u"+i&&live,p.gk)).join("");
  const ball=b.ball?`<g class="tbt" transform="translate(${b.ball.x} ${b.ball.y})"${live?' data-tbtok="ball"':""}>${RUGBY?TB_OVAL:TB_BALL}</g>`:"";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${rot?"150 100":"100 150"}"${live?' class="tbpitch" id="tbPitch" role="img" aria-label="Tactics board"':' width="1000" height="1500"'}><defs>${heads}<clipPath id="tbBallClip"><circle r="3"/></clipPath></defs><g id="tbG"${rot?' transform="translate(150 0) rotate(90)"':""}>${stripes}${marks}<g id="tbArrows">${b.arrows.map((a,i)=>tbArrowSvg(a,i,live)).join("")}</g>${them}${us}${ball}</g></svg>`}
function tbFixtures(){const today=todayLocal();return sortMatches(matches.filter(m=>!m.practice&&!m.postponed&&!result(m)&&(m.date||"")>=today)).slice(0,6)}
function tacticsView(){if(!canWrite){if(tbFs)tbFsOff();return `<div class="card empty">The tactics board is for coaches. Sign in to use it.</div>`}
  const s=tbStore();if(!TB()){s.boards.general=s.boards.general||tbNew("");s.cur="general"}const b=TB(),bn=tbBench(b),fx=tbFixtures();
  const sel=tbSel&&tbSel[0]==="u"?b.us[+tbSel.slice(1)]:null;
  const selBar=sel?`<div class="note"><b>${sel.n?esc(sel.n):"Empty spot"}</b> ${bn.length?`· swap with <span class="chips">${bn.map(n=>`<button data-tbon="${esc(n)}">${esc(n)}</button>`).join("")}</span>`:""}<div class="btns" style="margin-top:6px">${sel.n?`<button class="mini" id="tbOff">Move to the bench</button>`:""}${SP.keeper?`<button class="mini" id="tbGk">${sel.gk?"Not the keeper":"Make keeper"}</button>`:""}<button class="mini" id="tbDesel">Done</button></div></div>`
    :tbSel&&tbSel[0]==="t"?`<div class="note"><b>Opposition player ${+tbSel.slice(1)+1}</b><div class="btns" style="margin-top:6px"><button class="mini" id="tbThemDel">Remove</button><button class="mini" id="tbDesel">Done</button></div></div>`
    :tbSel&&tbSel[0]==="a"?`<div class="note"><b>Arrow</b><div class="btns" style="margin-top:6px"><button class="mini" id="tbArrowDel">Delete arrow</button><button class="mini" id="tbDesel">Done</button></div></div>`:"";
  const hint={move:"Drag players and the ball. Tap a player to swap them with a sub or move them to the bench.",run:"Draw a run: drag from where the player starts to where they should go.",pass:"Draw a pass: drag from the passer to where the ball goes.",drib:"Draw a dribble: drag from where the player picks the ball up to where they take it.",kick:"Draw a kick: drag from the kicker to where the ball lands."}[tbMode];
  if(tbFs)return tbFsView(b,selBar);
  return `<div class="stack tb">
  <section class="card stack"><div class="tbhead"><h2>📋 Tactics board</h2><button class="btn gold" id="tbFsBtn">⛶ Full screen</button></div>
    <div class="btns"><label class="f" style="flex:1;min-width:200px">Board for<select id="tbFor"><option value="general"${s.cur==="general"?" selected":""}>Training and general</option>${fx.map(m=>`<option value="${esc(m.id)}"${s.cur===m.id?" selected":""}>v ${esc(m.opp)}, ${esc(new Date(m.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"}))}</option>`).join("")}${s.cur!=="general"&&!fx.some(m=>m.id===s.cur)?`<option value="${esc(s.cur)}" selected>${esc(b.title||"This match")}</option>`:""}</select></label>
      ${RUGBY&&Object.keys(FORMS).length<2?"":`<div><span class="hint">Formation</span><div class="seg" role="group" aria-label="Formation">${Object.keys(FORMS).map(f=>`<button data-tbform="${f}" aria-pressed="${b.form===f}">${f}</button>`).join("")}</div></div>`}</div>
    <div class="seg tbmodes" role="group" aria-label="What a finger does">${[["move","✋ Move"],["run","➜ Run"],["pass","⇢ Pass"],RUGBY?["kick","⤴ Kick"]:["drib","〰 Dribble"]].map(([k,l])=>`<button data-tbmode="${k}" aria-pressed="${tbMode===k}">${l}</button>`).join("")}</div>
    <div class="tbwrap">${tbSvg(b,true)}</div>
    <p class="hint" style="margin:0">${hint}</p>
    ${selBar}
    <div class="btns"><button class="btn ghost" id="tbUndo"${tbUndo.length?"":" disabled"}>↶ Undo</button><button class="btn ghost" id="tbClearArrows"${b.arrows.length?"":" disabled"}>Clear arrows</button><button class="btn ghost" id="tbReset">Reset to ${esc(b.form)}</button><button class="btn gold" id="tbShare">📤 Save or share picture</button></div>
    <p class="hint" style="margin:0"><b>Subs:</b> ${bn.length?`<span class="chips">${bn.map(n=>`<button data-tbon="${esc(n)}">${esc(n)}</button>`).join("")}</span> <span>Tap one to put them on the pitch${sel?` in place of ${esc(sel.n||"the empty spot")}`:""}.</span>`:"everyone's on the pitch."}</p>
  </section>
  <section class="card stack"><h3>Settings</h3>
    <div class="btns"><span class="hint">Our shirts</span><div class="seg" role="group" aria-label="Our shirts">${tbKits().map(([id,c,,l])=>`<button data-tbkit="${esc(id)}" aria-pressed="${b.kit===id}"><i class="sw" style="background:${esc(c)}"></i>${esc(l)}</button>`).join("")}</div></div>
    <div class="btns"><span class="hint">Opposition</span><div class="seg" role="group" aria-label="Show the opposition"><button data-tbopp="1" aria-pressed="${!!b.oppOn}">Show</button><button data-tbopp="0" aria-pressed="${!b.oppOn}">Hide</button></div>
      ${b.oppOn?`<button class="mini" id="tbThemLess"${b.them.length?"":" disabled"} aria-label="One fewer opposition player">−</button><b>${b.them.length}</b><button class="mini" id="tbThemMore"${b.them.length>=Math.max(11,SIDE)?" disabled":""} aria-label="One more opposition player">+</button>`:""}</div>
    ${b.oppOn?`<div class="btns"><span class="hint">Their shirts</span><div class="seg" role="group" aria-label="Their shirts">${TB_OPP.map(([c,,l])=>`<button data-tboppcol="${c}" aria-pressed="${b.opp===c}"><i class="sw" style="background:${c}"></i>${l}</button>`).join("")}</div></div>`:""}
    <div class="btns"><span class="hint">Ball</span><div class="seg" role="group" aria-label="Show the ball"><button data-tbball="1" aria-pressed="${!!b.ball}">Show</button><button data-tbball="0" aria-pressed="${!b.ball}">Hide</button></div></div>
  </section>
  <section class="card stack"><h3>Saved boards</h3>
    <p class="hint" style="margin:0">Keep set-ups you use again, like ${RUGBY?"a lineout, a scrum or a kick-off":"a kick-off shape, defending corners or a press"}. They're kept on this phone.</p>
    ${s.saved.length?`<div class="chips">${s.saved.map((x,i)=>`<span class="tbsaved"><button data-tbload="${i}">${esc(x.name)}</button><button data-tbdel="${i}" aria-label="Delete ${esc(x.name)}">✕</button></span>`).join("")}</div>`:""}
    <div class="btns"><input type="text" id="tbName" placeholder="Name, e.g. ${RUGBY?"Lineout move":"Defending corners"}" maxlength="40" style="max-width:260px"><button class="btn ghost" id="tbKeep">Save this board</button></div>
  </section>
  <p class="hint">Only coaches see the tactics board, and boards stay on this phone. Share a picture in the team chat if you'd like the players to see it.</p></div>`}
function tbPt(e){const sv=$("#tbPitch"),p=sv.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const q=p.matrixTransform(($("#tbG")||sv).getScreenCTM().inverse());return {x:Math.round(q.x*10)/10,y:Math.round(q.y*10)/10}}
let tbDrag=null;
document.addEventListener("pointerdown",e=>{if(view!=="tactics"||!e.target.closest)return;const sv=e.target.closest("#tbPitch");if(!sv)return;const b=TB();if(!b)return;e.preventDefault();
  const p=tbPt(e),tk=e.target.closest("[data-tbtok]"),ar=e.target.closest("[data-tbarrow]");
  if(tbMode!=="move"){const g=document.createElementNS("http://www.w3.org/2000/svg","g");$("#tbArrows").appendChild(g);tbDrag={arrow:{t:tbMode,x1:p.x,y1:p.y,x2:p.x,y2:p.y},g};}
  else if(tk){tbDrag={tok:tk.dataset.tbtok,el:tk,p0:p,moved:false}}
  else if(ar){tbSel="a"+ar.dataset.tbarrow;render();return}
  else{if(tbSel){tbSel=null;render()}return}
  try{sv.setPointerCapture(e.pointerId)}catch(er){}});
document.addEventListener("pointermove",e=>{if(!tbDrag||view!=="tactics")return;const p=tbPt(e),b=TB();
  if(tbDrag.arrow){Object.assign(tbDrag.arrow,{x2:Math.max(1,Math.min(99,p.x)),y2:Math.max(1,Math.min(149,p.y))});tbDrag.g.innerHTML=Math.hypot(p.x-tbDrag.arrow.x1,p.y-tbDrag.arrow.y1)>3?tbArrowSvg(tbDrag.arrow,0,false):"";return}
  if(!tbDrag.moved&&Math.hypot(p.x-tbDrag.p0.x,p.y-tbDrag.p0.y)<1.5)return;
  if(!tbDrag.moved){tbPush();tbDrag.moved=true}
  const x=Math.max(2,Math.min(98,p.x)),y=Math.max(2,Math.min(148,p.y)),k=tbDrag.tok,o=k==="ball"?b.ball:k[0]==="u"?b.us[+k.slice(1)]:b.them[+k.slice(1)];
  o.x=x;o.y=y;tbDrag.el.setAttribute("transform",`translate(${x} ${y})`)});
function tbUp(){if(!tbDrag||view!=="tactics")return;const d=tbDrag,b=TB();tbDrag=null;
  if(d.arrow){if(Math.hypot(d.arrow.x2-d.arrow.x1,d.arrow.y2-d.arrow.y1)>3){tbPush();b.arrows.push(d.arrow);tbChanged()}else d.g.remove();return}
  if(d.moved){tbChanged();return}
  if(d.tok!=="ball"){tbSel=tbSel===d.tok?null:d.tok;render()}}
document.addEventListener("pointerup",tbUp);document.addEventListener("pointercancel",tbUp);
document.addEventListener("change",e=>{if(e.target.id==="tbFor"){const v=e.target.value;tbOpen(v==="general"?"":v)}});
document.addEventListener("click",async e=>{if(view!=="tactics")return;const t=e.target.closest("button");if(!t)return;const b=TB();if(!b)return;const d=t.dataset;
  if(d.tbmode){tbMode=d.tbmode;tbSel=null;render();return}
  if(d.tbform){tbPush();b.form=d.tbform;const sh=tbShape(b.form),names=b.us.map(p=>p.n);b.us=sh.map((p,i)=>Object.assign(p,{n:names[i]||""}));tbChanged();return}
  if(d.tbkit){b.kit=d.tbkit;tbChanged();return}
  if(d.tboppcol){b.opp=d.tboppcol;tbChanged();return}
  if(d.tbopp){b.oppOn=d.tbopp==="1";tbChanged();return}
  if(d.tbball){tbPush();b.ball=d.tbball==="1"?{x:50,y:75}:null;tbChanged();return}
  if(d.tbon){tbPush();const n=d.tbon,i=tbSel&&tbSel[0]==="u"?+tbSel.slice(1):b.us.findIndex(p=>!p.n);
    if(i<0){toast("Tap the player they're replacing first.");return}b.us[i].n=n;tbSel=null;tbChanged();return}
  if(t.id==="tbOff"&&tbSel){tbPush();const i=+tbSel.slice(1);b.us[i].n="";tbSel=null;tbChanged();return}
  if(t.id==="tbGk"&&tbSel){tbPush();const i=+tbSel.slice(1),was=b.us[i].gk;b.us.forEach(p=>p.gk=false);b.us[i].gk=!was;tbChanged();return}
  if(t.id==="tbThemDel"&&tbSel){tbPush();b.them.splice(+tbSel.slice(1),1);tbSel=null;tbChanged();return}
  if(t.id==="tbArrowDel"&&tbSel){tbPush();b.arrows.splice(+tbSel.slice(1),1);tbSel=null;tbChanged();return}
  if(t.id==="tbDesel"){tbSel=null;render();return}
  if(t.id==="tbThemLess"){tbPush();b.them.pop();tbSel=null;tbChanged();return}
  if(t.id==="tbThemMore"){tbPush();const all=tbThem(SIDE),free=all.find(q=>!b.them.some(o=>Math.hypot(o.x-q.x,o.y-q.y)<3));b.them.push(free||{x:50,y:40});tbChanged();return}
  if(t.id==="tbUndo"&&tbUndo.length){const s=tbStore();s.boards[s.cur]=JSON.parse(tbUndo.pop());tbSel=null;tbSave();render();return}
  if(t.id==="tbClearArrows"){tbPush();b.arrows=[];tbSel=null;tbChanged();return}
  if(t.id==="tbReset"){tbPush();const sh=tbShape(b.form);b.us=sh.map((p,i)=>Object.assign(p,{n:(b.us[i]||{}).n||""}));b.them=tbThem(b.them.length);b.arrows=[];if(b.ball)b.ball={x:50,y:75};tbSel=null;tbChanged();return}
  if(t.id==="tbKeep"){const name=($("#tbName").value||"").trim();if(!name){toast("Give the board a name first.");$("#tbName").focus();return}
    const s=tbStore(),copy=JSON.parse(JSON.stringify(b)),i=s.saved.findIndex(x=>x.name.toLowerCase()===name.toLowerCase());if(i>=0)s.saved[i].board=copy;else s.saved.push({name,board:copy});tbSave();render();toast(`Saved "${name}" on this phone.`);return}
  if(d.tbload){const s=tbStore(),x=s.saved[+d.tbload];if(!x)return;tbPush();const keep={mid:b.mid,title:b.title,squad:b.squad};
    // a saved board brings its shapes and arrows; the names stay this board's own where they can
    s.boards[s.cur]=Object.assign(JSON.parse(JSON.stringify(x.board)),keep,{at:Date.now()});const nb=TB(),sq=tbSquad(nb);if(nb.us.some(p=>p.n&&!sq.includes(p.n))){const left=sq.filter(n=>!nb.us.some(p=>p.n===n));nb.us.forEach(p=>{if(p.n&&!sq.includes(p.n))p.n=left.shift()||""})}
    tbSel=null;tbChanged();toast(`Loaded "${x.name}".`);return}
  if(d.tbdel){const s=tbStore(),x=s.saved[+d.tbdel];if(x&&confirm(`Delete the saved board "${x.name}"?`)){s.saved.splice(+d.tbdel,1);tbSave();render()}return}
  if(t.id==="tbFsBtn"){tbFsOn();return}
  if(t.id==="tbFsExit"){tbFsOff();return}
  if(t.id==="tbShare")tbShare(b)});
// Full screen: the board fills the screen for showing the team on an iPad or phone at a game. The pitch turns sideways when
// the screen is wider than it is tall, the buttons get big, and the screen is kept awake. Safari on iPhone has no real full
// screen for pages, so the board covers the page there instead (and from the Home Screen there are no Safari bars at all).
let tbFs=false,tbFsNative=false,tbLock=null,tbRot=false;
const tbWide=()=>innerWidth>innerHeight;
function tbFsView(b,selBar){tbRot=tbWide();
  const btn=(id,label,dis)=>`<button id="${id}"${dis?" disabled":""}>${label}</button>`;
  return `<div class="tb tbfs ${tbRot?"land":"port"}" role="dialog" aria-label="Tactics board, full screen">
  <div class="tbfsbar">
    <button class="tbfsx" id="tbFsExit" aria-label="Exit full screen">✕ Exit</button>
    <div class="tbfsmodes" role="group" aria-label="What a finger does">${[["move","✋ Move"],["run","➜ Run"],["pass","⇢ Pass"],RUGBY?["kick","⤴ Kick"]:["drib","〰 Dribble"]].map(([k,l])=>`<button data-tbmode="${k}" aria-pressed="${tbMode===k}">${l}</button>`).join("")}</div>
    ${btn("tbUndo","↶ Undo",!tbUndo.length)}${btn("tbClearArrows","Clear arrows",!b.arrows.length)}${btn("tbReset","Reset")}${btn("tbShare","📤 Share")}
  </div>
  <div class="tbfspitch">${tbSvg(b,true,tbRot)}${selBar?`<div class="tbfssel${tbFsSelTop(b)?" top":""}">${selBar}</div>`:""}</div></div>`}
// the swap panel sits at the other end of the screen from whatever was tapped, so it never hides it
function tbFsSelTop(b){const k=tbSel||"",i=+k.slice(1),o=k[0]==="u"?b.us[i]:k[0]==="t"?b.them[i]:k[0]==="a"&&b.arrows[i]?{x:(b.arrows[i].x1+b.arrows[i].x2)/2,y:(b.arrows[i].y1+b.arrows[i].y2)/2}:null;
  return !!o&&(tbRot?o.x>50:o.y>75)}
async function tbWake(){try{if(navigator.wakeLock&&!tbLock){tbLock=await navigator.wakeLock.request("screen");tbLock.addEventListener("release",()=>{tbLock=null})}}catch(e){}}
function tbFsOn(){tbFs=true;tbSel=null;document.body.classList.add("tbfs-on");const el=document.documentElement,req=el.requestFullscreen||el.webkitRequestFullscreen;
  if(req&&!(document.fullscreenElement||document.webkitFullscreenElement)){try{const r=req.call(el);tbFsNative=true;if(r&&r.catch)r.catch(()=>{tbFsNative=false})}catch(e){tbFsNative=false}}
  else if(!req&&!(navigator.standalone||matchMedia("(display-mode: standalone)").matches)){try{if(!localStorage.getItem(SK+".tbfsTip")){localStorage.setItem(SK+".tbfsTip","1");setTimeout(()=>toast("Tip: tap Share, then Add to Home Screen. Opened from there, the board hides Safari's bars too."),600)}}catch(e){}}
  tbWake();render();window.scrollTo(0,0)}
function tbFsOff(){tbFs=false;tbSel=null;document.body.classList.remove("tbfs-on");
  if(tbFsNative&&(document.fullscreenElement||document.webkitFullscreenElement)){try{(document.exitFullscreen||document.webkitExitFullscreen).call(document)}catch(e){}}tbFsNative=false;
  if(tbLock){tbLock.release().catch(()=>{});tbLock=null}if(view==="tactics")render()}
// leaving the browser's full screen (Esc, or swiping it away on an iPad) leaves the board's full screen too
["fullscreenchange","webkitfullscreenchange"].forEach(ev=>document.addEventListener(ev,()=>{if(tbFs&&tbFsNative&&!(document.fullscreenElement||document.webkitFullscreenElement)){tbFsNative=false;tbFsOff()}}));
document.addEventListener("keydown",e=>{if(tbFs&&e.key==="Escape"&&!tbFsNative)tbFsOff()});
document.addEventListener("visibilitychange",()=>{if(tbFs&&document.visibilityState==="visible")tbWake()});
// turning the iPad round turns the pitch with it
addEventListener("resize",()=>{if(!tbFs||view!=="tactics")return;clearTimeout(tbFsOn.t);tbFsOn.t=setTimeout(()=>{if(tbFs&&!tbDrag&&tbWide()!==tbRot)render()},150)});
// the picture: a heading in club colours above the board, for the team chat
async function tbShare(b){const c=document.createElement("canvas");c.width=1000;c.height=1640;const x=c.getContext("2d"),col=TEAM.colours||{};
  x.fillStyle=col.clubDeep||"#16239E";x.fillRect(0,0,1000,140);x.fillStyle=col.gold||"#FFD200";x.fillRect(0,134,1000,6);
  try{const cr=await new Promise((ok,bad)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=bad;im.src=CREST});const h=96,w=h*cr.width/cr.height;x.drawImage(cr,28,22,w,h)}catch(e){}
  x.fillStyle=col.clubInk||"#fff";x.font="800 44px Archivo, Arial, sans-serif";x.fillText(`${TEAM.name||""} ${TEAM.ageShort||""}`.trim()+(b.title?` ${b.title}`:""),150,72,820);
  x.font="600 28px Archivo, Arial, sans-serif";x.globalAlpha=.85;x.fillText(`Tactics · ${b.form}`,150,112,820);x.globalAlpha=1;
  const url=URL.createObjectURL(new Blob([tbSvg(b,false)],{type:"image/svg+xml"}));
  try{const im=await new Promise((ok,bad)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=bad;i.src=url});x.drawImage(im,0,140,1000,1500)}catch(e){toast("Couldn't make the picture on this phone.");return}finally{URL.revokeObjectURL(url)}
  const blob=await new Promise(r=>c.toBlob(r,"image/png")),name=`tactics-${(b.title||"board").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}.png`;
  try{const f=new File([blob],name,{type:"image/png"});if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],title:"Tactics"});return}}catch(e){if(e&&e.name==="AbortError")return}
  try{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);toast("Picture downloaded.")}catch(e){toast("Couldn't save the picture on this phone.")}}
// While a game is live, Home leads with the whole match (score, pitch, commentary) and refreshes in place
let homeLiveHtml="";
function homeLive(){const ms=liveNow().filter(m=>m.live.status!=="ft");
  homeLiveHtml=ms.length?`<div id="homeLive" class="stack">${ms.map(m=>`<div class="live homelive"><div class="hlk"><span class="lv">LIVE</span> ${esc(compName(m.comp||""))}${m.venue?` · 📍 ${esc(m.venue)}`:""}</div>${tlBody(m,true)}</div>`).join("")}</div>`:"";return homeLiveHtml}
function refreshHomeLive(){if(view!=="home"||!db)return;const el=document.getElementById("homeLive"),prev=homeLiveHtml,h=homeLive();
  if(!!el!==!!h){render();return}if(el&&h!==prev)el.outerHTML=h}
function tlBody(m,home){const L=m.live||{};
  const mins=L.status==="ft"&&L.mins&&Object.keys(L.mins).length?`<section class="card"><h3>Minutes played</h3><table class="lb"><tbody>${Object.entries(L.mins).sort((a,b)=>b[1]-a[1]).map(([n,v])=>`<tr><td>${esc(n)}</td><td>${Math.round(v)} min</td></tr>`).join("")}</tbody></table></section>`:"";
  return `${liveBoard(m,L)}${home?"":cheerCard(m)}
    ${L.slots?`<section class="card"><h3>On the pitch${L.form?` (${esc(L.form)})`:""}</h3>${pitchHtml(L,false)}${(b=>b.length?`<p class="hint">Subs: ${b.map(esc).join(", ")}</p>`:"")((L.squad||[]).filter(n=>!L.slots.includes(n)))}</section>`:""}
    <section class="card"><h3>Live commentary</h3>${timelineHtml(L,m)}</section>${mins}
    ${L.status==="live"||L.status==="ht"?`<p class="hint">This page updates by itself every few seconds. ${home?`<button class="mini" data-tl="${esc(m.id)}">Follow live</button> `:""}<button class="mini" data-view="alerts">🔔 Get ${SP.goal} alerts</button></p>`:""}`}
let tlMatch=null;
// ---------- match details (tap any game) ----------
let mdMatch=null,mdFrom="results",mdWrite=false,mdPrevWrite=false;
// match reports: written by coaches on the match page, public once saved
function reportHtml(t){return String(t||"").trim().split(/\n\s*\n/).map(p=>`<p>${esc(p.trim()).replace(/\n/g,"<br>")}</p>`).join("")}
function reportCard(m){const has=!!(m.report&&m.report.trim());
  if(canWrite&&mdWrite)return `<section class="card report"><h3>Match report</h3><textarea id="mdReport" rows="10" placeholder="How did the game go? Everyone can read this once it's saved.">${esc(m.report||"")}</textarea>
    <div class="btns"><button class="btn ghost" id="mdReportAi">✨ Suggest a report</button></div><p class="hint">The suggestion is written by AI from the result, the awards and the match timeline. Read it and change anything before you save. Use first names only. Leave a blank line between paragraphs.</p><div class="btns"><button class="btn gold" id="mdReportSave">Save report</button><button class="btn ghost" id="mdReportCancel">Cancel</button></div></section>`;
  if(has)return `<section class="card report"><h3>Match report</h3>${reportHtml(m.report)}<div class="btns"><button class="btn ghost" data-share="report">📤 Share report</button>${canWrite?`<button class="mini edit-only" id="mdReportEdit">Edit report</button>`:""}</div></section>`;
  return canWrite&&(result(m)||isLive(m))?`<section class="card report edit-only"><h3>Match report</h3><p class="hint">No report yet.</p><button class="btn gold" id="mdReportEdit">Write match report</button></section>`:""}
// match previews: written by coaches before the game, public once saved, with a few facts worked out from past games
function hasPreview(m){return !!(m&&m.preview&&m.preview.trim())}
function clip(t,n){t=String(t||"").trim().replace(/\s+/g," ");return t.length>n?t.slice(0,n).replace(/\s+\S*$/,"")+"…":t}
function previewFacts(m){if(m.hidden||noScores())return "";const rows=[];
  if(m.opp){const h=meetings(m.opp,m.date),t=teamStats(h);
    rows.push(h.length?["🆚",`Against ${esc(m.opp)}: played ${t.P}, won ${t.W}, drew ${t.D}, lost ${t.L}. Last time ${scChip(h[0])}`]:["🆕",`First time we've played ${esc(m.opp)}.`])}
  const before=sortMatches(matches.filter(x=>result(x)&&!x.practice&&x.stage!=="placeholder"&&(x.date||"")<m.date));
  const form=before.slice(-5);if(form.length)rows.push(["📈",`Last ${form.length} games: ${form.map(scChip).join(" ")}`]);
  const ps=playerStats(before.filter(x=>seasonOf(x.date)===seasonOf(m.date)));const top=Object.entries(ps).filter(([,o])=>o.goals>0).sort((a,b)=>b[1].goals-a[1].goals);
  if(top.length){const g=top[0][1].goals,lead=top.filter(([,o])=>o.goals===g).map(([n])=>esc(n));rows.push([SP.ball,`Top ${RUGBY?"try ":""}scorer this season: ${lead.join(", ")} (${g})`])}
  if(RUGBY){const pp=Object.entries(ps).filter(([,o])=>o.pts>0).sort((a,b)=>b[1].pts-a[1].pts);if(pp.length){const g=pp[0][1].pts;rows.push(["🎯",`Most points this season: ${pp.filter(([,o])=>o.pts===g).map(([n])=>esc(n)).join(", ")} (${g})`])}}
  return rows.length?`<div class="pvfacts">${rows.map(([i,v])=>`<div><span>${i}</span>${v}</div>`).join("")}</div>`:""}
// FA youth rule: written previews and reports leave out scores, results and scorers for under-7s to under-11s.
// Rugby has no such fixed rule here: it follows the club's own scores choice on the Team setup page.
function faHide(m){const n=+((String(TEAM.ageGroup||"").match(/\d+/)||[])[0]||0);return (RUGBY?TEAM.publicScores===false:n>=7&&n<=11)||m.hidden||noScores()}
// a plain report from the stats and timeline, used when the AI suggestion isn't available
function draftReport(m){const hide=faHide(m),r=result(m),ev=(m.live&&m.live.events||[]),pl=Object.keys(played(m)),ks=Object.keys(keepersOf(m));
  const where=m.ha==="A"?`away at ${m.opp}`:m.ha==="H"?`at home to ${m.opp}`:`against ${m.opp}`;
  const out=[`${SP.ball} Match report: ${TEAM.name} ${hide||!r?"v":`${m.us}-${m.them}`} ${m.opp}`];
  out.push(`${hide||!r?`What a game ${where}! 💪`:r==="W"?`A brilliant win ${where}! 🙌`:r==="D"?`A hard-fought draw ${where}. 💪`:`A tough game ${where}, but the ${PL} never stopped trying. 💪`}${pl.length?` Well done to everyone who played: ${pl.join(", ")}.`:""}`);
  if(!hide){const g=Object.entries(played(m)).filter(([,n])=>+n>0).map(([n,c])=>+c>1?`${n} (${c})`:n);if(g.length)out.push(`${SP.ball} ${SP.Goals} from ${g.join(", ")}.`);if(RUGBY&&kicksLine(m))out.push(`🎯 Kicks: ${kicksLine(m)}.`)}
  const subs=ev.filter(e=>e.k==="sub").length;if(subs)out.push(`🔁 Everyone played their part, with ${subs} substitution${subs>1?"s":""} to keep fresh legs on the pitch.`);
  if(ks.length)out.push(`🧤 ${ks.join(" and ")} took a turn in goal${!hide&&ks.some(n=>+keepersOf(m)[n])?" and kept a clean sheet":""}.`);
  if(m.potm)out.push(`${POTM_IC} ${POTM.charAt(0).toUpperCase()+POTM.slice(1)}: ${m.potm}. Well deserved! 👏`);
  out.push(`Thanks to all the parents for your support. 💛`);return out.join("\n\n")}
function shareText(m,kind){const t=kind==="report"?m.report:m.preview,link=`${SITE}/?match=${encodeURIComponent(m.id)}`;
  return `${String(t||"").trim()}\n\n${link}`}
// a plain draft from the stats, used when the AI suggestion isn't available
function draftPreview(m){const d=new Date(m.date+"T12:00:00").toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const where=m.ha==="A"?`away at ${m.opp}`:m.ha==="H"?`at home to ${m.opp}`:`against ${m.opp}`;
  const p1=`On ${d} we're ${where}${m.ko?`, kicking off at ${m.ko}`:""}${m.venue?` at ${m.venue}`:""}.`;
  let p2="";if(!faHide(m)){const h=meetings(m.opp,m.date),t=teamStats(h);
    p2=h.length?`We've played ${m.opp} ${h.length===1?"once":h.length+" times"} before (won ${t.W}, drew ${t.D}, lost ${t.L}), and last time it finished ${h[0].us}-${h[0].them}.`:`It's the first time we've played ${m.opp}, so it'll be a new challenge for the ${PL}.`}
  else p2=meetings(m.opp,m.date).length?`We've played ${m.opp} before, so the ${PL} will know what to expect.`:`It's the first time we've played ${m.opp}, so it'll be a new challenge for the ${PL}.`;
  return `${SP.ball} ${p1} ${p2}\n\n💪 The ${PL} have been working hard in training. Come along and cheer them on! 🙌`}
function previewCard(m){const has=hasPreview(m),before=isFixture(m)&&!isLive(m)&&!m.postponed;
  if(canWrite&&mdPrevWrite)return `<section class="card report"><h3>Match preview</h3><textarea id="mdPreview" rows="8" placeholder="What's coming up? Who are we playing, what are we working on, anything parents should know. Everyone can read this once it's saved.">${esc(m.preview||"")}</textarea>
    <div class="btns"><button class="btn ghost" id="mdPreviewAi">✨ Suggest a preview</button></div><p class="hint">The suggestion is written by AI from the stats. Read it and change anything before you save. Use first names only. Leave a blank line between paragraphs.</p>${pickAlertable(m)?`<label class="row" style="cursor:pointer"><span><input type="checkbox" id="mdPreviewAlert" checked style="width:20px;height:20px;vertical-align:-4px;margin-right:8px">📣 Send a preview alert to parents' phones</span></label><p class="hint">Sent once per game, the first time you save a preview. Later edits don't send another.</p>`:""}<div class="btns"><button class="btn gold" id="mdPreviewSave">Save preview</button><button class="btn ghost" id="mdPreviewCancel">Cancel</button></div></section>`;
  if(!before&&!has)return "";
  const facts=before?previewFacts(m):"";
  if(!has&&!facts&&!canWrite)return "";
  return `<section class="card report${has||facts?"":" edit-only"}"><h3>Match preview</h3>${has?reportHtml(m.preview):canWrite?`<p class="hint edit-only">No preview written yet.</p>`:""}${facts}${has?`<button class="btn ghost" data-share="preview" style="margin-top:10px">📤 Share preview</button> `:""}${canWrite?`<button class="${has?"mini":"btn gold"} edit-only" id="mdPreviewEdit" style="margin-top:10px">${has?"Edit preview":"Write match preview"}</button>`:""}</section>`}
function reportsView(){const list=sortMatches(matches.filter(m=>m.report&&m.report.trim()&&!m.practice)).reverse();
  const back=`<button class="btn ghost" data-view="results" style="align-self:flex-start">← Results</button>`;
  if(!list.length)return `<div class="stack">${back}<div class="card empty">No match reports yet.${canWrite?" Open a result and tap <b>Write match report</b>.":""}</div></div>`;
  let cur="",out="";list.forEach(m=>{const s=seasonOf(m.date);if(s!==cur){out+=`<div class="month">${s} season</div>`;cur=s}const r=result(m);const txt=m.report.trim().replace(/\s+/g," ");
    out+=`<div class="match rep" role="button" tabindex="0" data-edit="${esc(m.id)}"><div class="d">${(d=>isNaN(d)?"?":`<b>${d.getDate()}</b>${MONTHS[d.getMonth()]}`)(new Date(m.date+"T12:00:00"))}</div>
      <div style="min-width:0"><div class="o">${m.opp?badge(m.opp,"sm"):""}${m.ha==="A"?"at ":m.ha==="H"?"v ":""}${esc(m.opp||"")}</div><div class="meta">${esc(txt.length>220?txt.slice(0,220).replace(/\s\S*$/,"")+"…":txt)}</div></div>
      <div class="sc">${r?`${m.us}–${m.them}<span class="chip ${r}">${r}</span>`:""}</div></div>`});
  return `<div class="list">${back}<h2 style="margin:6px 0 0">Match reports</h2><p class="hint">Every report, newest first. Tap one to read it with the rest of the match.</p>${out}</div>`}
function longDate(iso){const d=new Date((iso||"")+"T12:00:00");return isNaN(d)?"Date to add":`${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]} ${d.getDate()} ${LONGM[d.getMonth()]} ${d.getFullYear()}`}
function openMatch(id){mdWrite=false;mdPrevWrite=false;mdFrom=view==="md"?mdFrom:view;mdMatch=id;setView("md");try{history.replaceState(null,"",location.pathname+"?match="+encodeURIComponent(id))}catch(e){}}
// a full team sheet exists when someone is down as playing without scoring, or halves/live data were kept
function teamSheet(m){return m.apps!==false&&(Object.values(played(m)).some(g=>!+g)||Object.keys(halvesOf(m)).length>0||!!(m.live&&m.live.squad&&m.live.squad.length))}
function mdView(){const m=matches.find(x=>x.id===mdMatch);
  const back=`<button class="btn ghost" data-mdback style="align-self:flex-start">← Back</button>`;
  if(!m)return `<div class="stack">${back}<div class="card empty">Match not found.</div></div>`;
  const r=result(m),L=m.live||{},ev=L.events||[],pl=played(m),as=assistsOf(m),hv=halvesOf(m),ks=keepersOf(m),mins=L.mins||{};
  const tn=tournaments.find(t=>t.id===m.tournament_id);const fx=isFixture(m)&&!isLive(m);
  const lab=isLive(m)?`<span class="lv">LIVE</span> ${L.status==="ht"?"Half time":minuteOf(L)}`:r?{W:"Won",D:"Drew",L:"Lost"}[r]:m.postponed?"Postponed":m.ko?`${esc(m.ko)} KO`:"Kick-off TBC";
  const ours=Object.entries(pl).filter(([,g])=>+g>0).map(([n,g])=>{const t=ev.filter(e=>e.k==="goal"&&e.n===n&&(!RUGBY||e.t==="try")).map(e=>e.m).filter(Boolean);return `${esc(n)}${t.length?" "+t.map(esc).join(", "):+g>1?` ×${g}`:""}`});
  const theirs=ev.filter(e=>e.k==="them"&&(!RUGBY||e.t==="try")).map(e=>esc(e.m)).filter(Boolean),kk=RUGBY&&!m.hidden?kicksLine(m):"";
  const board=`<div class="board"><div class="tm"><img src="${CREST}" alt="">${esc(TEAM.name)}</div><div class="sc">${(r||isLive(m))&&!m.hidden?`${m.us??0} – ${m.them??0}`:"v"}<small>${lab}</small></div><div class="tm">${badge(m.opp)}${esc(m.opp||"Opponent to add")}</div>${ours.length||theirs.length||kk?`<div class="scorers"><div>${ours.map(x=>`<span>${SP.ball} ${x}</span>`).join("")}${kk?`<span>🎯 ${esc(kk)}</span>`:""}</div><div>${theirs.length?`<span>${SP.ball} ${theirs.join(", ")}</span>`:""}</div></div>`:""}</div>`;
  const facts=[["📅",longDate(m.date)],["⏰",m.ko?`${m.ko} kick-off`:!result(m)&&!m.hidden&&!m.postponed?"Kick-off time TBC":""],["📣",fx&&MD(m).notice?MD(m).notice:""],["🕘",fx&&MD(m).meet?`Meet at ${MD(m).meet}`:""],["📍",[m.venue,MD(m).pitch?`Pitch ${MD(m).pitch}`:"",m.ha==="H"?"Home":m.ha==="A"?"Away":""].filter(Boolean).join(" · ")],["👕",fx&&MD(m).kit?`Wear the ${kitLabel(MD(m).kit).toLowerCase()}`:""],[(w=>w&&WXI[w.c]||"🌡️")(fx&&wxFor(m)),fx?(t=>t?t+" at kick-off":"")(wxText(m,true)):""],["🏆",tn?`${tn.name}${m.stage?` · ${m.stage}`:""}${(d=>d.length>1&&d.includes(m.date)?` · Day ${d.indexOf(m.date)+1} of ${d.length}`:"")(tDays(tn))}`:compName(m.comp||"")]].filter(([,v])=>v);
  const info=`<section class="card mdinfo">${facts.map(([i,v])=>`<div><span>${i}</span>${esc(v)}</div>`).join("")}${fx&&mapsUrl(m)?`<div><span>🧭</span><a href="${mapsUrl(m)}" target="_blank" rel="noopener">Directions</a></div>`:""}${m.postponed?`<div><span>⚠️</span><b>Postponed.</b> New date to be confirmed.</div>`:""}${tn&&tn.trophy?`<div><span>${trophyIcon(tn.trophy)}</span>${esc(tn.trophy)}</div>`:""}</section>`;
  // the team
  const sheet=teamSheet(m),ko=ev.find(e=>e.k==="ko"),starters=ko&&ko.line||null;let names=Object.keys(pl);
  if(m.potm&&!names.includes(m.potm))names.push(m.potm);Object.keys(as).concat(Object.keys(kicksOf(m))).forEach(n=>{if(!names.includes(n))names.push(n)});
  names.sort((a,b)=>(+numOf(a)||99)-(+numOf(b)||99)||a.localeCompare(b));
  const showG=!m.hidden,showA=showG&&(assistsTracked(seasonOf(m.date))||Object.keys(as).length),showH=Object.keys(hv).length>0,showM=Object.keys(mins).length>0;
  const team=!fx&&names.length?`<section class="card"><h3>${sheet?"The team":"What we know"}</h3><table class="lb mdteam"><thead><tr><th>Player</th>${showG?`<th>${SP.Goals}</th>`:""}${showG&&RUGBY?"<th>Kicks</th><th>Points</th>":""}${showA&&SP.assists?"<th>Assists</th>":""}${showH?"<th>Halves</th>":""}${showM?"<th>Minutes</th>":""}</tr></thead><tbody>
    ${names.map(n=>`<tr class="click" data-player="${esc(n)}"><td><span class="num">${esc(numOf(n))||"·"}</span>${esc(n)}${n in ks?` <span title="In goal">🧤</span>`:""}${m.potm===n?` <span class="potm" title="${esc(POTM)}">${POTM_IC}</span>`:""}${starters&&!starters.includes(n)?` <span class="hint">sub</span>`:""}</td>${showG?`<td>${+pl[n]?`<b>${pl[n]}</b>`:"–"}</td>`:""}${showG&&RUGBY?`<td>${esc(kickText(kicksOf(m)[n]||{}))||"–"}</td><td>${ptsIn(m,n)||"–"}</td>`:""}${showA&&SP.assists?`<td>${+as[n]||"–"}</td>`:""}${showH?`<td>${n in hv?hv[n]:"–"}</td>`:""}${showM?`<td>${n in mins?Math.round(mins[n]):"–"}</td>`:""}</tr>`).join("")}</tbody></table>
    ${sheet?"":`<p class="hint">Only the scorers${m.potm?" and player of the match":""} were written down for this game, so the full team isn't known.</p>`}</section>`:!fx&&r?`<section class="card"><h3>The team</h3><p class="hint">The team wasn't written down for this game.</p></section>`:"";
  const awards=!fx&&(m.potm||Object.keys(ks).length)?`<section class="card"><h3>Awards</h3>${m.potm?`<div class="potm">${POTM_IC} ${esc(POTM.charAt(0).toUpperCase()+POTM.slice(1))}: <b>${esc(m.potm)}</b></div>`:""}${Object.entries(ks).map(([n,c])=>`<div class="meta">🧤 ${esc(n)} in goal${+c?", clean sheet":""}</div>`).join("")}</section>`:"";
  // before kick-off, the line-up the coaches locked in; the picked squad before that
  const lu=ko||[...ev].reverse().find(e=>e.k==="lu");
  const lineup=lu&&lu.line?`<section class="card"><h3>${ko?"Starting line-up":"Line-up confirmed"}${lu.form?` (${esc(lu.form)})`:""}</h3>${pitchHtml({form:lu.form,slots:lu.line},false)}${(b=>b.length?`<p class="hint">Subs: ${b.map(esc).join(", ")}</p>`:"")((ko?(L.squad||[]):(lu.bench||[])).filter(n=>!lu.line.includes(n)))}</section>`
    :fx&&!m.postponed&&m.squad&&m.squad.length?`<section class="card"><h3>Squad</h3><p>${m.squad.map(esc).join(", ")}</p></section>`:"";
  const story=ev.length?`<section class="card"><h3>How the game went</h3>${timelineHtml(L,m,!isLive(m))}</section>`:!fx&&r?`<section class="card"><h3>How the game went</h3><p class="hint">There's no minute-by-minute story for this game. Games run with Live match mode will show one here.</p></section>`:"";
  const ms=milestones().filter(x=>x.id===m.id);
  const msHtml=ms.length?`<section class="card"><h3>Milestones in this game</h3>${ms.map(x=>`<div class="ms"><span>🎉 <b>${esc(x.n)}</b>: ${esc(x.label)}</span></div>`).join("")}</section>`:"";
  const h=m.opp?meetings(m.opp).filter(x=>x.id!==m.id):[];
  const h2h=m.opp?`<section class="card"><h3>Against ${esc(m.opp)}</h3>${h.length?`<div class="h2h">${h.slice(0,8).map(x=>`<button class="sc-btn" data-md="${esc(x.id)}">${scChip(x)}</button>`).join("")}</div>`:`<p class="hint">${fx?"First time we've played them.":"No other games against them yet."}</p>`}<button class="mini" data-opp="${esc(m.opp)}">All about ${esc(m.opp)}</button></section>`:"";
  const sm=sortMatches(matches.filter(x=>seasonOf(x.date)===seasonOf(m.date)&&!x.practice&&x.stage!=="placeholder"&&!x.postponed&&(result(x)||isLive(x))));const i=sm.findIndex(x=>x.id===m.id);
  const nav=i>=0&&(sm[i-1]||sm[i+1])?`<div class="btns mdnav">${sm[i-1]?`<button class="btn ghost" data-md="${esc(sm[i-1].id)}">← ${esc(sm[i-1].opp||"Previous")}</button>`:"<span></span>"}${sm[i+1]?`<button class="btn ghost" data-md="${esc(sm[i+1].id)}">${esc(sm[i+1].opp||"Next")} →</button>`:""}</div>`:"";
  const coach=canWrite?`<section class="card edit-only"><h3>Coaches</h3>${m.notes?`<p class="hint">Notes: ${esc(m.notes)}</p>`:""}<div class="mg"><button class="mini" data-medit="${esc(m.id)}">Edit match</button><button class="mini" data-gfx="squad" data-mid="${esc(m.id)}">Squad post</button><button class="mini" data-gfx="ft" data-mid="${esc(m.id)}"${r?"":" disabled"}>Result post</button><button class="mini" data-gfx="potm" data-mid="${esc(m.id)}"${m.potm?"":" disabled"}>PotM post</button>${fx&&!m.postponed?`<button class="mini" data-pick="${esc(m.id)}">Pick squad</button><button class="mini" data-live="${esc(m.id)}">▶ Live match</button><button class="mini" data-tbmatch="${esc(m.id)}">📋 Tactics</button><button class="mini" data-msg="${esc(m.id)}">Parents' message</button>`:""}</div>${fx&&!m.postponed?`<div class="avsum">${avSummary(m.id)}</div>`:""}</section>`:"";
  return `<div class="live md">${back}${board}${info}${cheerCard(m)}${fx?previewCard(m)+reportCard(m):reportCard(m)+previewCard(m)}${fx&&!m.postponed?`<div class="btns"><button class="btn ghost" data-ics="${esc(m.id)}">🗓️ Add to calendar</button><button class="btn ghost" data-view="calendar">Get every game</button></div><p class="hint">"Add to calendar" saves this game once and won't change if the kick-off time or venue does. "Get every game" keeps your calendar up to date.</p>`:""}${isLive(m)?`<button class="btn gold" data-tl="${esc(m.id)}">🔴 Follow live</button>`:""}${photosCard(m)}${team}${awards}${lineup}${story}${msHtml}${h2h}${nav}${coach}</div>`;
}
function liveNow(){const t=todayLocal();return matches.filter(m=>m.live&&(m.live.status==="live"||m.live.status==="ht"||(m.live.status==="ft"&&m.date===t)))}
function renderTicker(){const el=document.getElementById("ticker");if(!el)return;const L=liveNow();
  if(!L.length){el.hidden=true;el.innerHTML="";el.dataset.h="";return}
  const items=L.map(m=>{const g=(m.live.events||[]).filter(e=>e.k==="goal"&&(!RUGBY||e.t==="try")).map(e=>`${e.n} ${e.m}`).join(", ");const st=m.live.status==="live"?`🔴 LIVE ${minuteOf(m.live)}`:m.live.status==="ht"?"⏸ HALF TIME":"🏁 FULL TIME";
    return `<button class="tk" data-tl="${esc(m.id)}">${m.practice?"PRACTICE · ":""}${st} · ${esc(TEAM.name)} ${m.hidden?"v":`${m.us??0}–${m.them??0}`} ${esc(m.opp)}${g?` · ${SP.ball} ${esc(g)}`:""} · Tap to follow</button>`}).join("");
  const h=`<div class="tkin">${items}${items}</div>`;el.hidden=false;if(el.dataset.h!==h){el.dataset.h=h;el.innerHTML=h}}
window.goalFlash=goalFlash;function goalFlash(n,score,t){document.querySelectorAll(".gflash").forEach(x=>x.remove());const d=document.createElement("div");d.className="gflash";d.innerHTML=`<div class="gf-in"><b>${RUGBY?({pen:"PENALTY!",drop:"DROP GOAL!",pt:"PENALTY TRY!",con:"CONVERTED!"})[t]||"TRY!":"GOAL!"}</b>${n?`<span>${esc(n)}</span>`:""}${score?`<em>${esc(score)}</em>`:""}</div>`;d.onclick=()=>d.remove();document.body.appendChild(d);try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}setTimeout(()=>d.remove(),3600)}
async function pollLive(){if(!sb||!matches.length)return;const t=todayLocal();if(!matches.some(m=>m.date===t||(m.live&&(m.live.status==="live"||m.live.status==="ht"))))return;
  try{const {data}=await sb.from("matches").select("id,us,them,live,played,assists,keepers,date"+(RUGBY?",kicks":"")).eq("date",t);
    (data||[]).forEach(r=>{if(LV&&LV.id===r.id&&view==="live")return;const raw=RAW.find(x=>x.id===r.id);if(raw)Object.assign(raw,r);if(noScores())r=maskScore(r);const m=matches.find(x=>x.id===r.id);if(m){if(m.us!=null&&+r.us>+m.us&&r.live&&r.live.status!=="ft"){const g=((r.live.events||[]).filter(e=>e.k==="goal").pop()||{});goalFlash(g.n,`${TEAM.shortName||TEAM.name} ${r.us}-${r.them} ${m.opp}`,g.t)}Object.assign(m,r)}});}catch(e){}
  renderTicker();if(view==="tl")render();else refreshHomeLive()}
// ---------- supporter cheers: anyone with the link picks a ready-made cheer for the team (supabase/13_cheers.sql) ----------
// The words come from this list only (no typing), so nothing needs checking; the sender can add their own first name.
// Only ever add to the end: the database keeps each cheer's place in the list. TEAM.cheers=false turns the feature off.
const CHEER_TEXT=()=>["Good luck today! 🍀",`Come on ${TEAM.shortName||TEAM.name}! 📣`,"You've got this! 💪","Proud of you all 👏","Heads up, keep going! 🙌",`What a ${SP.goal}! 🎉`,"Great effort, team! 🌟","Enjoy every minute! 😊","Well played, all of you! ⭐"];
let CH_ON=false,CH_MUTED=false,CHS={},CH_SEEN={},CH_BUSY=false;
async function loadCheerSettings(){if(!sb||TEAM.cheers===false)return;try{const {data,error}=await sb.from("cheer_settings").select("muted").maybeSingle();if(error)return;CH_ON=true;CH_MUTED=!!(data&&data.muted)}catch(e){}}
// cheers open a week before a game and stay open until the end of match day
function cheerOpen(m){if(!CH_ON||!m||m.practice||m.postponed)return false;const t=todayLocal(),wk=new Date(Date.now()+7*864e5).toLocaleDateString("en-CA");return m.date>=t&&m.date<=wk}
function cheerName(){try{return localStorage.getItem(SK+".cheerName")||""}catch(e){return ""}}
const cheerLine=c=>`📣 ${c.name?`<b>${esc(c.name)}</b>: `:""}${esc(CHEER_TEXT()[c.cheer]||"Come on!")}`;
function cheerCard(m){if(!cheerOpen(m))return "";if(!(m.id in CHS)){CHS[m.id]=[];setTimeout(()=>loadCheers(m.id,false))}const list=CHS[m.id];
  if(CH_MUTED)return canWrite?`<section class="card cheers" id="cheers-${esc(m.id)}"><h3>📣 Cheers</h3><p class="hint">Cheers are off for the team, so supporters can't send any and none are shown.</p><div class="btns"><button class="mini" data-cheermute="0">Turn cheers back on</button></div></section>`:"";
  const live=isLive(m),wall=list.slice(-12).reverse();
  return `<section class="card cheers" id="cheers-${esc(m.id)}"><h3>📣 ${live?"Cheer the team on":"Send a good luck cheer"}</h3>
    <p class="hint">Tap a cheer and it pops up on everyone's screen${live?" straight away":" and on the live page at the game"}. Cheers are for the whole team.</p>
    <label class="f">Your first name (optional)<input type="text" id="cheerName" maxlength="20" autocomplete="given-name" value="${esc(cheerName())}" placeholder="e.g. Nana"></label>
    <div class="chips">${CHEER_TEXT().map((t,i)=>`<button data-cheer="${i}" data-mid="${esc(m.id)}"${CH_BUSY?" disabled":""}>${esc(t)}</button>`).join("")}</div>
    ${wall.length?`<p class="hint" style="margin-top:6px"><b>${list.length} cheer${list.length===1?"":"s"}</b> so far</p><ul class="cwall">${wall.map(c=>`<li>${cheerLine(c)}${canWrite?` <button class="mini" data-cheerhide="${c.id}" data-mid="${esc(m.id)}">Hide</button>`:""}</li>`).join("")}</ul>`:`<p class="hint" style="margin-top:6px">No cheers yet. Be the first!</p>`}
    ${canWrite?`<p class="hint">Coaches: hide any cheer you don't want shown, or <button class="mini" data-cheermute="1">turn cheers off</button> for the team.</p>`:""}</section>`}
function refreshCheerCard(id){const el=document.getElementById("cheers-"+id);if(!el)return;const m=matches.find(x=>x.id===id);const h=m?cheerCard(m):"";if(!h){el.remove();return}
  const nm=document.getElementById("cheerName"),v=nm&&nm.value,f=document.activeElement===nm;el.outerHTML=h;const n2=document.getElementById("cheerName");if(n2&&v!=null){n2.value=v;if(f)n2.focus()}}
// pop new cheers up one at a time; the first load of a game just catches up quietly
let CH_Q=[];
function cheerPop(c){CH_Q.push(c);if(CH_Q.length===1)cheerNext()}
function cheerNext(){const c=CH_Q[0];if(!c)return;document.querySelectorAll(".cheerpop").forEach(x=>x.remove());const d=document.createElement("div");d.className="cheerpop";d.innerHTML=cheerLine(c);d.onclick=()=>d.remove();document.body.appendChild(d);
  setTimeout(()=>{d.remove();CH_Q.shift();cheerNext()},CH_Q.length>3?2200:4000)}
async function loadCheers(id,pop){if(!sb||!CH_ON)return;try{const {data,error}=await sb.rpc("cheers_for",{p_match:id});if(error)return;const list=data||[],seen=CH_SEEN[id];
  if(pop&&seen!=null)list.filter(c=>c.id>seen).forEach(cheerPop);CH_SEEN[id]=list.length?Math.max(seen||0,...list.map(c=>c.id)):(seen||0);
  const old=JSON.stringify(CHS[id]||[]);CHS[id]=list;if(JSON.stringify(list)!==old)refreshCheerCard(id)}catch(e){}}
// which game's cheers this screen shows: the live page, a match page, or Home while a game is live (never the coach's live match screen)
function cheerTargets(){if(!CH_ON)return [];if(view==="tl")return [tlMatch];if(view==="md")return [mdMatch];if(view==="home")return liveNow().filter(m=>m.live.status!=="ft").map(m=>m.id);return []}
async function pollCheers(){if(document.hidden)return;for(const id of cheerTargets()){const m=matches.find(x=>x.id===id);if(cheerOpen(m))await loadCheers(id,isLive(m)||view==="tl")}}
setInterval(pollCheers,15000);
document.addEventListener("click",async e=>{const b=e.target.closest("[data-cheer],[data-cheerhide],[data-cheermute]");if(!b||!sb)return;const d=b.dataset;
  if(d.cheermute!=null){const mu=d.cheermute==="1";if(mu&&!confirm("Turn cheers off for the team? Supporters won't be able to send any, and the ones already sent are hidden."))return;
    const {error}=await sb.from("cheer_settings").update({muted:mu}).eq("id",1);if(error){toast("Couldn't change that. Try again.");return}CH_MUTED=mu;toast(mu?"Cheers are off.":"Cheers are back on.");render();return}
  if(d.cheerhide){const {error}=await sb.rpc("hide_cheer",{p_id:+d.cheerhide});if(error){toast("Couldn't hide that cheer. Try again.");return}CHS[d.mid]=(CHS[d.mid]||[]).filter(c=>c.id!==+d.cheerhide);refreshCheerCard(d.mid);toast("Cheer hidden.");return}
  const v=voterId();if(!v){toast("This phone can't send cheers (private browsing?).");return}
  const nm=document.getElementById("cheerName"),name=nm?nm.value.trim():"";try{name?localStorage.setItem(SK+".cheerName",name):localStorage.removeItem(SK+".cheerName")}catch(x){}
  CH_BUSY=true;refreshCheerCard(d.mid);
  const {error}=await sb.rpc("send_cheer",{p_match:d.mid,p_voter:v,p_cheer:+d.cheer,p_name:name||null});CH_BUSY=false;
  if(error){refreshCheerCard(d.mid);const t=error.message||"";toast(/slow down/i.test(t)?"That's 3 cheers in 10 minutes. Have a breather and try again soon.":/off for/i.test(t)?"Cheers are off for this team.":/week before/i.test(t)?"Cheers open a week before the game.":/lots of/i.test(t)?"So many cheers already! Try again in a minute.":"Couldn't send that cheer. Try again.");return}
  toast("Cheer sent! 📣");await loadCheers(d.mid,false)});
document.addEventListener("input",e=>{if(e.target.id==="cheerName")try{localStorage.setItem(SK+".cheerName",e.target.value.trim())}catch(x){}});
setInterval(pollLive,15000);setInterval(()=>{renderTicker();refreshHomeLive();if(view==="live"&&LV&&LV.plan&&!LV.plan.due&&!LV.ask&&LV.subSlot==null&&planDue()){render();return}if(view==="live"&&LV&&LV.status==="live"&&!LV.ask&&LV.subSlot==null){const b=document.querySelector(".live .board small");if(b)b.innerHTML=`<span class="lv">LIVE</span> ${minuteOf(LV)}`}},20000);
async function liveGoal(n){const m=matches.find(x=>x.id===LV.id);const pl=Object.assign({},m.played||{});pl[n]=(pl[n]||0)+1;m.played=pl;m.us=(+m.us||0)+1;addEv({k:"goal",n});LV.ask=n;liveSaveLocal();render();goalFlash(n,`${TEAM.shortName||TEAM.name} ${m.us}-${+m.them||0} ${m.opp}`);await livePush({played:pl,us:m.us})}
async function liveAssist(n){const m=matches.find(x=>x.id===LV.id);const ev=LV.events[LV.events.length-1];if(n){const a=Object.assign({},m.assists||{});a[n]=(a[n]||0)+1;m.assists=a;if(ev&&ev.k==="goal")ev.a=n}else if(ev&&ev.k==="goal")ev.na=1;LV.ask=null;liveSaveLocal();render();await livePush({assists:m.assists||{}})}
function liveFinishPlayed(m){const pl=Object.assign({},m.played||{});Object.keys(LV.mins).concat(Object.keys(LV.onSince)).forEach(n=>{if(!(n in pl))pl[n]=0});return pl}
function liveHalves(){const h={};[1,2].forEach(q=>(LV.touched[q]||[]).forEach(n=>h[n]=(h[n]||0)+1));return h}
function liveKeepers(m){const ks={};LV.events.filter(e=>e.k==="ko"||e.k==="gk").forEach(e=>{const n=e.k==="ko"?e.line[0]:e.n;if(n)ks[n]=0});if(LV.slots[0])ks[LV.slots[0]]=0;const cs=+m.them===0?1:0;Object.keys(ks).forEach(n=>ks[n]=cs);return ks}
function seasonTournaments(){return tournaments.filter(t=>seasonOf(t.date)===season)}
// ---------- league fixtures from FA Full-Time ----------
// The "fulltime" edge function reads the team's Fixtures page on fulltime.thefa.com; a coach can also paste the
// table straight from the page. Rows naming the team become a list to tick; games already on the site are matched
// by date and opponent, so a kick-off time or venue that changed can be updated instead of added twice.
let FT=null;// {url, name, rows, picks:Set, busy, msg}
const FT_KEY=SK+".fulltime";
function ftStart(){let saved={};try{saved=JSON.parse(localStorage.getItem(FT_KEY)||"{}")}catch(e){}FT={url:saved.url||TEAM.fullTimeUrl||"",name:saved.name||TEAM.fullTimeName||TEAM.name||"",rows:null,picks:new Set(),busy:false,msg:""};setView("ftimport")}
const ftDate=c=>{const m=/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(c||"");if(!m)return null;const y=m[3].length===2?"20"+m[3]:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`};
const ftTime=c=>{const m=/\b(\d{1,2})[:.](\d{2})\b/.exec(c||"");return m?`${m[1].padStart(2,"0")}:${m[2]}`:""};
const ftSame=(a,b)=>oppKey(a)===oppKey(b)||oppKey(a).includes(oppKey(b))||oppKey(b).includes(oppKey(a));
// one row of cells -> {date, ko, opp, ha, venue, comp} when our team is playing in it
function ftParse(cells,name){cells=cells.map(c=>String(c||"").trim());const dc=cells.findIndex(c=>ftDate(c));if(dc<0)return null;
  const date=ftDate(cells[dc]),ko=ftTime(cells[dc])||ftTime(cells[dc+1]||"");const me=oppKey(name);
  const rest=cells.map((c,i)=>({c,i})).filter(x=>x.i!==dc&&x.c&&!/^(v|vs|v\.|-)$/i.test(x.c)&&!ftDate(x.c)&&!/^\d{1,2}[:.]\d{2}$/.test(x.c)&&!/^(l|c|f|cup|league|friendly)$/i.test(x.c)&&!/^\d+\s*-\s*\d+$/.test(x.c));
  const us=rest.findIndex(x=>me&&oppKey(x.c).includes(me));if(us<0)return null;
  const other=us>0&&rest[us-1].i>dc?rest[us-1]:rest[us+1];if(!other)return null;
  const home=other.i>rest[us].i,after=rest.filter(x=>x.i>Math.max(other.i,rest[us].i));
  const compCell=cells.find(c=>/cup|trophy|shield|plate/i.test(c)),fr=cells.some(c=>/^f$|friendly/i.test(c));
  return {date,ko,opp:other.c.replace(/\s+/g," "),ha:home?"H":"A",venue:(after[0]&&!/cup|division|league|trophy/i.test(after[0].c)?after[0].c:""),comp:compCell?"Cup":fr?"Friendly":"League"}}
function ftRows(){if(!FT||!FT.rows)return [];const seen=new Set();return FT.rows.map(r=>ftParse(r,FT.name)).filter(Boolean).filter(f=>{const k=f.date+"|"+oppKey(f.opp);if(seen.has(k))return false;seen.add(k);return true})
  .map(f=>{const ex=matches.find(m=>m.date===f.date&&ftSame(m.opp,f.opp))||matches.find(m=>!result(m)&&ftSame(m.opp,f.opp)&&m.comp===f.comp&&Math.abs(new Date(m.date)-new Date(f.date))<15*864e5&&m.date!==f.date);
    const change=ex&&!result(ex)?[ex.date!==f.date?"date":"",f.ko&&ex.ko!==f.ko?"kick-off":"",f.venue&&ex.venue!==f.venue?"venue":""].filter(Boolean):[];
    return Object.assign(f,{key:f.date+"|"+oppKey(f.opp),ex,change,state:!ex?"new":change.length?"changed":"same"})}).filter(f=>f.date>=todayLocal()||f.state!=="same")}
function ftView(){if(!canWrite||!FT)return `<div class="card empty">Coaches only.</div>`;const list=ftRows();
  return `<section class="card stack"><h2>📥 Import league fixtures</h2>
    <p class="hint" style="margin:0">On FA Full-Time, open your team's <b>Fixtures</b> page and copy its address from the browser. Or select the fixtures table on that page, copy it, and paste it in the box below.</p>
    <label class="f">Full-Time fixtures page<input type="url" id="ft-url" value="${esc(FT.url)}" placeholder="https://fulltime.thefa.com/fixtures.html?..."></label>
    <label class="f">Your team's name on Full-Time<input type="text" id="ft-name" value="${esc(FT.name)}"></label>
    <div class="btns"><button class="btn gold" id="ftFetch"${FT.busy?" disabled":""}>${FT.busy?"Reading Full-Time…":"Get fixtures"}</button></div>
    <details><summary>Or paste the fixtures table</summary><textarea id="ft-paste" rows="6" style="width:100%" placeholder="Paste here"></textarea><div class="btns" style="margin-top:6px"><button class="btn ghost" id="ftPaste">Read what I pasted</button></div></details>
    ${FT.msg?`<div class="note">${esc(FT.msg)}</div>`:""}</section>
  ${FT.rows?`<section class="card stack"><h3>${list.length?`${list.length} fixture${list.length>1?"s":""} for ${esc(FT.name)}`:"Nothing found"}</h3>${list.length?`
    <div class="av">${list.map(f=>`<label class="row" style="cursor:pointer;align-items:flex-start"><span><input type="checkbox" data-ftpick="${esc(f.key)}"${f.state==="same"?" disabled":FT.picks.has(f.key)?" checked":""} style="width:20px;height:20px;vertical-align:-4px;margin-right:8px"><b>${esc(shortDay(f.date))}</b> ${f.ha==="A"?"at":"v"} ${esc(f.opp)}<br><span class="hint">${[f.ko?f.ko+" KO":"KO TBC",f.venue,f.comp!=="League"?f.comp:""].filter(Boolean).map(esc).join(" · ")}</span></span><span class="pill">${f.state==="new"?"New":f.state==="changed"?`Update ${f.change.join(", ")}`:"Already on the site"}</span></label>`).join("")}</div>
    <div class="btns"><button class="btn gold" id="ftImport">Add or update ticked fixtures</button><button class="mini" id="ftAll">Tick all new and changed</button></div>`:`<p class="hint">No rows with "${esc(FT.name)}" in them. Check your team's name matches Full-Time exactly.</p>`}</section>`:""}`}
async function ftFetch(){FT.url=$("#ft-url").value.trim();FT.name=$("#ft-name").value.trim();try{localStorage.setItem(FT_KEY,JSON.stringify({url:FT.url,name:FT.name}))}catch(e){}
  if(!/^https:\/\/fulltime\.thefa\.com\//.test(FT.url)){FT.msg="Paste the address of a Full-Time page (it starts https://fulltime.thefa.com/).";render();return}
  FT.busy=true;FT.msg="";render();
  try{const {data,error}=await sb.functions.invoke("fulltime",{body:{url:FT.url}});if(error||!data||data.error)throw new Error((data&&data.error)||"");FT.rows=data.rows||[];FT.picks=new Set(ftRows().filter(f=>f.state!=="same").map(f=>f.key))}
  catch(e){FT.msg=`Couldn't read Full-Time${e.message?`: ${e.message}`:""}. Try pasting the table instead.`}finally{FT.busy=false;render()}}
function ftPasted(){FT.name=$("#ft-name").value.trim();const t=$("#ft-paste").value;
  FT.rows=t.split(/\r?\n/).map(l=>l.includes("\t")?l.split("\t"):l.split(/\s{2,}|\s+(?=v\s)|(?<=\sv)\s+/i)).filter(r=>r.some(c=>ftDate(c)));FT.picks=new Set(ftRows().filter(f=>f.state!=="same").map(f=>f.key));FT.msg=FT.rows.length?"":"Couldn't find any dates in that. Copy the whole fixtures table.";render()}
async function ftImport(){const list=ftRows().filter(f=>FT.picks.has(f.key)&&f.state!=="same");if(!list.length){toast("Tick at least one fixture.");return}let n=0;
  for(const f of list){try{if(f.ex){const b={date:f.date};if(f.ko)b.ko=f.ko;if(f.venue)b.venue=f.venue;await db.collection("matches").doc(f.ex.id).update(b)}
    else{const b=Object.assign({},(({id,...x})=>x)(blankForm()),{date:f.date,ko:f.ko,opp:f.opp,ha:f.ha,venue:f.venue,comp:f.comp,us:null,them:null,potm:null,check:"",updated:new Date().toISOString()});delete b.saves;delete b.gk;b.postponed=false;await db.collection("matches").doc(`${f.date}-${slug(f.opp)}-${Math.random().toString(36).slice(2,6)}`).set(b)}n++}catch(e){}}
  toast(n===list.length?`Done: ${n} fixture${n>1?"s":""} added or updated.`:`${n} of ${list.length} saved. Try the rest again.`);FT=null;setView("fixtures")}
function fixturesView(){
  const items=listItems(byComp(seasonMatches().filter(isFixture)),tByComp(seasonTournaments().filter(tIsFixture))).sort((a,b)=>a.date.localeCompare(b.date));
  const calBtn=`<div class="btns" style="margin-bottom:8px"><button class="btn ghost" data-view="calendar">🗓️ Add all fixtures to my calendar</button><button class="btn ghost" data-view="training">🏃 Training</button></div>`;
  if(!items.length)return `${calBtn}${CKEY()}<div class="card empty">No ${compFilter?compFilter.toLowerCase()+" ":""}fixtures left for ${season}.${canWrite?` Use <b>+ Add a match</b> to add one${RUGBY?"":`, or <button class="mini" id="ftStart">📥 import league fixtures</button>`}.`:""}</div>`;
  const pp=items.filter(i=>i.pp),rest=items.filter(i=>!i.pp);
  const nx=nextFixture();
  return `<div class="list">${calBtn}${canWrite?`<div class="btns edit-only" style="margin-bottom:8px">${nx?`<button class="btn gold" data-msg="${esc(nx.id)}">Friday parents' message (next game)</button>`:""}<button class="btn ghost" data-gmonth="1">Fixtures this month graphic</button><button class="btn ghost" id="practice">▶ Practice live match</button>${RUGBY?"":`<button class="btn ghost" id="ftStart">📥 Import league fixtures</button>`}</div>`:""}${CKEY()}${pp.length?`<div class="month">Postponed, awaiting a new date</div>`+pp.map(i=>i.html).join(""):""}${monthList(rest)}</div>`;
}
function resultsView(){
  const items=listItems(byComp(seasonMatches().filter(m=>!isFixture(m))),tByComp(seasonTournaments().filter(t=>!tIsFixture(t)))).sort((a,b)=>b.date.localeCompare(a.date));
  if(!items.length)return `${CKEY()}<div class="card empty">No ${compFilter?compFilter.toLowerCase()+" ":""}results for ${season} yet.${canWrite?` Use <b>+ Add a match</b> to log the first one.`:""}</div>`;
  return `<div class="list">${matches.some(m=>m.report&&m.report.trim())?`<div class="btns" style="margin-bottom:8px"><button class="btn ghost" data-view="reports">📝 Match reports</button></div>`:""}${CKEY()}${monthList(items)}</div>`;
}


// ---------- sticker book ----------
const BOOK_PH={};// photos stay in this browser tab only; never uploaded
function bookView(){
  const list=seasonMatches(),done=list.filter(result),t=teamStats(done),ps=playerStats(list),ts=seasonTournaments();
  const roster=[...new Set([...Object.keys(ps).filter(n=>ps[n].apps||ps[n].goals||ps[n].potm),...(season===todaySeason()?players.filter(p=>p.current).map(p=>p.name):[])])]
    .sort((a,b)=>(+numOf(a)||99)-(+numOf(b)||99)||a.localeCompare(b));
  const st=n=>Object.assign({apps:0,goals:0,assists:0,potm:0,pts:0},ps[n]||{});
  const pot=n=>ts.filter(x=>x.potm===n).length;
  const scorers=roster.filter(n=>st(n).goals).sort((a,b)=>st(b).goals-st(a).goals).slice(0,8);
  const at=SP.assists&&assistsTracked(season),tracked=appsTracked(list);
  const troph=[...ts.filter(x=>x.trophy).map(x=>({title:x.name,ach:x.trophy,date:x.date,when:tRange(x)})),...honours.filter(h=>seasonOf(h.date)===season).map(h=>({title:h.title,ach:h.achievement,date:h.date}))];
  let pg=0;const page=(cls,body)=>{pg++;return `<section class="bp ${cls}"><div class="band t"></div><div class="inner">${body}</div><div class="band b"></div><div class="pno">${pg}</div></section>`};
  const nice=d=>d?(x=>`${x.getDate()} ${MONTHS[x.getMonth()]}`)(new Date(d+"T12:00:00")):"";
  // cover
  let out=`<section class="bp cover"><h2>${esc(TEAM.fullName||TEAM.name)}</h2><img class="crest" src="${CREST}" alt="">
    <h1>${esc(TEAM.ageGroup||"")}<br>Sticker Album</h1><h2>Season ${esc(season)}</h2><div class="burst">★ Collect them all! ★</div>
    <div class="spons">${[TEAM.sponsor,TEAM.potm&&TEAM.potm.logo?{logo:TEAM.potm.logo,name:TEAM.potm.sponsor}:null].filter(x=>x&&x.logo).map(x=>`<img src="${esc(x.logo)}" alt="${esc(x.name)}">`).join("")}</div></section>`;pg++;
  // season in numbers
  out+=page("",`<h1 class="ttl">The season in numbers</h1>
    <div class="rec">${[["P","Played"],["W","Won"],["D","Drawn"],["L","Lost"],["F","Scored"],["A","Conceded"],["GD",RUGBY?"Points diff":"Goal diff"]].map(([k,l])=>`<div><b>${k==="GD"&&t.GD>0?"+":""}${t[k]}</b><span>${l}</span></div>`).join("")}</div>
    <div class="two"><div><h3>Top ${RUGBY?"try ":""}scorers</h3><table>${scorers.map((n,i)=>`<tr><td>${i+1}. ${esc(n)}</td><td class="n">${st(n).goals}</td></tr>`).join("")||`<tr><td>No ${SP.goals} logged yet</td></tr>`}</table>${RUGBY?`<h3 style="margin-top:6mm">Points</h3><table>${roster.filter(n=>st(n).pts).sort((a,b)=>st(b).pts-st(a).pts).slice(0,6).map(n=>`<tr><td>🎯 ${esc(n)}</td><td class="n">${st(n).pts}</td></tr>`).join("")||`<tr><td>None yet</td></tr>`}</table>`:""}</div>
    <div><h3>${esc(POTM.charAt(0).toUpperCase()+POTM.slice(1))}</h3><table>${roster.filter(n=>st(n).potm).sort((a,b)=>st(b).potm-st(a).potm).map(n=>`<tr><td>☕ ${esc(n)}</td><td class="n">${st(n).potm}</td></tr>`).join("")||`<tr><td>None yet</td></tr>`}</table>
    ${at?`<h3 style="margin-top:6mm">Assists</h3><table>${roster.filter(n=>st(n).assists).sort((a,b)=>st(b).assists-st(a).assists).slice(0,6).map(n=>`<tr><td>🅰️ ${esc(n)}</td><td class="n">${st(n).assists}</td></tr>`).join("")||`<tr><td>None yet</td></tr>`}</table>`:""}</div></div>
    ${troph.length?`<div class="hl">🏆 ${troph.map(x=>`${esc(x.title)}: ${esc(x.ach)}`).join(" · ")}</div>`:""}`);
  // results (split across pages, 34 rows each)
  const rows=sortMatches(list.filter(m=>result(m)||m.comp==="Tournament"));
  for(let i=0;i<Math.max(rows.length,1);i+=34){const chunk=rows.slice(i,i+34);
    out+=page("",`<h1 class="ttl">Results${i?" (continued)":""}</h1><table class="res"><tr><th>Date</th><th>Opponent</th><th>Comp</th><th>Score</th><th></th><th>Scorers</th></tr>
    ${chunk.map(m=>{const r=result(m);const tn=m.tournament_id?tournaments.find(x=>x.id===m.tournament_id):null;return `<tr><td>${nice(m.date)}</td><td>${esc(m.opp||"")}${m.stage&&m.stage!=="placeholder"?` <span class="hint">(${esc(m.stage)})</span>`:""}</td><td>${esc(tn?tn.name:m.comp||"")}</td><td class="n">${r?`${m.us}–${m.them}`:""}</td><td>${r?`<span class="wdl ${r}">${r}</span>`:""}</td><td class="hint">${esc(Object.entries(played(m)).filter(([,g])=>g>0).map(([n,g])=>n+(g>1?` ×${g}`:"")).join(", "))}</td></tr>`}).join("")||`<tr><td colspan="6">No results yet.</td></tr>`}</table>`)}
  // honours
  if(troph.length)out+=page("",`<h1 class="ttl">Honours</h1>${troph.map(x=>`<div class="hl" style="font-size:16pt">${trophyIcon(x.ach)} ${esc(x.title)}: ${esc(x.ach)} <span class="hint">${x.when||nice(x.date)}</span></div>`).join("")}
    ${ts.filter(x=>x.potm).length?`<h3 style="margin-top:8mm">Players of the tournament</h3><table>${ts.filter(x=>x.potm).map(x=>`<tr><td>⭐ ${esc(x.potm)}</td><td>${esc(x.name)}</td></tr>`).join("")}</table>`:""}`);
  // player pages
  roster.forEach((n,i)=>{const o=st(n);const best=sortMatches(list.filter(m=>(played(m)[n]||0)>0)).sort((a,b)=>played(b)[n]-played(a)[n])[0];
    out+=page("player",`<div class="top"><div class="slot">${BOOK_PH[n]&&BOOK_LAYOUT==="print"?`<img src="${BOOK_PH[n]}" alt="">`:(BOOK_LAYOUT==="stickers"?`<div class="sn">${i+2}</div><div class="sl">Stick ${esc(n)} here</div>`:BOOK_LAYOUT==="print"?`<div class="sl">Add ${esc(n)}'s photo</div>`:`<div class="sn">${esc(numOf(n))||"·"}</div><div class="sl">${esc(n)}</div>`)}</div>
      <div><div class="big">${esc(numOf(n))||"·"}</div><h1 class="pname">${esc(n)}</h1>
      <div class="stats">${tracked?`<div><b>${o.apps}</b><span>Games</span></div>`:""}<div><b>${o.goals}</b><span>${SP.Goals}</span></div>${RUGBY?`<div><b>${o.pts}</b><span>Points</span></div>`:""}${at?`<div><b>${o.assists}</b><span>Assists</span></div>`:""}<div><b>${o.potm}</b><span>Player of the match</span></div>${pot(n)?`<div><b>${pot(n)}</b><span>Player of the tournament</span></div>`:""}</div>
      ${best?`<div class="hl">${SP.ball} Best game: ${played(best)[n]} ${played(best)[n]>1?SP.goals:SP.goal} v ${esc(best.opp)} (${nice(best.date)})</div>`:""}</div></div>
      <div class="lines"><h3>My favourite moment this season</h3><i></i><i></i><i></i></div>
      <div class="lines"><h3>My coach says…</h3><i></i><i></i><i></i></div>
      <div class="lines"><h3>Autographs</h3><i></i><i></i></div>`)});
  // sticker sheets
  if(BOOK_LAYOUT==="stickers"){const stk=[{shiny:1,img:CREST,cap:"Club badge",no:1},...roster.map((n,i)=>({n,no:i+2})),...[TEAM.sponsor,TEAM.potm&&TEAM.potm.logo?{logo:TEAM.potm.logo,name:TEAM.potm.sponsor}:null].filter(x=>x&&x.logo).map((x,i)=>({shiny:1,img:x.logo,cap:x.name,no:roster.length+2+i}))];
    for(let i=0;i<stk.length;i+=9)out+=page("",`<h1 class="ttl">Stickers${i?"":` <span class="hint" style="font-family:Archivo;font-size:10pt;text-transform:none">Print on sticker paper and cut out</span>`}</h1><div class="sheet">${stk.slice(i,i+9).map(x=>x.n?
      `<div class="stk"><span class="no">No. ${x.no}</span><div class="ph" style="${BOOK_PH[x.n]?`background-image:url('${BOOK_PH[x.n]}')`:""}">${BOOK_PH[x.n]?"":esc(numOf(x.n)||"")}</div><div class="cap"><span>${esc(x.n)}</span><span>${esc(numOf(x.n))}</span></div></div>`:
      `<div class="stk shiny"><span class="no">No. ${x.no}</span><div class="ph"><img src="${x.img}" alt=""></div><div class="cap"><span>${esc(x.cap)}</span><span>✦</span></div></div>`).join("")}</div>`)}
  return `<div class="bookctl card stack" style="margin-bottom:16px"><h2>Sticker book: ${esc(season)}</h2>
    <p class="hint">Built from this season's results. Change the season at the top right. Add a photo for each player, then press <b>Print or save as PDF</b> and choose "Save as PDF" or your printer. Photos stay on this device. They're never uploaded to the site and they're cleared when you close the page.</p>
    <div class="bookbar"><div class="seg" role="group" aria-label="Photos"><button data-blay="stickers" aria-pressed="${BOOK_LAYOUT==="stickers"}">Sticker sheets</button><button data-blay="print" aria-pressed="${BOOK_LAYOUT==="print"}">Photos printed in</button><button data-blay="none" aria-pressed="${BOOK_LAYOUT==="none"}">No photos</button></div>
    <button class="btn gold" id="bookPrint">Print or save as PDF</button></div>
    ${BOOK_LAYOUT==="none"?"":`<div class="bookph">${roster.map(n=>`<label>${BOOK_PH[n]?`<img src="${BOOK_PH[n]}" alt="">`:`<span class="ph0"></span>`}<span>${esc(n)}</span><input type="file" accept="image/*" data-bookph="${esc(n)}"></label>`).join("")}</div>`}</div>
    <div id="book">${out}</div>`;
}
let BOOK_LAYOUT="print";
document.addEventListener("change",async e=>{const n=e.target.dataset&&e.target.dataset.bookph;if(!n||!e.target.files[0])return;
  if(BOOK_PH[n])URL.revokeObjectURL(BOOK_PH[n]);BOOK_PH[n]=URL.createObjectURL(e.target.files[0]);render()});
document.addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;
  if(b.dataset.blay){BOOK_LAYOUT=b.dataset.blay;render()}
  if(b.id==="bookPrint")window.print();
  if(b.dataset.cf!=null&&b.closest(".ckey")){compFilter=b.dataset.cf||null;render()}
  if(b.dataset.pscope){pScope=b.dataset.pscope;render()}
  if(b.dataset.pick){pickMatch=b.dataset.pick;PICK=null;setView("pick")}
  if(b.id==="pickSave"){if(await pickSave())setView("fixtures")}
  if(b.id==="pickSavePost"){const pt=pickTourn(),m=await pickSave();if(m){setView("gfx");const g=await gfxReady();if(pt&&g.loadTSquad)await g.loadTSquad(pt);else await g.loadMatch(pt?{opp:pt.name,date:pt.date,venue:pt.venue,comp:"Tournament",squad:tSquad(pt)}:m,"squad")}}
  if(b.dataset.live){liveStart(b.dataset.live)}
  if(b.dataset.tbmatch!=null)tbOpen(b.dataset.tbmatch);
  if(b.id==="practice"){try{localStorage.removeItem(liveKey("practice"))}catch(e){}matches=matches.filter(m=>!m.practice);
    PRACTICE={id:"practice",practice:true,date:todayLocal(),opp:"Practice FC",ha:"H",comp:"Friendly",venue:"Practice",ko:"",us:0,them:0,played:{},assists:{},keepers:{},apps:false,squad:players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99)).map(p=>p.name)};
    matches.push(PRACTICE);liveStart("practice");toast("Practice match: nothing is saved and parents won't see it.")}
  if(b.dataset.gmonth){setView("gfx");(await gfxReady()).loadMonth(new Date().toISOString().slice(0,7))}
  if(b.dataset.msg){msgMatch=b.dataset.msg;msgChase=false;setView("msg")}
  if(b.dataset.chase){msgMatch=b.dataset.chase;msgChase=true;setView("msg")}
  if(b.id==="waMsg"){const t=$("#msgText").value;window.open("https://wa.me/?text="+encodeURIComponent(t),"_blank","noopener")}
  if(b.id==="copyMsg"){const ta=$("#msgText");try{navigator.clipboard.writeText(ta.value).then(()=>toast("Copied. Paste it into WhatsApp."),()=>{ta.select();toast("Selected, now copy it.")})}catch(e){ta.select()}}
  if(b.dataset.av){const n=b.dataset.n,v=b.dataset.av;(AV_MINE[availMatch]=AV_MINE[availMatch]||{})[n]=v;render();
    sb.rpc("set_availability",{p_match:availMatch,p_player:n,p_status:v}).then(({error})=>toast(error?(/family code/i.test(error.message)?"Sign in with your family code first.":"Couldn't save that. Try again."):`Thanks, ${n}: ${v==="yes"?"can make it":v==="no"?"can't make it":"maybe"}.`))}
  if(b.dataset.msgfx){const [n,label]=b.dataset.msgfx.split("|");setView("gfx");(await gfxReady()).loadMilestone(n,label)}
  if(b.id==="bkJson")dl(`${(TEAM.abbr||"team")+"_"+(TEAM.ageShort||"")}_backup_${new Date().toISOString().slice(0,10)}.json`,backupJson(),"application/json");
  if(b.id==="bkCsv")dl(`${(TEAM.abbr||"team")+"_"+(TEAM.ageShort||"")}_results_${new Date().toISOString().slice(0,10)}.csv`,backupCsv(),"text/csv");
  if(b.dataset.tl){tlMatch=b.dataset.tl;setView("tl")}
  if(b.id==="alOn")alOn();
  if(b.id==="alOff")alOff();
  if(b.id==="alTest")alTest();
  if(view==="live"&&LV){const m=matches.find(x=>x.id===LV.id);if(!m)return;const now=Date.now();
    if(b.dataset.lvform&&!(LV.status==="pre"&&LV.locked)){const f=b.dataset.lvform;if(f!==LV.form){LV.form=f;if(LV.status!=="pre")addEv({k:"form",form:f});liveSaveLocal();render();if(LV.status!=="pre")livePush()}}
    if(b.id==="lvUnlock"&&LV.status==="pre"){LV.locked=false;liveSaveLocal();render();if(!m.practice)db.collection("matches").doc(LV.id).update({live:livePublic()}).then(()=>{m.live=livePublic()},()=>{});return}
    if(b.id==="lvLock"&&LV.status==="pre"&&onPitch().length===SIDE){
      // "Line-up confirmed" goes out the first time; after an unlock, only a different line-up sends "Line-up change"
      const prev=[...LV.events].reverse().find(e=>e.k==="lu"),bn=bench();
      const same=prev&&prev.form===LV.form&&prev.line.join("|")===LV.slots.join("|")&&(prev.bench||[]).join("|")===bn.join("|");
      LV.locked=true;if(!same)addEv(Object.assign({k:"lu",form:LV.form,line:LV.slots.slice(),bench:bn},prev?{re:1}:{}));liveSaveLocal();render();
      if(m.practice){m.live=livePublic();toast("Line-up locked. In a real game parents with alerts on would get it now.");return}
      // only the line-up goes to the server here: the score stays blank until kick-off
      try{await db.collection("matches").doc(LV.id).update({live:livePublic()});m.live=livePublic();if(!same)alNotify(LV.id);toast(same?"Line-up locked. It hasn't changed, so no new alert.":"Line-up locked. Parents with alerts on will get it now.")}catch(x){if(!same)LV.events.pop();LV.locked=false;liveSaveLocal();render();toast("Couldn't send the line-up. Check your signal and try again.")}return}
    if(b.dataset.lvplan&&LV.status==="pre"){planOf(LV).mode=b.dataset.lvplan;liveSaveLocal();render();return}
    if(b.id==="lvPlanAdd"){const pl=planOf(LV),c={m:+$("#plM").value,on:$("#plOn").value,off:$("#plOff").value};if(!c.on||!c.off||c.on===c.off){toast("Pick who's coming on and who's coming off.");return}pl.ch=(pl.ch||[]).concat(c).sort((a,x)=>a.m-x.m);liveSaveLocal();render();return}
    if(b.dataset.lvplandel!=null){const pl=planOf(LV),k=+b.dataset.lvplandel;if(k>=0)pl.ch.splice(k,1);liveSaveLocal();render();return}
    if(b.id==="lvPlanEq"){const pl=planOf(LV);pl.mode="equal";const sim=planSim(LV);pl.ch=sim.chs.filter(c=>!c.sw).map(c=>({m:c.m,on:c.on,off:c.off}));pl.mode="manual";liveSaveLocal();render();return}
    if(b.id==="lvPlanSkip"){const pl=planOf(LV);if(pl.due){pl.at=pl.due.m;pl.due=null}liveSaveLocal();render();return}
    if(b.id==="lvPlanGo"){const pl=planOf(LV),d=pl.due;if(!d)return;
      d.chs.forEach(c=>{const j=LV.slots.indexOf(c.on);if(c.sw&&j>0){LV.slots[j]=LV.slots[0];LV.slots[0]=c.on;addEv({k:"gk",n:c.on});return}
        const i=LV.slots.indexOf(c.off);if(i<0||j>=0||!LV.squad.includes(c.on))return;LV.slots[i]=c.on;if(LV.status==="live"){clockOff(c.off,now);clockOn(c.on,now)}addEv({k:"sub",off:c.off,on:c.on});if(i===0)addEv({k:"gk",n:c.on})});
      pl.at=d.m;pl.due=null;liveSaveLocal();render();livePush();return}
    if(b.id==="lvKo"){LV.status="live";LV.half=1;LV.halfStart=now;onPitch().forEach(n=>clockOn(n,now));addEv({k:"ko",form:LV.form,line:LV.slots.slice()});liveSaveLocal();render();livePush()}
    if(b.dataset.lvgoal){if(RUGBY)rugbyScore("try",b.dataset.lvgoal);else liveGoal(b.dataset.lvgoal)}
    if(b.id==="lvNewAdd"){const i=$("#lvNewName");liveNewPlayer(i?i.value:"");return}
    if(b.id==="lvOther"){LV.askOther=!LV.askOther;LV.subSlot=null;LV.ask=null;LV.askKick=null;LV.askThem=false;render()}
    if(b.dataset.lvother!=null){const n=b.dataset.lvother;LV.askOther=false;if(!n){render()}else{if(!LV.squad.includes(n))LV.squad.push(n);if(RUGBY)rugbyScore("try",n);else liveGoal(n)}}
    if(b.dataset.lvcon!=null){if(b.dataset.lvcon)rugbyScore("con",b.dataset.lvcon);else{LV.ask=null;liveSaveLocal();render()}}
    if(b.dataset.lvkick){LV.askKick=b.dataset.lvkick;LV.ask=null;LV.askThem=false;render()}
    if(b.dataset.lvkicker!=null){if(b.dataset.lvkicker)rugbyScore(LV.askKick,b.dataset.lvkicker);else{LV.askKick=null;render()}}
    if(b.id==="lvPt")rugbyScore("pt");
    if(b.dataset.lvthem!=null){const t=b.dataset.lvthem;LV.askThem=false;if(t){m.them=(+m.them||0)+SP.pts[t];addEv({k:"them",t,p:SP.pts[t]});liveSaveLocal();render();livePush({them:m.them})}else render()}
    if(b.dataset.lvsin){const i=+b.dataset.lvsin,n=LV.slots[i];if(n){LV.sin=LV.sin||{};LV.sin[n]={until:now+SIN_MINS*60000,slot:i};LV.slots[i]="";if(LV.status==="live")clockOff(n,now);liveSaveLocal();render()}}
    if(b.dataset.lvsinback){const n=b.dataset.lvsinback,v=(LV.sin||{})[n];if(v){delete LV.sin[n];const i=LV.slots[v.slot]===""?v.slot:LV.slots.indexOf("");if(i>=0){LV.slots[i]=n;if(LV.status==="live")clockOn(n,now)}liveSaveLocal();render()}}
    if(b.dataset.lvasg!=null)liveAssist(b.dataset.lvasg);
    if(b.dataset.lvsub){LV.subSlot=+b.dataset.lvsub;render()}
    if(b.dataset.lvcancel){LV.subSlot=null;render()}
    if(b.dataset.lvon){const i=LV.subSlot,off=LV.slots[i],on=b.dataset.lvon;if(!LV.squad.includes(on))LV.squad.push(on);LV.slots[i]=on;LV.subSlot=null;if(LV.status==="live"){clockOff(off,now);clockOn(on,now)}addEv({k:"sub",off,on});if(i===0)addEv({k:"gk",n:on});liveSaveLocal();render();livePush()}
    if(b.dataset.lvswap){const i=LV.subSlot,j=LV.slots.indexOf(b.dataset.lvswap),a=LV.slots[i];LV.slots[i]=LV.slots[j];LV.slots[j]=a;LV.subSlot=null;if(i===0||j===0)addEv({k:"gk",n:LV.slots[0]});liveSaveLocal();render();livePush()}
    if(b.id==="lvThem"&&RUGBY){LV.askThem=true;LV.ask=null;LV.askKick=null;render()}
    else if(b.id==="lvThem"){m.them=(+m.them||0)+1;addEv({k:"them"});liveSaveLocal();render();livePush({them:m.them})}
    if(b.id==="lvUndo"){const i=[...LV.events].reverse().findIndex(e=>["goal","them","sub"].includes(e.k));if(i<0)return;const k=LV.events.length-1-i,e=LV.events[k];
      if(e.k==="goal"&&RUGBY){if(e.t==="try"){const pl=Object.assign({},m.played);pl[e.n]=Math.max(0,(pl[e.n]||0)-1);m.played=pl}
        if(KICK[e.t]&&e.n){const k=JSON.parse(JSON.stringify(m.kicks||{})),o=k[e.n]||{};o[e.t]=Math.max(0,(o[e.t]||0)-1);if(!o[e.t])delete o[e.t];if(Object.keys(o).length)k[e.n]=o;else delete k[e.n];m.kicks=k}
        m.us=Math.max(0,(+m.us||0)-(+e.p||0))}
      else if(e.k==="goal"){const pl=Object.assign({},m.played);pl[e.n]=Math.max(0,(pl[e.n]||0)-1);m.played=pl;m.us=Math.max(0,(+m.us||0)-1);if(e.a){const a=Object.assign({},m.assists);a[e.a]=Math.max(0,(a[e.a]||0)-1);if(!a[e.a])delete a[e.a];m.assists=a}}
      if(e.k==="them")m.them=Math.max(0,(+m.them||0)-(+e.p||1));
      if(e.k==="sub"){const s=LV.slots.indexOf(e.on);if(s>=0){LV.slots[s]=e.off;if(LV.status==="live"){clockOff(e.on,now);clockOn(e.off,now)}}}
      LV.events.splice(k,1);LV.ask=null;LV.askKick=null;LV.askThem=false;liveSaveLocal();render();livePush({played:m.played||{},us:m.us??0,them:m.them??0,assists:m.assists||{}})}
    if(b.id==="lvHt"){onPitch().forEach(n=>clockOff(n,now));LV.status="ht";addEv({k:"ht"});liveSaveLocal();render();livePush({halves:liveHalves()})}
    if(b.id==="lv2h"){LV.status="live";LV.half=2;LV.halfStart=now;onPitch().forEach(n=>clockOn(n,now));addEv({k:"2h"});liveSaveLocal();render();livePush()}
    if(b.id==="lvDone"&&m.practice){onPitch().forEach(n=>clockOff(n,now));addEv({k:"ft"});LV.status="ft";m.live=livePublic();try{localStorage.removeItem(liveKey("practice"))}catch(e){}LV=null;tlMatch="practice";setView("tl");toast("Practice finished. This is what parents would see. Nothing was saved.");
      setTimeout(()=>{},0);return}
    if(b.id==="lvDone"){onPitch().forEach(n=>clockOff(n,now));addEv({k:"ft"});LV.status="ft";const pl=liveFinishPlayed(m),kk=SP.keeper?liveKeepers(m):{};m.keepers=kk;
      await livePush({played:pl,halves:liveHalves(),us:+m.us||0,them:+m.them||0,keepers:kk});try{localStorage.removeItem(liveKey(LV.id))}catch(e){}
      const id=LV.id;LV=null;toast("Full time saved. Pick the player of the match on the match form.");const mm=matches.find(x=>x.id===id);if(mm&&canWrite){F=JSON.parse(JSON.stringify(mm));F.played=F.played||{};F.assists=F.assists||{};F.halves=F.halves||{};F.keepers=Object.assign({},keepersOf(F));F.us=F.us??"";F.them=F.them??"";F.potm=F.potm||"";setView("edit")}}
  }});
document.addEventListener("change",e=>{if(e.target.id==="attDay"){attDay=e.target.value;render()}
  if(e.target.dataset.ftpick&&FT){e.target.checked?FT.picks.add(e.target.dataset.ftpick):FT.picks.delete(e.target.dataset.ftpick)}});
document.addEventListener("change",e=>{const al={"al-rem":"reminders","al-goals":"goals","al-res":"results","al-live":"live"}[e.target.id];if(!al)return;AL.prefs[al]=e.target.checked;if(view==="alerts")render();
  try{localStorage.setItem(SK+".alerts",JSON.stringify(AL.prefs))}catch(x){}
  if(AL.sub)alSave(AL.sub).then(()=>toast("Saved."),()=>toast("Couldn't save that. Try again."))});
document.addEventListener("change",e=>{if(e.target.dataset.badge&&e.target.files[0]){saveBadge(e.target.dataset.badge,e.target.files[0]);return}if(e.target.dataset.tlogo&&e.target.files[0]){saveTLogo(e.target.dataset.tlogo,e.target.files[0]);return}if(e.target.dataset.photo&&e.target.files[0]){savePhoto(e.target.dataset.photo,e.target.files[0]);return}
  if(e.target.dataset.pk&&PICK){const n=e.target.dataset.pk;if(e.target.checked)PICK.set.add(n);else PICK.set.delete(n);const h=e.target.closest(".card").querySelector(".av + .hint");if(h)h.textContent=`${PICK.set.size} picked.`;return}
  if(!LV)return;
  if(e.target.dataset.slot!=null){const i=+e.target.dataset.slot,n=e.target.value;const j=LV.slots.indexOf(n);if(n&&j>=0&&j!==i)LV.slots[j]=LV.slots[i];LV.slots[i]=n;liveSaveLocal();render();return}
  if(e.target.id==="lvLen"){LV.halfLen=Math.max(5,+e.target.value||20);liveSaveLocal();if(planOf(LV).mode!=="off")render();return}
  if(e.target.id==="lvGk2"){planOf(LV).gk2=e.target.value;liveSaveLocal();render();return}
  if(e.target.id==="lvAdd"&&e.target.value){LV.squad.push(e.target.value);liveSaveLocal();render();return}
});

// ---------- honours ----------
function honoursView(){
  const items=[...tournaments.filter(t=>t.trophy).map(t=>({date:t.date||"",when:tRange(t,true),title:t.name,ach:t.trophy,sub:t.potm?`Player of the tournament: ${t.potm}`:"",notes:t.notes,t:t.id})),
    ...honours.map(h=>({date:h.date||"",title:h.title,ach:h.achievement,sub:"",notes:h.notes,h:h.id}))].sort((a,b)=>b.date.localeCompare(a.date));
  const bySeason={};items.forEach(i=>{(bySeason[seasonOf(i.date)||"Undated"]=bySeason[seasonOf(i.date)||"Undated"]||[]).push(i)});
  const awards=tournaments.filter(t=>t.potm).sort((a,b)=>(b.date||"").localeCompare(a.date||""));
  return `<div class="stack"><section class="card"><h2>Honours board</h2><p class="hint">Every trophy the ${esc(TEAM.ageGroup||"team")} have won. Tournament trophies appear here automatically; add league and cup trophies with the button below.</p>
    <div class="btns edit-only" style="margin-top:10px"><button class="btn gold" data-view="hnew">+ Add an honour</button></div></section>
  ${items.length?Object.entries(bySeason).map(([s,list])=>`<section class="card"><h3>${esc(s)}</h3><div class="list">${list.map(i=>`<div class="hon"><div class="ic">${trophyIcon(i.ach)}</div>
    <div style="min-width:0"><div class="t">${esc(i.title)}</div><div class="meta"><b>${esc(i.ach||"")}</b>${i.when?` · ${esc(i.when)}`:i.date?` · ${(d=>`${d.getDate()} ${LONGM[d.getMonth()]} ${d.getFullYear()}`)(new Date(i.date+"T12:00:00"))}`:""}</div>${i.sub?`<div class="potm">⭐ ${esc(i.sub)}</div>`:""}${i.notes?`<div class="meta">${esc(i.notes)}</div>`:""}</div>
    <div class="edit-only">${i.h?`<button class="mini" data-hedit="${esc(i.h)}">Edit</button>`:`<button class="mini" data-tedit="${esc(i.t)}">Edit</button>`}</div></div>`).join("")}</div></section>`).join(""):`<div class="card empty">No trophies yet. They'll appear here as soon as one is won. 🏆</div>`}
  ${awards.length?`<section class="card"><h3>Players of the tournament</h3><table class="lb"><tbody>${awards.map(t=>`<tr class="click" data-player="${esc(t.potm)}"><td>⭐ ${esc(t.potm)}</td><td>${esc(t.name)}</td><td>${esc(tRange(t,true))}</td></tr>`).join("")}</tbody></table></section>`:""}
  </div>`;
}
function tFormView(){
  if(!T)T={id:null,name:"",date:new Date().toISOString().slice(0,10),venue:"",potm:"",trophy:"",notes:""};
  const g=T.id?tGames(T):[];const names=[...new Set(g.flatMap(m=>Object.keys(played(m))))];const pool=names.length?names:players.filter(p=>p.current).map(p=>p.name);
  const other=T.trophy&&!TROPHIES.includes(T.trophy);
  return `<form id="tform" class="stack" novalidate><h2>${T.id?"Edit tournament":"Add a tournament"}</h2>
  <section class="card stack" style="gap:12px">
    <label class="f">Tournament name<input type="text" id="t-name" value="${esc(T.name)}" placeholder="e.g. Durham FC Sister Club Tournament"></label>
    <div class="grid2"><label class="f">First day<input type="date" id="t-date" value="${esc(T.date||"")}"></label><label class="f">Last day<input type="date" id="t-end" value="${esc(T.end_date&&T.end_date>(T.date||"")?T.end_date:"")}" min="${esc(T.date||"")}"></label></div>
    <p class="hint" style="margin-top:-6px">For a tournament over 2 or 3 days, set the last day. Leave it blank for a one-day tournament.</p>
    <label class="f">Venue<input type="text" id="t-venue" value="${esc(T.venue||"")}"></label>
    <label class="f">Teams entered<textarea id="t-teams" rows="6" placeholder="One team per line, us included">${esc(tTeams(T).map(x=>x.name).join("\n"))}</textarea></label>
    <p class="hint" style="margin-top:-6px">One team per line. Leave each group as <b>To be drawn</b> until the draw is made, and the site shows "Groups to be drawn".</p>
    <div id="t-groups">${tGroupPick(tTeams(T))}</div>
    <label class="f">Player of the tournament<select id="t-potm"><option value="">Not chosen yet</option>${pool.map(n=>`<option${n===T.potm?" selected":""}>${esc(n)}</option>`).join("")}</select></label>
    <label class="f">Trophy won<select id="t-trophy"><option value="">No trophy</option>${TROPHIES.map(x=>`<option${x===T.trophy?" selected":""}>${x}</option>`).join("")}<option value="__other"${other?" selected":""}>Something else…</option></select></label>
    <label class="f" id="t-other-wrap"${other?"":" hidden"}>What did we win?<input type="text" id="t-other" value="${other?esc(T.trophy):""}" placeholder="e.g. Fair play award"></label>
    <label class="f">Notes<textarea id="t-notes">${esc(T.notes||"")}</textarea></label>
    <p class="hint">Add each game from the tournament card with <b>+ Add a game</b>, and pick its stage (group stage, semi final, final…).</p>
  </section>
  <div class="btns"><button class="btn gold" type="submit" id="saveT">${T.id?"Save tournament":"Create tournament"}</button><button type="button" class="btn ghost" data-view="results">Cancel</button>
  ${T.id&&!g.length?`<button type="button" class="btn danger" id="delT" style="margin-left:auto">Delete tournament</button>`:""}</div></form>`;
}
function tGroupPick(ts){if(!ts.length)return "";
  return `<div class="tgpick">${ts.map(x=>`<label class="tgrow"><span>${esc(x.name)}</span><select data-tgroup="${esc(x.name)}"><option value="">To be drawn</option>${GROUPS.map(g=>`<option value="${g}"${x.group===g?" selected":""}>Group ${g}</option>`).join("")}</select></label>`).join("")}</div>`}
// the teams box as it stands on the form, keeping any groups already picked
function tReadTeams(){const box=$("#t-teams");if(!box)return tTeams(T);const was={};document.querySelectorAll("[data-tgroup]").forEach(el=>was[el.dataset.tgroup.toLowerCase()]=el.value);
  const old={};tTeams(T).forEach(x=>old[x.name.toLowerCase()]=x.group||"");const seen=new Set(),out=[];
  box.value.split(/\n/).map(x=>x.replace(/\s+/g," ").trim().slice(0,60)).filter(Boolean).forEach(n=>{const k=n.toLowerCase();if(seen.has(k))return;seen.add(k);out.push({name:n,group:(k in was?was[k]:old[k])||""})});
  return out.slice(0,64)}
document.addEventListener("input",e=>{if(e.target.id==="t-teams"){const el=$("#t-groups");if(el)el.innerHTML=tGroupPick(tReadTeams())}});
async function saveTournament(){
  const v=id=>$("#"+id)?.value??"";const tr=v("t-trophy")==="__other"?v("t-other").trim():v("t-trophy");
  const body={name:v("t-name").trim(),date:v("t-date")||null,venue:v("t-venue").trim(),potm:v("t-potm")||null,trophy:tr,notes:v("t-notes").trim(),updated:new Date().toISOString()};
  if(!body.name||!body.date){toast("Add the tournament name and date.");return}
  const end=v("t-end"),multi=!!end&&end>body.date;
  if(end&&end<body.date){toast("The last day can't be before the first day.");return}
  if(multi&&tDays({date:body.date,end_date:end}).length>7){toast("A tournament can run for up to a week.");return}
  // only send end_date when it's used, or when the database already has the column (rows loaded with it)
  if(multi||"end_date" in T)body.end_date=multi?end:null;
  // same for teams: older databases have no teams column until supabase/14_tournament_teams.sql is run
  const teams=tReadTeams();if(teams.length||"teams" in T)body.teams=teams;
  const id=T.id||`${body.date}-${slug(body.name)}`;
  const off=T.id?tGames(T).filter(m=>m.date&&(m.date<body.date||m.date>(multi?end:body.date))).length:0;
  try{await db.collection("tournaments").doc(id).set(body);toast(off?`Tournament saved. ${off} game${off>1?"s are":" is"} on a date outside the tournament days, so open ${off>1?"them":"it"} to change the date.`:"Tournament saved.");season=seasonOf(body.date)||season;T=null;setView(tIsFixture(Object.assign({id},body))?"fixtures":"results")}
  catch(e){toast(/teams/.test(e&&e.message||"")?"The site's database needs a quick update before it can save the teams. Ask Touchline Tales, or save without them for now.":"Couldn't save. Check your connection and try again.")}
}
function hFormView(){
  if(!H)H={id:null,title:"",achievement:"Winners",date:new Date().toISOString().slice(0,10),notes:""};
  return `<form id="hform" class="stack" novalidate><h2>${H.id?"Edit honour":"Add an honour"}</h2><section class="card stack" style="gap:12px">
    <label class="f">Trophy or competition<input type="text" id="h-title" value="${esc(H.title)}" placeholder="e.g. ${esc(LEAGUE_NAME)} Division 1"></label>
    <label class="f">Achievement<select id="h-ach">${["Winners","Runners-up","Champions","Promoted","Semi-finalists","Fair play award"].map(x=>`<option${x===H.achievement?" selected":""}>${x}</option>`).join("")}</select></label>
    <label class="f">Date<input type="date" id="h-date" value="${esc(H.date||"")}"></label>
    <label class="f">Notes<textarea id="h-notes">${esc(H.notes||"")}</textarea></label></section>
  <div class="btns"><button class="btn gold" type="submit">${H.id?"Save":"Add to the honours board"}</button><button type="button" class="btn ghost" data-view="honours">Cancel</button>
  ${H.id?`<button type="button" class="btn danger" id="delH" style="margin-left:auto">Delete</button>`:""}</div></form>`;
}
async function saveHonour(){
  const v=id=>$("#"+id)?.value??"";const body={title:v("h-title").trim(),achievement:v("h-ach"),date:v("h-date")||null,notes:v("h-notes").trim(),updated:new Date().toISOString()};
  if(!body.title){toast("Add the trophy name.");return}
  try{await db.collection("honours").doc(H.id||`${body.date||"undated"}-${slug(body.title)}`).set(body);toast("Added to the honours board.");H=null;setView("honours")}catch(e){toast("Couldn't save. Try again.")}
}

let pScope="season";
const COMPS=["League","Cup","Friendly","Tournament"];
function pottCount(n,ts){return ts.filter(t=>t.potm===n).length}
function playersView(){
  const career=pScope==="career";
  const base=career?sortMatches(matches.filter(m=>m.stage!=="placeholder")):seasonMatches();
  const list=byComp(base),ps=playerStats(list),tracked=appsTracked(list),at=SP.assists&&(career||assistsTracked(season));
  const ts=(!compFilter||compFilter==="Tournament")?(career?tournaments:seasonTournaments()):[];const showPott=ts.some(t=>t.potm);
  const names=[...new Set([...players.filter(p=>p.current).map(p=>p.name),...Object.keys(ps).filter(n=>{const o=ps[n];return o.apps||o.goals||o.assists||o.potm}),...ts.map(t=>t.potm).filter(Boolean)])];
  const rows=names.map(n=>({n,o:ps[n]||{apps:0,goals:0,assists:0,potm:0},pt:pottCount(n,ts)})).sort((a,b)=>(RUGBY?(b.o.pts||0)-(a.o.pts||0):0)||b.o.goals-a.o.goals||b.o.apps-a.o.apps||a.n.localeCompare(b.n));
  const what=(compFilter?compFilter.toLowerCase()+" ":"")+(career?"career stats, all seasons":`stats, ${season}`);
  const tot=rows.reduce((a,{o})=>({g:a.g+o.goals,a:a.a+o.assists,p:a.p+(o.pts||0)}),{g:0,a:0,p:0});const showCs=rows.some(r=>r.o.gk);
  if(noScores())return `<div class="btns" style="margin-bottom:8px"><div class="seg" role="group" aria-label="Season or career"><button data-pscope="season" aria-pressed="${!career}">${esc(season)}</button><button data-pscope="career" aria-pressed="${career}">Career (all seasons)</button></div></div>
  ${CKEY()}
  <section class="card"><h2>${what[0].toUpperCase()+what.slice(1)}</h2>
   <p class="hint" style="margin-bottom:10px">${(c=>`${c.length} game${c.length===1?"":"s"}`)(list.filter(counted))}. Scores and scorers aren't shown publicly for this age group.</p>
   <div class="scroll"><table class="lb"><thead><tr><th>Player</th>${tracked?"<th>Apps</th>":""}${showCs?"<th>Games in goal</th>":""}<th>PotM</th>${showPott?"<th>Player of tournament</th>":""}</tr></thead><tbody>
   ${rows.sort((a,b)=>b.o.apps-a.o.apps||a.n.localeCompare(b.n)).map(({n,o,pt})=>`<tr class="click" data-player="${esc(n)}"><td>${PHOTOS[n]?pface(n,"pthumb"):`<span class="num">${esc(numOf(n))||"·"}</span>`}${esc(n)}</td>${tracked?`<td>${o.apps}</td>`:""}${showCs?`<td>${o.gk||""}</td>`:""}<td>${o.potm}</td>${showPott?`<td>${pt||""}</td>`:""}</tr>`).join("")}
   </tbody></table></div><p class="hint" style="margin-top:10px">Tap a player to see ${PRN.p} record.</p></section>`;
  return `<div class="btns" style="margin-bottom:8px"><div class="seg" role="group" aria-label="Season or career"><button data-pscope="season" aria-pressed="${!career}">${esc(season)}</button><button data-pscope="career" aria-pressed="${career}">Career (all seasons)</button></div></div>
  ${CKEY()}
  <section class="card"><h2>${what[0].toUpperCase()+what.slice(1)}</h2>
   <p class="hint" style="margin-bottom:10px">${(c=>`${c.length} game${c.length===1?"":"s"}${career?" across "+new Set(c.map(m=>seasonOf(m.date))).size+" seasons":""}`)(list.filter(counted))} · ${tot.g} ${SP.goals}${RUGBY?` · ${tot.p} points`:""}${at?` · ${tot.a} assists`:""}.${tracked?((k=>k<list.filter(counted).length?` Full team sheets only exist for ${k} of these ${list.filter(counted).length} games (most of 2025-26 only recorded the scorers). In the others, the scorers and player of the match count as playing, so Apps are a minimum, and ${SP.goals} per game only uses the ${k} full team sheets.`:"")(list.filter(m=>counted(m)&&m.apps!==false).length)):` Appearances weren't recorded for these games, so only ${SP.goals} and awards show.`}${career&&at?" Assists are recorded from 2026-27.":""}</p>
   <div class="scroll"><table class="lb"><thead><tr><th>Player</th>${tracked?"<th>Apps</th>":""}<th>${SP.Goals}</th>${RUGBY?"<th>Kicks</th><th>Points</th>":""}${at?"<th>Assists</th>":""}${showCs?"<th>Clean sheets <span class='hint'>/ in goal</span></th>":""}<th>PotM</th>${showPott?"<th>Player of tournament</th>":""}${tracked?`<th>${SP.Goals} per game</th>`:""}</tr></thead><tbody>
   ${rows.map(({n,o,pt})=>`<tr class="click" data-player="${esc(n)}"><td>${PHOTOS[n]?pface(n,"pthumb"):`<span class="num">${esc(numOf(n))||"·"}</span>`}${esc(n)}</td>${tracked?`<td>${o.apps}</td>`:""}<td><b>${o.goals}</b></td>${RUGBY?`<td>${esc(kickText(o))||"–"}</td><td><b>${o.pts||0}</b></td>`:""}${at?`<td>${o.assists}</td>`:""}${showCs?`<td>${o.cs||(o.gk?0:"")}${o.gk?` <span class="hint">/${o.gk}</span>`:""}</td>`:""}<td>${o.potm}</td>${showPott?`<td>${pt||""}</td>`:""}${tracked?`<td>${o.ta?(o.tg/o.ta).toFixed(2):"–"}</td>`:""}</tr>`).join("")}
   </tbody></table></div><p class="hint" style="margin-top:10px">Tap a player to see ${PRN.p} record split by season and competition.</p></section>`;
}
function compSplit(n,list,ts){if(noScores())return compSplitNs(n,list,ts);
  const rows=COMPS.map(c=>{const l=list.filter(m=>m.comp===c);const o=playerStats(l)[n]||{apps:0,goals:0,assists:0,potm:0};return {c,o,tracked:appsTracked(l),partial:appsTracked(l)&&l.filter(counted).some(m=>m.apps===false),pt:c==="Tournament"?pottCount(n,ts):0}}).filter(r=>r.o.apps||r.o.goals||r.o.assists||r.o.potm||r.o.gk||r.pt||r.o.pts);
  if(!rows.length)return `<p class="hint">Nothing recorded yet.</p>`;
  return `<table class="lb"><thead><tr><th></th><th>Apps</th><th>${SP.Goals}</th>${RUGBY?"<th>Points</th>":"<th>Assists</th><th>Clean sheets</th>"}<th>PotM</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="ctag c-${r.c.toLowerCase()}">${compName(r.c)}</span></td><td>${r.tracked?r.o.apps+(r.partial?"*":""):"–"}</td><td><b>${r.o.goals}</b></td>${RUGBY?`<td>${r.o.pts||0}</td>`:`<td>${r.o.assists}</td><td>${r.o.gk?r.o.cs:"–"}</td>`}<td>${r.o.potm}${r.pt?` <span class="hint">+${r.pt} tournament</span>`:""}</td></tr>`).join("")}</tbody></table>${rows.some(r=>r.partial)?`<p class="hint">* Some of these games only recorded the scorers, so this counts the scorers and player of the match and may be missing other games she played.</p>`:""}`;
}

function compSplitNs(n,list,ts){const rows=COMPS.map(c=>{const l=list.filter(m=>m.comp===c);const o=playerStats(l)[n]||{apps:0,potm:0};return {c,o,pt:c==="Tournament"?pottCount(n,ts):0}}).filter(r=>r.o.apps||r.o.potm||r.pt);
  if(!rows.length)return `<p class="hint">Nothing recorded yet.</p>`;
  return `<table class="lb"><thead><tr><th></th><th>Apps</th><th>PotM</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="ctag c-${r.c.toLowerCase()}">${compName(r.c)}</span></td><td>${r.o.apps}</td><td>${r.o.potm}${r.pt?` + ${r.pt} tournament`:""}</td></tr>`).join("")}</tbody></table>`;
}
function oppsView(){if(noScores())return oppsNoScores();
  const today=new Date().toISOString().slice(0,10);const groups={};
  matches.forEach(m=>{if(!m.opp||(m.comp==="Tournament"&&!m.tournament_id))return;const k=oppKey(m.opp);(groups[k]=groups[k]||[]).push(m)});
  const rows=Object.values(groups).map(list=>{const done=sortMatches(list.filter(result));const t=teamStats(done);
    const next=sortMatches(list.filter(m=>!result(m)&&!m.postponed&&m.date>=today))[0];
    const pp=list.some(m=>m.postponed&&!result(m));const name=(next||sortMatches(list).slice(-1)[0]).opp;return {name,t,done,next,pp}})
    .sort((a,b)=>(a.next?a.next.date:"9")<(b.next?b.next.date:"9")?-1:(a.next?a.next.date:"9")>(b.next?b.next.date:"9")?1:b.t.P-a.t.P||a.name.localeCompare(b.name));
  return `<section class="card"><h2>Head to head</h2><p class="hint" style="margin-bottom:10px">Every team we've played or are due to play, with the next game first. Last 5 reads oldest to newest. Tap a team to see every result against them.</p>
   <div class="scroll"><table class="lb"><thead><tr><th>Opponent</th><th>P</th><th>W</th><th>D</th><th>L</th><th>F</th><th>A</th><th>Last 5</th><th>Next</th></tr></thead><tbody>
   ${rows.map(({name,t,done,next,pp})=>`<tr class="click" data-opp="${esc(name)}"><td>${badge(name,"sm")}${esc(name)}${canWrite&&!BADGES[oppKey(name)]?` <label class="bup" onclick="event.stopPropagation()">+ badge<input type="file" accept="image/*" data-badge="${esc(name)}"></label>`:""}</td><td>${t.P}</td><td>${t.W}</td><td>${t.D}</td><td>${t.L}</td><td>${t.F}</td><td>${t.A}</td>
     <td><div class="form" style="justify-content:flex-end">${done.slice(-5).map(m=>`<span class="chip ${result(m)}" title="${esc(m.date)} ${m.us}-${m.them}">${result(m)}</span>`).join("")||"–"}</div></td>
     <td>${next?(d=>`${d.getDate()} ${MONTHS[d.getMonth()]}`)(new Date(next.date+"T12:00:00")):pp?"Postponed":"–"}</td></tr>`).join("")}
   </tbody></table></div></section>`;
}
function oppsNoScores(){const today=new Date().toISOString().slice(0,10);const groups={};
  matches.forEach(m=>{if(!m.opp||(m.comp==="Tournament"&&!m.tournament_id))return;const k=oppKey(m.opp);(groups[k]=groups[k]||[]).push(m)});
  const rows=Object.values(groups).map(list=>{const p=list.filter(m=>counted(m)&&!isFixture(m)).length;const next=sortMatches(list.filter(m=>isFixture(m)&&!m.postponed&&m.date>=today))[0];return {name:(next||sortMatches(list).slice(-1)[0]).opp,p,next}})
    .sort((a,b)=>(a.next?a.next.date:"9").localeCompare(b.next?b.next.date:"9")||b.p-a.p||a.name.localeCompare(b.name));
  return `<section class="card"><h2>Teams we play</h2><p class="hint" style="margin-bottom:10px">Every team we've played or are due to play, with the next game first.</p>
   <div class="scroll"><table class="lb"><thead><tr><th>Opponent</th><th>Played</th><th>Next</th></tr></thead><tbody>
   ${rows.map(({name,p,next})=>`<tr class="click" data-opp="${esc(name)}"><td>${badge(name,"sm")}${esc(name)}</td><td>${p}</td><td>${next?(d=>`${d.getDate()} ${MONTHS[d.getMonth()]}`)(new Date(next.date+"T12:00:00")):"–"}</td></tr>`).join("")}
   </tbody></table></div></section>`;
}
function oppDetail(name){
  const k=oppKey(name);const list=sortMatches(matches.filter(m=>oppKey(m.opp)===k)).reverse();const t=teamStats(list.filter(result));
  return `<div class="stack"><button class="btn ghost" data-back style="align-self:flex-start">← All opponents</button>
  <section class="card"><div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">${badge(name,"lg")}<h2 style="margin:0">${esc(name)}</h2>${canWrite?`<label class="bup btn ghost" style="margin-left:auto">${BADGES[oppKey(name)]?"Change badge":"Upload badge"}<input type="file" accept="image/*" data-badge="${esc(name)}"></label>`:""}</div>
    ${noScores()?"":`<div class="record">${[["P","Played",""],["W","Won","w"],["D","Drawn","d"],["L","Lost","l"],["F","Scored",""],["A","Conceded",""],["GD",RUGBY?"Points diff":"Goal diff",""]].map(([k,l,c])=>`<div class="rec ${c}"><b>${k==="GD"&&t.GD>0?"+":""}${t[k]}</b><span>${l}</span></div>`).join("")}</div>`}</section>
  <section class="card"><h3>Every game against them</h3><div class="list">${list.map(matchRow).join("")}</div></section></div>`;
}

function playerDetail(n){
  const ss=seasons().slice().reverse();
  const rows=ss.map(s=>{const l=sortMatches(matches.filter(m=>seasonOf(m.date)===s));const o=playerStats(l)[n]||{apps:0,goals:0,assists:0,potm:0};return {s,o,tracked:appsTracked(l),partial:appsTracked(l)&&l.filter(counted).some(m=>m.apps===false)}}).filter(r=>r.o.goals||r.o.apps||r.o.potm||r.o.assists||r.o.gk);
  const games=sortMatches(matches.filter(m=>counted(m)&&n in played(m)||m.potm===n||n in assistsOf(m)||n in kicksOf(m))).reverse();
  const tot=playerStats(matches)[n]||{apps:0,goals:0,potm:0};
  return `<div class="stack"><button class="btn ghost" data-back style="align-self:flex-start">← All players</button>
  <section class="card"><div class="pcard">${PHOTOS[n]?`<div class="pphoto">${pface(n,"")}<span>${esc(numOf(n))||""}</span></div>`:`<div class="big">${esc(numOf(n))||"·"}</div>`}<div><h2 style="margin:0">${esc(n)}</h2><p class="hint">${noScores()?`${tot.apps||0} appearances · `:RUGBY?`${tot.goals} career tries · ${tot.pts||0} points · `:`${tot.goals} career goals · ${tot.assists||0} assists · `}${tot.potm} ${esc(TEAM.potm&&TEAM.potm.sponsor||"player of the match")} awards${(k=>k?` · ${k} player of the tournament`:"")(tournaments.filter(t=>t.potm===n).length)}</p>${canWrite?`<label class="bup btn ghost">${PHOTOS[n]?"Change photo":"Add photo"}<input type="file" accept="image/*" data-photo="${esc(n)}"></label> <span class="hint">Everyone can see player photos.</span>`:""}</div></div></section>
  <button class="btn gold" data-story="${esc(n)}" style="align-self:flex-start">✨ ${esc(n)}'s ${esc(season)} season story</button>
  ${(ms=>ms.length?`<section class="card"><h3>Milestones</h3>${ms.map(msRow).join("")}</section>`:"")(milestones().filter(x=>x.n===n))}
  <div class="grid2"><section class="card"><h3>${esc(season)} by competition</h3>${compSplit(n,seasonMatches(),seasonTournaments())}</section>
  <section class="card"><h3>Career by competition</h3>${compSplit(n,matches.filter(m=>m.stage!=="placeholder"),tournaments)}</section></div>
  ${noScores()?"":`<section class="card"><h3>By season</h3><table class="lb"><thead><tr><th>Season</th><th>Apps</th><th>${SP.Goals}</th>${RUGBY?"<th>Kicks</th><th>Points</th>":"<th>Assists</th><th>Clean sheets</th>"}<th>PotM</th></tr></thead><tbody>
  ${rows.map(r=>`<tr><td>${r.s}</td><td>${r.tracked?r.o.apps+(r.partial?"*":""):"–"}</td><td>${r.o.goals}</td>${RUGBY?`<td>${esc(kickText(r.o))||"–"}</td><td>${r.o.pts||0}</td>`:`<td>${assistsTracked(r.s)?r.o.assists:"–"}</td><td>${r.o.gk?r.o.cs:"–"}</td>`}<td>${r.o.potm}</td></tr>`).join("")}</tbody></table>${rows.some(r=>r.partial)?`<p class="hint">* Some of these games only recorded the scorers, so this counts the scorers and player of the match and may be missing other games she played.</p>`:""}</section>`}
  <section class="card"><h3>Matches</h3><div class="list">${games.map(matchRow).join("")||`<p class="hint">No matches logged yet.</p>`}</div></section></div>`;
}

// ---------- season story ("Wrapped"): a few swipeable slides for one player, from the stats already on the site ----------
let STORY=null;
function storySlides(n,s){const list=sortMatches(matches.filter(m=>!m.practice&&seasonOf(m.date)===s)),o=playerStats(list)[n]||{apps:0,goals:0,assists:0,potm:0,gk:0,cs:0};
  const mine=list.filter(m=>counted(m)&&n in played(m)),ms=milestones().filter(x=>x.n===n&&seasonOf(x.date)===s).reverse(),hide=noScores(),out=[];
  const potms=list.filter(m=>m.potm===n),tn=tournaments.filter(t=>seasonOf(t.date)===s&&tGames(t).some(m=>n in played(m)));
  out.push(`${PHOTOS[n]?`<img class="ph" src="${PHOTOS[n]}" alt="">`:`<img class="cr" src="${CREST}" alt="">`}<div class="k">${esc(TEAM.name||"")} ${esc(TEAM.ageShort||"")}</div><h2>${esc(n)}'s ${esc(s)} season</h2><p>Tap to go through it.</p>`);
  if(o.apps)out.push(`<div class="k">Games played</div><div class="n">${o.apps}</div><p>${tn.length?`Including ${tn.length} tournament${tn.length>1?"s":""}. `:""}${mine[0]?`First one: v ${esc(mine[0].opp)}, ${esc(shortDay(mine[0].date))}.`:""}</p>`);
  if(!hide&&(o.goals||o.assists||o.pts)){const best=mine.map(m=>[m,+played(m)[n]||0]).sort((a,b)=>b[1]-a[1])[0];
    out.push(`<div class="k">${SP.Goals}</div><div class="n">${o.goals}</div><p>${RUGBY&&o.pts?`${o.pts} points in all${kickText(o)?`, with ${kickText(o)}`:""}. `:""}${o.assists&&assistsTracked(s)?`Plus ${o.assists} assist${o.assists>1?"s":""}. `:""}${best&&best[1]>1?`Best game: ${best[1]} v ${esc(best[0].opp)}.`:best&&best[1]?`Scored v ${esc(best[0].opp)}.`:""}</p>`)}
  if(o.gk)out.push(`<div class="k">In goal</div><div class="n">🧤 ${o.gk}</div><p>${o.cs?`${o.cs} clean sheet${o.cs>1?"s":""}.`:"Brave in goal every time."}</p>`);
  if(potms.length)out.push(`<div class="k">${esc(POTM)}</div><div class="n">${POTM_IC} ${potms.length}</div><p>${potms.slice(0,3).map(m=>`v ${esc(m.opp)}`).join(", ")}${potms.length>3?" and more":""}.</p>`);
  if(ms.length)out.push(`<div class="k">Milestones</div><h2>🎉</h2><p>${ms.slice(0,4).map(x=>esc(x.label)).join("<br>")}</p>`);
  if(!hide){const w=mine.filter(m=>result(m)==="W"),big=w.slice().sort((a,b)=>(b.us-b.them)-(a.us-a.them))[0];
    if(mine.filter(result).length)out.push(`<div class="k">With ${esc(n)} on the pitch</div><div class="n">${w.length}</div><p>win${w.length===1?"":"s"}${big?`, the biggest ${big.us}–${big.them} v ${esc(big.opp)}`:""}.</p>`)}
  out.push(`<img class="cr" src="${CREST}" alt=""><h2>Thanks, ${esc(n)}!</h2><p>${o.apps?"What a season. See you next time out.":"The season's only just started."}</p>`);
  return out}
function storyShow(){const el=$("#story");if(!STORY){if(el)el.remove();return}
  const sl=STORY.slides,i=STORY.i;let d=el;if(!d){d=document.createElement("div");d.id="story";d.setAttribute("role","dialog");d.setAttribute("aria-label","Season story");document.body.appendChild(d)}
  d.innerHTML=`<div class="sbars">${sl.map((_,k)=>`<i class="${k<i?"done":k===i?"on":""}"><b></b></i>`).join("")}</div><button class="x" data-story="close" aria-label="Close">✕</button>
    <div class="sl">${sl[i]}</div><div class="nav"><button data-story="prev" aria-label="Back"></button><button data-story="next" aria-label="Next"></button></div>`;
  clearTimeout(STORY.t);STORY.t=setTimeout(()=>storyGo(1),5000)}
function storyGo(k){if(!STORY)return;const i=STORY.i+k;if(i>=STORY.slides.length){clearTimeout(STORY.t);STORY=null;storyShow();return}STORY.i=Math.max(0,i);storyShow()}
document.addEventListener("click",e=>{const b=e.target.closest("[data-story]");if(!b)return;const a=b.dataset.story;
  if(a==="close"){clearTimeout(STORY&&STORY.t);STORY=null;storyShow()}else if(a==="prev")storyGo(-1);else if(a==="next")storyGo(1);else{STORY={slides:storySlides(a,season),i:0};storyShow()}});
document.addEventListener("keydown",e=>{if(!STORY)return;if(e.key==="Escape"){clearTimeout(STORY.t);STORY=null;storyShow()}if(e.key==="ArrowRight")storyGo(1);if(e.key==="ArrowLeft")storyGo(-1)});
(()=>{let x0=null;document.addEventListener("touchstart",e=>{if(STORY)x0=e.touches[0].clientX},{passive:true});document.addEventListener("touchend",e=>{if(!STORY||x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)storyGo(dx<0?1:-1)},{passive:true})})();

function squadView(){
  const ps=players.slice().sort((a,b)=>(b.current-a.current)||((+a.num||99)-(+b.num||99))||a.name.localeCompare(b.name));
  return `<div class="stack"><section class="card"><h2>Squad</h2>
  <p class="hint" style="margin-bottom:12px">First names only. Players marked "Left" stay in the records but drop off the match form.</p>
  <div class="stack" style="gap:8px">${ps.map(p=>`<div class="sq" data-pid="${esc(p.id)}">
    <input type="text" id="sqn-${esc(p.id)}" value="${esc(p.name)}" aria-label="Name" data-f="name" ${canWrite?"":"disabled"}>
    <input type="number" id="sqk-${esc(p.id)}" value="${esc(p.num??"")}" aria-label="Shirt number" data-f="num" ${canWrite?"":"disabled"}>
    <div class="seg edit-only"><button data-cur="1" aria-pressed="${!!p.current}">In squad</button><button data-cur="0" aria-pressed="${!p.current}">Left</button></div>
  </div>`).join("")}</div>
  <div class="btns edit-only" style="margin-top:14px"><input type="text" id="newName" placeholder="New player's first name" style="max-width:240px"><input type="number" id="newNum" placeholder="No." style="max-width:90px"><button class="btn" id="addP">Add player</button></div>
  <p class="hint" style="margin-top:12px">Renaming here doesn't change old match records, so keep each name the same once ${PRN.sh} played.</p></section>${famCard()}</div>`;
}

// ---------- Team setup (supabase/7_team_setup.sql) ----------
// A coach fills this in instead of someone editing team.js. Saving writes team_settings, and the page reloads in the new look.
// Only shown when the database has a team_settings row (new teams); Newton Aycliffe has none and keeps using team.js.
const SETUP_KEY=SK+".setup";let SETUP_ROW=window.TEAM_SETUP||null;
const hasSetup=()=>!!(SETUP_ROW&&!SETUP_ROW.none),setupPending=()=>hasSetup()&&SETUP_ROW.ready===false;
let SU=null,SU_COACHES=null,SU_SIGN=null,SU_FIX=[],suBusy=false;
const SU_AGES=["Under 6s","Under 7s","Under 8s","Under 9s","Under 10s","Under 11s","Under 12s","Under 13s","Under 14s","Under 15s","Under 16s","Under 17s","Under 18s","Open age"];
// scores hidden by default: football follows the FA (Under 7s to Under 11s); rugby suggests hiding them for mini rugby (Under 7s to Under 12s)
const youngAge=(a,sp)=>{const n=+(/\d+/.exec(a||"")||[0])[0];return n>=7&&n<=((SPORTS[sp]||SP).rugby?12:11)};
const hexRgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||"");return m?[0,2,4].map(i=>parseInt(m[1].substr(i,2),16)):null};
const inkFor=h=>{const c=hexRgb(h)||[0,0,0];const L=c.map(v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*L[0]+.7152*L[1]+.0722*L[2]>.35?"#111111":"#FFFFFF"};
const darken=(h,k)=>{const c=hexRgb(h);return c?"#"+c.map(v=>Math.round(v*(1-k)).toString(16).padStart(2,"0")).join("").toUpperCase():h};
function suFromTeam(){const t=TEAM,c=t.colours||{},ks=Object.values(t.kits||{});
  return Object.assign({sport:SP.key,fullName:t.fullName||"",name:t.name||"",ageGroup:t.ageGroup||"Under 10s",players:t.players||"players",league:t.league||"",format:t.format||(SP.formats?SP.formats[0]:"7v7"),halfLength:t.halfLength||20,
    hashtags:t.hashtags||"",supportName:t.supportName||"",club:c.club||"#2235E8",second:c.gold||"#FFD200",
    homeBody:(ks[0]||{}).body||c.club||"#2235E8",homeTrim:(ks[0]||{}).trim||c.gold||"#FFD200",awayBody:(ks[1]||{}).body||"",awayTrim:(ks[1]||{}).trim||"",
    crest:t.crest||"crest.png",sponsorName:(t.sponsor&&t.sponsor.name)||"",sponsorLogo:(t.sponsor&&t.sponsor.logo)||"",potmName:(t.potm&&t.potm.sponsor)||"",potmLogo:(t.potm&&t.potm.logo)||"",squad:""},t._setup||{},{squad:""})}
// turn the form into the same shape as TEAM in team.js
function suTeam(f){const n=(/\d+/.exec(f.ageGroup)||[])[0],ageShort=n?`U${n}s`:f.ageGroup;
  const abbr=(f.fullName||f.name).split(/\s+/).filter(w=>/^[A-Za-z]/.test(w)).map(w=>w[0]).join("").toUpperCase().slice(0,6)||"TEAM";
  const kind={girls:"Girls",boys:"Boys",lads:"Boys"}[f.players]||"";const rest=f.fullName.replace(f.name,"").trim();
  const kit=(label,body,trim)=>({label,body,trim,ink:inkFor(body),band:trim,bandInk:inkFor(trim)});
  const kits={home:kit("Home",f.homeBody,f.homeTrim)};if(hexRgb(f.awayBody))kits.away=kit("Away",f.awayBody,hexRgb(f.awayTrim)?f.awayTrim:f.homeBody);
  const tags=f.hashtags.trim(),_setup=Object.assign({},f);delete _setup.squad;
  return {sport:f.sport||"football",name:f.name,shortName:f.name,fullName:f.fullName,abbr,ageGroup:f.ageGroup,ageShort,players:f.players,tagline:[rest,kind].filter(Boolean).join(" · "),
    appName:`${abbr} ${ageShort}`,supportName:f.supportName||"the site admin",league:f.league||"League",format:f.format,halfLength:+f.halfLength||20,
    colours:Object.assign({},TEAM.colours||{},{club:f.club,clubDeep:darken(f.club,.3),clubInk:inkFor(f.club),gold:f.second,goldInk:inkFor(f.second)}),crest:f.crest||"crest.png",
    sponsor:f.sponsorName?{name:f.sponsorName,logo:f.sponsorLogo||"",mark:f.sponsorName.split(/\s+/).map(w=>w[0]).join("").toLowerCase().slice(0,3)}:null,
    potm:{sponsor:f.potmName||"",logo:f.potmName?f.potmLogo||"":"",icon:"⭐",ribbon:`${abbr} ${ageShort}`.toUpperCase()},kitSponsor:null,kits,captain:"",
    hashtags:tags,shortHashtags:tags.split(/\s+/).slice(0,2).join(" "),publicScores:TEAM.publicScores===true,_setup}}
function shrinkLogo(file,S){return new Promise((ok,bad)=>{const r=new FileReader();r.onload=()=>{const im=new Image();im.onload=()=>{const k=Math.min(S/im.width,S/im.height,1),c=document.createElement("canvas");c.width=Math.round(im.width*k);c.height=Math.round(im.height*k);c.getContext("2d").drawImage(im,0,0,c.width,c.height);ok(c.toDataURL("image/png"))};im.onerror=bad;im.src=r.result};r.onerror=bad;r.readAsDataURL(file)})}
async function suLoad(){if(!sb||!canWrite)return;
  try{const {data}=await sb.rpc("list_coaches");SU_COACHES=data||[]}catch(e){SU_COACHES=[]}
  try{const {data}=await sb.from("team_signoff").select("*").eq("id",1).maybeSingle();SU_SIGN=data||null}catch(e){SU_SIGN=null}
  if(view==="setup")render()}
function suRemember(row){SETUP_ROW=row;try{localStorage.setItem(SETUP_KEY,JSON.stringify(row))}catch(e){}}
function settingUpView(){return `<section class="card empty"><h2>${esc(TEAM.name||"This team")}'s site is being set up</h2><p class="hint">It'll be ready soon. The club will share the link when it's live.</p></section>`}
function setupBanner(){return `<section class="card" style="border-left:6px solid var(--gold);margin-bottom:12px"><h2 style="margin-top:0">Finish setting up your team</h2><p class="hint">Only coaches can see the site until you've added your team's details and your ${WELFARE} has signed it off. It takes about 20 minutes.</p><div class="btns" style="margin-top:10px"><button class="btn gold" data-view="setup">Set up your team</button></div></section>`}
function setupView(){
  if(!canWrite)return `<section class="card empty">Sign in as a coach to set up the team.</section>`;
  if(!SU)SU=suFromTeam();if(SU_COACHES===null)suLoad();const f=SU,S=SU_SIGN||{};
  const inp=(k,label,type="text",extra="")=>`<label class="f">${label}<input type="${type}" id="su-${k}" value="${esc(f[k])}"${extra}></label>`;
  const col=(k,label)=>`<label class="f">${label}<input type="color" id="su-${k}" value="${esc(hexRgb(f[k])?f[k]:"#FFFFFF")}"></label>`;
  const sel=(k,label,opts)=>`<label class="f">${label}<select id="su-${k}">${opts.map(([v,t])=>`<option value="${esc(v)}"${String(f[k])===String(v)?" selected":""}>${esc(t)}</option>`).join("")}</select></label>`;
  const logo=(k,label,src)=>`<div class="f" style="display:flex;flex-direction:column;gap:6px;font-size:12px;font-weight:700;color:var(--muted)">${label}${src?`<img src="${esc(src)}" alt="" style="max-height:72px;max-width:160px;object-fit:contain;align-self:flex-start">`:""}<label class="bup btn ghost" style="align-self:flex-start">${src?"Change":"Upload"}<input type="file" accept="image/*" data-sulogo="${k}" hidden></label></div>`;
  const live=hasSetup()&&SETUP_ROW.ready===true,scores=S.id?S.public_scores:TEAM.publicScores===true&&!youngAge(f.ageGroup,f.sport);
  const fs=SPORTS[f.sport]||SPORTS.football,wo=fs.rugby?"safeguarding officer":"welfare officer",Wo=wo[0].toUpperCase()+wo.slice(1);
  const fx=matches.filter(m=>!m.practice&&m.us==null&&m.date>=new Date().toISOString().slice(0,10)).length;
  const sq=players.filter(p=>p.current).map(p=>p.name);
  const chk=(k,label,on)=>`<label style="display:flex;gap:10px;align-items:flex-start;margin:8px 0;cursor:pointer"><input type="checkbox" id="su-${k}"${on?" checked":""} style="width:20px;height:20px;flex:none;margin-top:1px"><span>${label}</span></label>`;
  const link=(u,t)=>u?`<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`:t;
  return `<div class="stack">
  <section class="card"><h2 style="margin-top:0">Team setup</h2><p class="hint">${live?"Your site is live. Change anything here and save; parents see it straight away.":"Fill this in from top to bottom. Save as you go: nobody but coaches can see the site until step 6 is done."}</p></section>
  <section class="card stack" style="gap:10px"><h3 style="margin:0">1. Your team</h3>
    <div class="grid2">${sel("sport","Sport",[["football","Football"],["rugby-union","Rugby union"],["rugby-league","Rugby league"]])}</div>
    <div class="grid2">${inp("fullName","Club's full name")}${inp("name","Team name, as it appears in scores")}</div>
    <div class="grid2">${sel("ageGroup","Age group",SU_AGES.map(a=>[a,a]))}${sel("players","Players",[["girls","Girls"],["boys","Boys"],["players","Mixed"]])}</div>
    <div class="grid2">${inp("league","League")}${sel("format","Format",(fs.formats||["5v5","7v7","9v9","11v11"]).map(x=>[x,x]))}${inp("halfLength","Half length (minutes)","number",' min="5" max="50"')}</div>
    <div class="grid2">${inp("hashtags","Hashtags for posts (optional)")}${inp("supportName","Who coaches message for help")}</div></section>
  <section class="card stack" style="gap:10px"><h3 style="margin:0">2. Your look</h3>
    <div class="grid2">${logo("crest","Club crest",f.crest)}${col("club","Main club colour")}${col("second","Second colour")}</div>
    <div class="grid2">${col("homeBody","Home shirt")}${col("homeTrim","Home trim")}${col("awayBody","Away shirt")}${col("awayTrim","Away trim")}</div>
    <div class="grid2">${inp("sponsorName","Main sponsor (optional)")}${logo("sponsorLogo","Main sponsor logo",f.sponsorLogo)}</div>
    <div class="grid2">${inp("potmName","Player of the match sponsor (optional)")}${logo("potmLogo","Their logo",f.potmLogo)}</div>
    <div class="btns"><button class="btn gold" id="suSave"${suBusy?" disabled":""}>Save team details</button></div></section>
  <section class="card stack" style="gap:10px"><h3 style="margin:0">3. Your squad</h3>
    <p class="hint">${sq.length?`In the squad: ${sq.map(esc).join(", ")}.`:"Nobody added yet."} First names only: no surnames, ages, birthdays or schools. Two players with the same name? Use a nickname they're happy with.</p>
    <label class="f">Add players, one per line (add a shirt number after the name if you use them, e.g. "Ava 7")<textarea id="su-squad" rows="6" style="font:inherit">${esc(f.squad||"")}</textarea></label>
    <div class="btns"><button class="btn" id="suSquad">Add these players</button><button class="btn ghost" data-view="squad">Edit the squad</button></div></section>
  <section class="card stack" style="gap:10px"><h3 style="margin:0">4. Your fixtures</h3>
    <p class="hint">${fx?`${fx} upcoming fixture${fx>1?"s":""} on the site.`:"No fixtures yet."} Add as many as you have; you can add more any time from <b>Add a match</b>.</p>
    ${SU_FIX.map((r,i)=>`<div class="grid2" data-sufix="${i}"><label class="f">Date<input type="date" data-fx="date" value="${esc(r.date)}"></label><label class="f">Opponent<input type="text" data-fx="opp" value="${esc(r.opp)}"></label><label class="f">Home or away<select data-fx="ha">${[["H","Home"],["A","Away"],["N","Neutral"]].map(([v,t])=>`<option value="${v}"${r.ha===v?" selected":""}>${t}</option>`).join("")}</select></label><label class="f">Kick-off<input type="time" data-fx="ko" value="${esc(r.ko)}"></label><label class="f">Competition<select data-fx="comp">${["League","Cup","Friendly"].map(c=>`<option${r.comp===c?" selected":""}>${c}</option>`).join("")}</select></label></div>`).join("")}
    <div class="btns"><button class="btn ghost" id="suFixAdd">+ Add a fixture row</button>${SU_FIX.length?`<button class="btn" id="suFixSave">Save these fixtures</button>`:""}</div></section>
  <section class="card stack" style="gap:10px"><h3 style="margin:0">5. Your coaches</h3>
    <p class="hint">Only these people can sign in and change the site. They sign in with a link sent to their email.</p>
    ${SU_COACHES===null?`<p class="hint">Loading…</p>`:`<div class="stack" style="gap:6px">${SU_COACHES.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>${esc(e)}</span>${me&&e===String(me.email||"").toLowerCase()?`<span class="hint">You</span>`:`<button class="mini" data-sucoachdel="${esc(e)}">Remove</button>`}</div>`).join("")}</div>`}
    <div class="btns"><input type="text" id="su-coach" inputmode="email" placeholder="New coach's email" style="max-width:280px"><button class="btn" id="suCoachAdd">Add coach</button></div></section>
  <section class="card stack" style="gap:10px;border-left:6px solid var(--gold)"><h3 style="margin:0">6. ${fs.rugby?"Safeguarding":"Welfare"} sign-off${live?"":" and go live"}</h3>
    <p class="hint">Please go through this with your club ${wo}. How we keep the children safe: first names only; the site is kept out of Google and parents get the link from the club; only the coaches above can change anything; your data sits in its own database in London, kept only for your club; sticker book photos stay on the coach's phone.</p>
    <div class="grid2"><label class="f">${Wo}'s name<input type="text" id="su-wname" value="${esc(S.welfare_name||"")}"></label><label class="f">${Wo}'s email<input type="text" id="su-wemail" inputmode="email" value="${esc(S.welfare_email||"")}"></label></div>
    <div><b>Should visitors see scores?</b><p class="hint">${fs.rugby?"Mini rugby is played without leagues, so we suggest hiding scores for Under 7s to Under 12s. Hidden means visitors don't see scores, scorers, try alerts or scores in their calendar.":"The FA's youth rules for Under 7s to Under 11s say scores shouldn't be published. Hidden means visitors don't see scores, scorers, goal alerts or scores in their calendar."} Coaches still see everything.</p>
      <div class="seg" style="margin-top:8px"><button data-suscores="1" aria-pressed="${!!scores}">Show scores</button><button data-suscores="0" aria-pressed="${!scores}">Hide scores</button></div></div>
    ${chk("wok",`Our ${wo} has read how the site handles children's details and is happy for it to go live with the scores choice above.`,S.welfare_agreed)}${fs.rugby?`<p class="hint">England Rugby's photography guidance asks for written consent from parents before a child is named alongside a photo. Only upload player photos for children whose parents have agreed.</p>`:""}
    ${chk("terms",`The club accepts the ${link(TEAM.termsUrl,"terms")}.`,S.terms_agreed)}
    ${chk("dpa",`The club accepts the ${link(TEAM.dpaUrl||"https://touchlinetales.club/dpa/","data processing agreement")}. The club is the data controller.`,S.dpa_agreed)}
    <label class="f">Name and role of the person agreeing for the club (secretary or chair)<input type="text" id="su-by" value="${esc(S.agreed_by||"")}"></label>
    <div class="btns"><button class="btn gold" id="suLive"${suBusy?" disabled":""}>${live?"Save sign-off":"Go live"}</button></div></section></div>`}
let suScores=null;
function suRead(){if(!SU)return;document.querySelectorAll("[id^=su-]").forEach(el=>{const k=el.id.slice(3);if(k in SU)SU[k]=el.value});
  document.querySelectorAll("[data-sufix]").forEach(row=>{const r=SU_FIX[+row.dataset.sufix];row.querySelectorAll("[data-fx]").forEach(el=>r[el.dataset.fx]=el.value)})}
async function suSaveSettings(extra){const f=SU;const settings=Object.assign(suTeam(f),extra||{});
  const row={id:1,settings,ready:hasSetup()?SETUP_ROW.ready:false,updated:new Date().toISOString(),updated_by:(me&&me.email)||""};Object.assign(row,extra&&extra._row||{});delete settings._row;
  const {data,error}=await sb.from("team_settings").upsert(row).select("settings,ready,updated").single();if(error)throw error;suRemember(data);return data}
document.addEventListener("input",e=>{if(view==="setup"&&e.target.closest&&e.target.closest("#main"))suRead()});
document.addEventListener("change",async e=>{const k=e.target.dataset&&e.target.dataset.sulogo;if(view==="setup")suRead();
  if(view==="setup"&&e.target.id==="su-sport"){const fs=SPORTS[SU.sport]||SPORTS.football;SU.format=(fs.formats||["7v7"])[0];suScores=null;render();return}
  if(!k||!e.target.files[0])return;
  try{SU[k]=await shrinkLogo(e.target.files[0],k==="crest"?512:400);render()}catch(er){toast("Couldn't read that picture. Try a PNG or JPG.")}});
document.addEventListener("click",async e=>{const b=e.target.closest("button");if(!b||view!=="setup"||!canWrite)return;suRead();
  if(b.dataset.suscores!=null){suScores=b.dataset.suscores==="1";document.querySelectorAll("[data-suscores]").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));return}
  if(b.id==="suSave"){if(!SU.fullName.trim()||!SU.name.trim()){toast("Add the club's name and the team name first.");return}
    suBusy=true;b.disabled=true;try{await suSaveSettings();location.replace(location.pathname+"?setup")}catch(er){suBusy=false;b.disabled=false;toast("Couldn't save. Check your connection and try again.")}return}
  if(b.id==="suSquad"){const lines=String(SU.squad||"").split(/\n/).map(s=>s.trim()).filter(Boolean),add=[],bad=[];
    for(const l of lines){const m=/^(.+?)(?:\s+#?(\d{1,2}))?$/.exec(l),name=m[1].trim();if(/\s/.test(name)||!/^[\p{L}'’-]+$/u.test(name)){bad.push(l);continue}
      if(!players.some(p=>p.name.toLowerCase()===name.toLowerCase())&&!add.some(p=>p.name.toLowerCase()===name.toLowerCase()))add.push({name:name.charAt(0).toUpperCase()+name.slice(1),num:m[2]?+m[2]:null})}
    if(bad.length){toast(`First names only, one word each. Check: ${bad.join(", ")}`);return}if(!add.length){toast("Type some first names, one per line.");return}
    b.disabled=true;let n=0;for(const p of add){try{await db.collection("players").doc(slug(p.name)).set({name:p.name,num:p.num,current:true});n++}catch(er){}}
    SU.squad="";toast(n===add.length?`${n} player${n>1?"s":""} added.`:`Added ${n} of ${add.length}. Try the rest again.`);render();return}
  if(b.id==="suFixAdd"){const last=SU_FIX[SU_FIX.length-1];SU_FIX.push({date:"",opp:"",ha:"H",ko:last?last.ko:"",comp:"League"});render();return}
  if(b.id==="suFixSave"){const rows=SU_FIX.filter(r=>r.date||r.opp);if(rows.some(r=>!r.date||!r.opp.trim())){toast("Each fixture needs a date and an opponent.");return}
    b.disabled=true;let n=0;for(const r of rows){const id=`${r.date}-${slug(r.opp)}-${Math.random().toString(36).slice(2,6)}`;
      try{await db.collection("matches").doc(id).set({date:r.date,opp:r.opp.trim(),ha:r.ha,venue:"",comp:r.comp,ko:r.ko||"",us:null,them:null,potm:null,played:{},assists:{},postponed:false,tournament_id:null,stage:"",halves:{},keepers:{},gk:null,saves:null,notes:"",apps:true,check:"",updated:new Date().toISOString()});n++}catch(er){}}
    SU_FIX=[];toast(`${n} fixture${n===1?"":"s"} saved.`);render();return}
  if(b.id==="suCoachAdd"){const em=($("#su-coach").value||"").trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)){toast("Type the coach's email address.");return}
    const {error}=await sb.rpc("add_coach",{new_email:em});if(error){toast("Couldn't add that coach. Try again.");return}toast(`${em} can now sign in.`);SU_COACHES=null;suLoad();return}
  if(b.dataset.sucoachdel){const em=b.dataset.sucoachdel;if(!confirm(`Remove ${em}? They won't be able to sign in any more.`))return;
    const {error}=await sb.rpc("remove_coach",{old_email:em});if(error){toast("Couldn't remove that coach.");return}toast(`${em} removed.`);SU_COACHES=null;suLoad();return}
  if(b.id==="suLive"){const S=SU_SIGN||{},scores=suScores!=null?suScores:(S.id?S.public_scores:TEAM.publicScores===true&&!youngAge(SU.ageGroup,SU.sport));
    const wn=$("#su-wname").value.trim(),we=$("#su-wemail").value.trim(),by=$("#su-by").value.trim(),ok=k=>$("#su-"+k).checked;
    if(!SU.fullName.trim()||!SU.name.trim()){toast("Fill in step 1 first.");return}
    if(!wn||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(we)){toast(`Add the ${(SPORTS[SU.sport]||SP).rugby?"safeguarding":"welfare"} officer's name and email.`);return}
    if(!ok("wok")||!ok("terms")||!ok("dpa")){toast("All three boxes need ticking before the site can go live.");return}
    if(!by){toast("Add the name and role of the person agreeing for the club.");return}
    suBusy=true;b.disabled=true;
    try{const {error}=await sb.from("team_signoff").upsert({id:1,welfare_name:wn,welfare_email:we.toLowerCase(),public_scores:scores,welfare_agreed:true,terms_agreed:true,dpa_agreed:true,agreed_by:by,coach_email:String(me.email||"").toLowerCase(),agreed_at:new Date().toISOString()});if(error)throw error;
      await suSaveSettings({publicScores:scores,_row:{ready:true}});location.replace(location.pathname+"?setup")}
    catch(er){suBusy=false;b.disabled=false;toast("Couldn't save the sign-off. Check your connection and try again.")}return}
});
// pick up a coach's changes made on another phone: if the database copy is newer than this phone's, reload once
// On a phone's first visit (nothing kept yet) the results wait for this answer instead, so visitors never glimpse a site that's still being set up.
async function suRefresh(){if(!sb)return;const first=window.SETUP_WAIT,done=()=>{if(first){window.SETUP_WAIT=false;render()}};
  const {data,error}=await sb.from("team_settings").select("settings,ready,updated").eq("id",1).maybeSingle();
  if(error){if(first&&(error.code==="PGRST205"||/does not exist|schema cache/i.test(error.message||"")))suRemember({none:true});done();return}// no table: an older database
  const row=data||{none:true},old=SETUP_ROW||{};if(first&&row.none){suRemember(row);done();return}
  if(!first&&row.updated===old.updated&&row.ready===old.ready&&!!row.none===!!old.none)return;
  suRemember(row);let seen="";try{seen=sessionStorage.getItem(SETUP_KEY)||""}catch(e){}
  if(seen!==String(row.updated)){try{sessionStorage.setItem(SETUP_KEY,String(row.updated))}catch(e){}location.reload();return}done()}

// ---------- the match form ----------
let F=null;
// the score the form adds up to: goals in football, points from tries and kicks in rugby
function formSum(){return RUGBY?[...new Set([...Object.keys(F.played),...Object.keys(F.kicks||{})])].reduce((a,n)=>a+ptsIn(F,n),0):Object.values(F.played).reduce((a,b)=>a+(+b||0),0)}
function blankForm(){return {id:null,date:new Date().toISOString().slice(0,10),opp:"",ha:"H",venue:"",comp:"League",ko:"",us:"",them:"",potm:"",played:{},assists:{},halves:{},keepers:{},gk:"",saves:"",notes:"",check:"",apps:true,postponed:false,tournament_id:null,stage:""}}
function formView(){
  if(!F)F=blankForm();if(RUGBY)F.kicks=F.kicks||{};
  const opps=[...new Set(matches.map(m=>m.opp).filter(Boolean))].sort(), venues=[...new Set(matches.map(m=>m.venue).filter(Boolean))].sort();
  const fs=F.date?seasonOf(F.date):season;const seasonNames=new Set(matches.filter(m=>seasonOf(m.date)===fs).flatMap(m=>Object.keys(played(m))));const roster=players.filter(p=>p.current||p.name in F.played||(fs!==todaySeason()&&seasonNames.has(p.name))).sort((a,b)=>(+a.num||99)-(+b.num||99));
  const goalSum=formSum();
  const mism=F.us!==""&&F.us!=null&&+F.us!==goalSum;
  const playedNames=Object.keys(F.played);
  return `<form id="mform" class="stack" novalidate>
  <h2>${F.id?"Edit match":"Add a match"}</h2>
  ${F.check?`<div class="note"><b>To check:</b> ${esc(F.check)}<br><span class="hint">Saving this match marks it as checked and removes the Check tag.</span></div>`:""}
  <section class="card stack" style="gap:12px"><h3>The match</h3>
    <div class="grid2">
      <label class="f" style="grid-column:1/-1">Opponent<input type="text" id="f-opp" list="${F.comp==="Tournament"&&tTeams(tournaments.find(y=>y.id===F.tournament_id)).length?"tteams":"opps"}" value="${esc(F.opp)}" required></label>
      <label class="f">Date<input type="date" id="f-date" value="${esc(F.date)}" required></label>
      <label class="f">Kick-off<input type="time" id="f-ko" value="${esc(F.ko)}"></label>
      <label class="f">Venue<input type="text" id="f-venue" list="venues" value="${esc(F.venue)}"></label>
      <label class="f">Meet / arrive by<input type="time" id="f-meet" value="${esc(MD(F).meet||"")}"></label>
      <label class="f">Pitch<input type="text" id="f-pitch" value="${esc(MD(F).pitch||"")}" placeholder="e.g. 3" maxlength="20"></label>
      <label class="f">Kit<select id="f-kit"><option value="">Not set</option>${Object.entries(TKITS()).map(([k,x])=>`<option value="${esc(k)}"${MD(F).kit===k?" selected":""}>${esc(x.label||k)}</option>`).join("")}<option value="Training kit"${MD(F).kit==="Training kit"?" selected":""}>Training kit</option></select></label>
      <label class="f" style="grid-column:1/-1">Last-minute changes for parents<input type="text" id="f-notice" value="${esc(MD(F).notice||"")}" maxlength="200" placeholder="e.g. Now on pitch 4. Bring a warm top."></label>
      <label class="f">Venue postcode<input type="text" id="f-pc" value="${esc(MD(F).postcode||"")}" placeholder="for directions and weather" maxlength="10" autocapitalize="characters"></label>
      <label class="f">Competition<select id="f-comp">${["League","Cup","Friendly","Tournament"].map(c=>`<option${c===F.comp?" selected":""}>${c}</option>`).join("")}</select></label>
    </div>
    ${F.comp==="Tournament"?`<div class="grid2"><label class="f">Which tournament<select id="f-tid"><option value="">Choose…</option>${tournaments.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")).map(t=>`<option value="${esc(t.id)}"${t.id===F.tournament_id?" selected":""}>${esc(t.name)} (${esc(tRange(t,true))})</option>`).join("")}</select></label>
      <label class="f">Stage<select id="f-stage">${STAGES.map(x=>`<option${x===(F.stage||"Group stage")?" selected":""}>${x}</option>`).join("")}</select></label></div>
      ${(x=>x&&tDays(x).length>1?`<div><div class="hint" style="margin-bottom:6px">Which day was this game?</div><div class="mg">${tDays(x).map((d,i)=>`<button type="button" class="mini" data-tday="${d}" aria-pressed="${F.date===d}"${F.date===d?' style="border-color:var(--club)"':""}>${F.date===d?"✓ ":""}Day ${i+1} · ${dayLabel(d)}</button>`).join("")}</div></div>`:"")(tournaments.find(y=>y.id===F.tournament_id))}
      <p class="hint">New tournament? Create it first with <b>+ Add a tournament</b>.</p>`:""}
    <datalist id="tteams">${tTeams(tournaments.find(y=>y.id===F.tournament_id)).filter(x=>!isUs(x.name)).map(x=>`<option value="${esc(x.name)}">`).join("")}</datalist>
    <datalist id="opps">${opps.map(o=>`<option value="${esc(o)}">`).join("")}</datalist>
    <datalist id="venues">${venues.map(o=>`<option value="${esc(o)}">`).join("")}</datalist>
    <label class="f" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="f-pp"${F.postponed?" checked":""} style="width:20px;height:20px"> Postponed (new date to be confirmed)</label>
    <div class="seg" role="group" aria-label="Home or away"><button type="button" data-ha="H" aria-pressed="${F.ha==="H"}">Home</button><button type="button" data-ha="A" aria-pressed="${F.ha==="A"}">Away</button><button type="button" data-ha="N" aria-pressed="${F.ha==="N"}">Neutral</button></div>
  </section>
  <section class="card stack" style="gap:12px"><h3>Who played${RUGBY?" and scored":", scored and assisted"}</h3>
    <p class="hint">${RUGBY?`Tick everyone who played, then tap + for each try (🏉)${KINDS.length?` and each kick they landed (${KINDS.map(t=>KICK[t][0].toLowerCase()+"s").join(", ")})`:""}.`:"Tick everyone who played, then tap + for each goal (⚽) and each assist (🅰️). Tap 🧤 for whoever went in goal (more than one is fine), then tick Clean sheet for each keeper who didn't concede."}</p>
    <div class="pp">${roster.map(p=>{const on=p.name in F.played;const g=F.played[p.name]||0;return `<div class="pr${on?" on":""}">
      <label for="pl-${esc(p.id)}"><input type="checkbox" id="pl-${esc(p.id)}" data-play="${esc(p.name)}"${on?" checked":""}><span class="n">${esc(p.num??"")}</span><span>${esc(p.name)}</span></label>
      <div class="step"><span class="ball" aria-hidden="true">${SP.ball}</span><button type="button" data-goal="-1" data-n="${esc(p.name)}" aria-label="One less ${SP.goal} for ${esc(p.name)}"${g?"":" disabled"}>−</button><output>${g}</output><button type="button" data-goal="1" data-n="${esc(p.name)}" aria-label="One more ${SP.goal} for ${esc(p.name)}">+</button></div>
      ${RUGBY?KINDS.map(t=>{const k=(F.kicks[p.name]||{})[t]||0;return `<div class="step"><span class="ball" aria-hidden="true" title="${KICK[t][0]}s">🎯<small>${KICK[t][1]}</small></span><button type="button" data-kick="${t}" data-d="-1" data-n="${esc(p.name)}" aria-label="One less ${KICK[t][0].toLowerCase()} for ${esc(p.name)}"${k?"":" disabled"}>−</button><output>${k}</output><button type="button" data-kick="${t}" data-d="1" data-n="${esc(p.name)}" aria-label="One more ${KICK[t][0].toLowerCase()} for ${esc(p.name)}">+</button></div>`}).join(""):""}
      ${SP.assists?`<div class="step"><span class="ball" aria-hidden="true">🅰️</span><button type="button" data-assist="-1" data-n="${esc(p.name)}" aria-label="One less assist for ${esc(p.name)}"${(F.assists[p.name]||0)?"":" disabled"}>−</button><output>${F.assists[p.name]||0}</output><button type="button" data-assist="1" data-n="${esc(p.name)}" aria-label="One more assist for ${esc(p.name)}">+</button></div>`:""}
      <div class="step"><span class="ball" aria-hidden="true" title="Halves played">⏱</span><button type="button" data-qtr="-1" data-n="${esc(p.name)}" aria-label="One less half for ${esc(p.name)}"${(F.halves[p.name]||0)?"":" disabled"}>−</button><output>${F.halves[p.name]||0}</output><button type="button" data-qtr="1" data-n="${esc(p.name)}" aria-label="One more half for ${esc(p.name)}"${(F.halves[p.name]||0)>=2?" disabled":""}>+</button></div>
      ${SP.keeper?`<div class="kps"><button type="button" class="kp" data-kp="${esc(p.name)}" aria-pressed="${p.name in F.keepers}">🧤 In goal</button>${p.name in F.keepers?`<button type="button" class="kp cs" data-kcs="${esc(p.name)}" aria-pressed="${!!+F.keepers[p.name]}">Clean sheet</button>`:""}</div>`:""}</div>`}).join("")}</div>
    <p class="hint">⏱ = halves played, 0 to 2 (optional, for fair playing time).</p>
  </section>
  <section class="card stack" style="gap:12px"><h3>Final score</h3>
    <div class="score"><label class="f">${esc(TEAM.name)}<input type="number" min="0" id="f-us" value="${esc(F.us)}" placeholder="${goalSum}"></label><span>–</span><label class="f">${esc(F.opp||"Them")}<input type="number" min="0" id="f-them" value="${esc(F.them)}"></label></div>
    ${mism?`<p class="hint" style="color:var(--warnInk)">${RUGBY?`The tries and kicks add up to ${goalSum} points. Fine if there was a penalty try; add it in the notes.`:`The scorers add up to ${goalSum}. Fine if there was an own goal; add it in the notes.`}</p>`:""}
    <label class="f"${F.comp==="Tournament"?" hidden":""}>${esc(POTM.charAt(0).toUpperCase()+POTM.slice(1))}<select id="f-potm"><option value="">Not chosen yet</option>${(playedNames.length?playedNames:roster.map(p=>p.name)).map(n=>`<option${n===F.potm?" selected":""}>${esc(n)}</option>`).join("")}</select></label>${F.comp!=="Tournament"?potmNudge(playedNames):""}
    ${SP.keeper?`<div class="grid2"><label class="f">Keeper saves (optional)<input type="number" min="0" id="f-saves" value="${esc(F.saves??"")}"></label></div>`:""}
    <label class="f">Notes<textarea id="f-notes">${esc(F.notes)}</textarea></label>
  </section>
  <div class="btns"><button class="btn gold" type="submit" id="saveM">${F.id?"Save changes":"Save match"}</button><button type="button" class="btn ghost" data-cancel>Cancel</button>
   ${F.id?`<button type="button" class="btn danger" id="delM" style="margin-left:auto">Delete match</button>`:""}</div>
  </form>`;
}
function readForm(){const v=id=>$("#"+id)?.value??"";F.opp=v("f-opp").trim();F.date=v("f-date");F.ko=v("f-ko");F.venue=v("f-venue").trim();F.comp=v("f-comp");
  F.us=v("f-us")===""?"":+v("f-us");F.them=v("f-them")===""?"":+v("f-them");F.potm=v("f-potm");F.notes=v("f-notes");F.saves=v("f-saves")===""?"":+v("f-saves");if($("#f-pp"))F.postponed=$("#f-pp").checked;
  if($("#f-meet")){const md={meet:v("f-meet"),pitch:v("f-pitch").trim(),kit:v("f-kit"),postcode:v("f-pc").trim().toUpperCase(),notice:v("f-notice").trim()};Object.keys(md).forEach(k=>{if(!md[k])delete md[k]});F.matchday=md}
  if($("#f-tid")){F.tournament_id=$("#f-tid").value||null;F.stage=$("#f-stage").value}else if(F.comp!=="Tournament"){F.tournament_id=null;F.stage=""}}
async function saveMatch(){
  readForm();
  if(!F.date||!F.opp){toast("Add the date and opponent first.");return}
  if(F.comp==="Tournament"&&!F.tournament_id){toast("Pick which tournament this game was in.");return}
  if(F.comp==="Tournament"&&(x=>x&&tDays(x).length>1&&!tDays(x).includes(F.date))(tournaments.find(y=>y.id===F.tournament_id))){toast("Pick which day of the tournament this game was on.");return}
  if(F.comp==="Tournament")F.potm="";
  const goalSum=formSum();
  const body={date:F.date,opp:F.opp,ha:F.ha,venue:F.venue,comp:F.comp,ko:F.ko,us:F.us===""?(Object.keys(F.played).length&&F.them!==""?goalSum:null):F.us,them:F.them===""?null:F.them,
    potm:F.potm||null,played:F.played,assists:F.assists||{},postponed:!!F.postponed&&F.us===""&&F.them==="",tournament_id:F.tournament_id||null,stage:F.stage||"",halves:F.halves||{},keepers:F.keepers||{},gk:Object.keys(F.keepers||{})[0]||null,saves:F.saves===""||F.saves==null?null:+F.saves,notes:F.notes,apps:F.apps!==false||Object.values(F.played).some(g=>!(+g>0)),check:"",updated:new Date().toISOString()};
  if(F.matchday&&(Object.keys(F.matchday).length||(matches.find(x=>x.id===F.id)||{}).matchday))body.matchday=F.matchday;
  if(!F.id&&body.tournament_id&&(sq=>sq.length)(tSquad(tournaments.find(t=>t.id===body.tournament_id))))body.squad=tSquad(tournaments.find(t=>t.id===body.tournament_id));
  if(RUGBY)body.kicks=Object.fromEntries(Object.entries(F.kicks||{}).filter(([n,k])=>n in F.played&&kickText(k)));
  const id=F.id||`${F.date}-${slug(F.opp)}-${Math.random().toString(36).slice(2,6)}`;
  $("#saveM").disabled=true;
  const was=F.id?matches.find(x=>x.id===F.id)||{}:{},tellPP=!!F.id&&!!body.postponed!==!!was.postponed&&body.date>=new Date().toISOString().slice(0,10);// the function alerts on postponed, and resets when it's back on
  // a newly chosen player of the match for a game just played is sent to parents' phones (the function skips older games)
  const prevPotm=F.id?(matches.find(x=>x.id===F.id)||{}).potm||null:null,tellPotm=!!body.potm&&body.potm!==prevPotm&&body.us!=null&&body.comp!=="Tournament";
  try{try{await db.collection("matches").doc(id).set(body)}catch(er){if(!("matchday" in body))throw er;delete body.matchday;await db.collection("matches").doc(id).set(body);toast("Match saved, but not the meet time, pitch or kit: the database needs its October update.");await new Promise(r=>setTimeout(r,2500))}// older database without matches.matchday
    toast("Match saved.");
    if(tellPP)alSend({postponed:id}).then(r=>{if(body.postponed&&r!=null&&r>=0)toast("Match saved. Parents with alerts on have been told it's postponed.")});
    if(tellPotm)alSend({potm:id}).then(r=>{if(r!=null&&r>=0)toast(`Match saved. ${POTM.charAt(0).toUpperCase()+POTM.slice(1)} sent to parents' phones.`)});season=seasonOf(F.date);F=null;editing=null;setView(isFixture(body)?"fixtures":"results")}
  catch(e){$("#saveM").disabled=false;toast(e&&e.code==="quota_exceeded"?"The results store is full.":"Couldn't save. Check your connection and try again.");if(e&&e.code==="invalid_argument"){canWrite=false;render()}}
}

// ---------- sortable stats tables: tap a column heading to sort, tap again to flip ----------
function cellVal(td){const t=(td?td.textContent:"").trim();if(t===""||t==="–"||t==="-")return null;const n=parseFloat(t.replace(/^[^\d.-]+/,""));return isNaN(n)?t.toLowerCase():n}
document.addEventListener("click",e=>{const th=e.target.closest("table.lb thead th");if(!th)return;const tr=th.parentElement,tb=th.closest("table").tBodies[0];if(!tb)return;
  const i=[...tr.children].indexOf(th);const rows=[...tb.rows];const cv=(r)=>i===0&&r.dataset.player?r.dataset.player.toLowerCase():i===0&&r.dataset.opp?r.dataset.opp.toLowerCase():cellVal(r.cells[i]);const num=rows.some(r=>typeof cv(r)==="number");
  const dir=th.dataset.sort==="desc"?"asc":th.dataset.sort==="asc"?"desc":(num?"desc":"asc");tr.querySelectorAll("th").forEach(x=>delete x.dataset.sort);th.dataset.sort=dir;
  rows.sort((a,b)=>{const x=cv(a),y=cv(b);if(x===y)return 0;if(x===null)return 1;if(y===null)return -1;const c=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y));return dir==="asc"?c:-c}).forEach(r=>tb.appendChild(r))});
// ---------- events ----------
document.addEventListener("click",async e=>{
  const t=e.target.closest("button,tr.click,[data-edit],.match");if(!t)return;
  if(t.closest("#gfxView"))return;
  if(t.dataset.lb){lbAction(t.dataset.lb);return}
  if(t.dataset.photo){lbOpen(t.dataset.photo);return}
  if(t.dataset.ics){const m=matches.find(x=>x.id===t.dataset.ics);if(m)downloadIcs(m);return}
  if(t.dataset.appcopy){try{await navigator.clipboard.writeText(t.dataset.appcopy);toast("Link copied.")}catch(err){prompt("Copy this link",t.dataset.appcopy)}return}
  if(t.id==="appInstall"&&INSTALL){const e=INSTALL;INSTALL=null;e.prompt();try{await e.userChoice}catch(err){}render();return}
  if(t.id==="calCopy"){try{await navigator.clipboard.writeText(t.dataset.url);toast("Calendar link copied.")}catch(err){prompt("Copy this link",t.dataset.url)}return}
  if(t.id==="trEditBtn"&&canWrite){trEdit=JSON.parse(JSON.stringify(TR||{day:"Wednesday",start:"18:00",finish:"19:00",off:[]}));render();return}
  if(t.id==="trCancel"){trEdit=null;render();return}
  if(t.id==="attSave"){attSave();return}
  if(t.dataset.mday){mdayMatch=t.dataset.mday==="1"?null:t.dataset.mday;setView("matchday");return}
  if(t.dataset.mdayav){availMatch=t.dataset.mdayav;view="avail";render();return}
  if(t.dataset.mdayrep){mdWrite=true;mdPrevWrite=false;mdFrom="matchday";mdMatch=t.dataset.mdayrep;setView("md");return}
  if(t.id==="ftStart"&&canWrite){ftStart();return}
  if(t.id==="ftFetch"){ftFetch();return}
  if(t.id==="ftPaste"){ftPasted();return}
  if(t.id==="ftImport"){t.disabled=true;ftImport();return}
  if(t.id==="ftAll"){ftRows().filter(f=>f.state!=="same").forEach(f=>FT.picks.add(f.key));render();return}
  if(t.dataset.sprep){const tx=sponsorText(t.dataset.sprep);try{await navigator.clipboard.writeText(tx);toast("Report copied. Paste it into an email.")}catch(er){prompt("Copy this report",tx)}return}
  if(t.dataset.vote){const [id,i]=t.dataset.vote.split("|");castVote(id,+i);return}
  if(t.dataset.punlink){parentLeave(t.dataset.punlink);return}
  if(t.id==="pLeave"){parentLeave(null);return}
  if(t.dataset.famcopy){const f=(FAM||[]).find(x=>x.player_id===t.dataset.famcopy);if(f)copyOut(famText(f),`Copied. Send it to ${f.player}'s family.`);return}
  if(t.id==="famAll"&&FAM){copyOut(`${TEAM.name||""} ${TEAM.ageGroup||""} family codes (keep private)\n\n${FAM.map(f=>`${f.player}: ${fmtCode(f.code)}`).join("\n")}\n\nParents type their code at ${siteUrl()}?parents`,"All codes copied.");return}
  if(t.dataset.famnew&&canWrite){const f=(FAM||[]).find(x=>x.player_id===t.dataset.famnew);if(!f||!confirm(`Make a new code for ${f.player}? The old one stops working and any phones using it are signed out.`))return;
    const {error}=await sb.rpc("new_family_code",{p_player:f.player_id});toast(error?"Couldn't make a new code. Try again.":`New code made for ${f.player}. Send it to the family.`);await loadFam();return}
  if(t.dataset.preq&&canWrite){const on=t.dataset.preq==="1";const {error}=await sb.from("parent_settings").update({required:on}).eq("id",1);if(error){toast("Couldn't change that. Try again.");return}PREQ=on;toast(on?"Parents now need their family code to answer and vote.":"Anyone with the link can answer and vote again.");render();return}
  if(t.dataset.pollnew&&canWrite){pollStart(t.dataset.pollnew);return}
  if(t.id==="pfCancel"){pollNew=null;render();return}
  if(t.id==="pfSave"){pollSave();return}
  if(t.id==="pfGoals"&&pollNew){const mo=$("#pf-month").value,g=monthGoals(mo);pollNew.month=mo;pollNew.title=$("#pf-title").value;if(/^(Goal|Try) of the month: /.test(pollNew.title)&&mo)pollNew.title=`${RUGBY?"Try":"Goal"} of the month: ${LONGM[+mo.slice(5)-1]}`;pollNew.closes=$("#pf-closes").value;pollNew.opts=g.join("\n");render();if(!g.length)toast(`No ${SP.goals} recorded in Live match mode that month. Type them in.`);return}
  if(t.dataset.pollclose){await sb.from("polls").update({closed:true}).eq("id",t.dataset.pollclose);await loadPolls();render();return}
  if(t.dataset.polldel&&confirm("Delete this vote and its results?")){await sb.from("polls").delete().eq("id",t.dataset.polldel);await loadPolls();render();return}
  if(t.id==="attAll"){document.querySelectorAll("[data-att]").forEach(x=>x.checked=true);return}
  if(t.id==="trOffAdd"&&trEdit){trRead();const d=$("#tr-offnew").value;if(!d){toast("Pick a date first.");return}trEdit.off=[...new Set([...(trEdit.off||[]),d])];render();return}
  if(t.dataset.troff&&trEdit){trRead();trEdit.off=(trEdit.off||[]).filter(x=>x!==t.dataset.troff);render();return}
  if(t.id==="trSave"&&trEdit&&canWrite){trRead();const row=Object.assign({},trEdit,{id:1,updated:new Date().toISOString()});if(!/^\d{1,2}:\d{2}/.test(row.start)||!/^\d{1,2}:\d{2}/.test(row.finish)){toast("Add a start and finish time.");return}t.disabled=true;
    const {data,error}=await sb.from("training").upsert(row).select().single();if(error){t.disabled=false;toast("Couldn't save training. Try again.");return}TR=data;trEdit=null;toast("Training saved.");render();return}
  if(t.dataset.gfx){const m=matches.find(x=>x.id===t.dataset.mid);if(m){F=null;playerView=null;setView("gfx");await (await gfxReady()).loadMatch(m,t.dataset.gfx)}return}
  if(t.dataset.view){F=null;T=null;H=null;trEdit=null;playerView=null;oppView=null;parentNext=t.dataset.pnext||null;if(t.dataset.view==="new"){F=blankForm()}setView(t.dataset.view);return}
  if(t.dataset.edit||t.dataset.md){const id=t.dataset.edit||t.dataset.md;if(matches.some(x=>x.id===id))openMatch(id);return}
  if(t.id==="mdReportEdit"){mdWrite=true;render();const ta=$("#mdReport");if(ta){ta.focus();ta.scrollIntoView({block:"center"})}return}
  if(t.id==="mdReportCancel"){mdWrite=false;render();return}
  if(t.id==="mdPreviewEdit"){mdPrevWrite=true;render();const ta=$("#mdPreview");if(ta){ta.focus();ta.scrollIntoView({block:"center"})}return}
  if(t.id==="mdPreviewCancel"){mdPrevWrite=false;render();return}
  if(t.id==="mdPreviewAi"||t.id==="mdReportAi"){const rep=t.id==="mdReportAi",m=matches.find(x=>x.id===mdMatch),ta=$(rep?"#mdReport":"#mdPreview");if(!m||!ta||!canWrite)return;
    if(ta.value.trim()&&!confirm(`Replace what's in the box with a suggested ${rep?"report":"preview"}?`))return;
    t.disabled=true;const was=t.textContent;t.textContent="Writing…";let txt=null,why="";
    try{const {data,error}=await sb.functions.invoke("preview",{body:fnBody({match:m.id,kind:rep?"report":"preview",team:Object.assign({name:TEAM.name,ageGroup:TEAM.ageGroup,publicScores:TEAM.publicScores},RUGBY?{sport:SP.key}:{})})});if(!error&&data&&data.text)txt=data.text;else why=(data&&data.error)||""}catch(e){}
    t.disabled=false;t.textContent=was;
    if(txt)toast("Here's a suggestion. Check it and make it your own before saving.");else{txt=rep?draftReport(m):draftPreview(m);toast(why==="no_key"?"AI suggestions aren't switched on yet, so here's a simple draft from the stats.":"Couldn't get an AI suggestion, so here's a simple draft from the stats.")}
    ta.value=txt;ta.focus();return}
  if(t.dataset.share){const m=matches.find(x=>x.id===mdMatch);if(!m)return;const text=shareText(m,t.dataset.share);
    if(navigator.share){try{await navigator.share({text});return}catch(e){if(e&&e.name==="AbortError")return}}
    try{await navigator.clipboard.writeText(text);toast("Copied. Paste it into WhatsApp.")}catch(e){prompt("Copy this",text)}return}
  if(t.id==="mdPreviewSave"){const m=matches.find(x=>x.id===mdMatch);if(!m||!canWrite)return;const txt=$("#mdPreview").value.trim(),tell=!!(txt&&$("#mdPreviewAlert")&&$("#mdPreviewAlert").checked);t.disabled=true;
    try{await db.collection("matches").doc(m.id).update({preview:txt||null});m.preview=txt||null;const raw=RAW.find(x=>x.id===m.id);if(raw)raw.preview=m.preview;mdPrevWrite=false;
      // the function only sends the first time a game's preview is saved
      const r=tell?await alSend({preview:m.id}):null;
      toast(txt?`Match preview saved.${r==null?"":r>=0?" Parents with alerts on have been told.":" An alert was already sent for this game, so no new one."}`:"Match preview removed.");render()}catch(e){t.disabled=false;toast("Couldn't save the preview. Check your connection and try again.")}return}
  if(t.id==="mdReportSave"){const m=matches.find(x=>x.id===mdMatch);if(!m||!canWrite)return;const txt=$("#mdReport").value.trim();t.disabled=true;
    try{await db.collection("matches").doc(m.id).update({report:txt||null});m.report=txt||null;mdWrite=false;toast(txt?"Match report saved.":"Match report removed.");render()}catch(e){t.disabled=false;toast("Couldn't save the report. Check your connection and try again.")}return}
  if("mdback" in t.dataset){setView(mdFrom||"results");return}
  if(t.dataset.medit){const m=matches.find(x=>x.id===t.dataset.medit);if(!m||!canWrite)return;
    F=JSON.parse(JSON.stringify(m));F.played=F.played||{};F.assists=F.assists||{};F.halves=F.halves||{};F.keepers=Object.assign({},keepersOf(F));F.us=F.us??"";F.them=F.them??"";F.potm=F.potm||"";setView("edit");return}
  if(t.dataset.player){playerView=t.dataset.player;setView("players");return}
  if(t.dataset.tday&&F){readForm();F.date=t.dataset.tday;render();return}
  if(t.dataset.tedit){const x=tournaments.find(y=>y.id===t.dataset.tedit);if(x&&canWrite){T=JSON.parse(JSON.stringify(x));setView("tedit")}return}
  if(t.dataset.hedit){const x=honours.find(y=>y.id===t.dataset.hedit);if(x&&canWrite){H=JSON.parse(JSON.stringify(x));setView("hedit")}return}
  if(t.dataset.tgame){const x=tournaments.find(y=>y.id===t.dataset.tgame);if(!x)return;F=Object.assign(blankForm(),{comp:"Tournament",tournament_id:x.id,date:x.date||blankForm().date,venue:x.venue||"",ha:"N",stage:"Group stage"});
    const prev=tGames(x).slice(-1)[0];if(prev){F.played=Object.fromEntries(Object.keys(played(prev)).map(n=>[n,0]));if(tDays(x).includes(prev.date))F.date=prev.date}setView("new");return}
  // one alert for the whole tournament when the draw and kick-off times are in (no kick-off countdown for tournament games)
  if(t.dataset.ttell){if(!t.dataset.sure){t.dataset.sure="1";t.textContent="Tap again to send to parents' phones";return}
    t.disabled=true;const r=await alSend({tournament:t.dataset.ttell});t.disabled=false;delete t.dataset.sure;t.textContent="📣 Tell parents: groups and games confirmed";
    toast(r==null?"Couldn't send it. Check your connection and try again.":r<0?"Parents have already been told about this tournament.":`Sent to ${r} phone${r===1?"":"s"}.`);return}
  if(t.dataset.tpost){const x=tournaments.find(y=>y.id===t.dataset.tpost);if(x&&x.potm){F=null;setView("gfx");await (await gfxReady()).loadTournament(x)}return}
  if(t.id==="delT"){if(t.dataset.sure){try{await db.collection("tournaments").doc(T.id).delete();toast("Tournament deleted.");T=null;setView("results")}catch(err){toast("Couldn't delete it.")}}else{t.dataset.sure="1";t.textContent="Tap again to delete"}return}
  if(t.id==="delH"){if(t.dataset.sure){try{await db.collection("honours").doc(H.id).delete();toast("Removed.");H=null;setView("honours")}catch(err){toast("Couldn't delete it.")}}else{t.dataset.sure="1";t.textContent="Tap again to delete"}return}
  if(t.dataset.opp){oppView=t.dataset.opp;setView("opps");return}
  if("back" in t.dataset){playerView=null;oppView=null;render();return}
  if("cancel" in t.dataset){F=null;setView("results");return}
  if(t.dataset.ha&&F){readForm();F.ha=t.dataset.ha;render();return}
  if(t.dataset.goal&&F){readForm();const n=t.dataset.n;const g=Math.max(0,(F.played[n]||0)+ +t.dataset.goal);F.played[n]=g;
    if(F.us!==""&&F.us!=null&&!F._usTouched){F.us=formSum()}render();return}
  if(t.dataset.kick&&F){readForm();const n=t.dataset.n,k=t.dataset.kick;F.kicks=F.kicks||{};const o=F.kicks[n]=Object.assign({},F.kicks[n]);o[k]=Math.max(0,(o[k]||0)+ +t.dataset.d);if(!o[k])delete o[k];if(!(n in F.played))F.played[n]=0;
    if(F.us!==""&&F.us!=null&&!F._usTouched){F.us=formSum()}render();return}
  if(t.dataset.kp&&F){readForm();const n=t.dataset.kp;F.keepers=F.keepers||{};if(n in F.keepers)delete F.keepers[n];else{F.keepers[n]=F.them!==""&&+F.them===0?1:0;if(!(n in F.played))F.played[n]=0}render();return}
  if(t.dataset.kcs&&F){readForm();const n=t.dataset.kcs;F.keepers[n]=+F.keepers[n]?0:1;render();return}
  if(t.dataset.qtr&&F){readForm();const n=t.dataset.n;F.halves=F.halves||{};const q=Math.min(2,Math.max(0,(F.halves[n]||0)+ +t.dataset.qtr));if(q)F.halves[n]=q;else delete F.halves[n];if(q&&!(n in F.played))F.played[n]=0;render();return}
  if(t.dataset.assist&&F){readForm();const n=t.dataset.n;F.assists=F.assists||{};const a=Math.max(0,(F.assists[n]||0)+ +t.dataset.assist);if(a)F.assists[n]=a;else delete F.assists[n];
    if(a&&!(n in F.played))F.played[n]=0;render();return}
  if(t.id==="delM"){if(t.dataset.sure){try{await db.collection("matches").doc(F.id).delete();toast("Match deleted.");F=null;setView("results")}catch(err){toast("Couldn't delete it. Try again.")}}
    else{t.dataset.sure="1";t.textContent="Tap again to delete";setTimeout(()=>{if(t.isConnected){delete t.dataset.sure;t.textContent="Delete match"}},4000)}return}
  if(t.dataset.cur!=null){const row=t.closest("[data-pid]");const p=players.find(p=>p.id===row.dataset.pid);try{await db.collection("players").doc(p.id).update({current:t.dataset.cur==="1"})}catch(err){toast("Couldn't update. Try again.")}return}
  if(t.id==="addP"){FAM=null;const name=$("#newName").value.trim();if(!name){toast("Type a first name.");return}if(players.some(p=>p.name.toLowerCase()===name.toLowerCase())){toast(`${name} is already in the squad.`);return}
    const num=$("#newNum").value;try{await db.collection("players").doc(slug(name)).set({name,num:num===""?null:+num,current:true});toast(`${name} added.`)}catch(err){toast(`Couldn't add ${PRN.o}. Try again.`)}return}
});
document.addEventListener("click",e=>{if(LB&&e.target.classList&&e.target.classList.contains("lb-img"))lbClose()});
document.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.classList&&(e.target.classList.contains("match")||e.target.classList.contains("tgame"))){e.preventDefault();e.target.click()}});
document.addEventListener("change",async e=>{
  const t=e.target;if(t.closest&&t.closest("#gfxView"))return;
  if(t.id==="season"){season=t.value;playerView=null;render();return}
  if(t.dataset.galup){const fs=[...t.files];t.value="";galUpload(t.dataset.galup,fs);return}
  if(t.id==="galPick"){galMatch=t.value;render();return}
  if(t.id==="calTr"){calTraining=t.checked;render();return}
  if(t.dataset.play&&F){readForm();const n=t.dataset.play;if(t.checked)F.played[n]=F.played[n]||0;else{delete F.played[n];if(F.assists)delete F.assists[n];if(F.halves)delete F.halves[n];if(F.keepers)delete F.keepers[n];if(F.kicks)delete F.kicks[n];if(F.potm===n)F.potm=""}render();return}
  if(t.id==="f-us"&&F){F._usTouched=true}
  if(t.id==="f-comp"&&F){readForm();F.comp=t.value;if(F.comp==="Tournament")F.ha="N";render();return}
  if(t.id==="f-tid"&&F){readForm();const x=tournaments.find(y=>y.id===t.value);if(x){F.date=x.date||F.date;if(!F.venue)F.venue=x.venue||""}render();return}
  if(t.id==="t-trophy"){$("#t-other-wrap").hidden=t.value!=="__other";return}
  if(t.dataset.f){const row=t.closest("[data-pid]");const p=players.find(p=>p.id===row.dataset.pid);const val=t.dataset.f==="num"?(t.value===""?null:+t.value):t.value.trim();if(!val&&t.dataset.f==="name")return;
    try{await db.collection("players").doc(p.id).update({[t.dataset.f]:val});toast("Saved.")}catch(err){toast("Couldn't save. Try again.")}}
});
document.addEventListener("submit",e=>{if(e.target.id==="pForm"){e.preventDefault();parentJoin()}else if(e.target.id==="mform"){e.preventDefault();saveMatch()}else if(e.target.id==="tform"){e.preventDefault();saveTournament()}else if(e.target.id==="hform"){e.preventDefault();saveHonour()}else e.preventDefault()});

// ---------- boot (Supabase) ----------
const CFG=window.TEAM_CONFIG||window.NAYFC_CONFIG||{};
let sb=null, me=null;
function makeDb(sb){
  const subs={matches:[],players:[],tournaments:[],honours:[]};
  const toDoc=r=>{const d=Object.assign({},r);delete d.id;if("check_note" in d){d.check=d.check_note||"";delete d.check_note}if(d.us===undefined)d.us=null;return {id:r.id,data:()=>d}};
  const toRow=(id,b)=>{const r=Object.assign({id},b);if("check" in r){r.check_note=r.check||"";delete r.check}delete r.updated;return r};
  async function load(c){const {data,error}=await sb.from(c).select("*");if(error)throw error;const snap={docs:data.map(toDoc)};subs[c].forEach(([ok])=>ok(snap))}
  return {collection:c=>({
    onSnapshot(ok,bad){subs[c].push([ok,bad]);load(c).catch(e=>bad&&bad(e));return()=>{}},
    doc:id=>({
      async set(b){const {error}=await sb.from(c).upsert(toRow(id,b));if(error)throw {code:"invalid_argument",message:error.message};await load(c)},
      async update(b){const r=toRow(id,b);delete r.id;const {error}=await sb.from(c).update(r).eq("id",id);if(error)throw {code:"invalid_argument",message:error.message};await load(c)},
      async delete(){const {error}=await sb.from(c).delete().eq("id",id);if(error)throw {code:"invalid_argument",message:error.message};await load(c)}
    })}),
    reload(){return Promise.all([load("players"),load("matches"),load("tournaments"),load("honours")])}};
}
function authBox(){
  const el=document.getElementById("auth");if(!el)return;
  if(me&&isParent()){el.innerHTML=KIDS.length?`<button class="mini" data-view="parents">👪 ${esc(KIDS.join(", "))}</button>`:""}
  else if(me){el.innerHTML=`<span class="who">${canWrite?"Coach":"Signed in"}: ${esc(me.email)}</span><button class="mini" id="signOut">Sign out</button>`}
  else if(/[?&]coach\b/.test(location.search)){el.innerHTML=`<button class="mini" id="signIn">Coach sign in</button>`}
  else{el.innerHTML=""}
}
// the graphics maker (gfx.js) is only for coaches, so it's fetched once one signs in
function loadGfx(){if(window.GFX||document.getElementById("gfxjs"))return;const el=document.createElement("script");el.id="gfxjs";el.src="gfx.js";
  el.onload=()=>{window.GFX&&GFX.setSquad(players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99)));if(view==="gfx")render()};document.body.appendChild(el)}
const gfxReady=()=>window.GFX?Promise.resolve(window.GFX):new Promise(ok=>{loadGfx();document.getElementById("gfxjs").addEventListener("load",()=>ok(window.GFX),{once:true})});
async function checkCoach(){
  canWrite=false;matches=pubMatches();
  if(me&&!isParent()){const {data}=await sb.from("coaches").select("email").eq("email",(me.email||"").toLowerCase()).maybeSingle();canWrite=!!data;if(!canWrite){await sb.auth.signOut();me=null;toast("That email isn't on the club's coach list.")}}
  if(!canWrite&&["new","edit","gfx","live","msg","pick","tnew","tedit","hnew","hedit","book","help","setup","ftimport"].includes(view))view="home";
  if(canWrite&&TEAM.publicScores===false){matches=RAW.slice();if(PRACTICE)matches.push(PRACTICE)}
  if(canWrite)loadGfx();
  FAM=null;await loadParent();
  await loadAvail();await loadPhotos();await loadViews();await loadHelp();await loadAttendance();await loadPolls();await loadPosts();
  authBox();render();
}
document.addEventListener("click",async e=>{
  const b=e.target.closest("button");if(!b)return;
  if(b.id==="signOut"){await sb.auth.signOut();return}
  if(b.id==="signIn"){const m=document.getElementById("main");view="login";
    m.hidden=false;document.getElementById("gfxView").hidden=true;
    m.innerHTML=`<form class="card stack" id="loginForm" style="max-width:420px"><h2>Coach sign in</h2><p class="hint">We'll email you a sign-in link. Only coaches on the club's list can add matches.</p><label class="f">Email<input type="text" id="loginEmail" inputmode="email" autocomplete="email"></label><div class="btns"><button class="btn" type="submit">Email me a link</button><button class="btn ghost" type="button" data-view="home">Cancel</button></div></form>`;return}
});
document.addEventListener("submit",async e=>{
  if(e.target.id!=="loginForm")return;e.preventDefault();
  const email=document.getElementById("loginEmail").value.trim();if(!email){toast("Type your email.");return}
  const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});
  toast(error?"That email isn't on the club's coach list.":"Check your email for the sign-in link.");
});
(async function(){
  render();
  if(!window.supabase||!CFG.supabaseUrl||!CFG.supabaseAnonKey){document.getElementById("main").innerHTML=`<div class="card empty">This site isn't connected to its database yet. Add the Supabase details to config.js (see the README).</div>`;return}
  // CFG.schema: this team's own section when several teams share one Supabase project (tools/team_schema_sql.py).
  // Its sign-in is kept apart too, so a coach of one team signing in on another team's page can't sign them out of their own.
  sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseAnonKey,CFG.schema?{db:{schema:CFG.schema},auth:{storageKey:"sb-"+CFG.schema+"-auth-token"}}:{});
  db=makeDb(sb);canWrite=false;
  if(window.SETUP_WAIT)suRefresh().catch(()=>{window.SETUP_WAIT=false;render()});
  const {data:{session}}=await sb.auth.getSession();me=session?.user||null;
  sb.auth.onAuthStateChange((_ev,s)=>{const u=s?.user||null;if((u&&u.id)!==(me&&me.id)){me=u;checkCoach()}});
  db.collection("players").onSnapshot(s=>{players=s.docs.map(d=>Object.assign({id:d.id},d.data()));window.GFX&&GFX.setSquad(players.filter(p=>p.current).sort((a,b)=>(+a.num||99)-(+b.num||99)));if(view!=="new"&&view!=="edit"&&view!=="login"&&view!=="setup")render()},()=>toast("Couldn't load the squad. Reload the page."));
  const formOpen=()=>["new","edit","login","tnew","tedit","hnew","hedit","setup"].includes(view)||(view==="md"&&(mdWrite||mdPrevWrite))||(view==="training"&&!!trEdit);
  db.collection("matches").onSnapshot(s=>{RAW=s.docs.map(d=>Object.assign({id:d.id},d.data())).filter(m=>m.stage!=="placeholder");matches=pubMatches();if(PRACTICE)matches.push(PRACTICE);if(!formOpen())render()},()=>toast("Couldn't load the results. Reload the page."));
  db.collection("tournaments").onSnapshot(s=>{tournaments=s.docs.map(d=>Object.assign({id:d.id},d.data()));if(!formOpen())render()},()=>{});
  db.collection("honours").onSnapshot(s=>{honours=s.docs.map(d=>Object.assign({id:d.id},d.data()));if(!formOpen())render()},()=>{});
  if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
  await loadBadges();
  await Promise.all([loadGallery(),loadTraining(),loadPolls(),loadParentSettings(),loadCheerSettings()]);
  if(!window.SETUP_WAIT)suRefresh().catch(()=>{});
  await checkCoach();
  logView();
  if(new URLSearchParams(location.search).has("alerts")){view="alerts";render()}
  for(const v of ["fixtures","gallery","calendar","training","help","setup","votes","matchday","privacy","parents"])if(new URLSearchParams(location.search).has(v))setView(v);
  const qm=new URLSearchParams(location.search).get("match");if(qm){mdMatch=qm;mdFrom="results";view="md";render()}
  if(new URLSearchParams(location.search).has("app")){view="app";render()}
  const ql=new URLSearchParams(location.search).get("live");if(ql){tlMatch=ql;view="tl";render()}
  const qa=new URLSearchParams(location.search).get("avail");if(qa){availMatch=qa;try{const {data}=await sb.from("matches").select("id").eq("id",qa);}catch(e){}view="avail";render()}
})();
})();
