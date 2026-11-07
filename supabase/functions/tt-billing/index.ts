// Touchline Tales' own £5 a month team plan (not club money: that's the fundraiser and subs, on clubs' own
// Stripe accounts). Teams pay at sign-up on touchlinetales.club through a Stripe Payment Link
// (touchlinetales-sites assets/pay.js). Stripe calls this function when someone pays, changes or cancels, and
// it keeps public.tt_billing up to date (touchlinetales-sites tools/billing_table.sql), matched to the
// sign-up in public.tt_leads by client_reference_id "lead_<id>".
//
// Events (a webhook on Touchline Tales' OWN account, "Events on your account", not Connect):
//   checkout.session.completed, checkout.session.async_payment_succeeded   a new team plan
//   customer.subscription.updated, customer.subscription.deleted           status changes and cancellations
//   invoice.paid, invoice.payment_failed                                   each month's payment
//
// Secret: TT_BILLING_WEBHOOK_SECRET (this webhook's signing secret, whsec_...). No Stripe API key is needed:
// everything comes in the signed events. Deploy with JWT checks off: supabase functions deploy tt-billing --no-verify-jwt
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const WHSEC = (Deno.env.get("TT_BILLING_WEBHOOK_SECRET") ?? "").trim();
const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// Stripe-Signature: t=<time>,v1=<hmac>. HMAC-SHA256 of "<time>.<body>" with the webhook secret; within 5 minutes.
// Returns "" when the signature is good, otherwise why not (logged, and shown in Stripe's delivery log).
async function verified(raw: string, sig: string) {
  if (!WHSEC) return "no secret set";
  if (!WHSEC.startsWith("whsec_")) return "secret doesn't start whsec_";
  if (!sig) return "no Stripe-Signature header";
  const t = +(sig.split(",").find((p) => p.startsWith("t="))?.slice(2) ?? 0);
  if (!t || Math.abs(Date.now() / 1000 - t) > 300) return "timestamp too old";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WHSEC), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${raw}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const v1s = sig.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const ok = v1s.some((v) => v.length === hex.length && [...v].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
  return ok ? "" : "signature doesn't match the secret";
}

const idOf = (x: unknown) => typeof x === "string" ? x : (x as { id?: string } | null)?.id ?? null;
const when = (sec?: number) => sec ? new Date(sec * 1000).toISOString() : new Date().toISOString();

// deno-lint-ignore no-explicit-any
async function newPlan(s: any, live: boolean) {
  if (s.mode !== "subscription") return "not a subscription";
  const sub = idOf(s.subscription);
  if (!sub) return "no subscription";
  const m = /^lead_(\d{1,12})$/.exec(s.client_reference_id ?? "");
  let lead: number | null = m ? +m[1] : null;
  if (lead) { // only link to a sign-up that exists
    const { data } = await db.from("tt_leads").select("id").eq("id", lead).maybeSingle();
    if (!data) lead = null;
  }
  // deno-lint-ignore no-explicit-any
  const team = (s.custom_fields ?? []).find((f: any) => f.key === "teamname")?.text?.value ?? null;
  const paid = s.payment_status === "paid";
  const { error } = await db.from("tt_billing").upsert({
    stripe_subscription: sub, stripe_customer: idOf(s.customer), lead_id: lead,
    email: s.customer_details?.email ?? s.customer_email ?? null, team: team ? String(team).slice(0, 80) : null,
    status: paid ? "active" : "pending", live, last_paid_at: paid ? when(s.created) : null,
    updated_at: new Date().toISOString(), seen: false,
  }, { onConflict: "stripe_subscription" });
  if (error) throw error;
  return "saved";
}

async function setStatus(sub: string | null, fields: Record<string, unknown>) {
  if (!sub) return "no subscription";
  const { error } = await db.from("tt_billing").update({ ...fields, updated_at: new Date().toISOString(), seen: false }).eq("stripe_subscription", sub);
  if (error) throw error;
  return "updated";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ error: "post" }, 405);
  const raw = await req.text();
  const sig = req.headers.get("Stripe-Signature") ?? "";
  const bad = await verified(raw, sig);
  if (bad) { console.error("tt-billing signature:", bad); return out({ error: "signature", why: bad }, 400); }
  const ev = JSON.parse(raw);
  // deno-lint-ignore no-explicit-any
  const o: any = ev.data?.object ?? {};
  const live = ev.livemode === true;
  let done = "ignored";
  try {
    switch (ev.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        done = await newPlan(o, live);
        break;
      case "customer.subscription.updated":
        done = await setStatus(o.id, { status: o.status, cancelled_at: o.canceled_at ? when(o.canceled_at) : null });
        break;
      case "customer.subscription.deleted":
        done = await setStatus(o.id, { status: "canceled", cancelled_at: when(o.canceled_at ?? o.ended_at) });
        break;
      case "invoice.paid": {
        const sub = idOf(o.subscription ?? o.parent?.subscription_details?.subscription);
        done = await setStatus(sub, { status: "active", last_paid_at: when(o.status_transitions?.paid_at) });
        break;
      }
      case "invoice.payment_failed": {
        const sub = idOf(o.subscription ?? o.parent?.subscription_details?.subscription);
        done = await setStatus(sub, { status: "past_due" });
        break;
      }
    }
  } catch (e) {
    console.error(ev.type, e);
    return out({ error: "db" }, 500); // Stripe retries
  }
  return out({ ok: true, done });
});
