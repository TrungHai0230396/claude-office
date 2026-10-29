// Bot Telegram riêng của bạn, thay cho mở văn phòng 3D trên điện thoại (đỡ hao pin):
//   - báo ngay khi phiên văn phòng cần duyệt, bấm Cho phép / Từ chối, chọn câu trả lời, duyệt kế hoạch ngay
//     trong Telegram; báo khi xong lượt (kèm câu trả lời của Claude), khi lỗi, khi phiên của app Claude chờ bạn;
//   - giao việc bằng tin nhắn hay ảnh/tệp (bot hỏi dự án bằng nút), trả lời (reply) tin của một phiên để nhắn tiếp.
// An toàn:
//   - token bot nằm trong Keychain (mục claude-office-telegram) do bạn tự cất, chỉ dùng để gọi api.telegram.org;
//     không ghi ra tệp, nhật ký hay trang;
//   - chỉ một tài khoản Telegram ra lệnh được: tài khoản gửi đúng mã ghép một lần (hiện trên trang văn phòng);
//     tin của người khác bị bỏ qua;
//   - bot tự hỏi Telegram có tin mới không (long polling), không mở cổng nào trên máy;
//   - nội dung đi qua máy chủ Telegram (không mã hoá đầu-cuối) — ghi rõ trong README.
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { rutGon } from './trang-thai.js';
import { kiemMoHinh, kiemEffort, MUC_EFFORT } from './bao-ve.js';

export const DICH_VU_KEYCHAIN = 'claude-office-telegram';
const TIN_TOI_DA = 3800;
const MA_SONG = 15 * 60e3;
const TEN_CHE_DO = { default: 'Hỏi trước', acceptEdits: 'Tự sửa tệp', auto: 'Tự động', plan: 'Lên kế hoạch trước' };

// ---------- hàm thuần (có bài kiểm) ----------

// Chia chữ dài thành nhiều tin (Telegram nhận tối đa 4096 ký tự một tin), cắt ở chỗ xuống dòng nếu được.
export function chiaTin(chu, toiDa = TIN_TOI_DA) {
  const s = String(chu || '').trim();
  if (!s) return [];
  const ra = [];
  let con = s;
  while (con.length > toiDa) {
    let cat = con.lastIndexOf('\n', toiDa);
    if (cat < toiDa * 0.5) cat = toiDa;
    ra.push(con.slice(0, cat).trimEnd());
    con = con.slice(cat).trimStart();
  }
  if (con) ra.push(con);
  return ra;
}

// Nút bấm trong Telegram mang dữ liệu ngắn (≤ 64 byte): "loại|mã|giá trị".
export function docNut(du) {
  const [loai, ma, gia] = String(du || '').split('|');
  if (!/^[qakpsmxroe]$/.test(loai || '')) return null;
  return { loai, ma: ma || '', gia: gia ?? '' };
}

const nut = (chu, du) => ({ text: chu, callback_data: du });

// Tên model để hiện: "Mặc định (Opus 5.5)", "Sonnet 5.5"…; gia là bí danh, mã đầy đủ hay 'default'.
function tenMoHinh(ds, gia) {
  const m = ds.find((x) => x.gia === gia) || ds.find((x) => x.gia !== 'default' && x.that === gia);
  if (gia === 'default') {
    const tro = m && ds.find((x) => x.gia !== 'default' && x.that && x.that === m.that);
    return tro ? `Mặc định (${tro.ten})` : 'Mặc định';
  }
  return m ? m.ten : gia;
}

const TEN_EFFORT = { '': 'Mặc định', low: 'Thấp (low)', medium: 'Vừa (medium)', high: 'Cao (high)', xhigh: 'Rất cao (xhigh)', max: 'Tối đa (max)' };

function dongMoHinh(ds, gia) {
  return ds.find((x) => x.gia === gia) || ds.find((x) => x.gia !== 'default' && x.that === gia);
}

// Các mức effort của một model; chưa biết model thì cho đủ các mức (văn phòng sẽ kiểm).
function mucEffort(ds, gia) {
  const m = dongMoHinh(ds, gia);
  return m ? m.effort || [] : MUC_EFFORT;
}

// Tên một mức effort; mức mặc định ghi kèm mức Claude Code tự dùng cho model đó, vd. "Mặc định (medium)".
function tenEffort(ds, gia, e) {
  if (e) return TEN_EFFORT[e] || e;
  const md = dongMoHinh(ds, gia)?.effortMacDinh;
  return md ? `Mặc định (${md})` : 'Mặc định';
}

// Lỗi mạng của fetch chỉ báo "fetch failed"; lý do thật nằm ở e.cause (vd. ENOTFOUND, UND_ERR_CONNECT_TIMEOUT).
function moTaLoi(e) {
  const c = e?.cause;
  return (e?.message || String(e)) + (c ? ` (${c.code || c.message || c})` : '');
}

