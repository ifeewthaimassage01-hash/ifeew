import { useState, useMemo } from 'react';
import { ReceiptText, Plus, Minus, Trash2, ShieldAlert, Banknote, QrCode, CreditCard, Wallet, CheckCircle2, Search, TriangleAlert, User, ArrowRight, Clock } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, Modal, formatDuration } from '../components/ui';
import { generateBillId } from '../data/demoData';

const PAY_METHODS = [
  { label: 'เงินสด', icon: Banknote },
  { label: 'QR Code / โอนเงิน', icon: QrCode },
  { label: 'บัตรเครดิต', icon: CreditCard },
  { label: 'E-Wallet', icon: Wallet },
];

const MGR_KEY = 'ifeew_mgr_ok';

/* การ์ดบริการแบบรูปอ้างอิง: รูปสี่เหลี่ยมมน + ปุ่ม + เขียวมุมขวาบน, ราคา, ชื่อ, หน่วยเวลา */
function SvcTile({ svc, count, onAdd }) {
  const dur = svc.duration != null ? formatDuration(svc.duration) : '';
  const unit = svc.duration != null ? `${dur} · ${svc.duration} นาที` : (svc.category || '');
  return (
    <div className={`prod-card${count > 0 ? ' added' : ''}`}>
      <div className="prod-img" onClick={onAdd} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}>
        {svc.imageUrl ? (
          <img src={svc.imageUrl} alt={svc.name} loading="lazy" />
        ) : (
          <div className="prod-img-fallback">
            <Clock size={26} strokeWidth={1.6} />
            <b>{dur || 'บริการ'}</b>
            <small>{svc.category}</small>
          </div>
        )}
        <button className="prod-plus" onClick={(e) => { e.stopPropagation(); onAdd(); }} aria-label={`เพิ่ม ${svc.name}`}>
          {count > 0 ? <b style={{ fontSize: 15 }}>×{count}</b> : <Plus size={22} strokeWidth={2.4} />}
        </button>
      </div>
      <div className="prod-price">฿{svc.price.toLocaleString()}</div>
      <div className="prod-name">{svc.name}</div>
      <div className="prod-unit">{unit}</div>
    </div>
  );
}

