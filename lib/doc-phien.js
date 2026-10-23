// Đọc tệp của app Claude trên máy (chỉ đọc): siêu dữ liệu từng phiên, đuôi nhật ký (transcript),
// trợ lý con đang chạy, và tiến trình CLI của từng phiên. Có bộ nhớ đệm theo mtime/size để mỗi
// giây chỉ đọc lại tệp vừa đổi.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const NHA = os.homedir();
export const THU_MUC_PHIEN = process.env.VPC_PHIEN || path.join(NHA, 'Library/Application Support/Claude/claude-code-sessions');
export const THU_MUC_DU_AN = process.env.VPC_DU_AN || path.join(NHA, '.claude/projects');

export function maHoaThuMuc(cwd) {
  return String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
}

async function stat(p) {
  try {
    return await fsp.stat(p);
  } catch {
    return null;
  }
}

async function dsCon(p) {
  try {
    return await fsp.readdir(p, { withFileTypes: true });
  } catch {
    return [];
  }
}

// ---------- siêu dữ liệu phiên ----------
// App lưu phiên ở <THU_MUC_PHIEN>/<tài khoản>/<tổ chức>/local_<uuid>.json. Thư mục cũ của tài khoản
// khác vẫn còn phiên, nên chỉ lấy thư mục có phiên hoạt động gần nhất.
export async function dsTepPhien() {
  const nhom = [];
  for (const tk of await dsCon(THU_MUC_PHIEN)) {
    if (!tk.isDirectory()) continue;
    for (const tc of await dsCon(path.join(THU_MUC_PHIEN, tk.name))) {
      if (!tc.isDirectory()) continue;
      const thuMuc = path.join(THU_MUC_PHIEN, tk.name, tc.name);
      const tep = [];
      let moiNhat = 0;
      for (const f of await dsCon(thuMuc)) {
        if (!f.isFile() || !/^local_[0-9a-f-]+\.json$/.test(f.name)) continue;
        const p = path.join(thuMuc, f.name);
        const st = await stat(p);
        if (!st) continue;
        tep.push({ tep: p, mtimeMs: st.mtimeMs, size: st.size });
        moiNhat = Math.max(moiNhat, st.mtimeMs);
      }
      if (tep.length) nhom.push({ thuMuc, tep, moiNhat });
    }
  }
  nhom.sort((a, b) => b.moiNhat - a.moiNhat);
  const ds = nhom[0]?.tep || [];
  // Tên thư mục cuối là mã tổ chức (dùng để lọc mẫu mức dùng của đúng tài khoản).
  ds.org = nhom[0] ? path.basename(nhom[0].thuMuc) : null;
  return ds;
}

const khoMeta = new Map();
export async function docMeta({ tep, mtimeMs, size }) {
  const cu = khoMeta.get(tep);
  if (cu && cu.mtimeMs === mtimeMs && cu.size === size) return cu.meta;
  try {
    const meta = JSON.parse(await fsp.readFile(tep, 'utf8'));
    khoMeta.set(tep, { mtimeMs, size, meta });
    return meta;
  } catch {
    // Đang ghi dở: dùng bản cũ.
    return cu?.meta || null;
  }
}

// ---------- tìm nhật ký ----------
// Nhật ký nằm ở ~/.claude/projects/<thư mục mã hoá>/<cliSessionId>.jsonl; đổi thư mục làm việc thì tệp
// dời sang thư mục dự án khác, nên lần nào không thấy thì dò lại cả lượt và lấy tệp lớn nhất.
const khoDuong = new Map();
let dsDuAn = { luc: 0, ten: [] };
export async function timNhatKy(ma, ...cwd) {
  if (!ma) return null;
  const cu = khoDuong.get(ma);
  if (cu && (await stat(cu))) return cu;
  for (const c of cwd.filter(Boolean)) {
    const p = path.join(THU_MUC_DU_AN, maHoaThuMuc(c), ma + '.jsonl');
    if (await stat(p)) {
      khoDuong.set(ma, p);
      return p;
    }
  }
  if (Date.now() - dsDuAn.luc > 15e3) dsDuAn = { luc: Date.now(), ten: (await dsCon(THU_MUC_DU_AN)).filter((d) => d.isDirectory()).map((d) => d.name) };
  let tot = null;
  let lon = -1;
  for (const ten of dsDuAn.ten) {
    const p = path.join(THU_MUC_DU_AN, ten, ma + '.jsonl');
    const st = await stat(p);
    if (st && st.size > lon) {
      tot = p;
      lon = st.size;
    }
  }
  if (tot) khoDuong.set(ma, tot);
  return tot;
}