function moHinhLuu(m) {
  try {
    return kiemMoHinh(m);
  } catch {
    return '';
  }
}

// Tin báo một lời xin quyền / câu hỏi / kế hoạch, kèm nút bấm.
export function soanDuyet(phien, d) {
  const dau = `🙋 ${phien.ten} · ${phien.duAn}`;
  if (d.loai === 'hoi') {
    const q = d.cauHoi?.[0];
    const motCau = d.cauHoi?.length === 1 && q && !q.multiSelect && q.options.length;
    const dong = [dau, '', `❓ ${q?.question || d.chu}`];
    if (motCau) q.options.forEach((o, i) => dong.push(`${i + 1}. ${o.label}${o.description ? ' — ' + o.description : ''}`));
    const ban = motCau ? q.options.map((o, i) => [nut(`${i + 1}. ${rutGon(o.label, 40)}`, `a|${d.ma}|${i}`)]) : [];
    ban.push([nut('✍️ Trả lời bằng chữ', `a|${d.ma}|chu`)]);
    if (!motCau) dong.push('', 'Câu hỏi nhiều phần: trả lời bằng chữ, hoặc mở văn phòng trên web.');
    return { chu: dong.join('\n'), banPhim: ban };
  }
  if (d.loai === 'keHoach') {
    return {
      chu: [dau, '', '📋 Claude trình kế hoạch:', '', rutGon(d.keHoach || '', 3000)].join('\n'),
      banPhim: [
        [nut('✅ Duyệt, hỏi trước khi sửa', `k|${d.ma}|d`)],
        [nut('⚡ Duyệt, chế độ Tự động', `k|${d.ma}|a`)],
        [nut('✍️ Chưa duyệt, sửa lại…', `k|${d.ma}|n`)],
      ],
    };
  }
  const dong = [dau, '', d.chu];
  if (d.moTa) dong.push(d.moTa);
  if (d.chiTiet && d.chiTiet !== d.chu) dong.push('', d.chiTiet);
  if (d.lyDo) dong.push('', 'Lý do: ' + d.lyDo);
  const hang = [nut('✅ Cho phép', `q|${d.ma}|y`), nut('❌ Từ chối', `q|${d.ma}|n`)];
  const ban = [hang];
  if (d.coLuon) ban.push([nut('♾ Luôn cho phép trong phiên này', `q|${d.ma}|l`)]);
  return { chu: dong.join('\n'), banPhim: ban };
}

export const GIUP = [
  'Văn phòng Claude trên Telegram:',
  '• Nhắn việc cần làm (gõ, đọc chính tả, kèm ảnh hay tệp) → chọn dự án → giao.',
  '• Trả lời (reply) tin của một phiên để nhắn tiếp phiên đó.',
  '• Cần duyệt thì bot gửi tin có nút Cho phép / Từ chối.',
  '/phien — các phiên trong văn phòng, chọn để chat',
  '/moi — tin tiếp theo là việc mới',
  '/dung — dừng phiên đang chat',
  '/xoa — xoá một phiên khỏi văn phòng',
  '/mucdung — mức dùng gói Claude',
  '/chedo — chế độ quyền cho việc mới',
  '/model — chọn model (Opus, Sonnet…)',
  '/effort — Claude nghĩ kỹ tới đâu (low … max)',
].join('\n');

// ---------- đọc token ----------

export function docTokenKeychain() {
  if (process.env.VPC_TELEGRAM_TOKEN) return Promise.resolve(process.env.VPC_TELEGRAM_TOKEN.trim());
  return new Promise((xong) => {
    execFile('/usr/bin/security', ['find-generic-password', '-s', DICH_VU_KEYCHAIN, '-a', os.userInfo().username, '-w'], { timeout: 8000, killSignal: 'SIGKILL' }, (loi, out) =>
      xong(loi ? '' : String(out || '').trim()),
    );
  });
}

export function tokenHopLe(t) {
  return /^\d{5,}:[A-Za-z0-9_-]{30,}$/.test(String(t || ''));
}

// ---------- bot ----------