export default function PagePOS({ data, saveData, onNavigate }) {
  const therapistsList = (data.therapists || []).filter((t) => t.active !== false);
  const services = data.services || [];
  const [categoryFilter, setCategoryFilter] = useState('ทั้งหมด');
  const [svcQuery, setSvcQuery] = useState('');
  const [items, setItems] = useState([]);
  const [customer, setCustomer] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('เงินสด');
  const [discount, setDiscount] = useState('');
  const [selectedTherapist, setSelectedTherapist] = useState('');
  const [therapistType, setTherapistType] = useState('resident');
  const [visitingName, setVisitingName] = useState('');
  const [visitingId, setVisitingId] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [authPass, setAuthPass] = useState('');
  const [authReason, setAuthReason] = useState('');
  const [rememberMgr, setRememberMgr] = useState(false);
  const [authErr, setAuthErr] = useState('');
  const [err, setErr] = useState('');
  const [successBill, setSuccessBill] = useState(null);

  const categories = useMemo(() => ['ทั้งหมด', ...((data.serviceCategories && data.serviceCategories.length ? data.serviceCategories : [...new Set(services.map((s) => s.category))]))], [services, data.serviceCategories]);
  // แยกให้ชัดเจน: ในแต่ละหมวดเรียงตามเวลา 45 → 60 → 90 → 120 นาที
  const visibleServices = services.filter((s) => {
    const matchCat = categoryFilter === 'ทั้งหมด' || s.category === categoryFilter;
    const q = svcQuery.trim().toLowerCase();
    return matchCat && (!q || s.name.toLowerCase().includes(q));
  }).sort((a, b) => {
    if (a.category !== b.category) return String(a.category).localeCompare(String(b.category), 'th');
    const da = a.duration == null ? 9999 : a.duration;
    const db = b.duration == null ? 9999 : b.duration;
    if (da !== db) return da - db;
    return (a.price || 0) - (b.price || 0);
  });
  const subtotal = items.reduce((s, i) => s + (i.net || 0), 0);
  const discVal = Math.max(0, Math.min(subtotal, Number(discount) || 0));
  const total = subtotal - discVal;
  const getActiveTherapist = () => {
    if (therapistType === 'resident') return therapistsList.find((t) => t.id === selectedTherapist) || null;
    const name = visitingName.trim();
    return name ? { id: visitingId, name, nickname: name, role: 'visiting' } : null;
  };
  const therapist = getActiveTherapist();

  const scrollToTicket = () => {
    document.getElementById('bill-ticket')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const quickAdd = (svc) => {
    const th = getActiveTherapist();
    if (!th) { setErr(therapistType === 'resident' ? 'แตะเลือกพนักงานด้านบนก่อนเพิ่มบริการ — ระบบผูกค่าคอมให้อัตโนมัติ' : 'กรอกชื่อหมอวิ่งก่อนเพิ่มบริการ'); return; }
    setErr('');
    let tid = th.id;
    if (therapistType === 'visiting' && !tid) {
      tid = `EXT-${Date.now().toString(36).toUpperCase()}`;
      setVisitingId(tid);
    }
    const found = items.findIndex((i) => i.serviceId === svc.id && i.therapistId === tid);
    if (found >= 0) {
      const next = [...items];
      next[found] = { ...next[found], qty: next[found].qty + 1, net: (next[found].qty + 1) * next[found].price };
      setItems(next);
    } else {
      setItems([...items, {
        serviceId: svc.id, serviceName: svc.name, category: svc.category,
        therapistId: tid, therapistName: th.name, qty: 1, price: svc.price, discount: 0, net: svc.price,
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
    if (!getActiveTherapist()) { setErr(therapistType === 'resident' ? 'กรุณาเลือกพนักงานก่อนเปิดบิล' : 'กรุณากรอกชื่อหมอวิ่งก่อนเปิดบิล'); return; }
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
    setItems([]); setCustomer(''); setMemberNo(''); setDiscount(''); setSelectedTherapist('');
    setVisitingName(''); setVisitingId('');
    setShowAuth(false); setAuthPass(''); setAuthReason(''); setAuthErr(''); setRememberMgr(false);
  };

  const confirmAuth = () => {
    if (authPass !== '123123') { setAuthErr('รหัสไม่ถูกต้อง (ตัวอย่าง: 123123)'); return; }
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
            <CardHead title="พนักงานผู้ให้บริการ" hint={therapist ? `✓ ${therapist.name}${therapistType === 'visiting' ? ' (หมอวิ่ง)' : ''}` : 'เลือกประเภทก่อน'} right={<User size={18} color="var(--faint)" />} />
            <div className="seg">
              <button onClick={() => { setTherapistType('resident'); setErr(''); }} className={therapistType === 'resident' ? 'on' : ''}>หมอประจำ</button>
              <button onClick={() => { setTherapistType('visiting'); setErr(''); }} className={therapistType === 'visiting' ? 'on' : ''}>หมอวิ่ง</button>
            </div>
            {therapistType === 'resident' ? (
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
            ) : (
              <div>
                <div className="field" style={{ marginBottom: 8 }}>
                  <label>ชื่อหมอวิ่ง</label>
                  <input value={visitingName} onChange={(e) => { setVisitingName(e.target.value); setErr(''); }} placeholder="เช่น หมอนิด (รับจ้าง)" className="input" />
                </div>
                <p className="muted">บิลจะบันทึกชื่อนี้ · ไม่คิดคอมมิชชันในระบบพนักงานประจำ</p>
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="บริการ" hint={items.length > 0 ? `ในบิล ×${items.reduce((s, i) => s + i.qty, 0)}` : 'แตะ + เพื่อเพิ่ม'} />
            <div className="svc-toolbar" style={{ position: 'static' }}>
              <div className="search-wrap">
                <Search size={16} />
                <input value={svcQuery} onChange={(e) => setSvcQuery(e.target.value)} placeholder="ค้นหาบริการ… เช่น นวดไทย 1.5 ชม" className="input" />
              </div>
              <div className="chip-row">
                {categories.map((c) => (
                  <button key={c} onClick={() => setCategoryFilter(c)} className={`chip sage${categoryFilter === c ? ' on' : ''}`}>{c}</button>
                ))}
              </div>
            </div>

            {/* โหมดทั้งหมด + ไม่ได้ค้นหา: แสดงเป็น section ต่อหมวดแบบรูปอ้างอิง */}
            {categoryFilter === 'ทั้งหมด' && !svcQuery.trim() ? (
              <div className="cat-list">
                {categories.filter((c) => c !== 'ทั้งหมด').map((c) => {
                  const list = visibleServices.filter((s) => s.category === c);
                  if (list.length === 0) return null;
                  return (
                    <section key={c} className="cat-sec">
                      <div className="cat-sec-head">
                        <h3>{c} <span className="muted">· {list.length}</span></h3>
                        <button className="cat-arrow" onClick={() => setCategoryFilter(c)} aria-label={`ดูทั้งหมด ${c}`}>
                          <ArrowRight size={22} />
                        </button>
                      </div>
                      <div className="hscroll">
                        {list.map((svc) => {
                          const count = items.filter((i) => i.serviceId === svc.id).reduce((s, i) => s + i.qty, 0);
                          return <SvcTile key={svc.id} svc={svc} count={count} onAdd={() => quickAdd(svc)} />;
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="prod-grid">
                {visibleServices.map((svc) => {
                  const count = items.filter((i) => i.serviceId === svc.id).reduce((s, i) => s + i.qty, 0);
                  return <SvcTile key={svc.id} svc={svc} count={count} onAdd={() => quickAdd(svc)} />;
                })}
              </div>
            )}
            {visibleServices.length === 0 && <EmptyState title="ไม่พบบริการ" subtitle="ลองเปลี่ยนคำค้นหรือหมวดหมู่" />}
          </Card>
        </div>

        {/* ---- right: live ticket ---- */}
        <div className="pos-side" id="bill-ticket">
          <div className="ticket">
            <div className="ticket-head">
              <div className="t-no">Live Bill · {therapist ? (therapistType === 'visiting' ? `${therapist.name} · หมอวิ่ง` : `${therapist.name} (${therapist.nickname})`) : 'ยังไม่เลือกพนักงาน'}</div>
              <div className="t-total">฿{total.toLocaleString()}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{items.reduce((s, i) => s + i.qty, 0)} รายการ · {paymentMethod}</div>
            </div>
            <div className="ticket-body">
              {items.length === 0 && <EmptyState title="บิลยังว่าง" subtitle="แตะการ์ดบริการเพื่อเพิ่มลงบิล" />}
              {items.map((it, idx) => (
                <div key={idx} className="tline">
                  <span className="q">{idx + 1}</span>
                  <span className="tt"><b>{it.serviceName}</b><small>{it.therapistName}{String(it.therapistId || '').startsWith('EXT-') ? ' (หมอวิ่ง)' : ''} · ฿{it.price.toLocaleString()}</small></span>
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
          <div className="field"><label>รหัสผ่านผู้จัดการ</label><input type="password" value={authPass} onChange={(e) => { setAuthPass(e.target.value); setAuthErr(''); }} placeholder="123123" className="input" /></div>
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
