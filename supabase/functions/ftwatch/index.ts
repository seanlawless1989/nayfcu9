// Keeps every team's league fixtures in line with FA Full-Time, whoever has the site open.
//
// Full-Time blocks servers (Cloudflare challenge), so this function can't read Full-Time itself. Instead any phone with
// the team's site open (parents too, not just coaches) loads the team's official Full-Time code snippet, the way any
// club website does, at most every 2 hours, and posts the rows it shows here:
//   POST {schema?, names: ["Newton Aycliffe", ...], rows: [["L", "21/11/26 11:30", "Us", "v", "Them", "Venue"], ...]}
// This compares them with the games already on the site and, for upcoming games only, updates a changed date, kick-off
// or venue and asks notify to tell parents (fixture alert, once per change). New games are never added here: a coach
// still ticks those in Fixtures > Import.
// Who it trusts: a signed-in coach's phone at once. Anyone else's change is applied once two different phones (by
// network address) have seen the same change within 2 days, so one person can't move a game on their own.
// Every change made is written to public.ft_watch_log (supabase/41_fulltime_watch.sql). Deploy with verify_jwt on.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const pub = createClient(URL_, KEY, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---- the same reading of Full-Time rows as the site's Import league fixtures (docs/app.js ftParse, sameOpp) ----
const oppKey = (n: string) => String(n || "").toLowerCase().replace(/\bcls\b/g, "chester le street").replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\b(a?fc|jfc|youth|juniors?|girls|the|c ?a|football club|club)\b/g, " ").replace(/\s+/g, " ").trim();
const oppWords = (n: string) => oppKey(n).split(" ").filter((w) => w.length > 1 && !/^u\d+s?$/.test(w)).map((w) => w.length > 3 ? w.replace(/s$/, "") : w);
function sameOpp(a: string, b: string) {
  const x = oppKey(a), y = oppKey(b); if (!x || !y) return false; if (x === y || x.includes(y) || y.includes(x)) return true;
  let p = oppWords(a), q = oppWords(b); if (p.length > q.length) [p, q] = [q, p]; return p.length >= 2 && p.every((w) => q.includes(w));
}
const ftDate = (c: string) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(c || ""); if (!m) return null; const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; };
const ftTime = (c: string) => { const m = /\b(\d{1,2})[:.](\d{2})\b/.exec(c || ""); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
type Fx = { date: string; ko: string; opp: string; venue: string; comp: string };
function ftParse(raw: string[], name: string): Fx | null {
  const cells = raw.map((c) => String(c || "").trim()); const dc = cells.findIndex((c) => ftDate(c)); if (dc < 0) return null;
  const date = ftDate(cells[dc])!, ko = ftTime(cells[dc]) || ftTime(cells[dc + 1] || ""), me = oppKey(name);
  const rest = cells.map((c, i) => ({ c, i })).filter((x) => x.i !== dc && x.c && !/^(v|vs|v\.|-)$/i.test(x.c) && !ftDate(x.c) && !/^\d{1,2}[:.]\d{2}$/.test(x.c) && !/^(l|c|f|cup|league|friendly)$/i.test(x.c) && !/^\d+\s*-\s*\d+$/.test(x.c));
  const us = rest.findIndex((x) => me && oppKey(x.c).includes(me)); if (us < 0) return null;
  const other = us > 0 && rest[us - 1].i > dc ? rest[us - 1] : rest[us + 1]; if (!other) return null;
  const after = rest.filter((x) => x.i > Math.max(other.i, rest[us].i));
  const compCell = cells.find((c) => /cup|trophy|shield|plate/i.test(c)), fr = cells.some((c) => /^f$|friendly/i.test(c));
  return { date, ko, opp: other.c.replace(/\s+/g, " "), venue: after[0] && !/cup|division|league|trophy/i.test(after[0].c) ? after[0].c : "", comp: compCell ? "Cup" : fr ? "Friendly" : "League" };
}

type Match = { id: string; date: string; opp: string; ko: string; venue: string; comp: string; us: number | null; them: number | null; postponed: boolean; stage: string | null; live: { status?: string } | null };
const sig = (m: { date: string; ko?: string; venue?: string }) => [m.date || "", String(m.ko || "").trim(), String(m.venue || "").trim()].join("|");
// the same place written two ways ("RUSSELL FOSTER FOOTBALL CENTRE 7 v 7 Pitch 7" / "Russell Foster Football Centre, 7v7 Pitch 7")
const sameVenue = (a: string, b: string) => String(a || "").toLowerCase().replace(/[^a-z0-9]/g, "") === String(b || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const londonToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const str = (v: unknown, n: number) => typeof v === "string" ? v.slice(0, n) : "";

async function sha(s: string) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join(""); }

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const body = await req.json().catch(() => ({}));
  const schema = typeof body.schema === "string" && /^[a-z][a-z0-9_]{0,40}$/.test(body.schema) ? body.schema : "public";
  const rows: string[][] = Array.isArray(body.rows) ? body.rows.slice(0, 300).filter(Array.isArray).map((r: unknown[]) => r.slice(0, 12).map((c) => str(c, 200))) : [];
  const names: string[] = (Array.isArray(body.names) ? body.names : []).map((n: unknown) => str(n, 80).trim()).filter(Boolean).slice(0, 6);
  if (!rows.length || !names.length) return json({ error: "Nothing to check." }, 400);
  const db = schema === "public" ? pub : createClient(URL_, KEY, { auth: { persistSession: false }, db: { schema } });

  // who is asking: a coach of this team (their sign-in), otherwise a phone known only by a hash of its network address
  let coach = false, who = "";
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await pub.auth.getUser(token).catch(() => ({ data: { user: null } }));
  const email = (u?.user?.email ?? "").toLowerCase();
  if (email) { const { data: c } = await db.from("coaches").select("email").eq("email", email).maybeSingle(); coach = !!c; }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  who = coach ? `coach:${await sha(email)}` : `ip:${await sha(ip + "|" + schema)}`;

  const today = londonToday();
  const { data: all, error } = await db.from("matches").select("id,date,opp,ko,venue,comp,us,them,postponed,stage,live").gte("date", new Date(Date.parse(today) - 20 * 864e5).toISOString().slice(0, 10));
  if (error) return json({ error: error.message }, 500);
  const matches = (all ?? []) as Match[];
  const open = (m: Match) => m.us == null && m.them == null && !m.postponed && m.stage !== "placeholder" && !(m.live?.status && m.live.status !== "pre");

  // the name Full-Time uses for us: the first one that finds any of our games
  const name = names.find((n) => rows.some((r) => ftParse(r, n))) ?? "";
  if (!name) return json({ checked: 0, changed: 0, note: "Our team's name wasn't found in the Full-Time rows." });
  const seen = new Set<string>(), list: Fx[] = [];
  for (const r of rows) { const f = ftParse(r, name); if (!f) continue; const k = f.date + "|" + oppKey(f.opp); if (!seen.has(k)) { seen.add(k); list.push(f); } }

  const out: { match: string; was: string; now: string; applied: boolean }[] = [];
  for (const f of list) {
    // the same game we already have: same date and opponent, or the same opponent and competition moved by under 15 days
    const ex = matches.find((m) => m.date === f.date && sameOpp(m.opp, f.opp)) ??
      matches.find((m) => open(m) && sameOpp(m.opp, f.opp) && m.comp === f.comp && days(m.date, f.date) < 15 && m.date !== f.date);
    if (!ex || !open(ex)) continue;
    if (ex.date < today && f.date < today) continue;              // an old game
    const b: Partial<Match> = { date: f.date };
    if (f.ko) b.ko = f.ko;
    if (f.venue && !sameVenue(f.venue, ex.venue)) b.venue = f.venue;
    const next = { ...ex, ...b };
    if (sig(next) === sig(ex)) continue;                          // nothing parents would see has changed
    if (days(ex.date, f.date) > 30) continue;                     // too big a move to trust without a coach
    out.push({ match: ex.id, was: sig(ex), now: sig(next), applied: false });
    if (out.length > 5) break;                                    // a sensible week never moves more than a handful
  }
  if (!out.length) return json({ checked: list.length, changed: 0 });

  for (const c of out) {
    const m = matches.find((x) => x.id === c.match)!;
    // a phone that isn't a coach's: wait until a second phone has seen the same change
    if (!coach) {
      await pub.from("ft_watch_seen").upsert({ schema, match_id: c.match, sig: c.now, reporter: who }, { onConflict: "schema,match_id,sig,reporter", ignoreDuplicates: true });
      const { count } = await pub.from("ft_watch_seen").select("reporter", { count: "exact", head: true })
        .eq("schema", schema).eq("match_id", c.match).eq("sig", c.now).gte("at", new Date(Date.now() - 2 * 864e5).toISOString());
      if ((count ?? 0) < 2) continue;
    }
    const [d, ko, venue] = c.now.split("|");
    const upd: Record<string, string> = { date: d };
    if (ko) upd.ko = ko;
    if (venue) upd.venue = venue;
    const { error: ue } = await db.from("matches").update(upd).eq("id", c.match).eq("date", m.date);   // unchanged since we read it
    if (ue) { console.error(schema, c.match, ue.message); continue; }
    c.applied = true;
    await pub.from("ft_watch_log").insert({ schema, match_id: c.match, was: c.was, now: c.now, by: coach ? "coach" : "phones" });
    // tell parents with alerts on (notify sends once per change)
    await fetch(`${URL_}/functions/v1/notify`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(schema === "public" ? { fixture: { match: c.match, was: c.was } } : { schema, fixture: { match: c.match, was: c.was } }) })
      .catch((e) => console.error("notify", e));
  }
  const applied = out.filter((c) => c.applied);
  return json({ checked: list.length, changed: applied.length, waiting: out.length - applied.length, games: applied.map((c) => c.match) });
}

Deno.serve((req) => handle(req).catch((e) => { console.error(e); return json({ error: (e as Error).message }, 500); }));
