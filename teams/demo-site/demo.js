// Touchline Tales public demo (touchlinetales.club/demo/). There is no database: this file answers the site's
// Supabase calls from a made-up Sample Town Under 12s season that lives only in this browser tab. Visitors can
// try everything, coach view included, and nothing they do leaves their phone. Reloading keeps their changes
// for the tab; "Start again" in the demo bar wipes them.
// Loaded by index.html before supabase-js, so the client picks up the fetch below. tools/package_demo.py wires it in.
// Another demo team (the rugby ones) loads demo-season.js first: window.DEMO_DATA = {season, script, hiddenTeam, words} replaces
// the football season below, and its own made-up database address keeps each demo's data and coach sign-in apart.
(function(){
const DD=window.DEMO_DATA||{},SKEY=(window.TEAM&&TEAM.storageKey)||"tt-demo";
const URL0=(window.TEAM_CONFIG&&TEAM_CONFIG.supabaseUrl)||"https://demo.supabase.co",KEY=SKEY+"-db",FLAGS=SKEY+"-flags",TOKEN=`sb-${new URL(URL0).hostname.split(".")[0]}-auth-token`;
const COACH="coach@sampletown.example";
const ss={get(k){try{return JSON.parse(sessionStorage.getItem(k)||"null")}catch(e){return null}},
  set(k,v){try{sessionStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{sessionStorage.removeItem(k)}catch(e){}}};
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const flags=Object.assign({hidden:false},ss.get(FLAGS)||{});
// "See it as an under-9s team": FA rules for U7 to U11 hide scores and scorers from parents
if(flags.hidden&&window.TEAM)Object.assign(TEAM,DD.hiddenTeam||{publicScores:false,ageGroup:"Under 9s",ageShort:"U9s",appName:"Sample Town U9s",potm:Object.assign({},TEAM.potm,{ribbon:"STFC U9s"})});

// ---------- the made-up season, dated around today so there's always a game on ----------
const day=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return d.toLocaleDateString("en-CA")};
function season(){
  const P=[["Grace",1],["Rosie",2],["Poppy",3],["Isla",4],["Freya",5],["Millie",6],["Ella",7],["Ruby",8],["Ava",9],["Mia",10],["Harper",11],["Zara",12]];
  const names=P.map(p=>p[0]),players=P.map(([name,num])=>({id:name.toLowerCase(),name,num,current:true}));
  const XI=["Grace","Rosie","Isla","Ella","Mia","Ruby","Ava"],SUBS=names.filter(n=>!XI.includes(n)),F="2-3-1",HOME="Sample Town Recreation Ground";
  const M=o=>Object.assign({ha:"",venue:"",comp:"League",ko:"10:30",us:null,them:null,potm:null,played:{},assists:{},apps:true,notes:"",check_note:"",postponed:false,
    tournament_id:null,stage:"",quarters:{},gk:null,saves:null,keepers:{},halves:{},squad:null,live:null,report:null,preview:null},o);
  const id=(d,opp)=>d+"-"+opp.toLowerCase().replace(/[^a-z]+/g,"-");
  function res(ago,opp,ha,venue,comp,us,them,scorers,assists,potm){const date=day(-7*ago),played={},halves={};
    names.forEach(n=>{played[n]=scorers[n]||0;halves[n]=XI.includes(n)?2:1});
    return M({id:id(date,opp),date,opp,ha,venue,comp,us,them,potm,played,assists,keepers:{Grace:them===0?1:0},halves,squad:names})}
  const matches=[
    res(8,"Riverside Rovers","H",HOME,"Friendly",3,1,{Ava:2,Mia:1},{Mia:1,Ella:1},"Ava"),
    res(7,"Northfield Lions","A","Northfield Park","League",2,2,{Mia:1,Ruby:1},{Ava:1},"Freya"),
    res(6,"Ashford Town","H",HOME,"League",4,0,{Ava:1,Ella:1,Mia:1,Harper:1},{Ruby:2,Isla:1},"Ella"),
    res(5,"Oakwood Rangers","A","Oakwood Rec","League",1,2,{Ruby:1},{Mia:1},"Grace"),
    res(4,"Brookside Athletic","H",HOME,"League Cup",3,2,{Ava:1,Mia:2},{Ava:1,Ella:1,Ruby:1},"Mia"),
    res(3,"Hillcrest United","A","Hillcrest Fields","League",2,1,{Isla:1,Zara:1},{Ruby:1,Poppy:1},"Isla"),
    res(2,"Meadow Park","H",HOME,"League",5,1,{Ava:3,Ella:1,Millie:1},{Mia:3,Ruby:1,Rosie:1},"Ava"),
    res(1,"Riverside Rovers","A","Riverside Park","League",0,0,{},{},"Rosie")];
  const [meadow,last]=matches.slice(-2);
  last.report="A hard-earned point away at Riverside on a heavy pitch.\n\nWe started brightly and Ava hit the post inside ten minutes. Riverside pushed hard after the break, but Rosie and Isla were brilliant at the back and Grace made two great saves to keep the clean sheet.\n\nThe girls never stopped running. Well done all, and thanks to the parents for the support on a wet morning!";
  meadow.report="Our best performance of the season so far. Ava's hat-trick will get the headlines, but the passing in midfield was brilliant from start to finish.\n\nMillie scored her first goal for the club off the bench. Great to see everyone getting minutes.";
  meadow.live={locked:true,status:"ft",half:2,halfStart:null,halfLen:25,form:F,slots:XI,squad:names,mins:Object.fromEntries(names.map(n=>[n,XI.includes(n)?50:25])),events:[
    {k:"lu",form:F,line:XI,bench:SUBS,m:"",h:1,s:"0–0"},{k:"ko",form:F,line:XI,m:"1'",h:1,s:"0–0"},{k:"goal",n:"Ava",a:"Mia",m:"6'",h:1,s:"1–0"},
    {k:"goal",n:"Ella",a:"Ruby",m:"14'",h:1,s:"2–0"},{k:"them",m:"19'",h:1,s:"2–1"},{k:"goal",n:"Ava",a:"Mia",m:"23'",h:1,s:"3–1"},{k:"ht",m:"HT",h:1,s:"3–1"},
    {k:"2h",m:"26'",h:2,s:"3–1"},{k:"sub",on:"Millie",off:"Ruby",m:"31'",h:2,s:"3–1"},{k:"goal",n:"Millie",a:"Rosie",m:"38'",h:2,s:"4–1"},
    {k:"sub",on:"Zara",off:"Ella",m:"40'",h:2,s:"4–1"},{k:"goal",n:"Ava",a:"Mia",m:"46'",h:2,s:"5–1"},{k:"ft",m:"FT",h:2,s:"5–1"}]};
  // Today's game is in the second half, 1-1, when the visitor arrives; SCRIPT below plays the next few minutes out.
  const now=Date.now(),today=day(0),ko=new Date(now-(25+5+8)*60000),line=["Grace","Freya","Isla","Ella","Mia","Ruby","Ava"];
  const live=M({id:id(today,"Westgate Wanderers"),date:today,opp:"Westgate Wanderers",ha:"H",venue:HOME,comp:"League",
    ko:ko.toTimeString().slice(0,5),us:1,them:1,played:Object.fromEntries(names.filter(n=>n!=="Harper").map(n=>[n,n==="Ella"?1:0])),assists:{Isla:1},
    squad:names.filter(n=>n!=="Harper"),live:{locked:true,status:"live",half:2,halfStart:now-(8*60+20)*1000,halfLen:25,form:F,slots:line,
      squad:names.filter(n=>n!=="Harper"),mins:{},events:[{k:"lu",form:F,line:XI,bench:SUBS.filter(n=>n!=="Harper"),m:"",h:1,s:"0–0"},
        {k:"ko",form:F,line:XI,m:"1'",h:1,s:"0–0"},{k:"goal",n:"Ella",a:"Isla",m:"12'",h:1,s:"1–0"},{k:"them",m:"19'",h:1,s:"1–1"},
        {k:"sub",on:"Freya",off:"Rosie",m:"21'",h:1,s:"1–1"},{k:"ht",m:"HT",h:1,s:"1–1"},{k:"2h",m:"26'",h:2,s:"1–1"}]}});
  matches.push(live,
    M({id:id(day(7),"Ashford Town"),date:day(7),opp:"Ashford Town",ha:"A",venue:"Ashford Town 3G",comp:"League",ko:"11:00",
      preview:"Back-to-back league games against Ashford. We won 4-0 at home, so expect them to be up for this one. Meet at 10:15 at the 3G, green kit."}),
    M({id:id(day(14),"Northfield Lions"),date:day(14),opp:"Northfield Lions",ha:"H",venue:HOME,comp:"League Cup",ko:"10:00"}),
    M({id:id(day(21),"Meadow Park"),date:day(21),opp:"Meadow Park",ha:"A",venue:"Meadow Park Fields",comp:"League",ko:"10:30"}),
    M({id:id(day(28),"Oakwood Rangers"),date:day(28),opp:"Oakwood Rangers",ha:"H",venue:HOME,comp:"League",ko:"10:30"}));
  const next=matches.find(m=>m.date===day(7)).id,st={Poppy:"maybe",Harper:"no",Zara:"maybe"};
  const back=((new Date().getDay()+4)%7)||7,wed=[0,1,2,3].map(i=>day(-back-7*i));   // the last four Wednesday sessions
  return {players,matches,tournaments:[],
    honours:[{id:"h1",date:day(-150),title:"Under 11s Spring Cup",achievement:"Winners",notes:"Beat Meadow Park 2-1 in the final"},
      {id:"h2",date:day(-120),title:"Fair Play Award",achievement:"County Youth League",notes:"Voted for by the referees"}],
    training:[{id:1,day:"Wednesday",start:"18:00",finish:"19:15",venue:"Sample Town Recreation Ground, 3G pitch",kit:"Boots, shin pads, water bottle and a warm top",
      notes:"Please arrive 10 minutes early so we can start on time.",until:day(220),off:[],updated:new Date(now-864e5*20).toISOString()}],
    training_attendance:wed.flatMap((d,i)=>names.filter((n,j)=>(j+i)%5!==0).map(player=>({day:d,player}))),
    availability:names.map(player=>({match_id:next,player,status:st[player]||"yes"})),
    polls:[{id:"gotm-demo",kind:"gotm",title:"Goal of the month",options:["Ava v Meadow Park (6')","Ella v Meadow Park (14')","Millie v Meadow Park (38')","Ava v Meadow Park (46')"],
      closes:new Date(now+864e5*5).toISOString(),closed:false,created:new Date(now-864e5*2).toISOString()}],
    poll_votes:[["Ava",9],["Ella",4],["Millie",12],["Ava",6]].flatMap(([_,v],i)=>Array.from({length:v},(x,j)=>({poll_id:"gotm-demo",voter:"v"+i+"-"+j,choice:i}))),
    team_settings:[{id:1,settings:{},ready:true,updated:new Date(now-864e5*30).toISOString()}],
    team_signoff:[{id:1,welfare_name:"Club welfare officer",welfare_email:"",public_scores:!flags.hidden,welfare_agreed:true,terms_agreed:true,dpa_agreed:true,agreed_by:"Club secretary"}],
    parent_settings:[{id:1,required:false}],family_codes:players.map(p=>({player_id:p.id,code:p.name.slice(0,3).toUpperCase()+"123"})),parent_links:[],
    coaches:[{email:COACH}],badges:[],player_photos:[],match_photos:[],help_requests:[],post_log:[],
    page_views:Array.from({length:28},(_,i)=>{const d=27-i,wk=new Date(day(-d)).getDay(),v=(wk===0||wk===6)?40+((i*7)%25):8+((i*5)%12);return {day:day(-d),views:v,visitors:Math.round(v*.45)}})};
}
// what happens next in today's game, in seconds after the visitor first opens the demo
const SCRIPT=DD.script||[[30,{k:"goal",n:"Ava",a:"Mia"}],[75,{k:"sub",on:"Harper",off:"Ruby"}],[130,{k:"goal",n:"Mia",a:"Ella"}],[200,{k:"them"}],[260,{k:"sub",on:"Zara",off:"Isla"}]];

let DB=ss.get(KEY);
const makeSeason=()=>DD.season?DD.season(day,flags):season();
if(!DB||DB.made!==day(0)||Date.now()-DB.start>3*3600e3){DB={made:day(0),start:Date.now(),done:0,touched:false,t:makeSeason()};ss.set(KEY,DB)}
const T=DB.t,save=()=>ss.set(KEY,DB);
if(!T.family_codes){const t=makeSeason();["parent_settings","family_codes","parent_links"].forEach(k=>T[k]=t[k]);save()}   // a tab opened before parent login
function advanceLive(){
  const m=T.matches.find(x=>x.date===day(0)&&x.live&&x.live.status==="live");if(!m||DB.touched)return;
  const secs=(Date.now()-DB.start)/1000;
  while(DB.done<SCRIPT.length&&SCRIPT[DB.done][0]<=secs){
    const e=Object.assign({},SCRIPT[DB.done][1]),L=m.live,min=Math.min(L.halfLen*2,L.halfLen+Math.floor((DB.start+SCRIPT[DB.done][0]*1000-L.halfStart)/60000)+1);
    // rugby events carry the kind of score (t) and its points (p); a kick goes in matches.kicks
    if(e.k==="goal"&&e.t){m.us+=e.p||0;if(e.t==="try")m.played[e.n]=(m.played[e.n]||0)+1;else if(e.n){const k=(m.kicks=m.kicks||{})[e.n]=m.kicks[e.n]||{};k[e.t]=(k[e.t]||0)+1}}
    else if(e.k==="goal"){m.us++;m.played[e.n]=(m.played[e.n]||0)+1;if(e.a)m.assists[e.a]=(m.assists[e.a]||0)+1}
    if(e.k==="them")m.them+=e.p||1;
    if(e.k==="sub"){const i=L.slots.indexOf(e.off);if(i>=0)L.slots[i]=e.on;if(!(e.on in m.played))m.played[e.on]=0;if(!m.squad.includes(e.on))m.squad.push(e.on)}
    Object.assign(e,{m:min+"'",h:2,s:`${m.us}–${m.them}`});L.events.push(e);DB.done++}
  save();
}

// ---------- a little PostgREST: enough for the queries the site makes ----------
const KEYS={availability:["match_id","player"],player_photos:["player"],badges:["key"],training_attendance:["day","player"],poll_votes:["poll_id","voter"],
  coaches:["email"],page_views:["day"]};
const keyOf=t=>KEYS[t]||["id"];
const parse=v=>v==="null"?null:v==="true"?true:v==="false"?false:v;
function test(r,col,expr){const i=expr.indexOf(".");const op=expr.slice(0,i),raw=expr.slice(i+1),x=r[col];
  if(op==="eq")return String(x)===String(parse(raw));if(op==="neq")return String(x)!==String(parse(raw));
  if(op==="is")return raw==="null"?x==null:x===parse(raw);
  if(op==="in")return raw.replace(/^\(|\)$/g,"").split(",").map(s=>s.replace(/^"|"$/g,"")).includes(String(x));
  const a=isNaN(+x)?x:+x,b=isNaN(+raw)?raw:+raw;
  return op==="gt"?a>b:op==="gte"?a>=b:op==="lt"?a<b:op==="lte"?a<=b:true}
const RESERVED=new Set(["select","order","limit","offset","on_conflict","columns"]);
function rows(t,q){const f=[...q].filter(([k])=>!RESERVED.has(k));return (T[t]=T[t]||[]).filter(r=>f.every(([k,v])=>test(r,k,v)))}
function shape(list,q){let out=list.slice();const o=q.get("order");
  if(o)o.split(",").reverse().forEach(p=>{const [c,dir]=p.split(".");const s=dir==="desc"?-1:1;out.sort((a,b)=>a[c]==b[c]?0:(a[c]==null)?1:(b[c]==null)?-1:a[c]>b[c]?s:-s)});
  if(q.get("offset"))out=out.slice(+q.get("offset"));if(q.get("limit"))out=out.slice(0,+q.get("limit"));
  const sel=(q.get("select")||"*").split(",");if(!sel.includes("*"))out=out.map(r=>Object.fromEntries(sel.map(c=>[c,r[c]===undefined?null:r[c]])));
  return JSON.parse(JSON.stringify(out))}
let seq=1000;
function defaults(t,b){const r=Object.assign({},b);if(keyOf(t)[0]==="id"&&r.id==null)r.id=++seq;
  if(["polls","help_requests","match_photos","post_log"].includes(t)&&!r.created)r.created=new Date().toISOString();
  if(t==="post_log"&&!r.day)r.day=day(0);if(t==="help_requests"){r.status=r.status||"new";r.email=r.email||COACH}return r}
function upsert(t,b,keys){const L=T[t]=T[t]||[];const i=L.findIndex(r=>keys.every(k=>String(r[k])===String(b[k])));if(i>=0){Object.assign(L[i],b);return L[i]}L.push(b);return b}
const json=(body,status)=>new Response(status===204?null:JSON.stringify(body),{status:status||200,headers:{"Content-Type":"application/json"}});

function rest(t,meth,q,body,h){
  const one=(h.get("accept")||"").includes("vnd.pgrst.object"),prefer=h.get("prefer")||"";let out;
  if(meth==="GET"||meth==="HEAD"){if(t==="matches")advanceLive();out=shape(rows(t,q),q)}
  else if(meth==="POST"){const list=(Array.isArray(body)?body:[body]).map(b=>defaults(t,b)),keys=q.get("on_conflict")?q.get("on_conflict").split(","):keyOf(t);
    out=list.map(b=>prefer.includes("merge-duplicates")||prefer.includes("ignore-duplicates")?upsert(t,b,keys):((T[t]=T[t]||[]).push(b),b));
    if(t==="matches")DB.touched=true;out=shape(out,new URLSearchParams({select:q.get("select")||"*"}))}
  else if(meth==="PATCH"){out=rows(t,q);out.forEach(r=>Object.assign(r,body));if(t==="matches")DB.touched=true;out=shape(out,new URLSearchParams({select:q.get("select")||"*"}))}
  else if(meth==="DELETE"){const gone=rows(t,q);T[t]=(T[t]||[]).filter(r=>!gone.includes(r));out=gone}
  if(meth!=="GET")save();
  if(one){if(out.length!==1)return json({code:"PGRST116",message:"JSON object requested, multiple (or no) rows returned",details:"",hint:null},406);return json(out[0])}
  return json(out)}

// parent login: the demo has one phone, so parent_links is just the children this tab is signed in for
const kidIds=()=>isParent()?T.parent_links.map(l=>l.player_id).filter(id=>T.players.some(p=>p.id===id&&p.current)):[];
const kidNames=()=>kidIds().map(id=>T.players.find(p=>p.id===id).name);
const famKey=()=>{const k=kidIds().sort();return k.length?"family:"+k[0]:null};
const mustSignIn=()=>!isCoach()&&!!(T.parent_settings[0]||{}).required;
function newCode(){const abc="23456789ABCDEFGHJKMNPQRSTUVWXYZ";let c;do{c=Array.from({length:6},()=>abc[Math.floor(Math.random()*abc.length)]).join("")}while(T.family_codes.some(f=>f.code===c));return c}
function rpc(fn,a){
  switch(fn){
    case "my_children":return json(kidNames());
    case "link_family":{const c=String(a.p_code||"").replace(/[^a-z0-9]/gi,"").toUpperCase(),f=T.family_codes.find(x=>x.code===c),p=f&&T.players.find(x=>x.id===f.player_id&&x.current);
      if(!p)return json(null);if(!T.parent_links.some(l=>l.player_id===p.id))T.parent_links.push({player_id:p.id});save();return json(p.name)}
    case "unlink_family":T.parent_links=a.p_player==null?[]:T.parent_links.filter(l=>(T.players.find(p=>p.id===l.player_id)||{}).name!==a.p_player);save();return json(null);
    case "my_availability":return json(T.availability.filter(r=>kidNames().includes(r.player)));
    case "my_votes":return json(T.poll_votes.filter(v=>v.voter===famKey()).map(v=>({poll_id:v.poll_id,choice:v.choice})));
    case "new_family_code":{const f=T.family_codes.find(x=>x.player_id===a.p_player);const c=newCode();if(f)f.code=c;else T.family_codes.push({player_id:a.p_player,code:c});
      T.parent_links=T.parent_links.filter(l=>l.player_id!==a.p_player);save();return json(c)}
    case "family_overview":T.players.filter(p=>p.current&&!T.family_codes.some(f=>f.player_id===p.id)).forEach(p=>T.family_codes.push({player_id:p.id,code:newCode()}));save();
      return json(T.players.filter(p=>p.current).sort((x,y)=>(x.num||99)-(y.num||99)).map(p=>({player_id:p.id,player:p.name,num:p.num,code:T.family_codes.find(f=>f.player_id===p.id).code,phones:T.parent_links.some(l=>l.player_id===p.id)?1:0})));
    case "list_coaches":return json(T.coaches.map(c=>c.email));
    case "add_coach":upsert("coaches",{email:String(a.new_email||"").toLowerCase()},["email"]);save();return json(null);
    case "remove_coach":T.coaches=T.coaches.filter(c=>c.email!==String(a.old_email||"").toLowerCase());save();return json(null);
    case "set_availability":if(mustSignIn()&&!kidNames().includes(a.p_player))return json({message:"Sign in with your family code first"},400);upsert("availability",{match_id:a.p_match,player:a.p_player,status:a.p_status},["match_id","player"]);save();return json(null);
    case "cast_vote":if(mustSignIn()&&!famKey())return json({message:"Sign in with your family code to vote"},400);upsert("poll_votes",{poll_id:a.p_poll,voter:famKey()||a.p_voter,choice:a.p_choice},["poll_id","voter"]);save();return json(null);
    case "poll_totals":{const c={};(T.poll_votes||[]).filter(v=>v.poll_id===a.p_poll).forEach(v=>c[v.choice]=(c[v.choice]||0)+1);return json(Object.entries(c).map(([choice,votes])=>({choice:+choice,votes})))}
    default:return json(null)}  // log_view, push_subscribe and the rest: nothing to record in a demo
}

// anon: a parent's phone signed in with a family code (no email), otherwise the demo coach
function session(anon){const exp=Math.floor(Date.now()/1000)+86400*30,user=anon?{id:"00000000-0000-4000-8000-0000000000a1",aud:"authenticated",role:"authenticated",email:"",is_anonymous:true,
  app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}:{id:"00000000-0000-4000-8000-000000000001",aud:"authenticated",role:"authenticated",email:COACH,
  app_metadata:{provider:"email"},user_metadata:{},created_at:new Date().toISOString()};
  const b=o=>btoa(JSON.stringify(o)).replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
  return {access_token:b({alg:"HS256",typ:"JWT"})+"."+b(Object.assign({sub:user.id,exp,role:"authenticated",aud:"authenticated"},anon?{is_anonymous:true}:{email:COACH}))+".demo",token_type:"bearer",
    expires_in:86400*30,expires_at:exp,refresh_token:"demo",user}}
function coachOn(){ls.set(TOKEN,JSON.stringify(session()));location.href=location.pathname}
function coachOff(){ls.del(TOKEN);location.href=location.pathname}
const tok=()=>{try{return JSON.parse(ls.get(TOKEN)||"null")}catch(e){return null}};
const isCoach=()=>{const t=tok();return !!(t&&t.user&&!t.user.is_anonymous)},isParent=()=>{const t=tok();return !!(t&&t.user&&t.user.is_anonymous)};

function auth(path){
  if(path.endsWith("/otp")){setTimeout(coachOn,1200);return json({})}   // any email "signs in" as the demo coach
  if(path.endsWith("/signup"))return json(session(true));   // a parent typing a family code
  if(path.endsWith("/logout")){setTimeout(()=>{if(!isCoach())DEMO.paint()},50);return json(null,204)}
  if(path.endsWith("/token")){const s=session(isParent());ls.set(TOKEN,JSON.stringify(s));return json(s)}
  if(path.endsWith("/user"))return tok()?json(session(isParent()).user):json({message:"not signed in"},401);
  return json({})}

const realFetch=window.fetch.bind(window);
window.fetch=async function(input,init){
  const url=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  if(!url||!url.startsWith(URL0))return realFetch(input,init);
  init=init||{};const u=new URL(url),meth=(init.method||(input.method)||"GET").toUpperCase(),h=new Headers(init.headers||(input.headers)||{});
  let body=null;try{body=init.body?JSON.parse(init.body):null}catch(e){}
  await new Promise(r=>setTimeout(r,60));
  const p=u.pathname;let m;
  if((m=p.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)/)))return rpc(m[1],body||{});
  if((m=p.match(/^\/rest\/v1\/([a-z_0-9]+)/)))return rest(m[1],meth,u.searchParams,body,h);
  if(p.startsWith("/auth/v1"))return auth(p);
  if(p.startsWith("/functions/v1/fulltime"))return json({error:"FA Full-Time import isn't part of the demo. On your own site it pulls in your fixtures for you."});
  if(p.startsWith("/functions/v1/"))return json({});   // notify and preview: the preview button writes its own draft instead
  if(p.startsWith("/storage/v1/object/list"))return json([]);
  if(p.startsWith("/storage/v1/"))return json({Key:p});
  return json({},404)};

