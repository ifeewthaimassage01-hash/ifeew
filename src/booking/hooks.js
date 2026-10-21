import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bookingAdminApi } from '../lib/bookingAdminApi';
import { LIST_LIMIT, REFRESH_MS, isTodoBooking } from './bookingUtils';

/**
 * โหลดรายการจอง + สรุปตัวเลข, รีโหลดอัตโนมัติทุก 15 วินาที
 *
 * - keyValue = รหัสผ่านจัดการการจอง (มาจากค่าที่เจ้าของร้านตั้งในหน้า "จัดการร้าน")
 *   ว่าง = ยังไม่ได้ตั้ง → ไม่ยิง API (หน้าแสดงข้อความให้ไปตั้งในหน้า "จัดการร้าน")
 * - paused = true ตอนเปิดกล่องยืนยัน/ปฏิเสธ/ดูสลีป → ห้ามรีโหลดอัตโนมัติ
 *   (เก็บเป็น ref ข้างใน เพื่อไม่ให้ interval ถูกสร้างใหม่ทุกครั้งที่เปิด/ปิดกล่อง)
 * - loadDataRef: ให้ hook อื่น (useAdminDecision) เรียก loadData({ silent: true })
 *   ได้โดยไม่ต้องส่ง loadData กลับไปกลับมา (กัน circular dependency ระหว่าง hook)
 */
