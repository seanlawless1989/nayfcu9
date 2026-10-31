// Calendar feed (.ics) of fixtures, tournaments and training that families subscribe to on their phones.
//   GET              matches, tournaments and weekly training
//   GET ?training=0  matches and tournaments only
//   GET ?team=<schema>&site=<url>  another team that shares this Supabase project (tools/team_schema_sql.py)
// Phones check the feed every few hours, so new kick-off times and venues turn up on their own.
// Deployed with verify_jwt off (calendar apps can't send a key). It reads with the public key, so it only sees
// what the website already shows. See supabase/4_gallery_training.sql.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

let SITE = Deno.env.get("SITE_URL") ?? "https://nayfootball.club/";
// Team details come from the function's secrets so the same code serves any team; defaults are Newton Aycliffe's.
let TEAM = Deno.env.get("APP_NAME") ?? "NAYFC U9s";
let FULL = Deno.env.get("TEAM_FULL_NAME") ?? "Newton Aycliffe Youth FC";
let AGE = Deno.env.get("AGE_GROUP") ?? "Under 9s";
let SCORES = Deno.env.get("PUBLIC_SCORES") !== "false";   // false: no scores in event titles
let SPORT = Deno.env.get("SPORT") ?? "football";            // rugby teams get a rugby ball on their games
let HOST = new URL(SITE).hostname;
const ENV = { SITE, TEAM, FULL, AGE, SCORES, SPORT };
const client = (schema = "public") =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { db: { schema }, auth: { persistSession: false } });
const HOME = client();
let db = HOME;
// Which team this request is for. Without ?team it's the project's own team (the secrets above).
function pickTeam(url: URL): boolean {
  ({ SITE, TEAM, FULL, AGE, SCORES, SPORT } = ENV);
  LEAGUE = ENV_LEAGUE;
  db = HOME;
  const team = url.searchParams.get("team");
  if (!team) return true;
  if (!/^[a-z][a-z0-9_]{0,40}$/.test(team)) return false;
  let site: URL;
  try { site = new URL(url.searchParams.get("site") ?? ""); } catch { return false; }
  if (site.protocol !== "https:") return false;
  SITE = site.origin + site.pathname;
  db = client(team);
  TEAM = FULL = AGE = "";   // filled in from that team's Team setup answers
  LEAGUE = "League";
  return true;
}
const ENV_LEAGUE = "Russell Foster League";
let LEAGUE = ENV_LEAGUE;
const compName = (c: string) => (c === "League" ? LEAGUE : c);
// A coach's answers on the site's Team setup page (supabase/7_team_setup.sql) win over the secrets above.
// Scores stay hidden if either the secret or the setup page says so.
const ENV_SCORES = SCORES;
async function loadTeam() {
  const { data, error } = await db.from("team_settings").select("settings").eq("id", 1).maybeSingle();
  const t = error ? null : data?.settings;
  if (!t) return;
  if (t.appName) TEAM = t.appName;
  if (t.fullName) FULL = t.fullName;
  if (t.ageGroup) AGE = t.ageGroup;
  if (t.league) LEAGUE = t.league;
  if (t.sport) SPORT = t.sport;
  SCORES = ENV_SCORES && t.publicScores !== false;
}
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Match = { id: string; date: string; opp: string; ha: string; venue: string; comp: string; ko: string; us: number | null; them: number | null; postponed: boolean; stage: string; tournament_id: string | null; updated: string };
type Tournament = { id: string; name: string; date: string | null; end_date: string | null; venue: string; trophy: string };
type Training = { day: string; start: string; finish: string; venue: string; kit: string; notes: string; until: string | null; off: string[] };

