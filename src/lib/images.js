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

// ย่อรูปก่อนอัปโหลด — รูปจากกล้องมือถือ 3-8MB ย่อเหลือหลักร้อย KB เร็วขึ้น ~10 เท่า
const MAX_DIM = 1600; // ด้านยาวสุด (px) — พออ่านใบเสร็จ/สลิปชัด
const JPEG_QUALITY = 0.8;

export function resolveImageUrl(ref) {
  // คืน null เมื่อไม่มี URL ใช้ได้ (เรียกฝั่ง caller เช็ค == null แทน string ว่าง)
  if (!ref) return null;
  const s = String(ref).trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('data:') || s.startsWith('blob:')) return s;
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

/* BUG-IMG-01: อัปโหลดที่ไม่ระบุ public_id — Cloudinary ตั้ง public ID จากชื่อไฟล์
   → ไฟล์ที่กล้องส่งมาชื่อเดิม (เช่น image.jpg) จะใช้ public ID ซ้ำกัน
   และการอัปโหลดแบบ unsigned overwrite ไฟล์เดิมเป็น default → สลิปของ "บิลเก่า" ทุกใบกลายเป็นรูปใหม่ล่าสุด
   แก้: ตั้ง public_id เฉพาะตัวต่อครั้ง (timestamp + random) ไม่มีทางทับกัน */
function newUploadPublicId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `s-${crypto.randomUUID()}`;
  } catch { /* ตกหล่นด้านล่าง */ }
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// บีบอัดรูปฝั่ง client: ย่อด้านยาวสุดเหลือ MAX_DIM + export JPEG q0.8
// PDF / ไฟล์ไม่ใช่รูป / บีบอัดล้ม (เช่น HEIC) → คืนไฟล์เดิม ไม่พัง
async function compressImage(file, onPhase) {
  try {
    const type = file?.type || '';
    const isImage = !type || type.startsWith('image/');
    if (!isImage || type === 'application/pdf') return file;
    if (type && !['image/jpeg', 'image/png', 'image/webp', ''].includes(type)) return file;
    if (typeof createImageBitmap === 'undefined') return file;
    onPhase?.('preparing');
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      bmp = await createImageBitmap(file);
    }
    const { width, height } = bmp;
    const longest = Math.max(width, height);
    // รูปเล็กอยู่แล้ว + ไฟล์ไม่ใหญ่ → ข้าม ไม่เสียเวลา encode ใหม่
    if (longest <= MAX_DIM && file.size < 500 * 1024) { bmp.close?.(); return file; }
    const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bmp.close?.(); return file; }
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return file;
    const name = String(file.name || 'photo.jpg').replace(/\.\w+$/, '') + '.jpg';
    const out = new File([blob], name, { type: 'image/jpeg' });
    // กันกรณี encode แล้วใหญ่กว่าเดิม (รูป PNG เส้นคม) → ใช้ไฟล์เดิม
    return out.size < file.size ? out : file;
  } catch {
    return file;
  }
}

function parseCloudError(status, text) {
  let msg = `อัปโหลดไม่สำเร็จ (${status})`;
  try {
    const j = JSON.parse(text);
    if (j?.error?.message) msg = j.error.message;
  } catch { /* keep default */ }
  return msg;
}

// อัปโหลดพร้อม % progress (XMLHttpRequest — fetch ไม่มี upload progress)
// onProgress(percent 0-100)
function xhrUpload(form, onProgress, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`);
    xhr.timeout = timeoutMs;
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
        }
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText);
      else reject(new Error(parseCloudError(xhr.status, xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error('อัปโหลดไม่สำเร็จ — เช็กเน็ตแล้วลองใหม่'));
    xhr.ontimeout = () => reject(new Error('อัปโหลดหมดเวลา (30 วิ) ลองใหม่'));
    xhr.onabort = () => reject(new Error('ยกเลิกการอัปโหลดแล้ว'));
    xhr.send(form);
  });
}

export async function uploadImage(file, kind = 'receipts', onProgress) {
  if (!isCloudinaryConfigured) {
    throw new Error('ยังไม่ได้ตั้งค่า Cloudinary (.env)');
  }
  // 1) ย่อรูปก่อน (เร็ว + ไฟล์เล็กลงมาก) — แจ้ง phase ให้ UI โชว์ "กำลังเตรียมรูป…"
  if (typeof onProgress === 'function') {
    try { onProgress(0); } catch { /* ignore */ }
  }
  const compact = await compressImage(file, () => {
    try { onProgress?.(1); } catch { /* ignore */ }
  });
  validateFile(compact);
  const folder = `ifeew-pos/${currentBranchId}/${kind}`;
  const form = new FormData();
  form.append('file', compact);
  form.append('upload_preset', uploadPreset);
  form.append('folder', folder);
  form.append('public_id', newUploadPublicId()); // BUG-IMG-01: ชื่อเฉพาะตัว — กันทับสลิปบิลอื่น
  form.append('overwrite', 'false'); // เกราะชั้นสอง: ถ้าเกิดชนชื่อจะแจ้ง error ไม่แอบทับของเดิม
  // 2) อัปโหลดพร้อม progress
  const text = await xhrUpload(form, onProgress);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Cloudinary ตอบกลับผิดรูปแบบ');
  }
  if (!json.secure_url) throw new Error('Cloudinary ไม่คืน URL');
  try { onProgress?.(100); } catch { /* ignore */ }
  return json.secure_url;
}

export const uploadReceipt = (f, onProgress) => uploadImage(f, 'receipts', onProgress);
export const uploadSlip = (f, onProgress) => uploadImage(f, 'slips', onProgress);
