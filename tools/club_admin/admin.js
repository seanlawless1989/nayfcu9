// Club admin page: touchlinetales.club/<club>/admin/  (built by tools/package_club.py when club.json has "admin")
// Club leads and club admins sign in with their email (a code, like coaches do). Data: the project's "club" schema
// (supabase/26_club_admin.sql) plus each team's own matches and tournaments, which are public already.
//   Reports  every team's match and tournament reports, newest first, to copy for social media and tick off
//   Drills   the club's shared drills library (coaches add them on their team sites)
//   Club     club admins (the club lead adds and removes them) and the teams, with whether their scores can be shown
(function(){
"use strict";
const C=window.CLUB||{},$=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const STATUS={new:["New","🆕"],picked:["Picked","⭐"],posted:["Posted","✅"],skipped:["Skipped","➖"]};
let sb=null,me=null,role=null,tab="reports",TEAMS=[],REPORTS=[],ST={},DRILLS=[],ADMINS=[],filt="todo",teamF="",drOpen=null,busy=false,more=false;
function toast(t){const el=$("#toast");el.textContent=t;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,3500)}
const club=()=>sb.schema("club");
const isAdmin=()=>role==="lead"||role==="admin";
const day=d=>d?new Date(d+"T12:00:00").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"";
const paras=t=>String(t||"").trim().split(/\n\s*\n/).map(p=>`<p>${esc(p.trim()).replace(/\*\*(\S(?:.*?\S)?)\*\*/g,"<b>$1</b>").replace(/\n/g,"<br>")}</p>`).join("");
const plain=t=>String(t||"").replace(/\*\*/g,"").trim();

// ---------- data ----------
async function loadTeams(){const {data}=await club().from("teams").select("*").eq("club",C.id).order("sort");TEAMS=data||[]}
async function loadReports(){
  const out=[];
  await Promise.all(TEAMS.map(async t=>{const s=sb.schema(t.team_schema);
    const [m,tr]=await Promise.all([s.from("matches").select("*"),s.from("tournaments").select("id,name,date,venue,report")]);
    const tours=(tr.data||[]).filter(x=>x.report&&x.report.trim());
    tours.forEach(x=>out.push({team:t,kind:"tour",id:x.id,date:x.date||"",title:x.name||"Tournament",sub:x.venue||"",report:x.report,link:`${t.url}?tour=${encodeURIComponent(x.id)}`}));
    (m.data||[]).forEach(x=>{if(!x.report||!x.report.trim()||x.practice||x.stage==="placeholder"||x.hidden)return;
      if(x.tournament_id&&tours.some(y=>y.id===x.tournament_id))return;   // the tournament's report covers its games
      const score=t.show_scores&&x.us!=null&&x.them!=null?`${x.us}-${x.them}`:"";
      out.push({team:t,kind:"match",id:x.id,date:x.date||"",title:`v ${x.opp||"?"}${x.ha==="H"?" (home)":x.ha==="A"?" (away)":""}`,sub:[x.comp,score&&`Full time ${score}`,x.potm&&`Player of the match: ${x.potm}`].filter(Boolean).join(" · "),
        opp:x.opp,score,potm:x.potm,report:x.report,link:`${t.url}?match=${encodeURIComponent(x.id)}`})})}));
  REPORTS=out.sort((a,b)=>b.date.localeCompare(a.date));
  ST={};if(isAdmin()){const {data}=await club().from("report_status").select("*").eq("club",C.id);(data||[]).forEach(r=>ST[`${r.team_schema}|${r.kind}|${r.item_id}`]=r)}}
async function loadDrills(){const {data}=await club().from("drills").select("*").eq("club",C.id).order("updated",{ascending:false});DRILLS=data||[]}
async function loadAdmins(){const {data}=await club().from("admins").select("*").eq("club",C.id).order("role",{ascending:false});ADMINS=data||[]}
async function loadAll(){busy=true;render();try{await loadTeams();await Promise.all([isAdmin()?loadReports():null,loadDrills(),isAdmin()?loadAdmins():null])}catch(e){toast("Couldn't load everything. Reload the page.")}busy=false;render()}
const key=r=>`${r.team.team_schema}|${r.kind}|${r.id}`;
const stOf=r=>(ST[key(r)]||{}).status||"new";

// ---------- copy text for Facebook, Instagram or WhatsApp ----------
function postText(r){const head=r.kind==="tour"?`🏆 ${r.team.name} at ${r.title}`:`⚽ ${r.team.name} ${r.title.replace(/ \((home|away)\)$/,"")}${r.score?` (${r.score})`:""}`;
  return `${head}\n\n${plain(r.report)}${r.potm?`\n\n🏅 Player of the match: ${r.potm}`:""}\n\nRead more: ${r.link}`}
function weekend(){// the most recent Saturday and Sunday with reports, as one round-up post
  const wk=REPORTS.filter(r=>r.date).map(r=>{const d=new Date(r.date+"T12:00:00"),dow=d.getDay(),sat=new Date(d);sat.setDate(d.getDate()-((dow+1)%7));return [r,sat.toISOString().slice(0,10)]});
  if(!wk.length)return null;const sat=wk.map(x=>x[1]).sort().pop(),list=wk.filter(x=>x[1]===sat).map(x=>x[0]).sort((a,b)=>a.team.sort-b.team.sort);
  const lines=list.map(r=>`${r.kind==="tour"?"🏆":"⚽"} ${r.team.name} ${r.kind==="tour"?"at "+r.title:r.title.replace(/ \((home|away)\)$/,"")}${r.score?` (${r.score})`:""}: ${plain(r.report).replace(/\s+/g," ").slice(0,220).replace(/\s+\S*$/,"")}…\n${r.link}`);
  return {sat,count:list.length,text:`Weekend round-up from ${C.short||C.name}: ${list.length} report${list.length===1?"":"s"} from our teams 💙\n\n${lines.join("\n\n")}`}}
async function copy(t){try{await navigator.clipboard.writeText(t);toast("Copied. Paste it into your post.")}catch(e){const a=document.createElement("textarea");a.value=t;document.body.appendChild(a);a.select();try{document.execCommand("copy");toast("Copied.")}catch(x){toast("Couldn't copy. Select the text and copy it.")}a.remove()}}

// ---------- views ----------
// links back to the club page and every team's site, shown to everyone (club.teams is public)
function topNav(){const el=$("#clubnav");if(!el)return;el.innerHTML=`<a href="../">🏠 Club home</a>${TEAMS.map(t=>/^https:\/\//.test(t.url||"")?`<a href="${esc(t.url)}">${esc(t.name)}</a>`:"").join("")}`}
function render(){topNav();const m=$("#main");if(!sb){m.innerHTML=`<div class="card">This page isn't connected to its database yet.</div>`;return}
  $("#who").innerHTML=me?`<span>${esc(me.email)}${role?` · ${role==="lead"?"Club lead":role==="admin"?"Club admin":"Coach"}`:""}</span><button class="mini" id="out">Sign out</button>`:"";
  if(!me){m.innerHTML=loginView();return}
  if(!role){m.innerHTML=`<div class="card">Checking…</div>`;return}
  const tabs=(isAdmin()?[["reports","📝 Reports"],["drills","📚 Drills"],["club","👥 Club"]]:[["drills","📚 Drills"]]);if(!tabs.some(t=>t[0]===tab))tab=tabs[0][0];
  m.innerHTML=`<nav class="tabs">${tabs.map(([k,l])=>`<button data-tab="${k}" aria-current="${tab===k?"page":"false"}">${l}</button>`).join("")}</nav>${busy?`<div class="card">Loading…</div>`:tab==="reports"?reportsView():tab==="drills"?drillsView():clubView()}`}
function loginView(){return `<form class="card stack" id="loginForm"><h2>Club admin sign in</h2><p class="hint">For the club lead and club admins. We'll email you a code (it can land in junk).</p>
  <label class="f">Email<input type="email" id="email" autocomplete="email" required></label><button class="btn">Email me a code</button></form>`}
function codeView(email){return `<form class="card stack" id="codeForm" data-email="${esc(email)}"><h2>Check your email</h2><p class="hint">Type the code we sent to <b>${esc(email)}</b>, or tap the link in the email.</p>
  <label class="f">Code<input type="text" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" style="font-size:1.4em;letter-spacing:.2em"></label>
  <div class="btns"><button class="btn">Sign in</button><button class="btn ghost" type="button" id="again">Use a different email</button></div></form>`}
function reportsView(){
  const counts={todo:0,posted:0,skipped:0,all:REPORTS.length};REPORTS.forEach(r=>{const s=stOf(r);if(s==="new"||s==="picked")counts.todo++;else counts[s]++});
  let list=REPORTS.filter(r=>(!teamF||r.team.team_schema===teamF)&&(filt==="all"||(filt==="todo"?["new","picked"].includes(stOf(r)):stOf(r)===filt)));
  const total=list.length;if(!more)list=list.slice(0,25);const wk=weekend();
  return `<section class="card stack"><h2>Match reports from every team</h2>
    <p class="hint" style="margin:0">Reports appear here as soon as a coach saves one on their team site. Copy one into Facebook, then mark it Posted so nobody posts it twice. ${TEAMS.some(t=>!t.show_scores)?"Scores are left out for teams that don't show them (FA rules for U7 to U11).":""}</p>
    <div class="btns"><div class="seg">${[["todo","To do"],["posted","Posted"],["skipped","Skipped"],["all","All"]].map(([k,l])=>`<button data-filt="${k}" aria-pressed="${filt===k}">${l} (${counts[k]})</button>`).join("")}</div>
      <select id="teamF" aria-label="Team"><option value="">Every team</option>${TEAMS.map(t=>`<option value="${esc(t.team_schema)}"${teamF===t.team_schema?" selected":""}>${esc(t.name)}</option>`).join("")}</select></div>
    ${wk?`<div class="note"><b>Weekend round-up</b>: ${wk.count} report${wk.count===1?"":"s"} from the weekend of ${esc(day(wk.sat))}. <button class="mini" id="roundup">Copy as one post</button></div>`:""}</section>
  ${list.length?list.map(reportCard).join(""):`<div class="card empty">${REPORTS.length?"Nothing here. Try another filter.":"No reports yet. They'll appear here when coaches write them."}</div>`}
  ${total>list.length?`<div class="btns"><button class="btn ghost" id="more">Show ${total-list.length} more</button></div>`:""}`}
function reportCard(r){const s=stOf(r),k=key(r),by=(ST[k]||{}).by_email;
  return `<article class="card stack rep"><div class="rephead"><span class="tag">${esc(r.team.name)}</span><span class="pill st-${s}">${STATUS[s][1]} ${STATUS[s][0]}</span></div>
    <h3>${r.kind==="tour"?"🏆 ":""}${esc(r.title)}</h3><p class="hint" style="margin:0">${esc(day(r.date))}${r.sub?` · ${esc(r.sub)}`:""}${by&&s!=="new"?` · marked by ${esc(by.split("@")[0])}`:""}</p>
    <details${s==="new"||s==="picked"?" open":""}><summary>Read the report</summary><div class="body">${paras(r.report)}</div></details>
    <div class="btns"><button class="btn gold" data-copy="${esc(k)}">📋 Copy for social media</button><a class="btn ghost" href="${esc(r.link)}" target="_blank" rel="noopener">Open on team site</a></div>
    <div class="btns"><span class="hint">Mark as</span><div class="seg">${Object.entries(STATUS).map(([v,[l]])=>`<button data-st="${v}" data-k="${esc(k)}" aria-pressed="${s===v}">${l}</button>`).join("")}</div></div></article>`}
const AGE=d=>d.age_from&&d.age_to?(d.age_from===d.age_to?`U${d.age_from}`:`U${d.age_from} to U${d.age_to}`):d.age_from?`U${d.age_from}+`:d.age_to?`Up to U${d.age_to}`:"All ages";
const pic=(d,cls)=>{const s=d.diagram&&d.diagram.svg;return typeof s==="string"&&/^<svg[\s>]/.test(s)?`<img class="${cls}" alt="Drill diagram" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}">`:""};
function drillsView(){const d=drOpen&&DRILLS.find(x=>x.id===drOpen);
  if(d)return `<section class="card stack"><div class="btns"><button class="mini" id="drBack">← All drills</button></div><h2>${esc(d.title)}</h2>
    <p class="hint" style="margin:0">${esc([AGE(d),d.players&&d.players+" players",d.minutes&&d.minutes+" min",(d.focus||[]).join(", ")].filter(Boolean).join(" · "))}</p>${pic(d,"drpic")}
    ${d.equipment?`<p><b>You'll need:</b> ${esc(d.equipment)}</p>`:""}${d.setup?`<h3>Set-up</h3>${paras(d.setup)}`:""}${d.points?`<h3>Coaching points</h3>${paras(d.points)}`:""}
    ${/^https:\/\//.test(d.video||"")?`<p><a href="${esc(d.video)}" target="_blank" rel="noopener">▶ Watch the video</a></p>`:""}
    <p class="hint">Added by ${esc(d.author_name||"a coach")}${d.author_team?` (${esc(d.author_team)})`:""}, ${esc(d.author_email)}.</p>
    ${isAdmin()||(me&&d.author_email===me.email)?`<div class="btns"><button class="btn ghost" data-drdel="${esc(d.id)}">Remove from the library</button></div>`:""}</section>`;
  return `<section class="card stack"><h2>Drills library</h2><p class="hint" style="margin:0">${DRILLS.length} drill${DRILLS.length===1?"":"s"} shared by the club's coaches. Coaches add drills on the Training page of their team site, where they can draw them on the tactics board.</p></section>
    ${DRILLS.length?`<div class="drlist">${DRILLS.map(d=>`<button class="card drrow" data-drill="${esc(d.id)}">${pic(d,"drthumb")||`<span class="drthumb drnone">📋</span>`}<span><b>${esc(d.title)}</b><span class="hint">${esc(AGE(d))}${(d.focus||[]).length?" · "+esc(d.focus.join(", ")):""}</span><span class="hint">${esc(d.author_name||"")}${d.author_team?" · "+esc(d.author_team):""}</span></span></button>`).join("")}</div>`:`<div class="card empty">No drills yet.</div>`}`}
function clubView(){const lead=role==="lead";
  return `<section class="card stack"><h2>Club admins</h2><p class="hint" style="margin:0">They sign in on this page. The club lead adds and removes them.</p>
    <div class="rows">${ADMINS.map(a=>`<div class="row"><span><b>${esc(a.name||a.email.split("@")[0])}</b> <span class="hint">${esc(a.email)}</span></span><span class="pill">${a.role==="lead"?"Club lead":"Club admin"}</span>${lead&&a.email!==me.email?`<button class="mini" data-rmadmin="${esc(a.email)}">Remove</button>`:""}</div>`).join("")}</div>
    ${lead?`<form class="btns" id="addAdmin"><input type="text" id="aName" placeholder="First name" maxlength="40" style="max-width:140px"><input type="email" id="aEmail" placeholder="Email" required style="flex:1;min-width:180px"><select id="aRole"><option value="admin">Club admin</option><option value="lead">Club lead</option></select><button class="btn">Add</button></form>`:""}</section>
  <section class="card stack"><h2>Teams</h2><p class="hint" style="margin:0">Teams with a Touchline Tales site. Scores only go into copied posts for teams set to show them (FA rules: not U7 to U11).</p>
    <div class="rows">${TEAMS.map(t=>`<div class="row"><span><b>${esc(t.name)}</b> <a class="hint" href="${esc(t.url)}" target="_blank" rel="noopener">site</a></span>${lead?`<label class="hint"><input type="checkbox" data-scores="${esc(t.team_schema)}"${t.show_scores?" checked":""}> Show scores</label>`:`<span class="hint">${t.show_scores?"Scores shown":"No scores"}</span>`}</div>`).join("")}</div></section>`}

// ---------- actions ----------
document.addEventListener("click",async e=>{const b=e.target.closest("button");if(!b)return;const d=b.dataset;
  if(b.id==="out"){await sb.auth.signOut();return}
  if(b.id==="again"){$("#main").innerHTML=loginView();return}
  if(d.tab){tab=d.tab;drOpen=null;render();return}
  if(d.filt){filt=d.filt;more=false;render();return}
  if(b.id==="more"){more=true;render();return}
  if(b.id==="roundup"){const w=weekend();if(w)copy(w.text);return}
  if(d.copy){const r=REPORTS.find(x=>key(x)===d.copy);if(!r)return;await copy(postText(r));if(stOf(r)==="new")await setStatus(r,"picked");return}
  if(d.st){const r=REPORTS.find(x=>key(x)===d.k);if(r)await setStatus(r,d.st);return}
  if(d.drill){drOpen=d.drill;render();scrollTo({top:0});return}
  if(b.id==="drBack"){drOpen=null;render();return}
  if(d.drdel){if(!confirm("Remove this drill from the club library?"))return;const {error}=await club().from("drills").delete().eq("id",d.drdel);if(error){toast("Couldn't remove it.");return}drOpen=null;await loadDrills();render();toast("Drill removed.");return}
  if(d.rmadmin){if(!confirm(`Remove ${d.rmadmin} as a club admin?`))return;const {error}=await club().from("admins").delete().eq("club",C.id).eq("email",d.rmadmin);if(error){toast("Couldn't remove them.");return}await loadAdmins();render();return}
});
async function setStatus(r,s){const k=key(r),row={club:C.id,team_schema:r.team.team_schema,kind:r.kind,item_id:r.id,status:s,by_email:me.email};
  const {error}=await club().from("report_status").upsert(row);if(error){toast("Couldn't save that. Try again.");return}ST[k]=Object.assign({},ST[k],row);render()}
document.addEventListener("change",async e=>{const t=e.target;
  if(t.id==="teamF"){teamF=t.value;more=false;render();return}
  if(t.dataset.scores){const {error}=await club().from("teams").update({show_scores:t.checked}).eq("club",C.id).eq("team_schema",t.dataset.scores);if(error){toast("Couldn't save that.");t.checked=!t.checked;return}await loadTeams();await loadReports();render();toast("Saved.")}});
document.addEventListener("submit",async e=>{e.preventDefault();const f=e.target;
  if(f.id==="loginForm"){const email=$("#email").value.trim().toLowerCase();if(!email)return;
    const {error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true,emailRedirectTo:location.origin+location.pathname}});
    if(error){toast(error.status===429?"Too many sign-in emails just now. Try again in a few minutes.":/database error|coach/i.test(error.message||"")?"That email isn't on the club admin list.":"Couldn't send the email. Try again.");return}
    $("#main").innerHTML=codeView(email);setTimeout(()=>{const i=$("#code");i&&i.focus()},50);return}
  if(f.id==="codeForm"){const token=($("#code").value||"").replace(/\D/g,"");if(token.length<6){toast("Type the code from the email.");return}
    const {error}=await sb.auth.verifyOtp({email:f.dataset.email,token,type:"email"});if(error)toast("That code didn't work. Use the newest email.");return}
  if(f.id==="addAdmin"){const email=$("#aEmail").value.trim().toLowerCase();if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){toast("Type a proper email.");return}
    const {error}=await club().from("admins").upsert({club:C.id,email,name:$("#aName").value.trim(),role:$("#aRole").value});if(error){toast("Couldn't add them.");return}
    await loadAdmins();render();toast("Added. They can sign in on this page now.")}});
async function whoAmI(){role=null;render();if(!me)return;
  const {data,error}=await club().rpc("my_role",{c:C.id});role=error?null:data;
  if(!role){await sb.auth.signOut();toast(error?"Couldn't check your access. Try again later.":"That email isn't on the club admin list.");return}
  await loadAll()}
(async function(){
  if(!window.supabase||!C.supabaseUrl){render();return}
  sb=window.supabase.createClient(C.supabaseUrl,C.supabaseAnonKey,{auth:{storageKey:"sb-club-"+C.id+"-auth-token"}});
  const {data:{session}}=await sb.auth.getSession();me=session?.user||null;
  sb.auth.onAuthStateChange((_e,s)=>{const u=s?.user||null;if((u&&u.id)!==(me&&me.id)){me=u;whoAmI()}});
  try{await loadTeams()}catch(e){}
  if(me)await whoAmI();else render();
})();
})();
