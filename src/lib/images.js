// Image layer — Cloudinary (unsigned) with branch-aware folders.
// receiptUrl / slip values can be:
//   - full https://res.cloudinary.com/... URL (new, preferred)
//   - legacy plain filename (old local-only data) -> shown as text
const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
const branchId = import.meta.env.VITE_BRANCH_ID || 'main';

export const isCloudinaryConfigured = Boolean(cloudName && uploadPreset);
export const currentBranchId = branchId;

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function resolveImageUrl(ref) {
  // คืน null เมื่อไม่มี URL ใช้ได้ (เรียกฝั่ง caller เช็ค == null แทน string ว่าง)
  if (!ref) return null;
  const s = String(ref).trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  // legacy ชื่อไฟล์ล้วน (เช่น slip.jpg) ไม่มี URL ให้เปิด — คืน null ให้ caller โชว์เป็นข้อความแทน
  // ยกเว้น Cloudinary public ID แบบมีโฟลเดอร์ (เช่น ifeew-pos/main/slips/abc123) ประกอบ URL ได้
  if (cloudName && s.includes('/') && /^[A-Za-z0-9_\-/]+$/.test(s)) {
    return `https://res.cloudinary.com/${cloudName}/image/upload/${s}`;
  }
  return null;
}

function validateFile(file) {
  if (!file) throw new Error('no-file');
  if (file.size > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 5MB');
  // strict allowlist เท่านั้น — ห้าม image/* ใด ๆ (เช่น image/svg+xml อาจฝังสคริปต์)
  // ไฟล์จากกล้องมือถือที่ mime ว่าง อนุญาตให้ผ่าน (Cloudinary จะ reject ถ้าไม่ใช่ไฟล์จริง)
  if (file.type && !ALLOWED.includes(file.type)) {
    throw new Error('รองรับเฉพาะรูปภาพหรือ PDF');
  }
}

export async function uploadImage(file, kind = 'receipts') {
  validateFile(file);
  if (!isCloudinaryConfigured) {
    throw new Error('ยังไม่ได้ตั้งค่า Cloudinary (.env)');
  }
  const folder = `ifeew-pos/${currentBranchId}/${kind}`;
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', uploadPreset);
  form.append('folder', folder);
  // timeout 30 วิ กันค้าง (AbortController)
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  let res;
  try {
    res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
      signal: ctl.signal,
    });
  } catch (e) {
    if (e?.name === 'AbortError') throw new Error('อัปโหลดหมดเวลา (30 วิ) ลองใหม่');
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let msg = `อัปโหลดไม่สำเร็จ (${res.status})`;
    try {
      const j = await res.json();
      if (j?.error?.message) msg = j.error.message;
    } catch { /* keep default */ }
    throw new Error(msg);
  }
  const json = await res.json();
  if (!json.secure_url) throw new Error('Cloudinary ไม่คืน URL');
  return json.secure_url;
}

export const uploadReceipt = (f) => uploadImage(f, 'receipts');
export const uploadSlip = (f) => uploadImage(f, 'slips');
