// Khoá cho các lệnh điều khiển (giao việc, gửi tin, cho phép, dừng). Trang văn phòng ra lệnh được cho
// Claude chạy trên máy, nên chỉ nhận lệnh khi đủ cả ba:
//   1. Host là 127.0.0.1/localhost (chặn DNS rebinding),
//   2. Origin đúng trang văn phòng (trang web khác gửi tới thì từ chối),
//   3. kèm mã bí mật tạo mỗi lần máy chủ khởi động; mã chỉ nằm trong trang văn phòng do máy chủ trả về,
//      trang khác không đọc được (không có CORS) nên không giả được.
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const TEN_DAU_KHOA = 'x-vpc-khoa';
// auto: chế độ Tự động của Claude Code (bộ phân loại của Anthropic tự duyệt việc an toàn, hỏi việc rủi ro).
// Không bao giờ có bypassPermissions (chạy mọi thứ không hỏi) hay dontAsk.
export const CHE_DO_CHO_PHEP = ['default', 'acceptEdits', 'plan', 'auto'];
export const DAI_TIN_TOI_DA = 20000;

export function taoKhoa() {
  return crypto.randomBytes(24).toString('base64url');
}

function bangNhau(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function hostHopLe(host) {
  const h = String(host || '').replace(/:\d+$/, '');
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

// Trả về null nếu được phép, hoặc lý do từ chối. truyCap: kết quả kiểm Host / Tailscale (lib/tu-xa.js);
// nguonThem: Origin hợp lệ thêm (trang mở qua Tailscale trên điện thoại).
export function kiemLenh({ method, headers = {}, cong, khoa, ghi = true, truyCap = null, nguonThem = [] }) {
  const tc = truyCap || (hostHopLe(headers.host) ? { hopLe: true } : { hopLe: false });
  if (!tc.hopLe) return tc.lyDo || 'Host không phải máy này';
  if (!bangNhau(headers[TEN_DAU_KHOA], khoa)) return 'Thiếu hoặc sai mã của trang văn phòng';
  if (!ghi) return null;
  if (method !== 'POST') return 'Chỉ nhận POST';
  const nguon = String(headers.origin || '');
  const hopLe = [`http://127.0.0.1:${cong}`, `http://localhost:${cong}`, `http://[::1]:${cong}`, ...nguonThem];
  if (!hopLe.includes(nguon)) return 'Lệnh không đến từ trang văn phòng';
  if (!/^application\/json\b/i.test(String(headers['content-type'] || ''))) return 'Thân lệnh phải là JSON';
  return null;
}

// Thư mục giao việc: phải có thật, là thư mục, nằm trong thư mục nhà (không phải chính thư mục nhà),
// đã giải liên kết mềm. Trả về đường dẫn thật.
export async function kiemThuMuc(p, nha = os.homedir()) {
  if (typeof p !== 'string' || !p.trim()) throw new LoiNguoiDung('Chưa chọn thư mục dự án');
  let duong = p.trim();
  if (duong === '~' || duong.startsWith('~/')) duong = path.join(nha, duong.slice(1));
  if (!path.isAbsolute(duong)) throw new LoiNguoiDung('Thư mục phải là đường dẫn đầy đủ');
  let that;
  try {
    that = await fsp.realpath(duong);
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') throw new LoiQuyen(duong);
    throw new LoiNguoiDung('Không thấy thư mục này');
  }
  const nhaThat = await fsp.realpath(nha).catch(() => nha);
  if (that === nhaThat || !that.startsWith(nhaThat + path.sep)) throw new LoiNguoiDung('Chỉ giao việc trong thư mục nằm bên trong thư mục nhà');
  let st;
  try {
    st = await fsp.stat(that);
    await fsp.readdir(that);
  } catch (e) {
    if (e.code === 'EPERM' || e.code === 'EACCES') throw new LoiQuyen(that);
    throw new LoiNguoiDung('Không đọc được thư mục này');
  }
  if (!st.isDirectory()) throw new LoiNguoiDung('Đây không phải thư mục');
  return that;
}

export class LoiNguoiDung extends Error {
  constructor(msg, ma = 400) {
    super(msg);
    this.ma = ma;
  }
}

// macOS chặn tiến trình nền đọc Documents, Desktop, Downloads… khi chưa được cấp quyền.
export class LoiQuyen extends LoiNguoiDung {
  constructor(duong) {
    super(
      `macOS chưa cho máy chủ văn phòng vào thư mục này (${duong}). Mở Cài đặt hệ thống → Quyền riêng tư & Bảo mật → ` +
        `Truy cập toàn bộ ổ đĩa, bấm + và thêm ${process.execPath}, rồi khởi động lại máy chủ (npm run cai-tu-chay); ` +
        'hoặc chạy máy chủ từ Terminal bằng npm start.',
      403,
    );
    this.quyen = true;
  }
}

// Kiểm và chuẩn hoá thân lệnh từ trang.
export function kiemTin(chu) {
  if (typeof chu !== 'string' || !chu.trim()) throw new LoiNguoiDung('Tin nhắn trống');
  if (chu.length > DAI_TIN_TOI_DA) throw new LoiNguoiDung(`Tin nhắn dài quá ${DAI_TIN_TOI_DA} ký tự`);
  return chu;
}

export function kiemCheDo(c) {
  const che = c || 'default';
  if (!CHE_DO_CHO_PHEP.includes(che)) throw new LoiNguoiDung('Chế độ quyền không hợp lệ');
  return che;
}

// Effort của phiên (như /effort trong Claude Code): Claude nghĩ kỹ tới đâu. Trống hay 'default' là mức mặc định
// của model (trả về '').
export const MUC_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export function kiemEffort(e) {
  if (e === undefined || e === null || e === '' || e === 'default') return '';
  if (!MUC_EFFORT.includes(e)) throw new LoiNguoiDung('Mức effort không hợp lệ');
  return e;
}

// Model của phiên: bí danh hay mã model như trong /model của Claude Code (opus, sonnet, claude-opus-5-5,
// sonnet[1m]…). Trống hay 'default' là mặc định của Claude Code (trả về '').
export function kiemMoHinh(m) {
  if (m === undefined || m === null || m === '' || m === 'default') return '';
  if (typeof m !== 'string' || !/^[a-z0-9][a-z0-9._:@[\]-]{0,79}$/i.test(m)) throw new LoiNguoiDung('Model không hợp lệ');
  return m;
}