// ---------- the demo bar ----------
const css=`.ttdemo{background:#0E2A1D;color:#F6F3EA;font:500 13px/1.35 Rubik,Archivo,system-ui,sans-serif;padding:8px 12px;position:relative;z-index:50}
.ttdemo .in{max-width:980px;margin:0 auto;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;justify-content:space-between}
.ttdemo b{font-family:Oswald,Archivo,sans-serif;letter-spacing:.06em;color:#F2C230;margin-right:6px}
.ttdemo .acts{display:flex;flex-wrap:wrap;gap:6px}
.ttdemo button,.ttdemo a{font:600 12px/1 Rubik,Archivo,system-ui,sans-serif;border-radius:999px;padding:6px 10px;border:1px solid rgba(246,243,234,.35);background:transparent;color:#F6F3EA;cursor:pointer;text-decoration:none;white-space:nowrap}
.ttdemo .go{background:#F2C230;border-color:#F2C230;color:#0E2A1D}
.ttdemo .tip{flex-basis:100%;color:#BFE3CC;font-size:12px}
.ttlead{position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:440px;margin:0 auto;background:#F6F3EA;color:#0E2A1D;border-top:5px solid #F2C230;border-radius:14px;
  padding:16px 16px 12px;box-shadow:0 12px 40px rgba(14,42,29,.35);font:400 14px/1.4 Rubik,Archivo,system-ui,sans-serif}
.ttlead h3{font:700 18px/1.2 Oswald,Archivo,sans-serif;text-transform:uppercase;margin:0 28px 4px 0;padding:0;border:0;background:none;color:#0E2A1D}
.ttlead h3::before,.ttlead h3::after{content:none;display:none}
.ttlead p{margin:0 0 10px}
.ttlead input{display:block;width:100%;box-sizing:border-box;font:16px/1.3 Rubik,system-ui,sans-serif;border:1.5px solid #cfcab9;border-radius:10px;padding:9px 11px;margin:0 0 8px;background:#fff;color:#0E2A1D}
.ttlead input.bad{border-color:#C0392B}
.ttlead label.tk{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;margin:2px 0 10px}
.ttlead label.tk input{width:18px;height:18px;flex:none;margin:1px 0 0;accent-color:#13804A}
.ttlead .send{width:100%;font:600 15px/1 Rubik,system-ui,sans-serif;border:0;border-radius:999px;padding:12px;background:#13804A;color:#fff;cursor:pointer}
.ttlead .x{position:absolute;top:8px;right:10px;border:0;background:none;font-size:24px;line-height:1;color:#3E4F45;cursor:pointer;padding:4px}
.ttlead .msg{min-height:1.2em;margin:8px 0 0;font-size:13px}
.ttlead a{color:#13804A}`;
const WD=Object.assign({ageBtn:"U7–U11 view",coachTip:"You're a coach now. Open today's game and tap ▶ Live match to record goals and subs, or make a matchday graphic.",
  hiddenTip:"For under 7s to under 11s, parents see games, line-ups and awards but no scores or scorers (FA rules). Coaches still see everything.",
  tip:"Today's game is live. Tap the red bar to follow it like a parent would. To try parent sign-in, open Parents and type Ava's family code, AVA-123."},DD.words||{});
