import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dungLoiDap, locGoiY, HangDoi, QuanLyPhienVP, giaiThichLoi } from '../lib/phien-vp.js';

test('luôn cho phép: chỉ trong phiên này, không lọt chế độ bỏ qua quyền', () => {
  const goiY = [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'localSettings' },
    { type: 'addRules', rules: [{ toolName: 'Bash' }], behavior: 'deny', destination: 'session' },
    { type: 'setMode', mode: 'bypassPermissions', destination: 'session' },
    { type: 'setMode', mode: 'acceptEdits', destination: 'userSettings' },
    { type: 'replaceRules', rules: [], behavior: 'allow', destination: 'session' },
    { type: 'removeRules', rules: [{ toolName: 'Bash' }], behavior: 'deny', destination: 'session' },
    { type: 'addDirectories', directories: ['/tmp/x'], destination: 'projectSettings' },
    null,
  ];
  const ra = locGoiY(goiY);
  assert.deepEqual(ra, [
    { type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'session' },
    { type: 'setMode', mode: 'acceptEdits', destination: 'session' },
    { type: 'addDirectories', directories: ['/tmp/x'], destination: 'session' },
  ]);
  assert.ok(ra.every((g) => g.destination === 'session'));
  assert.deepEqual(locGoiY('rác'), []);
});

test('lời đáp cho quyền thường', () => {
  const cho = { ten: 'Bash', input: { command: 'npm test' }, goiY: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm test' }], behavior: 'allow', destination: 'localSettings' }] };
  assert.deepEqual(dungLoiDap(cho, { choPhep: true }), { behavior: 'allow', updatedInput: { command: 'npm test' } });
  const luon = dungLoiDap(cho, { choPhep: true, luon: true });
  assert.equal(luon.updatedPermissions[0].destination, 'session');
  const tu = dungLoiDap(cho, { choPhep: false, loiNhan: 'đừng chạy' });
  assert.deepEqual(tu, { behavior: 'deny', message: 'đừng chạy' });
  assert.equal(dungLoiDap(cho, { choPhep: false }).behavior, 'deny');
});

test('lời đáp cho câu hỏi AskUserQuestion', () => {
  const cho = { ten: 'AskUserQuestion', input: { questions: [{ question: 'Dùng thư viện nào?', options: [{ label: 'A' }, { label: 'B' }] }] }, goiY: [] };
  const ok = dungLoiDap(cho, { choPhep: true, answers: { 'Dùng thư viện nào?': 'B', rỗng: '  ', so: 5 } });
  assert.equal(ok.behavior, 'allow');
  assert.deepEqual(ok.updatedInput.answers, { 'Dùng thư viện nào?': 'B' });
  assert.deepEqual(ok.updatedInput.questions, cho.input.questions);
  assert.equal(dungLoiDap(cho, { choPhep: true, answers: {} }).behavior, 'deny');
  assert.equal(dungLoiDap(cho, { choPhep: true, answers: null }).behavior, 'deny');
  assert.equal(dungLoiDap(cho, { choPhep: false, answers: { x: 'y' } }).behavior, 'deny');
});

test('lời đáp cho kế hoạch ExitPlanMode', () => {
  const cho = { ten: 'ExitPlanMode', input: { plan: '1. làm A' }, goiY: [] };
  const ok = dungLoiDap(cho, { choPhep: true, cheDoSau: 'acceptEdits' });
  assert.deepEqual(ok.updatedPermissions, [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }]);
  assert.equal(dungLoiDap(cho, { choPhep: true, cheDoSau: 'bypassPermissions' }).updatedPermissions[0].mode, 'default');
  const sua = dungLoiDap(cho, { choPhep: false, loiNhan: 'thêm bước kiểm' });
  assert.deepEqual(sua, { behavior: 'deny', message: 'thêm bước kiểm' });
});

test('hàng đợi tin nhắn trả theo thứ tự rồi kết thúc', async () => {
  const h = new HangDoi();
  h.day(1);
  const it = h[Symbol.asyncIterator]();
  assert.deepEqual(await it.next(), { value: 1, done: false });
  const sau = it.next();
  h.day(2);
  assert.deepEqual(await sau, { value: 2, done: false });
  const cuoi = it.next();
  h.ket();
  assert.deepEqual(await cuoi, { value: undefined, done: true });
  h.day(3);
  assert.deepEqual(await it.next(), { value: undefined, done: true });
});

