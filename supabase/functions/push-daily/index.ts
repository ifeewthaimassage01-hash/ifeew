// push-daily — Supabase Edge Function (Deno)
// ถูกเรียกด้วย cron ภายนอกทุกวัน 23:05 (Asia/Bangkok) พร้อม ?key=DAILY_KEY
// คำนวณสรุปรายวัน → ส่ง Web Push หาแอดมินทุกเครื่อง
// Deploy + ตั้ง cron: เจ้าของกดเอง ดู supabase/PUSH_SETUP.md

import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// เวลา Bangkok ปัจจุบัน (UTC+7 ไม่มี DST)
function bkkToday() {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const dateStr = `${y}-${m}-${d}`;
  const startISO = `${dateStr}T00:00:00+07:00`;
  const end = new Date(new Date(startISO).getTime() + 24 * 3600 * 1000);
  return { dateStr, startISO, endISO: end.toISOString() };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key") || "";
    const DAILY_KEY = Deno.env.get("DAILY_KEY") || "";
    if (!DAILY_KEY || key !== DAILY_KEY) {
      return new Response(JSON.stringify({ sent: 0, skipped: "bad-key" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") || "";
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") || "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !SUPABASE_URL || !SERVICE_KEY) {
      return new Response(JSON.stringify({ sent: 0, skipped: "missing-env" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { dateStr, startISO, endISO } = bkkToday();
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // บิล paid ของวันนี้ (เทียบคอลัมน์ date; แถวที่ date ว่างใช้ paid_at/created_at ไม่นับ — ตรงกับ logic หลักที่ date เป็นเวลาบิล)
    const { data: bills } = await sb
      .from("bills")
      .select("total")
      .eq("status", "paid")
      .gte("date", startISO)
      .lt("date", endISO);
    const revenue = (bills || []).reduce((s: number, b: { total?: number }) => s + (Number(b.total) || 0), 0);
    const count = (bills || []).length;

    const { data: exps } = await sb.from("expenses").select("amount").eq("date", dateStr);
    const expTotal = (exps || []).reduce((s: number, e: { amount?: number }) => s + (Number(e.amount) || 0), 0);

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const { data: subs } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("role", "owner");

    const fmt = (n: number) => Number(n || 0).toLocaleString("th-TH");
    const net = revenue - expTotal;
    const title = "📊 สรุปยอดวันนี้ (${count} บิล)";
    const text = `รายรับ ฿${fmt(revenue)} · รายจ่าย ฿${fmt(expTotal)} · สุทธิ ฿${fmt(net)}`;
    // App ไม่มี route แยกหน้าสรุป (src/App.jsx ใช้ internal state) — url คง './' เหมือนเดิม
    const payload = JSON.stringify({ title, body: text, kind: "daily", url: "./" });

    let sent = 0;
    await Promise.all(
      (subs || []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
        } catch {
          // ข้ามเครื่องที่ subscription หมดอายุ
        }
      }),
    );

    return new Response(JSON.stringify({ sent, date: dateStr, revenue, count, expenses: expTotal, net }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ sent: 0, error: String(e) }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
