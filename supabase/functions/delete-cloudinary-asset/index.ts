// delete-cloudinary-asset — Supabase Edge Function (Deno)
// ลบไฟล์สลิป/ใบเสร็จบน Cloudinary ตามบิล/รายจ่ายที่ถูกลบ (ตอนนี้รูปค้างกินพื้นที่ตลอดไป)
// - รับ POST { urls: string[] } จากแอปผ่าน supabase.functions.invoke (JWT ตรวจให้เองโดย default)
// - ใช้ Cloudinary destroy API แบบ signed — ต้องตั้ง secrets ก่อน:
//     npx supabase secrets set CLOUDINARY_CLOUD_NAME=... CLOUDINARY_API_KEY=... CLOUDINARY_API_SECRET=...
//   (key/secret ดูได้ที่ console.cloudinary.com → Settings → API Keys)
// - ลบได้เฉพาะ public_id ที่ขึ้นต้นด้วย ifeew-pos/ เท่านั้น — กันยิงลบไฟล์อื่นในบัญชี Cloudinary เดียวกัน
// - client ยิงแบบ fire & forget — ถ้าลบไม่สำเร็จก็แค่รูปค้างกินพื้นที่ ไม่กระทบการลบบิล/รายจ่าย

import { json, corsHeaders } from "../_shared/http.ts";
import { createHash } from "node:crypto";

// แปลง URL ของ Cloudinary → { public_id, resource_type } หรือ null ถ้าไม่ใช่ URL ของบัญชีเรา
// รูปแบบที่รองรับ: https://res.cloudinary.com/<cloud>/<resource>/upload/[v<ver>/]<public_id>.<ext>
function extractFromUrl(url: string, cloud: string) {
  try {
    const u = new URL(url.trim());
    if (!/(^|\.)cloudinary\.com$/i.test(u.hostname)) return null;
    // รูปแบบเต็ม: res.cloudinary.com/<cloud_name>/<resource>/upload/[v<ver>/]<public_id>.<ext>
    // ชื่อ cloud_name อยู่ใน path segment แรก — ตรวจให้ตรงบัญชีเราก่อนแตะไฟล์ใด ๆ
    const seg = u.pathname.split('/').filter(Boolean);
    if (!cloud || seg[0] !== cloud) return null;
    const m = u.pathname.match(/^\/[^/]+\/(image|raw|video|auto)\/upload\/(.+?)(?:\.([a-z0-9]+))?$/i);
    if (!m) return null;
    let rest = m[2];
    rest = rest.replace(/^v\d+\//, ""); // ตัด version segment
    let pid = decodeURIComponent(rest);
    if (!pid) return null;
    const type = m[1].toLowerCase() === "auto" ? "image" : m[1].toLowerCase();
    // public_id ไม่รวมนามสกุลไฟล์ — .png ท้าย URL เป็น format marker ที่ Cloudinary strip ให้
    // (raw เก็บชื่อพร้อมนามสกุลไว้ตามจริง)
    if (type !== "raw") pid = pid.replace(/\.[a-z0-9]+$/i, "");
    return { pid, type };
  } catch {
    return null;
  }
}

type Target = { pid: string; type: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const CLOUD = Deno.env.get("CLOUDINARY_CLOUD_NAME") || "";
  const API_KEY = Deno.env.get("CLOUDINARY_API_KEY") || "";
  const API_SECRET = Deno.env.get("CLOUDINARY_API_SECRET") || "";
  // ยังไม่ตั้ง secrets → ตอบ 200 ธรรมดา (client ยิงแล้วลืม ไม่จำเป็นต้องรู้ว่า fail)
  if (!CLOUD || !API_KEY || !API_SECRET) {
    return json({ deleted: [], skipped: "not-configured" });
  }

  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const raw = (body as { urls?: unknown })?.urls;
  const urls: string[] = (Array.isArray(raw) ? raw : [raw])
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
    .slice(0, 12); // ป้องกัน batch ใหญ่ — รองรับลบทีละบิล/รายจ่ายพอ

  // เฉพาะไฟล์ในโฟลเดอร์ ifeew-pos/ ของบัญชีเราเท่านั้น
  const targets: Target[] = [];
  for (const u of urls) {
    const t = extractFromUrl(u, CLOUD);
    if (t && t.pid.startsWith("ifeew-pos/")) targets.push(t);
  }
  if (targets.length === 0) return json({ deleted: [], skipped: "no-targets" });

  const results: Array<{ pid: string; ok: boolean; result?: string }> = [];
  for (const t of targets) {
    try {
      const timestamp = Math.floor(Date.now() / 1000);
      // Cloudinary signature = SHA1( params เรียงตามตัวอักษร + api_secret )
      const toSign = `invalidate=true&public_id=${t.pid}&timestamp=${timestamp}`;
      const signature = createHash("sha1").update(toSign + API_SECRET).digest("hex");
      const form = new URLSearchParams({
        public_id: t.pid,
        timestamp: String(timestamp),
        api_key: API_KEY,
        signature,
        invalidate: "true",
      });
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${t.type}/destroy`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const out = await res.json().catch(() => ({}));
      results.push({ pid: t.pid, ok: res.ok && out?.result !== "error", result: String(out?.result || res.status) });
    } catch {
      results.push({ pid: t.pid, ok: false });
    }
  }
  return json({ deleted: results });
});