// Claude giả: mỗi tin của người dùng thì xin chạy một lệnh, chờ trả lời, rồi báo xong lượt.
function claudeGia(ghi) {
  return ({ prompt, options }) => {
    ghi.options = options;
    const ds = [];
    let cho = null;
    const day = (m) => (cho ? (cho(m), (cho = null)) : ds.push(m));
    let xong = false;
    (async () => {
      day({ type: 'system', subtype: 'init', session_id: 'ma-phien-1', model: 'claude-opus-5-5', permissionMode: options.permissionMode });
      for await (const tin of prompt) {
        ghi.tin = (ghi.tin || []).concat(tin.message.content);
        day({ type: 'assistant', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'Để mình chạy thử.' }, { type: 'tool_use', name: 'Bash', input: { command: 'npm test' } }] } });
        const ac = new AbortController();
        const dap = await options.canUseTool('Bash', { command: 'npm test' }, { signal: ac.signal, suggestions: [{ type: 'setMode', mode: 'bypassPermissions', destination: 'session' }] });
        ghi.dap = (ghi.dap || []).concat([dap]);
        day({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed', rateLimitType: 'five_hour', utilization: 0.42, resetsAt: Math.floor(Date.now() / 1000) + 3600 } });
        day({ type: 'result', subtype: 'success', is_error: false, result: 'Đã chạy xong bài kiểm.' });
      }
      xong = true;
      day(null);
    })();
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const m = ds.length ? ds.shift() : await new Promise((r) => (cho = r));
          if (m === null) return;
          yield m;
        }
      },
      interrupt: async () => {},
      close: () => {},
      setPermissionMode: async (che) => (ghi.datLai = che),
      get xong() {
        return xong;
      },
    };
  };
}

const doi = (dk, ms = 2000) =>
  new Promise((xong, hong) => {
    const bd = Date.now();
    const lap = () => (dk() ? xong() : Date.now() - bd > ms ? hong(new Error('quá giờ')) : setTimeout(lap, 5));
    lap();
  });

