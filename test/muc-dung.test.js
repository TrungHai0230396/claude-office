import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gioHetTuLoi, uocLucMoKhung, tinhMucDung } from '../lib/muc-dung.js';

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
