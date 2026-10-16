// push-bill — Supabase Edge Function (Deno)
// รับ Supabase Database Webhook (bills INSERT) → ส่ง Web Push หาแอดมินทุกเครื่อง
// Deploy: supabase functions deploy push-bill (เจ้าของกดเอง ดู supabase/PUSH_SETUP.md)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const record = (body as { record?: Record<string, unknown> })?.record || {};

    const id = String(record["id"] ?? "");
    const customer = String(record["customer"] ?? "");
    const total = Number(record["total"] ?? 0);
    const payment = String(record["payment_method"] ?? record["paymentMethod"] ?? "");
    const status = String(record["status"] ?? "");

    // แจ้งเฉพาะบิลขายจริง (กัน insert ร่าง open สแปม — ถ้าอยากได้ทุกบิลให้ลบเช็กนี้)
    // Database Webhook ตั้ง filter status=paid ไว้แล้วก็ได้ เช็กซ้ำกันหลุด
    if (status && status !== "paid") {
      return new Response(JSON.stringify({ sent: 0, skipped: "not-paid" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ sent: 0, skipped: "missing-env" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: subs } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("role", "owner");
    const list = subs || [];

    const title = `บิลใหม่ ฿${Number(total || 0).toLocaleString("th-TH")} (#${id})`;
    const text = `${customer || "ลูกค้า"} · ${payment || "ไม่ระบุวิธีจ่าย"}`;
    const payload = JSON.stringify({ title, body: text, url: "./" });

    let sent = 0;
    await Promise.all(
      list.map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch {
          // subscription หมดอายุ/ส่งล้ม = ข้าม (เจ้าของลบแถวได้ตาม PUSH_SETUP.md)
        }
      }),
    );

    return new Response(JSON.stringify({ sent }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    // return 200 เสมอ กัน webhook retry สแปม
    return new Response(JSON.stringify({ sent: 0, error: String(e) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
