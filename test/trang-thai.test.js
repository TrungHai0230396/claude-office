import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suyTrangThai, viecCua } from '../lib/trang-thai.js';
import { tomDuoi, giayUTC, phanTichPs, soConSong } from '../lib/doc-phien.js';

const BAY = Date.parse('2026-10-22T09:00:00Z');
const luc = (giay) => new Date(BAY - giay * 1000).toISOString();

// Dựng nhật ký giả: mỗi phần tử là một dòng JSONL đã parse.
const nguoi = (chu, giay, them = {}) => ({ type: 'user', uuid: 'u' + giay, timestamp: luc(giay), message: { role: 'user', content: chu }, ...them });
const ketQua = (id, giay) => ({ type: 'user', uuid: 'r' + giay, timestamp: luc(giay), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const goi = (id, ten, input, giay, maTin = 'm' + giay) => ({ type: 'assistant', uuid: 'a' + giay, timestamp: luc(giay), message: { id: maTin, role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: ten, input }] } });
const traLoi = (chu, giay, uuid = 'a' + giay) => ({ type: 'assistant', uuid, timestamp: luc(giay), message: { id: 'm' + giay, role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: chu }] } });
const dungMoc = (giay) => ({ type: 'system', subtype: 'stop_hook_summary', timestamp: luc(giay) });

test('đuôi nhật ký: công cụ chưa có kết quả là đang chờ', () => {
  const k = tomDuoi([nguoi('chạy test giúp mình', 30), goi('t1', 'Bash', { command: 'npm test', description: 'Chạy bài kiểm' }, 20)]);
  assert.equal(k.ketThuc, false);
  assert.deepEqual(k.choCongCu.map((c) => c.ten), ['Bash']);
  assert.equal(k.yeuCau, 'chạy test giúp mình');
});

test('đuôi nhật ký: trả lời end_turn rồi móc dừng là lượt đã xong', () => {
  const k = tomDuoi([nguoi('sửa lỗi', 60), goi('t1', 'Edit', { file_path: '/a/b.js' }, 50), ketQua('t1', 49), traLoi('Đã sửa xong.', 40, 'cuoi'), dungMoc(38)]);
  assert.equal(k.ketThuc, true);
  assert.equal(k.troLyCuoiUuid, 'cuoi');
  assert.equal(k.choCongCu.length, 0);
  assert.equal(k.lucKetThuc, Date.parse(luc(38)));
});

test('đuôi nhật ký: nhắc hệ thống xếp hàng sau lượt không mở lượt mới', () => {
  const k = tomDuoi([
    nguoi('xong chưa', 60),
    traLoi('Xong rồi.', 50),
    dungMoc(49),
    { type: 'queue-operation', operation: 'enqueue', timestamp: luc(48), content: '<system-reminder>đổi thư mục' },
    { type: 'queue-operation', operation: 'dequeue', timestamp: luc(48) },
    nguoi('<system-reminder>đổi thư mục</system-reminder>', 47, { isMeta: true }),
  ]);
  assert.equal(k.ketThuc, true);
});

test('đuôi nhật ký: gọi công cụ sau end_turn (móc dừng bắt làm tiếp) thì lượt chưa xong', () => {
  const k = tomDuoi([nguoi('làm đi', 60), traLoi('Xong.', 50), dungMoc(49), goi('t2', 'Bash', { command: 'ls' }, 45)]);
  assert.equal(k.ketThuc, false);
  assert.equal(k.choCongCu[0].ten, 'Bash');
});

test('đuôi nhật ký: bị ngắt, lỗi API, lời tóm tắt wrap_up', () => {
  const ngat = tomDuoi([nguoi('làm đi', 60), goi('t1', 'Bash', { command: 'sleep 99' }, 50), nguoi([{ type: 'text', text: '[Request interrupted by user for tool use]' }], 40)]);
  assert.equal(ngat.ngat, true);
  assert.equal(ngat.choCongCu.length, 0);
  const api = tomDuoi([nguoi('làm đi', 60), { ...traLoi('API Error: overloaded', 50), isApiErrorMessage: true, error: 'server_error' }]);
  assert.equal(api.loiApi.loai, 'server_error');
  const wu = tomDuoi([nguoi('làm đi', 60), goi('w', 'mcp__ccd_turn__wrap_up', { recap: 'Đã xong phần 1.', ask: 'Deploy luôn nhé?', blocked: true }, 50), ketQua('w', 49), traLoi('…', 48), dungMoc(47)]);
  assert.equal(wu.wrapUp.ask, 'Deploy luôn nhé?');
  assert.equal(wu.ketThuc, true);
});

