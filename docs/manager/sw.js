// Offline support: always try for the latest version, fall back to the saved copy with no signal.
// Only touches its own "u9s-" caches, so it can live alongside the club site's service worker.
const CACHE="u9s-202610230816";
const FILES=["./","index.html","manifest.webmanifest","crest.png","coffey.jpg","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","badges/beamish-lionesses.png","badges/belmont-united.png","badges/birtley-town.png","badges/bishop-auckland.png","badges/brandon-community.png","badges/chester-le-street-amazons.png","badges/chester-le-street-hilda-park.png","badges/chester-le-street-town.png","badges/clegwell.png","badges/darlington-locomotive.png","badges/fc-hartlepool.png","badges/felling-magpies.png","badges/gateshead-cleveland-hall.png","badges/horden-cw.png","badges/leam-rangers.png","badges/middleton-rangers.png","badges/north-east-sport-youth.png","badges/seaham-afc.png","badges/washington-afc.png","badges/washington-juniors.png","badges/washington-united.png","badges/wearside-fc.png","badges/whickham-fc.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("u9s-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  const same=new URL(e.request.url).origin===location.origin;
  e.respondWith(fetch(e.request,same?{cache:"no-cache"}:{}).then(r=>{if(r&&(r.ok||r.type==="opaque")){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r})
    .catch(()=>caches.open(CACHE).then(c=>c.match(e.request,{ignoreSearch:true}))));
});