export class BotTelegram {
  // quanLy: lib/phien-vp.js; layAnh: () => ảnh chụp trạng thái văn phòng; dsThuMuc: () => dự án; tepLuu: nơi lưu
  // tài khoản đã ghép. goiApi / taiTep / docToken thay được khi chạy bài kiểm.
  constructor({ quanLy, layAnh = async () => ({ phien: [] }), dsThuMuc = async () => [], tepLuu, docToken = docTokenKeychain, goiApi = null, taiTep = null }) {
    this.ql = quanLy;
    this.layAnh = layAnh;
    this.dsThuMuc = dsThuMuc;
    this.tepLuu = tepLuu;
    this.docToken = docToken;
    this._goiApi = goiApi;
    this._taiTep = taiTep;
    this.token = '';
    this.bot = '';
    this.loi = '';
    this.chu = null; // { id, chatId, ten, cheDo }
    this.maGhep = null;
    this.saiMa = 0;
    this.nhacCuoi = 0;
    this.offset = 0;
    this.dangChay = false;
    this.dangChat = null; // phiên đang chat (tin thường gửi vào đây)
    this.choViec = null; // việc mới đang chờ chọn dự án { chu, kem }
    this.choChu = null; // đang chờ bạn gõ: { loai: 'gopY' | 'traLoi', id, ma, cauHoi }
    this.tinCuaPhien = new Map(); // message_id → id phiên (reply để nhắn tiếp)
    this.tinCuaDuyet = new Map(); // mã lời hỏi → { message_id, chu }
    this.dsDuAn = [];
    this.appDaBao = new Set();
    this.ganSuKien();
  }

  // ---------- trạng thái cho trang văn phòng ----------
  trangThai() {
    if (!this.token) return { co: false, loi: this.loi };
    const r = { co: true, bot: this.bot, loi: this.loi, chu: this.chu ? { ten: this.chu.ten } : null };
    if (!this.chu) {
      const g = this._maHienTai();
      r.ghep = { ma: g.ma, het: g.het, link: this.bot ? `https://t.me/${this.bot.replace(/^@/, '')}?start=${g.ma}` : '' };
    }
    return r;
  }

  _maHienTai() {
    if (!this.maGhep || this.maGhep.het < Date.now()) this.maGhep = { ma: String(crypto.randomInt(100000, 1000000)), het: Date.now() + MA_SONG };
    return this.maGhep;
  }

  maMoi() {
    this.maGhep = null;
    this.saiMa = 0;
    return this._maHienTai();
  }

  async ngat() {
    this.chu = null;
    this.dangChat = null;
    this.maMoi();
    await this._luu();
  }

  async _napChu() {
    try {
      const d = JSON.parse(await fsp.readFile(this.tepLuu, 'utf8'));
      if (Number.isSafeInteger(d?.id) && Number.isSafeInteger(d?.chatId)) {
        this.chu = { id: d.id, chatId: d.chatId, ten: String(d.ten || ''), cheDo: TEN_CHE_DO[d.cheDo] ? d.cheDo : 'auto', moHinh: moHinhLuu(d.moHinh), effort: MUC_EFFORT.includes(d.effort) ? d.effort : '' };
        this.dangChat = typeof d.dangChat === 'string' && /^vp_[\w-]{1,80}$/.test(d.dangChat) ? d.dangChat : null;
      }
    } catch {}
  }

  // Lưu tài khoản đã ghép cùng phiên đang chat (khởi động lại máy chủ thì bot vẫn nhớ). Lần lưu nối đuôi nhau.
  _luu() {
    this.hangLuu = (this.hangLuu || Promise.resolve()).then(async () => {
      try {
        await fsp.mkdir(path.dirname(this.tepLuu), { recursive: true });
        if (!this.chu) await fsp.rm(this.tepLuu, { force: true });
        else await fsp.writeFile(this.tepLuu, JSON.stringify({ ...this.chu, dangChat: this.dangChat }, null, 2), { mode: 0o600 });
      } catch (e) {
        console.error('Telegram: không lưu được tài khoản đã ghép:', e.message);
      }
    });
    return this.hangLuu;
  }

  _chatVoi(id) {
    if (this.dangChat === id) return;
    this.dangChat = id;
    this._luu();
  }

  // ---------- chạy ----------
  async batDau() {
    await this._napChu();
    const thu = async () => {
      if (this.dangChay) return;
      const t = await this.docToken();
      if (!tokenHopLe(t)) {
        this.token = '';
        this.loi = t ? 'Token bot không đúng dạng' : '';
        return;
      }
      this.token = t;
      try {
        const toi = await this.api('getMe', {});
        this.bot = '@' + toi.username;
        this.loi = '';
        this.dangChay = true;
        this._vong().finally(() => (this.dangChay = false));
      } catch (e) {
        this.loi = e.ma === 401 ? 'Token bot sai hoặc đã bị thu hồi' : 'Chưa nối được Telegram: ' + e.message;
      }
    };
    await thu();
    setInterval(thu, 60e3).unref();
  }

