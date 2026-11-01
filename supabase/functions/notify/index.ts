// Sends match alerts to families' phones (web push).
//   POST {}               every minute from pg_cron: kick-off reminders, plus any live update not yet sent
//   POST {match: "<id>"}  from the coach's phone straight after a live update: sends it at once
//   POST {test: "<endpoint>"} from a parent's phone after turning alerts on: a "you're all set" alert
//   POST {squad: "<id>"}  from a coach's phone after saving Pick squad: "squad announced" (again only if it changed)
//   POST {potm: "<id>"}   from a coach's phone after saving the player of the match
//   POST {postponed: "<id>"} from a coach's phone after marking an upcoming game postponed (or back on)
//   POST {preview: "<id>"} from a coach's phone after saving a match preview (once per game)
//   POST {tsquad: "<id>"}  from a coach's phone after picking a tournament's squad (again only if it changed)
//   POST {tournament: "<id>"} from a coach's phone when a tournament's groups and games are confirmed (once per tournament)
//   POST {avail: {match, player}} from a parent's phone after answering availability: tells coaches who asked for it
//   POST {tavail: {day, player}}  the same for a training session
// The every-minute call also sends the reminders to answer availability: the Wednesday evening before a game, and
// 24 hours before training (supabase/16_availability_alerts.sql).
// Add schema: "<schema>" to any of these for a team that shares this project in its own schema (tools/team_schema_sql.py).
// The every-minute call covers every team schema that's exposed in the Data API.
// Only names already shown on the site go in an alert. See supabase/3_notifications.sql.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

