import { useState, useEffect, useRef } from 'react';
import { Crown, TrendingUp, Eye, ArrowLeft, UserX, CalendarDays, ReceiptText, Sparkles } from 'lucide-react';
import { Card, CardHead, EmptyState, DatePicker, inSingleDay, fmtDay } from '../components/ui';
import AttendanceCard from '../components/AttendanceCard';
import { bizDateOf, bizToday } from '../utils/bkk';
import { svcLabel, commBaht, freelanceDisplayName, guaranteeAmountOf, guaranteeTopups, applyGuaranteeForDate, guaranteeSigOf, GUARANTEE_CATEGORY, billLinesOf } from '../lib/billing';

export default function PageCommission({ data, saveData, role }) {
  const isStaff = role === 'staff';
  const [historyFor, setHistoryFor] = useState(null);
  // M3: viewTab เป็น state ดูข้อมูลอย่างเดียว ไม่เขียนทับ commissionSettings ใน DB
  const [viewTab, setViewTab] = useState('regular'); // regular | freelance | rates
  const todayStr = bizToday();
  const [filterDate, setFilterDate] = useState(todayStr);
  const [guaranteeMsg, setGuaranteeMsg] = useState('');
  const therapists = data.therapists || [];
  // ประกันมือคิดรายวัน — range วันเดียวเท่านั้นถึงมี topup
  const singleDay = filterDate ? filterDate : null;
  const guaranteeAmt = guaranteeAmountOf(data);
  const topups = singleDay ? guaranteeTopups(data, singleDay) : [];
  const topupById = {};
  topups.forEach((t) => { topupById[t.therapistId] = t; });
  const topupSum = topups.reduce((s, t) => s + t.shortfall, 0);
  // ยอดรวมที่หมอได้จริง = ค่าแรงจริง + ส่วนต่างประกัน (ครบยอด)
  const dispTotal = (tid, base) => base + (topupById[tid]?.shortfall || 0);
  // คนที่ยังไม่ได้เติม (ไม่มี expense notes key) — ใช้ตั้งชื่อใน toast (ensure สร้างชุดเดียวกัน)

  // ลายเซ็นข้อมูลที่ ensure เคยประมวลผลแล้ว — กัน double-invoke (StrictMode) เซฟซ้ำ
  // (P1-1: ใช้ helper กลาง guaranteeSigOf ที่อ่าน att/bills/expenses จาก d ล้วน กันอ่านค่าตัวเก่า)
  const ensureSigOf = guaranteeSigOf;

  // P2-2: reset toast ทุกครั้งที่เปลี่ยนวัน (กันข้อความค้างข้ามวัน)
  useEffect(() => { setGuaranteeMsg(''); }, [singleDay]);
  // เติม+ปรับลดรายจ่ายประกันอัตโนมัติเมื่อดูวันเดียว — strict ตรวจ changed ถึง saveData
  // (ensure dedupe ด้วย notes key + reconcile ปรับยอดเกินให้ตรง shortfall; รันซ้ำบนข้อมูลเดิมได้ changed=false → หยุด ไม่ loop)
  // busy-guard กันซ้อน: รันทีละรอบ งานที่มาซ้อนเก็บ latest ไว้แล้วต่อคิวใน finally (pendingRef)
  const ensureSig = useRef('');
  const busyRef = useRef(false);
  const pendingRef = useRef(null);
  const runApply = (d, day) => {
    busyRef.current = true;
    return applyGuaranteeForDate(d, day).then((res) => {
      if (res && res.changed) {
        saveData(res.data);
        const parts = [];
        const added = (res.summary && res.summary.added) || [];
        if (added.length > 0) parts.push(`เติม ${added.map((t) => `${t.name} +฿ ${Number(t.shortfall).toLocaleString()}`).join(' · ')}`);
        const fixed = (res.summary && res.summary.fixed) || [];
        if (fixed.length > 0) parts.push(`ปรับลด ${fixed.map((f) => `${f.name} ฿ ${Number(f.from).toLocaleString()}→฿ ${Number(f.to).toLocaleString()}`).join(' · ')}`);
        if (parts.length > 0) setGuaranteeMsg(`ประกันมือ (${fmtDay(day)}): ${parts.join(' — ')} — ครบ ฿ ${guaranteeAmt.toLocaleString()}/คน`);
      }
    }).catch(() => { ensureSig.current = ''; }).finally(() => {
      busyRef.current = false;
      const p = pendingRef.current;
      pendingRef.current = null;
      if (p && p.sig !== ensureSig.current) {
        ensureSig.current = p.sig;
        runApply(p.data, p.day);
      }
    });
  };
  useEffect(() => {
    if (!singleDay) return;
    const sig = ensureSigOf(data, singleDay);
    if (ensureSig.current === sig) return; // ลายเซ็นเดิมประมวลผลแล้ว — ข้าม กันเซฟซ้ำ
    if (busyRef.current) { pendingRef.current = { data, day: singleDay, sig }; return; }
    ensureSig.current = sig;
    runApply(data, singleDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [singleDay, data]);
  const bills = (data.bills || []).filter((b) => b.status === 'paid' && inSingleDay(bizDateOf(b.date || b.createdAt), filterDate));

  const stats = {};
  therapists.forEach((t) => { stats[t.id] = { totalSales: 0, flatCommission: 0, jobs: 0, total: 0, services: {}, svcDetail: {}, history: [] }; });
  let freelanceTotal = 0;
  let freelanceJobs = 0;
  let freelanceComm = 0;
  let freelanceFuel = 0;
  const regBillIds = new Set();
  const extBillIds = new Set();
  const freelanceById = {};
  bills.forEach((bill) => {
    billLinesOf(bill, data.services, therapists).forEach((l) => {
      const qty = l.it.qty || 1;
      // M4: เช็กหมอวิ่งมาตรฐานที่เดียว (isFreelance) ผ่าน l.staff จาก billing.js
      if (!l.staff) {
        const key = l.tid ? String(l.tid) : 'ไม่ระบุ';
        freelanceTotal += l.price; freelanceJobs += qty;
        // BUG-02 (reports): ค่าแรงหมอวิ่งหักส่วนลดท้ายบิลเหมือนรายงานอื่น (เดิมคิดเต็ม)
        freelanceComm += l.comm;
        extBillIds.add(bill.id);
        if (!freelanceById[key]) freelanceById[key] = { jobs: 0, total: 0 };
        freelanceById[key].jobs += qty;
        freelanceById[key].total += l.price;
        return;
      }
      // M1: นับ net/jobs หมอประจำก่อนเช็ก svc — บริการถูกลบเหลือแค่ comm=0
      const s = stats[l.tid];
      if (!s) return; // กัน therapist ถูกลบ/ไม่รู้จัก — ไม่ให้ throw
      s.totalSales += l.price;
      s.jobs += qty;
      regBillIds.add(bill.id);
      // โหมด Flat: หมอประจำ (บาท) ต่อครั้งที่นวด — หักส่วนลดท้ายบิลตามสัดส่วน (BUG-02)
      s.flatCommission += l.comm;
      // นับว่านวดอะไรไปบ้าง + เก็บประวัติ
      const label = l.svc ? svcLabel(l.svc) : (l.it.serviceName || l.it.serviceId || 'บริการที่ลบแล้ว');
      s.services[label] = (s.services[label] || 0) + qty;
      if (!s.svcDetail[label]) s.svcDetail[label] = { qty: 0, sales: 0, comm: 0 };
      s.svcDetail[label].qty += qty;
      s.svcDetail[label].sales += l.price;
      s.svcDetail[label].comm += l.comm;
      s.history.push({ billId: bill.id, date: bill.date || bill.createdAt || '', label, qty, net: l.price, comm: l.comm });
    });
  });
  // ค่าน้ำมันหมอวิ่ง ฿30/รอบ — ผูกกับบิลที่มีงานหมอวิ่ง
  bills.forEach((bill) => {
    if (extBillIds.has(bill.id)) freelanceFuel += bill.fuel || 0;
  });
  therapists.forEach((t) => {
    const s = stats[t.id];
    // ร้านใช้แบบคงที่/ครั้งอย่างเดียว (ไม่มี tier) — total = flatCommission เสมอ
    s.total = Math.round(s.flatCommission);
  });

  const ranked = [...therapists].sort((a, b) => stats[b.id].totalSales - stats[a.id].totalSales);
  const sumSalesPaid = Object.values(stats).reduce((s, t) => s + t.totalSales, 0);
  const sumSales = sumSalesPaid + freelanceTotal;
  // P0-1: วัดวันเดียว — รวมรายจ่ายประกันที่สร้างไว้ตามวันที่ filterDate (กันประกันหาย)
  // (ลอกวิธี PageDashboard: filter category===GUARANTEE_CATEGORY + inSingleDay แล้วบวกกลับ)
  const guaranteeSum = (data.expenses || [])
    .filter((e) => e && e.category === GUARANTEE_CATEGORY && inSingleDay(e.date, filterDate))
    .reduce((s, e) => s + (e.amount || 0), 0);
  // รายได้หมอรวมส่วนต่างประกัน (วันเดียวใช้ topup ที่คำนวณสด / หลายวันใช้ยอด expense ที่สร้างไว้)
  const sumComm = Object.values(stats).reduce((s, t) => s + t.total, 0) + (singleDay ? topupSum : guaranteeSum);

  // บิลที่เปิดอยู่ไม่นำมาคำนวณค่าแรงล่วงหน้า (กันยอดจ่ายจริงเพี้ยน) — ดูได้ที่หน้าบิลที่เปิดอยู่

  // ---- หน้าใหม่: ประวัติการนวดรายคน ----
  if (historyFor && stats[historyFor.id]) {
    const hs = stats[historyFor.id];
    const rows = [...hs.history].sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const maxNet = Math.max(...rows.map((r) => r.net), 1);
    const svcCount = Object.keys(hs.services).length;
    return (
      <div className="hist-page">
        <button className="hist-back" onClick={() => setHistoryFor(null)}>
          <ArrowLeft size={15} />กลับหน้าค่าแรง
        </button>

        <div className="hist-hero">
          <div className="hist-hero-top">
            <div className="hist-ava">{(historyFor.name || '?').charAt(0)}</div>
            <div className="hist-id">
              <div className="hist-name">{historyFor.name}</div>
              <div className="hist-role">
                <span className="hist-jobs">{hs.jobs} งานทั้งหมด</span>
              </div>
            </div>
          </div>
          <div className="hist-stats">
            <div className="hist-stat"><span className="hl">ยอดขาย</span><b>฿ {Math.round(hs.totalSales).toLocaleString()}</b></div>
            <div className="hist-stat solid"><span className="hl">ค่าแรง{topupById[historyFor.id] ? ' (รวมประกัน)' : ''}</span><b>฿ {dispTotal(historyFor.id, hs.total).toLocaleString()}</b>
              {topupById[historyFor.id] && (
                <span style={{ display: 'block', marginTop: 4 }}>
                  <span className="badge info">ประกันมือ</span>{' '}
                  <small className="muted">จริง ฿ {hs.total.toLocaleString()} + ประกัน ฿ {topupById[historyFor.id].shortfall.toLocaleString()}</small>
                </span>
              )}
            </div>
          </div>
        </div>

        <Card>
          <CardHead title="สรุป" right={<span className="badge neutral">{svcCount}</span>} />
          <div className="hist-sum-grid">
            {Object.entries(hs.svcDetail).map(([k, d]) => (
              <div key={k} className="hist-sum-box">
                <div className="hist-sum-top"><b>{k}</b><span className="hist-count"><Sparkles size={11} /> {d.qty} ครั้ง</span></div>
                <div className="hist-sum-prices"><span>ยอด ฿ {Math.round(d.sales).toLocaleString()}</span><em>ค่าแรง ฿ {Math.round(d.comm).toLocaleString()}</em></div>
              </div>
            ))}
            {svcCount === 0 && <p className="muted">ยังไม่มีงานนวด</p>}
          </div>
        </Card>

        <Card className="table-card show-desktop">
          <CardHead title="ประวัติ" right={<span className="badge neutral">{rows.length}</span>} />
          <div className="table-scroll">
            <table className="tbl">
              <thead><tr><th>วันที่</th><th>บิล</th><th>บริการ</th><th className="r">จำนวน</th><th className="r">ยอดขาย</th><th className="r">ค่าแรง</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="muted">{String(r.date).slice(0, 16).replace('T', ' ')}</td>
                    <td>{r.billId}</td>
                    <td>{r.label}</td>
                    <td className="r">× {r.qty}</td>
                    <td className="r mono">฿ {Math.round(r.net).toLocaleString()}</td>
                    <td className="r"><b style={{ color: 'var(--brown)' }}>฿ {Math.round(r.comm).toLocaleString()}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="mlist show-mobile">
          <div className="hist-list-head"><b>ประวัติ</b><span className="badge neutral">{rows.length}</span></div>
          {rows.map((r, i) => (
            <div key={i} className="hist-card">
              <div className="hist-card-top">
                <b>{r.label}</b>
                <span className="hist-qty">× {r.qty}</span>
              </div>
              <div className="hist-meta">
                <span><ReceiptText size={12} /> {r.billId}</span>
                <span><CalendarDays size={12} /> {String(r.date).slice(0, 16).replace('T', ' ')}</span>
              </div>
              <div className="hist-amounts">
                <div className="hist-amt"><span>ยอดขาย</span><b>฿ {Math.round(r.net).toLocaleString()}</b></div>
                <div className="hist-amt comm"><span>ค่าแรง</span><b>฿ {Math.round(r.comm).toLocaleString()}</b></div>
              </div>
            </div>
          ))}
          {rows.length === 0 && <Card><p className="muted">ยังไม่มีงานนวด</p></Card>}
        </div>
      </div>
    );
  }

  // ---- แทบที่ 3: เรทค่าแรงตามบริการ (อ้างอิง) ----
  if (viewTab === 'rates') {
    const priced = (data.services || []).filter((s) => s.price > 0);
    return (
      <div>
        <div className="seg cols3">
          <button onClick={() => setViewTab('regular')} className={viewTab === 'regular' ? 'on' : ''}>หมอประจำ</button>
          <button onClick={() => setViewTab('freelance')} className={viewTab === 'freelance' ? 'on' : ''}>หมอวิ่ง</button>
          <button onClick={() => setViewTab('rates')} className={viewTab === 'rates' ? 'on' : ''}>ราคาบริการ</button>
        </div>

        <Card>
          <CardHead title="หมอประจำ ตามบริการ" right={<span className="badge neutral">{priced.length}</span>} />
          <div className="refgrid">
            {priced.map((s) => (
              <div key={s.id} className="refbox"><b>{svcLabel(s)}</b><small className="muted">฿ {s.price.toLocaleString()} · <b style={{ color: 'var(--brown)' }}>ค่าแรง ฿ {commBaht(s).toLocaleString()}</b></small></div>
            ))}
          </div>
        </Card>
      </div>
    );
  }
  // ---- หน้าหมอวิ่ง: ว่างจนกว่าจะมีงานหมอวิ่ง (ไม่มีประวัติรายคน) ----
  if (viewTab === 'freelance') {
    const freelanceList = Object.entries(freelanceById).sort((a, b) => b[1].total - a[1].total);
    return (
      <div>
        <div className="seg cols3">
          <button onClick={() => setViewTab('regular')} className={viewTab === 'regular' ? 'on' : ''}>หมอประจำ</button>
          <button onClick={() => setViewTab('freelance')} className={viewTab === 'freelance' ? 'on' : ''}>หมอวิ่ง</button>
          <button onClick={() => setViewTab('rates')} className={viewTab === 'rates' ? 'on' : ''}>ราคาบริการ</button>
        </div>

        <DatePicker date={filterDate} onChange={setFilterDate} />

        {freelanceJobs === 0 ? (
          <Card>
            <EmptyState icon={UserX} title="ยังไม่มีข้อมูลหมอวิ่ง" subtitle="จะแสดงที่นี่เมื่อมีงานนวดของหมอวิ่ง (นอกระบบ)" />
          </Card>
        ) : (
          <>
            {!isStaff && (
            <div className="kpi-grid">
              <div className="kpi dark"><div className="kpi-label">รายได้ร้าน</div><div className="kpi-value">฿ {Math.round(freelanceTotal - freelanceComm - freelanceFuel).toLocaleString()}</div><div className="kpi-sub">{extBillIds.size} บิลชำระแล้ว</div></div>
              <div className="kpi brass"><div className="kpi-label">รายได้หมอ</div><div className="kpi-value">฿ {Math.round(freelanceComm + freelanceFuel).toLocaleString()}</div><div className="kpi-sub">รวมค่าน้ำมันแล้ว</div></div>
            </div>
            )}

            <Card className="table-card show-desktop">
              <div className="table-scroll">
                <table className="tbl">
                  <thead><tr><th>หมอวิ่ง</th><th className="r">งาน (ครั้ง)</th><th className="r">ยอดขาย</th></tr></thead>
                  <tbody>
                    {freelanceList.map(([tid, f]) => (
                      <tr key={tid}>
                        <td><b style={{ fontWeight: 600 }}>{freelanceDisplayName(tid)}</b> <span className="badge neutral">นอกระบบ</span></td>
                        <td className="r">{f.jobs}</td>
                        <td className="r mono">฿ {Math.round(f.total).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="mlist show-mobile">
              {freelanceList.map(([tid, f]) => (
                <Card key={tid}>
                  <div className="mcard-top">
                    <div className="pagehead-main">
                      <div className="thera-ava" style={{ width: 46, height: 46 }}>{freelanceDisplayName(tid).charAt(0)}</div>
                      <div><b style={{ fontSize: 14 }}>{freelanceDisplayName(tid)}</b><div className="muted">{f.jobs} งาน · นอกระบบ</div></div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                    <span className="muted">{f.jobs} ครั้ง</span>
                    <b style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>฿ {Math.round(f.total).toLocaleString()}</b>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="seg cols3">
        <button onClick={() => setViewTab('regular')} className={viewTab === 'regular' ? 'on' : ''}>หมอประจำ</button>
        <button onClick={() => setViewTab('freelance')} className={viewTab === 'freelance' ? 'on' : ''}>หมอวิ่ง</button>
        <button onClick={() => setViewTab('rates')} className={viewTab === 'rates' ? 'on' : ''}>ราคาบริการ</button>
      </div>

      <DatePicker date={filterDate} onChange={setFilterDate} />

      {guaranteeMsg && singleDay && <div className="alert ok">{guaranteeMsg}</div>}

      {/* owner แก้เช็กชื่อย้อนหลังของวันที่ดูอยู่ (เฉพาะช่วงวันเดียว) */}
      {!isStaff && singleDay && (
        <div className="mt12">
          <AttendanceCard
            data={data}
            saveData={saveData}
            dateStr={singleDay}
            role={role}
            title={`เช็กชื่อย้อนหลัง ${fmtDay(singleDay)}`}
            hint={singleDay === todayStr ? 'วันนี้ · แก้ได้ทันที เติมประกันอัตโนมัติ' : 'วันที่ดูอยู่ · แก้ได้ทันที เติมประกันอัตโนมัติ'}
          />
        </div>
      )}

      {!isStaff && (
      <div className="kpi-grid">
        <div className="kpi dark"><div className="kpi-label">รายได้ร้าน</div><div className="kpi-value">฿ {Math.round(sumSalesPaid - sumComm).toLocaleString()}</div><div className="kpi-sub">{regBillIds.size} บิล</div></div>
        <div className="kpi brass"><div className="kpi-label">รายได้หมอ</div><div className="kpi-value">฿ {Math.round(sumComm).toLocaleString()}</div></div>
      </div>
      )}

      

      <Card className="table-card show-desktop">
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>พนักงาน</th><th className="r">งาน (ครั้ง)</th><th className="r">ยอดขาย</th><th className="r">ค่าแรง</th><th></th></tr></thead>
            <tbody>
              {ranked.map((t, idx) => {
                const s = stats[t.id];
                const top = topupById[t.id];
                return (
                  <tr key={t.id}>
                    <td><span className="muted">#{idx + 1}</span> <b style={{ fontWeight: 600 }}>{t.name}</b>{top && <span className="badge info" style={{ marginLeft: 6 }}>ประกันมือ</span>}</td>
                    <td className="r">{s.jobs}</td>
                    <td className="r mono">฿ {Math.round(s.totalSales).toLocaleString()}</td>
                    <td className="r"><b style={{ color: 'var(--brown)' }}>฿ {dispTotal(t.id, s.total).toLocaleString()}</b>
                      {top && <small className="muted" style={{ display: 'block' }}>จริง ฿ {s.total.toLocaleString()} + ประกัน ฿ {top.shortfall.toLocaleString()}</small>}
                    </td>
                    <td className="r"><button className="btn btn-ghost" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => setHistoryFor(t)} title="ดูประวัติการนวด">ดู</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mlist show-mobile">
        {ranked.map((t, idx) => {
          const s = stats[t.id];
          const top = topupById[t.id];
          const pct = sumSales ? Math.max((s.totalSales / sumSales) * 100, 2) : 2;
          return (
            <Card key={t.id}>
              <div className="mcard-top">
                <div className="pagehead-main">
                  <div className="thera-ava" style={{ width: 46, height: 46 }}>{(t.name || '?').charAt(0)}</div>
                  <div><b style={{ fontSize: 14 }}>{t.name}</b><div className="muted">{s.jobs} งาน{top ? ' · ประกันมือ' : ''}</div></div>
                </div>
                <div className="mcard-actions">
                  {idx === 0 && s.totalSales > 0 && <span className="badge info"><Crown size={11} /> Top</span>}
                  <button className="card-eye-inline" onClick={() => setHistoryFor(t)} title="ดูประวัติการนวด" aria-label="ดูประวัติการนวด"><Eye size={15} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                <span className="muted">ยอดขาย ฿ {Math.round(s.totalSales).toLocaleString()}</span>
                <b style={{ fontSize: 22, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>฿ {dispTotal(t.id, s.total).toLocaleString()}</b>
              </div>
              {top && <div className="muted" style={{ textAlign: 'right', marginTop: 2 }}>จริง ฿ {s.total.toLocaleString()} + ประกัน ฿ {top.shortfall.toLocaleString()}</div>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
