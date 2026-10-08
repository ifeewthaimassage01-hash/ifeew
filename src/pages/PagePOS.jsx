import { useState, useMemo } from 'react';
import { ReceiptText, Plus, Minus, Trash2, ShieldAlert, Banknote, QrCode, CreditCard, Wallet, CheckCircle2, Search, TriangleAlert, User } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, Modal, toast } from '../components/ui';
import { generateBillId } from '../data/demoData';

const PAY_METHODS = [
  { label: 'เงินสด', icon: Banknote },
  { label: 'QR Code / โอนเงิน', icon: QrCode },
  { label: 'บัตรเครดิต', icon: CreditCard },
  { label: 'E-Wallet', icon: Wallet },
];

const MGR_KEY = 'ifeew_mgr_ok';

export default function PagePOS({ data, saveData, onNavigate }) {
  const therapistsList = data.therapists || [];
  const services = data.services || [];
  const [categoryFilter, setCategoryFilter] = useState('ทั้งหมด');
  const [svcQuery, setSvcQuery] = useState('');
  const [items, setItems] = useState([]);
  const [customer, setCustomer] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('เงินสด');
  const [discount, setDiscount] = useState('');
  const [selectedTherapist, setSelectedTherapist] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [rememberMgr, setRememberMgr] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [err, setErr] = useState('');
  const [successBill, setSuccessBill] = useState(null);

  const categories = useMemo(() => ['ทั้งหมด', ...new Set(services.map((s) => s.category))], [services]);
  const visibleServices = services.filter((s) => {
    const matchCat = categoryFilter === 'ทั้งหมด' || s.category === categoryFilter;
    const q = svcQuery.trim().toLowerCase();
    return matchCat && (!q || s.name.toLowerCase().includes(q));
  });
  const subtotal = items.reduce((s, i) => s + (i.net || 0), 0);
  const discVal = Math.max(0, Math.min(subtotal, Number(discount) || 0));
  const total = subtotal - discVal;
  const therapist = therapistsList.find((t) => t.id === selectedTherapist);

  const scrollToTicket = () => {
    document.getElementById('bill-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const quickAdd = (svc) => {
    if (!therapist) { setErr('แตะเลือกพนักงานด้านบนก่อนเพิ่มบริการ — ระบบผูกค่าคอมให้อัตโนมัติ'); return; }
    setErr('');
    const found = items.findIndex((i) => i.serviceId === svc.id && i.therapistId === therapist.id);
    if (found >= 0) {
      const next = [...items];
      next[found] = { ...next[found], qty: next[found].qty + 1, net: (next[found].qty + 1) * next[found].price };
      setItems(next);
    } else {
      setItems([...items, {
        serviceId: svc.id, serviceName: svc.name, category: svc.category,
        therapistId: therapist.id, therapistName: therapist.name, qty: 1, price: svc.price, discount: 0, net: svc.price,
      }]);
    }
  };

  const changeQty = (idx, d) => {
    const next = [...items];
    const q = next[idx].qty + d;
    if (q <= 0) { next.splice(idx, 1); } else { next[idx] = { ...next[idx], qty: q, net: q * next[idx].price }; }
    setItems(next);
  };

  const startCheckout = () => {
    if (!selectedTherapist) { setErr('กรุณาเลือกพนักงานก่อนเปิดบิล'); return; }
    if (items.length === 0) { setErr('แตะเพิ่มบริการอย่างน้อย 1 รายการก่อนเปิดบิล'); return; }
    setErr('');
    try {
      if (sessionStorage.getItem(MGR_KEY) === '1') { openBill('จำรหัสในกะนี้'); return; }
    } catch { /* ignore */ }
    setAuthErr('');
    setShowAuth(true);
  };

  const openBill = (reason) => {
    const id = generateBillId();
    const now = new Date();
    const newBill = {
      id, date: now.toISOString(), customer, memberNo, items,
      subtotal, discount: discVal, total, paymentMethod, status: 'paid', createdAt: now.toISOString(),
    };
    saveData({
      ...data,
      bills: [...(data.bills || []), newBill],
      auditLog: [...(data.auditLog || []), {
        id: `A-${Date.now()}`, timestamp: now.toISOString(), user: 'ระบบ POS',
        action: 'สร้างบิล', detail: `${id} · ฿${total.toLocaleString()} · ${paymentMethod}`,
        oldValue: '-', newValue: 'paid', approvedBy: '-',
      }],
    });
    setSuccessBill({ id, total });
    toast(`เปิดบิล ${id} สำเร็จ`);
    setItems([]); setCustomer(''); setMemberNo(''); setDiscount(''); setSelectedTherapist('');
    setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); setRememberMgr(false);
  };

  const confirmAuth = () => {
    if (authPass !== 'manager123') { setAuthErr('รหัสไม่ถูกต้อง (ตัวอย่าง: manager123)'); return; }
    if (!authReason.trim()) { setAuthErr('กรุณาระบุเหตุผลสั้น ๆ เช่น รับเงินครบถ้วน'); return; }
    if (rememberMgr) { try { sessionStorage.setItem(MGR_KEY, '1'); } catch { /* ignore */ } }
    openBill(authReason);
  };

  return (
    <div>
      <PageHeader
        icon={ReceiptText}
        eyebrow="Point of Sale"
        title="เปิดบิลใหม่"
        subtitle="เลือกพนักงาน → แตะบริการ → กดเปิดบิล จบในจอเดียว"
      />

      {err && <div className="err-banner"><TriangleAlert size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {err}</div>}

      <div className="pos-grid">
        {/* ---- left: pick staff + services ---- */}
        <div className="pos-main">
          <Card>
            <CardHead title="พนักงานผู้ให้บริการ" hint={therapist ? `✓ ${therapist.name}` : 'แตะเลือก 1 คน'} right={<User size={18} color="var(--faint)" />} />
            <div className="thera-scroll">
              {therapistsList.map((th) => {
                const active = selectedTherapist === th.id;
                return (
                  <button key={th.id} onClick={() => { setSelectedTherapist(active ? '' : th.id); setErr(''); }} className={`thera${active ? ' on' : ''}`}>
                    <span className="thera-ava">{th.nickname.charAt(0)}</span>
                    <span><b>{th.name}</b><small>{th.nickname} · {th.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</small></span>
                    <span className="pick">{active ? '✓ เลือกแล้ว' : 'แตะเพื่อเลือก'}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHead title="บริการ" hint={items.length > 0 ? `ในบิล ×${items.reduce((s, i) => s + i.qty, 0)}` : 'แตะการ์ดเพื่อเพิ่ม'} />
            <div className="svc-toolbar" style={{ position: 'static' }}>
              <div className="search-wrap">
                <Search size={16} />
                <input value={svcQuery} onChange={(e) => setSvcQuery(e.target.value)} placeholder="ค้นหาบริการ… เช่น นวดเท้า" className="input" />
              </div>
              <div className="chip-row">
                {categories.map((c) => (
                  <button key={c} onClick={() => setCategoryFilter(c)} className={`chip sage${categoryFilter === c ? ' on' : ''}`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="svc-grid">
              {visibleServices.map((svc) => {
                const count = items.filter((i) => i.serviceId === svc.id).reduce((s, i) => s + i.qty, 0);
                return (
                  <button key={svc.id} onClick={() => quickAdd(svc)} className={`svc-card${count > 0 ? ' added' : ''}`}>
                    <span className="svc-top">
                      <span><b>{svc.name}</b><small>{svc.category} · คอม {(svc.flatRate * 100).toFixed(0)}%</small></span>
                      <span className="svc-price">฿{svc.price.toLocaleString()}</span>
                    </span>
                    <span className="svc-add">
                      {count > 0 ? <><span className="count-badge">×{count}</span> แตะเพื่อเพิ่มอีก</> : <><Plus size={13} /> แตะเพิ่มลงบิล</>}
                    </span>
                  </button>
                );
              })}
            </div>
            {visibleServices.length === 0 && <EmptyState title="ไม่พบบริการ" subtitle="ลองเปลี่ยนคำค้นหรือหมวดหมู่" />}
          </Card>
        </div>

        {/* ---- right: live ticket ---- */}
        <div className="pos-side" id="bill-ticket">
          <div className="ticket">
            <div className="ticket-head">
              <div className="t-no">Live Bill · {therapist ? `${therapist.name} (${therapist.nickname})` : 'ยังไม่เลือกพนักงาน'}</div>
              <div className="t-total">฿{total.toLocaleString()}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{items.reduce((s, i) => s + i.qty, 0)} รายการ · {paymentMethod}</div>
            </div>
            <div className="ticket-body">
              {items.length === 0 && <EmptyState title="บิลยังว่าง" subtitle="แตะการ์ดบริการเพื่อเพิ่มลงบิล" />}
              {items.map((it, idx) => (
                <div key={idx} className="tline">
                  <span className="q">{idx + 1}</span>
                  <span className="tt"><b>{it.serviceName}</b><small>{it.therapistName} · ฿{it.price.toLocaleString()}</small></span>
                  <span className="qty">
                    <button onClick={() => changeQty(idx, -1)} aria-label="ลด">{it.qty === 1 ? <Trash2 size={13} /> : <Minus size={13} />}</button>
                    <b>{it.qty}</b>
                    <button onClick={() => changeQty(idx, 1)} aria-label="เพิ่ม"><Plus size={13} /></button>
                  </span>
                  <b style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>฿{it.net.toLocaleString()}</b>
                </div>
              ))}

              {items.length > 0 && (
                <>
                  <div className="perf" />
                  <div className="f2">
                    <div className="field" style={{ marginBottom: 8 }}><label>ชื่อลูกค้า</label><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="ไม่บังคับ" className="input" /></div>
                    <div className="field" style={{ marginBottom: 8 }}><label>สมาชิก</label><input value={memberNo} onChange={(e) => setMemberNo(e.target.value)} placeholder="M-xxxx" className="input" /></div>
                  </div>
                  <div className="field" style={{ marginBottom: 8 }}>
                    <label>ส่วนลดท้ายบิล (฿)</label>
                    <div className="disc-row">
                      <input type="number" min="0" max={subtotal} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                      <div className="preset-row" style={{ marginTop: 0 }}>
                        {[50, 100, 200].map((v) => (
                          <button key={v} type="button" className="preset-btn light" onClick={() => setDiscount(String((Number(discount) || 0) + v))}>+{v}</button>
                        ))}
                        {discount !== '' && <button type="button" className="preset-btn light" onClick={() => setDiscount('')}>ล้าง</button>}
                      </div>
                    </div>
                  </div>
                  <div className="field"><label>ชำระโดย</label>
                    <div className="pay-grid">
                      {PAY_METHODS.map((m) => {
                        const Icon = m.icon;
                        return (
                          <button key={m.label} onClick={() => setPaymentMethod(m.label)} className={`pay-card${paymentMethod === m.label ? ' on' : ''}`}>
                            <Icon size={17} /><span>{m.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="summary-box">
                    <div className="r"><span>รวมย่อย</span><b>฿{subtotal.toLocaleString()}</b></div>
                    <div className="r"><span>ส่วนลด</span><b>−฿{discVal.toLocaleString()}</b></div>
                    <div className="r" style={{ fontSize: 15 }}><span><b style={{ color: 'var(--ink)' }}>สุทธิ</b></span><b style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>฿{total.toLocaleString()}</b></div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setItems([]); setDiscount(''); }}>ล้าง</button>
                    <button className="btn btn-primary" style={{ flex: 1.6 }} onClick={startCheckout}>
                      <ReceiptText size={18} /> เปิดบิล · ฿{total.toLocaleString()}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* mobile floating checkout */}
      {items.length > 0 && !showAuth && !successBill && (
        <div className="cta-float" onClick={scrollToTicket}>
          <span className="t"><b>฿{total.toLocaleString()} · {items.reduce((s, i) => s + i.qty, 0)} รายการ</b><small>{therapist ? therapist.name : 'แตะเพื่อตรวจบิล'}</small></span>
          <button onClick={(e) => { e.stopPropagation(); startCheckout(); }}>เปิดบิล</button>
        </div>
      )}

      {showAuth && (
        <Modal onClose={() => { setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); }}>
          <div className="pagehead-main" style={{ marginBottom: 8 }}>
            <div className="pagehead-icon"><ShieldAlert size={22} /></div>
            <div><h3>ยืนยันเปิดบิล</h3><p className="muted">ยอด ฿{total.toLocaleString()} · {paymentMethod} · {items.reduce((s, i) => s + i.qty, 0)} รายการ</p></div>
          </div>
          {authErr && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {authErr}</div>}
          <div className="field"><label>รหัสผ่านผู้จัดการ</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setAuthErr(''); }} placeholder="manager123" className="input" /></div>
          <div className="field"><label>หมายเหตุ (บังคับ)</label><textarea value={authReason} onChange={(e) => { setAuthReason(e.target.value); setAuthErr(''); }} placeholder="เช่น รับเงินสดครบถ้วน" className="input" rows={2} /></div>
          <label className="mgr-remember"><input type="checkbox" checked={rememberMgr} onChange={(e) => setRememberMgr(e.target.checked)} /> จำรหัสในกะนี้ (ไม่ต้องกรอกอีก)</label>
          <div className="modal-row">
            <button onClick={() => { setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); }} className="btn btn-ghost" style={{ width: '100%' }}>ยกเลิก</button>
            <button onClick={confirmAuth} disabled={!authReason.trim() || !authPass} className="btn btn-primary" style={{ width: '100%' }}>ยืนยันเปิดบิล</button>
          </div>
        </Modal>
      )}

      {successBill && (
        <Modal onClose={() => setSuccessBill(null)}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div className="empty-ic" style={{ background: '#ddf2e4', color: '#0c6b3f', width: 66, height: 66 }}><CheckCircle2 size={32} /></div>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: 27 }}>เปิดบิลสำเร็จ</h3>
            <div className="mono" style={{ marginTop: 4 }}>{successBill.id}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, color: 'var(--pine-700)', fontVariantNumeric: 'tabular-nums' }}>฿{successBill.total.toLocaleString()}</div>
            <div className="modal-row">
              <button onClick={() => setSuccessBill(null)} className="btn btn-ghost" style={{ width: '100%' }}>เปิดบิลต่อ</button>
              <button onClick={() => { setSuccessBill(null); onNavigate && onNavigate('bills'); }} className="btn btn-primary" style={{ width: '100%' }}>ดูประวัติบิล</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
