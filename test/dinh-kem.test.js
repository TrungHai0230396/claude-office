import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kiemDinhKem, tenTepAnToan, luuTep } from '../lib/dinh-kem.js';
import { tinNguoiDung } from '../lib/phien-vp.js';

const B64 = Buffer.from('xin chào').toString('base64');
const NHO = 'data:image/jpeg;base64,' + Buffer.from('anh-nho').toString('base64');

test('ảnh: chỉ nhận loại ảnh thường, dữ liệu base64 hợp lệ, ảnh nhỏ đúng dạng', () => {
  const kq = kiemDinhKem({ anh: [{ loai: 'image/jpeg', du: B64, nho: NHO }] });
  assert.equal(kq.anh[0].du, B64);
  assert.equal(kq.anh[0].nho, NHO);
  assert.throws(() => kiemDinhKem({ anh: [{ loai: 'image/svg+xml', du: B64 }] }), /JPEG/);
  assert.throws(() => kiemDinhKem({ anh: [{ loai: 'image/png', du: 'không phải base64!' }] }), /hỏng/);
  assert.throws(() => kiemDinhKem({ anh: Array(7).fill({ loai: 'image/png', du: B64 }) }), /tối đa 6/);
  // Ảnh nhỏ lạ (không phải data:image/…;base64) thì bỏ, không hiện.
  assert.equal(kiemDinhKem({ anh: [{ loai: 'image/png', du: B64, nho: 'javascript:alert(1)' }] }).anh[0].nho, '');
  assert.throws(() => kiemDinhKem({ anh: 'rác' }));
});

test('tệp: tên được làm sạch, không thoát ra ngoài thư mục, giới hạn số lượng', () => {
  assert.equal(tenTepAnToan('../../etc/passwd'), 'passwd');
  assert.equal(tenTepAnToan('..\\\\..\\\\x.txt'), 'x.txt');
  assert.equal(tenTepAnToan('.env'), 'env');
  assert.equal(tenTepAnToan('báo cáo <1>.pdf'), 'báo cáo _1_.pdf');
  assert.equal(tenTepAnToan(''), 'tep');
  assert.throws(() => kiemDinhKem({ tep: Array(6).fill({ ten: 'a.txt', du: B64 }) }), /tối đa 5/);
  assert.throws(() => kiemDinhKem({ tep: [{ ten: 'a.txt', du: '' }] }));
});

test('lưu tệp: vào đúng thư mục, chỉ chủ máy đọc được', async () => {
  const goc = fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-dk-'));
  try {
    const { tep } = kiemDinhKem({ tep: [{ ten: '../loi.log', du: B64 }] });
    const [duong] = await luuTep(path.join(goc, 'vp_1'), tep);
    assert.equal(path.dirname(duong), path.join(goc, 'vp_1'));
    assert.match(path.basename(duong), /-loi\.log$/);
    assert.equal(fs.readFileSync(duong, 'utf8'), 'xin chào');
    assert.equal(fs.statSync(duong).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('tin có ảnh: khối ảnh đứng trước chữ', () => {
  const t = tinNguoiDung('xem giúp', [{ loai: 'image/png', du: B64 }]);
  assert.deepEqual(t.message.content, [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: B64 } },
    { type: 'text', text: 'xem giúp' },
  ]);
  assert.equal(tinNguoiDung('chỉ chữ').message.content, 'chỉ chữ');
});
