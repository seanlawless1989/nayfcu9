// Sends match alerts to families' phones (web push).
//   POST {}               every minute from pg_cron: kick-off reminders, plus any live update not yet sent
//   POST {match: "<id>"}  from the coach's phone straight after a live update: sends it at once
//   POST {test: "<endpoint>"} from a parent's phone after turning alerts on: a "you're all set" alert
//   POST {squad: "<id>"}  from a coach's phone after saving Pick squad: "squad announced" (again only if it changed)
//   POST {potm: "<id>"}   from a coach's phone after saving the player of the match
// Only names already shown on the site go in an alert. See supabase/3_notifications.sql.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = Deno.env.get("SITE_URL") ?? "https://nayfootball.club/";
let US = Deno.env.get("TEAM_NAME") ?? "Newton Aycliffe";
// PUBLIC_SCORES=false: no goal alerts and no scores in alerts (FA rules for U7-U11). Matches the site's TEAM.publicScores.
let SCORES = Deno.env.get("PUBLIC_SCORES") !== "false";
let AGE = Deno.env.get("AGE_GROUP") ?? "Under 9s";
// The player of the match sponsor (TEAM.potm.sponsor and .icon in docs/team.js). POTM_SPONSOR=none for a plain "Player of the match".
const POTM_SPONSOR = (Deno.env.get("POTM_SPONSOR") ?? "Coffey Coffee").trim();
let POTM = POTM_SPONSOR && POTM_SPONSOR !== "none" ? `${POTM_SPONSOR} Player of the Match` : "Player of the Match";
let POTM_ICON = Deno.env.get("POTM_ICON") ?? (POTM_SPONSOR === "Coffey Coffee" ? "☕" : "⭐");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
// A coach's answers on the site's Team setup page (supabase/7_team_setup.sql) win over the secrets above.
// Scores stay hidden if either the secret or the setup page says so.
const ENV_SCORES = SCORES;
async function loadTeam() {
  const { data, error } = await db.from("team_settings").select("settings").eq("id", 1).maybeSingle();
  const t = error ? null : data?.settings;
  if (!t) return;
  if (t.name) US = t.name;
  if (t.ageGroup) AGE = t.ageGroup;
  SCORES = ENV_SCORES && t.publicScores !== false;
  const sp = (t.potm?.sponsor ?? "").trim();
  POTM = sp ? `${sp} Player of the Match` : "Player of the Match";
  POTM_ICON = t.potm?.icon || "⭐";
}
// the key pair lives in public.push_keys (service role only)
let keysReady: Promise<void> | null = null;
function loadKeys() {
  return keysReady ??= db.from("push_keys").select("public_key,private_key").eq("id", 1).single().then(({ data, error }) => {
    if (error || !data) { keysReady = null; throw new Error("Match-alert keys are missing from push_keys"); }
    webpush.setVapidDetails(SITE.replace(/\/$/, ""), data.public_key, data.private_key);
  });
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

type Alert = { title: string; body: string; url: string; tag: string };
type Sub = { endpoint: string; p256dh: string; auth: string };

// ---- UK time ----
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function londonWall(ms: number) { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute); }
function londonDate(ms: number) { return new Date(londonWall(ms)).toISOString().slice(0, 10); }
// "2026-10-18" + "10:15" (UK time) -> ms, or null when the kick-off isn't a time yet ("TBC")
function kickOff(date: string, ko: string) {
  const t = /(\d{1,2})[:.](\d{2})/.exec(ko || ""); if (!t) return null;
  const [y, m, d] = date.split("-").map(Number); const guess = Date.UTC(y, m - 1, d, +t[1], +t[2]);
  return guess - (londonWall(guess) - guess);
}

// ---- sending ----
async function send(kind: "reminders" | "live" | null, alert: Alert, only?: string) {
  let q = db.from("push_subs").select("endpoint,p256dh,auth");
  if (only) q = q.eq("endpoint", only); else q = q.eq(kind!, true);
  const { data, error } = await q; if (error) throw error;
  const subs = (data ?? []) as Sub[]; let ok = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(subs.slice(i, i + 25).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(alert), { TTL: kind === "live" ? 900 : 3600, urgency: "high" });
        ok++; await db.from("push_subs").update({ last_ok: new Date().toISOString() }).eq("endpoint", s.endpoint);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subs").delete().eq("endpoint", s.endpoint); // phone turned alerts off
        else console.error("push failed", code, (e as Error).message);
      }
    }));
  }
  return ok;
}