test('chờ duyệt: tệp sống báo waiting + công cụ đang chờ', () => {
  const nk = tomDuoi([nguoi('đẩy lên đi', 30), goi('t1', 'Bash', { command: 'git push origin main', description: 'Đẩy lên GitHub' }, 10)]);
  const kq = suyTrangThai({ so: { status: 'waiting', waitingFor: 'permission prompt', statusUpdatedAt: BAY - 9000 }, nk, bayGio: BAY });
  assert.equal(kq.trangThai, 'cho');
  assert.equal(kq.duyet.loai, 'quyen');
  assert.match(kq.duyet.chu, /git push origin main/);
  assert.equal(kq.duyet.tu, BAY - 9000);
});

test('chờ duyệt: hỏi bạn (AskUserQuestion) kèm các lựa chọn', () => {
  const nk = tomDuoi([nguoi('làm giao diện', 30), goi('q', 'AskUserQuestion', { questions: [{ question: 'Đặt nút ở đâu?', options: [{ label: 'Trái' }, { label: 'Phải' }] }] }, 10)]);
  const kq = suyTrangThai({ so: { status: 'waiting', waitingFor: 'input needed', statusUpdatedAt: BAY }, nk, bayGio: BAY });
  assert.equal(kq.duyet.loai, 'hoi');
  assert.equal(kq.duyet.chu, 'Đặt nút ở đâu? (Trái / Phải)');
});

test('chờ duyệt: kế hoạch, đề nghị mở phiên', () => {
  const nk = tomDuoi([nguoi('lên kế hoạch', 30), goi('p', 'ExitPlanMode', { plan: '# Tách bảng\n1. Thêm cột' }, 10)]);
  assert.equal(suyTrangThai({ so: { status: 'waiting', waitingFor: 'permission prompt' }, nk, bayGio: BAY }).duyet.loai, 'keHoach');
  const nk2 = tomDuoi([nguoi('làm tiếp', 30), goi('s', 'mcp__ccd_session__start_session', { initiation: 'offer', title: 'Viết bài kiểm' }, 10)]);
  const kq = suyTrangThai({ so: { status: 'busy' }, nk: nk2, bayGio: BAY });
  assert.equal(kq.trangThai, 'cho');
  assert.equal(kq.duyet.loai, 'deNghi');
});

test('đang làm: busy và công cụ đang chạy cho ra việc dễ đọc', () => {
  const nk = tomDuoi([nguoi('sửa', 30), goi('e', 'Edit', { file_path: '/x/app.js' }, 2)]);
  const kq = suyTrangThai({ so: { status: 'busy' }, nk, bayGio: BAY });
  assert.equal(kq.trangThai, 'lam');
  assert.equal(kq.viec.loai, 'go');
  assert.equal(kq.viec.chu, 'Đang sửa app.js');
  assert.equal(suyTrangThai({ so: { status: 'busy' }, nk: tomDuoi([nguoi('nghĩ đi', 3)]), bayGio: BAY }).viec.loai, 'nghi');
  assert.equal(viecCua({ ten: 'mcp__Claude_Browser__computer', input: {} }).loai, 'trinhDuyet');
});

test('busy nhưng lượt đã xong: đang chờ trợ lý chạy nền', () => {
  const nk = tomDuoi([nguoi('làm', 60), traLoi('Đã giao cho trợ lý.', 50), dungMoc(49)]);
  const kq = suyTrangThai({ so: { status: 'busy' }, nk, bayGio: BAY });
  assert.equal(kq.trangThai, 'lam');
  assert.equal(kq.viec.loai, 'giaoViec');
});

test('không còn tiến trình mà lượt dở dang: mới ghi thì đang làm, lâu rồi thì đã dừng', () => {
  const nk = { ...tomDuoi([nguoi('làm', 60), goi('t', 'Bash', { command: 'ls' }, 50)]) };
  assert.equal(suyTrangThai({ nk: { ...nk, mtimeMs: BAY - 5000 }, bayGio: BAY }).trangThai, 'lam');
  const dung = suyTrangThai({ nk: { ...nk, mtimeMs: BAY - 600e3 }, meta: { interruptedByQuitAt: 1, interruptedAwaitingPerson: true }, bayGio: BAY });
  assert.equal(dung.trangThai, 'dung');
  assert.match(dung.lyDo, /Tắt app/);
});

