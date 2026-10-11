// Cloud sync layer — Supabase as source of truth, localStorage as cache.
// Keeps the same { data, saveData } shape so no page needs to change.
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const cloudStatus = { mode: 'local', lastError: '' };

function toBillRow(b) {
  return {
    id: b.id,
    date: b.date || null,
    customer: b.customer || '',
    member_no: b.memberNo || '',
    payment_method: b.paymentMethod || '',
    status: b.status || 'open',
    discount: b.discount || 0,
    slip_url: b.slip || '',
    paid_at: b.paidAt || null,
    branch_id: b.branchId || 'main',
  };
}

function fromBillRow(r, itemsByBill) {
  return {
    id: r.id,
    date: r.date,
    customer: r.customer || '',
    memberNo: r.member_no || '',
    paymentMethod: r.payment_method || '',
    status: r.status || 'open',
    discount: r.discount || 0,
    slip: r.slip_url || '',
    paidAt: r.paid_at || null,
    branchId: r.branch_id || 'main',
    createdAt: r.created_at || r.date,
    items: (itemsByBill[r.id] || []).map((i) => ({
      serviceId: i.service_id,
      therapistId: i.therapist_id,
      qty: i.qty,
      price: i.price,
      discount: i.discount,
      net: i.net,
    })),
  };
}

export async function loadCloudData(fallbackLocal) {
  if (!isSupabaseConfigured || !supabase) {
    cloudStatus.mode = 'local';
    return null;
  }
  try {
    const [
      therapists, services, cats, addons, promos,
      bills, items, expenses, audit, settings,
    ] = await Promise.all([
      supabase.from('therapists').select('*'),
      supabase.from('services').select('*'),
      supabase.from('service_categories').select('*'),
      supabase.from('addons').select('*'),
      supabase.from('promotions').select('*'),
      supabase.from('bills').select('*').order('created_at', { ascending: true }),
      supabase.from('bill_items').select('*'),
      supabase.from('expenses').select('*').order('date', { ascending: true }),
      supabase.from('audit_log').select('*').order('timestamp', { ascending: true }),
      supabase.from('app_settings').select('*'),
    ]);

    const firstError = [therapists, services, cats, addons, promos, bills, items, expenses, audit, settings]
      .find((r) => r.error)?.error;
    if (firstError) throw firstError;

    const isEmpty =
      (therapists.data?.length || 0) === 0 &&
      (bills.data?.length || 0) === 0 &&
      (services.data?.length || 0) === 0;

    // First run: cloud empty but local has data -> seed cloud once
    if (isEmpty && fallbackLocal && (fallbackLocal.bills?.length || fallbackLocal.services?.length)) {
      cloudStatus.mode = 'cloud-seeding';
      await syncDataToCloud(fallbackLocal);
      cloudStatus.mode = 'cloud';
      return fallbackLocal;
    }

    if (isEmpty && !fallbackLocal) return null;

    const itemsByBill = {};
    for (const i of items.data || []) {
      (itemsByBill[i.bill_id] ||= []).push(i);
    }
    const settingsMap = {};
    for (const s of settings.data || []) settingsMap[s.key] = s.value;

    cloudStatus.mode = 'cloud';
    cloudStatus.lastError = '';
    return {
      therapists: (therapists.data || []).map((t) => ({
        id: t.id, name: t.name, nickname: t.nickname, role: t.role, active: t.active,
      })),
      services: (services.data || []).map((s) => ({
        id: s.id, category: s.category, price: s.price, duration: s.duration,
        flatRate: Number(s.flat_rate || 0), flatAmount: s.flat_amount,
        tierCategory: s.tier_category,
      })),
      serviceCategories: (cats.data || []).map((c) => c.name),
      addons: (addons.data || []).map((a) => ({
        id: a.id, name: a.name, minutes: a.minutes, price: a.price, active: a.active,
      })),
      promotions: (promos.data || []).map((p) => ({
        id: p.id, name: p.name, amount: p.amount, active: p.active,
      })),
      bills: (bills.data || []).map((r) => fromBillRow(r, itemsByBill)),
      expenses: (expenses.data || []).map((e) => ({
        id: e.id, date: e.date, category: e.category, item: e.item,
        amount: e.amount, method: e.method, approvedBy: e.approved_by,
        receiptUrl: e.receipt_url, notes: e.notes, branchId: e.branch_id || 'main',
      })),
      auditLog: (audit.data || []).map((a) => ({
        id: a.id, timestamp: a.timestamp, user: a.user_name, action: a.action,
        detail: a.detail, oldValue: a.old_value, newValue: a.new_value,
        approvedBy: a.approved_by,
      })),
      cashDrawer: settingsMap.cash_drawer || fallbackLocal?.cashDrawer || {},
      eodStatus: settingsMap.eod_status || fallbackLocal?.eodStatus || {},
      commissionSettings: settingsMap.commission_settings || fallbackLocal?.commissionSettings || { mode: 'flat', flatRates: {} },
    };
  } catch (err) {
    console.error('[supabase] load failed:', err);
    cloudStatus.mode = 'local';
    cloudStatus.lastError = err.message || String(err);
    return null;
  }
}

