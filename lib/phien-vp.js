// Phiên của văn phòng: Claude Code chạy qua Claude Agent SDK (bộ công cụ chính thức của Anthropic), do
// chính máy chủ này điều khiển, nên giao việc, nhắn tin, cho phép, trả lời câu hỏi, duyệt kế hoạch,
// dừng đều làm ngay trên trang. Phiên trong app Claude desktop vẫn chỉ xem và mở trong app.
//
// Mỗi phiên là một query() ở chế độ nhập luồng (nhiều lượt): tin của bạn đẩy vào hàng đợi; Claude
// muốn dùng công cụ cần quyền thì SDK gọi canUseTool, máy chủ giữ lời hỏi lại cho tới khi bạn bấm.
// Không bao giờ chạy chế độ bỏ qua quyền: chỉ default, acceptEdits, plan (xem lib/bao-ve.js).
// Phiên chạy bằng chính đăng nhập Claude Code của bạn (gói Pro/Max hay API key, tuỳ bạn đã đăng nhập gì):
// SDK chạy bản Claude Code nguyên gốc của Anthropic; văn phòng không đọc, giữ hay chuyển token đăng nhập.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { viecCua, xinQuyen, rutGon } from './trang-thai.js';
import { kiemThuMuc, kiemTin, kiemCheDo, kiemMoHinh, kiemEffort, MUC_EFFORT, LoiNguoiDung, CHE_DO_CHO_PHEP } from './bao-ve.js';
import { timNhatKy, docDuoiTho } from './doc-phien.js';
import { kiemDinhKem, luuTep } from './dinh-kem.js';

const NHA = os.homedir();
export const TEP_LUU = process.env.VPC_PHIEN_VP || path.join(NHA, 'Library/Application Support/ClaudeOffice/phien-van-phong.json');
const TOI_DA_MUC = 400;
const DONG_SAU = 30 * 60e3;

// Hàng đợi tin nhắn cho chế độ nhập luồng của SDK (AsyncIterable<SDKUserMessage>).
export class HangDoi {
  constructor() {
    this.ds = [];
    this.cho = null;
    this.dong = false;
  }
  day(x) {
    if (this.dong) return;
    if (this.cho) {
      const c = this.cho;
      this.cho = null;
      c({ value: x, done: false });
    } else this.ds.push(x);
  }
  ket() {
    this.dong = true;
    if (this.cho) {
      const c = this.cho;
      this.cho = null;
      c({ value: undefined, done: true });
    }
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        if (this.ds.length) return Promise.resolve({ value: this.ds.shift(), done: false });
        if (this.dong) return Promise.resolve({ value: undefined, done: true });
        return new Promise((r) => (this.cho = r));
      },
    };
  }
}

// Tin của bạn gửi cho Claude; có ảnh thì thành các khối ảnh đứng trước chữ (Claude xem được ảnh).
export function tinNguoiDung(chu, anh = []) {
  if (!anh.length) return { type: 'user', message: { role: 'user', content: chu }, parent_tool_use_id: null };
  const khoi = anh.map((a) => ({ type: 'image', source: { type: 'base64', media_type: a.loai, data: a.du } }));
  return { type: 'user', message: { role: 'user', content: [...khoi, { type: 'text', text: chu }] }, parent_tool_use_id: null };
}

// "Luôn cho phép" chỉ có hiệu lực trong phiên này: mọi gợi ý bị ép về đích 'session' (không ghi tệp cài
// đặt nào), chỉ giữ loại thêm luật cho phép / thêm thư mục / đổi sang chế độ an toàn. Không bao giờ để lọt
// chế độ bỏ qua quyền (bypassPermissions, dontAsk) hay luật xoá, thay luật.
export function locGoiY(goiY) {
  if (!Array.isArray(goiY)) return [];
  const ra = [];
  for (const g of goiY) {
    if (!g || typeof g !== 'object') continue;
    if (g.type === 'addRules' && g.behavior === 'allow' && Array.isArray(g.rules)) ra.push({ type: 'addRules', rules: g.rules, behavior: 'allow', destination: 'session' });
    else if (g.type === 'addDirectories' && Array.isArray(g.directories)) ra.push({ type: 'addDirectories', directories: g.directories, destination: 'session' });
    else if (g.type === 'setMode' && CHE_DO_CHO_PHEP.includes(g.mode)) ra.push({ type: 'setMode', mode: g.mode, destination: 'session' });
  }
  return ra;
}