export function useAdminBookings({
  keyValue, date, allDates, statusFilter, query,
  paused, onUnauthorized, loadDataRef,
}) {
  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  /* ใช้ตอนเปิดกล่องยืนยันอยู่ → ห้ามรีโหลดอัตโนมัติ */
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = Boolean(paused);
  }, [paused]);

  /* ---------- โหลดข้อมูล ---------- */
  const loadData = useCallback(async ({ silent = false } = {}) => {
    // ยังไม่ได้ตั้งรหัสผ่าน → ไม่ยิง API (หน้าจะบอกให้ไปตั้งในหน้า "จัดการร้าน")
    if (!keyValue) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        bookingAdminApi.list(keyValue, {
          date: allDates ? '' : date,
          status: statusFilter,
          limit: LIST_LIMIT,
        }),
        bookingAdminApi.stats(keyValue),
      ]);
      setBookings(Array.isArray(listRes?.bookings) ? listRes.bookings : []);
      setTotal(Number(listRes?.total) || 0);
      setStats(statsRes?.stats || null);
      setError('');
    } catch (e) {
      console.error('[booking] โหลดข้อมูลหน้าจัดการการจองไม่สำเร็จ', e);
      setError(e?.message || 'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่');
      // key ผิด → แจ้งให้เจ้าของร้านไปตั้งใหม่ในหน้า "จัดการร้าน"
      if (e?.code === 'UNAUTHORIZED' || e?.status === 401) {
        onUnauthorized('รหัสผ่านจัดการการจองไม่ถูกต้องหรือถูกยกเลิก — กรุณาให้เจ้าของร้านตั้งใหม่ในหน้า "จัดการร้าน"');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [keyValue, date, allDates, statusFilter, onUnauthorized]);

  /* ส่ง loadData ให้ hook อื่นใช้ (doConfirm / doReject รีโหลดหลังบันทึก) */
  useEffect(() => {
    if (loadDataRef) loadDataRef.current = loadData;
  }, [loadData, loadDataRef]);

  /* โหลดครั้งแรก + เมื่อตัวกรองเปลี่ยน */
  useEffect(() => { loadData(); }, [loadData]);

  /* รีโหลดอัตโนมัติทุก 15 วินาที
     (ข้ามตอนเปิดกล่องยืนยัน · ซ่อนแท็บ · หรือมี modal ของแอปเปิดอยู่) */
  useEffect(() => {
    if (!keyValue) return undefined;
    const t = setInterval(() => {
      if (pausedRef.current) return;
      if (typeof document !== 'undefined' && document.hidden) return;
      // มี modal ของแอป (หรือของหน้านี้) เปิดอยู่ → งดรีโหลด กันข้อมูลเปลี่ยนกลางที่ผู้ใช้กำลังดู
      if (typeof document !== 'undefined' && document.querySelector('.modal-ov')) return;
      loadData({ silent: true });
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [loadData, keyValue]);

  /* ---------- ค้นหา (ฝั่ง client) ---------- */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bookings;
    return bookings.filter((b) => {
      const code = String(b?.code || '').toLowerCase();
      const name = String(b?.customer_name || '').toLowerCase();
      const phone = String(b?.customer_phone || '').toLowerCase();
      return code.includes(q) || name.includes(q) || phone.includes(q);
    });
  }, [bookings, query]);

  /* ---------- แยก "ต้องดำเนินการ" ออกจาก "ประวัติ" ---------- */
  const grouped = useMemo(() => {
    const todo = [];
    const history = [];
    filtered.forEach((b) => {
      if (isTodoBooking(b)) todo.push(b);
      else history.push(b);
    });
    return { todo, history };
  }, [filtered]);

  return { bookings, total, stats, loading, refreshing, error, loadData, filtered, grouped };
}

/**
 * สถานะกล่องยืนยัน/ปฏิเสธ/ดูสลีป + action ที่ยิง API
 * (ขั้นตอนยืนยัน 2 จังหวะอยู่ใน ConfirmTransferDialog — ที่นี่แค่ส่งต่อ amount)
 */
export function useAdminDecision({ keyValue, setToast, onUnauthorized, loadDataRef }) {
  const [dialog, setDialog] = useState(null);       // { kind, booking }
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogErr, setDialogErr] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [slipView, setSlipView] = useState(null);

  /* true = มีกล่องเปิดอยู่ → ใช้หยุด auto-refresh */
  const busy = Boolean(dialog) || Boolean(slipView);

  const reload = async () => {
    if (loadDataRef?.current) await loadDataRef.current({ silent: true });
  };

  /* ---------- action: ยืนยันการโอน ---------- */
  const openConfirm = (b) => {
    setDialog({ kind: 'confirm', booking: b });
    setDialogErr('');
    setMismatch(false);
  };

  const doConfirm = async ({ amount }) => {
    const b = dialog?.booking;
    if (!b) return;
    setDialogBusy(true);
    setDialogErr('');
    try {
      const res = await bookingAdminApi.confirm(keyValue, { code: b.code, amount });
      setDialog(null);
      setToast(res?.already_paid ? 'เดอร์นี้ชำระเงินแล้วอยู่แล้ว' : 'ยืนยันการจองเรียบร้อยแล้ว');
      await reload();
    } catch (e) {
      console.error('[booking] ยืนยันการจองไม่สำเร็จ', e);
      if (e?.code === 'AMOUNT_MISMATCH') {
        setMismatch(true);
        setDialogErr(e?.message || 'ยอดที่ส่งมาไม่ตรงกับเดอร์นี้');
      } else if (e?.code === 'BOOKING_CLOSED') {
        setDialogErr(e?.message || 'การจองนี้ถูกยกเลิกหรือหมดอายุแล้ว');
      } else if (e?.code === 'UNAUTHORIZED' || e?.status === 401) {
        setDialogErr('รหัสผ่านไม่ถูกต้อง — กรุณาให้เจ้าของร้านตั้งใหม่ในหน้า "จัดการร้าน"');
        onUnauthorized('รหัสผ่านจัดการการจองไม่ถูกต้อง — กรุณาให้เจ้าของร้านตั้งใหม่ในหน้า "จัดการร้าน"');
      } else {
        setDialogErr(e?.message || 'ยืนยันการจองไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setDialogBusy(false);
    }
  };

  /* ---------- action: ปฏิเสธ/ยกเลิก ---------- */
  const openReject = (b) => {
    setDialog({ kind: 'reject', booking: b });
    setDialogErr('');
    setMismatch(false);
  };

  const doReject = async (reason) => {
    const b = dialog?.booking;
    if (!b) return;
    setDialogBusy(true);
    setDialogErr('');
    try {
      await bookingAdminApi.reject(keyValue, { code: b.code, reason });
      setDialog(null);
      setToast('ปฏิเสธการจองเรียบร้อยแล้ว');
      await reload();
    } catch (e) {
      console.error('[booking] ปฏิเสธการจองไม่สำเร็จ', e);
      if (e?.code === 'ALREADY_PAID') {
        setDialogErr(e?.message || 'เดอร์นี้ชำระเงินแล้ว — ใช้การคืนเงินแทน');
      } else if (e?.code === 'NOT_FOUND') {
        setDialogErr(e?.message || 'ไม่พบการจองรหัสนี้');
      } else if (e?.code === 'UNAUTHORIZED' || e?.status === 401) {
        setDialogErr('รหัสผ่านไม่ถูกต้อง — กรุณาให้เจ้าของร้านตั้งใหม่ในหน้า "จัดการร้าน"');
        onUnauthorized('รหัสผ่านจัดการการจองไม่ถูกต้อง — กรุณาให้เจ้าของร้านตั้งใหม่ในหน้า "จัดการร้าน"');
      } else {
        setDialogErr(e?.message || 'ปฏิเสธการจองไม่สำเร็จ กรุณาลองใหม่');
      }
    } finally {
      setDialogBusy(false);
    }
  };

  return {
    dialog, setDialog, dialogBusy, dialogErr, mismatch, slipView, setSlipView, busy,
    openConfirm, doConfirm, openReject, doReject,
  };
}
