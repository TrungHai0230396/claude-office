// Mức dùng gói Claude (giới hạn 5 giờ, giới hạn tuần). Chỉ đọc những gì app Claude tự ghi ra đĩa,
// không đụng khoá đăng nhập:
//   - plan-usage-history.json: mẫu { t, org, u: { fh: % 5 giờ, sd: % tuần } } app ghi mỗi lần lấy
//     mức dùng — khoảng 15 phút một lần, nhưng app chỉ tự lấy khi menu Claude trên thanh menu được mở
//     trong 24 giờ qua. Mẫu không có giờ hết hạn.
//   - câu lỗi của phiên chạm giới hạn ("You've hit your session limit · resets 6:50pm (Asia/Saigon)"):
//     giờ hết chính xác.
// Giờ hết lúc chưa chạm giới hạn thì ước tính: khung 5 giờ mở ra khi phần trăm tụt (vừa hết khung cũ)
// hay từ 0 nhích lên, nên giờ hết ≈ lúc đó + 5 giờ, sai số nửa khoảng cách hai mẫu.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const TEP_LICH_SU = process.env.VPC_MUC_DUNG || path.join(os.homedir(), 'Library/Application Support/Claude/plan-usage-history.json');
const NAM_GIO = 5 * 3600e3;
const CU_SAU = 20 * 60e3;

const THANG = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

// Lệch giờ (phút) của một múi giờ IANA tại thời điểm cho trước.
function lechMuiGio(muiGio, luc) {
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: muiGio, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    const p = Object.fromEntries(f.formatToParts(new Date(luc)).map((x) => [x.type, x.value]));
    const gia = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute));
    return Math.round((gia - Math.floor(luc / 60e3) * 60e3) / 60e3);
  } catch {
    return null;
  }
}