// ---- live match events ----
type Ev = { k: string; at?: number; n?: string; a?: string; na?: number; on?: string; off?: string; s?: string; m?: string; form?: string; line?: string[]; bench?: string[]; re?: number };
type Match = { id: string; date: string; opp: string; ko: string; venue: string; ha: string; us: number | null; them: number | null; postponed: boolean; stage: string | null; comp?: string; squad?: string[] | null; potm?: string | null; live: { status?: string; events?: Ev[] } | null };

function liveAlert(e: Ev, m: Match): Alert | null {
  const url = `${SITE}?live=${encodeURIComponent(m.id)}`, tag = `live-${m.id}`, opp = m.opp || "the opposition";
  const score = SCORES ? `${US} ${e.s ?? `${m.us ?? 0}–${m.them ?? 0}`} ${opp}` : `${US} v ${opp}`;
  if (!SCORES && (e.k === "goal" || e.k === "them")) return null;
  switch (e.k) {
    // re = the coaches unlocked the line-up and locked a different one
    case "lu": return e.line?.length ? { title: e.re ? "🔁 Line-up change" : "✅ Line-up confirmed", body: `${US} v ${opp}${e.form ? ` (${e.form})` : ""}: ${e.line[0]} in goal, ${e.line.slice(1).filter(Boolean).join(", ")}.${e.bench?.length ? ` Subs: ${e.bench.join(", ")}.` : ""}`, url, tag: `lu-${m.id}` } : null;
    case "ko": return { title: "🟢 Kick-off!", body: `${US} v ${opp} is under way. Tap to follow live.`, url, tag };
    case "goal": return { title: `⚽ GOAL! ${e.n ?? US} scores`, body: score + (e.a ? `. Set up by ${e.a}.` : ""), url, tag };
    case "sub": return e.on ? { title: `🔁 Substitution`, body: `${e.on} comes on for ${e.off ?? "a teammate"}${e.m ? ` (${e.m})` : ""}. ${score}`, url, tag } : null;
    case "them": return { title: `Goal for ${opp}`, body: score, url, tag };
    case "ht": return { title: "⏸ Half time", body: score, url, tag };
    case "ft": return { title: "🏁 Full time", body: score, url, tag };
  }
  return null;
}

async function flushLive(m: Match) {
  const evs = (m.live?.events ?? []).filter((e) => typeof e.at === "number").sort((a, b) => a.at! - b.at!);
  const { data: log } = await db.from("push_log").select("last_at").eq("match_id", m.id).maybeSingle();
  const from = Number(log?.last_at ?? 0); const now = Date.now();
  const ready: Ev[] = [];
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i]; if (e.at! <= from) continue;
    // a goal waits for the coach to say who set it up (na = nobody), or a minute and a half, so the alert can say so
    if (e.k === "goal" && !e.a && !e.na && i === evs.length - 1 && now - e.at! < 90_000) break;
    ready.push(e);
  }
  if (!ready.length) return 0;
  const to = ready[ready.length - 1].at!;
  const { data: claimed } = await db.rpc("push_claim_events", { p_match: m.id, p_from: from, p_to: to });
  if (!claimed) return 0; // another call is sending these
  let sent = 0;
  for (const e of ready) {
    if (now - e.at! > 30 * 60_000) continue; // too old to be news (e.g. the first run after alerts were switched on)
    const a = liveAlert(e, m); if (a) { await send("live", a); sent++; }
  }
  return sent;
}