  async api(phuongThuc, thamSo, choMs = 20e3) {
    if (this._goiApi) return this._goiApi(phuongThuc, thamSo);
    const r = await fetch(`https://api.telegram.org/bot${this.token}/${phuongThuc}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(thamSo),
      signal: AbortSignal.timeout(choMs),
    });
    const du = await r.json().catch(() => ({}));
    if (!du.ok) {
      const e = new Error(du.description || `HTTP ${r.status}`);
      e.ma = du.error_code || r.status;
      throw e;
    }
    return du.result;
  }

  async _vong() {
    while (this.token) {
      try {
        const ds = await this.api('getUpdates', { offset: this.offset, timeout: 50, allowed_updates: ['message', 'callback_query'] }, 65e3);
        for (const u of ds) {
          this.offset = u.update_id + 1;
          await this.xuLy(u).catch((e) => console.error(`${new Date().toISOString()} Telegram: lỗi xử lý tin: ${moTaLoi(e)}`));
        }
        if (this.dangLoiVong) console.error(`${new Date().toISOString()} Telegram: hỏi tin mới được trở lại`);
        this.dangLoiVong = false;
      } catch (e) {
        if (e.ma === 401) {
          this.loi = 'Token bot sai hoặc đã bị thu hồi';
          this.token = '';
          return;
        }
        // Ghi lần lỗi đầu (không ghi mỗi 5 giây một dòng).
        if (!this.dangLoiVong) console.error(`${new Date().toISOString()} Telegram: không hỏi được tin mới: ${moTaLoi(e)}`);
        this.dangLoiVong = true;
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  // Trả lời người nhắn lúc bot chưa ghép; cách nhau ít nhất 3 giây để không bị lợi dụng gửi dồn.
  async _nhacGhep(chatId, chu) {
    if (Date.now() - this.nhacCuoi < 3000) return null;
    this.nhacCuoi = Date.now();
    return this.api('sendMessage', { chat_id: chatId, text: chu });
  }

  async gui(chu, them = {}) {
    if (!this.chu) return null;
    let cuoi = null;
    const phan = chiaTin(chu);
    for (let i = 0; i < phan.length; i++) {
      const laCuoi = i === phan.length - 1;
      cuoi = await this.api('sendMessage', { chat_id: this.chu.chatId, text: phan[i], disable_web_page_preview: true, ...(laCuoi ? them : {}) });
    }
    return cuoi;
  }

  // ---------- tin tới ----------
  async xuLy(u) {
    if (u.callback_query) return this._xuLyNut(u.callback_query);
    const m = u.message;
    if (!m || m.chat?.type !== 'private') return;
    const chu = String(m.text || m.caption || '').trim();
    // Chưa ghép: chỉ nhận mã ghép, gửi theo nút Start ("/start <mã>") hay gõ riêng 6 số. Mã chỉ có sau khi trang
    // văn phòng mở hộp 📱 (không tự sinh mã ở đây), sai 5 lần thì bỏ mã.
    if (!this.chu) {
      const ma = /^(?:\/start(?:@\w+)?\s+)?(\d{6})$/.exec(chu)?.[1];
      const g = this.maGhep && this.maGhep.het > Date.now() ? this.maGhep : null;
      if (!ma || !g || ma !== g.ma) {
        if (ma && ++this.saiMa >= 5) {
          this.maGhep = null;
          this.saiMa = 0;
        }
        return this._nhacGhep(
          m.chat.id,
          ma ? 'Mã không đúng hoặc đã hết hạn. Xem mã mới trong hộp 📱 trên trang văn phòng rồi gửi lại.' : 'Bot này chưa ghép với văn phòng. Trên trang văn phòng, bấm 📱 rồi gửi cho bot mã 6 số hiện ở đó.',
        );
      }
      this.chu = { id: m.from.id, chatId: m.chat.id, ten: m.from.username ? '@' + m.from.username : m.from.first_name || 'bạn', cheDo: 'auto' };
      this.maGhep = null;
      this.saiMa = 0;
      await this._luu();
      return this.gui('Đã nối với văn phòng Claude trên máy của bạn. ✅\n\n' + GIUP);
    }
    if (m.from?.id !== this.chu.id) return; // không phải chủ: bỏ qua
    if (m.voice || m.audio || m.video_note) return this.gui('Bot chưa nghe được tin thoại. Bấm nút micro trên bàn phím để đọc chính tả thành chữ rồi gửi.');

    if (/^\/(start|giup|help)\b/.test(chu)) return this.gui(GIUP);
    if (/^\/phien\b/.test(chu)) return this._dsPhien();
    if (/^\/moi\b/.test(chu)) {
      this._chatVoi(null);
      this.choChu = null;
      return this.gui('Gửi việc cần làm (kèm ảnh hay tệp nếu có), mình sẽ hỏi giao cho dự án nào.');
    }
    if (/^\/dung\b/.test(chu)) {
      if (!this.dangChat) return this.gui('Chưa chọn phiên nào. /phien để chọn.');
      await this.ql.dung(this.dangChat).catch(() => {});
      return this.gui('■ Đã bảo phiên dừng.');
    }
    if (/^\/xoa\b/.test(chu)) return this._dsXoa();
    if (/^\/mucdung\b/.test(chu)) return this._mucDung();
    if (/^\/model\b/.test(chu)) return this._chonMoHinh();
    if (/^\/effort\b/.test(chu)) return this._chonEffort();
    if (/^\/chedo\b/.test(chu)) {
      return this.gui(`Chế độ cho việc mới: ${TEN_CHE_DO[this.chu.cheDo]}. Chọn:`, {
        reply_markup: { inline_keyboard: Object.entries(TEN_CHE_DO).map(([k, v]) => [nut((k === this.chu.cheDo ? '● ' : '') + v, `m||${k}`)]) },
      });
    }

    const kem = await this._layKem(m);
    if (!chu && !kem.anh.length && !kem.tep.length) return;

    // Đang chờ bạn gõ góp ý kế hoạch / câu trả lời.
    if (this.choChu && !kem.anh.length && !kem.tep.length) {
      const c = this.choChu;
      this.choChu = null;
      if (c.loai === 'gopY') return this._traLoi(c.id, { ma: c.ma, choPhep: false, loiNhan: chu });
      return this._traLoi(c.id, { ma: c.ma, choPhep: true, answers: { [c.cauHoi]: chu } });
    }
    // Trả lời (reply) tin của một phiên: nhắn tiếp phiên đó.
    const idReply = m.reply_to_message && this.tinCuaPhien.get(m.reply_to_message.message_id);
    const id = idReply || this.dangChat;
    if (id && this.ql.ds.has(id)) {
      this._chatVoi(id);
      try {
        await this.ql.gui(id, chu, kem);
        return this.gui(`↪ Đã gửi cho “${this.ql.ds.get(id).ten}”.`);
      } catch (e) {
        return this.gui('Không gửi được: ' + e.message);
      }
    }
    // Việc mới: hỏi dự án.
    this.choViec = { chu, kem };
    this.dsDuAn = (await this.dsThuMuc()).slice(0, 8);
    if (!this.dsDuAn.length) return this.gui('Chưa thấy dự án nào. Mở văn phòng trên web để giao việc lần đầu.');
    return this.gui('Giao cho dự án nào?', {
      reply_markup: { inline_keyboard: [...this.dsDuAn.map((t, i) => [nut(t.ten, `p||${i}`)]), [nut('Huỷ', 'x||')]] },
    });
  }

  // Ảnh / tệp gửi kèm: tải về từ Telegram rồi đưa vào phần đính kèm như trên web.
  async _layKem(m) {
    const kem = { anh: [], tep: [] };
    try {
      if (m.photo?.length) {
        const lon = m.photo[m.photo.length - 1];
        const buf = await this.taiTep(lon.file_id);
        kem.anh.push({ loai: 'image/jpeg', du: buf.toString('base64'), nho: '' });
      } else if (m.document) {
        if ((m.document.file_size || 0) > 20 * 1024 * 1024) throw new Error('Tệp lớn quá 20 MB');
        const buf = await this.taiTep(m.document.file_id);
        const laAnh = /^image\/(jpeg|png|gif|webp)$/.test(m.document.mime_type || '');
        if (laAnh) kem.anh.push({ loai: m.document.mime_type, du: buf.toString('base64'), nho: '' });
        else kem.tep.push({ ten: m.document.file_name || 'tep', du: buf.toString('base64') });
      }
    } catch (e) {
      await this.gui('Không lấy được ảnh/tệp: ' + e.message);
    }
    return kem;
  }

  async taiTep(fileId) {
    if (this._taiTep) return this._taiTep(fileId);
    const f = await this.api('getFile', { file_id: fileId });
    const r = await fetch(`https://api.telegram.org/file/bot${this.token}/${f.file_path}`, { signal: AbortSignal.timeout(60e3) });
    if (!r.ok) throw new Error('Telegram không trả tệp');
    return Buffer.from(await r.arrayBuffer());
  }

  // ---------- nút bấm ----------
  async _xuLyNut(cb) {
    if (!this.chu || cb.from?.id !== this.chu.id) return this.api('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    await this.api('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    const n = docNut(cb.data);
    if (!n) return;
    const tinNut = cb.message?.message_id;
    if (n.loai === 'x') {
      this.choViec = null;
      return this._suaTin(tinNut, '✖ Đã huỷ.');
    }
    if (n.loai === 'r') return this._xoaPhien(n, tinNut);
    if (n.loai === 'o') return this._datMoHinh(n, tinNut);
    if (n.loai === 'e') return this._datEffort(n, tinNut);
    if (n.loai === 'm') {
      if (!TEN_CHE_DO[n.gia]) return;
      this.chu.cheDo = n.gia;
      await this._luu();
      return this._suaTin(tinNut, `Chế độ cho việc mới: ${TEN_CHE_DO[n.gia]}.`);
    }
    if (n.loai === 'p') {
      const da = this.dsDuAn[Number(n.gia)];
      const viec = this.choViec;
      if (!da || !viec) return this._suaTin(tinNut, 'Việc này đã giao hoặc đã huỷ.');
      this.choViec = null;
      try {
        const id = await this.ql.tao({ cwd: da.duong, loiNhan: viec.chu, cheDo: this.chu.cheDo, moHinh: this.chu.moHinh || '', effort: this.chu.effort || '', anh: viec.kem.anh, tep: viec.kem.tep });
        this._chatVoi(id);
        await this._suaTin(tinNut, `✅ Đã giao cho ${da.ten} (${TEN_CHE_DO[this.chu.cheDo]}). Mình báo khi cần duyệt hay xong.`);
      } catch (e) {
        await this._suaTin(tinNut, 'Không giao được: ' + e.message);
      }
      return;
    }
    if (n.loai === 's') {
      const p = this.ql.ds.get(n.ma);
      if (!p) return this.gui('Phiên này không còn.');
      this._chatVoi(p.id);
      return this.gui(`💬 Đang chat với “${p.ten}”. Gửi tin để nhắn tiếp; /moi để giao việc mới.`);
    }
    // Trả lời lời hỏi.
    const ct = this.ql.chiTietDuyet(n.ma);
    const id = ct?.id;
    if (!id) return this._suaTin(tinNut, (this.tinCuaDuyet.get(n.ma)?.chu || 'Lời hỏi') + '\n\n(Đã trả lời hoặc đã huỷ.)');
    if (n.loai === 'q') return this._traLoi(id, { ma: n.ma, choPhep: n.gia !== 'n', luon: n.gia === 'l' });
    if (n.loai === 'k') {
      if (n.gia === 'n') {
        this.choChu = { loai: 'gopY', id, ma: n.ma };
        return this.gui('✍️ Gửi góp ý để Claude sửa lại kế hoạch:');
      }
      return this._traLoi(id, { ma: n.ma, choPhep: true, cheDoSau: n.gia === 'a' ? 'auto' : 'default' });
    }
    if (n.loai === 'a') {
      const q = ct.duyet.cauHoi?.[0];
      if (n.gia === 'chu' || !q) {
        this.choChu = { loai: 'traLoi', id, ma: n.ma, cauHoi: q?.question || '' };
        return this.gui('✍️ Gõ câu trả lời của bạn:');
      }
      const o = q.options[Number(n.gia)];
      if (!o) return;
      return this._traLoi(id, { ma: n.ma, choPhep: true, answers: { [q.question]: o.label } });
    }
  }

  async _traLoi(id, tl) {
    try {
      this.ql.traLoi(id, tl);
    } catch (e) {
      await this.gui('Không trả lời được: ' + e.message);
    }
  }

  // Sửa tin đã gửi; banPhim là hàng nút mới (mặc định bỏ hết nút).
  async _suaTin(messageId, chu, banPhim = []) {
    if (!messageId) return this.gui(chu, banPhim.length ? { reply_markup: { inline_keyboard: banPhim } } : {});
    const chuSua = chu.length > 4000 ? chu.slice(0, 3999) + '…' : chu; // giữ xuống dòng (rutGon gộp thành một dòng)
    await this.api('editMessageText', { chat_id: this.chu.chatId, message_id: messageId, text: chuSua, reply_markup: { inline_keyboard: banPhim } }).catch(() => {});
  }

  async _dsPhien() {
    const ds = [...this.ql.ds.values()].sort((a, b) => (b.hoatDongCuoi || 0) - (a.hoatDongCuoi || 0)).slice(0, 10);
    if (!ds.length) return this.gui('Văn phòng chưa có phiên nào. Gửi một việc để bắt đầu.');
    const bieu = { lam: '🟢', cho: '🟡', loi: '🔴', xong: '⚪' };
    return this.gui('Phiên trong văn phòng (bấm để chat; /xoa để xoá bớt):', {
      reply_markup: { inline_keyboard: ds.map((p) => [nut(`${bieu[p.trangThai] || '⚪'} ${rutGon(p.ten, 40)}${p.id === this.dangChat ? ' ●' : ''}`, `s|${p.id}|`)]) },
    });
  }

  // Xoá phiên khỏi văn phòng, như nút "Xoá khỏi văn phòng" trên web: hỏi lại trước khi xoá; phiên đang làm thì
  // dừng. Nhật ký phiên vẫn còn trong ~/.claude/projects.
  async _dsXoa() {
    const ds = [...this.ql.ds.values()].sort((a, b) => (b.hoatDongCuoi || 0) - (a.hoatDongCuoi || 0)).slice(0, 10);
    if (!ds.length) return this.gui('Văn phòng chưa có phiên nào.');
    return this.gui('Xoá phiên nào khỏi văn phòng?', {
      reply_markup: { inline_keyboard: [...ds.map((p) => [nut(`🗑 ${rutGon(p.ten, 40)}${p.id === this.dangChat ? ' ●' : ''}`, `r|${p.id}|`)]), [nut('Huỷ', 'r||n')]] },
    });
  }

  async _xoaPhien({ ma: id, gia }, tinNut) {
    if (gia === 'n') return this._suaTin(tinNut, 'Không xoá phiên nào.');
    const p = id && this.ql.ds.get(id);
    if (!p) return this._suaTin(tinNut, 'Phiên này không còn.');
    const ten = rutGon(p.ten, 60);
    if (gia !== 'y') return this._suaTin(tinNut, `Xoá “${ten}” khỏi văn phòng?\nPhiên đang làm sẽ dừng. Nhật ký phiên vẫn còn trên Mac.`, [[nut('🗑 Xoá', `r|${id}|y`), nut('Huỷ', `r|${id}|n`)]]);
    try {
      this.ql.dong(id, true);
    } catch (e) {
      return this._suaTin(tinNut, 'Không xoá được: ' + e.message);
    }
    if (this.dangChat === id) this._chatVoi(null);
    return this._suaTin(tinNut, `🗑 Đã xoá “${ten}” khỏi văn phòng.`);
  }

  // Chọn model cho việc mới, và cho cả phiên đang chat nếu có. Chỉ hiện các bí danh (Mặc định, Opus, Fable,
  // Sonnet, Haiku); bản cụ thể chọn trên web.
  async _chonMoHinh() {
    let ds;
    try {
      ds = await this.ql.danhSachMoHinh();
    } catch (e) {
      return this.gui('Chưa lấy được danh sách model: ' + e.message);
    }
    const p = this.dangChat && this.ql.ds.get(this.dangChat);
    const chinh = ds.filter((m) => !m.gia.startsWith('claude-'));
    const dang = this.chu.moHinh || 'default';
    const dong = [`Model cho việc mới: ${tenMoHinh(ds, dang)}.`];
    if (p) dong.push(`Phiên đang chat “${rutGon(p.ten, 40)}”: ${tenMoHinh(ds, p.moHinh || 'default')}.`);
    dong.push('', ...chinh.map((m) => `• ${tenMoHinh(ds, m.gia)}: ${m.gia === 'default' ? m.moTa.replace(/^.*?·\s*/, '') : m.moTa}`), '', p ? 'Chọn model (áp dụng cho việc mới và phiên đang chat):' : 'Chọn model cho việc mới:');
    const ban = chinh.map((m) => [nut((m.gia === dang ? '● ' : '') + tenMoHinh(ds, m.gia), `o|${p ? p.id : ''}|${m.gia}`)]).filter(([b]) => Buffer.byteLength(b.callback_data) <= 64);
    return this.gui(dong.join('\n'), { reply_markup: { inline_keyboard: ban } });
  }

  async _datMoHinh({ ma: id, gia }, tinNut) {
    let mh;
    try {
      mh = kiemMoHinh(gia);
    } catch {
      return;
    }
    const ds = await this.ql.danhSachMoHinh().catch(() => []);
    const ten = tenMoHinh(ds, mh || 'default');
    this.chu.moHinh = mh;
    await this._luu();
    let them = '';
    const p = id && this.ql.ds.get(id);
    if (p) {
      try {
        await this.ql.doiMoHinh(id, mh);
        them = `\nPhiên “${rutGon(p.ten, 40)}” cũng chuyển sang model này.`;
      } catch (e) {
        them = '\nKhông đổi được model của phiên đang chat: ' + e.message;
      }
    }
    return this._suaTin(tinNut, `Model cho việc mới: ${ten}.${them}`);
  }

  // Chọn effort cho việc mới, và cho cả phiên đang chat nếu có. Các mức theo model của phiên đó (hay model cho
  // việc mới).
  async _chonEffort() {
    const ds = await this.ql.danhSachMoHinh().catch(() => []);
    const p = this.dangChat && this.ql.ds.get(this.dangChat);
    const mh = (p ? p.moHinh : this.chu.moHinh) || 'default';
    const muc = mucEffort(ds, mh);
    if (!muc.length) return this.gui(`Model ${tenMoHinh(ds, mh)} không có mức effort. Đổi model bằng /model.`);
    const dang = this.chu.effort || '';
    const dong = [`Effort cho việc mới: ${tenEffort(ds, this.chu.moHinh || 'default', dang)}.`];
    if (p) dong.push(`Phiên đang chat “${rutGon(p.ten, 40)}”: ${tenEffort(ds, p.moHinh || 'default', p.effort || '')}.`);
    dong.push('', 'Effort càng cao thì Claude nghĩ càng kỹ, nhưng chậm hơn và hao mức dùng hơn.', '', p ? 'Chọn (áp dụng cho việc mới và phiên đang chat):' : 'Chọn effort cho việc mới:');
    const ban = ['', ...muc].map((e) => [nut((e === dang ? '● ' : '') + tenEffort(ds, mh, e), `e|${p ? p.id : ''}|${e || 'default'}`)]);
    return this.gui(dong.join('\n'), { reply_markup: { inline_keyboard: ban } });
  }

  async _datEffort({ ma: id, gia }, tinNut) {
    let ef;
    try {
      ef = kiemEffort(gia);
    } catch {
      return;
    }
    const ds = await this.ql.danhSachMoHinh().catch(() => []);
    this.chu.effort = ef;
    await this._luu();
    let them = '';
    const p = id && this.ql.ds.get(id);
    if (p) {
      try {
        await this.ql.doiEffort(id, ef);
        them = `\nPhiên “${rutGon(p.ten, 40)}” cũng chuyển sang mức này.`;
      } catch (e) {
        them = '\nKhông đổi được effort của phiên đang chat: ' + e.message;
      }
    }
    return this._suaTin(tinNut, `Effort cho việc mới: ${tenEffort(ds, this.chu.moHinh || 'default', ef)}.${them}`);
  }

  async _mucDung() {
    const md = (await this.layAnh()).mucDung;
    if (!md?.namGio) return this.gui('Chưa có số mức dùng.');
    const hh = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dong = [`Giới hạn 5 giờ: ${Math.round(md.namGio.phanTram)}%${md.het ? ` · hết lúc ${hh(md.het.luc)}` : ''}`];
    if (md.tuan) dong.push(`Giới hạn tuần${md.tuan.ten ? ` (${md.tuan.ten})` : ''}: ${Math.round(md.tuan.phanTram)}%`);
    return this.gui(dong.join('\n'));
  }

  // ---------- sự kiện từ văn phòng → Telegram ----------
  ganSuKien() {
    const su = this.ql?.su;
    if (!su) return;
    const anToan = (f) => (...a) => Promise.resolve(this.token && this.chu ? f(...a) : null).catch((e) => console.error('Telegram: không gửi được:', e.message));
    su.on(
      'duyet',
      anToan(async ({ phien, duyet }) => {
        const { chu, banPhim } = soanDuyet(phien, duyet);
        const tin = await this.gui(chu, { reply_markup: { inline_keyboard: banPhim } });
        if (tin) {
          this.tinCuaDuyet.set(duyet.ma, { message_id: tin.message_id, chu });
          this.tinCuaPhien.set(tin.message_id, phien.id);
        }
      }),
    );
    su.on(
      'daTraLoi',
      anToan(async ({ ma, moTa }) => {
        const t = this.tinCuaDuyet.get(ma);
        if (!t) return;
        this.tinCuaDuyet.delete(ma);
        await this._suaTin(t.message_id, `${t.chu}\n\n→ ${moTa}`);
      }),
    );
    su.on(
      'xongLuot',
      anToan(async ({ phien, chu }) => {
        const tin = await this.gui(`✅ ${phien.ten} · xong lượt\n\n${chu || '(không có lời nhắn)'}\n\n↩ Trả lời tin này để nhắn tiếp.`);
        if (tin) this.tinCuaPhien.set(tin.message_id, phien.id);
      }),
    );
    su.on(
      'loi',
      anToan(async ({ phien, chu }) => {
        const tin = await this.gui(`⚠️ ${phien.ten}: ${chu}`);
        if (tin) this.tinCuaPhien.set(tin.message_id, phien.id);
      }),
    );
  }

  // Phiên của app Claude desktop vừa chuyển sang chờ bạn: nhắc (trả lời trong app). Gọi mỗi khi văn phòng đổi.
  async baoPhienApp(dsPhien) {
    const dangCho = new Set();
    for (const p of dsPhien || []) {
      if (p.vanPhong || p.trangThai !== 'cho') continue;
      const khoa = `${p.id}|${p.duyet?.chu || ''}`;
      dangCho.add(khoa);
      if (this.appDaBao.has(khoa)) continue;
      this.appDaBao.add(khoa);
      if (this.lanDauApp && this.token && this.chu) {
        await this.gui(`🙋 ${p.ten} · ${p.duAn} (app Claude) đang chờ bạn:\n${p.duyet?.chu || ''}\n\nTrả lời trong app Claude trên điện thoại (mục Code) hay trên Mac.`).catch(() => {});
      }
    }
    for (const k of this.appDaBao) if (!dangCho.has(k)) this.appDaBao.delete(k);
    this.lanDauApp = true; // lần đầu chỉ ghi nhớ, không báo dồn những phiên đã chờ từ trước
  }
}
