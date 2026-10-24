// booking-admin — Supabase Edge Function (Deno)
// หน้าจัดการการจองฝั่งร้าน (ใช้โดย POS หน้า "จองออนไลน์")
// - รับ header `x-admin-key` เทียบกับ secret `BOOKING_ADMIN_KEY` (ตั้งใน Supabase secrets)
// - รองรับ action: list / confirm / reject / complete / stats
// Deploy: npx supabase functions deploy booking-admin
// ตั้ง secret: npx supabase secrets set BOOKING_ADMIN_KEY=<รหัสที่ตรงกับ owner_pass ในแอป>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const errJson = (code: string, message: string, status = 400) =>
  json({ ok: false, error: code, message }, status);

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ADMIN_KEY = Deno.env.get("BOOKING_ADMIN_KEY") || "";
    if (!ADMIN_KEY) {
      return errJson("NOT_CONFIGURED", "ยังไม่ได้ตั้งค่า BOOKING_ADMIN_KEY ใน Supabase Secrets", 503);
    }

    const adminKey = req.headers.get("x-admin-key") || "";
    if (!adminKey || adminKey !== ADMIN_KEY) {
      return errJson("UNAUTHORIZED", "รหัสผู้ดูแลระบบไม่ถูกต้อง", 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errJson("NO_SUPABASE", "ยังไม่ได้ตั้งค่า Supabase URL / Service Role Key", 503);
    }

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const b = body as Record<string, unknown>;
    const action = String(b.action || "");

    // ---------- list ----------
    if (action === "list") {
      const date = String(b.date || "");
      const status = String(b.status || "");
      const limit = Math.min(Math.max(Number(b.limit) || 200, 1), 1000);

      let q = sb.from("bookings").select("*", { count: "exact" });

      if (date) {
        q = q.eq("slot_date", date);
      }
      if (status) {
        q = q.eq("status", status);
      }

      q = q.order("slot_start", { ascending: true }).limit(limit);

      const { data, error, count } = await q;
      if (error) return errJson("DB_ERROR", error.message, 500);

      return json({
        ok: true,
        bookings: data || [],
        total: count ?? 0,
      });
    }

    // ---------- stats ----------
    if (action === "stats") {
      const nowBkk = new Date(Date.now() + 7 * 3600 * 1000);
      const y = nowBkk.getUTCFullYear();
      const m = String(nowBkk.getUTCMonth() + 1).padStart(2, "0");
      const d = String(nowBkk.getUTCDate()).padStart(2, "0");
      const today = `${y}-${m}-${d}`;
      const startISO = `${today}T00:00:00+07:00`;
      const end = new Date(new Date(startISO).getTime() + 24 * 3600 * 1000);

      const { data: todayBookings, error: tbErr } = await sb
        .from("bookings")
        .select("status, payment_status, amount")
        .gte("slot_start", startISO)
        .lt("slot_start", end.toISOString());
      if (tbErr) return errJson("DB_ERROR", tbErr.message, 500);

      const stats: Record<string, number> = {
        today_total: 0,
        today_pending: 0,
        today_confirmed: 0,
        today_completed: 0,
        today_cancelled: 0,
        today_expired: 0,
        today_cancel_requested: 0,
        pending_with_slip: 0,
        unverified_slip_count: 0,
      };

      (todayBookings || []).forEach((row) => {
        const st = String(row.status || "");
        const ps = String(row.payment_status || "");
        stats.today_total += 1;
        if (st === "pending") stats.today_pending += 1;
        if (st === "confirmed") stats.today_confirmed += 1;
        if (st === "completed") stats.today_completed += 1;
        if (st === "cancelled") stats.today_cancelled += 1;
        if (st === "expired") stats.today_expired += 1;
        if (st === "cancel_requested") stats.today_cancel_requested += 1;
        if (st === "pending" && ps === "paid") stats.pending_with_slip += 1;
        if (ps === "paid" && !row.slip_verified_at) stats.unverified_slip_count += 1;
      });

      return json({ ok: true, stats, today });
    }

    // ---------- confirm / reject / complete (ต้องมี code) ----------
    const code = String(b.code || "").trim().toUpperCase();
    if (!code) {
      return errJson("MISSING_CODE", "ต้องระบุรหัสจอง (code)", 400);
    }

    const { data: booking, error: fetchErr } = await sb
      .from("bookings")
      .select("*")
      .eq("code", code)
      .single();
    if (fetchErr || !booking) {
      return errJson("NOT_FOUND", "ไม่พบการจองรหัสนี้", 404);
    }

    if (action === "confirm") {
      // ถ้ายืนยันแล้วอยู่แล้ว → คืน already_paid ให้ frontend แจ้งแทนที่จะอัปเดตซ้ำ
      const alreadyPaid = booking.status === "confirmed" || booking.payment_status === "paid";
      if (alreadyPaid) {
        return json({ ok: true, already_paid: true, booking });
      }
      const amount = b.amount !== undefined ? Number(b.amount) : null;
      const payAmount = Number(booking.pay_amount || 0);
      if (amount !== null && amount !== undefined && amount !== "" && amount !== payAmount) {
        return errJson("AMOUNT_MISMATCH", `ยอดไม่ตรง: ส่ง ${amount} แต่เดอร์นี้ต้อง ${payAmount / 100}`, 400);
      }
      const nowISO = new Date().toISOString();
      const { data: updated, error: updErr } = await sb
        .from("bookings")
        .update({
          status: "confirmed",
          payment_status: "paid",
          paid_at: nowISO,
          updated_at: nowISO,
        })
        .eq("code", code)
        .select()
        .single();
      if (updErr) return errJson("DB_ERROR", updErr.message, 500);
      return json({ ok: true, already_paid: false, booking: updated });
    }

    if (action === "reject") {
      const reason = String(b.reason || "").slice(0, 300);
      const nowISO = new Date().toISOString();
      const { data: updated, error: updErr } = await sb
        .from("bookings")
        .update({
          status: "cancelled",
          updated_at: nowISO,
        })
        .eq("code", code)
        .select()
        .single();
      if (updErr) return errJson("DB_ERROR", updErr.message, 500);
      return json({ ok: true, booking: updated, reason });
    }

    if (action === "complete") {
      // ร้านเลือก "หมอผู้ให้บริการ" ตอนรับบริการเสร็จ (คำขอผู้ใช้ 24 ต.ค. 2569) —
      // การจองจากลูกค้าไม่ผูกหมอล่วงหน้า จึงตั้งชื่อหมอพร้อมบันทึกจบบริการ
      // (ส่งมาว่าง = ไม่แตะ therapist_name เดิม)
      const therapist = String(b.therapist ?? "").trim().slice(0, 60);
      const nowISO = new Date().toISOString();
      const patch: { status: string; updated_at: string; therapist_name?: string } = {
        status: "completed",
        updated_at: nowISO,
      };
      if (therapist) patch.therapist_name = therapist;
      const { data: updated, error: updErr } = await sb
        .from("bookings")
        .update(patch)
        .eq("code", code)
        .select()
        .single();
      if (updErr) return errJson("DB_ERROR", updErr.message, 500);
      return json({ ok: true, booking: updated });
    }

    return errJson("UNKNOWN_ACTION", `ไม่รู้จัก action: ${action || "(ไม่ได้ส่ง)"}`, 400);
  } catch (e) {
    console.error("[booking-admin] fatal", String(e));
    return errJson("ERROR", String(e), 500);
  }
});