test('phiên văn phòng: giao việc, xin quyền, cho phép, xong lượt, nhắn tiếp', async () => {
  const goc = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-pv-')));
  const duAn = path.join(goc, 'du-an');
  fs.mkdirSync(duAn);
  const ghi = {};
  let soLanDoi = 0;
  process.env.VPC_THU_BIEN = 'giu-nguyen';
  const ql = new QuanLyPhienVP({ khiDoi: () => soLanDoi++, tepLuu: path.join(goc, 'phien.json'), query: claudeGia(ghi), nha: goc });
  try {
    await assert.rejects(ql.tao({ cwd: duAn, loiNhan: 'chạy bài kiểm', cheDo: 'bypassPermissions' }));
    const id = await ql.tao({ cwd: duAn, loiNhan: 'chạy bài kiểm', cheDo: 'default' });
    assert.equal(ghi.options.permissionMode, 'default');
    assert.equal(ghi.options.allowDangerouslySkipPermissions, false);
    assert.equal(ghi.options.cwd, duAn);
    // Môi trường giữ nguyên để Claude Code tự lo đăng nhập (gói Pro/Max hay API key); chỉ thêm PATH.
    assert.equal(ghi.options.env.VPC_THU_BIEN, 'giu-nguyen');
    assert.ok(ghi.options.env.PATH.startsWith(path.dirname(process.execPath)));
    assert.equal(ghi.options.systemPrompt.preset, 'claude_code');

    await doi(() => ql.ds.get(id).duyet && ql.hoiThoai(id).ds.some((m) => m.loai === 'congCu'));
    let [p] = ql.anh();
    assert.equal(p.trangThai, 'cho');
    assert.equal(p.vanPhong, true);
    assert.equal(p.duyet.loai, 'quyen');
    assert.match(p.duyet.chu, /npm test/);
    assert.equal(p.duyet.coLuon, false, 'gợi ý bỏ qua quyền bị lọc nên không có nút luôn cho phép');
    assert.equal(ql.maPhienCuaVanPhong().has('ma-phien-1'), true);

    assert.throws(() => ql.traLoi(id, { ma: 'sai-ma', choPhep: true }), /đã được trả lời/);
    ql.traLoi(id, { ma: p.duyet.ma, choPhep: true, luon: true });
    await doi(() => ghi.dap);
    assert.deepEqual(ghi.dap[0], { behavior: 'allow', updatedInput: { command: 'npm test' } });
    await doi(() => ql.ds.get(id).trangThai === 'xong');
    [p] = ql.anh();
    assert.equal(p.tomTat, 'Đã chạy xong bài kiểm.');
    assert.equal(ql.mucDung.five_hour.utilization, 0.42);

    const ht = ql.hoiThoai(id);
    assert.deepEqual(
      ht.ds.map((m) => m.loai),
      ['ban', 'claude', 'congCu', 'traLoi'],
    );
    assert.equal(ql.hoiThoai(id, 2).ds.length, 2);

    // Nhắn tiếp vào phiên đang mở: vào đúng hàng đợi, không mở tiến trình mới.
    const opts = ghi.options;
    await ql.gui(id, 'thêm một lần nữa');
    await doi(() => ql.ds.get(id).duyet);
    assert.equal(ghi.options, opts);
    ql.traLoi(id, { ma: ql.ds.get(id).duyet.ma, choPhep: false, loiNhan: 'thôi' });
    await doi(() => ghi.dap.length === 2);
    assert.deepEqual(ghi.dap[1], { behavior: 'deny', message: 'thôi' });
    assert.deepEqual(ghi.tin, ['chạy bài kiểm', 'thêm một lần nữa']);
    await doi(() => ql.ds.get(id).trangThai === 'xong');

    // Lưu danh sách để mở lại sau khi máy chủ khởi động lại (không lưu hội thoại).
    await doi(() => fs.existsSync(path.join(goc, 'phien.json')));
    await new Promise((r) => setTimeout(r, 350));
    const luu = JSON.parse(fs.readFileSync(path.join(goc, 'phien.json'), 'utf8'));
    assert.equal(luu[0].maPhien, 'ma-phien-1');
    assert.equal(luu[0].cheDo, 'default');
    assert.equal(luu[0].hoiThoai, undefined);
    assert.ok(soLanDoi > 0);

    ql.dong(id, true);
    assert.equal(ql.anh().length, 0);
    await assert.rejects(ql.gui(id, 'còn đó không'), /Không có phiên này/);
  } finally {
    ql.tatHet();
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('phiên bị đổi sang chế độ bỏ qua quyền thì kéo về chế độ hỏi trước', async () => {
  const goc = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-pv-')));
  const duAn = path.join(goc, 'du-an');
  fs.mkdirSync(duAn);
  const ghi = {};
  const gia = claudeGia(ghi);
  const ql = new QuanLyPhienVP({
    tepLuu: path.join(goc, 'phien.json'),
    nha: goc,
    query: (a) => {
      const q = gia(a);
      const goc2 = q[Symbol.asyncIterator].bind(q);
      q[Symbol.asyncIterator] = async function* () {
        yield { type: 'system', subtype: 'status', status: null, permissionMode: 'bypassPermissions' };
        yield* goc2();
      };
      return q;
    },
  });
  try {
    const id = await ql.tao({ cwd: duAn, loiNhan: 'xin chào', cheDo: 'plan' });
    await doi(() => ghi.datLai);
    assert.equal(ghi.datLai, 'default');
    assert.equal(ql.ds.get(id).cheDo, 'default');
  } finally {
    ql.tatHet();
    fs.rmSync(goc, { recursive: true, force: true });
  }
});

test('lỗi tài khoản nói rõ cách đăng nhập lại bằng gói Claude', () => {
  const khoa = giaiThichLoi('invalid_request', 'API Error: 400 This organization has been disabled.', { toChuc: 'Cong Ty A' });
  assert.match(khoa, /tổ chức "Cong Ty A" đã bị Anthropic khoá/);
  assert.match(khoa, /\/login/);
  assert.match(giaiThichLoi('authentication_failed', ''), /chưa đăng nhập/);
  assert.match(giaiThichLoi('rate_limit', 'You have hit your limit'), /giới hạn/);
  assert.equal(giaiThichLoi('', 'Lỗi lạ'), 'Lỗi lạ');
  assert.equal(giaiThichLoi('unknown', ''), 'Lỗi: unknown');
});


test('duyệt kế hoạch rồi chuyển sang chế độ Tự động; đổi chế độ phiên đang chạy', async () => {
  const cho = { ten: 'ExitPlanMode', input: { plan: 'x' }, goiY: [] };
  assert.equal(dungLoiDap(cho, { choPhep: true, cheDoSau: 'auto' }).updatedPermissions[0].mode, 'auto');
  assert.deepEqual(locGoiY([{ type: 'setMode', mode: 'auto', destination: 'userSettings' }]), [{ type: 'setMode', mode: 'auto', destination: 'session' }]);
  const goc = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-pv-')));
  fs.mkdirSync(path.join(goc, 'du-an'));
  const ghi = {};
  const ql = new QuanLyPhienVP({ tepLuu: path.join(goc, 'phien.json'), nha: goc, query: claudeGia(ghi) });
  try {
    const id = await ql.tao({ cwd: path.join(goc, 'du-an'), loiNhan: 'xin chào', cheDo: 'acceptEdits' });
    await ql.doiCheDo(id, 'auto');
    assert.equal(ghi.datLai, 'auto');
    assert.equal(ql.ds.get(id).cheDo, 'auto');
    await assert.rejects(ql.doiCheDo(id, 'bypassPermissions'));
    assert.equal(ql.ds.get(id).cheDo, 'auto');
  } finally {
    ql.tatHet();
    fs.rmSync(goc, { recursive: true, force: true });
  }
});
