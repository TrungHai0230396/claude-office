import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { chiaTin, docNut, soanDuyet, tokenHopLe, BotTelegram } from '../lib/telegram.js';

test('chia tin dài, đọc dữ liệu nút, kiểm dạng token', () => {
  assert.deepEqual(chiaTin(''), []);
  const dai = ('dòng\n').repeat(2000);
  const phan = chiaTin(dai, 1000);
  assert.ok(phan.length > 1 && phan.every((x) => x.length <= 1000));
  assert.deepEqual(docNut('q|abc|y'), { loai: 'q', ma: 'abc', gia: 'y' });
  assert.equal(docNut('z|x|y'), null);
  assert.equal(tokenHopLe('123456789:' + 'A'.repeat(35)), true);
  assert.equal(tokenHopLe('khong-phai-token'), false);
});

test('tin báo xin quyền có nút; câu hỏi một lựa chọn có nút từng đáp án; dữ liệu nút không quá 64 byte', () => {
  const ma = '0b5ef1a2-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
  const q = soanDuyet({ ten: 'Sửa lỗi', duAn: 'cua-hang' }, { ma, loai: 'quyen', chu: 'Cho phép chạy: npm test', chiTiet: 'npm test', coLuon: true });
  const nutQ = q.banPhim.flat();
  assert.deepEqual(nutQ.map((n) => n.callback_data), [`q|${ma}|y`, `q|${ma}|n`, `q|${ma}|l`]);
  const h = soanDuyet({ ten: 'x', duAn: 'y' }, { ma, loai: 'hoi', chu: 'Chọn?', cauHoi: [{ question: 'Chọn màu?', multiSelect: false, options: [{ label: 'Đỏ' }, { label: 'Xanh' }] }] });
  assert.deepEqual(h.banPhim.flat().map((n) => n.callback_data), [`a|${ma}|0`, `a|${ma}|1`, `a|${ma}|chu`]);
  const k = soanDuyet({ ten: 'x', duAn: 'y' }, { ma, loai: 'keHoach', keHoach: '1. làm A' });
  assert.match(k.chu, /1\. làm A/);
  for (const n of [...q.banPhim.flat(), ...h.banPhim.flat(), ...k.banPhim.flat()]) assert.ok(Buffer.byteLength(n.callback_data) <= 64);
});

// Văn phòng giả + Telegram giả.
function dung() {
  const goc = fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-tg-'));
  const daGui = [];
  const daSua = [];
  const goi = { tao: [], gui: [], traLoi: [], dong: [], doiMoHinh: [], doiEffort: [] };
  let soTin = 100;
  const ql = {
    su: new EventEmitter(),
    ds: new Map(),
    tao: async (a) => (goi.tao.push(a), 'vp_moi'),
    gui: async (id, chu, kem) => goi.gui.push({ id, chu, kem }),
    traLoi: (id, tl) => {
      goi.traLoi.push({ id, ...tl });
      ql.su.emit('daTraLoi', { phien: { id }, ma: tl.ma, moTa: tl.choPhep ? '✓ Cho phép' : '✗ Từ chối' });
    },
    chiTietDuyet: (ma) => (ma === 'ma-1' ? { id: 'vp_a', duyet: { ma, loai: 'quyen' } } : null),
    dung: async () => {},
    doiMoHinh: async (id, mh) => goi.doiMoHinh.push({ id, mh }),
    doiEffort: async (id, ef) => goi.doiEffort.push({ id, ef }),
    danhSachMoHinh: async () => [
      { gia: 'default', ten: 'Default (recommended)', moTa: 'Opus 5.5 · Best for everyday, complex tasks', that: 'claude-opus-5-5', effort: ['low', 'medium', 'high', 'xhigh', 'max'], effortMacDinh: 'medium' },
      { gia: 'opus', ten: 'Opus 5.5', moTa: 'Best for everyday, complex tasks', that: 'claude-opus-5-5', effort: ['low', 'medium', 'high', 'xhigh', 'max'], effortMacDinh: 'medium' },
      { gia: 'sonnet', ten: 'Sonnet 5.5', moTa: 'Efficient for routine tasks', that: 'claude-sonnet-5-5', effort: ['low', 'medium', 'high', 'max'], effortMacDinh: 'medium' },
      { gia: 'claude-haiku-4-5-20251001', ten: 'Haiku 4.5', moTa: 'Fastest for quick answers', that: 'claude-haiku-4-5-20251001', effort: [], effortMacDinh: '' },
      { gia: 'claude-opus-4-8', ten: 'Opus 4.8', moTa: 'Best for everyday, complex tasks', that: 'claude-opus-4-8', effort: ['low', 'medium', 'high', 'xhigh', 'max'], effortMacDinh: 'high' },
    ],
    dong: (id, xoa) => {
      goi.dong.push({ id, xoa });
      if (xoa) ql.ds.delete(id);
    },
  };
  const api = async (pt, ts) => {
    if (pt === 'sendMessage') {
      daGui.push(ts);
      return { message_id: ++soTin };
    }
    if (pt === 'editMessageText') daSua.push(ts);
    if (pt === 'getMe') return { username: 'van_phong_bot' };
    return true;
  };
  const bot = new BotTelegram({
    quanLy: ql,
    tepLuu: path.join(goc, 'telegram.json'),
    dsThuMuc: async () => [{ duong: '~/Projects/cua-hang', ten: 'cua-hang' }],
    docToken: async () => '123456789:' + 'A'.repeat(35),
    goiApi: api,
  });
  bot.token = '123456789:' + 'A'.repeat(35);
  bot.bot = '@van_phong_bot';
  return { bot, ql, goi, daGui, daSua, goc };
}
const tin = (from, text, them = {}) => ({ update_id: 1, message: { message_id: 50, chat: { id: from, type: 'private' }, from: { id: from, username: 'u' + from }, text, ...them } });
const nutBam = (from, data) => ({ update_id: 2, callback_query: { id: 'cb', from: { id: from }, data, message: { message_id: 101 } } });