window.DEMO={paint(){
  const el=document.getElementById("ttdemo");if(!el)return;const c=isCoach();
  el.innerHTML=`<div class="in"><span><b>DEMO</b>A made-up team. Try anything: nothing you do is saved or seen by anyone else.</span>
    <span class="acts"><button class="go" data-demo="${c?"parent":"coach"}">${c?"Parents' view":"Try the coach view"}</button>
    <button data-demo="age">${flags.hidden?"Show scores":WD.ageBtn}</button>
    <button data-demo="reset">Start again</button><a href="../${REF?"?ref="+encodeURIComponent(REF):""}#signup">Get your own</a></span>
    <span class="tip">${c?WD.coachTip:flags.hidden?WD.hiddenTip:WD.tip}</span></div>`}};
// ---------- follow-up: after a couple of minutes, ask (once) who they are, unless the home page already did ----------
// Sent to the Touchline Tales inbox by FormSubmit, the same as the home page sign-up form (FORM_ID in assets/home.js there).
const FORM="https://formsubmit.co/ajax/5f26f2b94f7b8df49f80d9aced927305",LEAD="tt-lead",ASKED="tt-demo-asked";
const REF=(new URLSearchParams(location.search).get("ref")||ss.get("tt-demo-ref")||"").slice(0,40);if(REF)ss.set("tt-demo-ref",REF);   // kept through the demo bar's reloads
function askLater(){
  if(ls.get(LEAD)==="sent"||ss.get(ASKED))return;
  setTimeout(()=>{if(ls.get(LEAD)==="sent"||ss.get(ASKED)||document.querySelector(".ttlead"))return;showLead()},120000)}
