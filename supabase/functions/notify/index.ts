// Sends match alerts to families' phones (web push).
//   POST {}               every minute from pg_cron: kick-off reminders, plus any live update not yet sent
//   POST {match: "<id>"}  from the coach's phone straight after a live update: sends it at once
//   POST {test: "<endpoint>"} from a parent's phone after turning alerts on: a "you're all set" alert
// Only names already shown on the site go in an alert. See supabase/3_notifications.sql.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = Deno.env.get("SITE_URL") ?? "https://nayfootball.club/";
const US = Deno.env.get("TEAM_NAME") ?? "Newton Aycliffe";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
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
type Ev = { k: string; at?: number; n?: string; a?: string; na?: number; on?: string; off?: string; s?: string; m?: string; form?: string; line?: string[]; bench?: string[] };
type Match = { id: string; date: string; opp: string; ko: string; venue: string; ha: string; us: number | null; them: number | null; postponed: boolean; stage: string | null; live: { status?: string; events?: Ev[] } | null };

function liveAlert(e: Ev, m: Match): Alert | null {
  const url = `${SITE}?live=${encodeURIComponent(m.id)}`, tag = `live-${m.id}`, opp = m.opp || "the opposition";
  const score = `${US} ${e.s ?? `${m.us ?? 0}–${m.them ?? 0}`} ${opp}`;
  switch (e.k) {
    case "lu": return e.line?.length ? { title: "📋 Starting line-up", body: `${US} v ${opp}${e.form ? ` (${e.form})` : ""}: ${e.line[0]} in goal, ${e.line.slice(1).filter(Boolean).join(", ")}.${e.bench?.length ? ` Subs: ${e.bench.join(", ")}.` : ""}`, url, tag: `lu-${m.id}` } : null;
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

const COLS = "id,date,opp,ko,venue,ha,us,them,postponed,stage,live";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    await loadKeys();
    const body = await req.json().catch(() => ({}));
    const out: Record<string, number> = {};
    if (typeof body.test === "string") {
      out.test = await send(null, { title: "🔔 Match alerts are on", body: "You'll get kick-off reminders and live scores for the Under 9s.", url: SITE, tag: "welcome" }, body.test);
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
