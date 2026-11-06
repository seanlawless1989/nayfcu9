// The pitch fundraiser's payments (supabase/32_fundraiser.sql). Supporters buy a square on the team's virtual pitch;
// the money goes straight to the club's own Stripe account and Touchline Tales' fee is taken by Stripe on the way.
// Touchline Tales never holds club money. It's a donation, not a raffle: no prizes, ever (see the SQL file).
//
//   POST {action:"info"}                          anyone: can this team take payments yet, and what's our fee
//   POST {action:"checkout", fundraiser, idx, gold, name, message, anon, cover, email, site}
//                                                 anyone: hold the square for 35 minutes and return what the page needs to
//                                                 show Stripe's embedded payment form: {client_secret, account, pk, square}
//   POST {action:"confirm", session}              anyone, back from Stripe: marks the square paid if Stripe says so
//   POST {action:"connect", site}                 coaches: start (or carry on) linking the club's Stripe account
//   POST {action:"status"}                        coaches: is the club's Stripe account ready yet
//   POST {action:"refund", square}                coaches: refund a square; our fee goes back too
//   Stripe webhook (Connect events)               checkout.session.completed / async_payment_succeeded / expired
// Add schema: "<schema>" for a team that shares this project in its own schema, as with the other functions.
//
// Secrets: STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY (Touchline Tales' platform account; the publishable key is
// handed to the page so it can draw the payment form), STRIPE_WEBHOOK_SECRET (the Connect webhook's signing
// secret), optional FEE_BPS (our fee in hundredths of a percent, default 500 = 5%) and FREE_SCHEMAS (teams that pay no
// fee, default the Newton Aycliffe teams). Deploy with JWT checks off (--no-verify-jwt): Stripe's webhook has no
// Supabase login, so coach actions check the caller themselves.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const STRIPE = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
const STRIPE_PK = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
// the embedded payment form (Checkout ui_mode "form") needs this API version or later
const STRIPE_VERSION = "2026-03-25.dahlia";
const WHSEC = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const FEE_BPS = Math.max(0, Math.min(3000, +(Deno.env.get("FEE_BPS") ?? "500") || 0));
// Sean, 4 Nov 2026: Newton Aycliffe teams pay no fee (the money goes back into the club anyway)
const FREE = new Set((Deno.env.get("FREE_SCHEMAS") ?? "public,na_u11_pumas,na_u11_wildcats").split(",").map((s) => s.trim()).filter(Boolean));
// where Stripe may send people back to: our own team sites only
const SITE_OK = /^https:\/\/((www\.)?touchlinetales\.club|(www\.)?nayfootball\.club|seanlawless1989\.github\.io)\/[A-Za-z0-9_\-\/.]*$/;
const HOLD_MIN = 35;   // Stripe's checkout page lasts 30 minutes; the hold outlives it so a late payment still finds its square

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Client = ReturnType<typeof createClient<any, any, any>>;
const clients: Record<string, Client> = {};
const service = (schema: string) => clients[schema] ??= createClient(URL_, SERVICE, { db: { schema }, auth: { persistSession: false } });
const feeBps = (schema: string) => FREE.has(schema) ? 0 : FEE_BPS;
const SCHEMA_OK = /^[a-z][a-z0-9_]{0,40}$/;

// ---------- Stripe, over plain HTTPS ----------
function form(o: Record<string, unknown>, pre = "", acc: string[] = []) {
  for (const [k, v] of Object.entries(o)) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === "object") form(v as Record<string, unknown>, key, acc);
    else acc.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return acc;
}
// deno-lint-ignore no-explicit-any
async function stripe(method: string, path: string, body?: Record<string, unknown>, account?: string): Promise<any> {
  const h: Record<string, string> = { Authorization: `Bearer ${STRIPE}`, "Stripe-Version": STRIPE_VERSION };
  if (account) h["Stripe-Account"] = account;
  if (body) h["Content-Type"] = "application/x-www-form-urlencoded";
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method, headers: h, body: body ? form(body).join("&") : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message ?? `Stripe ${r.status}`);
  return j;
}