let syncTimer = null;
export function scheduleSync(data) {
  if (!isSupabaseConfigured || !supabase) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncDataToCloud(data).catch((e) => console.error('[supabase] sync failed:', e));
  }, 800);
}

export async function syncDataToCloud(d) {
  if (!isSupabaseConfigured || !supabase) return;
  try {
    const tasks = [];
    if (d.therapists) tasks.push(supabase.from('therapists').upsert(d.therapists.map((t) => ({
      id: t.id, name: t.name, nickname: t.nickname, role: t.role, active: t.active !== false,
    }))));
    if (d.services) tasks.push(supabase.from('services').upsert(d.services.map((s) => ({
      id: s.id, category: s.category, price: s.price, duration: s.duration,
      flat_rate: s.flatRate || 0, flat_amount: s.flatAmount ?? null,
      tier_category: s.tierCategory || 'other',
    }))));
    if (d.serviceCategories) tasks.push(supabase.from('service_categories').upsert(
      d.serviceCategories.map((name) => ({ name })), { onConflict: 'name' },
    ));
    if (d.addons) tasks.push(supabase.from('addons').upsert(d.addons.map((a) => ({
      id: a.id, name: a.name, minutes: a.minutes, price: a.price, active: a.active !== false,
    }))));
    if (d.promotions) tasks.push(supabase.from('promotions').upsert(d.promotions.map((p) => ({
      id: p.id, name: p.name, amount: p.amount, active: p.active !== false,
    }))));
    if (d.expenses) tasks.push(supabase.from('expenses').upsert(d.expenses.map((e) => ({
      id: e.id, date: e.date || null, category: e.category || 'ทั่วไป', item: e.item || '',
      amount: e.amount || 0, method: e.method || '', approved_by: e.approvedBy || '',
      receipt_url: e.receiptUrl || '', notes: e.notes || '', branch_id: e.branchId || 'main',
    }))));
    if (d.auditLog) {
      // audit log only grows — upsert last 200 to bound payload
      const tail = d.auditLog.slice(-200);
      tasks.push(supabase.from('audit_log').upsert(tail.map((a) => ({
        id: a.id, timestamp: a.timestamp || new Date().toISOString(),
        user_name: a.user || '', action: a.action || '', detail: a.detail || '',
        old_value: String(a.oldValue ?? ''), new_value: String(a.newValue ?? ''),
        approved_by: a.approvedBy || '',
      }))));
    }
    if (d.bills) tasks.push(supabase.from('bills').upsert(d.bills.map(toBillRow)));
    const results = await Promise.all(tasks);
    const err = results.find((r) => r?.error)?.error;
    if (err) throw err;

    // bill_items: replace per bill (simple + correct for POS scale)
    if (d.bills) {
      const billIds = d.bills.map((b) => b.id);
      if (billIds.length > 0) {
        // delete items of these bills then re-insert current snapshot
        const { error: delErr } = await supabase.from('bill_items').delete().in('bill_id', billIds);
        if (delErr) throw delErr;
        const rows = [];
        for (const b of d.bills) {
          for (const it of b.items || b.customers || []) {
            rows.push({
              bill_id: b.id,
              service_id: it.serviceId || null,
              therapist_id: it.therapistId || null,
              qty: it.qty || 1,
              price: it.price || 0,
              discount: it.discount || 0,
              net: it.net ?? it.price ?? 0,
            });
          }
        }
        if (rows.length > 0) {
          const { error: insErr } = await supabase.from('bill_items').insert(rows);
          if (insErr) throw insErr;
        }
      }
    }

    await supabase.from('app_settings').upsert([
      { key: 'cash_drawer', value: d.cashDrawer || {} },
      { key: 'eod_status', value: d.eodStatus || {} },
      { key: 'commission_settings', value: d.commissionSettings || {} },
    ], { onConflict: 'key' });

    cloudStatus.mode = 'cloud';
    cloudStatus.lastError = '';
  } catch (err) {
    console.error('[supabase] sync failed:', err);
    cloudStatus.mode = 'local';
    cloudStatus.lastError = err.message || String(err);
    throw err;
  }
}
