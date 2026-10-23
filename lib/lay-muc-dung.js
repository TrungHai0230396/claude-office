// Lấy mức dùng gói thẳng từ Claude Code: lệnh /usage là lệnh chạy tại máy của Claude Code (không gọi mô
// hình, không tốn lượt dùng), trả về % phiên 5 giờ, % tuần và giờ mở lại chính xác. Chạy bản Claude Code
// nguyên gốc qua Agent SDK bằng đăng nhập của người dùng; văn phòng không đụng token.
// Chỉ hỏi khi có trang đang mở: 5 phút một lần, và ngay sau giờ khung 5 giờ mở lại.
import path from 'node:path';
import { docUsage } from './muc-dung.js';
import { HangDoi, tinNguoiDung } from './phien-vp.js';

const CHU_KY = 5 * 60e3;
const CHO_NGUOI_XEM = 30e3;

export class LayMucDung {
  constructor({ coNguoiXem = () => true, khiDoi = () => {}, query = null, cwd = process.cwd(), chuKy = CHU_KY } = {}) {
    this.coNguoiXem = coNguoiXem;
    this.khiDoi = khiDoi;
    this._query = query;
    this.cwd = cwd;
    this.chuKy = chuKy;
    this.ketQua = null; // { luc, ketQua: docUsage(...) }
    this.trangThai = 'dangLay'; // dangLay | co | khongCo | tat
    this.tat = false;
  }

  async _layQuery() {
    if (!this._query) this._query = (await import('@anthropic-ai/claude-agent-sdk')).query;
    return this._query;
  }

  batDau() {
    this._hen = setTimeout(() => this._vong(), 2000);
    this._hen.unref?.();
  }

  dung() {
    clearTimeout(this._hen);
  }

  // Có người vừa mở trang: số chưa có hay đã cũ thì hỏi ngay, khỏi chờ tới vòng sau.
  nhacLay() {
    if (this.tat || this.dangLay) return;
    if (this.ketQua && Date.now() - this.ketQua.luc < this.chuKy) return;
    clearTimeout(this._hen);
    this._vong();
  }

  async _vong() {
    let cho = this.chuKy;
    this.dangLay = true;
    try {
      if (this.coNguoiXem()) await this.lay();
      else cho = CHO_NGUOI_XEM;
    } catch (e) {
      console.error('Không lấy được mức dùng từ Claude Code:', e?.message || e);
    } finally {
      this.dangLay = false;
    }
    if (this.tat) return;
    // Khung 5 giờ sắp mở lại thì hỏi ngay sau giờ đó.
    const het = this.ketQua?.ketQua?.namGio?.het;
    if (het && het > Date.now()) cho = Math.min(cho, het - Date.now() + 30e3);
    this._hen = setTimeout(() => this._vong(), Math.max(5e3, cho));
    this._hen.unref?.();
  }

  // Một lần hỏi /usage. Trước hết hỏi danh sách lệnh: không còn /usage thì thôi hẳn (không bao giờ để chữ
  // "/usage" lọt tới mô hình mà tốn lượt).
  async lay() {
    const query = await this._layQuery();
    const hangDoi = new HangDoi();
    const q = query({
      prompt: hangDoi,
      options: {
        cwd: this.cwd,
        settingSources: [],
        persistSession: false,
        env: {
          ...process.env,
          PATH: [path.dirname(process.execPath), process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin'].join(':'),
          CLAUDE_AGENT_SDK_CLIENT_APP: 'claude-office/0.2.0',
        },
      },
    });
    const hen = setTimeout(() => q.close?.(), 60e3);
    let chu = '';
    let tonLuot = false;
    try {
      const ds = await q.supportedCommands();
      if (!ds.some((c) => c.name === 'usage')) {
        this.tat = true;
        this.trangThai = 'tat';
        return;
      }
      hangDoi.day(tinNguoiDung('/usage'));
      for await (const m of q) {
        if (m.type === 'system' && m.subtype === 'local_command_output') chu += m.content + '\n';
        else if (m.type === 'result') {
          if (typeof m.result === 'string') chu += m.result;
          tonLuot = (m.num_turns || 0) > 0 || (m.total_cost_usd || 0) > 0;
          break;
        }
      }
    } finally {
      clearTimeout(hen);
      hangDoi.ket();
      q.close?.();
    }
    if (tonLuot) {
      // Lệnh không còn chạy tại máy mà thành câu gửi mô hình: thôi hẳn để khỏi tốn lượt.
      this.tat = true;
      this.trangThai = 'tat';
      return;
    }
    const kq = docUsage(chu, Date.now());
    this.ketQua = kq ? { luc: Date.now(), ketQua: kq } : null;
    this.trangThai = kq ? 'co' : 'khongCo';
    this.khiDoi();
  }

  anh() {
    return this.ketQua;
  }
}
