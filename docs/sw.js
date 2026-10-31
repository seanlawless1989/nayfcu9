// Keeps the site's own files on the phone so it opens quickly and works with a poor signal.
// Data always comes live from the database; only the page shell is cached.
importScripts("team.js");// self.TEAM: name, logos and the cache name
const KEY=(self.TEAM&&TEAM.storageKey)||"team",CACHE=KEY+"-v20";
const LOGOS=[TEAM.crest||"crest.png",TEAM.sponsor&&TEAM.sponsor.logo,TEAM.potm&&TEAM.potm.logo,TEAM.kitSponsor&&TEAM.kitSponsor.logo].filter(Boolean);
const SHELL=["./","index.html","app.css","app.js","team.js","config.js",...new Set(LOGOS),"icon-192.png","icon-512.png","apple-touch-icon.png","manifest.webmanifest"];
const NAME=`${TEAM.name||""} ${TEAM.ageShort||""}`.trim()||"Match alerts";
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith(KEY+"-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin)return;
  // network first (skipping the browser's 10-minute cache so updates show straight away), cached copy when offline
  e.respondWith(fetch(e.request,{cache:"no-cache"}).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true})));
});

// Match alerts: kick-off reminders and live scores, sent by the "notify" Supabase function.
self.addEventListener("push",e=>{
  let a={};try{a=e.data?e.data.json():{}}catch(x){a={title:NAME,body:e.data?e.data.text():""}}
  e.waitUntil(self.registration.showNotification(a.title||NAME,{body:a.body||"",icon:"icon-192.png",badge:"icon-192.png",tag:a.tag||undefined,renotify:!!a.tag,data:{url:a.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||"./",self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{
    const w=ws.find(c=>c.url.startsWith(self.registration.scope));
    if(w)return w.navigate(url).then(c=>(c||w).focus()).catch(()=>w.focus());
    return clients.openWindow(url);
  }));
});