// Lời đáp gửi lại SDK cho một lời xin quyền, theo cái bạn bấm trên trang (hàm thuần, có bài kiểm).
//   AskUserQuestion: answers = { "câu hỏi": "nhãn đã chọn" } (chọn nhiều thì nối bằng dấu phẩy).
//   ExitPlanMode: choPhep + cheDoSau ('default' hỏi trước khi sửa, 'acceptEdits' tự sửa tệp, 'auto' tự động).
export function dungLoiDap(cho, { choPhep, luon = false, loiNhan = '', answers = null, cheDoSau = 'default' }) {
  const { ten, input, goiY } = cho;
  if (ten === 'AskUserQuestion') {
    const sach = {};
    for (const [k, v] of Object.entries(answers && typeof answers === 'object' ? answers : {})) {
      if (typeof v === 'string' && v.trim()) sach[String(k).slice(0, 2000)] = v.slice(0, 2000);
    }
    if (!choPhep || !Object.keys(sach).length) return { behavior: 'deny', message: loiNhan || 'Người dùng chưa chọn câu trả lời.' };
    return { behavior: 'allow', updatedInput: { ...input, answers: sach } };
  }
  if (ten === 'ExitPlanMode') {
    if (!choPhep) return { behavior: 'deny', message: loiNhan || 'Chưa duyệt kế hoạch. Hãy sửa lại theo góp ý rồi trình lại.' };
    const che = cheDoSau === 'acceptEdits' || cheDoSau === 'auto' ? cheDoSau : 'default';
    return { behavior: 'allow', updatedInput: input, updatedPermissions: [{ type: 'setMode', mode: che, destination: 'session' }] };
  }
  if (!choPhep) return { behavior: 'deny', message: loiNhan || 'Người dùng không cho phép.' };
  const ra = { behavior: 'allow', updatedInput: input };
  const luat = luon ? locGoiY(goiY) : [];
  if (luat.length) ra.updatedPermissions = luat;
  return ra;
}

const TEN_CHE_DO = { default: 'Hỏi trước', acceptEdits: 'Tự sửa tệp', plan: 'Lên kế hoạch trước', auto: 'Tự động' };

// Lỗi của lượt trả lời, nói cho người dùng biết phải làm gì.
const LOI_TRO_LY = {
  oauth_org_not_allowed: 'Tổ chức của tài khoản này không cho dùng Claude Code.',
  account_on_hold: 'Tài khoản đang bị tạm khoá.',
  verification_required: 'Tài khoản cần xác minh trước khi dùng tiếp.',
  billing_error: 'Có vấn đề thanh toán với tài khoản.',
  rate_limit: 'Đã chạm giới hạn sử dụng. Xem giờ mở lại trên đồng hồ góc trên.',
  overloaded: 'Máy chủ Claude đang quá tải, thử lại sau ít phút.',
  model_not_found: 'Không tìm thấy mô hình đã chọn.',
  server_error: 'Máy chủ Claude gặp lỗi, thử lại sau.',
  max_output_tokens: 'Câu trả lời dài quá giới hạn.',
};

const DANG_NHAP_LAI =
  'Muốn dùng gói Claude (Pro/Max) của bạn: mở Terminal, chạy claude, gõ /login, chọn đăng nhập bằng tài khoản Claude có gói, rồi gửi lại.';

// Câu báo lỗi dễ hiểu cho một lượt trả lời lỗi; tk: tài khoản Claude Code đang dùng (nếu đã biết).
export function giaiThichLoi(ma, goc = '', tk = null) {
  if (/organization has been disabled|organization.*(disabled|suspended)/i.test(goc)) {
    const ai = tk?.toChuc ? `tổ chức "${tk.toChuc}"` : 'một tổ chức';
    return `Claude Code trên máy đang đăng nhập vào ${ai} đã bị Anthropic khoá. ${DANG_NHAP_LAI}`;
  }
  if (ma === 'authentication_failed') return 'Claude Code trên máy này chưa đăng nhập hoặc đăng nhập đã hết hạn. ' + DANG_NHAP_LAI;
  if (LOI_TRO_LY[ma]) return LOI_TRO_LY[ma] + (goc && ma !== 'rate_limit' ? ` (${rutGon(goc, 160)})` : '');
  return rutGon(goc, 300) || 'Lỗi: ' + ma;
}

function tenDuAn(cwd) {
  return path.basename(String(cwd || '').replace(/\/\.claude\/worktrees\/.*$/, '')) || 'khác';
}

function rutNha(p) {
  return p && p.startsWith(NHA) ? '~' + p.slice(NHA.length) : p || '';
}

