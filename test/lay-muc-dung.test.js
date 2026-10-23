import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LayMucDung } from '../lib/lay-muc-dung.js';

// Claude Code giả: trả danh sách lệnh, rồi trả kết quả cho tin "/usage".
function claudeGia({ lenh = ['usage', 'clear'], ketQua = '', luot = 0, ghi = {} } = {}) {
  return ({ prompt, options }) => {
    ghi.options = options;
    ghi.tin = [];
    const it = prompt[Symbol.asyncIterator]();
    return {
      supportedCommands: async () => lenh.map((name) => ({ name, description: '' })),
      async *[Symbol.asyncIterator]() {
        const { value } = await it.next();
        ghi.tin.push(value?.message?.content);
        yield { type: 'result', subtype: 'success', is_error: false, num_turns: luot, total_cost_usd: luot ? 0.01 : 0, result: ketQua };
      },
      close: () => (ghi.dong = true),
    };
  };
}

const MAU = 'Current session: 42% used · resets Oct 23 at 4:39pm (Asia/Saigon)\nCurrent week (Fable): 0% used · resets Oct 25 at 9am (Asia/Saigon)';

test('lấy /usage: không gọi mô hình, không nạp cài đặt, đọc ra số', async () => {
  const ghi = {};
  let doi = 0;
  const l = new LayMucDung({ query: claudeGia({ ketQua: MAU, ghi }), khiDoi: () => doi++ });
  await l.lay();
  assert.deepEqual(ghi.tin, ['/usage']);
  assert.deepEqual(ghi.options.settingSources, []);
  assert.equal(ghi.options.persistSession, false);
  assert.ok(ghi.dong);
  assert.equal(l.trangThai, 'co');
  assert.equal(l.anh().ketQua.namGio.phanTram, 42);
  assert.equal(doi, 1);
});

test('đăng nhập bằng API key (không có giới hạn gói) thì báo không có', async () => {
  const l = new LayMucDung({ query: claudeGia({ ketQua: 'You are using API usage billing.' }) });
  await l.lay();
  assert.equal(l.trangThai, 'khongCo');
  assert.equal(l.anh(), null);
});

test('không có lệnh /usage thì thôi hẳn, không gửi gì', async () => {
  const ghi = {};
  const l = new LayMucDung({ query: claudeGia({ lenh: ['clear'], ghi }) });
  await l.lay();
  assert.equal(l.tat, true);
  assert.deepEqual(ghi.tin, []);
});

test('lỡ thành câu gửi mô hình (tốn lượt) thì thôi hẳn', async () => {
  const l = new LayMucDung({ query: claudeGia({ ketQua: MAU, luot: 1 }) });
  await l.lay();
  assert.equal(l.tat, true);
  assert.equal(l.anh(), null);
});
