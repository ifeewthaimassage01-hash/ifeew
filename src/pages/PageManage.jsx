import { useState } from 'react';
import { Store, Plus, Pencil, Trash2, TriangleAlert, CheckCircle2, RotateCcw } from 'lucide-react';
import { PageHeader, Card, CardHead, EmptyState, Modal, alertDialog, confirmDialog, formatDuration } from '../components/ui';
import { DEFAULT_SERVICES, DEFAULT_CATEGORIES } from '../data/demoData';

function nextId(prefix, list) {
  let max = 0;
  (list || []).forEach((x) => {
    const m = String(x.id || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  });
  return `${prefix}${String(max + 1).padStart(2, '0')}`;
}

function pushAudit(data, action, detail, newValue) {
  return [...(data.auditLog || []), {
    id: `A-${Date.now()}`, timestamp: new Date().toISOString(), user: 'เจ้าของร้าน',
    action, detail, oldValue: '-', newValue, approvedBy: 'เจ้าของร้าน',
  }];
}

const EMPTY_THERAPIST = { name: '', nickname: '', role: 'junior', active: true };
const EMPTY_SERVICE = { name: '', category: '', price: '', duration: '', flatRatePct: '35' };

export default function PageManage({ data, saveData }) {
  const [tab, setTab] = useState('staff');
  const [err, setErr] = useState('');

  // therapist form
  const [showT, setShowT] = useState(false);
  const [editingT, setEditingT] = useState(null);
  const [tForm, setTForm] = useState(EMPTY_THERAPIST);

  // service form
  const [showS, setShowS] = useState(false);
  const [editingS, setEditingS] = useState(null);
  const [sForm, setSForm] = useState(EMPTY_SERVICE);

  // category add/rename
  const [newCat, setNewCat] = useState('');
  const [renameCat, setRenameCat] = useState(null);
  const [renameName, setRenameName] = useState('');

  const therapists = data.therapists || [];
  const services = data.services || [];
  const cats = data.serviceCategories || [];

  /* ---------- therapists ---------- */
  const openAddT = () => { setEditingT(null); setTForm(EMPTY_THERAPIST); setErr(''); setShowT(true); };
  const openEditT = (t) => { setEditingT(t); setTForm({ name: t.name, nickname: t.nickname, role: t.role, active: t.active !== false }); setErr(''); setShowT(true); };

  const saveT = () => {
    if (!tForm.name.trim() || !tForm.nickname.trim()) { setErr('กรอกชื่อและชื่อเล่นพนักงาน'); return; }
    setErr('');
    if (editingT) {
      saveData({
        ...data,
        therapists: therapists.map((t) => (t.id === editingT.id ? { ...t, name: tForm.name.trim(), nickname: tForm.nickname.trim(), role: tForm.role, active: tForm.active } : t)),
        auditLog: pushAudit(data, 'แก้ไขพนักงาน', `${editingT.id} · ${tForm.name.trim()}`, tForm.active ? 'ใช้งาน' : 'พักงาน'),
      });
      alertDialog({ title: `แก้ไข ${tForm.name.trim()} แล้ว` });
    } else {
      const id = nextId('T', therapists);
      saveData({
        ...data,
        therapists: [...therapists, { id, name: tForm.name.trim(), nickname: tForm.nickname.trim(), role: tForm.role, active: true }],
        auditLog: pushAudit(data, 'เพิ่มพนักงาน', `${id} · ${tForm.name.trim()}`, 'ใช้งาน'),
      });
      alertDialog({ title: `เพิ่ม ${tForm.name.trim()} แล้ว`, message: `รหัสพนักงาน ${id}` });
    }
    setShowT(false);
  };

  const toggleT = (t) => {
    saveData({
      ...data,
      therapists: therapists.map((x) => (x.id === t.id ? { ...x, active: x.active === false } : x)),
      auditLog: pushAudit(data, t.active === false ? 'เปิดใช้งานพนักงาน' : 'พักงานพนักงาน', `${t.id} · ${t.name}`, t.active === false ? 'ใช้งาน' : 'พักงาน'),
    });
  };

  const deleteT = async (t) => {
    const ok = await confirmDialog({ title: `ลบ ${t.name}?`, message: 'ประวัติบิลเดิมยังเก็บชื่อไว้', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    saveData({
      ...data,
      therapists: therapists.filter((x) => x.id !== t.id),
      auditLog: pushAudit(data, 'ลบพนักงาน', `${t.id} · ${t.name}`, 'ลบออก'),
    });
    alertDialog({ title: `ลบ ${t.name} แล้ว` });
  };

  /* ---------- categories ---------- */
  const addCat = () => {
    const name = newCat.trim();
    if (!name) { setErr('กรอกชื่อหมวดหมู่ก่อนเพิ่ม'); return; }
    if (cats.includes(name)) { setErr('มีหมวดหมู่นี้แล้ว'); return; }
    setErr('');
    saveData({ ...data, serviceCategories: [...cats, name], auditLog: pushAudit(data, 'เพิ่มหมวดหมู่', name, `${cats.length + 1} หมวด`) });
    setNewCat('');
    alertDialog({ title: `เพิ่มหมวด ${name} แล้ว` });
  };

  const saveRenameCat = () => {
    const name = renameName.trim();
    if (!name) { setErr('กรอกชื่อใหม่'); return; }
    if (name !== renameCat && cats.includes(name)) { setErr('มีหมวดหมู่นี้แล้ว'); return; }
    setErr('');
    saveData({
      ...data,
      serviceCategories: cats.map((c) => (c === renameCat ? name : c)),
      services: services.map((s) => (s.category === renameCat ? { ...s, category: name } : s)),
      auditLog: pushAudit(data, 'แก้ไขหมวดหมู่', `${renameCat} → ${name}`, 'ย้ายบริการตาม'),
    });
    setRenameCat(null);
    alertDialog({ title: 'แก้ไขหมวดหมู่แล้ว', message: `${renameCat} → ${name}` });
  };

  const deleteCat = async (cat) => {
    const used = services.filter((s) => s.category === cat).length;
    if (used > 0) { setErr(`ลบไม่ได้ — ยังมี ${used} บริการในหมวดนี้ ย้ายหรือลบออกก่อน`); return; }
    const ok = await confirmDialog({ title: `ลบหมวด ${cat}?`, confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    setErr('');
    saveData({
      ...data,
      serviceCategories: cats.filter((c) => c !== cat),
      auditLog: pushAudit(data, 'ลบหมวดหมู่', cat, 'ลบออก'),
    });
    alertDialog({ title: `ลบหมวด ${cat} แล้ว` });
  };

  /* ---------- services ---------- */
  const openAddS = () => { setEditingS(null); setSForm({ ...EMPTY_SERVICE, category: cats[0] || '' }); setErr(''); setShowS(true); };
  const openEditS = (s) => {
    setEditingS(s);
    setSForm({ name: s.name, category: s.category, price: String(s.price ?? ''), duration: s.duration == null ? '' : String(s.duration), flatRatePct: String(Math.round((s.flatRate || 0) * 100)) });
    setErr(''); setShowS(true);
  };

  const saveS = () => {
    if (!sForm.name.trim()) { setErr('กรอกชื่อบริการ'); return; }
    if (sForm.price === '' || Number(sForm.price) < 0) { setErr('กรอกราคาให้ถูกต้อง'); return; }
    if (!sForm.category) { setErr('เลือกหมวดหมู่'); return; }
    setErr('');
    const payload = {
      name: sForm.name.trim(), category: sForm.category, price: Number(sForm.price),
      duration: sForm.duration === '' ? null : Number(sForm.duration),
      flatRate: Math.max(0, Math.min(100, Number(sForm.flatRatePct) || 0)) / 100,
    };
    if (editingS) {
      saveData({
        ...data,
        services: services.map((s) => (s.id === editingS.id ? { ...s, ...payload } : s)),
        auditLog: pushAudit(data, 'แก้ไขบริการ', `${editingS.id} · ${payload.name}`, `฿${payload.price.toLocaleString()}`),
      });
      alertDialog({ title: `แก้ไข ${payload.name} แล้ว`, message: `ราคา ฿${payload.price.toLocaleString()}` });
    } else {
      const id = nextId('S', services);
      saveData({
        ...data,
        services: [...services, { id, ...payload, tierCategory: 'other' }],
        auditLog: pushAudit(data, 'เพิ่มบริการ', `${id} · ${payload.name}`, `฿${payload.price.toLocaleString()}`),
      });
      alertDialog({ title: `เพิ่ม ${payload.name} แล้ว`, message: `ราคา ฿${payload.price.toLocaleString()}` });
    }
    setShowS(false);
  };

  const deleteS = async (s) => {
    const ok = await confirmDialog({ title: `ลบบริการ ${s.name}?`, message: 'ประวัติบิลเดิมยังเก็บชื่อไว้', confirmLabel: 'ลบเลย', danger: true });
    if (!ok) return;
    saveData({
      ...data,
      services: services.filter((x) => x.id !== s.id),
      auditLog: pushAudit(data, 'ลบบริการ', `${s.id} · ${s.name}`, 'ลบออก'),
    });
    alertDialog({ title: `ลบ ${s.name} แล้ว` });
  };

  const resetServices = async () => {
    const ok = await confirmDialog({ title: 'รีเซ็ตบริการเป็นค่าเริ่มต้น?', message: 'นวดไทย 1 ชม 350 / 1.5 ชม 500 / 2 ชม 650 · บิลเก่าไม่หาย', confirmLabel: 'รีเซ็ตเลย' });
    if (!ok) return;
    saveData({
      ...data,
      services: DEFAULT_SERVICES.map((s) => ({ ...s })),
      serviceCategories: [...DEFAULT_CATEGORIES],
      auditLog: pushAudit(data, 'รีเซ็ตบริการ', 'กลับเป็นค่าเริ่มต้นร้าน', `${DEFAULT_SERVICES.length} รายการ`),
    });
    alertDialog({ title: 'รีเซ็ตบริการแล้ว', message: `นวดไทย 1 ชม 350 / 1.5 ชม 500 / 2 ชม 650 · รวม ${DEFAULT_SERVICES.length} รายการ` });
  };

  return (
    <div>
      <PageHeader icon={Store} eyebrow="Store Setup" title="จัดการร้าน" />

      <div className="seg">
        <button onClick={() => setTab('staff')} className={tab === 'staff' ? 'on' : ''}>พนักงาน ({therapists.length})</button>
        <button onClick={() => setTab('services')} className={tab === 'services' ? 'on' : ''}>บริการ ({services.length})</button>
      </div>

      {err && <div className="err-banner"><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}

      {tab === 'staff' && (
        <Card>
          <CardHead title="รายชื่อพนักงาน" right={<button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddT}><Plus size={15} /> เพิ่มพนักงาน</button>} />
          {therapists.map((t) => (
            <div key={t.id} className="mrow">
              <span className="thera-ava" style={{ width: 42, height: 42, fontSize: 19 }}>{(t.nickname || '?').charAt(0)}</span>
              <span className="grow">
                <b style={{ fontSize: 13.5 }}>{t.name} <span className="muted">· {t.nickname} · {t.id}</span></b>
                <span style={{ display: 'flex', gap: 6, marginTop: 3 }}>
                  <span className={`badge ${t.role === 'senior' ? 'paid' : 'info'}`}>{t.role === 'senior' ? 'อาวุโส' : 'รุ่นใหม่'}</span>
                  <span className={`badge ${t.active === false ? 'void' : 'neutral'}`}>{t.active === false ? 'พักงาน' : 'ใช้งาน'}</span>
                </span>
              </span>
              <button className={`toggle${t.active === false ? '' : ' on'}`} onClick={() => toggleT(t)} title="สลับสถานะ">{t.active === false ? 'พัก' : 'ใช้'}</button>
              <button className="icon-btn" onClick={() => openEditT(t)} aria-label={`แก้ไข ${t.name}`}><Pencil size={15} /></button>
              <button className="icon-btn danger" onClick={() => deleteT(t)} aria-label={`ลบ ${t.name}`}><Trash2 size={15} /></button>
            </div>
          ))}
          {therapists.length === 0 && <EmptyState title="ยังไม่มีพนักงาน" subtitle="กดเพิ่มพนักงาน" />}
          <p className="muted" style={{ marginTop: 10 }}>พนักงานที่พักงานจะไม่ขึ้นให้เลือกใน POS · ลบแล้วประวัติบิลเดิมยังเก็บชื่อไว้</p>
        </Card>
      )}

      {tab === 'services' && (
        <>
          <Card>
            <CardHead title="หมวดหมู่การบริการ" />
            {cats.map((c) => {
              const count = services.filter((s) => s.category === c).length;
              return renameCat === c ? (
                <div key={c} className="mrow">
                  <input value={renameName} onChange={(e) => setRenameName(e.target.value)} className="input" style={{ flex: 1 }} />
                  <button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={saveRenameCat}>บันทึก</button>
                  <button className="btn btn-ghost auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={() => setRenameCat(null)}>ยกเลิก</button>
                </div>
              ) : (
                <div key={c} className="mrow">
                  <span className="grow"><b style={{ fontSize: 13.5 }}>{c}</b> <span className="muted">· {count} บริการ</span></span>
                  <button className="icon-btn" onClick={() => { setRenameCat(c); setRenameName(c); setErr(''); }} aria-label={`แก้ไข ${c}`}><Pencil size={15} /></button>
                  <button className="icon-btn danger" onClick={() => deleteCat(c)} aria-label={`ลบ ${c}`}><Trash2 size={15} /></button>
                </div>
              );
            })}
            <div className="mrow" style={{ borderBottom: 0 }}>
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="ชื่อหมวดใหม่…" className="input" style={{ flex: 1 }} />
              <button className="btn btn-ghost auto" style={{ padding: '10px 16px', fontSize: 13 }} onClick={addCat}><Plus size={15} /> เพิ่ม</button>
            </div>
          </Card>

          <Card>
            <CardHead title="รายการบริการ" hint="แยก 1 รายการ = 1 ช่วงเวลา" right={<span style={{ display: 'flex', gap: 8 }}><button className="btn btn-ghost auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={resetServices} title="กลับเป็นค่าเริ่มต้นร้าน"><RotateCcw size={15} /> รีเซ็ต</button><button className="btn btn-primary auto" style={{ padding: '9px 15px', fontSize: 13 }} onClick={openAddS}><Plus size={15} /> เพิ่มบริการ</button></span>} />
            <p className="muted" style={{ marginBottom: 8 }}>ตั้งชื่อแนะนำ: <b>นวดไทย 1 ชม / นวดไทย 1.5 ชม / นวดไทย 2 ชม</b> — แยกกันคนละรายการ ราคา 350 / 500 / 650</p>
            {cats.map((c) => {
              const list = services.filter((s) => s.category === c).sort((a, b) => (a.duration ?? 9999) - (b.duration ?? 9999));
              if (list.length === 0) return null;
              return (
                <div key={c} style={{ marginBottom: 6 }}>
                  <div className="label" style={{ margin: '10px 0 2px' }}>{c} · {list.length}</div>
                  {list.map((s) => (
                    <div key={s.id} className="mrow">
                      <span className="grow">
                        <b style={{ fontSize: 13.5 }}>{s.name}</b>
                        <small className="muted" style={{ display: 'block' }}>{s.duration != null ? `⏱ ${formatDuration(s.duration)} (${s.duration} นาที) · ` : ''}คอม {Math.round((s.flatRate || 0) * 100)}% · {s.id}</small>
                      </span>
                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>฿{(s.price || 0).toLocaleString()}</b>
                      <button className="icon-btn" onClick={() => openEditS(s)} aria-label={`แก้ไข ${s.name}`}><Pencil size={15} /></button>
                      <button className="icon-btn danger" onClick={() => deleteS(s)} aria-label={`ลบ ${s.name}`}><Trash2 size={15} /></button>
                    </div>
                  ))}
                </div>
              );
            })}
            {services.filter((s) => !cats.includes(s.category)).map((s) => (
              <div key={s.id} className="mrow">
                <span className="grow"><b style={{ fontSize: 13.5 }}>{s.name}</b><small className="muted" style={{ display: 'block' }}>นอกหมวด · {s.category}</small></span>
                <b>฿{(s.price || 0).toLocaleString()}</b>
                <button className="icon-btn" onClick={() => openEditS(s)} aria-label={`แก้ไข ${s.name}`}><Pencil size={15} /></button>
                <button className="icon-btn danger" onClick={() => deleteS(s)} aria-label={`ลบ ${s.name}`}><Trash2 size={15} /></button>
              </div>
            ))}
            {services.length === 0 && <EmptyState title="ยังไม่มีบริการ" subtitle="กดเพิ่มบริการ" />}
          </Card>
        </>
      )}

      {showT && (
        <Modal onClose={() => { setShowT(false); setErr(''); }}>
          <h3>{editingT ? `แก้ไข ${editingT.name}` : 'เพิ่มพนักงาน'}</h3>
          {err && <div className="err-banner" style={{ marginTop: 10 }}><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
          <div className="f2" style={{ marginTop: 12 }}>
            <div className="field"><label>ชื่อ *</label><input value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} placeholder="เช่น คุณนิด" className="input" /></div>
            <div className="field"><label>ชื่อเล่น *</label><input value={tForm.nickname} onChange={(e) => setTForm({ ...tForm, nickname: e.target.value })} placeholder="เช่น นิด" className="input" /></div>
          </div>
          <div className="f2">
            <div className="field"><label>ระดับ</label>
              <select value={tForm.role} onChange={(e) => setTForm({ ...tForm, role: e.target.value })} className="input">
                <option value="junior">รุ่นใหม่</option><option value="senior">อาวุโส</option>
              </select>
            </div>
            <div className="field"><label>สถานะ</label>
              <select value={tForm.active ? 'on' : 'off'} onChange={(e) => setTForm({ ...tForm, active: e.target.value === 'on' })} className="input">
                <option value="on">ใช้งาน</option><option value="off">พักงาน</option>
              </select>
            </div>
          </div>
          <div className="modal-row">
            <button onClick={() => { setShowT(false); setErr(''); }} className="btn btn-ghost" style={{ width: '100%' }}>ยกเลิก</button>
            <button onClick={saveT} className="btn btn-primary" style={{ width: '100%' }}><CheckCircle2 size={16} /> บันทึก</button>
          </div>
        </Modal>
      )}

      {showS && (
        <Modal onClose={() => { setShowS(false); setErr(''); }}>
          <h3>{editingS ? `แก้ไข ${editingS.name}` : 'เพิ่มบริการ'}</h3>
          {err && <div className="err-banner" style={{ marginTop: 10 }}><TriangleAlert size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {err}</div>}
          <div className="field" style={{ marginTop: 12 }}><label>ชื่อบริการ *</label><input value={sForm.name} onChange={(e) => setSForm({ ...sForm, name: e.target.value })} placeholder="เช่น นวดไทย 1.5 ชม" className="input" />
            <p className="muted" style={{ marginTop: 6 }}>แยก 1 ช่วงเวลา = 1 รายการ · ตัวอย่าง: นวดไทย 1 ชม / นวดไทย 1.5 ชม / นวดไทย 2 ชม</p>
          </div>
          <div className="field"><label>หมวดหมู่ *</label>
            <select value={sForm.category} onChange={(e) => setSForm({ ...sForm, category: e.target.value })} className="input">
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="f3">
            <div className="field"><label>ราคา (฿) *</label><input type="number" min="0" value={sForm.price} onChange={(e) => setSForm({ ...sForm, price: e.target.value })} placeholder="0" className="input" /></div>
            <div className="field"><label>เวลา (นาที) {sForm.duration !== '' && Number(sForm.duration) > 0 ? `· ${formatDuration(Number(sForm.duration))}` : ''}</label><input type="number" min="0" value={sForm.duration} onChange={(e) => setSForm({ ...sForm, duration: e.target.value })} placeholder="—" className="input" /></div>
            <div className="field"><label>คอม (%)</label><input type="number" min="0" max="100" value={sForm.flatRatePct} onChange={(e) => setSForm({ ...sForm, flatRatePct: e.target.value })} placeholder="35" className="input" /></div>
          </div>
          <div className="preset-row" style={{ marginTop: 0, marginBottom: 12 }}>
            {[45, 60, 90, 120].map((m) => (
              <button key={m} type="button" className="preset-btn" onClick={() => setSForm((f) => ({ ...f, duration: String(m) }))}>{formatDuration(m)} ({m})</button>
            ))}
            <button type="button" className="preset-btn" onClick={() => setSForm((f) => ({ ...f, duration: '' }))}>ไม่จำกัดเวลา</button>
          </div>
          <div className="modal-row">
            <button onClick={() => { setShowS(false); setErr(''); }} className="btn btn-ghost" style={{ width: '100%' }}>ยกเลิก</button>
            <button onClick={saveS} className="btn btn-primary" style={{ width: '100%' }}><CheckCircle2 size={16} /> บันทึก</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
