import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docTrangThaiTs, kiemTruyCap, TuXa } from '../lib/tu-xa.js';
import { kiemLenh, TEN_DAU_KHOA } from '../lib/bao-ve.js';

const STATUS = {
  BackendState: 'Running',
  Self: { DNSName: 'may-cua-toi.tail1234.ts.net.', UserID: 42 },
  User: { 42: { LoginName: 'Chu.May@example.com' }, 7: { LoginName: 'nguoi-khac@example.com' } },
};
const TS = { host: 'may-cua-toi.tail1234.ts.net', login: 'chu.may@example.com' };

test('đọc tên máy và tài khoản chủ máy từ tailscale status', () => {
  assert.deepEqual(docTrangThaiTs(STATUS), TS);
  assert.equal(docTrangThaiTs({ ...STATUS, BackendState: 'Stopped' }), null);
  assert.equal(docTrangThaiTs({ ...STATUS, Self: { DNSName: 'abc.example.com.', UserID: 42 } }), null);
  assert.equal(docTrangThaiTs(null), null);
});

test('trình duyệt trên chính máy này: nhận như cũ', () => {
  assert.deepEqual(kiemTruyCap({ host: '127.0.0.1:5230' }, null), { hopLe: true, tuXa: false });
  assert.deepEqual(kiemTruyCap({ host: 'localhost:5230' }, TS), { hopLe: true, tuXa: false });
});

test('qua Tailscale: chỉ đúng tài khoản chủ máy mới vào được', () => {
  const qua = (them) => ({ host: TS.host, 'x-forwarded-for': '100.64.0.9', ...them });
  assert.deepEqual(kiemTruyCap(qua({ 'tailscale-user-login': 'chu.may@example.com' }), TS), { hopLe: true, tuXa: true });
  assert.equal(kiemTruyCap(qua({ 'tailscale-user-login': 'nguoi-khac@example.com' }), TS).hopLe, false);
  assert.equal(kiemTruyCap(qua({}), TS).hopLe, false);
  // tailscale serve có đổi Host về 127.0.0.1 thì vẫn phải đúng tài khoản.
  assert.equal(kiemTruyCap({ host: '127.0.0.1:5230', 'x-forwarded-for': '100.64.0.9', 'tailscale-user-login': 'nguoi-khac@example.com' }, TS).hopLe, false);
  assert.equal(kiemTruyCap({ host: '127.0.0.1:5230', 'x-forwarded-for': '100.64.0.9', 'tailscale-user-login': 'chu.may@example.com' }, TS).hopLe, true);
  // Chưa có Tailscale, hay Host lạ (DNS rebinding): từ chối.
  assert.equal(kiemTruyCap(qua({ 'tailscale-user-login': 'chu.may@example.com' }), null).hopLe, false);
  assert.equal(kiemTruyCap({ host: 'trang-la.example' }, TS).hopLe, false);
  assert.equal(kiemTruyCap({ host: 'khac.tail1234.ts.net', 'tailscale-user-login': 'chu.may@example.com' }, TS).hopLe, false);
});

test('lệnh gửi từ điện thoại: cần đúng Origin https của máy và mã bí mật', () => {
  const khoa = 'khoa-thu';
  const dau = { host: TS.host, 'x-forwarded-for': '100.64.0.9', 'tailscale-user-login': 'chu.may@example.com', origin: `https://${TS.host}`, 'content-type': 'application/json', [TEN_DAU_KHOA]: khoa };
  const tc = kiemTruyCap(dau, TS);
  assert.equal(kiemLenh({ method: 'POST', headers: dau, cong: 5230, khoa, truyCap: tc, nguonThem: [`https://${TS.host}`] }), null);
  assert.ok(kiemLenh({ method: 'POST', headers: dau, cong: 5230, khoa, truyCap: tc, nguonThem: [] }));
  assert.ok(kiemLenh({ method: 'POST', headers: { ...dau, origin: 'https://trang-la.example' }, cong: 5230, khoa, truyCap: tc, nguonThem: [`https://${TS.host}`] }));
  assert.ok(kiemLenh({ method: 'POST', headers: { ...dau, [TEN_DAU_KHOA]: 'sai' }, cong: 5230, khoa, truyCap: tc, nguonThem: [`https://${TS.host}`] }));
});

test('tìm Tailscale trên máy: lấy kết quả của lệnh đầu tiên chạy được', async () => {
  const daGoi = [];
  const tx = new TuXa({ daNoi: async () => true, chay: async (duong) => (daGoi.push(duong), duong.includes('Tailscale.app') ? STATUS : null) });
  assert.deepEqual(await tx.lamMoi(), TS);
  assert.deepEqual(tx.nguonThem(), [`https://${TS.host}`]);
  assert.ok(daGoi.length >= 2);
  const khong = new TuXa({ daNoi: async () => true, chay: async () => null });
  assert.equal(await khong.lamMoi(), null);
  assert.deepEqual(khong.nguonThem(), []);
});

test('VPN Tailscale chưa nối thì không gọi lệnh Tailscale nào (lệnh đó có thể treo)', async () => {
  let goi = 0;
  const tx = new TuXa({ daNoi: async () => false, chay: async () => (goi++, STATUS) });
  assert.equal(await tx.lamMoi(), null);
  assert.equal(goi, 0);
});

test('mỗi lúc chỉ một lần dò, lần dò sau không chồng lên lần đang chạy', async () => {
  let goi = 0;
  let mo;
  const tx = new TuXa({ daNoi: async () => true, chay: () => (goi++, new Promise((r) => (mo = r))) });
  const a = tx.lamMoi();
  await new Promise((r) => setTimeout(r, 5));
  await tx.lamMoi();
  await tx.lamMoi();
  mo(STATUS);
  await a;
  assert.equal(goi, 1);
  assert.deepEqual(tx.ts, TS);
});
