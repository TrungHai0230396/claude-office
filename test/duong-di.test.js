import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LuoiDi } from '../public/js/duong-di.js';

function diQua(luoi, x, z, duong) {
  // Mọi điểm dọc đường đi (trừ hai đầu) đều phải nằm trên ô đi được.
  let px = x;
  let pz = z;
  for (const [qx, qz] of duong.slice(0, -1)) {
    for (let i = 1; i <= 20; i++) {
      const t = i / 20;
      if (!luoi.diDuocXZ(px + (qx - px) * t, pz + (qz - pz) * t)) return false;
    }
    px = qx;
    pz = qz;
  }
  return true;
}

test('đi vòng qua bức tường có một cửa', () => {
  const l = new LuoiDi(-10, -10, 10, 10, 0.5);
  l.chanDoan(0, -10, 0, 10, 0.2);
  l.mo(0, 6, 0.3, 1.2);
  const d = l.timDuong(-5, 0, 5, 0);
  assert.ok(d, 'phải có đường');
  assert.deepEqual(d.at(-1), [5, 0]);
  assert.ok(d.some(([x, z]) => z > 4), 'phải đi qua cửa ở z≈6');
  assert.ok(diQua(l, -5, 0, d));
});

test('không có cửa thì không có đường', () => {
  const l = new LuoiDi(-10, -10, 10, 10, 0.5);
  l.chanDoan(0, -11, 0, 11, 0.2);
  assert.equal(l.timDuong(-5, 0, 5, 0), null);
});

test('đường thẳng khi không vướng gì chỉ còn một điểm', () => {
  const l = new LuoiDi(-10, -10, 10, 10, 0.5);
  assert.deepEqual(l.timDuong(-5, -5, 6, 4), [[6, 4]]);
});

test('điểm đích nằm sát bàn vẫn tới được (ghế kề bàn)', () => {
  const l = new LuoiDi(-10, -10, 10, 10, 0.5);
  l.chan(0, 0, 2, 0.76, 0, 0.18);
  const d = l.timDuong(-6, -6, 0.75, 1.0);
  assert.ok(d);
  assert.deepEqual(d.at(-1), [0.75, 1.0]);
});

test('hình chữ nhật quay 90 độ chặn đúng hướng', () => {
  const l = new LuoiDi(-10, -10, 10, 10, 0.5);
  // Dài 4 m theo trục x của vật, quay 90° quanh trục đứng thì nằm dọc theo z.
  l.chan(0, 0, 2, 0.3, Math.PI / 2, 0);
  assert.equal(l.diDuocXZ(0.1, 1.6), false);
  assert.equal(l.diDuocXZ(1.6, 0.1), true);
});
