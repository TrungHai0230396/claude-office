// Điều khiển phiên do văn phòng chạy (Claude Agent SDK trên máy chủ): giao việc, nhắn tin, cho phép,
// trả lời câu hỏi, duyệt kế hoạch, dừng. Mọi lệnh kèm mã bí mật máy chủ chèn vào trang (thẻ meta
// vpc-khoa). Lời xin quyền chỉ được trả lời bằng cú bấm của bạn; không có gì tự cho phép.
const KHOA = document.querySelector('meta[name="vpc-khoa"]')?.content || '';
export const coDieuKhien = () => !!KHOA;
// Đang mở từ máy khác (điện thoại qua Tailscale): link claude:// chỉ mở được app Claude desktop trên Mac.
export const TU_XA = !['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

export const TEN_CHE_DO = { default: 'Hỏi trước', acceptEdits: 'Tự sửa tệp', auto: 'Tự động', plan: 'Lên kế hoạch trước' };

function el(the, lop, chu) {
  const e = document.createElement(the);
  if (lop) e.className = lop;
  if (chu !== undefined) e.textContent = chu;
  return e;
}

// ---------- Telegram ----------
// Hộp xem trạng thái bot Telegram: chưa có token thì chỉ cách tạo bot và cất token; có rồi thì hiện mã ghép
// (link mở thẳng bot); đã ghép thì cho ngắt.
export class HopTelegram {
  constructor() {
    this.hop = document.getElementById('hop-telegram');
    this.noiDung = this.hop.querySelector('.noi-dung-tg');
    this.baoLoi = this.hop.querySelector('.loi-hop');
    // Từ Telegram quay lại trang thì xem lại ngay: mã có thể đã đổi, hoặc đã ghép xong.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.hop.open) this.ve();
    });
  }

  async mo() {
    await this.ve();
    this.hop.showModal();
    clearInterval(this.hen);
    // Đang chờ ghép thì tự xem lại mỗi vài giây để thấy ngay khi đã nối.
    this.hen = setInterval(() => (this.hop.open ? this.ve() : clearInterval(this.hen)), 4000);
  }

  async ve() {
    let tt;
    try {
      tt = await lenh.telegram();
      this.baoLoi.classList.add('an');
    } catch (e) {
      this.baoLoi.textContent = e.message;
      this.baoLoi.classList.remove('an');
      return;
    }
    const ky = JSON.stringify(tt);
    if (ky === this.kyCu) return;
    this.kyCu = ky;
    const n = this.noiDung;
    n.textContent = '';
    const p = (chu, lop = '') => n.append(el('p', lop, chu));
    if (!tt.co) {
      p('Nối văn phòng với một bot Telegram riêng: báo ngay khi phiên cần duyệt (bấm Cho phép ngay trong Telegram), giao việc bằng tin nhắn hay ảnh. Nội dung đi qua máy chủ Telegram.', 'phu');
      if (tt.loi) p(tt.loi, 'canh-bao');
      const ol = el('ol', 'buoc');
      for (const b of [
        'Trong Telegram, mở @BotFather → /newbot → đặt tên và username (kết thúc bằng "bot").',
        'BotFather gửi lại token. Đừng gửi token cho ai.',
        'Trên Mac, chạy lệnh dưới trong Terminal, dán token khi được hỏi (hỏi 2 lần).',
      ])
        ol.append(el('li', '', b));
      n.append(ol);
      const lenhCat = el('code', 'lenh-tg', 'security add-generic-password -U -s claude-office-telegram -a "$USER" -w');
      n.append(lenhCat);
      p('Văn phòng tự nhận token trong vòng một phút.', 'phu');
      return;
    }
    if (tt.chu) {
      p(`✅ Đã nối bot ${tt.bot} với Telegram ${tt.chu.ten}.`);
      p('Bot báo khi phiên cần duyệt, xong lượt hay gặp lỗi. Nhắn việc cho bot để giao việc; /giup để xem lệnh.', 'phu');
      const b = nutBam('tu-choi', 'Ngắt Telegram', async (nb) => {
        nb.disabled = true;
        await lenh.telegramNgat().catch(() => {});
        this.kyCu = '';
        await this.ve();
      });
      n.append(b);
      return;
    }
    p(`Bot ${tt.bot} đã sẵn sàng. Còn bước ghép với tài khoản Telegram của bạn:`);
    const ol = el('ol', 'buoc');
    const li = el('li');
    if (tt.ghep?.link) {
      const a = el('a', '', 'Mở bot trong Telegram');
      a.href = tt.ghep.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.append(a, ', bấm Start (Bắt đầu) nếu Telegram hiện nút này.');
      ol.append(li);
    }
    const li2 = el('li');
    li2.append('Bot chưa báo "Đã nối" thì nhắn cho bot mã: ', el('code', 'lenh-tg ma-tg', tt.ghep?.ma || ''));
    ol.append(li2);
    n.append(ol);
    const phut = Math.max(1, Math.round(((tt.ghep?.het || Date.now()) - Date.now()) / 60e3));
    p(`Mã ghép dùng một lần, hết hạn sau ${phut} phút. Chỉ tài khoản gửi đúng mã mới điều khiển được bot.`, 'phu');
    n.append(
      nutBam('', 'Lấy mã mới', async () => {
        await lenh.telegramMaMoi().catch(() => {});
        this.kyCu = '';
        await this.ve();
      }),
    );
  }
}

// ---------- đính kèm ảnh, tệp ----------
// Ảnh được thu nhỏ ngay trên máy (cạnh dài ≤ 1568 điểm ảnh, JPEG) rồi gửi cho Claude xem; tệp khác gửi nguyên,
// máy chủ lưu vào thư mục của văn phòng và báo đường dẫn cho Claude đọc.
const CANH_ANH = 1568;
const TEP_TOI_DA = 20 * 1024 * 1024;

function moAnh(tep) {
  return new Promise((xong, hong) => {
    const url = URL.createObjectURL(tep);
    const i = new Image();
    i.onload = () => xong({ i, url });
    i.onerror = () => {
      URL.revokeObjectURL(url);
      hong(new Error('Không đọc được ảnh ' + tep.name));
    };
    i.src = url;
  });
}