// ---------- đuôi nhật ký ----------
const LOAI_HOI_THOAI = new Set(['user', 'assistant']);
const LOAI_CHINH = new Set(['user', 'assistant', 'system', 'queue-operation']);

// Đọc ngược từ cuối tệp tới khi gặp đủ dòng hội thoại (một dòng có thể là ảnh base64 vài MB).
export async function docDuoiTho(duong, size, toiThieu = 8, toiDa = 24 * 1024 * 1024) {
  let fh;
  try {
    fh = await fsp.open(duong, 'r');
  } catch {
    return [];
  }
  try {
    let doc = Math.min(size, 256 * 1024);
    for (;;) {
      const bd = size - doc;
      const buf = Buffer.alloc(doc);
      await fh.read(buf, 0, doc, bd);
      let dong = buf.toString('utf8').split('\n');
      if (bd > 0) dong = dong.slice(1);
      const ds = [];
      for (const l of dong) {
        if (!l.trim()) continue;
        try {
          ds.push(JSON.parse(l));
        } catch {}
      }
      const soHT = ds.filter((e) => LOAI_HOI_THOAI.has(e.type) && !e.isSidechain && !e.isMeta).length;
      if (soHT >= toiThieu || bd === 0 || doc >= toiDa) return ds;
      doc = Math.min(size, doc * 4, toiDa);
    }
  } finally {
    await fh.close();
  }
}

function khoi(e) {
  const c = e.message?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return [];
}