// ---- iCalendar text ----
const esc = (s: string) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// lines longer than 75 bytes are folded onto continuation lines that start with a space
function fold(line: string) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "", n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
const ymd = (iso: string) => iso.replaceAll("-", "");
const hm = (t: string) => /^(\d{1,2}):(\d{2})/.exec(t || "");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
function addDays(iso: string, n: number) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function local(iso: string, t: string, plusMin = 0) {
  const m = hm(t)!; const total = +m[1] * 60 + +m[2] + plusMin;
  const d = addDays(iso, Math.floor(total / 1440)), r = total % 1440;
  return `${ymd(d)}T${String(Math.floor(r / 60)).padStart(2, "0")}${String(r % 60).padStart(2, "0")}00`;
}
function when(date: string, ko: string, mins: number) {
  return hm(ko)
    ? [`DTSTART;TZID=Europe/London:${local(date, ko)}`, `DTEND;TZID=Europe/London:${local(date, ko, mins)}`]
    : [`DTSTART;VALUE=DATE:${ymd(date)}`, `DTEND;VALUE=DATE:${ymd(addDays(date, 1))}`];
}
function event(uid: string, lines: string[], fields: Record<string, string>) {
  const out = ["BEGIN:VEVENT", `UID:${uid}@${HOST}`, `DTSTAMP:${stamp(new Date())}`, ...lines];
  for (const [k, v] of Object.entries(fields)) if (v) out.push(`${k}:${k === "URL" ? v : esc(v)}`);
  out.push("END:VEVENT");
  return out;
}
const TZ = ["BEGIN:VTIMEZONE", "TZID:Europe/London",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:BST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:GMT", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

function matchEvent(m: Match) {
  const played = SCORES && m.us != null && m.them != null;
  const title = played ? `${TEAM} ${m.us}-${m.them} ${m.opp}` : `${TEAM} v ${m.opp || "opponent to be confirmed"}${hm(m.ko) ? "" : " (kick-off TBC)"}`;
  const where = m.ha === "H" ? "Home" : m.ha === "A" ? "Away" : "";
  const desc = [[compName(m.comp), where].filter(Boolean).join(" · "), hm(m.ko) ? `Kick-off ${m.ko}` : "Kick-off time to be confirmed",
    m.venue ? `Venue: ${m.venue}` : "Venue to be confirmed", "", `Match page: ${SITE}?match=${encodeURIComponent(m.id)}`].join("\n");
  // "updated" moves on every edit (supabase/6_match_updated.sql); SEQUENCE rises with it so calendars treat the
  // event as a newer version of the same game rather than keeping the old one.
  const lm = m.updated ? [`LAST-MODIFIED:${stamp(new Date(m.updated))}`, `SEQUENCE:${Math.max(0, Math.floor((Date.parse(m.updated) - Date.UTC(2026, 0, 1)) / 60000))}`] : [];
  return event(`match-${m.id}`, [...when(m.date, m.ko, 60), ...lm], { SUMMARY: (SPORT.startsWith("rugby") ? "🏉 " : "⚽ ") + title, LOCATION: m.venue, DESCRIPTION: desc, URL: `${SITE}?match=${encodeURIComponent(m.id)}` });
}
// One event per tournament day. Day 1 keeps the tournament's original UID, so a one-day tournament that becomes
// a two-day one updates in place and gains a second event.
function tournamentEvents(t: Tournament, games: Match[]) {
  const start = t.date || games[0]?.date;
  if (!start) return [];
  const end = t.end_date && t.end_date > start ? t.end_date : start;
  const days: string[] = [];
  for (let d = start; d <= end && days.length < 14; d = addDays(d, 1)) days.push(d);
  const multi = days.length > 1;
  return days.flatMap((date, i) => {
    const today = multi ? games.filter((g) => g.date === date) : games;
    const ko = today.map((g) => g.ko).filter((k) => hm(k)).sort()[0] || "";
    const day = multi ? `day ${i + 1} of ${days.length}` : "";
    const desc = [`Tournament${day ? `, ${day}` : ""}${today.length ? `, ${today.length} game${today.length > 1 ? "s" : ""}` : ""}`, ko ? `First kick-off ${ko}` : "Kick-off times to be confirmed",
      t.venue ? `Venue: ${t.venue}` : "", t.trophy && i === days.length - 1 ? `Result: ${t.trophy}` : "", "", SITE].filter((x, j) => x || j === 4).join("\n");
    return event(i ? `tournament-${t.id}-day${i + 1}` : `tournament-${t.id}`, when(date, ko, 240),
      { SUMMARY: `🏆 ${TEAM}: ${t.name}${day ? ` (${day})` : ""}${ko ? "" : " (times TBC)"}`, LOCATION: t.venue, DESCRIPTION: desc, URL: SITE });
  });
}
function trainingEvent(t: Training, from: string) {
  const day = DAYS.indexOf(t.day);
  if (day < 0 || !hm(t.start) || !hm(t.finish)) return [];
  let first = from;
  while (new Date(first + "T12:00:00Z").getUTCDay() !== day) first = addDays(first, 1);
  if (t.until && t.until < first) return [];
  const [sh, sm] = hm(t.start)!.slice(1).map(Number), [fh, fm] = hm(t.finish)!.slice(1).map(Number);
  const mins = Math.max(15, fh * 60 + fm - (sh * 60 + sm));
  const byday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][day];
  const lines = [...when(first, t.start, mins), `RRULE:FREQ=WEEKLY;BYDAY=${byday}${t.until ? `;UNTIL=${ymd(t.until)}T235959Z` : ""}`];
  if (t.off?.length) lines.push(`EXDATE;TZID=Europe/London:${t.off.map((d) => local(d, t.start)).join(",")}`);
  const desc = [t.kit ? `Bring: ${t.kit}` : "", t.notes, "", `${SITE}?training`].filter((x, i, a) => x || i === a.length - 2).join("\n");
  return event("training", lines, { SUMMARY: `🏃 ${TEAM} training`, LOCATION: t.venue, DESCRIPTION: desc, URL: `${SITE}?training` });
}

