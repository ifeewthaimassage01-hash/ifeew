// ที่เก็บข้อมูลเริ่มต้น — Supabase เป็นแหล่งจริง, เริ่มจากค่าว่างเสมอ (ไม่มี seed)
export function emptyData() {
  return {
    therapists: [],
    services: [],
    serviceCategories: [],
    serviceCategoryEn: {},
    addons: [],
    promotions: [],
    bills: [],
    cashDrawer: {},
    expenses: [],
    auditLog: [],
    eodStatus: {},
    commissionSettings: { mode: 'flat', flatRates: {} },
  };
}

// migrate: ค่าแรงคงที่ต่อแถว (flatAmount, บาท) — เติมจาก flatRate เดิมถ้ายังไม่มี
function migrateServices(services) {
  (services || []).forEach((s) => {
    if (s.flatAmount == null) { s.flatAmount = Math.round((s.price || 0) * (s.flatRate || 0)); }
  });
  return services;
}

export function loadData() {
  try {
    // Local cache ปิดไว้ตามคำขอ: Supabase เป็นแหล่งจริงเพียงที่เดียว เริ่มจากค่าว่างเสมอ
    const data = emptyData();
    migrateServices(data.services);
    return data;
  } catch {
    return emptyData();
  }
}

export function persistData(_obj) {
  /* no local persistence */
}