async function docAnh(tep) {
  const { i, url } = await moAnh(tep);
  try {
    const ve = (canh, chatLuong) => {
      const ti = Math.min(1, canh / Math.max(i.naturalWidth, i.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(i.naturalWidth * ti));
      c.height = Math.max(1, Math.round(i.naturalHeight * ti));
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(i, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', chatLuong);
    };
    const lon = ve(CANH_ANH, 0.88);
    return { kieu: 'anh', ten: tep.name || 'anh.jpg', loai: 'image/jpeg', du: lon.slice(lon.indexOf(',') + 1), nho: ve(200, 0.72) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function docTep(tep) {
  if (tep.size > TEP_TOI_DA) throw new Error(`Tệp ${tep.name} lớn quá 20 MB`);
  const b = new Uint8Array(await tep.arrayBuffer());
  let s = '';
  for (let k = 0; k < b.length; k += 0x8000) s += String.fromCharCode(...b.subarray(k, k + 0x8000));
  return { kieu: 'tep', ten: tep.name || 'tep', du: btoa(s), co: tep.size };
}

export class KhayDinhKem {
  constructor(baoLoi = () => {}) {
    this.baoLoi = baoLoi;
    this.ds = [];
    this.goc = el('div', 'khay an');
    this.nhap = el('input');
    this.nhap.type = 'file';
    this.nhap.multiple = true;
    this.nhap.className = 'an';
    this.nut = el('button', 'nut nut-kem', '📎');
    this.nut.type = 'button';
    this.nut.title = 'Gửi kèm ảnh hay tệp (cũng dán được ảnh bằng ⌘V, hay kéo thả vào đây)';
    this.nut.setAttribute('aria-label', 'Đính kèm ảnh hay tệp');
    this.nut.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.nhap.click();
    });
    this.nhap.addEventListener('change', () => {
      this.them([...this.nhap.files]);
      this.nhap.value = '';
    });
  }

  // Cho phép dán ảnh và kéo thả tệp vào một ô.
  ganVao(o) {
    o.addEventListener('paste', (e) => {
      const tep = [...(e.clipboardData?.files || [])];
      if (tep.length) {
        e.preventDefault();
        this.them(tep);
      }
    });
    o.addEventListener('dragover', (e) => e.preventDefault());
    o.addEventListener('drop', (e) => {
      const tep = [...(e.dataTransfer?.files || [])];
      if (tep.length) {
        e.preventDefault();
        this.them(tep);
      }
    });
  }

  async them(dsTep) {
    for (const tep of dsTep) {
      const laAnh = /^image\//.test(tep.type);
      if ((laAnh && this.ds.filter((x) => x.kieu === 'anh').length >= 6) || (!laAnh && this.ds.filter((x) => x.kieu === 'tep').length >= 5)) {
        this.baoLoi(laAnh ? 'Mỗi lần gửi tối đa 6 ảnh' : 'Mỗi lần gửi tối đa 5 tệp');
        continue;
      }
      try {
        this.ds.push(laAnh ? await docAnh(tep) : await docTep(tep));
      } catch (e) {
        this.baoLoi(e.message);
      }
    }
    this._ve();
  }

  _ve() {
    this.goc.textContent = '';
    this.goc.classList.toggle('an', !this.ds.length);
    this.ds.forEach((x, k) => {
      const o = el('div', 'kem ' + x.kieu);
      if (x.kieu === 'anh') {
        const img = el('img');
        img.src = x.nho;
        img.alt = x.ten;
        o.append(img);
      } else o.append(el('span', 'ten-tep', '📄 ' + x.ten));
      const bo = el('button', 'bo-kem', '✕');
      bo.type = 'button';
      bo.title = 'Bỏ';
      bo.addEventListener('click', (e) => {
        e.stopPropagation();
        this.ds.splice(k, 1);
        this._ve();
      });
      o.append(bo);
      this.goc.append(o);
    });
  }

  coGi() {
    return this.ds.length > 0;
  }

  layRa() {
    return {
      anh: this.ds.filter((x) => x.kieu === 'anh').map(({ loai, du, nho }) => ({ loai, du, nho })),
      tep: this.ds.filter((x) => x.kieu === 'tep').map(({ ten, du }) => ({ ten, du })),
    };
  }

  xoaHet() {
    this.ds = [];
    this._ve();
  }
}

// ---------- nói thay gõ ----------
// Nhận giọng nói tiếng Việt bằng Web Speech API của trình duyệt (Safari, Chrome; trình duyệt gửi tiếng nói cho
// Apple/Google nhận dạng). Chữ nhận được điền vào ô để bạn xem lại rồi mới bấm gửi: việc giao đi là chạy lệnh
// thật trên máy, nghe nhầm một chữ là sai việc, nên không bao giờ tự gửi.
const NhanGiong = window.SpeechRecognition || window.webkitSpeechRecognition;
export const coGiongNoi = !!NhanGiong;
const LOI_GIONG = {
  'not-allowed': 'Trình duyệt chưa cho dùng micro. Cho phép micro cho trang này rồi bấm lại.',
  'service-not-allowed': 'Trình duyệt không cho nhận giọng nói ở đây. Dùng nút micro trên bàn phím điện thoại.',
  'no-speech': 'Không nghe thấy gì, bấm 🎤 rồi nói lại.',
  'audio-capture': 'Không tìm thấy micro.',
  network: 'Nhận giọng nói cần mạng Internet.',
};

export function nutNoi(oNhap, baoLoi = () => {}) {
  if (!coGiongNoi) return null;
  const b = el('button', 'nut nut-noi', '🎤');
  b.type = 'button';
  b.title = 'Nói thay gõ (tiếng Việt). Bấm lần nữa để dừng.';
  b.setAttribute('aria-label', 'Nói thay gõ');
  let nhan = null;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (nhan) return nhan.stop();
    nhan = new NhanGiong();
    nhan.lang = 'vi-VN';
    nhan.interimResults = true;
    nhan.continuous = true;
    const truoc = oNhap.value.trim() ? oNhap.value.replace(/\s*$/, ' ') : '';
    let chot = '';
    nhan.onresult = (ev) => {
      let tam = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) chot += ev.results[i][0].transcript;
        else tam += ev.results[i][0].transcript;
      }
      oNhap.value = truoc + chot + tam;
      oNhap.dispatchEvent(new Event('input'));
    };
    nhan.onerror = (ev) => baoLoi(LOI_GIONG[ev.error] || 'Không nhận được giọng nói (' + ev.error + ').');
    nhan.onend = () => {
      nhan = null;
      b.classList.remove('dang-nghe');
      b.textContent = '🎤';
      oNhap.focus();
    };
    try {
      nhan.start();
      b.classList.add('dang-nghe');
      b.textContent = '■';
    } catch (loi) {
      nhan = null;
      baoLoi('Không bật được micro: ' + (loi?.message || loi));
    }
  });
  return b;
}

