// Calendar feed (.ics) of fixtures, tournaments and training that families subscribe to on their phones.
//   GET              matches, tournaments and weekly training
//   GET ?training=0  matches and tournaments only
// Phones check the feed every few hours, so new kick-off times and venues turn up on their own.
// Deployed with verify_jwt off (calendar apps can't send a key). It reads with the public key, so it only sees
// what the website already shows. See supabase/4_gallery_training.sql.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = Deno.env.get("SITE_URL") ?? "https://nayfootball.club/";
const TEAM = "NAYFC U9s";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
const compName = (c: string) => (c === "League" ? "Russell Foster League" : c);
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Match = { id: string; date: string; opp: string; ha: string; venue: string; comp: string; ko: string; us: number | null; them: number | null; postponed: boolean; stage: string; tournament_id: string | null; updated: string };
type Tournament = { id: string; name: string; date: string | null; venue: string; trophy: string };
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
  const out = ["BEGIN:VEVENT", `UID:${uid}@nayfootball.club`, `DTSTAMP:${stamp(new Date())}`, ...lines];
  for (const [k, v] of Object.entries(fields)) if (v) out.push(`${k}:${k === "URL" ? v : esc(v)}`);
  out.push("END:VEVENT");
  return out;
}
const TZ = ["BEGIN:VTIMEZONE", "TZID:Europe/London",
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0000", "TZOFFSETTO:+0100", "TZNAME:BST", "DTSTART:19700329T010000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0000", "TZNAME:GMT", "DTSTART:19701025T020000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE"];

function matchEvent(m: Match) {
  const played = m.us != null && m.them != null;
  const title = played ? `${TEAM} ${m.us}-${m.them} ${m.opp}` : `${TEAM} v ${m.opp || "opponent to be confirmed"}${hm(m.ko) ? "" : " (kick-off TBC)"}`;
  const where = m.ha === "H" ? "Home" : m.ha === "A" ? "Away" : "";
  const desc = [[compName(m.comp), where].filter(Boolean).join(" · "), hm(m.ko) ? `Kick-off ${m.ko}` : "Kick-off time to be confirmed",
    m.venue ? `Venue: ${m.venue}` : "Venue to be confirmed", "", `Match page: ${SITE}?match=${encodeURIComponent(m.id)}`].join("\n");
  const lm = m.updated ? [`LAST-MODIFIED:${stamp(new Date(m.updated))}`] : [];
  return event(`match-${m.id}`, [...when(m.date, m.ko, 60), ...lm], { SUMMARY: "⚽ " + title, LOCATION: m.venue, DESCRIPTION: desc, URL: `${SITE}?match=${encodeURIComponent(m.id)}` });
}
function tournamentEvent(t: Tournament, games: Match[]) {
  const ko = games.map((g) => g.ko).filter((k) => hm(k)).sort()[0] || "";
  const date = t.date || games[0]?.date;
  if (!date) return [];
  const desc = [`Tournament${games.length ? `, ${games.length} game${games.length > 1 ? "s" : ""}` : ""}`, ko ? `First kick-off ${ko}` : "Kick-off times to be confirmed",
    t.venue ? `Venue: ${t.venue}` : "", t.trophy ? `Result: ${t.trophy}` : "", "", SITE].filter((x, i) => x || i === 4).join("\n");
  return event(`tournament-${t.id}`, when(date, ko, 240), { SUMMARY: `🏆 ${TEAM}: ${t.name}${ko ? "" : " (times TBC)"}`, LOCATION: t.venue, DESCRIPTION: desc, URL: SITE });
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

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const withTraining = url.searchParams.get("training") !== "0";
  const today = new Date().toISOString().slice(0, 10);
  const since = addDays(today, -120); // recent results stay in the calendar for a few months
  const [mq, tq, trq] = await Promise.all([
    db.from("matches").select("id,date,opp,ha,venue,comp,ko,us,them,postponed,stage,tournament_id,updated").gte("date", since).order("date"),
    db.from("tournaments").select("id,name,date,venue,trophy").gte("date", since),
    withTraining ? db.from("training").select("*").eq("id", 1).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (mq.error || tq.error) return new Response("Calendar is unavailable right now", { status: 503 });
  const matches = (mq.data as Match[]).filter((m) => !m.postponed && m.stage !== "placeholder");
  const tours = (tq.data as Tournament[]) || [];
  const tIds = new Set(tours.map((t) => t.id));
  const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Newton Aycliffe Youth FC//U9s fixtures//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "X-WR-CALNAME:NAYFC U9s", "X-WR-CALDESC:Newton Aycliffe Youth FC Under 9s fixtures" + (withTraining ? " and training" : ""), "X-WR-TIMEZONE:Europe/London",
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H", ...TZ];
  for (const m of matches) if (!m.tournament_id || !tIds.has(m.tournament_id)) out.push(...matchEvent(m));
  for (const t of tours) out.push(...tournamentEvent(t, matches.filter((m) => m.tournament_id === t.id)));
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
});