test('ghép: chỉ đúng mã mới nối; sai 5 lần thì đổi mã; người lạ sau đó bị bỏ qua', async () => {
  const { bot, daGui, goc } = dung();
  try {
    const ma = bot.trangThai().ghep.ma;
    assert.match(bot.trangThai().ghep.link, /^https:\/\/t\.me\/van_phong_bot\?start=\d{6}$/);
    await bot.xuLy(tin(7, '/start 000000'));
    assert.equal(bot.chu, null);
    for (let i = 0; i < 4; i++) await bot.xuLy(tin(7, '/start 111111'));
    assert.notEqual(bot.trangThai().ghep.ma, ma, 'sai 5 lần thì đổi mã');
    const maMoi = bot.trangThai().ghep.ma;
    await bot.xuLy(tin(42, '/start ' + maMoi));
    assert.equal(bot.chu.id, 42);
    assert.equal(fs.statSync(path.join(goc, 'telegram.json')).mode & 0o777, 0o600);
    const truoc = daGui.length;
    await bot.xuLy(tin(7, 'xoá hết dự án đi'));
    assert.equal(daGui.length, truoc, 'người lạ nhắn thì bot không làm gì');
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('ghép: "/start" không kèm mã thì bot chỉ cách; gõ riêng 6 số cũng ghép được; chưa mở hộp 📱 thì không mã nào đúng', async () => {
  const { bot, daGui, goc } = dung();
  try {
    await bot.xuLy(tin(42, '/start'));
    assert.equal(bot.chu, null);
    assert.equal(daGui.at(-1).chat_id, 42);
    assert.match(daGui.at(-1).text, /chưa ghép/);
    bot.nhacCuoi = 0;
    await bot.xuLy(tin(42, '123456'));
    assert.equal(bot.chu, null);
    assert.equal(bot.maGhep, null, 'bot không tự sinh mã khi có người đoán');
    assert.match(daGui.at(-1).text, /không đúng hoặc đã hết hạn/);
    await bot.xuLy(tin(42, bot.trangThai().ghep.ma));
    assert.equal(bot.chu.id, 42);
    assert.match(daGui.at(-1).text, /Đã nối/);
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('xoá phiên: /xoa → chọn phiên → hỏi lại → xoá; bấm Huỷ thì giữ; người lạ bấm thì không có gì', async () => {
  const { bot, ql, goi, daGui, daSua, goc } = dung();
  try {
    bot.chu = { id: 42, chatId: 42, ten: '@chu', cheDo: 'auto' };
    ql.ds.set('vp_a', { id: 'vp_a', ten: 'Sửa lỗi đăng nhập', trangThai: 'xong', hoatDongCuoi: 1 });
    bot.dangChat = 'vp_a';
    await bot.xuLy(tin(42, '/xoa'));
    assert.deepEqual(daGui.at(-1).reply_markup.inline_keyboard.flat().map((n) => n.callback_data), ['r|vp_a|', 'r||n']);
    await bot.xuLy(nutBam(42, 'r|vp_a|'));
    assert.match(daSua.at(-1).text, /Xoá “Sửa lỗi đăng nhập” khỏi văn phòng\?/);
    assert.deepEqual(daSua.at(-1).reply_markup.inline_keyboard.flat().map((n) => n.callback_data), ['r|vp_a|y', 'r|vp_a|n']);
    await bot.xuLy(nutBam(42, 'r|vp_a|n'));
    assert.equal(goi.dong.length, 0, 'bấm Huỷ thì không xoá');
    await bot.xuLy(nutBam(7, 'r|vp_a|y'));
    assert.equal(goi.dong.length, 0, 'người lạ bấm thì không xoá');
    await bot.xuLy(nutBam(42, 'r|vp_a|y'));
    assert.deepEqual(goi.dong, [{ id: 'vp_a', xoa: true }]);
    assert.equal(bot.dangChat, null);
    assert.match(daSua.at(-1).text, /Đã xoá/);
    assert.deepEqual(daSua.at(-1).reply_markup.inline_keyboard, []);
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('phiên đang chat được lưu: máy chủ khởi động lại thì bot vẫn nhớ, tin thường vẫn vào phiên đó', async () => {
  const { bot, ql, goi, goc } = dung();
  try {
    bot.chu = { id: 42, chatId: 42, ten: '@chu', cheDo: 'auto' };
    ql.ds.set('vp_a', { id: 'vp_a', ten: 'Sửa lỗi đăng nhập', trangThai: 'xong' });
    await bot.xuLy(nutBam(42, 's|vp_a|'));
    await bot.hangLuu;
    const sau = new BotTelegram({ quanLy: ql, tepLuu: bot.tepLuu, goiApi: async () => ({ message_id: 1 }) });
    await sau._napChu();
    assert.equal(sau.chu.id, 42);
    assert.equal(sau.dangChat, 'vp_a');
    await sau.xuLy(tin(42, 'chạy lại bài kiểm giúp mình'));
    assert.deepEqual(goi.gui.at(-1), { id: 'vp_a', chu: 'chạy lại bài kiểm giúp mình', kem: { anh: [], tep: [] } });
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('model: /model hiện các bí danh; chọn thì đổi cho việc mới và phiên đang chat; việc mới giao với model đó', async () => {
  const { bot, ql, goi, daGui, daSua, goc } = dung();
  try {
    bot.chu = { id: 42, chatId: 42, ten: '@chu', cheDo: 'auto' };
    ql.ds.set('vp_a', { id: 'vp_a', ten: 'Sửa lỗi đăng nhập', trangThai: 'xong', moHinh: 'claude-opus-5-5' });
    bot.dangChat = 'vp_a';
    await bot.xuLy(tin(42, '/model'));
    const t = daGui.at(-1);
    assert.match(t.text, /Model cho việc mới: Mặc định \(Opus 5\.5\)\./);
    assert.match(t.text, /Phiên đang chat “Sửa lỗi đăng nhập”: Opus 5\.5\./);
    const nut = t.reply_markup.inline_keyboard.flat();
    assert.deepEqual(nut.map((n) => n.text), ['● Mặc định (Opus 5.5)', 'Opus 5.5', 'Sonnet 5.5']);
    assert.deepEqual(nut.map((n) => n.callback_data), ['o|vp_a|default', 'o|vp_a|opus', 'o|vp_a|sonnet']);
    await bot.xuLy(nutBam(42, 'o|vp_a|sonnet'));
    assert.equal(bot.chu.moHinh, 'sonnet');
    assert.deepEqual(goi.doiMoHinh, [{ id: 'vp_a', mh: 'sonnet' }]);
    assert.match(daSua.at(-1).text, /Model cho việc mới: Sonnet 5\.5\.\nPhiên “Sửa lỗi đăng nhập” cũng chuyển sang model này\./);
    await bot.xuLy(nutBam(42, 'o||--dangerously-skip-permissions'));
    assert.equal(bot.chu.moHinh, 'sonnet', 'giá trị lạ thì bỏ qua');
    await bot.xuLy(tin(42, '/moi'));
    await bot.xuLy(tin(42, 'viết bài kiểm cho giỏ hàng'));
    await bot.xuLy(nutBam(42, 'p||0'));
    assert.equal(goi.tao.at(-1).moHinh, 'sonnet');
    const luu = JSON.parse(fs.readFileSync(path.join(goc, 'telegram.json'), 'utf8'));
    assert.equal(luu.moHinh, 'sonnet');
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('effort: /effort hiện các mức theo model; chọn thì đổi cho việc mới và phiên đang chat; model không có effort thì báo', async () => {
  const { bot, ql, goi, daGui, daSua, goc } = dung();
  try {
    bot.chu = { id: 42, chatId: 42, ten: '@chu', cheDo: 'auto' };
    ql.ds.set('vp_a', { id: 'vp_a', ten: 'Sửa lỗi đăng nhập', trangThai: 'xong', moHinh: 'claude-sonnet-5-5', effort: '' });
    bot.dangChat = 'vp_a';
    await bot.xuLy(tin(42, '/effort'));
    const t = daGui.at(-1);
    assert.match(t.text, /Effort cho việc mới: Mặc định \(medium\)\./);
    assert.match(t.text, /Phiên đang chat “Sửa lỗi đăng nhập”: Mặc định \(medium\)\./);
    const nut = t.reply_markup.inline_keyboard.flat();
    assert.deepEqual(nut.map((n) => n.callback_data), ['e|vp_a|default', 'e|vp_a|low', 'e|vp_a|medium', 'e|vp_a|high', 'e|vp_a|max'], 'Sonnet 5.5 (giả) không có xhigh');
    assert.equal(nut[0].text, '● Mặc định (medium)');
    await bot.xuLy(nutBam(42, 'e|vp_a|high'));
    assert.equal(bot.chu.effort, 'high');
    assert.deepEqual(goi.doiEffort, [{ id: 'vp_a', ef: 'high' }]);
    assert.match(daSua.at(-1).text, /Effort cho việc mới: Cao \(high\)\.\nPhiên “Sửa lỗi đăng nhập” cũng chuyển sang mức này\./);
    await bot.xuLy(nutBam(42, 'e||ultra'));
    assert.equal(bot.chu.effort, 'high', 'mức lạ thì bỏ qua');
    await bot.xuLy(tin(42, '/moi'));
    await bot.xuLy(tin(42, 'viết bài kiểm cho giỏ hàng'));
    await bot.xuLy(nutBam(42, 'p||0'));
    assert.equal(goi.tao.at(-1).effort, 'high');
    assert.equal(JSON.parse(fs.readFileSync(path.join(goc, 'telegram.json'), 'utf8')).effort, 'high');
    ql.ds.set('vp_b', { id: 'vp_b', ten: 'Hỏi nhanh', trangThai: 'xong', moHinh: 'claude-haiku-4-5-20251001' });
    bot.dangChat = 'vp_b';
    await bot.xuLy(tin(42, '/effort'));
    assert.match(daGui.at(-1).text, /Model Haiku 4\.5 không có mức effort/);
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('giao việc: nhắn việc → chọn dự án bằng nút → văn phòng tạo phiên ở chế độ đã chọn', async () => {
  const { bot, goi, daGui, goc } = dung();
  try {
    bot.chu = { id: 42, chatId: 42, ten: '@chu', cheDo: 'auto' };
    await bot.xuLy(tin(42, 'sửa lỗi nút đăng nhập'));
    assert.match(daGui.at(-1).text, /Giao cho dự án nào/);
    assert.equal(daGui.at(-1).reply_markup.inline_keyboard[0][0].callback_data, 'p||0');
    await bot.xuLy(nutBam(42, 'p||0'));
    assert.deepEqual(goi.tao[0], { cwd: '~/Projects/cua-hang', loiNhan: 'sửa lỗi nút đăng nhập', cheDo: 'auto', moHinh: '', effort: '', anh: [], tep: [] });
    assert.equal(bot.dangChat, 'vp_moi');
    // Tin tiếp theo đi thẳng vào phiên đang chat.
    bot.ql.ds.set('vp_moi', { id: 'vp_moi', ten: 'Sửa lỗi' });
    await bot.xuLy(tin(42, 'nhớ chạy test'));
    assert.deepEqual(goi.gui[0], { id: 'vp_moi', chu: 'nhớ chạy test', kem: { anh: [], tep: [] } });
    // Người lạ bấm nút: bỏ qua.
    await bot.xuLy(nutBam(7, 'p||0'));
    assert.equal(goi.tao.length, 1);
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('xin quyền: bot gửi tin có nút; bấm Cho phép thì văn phòng nhận đúng lời đáp và tin được sửa lại', async () => {
  const { bot, ql, goi, daGui, daSua, goc } = dung();
  try {
    bot.chu = { id: 42, chatId: 42, ten: '@chu', cheDo: 'default' };
    ql.su.emit('duyet', { phien: { id: 'vp_a', ten: 'Sửa lỗi', duAn: 'cua-hang' }, duyet: { ma: 'ma-1', loai: 'quyen', chu: 'Cho phép chạy: npm test', chiTiet: 'npm test', coLuon: false } });
    await new Promise((r) => setTimeout(r, 10));
    assert.match(daGui.at(-1).text, /Cho phép chạy: npm test/);
    const tinId = 100 + daGui.length;
    await bot.xuLy(nutBam(42, 'q|ma-1|y'));
    assert.deepEqual(goi.traLoi[0], { id: 'vp_a', ma: 'ma-1', choPhep: true, luon: false });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(daSua.at(-1).message_id, tinId);
    assert.match(daSua.at(-1).text, /✓ Cho phép/);
    // Lời hỏi đã hết (trả lời trên web rồi): bấm nữa thì chỉ báo, không trả lời lần hai.
    await bot.xuLy(nutBam(42, 'q|ma-khac|y'));
    assert.equal(goi.traLoi.length, 1);
  } finally {
    fs.rmSync(goc, { recursive: true, force: true });
  }
});
