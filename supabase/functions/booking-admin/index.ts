// booking-admin — Supabase Edge Function (Deno)
// หน้าจัดการการจองฝั่งร้าน (ใช้โดย POS หน้า "จองออนไลน์")
// - รับ header `x-admin-key` เทียบกับ secret `BOOKING_ADMIN_KEY` (ตั้งใน Supabase secrets)
// - รองรับ action: list / confirm / reject / complete / stats / quota
// Deploy: npx supabase functions deploy booking-admin --no-verify-jwt
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

// テンポラリ: constant-time compare — ต้องไม่ใช้ === กับคีย์ลับ
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

// อ่านรหัสเจ้าของร้านจาก app_settings (service_role เท่านั้น) — คืน "" ถ้าอ่านไม่ได้/ยังไม่ได้ตั้ง
async function readOwnerPass(): Promise<string> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!SUPABASE_URL || !SERVICE_KEY) return "";
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await sb
      .from("app_settings")
      .select("value")
      .eq("key", "owner_pass")
      .maybeSingle();
    if (!error && typeof data?.value === "string" && data.value) return data.value;
  } catch {
    // fallback เป็น ""
  }
  return "";
}

/** ตรวจสิทธิ์ admin key (constant-time) รองรับ 2 แบบ: BOOKING_ADMIN_KEY หรือ owner_pass */
async function requireAdminKey(req: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  const provided = (req.headers.get("x-admin-key") ?? "").trim();
  if (!provided) {
    return {
      ok: false,
      response: errJson("UNAUTHORIZED", "ไม่ได้รับอนุญาตให้เข้าหน้าจัดการการจอง", 401),
    };
  }

  const expected = Deno.env.get("BOOKING_ADMIN_KEY") ?? "";
  if (expected && timingSafeEqualStr(provided, expected)) return { ok: true };

  const ownerPass = await readOwnerPass();
  if (ownerPass && timingSafeEqualStr(provided, ownerPass)) return { ok: true };

  if (!expected && !ownerPass) {
    return {
      ok: false,
      response: errJson("ADMIN_NOT_CONFIGURED", "ยังไม่ได้ตั้งคีย์สำหรับหน้าจัดการการจอง — กรุณาติดต่อผู้ดูแลระบบ", 503),
    };
  }

  return {
    ok: false,
    response: errJson("UNAUTHORIZED", "ไม่ได้รับอนุญาตให้เข้าหน้าจัดการการจอง", 401),
  };
}

