// Drafts a match preview or match report with Claude for a coach to edit before saving.
//   POST {match: "<id>"}                  "Suggest a preview" on an upcoming game's match page
//   POST {match: "<id>", kind: "report"}  "Suggest a report" on a played game: uses the result, awards and the Live-mode timeline
// Both come from a signed-in coach's phone. Returns {text}. Nothing is saved here: the coach reads the draft, changes it and saves it themselves.
// Needs the ANTHROPIC_API_KEY secret; without it this returns {error: "no_key"} and the site writes a simpler draft from the stats.
// Only facts already on the site go to Claude: opponents, dates, venues, results and the first names the site shows.
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const KEY = Deno.env.get("ANTHROPIC_API_KEY");
let US = Deno.env.get("TEAM_NAME") ?? "Newton Aycliffe";
let AGE = Deno.env.get("AGE_GROUP") ?? "Under 9s";
let SCORES = Deno.env.get("PUBLIC_SCORES") !== "false";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

type M = { id: string; date: string; opp: string; ha: string; venue: string; comp: string; ko: string; us: number | null; them: number | null;
  played: Record<string, number> | null; postponed: boolean; stage: string; squad: string[] | null;
  assists: Record<string, number> | null; potm: string | null; keepers: Record<string, number> | null; halves: Record<string, number> | null;
  live: { events?: Ev[] } | null; report: string | null };
type Ev = { k: string; m?: string; n?: string; a?: string; s?: string; on?: string; off?: string; form?: string; line?: string[] };
const res = (m: M) => m.us == null || m.them == null ? null : m.us > m.them ? "W" : m.us === m.them ? "D" : "L";
// same as oppKey() in docs/index.html, so head-to-heads match the site's
const key = (n: string) => String(n || "").toLowerCase().replace(/\bcls\b/g, "chester le street").replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\b(a?fc|jfc|youth|juniors?|girls|the|c ?a|football club|club)\b/g, " ").replace(/\s+/g, " ").trim();
const seasonOf = (d: string) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); const s = m >= 7 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

// FA youth rule: no scores, results, scorers or league tables published for under-7s to under-11s.
// The drafts follow it for those age groups even when the site itself shows scores.
const faAge = () => { const n = +((AGE.match(/\d+/) || [])[0] || 0); return n >= 7 && n <= 11; };
const noScoreText = () => !SCORES || faAge();

async function loadTeam() {
  const { data } = await db.from("team_settings").select("settings").eq("id", 1).maybeSingle();
  const t = data?.settings;
  if (!t) return;
  if (t.name) US = t.name;
  if (t.ageGroup) AGE = t.ageGroup;
  SCORES = SCORES && t.publicScores !== false;
}

function facts(m: M, all: M[]) {
  const done = all.filter((x) => res(x) && x.stage !== "placeholder" && x.date < m.date).sort((a, b) => a.date.localeCompare(b.date));
  const hide = noScoreText();
  const word = { W: "won", D: "drew", L: "lost" } as const;
  const lines = [
    `Team: ${US} ${AGE} (grassroots football)`,
    `Next game: ${m.ha === "A" ? "away at" : m.ha === "H" ? "at home to" : "against"} ${m.opp}, ${new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
  ];
  if (m.ko) lines.push(`Kick-off: ${m.ko}`);
  if (m.venue) lines.push(`Venue: ${m.venue}`);
  if (m.comp) lines.push(`Competition: ${m.comp}`);
  const h = done.filter((x) => key(x.opp) === key(m.opp));
  if (h.length) lines.push(hide ? `We've played ${m.opp} ${h.length} time${h.length > 1 ? "s" : ""} before.` : `Previous games against ${m.opp}: ${h.map((x) => `${x.date} ${word[res(x)!]} ${x.us}-${x.them}`).join("; ")}`);
  else lines.push(`We haven't played ${m.opp} before.`);
  const form = done.slice(-5);
  if (form.length && !hide) lines.push(`Our last ${form.length} games (oldest first): ${form.map((x) => `${word[res(x)!]} ${x.us}-${x.them} v ${x.opp}`).join("; ")}`);
  if (hide) lines.push("FA youth rules: don't mention any scores, results, win/loss records, goals, scorers or league positions.");
  else {
    const goals: Record<string, number> = {};
    done.filter((x) => seasonOf(x.date) === seasonOf(m.date)).forEach((x) => Object.entries(x.played || {}).forEach(([n, g]) => goals[n] = (goals[n] || 0) + (+g || 0)));
    const top = Object.entries(goals).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) lines.push(`Top scorers this season: ${top.map(([n, g]) => `${n} ${g}`).join(", ")}`);
  }
  if (m.squad?.length) lines.push(`Squad picked: ${m.squad.join(", ")}`);
  return lines.join("\n");
}

