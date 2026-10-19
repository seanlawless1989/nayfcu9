// Drafts a match preview with Claude for a coach to edit before saving.
//   POST {match: "<id>"}  from a signed-in coach's phone (the "Suggest a preview" button on the match page)
// Returns {text}. Nothing is saved here: the coach reads the draft, changes it and saves it themselves.
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
  played: Record<string, number> | null; postponed: boolean; stage: string; squad: string[] | null };
const res = (m: M) => m.us == null || m.them == null ? null : m.us > m.them ? "W" : m.us === m.them ? "D" : "L";
// same as oppKey() in docs/index.html, so head-to-heads match the site's
const key = (n: string) => String(n || "").toLowerCase().replace(/\bcls\b/g, "chester le street").replace(/[^a-z0-9 ]+/g, " ")
  .replace(/\b(a?fc|jfc|youth|juniors?|girls|the|c ?a|football club|club)\b/g, " ").replace(/\s+/g, " ").trim();
const seasonOf = (d: string) => { const y = +d.slice(0, 4), m = +d.slice(5, 7); const s = m >= 7 ? y : y - 1; return `${s}-${String((s + 1) % 100).padStart(2, "0")}`; };

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
  const sc = (x: M) => SCORES ? ` ${x.us}-${x.them}` : "";
  const word = { W: "won", D: "drew", L: "lost" } as const;
  const lines = [
    `Team: ${US} ${AGE} (grassroots football)`,
    `Next game: ${m.ha === "A" ? "away at" : m.ha === "H" ? "at home to" : "against"} ${m.opp}, ${new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`,
  ];
  if (m.ko) lines.push(`Kick-off: ${m.ko}`);
  if (m.venue) lines.push(`Venue: ${m.venue}`);
  if (m.comp) lines.push(`Competition: ${m.comp}`);
  const h = done.filter((x) => key(x.opp) === key(m.opp));
  if (h.length) lines.push(`Previous games against ${m.opp}: ${h.map((x) => `${x.date} ${word[res(x)!]}${sc(x)}`).join("; ")}`);
  else lines.push(`We haven't played ${m.opp} before.`);
  const form = done.slice(-5);
  if (form.length) lines.push(`Our last ${form.length} games (oldest first): ${form.map((x) => `${word[res(x)!]}${sc(x)} v ${x.opp}`).join("; ")}`);
  if (SCORES) {
    const goals: Record<string, number> = {};
    done.filter((x) => seasonOf(x.date) === seasonOf(m.date)).forEach((x) => Object.entries(x.played || {}).forEach(([n, g]) => goals[n] = (goals[n] || 0) + (+g || 0)));
    const top = Object.entries(goals).filter(([, g]) => g > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    if (top.length) lines.push(`Top scorers this season: ${top.map(([n, g]) => `${n} ${g}`).join(", ")}`);
  }
  if (m.squad?.length) lines.push(`Squad picked: ${m.squad.join(", ")}`);
  return lines.join("\n");
}

const SYSTEM = `You write short match previews for a children's grassroots football team's website. Parents and grandparents read them on their phones.
Write 2 or 3 short paragraphs, about 80 to 140 words in total, in warm, upbeat British English, as the team's coaches. Separate paragraphs with a blank line. Plain text only: no headings, no bullet points, no hashtags, at most one emoji.
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
    const { match } = await req.json();
    const { data: all, error } = await db.from("matches").select("id,date,opp,ha,venue,comp,ko,us,them,played,postponed,stage,squad");
    if (error) throw error;
    const m = (all as M[]).find((x) => x.id === match);
    if (!m) return out({ error: "not_found" }, 404);
    await loadTeam();
    const client = new Anthropic({ apiKey: KEY });
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: `Write a preview of our next game from these facts:\n\n${facts(m, all as M[])}` }],
    } as any);
    if (r.stop_reason === "refusal") return out({ error: "refused" }, 502);
    const text = r.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
    return text ? out({ text }) : out({ error: "empty" }, 502);
  } catch (e) {
    console.error(e);
    return out({ error: "failed" }, 500);
  }
});