test('lượt xong: tóm tắt blocked thành chờ quyết, review_ready thành nộp bài, completed thành xong', () => {
  const nk = tomDuoi([nguoi('làm', 60), traLoi('Có push không?', 50, 'cuoi'), dungMoc(49)]);
  const meta = (cat, them = {}) => ({ postTurnSummary: { status_category: cat, status_detail: 'chi tiết', needs_action: 'Push lên nhé?', summarizes_uuid: 'cuoi', ...them } });
  assert.deepEqual(suyTrangThai({ meta: meta('blocked'), nk, bayGio: BAY }).duyet.loai, 'quyetDinh');
  assert.equal(suyTrangThai({ meta: meta('blocked'), nk, bayGio: BAY }).duyet.chu, 'Push lên nhé?');
  assert.equal(suyTrangThai({ meta: meta('review_ready'), nk, bayGio: BAY }).duyet.loai, 'xemLai');
  assert.equal(suyTrangThai({ meta: meta('failed'), nk, bayGio: BAY }).trangThai, 'loi');
  const xong = suyTrangThai({ meta: meta('completed'), nk, bayGio: BAY });
  assert.equal(xong.trangThai, 'xong');
  assert.equal(xong.tomTat, 'chi tiết');
});

test('tóm tắt của lượt trước (khác uuid) không được dùng; vừa xong lượt thì giữ trạng thái cũ', () => {
  const nk = tomDuoi([nguoi('làm', 10), traLoi('Đã xong.', 6, 'moi'), dungMoc(5)]);
  const meta = { postTurnSummary: { status_category: 'blocked', needs_action: 'cũ', summarizes_uuid: 'cu' } };
  assert.equal(suyTrangThai({ meta, nk, bayGio: BAY }).giu, true);
  assert.equal(suyTrangThai({ meta, nk, bayGio: BAY + 30e3 }).trangThai, 'xong');
});

test('không có tóm tắt mà câu cuối là câu hỏi thì coi như chờ bạn trả lời', () => {
  const nk = tomDuoi([nguoi('làm', 120), traLoi('Đã sửa xong phần 1. Bạn muốn làm tiếp phần 2 luôn không?', 100), dungMoc(99)]);
  const kq = suyTrangThai({ nk, bayGio: BAY });
  assert.equal(kq.trangThai, 'cho');
  assert.equal(kq.duyet.chu, 'Bạn muốn làm tiếp phần 2 luôn không?');
});

test('lỗi: phiên không khởi động được, lỗi của app, ngắt giữa chừng', () => {
  assert.equal(suyTrangThai({ meta: { pendingFirstStart: { since: 1 }, error: 'Not enough free disk space', errorCategory: 'disk_full' }, bayGio: BAY }).loi.loai, 'disk_full');
  const nk = tomDuoi([nguoi('làm', 60), traLoi('…', 50), dungMoc(49)]);
  assert.equal(suyTrangThai({ meta: { error: "You've hit your session limit", errorAt: BAY - 3600e3 }, nk, bayGio: BAY }).trangThai, 'loi');
  // Lỗi quá 7 ngày thì thôi.
  assert.equal(suyTrangThai({ meta: { error: 'cũ', errorAt: BAY - 8 * 86400e3 }, nk, bayGio: BAY + 30e3 }).trangThai, 'xong');
});

test('tệp trạng thái sống: chỉ tin khi pid còn và bắt đầu đúng procStart', () => {
  assert.equal(giayUTC('Wed Oct 21 08:43:30 2026'), Date.UTC(2026, 9, 21, 8, 43, 30));
  const tt = phanTichPs('62806     1 Wed Oct 21 15:43:30 2026 /path/claude --output-format stream-json --resume=11111111-2222-4333-8444-555555555555\n');
  const p = tt.theoPid.get(62806);
  assert.ok(p);
  assert.equal(tt.cli.get('11111111-2222-4333-8444-555555555555'), p);
  // Đúng giờ bắt đầu (lstart theo giờ máy) thì sống; lệch (pid bị dùng lại) thì bỏ.
  const so = { pid: 62806, procStart: new Date(p.batDau).toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) (\S+) GMT$/, (_, d, n, m, y, h) => `${d} ${m} ${n} ${h} ${y}`) };
  assert.equal(soConSong(so, tt), true);
  assert.equal(soConSong({ ...so, procStart: 'Wed Oct 21 01:00:00 2026' }, tt), false);
  assert.equal(soConSong({ pid: 999, procStart: so.procStart }, tt), false);
});