function nutBam(lop, chu, lam) {
  const b = el('button', 'nut ' + lop, chu);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    lam(b);
  });
  return b;
}

async function goi(duong, than) {
  const r = await fetch(duong, {
    method: than === undefined ? 'GET' : 'POST',
    headers: { 'x-vpc-khoa': KHOA, ...(than === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: than === undefined ? undefined : JSON.stringify(than),
    cache: 'no-store',
  });
  let du = {};
  try {
    du = await r.json();
  } catch {}
  if (r.status === 403 && /mã của trang/.test(du.loi || '')) window.dispatchEvent(new Event('vpc-ma-cu'));
  if (!r.ok) {
    const e = new Error(du.loi || `Máy chủ trả lỗi ${r.status}`);
    e.quyen = !!du.quyen;
    throw e;
  }
  return du;
}

const duongPhien = (id, viec) => `/api/vp/phien/${encodeURIComponent(id)}/${viec}`;
export const lenh = {
  thuMuc: () => goi('/api/thu-muc'),
  tao: (thuMuc, loiNhan, cheDo, kem = {}) => goi('/api/vp/phien', { thuMuc, loiNhan, cheDo, ...kem }),
  gui: (id, loiNhan, kem = {}) => goi(duongPhien(id, 'gui'), { loiNhan, ...kem }),
  traLoi: (id, tl) => goi(duongPhien(id, 'tra-loi'), tl),
  dung: (id) => goi(duongPhien(id, 'dung'), {}),
  doiCheDo: (id, cheDo) => goi(duongPhien(id, 'che-do'), { cheDo }),
  doiMoHinh: (id, moHinh) => goi(duongPhien(id, 'mo-hinh'), { moHinh }),
  doiEffort: (id, effort) => goi(duongPhien(id, 'effort'), { effort }),
  moHinh: () => goi('/api/vp/mo-hinh'),
  dong: (id, xoa = false) => goi(duongPhien(id, 'dong'), { xoa }),
  hoiThoai: (id, tu) => goi(duongPhien(id, 'hoi-thoai') + '?tu=' + tu),
  telegram: () => goi('/api/vp/telegram'),
  telegramNgat: () => goi('/api/vp/telegram/ngat', {}),
  telegramMaMoi: () => goi('/api/vp/telegram/ma-moi', {}),
};

// ---------- model ----------
// Danh sách model tài khoản dùng được (máy chủ hỏi Claude Code, không tốn lượt). Lấy một lần cho cả trang.
let hoiMoHinh = null;
function layMoHinh() {
  hoiMoHinh ??= lenh
    .moHinh()
    .then((r) => r.ds || [])
    .catch((e) => {
      hoiMoHinh = null;
      throw e;
    });
  return hoiMoHinh;
}

// Đổ danh sách model vào ô chọn: bí danh (Opus, Sonnet…) trước, bản cụ thể vào nhóm "Bản khác". Giá trị ''
// là mặc định của Claude Code. Phiên đang dùng mã đầy đủ (vd. claude-opus-5-5) thì chọn bí danh trỏ tới mã đó.
function veChonMoHinh(chon, ds, dangChon) {
  chon.textContent = '';
  const them = (cha, gia, chu, moTa = '') => {
    const o = el('option', '', chu);
    o.value = gia;
    if (moTa) o.title = moTa;
    cha.append(o);
  };
  const chinh = ds.filter((m) => !m.gia.startsWith('claude-'));
  const khac = ds.filter((m) => m.gia.startsWith('claude-'));
  if (!chinh.some((m) => m.gia === 'default')) them(chon, '', 'Mặc định');
  for (const m of chinh) {
    const tro = m.gia === 'default' && ds.find((x) => x.gia !== 'default' && x.that && x.that === m.that);
    them(chon, m.gia === 'default' ? '' : m.gia, m.gia === 'default' ? (tro ? `Mặc định (${tro.ten})` : 'Mặc định') : m.ten, m.moTa);
  }
  if (khac.length) {
    const nhom = el('optgroup');
    nhom.label = 'Bản khác';
    for (const m of khac) them(nhom, m.gia, m.ten, m.moTa);
    chon.append(nhom);
  }
  let gia = dangChon || '';
  if (gia && !ds.some((m) => m.gia === gia)) {
    const khop = chinh.find((m) => m.gia !== 'default' && m.that === gia) || khac.find((m) => m.that === gia);
    if (khop) gia = khop.gia;
    else them(chon, gia, gia);
  }
  chon.value = gia;
}

// Effort (như /effort trong Claude Code): Claude nghĩ kỹ tới đâu. Mỗi model có các mức riêng (vài model không có).
const TEN_EFFORT = { low: 'Thấp (low)', medium: 'Vừa (medium)', high: 'Cao (high)', xhigh: 'Rất cao (xhigh)', max: 'Tối đa (max)' };

function dongMoHinh(ds, gia) {
  const g = gia || 'default';
  return ds.find((x) => x.gia === g) || ds.find((x) => x.gia !== 'default' && x.that === g);
}

// Các mức effort của một model ('' là mặc định); chưa có danh sách model thì cho đủ các mức, máy chủ sẽ kiểm.
function mucEffortCua(ds, gia) {
  const m = dongMoHinh(ds, gia);
  return m ? m.effort || [] : Object.keys(TEN_EFFORT);
}

// Nhãn dòng mặc định, kèm mức Claude Code tự dùng cho model đó, vd. "Mặc định (medium)".
function tenEffortMacDinh(ds, gia, dau = 'Mặc định') {
  const md = dongMoHinh(ds, gia)?.effortMacDinh;
  return md ? `${dau} (${md})` : dau;
}

function veChonEffort(chon, muc, dangChon, tenMacDinh = 'Mặc định') {
  chon.textContent = '';
  const them = (gia, chu) => {
    const o = el('option', '', chu);
    o.value = gia;
    chon.append(o);
  };
  them('', tenMacDinh);
  for (const e of muc) them(e, TEN_EFFORT[e] || e);
  if (dangChon && !muc.includes(dangChon)) them(dangChon, TEN_EFFORT[dangChon] || dangChon);
  chon.value = dangChon || '';
  chon.disabled = !muc.length && !dangChon;
  chon.title = chon.disabled ? 'Model này không có mức effort' : 'Effort: Claude nghĩ kỹ tới đâu. Cao hơn thì kỹ hơn, chậm hơn, hao mức dùng hơn.';
}

// Bấm một nút gửi lệnh: khoá nút trong lúc chờ, lỗi thì báo.
async function chayLenh(nuts, viec, baoLoi) {
  for (const n of nuts) n.disabled = true;
  try {
    await viec();
    return true;
  } catch (e) {
    baoLoi(e);
    for (const n of nuts) n.disabled = false;
    return false;
  }
}

// Markdown tối giản và an toàn (chỉ dựng nút DOM bằng textContent): đoạn mã ```, tiêu đề #, gạch đầu
// dòng, `mã`, **đậm**. Đủ cho câu trả lời và kế hoạch của Claude dễ đọc.
export function veMarkdown(chu) {
  const goc = document.createDocumentFragment();
  const dong = String(chu || '').split('\n');
  let i = 0;
  const trongDong = (cha, s) => {
    const phan = s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    for (const x of phan) {
      if (!x) continue;
      if (x.length > 2 && x.startsWith('`') && x.endsWith('`')) cha.append(el('code', '', x.slice(1, -1)));
      else if (x.length > 4 && x.startsWith('**') && x.endsWith('**')) cha.append(el('b', '', x.slice(2, -2)));
      else cha.append(x);
    }
  };
  let doan = null;
  while (i < dong.length) {
    const d = dong[i];
    if (/^\s*```/.test(d)) {
      const ma = [];
      i++;
      while (i < dong.length && !/^\s*```/.test(dong[i])) ma.push(dong[i++]);
      i++;
      goc.append(el('pre', '', ma.join('\n')));
      doan = null;
      continue;
    }
    const tieuDe = /^\s*#{1,6}\s+(.*)$/.exec(d);
    const dau = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/.exec(d);
    if (!d.trim()) doan = null;
    else if (tieuDe) {
      const h = el('div', 'md-tieu-de');
      trongDong(h, tieuDe[1]);
      goc.append(h);
      doan = null;
    } else if (dau) {
      const li = el('div', 'md-dau-dong');
      li.style.paddingLeft = 14 + Math.min(3, Math.floor(dau[1].length / 2)) * 14 + 'px';
      li.dataset.dau = /\d/.test(dau[2]) ? dau[2] : '•';
      trongDong(li, dau[3]);
      goc.append(li);
      doan = null;
    } else {
      if (!doan) {
        doan = el('p');
        goc.append(doan);
      } else doan.append('\n');
      trongDong(doan, d);
    }
    i++;
  }
  return goc;
}

// Link mở phiên Claude Code mới trong app Claude desktop, điền sẵn việc cần làm và thư mục (đúng kiểu link
// mục "New Claude Code Session Here" của Finder dùng). App mở phiên để bạn xem lại rồi chạy trong app.
export function linkMoTrongApp(viec, thuMucDayDu) {
  const q = new URLSearchParams();
  if (viec) q.set('q', viec);
  if (thuMucDayDu) q.set('folder', thuMucDayDu);
  return 'claude://code/new?' + q.toString();
}

// ---------- hộp giao việc mới ----------
// Hai nơi chạy: "Trong văn phòng" (phiên do máy chủ chạy, điều khiển trên trang; cần chế độ điều khiển) và
// "Mở trong app Claude" (như ban đầu: link claude://code/new, trả lời trong app).
export class HopGiaoViec {
  constructor({ khiTao, khiMoApp }) {
    this.khiTao = khiTao;
    this.khiMoApp = khiMoApp;
    this.coVanPhong = false;
    this.nha = '';
    this.dsThuMuc = [];
    this.hop = document.getElementById('hop-giao');
    this.form = this.hop.querySelector('form');
    this.chon = this.form.elements.thuMuc;
    this.khac = this.form.elements.thuMucKhac;
    this.viec = this.form.elements.loiNhan;
    const noi = nutNoi(this.viec, (chu) => this._loi(chu));
    if (noi) {
      noi.classList.add('nut-noi-hop');
      this.viec.after(noi);
    }
    this.kem = new KhayDinhKem((chu) => this._loi(chu));
    this.kem.nut.classList.add('nut-kem-hop');
    this.viec.after(this.kem.nut);
    this.viec.closest('label').after(this.kem.goc, this.kem.nhap);
    this.kem.ganVao(this.viec);
    try {
      this.viec.value = sessionStorage.getItem('vpc-giao-viec') || '';
    } catch {}
    this.viec.addEventListener('input', () => {
      try {
        sessionStorage.setItem('vpc-giao-viec', this.viec.value);
      } catch {}
    });
    this.baoLoi = this.hop.querySelector('.loi-hop');
    this.nutGiao = this.hop.querySelector('[data-viec="giao"]');
    this.chon.addEventListener('change', () => this._hienKhac());
    for (const r of this.form.querySelectorAll('input[name="noiChay"]')) r.addEventListener('change', () => this._hienNoiChay());
    this.hop.querySelector('[data-viec="huy"]').addEventListener('click', () => this.hop.close());
    this.viec.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) {
        e.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._giao();
    });
  }

  // Có điều khiển qua web không (máy chủ bật chế độ điều khiển và trang có mã bí mật). Mở từ điện thoại thì
  // không có lựa chọn mở trong app Claude desktop.
  datVanPhong(co) {
    this.coVanPhong = !!co;
    const r = this.form.querySelector('input[name="noiChay"][value="vanphong"]');
    const rApp = this.form.querySelector('input[name="noiChay"][value="app"]');
    r.disabled = !this.coVanPhong;
    rApp.disabled = TU_XA;
    rApp.closest('label').classList.toggle('an', TU_XA);
    if (!this.coVanPhong) rApp.checked = true;
    else if (TU_XA) r.checked = true;
    this.hop.querySelector('.tat-web').classList.toggle('an', this.coVanPhong);
    this._hienNoiChay();
  }

  _noiChay() {
    return this.coVanPhong ? this.form.elements.noiChay.value : 'app';
  }

  // Mở trong app thì chế độ quyền do app quyết, ẩn phần chọn chế độ.
  _hienNoiChay() {
    const app = this._noiChay() === 'app';
    this.form.querySelector('.che-do').classList.toggle('an', app);
    this.form.querySelector('.mo-hinh').classList.toggle('an', app);
    this.nutGiao.textContent = app ? 'Mở trong app Claude' : 'Giao việc';
  }

  _hienKhac() {
    const khac = this.chon.value === '__khac';
    this.khac.classList.toggle('an', !khac);
    if (khac) this.khac.focus();
  }

  async mo() {
    this.baoLoi.textContent = '';
    this.baoLoi.classList.add('an');
    try {
      const che = localStorage.getItem('vpc-che-do');
      const r = che && this.form.querySelector(`input[name="cheDo"][value="${che}"]`);
      if (r) r.checked = true;
    } catch {}
    this._napMoHinh();
    await this._napThuMuc();
    this.hop.showModal();
    this.viec.focus();
  }

  // Ô chọn model: hiện ngay lựa chọn lần trước, danh sách đầy đủ tới sau (lần đầu mất vài giây).
  async _napMoHinh() {
    const chon = this.form.elements.moHinh;
    const chonEf = this.form.elements.effort;
    let nho = '';
    let nhoEf = '';
    try {
      nho = localStorage.getItem('vpc-mo-hinh') || '';
      nhoEf = localStorage.getItem('vpc-effort') || '';
    } catch {}
    // Đổi model thì danh sách mức effort đổi theo (mức đang chọn mà model mới không có thì về mặc định).
    const veEf = (dang) => veChonEffort(chonEf, mucEffortCua(this.dsMoHinh || [], chon.value), dang, tenEffortMacDinh(this.dsMoHinh || [], chon.value, 'Effort mặc định'));
    chon.onchange = () => veEf(mucEffortCua(this.dsMoHinh || [], chon.value).includes(chonEf.value) ? chonEf.value : '');
    veChonMoHinh(chon, this.dsMoHinh || [], nho);
    veEf(nhoEf);
    if (this.dsMoHinh) return;
    try {
      this.dsMoHinh = await layMoHinh();
      const dangEf = chonEf.value || nhoEf;
      veChonMoHinh(chon, this.dsMoHinh, chon.value || nho);
      veEf(mucEffortCua(this.dsMoHinh, chon.value).includes(dangEf) ? dangEf : '');
    } catch {}
  }

  // Danh sách dự án đã thấy trong các phiên gần đây.
  async _napThuMuc() {
    let du = {};
    try {
      du = await lenh.thuMuc();
    } catch (e) {
      this._loi(e.message);
    }
    this.nutGiao.disabled = false;
    const ds = du.ds || [];
    this.dsThuMuc = ds;
    this.nha = du.nha || '';
    const dangChon = this.chon.value;
    let truoc = '';
    try {
      truoc = localStorage.getItem('vpc-thu-muc') || '';
    } catch {}
    // Nhóm "Gần đây" (dự án có phiên Claude mới đây) và "Tất cả" (mọi thư mục nằm cạnh chúng).
    this.chon.textContent = '';
    const nhom = (ten, dsCon) => {
      if (!dsCon.length) return;
      const g = el('optgroup');
      g.label = ten;
      for (const t of dsCon) {
        const o = el('option', '', t.ganDay === false ? t.ten : `${t.ten} — ${t.duong}`);
        o.value = t.duong;
        o.title = t.duong;
        g.append(o);
      }
      this.chon.append(g);
    };
    nhom('Gần đây', ds.filter((t) => t.ganDay !== false));
    const conLai = ds.filter((t) => t.ganDay === false);
    const chaChung = [...new Set(conLai.map((t) => t.duong.slice(0, t.duong.lastIndexOf('/'))))];
    nhom(chaChung.length === 1 ? `Tất cả trong ${chaChung[0]}` : 'Tất cả dự án', conLai);
    const o = el('option', '', 'Thư mục khác…');
    o.value = '__khac';
    this.chon.append(o);
    // Giữ lựa chọn đang có hay lần trước nếu còn trong danh sách; không thì lấy dự án gần nhất.
    const muon = dangChon && dangChon !== '__khac' ? dangChon : truoc;
    if (muon && ds.some((t) => t.duong === muon)) this.chon.value = muon;
    else if (ds.length) this.chon.value = ds[0].duong;
    else this.chon.value = '__khac';
    this._hienKhac();
  }

  // Đường dẫn đầy đủ cho link của app (~ đổi thành thư mục nhà).
  _dayDu(thuMuc) {
    const co = this.dsThuMuc.find((t) => t.duong === thuMuc);
    if (co?.tuyetDoi) return co.tuyetDoi;
    if ((thuMuc === '~' || thuMuc.startsWith('~/')) && this.nha) return this.nha + thuMuc.slice(1);
    return thuMuc;
  }

  async _giao() {
    const thuMuc = this.chon.value === '__khac' ? this.khac.value.trim() : this.chon.value;
    const loiNhan = this.viec.value.trim();
    const cheDo = this.form.elements.cheDo.value || 'default';
    const moHinh = this.form.elements.moHinh.value || '';
    const effort = this.form.elements.effort.value || '';
    try {
      localStorage.setItem('vpc-che-do', cheDo);
      localStorage.setItem('vpc-mo-hinh', moHinh);
      localStorage.setItem('vpc-effort', effort);
    } catch {}
    if (!thuMuc) return this._loi('Chọn hoặc gõ thư mục dự án.');
    if (!loiNhan && !(this.kem.coGi() && this._noiChay() !== 'app')) return this._loi('Ghi việc cần làm trước đã.');
    if (this._noiChay() === 'app') {
      const day = this._dayDu(thuMuc);
      if (!day.startsWith('/')) return this._loi('Thư mục phải là đường dẫn đầy đủ (bắt đầu bằng / hoặc ~/).');
      try {
        localStorage.setItem('vpc-thu-muc', thuMuc);
      } catch {}
      // Mở ngay trong lúc bấm (trình duyệt chỉ cho mở app ngoài khi người dùng vừa bấm).
      location.href = linkMoTrongApp(loiNhan, day);
      this.viec.value = '';
      try {
        sessionStorage.removeItem('vpc-giao-viec');
      } catch {}
      this.hop.close();
      this.khiMoApp?.();
      return;
    }
    await chayLenh(
      [this.nutGiao],
      async () => {
        const { id } = await lenh.tao(thuMuc, loiNhan, cheDo, { ...this.kem.layRa(), moHinh, effort });
        this.kem.xoaHet();
        try {
          localStorage.setItem('vpc-thu-muc', thuMuc);
        } catch {}
        this.viec.value = '';
        try {
          sessionStorage.removeItem('vpc-giao-viec');
        } catch {}
        this.hop.close();
        this.khiTao(id);
      },
      (e) => this._loi(e.message, e.quyen),
    );
  }

  _loi(chu, quyen = false) {
    this.baoLoi.textContent = chu;
    this.baoLoi.classList.toggle('quyen', quyen);
    this.baoLoi.classList.remove('an');
  }
}

