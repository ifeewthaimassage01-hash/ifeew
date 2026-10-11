import { useState } from 'react';
import { Crown, TrendingUp, Eye, ArrowLeft, UserX, CalendarDays, ReceiptText, Sparkles } from 'lucide-react';
import { Card, CardHead, Kpi, EmptyState, DateRange, inDateRange } from '../components/ui';
import { bkkToday } from '../utils/bkk';
import { svcLabel, commBaht, freelanceDisplayName } from '../data/demoData';

const TIERS = [
  { max: 30000, rate: 0.30, label: '≤ 30k → 30%' },
  { max: 50000, rate: 0.35, label: '30–50k → 35%' },
  { max: 80000, rate: 0.40, label: '50–80k → 40%' },
  { max: Infinity, rate: 0.45, label: '> 80k → 45%' },
];

export default function PageCommission({ data, saveData, role }) {
  const isStaff = role === 'staff';
  const [historyFor, setHistoryFor] = useState(null);
  const todayStr = bkkToday();
  const [dr, setDr] = useState({ from: todayStr, to: todayStr });
  const therapists = data.therapists || [];
  const bills = (data.bills || []).filter((b) => b.status === 'paid' && inDateRange(b.date || b.createdAt, dr.from, dr.to));
  const settings = data.commissionSettings || { mode: 'flat' };

  const stats = {};
  therapists.forEach((t) => { stats[t.id] = { totalSales: 0, flatCommission: 0, jobs: 0, tieredCommission: 0, rate: 0.30, total: 0, services: {}, svcDetail: {}, history: [] }; });
  let freelanceTotal = 0;
  let freelanceJobs = 0;
  const freelanceById = {};
  bills.forEach((bill) => {
    (bill.items || bill.customers || []).forEach((itm) => {
      const tid = itm.therapistId || bill.therapistId;
      const s = stats[tid];
      if (!s) {
        const key = tid ? String(tid) : 'ไม่ระบุ';
        const net = itm.net ?? itm.price ?? 0;
        const qty = itm.qty || 1;
        freelanceTotal += net; freelanceJobs += qty;
        if (!freelanceById[key]) freelanceById[key] = { jobs: 0, total: 0 };
        freelanceById[key].jobs += qty;
        freelanceById[key].total += net;
        return;
      }
      const svc = (data.services || []).find((x) => x.id === itm.serviceId);
      if (!svc) return;
      const net = itm.net ?? itm.price ?? 0;
      const qty = itm.qty || 1;
      const comm = commBaht(svc) * qty;
      s.totalSales += net;
      s.jobs += qty;
      // โหมด Flat: หมอประจำ (บาท) ต่อครั้งที่นวด
      s.flatCommission += comm;
      // นับว่านวดอะไรไปบ้าง + เก็บประวัติ
      const label = svcLabel(svc);
      s.services[label] = (s.services[label] || 0) + qty;
      if (!s.svcDetail[label]) s.svcDetail[label] = { qty: 0, sales: 0, comm: 0 };
      s.svcDetail[label].qty += qty;
      s.svcDetail[label].sales += net;
      s.svcDetail[label].comm += comm;
      s.history.push({ billId: bill.id, date: bill.date || bill.createdAt || '', label, qty, net, comm });
    });
  });
  therapists.forEach((t) => {
    const s = stats[t.id];
    let comm = 0;
    for (let i = 0; i < TIERS.length; i++) {
      const prev = i === 0 ? 0 : TIERS[i - 1].max;
      const range = Math.min(TIERS[i].max, s.totalSales) - prev;
      if (range > 0) comm += range * TIERS[i].rate;
      if (s.totalSales <= TIERS[i].max) break;
    }
    s.tieredCommission = Math.round(comm);
    s.rate = s.totalSales > 80000 ? 0.45 : s.totalSales > 50000 ? 0.40 : s.totalSales > 30000 ? 0.35 : 0.30;
    s.total = Math.round(settings.mode === 'tier' ? s.tieredCommission : s.flatCommission);
  });

  const ranked = [...therapists].sort((a, b) => stats[b.id].totalSales - stats[a.id].totalSales);
  const sumSalesPaid = Object.values(stats).reduce((s, t) => s + t.totalSales, 0);
  const sumSales = sumSalesPaid + freelanceTotal;
  const sumComm = Object.values(stats).reduce((s, t) => s + t.total, 0);
  const changeMode = (mode) => saveData({ ...data, commissionSettings: { ...data.commissionSettings, mode } });

  // บิลที่เปิดอยู่ (ยังไม่เช็คบิล) — ค่าแรงโดยประมาณ รอจ่ายจริงตอนเช็คบิล
  const openBills = (data.bills || []).filter((b) => b.status === 'open');
  const pending = { sales: 0, comm: 0, count: openBills.length };
  if (settings.mode === 'flat') {
    openBills.forEach((bill) => {
      (bill.items || bill.customers || []).forEach((itm) => {
        const net = itm.net ?? itm.price ?? 0;
        pending.sales += net;
        if (!String(itm.therapistId || bill.therapistId || '').startsWith('EXT-')) {
          const svc = (data.services || []).find((x) => x.id === itm.serviceId);
          if (svc) pending.comm += commBaht(svc) * (itm.qty || 1);
        }
      });
    });
  } else {
    // Tier: ค่าแรงส่วนเพิ่ม = tier(ยอดรวมบิลเปิดอยู่) − tier(ยอดชำระแล้ว)
    openBills.forEach((bill) => {
      (bill.items || bill.customers || []).forEach((itm) => { pending.sales += itm.net ?? itm.price ?? 0; });
    });
    const tiered = (total) => {
      let comm = 0;
      for (let i = 0; i < TIERS.length; i++) {
        const prev = i === 0 ? 0 : TIERS[i - 1].max;
        const range = Math.min(TIERS[i].max, total) - prev;
        if (range > 0) comm += range * TIERS[i].rate;
        if (total <= TIERS[i].max) break;
      }
      return comm;
    };
    pending.comm = Math.round(tiered(sumSalesPaid + pending.sales) - tiered(sumSalesPaid));
  }

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
            <div className="hist-ava">{historyFor.nickname.charAt(0)}</div>
            <div className="hist-id">
              <div className="hist-name">{historyFor.name} <span>· {historyFor.nickname}</span></div>
              <div className="hist-role">
                <span className={`badge ${historyFor.role === 'senior' ? 'paid' : 'info'}`}>{historyFor.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</span>
                <span className="hist-jobs">{hs.jobs} งานทั้งหมด</span>
              </div>
            </div>
          </div>
          <div className="hist-stats">
            <div className="hist-stat"><span className="hl">ยอดขาย</span><b>฿ {Math.round(hs.totalSales).toLocaleString()}</b></div>
            <div className="hist-stat solid"><span className="hl">ค่าแรง</span><b>฿ {hs.total.toLocaleString()}</b></div>
          </div>
        </div>

        <Card>
          <CardHead title="สรุป" right={<span className="badge neutral">{svcCount} แบบ</span>} />
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
          <CardHead title="ประวัติ" right={<span className="badge neutral">{rows.length} รายการ</span>} />
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
          <div className="hist-list-head"><b>ประวัติ</b><span className="badge neutral">{rows.length} รายการ</span></div>
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
              <div className="bar-track"><i className="bar-fill" style={{ width: `${Math.max((r.net / maxNet) * 100, 4)}%` }} /></div>
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
  if (settings.mode === 'rates') {
    const priced = (data.services || []).filter((s) => s.price > 0);
    return (
      <div>
        <div className="seg cols3">
          <button onClick={() => changeMode('flat')} className={settings.mode === 'flat' ? 'on' : ''}>หมอประจำ</button>
          <button onClick={() => changeMode('tier')} className={settings.mode === 'tier' ? 'on' : ''}>หมอวิ่ง</button>
          <button onClick={() => changeMode('rates')} className={settings.mode === 'rates' ? 'on' : ''}>ราคาบริการ</button>
        </div>

        <Card>
          <CardHead title="หมอประจำ ตามบริการ" right={<span className="badge neutral">{priced.length} บริการ</span>} />
          <div className="refgrid">
            {priced.map((s) => (
              <div key={s.id} className="refbox"><b>{svcLabel(s)}</b><small className="muted">฿ {s.price.toLocaleString()} · <b style={{ color: 'var(--brown)' }}>ค่าแรง ฿ {commBaht(s).toLocaleString()}</b></small></div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: 10 }}><TrendingUp size={12} style={{ verticalAlign: -1 }} /> ค่าแรงคงที่ (บาท) ต่อครั้งที่นวดของหมอประจำ</p>
        </Card>
      </div>
    );
  }
  // ---- หน้าหมอวิ่ง: ว่างจนกว่าจะมีงานหมอวิ่ง (ไม่มีประวัติรายคน) ----
  if (settings.mode === 'tier') {
    const freelanceList = Object.entries(freelanceById).sort((a, b) => b[1].total - a[1].total);
    return (
      <div>
        <div className="seg cols3">
          <button onClick={() => changeMode('flat')} className={settings.mode === 'flat' ? 'on' : ''}>หมอประจำ</button>
          <button onClick={() => changeMode('tier')} className={settings.mode === 'tier' ? 'on' : ''}>หมอวิ่ง</button>
          <button onClick={() => changeMode('rates')} className={settings.mode === 'rates' ? 'on' : ''}>ราคาบริการ</button>
        </div>

        <DateRange from={dr.from} to={dr.to} onChange={setDr} />

        {freelanceJobs === 0 ? (
          <Card>
            <EmptyState icon={UserX} title="ยังไม่มีข้อมูลหมอวิ่ง" subtitle="จะแสดงที่นี่เมื่อมีงานนวดของหมอวิ่ง (นอกระบบ)" />
          </Card>
        ) : (
          <>
            {!isStaff && (
            <div className="kpi-grid">
              <div className="kpi dark"><div className="kpi-label">ยอดขายหมอวิ่ง</div><div className="kpi-value">฿ {Math.round(freelanceTotal).toLocaleString()}</div><div className="kpi-sub">{bills.length} บิลชำระแล้ว</div></div>
              <Kpi label="งานหมอวิ่ง" value={freelanceJobs} sub="ครั้ง" />
              <Kpi label="หมอวิ่ง" value={freelanceList.length} sub="คน" />
              <Kpi label="เฉลี่ยต่อคน" value={`฿ ${Math.round(freelanceTotal / (freelanceList.length || 1)).toLocaleString()}`} small sub="ยอดขาย" />
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
                  <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="mini-box"><div className="l">งาน</div><div className="v">{f.jobs} ครั้ง</div></div>
                    <div className="mini-box hl"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(f.total).toLocaleString()}</div></div>
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
        <button onClick={() => changeMode('flat')} className={settings.mode === 'flat' ? 'on' : ''}>หมอประจำ</button>
        <button onClick={() => changeMode('tier')} className={settings.mode === 'tier' ? 'on' : ''}>หมอวิ่ง</button>
        <button onClick={() => changeMode('rates')} className={settings.mode === 'rates' ? 'on' : ''}>ราคาบริการ</button>
      </div>

      <DateRange from={dr.from} to={dr.to} onChange={setDr} />

      {freelanceTotal > 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}>ยอดหมอวิ่ง (นอกระบบ) ฿ {Math.round(freelanceTotal).toLocaleString()} · {freelanceJobs} งาน — ไม่รวมในค่าแรงพนักงานประจำ</div>
      )}

      {!isStaff && (
      <div className="kpi-grid">
        <div className="kpi dark"><div className="kpi-label">ยอดขายรวม (รวมหมอวิ่ง)</div><div className="kpi-value">฿ {Math.round(sumSales).toLocaleString()}</div><div className="kpi-sub">{bills.length} บิลชำระแล้ว</div></div>
        <div className="kpi brass"><div className="kpi-label">ค่าแรงรวม (หมอประจำ)</div><div className="kpi-value">฿ {Math.round(sumComm).toLocaleString()}</div><div className="kpi-sub">{((sumComm / (sumSales || 1)) * 100).toFixed(1)}% ของยอดขาย</div></div>
        <Kpi label="พนักงาน" value={therapists.length} sub="คน" />
        <Kpi label="เฉลี่ยต่อคน" value={`฿ ${Math.round(sumSales / (therapists.length || 1)).toLocaleString()}`} small sub="ยอดขาย" />
      </div>
      )}

      {pending.count > 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          รอเช็คบิล {pending.count} บิล · ยอดค้าง ฿ {Math.round(pending.sales).toLocaleString()} · ค่าแรงโดยประมาณ ฿ {Math.round(pending.comm).toLocaleString()} — ยังไม่รวมในยอดข้างบน จ่ายจริงตอนเช็คบิล
        </div>
      )}

      <Card className="table-card show-desktop">
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>พนักงาน</th><th className="r">งาน (ครั้ง)</th><th className="r">ยอดขาย</th><th className="r">ค่าแรง</th><th></th></tr></thead>
            <tbody>
              {ranked.map((t, idx) => {
                const s = stats[t.id];
                return (
                  <tr key={t.id}>
                    <td><span className="muted">#{idx + 1}</span> <b style={{ fontWeight: 600 }}>{t.name} <span className="muted">({t.nickname})</span></b> <span className={`badge ${t.role === 'senior' ? 'paid' : 'info'}`}>{t.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</span></td>
                    <td className="r">{s.jobs}</td>
                    <td className="r mono">฿ {Math.round(s.totalSales).toLocaleString()}</td>
                    <td className="r"><b style={{ color: 'var(--brown)' }}>฿ {s.total.toLocaleString()}</b></td>
                    <td className="r"><button className="btn-ghost" onClick={() => setHistoryFor(t)} title="ดูประวัติการนวด"><Eye size={14} /></button></td>
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
          const pct = sumSales ? Math.max((s.totalSales / sumSales) * 100, 2) : 2;
          return (
            <Card key={t.id}>
              <div className="mcard-top">
                <div className="pagehead-main">
                  <div className="thera-ava" style={{ width: 46, height: 46 }}>{t.nickname.charAt(0)}</div>
                  <div><b style={{ fontSize: 14 }}>{t.name} <span className="muted">· {t.nickname}</span></b><div className="muted">#{idx + 1} · {s.jobs} งาน · {t.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</div></div>
                </div>
                <div className="mcard-actions">
                  {idx === 0 && s.totalSales > 0 && <span className="badge info"><Crown size={11} /> Top</span>}
                  <button className="card-eye-inline" onClick={() => setHistoryFor(t)} title="ดูประวัติการนวด" aria-label="ดูประวัติการนวด"><Eye size={15} /></button>
                </div>
              </div>
              <div className="bar-track"><i className="bar-fill" style={{ width: `${pct}%` }} /></div>
              <div className="mini3" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="mini-box"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(s.totalSales).toLocaleString()}</div></div>
                <div className="mini-box hl"><div className="l">ค่าแรง</div><div className="v">฿ {s.total.toLocaleString()}</div></div>
              </div>

            </Card>
          );
        })}
      </div>
    </div>
  );
}