function chuCua(e) {
  return khoi(e)
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

const NGAT = /^\[Request interrupted by user/;
const DUNG_LUOT = new Set(['end_turn', 'stop_sequence', 'refusal']);

function laLoiNhac(e) {
  return e.type === 'user' && !e.isMeta && !khoi(e).some((b) => b.type === 'tool_result') && !NGAT.test(chuCua(e));
}

// Tóm phần đuôi nhật ký: lượt cuối đang mở hay đã xong, công cụ nào chưa có kết quả, lời nhờ cuối,
// lời tóm tắt cuối lượt (wrap_up), lỗi API, bị ngắt giữa chừng.
export function tomDuoi(ds) {
  const kq = {
    lucCuoi: 0,
    ketThuc: false,
    lucKetThuc: 0,
    ngat: false,
    loiApi: null,
    choCongCu: [],
    khoiCuoi: '',
    troLyCuoiUuid: null,
    chuTroLyCuoi: '',
    wrapUp: null,
    yeuCau: null,
    lucYeuCau: 0,
  };
  const M = ds.filter((e) => LOAI_CHINH.has(e.type) && !e.isSidechain);
  const ht = M.filter((e) => LOAI_HOI_THOAI.has(e.type) && !e.isMeta);
  for (const e of ds) if (e.type === 'last-prompt' && e.lastPrompt) kq.yeuCau = String(e.lastPrompt);
  if (!M.length) return kq;

  // Lời nhắc cuối mở lượt mới: tin người gõ hay thông báo việc nền. Tin xếp hàng (queue-operation)
  // không tính: nhắc hệ thống cũng đi qua hàng đợi rồi thành tin isMeta, không mở lượt nào.
  let iNhac = -1;
  for (let i = M.length - 1; i >= 0; i--) {
    const e = M[i];
    if (laLoiNhac(e)) {
      iNhac = i;
      break;
    }
  }
  for (let i = M.length - 1; i >= 0; i--) {
    const e = M[i];
    if (!laLoiNhac(e)) continue;
    const chu = chuCua(e);
    if (!chu || chu.startsWith('<')) continue;
    kq.yeuCau = chu;
    kq.lucYeuCau = Date.parse(e.timestamp) || 0;
    break;
  }
  const sau = M.slice(iNhac + 1);

  // Kết quả công cụ đã về (trong cả cửa sổ đọc).
  const daCo = new Set();
  for (const e of M) if (e.type === 'user') for (const b of khoi(e)) if (b.type === 'tool_result' && b.tool_use_id) daCo.add(b.tool_use_id);

  let iDung = -1;
  let iDungCuoi = -1;
  for (let i = 0; i < sau.length; i++) {
    const e = sau[i];
    if (e.type === 'assistant') {
      const bl = khoi(e);
      for (const b of bl) {
        if (b.type !== 'tool_use') continue;
        // Còn gọi công cụ sau đó (kể cả sau móc dừng chặn lại) thì lượt chưa xong.
        iDung = -1;
        iDungCuoi = -1;
        if (!daCo.has(b.id)) kq.choCongCu.push({ ten: b.name, input: b.input || {}, id: b.id, luc: Date.parse(e.timestamp) || 0 });
        if (b.name === 'mcp__ccd_turn__wrap_up') kq.wrapUp = b.input || {};
      }
      if (DUNG_LUOT.has(e.message?.stop_reason) && !bl.some((b) => b.type === 'tool_use')) iDung = i;
    } else if (e.type === 'system' && e.subtype === 'stop_hook_summary') {
      iDungCuoi = i;
    }
  }
  if (iDung >= 0 || iDungCuoi >= 0) {
    kq.ketThuc = true;
    const e = sau[Math.max(iDung, iDungCuoi)];
    kq.lucKetThuc = Date.parse(e.timestamp) || 0;
  }

  // Câu trả lời cuối của Claude (gom các khối cùng một tin).
  let tl = null;
  for (let i = ht.length - 1; i >= 0; i--) {
    if (ht[i].type === 'assistant') {
      tl = ht[i];
      break;
    }
  }
  if (tl) {
    kq.troLyCuoiUuid = tl.uuid || null;
    const bl = khoi(tl);
    kq.khoiCuoi = bl.length ? bl[bl.length - 1].type : '';
    const maTin = tl.message?.id;
    kq.chuTroLyCuoi = ht
      .filter((e) => e.type === 'assistant' && maTin && e.message?.id === maTin)
      .map(chuCua)
      .filter(Boolean)
      .join('\n');
    if (tl.isApiErrorMessage && ht[ht.length - 1] === tl) {
      kq.loiApi = { loai: tl.error || 'api', chu: chuCua(tl) || 'Lỗi gọi API', luc: Date.parse(tl.timestamp) || 0 };
      kq.ketThuc = true;
      kq.lucKetThuc = kq.lucKetThuc || kq.loiApi.luc;
    }
  }
  const cuoi = ht[ht.length - 1];
  if (cuoi) {
    kq.lucCuoi = Date.parse(cuoi.timestamp) || 0;
    if (cuoi.type === 'user' && NGAT.test(chuCua(cuoi))) {
      kq.ngat = true;
      kq.ketThuc = true;
      kq.lucKetThuc = kq.lucCuoi;
      kq.choCongCu = [];
    }
  }
  return kq;
}

const khoDuoi = new Map();
export async function docNhatKy(duong) {
  const st = await stat(duong);
  if (!st) return null;
  const cu = khoDuoi.get(duong);
  if (cu && cu.mtimeMs === st.mtimeMs && cu.size === st.size) return cu.kq;
  const kq = { ...tomDuoi(await docDuoiTho(duong, st.size)), mtimeMs: st.mtimeMs };
  khoDuoi.set(duong, { mtimeMs: st.mtimeMs, size: st.size, kq });
  return kq;
}

// ---------- tệp trạng thái sống ----------
// Mỗi tiến trình CLI ghi ~/.claude/sessions/<pid>.json (status busy | idle | waiting, waitingFor,
// hostSessionId = mã phiên của app). Tiến trình chết bất thường để lại tệp cũ: chỉ tin tệp nào có
// pid còn sống và giờ bắt đầu khớp procStart (tránh pid bị dùng lại). Không đụng tệp *.key.
export const THU_MUC_SO = process.env.VPC_SO || path.join(NHA, '.claude/sessions');
const khoSo = new Map();
export async function docSoTrangThai() {
  const ra = [];
  for (const f of await dsCon(THU_MUC_SO)) {
    if (!f.isFile() || !/^\d+\.json$/.test(f.name)) continue;
    const p = path.join(THU_MUC_SO, f.name);
    const st = await stat(p);
    if (!st) continue;
    const cu = khoSo.get(p);
    if (cu && cu.mtimeMs === st.mtimeMs && cu.size === st.size) {
      ra.push(cu.so);
      continue;
    }
    try {
      const so = JSON.parse(await fsp.readFile(p, 'utf8'));
      khoSo.set(p, { mtimeMs: st.mtimeMs, size: st.size, so });
      ra.push(so);
    } catch {
      if (cu) ra.push(cu.so);
    }
  }
  return ra;
}

const THANG = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// "Wed Oct 21 08:43:30 2026" (giờ UTC) → mili giây.
export function giayUTC(chu) {
  const m = /^\w{3}\s+(\w{3})\s+(\d+)\s+(\d\d):(\d\d):(\d\d)\s+(\d{4})$/.exec(String(chu || '').trim());
  if (!m || THANG[m[1]] === undefined) return 0;
  return Date.UTC(Number(m[6]), THANG[m[1]], Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
}

// Tệp trạng thái còn hiệu lực: pid có trong bảng tiến trình và bắt đầu đúng lúc procStart.
export function soConSong(so, tt) {
  const p = tt?.theoPid?.get(so.pid);
  if (!p) return false;
  const bd = giayUTC(so.procStart);
  return !bd || Math.abs(p.batDau - bd) <= 2000;
}

// Trợ lý con (subagent) còn đang ghi nhật ký trong 90 giây qua.
export async function demTroLy(duong, bayGio = Date.now()) {
  if (!duong) return 0;
  const thuMuc = path.join(duong.replace(/\.jsonl$/, ''), 'subagents');
  let n = 0;
  for (const f of await dsCon(thuMuc)) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
    const st = await stat(path.join(thuMuc, f.name));
    if (st && bayGio - st.mtimeMs < 90e3) n++;
  }
  return n;
}

// ---------- tiến trình ----------
// Mỗi phiên của app có một tiến trình CLI "claude … --resume=<cliSessionId>"; lệnh Bash chạy thành tiến trình con.
export function phanTichPs(raw) {
  const ds = [];
  for (const dong of raw.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d\d:\d\d:\d\d\s+\d{4})\s+(.*)$/.exec(dong);
    if (!m) continue;
    ds.push({ pid: Number(m[1]), ppid: Number(m[2]), batDau: Date.parse(m[3]) || 0, lenh: m[4] });
  }
  const cli = new Map();
  const con = new Map();
  const theoPid = new Map();
  for (const p of ds) {
    theoPid.set(p.pid, p);
    if (!con.has(p.ppid)) con.set(p.ppid, []);
    con.get(p.ppid).push(p);
    if (!/\/claude(\s|$)/.test(p.lenh) || !/--output-format/.test(p.lenh)) continue;
    const ma = /--(?:resume|session-id)[= ]([0-9a-f-]{36})/.exec(p.lenh);
    if (ma) cli.set(ma[1], p);
  }
  return { cli, con, theoPid };
}

export function dsTienTrinh() {
  return new Promise((xong) => {
    execFile('/bin/ps', ['-axww', '-o', 'pid=,ppid=,lstart=,command='], { maxBuffer: 16 * 1024 * 1024 }, (loi, out) => {
      xong(loi ? { cli: new Map(), con: new Map(), theoPid: new Map(), loi: true } : phanTichPs(out));
    });
  });
}

// Tiến trình con (đệ quy) của một pid, bắt đầu từ lúc nào đó trở đi.
export function conSauLuc(tt, pid, luc) {
  const ra = [];
  const di = (p, sau) => {
    for (const c of tt.con.get(p) || []) {
      if (c.batDau >= luc) ra.push(c);
      if (sau < 3) di(c.pid, sau + 1);
    }
  };
  di(pid, 0);
  return ra;
}