// ---- kick-off reminders (10 and 2 minutes before) ----
async function reminders(list: Match[]) {
  let sent = 0; const now = Date.now();
  for (const m of list) {
    if (m.postponed || m.us != null || m.stage === "placeholder" || (m.live?.status && m.live.status !== "pre")) continue;
    const ko = kickOff(m.date, m.ko); if (ko == null) continue;
    const mins = (ko - now) / 60_000; if (mins <= 0 || mins > 10.5) continue;
    const at = mins > 2.5 ? 10 : 2; // the cron runs every minute, so each reminder lands within a minute of its time
    const { data: claimed } = await db.rpc("push_claim_reminder", { p_match: m.id, p_mins: at }); if (!claimed) continue;
    const where = m.venue ? ` at ${m.venue}` : m.ha === "A" ? " (away)" : m.ha === "H" ? " (home)" : "";
    await send("reminders", { title: `⏰ Kick-off in ${Math.max(1, Math.round(mins))} minute${Math.round(mins) > 1 ? "s" : ""}`, body: `${US} v ${m.opp}${where}, ${m.ko.trim()}. Tap to follow it live.`, url: `${SITE}?live=${encodeURIComponent(m.id)}`, tag: `ko-${m.id}` });
    sent++;
  }
  return sent;
}

// ---- squad picked (usually midweek) ----
const dayName = (date: string) => new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
async function squadAlert(m: Match) {
  const sq = (m.squad ?? []).filter(Boolean);
  if (!sq.length || m.postponed || m.us != null || m.stage === "placeholder" || m.date < londonDate(Date.now()) || (m.live?.status && m.live.status !== "pre")) return -1;
  const { data: kind } = await db.rpc("push_claim_squad", { p_match: m.id, p_squad: sq });
  if (!kind) return -1; // already sent as it is
  const when = `${dayName(m.date)}${/\d[:.]\d\d/.test(m.ko || "") ? `, ${m.ko.trim()} KO` : ""}`;
  return await send("reminders", { title: kind === 2 ? "📋 Squad update" : "📋 Squad announced", body: `${US} ${m.ha === "A" ? "at" : "v"} ${m.opp || "TBC"}, ${when}: ${sq.join(", ")}.`, url: `${SITE}?match=${encodeURIComponent(m.id)}`, tag: `squad-${m.id}` });
}

// ---- player of the match, after the game ----
async function potmAlert(m: Match) {
  const ft = m.us != null || m.live?.status === "ft";
  // only for a game just played: editing an old game doesn't alert anyone
  if (!m.potm || !ft || m.comp === "Tournament" || m.date < londonDate(Date.now() - 3 * 864e5) || m.date > londonDate(Date.now())) return -1;
  const { data: claimed } = await db.rpc("push_claim_potm", { p_match: m.id, p_potm: m.potm }); if (!claimed) return -1;
  const score = SCORES && m.us != null && m.them != null ? ` (${m.us}–${m.them})` : "";
  return await send("live", { title: `${POTM_ICON} ${POTM}: ${m.potm}`, body: `Well done ${m.potm}! ${US} v ${m.opp || "the opposition"}${score}.`, url: `${SITE}?match=${encodeURIComponent(m.id)}`, tag: `potm-${m.id}` });
}

const COLS = "id,date,opp,ko,venue,ha,us,them,postponed,stage,comp,squad,potm,live";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    await loadKeys();
    await loadTeam();
    const body = await req.json().catch(() => ({}));
    const out: Record<string, number> = {};
    if (typeof body.test === "string") {
      out.test = await send(null, { title: "🔔 Match alerts are on", body: `You'll get kick-off reminders and ${SCORES ? "live scores" : "live updates"} for the ${AGE}.`, url: SITE, tag: "welcome" }, body.test);
    } else if (typeof body.squad === "string" || typeof body.potm === "string") {
      const id = typeof body.squad === "string" ? body.squad : body.potm;
      const { data } = await db.from("matches").select(COLS).eq("id", id).maybeSingle();
      if (typeof body.squad === "string") out.squad = data ? await squadAlert(data as Match) : -1;
      else out.potm = data ? await potmAlert(data as Match) : -1;
    } else if (typeof body.match === "string") {
      const { data } = await db.from("matches").select(COLS).eq("id", body.match).maybeSingle();
      out.live = data ? await flushLive(data as Match) : 0;
    } else {
      const now = Date.now(), today = londonDate(now), tomorrow = londonDate(now + 864e5);
      const { data, error } = await db.from("matches").select(COLS).gte("date", today).lte("date", tomorrow); if (error) throw error;
      const list = (data ?? []) as Match[];
      out.reminders = await reminders(list);
      out.live = 0; for (const m of list.filter((x) => x.date === today && x.live?.events?.length)) out.live += await flushLive(m);
    }
    return new Response(JSON.stringify(out), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
