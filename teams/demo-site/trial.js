// Touchline Tales instant trial (touchlinetales.club/try/): a coach types their team name and email (on the home page,
// or on this page's own start card) and gets a working site in their team's name straight away. They can add players
// and fixtures, run a live match and try everything a coach can, before anyone sets anything up for them.
//
// It's the demo underneath (demo.js, no database): everything they add stays in this browser, on this phone, and nobody
// else can see it. Only the start (team name, email, sport) and "Make it my real site" (team details, fixtures and how
// many players, never the players' names) are sent to Touchline Tales, through /assets/signup-send.js like every sign-up.
// Built by: python3 tools/package_demo.py --trial --to ../touchlinetales-sites/try
// Loaded before demo.js: it sets window.DEMO_DATA (an empty season in the team's name) and window.TEAM_SETUP.
(function(){
const T=window.TEAM=window.TEAM||{},SK=T.storageKey||"tt-trial",INFO="tt-trial",DBKEY=SK+"-db",SETUP=SK+".setup";
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const J=k=>{try{return JSON.parse(ls.get(k)||"null")}catch(e){return null}};
const esc=t=>String(t==null?"":t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const count=(n,t,p)=>{try{window.ttCount&&window.ttCount(n,t,Object.assign({page:location.pathname},p||{}))}catch(e){}};
const q=new URLSearchParams(location.search),REF=(q.get("ref")||"").slice(0,40);
let info=J(INFO);
if(info&&!(info.team&&info.email&&info.at))info=null;
const who=info||{team:"Your team",email:"coach@example.com",at:"none"};   // before they've started: a blank site behind the start card

// "Sample Town U10s Blues" -> name "Sample Town Blues", Under 10s. The age goes in its own box on the site.
function parse(team){const s=String(team).replace(/\s+/g," ").trim().slice(0,60),m=/\b(?:u|under)[\s-]*(\d{1,2})s?\b/i.exec(s),n=m?+m[1]:0;
  const name=(m?(s.slice(0,m.index)+" "+s.slice(m.index+m[0].length)):s).replace(/\s+/g," ").replace(/^[\s,.\-–]+|[\s,.\-–]+$/g,"").trim()||s;
  return {name,n,age:n?`Under ${n}s`:"",short:n?`U${n}s`:""}}
const initials=s=>s.split(/\s+/).filter(w=>/^[A-Za-z]/.test(w)).map(w=>w[0]).join("").toUpperCase().slice(0,4)||"TEAM";
// a plain shield with the team's initials until the coach adds their own badge on Team setup
const crest=(ab,c)=>"data:image/svg+xml,"+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><path d="M120 10 214 40v72c0 60-40 98-94 118C66 210 26 172 26 112V40z" fill="${c}" stroke="#F2C230" stroke-width="10"/><text x="120" y="${ab.length>3?140:146}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${ab.length>3?54:ab.length>2?66:80}" text-anchor="middle" fill="#fff">${ab.replace(/[^A-Z]/g,"")}</text></svg>`);
function settings(i){const p=parse(i.team),ab=initials(p.name),sport=["football","rugby-union","rugby-league"].includes(i.sport)?i.sport:"football",rugby=sport!=="football";
  const fmt=rugby?null:p.n&&p.n<=8?"5v5":p.n&&p.n<=10?"7v7":p.n&&p.n<=12?"9v9":p.n?"11v11":"7v7";
  const young=p.n>=7&&p.n<=(rugby?12:11),app=`${ab} ${p.short}`.trim();
  return {sport,name:p.name,shortName:p.name,fullName:p.name,abbr:ab,ageGroup:p.age,ageShort:p.short,players:"players",tagline:"",appName:app,
    league:"",format:fmt,halfLength:rugby?20:(p.n&&p.n<=8?20:25),publicScores:!young,supportName:"Touchline Tales",hashtags:"",shortHashtags:"",cheer:"💚💛",
    colours:{club:"#13804A",clubDeep:"#0A5A2D",clubInk:"#FFFFFF",gold:"#F2C230",goldInk:"#1A1A1A",accent:"#BFE3CC",accentDeep:"#13804A"},
    kits:{home:{label:"Home",body:"#13804A",trim:"#F2C230",ink:"#FFFFFF",band:"#F2C230",bandInk:"#111111"}},
    crest:crest(ab,"#13804A"),sponsor:null,kitSponsor:null,captain:"",potm:{sponsor:"",logo:"",icon:"🏆",ribbon:app.toUpperCase()}}}

// Their own team, with nothing in it yet: no players, no fixtures. Team setup is waiting for them, the way a real new site starts.
function season(){const now=new Date().toISOString(),row=J(SETUP);
  return {players:[],matches:[],tournaments:[],honours:[],training:[],training_attendance:[],availability:[],polls:[],poll_votes:[],
    team_settings:[{id:1,settings:(row&&row.settings)||settings(who),ready:false,updated:(row&&row.updated)||now}],team_signoff:[],
    parent_settings:[{id:1,required:false}],family_codes:[],parent_links:[],coaches:[{email:who.email.toLowerCase()}],badges:[],player_photos:[],match_photos:[],
    help_requests:[],post_log:[],page_views:[],cheer_settings:[{id:1,muted:false}],cheers:[],sponsors:[],fundraisers:[],fund_squares:[],player_ratings:[],
    player_kit:[],player_of_month:[],player_birthdays:[]}}

if(info){
  // a new trial (or a different team typed in on the home page): start this phone's copy afresh in that team's name
  const row=J(SETUP);
  if(!row||row.trial!==info.at){const r={settings:settings(info),ready:false,updated:new Date().toISOString(),trial:info.at};
    ls.set(SETUP,JSON.stringify(r));ls.del(DBKEY);try{sessionStorage.removeItem(DBKEY);sessionStorage.setItem(SETUP,r.updated)}catch(e){}
    Object.assign(T,r.settings);window.TEAM_SETUP=r;window.SETUP_WAIT=false}
  else{try{if(!sessionStorage.getItem(SETUP))sessionStorage.setItem(SETUP,String(row.updated))}catch(e){}window.SETUP_WAIT=false}
}else{Object.assign(T,{name:"Your team",shortName:"Your team",fullName:"Your team",ageGroup:"",appName:"Your team"});window.SETUP_WAIT=false}

window.DEMO_DATA={season,script:[],
  hiddenTeam:{publicScores:false},
  words:{coachTip:"This is your team's site. Start on Team setup (your badge, colours and players), then add a fixture and try ▶ Live match.",
    tip:"This is what your parents will see. Switch back to the coach view to add players and fixtures."},
  trial:info?{team:info.team,email:info.email,at:info.at,keep}:{start:true,email:who.email,at:who.at}};

// ---------- starting a trial: the same few boxes as the home page, for anyone who lands here first ----------
// Shared with the home page (assets/home.js there does the same): save the lead first, then open the site.
async function begin(team,email,sport,where){
  const payload={"Team":team,"Email":email,"Sport":{"football":"Football","rugby-union":"Rugby union","rugby-league":"Rugby league"}[sport]||"Football","Where":where,"Link used":REF,
    _subject:`Touchline Tales trial started: ${team}`,_replyto:email,_template:"table",_captcha:"false"};
  if(!REF)delete payload["Link used"];
  let id=null;try{const r=window.ttSendSignup?await window.ttSendSignup("trial",payload):null;id=r&&r.id}catch(e){}
  ls.set(INFO,JSON.stringify({team,email,sport,at:new Date().toISOString(),lead:id,ref:REF}));ls.set("tt-lead","sent");
  count("trial-started","Trial site started",{where:"try-page",sport});location.replace(location.pathname+(REF?"?ref="+encodeURIComponent(REF):""))}

function startCard(){
  const el=document.createElement("div");el.className="tttrial-gate";el.innerHTML=`<form class="ttlead tttrial" novalidate aria-label="Start your trial">
    <h3>Try it with your team</h3><p>Type your team's name and your email, and your team's own site opens straight away. Add your players and fixtures and try a live match. No card, nothing to download.</p>
    <input name="team" placeholder="Team name, e.g. Sample Town U10s Blues" autocomplete="organization" required maxlength="60">
    <input name="email" type="email" placeholder="Your email" autocomplete="email" required>
    <select name="sport" aria-label="Sport"><option value="football">Football</option><option value="rugby-union">Rugby union</option><option value="rugby-league">Rugby league</option></select>
    <button class="send">Open my team's site</button>
    <p class="msg" role="status" aria-live="polite"></p>
    <p class="small">What you add stays on your phone. We'll only use your email about your trial (<a href="../privacy/" target="_blank" rel="noopener">privacy</a>). <a href="../demo/">Just looking? See the demo team</a>.</p></form>`;
  document.body.appendChild(el);const f=el.querySelector("form"),msg=f.querySelector(".msg");
  f.addEventListener("input",e=>e.target.classList.remove("bad"));
  f.addEventListener("submit",async e=>{e.preventDefault();
    const bad=[...f.querySelectorAll("[required]")].filter(x=>!x.value.trim()||!x.checkValidity());bad.forEach(x=>x.classList.add("bad"));
    if(bad.length){msg.textContent="Please fill in the highlighted boxes.";bad[0].focus();return}
    const b=f.querySelector(".send");b.disabled=true;msg.textContent="Opening your site…";
    await begin(f.team.value.trim().slice(0,60),f.email.value.trim(),f.sport.value,"Trial page")});
  setTimeout(()=>f.team.focus(),50)}

// ---------- "Make it my real site": tell us, then pay (where paying at sign-up is switched on) ----------
function keep(DB){
  if(document.querySelector(".tttrial-keep"))return;
  const players=(DB.players||[]).filter(p=>p.current!==false),games=(DB.matches||[]).filter(m=>!m.tournament_id).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const row=((DB.team_settings||[])[0])||{},st=Object.assign({},row.settings||{});
  const el=document.createElement("form");el.className="ttlead tttrial-keep";el.noValidate=true;el.setAttribute("aria-label","Make it my real site");
  el.innerHTML=`<button type="button" class="x" aria-label="Close">×</button><h3>Make it your real site</h3>
    <p>We'll set ${esc(st.name||info.team)} up on its own web address, ready to share with your parents. Your first month is free, then it's £5 a month per team. Free setup, no contract, cancel anytime. If you're a club, the next five clubs to join are free for life: just say so below.</p>
    <p class="small">So far you've added ${players.length} player${players.length===1?"":"s"} and ${games.length} fixture${games.length===1?"":"s"}. We'll copy your team details and fixtures across. Players' names stay on your phone: you add them on your real site (paste the list, it takes a minute).</p>
    <input name="phone" type="tel" placeholder="Mobile, if you'd like a call (optional)" autocomplete="tel">
    <label class="tk"><input type="checkbox" name="club"><span>We're a club with more than one team, and we'd like one of the free-for-life places</span></label>
    <button class="send">Yes, make it my real site</button><p class="msg" role="status" aria-live="polite"></p>`;
  document.body.appendChild(el);el.querySelector(".x").onclick=()=>el.remove();
  el.addEventListener("submit",async e=>{e.preventDefault();const b=el.querySelector(".send"),msg=el.querySelector(".msg");b.disabled=true;msg.textContent="Sending…";
    const line=m=>[m.date,m.ko||"",(m.ha==="A"?"away at ":m.ha==="H"?"home v ":"v ")+(m.opp||""),m.venue?"("+m.venue+")":"",m.comp||""].filter(Boolean).join(" ");
    const payload={"Team":info.team,"Email":info.email,"Mobile":el.phone.value.trim().slice(0,30),"Wants a free-for-life club place":el.club.checked?"Yes":"","Team name on site":st.name||"","Age group":st.ageGroup||"","Sport":st.sport||"football",
      "Format":st.format||"","League":st.league||"","Colours":st.colours?[st.colours.club,st.colours.gold].join(" / "):"","Players added":String(players.length),
      "Fixtures added":String(games.length),"Fixtures":games.slice(0,40).map(line).join("\n"),"Team setup finished":row.ready?"Yes":"Not yet","Trial started":info.at,"Link used":info.ref||REF,
      _subject:`Touchline Tales trial: make it real: ${info.team}`,_replyto:info.email,_template:"table",_captcha:"false"};
    Object.keys(payload).forEach(k=>{if(payload[k]==="")delete payload[k]});
    let r=null;try{r=window.ttSendSignup?await window.ttSendSignup("trial-keep",payload):null}catch(x){}
    if(!r||!r.ok){b.disabled=false;msg.innerHTML=`Sorry, that didn't send. Try again, or email <a href="mailto:hello@touchlinetales.club?subject=${encodeURIComponent("Make it real: "+info.team)}">hello@touchlinetales.club</a>.`;return}
    count("trial-keep","Trial: make it my real site",{players:String(players.length),fixtures:String(games.length)});
    const pay=window.ttPay,club=[info.team,st.fullName,st.name].join(" ");
    el.innerHTML=`<button type="button" class="x" aria-label="Close">×</button>`;el.querySelector(".x").onclick=()=>el.remove();
    const h=document.createElement("h3"),p=document.createElement("p");el.append(h,p);
    if(pay&&pay.isFree(club)){h.textContent="Thanks! It's free for your club";p.textContent=`Newton Aycliffe and Washington Athletic teams don't pay. We'll email ${info.email} within a day to get your real site live.`;return}
    if(el.club&&el.club.checked||payload["Wants a free-for-life club place"]){h.textContent="Thanks! We'll be in touch about your club";p.textContent=`The next five clubs to join are free for life, for every team. We'll email ${info.email} within a day to check your place and get your real site live.`;return}
    if(pay&&pay.on){h.textContent="Last step: start your team plan";p.textContent="Your first month is free, then £5 a month per team, by card or Direct Debit. Nothing is taken until the free month ends, and you can cancel any time. We'll have your real site ready within a few days.";
      const a=document.createElement("a");a.className="send";a.style.cssText="display:block;text-align:center;text-decoration:none;box-sizing:border-box";a.href=pay.url(r.id,info.email);a.textContent="Start my free month";
      a.addEventListener("click",()=>count("pay-click","Pay button tapped",{where:"trial"}));
      const s=document.createElement("p");s.className="small";s.textContent=pay.test?"Test mode: use card 4242 4242 4242 4242, any future date, any CVC.":"Payments are handled by Stripe. Rather chat first? Close this and we'll be in touch.";
      el.append(a,s);count("pay-shown","Pay step shown",{where:"trial"});return}
    h.textContent="Thanks! We're on it";p.textContent=`We'll email ${info.email} within a day to get your real site live. Carry on adding to this one in the meantime.`});
}

const css=`.tttrial-gate{position:fixed;inset:0;z-index:9998;background:rgba(14,42,29,.72);display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto}
.tttrial-gate .ttlead{position:relative;left:auto;right:auto;bottom:auto;width:100%}
.ttlead select{display:block;width:100%;box-sizing:border-box;font:16px/1.3 Rubik,system-ui,sans-serif;border:1.5px solid #cfcab9;border-radius:10px;padding:9px 11px;margin:0 0 8px;background:#fff;color:#0E2A1D}
.ttlead .small{font-size:12.5px;color:#3E4F45;margin:8px 0 0}
.ttlead .bad{border-color:#C0392B}`;
function mount(){const s=document.createElement("style");s.textContent=css;document.head.appendChild(s);if(!info)startCard()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
})();