// Stripe-Signature: t=<time>,v1=<hmac>. HMAC-SHA256 of "<time>.<body>" with the webhook secret; within 5 minutes.
async function verified(raw: string, sig: string) {
  if (!WHSEC) return false;
  const parts = Object.fromEntries(sig.split(",").map((p) => p.split("=", 2)).filter((p) => p.length === 2).map(([k, v]) => [k, v]));
  const t = +parts.t;
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WHSEC), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const v1s = sig.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  return v1s.some((v) => v.length === hex.length && [...v].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

async function account(db: Client) {
  const { data } = await db.from("fund_account").select("stripe, ready").eq("id", 1).maybeSingle();
  return data as { stripe: string | null; ready: boolean } | null;
}

// a supporter's card fee, so "cover the card fee" leaves the club the full square price (UK cards 1.5% + 20p)
const withCardFee = (p: number) => Math.ceil((p + 20) / (1 - 0.015));

// Stripe says this checkout is paid: the square is the supporter's
// deno-lint-ignore no-explicit-any
async function markPaid(db: Client, s: any) {
  const id = +(s.metadata?.square ?? 0);
  if (!id || s.payment_status !== "paid") return null;
  const row = { state: "paid", amount: s.amount_total ?? null, payment: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null,
    email: s.customer_details?.email ?? s.customer_email ?? null, paid_at: new Date().toISOString(), held_until: null };
  const { data } = await db.from("fund_squares").update(row).eq("id", id).in("state", ["held", "paid"]).select("id, idx, name, gold").maybeSingle();
  if (data) return data;
  // the hold was lost (it shouldn't be: holds outlive Stripe's page). Keep the payment on record without a square;
  // coaches see it on the Fundraiser page and can refund it.
  const { data: old } = await db.from("fund_squares").select("id, state").eq("id", id).maybeSingle();
  if (old) { await db.from("fund_squares").update({ ...row, idx: null }).eq("id", id); return { id, idx: null }; }
  return null;
}

async function isCoach(req: Request, schema: string) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return false;
  const me = createClient(URL_, ANON, { db: { schema }, global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data } = await me.rpc("is_coach");
  return data === true;
}

const clean = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "post" }, 405);
  const raw = await req.text();

  // ---------- Stripe's webhook ----------
  const sig = req.headers.get("Stripe-Signature");
  if (sig) {
    if (!(await verified(raw, sig))) return out({ error: "signature" }, 400);
    const ev = JSON.parse(raw);
    const s = ev.data?.object ?? {};
    const schema = s.metadata?.schema;
    if (ev.type?.startsWith("checkout.session.") && typeof schema === "string" && SCHEMA_OK.test(schema)) {
      const db = service(schema);
      const acct = await account(db);
      if (!acct?.stripe || acct.stripe !== ev.account) return out({ ok: true, skipped: "account" });
      if (ev.type === "checkout.session.completed" || ev.type === "checkout.session.async_payment_succeeded") await markPaid(db, s);
      if (ev.type === "checkout.session.expired" && s.metadata?.square) await db.from("fund_squares").delete().eq("id", +s.metadata.square).eq("state", "held");
    }
    return out({ ok: true });
  }

  // deno-lint-ignore no-explicit-any
  let b: any = {};
  try { b = JSON.parse(raw || "{}"); } catch { return out({ error: "json" }, 400); }
  const schema = typeof b.schema === "string" && SCHEMA_OK.test(b.schema) ? b.schema : "public";
  const db = service(schema);
  const fee = feeBps(schema);
  try {
    if (b.action === "info") {
      const a = await account(db);
      return out({ ready: !!(STRIPE && STRIPE_PK && a?.stripe && a.ready), fee_bps: fee, stripe: !!(STRIPE && STRIPE_PK) });
    }

    if (b.action === "checkout") {
      if (!STRIPE || !STRIPE_PK) return out({ error: "not_ready" });
      const a = await account(db);
      if (!a?.stripe || !a.ready) return out({ error: "not_ready" });
      const site = String(b.site ?? "");
      if (!SITE_OK.test(site)) return out({ error: "site" }, 400);
      const { data: f } = await db.from("fundraisers").select("*").eq("id", +b.fundraiser).maybeSingle();
      if (!f || f.status !== "live") return out({ error: "closed" });
      if (f.ends && f.ends < new Date().toISOString().slice(0, 10)) return out({ error: "closed" });
      const idx = Math.floor(+b.idx);
      if (!(idx >= 0 && idx < f.cols * f.rows)) return out({ error: "square" }, 400);
      const gold = !!b.gold && !!f.gold;
      const name = clean(b.name, 30) || "A supporter";
      const message = clean(b.message, 80) || null;
      const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(b.email ?? "")) ? String(b.email).slice(0, 200) : undefined;
      // free up holds whose payment page has run out, then hold this one
      await db.from("fund_squares").delete().eq("fundraiser", f.id).eq("state", "held").lt("held_until", new Date().toISOString());
      const { data: sq, error } = await db.from("fund_squares").insert({ fundraiser: f.id, idx, gold, name, message, anon: !!b.anon,
        held_until: new Date(Date.now() + HOLD_MIN * 60e3).toISOString() }).select("id").single();
      if (error) return out({ error: error.code === "23505" ? "taken" : "save" });
      const price = gold ? f.gold : f.price;
      const total = b.cover ? withCardFee(price) : price;
      const ours = Math.round(price * fee / 10000);
      const back = site.split("?")[0].split("#")[0];
      try {
        // Stripe's embedded form: it draws inside our page, on the club's own account (a direct charge)
        const s = await stripe("POST", "checkout/sessions", {
          ui_mode: "form",
          integration_identifier: "custom_embedded_web_0001",
          billing_address_collection: "auto",
          phone_number_collection: { enabled: false },
          automatic_tax: { enabled: false },
          submit_type: "auto",
          mode: "payment",
          line_items: { 0: { quantity: 1, price_data: { currency: "gbp", unit_amount: total,
            product_data: { name: `${gold ? "Gold square" : "A square"} on the pitch: ${f.title}`.slice(0, 120),
              description: "A donation to the club. Your name goes on the team's virtual pitch. Not a raffle: there are no prizes." } } } },
          payment_intent_data: { ...(ours > 0 ? { application_fee_amount: ours } : {}), description: `Pitch fundraiser: ${f.title}`.slice(0, 120),
            metadata: { schema, square: sq.id, fundraiser: f.id } },
          metadata: { schema, square: sq.id, fundraiser: f.id },
          customer_email: email,
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60 + 30,
          // where Stripe sends people after paying (or after a bank or wallet page); backing out is the page's
          // "Pick a different square" button, which calls release
          return_url: `${back}?fund&paid={CHECKOUT_SESSION_ID}`,
        }, a.stripe);
        await db.from("fund_squares").update({ session: s.id, fee: ours }).eq("id", sq.id);
        return out({ client_secret: s.client_secret, account: a.stripe, pk: STRIPE_PK, square: sq.id });
      } catch (e) {
        await db.from("fund_squares").delete().eq("id", sq.id).eq("state", "held");
        console.error("checkout", schema, e);
        return out({ error: "stripe" });
      }
    }

    if (b.action === "confirm") {
      const a = await account(db);
      const id = String(b.session ?? "");
      if (!a?.stripe || !/^cs_[A-Za-z0-9_]+$/.test(id)) return out({ error: "session" }, 400);
      const s = await stripe("GET", `checkout/sessions/${id}`, undefined, a.stripe);
      if (s.metadata?.schema !== schema) return out({ error: "session" }, 400);
      if (s.payment_status !== "paid") return out({ paid: false });
      const sq = await markPaid(db, s);
      return out({ paid: true, square: sq });
    }

    // a supporter backed out of Stripe's page: let the square go now rather than in 35 minutes
    if (b.action === "release") {
      const id = +b.square;
      if (id) {
        const { data } = await db.from("fund_squares").select("session").eq("id", id).eq("state", "held").maybeSingle();
        const a = await account(db);
        if (data?.session && a?.stripe) {
          const s = await stripe("GET", `checkout/sessions/${data.session}`, undefined, a.stripe);
          if (s.status === "open") await stripe("POST", `checkout/sessions/${data.session}/expire`, {}, a.stripe).catch(() => {});
          if (s.payment_status !== "paid") await db.from("fund_squares").delete().eq("id", id).eq("state", "held");
        }
      }
      return out({ ok: true });
    }

    // ---------- coaches only from here ----------
    if (!(await isCoach(req, schema))) return out({ error: "coach" }, 403);
    if (!STRIPE) return out({ error: "no_stripe" });

    if (b.action === "connect") {
      const site = String(b.site ?? "");
      if (!SITE_OK.test(site)) return out({ error: "site" }, 400);
      let a = await account(db);
      if (!a?.stripe) {
        // a Standard account: the club owns it, signs in to Stripe itself, and pays Stripe's card fees from its own takings
        const acct = await stripe("POST", "accounts", { country: "GB",
          // the club owns its account: full Stripe Dashboard, Stripe charges it its fees and carries the losses
          controller: { stripe_dashboard: { type: "full" }, fees: { payer: "account" }, losses: { payments: "stripe" } }, business_profile: { product_description: "Club fundraising: supporters' donations for squares on a virtual pitch" } });
        await db.from("fund_account").upsert({ id: 1, stripe: acct.id, ready: false, updated: new Date().toISOString() });
        a = { stripe: acct.id, ready: false };
      }
      const back = site.split("?")[0].split("#")[0];
      const link = await stripe("POST", "account_links", { account: a.stripe, type: "account_onboarding",
        refresh_url: `${back}?fund&stripe=again`, return_url: `${back}?fund&stripe=back` });
      return out({ url: link.url });
    }

    if (b.action === "status") {
      const a = await account(db);
      if (!a?.stripe) return out({ linked: false, ready: false, fee_bps: fee });
      const acct = await stripe("GET", `accounts/${a.stripe}`);
      const ready = !!acct.charges_enabled;
      if (ready !== a.ready) await db.from("fund_account").update({ ready, updated: new Date().toISOString() }).eq("id", 1);
      return out({ linked: true, ready, details: !!acct.details_submitted, payouts: !!acct.payouts_enabled, fee_bps: fee });
    }

    if (b.action === "refund") {
      const a = await account(db);
      const { data: sq } = await db.from("fund_squares").select("id, state, payment").eq("id", +b.square).maybeSingle();
      if (!a?.stripe || !sq || sq.state !== "paid" || !sq.payment) return out({ error: "square" }, 400);
      await stripe("POST", "refunds", { payment_intent: sq.payment, refund_application_fee: true }, a.stripe);
      await db.from("fund_squares").update({ state: "refunded" }).eq("id", sq.id);
      return out({ ok: true });
    }

    return out({ error: "action" }, 400);
  } catch (e) {
    console.error(schema, b.action, e);
    return out({ error: String((e as Error).message ?? e).slice(0, 200) }, 500);
  }
});