function chuKhoi(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((b) => b?.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export class QuanLyPhienVP {
  // nha: thư mục nhà, giao việc chỉ trong đó; query: thay SDK khi chạy bài kiểm.
  constructor({ khiDoi = () => {}, tepLuu = TEP_LUU, query = null, nha = NHA } = {}) {
    this.ds = new Map();
    this.nha = nha;
    // Báo sự kiện cho nơi khác (bot Telegram): 'duyet' (lời xin mới), 'daTraLoi', 'xongLuot', 'loi'.
    this.su = new EventEmitter();
    // Tệp gửi kèm trong chat lưu ở đây, mỗi phiên một thư mục.
    this.thuMucTep = path.join(path.dirname(tepLuu), 'tep-gui');
    this.khiDoi = khiDoi;
    this.tepLuu = tepLuu;
    this.mucDung = {};
    this._hen = null;
    this._henLuu = null;
    this._query = query;
  }

  async _layQuery() {
    if (!this._query) this._query = (await import('@anthropic-ai/claude-agent-sdk')).query;
    return this._query;
  }

  async napLai() {
    let ds = [];
    try {
      ds = JSON.parse(await fsp.readFile(this.tepLuu, 'utf8'));
    } catch {}
    for (const r of Array.isArray(ds) ? ds : []) {
      if (!r?.id || !r.cwd) continue;
      const p = this._moi(r);
      this.ds.set(p.id, p);
      this._napHoiThoaiCu(p).catch(() => {});
    }
    setInterval(() => this._dongPhienRanh(), 60e3).unref();
  }

  _moi(r) {
    return {
      id: r.id,
      maPhien: r.maPhien || null,
      cwd: r.cwd,
      ten: r.ten || 'Phiên mới',
      cheDo: CHE_DO_CHO_PHEP.includes(r.cheDo) ? r.cheDo : 'default',
      moHinh: r.moHinh || '',
      effort: MUC_EFFORT.includes(r.effort) ? r.effort : '',
      taoLuc: r.taoLuc || Date.now(),
      hoatDongCuoi: r.hoatDongCuoi || Date.now(),
      tomTat: r.tomTat || '',
      luotXong: r.luotXong || 0,
      trangThai: 'xong',
      viec: null,
      duyet: null,
      loi: null,
      yeuCau: r.yeuCau || '',
      hoiThoai: [],
      soMuc: 0,
      phienBan: 0,
      q: null,
      hangDoi: null,
      cho: new Map(),
      vuaDung: false,
      dangDong: false,
      taiKhoan: null,
    };
  }

  // ---------- lệnh từ trang ----------
  // Soạn tin gửi Claude từ chữ và phần đính kèm (đã kiểm): ảnh thành khối ảnh, tệp lưu vào thư mục của phiên
  // rồi ghi đường dẫn vào tin. Trả về { tin, muc (dòng hiện trong khung chat), yeuCau }.
  async _soanTin(p, loiNhan, dk) {
    const coKem = dk.anh.length > 0 || dk.tep.length > 0;
    const chuGoc = coKem && !(typeof loiNhan === 'string' && loiNhan.trim()) ? '' : kiemTin(loiNhan);
    const duong = await luuTep(path.join(this.thuMucTep, p.id), dk.tep);
    let chu = chuGoc || (dk.anh.length ? 'Xem ảnh đính kèm.' : 'Xem tệp đính kèm.');
    if (duong.length) chu += '\n\nTệp đính kèm (đọc bằng công cụ Read):\n' + duong.map((d) => '- ' + d).join('\n');
    const muc = { loai: 'ban', chu: chuGoc };
    if (dk.anh.length) muc.anh = dk.anh.map((a) => a.nho).filter(Boolean);
    if (dk.tep.length) muc.tep = dk.tep.map((t) => t.ten);
    return { tin: tinNguoiDung(chu, dk.anh), muc, yeuCau: chuGoc || (dk.anh.length ? '(ảnh)' : '(tệp)') };
  }

  async tao({ cwd, loiNhan, cheDo, moHinh, effort, anh, tep }) {
    const thuMuc = await kiemThuMuc(cwd, this.nha);
    const che = kiemCheDo(cheDo);
    const mh = kiemMoHinh(moHinh);
    const ef = kiemEffort(effort);
    const dk = kiemDinhKem({ anh, tep });
    if (!dk.anh.length && !dk.tep.length) kiemTin(loiNhan);
    const tieuDe = typeof loiNhan === 'string' && loiNhan.trim() ? loiNhan.trim().split('\n')[0] : dk.anh.length ? 'Ảnh đính kèm' : 'Tệp đính kèm';
    const p = this._moi({ id: 'vp_' + crypto.randomUUID(), cwd: thuMuc, ten: rutGon(tieuDe, 60), cheDo: che, moHinh: mh, effort: ef });
    this.ds.set(p.id, p);
    try {
      await this._batDau(p, await this._soanTin(p, loiNhan, dk));
    } catch (e) {
      this.ds.delete(p.id);
      throw e;
    }
    this._luu();
    return p.id;
  }

  async gui(id, loiNhan, { anh, tep } = {}) {
    const p = this._lay(id);
    const soan = await this._soanTin(p, loiNhan, kiemDinhKem({ anh, tep }));
    if (p.hangDoi && !p.hangDoi.dong) {
      this._them(p, soan.muc);
      p.yeuCau = soan.yeuCau;
      p.loi = null;
      if (!p.cho.size) {
        p.trangThai = 'lam';
        p.viec = { loai: 'nghi', chu: 'Đang đọc tin của bạn', congCu: '', tu: Date.now() };
      }
      p.hangDoi.day(soan.tin);
      this._doi(p);
    } else {
      await kiemThuMuc(p.cwd, this.nha);
      await this._batDau(p, soan);
    }
  }

  traLoi(id, { ma, choPhep, luon, loiNhan, answers, cheDoSau } = {}) {
    const p = this._lay(id);
    const c = p.cho.get(ma);
    if (!c) throw new LoiNguoiDung('Lời hỏi này đã được trả lời hoặc đã huỷ', 409);
    const gopY = typeof loiNhan === 'string' ? loiNhan.trim().slice(0, 4000) : '';
    const dap = dungLoiDap(c, { choPhep: choPhep === true, luon: luon === true, loiNhan: gopY, answers, cheDoSau });
    p.cho.delete(ma);
    let moTa;
    if (c.ten === 'AskUserQuestion') moTa = dap.behavior === 'allow' ? 'Trả lời: ' + Object.values(dap.updatedInput.answers).join(' · ') : 'Bỏ qua câu hỏi' + (gopY ? ': ' + gopY : '');
    else if (c.ten === 'ExitPlanMode') {
      if (dap.behavior === 'allow') {
        p.cheDo = dap.updatedPermissions[0].mode;
        moTa = p.cheDo === 'acceptEdits' ? '✓ Duyệt kế hoạch, cho tự sửa tệp' : '✓ Duyệt kế hoạch, hỏi trước khi sửa tệp';
        this._luu();
      } else moTa = '✗ Chưa duyệt kế hoạch' + (gopY ? ': ' + gopY : '');
    } else moTa = (dap.behavior === 'allow' ? (dap.updatedPermissions ? '✓ Luôn cho phép trong phiên này: ' : '✓ Cho phép: ') : '✗ Từ chối: ') + c.moTa + (dap.behavior === 'deny' && gopY ? ' — ' + gopY : '');
    this._them(p, { loai: 'traLoi', chu: moTa });
    p.duyet = this._duyetDau(p);
    p.trangThai = p.duyet ? 'cho' : 'lam';
    c.resolve(dap);
    this.su.emit('daTraLoi', { phien: this._tom(p), ma, moTa });
    this._doi(p);
  }

  // Đổi chế độ quyền của phiên: đang chạy thì đổi ngay qua SDK, không thì dùng cho lần chạy sau.
  async doiCheDo(id, cheDo) {
    const p = this._lay(id);
    const che = kiemCheDo(cheDo);
    if (p.q?.setPermissionMode) await p.q.setPermissionMode(che);
    p.cheDo = che;
    this._them(p, { loai: 'traLoi', chu: 'Đổi chế độ: ' + (TEN_CHE_DO[che] || che) });
    this._luu();
    this._doi(p);
  }

  // Đổi model của phiên: đang chạy thì đổi ngay qua SDK (từ câu trả lời sau), không thì dùng cho lần chạy sau.
  // '' là quay về mặc định của Claude Code.
  async doiMoHinh(id, moHinh) {
    const p = this._lay(id);
    const mh = kiemMoHinh(moHinh);
    if (p.q?.setModel) await p.q.setModel(mh || undefined);
    p.moHinh = mh;
    this._them(p, { loai: 'traLoi', chu: 'Đổi model: ' + (mh || 'mặc định') });
    this._luu();
    this._doi(p);
  }

  // Đổi effort của phiên: đang chạy thì đổi ngay (từ câu trả lời sau), không thì dùng cho lần chạy sau. '' là
  // quay về mức mặc định của model.
  async doiEffort(id, effort) {
    const p = this._lay(id);
    const ef = kiemEffort(effort);
    if (p.q?.applyFlagSettings) await p.q.applyFlagSettings({ effortLevel: ef || null });
    p.effort = ef;
    this._them(p, { loai: 'traLoi', chu: 'Đổi effort: ' + (ef || 'mặc định') });
    this._luu();
    this._doi(p);
  }

  // Mức effort Claude Code dùng khi bạn không chọn, theo tài liệu Claude Code (code.claude.com/docs/en/model-config,
  // "Adjust effort level"): high cho mọi model có effort, trừ Opus 5.5, Sonnet 5.5, Haiku 5.5 (medium) và Opus 4.7
  // (xhigh). Chỉ để ghi nhãn "Mặc định (…)"; phiên vẫn để Claude Code tự chọn.
  static effortMacDinh(that, muc) {
    if (!muc.length) return '';
    if (/^claude-(opus|sonnet|haiku)-5-5(\b|$)/.test(that)) return 'medium';
    if (/^claude-opus-4-7(\b|$)/.test(that)) return 'xhigh';
    return 'high';
  }

  // Các model tài khoản này dùng được (như /model trong Claude Code). Hỏi Claude Code mà không gửi tin nào
  // (không tốn lượt), nhớ một giờ. Trả về [{ gia, ten, moTa, that }]; gia 'default' là mặc định.
  danhSachMoHinh() {
    if (this.dsMoHinh && Date.now() - this.dsMoHinh.luc < 3600e3) return Promise.resolve(this.dsMoHinh.ds);
    this._hoiMoHinh ??= this._layMoHinh().finally(() => (this._hoiMoHinh = null));
    return this._hoiMoHinh;
  }

  async _layMoHinh() {
    const query = await this._layQuery();
    const hangDoi = new HangDoi();
    const q = query({
      prompt: hangDoi,
      options: {
        cwd: this.nha,
        settingSources: [],
        persistSession: false,
        env: { ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(':'), CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-office/0.2.0' },
      },
    });
    const hen = setTimeout(() => q.close?.(), 30e3);
    try {
      const ds = (await q.supportedModels())
        .filter((m) => typeof m?.value === 'string')
        .map((m) => {
          const effort = m.supportsEffort ? MUC_EFFORT.filter((e) => (m.supportedEffortLevels || []).includes(e)) : [];
          const that = String(m.resolvedModel || '');
          return { gia: m.value, ten: String(m.displayName || m.value), moTa: String(m.description || ''), that, effort, effortMacDinh: QuanLyPhienVP.effortMacDinh(that, effort) };
        });
      this.dsMoHinh = { ds, luc: Date.now() };
      return ds;
    } finally {
      clearTimeout(hen);
      hangDoi.ket();
      q.close?.();
    }
  }

  async dung(id) {
    const p = this._lay(id);
    if (!p.q) return;
    p.vuaDung = true;
    await p.q.interrupt().catch(() => {});
  }

  dong(id, xoa = false) {
    const p = this._lay(id);
    this._tatTienTrinh(p);
    if (xoa) this.ds.delete(id);
    this._luu();
    this._doi(p);
  }

  tatHet() {
    for (const p of this.ds.values()) this._tatTienTrinh(p);
  }

  _lay(id) {
    const p = this.ds.get(id);
    if (!p) throw new LoiNguoiDung('Không có phiên này', 404);
    return p;
  }

  // ---------- chạy phiên ----------
  async _batDau(p, { tin, muc, yeuCau }) {
    // Hàng đợi có ngay (trước mọi await) để tin gửi dồn lúc đang khởi động vẫn vào đúng phiên.
    const hangDoi = new HangDoi();
    p.hangDoi = hangDoi;
    p.loi = null;
    p.vuaDung = false;
    p.dangDong = false;
    p.trangThai = 'lam';
    p.viec = { loai: 'nghi', chu: 'Đang khởi động', congCu: '', tu: Date.now() };
    p.yeuCau = yeuCau;
    p.hoatDongCuoi = Date.now();
    this._them(p, muc);
    hangDoi.day(tin);
    this._doi(p);
    let q;
    try {
      const query = await this._layQuery();
      const thuMucNode = path.dirname(process.execPath);
      q = query({
        prompt: hangDoi,
        options: {
          cwd: p.cwd,
          permissionMode: p.cheDo,
          allowDangerouslySkipPermissions: false,
          canUseTool: (ten, input, tuy) => this._xinQuyen(p, ten, input, tuy),
          systemPrompt: { type: 'preset', preset: 'claude_code' },
          ...(p.maPhien ? { resume: p.maPhien } : { title: p.ten }),
          ...(p.moHinh ? { model: p.moHinh } : {}),
          ...(p.effort ? { effort: p.effort } : {}),
          // Giữ nguyên môi trường (Claude Code tự lo đăng nhập). Máy chủ nền (LaunchAgent) có PATH rất ngắn:
          // thêm chỗ thường có node, git, brew.
          env: {
            ...process.env,
            PATH: [thuMucNode, '/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(':'),
            CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-office/0.2.0',
            CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: '1',
          },
          stderr: (d) => {
            if (/error/i.test(d)) console.error('[phiên văn phòng]', String(d).slice(0, 500));
          },
        },
      });
    } catch (e) {
      this._baoLoi(p, 'Không khởi động được Claude Code: ' + (e?.message || e));
      p.hangDoi = null;
      this._doi(p);
      return;
    }
    p.q = q;
    (async () => {
      for await (const m of q) this._nhan(p, q, m);
    })()
      .catch((e) => {
        if (p.q === q && !p.dangDong) this._baoLoi(p, e?.message || String(e));
      })
      .finally(() => {
        if (p.q !== q) return;
        p.q = null;
        p.hangDoi = null;
        for (const c of p.cho.values()) c.resolve({ behavior: 'deny', message: 'Phiên đã đóng' });
        p.cho.clear();
        p.duyet = null;
        if (p.trangThai !== 'loi') p.trangThai = 'xong';
        p.viec = null;
        this._luu();
        this._doi(p);
      });
  }

  _baoLoi(p, chu) {
    p.loi = { loai: 'sdk', chu: rutGon(chu, 300), luc: Date.now() };
    p.trangThai = 'loi';
    p.viec = null;
    this._them(p, { loai: 'loi', chu: p.loi.chu });
    this.su.emit('loi', { phien: this._tom(p), chu: p.loi.chu });
  }

  // Tóm tắt một phiên cho nơi khác (bot Telegram): mã, tên, dự án.
  _tom(p) {
    return { id: p.id, ten: p.ten, duAn: tenDuAn(p.cwd) };
  }

  _tatTienTrinh(p) {
    p.dangDong = true;
    if (p.hangDoi) p.hangDoi.ket();
    if (p.q) {
      try {
        p.q.close();
      } catch {}
    }
  }

  // Phiên rảnh quá lâu thì tắt tiến trình cho nhẹ máy; nhắn tin là chạy lại từ chỗ cũ (resume).
  _dongPhienRanh() {
    const bay = Date.now();
    for (const p of this.ds.values()) {
      if (p.q && (p.trangThai === 'xong' || p.trangThai === 'loi') && !p.cho.size && bay - p.hoatDongCuoi > DONG_SAU) this._tatTienTrinh(p);
    }
  }

  _xinQuyen(p, ten, input, { signal, suggestions, decisionReason, blockedPath } = {}) {
    return new Promise((resolve) => {
      const ma = crypto.randomUUID();
      const moTa = ten === 'AskUserQuestion' ? 'câu hỏi' : ten === 'ExitPlanMode' ? 'kế hoạch' : xinQuyen({ ten, input }).replace(/^Cho phép /, '');
      const c = { ma, ten, input: input || {}, goiY: suggestions || [], moTa, lyDo: decisionReason || '', duongDan: blockedPath || '', tu: Date.now(), resolve };
      p.cho.set(ma, c);
      this.su.emit('duyet', { phien: this._tom(p), duyet: this._moTaDuyet(p, c) });
      p.duyet = this._duyetDau(p);
      p.trangThai = 'cho';
      p.hoatDongCuoi = Date.now();
      signal?.addEventListener?.('abort', () => {
        if (!p.cho.has(ma)) return;
        p.cho.delete(ma);
        p.duyet = this._duyetDau(p);
        p.trangThai = p.duyet ? 'cho' : 'lam';
        resolve({ behavior: 'deny', message: 'Đã huỷ' });
        this.su.emit('daTraLoi', { phien: this._tom(p), ma, moTa: 'Đã huỷ (Claude thôi hỏi)' });
        this._doi(p);
      });
      this._doi(p);
    });
  }

  // Lời hỏi đang chờ (cũ nhất trước) dưới dạng gửi được cho trang.
  _duyetDau(p) {
    const c = [...p.cho.values()].sort((a, b) => a.tu - b.tu)[0];
    return c ? this._moTaDuyet(p, c) : null;
  }

  _moTaDuyet(p, c) {
    const d = { ma: c.ma, congCu: c.ten, tu: c.tu, soCho: p.cho.size };
    if (c.ten === 'AskUserQuestion') {
      const qs = Array.isArray(c.input.questions) ? c.input.questions : [];
      d.loai = 'hoi';
      d.cauHoi = qs.slice(0, 4).map((q) => ({
        question: String(q?.question || ''),
        header: String(q?.header || ''),
        multiSelect: !!q?.multiSelect,
        options: (Array.isArray(q?.options) ? q.options : []).slice(0, 8).map((o) => ({ label: String(o?.label || ''), description: String(o?.description || '') })),
      }));
      d.chu = rutGon(d.cauHoi[0]?.question || 'Claude cần bạn trả lời', 220);
    } else if (c.ten === 'ExitPlanMode') {
      d.loai = 'keHoach';
      d.keHoach = String(c.input.plan || '').slice(0, 20000);
      d.chu = 'Xin duyệt kế hoạch';
    } else {
      d.loai = 'quyen';
      d.chu = xinQuyen({ ten: c.ten, input: c.input });
      const v = c.input;
      d.chiTiet = rutGon(
        c.ten === 'Bash' ? String(v.command || '') : /^(Write|Edit|MultiEdit|Read|NotebookEdit)$/.test(c.ten) ? String(v.file_path || v.notebook_path || '') : JSON.stringify(v),
        1500,
      );
      if (c.ten === 'Bash' && v.description) d.moTa = rutGon(String(v.description), 200);
      if (c.lyDo) d.lyDo = rutGon(c.lyDo, 300);
      d.coLuon = locGoiY(c.goiY).length > 0;
    }
    return d;
  }

  _nhan(p, q, m) {
    if (p.q !== q) return;
    p.hoatDongCuoi = Date.now();
    if (m.type === 'system' && m.subtype === 'init') {
      if (m.session_id && p.maPhien !== m.session_id) {
        p.maPhien = m.session_id;
        this._luu();
      }
      if (m.model) p.moHinh = m.model;
      this._giuCheDo(p, q, m.permissionMode);
      // Tài khoản Claude Code đang dùng (chỉ siêu dữ liệu, không có token): cho bạn biết phiên tính vào gói nào.
      q.accountInfo?.()
        .then((a) => {
          p.taiKhoan = { email: a?.email || '', toChuc: a?.organization || '', goi: a?.subscriptionType || '', nguon: a?.apiKeySource || a?.tokenSource || '', ncc: a?.apiProvider || '' };
          this._doi(p);
        })
        .catch(() => {});
    } else if (m.type === 'system' && m.subtype === 'status') {
      this._giuCheDo(p, q, m.permissionMode);
    } else if (m.type === 'system' && m.subtype === 'session_state_changed') {
      if (m.state === 'running' && !p.cho.size && p.trangThai !== 'lam') p.trangThai = 'lam';
      else if (m.state === 'idle' && !p.cho.size && p.trangThai === 'lam') {
        p.trangThai = 'xong';
        p.viec = null;
      }
    } else if (m.type === 'assistant') {
      // Tin của trợ lý con (subagent) không đưa vào khung chat chính.
      if (m.parent_tool_use_id) return this._doi(p);
      if (m.error) {
        this._baoLoi(p, giaiThichLoi(m.error, chuKhoi(m.message?.content), p.taiKhoan));
        return this._doi(p);
      }
      for (const b of m.message?.content || []) {
        if (b.type === 'text' && b.text?.trim()) this._them(p, { loai: 'claude', chu: b.text });
        else if (b.type === 'tool_use') {
          const v = viecCua({ ten: b.name, input: b.input || {}, luc: Date.now() });
          if (v) {
            p.viec = v;
            this._them(p, { loai: 'congCu', chu: v.chu, congCu: b.name });
          }
        } else if (b.type === 'thinking' && !p.cho.size) p.viec = { loai: 'nghi', chu: 'Đang nghĩ…', congCu: '', tu: Date.now() };
      }
      if (!p.cho.size && p.trangThai !== 'loi') p.trangThai = 'lam';
    } else if (m.type === 'result') {
      p.luotXong++;
      const ngat = p.vuaDung || /^aborted/.test(m.terminal_reason || '');
      p.vuaDung = false;
      if (ngat) {
        this._them(p, { loai: 'traLoi', chu: '■ Đã dừng theo lệnh của bạn' });
        p.loi = null;
      } else if (m.subtype === 'success' && !m.is_error) {
        p.tomTat = rutGon(m.result || '', 240);
        p.loi = null;
        this.su.emit('xongLuot', { phien: this._tom(p), chu: String(m.result || '') });
      } else if (p.trangThai !== 'loi') {
        const chu = m.subtype === 'error_max_turns' ? 'Hết số lượt cho phép trong một lần chạy' : m.result || (m.errors || []).join('; ') || 'Lượt vừa rồi gặp lỗi';
        this._baoLoi(p, giaiThichLoi('', chu, p.taiKhoan));
      }
      if (!p.cho.size) {
        if (p.trangThai !== 'loi') p.trangThai = 'xong';
        p.viec = null;
      }
      this._luu();
    } else if (m.type === 'rate_limit_event' && m.rate_limit_info?.rateLimitType) {
      this.mucDung[m.rate_limit_info.rateLimitType] = { ...m.rate_limit_info, luc: Date.now() };
    }
    this._doi(p);
  }

  // Chế độ quyền chỉ được là default / acceptEdits / plan. Có gì đổi sang chế độ khác thì kéo về default.
  _giuCheDo(p, q, che) {
    if (!che) return;
    if (CHE_DO_CHO_PHEP.includes(che)) {
      if (p.cheDo !== che) {
        p.cheDo = che;
        this._luu();
      }
      return;
    }
    p.cheDo = 'default';
    q.setPermissionMode?.('default').catch(() => {});
    this._them(p, { loai: 'loi', chu: `Phiên bị đổi sang chế độ ${che}; văn phòng đã kéo về chế độ hỏi trước.` });
  }

  _them(p, muc) {
    p.hoiThoai.push({ i: p.soMuc++, luc: Date.now(), ...muc, chu: String(muc.chu || '').slice(0, 20000) });
    if (p.hoiThoai.length > TOI_DA_MUC) p.hoiThoai.splice(0, p.hoiThoai.length - TOI_DA_MUC);
  }

  // Sau khi máy chủ khởi động lại: lấy phần cuối nhật ký để khung chat không trống.
  async _napHoiThoaiCu(p) {
    if (!p.maPhien) return;
    const duong = await timNhatKy(p.maPhien, p.cwd);
    if (!duong) return;
    const st = await fsp.stat(duong);
    const ds = await docDuoiTho(duong, st.size, 40);
    const truoc = p.hoiThoai.splice(0);
    for (const e of ds) {
      if (e.isSidechain || e.isMeta) continue;
      const luc = Date.parse(e.timestamp) || 0;
      if (e.type === 'user') {
        const c = e.message?.content;
        if (Array.isArray(c) && c.some((b) => b.type === 'tool_result')) continue;
        const chu = chuKhoi(c);
        if (chu && !chu.startsWith('<')) this._them(p, { loai: 'ban', chu, luc });
      } else if (e.type === 'assistant' && e.isApiErrorMessage) {
        this._them(p, { loai: 'loi', chu: giaiThichLoi(e.error || '', chuKhoi(e.message?.content)), luc });
      } else if (e.type === 'assistant') {
        for (const b of e.message?.content || []) {
          if (b.type === 'text' && b.text?.trim()) this._them(p, { loai: 'claude', chu: b.text, luc });
          else if (b.type === 'tool_use') {
            const v = viecCua({ ten: b.name, input: b.input || {} });
            if (v) this._them(p, { loai: 'congCu', chu: v.chu, congCu: b.name, luc });
          }
        }
      }
    }
    for (const m of truoc) this._them(p, m);
    this._doi(p);
  }

  // ---------- trạng thái gửi trang ----------
  _doi(p) {
    p.phienBan++;
    clearTimeout(this._hen);
    this._hen = setTimeout(() => this.khiDoi(), 120);
  }

  _luu() {
    clearTimeout(this._henLuu);
    this._henLuu = setTimeout(async () => {
      const ds = [...this.ds.values()].map((p) => ({
        id: p.id,
        maPhien: p.maPhien,
        cwd: p.cwd,
        ten: p.ten,
        cheDo: p.cheDo,
        moHinh: p.moHinh,
        effort: p.effort,
        taoLuc: p.taoLuc,
        hoatDongCuoi: p.hoatDongCuoi,
        tomTat: p.tomTat,
        luotXong: p.luotXong,
        yeuCau: rutGon(p.yeuCau, 300),
      }));
      try {
        await fsp.mkdir(path.dirname(this.tepLuu), { recursive: true });
        await fsp.writeFile(this.tepLuu + '.tmp', JSON.stringify(ds, null, 2), { mode: 0o600 });
        await fsp.rename(this.tepLuu + '.tmp', this.tepLuu);
      } catch (e) {
        console.error('Không lưu được danh sách phiên văn phòng:', e.message);
      }
    }, 300);
  }

  // Mô tả đầy đủ một lời hỏi đang chờ theo mã (bot Telegram cần câu hỏi, lựa chọn của đúng lời hỏi đó).
  chiTietDuyet(ma) {
    for (const p of this.ds.values()) {
      const c = p.cho.get(ma);
      if (c) return { id: p.id, duyet: this._moTaDuyet(p, c) };
    }
    return null;
  }

  maPhienCuaVanPhong() {
    return new Set([...this.ds.values()].map((p) => p.maPhien).filter(Boolean));
  }

  anh() {
    return [...this.ds.values()].map((p) => {
      const r = {
        id: p.id,
        ten: p.ten,
        duAn: tenDuAn(p.cwd),
        thuMuc: rutNha(p.cwd),
        lienKet: '',
        nguon: 'vanphong',
        vanPhong: true,
        conChay: !!p.q,
        trangThai: p.trangThai,
        tomTat: p.tomTat,
        baoCao: '',
        yeuCau: rutGon(p.yeuCau, 300),
        moHinh: p.moHinh,
        effort: p.effort || '',
        cheDo: p.cheDo,
        taoLuc: p.taoLuc,
        hoatDongCuoi: p.hoatDongCuoi,
        luotXong: p.luotXong,
        cha: null,
        troLy: 0,
        phienBan: p.phienBan,
        ...(p.taiKhoan ? { taiKhoan: p.taiKhoan } : {}),
      };
      if (p.viec && p.trangThai === 'lam') r.viec = p.viec;
      // Câu hỏi và kế hoạch đầy đủ lấy qua hoiThoai() khi mở khung chat; ảnh chụp chỉ giữ phần ngắn.
      if (p.duyet) {
        const { cauHoi, keHoach, ...gon } = p.duyet;
        r.duyet = gon;
      }
      if (p.loi && p.trangThai === 'loi') r.loi = p.loi;
      return r;
    });
  }

  hoiThoai(id, tu = 0) {
    const p = this._lay(id);
    return { phienBan: p.phienBan, ds: p.hoiThoai.filter((m) => m.i >= tu), duyet: p.duyet, conChay: !!p.q, cheDo: p.cheDo };
  }
}