// "…limit · resets 6:50pm (Asia/Saigon)", "resets Oct 25, 9am (Asia/Saigon)" hay "resets Oct 23 at 4:39pm
// (Asia/Saigon)" → mốc giờ hết (ms), lấy lần gần nhất sau lúc báo lỗi.
export function gioHetTuLoi(chu, lucLoi) {
  const m = /resets\s+(?:([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?/i.exec(String(chu || ''));
  if (!m || !lucLoi) return null;
  let gio = Number(m[3]) % 12;
  if ((m[5] || '').toLowerCase() === 'pm') gio += 12;
  if (!m[5] && Number(m[3]) >= 12) gio = Number(m[3]);
  const phut = Number(m[4] || 0);
  const lech = m[6] ? lechMuiGio(m[6].trim(), lucLoi) : -new Date(lucLoi).getTimezoneOffset();
  if (lech === null) return null;
  // Ngày theo giờ địa phương của múi giờ đó.
  const dia = new Date(lucLoi + lech * 60e3);
  let nam = dia.getUTCFullYear();
  let thang = dia.getUTCMonth();
  let ngay = dia.getUTCDate();
  if (m[1] && THANG[m[1].toLowerCase()] !== undefined) {
    thang = THANG[m[1].toLowerCase()];
    ngay = Number(m[2]);
    if (thang < dia.getUTCMonth() - 6) nam++;
  }
  let het = Date.UTC(nam, thang, ngay, gio, phut) - lech * 60e3;
  if (!m[1]) while (het <= lucLoi) het += 86400e3;
  return het;
}

// Ước tính lúc khung 5 giờ hiện tại mở ra, từ dãy mẫu phần trăm (cũ → mới) của một tổ chức.
export function uocLucMoKhung(mau, bayGio) {
  for (let i = mau.length - 1; i > 0; i--) {
    const a = mau[i - 1];
    const b = mau[i];
    if (bayGio - b.t > NAM_GIO + 30 * 60e3) break;
    const tut = b.fh < a.fh - 1;
    const batDau = a.fh === 0 && b.fh > 0;
    if (!tut && !batDau) continue;
    // Hai mẫu cách nhau quá 40 phút thì không đủ chắc để đoán.
    if (b.t - a.t > 40 * 60e3) return null;
    return { luc: (a.t + b.t) / 2, saiSo: (b.t - a.t) / 2 };
  }
  return null;
}

// mau: [{ t, org, u: { fh, sd } }]; loi: [{ chu, luc }] (câu lỗi chạm giới hạn của các phiên).
export function tinhMucDung({ mau = [], org = null, loi = [], bayGio = Date.now() }) {
  const cuaOrg = mau
    .filter((x) => !org || x.org === org || x.org === null)
    .filter((x) => typeof x.u?.fh === 'number')
    .map((x) => ({ t: x.t, fh: x.u.fh, sd: x.u.sd }))
    .sort((a, b) => a.t - b.t);
  const cuoi = cuaOrg[cuaOrg.length - 1] || null;
  const kq = { namGio: null, tuan: null, het: null, goiY: null };

  // Giờ hết chính xác: phiên vừa chạm giới hạn 5 giờ, giờ hết còn ở phía trước.
  for (const l of loi) {
    if (!/session limit|5-hour|five.hour/i.test(l.chu || '')) continue;
    const het = gioHetTuLoi(l.chu, l.luc);
    if (het && het > bayGio && het - (l.luc || 0) <= NAM_GIO + 60e3 && (!kq.het || l.luc > kq.het.tuLuc)) {
      kq.het = { luc: het, chinhXac: true, tuLuc: l.luc };
    }
  }

  if (cuoi && bayGio - cuoi.t < NAM_GIO) {
    kq.namGio = { phanTram: cuoi.fh, luc: cuoi.t, cu: bayGio - cuoi.t > CU_SAU };
    if (typeof cuoi.sd === 'number') kq.tuan = { phanTram: cuoi.sd, luc: cuoi.t };
    if (!kq.het) {
      const mo = uocLucMoKhung(cuaOrg, bayGio);
      if (mo && mo.luc + NAM_GIO > bayGio) kq.het = { luc: Math.round(mo.luc + NAM_GIO), chinhXac: false, saiSo: Math.round(mo.saiSo) };
    }
  }
  if (kq.het?.chinhXac && !kq.namGio) kq.namGio = { phanTram: 100, luc: kq.het.tuLuc, cu: false };
  if (!kq.namGio || kq.namGio.cu) kq.goiY = 'App Claude chỉ ghi mức dùng khi bạn bấm vào biểu tượng Claude trên thanh menu (góc trên bên phải màn hình Mac). Bấm một lần, số hiện ở đây sau ít phút; sau đó app tự cập nhật mỗi 15 phút trong 24 giờ.';
  return kq;
}

let kho = { mtimeMs: 0, mau: [] };
export async function docLichSu() {
  try {
    const st = await fsp.stat(TEP_LICH_SU);
    if (st.mtimeMs !== kho.mtimeMs) {
      const d = JSON.parse(await fsp.readFile(TEP_LICH_SU, 'utf8'));
      kho = { mtimeMs: st.mtimeMs, mau: Array.isArray(d?.samples) ? d.samples : [] };
    }
  } catch {}
  return kho.mau;
}

// ---------- mức dùng do Claude Code báo (lệnh /usage, xem lib/lay-muc-dung.js) ----------
// "Current session: 42% used · resets Oct 23 at 4:39pm (Asia/Saigon)"
// "Current week (Fable): 0% used · resets Oct 25 at 9am (Asia/Saigon)"
// → { goi, namGio: { phanTram, het }, tuan: [{ ten, phanTram, het }] }, hoặc null nếu không có số (vd. đang
// dùng API key, không có giới hạn gói).
export function docUsage(chu, luc = Date.now()) {
  const kq = { goi: /subscription/i.test(chu || ''), namGio: null, tuan: [] };
  for (const dong of String(chu || '').split('\n')) {
    const m = /^\s*Current (session|week)(?:\s*\(([^)]*)\))?\s*:\s*(\d+(?:\.\d+)?)\s*%\s*used(?:\s*[·•-]\s*(.*))?$/i.exec(dong);
    if (!m) continue;
    const muc = { ten: (m[2] || '').trim(), phanTram: Number(m[3]), het: m[4] ? gioHetTuLoi(m[4], luc) : null };
    if (m[1].toLowerCase() === 'session') kq.namGio = muc;
    else kq.tuan.push(muc);
  }
  return kq.namGio || kq.tuan.length ? kq : null;
}

// Gộp số /usage (chính xác, mới lấy) vào mức dùng; cũ quá 20 phút thì bỏ. Khung 5 giờ đã qua giờ mở lại
// thì số cũ không còn đúng: bỏ, chờ lần lấy kế tiếp.
export function gopMucDungCC(md, cc, bayGio = Date.now()) {
  if (!cc?.ketQua || bayGio - cc.luc > 20 * 60e3) return md;
  const { namGio, tuan } = cc.ketQua;
  const ra = { ...(md || { namGio: null, tuan: null, het: null, goiY: null }) };
  if (namGio && !(namGio.het && namGio.het <= bayGio)) {
    ra.namGio = { phanTram: namGio.phanTram, luc: cc.luc, cu: false, nguon: 'claude-code' };
    ra.het = namGio.het ? { luc: namGio.het, chinhXac: true } : null;
    ra.goiY = null;
  }
  const tuanCao = [...(tuan || [])].filter((t) => !(t.het && t.het <= bayGio)).sort((a, b) => b.phanTram - a.phanTram)[0];
  if (tuanCao) ra.tuan = { phanTram: tuanCao.phanTram, luc: cc.luc, ten: tuanCao.ten, het: tuanCao.het || 0, nguon: 'claude-code' };
  return ra;
}