// The project's own team (schema public) is set up by these secrets. A team in its own schema uses its alert_team row.
const ENV_SITE = Deno.env.get("SITE_URL") ?? "https://nayfootball.club/";
// where a tap on an alert opens. Teams in their own schema: "./" opens the site the phone turned alerts on from.
let SITE = ENV_SITE;
let US = Deno.env.get("TEAM_NAME") ?? "Newton Aycliffe";
// PUBLIC_SCORES=false: no goal alerts and no scores in alerts (FA rules for U7-U11). Matches the site's TEAM.publicScores.
let SCORES = Deno.env.get("PUBLIC_SCORES") !== "false";
let AGE = Deno.env.get("AGE_GROUP") ?? "Under 9s";
// "football" (the default), "rugby-union" or "rugby-league" (TEAM.sport): rugby alerts say try, conversion and so on
let SPORT = Deno.env.get("SPORT") ?? "football";
const RSCORE: Record<string, string> = { try: "Try", con: "Conversion", pen: "Penalty goal", drop: "Drop goal", pt: "Penalty try" };
// The player of the match sponsor (TEAM.potm.sponsor and .icon in docs/team.js). POTM_SPONSOR=none for a plain "Player of the match".
const POTM_SPONSOR = (Deno.env.get("POTM_SPONSOR") ?? "Coffey Coffee").trim();
let POTM = POTM_SPONSOR && POTM_SPONSOR !== "none" ? `${POTM_SPONSOR} Player of the Match` : "Player of the Match";
let POTM_ICON = Deno.env.get("POTM_ICON") ?? (POTM_SPONSOR === "Coffey Coffee" ? "☕" : "⭐");
const URL_ = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const pub = createClient(URL_, KEY, { auth: { persistSession: false } });
// db is the current team's schema; requests are handled one at a time (see Deno.serve below), so switching it is safe
// deno-lint-ignore no-explicit-any
type Client = ReturnType<typeof createClient<any, any, any>>;
let db: Client = pub, SCHEMA = "public";
const clients: Record<string, Client> = { public: pub };
const ENV = { US, SCORES, AGE, SPORT, POTM, POTM_ICON };
// A coach's answers on the site's Team setup page (supabase/7_team_setup.sql) win over the secrets above.
// Scores stay hidden if either the secret or the setup page says so.
async function useTeam(schema: string) {
  SCHEMA = schema;
  db = clients[schema] ??= createClient(URL_, KEY, { auth: { persistSession: false }, db: { schema } });
  let base = ENV;
  SITE = ENV_SITE;
  if (schema !== "public") {
    // a team sharing the project: nothing from the secrets above (they're the project's own team); scores off unless it says so
    SITE = "./";
    const { data } = await db.from("alert_team").select("settings").eq("id", 1).maybeSingle();
    const a = data?.settings ?? {};
    const sp = (a.potm?.sponsor ?? "").trim();
    base = { US: a.name ?? "", SCORES: a.publicScores === true, AGE: a.ageGroup ?? "", SPORT: a.sport ?? "football",
      POTM: sp ? `${sp} Player of the Match` : "Player of the Match", POTM_ICON: a.potm?.icon || "⭐" };
  }
  ({ US, SCORES, AGE, SPORT, POTM, POTM_ICON } = base);
  const { data, error } = await db.from("team_settings").select("settings").eq("id", 1).maybeSingle();
  const t = error ? null : data?.settings;
  if (!t) return;
  if (t.name) US = t.name;
  if (t.ageGroup) AGE = t.ageGroup;
  if (t.sport) SPORT = t.sport;
  SCORES = base.SCORES && t.publicScores !== false;
  if (t.potm) {
    const sp = (t.potm.sponsor ?? "").trim();
    POTM = sp ? `${sp} Player of the Match` : "Player of the Match";
    POTM_ICON = t.potm.icon || "⭐";
  }
}
// One key pair for the whole project, in public.push_keys (service role only): every team's site uses its public half.
let keysReady: PromiseLike<void> | null = null;
function loadKeys() {
  return keysReady ??= pub.from("push_keys").select("public_key,private_key").eq("id", 1).single().then(({ data, error }) => {
    if (error || !data) { keysReady = null; throw new Error("Match-alert keys are missing from push_keys"); }
    webpush.setVapidDetails(ENV_SITE.replace(/\/$/, ""), data.public_key, data.private_key);
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
// kind picks the phones: "live" phones get everything on match day; "goals" and "results" also go to phones that chose just those
type Kind = "reminders" | "live" | "goals" | "results";
async function send(kind: Kind | null, alert: Alert, only?: string, list?: Sub[]) {
  let subs: Sub[];
  if (list) subs = list;
  else {
    let q = db.from("push_subs").select("endpoint,p256dh,auth");
    if (only) q = q.eq("endpoint", only);
    else if (kind === "goals" || kind === "results") q = q.or(`live.eq.true,${kind}.eq.true`);
    else q = q.eq(kind!, true);
    const { data, error } = await q; if (error) throw error;
    subs = (data ?? []) as Sub[];
  }
  let ok = 0;
  for (let i = 0; i < subs.length; i += 25) {
    await Promise.all(subs.slice(i, i + 25).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(alert), { TTL: kind === "reminders" || !kind ? 3600 : 900, urgency: "high" });
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
type Ev = { k: string; t?: string; p?: number; at?: number; n?: string; a?: string; na?: number; on?: string; off?: string; s?: string; m?: string; form?: string; line?: string[]; bench?: string[]; re?: number };
type Match = { id: string; date: string; opp: string; ko: string; venue: string; ha: string; us: number | null; them: number | null; postponed: boolean; stage: string | null; comp?: string; squad?: string[] | null; potm?: string | null; preview?: string | null; live: { status?: string; events?: Ev[] } | null };

function liveAlert(e: Ev, m: Match): Alert | null {
  const url = `${SITE}?live=${encodeURIComponent(m.id)}`, tag = `live-${m.id}`, opp = m.opp || "the opposition";
  const score = SCORES ? `${US} ${e.s ?? `${m.us ?? 0}–${m.them ?? 0}`} ${opp}` : `${US} v ${opp}`;
  if (!SCORES && (e.k === "goal" || e.k === "them")) return null;
  if (SPORT.startsWith("rugby")) switch (e.k) {
    case "lu": return e.line?.length ? { title: e.re ? "🔁 Line-up change" : "✅ Line-up confirmed", body: `${US} v ${opp}: ${e.line.filter(Boolean).join(", ")}.${e.bench?.length ? ` Replacements: ${e.bench.join(", ")}.` : ""}`, url, tag: `lu-${m.id}` } : null;
    case "goal": return { title: e.t === "pt" ? "🏉 Penalty try!" : e.t && e.t !== "try" ? `🎯 ${RSCORE[e.t] ?? "Kick"}${e.n ? `: ${e.n}` : ""}` : `🏉 TRY! ${e.n ?? US} scores`, body: score, url, tag };
    case "them": return { title: `${RSCORE[e.t ?? ""] ?? "Score"} for ${opp}`, body: score, url, tag };
    case "sub": return e.on ? { title: `🔁 Replacement`, body: `${e.on} comes on for ${e.off ?? "a teammate"}${e.m ? ` (${e.m})` : ""}. ${score}`, url, tag } : null;
  }
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
    const a = liveAlert(e, m); if (a) { await send(e.k === "goal" || e.k === "them" ? "goals" : e.k === "ft" ? "results" : "live", a); sent++; }
  }
  return sent;
}

// ---- kick-off reminders (10 and 2 minutes before) ----
// Not for tournament games: there are lots of them close together, so the reminders would pile up and clash.
// Families get one "groups and games are out" alert for the whole tournament instead (tournamentAlert below).
async function reminders(list: Match[]) {
  let sent = 0; const now = Date.now();
  for (const m of list) {
    if (m.comp === "Tournament" || m.postponed || m.us != null || m.stage === "placeholder" || (m.live?.status && m.live.status !== "pre")) continue;
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
  return await send("results", { title: `${POTM_ICON} ${POTM}: ${m.potm}`, body: `Well done ${m.potm}! ${US} v ${m.opp || "the opposition"}${score}.`, url: `${SITE}?match=${encodeURIComponent(m.id)}`, tag: `potm-${m.id}` });
}

// ---- postponed (an upcoming game called off) ----
async function postponedAlert(m: Match) {
  if (m.us != null || m.stage === "placeholder" || m.date < londonDate(Date.now())) return -1;
  const { data: claimed } = await db.rpc("push_claim_postponed", { p_match: m.id, p_postponed: !!m.postponed });
  if (!claimed) return -1; // back on, or already sent
  return await send("reminders", { title: "⚠️ Game postponed", body: `${US} ${m.ha === "A" ? "at" : "v"} ${m.opp || "TBC"} on ${dayName(m.date)} is off. New date to follow.`, url: `${SITE}?match=${encodeURIComponent(m.id)}`, tag: `pp-${m.id}` });
}

// ---- match preview (written by a coach before the game) ----
async function previewAlert(m: Match) {
  const text = (m.preview ?? "").trim();
  if (!text || m.postponed || m.us != null || m.stage === "placeholder" || m.date < londonDate(Date.now()) || (m.live?.status && m.live.status !== "pre")) return -1;
  const { data: claimed } = await db.rpc("push_claim_preview", { p_match: m.id }); if (!claimed) return -1; // already sent for this game
  const when = `${dayName(m.date)}${/\d[:.]\d\d/.test(m.ko || "") ? `, ${m.ko.trim()} KO` : ""}`;
  return await send("reminders", { title: "📰 Match preview", body: `${US} ${m.ha === "A" ? "at" : "v"} ${m.opp || "TBC"}, ${when}. Tap to read it.`, url: `${SITE}?match=${encodeURIComponent(m.id)}`, tag: `preview-${m.id}` });
}

// ---- tournament: groups and games confirmed (one alert instead of a countdown for every game) ----
type Tournament = { id: string; name: string; date: string; end_date?: string | null; venue?: string; teams?: { name: string; group: string }[]; squad?: string[] | null };

// ---- tournament squad picked (before the games are on the site); push_log row "t:<id>", like tournamentAlert ----
async function tSquadAlert(t: Tournament) {
  const sq = (Array.isArray(t.squad) ? t.squad : []).filter(Boolean);
  if (!sq.length || (t.end_date || t.date) < londonDate(Date.now())) return -1;
  const { data: kind } = await db.rpc("push_claim_squad", { p_match: `t:${t.id}`, p_squad: sq });
  if (!kind) return -1; // already sent as it is
  const when = t.end_date && t.end_date !== t.date ? `${dayName(t.date)} to ${dayName(t.end_date)}` : dayName(t.date);
  return await send("reminders", { title: `${kind === 2 ? "📋 Squad update" : "📋 Squad announced"}: ${t.name || "Tournament"}`, body: `${US} at the ${(t.name || "tournament").replace(/^the /i, "")}, ${when}: ${sq.join(", ")}.`, url: `${SITE}?fixtures`, tag: `tsquad-${t.id}` });
}
async function tournamentAlert(t: Tournament) {
  if ((t.end_date || t.date) < londonDate(Date.now())) return -1; // over already
  // push_log is keyed by text with no link to matches, so "t:<id>" keeps this to once per tournament without a database change
  const { data: claimed } = await db.rpc("push_claim_preview", { p_match: `t:${t.id}` }); if (!claimed) return -1;
  const key = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const teams = (Array.isArray(t.teams) ? t.teams : []).filter((x) => x && x.name);
  const mine = teams.find((x) => key(x.name).startsWith(key(US)) && /^[A-H]$/.test(x.group || ""));
  const rivals = mine ? teams.filter((x) => x.group === mine.group && x !== mine).map((x) => x.name) : [];
  const { data: games } = await db.from("matches").select("date,ko,opp").eq("tournament_id", t.id).order("date").order("ko");
  const first = ((games ?? []) as { date: string; ko: string; opp: string }[]).find((g) => /\d[:.]\d\d/.test(g.ko || ""));
  const body = [mine ? `We're in Group ${mine.group}${rivals.length ? ` with ${rivals.join(", ")}` : ""}.` : "",
    first ? `First game ${first.ko.trim()}${first.opp ? ` v ${first.opp}` : ""}${first.date !== t.date ? ` on ${dayName(first.date)}` : ""}.` : "",
    "Tap for every game and kick-off time."].filter(Boolean).join(" ");
  return await send("reminders", { title: `🏆 ${t.name || "Tournament"}: groups and games are out`, body, url: `${SITE}?fixtures`, tag: `t-${t.id}` });
}

// ---- availability ----
// "Ava, Mia and Ella"
const names = (a: string[]) => a.length > 1 ? `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}` : a[0] ?? "";
const clock = (t: string) => { const m = /^(\d{1,2})[:.](\d{2})/.exec(t || ""); if (!m) return t || ""; const h = +m[1]; return `${h % 12 || 12}${m[2] !== "00" ? ":" + m[2] : ""}${h < 12 ? "am" : "pm"}`; };
const SAID: Record<string, [string, string]> = { yes: ["✅", "can make it"], no: ["❌", "can't make it"], maybe: ["❔", "might make it"] };
type Training = { day: string; start: string; finish: string; venue: string; until: string | null; off: string[] | null };

// a parent answered: tell the coaches who asked for it, once per change of answer
async function availAlert(kind: "avail" | "tavail", ref: string, player: string) {
  if (typeof ref !== "string" || typeof player !== "string") return -1;
  const q = kind === "avail" ? db.from("availability").select("status").eq("match_id", ref) : db.from("training_availability").select("status").eq("day", ref);
  const { data: row } = await q.eq("player", player).maybeSingle();
  const said = SAID[row?.status ?? ""]; if (!said) return -1;
  let where: string, url: string;
  if (kind === "avail") {
    const { data: m } = await db.from("matches").select("date,opp,ha,ko").eq("id", ref).maybeSingle(); if (!m) return -1;
    where = `${US} ${m.ha === "A" ? "at" : "v"} ${m.opp || "TBC"}, ${dayName(m.date)}${/\d[:.]\d\d/.test(m.ko || "") ? `, ${m.ko.trim()} KO` : ""}.`;
    url = `${SITE}?fixtures`;
  } else { where = `Training, ${dayName(ref)}.`; url = `${SITE}?training`; }
  const { data: claimed } = await db.rpc("push_claim_note", { p_key: `${kind === "avail" ? "av" : "tav"}:${ref}|${player}`, p_value: row!.status });
  if (!claimed) return -1; // already told the coaches this answer
  const { data: subs } = await db.rpc("avail_coach_targets");
  if (!subs?.length) return 0;
  return await send(null, { title: `${said[0]} ${player} ${said[1]}`, body: where, url, tag: `av-${ref}-${player}` }, undefined, subs as Sub[]);
}

// remind the phones whose child hasn't answered; each phone's alert names its own children when it's signed in
async function remindAnswer(key: string, p: { p_match: string | null; p_day: string | null }, make: (kids: string[]) => Alert) {
  const { data: claimed } = await db.rpc("push_claim_note", { p_key: key, p_value: "sent" }); if (!claimed) return 0;
  const { data, error } = await db.rpc("avail_reminder_targets", p); if (error) throw error;
  const groups = new Map<string, Sub[]>();
  for (const r of (data ?? []) as (Sub & { kids: string[] })[]) {
    const k = JSON.stringify(r.kids ?? []); if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth });
  }
  let sent = 0;
  for (const [k, subs] of groups) sent += await send(null, make(JSON.parse(k)), undefined, subs);
  return sent;
}

// every minute: is it time for a reminder to answer?
const GAME_REMIND = { day: 3, from: 19 * 60 + 30, to: 21 * 60 };   // Wednesday, from 7.30pm (after training), for the next 7 days' games
async function availReminders(now: number) {
  let sent = 0;
  const wall = new Date(londonWall(now)), mins = wall.getUTCHours() * 60 + wall.getUTCMinutes();
  if (wall.getUTCDay() === GAME_REMIND.day && mins >= GAME_REMIND.from && mins < GAME_REMIND.to) {
    const { data } = await db.from("matches").select("id,date,opp,ko,venue,ha,us,postponed,stage,comp")
      .gte("date", londonDate(now + 864e5)).lte("date", londonDate(now + 7 * 864e5));
    for (const m of (data ?? []) as Match[]) {
      if (m.comp === "Tournament" || m.postponed || m.us != null || m.stage === "placeholder") continue;
      const day = new Date(m.date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
      const body = `${US} ${m.ha === "A" ? "at" : "v"} ${m.opp || "TBC"}, ${dayName(m.date)}${/\d[:.]\d\d/.test(m.ko || "") ? `, ${m.ko.trim()} KO` : ""}. Tap to answer yes, maybe or no.`;
      sent += await remindAnswer(`avr:${m.id}`, { p_match: m.id, p_day: null }, (kids) =>
        ({ title: `🗓️ Can ${kids.length ? names(kids) : "your child"} make ${day}'s game?`, body, url: `${SITE}?avail=${encodeURIComponent(m.id)}`, tag: `avr-${m.id}` }));
    }
  }
  // training: 24 hours before (up to two hours late, if the job was down). Only once a coach has set training up (a venue).
  const { data: tr } = await db.from("training").select("day,start,finish,venue,until,off").eq("id", 1).maybeSingle();
  const t = tr as Training | null;
  if (t?.venue) for (const date of [londonDate(now), londonDate(now + 864e5), londonDate(now + 2 * 864e5)]) {
    const wd = new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
    if (wd !== t.day || (t.off ?? []).includes(date) || (t.until && date > t.until)) continue;
    const start = kickOff(date, t.start); if (start == null) continue;
    const ahead = (start - now) / 36e5; if (ahead > 24 || ahead < 22) continue;
    const body = `${wd} ${clock(t.start)} to ${clock(t.finish)}, ${t.venue.split(",")[0]}. Tap to answer yes, maybe or no.`;
    sent += await remindAnswer(`trr:${date}`, { p_match: null, p_day: date }, (kids) =>
      ({ title: `🏃 Training tomorrow: can ${kids.length ? names(kids) : "your child"} come?`, body, url: `${SITE}?tavail=${date}`, tag: `trr-${date}` }));
  }
  return sent;
}

const COLS = "id,date,opp,ko,venue,ha,us,them,postponed,stage,comp,squad,potm,preview,live";
// the every-minute job: kick-off reminders, live updates nobody passed on, and reminders to answer availability
async function everyMinute(out: Record<string, number>) {
  const now = Date.now(), today = londonDate(now), tomorrow = londonDate(now + 864e5);
  const { data, error } = await db.from("matches").select(COLS).gte("date", today).lte("date", tomorrow); if (error) throw error;
  const list = (data ?? []) as Match[];
  out.reminders = (out.reminders ?? 0) + await reminders(list);
  out.live = out.live ?? 0; for (const m of list.filter((x) => x.date === today && x.live?.events?.length)) out.live += await flushLive(m);
  // a database without supabase/16_availability_alerts.sql yet: skip just this part
  try { out.availReminders = (out.availReminders ?? 0) + await availReminders(now); } catch (e) { console.error(SCHEMA, "availability reminders", (e as Error).message); }
}

async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const schema = typeof body.schema === "string" && /^[a-z][a-z0-9_]{0,40}$/.test(body.schema) ? body.schema : "public";
    await loadKeys();
    await useTeam(schema);
    const out: Record<string, number> = {};
    if (typeof body.avail === "object" && body.avail) {
      out.avail = await availAlert("avail", body.avail.match, body.avail.player);
    } else if (typeof body.tavail === "object" && body.tavail) {
      out.avail = await availAlert("tavail", body.tavail.day, body.tavail.player);
    } else if (typeof body.test === "string") {
      out.test = await send(null, { title: "🔔 Match alerts are on", body: `You'll get kick-off reminders and ${SCORES ? "live scores" : "live updates"} for the ${AGE}.`, url: SITE, tag: "welcome" }, body.test);
    } else if (typeof body.postponed === "string") {
      const { data } = await db.from("matches").select(COLS).eq("id", body.postponed).maybeSingle();
      out.postponed = data ? await postponedAlert(data as Match) : -1;
    } else if (typeof body.tsquad === "string") {
      const { data } = await db.from("tournaments").select("*").eq("id", body.tsquad).maybeSingle();
      out.tsquad = data ? await tSquadAlert(data as Tournament) : -1;
    } else if (typeof body.tournament === "string") {
      const { data } = await db.from("tournaments").select("*").eq("id", body.tournament).maybeSingle();
      out.tournament = data ? await tournamentAlert(data as Tournament) : -1;
    } else if (typeof body.preview === "string") {
      const { data } = await db.from("matches").select(COLS).eq("id", body.preview).maybeSingle();
      out.preview = data ? await previewAlert(data as Match) : -1;
    } else if (typeof body.squad === "string" || typeof body.potm === "string") {
      const id = typeof body.squad === "string" ? body.squad : body.potm;
      const { data } = await db.from("matches").select(COLS).eq("id", id).maybeSingle();
      if (typeof body.squad === "string") out.squad = data ? await squadAlert(data as Match) : -1;
      else out.potm = data ? await potmAlert(data as Match) : -1;
    } else if (typeof body.match === "string") {
      const { data } = await db.from("matches").select(COLS).eq("id", body.match).maybeSingle();
      out.live = data ? await flushLive(data as Match) : 0;
    } else if (schema !== "public") {
      await everyMinute(out);
    } else {
      // the cron job (no schema): this project's own team, then every team sharing the project
      await everyMinute(out);
      const { data: more } = await pub.rpc("alert_schemas");   // none before supabase/16_availability_alerts.sql
      for (const s of (more ?? []) as string[]) {
        try { await useTeam(s); await everyMinute(out); }
        catch (e) { console.error(s, (e as Error).message); }   // e.g. a schema not exposed in the Data API yet
      }
    }
    return new Response(JSON.stringify(out), { headers: { ...CORS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
}
// One request at a time: the team's details above are shared, so two teams' requests mustn't overlap.
let queue: Promise<unknown> = Promise.resolve();
Deno.serve((req) => { const r = queue.then(() => handle(req)); queue = r.catch(() => {}); return r; });
