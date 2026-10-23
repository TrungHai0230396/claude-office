import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lenhNghi, boDau } from '../public/js/lenh-nghi.js';

test('bỏ dấu tiếng Việt, cả chữ đ', () => {
  assert.equal(boDau('Đi ngồi Công Viên!'), 'di ngoi cong vien');
});

test('câu sai đi chơi ra đúng chỗ', () => {
  assert.equal(lenhNghi('đi ngồi công viên'), 'gheDa');
  assert.equal(lenhNghi('ra ghế đá ngồi'), 'gheDa');
  assert.equal(lenhNghi('đi ra lấy cf'), 'mayPha');
  assert.equal(lenhNghi('đi pha cà phê'), 'mayPha');
  assert.equal(lenhNghi('đi dạo vườn'), 'vong');
  assert.equal(lenhNghi('ra sofa nằm'), 'sofa');
  assert.equal(lenhNghi('đi uống nước'), 'cayNuoc');
  assert.equal(lenhNghi('ra bàn cao tán gẫu'), 'banCao');
  assert.equal(lenhNghi('vô ghế làm việc'), 'ban');
  assert.equal(lenhNghi('về bàn'), 'ban');
});

test('lời nhờ làm việc bình thường không bị coi là lệnh', () => {
  assert.equal(lenhNghi(''), null);
  assert.equal(lenhNghi(undefined), null);
  assert.equal(lenhNghi('hello'), null);
  assert.equal(lenhNghi('oke làm luôn đi'), null);
  assert.equal(lenhNghi('cà phê'), null);
  assert.equal(lenhNghi('sửa bàn phím đi'), null);
  assert.equal(
    lenhNghi('đi sửa hàm vẽ máy pha cà phê trong van-phong.js cho hơi nước bay chậm lại, rồi chạy npm test'),
    null,
  );
});
