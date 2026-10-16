// push-bill — Supabase Edge Function (Deno)
// รับ Supabase Database Webhook (bills INSERT + UPDATE) → ส่ง Web Push หาแอดมินทุกเครื่อง
// - INSERT status=open (เปิดบิลใหม่) → 🧾 เปิดบิลใหม่ (kind: bill-open)
// - INSERT/UPDATE status=paid (เช็คบิล) → 🔔 บิลใหม่ (kind: bill — payload เดิม)
// Deploy: supabase functions deploy push-bill (เจ้าของกดเอง ดู supabase/PUSH_SETUP.md)

import webpush from "npm:web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const baht = (n: unknown) => `฿${Number(n || 0).toLocaleString("th-TH")}`;

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
    const b = body as { type?: string; record?: Record<string, unknown>; old_record?: Record<string, unknown> };
    const record = b?.record || {};
    const oldRecord = b?.old_record || {};
    const type = String(b?.type || ""); // Database Webhook ส่ง INSERT / UPDATE / DELETE

    const id = String(record["id"] ?? "");
    const status = String(record["status"] ?? "");
    const oldStatus = String(oldRecord["status"] ?? "");

    // UPDATE ที่ status ไม่เปลี่ยน (เช่น แก้ไขบิล open / เปลี่ยนวิธีจ่ายบิล paid) → ไม่ยิงซ้ำกันสแปม
    if (type === "UPDATE" && oldStatus && oldStatus === status) {
      return new Response(JSON.stringify({ sent: 0, skipped: "no-status-change" }), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // open = เปิดบิล (INSERT ไร้ status ถือว่า default 'open'); paid = เช็คบิล — นอกนั้น (cancelled/void) ข้าม
    const isOpen = status === "open" || (!status && type === "INSERT");
    const isPaid = status === "paid" || (!status && type !== "INSERT");
    if (!isOpen && !isPaid) {
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

    // ชื่อหมอ: ลองจาก record ก่อน (รองรับทั้ง snake_case ของ DB และ camelCase ของ blob เก่า)
    let therapistName =
      String(
        record["therapist_name"] ?? record["therapistName"] ?? record["therapist"] ?? record["doctor"] ?? "",
      ).trim();
    const itemsRaw = record["items"];
    const itemsArr = Array.isArray(itemsRaw) ? itemsRaw : [];
    if (!therapistName) {
      for (const it of itemsArr) {
        if (it && typeof it === "object") {
          const o = it as Record<string, unknown>;
          const v = String(o["therapist_name"] ?? o["therapistName"] ?? o["therapist"] ?? "").trim();
          if (v) {
            therapistName = v;
            break;
          }
        }
      }
    }
    let customer = String(record["customer"] ?? "");
    let total = Number(record["total"] ?? 0);
    let payment = String(record["payment_method"] ?? record["paymentMethod"] ?? "");
    if ((!therapistName || !customer || !record["total"]) && id) {
      try {
        const { data: full } = await sb
          .from("bills")
          .select("therapist_name,customer,total,payment_method")
          .eq("id", id)
          .single();
        if (full) {
          if (!therapistName) therapistName = String((full as Record<string, unknown>)["therapist_name"] ?? "").trim();
          if (!customer) customer = String((full as Record<string, unknown>)["customer"] ?? "");
          if (!record["total"]) total = Number((full as Record<string, unknown>)["total"] ?? total);
          if (!payment) payment = String((full as Record<string, unknown>)["payment_method"] ?? "");
        }
      } catch {
        // ดึงเสริมล้ม = ใช้ค่าจาก record เท่าที่มี
      }
    }
    const docName = therapistName || customer || "ลูกค้า";

    const { data: subs } = await sb.from("push_subscriptions").select("endpoint,p256dh,auth").eq("role", "owner");
    const list = subs || [];

    // App ไม่มี router/route แยกหน้า (src/App.jsx ใช้ internal state) — url คง './' เหมือนเดิม
    let payload: string;
    if (isOpen) {
      // เปิดบิล: ดึงชื่อบริการจาก bill_items (DB แยกตาราง; webhook record มีแค่ header)
      let serviceText = "";
      if (id) {
        try {
          const { data: rows } = await sb
            .from("bill_items")
            .select("service_name,net,price,therapist_name")
            .eq("bill_id", id);
          const list2 = rows || [];
          if (!therapistName && list2.length > 0) {
            const t = String((list2[0] as Record<string, unknown>)["therapist_name"] ?? "").trim();
            if (t) therapistName = t;
          }
          if (list2.length === 1) {
            serviceText = String((list2[0] as Record<string, unknown>)["service_name"] ?? "") || "บริการ";
          } else if (list2.length > 1) {
            const first = String((list2[0] as Record<string, unknown>)["service_name"] ?? "") || "บริการ";
            serviceText = `${first} +${list2.length - 1} รายการ`;
          }
        } catch {
          // ดึงรายการล้ม = fallback เท่าที่มี
        }
      }
      // fallback: record แบบ blob เก่าที่ฝัง items มาด้วย
      if (!serviceText && itemsArr.length === 1) {
        const o = itemsArr[0] as Record<string, unknown>;
        serviceText = String(o["serviceName"] ?? o["service_name"] ?? "") || "บริการ";
      } else if (!serviceText && itemsArr.length > 1) {
        const o = itemsArr[0] as Record<string, unknown>;
        const first = String(o["serviceName"] ?? o["service_name"] ?? "") || "บริการ";
        serviceText = `${first} +${itemsArr.length - 1} รายการ`;
      }
      const who = therapistName || docName;
      const title = `🔔 เปิดบิล โดย (${who})`;
      const text = serviceText ? `${serviceText} = ${baht(total)}` : `${who} · ${baht(total)}`;
      payload = JSON.stringify({ title, body: text, kind: "bill-open", url: "./" });
    } else {
      // เช็คบิล (paid) — payload เดิม ห้ามเปลี่ยน
      const title = `💸 เช็คบิล ${baht(total)}`;
      const text = `${docName} · ${payment || "ไม่ระบุวิธีจ่าย"}`;
      payload = JSON.stringify({ title, body: text, kind: "bill", url: "./" });
    }

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

    console.log("push-bill result:", JSON.stringify({ sent, subsCount: list.length }));

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