function showLead(){
  ss.set(ASKED,1);const el=document.createElement("form");el.className="ttlead";el.noValidate=true;el.setAttribute("aria-label","Get in touch");
  el.innerHTML=`<button type="button" class="x" aria-label="Not now">×</button><h3>Want this for your team?</h3>
    <p>Leave your details and we'll be in touch to answer questions and get you set up. Free for founding teams.</p>
    <input name="name" placeholder="Your name" autocomplete="name" required><input name="email" type="email" placeholder="Your email" autocomplete="email" required>
    <input name="club" placeholder="Club and team, e.g. Sample Town U10s" required>
    <label class="tk"><input type="checkbox" name="consent" required><span>It's fine to contact me about Touchline Tales (<a href="../privacy/" target="_blank" rel="noopener">privacy</a>).</span></label>
    <button class="send">Send</button><p class="msg" role="status" aria-live="polite"></p>`;
  document.body.appendChild(el);
  el.querySelector(".x").onclick=()=>el.remove();
  el.addEventListener("input",e=>e.target.classList.remove("bad"));
  el.addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(el),msg=el.querySelector(".msg");
    const bad=[...el.querySelectorAll("[required]")].filter(x=>!x.checkValidity());bad.forEach(x=>x.classList.add("bad"));
    if(bad.length){msg.textContent=bad.length===1&&bad[0].type==="checkbox"?"Please tick the box so we can get back to you.":"Please fill in the highlighted boxes.";return}
    const b=el.querySelector(".send");b.disabled=true;msg.textContent="Sending…";
    try{const r=await realFetch(FORM,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({
        "Name":f.get("name").trim(),"Email":f.get("email").trim(),"Club and team":f.get("club").trim(),"Where":"While using the demo","Link used":REF,
        _subject:`Touchline Tales demo: ${f.get("club").trim()}`,_replyto:f.get("email").trim(),_template:"table",_captcha:"false"})});
      const out=await r.json().catch(()=>({}));if(!r.ok||String(out.success)!=="true")throw 0;
      ls.set(LEAD,"sent");el.innerHTML=`<h3>Thanks, ${esc(f.get("name").trim().split(" ")[0])}!</h3><p>We'll be in touch soon. Carry on looking around.</p>`;setTimeout(()=>el.remove(),5000)}
    catch(x){b.disabled=false;msg.textContent="Sorry, that didn't send. Please try again in a minute."}});
}
const esc=t=>String(t).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
function mount(){
  const st=document.createElement("style");st.textContent=css;document.head.appendChild(st);
  const el=document.createElement("div");el.id="ttdemo";el.className="ttdemo";el.setAttribute("role","note");document.body.prepend(el);DEMO.paint();
  el.addEventListener("click",e=>{const b=e.target.closest("[data-demo]");if(!b)return;const k=b.dataset.demo;
    if(k==="coach")coachOn();if(k==="parent")coachOff();
    if(k==="age"){flags.hidden=!flags.hidden;ss.set(FLAGS,flags);ss.del(KEY);ls.del((TEAM.storageKey||"team")+".setup");location.href=location.pathname}
    if(k==="reset"){ss.del(KEY);ss.del(FLAGS);ls.del(TOKEN);ls.del((TEAM.storageKey||"team")+".setup");location.href=location.pathname}});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount);else mount();
askLater();
})();
