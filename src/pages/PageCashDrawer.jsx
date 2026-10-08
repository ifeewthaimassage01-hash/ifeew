import { useState, useMemo } from 'react';
import { Wallet, Banknote, ArrowDownLeft, ArrowUpRight, Landmark, CheckCircle2, TriangleAlert } from 'lucide-react';
import { PageHeader, Card, CardHead, toast } from '../components/ui';

const DENOMS = [
  { v: 1000, label: 'แบงก์พัน' },
  { v: 500, label: 'แบงก์ห้าร้อย' },
  { v: 100, label: 'แบงก์ร้อย' },
  { v: 50, label: 'แบงก์ห้าสิบ' },
  { v: 20, label: 'แบงก์ยี่สิบ' },
  { v: 10, label: 'เหรียญสิบ' },
  { v: 5, label: 'เหรียญห้า' },
  { v: 1, label: 'เหรียญบาท' },
];

export default function PageCashDrawer({ data, saveData }) {
  const drawer = data.cashDrawer || { startCash: 3000, salesCash: 0, otherCashIn: 0, payoutCash: 0, depositCash: 0, lastCountDate: '', lastCountReal: 0, lastCountReason: '' };
  const [startCash, setStartCash] = useState(drawer.startCash);
  const [salesCash, setSalesCash] = useState(drawer.salesCash);
  const [otherCashIn, setOtherCashIn] = useState(drawer.otherCashIn);
  const [payoutCash, setPayoutCash] = useState(drawer.payoutCash);
  const [depositCash, setDepositCash] = useState(drawer.depositCash);
  const [countMode, setCountMode] = useState('denom');
  const [manualCount, setManualCount] = useState('');
  const [denoms, setDenoms] = useState({});
  const [differenceReason, setDifferenceReason] = useState('');
  const [err, setErr] = useState('');
  const [countDone, setCountDone] = useState(false);

  const denomTotal = useMemo(() => DENOMS.reduce((s, d) => s + (denoms[d.v] || 0) * d.v, 0), [denoms]);
  const denomCounted = Object.values(denoms).some((n) => n > 0);
  const realCount = countMode === 'denom' ? String(denomTotal) : manualCount;
  const hasCount = countMode === 'denom' ? denomCounted : realCount !== '';

  const expected = startCash + salesCash + otherCashIn - payoutCash - depositCash;
  const real = Number(realCount) || 0;
  const diff = !hasCount ? 0 : real - expected;

  const bumpDenom = (v, d) => setDenoms((prev) => ({ ...prev, [v]: Math.max(0, (prev[v] || 0) + d) }));

  const handleSave = () => {
    if (!hasCount) { setErr('กรุณานับเงินก่อน — กด + ตามฉบับธนบัตร หรือสลับไปกรอกยอดเอง'); return; }
    if (diff !== 0 && !differenceReason.trim()) { setErr('มีส่วนต่าง กรุณาระบุเหตุผลสั้น ๆ ก่อนบันทึก'); return; }
    setErr('');
    saveData({ ...data, cashDrawer: { ...drawer, startCash, salesCash, otherCashIn, payoutCash, depositCash, lastCountDate: new Date().toISOString().slice(0, 10), lastCountReal: real, lastCountReason: diff !== 0 ? differenceReason : '' } });
    setCountDone(true);
    toast('บันทึกการนับเงินสดแล้ว');
    setTimeout(() => setCountDone(false), 3000);
  };

  const fields = [
    { label: 'เงินสดต้นวัน', hint: 'Float เริ่มต้นกะ', value: startCash, set: setStartCash, icon: Banknote },
    { label: 'เงินสดจากการขาย', hint: 'รวมบิลเงินสดวันนี้', value: salesCash, set: setSalesCash, icon: ArrowDownLeft },
    { label: 'เงินสดรับอื่น ๆ', hint: 'รายรับนอกบิล', value: otherCashIn, set: setOtherCashIn, icon: ArrowDownLeft },
    { label: 'เงินสดจ่ายออก', hint: 'Petty cash / เงินทอน', value: payoutCash, set: setPayoutCash, icon: ArrowUpRight },
    { label: 'นำฝากธนาคาร', hint: 'Drop / ฝากเข้าบัญชี', value: depositCash, set: setDepositCash, icon: Landmark },
  ];

  return (
    <div>
      <PageHeader icon={Wallet} eyebrow="Cash Drawer" title="ลิ้นชักเงินสด" subtitle="นับตามฉบับธนบัตรได้เลย ไม่ต้องบวกเลขเอง" />

      <div className="kpi-grid">
        <div className="kpi dark"><div className="kpi-label">ควรมีในลิ้นชัก</div><div className="kpi-value">฿{expected.toLocaleString()}</div><div className="kpi-sub">คำนวณอัตโนมัติ</div></div>
        <div className="kpi"><div className="kpi-label">นับได้จริง</div><div className="kpi-value">{!hasCount ? '—' : `฿${real.toLocaleString()}`}</div><div className="kpi-sub">{countMode === 'denom' ? 'นับตามฉบับ' : 'กรอกยอดเอง'}</div></div>
        <div className={`kpi span2${diff !== 0 && hasCount ? ' brass' : ' sage'}`}>
          <div className="kpi-label">{!hasCount ? 'ส่วนต่าง' : diff === 0 ? '✓ ยอดตรงพอดี' : '⚠ มีส่วนต่าง'}</div>
          <div className="kpi-value" style={hasCount && diff !== 0 ? { color: diff < 0 ? 'var(--red)' : 'var(--amber)' } : undefined}>
            {!hasCount ? '—' : diff === 0 ? 'ตรงพอดี ✓' : `${diff > 0 ? '+' : '−'}฿${Math.abs(diff).toLocaleString()}`}
          </div>
          <div className="kpi-sub">{!hasCount ? 'นับเงินด้านล่างเพื่อดูส่วนต่าง' : diff === 0 ? 'ไม่ต้องระบุเหตุผล' : 'ต้องระบุเหตุผลก่อนบันทึก'}</div>
        </div>
      </div>

      {err && <div className="err-banner"><TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {err}</div>}

      <div className="cols-2">
        <Card>
          <CardHead title="การเคลื่อนไหว" hint="แตะตัวเลขเพื่อแก้ไข" />
          {fields.map(({ label, hint, value, set, icon: Icon }) => (
            <div key={label} className="cash-row">
              <span className="cash-ic"><Icon size={18} /></span>
              <span className="tt"><b>{label}</b><small>{hint}</small></span>
              <span className="cash-amt">฿<input type="number" value={value} onChange={(e) => set(Number(e.target.value))} /></span>
            </div>
          ))}
          <div className="formula">
            สูตร: <b>ควรมี = ต้นวัน + ขาย + รับอื่น − จ่ายออก − ฝาก</b><br />
            = {startCash.toLocaleString()} + {salesCash.toLocaleString()} + {otherCashIn.toLocaleString()} − {payoutCash.toLocaleString()} − {depositCash.toLocaleString()} = <b style={{ color: 'var(--pine-700)' }}>฿{expected.toLocaleString()}</b>
          </div>
        </Card>

        <div className="card">
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>นับเงินจริง & ปิดกะ</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>กด + ตามจำนวนฉบับที่หยิบได้นับ — ยอดรวมเอง</p>
          <div className="count-tabs">
            <button className={countMode === 'denom' ? 'on' : ''} onClick={() => setCountMode('denom')}>นับตามฉบับ</button>
            <button className={countMode === 'manual' ? 'on' : ''} onClick={() => setCountMode('manual')}>กรอกยอดเอง</button>
          </div>

          {countMode === 'denom' ? (
            <>
              {DENOMS.map((d) => (
                <div key={d.v} className="denom-row">
                  <span className="denom-lab">฿{d.v.toLocaleString()}<small>{d.label}</small></span>
                  <span className="denom-ctl">
                    <button onClick={() => bumpDenom(d.v, -1)} aria-label={`ลด ${d.label}`}>−</button>
                    <b>{denoms[d.v] || 0}</b>
                    <button onClick={() => bumpDenom(d.v, 1)} aria-label={`เพิ่ม ${d.label}`}>+</button>
                  </span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <span style={{ fontSize: 12, opacity: 0.7 }}>รวมที่นับได้</span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontVariantNumeric: 'tabular-nums' }}>฿{denomTotal.toLocaleString()}</b>
              </div>
              {denomCounted && (
                <div className="preset-row">
                  <button className="preset-btn" onClick={() => setDenoms({})}>ล้างการนับ</button>
                </div>
              )}
            </>
          ) : (
            <>
              <label className="label" style={{ marginTop: 4 }}>ยอดนับได้จริง (฿)</label>
              <input type="number" value={manualCount} onChange={(e) => setManualCount(e.target.value)} placeholder="0" className="big-input" style={{ marginTop: 6 }} />
              <div className="preset-row">
                {[1000, 500, 100, 50].map((v) => (
                  <button key={v} className="preset-btn" onClick={() => setManualCount(String((Number(manualCount) || 0) + v))}>+{v.toLocaleString()}</button>
                ))}
                {manualCount !== '' && <button className="preset-btn" onClick={() => setManualCount('')}>ล้าง</button>}
              </div>
            </>
          )}

          {hasCount && diff !== 0 && (
            <textarea value={differenceReason} onChange={(e) => { setDifferenceReason(e.target.value); setErr(''); }} placeholder="เหตุผลส่วนต่าง (บังคับ) เช่น เงินขาดจากทิปไม่ครบ…" className="input" style={{ marginTop: 10 }} />
          )}
          {hasCount && diff === 0 && <div className="alert ok">✓ ยอดตรงพอดี ไม่ต้องระบุเหตุผล</div>}
          <button onClick={handleSave} className="btn btn-primary btn-block" style={{ marginTop: 12 }}>บันทึกการนับเงินสด</button>
          {countDone && <p className="okmsg"><CheckCircle2 size={14} style={{ verticalAlign: -2 }} /> บันทึกสำเร็จ</p>}
          {drawer.lastCountDate && (
            <p style={{ fontSize: 11, opacity: 0.6, marginTop: 12, lineHeight: 1.6 }}>
              ครั้งล่าสุด: {drawer.lastCountDate} · นับจริง ฿{(drawer.lastCountReal || 0).toLocaleString()}<br />
              เหตุผล: {drawer.lastCountReason || '—'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