function withAdminCors(res: Response): Response {
  const headers = new Headers(res.headers);
  const allow = headers.get("Access-Control-Allow-Headers") ?? "";
  const has = allow
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .includes("x-admin-key");
  if (!has) {
    headers.set(
      "Access-Control-Allow-Headers",
      allow ? `${allow}, x-admin-key` : "authorization, x-client-info, apikey, content-type, x-admin-key",
    );
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/** คอลัมน์ที่ส่งให้หน้า admin */
const LIST_FIELDS =
  "code, customer_name, customer_phone, service_name, therapist_id, therapist_name, slot_date, slot_start, slot_end, amount, pay_amount, status, payment_status, order_id, transaction_id, paid_at, created_at, slip_image_url, slip_trans_ref, slip_bank, slip_sender, slip_verified_at";

/** คอลัมน์ที่ต้องใช้ตอนยืนยัน/ปฏิเสธ */
const ACTION_FIELDS =
  "id, code, status, payment_status, pay_amount, amount, customer_phone, customer_name, transaction_id";

const KNOWN_STATUSES = ["pending", "confirmed", "cancelled", "expired", "cancel_requested", "completed"];
const ACTIONS = ["list", "confirm", "reject", "complete", "stats", "quota"] as const;
const LIMIT_DEFAULT = 100;
const LIMIT_MAX = 500;

const STATUS_PRIORITY: Record<string, number> = {
  pending: 0,
  cancel_requested: 1,
  completed: 2,
  confirmed: 3,
  cancelled: 4,
  expired: 5,
};

function maskPhone(raw: unknown): string {
  const p = String(raw ?? "").trim().replace(/[\s\-()]/g, "");
  return p.length >= 4 ? `***${p.slice(-4)}` : "***";
}

function toIso(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = new Date(String(raw));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function clampLimit(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return LIMIT_DEFAULT;
  return Math.min(LIMIT_MAX, Math.max(1, Math.floor(n)));
}

function toSatang(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}

function mapBooking(row: Record<string, unknown>) {
  const payAmount = Number(row.pay_amount ?? 0);
  return {
    code: (row.code as string | null) ?? null,
    customer_name: (row.customer_name as string | null) ?? null,
    customer_phone: (row.customer_phone as string | null) ?? null,
    service_name: (row.service_name as string | null) ?? null,
    therapist_name: (row.therapist_name as string | null) ?? null,
    slot_date: (row.slot_date as string | null) ?? null,
    slot_start: toIso(row.slot_start),
    slot_end: toIso(row.slot_end),
    amount: Number(row.amount ?? 0) || 0,
    pay_amount: payAmount || null,
    pay_amount_text: payAmount ? (payAmount / 100).toFixed(2) : null,
    status: (row.status as string | null) ?? null,
    payment_status: (row.payment_status as string | null) ?? null,
    order_id: (row.order_id as string | null) ?? null,
    transaction_id: (row.transaction_id as string | null) ?? null,
    paid_at: toIso(row.paid_at),
    created_at: toIso(row.created_at),
    slip_image_url: (row.slip_image_url as string | null) ?? null,
    slip_trans_ref: (row.slip_trans_ref as string | null) ?? null,
    slip_bank: (row.slip_bank as string | null) ?? null,
    slip_sender: (row.slip_sender as string | null) ?? null,
    slip_verified_at: toIso(row.slip_verified_at),
  };
}

function sortForAdmin(a: ReturnType<typeof mapBooking>, b: ReturnType<typeof mapBooking>): number {
  const pa = STATUS_PRIORITY[String(a.status ?? "")] ?? 5;
  const pb = STATUS_PRIORITY[String(b.status ?? "")] ?? 5;
  if (pa !== pb) return pa - pb;
  const ta = a.slot_start ? Date.parse(a.slot_start) : Number.POSITIVE_INFINITY;
  const tb = b.slot_start ? Date.parse(b.slot_start) : Number.POSITIVE_INFINITY;
  if (ta !== tb) return ta - tb;
  return 0;
}

function readCount(
  row: { count: number | null; error: { message: string } | null },
  label: string,
): number {
  if (row.error) {
    console.error(`[booking-admin] นับ "${label}" ไม่สำเร็จ:`, row.error.message);
    return 0;
  }
  return row.count ?? 0;
}

async function handleList(sb: ReturnType<typeof createClient>, body: Record<string, unknown>): Promise<Response> {
  const date = String(body.date ?? "").trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return errJson("INVALID_DATE", "รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)", 400);
  }
  const status = String(body.status ?? "").trim().toLowerCase();
  if (status && !KNOWN_STATUSES.includes(status)) {
    return errJson(
      "INVALID_STATUS",
      `สถานะ "${status}" ไม่ถูกต้อง — ใช้ได้: ${KNOWN_STATUSES.join(", ")}`,
      400,
    );
  }
  const limit = clampLimit(body.limit);

  if (status) {
    let q = sb.from("bookings").select(LIST_FIELDS, { count: "exact" }).eq("status", status);
    if (date) q = q.eq("slot_date", date);
    const { data, error, count } = await q.order("slot_start", { ascending: true }).limit(limit);
    if (error) return errJson("DB_ERROR", error.message, 500);
    const rows = (data ?? []) as Record<string, unknown>[];
    return json({ bookings: rows.map(mapBooking), total: count ?? rows.length });
  }

  const base = () => {
    const q = sb.from("bookings").select(LIST_FIELDS, { count: "exact" });
    return date ? q.eq("slot_date", date) : q;
  };
  const [pendingRes, otherRes] = await Promise.all([
    base().eq("status", "pending").order("slot_start", { ascending: true }).limit(limit),
    base().neq("status", "pending").order("slot_start", { ascending: true }).limit(limit),
  ]);
  if (pendingRes.error) return errJson("DB_ERROR", pendingRes.error.message, 500);
  if (otherRes.error) return errJson("DB_ERROR", otherRes.error.message, 500);
  const pendingRows = (pendingRes.data ?? []) as Record<string, unknown>[];
  const otherRows = (otherRes.data ?? []) as Record<string, unknown>[];
  const bookings = [...pendingRows, ...otherRows]
    .slice(0, limit)
    .map(mapBooking)
    .sort(sortForAdmin);
  const total = (pendingRes.count ?? pendingRows.length) + (otherRes.count ?? otherRows.length);
  return json({ bookings, total });
}

async function handleConfirm(sb: ReturnType<typeof createClient>, body: Record<string, unknown>): Promise<Response> {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return errJson("MISSING_CODE", "กรุณาระบุรหัสจอง", 400);

  const hasAmount = body.amount !== undefined && body.amount !== null && body.amount !== "";
  let amountSatang: number | null = null;
  if (hasAmount) {
    amountSatang = toSatang(body.amount);
    if (amountSatang === null) return errJson("INVALID_AMOUNT", "ยอดที่ส่งมาไม่ถูกต้อง", 400);
  }

  const { data, error } = await sb
    .from("bookings")
    .select(ACTION_FIELDS)
    .eq("code", code)
    .maybeSingle();
  if (error) return errJson("DB_ERROR", error.message, 500);
  if (!data) return errJson("NOT_FOUND", "ไม่พบการจองรหัสนี้", 404);

  const b = data as Record<string, unknown>;
  const bookingId = String(b.id ?? "");
  const bookingCode = String(b.code ?? code);
  const payAmount = Number(b.pay_amount ?? 0) || Math.round(Number(b.amount ?? 0) * 100);

  if (b.payment_status === "paid") {
    return json({ already_paid: true, code: bookingCode, status: b.status, payment_status: "paid" });
  }

  if (b.status === "cancelled" || b.status === "expired") {
    return errJson("BOOKING_CLOSED", "การจองนี้ถูกยกเลิกหรือหมดอายุแล้ว", 409);
  }

  if (amountSatang !== null && payAmount > 0 && amountSatang !== payAmount) {
    return errJson(
      "AMOUNT_MISMATCH",
      `ยอดที่ส่งมาไม่ตรงกับเดอร์นี้ — ลูกค้าต้องโอน ${(payAmount / 100).toFixed(2)} บาท (${payAmount} สตางค์)`,
      400,
    );
  }

  const { data: fresh, error: freshErr } = await sb
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (freshErr) return errJson("DB_ERROR", freshErr.message, 500);
  const currentStatus = String((fresh as Record<string, unknown> | null)?.status ?? b.status ?? "");
  const wasClosed = currentStatus === "cancelled" || currentStatus === "expired";
  const nextStatus = wasClosed ? "cancel_requested" : "confirmed";
  const paidAt = new Date().toISOString();
  const transactionId = String(b.transaction_id ?? "").trim() || `MANUAL-${Date.now()}`;

  const { error: upErr } = await sb
    .from("bookings")
    .update({
      status: nextStatus,
      payment_status: "paid",
      paid_at: paidAt,
      transaction_id: transactionId,
    })
    .eq("id", bookingId)
    .neq("status", "cancelled")
    .neq("status", "expired");

  if (upErr) return errJson("DB_ERROR", upErr.message, 500);

  const { data: after } = await sb.from("bookings").select("status").eq("id", bookingId).maybeSingle();
  if (!after || String(after.status ?? "") !== nextStatus) {
    return errJson("BOOKING_CLOSED", "การจองนี้ถูกยกเลิกหรือหมดอายุไปแล้วระหว่างการยืนยัน", 409);
  }

  return json({
    code: bookingCode,
    status: nextStatus,
    payment_status: "paid",
    paid_at: paidAt,
    transaction_id: transactionId,
    amount: payAmount,
    amount_text: (payAmount / 100).toFixed(2),
  });
}

async function handleReject(sb: ReturnType<typeof createClient>, body: Record<string, unknown>): Promise<Response> {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return errJson("MISSING_CODE", "กรุณาระบุรหัสจอง", 400);
  const reason = String(body.reason ?? "").trim().slice(0, 300);

  const { data, error } = await sb
    .from("bookings")
    .select(ACTION_FIELDS)
    .eq("code", code)
    .maybeSingle();
  if (error) return errJson("DB_ERROR", error.message, 500);
  if (!data) return errJson("NOT_FOUND", "ไม่พบการจองรหัสนี้", 404);

  const b = data as Record<string, unknown>;
  const bookingId = String(b.id ?? "");
  const bookingCode = String(b.code ?? code);

  if (b.payment_status === "paid") {
    return errJson("ALREADY_PAID", "เดอร์นี้ชำระเงินแล้ว — ใช้การคืนเงินแทน", 409);
  }

  const { error: upErr } = await sb
    .from("bookings")
    .update({ status: "cancelled", payment_status: "failed" })
    .eq("id", bookingId);
  if (upErr) return errJson("DB_ERROR", upErr.message, 500);

  return json({ code: bookingCode, status: "cancelled", reason: reason || null });
}

async function handleComplete(sb: ReturnType<typeof createClient>, body: Record<string, unknown>): Promise<Response> {
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!code) return errJson("MISSING_CODE", "กรุณาระบุรหัสจอง", 400);

  const { data, error } = await sb
    .from("bookings")
    .select(ACTION_FIELDS)
    .eq("code", code)
    .maybeSingle();
  if (error) return errJson("DB_ERROR", error.message, 500);
  if (!data) return errJson("NOT_FOUND", "ไม่พบการจองรหัสนี้", 404);

  const b = data as Record<string, unknown>;
  const bookingId = String(b.id ?? "");
  const bookingCode = String(b.code ?? code);
  const st = String(b.status ?? "");

  if (st === "completed") {
    return json({ code: bookingCode, status: "completed" });
  }

  if (st === "cancelled" || st === "expired") {
    return errJson(
      "ALREADY_CLOSED",
      st === "cancelled"
        ? "เดอร์นี้ยกเลิกไปแล้ว — ไม่มีบริการที่จะจบ จึงย้ายไปประวัติไม่ได้"
        : "เดอร์นี้หมดอายุไปแล้ว — ไม่มีบริการที่จะจบ จึงย้ายไปประวัติไม่ได้",
      409,
    );
  }

  const therapist = String(body.therapist ?? "").trim().slice(0, 60);
  const nowISO = new Date().toISOString();
  const patch: { status: string; updated_at: string; therapist_name?: string } = {
    status: "completed",
    updated_at: nowISO,
  };
  if (therapist) patch.therapist_name = therapist;

  const { error: upErr } = await sb.from("bookings").update(patch).eq("id", bookingId);
  if (upErr) return errJson("DB_ERROR", upErr.message, 500);

  return json({ code: bookingCode, status: "completed" });
}

async function handleStats(sb: ReturnType<typeof createClient>): Promise<Response> {
  // ใช้เวลาไทย Asia/Bangkok สำหรับวันที่ "วันนี้"
  const nowBkk = new Date(Date.now() + 7 * 3600 * 1000);
  const y = nowBkk.getUTCFullYear();
  const m = String(nowBkk.getUTCMonth() + 1).padStart(2, "0");
  const d = String(nowBkk.getUTCDate()).padStart(2, "0");
  const today = `${y}-${m}-${d}`;
  const startISO = `${today}T00:00:00+07:00`;
  const end = new Date(new Date(startISO).getTime() + 24 * 3600 * 1000);

  const { data: todayBookings, error: tbErr } = await sb
    .from("bookings")
    .select("status, payment_status, amount, slip_verified_at")
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return withAdminCors(new Response("ok", { headers: corsHeaders }));
  }

  try {
    const auth = await requireAdminKey(req);
    if (!auth.ok) return withAdminCors(auth.response);

    if (req.method !== "POST") {
      return withAdminCors(errJson("METHOD_NOT_ALLOWED", "ใช้ได้เฉพาะเมธอด POST", 405));
    }

    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      body = {};
    }
    const action = String(body.action ?? "").trim().toLowerCase();
    if (!action) {
      return withAdminCors(errJson("MISSING_ACTION", "กรุณาระบุ action ที่ต้องการทำ", 400));
    }
    if (!(ACTIONS as readonly string[]).includes(action)) {
      return withAdminCors(
        errJson("UNKNOWN_ACTION", `ไม่รู้จัก action "${action}" — ใช้ได้: ${ACTIONS.join(", ")}`, 400),
      );
    }

    if (action === "quota") {
      // quota action ไม่ต้องแตะ DB — คืน quota:null ถ้ายังไม่ตั้ง SlipOK
      return withAdminCors(json({ ok: true, quota: null, message: "ยังไม่ได้ตั้งค่าระบบตรวจสลีปอัตโนมัติ" }));
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return withAdminCors(errJson("NO_SUPABASE", "ยังไม่ได้ตั้งค่า Supabase URL / Service Role Key", 503));
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    switch (action) {
      case "list":
        return withAdminCors(await handleList(sb, body));
      case "confirm":
        return withAdminCors(await handleConfirm(sb, body));
      case "reject":
        return withAdminCors(await handleReject(sb, body));
      case "complete":
        return withAdminCors(await handleComplete(sb, body));
      default:
        return withAdminCors(await handleStats(sb));
    }
  } catch (e) {
    console.error("[booking-admin] fatal", String(e));
    return withAdminCors(errJson("ERROR", String(e), 500));
  }
});
