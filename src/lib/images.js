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
  if (!ref) return '';
  const s = String(ref).trim();
  if (/^https?:\/\//i.test(s) || s.startsWith('data:')) return s;
  return ''; // legacy filename-only: no remote URL
}

function validateFile(file) {
  if (!file) throw new Error('no-file');
  if (file.size > MAX_BYTES) throw new Error('ไฟล์ใหญ่เกิน 5MB');
  // allow phone camera types even if mime is empty; Cloudinary will reject if truly invalid
  if (file.type && !ALLOWED.includes(file.type) && !file.type.startsWith('image/')) {
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
  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: form,
  });
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