// One request at a time: the team details above are shared, and requests are quick.
let queue: Promise<unknown> = Promise.resolve();
Deno.serve((req) => {
  const r = queue.then(() => feed(req));
  queue = r.catch(() => {});
  return r;
});

async function feed(req: Request) {
  const url = new URL(req.url);
  const withTraining = url.searchParams.get("training") !== "0";
  if (!pickTeam(url)) return new Response("Unknown team", { status: 400 });
  const team = url.searchParams.get("team");
  HOST = (team ? team.replace(/_/g, "-") + "." : "") + new URL(SITE).hostname;   // event ids stay unique per team
  await loadTeam();
  TEAM ||= FULL || "Team";
  FULL ||= TEAM;
  const today = new Date().toISOString().slice(0, 10);
  const since = addDays(today, -120); // recent results stay in the calendar for a few months
  const [mq, tq, trq] = await Promise.all([
    db.from("matches").select("id,date,opp,ha,venue,comp,ko,us,them,postponed,stage,tournament_id,updated").gte("date", since).order("date"),
    db.from("tournaments").select("id,name,date,end_date,venue,trophy").gte("date", since),
    withTraining ? db.from("training").select("*").eq("id", 1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (mq.error || tq.error) return new Response("Calendar is unavailable right now", { status: 503 });
  const matches = (mq.data as Match[]).filter((m) => !m.postponed && m.stage !== "placeholder");
  const tours = (tq.data as Tournament[]) || [];
  const tIds = new Set(tours.map((t) => t.id));
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${FULL}//${TEAM} fixtures//EN`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${TEAM}`, `X-WR-CALDESC:${FULL} ${AGE} fixtures` + (withTraining ? " and training" : ""), "X-WR-TIMEZONE:Europe/London",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H", ...TZ];
  for (const m of matches) if (!m.tournament_id || !tIds.has(m.tournament_id)) out.push(...matchEvent(m));
  for (const t of tours) out.push(...tournamentEvents(t, matches.filter((m) => m.tournament_id === t.id)));
  if (trq.data) out.push(...trainingEvent(trq.data as Training, since > "2026-09-01" ? since : "2026-09-01"));
  out.push("END:VCALENDAR");
  return new Response(out.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="nayfc-u9s.ics"',
      "Cache-Control": "public, max-age=900",
      "X-Robots-Tag": "noindex, nofollow",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
