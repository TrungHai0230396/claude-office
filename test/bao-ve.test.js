import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kiemLenh, kiemThuMuc, kiemCheDo, kiemTin, hostHopLe, taoKhoa, TEN_DAU_KHOA, LoiQuyen } from '../lib/bao-ve.js';

const KHOA = 'khoa-thu-123';
const dau = (them = {}) => ({ host: '127.0.0.1:5230', origin: 'http://127.0.0.1:5230', 'content-type': 'application/json', [TEN_DAU_KHOA]: KHOA, ...them });

test('lệnh đúng từ trang văn phòng thì nhận', () => {
  assert.equal(kiemLenh({ method: 'POST', headers: dau(), cong: 5230, khoa: KHOA }), null);
  assert.equal(kiemLenh({ method: 'POST', headers: dau({ host: 'localhost:5230', origin: 'http://localhost:5230' }), cong: 5230, khoa: KHOA }), null);
  assert.equal(kiemLenh({ method: 'GET', headers: { host: '127.0.0.1:5230', [TEN_DAU_KHOA]: KHOA }, cong: 5230, khoa: KHOA, ghi: false }), null);
});

test('thiếu mã, sai mã, sai nguồn, sai host, sai kiểu thân thì từ chối', () => {
  const { [TEN_DAU_KHOA]: _, ...khongMa } = dau();
  assert.ok(kiemLenh({ method: 'POST', headers: khongMa, cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ [TEN_DAU_KHOA]: 'sai' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ [TEN_DAU_KHOA]: KHOA + 'x' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ origin: 'https://trang-la.example' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ origin: 'null' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ origin: undefined }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ origin: 'http://127.0.0.1:9999' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ host: 'attacker.example:5230' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ 'content-type': 'text/plain' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ 'content-type': 'application/x-www-form-urlencoded' }), cong: 5230, khoa: KHOA }));
  assert.ok(kiemLenh({ method: 'PUT', headers: dau(), cong: 5230, khoa: KHOA }));
  // GET đọc dữ liệu cũng phải có mã.
  assert.ok(kiemLenh({ method: 'GET', headers: { host: '127.0.0.1:5230' }, cong: 5230, khoa: KHOA, ghi: false }));
  // Máy chủ chưa có mã thì không nhận gì.
  assert.ok(kiemLenh({ method: 'POST', headers: dau({ [TEN_DAU_KHOA]: '' }), cong: 5230, khoa: '' }));
});

test('host chỉ là máy này', () => {
  assert.ok(hostHopLe('127.0.0.1:5230'));
  assert.ok(hostHopLe('localhost'));
  assert.ok(hostHopLe('[::1]:5230'));
  assert.ok(!hostHopLe('127.0.0.1.nip.io:5230'));
  assert.ok(!hostHopLe(''));
});

test('mã bí mật đủ dài và mỗi lần một khác', () => {
  const a = taoKhoa();
  assert.ok(a.length >= 32);
  assert.notEqual(a, taoKhoa());
});

test('chế độ quyền: không bao giờ nhận chế độ bỏ qua quyền', () => {
  assert.equal(kiemCheDo(undefined), 'default');
  assert.equal(kiemCheDo('acceptEdits'), 'acceptEdits');
  assert.equal(kiemCheDo('plan'), 'plan');
  for (const c of ['bypassPermissions', 'dontAsk', 'auto', 'xyz']) assert.throws(() => kiemCheDo(c));
});

test('tin nhắn trống hay quá dài thì từ chối', () => {
  assert.throws(() => kiemTin(''));
  assert.throws(() => kiemTin('   '));
  assert.throws(() => kiemTin(42));
  assert.throws(() => kiemTin('a'.repeat(20001)));
  assert.equal(kiemTin('làm đi'), 'làm đi');
});

test('thư mục giao việc phải nằm trong thư mục nhà, có thật, không thoát ra bằng liên kết mềm', async () => {
  const goc = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-bv-')));
  const nha = path.join(goc, 'nha');
  const duAn = path.join(nha, 'du-an');
  const ngoai = path.join(goc, 'ngoai');
  fs.mkdirSync(duAn, { recursive: true });
  fs.mkdirSync(ngoai);
  fs.writeFileSync(path.join(nha, 'tep.txt'), 'x');
  fs.symlinkSync(ngoai, path.join(nha, 'loi-tat'));
  try {
    assert.equal(await kiemThuMuc(duAn, nha), duAn);
    assert.equal(await kiemThuMuc('~/du-an', nha), duAn);
    await assert.rejects(kiemThuMuc(nha, nha));
    await assert.rejects(kiemThuMuc(ngoai, nha));
    await assert.rejects(kiemThuMuc(path.join(nha, 'loi-tat'), nha));
    await assert.rejects(kiemThuMuc(path.join(nha, 'tep.txt'), nha));
    await assert.rejects(kiemThuMuc(path.join(nha, 'khong-co'), nha));
    await assert.rejects(kiemThuMuc('du-an', nha));
    await assert.rejects(kiemThuMuc('', nha));
    await assert.rejects(kiemThuMuc(path.join(nha, 'du-an', '..', '..', 'ngoai'), nha));
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('lỗi quyền macOS nói rõ cách cấp quyền', () => {
  const e = new LoiQuyen('/Users/x/Documents/du-an');
  assert.equal(e.ma, 403);
  assert.ok(e.quyen);
  assert.match(e.message, /Truy cập toàn bộ ổ đĩa/);
  assert.match(e.message, /npm start/);
});
