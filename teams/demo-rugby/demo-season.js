// The made-up Sample Town rugby season for the rugby demos (touchlinetales.club/demo-rugby/ and /demo-rugby-league/).
// Loaded before demo.js, which answers the site's database calls from it. One season serves both codes: team.js says
// which (TEAM.sport), and the points, team size and positions follow from that. Every name here is made up.
(function(){
const LEAGUE=window.TEAM&&TEAM.sport==="rugby-league";
const P=LEAGUE?{try:4,con:2,pen:2,drop:1,pt:4}:{try:5,con:2,pen:3,drop:3,pt:7};
// shirt order: union 1-15 (props, hooker, locks, back row, half-backs, centres, wings, full-back), league 1-13 (full-back first)
const XV=LEAGUE?["Max","Arlo","Henry","Charlie","Freddie","George","Alfie","Harry","Oscar","Leo","Archie","Theo","Noah"]
  :["Harry","Oscar","Leo","Archie","Theo","Jack","Finley","Noah","Alfie","George","Freddie","Charlie","Henry","Arlo","Max"];
const BENCH=LEAGUE?["Jack","Finley","Reuben","Toby"]:["Reuben","Ollie","Toby","Ethan","Jude"];
const names=XV.concat(BENCH),FORM="Positions",HOME="Sample Town Sports Ground";

function season(day,flags){
  const now=Date.now(),players=names.map((name,i)=>({id:name.toLowerCase(),name,num:i+1,current:true}));
  const M=o=>Object.assign({ha:"",venue:"",comp:"League",ko:"10:30",us:null,them:null,potm:null,played:{},assists:{},kicks:{},apps:true,notes:"",check_note:"",postponed:false,
    tournament_id:null,stage:"",quarters:{},gk:null,saves:null,keepers:{},halves:{},squad:null,live:null,report:null,preview:null},o);
  const id=(d,opp)=>d+"-"+opp.toLowerCase().replace(/[^a-z]+/g,"-");
  const pts=(tries,kicks)=>Object.values(tries).reduce((a,n)=>a+n*P.try,0)+Object.values(kicks).reduce((a,k)=>a+["con","pen","drop"].reduce((b,t)=>b+(k[t]||0)*P[t],0),0);
  // them = [tries, conversions, penalty goals]
  function res(ago,opp,ha,venue,comp,tries,kicks,them,potm){const date=day(-7*ago),played={},halves={};
    names.forEach(n=>{played[n]=tries[n]||0;halves[n]=XV.includes(n)?2:1});
    return M({id:id(date,opp),date,opp,ha,venue,comp,us:pts(tries,kicks),them:them[0]*P.try+them[1]*P.con+them[2]*P.pen,potm,played,kicks,halves,squad:names})}
  // a game told as live events: the score, tries and kicks all come from the events
  function told(list){let us=0,them=0;const played=Object.fromEntries(names.map(n=>[n,0])),kicks={},events=[];
    for(const [mn,h,e] of list){
      if(e.k==="goal"){us+=e.p=P[e.t];e.na=1;if(e.t==="try")played[e.n]++;else if(e.n){const k=kicks[e.n]=kicks[e.n]||{};k[e.t]=(k[e.t]||0)+1}}
      if(e.k==="them")them+=e.p=P[e.t];
      events.push(Object.assign(e,{m:mn,h,s:`${us}–${them}`}))}
    return {us,them,played,kicks,events}}
  const matches=[
    res(8,"Riverside","H",HOME,"Friendly",{Arlo:2,Noah:1},{George:{con:2}},[2,1,0],"Arlo"),
    res(7,"Northfield","A","Northfield Park","League",{Max:1,Jack:1},{George:{con:1,pen:2}},[3,2,0],"Jack"),
    res(6,"Ashford","H",HOME,"League",{Freddie:2,Charlie:1,Alfie:1,Theo:1},{George:{con:4}},[0,0,1],"Freddie"),
    res(5,"Oakwood","A","Oakwood Rec","League",{Henry:1},{George:{pen:1}},[2,1,1],"Harry"),
    res(4,"Brookside","H",HOME,"County Cup",{Arlo:1,Noah:2},{George:{con:2,drop:1}},[3,1,0],"Noah"),
    res(3,"Hillcrest","A","Hillcrest Fields","League",{Max:1,Oscar:1},{George:{con:1},Alfie:{pen:1}},[1,1,1],"Oscar")];
  // two weeks ago, told minute by minute so the full-time story shows how it went
  const g=told([["",1,{k:"lu",form:FORM,line:XV,bench:BENCH}],["1'",1,{k:"ko",form:FORM,line:XV}],
    ["6'",1,{k:"goal",t:"try",n:"Arlo"}],["7'",1,{k:"goal",t:"con",n:"George"}],["14'",1,{k:"them",t:"pen"}],
    ["19'",1,{k:"goal",t:"try",n:"Noah"}],["23'",1,{k:"goal",t:"pen",n:"George"}],["HT",1,{k:"ht"}],["26'",2,{k:"2h"}],
    ["31'",2,{k:"sub",on:BENCH[0],off:XV[0]}],["34'",2,{k:"them",t:"try"}],["38'",2,{k:"goal",t:"try",n:BENCH[0]}],["39'",2,{k:"goal",t:"con",n:"George"}],
    ["42'",2,{k:"sub",on:BENCH[1],off:XV[5]}],["47'",2,{k:"goal",t:"try",n:"Arlo"}],["FT",2,{k:"ft"}]]);
  const meadow=M({id:id(day(-14),"Meadow Park"),date:day(-14),opp:"Meadow Park",ha:"H",venue:HOME,comp:"League",us:g.us,them:g.them,potm:"Arlo",played:g.played,kicks:g.kicks,
    halves:Object.fromEntries(names.map(n=>[n,XV.includes(n)?2:1])),squad:names,
    live:{locked:true,status:"ft",half:2,halfStart:null,halfLen:TEAM.halfLength,form:FORM,slots:XV,squad:names,mins:{},events:g.events},
    report:`Our best performance of the season so far. Arlo's two tries will get the headlines, but the forwards won every scrum and the defence hardly missed a tackle.\n\n${BENCH[0]} scored his first try for the club off the bench. Great to see everyone getting a run out.`});
  const last=res(1,"Riverside","A","Riverside Park","League",{Theo:1},{George:{con:1,pen:1}},[1,1,1],"Theo");
  last.report="A hard-fought draw away at Riverside on a heavy pitch.\n\nTheo powered over from close range after a long spell of pick and go, and George kicked everything he was asked to. Riverside came back hard in the second half, but the tackling never stopped.\n\nWell done all, and thanks to the parents for the support on a wet morning!";
  matches.push(meadow,last);
  // today's game is in the second half when the visitor arrives; the script below plays the next few minutes out
  const today=day(0),half=TEAM.halfLength,ko=new Date(now-(half+5+8)*60000),out=BENCH[BENCH.length-1],sq=names.filter(n=>n!==out);
  const line=XV.slice();line[2]=BENCH[1];
  const l=told([["",1,{k:"lu",form:FORM,line:XV,bench:BENCH.filter(n=>n!==out)}],["1'",1,{k:"ko",form:FORM,line:XV}],
    ["9'",1,{k:"goal",t:"try",n:"Max"}],["10'",1,{k:"goal",t:"con",n:"George"}],["16'",1,{k:"them",t:"try"}],
    [`${half-3}'`,1,{k:"sub",on:BENCH[1],off:XV[2]}],["HT",1,{k:"ht"}],[`${half+1}'`,2,{k:"2h"}],[`${half+4}'`,2,{k:"them",t:"pen"}]]);
  matches.push(M({id:id(today,"Westgate"),date:today,opp:"Westgate",ha:"H",venue:HOME,comp:"League",ko:ko.toTimeString().slice(0,5),
      us:l.us,them:l.them,played:Object.fromEntries(sq.map(n=>[n,l.played[n]||0])),kicks:l.kicks,squad:sq,
      live:{locked:true,status:"live",half:2,halfStart:now-(8*60+20)*1000,halfLen:half,form:FORM,slots:line,squad:sq,mins:{},events:l.events}}),
    M({id:id(day(7),"Ashford"),date:day(7),opp:"Ashford",ha:"A",venue:"Ashford Rugby Club",comp:"League",ko:"11:00",
      preview:"Back-to-back league games against Ashford. We won well at home, so expect them to be up for this one. Meet at 10:00 in the clubhouse car park, home kit and gumshields please."}),
    M({id:id(day(14),"Northfield"),date:day(14),opp:"Northfield",ha:"H",venue:HOME,comp:"County Cup",ko:"10:30"}),
    M({id:id(day(21),"Meadow Park"),date:day(21),opp:"Meadow Park",ha:"A",venue:"Meadow Park Playing Fields",comp:"League",ko:"10:30"}),
    M({id:id(day(28),"Oakwood"),date:day(28),opp:"Oakwood",ha:"H",venue:HOME,comp:"League",ko:"10:30"}));
  const next=matches.find(m=>m.date===day(7)).id,st={[BENCH[2]]:"maybe",[out]:"no",Leo:"maybe"};
  const back=((new Date().getDay()+3)%7)||7,thu=[0,1,2,3].map(i=>day(-back-7*i));   // the last four Thursday sessions
  const tries=g.events.filter(e=>e.k==="goal"&&e.t==="try");
  return {players,matches,tournaments:[],
    honours:[{id:"h1",date:day(-150),title:LEAGUE?"Under 12s County Cup":"Under 13s County Cup",achievement:"Winners",notes:"Beat Meadow Park in the final"},
      {id:"h2",date:day(-120),title:"Spirit of the Game award",achievement:TEAM.league,notes:"Voted for by the referees"}],
    training:[{id:1,day:"Thursday",start:"18:30",finish:"20:00",venue:"Sample Town Sports Ground, floodlit pitch",kit:"Boots, gumshield, water bottle and a warm top. Headguards are optional.",
      notes:"Please arrive 10 minutes early so we can start on time.",until:day(220),off:[],updated:new Date(now-864e5*20).toISOString()}],
    training_attendance:thu.flatMap((d,i)=>names.filter((n,j)=>(j+i)%5!==0).map(player=>({day:d,player}))),
    availability:names.map(player=>({match_id:next,player,status:st[player]||"yes"})),
    polls:[{id:"gotm-demo",kind:"gotm",title:"Try of the month",options:tries.map(e=>`${e.n} v Meadow Park (${e.m})`),
      closes:new Date(now+864e5*5).toISOString(),closed:false,created:new Date(now-864e5*2).toISOString()}],
    poll_votes:[9,4,12,6].slice(0,tries.length).flatMap((v,i)=>Array.from({length:v},(x,j)=>({poll_id:"gotm-demo",voter:"v"+i+"-"+j,choice:i}))),
    team_settings:[{id:1,settings:{},ready:true,updated:new Date(now-864e5*30).toISOString()}],
    team_signoff:[{id:1,welfare_name:"Club safeguarding officer",welfare_email:"",public_scores:!flags.hidden,welfare_agreed:true,terms_agreed:true,dpa_agreed:true,agreed_by:"Club secretary"}],
    parent_settings:[{id:1,required:false}],family_codes:players.map(p=>({player_id:p.id,code:p.name.slice(0,3).toUpperCase()+"123"})),parent_links:[],
    coaches:[{email:"coach@sampletown.example"}],badges:[],player_photos:[],match_photos:[],help_requests:[],post_log:[],
    page_views:Array.from({length:28},(_,i)=>{const d=27-i,wk=new Date(day(-d)).getDay(),v=(wk===0||wk===6)?40+((i*7)%25):8+((i*5)%12);return {day:day(-d),views:v,visitors:Math.round(v*.45)}})};
}
const s=t=>({k:"goal",t,p:P[t],na:1});
window.DEMO_DATA={season,
  // seconds after the visitor opens the demo: a try and its conversion, a replacement, a penalty against, another try
  script:[[30,Object.assign(s("try"),{n:"Arlo"})],[45,Object.assign(s("con"),{n:"George"})],[90,{k:"sub",on:BENCH[2],off:XV[3]}],
    [150,{k:"them",t:"pen",p:P.pen}],[210,Object.assign(s("try"),{n:"Noah"})],[260,{k:"sub",on:BENCH[3],off:XV[XV.length-1]}]],
  hiddenTeam:{publicScores:false},
  words:{ageBtn:"Hide scores",
    coachTip:"You're a coach now. Open today's game and tap ▶ Live match to record tries, kicks, replacements and the sin bin, or make a matchday graphic.",
    hiddenTip:"Scores are hidden: parents see games, line-ups and awards but no scores or scorers, as many clubs choose for mini rugby. Coaches still see everything.",
    tip:"Today's game is live. Tap the red bar to follow it like a parent would. To try parent sign-in, open Parents and type Alfie's family code, ALF-123."}};
})();
