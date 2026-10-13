// Supabase Realtime — one channel for all POS tables.
// Handler is read-only (reload + merge into state), so own writes
// never loop. Caller skips reload while its own sync is in flight.
import { supabase, isSupabaseConfigured } from './supabase';

const TABLES = [
  'therapists', 'services', 'service_categories', 'addons', 'promotions',
  'bills', 'bill_items', 'expenses', 'audit_log', 'app_settings',
];

export function subscribePosTables(onEvent, onStatus) {
  if (!isSupabaseConfigured || !supabase) return () => {};
  let ch = supabase.channel('pos-live');
  TABLES.forEach((t) => {
    ch = ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, onEvent);
  });
  ch.subscribe((status) => { if (onStatus) onStatus(status); });
  return () => {
    try { supabase.removeChannel(ch); } catch { /* ignore */ }
  };
}
