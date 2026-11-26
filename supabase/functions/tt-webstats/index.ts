// Visitor numbers for the Touchline Tales marketing website (touchlinetales.club home, demo, guides, about, privacy...),
// read from GoatCounter for the owner page (touchlinetales.club/admin/). Team and club sites are not in GoatCounter;
// the owner page counts those itself from each schema's page_views.
//
// Only an owner can use it: the caller must be signed in and on public.tt_admins (supabase/28_platform_admin.sql).
// The GoatCounter API key lives only here, as the secret GOATCOUNTER_TOKEN (Supabase > Edge Functions > Secrets),
// never in the public page. Make the key in GoatCounter: Settings > API > New API key, with "Read statistics" ticked.
// Optional secret GOATCOUNTER_SITE (default "touchlinetales", i.e. touchlinetales.goatcounter.com).
// Deploy with verify_jwt on:  supabase functions deploy tt-webstats
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const TOKEN = Deno.env.get("GOATCOUNTER_TOKEN") || "";
const SITE = (Deno.env.get("GOATCOUNTER_SITE") || "touchlinetales").replace(/[^a-z0-9-]/gi, "");
const SINCE = "2026-10-21"; // the day the counter went on the website

// GoatCounter wants times rounded to the hour
const hour = (d: Date) => { const x = new Date(d); x.setUTCMinutes(0, 0, 0); return x.toISOString().replace(".000Z", "Z"); };
const dayStart = (iso: string) => iso + "T00:00:00Z";

async function gc(path: string, params: Record<string, string>) {
  const u = new URL(`https://${SITE}.goatcounter.com/api/v0/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" } });
  if (!r.ok) throw new Error(`GoatCounter ${path}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("Authorization") || "";
  if (!auth) return json({ error: "Sign in first." }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false }, global: { headers: { Authorization: auth } },
  });
  const { data: ok, error } = await sb.rpc("tt_is_admin");
  if (error || ok !== true) return json({ error: "Owners only." }, 403);
  if (!TOKEN) return json({ error: "no_token" }, 200);

  try {
    const now = new Date(), end = hour(new Date(now.getTime() + 36e5)); // to the end of this hour
    const from30 = new Date(now.getTime() - 29 * 864e5).toISOString().slice(0, 10);
    const r30 = { start: dayStart(from30), end };
    const [t30, tAll, hits, refs] = await Promise.all([
      gc("stats/total", r30),
      gc("stats/total", { start: dayStart(SINCE), end }),
      gc("stats/hits", { ...r30, limit: "25" }),
      gc("stats/toprefs", { ...r30, limit: "15" }),
    ]);
    const days = (t30.stats || []).map((s: { day: string; daily?: number }) => ({ day: s.day, visitors: s.daily || 0 }));
    const today = now.toISOString().slice(0, 10), from7 = new Date(now.getTime() - 6 * 864e5).toISOString().slice(0, 10);
    const sum = (f: (d: { day: string }) => boolean) => days.filter(f).reduce((t: number, d: { visitors: number }) => t + d.visitors, 0);
    const list = (hits.hits || []) as { path: string; title?: string; count: number; event?: boolean }[];
    const refList = (refs.stats || refs.refs || []) as { name: string; count: number; ref_scheme?: string }[];
    return json({
      site: SITE, since: SINCE,
      today: sum((d) => d.day === today), week: sum((d) => d.day >= from7), month: sum(() => true),
      all: tAll.total == null ? null : tAll.total - (tAll.total_events || 0), events30: t30.total_events ?? null,
      days,
      pages: list.filter((h) => !h.event).slice(0, 12).map((h) => ({ path: h.path, title: h.title || "", visitors: h.count })),
      events: list.filter((h) => h.event).map((h) => ({ name: h.path, title: h.title || "", count: h.count })),
      sources: refList.map((r) => ({ name: r.name || "(direct or unknown)", visitors: r.count, kind: r.ref_scheme || "" })),
    });
  } catch (e) {
    console.error(e);
    return json({ error: "goatcounter", detail: String((e as Error).message || e).slice(0, 300) }, 200);
  }
});
