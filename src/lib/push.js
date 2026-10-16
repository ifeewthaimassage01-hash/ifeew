// Web Push ฝั่งแอป (แอดมิน/owner เท่านั้น) — I'FEEW POS
// เก็บ subscription ลง Supabase table push_subscriptions (role='owner')
import { supabase, isSupabaseConfigured } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isPushSupported() {
  return (
    typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

export async function getSubscription() {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// ขอ permission → subscribe → upsert ลง Supabase (onConflict endpoint)
export async function subscribeOwner() {
  if (!isPushSupported()) throw new Error('เบราว์เซอร์นี้ไม่รองรับ Push');
  if (!VAPID_PUBLIC_KEY) throw new Error('ยังไม่ได้ตั้งค่า VITE_VAPID_PUBLIC_KEY');
  if (!isSupabaseConfigured || !supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('ยังไม่ได้รับอนุญาตแจ้งเตือน');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }
  const raw = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
      role: 'owner',
    },
    { onConflict: 'endpoint' },
  );
  if (error) throw error;
  return sub;
}

// ยกเลิก push ของเครื่องนี้ + ลบแถวใน Supabase
export async function unsubscribeOwner() {
  if (!isPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try { await sub.unsubscribe(); } catch { /* ข้าม */ }
    if (isSupabaseConfigured && supabase && endpoint) {
      try { await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint); } catch { /* ข้าม */ }
    }
  }
}

export { arrayBufferToBase64 };