// ---------- khung chat của một phiên văn phòng (nằm trong thẻ chi tiết) ----------
export class KhungChat {
  constructor({ baoLoi }) {
    this.baoLoiNgoai = baoLoi;
    this.goc = el('div', 'the-chat');
    this.log = el('div', 'hoi-thoai');
    this.log.setAttribute('role', 'log');
    this.hopDuyet = el('div', 'hop-duyet an');
    this.loi = el('div', 'loi-chat an');
    this.form = el('form', 'o-nhap');
    this.nhap = el('textarea');
    this.nhap.rows = 1;
    this.nhap.setAttribute('aria-label', 'Nhắn cho Claude');
    this.nutGui = el('button', 'nut chinh', 'Gửi');
    this.nutGui.type = 'submit';
    const noi = nutNoi(this.nhap, (chu) => this._baoLoi(new Error(chu)));
    this.kem = new KhayDinhKem((chu) => this._baoLoi(new Error(chu)));
    this.kem.ganVao(this.nhap);
    this.form.append(...[this.kem.nut, this.nhap, noi, this.nutGui, this.kem.nhap].filter(Boolean));
    this.phu = el('div', 'nut-phu');
    this.goc.append(this.log, this.hopDuyet, this.loi, this.kem.goc, this.form, this.phu);

    this.id = null;
    this.tu = 0;
    this.phienBan = -1;
    this.dangTai = false;
    this.taiLai = false;
    this.duyetMa = undefined;
    this.nhap.addEventListener('input', () => this._coGian());
    this.nhap.addEventListener('keydown', (e) => {
      // Đang gõ tiếng Việt (bộ gõ đang ghép chữ) thì Enter là chốt chữ, không phải gửi.
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        this.form.requestSubmit();
      }
      if (e.key === 'Escape') e.stopPropagation();
    });
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._gui();
    });
    // Chữ gõ dở của từng phiên, giữ cả qua lần trang tải lại (sessionStorage của thẻ này).
    this.nhapTheoPhien = new Map();
    try {
      for (const [k, v] of Object.entries(JSON.parse(sessionStorage.getItem('vpc-nhap') || '{}'))) if (typeof v === 'string') this.nhapTheoPhien.set(k, v);
    } catch {}
    this.nhap.addEventListener('input', () => this.luuNhap());
  }

  // Gắn vào thẻ chi tiết (một lần); thẻ vẽ lại phần trên mà không đụng khung chat.
  gan(the) {
    if (this.goc.parentNode !== the) the.append(this.goc);
  }

  go() {
    if (this.id) this.nhapTheoPhien.set(this.id, this.nhap.value);
    this.goc.remove();
    this.id = null;
  }

  hien(p) {
    if (p.id !== this.id) {
      if (this.id) this.nhapTheoPhien.set(this.id, this.nhap.value);
      this.id = p.id;
      this.tu = 0;
      this.phienBan = -1;
      this.duyetMa = undefined;
      this.log.textContent = '';
      this.hopDuyet.classList.add('an');
      this.kyPhu = '';
      this.kem.xoaHet();
      this.nhap.value = this.nhapTheoPhien.get(p.id) || '';
      this._coGian();
      this._anLoi();
    }
    this.demo = p.demo ? p : null;
    this.pHien = p;
    this.nhap.placeholder = p.conChay ? 'Nhắn cho Claude…' : 'Nhắn để giao tiếp việc (phiên chạy lại từ chỗ cũ)…';
    this.nhap.title = 'Enter để gửi, Shift+Enter để xuống dòng';
    this._vePhu(p);
    if (p.phienBan !== this.phienBan) this._tai();
  }

  // Chỉ vẽ lại hàng nút khi trạng thái đổi: vẽ lại giữa lúc bấm thì cú bấm bị mất.
  _vePhu(p) {
    const chay = p.conChay && (p.trangThai === 'lam' || p.trangThai === 'cho');
    const ky = `${p.id}|${chay}|${p.conChay}|${p.cheDo}|${p.moHinh}|${p.effort}|${!!this.dsMoHinh}`;
    if (ky === this.kyPhu) return;
    this.kyPhu = ky;
    this.phu.textContent = '';
    // Đổi chế độ quyền ngay trong phiên (vd. đang bị hỏi nhiều thì chuyển sang Tự động).
    const nhan = el('label', 'che-do-chat');
    nhan.title = 'Hỏi trước: hỏi mọi việc cần quyền · Tự sửa tệp: chỉ hỏi khi chạy lệnh · Tự động: Claude Code tự duyệt việc an toàn, chỉ hỏi việc rủi ro · Lên kế hoạch: chỉ đọc và trình kế hoạch';
    const chon = el('select');
    for (const [gia, ten] of Object.entries(TEN_CHE_DO)) {
      const o = el('option', '', ten);
      o.value = gia;
      chon.append(o);
    }
    chon.value = TEN_CHE_DO[p.cheDo] ? p.cheDo : 'default';
    chon.addEventListener('change', () => {
      if (p.demo) {
        chon.value = p.cheDo;
        return this._baoMau();
      }
      const muon = chon.value;
      chon.disabled = true;
      lenh
        .doiCheDo(p.id, muon)
        .catch((e) => {
          chon.value = p.cheDo;
          this._baoLoi(e);
        })
        .finally(() => (chon.disabled = false));
    });
    nhan.append('Chế độ ', chon);
    this.phu.append(nhan);
    // Đổi model ngay trong phiên (vd. việc khó thì chuyển sang model mạnh hơn).
    const nhanMh = el('label', 'che-do-chat');
    nhanMh.title = 'Model cho các câu trả lời sau của phiên này';
    const chonMh = el('select');
    veChonMoHinh(chonMh, this.dsMoHinh || [], p.moHinh);
    if (!this.dsMoHinh && !p.demo)
      layMoHinh()
        .then((ds) => {
          this.dsMoHinh = ds;
          if (this.pHien) this._vePhu(this.pHien);
        })
        .catch(() => {});
    chonMh.addEventListener('change', () => {
      if (p.demo) {
        veChonMoHinh(chonMh, this.dsMoHinh || [], p.moHinh);
        return this._baoMau();
      }
      const muon = chonMh.value;
      chonMh.disabled = true;
      lenh
        .doiMoHinh(p.id, muon)
        .catch((e) => {
          veChonMoHinh(chonMh, this.dsMoHinh || [], p.moHinh);
          this._baoLoi(e);
        })
        .finally(() => (chonMh.disabled = false));
    });
    nhanMh.append('Model ', chonMh);
    this.phu.append(nhanMh);
    // Đổi effort ngay trong phiên; các mức theo model của phiên.
    const nhanEf = el('label', 'che-do-chat');
    const chonEf = el('select');
    veChonEffort(chonEf, mucEffortCua(this.dsMoHinh || [], p.moHinh), p.effort, tenEffortMacDinh(this.dsMoHinh || [], p.moHinh));
    nhanEf.title = chonEf.title;
    chonEf.addEventListener('change', () => {
      if (p.demo) {
        chonEf.value = p.effort || '';
        return this._baoMau();
      }
      const muon = chonEf.value;
      chonEf.disabled = true;
      lenh
        .doiEffort(p.id, muon)
        .catch((e) => {
          chonEf.value = p.effort || '';
          this._baoLoi(e);
        })
        .finally(() => (chonEf.disabled = false));
    });
    nhanEf.append('Effort ', chonEf);
    this.phu.append(nhanEf);
    if (chay) this.phu.append(nutBam('nho', '■ Dừng', (b) => (p.demo ? this._baoMau() : chayLenh([b], () => lenh.dung(p.id), (e) => this._baoLoi(e)))));
    if (p.conChay) this.phu.append(nutBam('nho', 'Đóng phiên', (b) => (p.demo ? this._baoMau() : chayLenh([b], () => lenh.dong(p.id), (e) => this._baoLoi(e)))));
    const xoa = nutBam('nho phai', 'Xoá khỏi văn phòng', (b) => {
      if (!b.dataset.chac) {
        b.dataset.chac = '1';
        b.textContent = 'Bấm lần nữa để xoá';
        setTimeout(() => {
          delete b.dataset.chac;
          b.textContent = 'Xoá khỏi văn phòng';
        }, 3500);
        return;
      }
      if (p.demo) return this._baoMau();
      chayLenh([b], () => lenh.dong(p.id, true), (e) => this._baoLoi(e));
    });
    xoa.title = 'Bỏ phiên khỏi văn phòng. Nhật ký phiên vẫn còn trong ~/.claude/projects.';
    this.phu.append(xoa);
  }

  _coGian() {
    this.nhap.style.height = 'auto';
    this.nhap.style.height = Math.min(140, this.nhap.scrollHeight) + 'px';
  }

  async _tai() {
    if (this.dangTai) {
      this.taiLai = true;
      return;
    }
    this.dangTai = true;
    const id = this.id;
    try {
      do {
        this.taiLai = false;
        const du = this.demo
          ? { phienBan: this.demo.phienBan, ds: this.demo.demoHoiThoai || [], duyet: this.demo.demoDuyet || this.demo.duyet || null }
          : await lenh.hoiThoai(id, this.tu);
        if (id !== this.id) return;
        const sat = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 60;
        for (const m of du.ds || []) {
          if (m.i < this.tu) continue;
          this.log.append(this._veMuc(m));
          this.tu = m.i + 1;
        }
        while (this.log.children.length > 400) this.log.firstChild.remove();
        if (sat || this.phienBan === -1) this.log.scrollTop = this.log.scrollHeight;
        this.phienBan = du.phienBan;
        this._veDuyet(du.duyet || null);
      } while (this.taiLai && id === this.id);
    } catch (e) {
      if (id === this.id) this._baoLoi(e);
    } finally {
      this.dangTai = false;
    }
  }

  _veMuc(m) {
    const lop = { ban: 'ban', claude: 'claude', congCu: 'cong-cu', traLoi: 'tra-loi', loi: 'loi' }[m.loai] || 'claude';
    const d = el('div', 'tin ' + lop);
    if (m.loai === 'claude') d.append(veMarkdown(m.chu));
    else d.textContent = m.loai === 'congCu' ? '⚙ ' + m.chu : m.chu;
    if (m.loai === 'ban' && (m.anh?.length || m.tep?.length)) {
      const kem = el('div', 'kem-tin');
      for (const src of m.anh || []) {
        if (!/^data:image\/(jpeg|png|webp);base64,/.test(src)) continue;
        const img = el('img');
        img.src = src;
        img.alt = 'Ảnh đã gửi';
        kem.append(img);
      }
      for (const ten of m.tep || []) kem.append(el('span', 'ten-tep', '📄 ' + ten));
      d.prepend(kem);
    }
    if (m.luc) d.title = new Date(m.luc).toLocaleString('vi-VN');
    return d;
  }

  // Hộp duyệt: chỉ dựng lại khi sang lời hỏi khác, để lựa chọn đang chọn dở không bị mất.
  _veDuyet(d) {
    const ma = d?.ma || null;
    if (ma === this.duyetMa) return;
    this.duyetMa = ma;
    const h = this.hopDuyet;
    h.textContent = '';
    h.className = 'hop-duyet';
    if (!d) {
      h.classList.add('an');
      return;
    }
    h.classList.add(d.loai);
    const id = this.id;
    const gui = (nuts, tl) => (this.demo ? this._baoMau() : chayLenh(nuts, () => lenh.traLoi(id, { ma: d.ma, ...tl }), (e) => this._baoLoi(e)));
    if (d.loai === 'quyen') {
      h.append(el('b', 'tieu-de', 'Claude xin phép'), el('p', 'cau', d.chu));
      if (d.moTa) h.append(el('p', 'mo-ta', d.moTa));
      if (d.chiTiet && d.chiTiet !== d.chu) h.append(el('pre', 'chi-tiet', d.chiTiet));
      if (d.lyDo) h.append(el('p', 'ly-do', d.lyDo));
      const hang = el('div', 'nut-dong');
      const nuts = [];
      nuts.push(nutBam('chinh', 'Cho phép', () => gui(nuts, { choPhep: true })));
      if (d.coLuon) nuts.push(nutBam('', 'Luôn cho phép trong phiên này', () => gui(nuts, { choPhep: true, luon: true })));
      nuts.push(nutBam('tu-choi', 'Từ chối', () => gui(nuts, { choPhep: false })));
      hang.append(...nuts);
      h.append(hang);
    } else if (d.loai === 'hoi') {
      h.append(el('b', 'tieu-de', 'Claude hỏi bạn'));
      const chon = d.cauHoi.map(() => new Set());
      const khac = [];
      const nutGui = nutBam('chinh', 'Gửi trả lời', () => {
        const answers = {};
        d.cauHoi.forEach((q, k) => {
          const tuGo = khac[k].value.trim();
          const ds = [...chon[k]];
          if (tuGo) ds.push(tuGo);
          if (ds.length) answers[q.question] = ds.join(', ');
        });
        gui([nutGui, nutBo], { choPhep: true, answers });
      });
      const nutBo = nutBam('', 'Bỏ qua', () => gui([nutGui, nutBo], { choPhep: false }));
      const kiem = () => (nutGui.disabled = !d.cauHoi.every((q, k) => chon[k].size || khac[k].value.trim()));
      d.cauHoi.forEach((q, k) => {
        const o = el('div', 'cau-hoi');
        if (q.header) o.append(el('span', 'chip', q.header));
        o.append(el('p', 'cau', q.question));
        const ds = el('div', 'lua-chon');
        for (const op of q.options) {
          const b = el('button', 'lua');
          b.type = 'button';
          b.append(el('b', '', op.label));
          if (op.description) b.append(el('span', '', op.description));
          b.setAttribute('aria-pressed', 'false');
          b.addEventListener('click', () => {
            if (q.multiSelect) {
              if (chon[k].has(op.label)) chon[k].delete(op.label);
              else chon[k].add(op.label);
            } else {
              const co = chon[k].has(op.label);
              chon[k].clear();
              if (!co) chon[k].add(op.label);
            }
            for (const n of ds.children) n.setAttribute('aria-pressed', String(chon[k].has(n.firstChild.textContent)));
            kiem();
          });
          ds.append(b);
        }
        const o2 = el('input', 'khac');
        o2.placeholder = q.multiSelect ? 'Thêm ý khác (không bắt buộc)…' : 'Hoặc tự trả lời…';
        o2.addEventListener('input', kiem);
        khac.push(o2);
        o.append(ds, o2);
        h.append(o);
      });
      const hang = el('div', 'nut-dong');
      hang.append(nutGui, nutBo);
      h.append(hang);
      kiem();
    } else if (d.loai === 'keHoach') {
      h.append(el('b', 'tieu-de', 'Claude trình kế hoạch'));
      const kh = el('div', 'ke-hoach');
      kh.append(veMarkdown(d.keHoach || '(kế hoạch trống)'));
      h.append(kh);
      // Duyệt ngay dưới kế hoạch; chưa ổn thì ghi góp ý ở hàng dưới.
      const gopY = el('textarea', 'gop-y');
      gopY.rows = 1;
      gopY.placeholder = 'Chưa ổn? Ghi góp ý để Claude sửa lại…';
      const nuts = [];
      nuts.push(nutBam('chinh', 'Duyệt, hỏi trước khi sửa tệp', () => gui(nuts, { choPhep: true, cheDoSau: 'default' })));
      nuts.push(nutBam('', 'Duyệt, cho tự sửa tệp', () => gui(nuts, { choPhep: true, cheDoSau: 'acceptEdits' })));
      nuts.push(nutBam('', 'Duyệt, chế độ Tự động', () => gui(nuts, { choPhep: true, cheDoSau: 'auto' })));
      const nutSua = nutBam('tu-choi', 'Gửi góp ý', () => gui(nuts, { choPhep: false, loiNhan: gopY.value.trim() }));
      nuts.push(nutSua);
      const hang = el('div', 'nut-dong');
      hang.append(nuts[0], nuts[1], nuts[2]);
      const hangSua = el('div', 'hang-gop-y');
      hangSua.append(gopY, nutSua);
      h.append(hang, hangSua);
    }
    if (d.soCho > 1) h.append(el('small', 'con-lai', `Còn ${d.soCho - 1} lời hỏi khác đang chờ sau lời này.`));
  }

  luuNhap() {
    if (this.id) {
      if (this.nhap.value) this.nhapTheoPhien.set(this.id, this.nhap.value);
      else this.nhapTheoPhien.delete(this.id);
    }
    try {
      sessionStorage.setItem('vpc-nhap', JSON.stringify(Object.fromEntries(this.nhapTheoPhien)));
    } catch {}
  }

  _baoMau() {
    this._baoLoi(new Error('Đây là bản xem thử: nút không chạy thật. Mở văn phòng từ máy chủ của bạn (npm start) và cất API key để giao việc thật.'));
  }

  async _gui() {
    const chu = this.nhap.value.trim();
    if ((!chu && !this.kem.coGi()) || !this.id) return;
    if (this.demo) return this._baoMau();
    const id = this.id;
    const ok = await chayLenh([this.nutGui], () => lenh.gui(id, chu, this.kem.layRa()), (e) => this._baoLoi(e));
    if (ok && id === this.id) {
      this.kem.xoaHet();
      this.nhap.value = '';
      this.nhapTheoPhien.delete(id);
      this.luuNhap();
      this._coGian();
      this._anLoi();
      this.nutGui.disabled = false;
      this.log.scrollTop = this.log.scrollHeight;
    }
  }

  _baoLoi(e) {
    this.loi.textContent = e?.message || String(e);
    this.loi.classList.toggle('quyen', !!e?.quyen);
    this.loi.classList.remove('an');
  }

  _anLoi() {
    this.loi.classList.add('an');
  }
}
