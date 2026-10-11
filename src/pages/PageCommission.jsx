import { Crown, TrendingUp } from 'lucide-react';
import { Card, CardHead, Kpi } from '../components/ui';
import { svcLabel, commBaht } from '../data/demoData';

const TIERS = [
  { max: 30000, rate: 0.30, label: '≤ 30k → 30%' },
  { max: 50000, rate: 0.35, label: '30–50k → 35%' },
  { max: 80000, rate: 0.40, label: '50–80k → 40%' },
  { max: Infinity, rate: 0.45, label: '> 80k → 45%' },
];

export default function PageCommission({ data, saveData }) {
  const therapists = data.therapists || [];
  const bills = (data.bills || []).filter((b) => b.status === 'paid');
  const settings = data.commissionSettings || { mode: 'flat' };

  const stats = {};
  therapists.forEach((t) => { stats[t.id] = { totalSales: 0, flatCommission: 0, jobs: 0, tieredCommission: 0, rate: 0.30, total: 0 }; });
  let freelanceTotal = 0;
  let freelanceJobs = 0;
  bills.forEach((bill) => {
    (bill.items || bill.customers || []).forEach((itm) => {
      const tid = itm.therapistId || bill.therapistId;
      const s = stats[tid];
      if (!s) { freelanceTotal += itm.net ?? itm.price ?? 0; freelanceJobs += itm.qty || 1; return; }
      const svc = (data.services || []).find((x) => x.id === itm.serviceId);
      if (!svc) return;
      const net = itm.net ?? itm.price ?? 0;
      s.totalSales += net;
      s.jobs += itm.qty || 1;
      // โหมด Flat: ค่าแรงคงที่ (บาท) ต่อครั้งที่นวด
      s.flatCommission += commBaht(svc) * (itm.qty || 1);
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

  return (
    <div>
      <div className="seg">
        <button onClick={() => changeMode('flat')} className={settings.mode === 'flat' ? 'on' : ''}>คงที่ (บาท) ตามบริการ</button>
        <button onClick={() => changeMode('tier')} className={settings.mode === 'tier' ? 'on' : ''}>Tier ยอดสะสม</button>
      </div>

      {settings.mode === 'tier' && (
        <Card>
          <div className="chip-row">
            <span className="muted" style={{ alignSelf: 'center' }}>ขั้นบันได:</span>
            {TIERS.map((t, i) => <span key={i} className="badge info">{t.label}</span>)}
          </div>
        </Card>
      )}

      {freelanceTotal > 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}>ยอดหมอวิ่ง (นอกระบบ) ฿ {Math.round(freelanceTotal).toLocaleString()} · {freelanceJobs} งาน — ไม่รวมในค่าแรงพนักงานประจำ</div>
      )}

      <div className="kpi-grid">
        <div className="kpi dark"><div className="kpi-label">ยอดขายรวม (รวมหมอวิ่ง)</div><div className="kpi-value">฿ {Math.round(sumSales).toLocaleString()}</div><div className="kpi-sub">{bills.length} บิลชำระแล้ว</div></div>
        <div className="kpi brass"><div className="kpi-label">ค่าแรงรวม ({settings.mode === 'flat' ? 'คงที่' : 'Tier'})</div><div className="kpi-value">฿ {Math.round(sumComm).toLocaleString()}</div><div className="kpi-sub">{((sumComm / (sumSales || 1)) * 100).toFixed(1)}% ของยอดขาย</div></div>
        <Kpi label="พนักงาน" value={therapists.length} sub="คน" />
        <Kpi label="เฉลี่ยต่อคน" value={`฿ ${Math.round(sumSales / (therapists.length || 1)).toLocaleString()}`} small sub="ยอดขาย" />
      </div>

      {pending.count > 0 && (
        <div className="alert warn" style={{ marginBottom: 12 }}>
          รอเช็คบิล {pending.count} บิล · ยอดค้าง ฿ {Math.round(pending.sales).toLocaleString()} · ค่าแรงโดยประมาณ ฿ {Math.round(pending.comm).toLocaleString()} — ยังไม่รวมในยอดข้างบน จ่ายจริงตอนเช็คบิล
        </div>
      )}

      <Card className="table-card show-desktop">
        <div className="table-scroll">
          <table className="tbl">
            <thead><tr><th>พนักงาน</th><th className="r">งาน (ครั้ง)</th><th className="r">ยอดขาย</th><th className="r">เรทที่ใช้</th><th className="r">ค่าแรง</th></tr></thead>
            <tbody>
              {ranked.map((t, idx) => {
                const s = stats[t.id];
                return (
                  <tr key={t.id}>
                    <td><span className="muted">#{idx + 1}</span> <b style={{ fontWeight: 600 }}>{t.name} <span className="muted">({t.nickname})</span></b> <span className={`badge ${t.role === 'senior' ? 'paid' : 'info'}`}>{t.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</span></td>
                    <td className="r">{s.jobs}</td>
                    <td className="r mono">฿ {Math.round(s.totalSales).toLocaleString()}</td>
                    <td className="r"><span className="badge dark">{settings.mode === 'tier' ? `${(s.rate * 100).toFixed(0)}%` : 'คงที่ ฿'}</span></td>
                    <td className="r"><b style={{ color: 'var(--brown)' }}>฿ {s.total.toLocaleString()}</b></td>
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
                {idx === 0 && s.totalSales > 0 && <span className="badge info"><Crown size={11} /> Top</span>}
              </div>
              <div className="bar-track"><i className="bar-fill" style={{ width: `${pct}%` }} /></div>
              <div className="mini3">
                <div className="mini-box"><div className="l">ยอดขาย</div><div className="v">฿ {Math.round(s.totalSales).toLocaleString()}</div></div>
                <div className="mini-box"><div className="l">เรท</div><div className="v">{settings.mode === 'tier' ? `${(s.rate * 100).toFixed(0)}%` : 'คงที่'}</div></div>
                <div className="mini-box hl"><div className="l">ค่าแรง</div><div className="v">฿ {s.total.toLocaleString()}</div></div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHead title="ค่าแรงคงที่ (บาท) ตามบริการ" hint="อ้างอิง" />
        <div className="refgrid">
          {(data.services || []).filter((s) => s.price > 0).map((s) => (
            <div key={s.id} className="refbox"><b>{svcLabel(s)}</b><small className="muted">฿ {s.price.toLocaleString()} · <b style={{ color: 'var(--brown)' }}>ค่าแรง ฿ {commBaht(s).toLocaleString()}</b></small></div>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 10 }}><TrendingUp size={12} style={{ verticalAlign: -1 }} /> ยอดขายรวมทั้งหมดใช้คำนวณ Tier แบบขั้นบันได</p>
      </Card>
    </div>
  );
}
