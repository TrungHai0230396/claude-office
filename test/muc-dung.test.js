import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gioHetTuLoi, uocLucMoKhung, tinhMucDung, docUsage, gopMucDungCC } from '../lib/muc-dung.js';

const L = (s) => Date.parse(s);
const PHUT = 60e3;

test('giờ hết trong câu lỗi chạm giới hạn, theo múi giờ ghi trong ngoặc', () => {
  const luc = L('2026-10-18T09:30:00Z'); // 16:30 giờ Việt Nam
  assert.equal(gioHetTuLoi("You've hit your session limit · resets 6:50pm (Asia/Saigon)", luc), L('2026-10-18T11:50:00Z'));
  // Giờ ghi đã qua trong ngày thì là ngày hôm sau.
  assert.equal(gioHetTuLoi('resets 9am (Asia/Saigon)', L('2026-10-18T05:00:00Z')), L('2026-10-19T02:00:00Z'));
  assert.equal(gioHetTuLoi('Usage limit reached · resets Oct 25, 9am (Asia/Saigon)', L('2026-10-23T03:00:00Z')), L('2026-10-25T02:00:00Z'));
  assert.equal(gioHetTuLoi('không có giờ', luc), null);
});

test('ước lúc mở khung 5 giờ: lúc phần trăm tụt hay từ 0 nhích lên', () => {
  const bd = L('2026-10-23T00:00:00Z');
  const mau = [
    { t: bd, fh: 80 },
    { t: bd + 15 * PHUT, fh: 92 },
    { t: bd + 30 * PHUT, fh: 3 },
    { t: bd + 45 * PHUT, fh: 9 },
  ];
  const mo = uocLucMoKhung(mau, bd + 60 * PHUT);
  assert.equal(mo.luc, bd + 22.5 * PHUT);
  assert.equal(mo.saiSo, 7.5 * PHUT);
  const tu0 = uocLucMoKhung([{ t: bd, fh: 0 }, { t: bd + 15 * PHUT, fh: 4 }], bd + 20 * PHUT);
  assert.equal(tu0.luc, bd + 7.5 * PHUT);
  // Hai mẫu cách nhau quá xa thì không đoán.
  assert.equal(uocLucMoKhung([{ t: bd, fh: 90 }, { t: bd + 90 * PHUT, fh: 5 }], bd + 100 * PHUT), null);
});

test('mức dùng: mẫu mới thì dùng, kèm giờ hết ước tính; mẫu cũ thì nhắc mở menu Claude', () => {
  const bd = L('2026-10-23T00:00:00Z');
  const mau = [
    { t: bd, org: 'A', u: { fh: 90, sd: 20 } },
    { t: bd + 15 * PHUT, org: 'A', u: { fh: 2, sd: 21 } },
    { t: bd + 30 * PHUT, org: 'A', u: { fh: 12, sd: 22 } },
    { t: bd + 30 * PHUT, org: 'B', u: { fh: 77 } },
  ];
  const kq = tinhMucDung({ mau, org: 'A', bayGio: bd + 40 * PHUT });
  assert.equal(kq.namGio.phanTram, 12);
  assert.equal(kq.namGio.cu, false);
  assert.equal(kq.tuan.phanTram, 22);
  assert.equal(kq.het.chinhXac, false);
  assert.equal(kq.het.luc, bd + 7.5 * PHUT + 5 * 3600e3);
  assert.equal(kq.goiY, null);

  const cu = tinhMucDung({ mau, org: 'A', bayGio: bd + 2 * 3600e3 });
  assert.equal(cu.namGio.cu, true);
  assert.match(cu.goiY, /thanh menu/);
  // Quá 5 giờ thì khung chắc chắn đã đổi: không còn số.
  assert.equal(tinhMucDung({ mau, org: 'A', bayGio: bd + 6 * 3600e3 }).namGio, null);
});