// what happened in a played game, in order, from the Live-mode timeline when there is one
function reportFacts(m: M, all: M[]) {
  const lines = [`Team: ${US} ${AGE} (grassroots football)`,
    `Game: ${m.ha === "A" ? "away at" : m.ha === "H" ? "at home to" : "against"} ${m.opp}, ${new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}${m.comp ? `, ${m.comp}` : ""}`];
  if (m.venue) lines.push(`Venue: ${m.venue}`);
  const SCORES = !noScoreText(), r = res(m);
  if (SCORES && r) lines.push(`Result: ${{ W: "won", D: "drew", L: "lost" }[r]} ${m.us}-${m.them}`);
  if (!SCORES) lines.push("FA youth rules: don't mention the score, the result (won, drew or lost), goals, who scored or assisted, clean sheets or league positions.");
  const pl = Object.keys(m.played || {});
  if (pl.length) lines.push(`Played: ${pl.join(", ")}`);
  if (SCORES) {
    const g = Object.entries(m.played || {}).filter(([, n]) => +n > 0);
    if (g.length) lines.push(`Our scorers: ${g.map(([n, c]) => +c > 1 ? `${n} ${c}` : n).join(", ")}`);
    const a = Object.entries(m.assists || {}).filter(([, n]) => +n > 0);
    if (a.length) lines.push(`Assists: ${a.map(([n, c]) => +c > 1 ? `${n} ${c}` : n).join(", ")}`);
  }
  const k = Object.entries(m.keepers || {});
  if (k.length) lines.push(`In goal: ${k.map(([n, c]) => n + (SCORES && +c ? " (clean sheet)" : "")).join(", ")}`);
  if (m.potm) lines.push(`Player of the match: ${m.potm}`);
  const ev = m.live?.events || [];
  const tl = ev.map((e) => {
    const t = e.m ? `${e.m} ` : "";
    switch (e.k) {
      case "ko": return `Kick-off, ${e.form} formation: ${(e.line || []).join(", ")} (first named in goal)`;
      case "goal": return SCORES ? `${t}GOAL ${e.n}${e.a ? `, assisted by ${e.a}` : ""} (${e.s})` : "";
      case "them": return SCORES ? `${t}${m.opp} scored (${e.s})` : "";
      case "sub": return `${t}${e.on} on for ${e.off}`;
      case "gk": return `${t}${e.n} went in goal`;
      case "form": return `${t}switched to ${e.form}`;
      case "ht": return `Half time${SCORES && e.s ? ` (${e.s})` : ""}`;
      case "2h": return "Second half started";
      case "ft": return `Full time${SCORES && e.s ? ` (${e.s})` : ""}`;
    }
    return "";
  }).filter(Boolean);
  lines.push(tl.length ? `Timeline, in order:\n${tl.join("\n")}` : "There is no minute-by-minute timeline for this game.");
  const h = all.filter((x) => res(x) && x.id !== m.id && x.date < m.date && key(x.opp) === key(m.opp));
  if (h.length) lines.push(`We'd played ${m.opp} ${h.length} time${h.length > 1 ? "s" : ""} before this.`);
  // the coaches' last two reports, so the draft sounds like them
  const ex = all.filter((x) => x.report?.trim() && x.id !== m.id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
  return { facts: lines.join("\n"), examples: ex.map((x) => x.report!.trim()) };
}

const REPORT = `You write match reports for a children's grassroots football team's website. Parents and grandparents read them on their phones, and coaches share them in the parents' WhatsApp group.
Write as the team's coaches, in warm British English, 120 to 220 words, in short paragraphs separated by blank lines. Plain text only: no headings or bullet points. Add a few fitting emojis through the report (about 4 to 6, such as ⚽ 🧤 💪 🙌 👏 💛), as parents would in a WhatsApp group.
Tell the story of the game in order using the timeline when there is one (goals, assists, substitutions, half time). Use only the facts you are given: don't invent moments, saves, tactics, weather, quotes or details about the opponents. Only mention players by the first names given. Be positive about every child, never single anyone out for criticism, and praise effort and teamwork whatever the result. Mention the player of the match if there is one.
If you're told not to mention scores, results or scorers, follow that strictly, even if the example reports include them: tell the story through effort, teamwork, substitutions, the keepers and the player of the match instead.
If example reports are given, match their tone, length and style, but never copy facts from them.`;

const SYSTEM = `You write short match previews for a children's grassroots football team's website. Parents and grandparents read them on their phones.
Write 2 or 3 short paragraphs, about 80 to 140 words in total, in warm, upbeat British English, as the team's coaches. Separate paragraphs with a blank line. Plain text only: no headings, no bullet points, no hashtags. Add a few fitting emojis (about 3 to 5, such as ⚽ 💪 🙌 💛), as parents would in a WhatsApp group.
Use only the facts you are given. Don't invent players, injuries, tactics, weather, quotes or anything about the opponents beyond what's listed. Only mention players by the first names given, and never single out a child for criticism. Keep the focus on effort, fun and teamwork rather than on having to win.
If there are no previous meetings, say it's a first meeting. If a fact (like kick-off time or venue) is missing, leave it out rather than guessing. End with a friendly line to parents, for example about coming along to support.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // coaches only: check the caller's sign-in against public.coaches
    const auth = req.headers.get("Authorization") ?? "";
    const me = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: ok } = await me.rpc("is_coach");
    if (!ok) return out({ error: "coaches_only" }, 403);
    if (!KEY) return out({ error: "no_key" }); // 200 so the site can read why
    const { match, kind } = await req.json();
    const { data: all, error } = await db.from("matches").select("id,date,opp,ha,venue,comp,ko,us,them,played,postponed,stage,squad,assists,potm,keepers,halves,live,report");
    if (error) throw error;
    const m = (all as M[]).find((x) => x.id === match);
    if (!m) return out({ error: "not_found" }, 404);
    await loadTeam();
    let system = SYSTEM, content = `Write a preview of our next game from these facts:\n\n${facts(m, all as M[])}`;
    if (kind === "report") {
      const r = reportFacts(m, all as M[]);
      system = REPORT;
      content = `${r.examples.length ? r.examples.map((t, i) => `<example_report_${i + 1}>\n${t}\n</example_report_${i + 1}>`).join("\n\n") + "\n\n" : ""}Write the report for this game from these facts:\n\n${r.facts}`;
    }
    const client = new Anthropic({ apiKey: KEY });
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content }],
    } as any);
    if (r.stop_reason === "refusal") return out({ error: "refused" }, 502);
    const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    return text ? out({ text }) : out({ error: "empty" }, 502);
  } catch (e) {
    console.error(e);
    return out({ error: "failed" }, 500);
  }
});
