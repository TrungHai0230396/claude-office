// Ảnh và tệp gửi kèm tin nhắn trong khung chat (bấm 📎, dán, kéo thả).
//   - Ảnh: trang đã thu nhỏ sẵn (cạnh dài ≤ 1568 điểm ảnh), gửi thẳng cho Claude xem như khối ảnh trong tin.
//   - Tệp khác (PDF, văn bản, log…): lưu vào thư mục riêng của văn phòng (chỉ chủ máy đọc được), tin nhắn kèm
//     đường dẫn để Claude đọc bằng công cụ Read. Không bao giờ chạy tệp.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { LoiNguoiDung } from './bao-ve.js';

const LOAI_ANH = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const TOI_DA_ANH = 6;
export const TOI_DA_TEP = 5;
const ANH_TOI_DA = 5 * 1024 * 1024;
const TEP_TOI_DA = 20 * 1024 * 1024;
const NHO_TOI_DA = 120 * 1024;
const LA_BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function giaiBase64(du, toiDa, ten) {
  const chu = String(du || '').replace(/\s+/g, '');
  if (!chu || !LA_BASE64.test(chu)) throw new LoiNguoiDung(`${ten} hỏng (không đọc được dữ liệu)`);
  const buf = Buffer.from(chu, 'base64');
  if (!buf.length) throw new LoiNguoiDung(`${ten} trống`);
  if (buf.length > toiDa) throw new LoiNguoiDung(`${ten} lớn quá ${Math.round(toiDa / 1048576)} MB`);
  return { chu, buf };
}

// Tên tệp an toàn: chỉ lấy phần tên (bỏ đường dẫn), bỏ ký tự lạ, không bắt đầu bằng dấu chấm, giới hạn độ dài.
export function tenTepAnToan(ten) {
  const goc = path.basename(String(ten || '').replace(/\\/g, '/'));
  const sach = goc
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._ -]+/gu, '_')
    .replace(/^[.\s]+/, '')
    .trim()
    .slice(0, 100);
  return sach || 'tep';
}

// Kiểm và chuẩn hoá phần đính kèm trong thân lệnh. Trả về { anh: [{ loai, du, nho }], tep: [{ ten, buf }] }.
export function kiemDinhKem({ anh = [], tep = [] } = {}) {
  if (!Array.isArray(anh) || !Array.isArray(tep)) throw new LoiNguoiDung('Đính kèm không hợp lệ');
  if (anh.length > TOI_DA_ANH) throw new LoiNguoiDung(`Mỗi lần gửi tối đa ${TOI_DA_ANH} ảnh`);
  if (tep.length > TOI_DA_TEP) throw new LoiNguoiDung(`Mỗi lần gửi tối đa ${TOI_DA_TEP} tệp`);
  const raAnh = anh.map((a, i) => {
    const ten = `Ảnh ${i + 1}`;
    if (!a || !LOAI_ANH.includes(a.loai)) throw new LoiNguoiDung(`${ten}: chỉ nhận JPEG, PNG, GIF, WebP`);
    const { chu } = giaiBase64(a.du, ANH_TOI_DA, ten);
    // Ảnh nhỏ để hiện lại trong khung chat: chỉ nhận đúng dạng data:image/…;base64, cỡ nhỏ.
    const nho = typeof a.nho === 'string' && a.nho.length <= NHO_TOI_DA && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(a.nho) ? a.nho : '';
    return { loai: a.loai, du: chu, nho };
  });
  const raTep = tep.map((t, i) => {
    const ten = tenTepAnToan(t?.ten || `tep-${i + 1}`);
    const { buf } = giaiBase64(t?.du, TEP_TOI_DA, `Tệp ${ten}`);
    return { ten, buf };
  });
  return { anh: raAnh, tep: raTep };
}

// Lưu tệp vào thư mục của phiên (chỉ chủ máy đọc được). Trả về đường dẫn đầy đủ từng tệp.
export async function luuTep(thuMuc, ds) {
  if (!ds.length) return [];
  await fsp.mkdir(thuMuc, { recursive: true, mode: 0o700 });
  const ra = [];
  for (const t of ds) {
    const duong = path.join(thuMuc, `${Date.now().toString(36)}-${t.ten}`);
    if (path.dirname(duong) !== thuMuc) throw new LoiNguoiDung('Tên tệp không hợp lệ');
    await fsp.writeFile(duong, t.buf, { mode: 0o600, flag: 'wx' });
    ra.push(duong);
  }
  return ra;
}