test('chạm giới hạn: giờ hết chính xác từ câu lỗi, bỏ qua lỗi giới hạn tuần và lỗi đã hết hạn', () => {
  const luc = L('2026-10-23T03:00:00Z');
  const loi = [
    { chu: "You've hit your session limit · resets 11:40am (Asia/Saigon)", luc },
    { chu: "You've hit your weekly limit · resets Oct 25, 9am (Asia/Saigon)", luc },
    { chu: "You've hit your session limit · resets 6:20pm (Asia/Saigon)", luc: L('2026-10-18T09:00:00Z') },
  ];
  const kq = tinhMucDung({ loi, bayGio: luc + 10 * PHUT });
  assert.equal(kq.het.chinhXac, true);
  assert.equal(kq.het.luc, L('2026-10-23T04:40:00Z'));
  assert.equal(kq.namGio.phanTram, 100);
});

// ---------- số từ lệnh /usage của Claude Code ----------
const USAGE_THAT = `You are currently using your subscription to power your Claude Code usage

Current session: 42% used · resets Oct 23 at 4:39pm (Asia/Saigon)
Current week (Fable): 0% used · resets Oct 25 at 9am (Asia/Saigon)

What's contributing to your limits usage?
Approximate · sessions on this machine only · shares overlap

Last 24h · 3614 requests · 12 sessions
  97%  Start fresh when you switch tasks · run /clear`;

test('đọc giờ mở lại kiểu "Oct 23 at 4:39pm"', () => {
  const luc = Date.parse('2026-10-23T11:20:00+07:00');
  assert.equal(gioHetTuLoi('resets Oct 23 at 4:39pm (Asia/Saigon)', luc), Date.parse('2026-10-23T16:39:00+07:00'));
  assert.equal(gioHetTuLoi('resets Oct 25 at 9am (Asia/Saigon)', luc), Date.parse('2026-10-25T09:00:00+07:00'));
});

test('đọc kết quả /usage: phiên 5 giờ, tuần, giờ mở lại', () => {
  const luc = Date.parse('2026-10-23T11:20:00+07:00');
  const kq = docUsage(USAGE_THAT, luc);
  assert.equal(kq.goi, true);
  assert.deepEqual(kq.namGio, { ten: '', phanTram: 42, het: Date.parse('2026-10-23T16:39:00+07:00') });
  assert.deepEqual(kq.tuan, [{ ten: 'Fable', phanTram: 0, het: Date.parse('2026-10-25T09:00:00+07:00') }]);
  assert.equal(docUsage('You are using API usage billing. No plan limits apply.', luc), null);
  assert.equal(docUsage('', luc), null);
});

test('gộp số /usage vào mức dùng: mới thì dùng, cũ hay quá giờ mở lại thì bỏ', () => {
  const bay = Date.parse('2026-10-23T11:25:00+07:00');
  const cc = { luc: bay - 60e3, ketQua: docUsage(USAGE_THAT, bay - 60e3) };
  const md = gopMucDungCC({ namGio: null, tuan: null, het: null, goiY: 'bấm biểu tượng' }, cc, bay);
  assert.equal(md.namGio.phanTram, 42);
  assert.equal(md.namGio.nguon, 'claude-code');
  assert.deepEqual(md.het, { luc: Date.parse('2026-10-23T16:39:00+07:00'), chinhXac: true });
  assert.equal(md.tuan.ten, 'Fable');
  assert.equal(md.goiY, null);
  // Cũ quá 20 phút: giữ nguyên.
  const cu = { namGio: null, tuan: null, het: null, goiY: 'x' };
  assert.equal(gopMucDungCC(cu, { ...cc, luc: bay - 21 * 60e3 }, bay), cu);
  // Đã qua giờ mở lại khung 5 giờ: bỏ số 5 giờ cũ.
  const sau = Date.parse('2026-10-23T16:45:00+07:00');
  const md2 = gopMucDungCC({ namGio: null, tuan: null, het: null, goiY: 'x' }, { luc: sau - 60e3, ketQua: cc.ketQua }, sau);
  assert.equal(md2.namGio, null);
  assert.equal(md2.tuan.phanTram, 0);
  assert.equal(gopMucDungCC(null, null, bay), null);
});
