// Reads a team's fixtures page on FA Full-Time (fulltime.thefa.com) so a coach can import league fixtures
// instead of typing them. The site can't fetch Full-Time itself (browsers block it), so this does it.
//   GET ?url=https://fulltime.thefa.com/fixtures.html?...   ->  {rows: [["L", "25/10/26 10:00", "Home team", "V", "Away team", "Venue", ...], ...]}
// Only Full-Time pages are fetched, so this can't be used to reach anything else. The site picks out the
// rows with the team's name in them and the coach chooses which to add. Deploy with verify_jwt on.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const text = (h: string) => h.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const raw = new URL(req.url).searchParams.get("url") ?? (await req.json().catch(() => ({}))).url ?? "";
  let u: URL;
  try { u = new URL(raw); } catch { return json({ error: "Paste the address of the team's Fixtures page on Full-Time." }, 400); }
  if (u.protocol !== "https:" || u.hostname !== "fulltime.thefa.com") return json({ error: "That isn't a Full-Time page (fulltime.thefa.com)." }, 400);
  try {
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0 (team website fixtures import)" } });
    if (!r.ok) return json({ error: `Full-Time said ${r.status}.` }, 502);
    const html = await r.text();
    const rows = [...html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)]
      .map((m) => [...m[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => text(c[1])))
      .filter((cells) => cells.some((c) => /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c)));
    // some Full-Time layouts use divs instead of a table: fall back to blocks of text around each date
    if (!rows.length) {
      const t = html.replace(/<\/(div|li|p|span)>/gi, "\n").split("\n").map(text).filter(Boolean);
      t.forEach((line, i) => { if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(line)) rows.push([line, ...t.slice(i + 1, i + 6)].map((x) => x.trim()).filter(Boolean)); });
    }
    return json({ rows: rows.slice(0, 300) });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
