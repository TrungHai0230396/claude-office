// Điều khiển phiên do văn phòng chạy (Claude Agent SDK trên máy chủ): giao việc, nhắn tin, cho phép,
// trả lời câu hỏi, duyệt kế hoạch, dừng. Mọi lệnh kèm mã bí mật máy chủ chèn vào trang (thẻ meta
// vpc-khoa). Lời xin quyền chỉ được trả lời bằng cú bấm của bạn; không có gì tự cho phép.
const KHOA = document.querySelector('meta[name="vpc-khoa"]')?.content || '';
export const coDieuKhien = () => !!KHOA;

export const TEN_CHE_DO = { default: 'Hỏi trước', acceptEdits: 'Tự sửa tệp', plan: 'Lên kế hoạch trước' };

function el(the, lop, chu) {
  const e = document.createElement(the);
  if (lop) e.className = lop;
  if (chu !== undefined) e.textContent = chu;
  return e;
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
  tao: (thuMuc, loiNhan, cheDo) => goi('/api/vp/phien', { thuMuc, loiNhan, cheDo }),
  gui: (id, loiNhan) => goi(duongPhien(id, 'gui'), { loiNhan }),
  traLoi: (id, tl) => goi(duongPhien(id, 'tra-loi'), tl),
  dung: (id) => goi(duongPhien(id, 'dung'), {}),
  dong: (id, xoa = false) => goi(duongPhien(id, 'dong'), { xoa }),
  hoiThoai: (id, tu) => goi(duongPhien(id, 'hoi-thoai') + '?tu=' + tu),
};

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

  // Có điều khiển qua web không (máy chủ bật chế độ điều khiển và trang có mã bí mật).
  datVanPhong(co) {
    this.coVanPhong = !!co;
    const r = this.form.querySelector('input[name="noiChay"][value="vanphong"]');
    r.disabled = !this.coVanPhong;
    if (!this.coVanPhong) this.form.querySelector('input[name="noiChay"][value="app"]').checked = true;
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
    await this._napThuMuc();
    this.hop.showModal();
    this.viec.focus();
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
    if (!thuMuc) return this._loi('Chọn hoặc gõ thư mục dự án.');
    if (!loiNhan) return this._loi('Ghi việc cần làm trước đã.');
    if (this._noiChay() === 'app') {
      const day = this._dayDu(thuMuc);
      if (!day.startsWith('/')) return this._loi('Thư mục phải là đường dẫn đầy đủ (bắt đầu bằng / hoặc ~/).');
      try {
        localStorage.setItem('vpc-thu-muc', thuMuc);
      } catch {}
      // Mở ngay trong lúc bấm (trình duyệt chỉ cho mở app ngoài khi người dùng vừa bấm).
      location.href = linkMoTrongApp(loiNhan, day);
      this.viec.value = '';
      this.hop.close();
      this.khiMoApp?.();
      return;
    }
    await chayLenh(
      [this.nutGiao],
      async () => {
        const { id } = await lenh.tao(thuMuc, loiNhan, cheDo);
        try {
          localStorage.setItem('vpc-thu-muc', thuMuc);
        } catch {}
        this.viec.value = '';
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
    this.form.append(this.nhap, this.nutGui);
    this.phu = el('div', 'nut-phu');
    this.goc.append(this.log, this.hopDuyet, this.loi, this.form, this.phu);

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
    this.nhapTheoPhien = new Map();
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
      this.nhap.value = this.nhapTheoPhien.get(p.id) || '';
      this._coGian();
      this._anLoi();
    }
    this.demo = p.demo ? p : null;
    this.nhap.placeholder = p.conChay ? 'Nhắn cho Claude…' : 'Nhắn để giao tiếp việc (phiên chạy lại từ chỗ cũ)…';
    this.nhap.title = 'Enter để gửi, Shift+Enter để xuống dòng';
    this._vePhu(p);
    if (p.phienBan !== this.phienBan) this._tai();
  }

  // Chỉ vẽ lại hàng nút khi trạng thái đổi: vẽ lại giữa lúc bấm thì cú bấm bị mất.
  _vePhu(p) {
    const chay = p.conChay && (p.trangThai === 'lam' || p.trangThai === 'cho');
    const ky = `${p.id}|${chay}|${p.conChay}`;
    if (ky === this.kyPhu) return;
    this.kyPhu = ky;
    this.phu.textContent = '';
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
      const nutSua = nutBam('tu-choi', 'Gửi góp ý', () => gui(nuts, { choPhep: false, loiNhan: gopY.value.trim() }));
      nuts.push(nutSua);
      const hang = el('div', 'nut-dong');
      hang.append(nuts[0], nuts[1]);
      const hangSua = el('div', 'hang-gop-y');
      hangSua.append(gopY, nutSua);
      h.append(hang, hangSua);
    }
    if (d.soCho > 1) h.append(el('small', 'con-lai', `Còn ${d.soCho - 1} lời hỏi khác đang chờ sau lời này.`));
  }

  coChuDangGo() {
    return !!this.nhap.value.trim() || [...this.nhapTheoPhien.values()].some((v) => v && v.trim());
  }

  _baoMau() {
    this._baoLoi(new Error('Đây là bản xem thử: nút không chạy thật. Mở văn phòng từ máy chủ của bạn (npm start) và cất API key để giao việc thật.'));
  }

  async _gui() {
    const chu = this.nhap.value.trim();
    if (!chu || !this.id) return;
    if (this.demo) return this._baoMau();
    const id = this.id;
    const ok = await chayLenh([this.nutGui], () => lenh.gui(id, chu), (e) => this._baoLoi(e));
    if (ok && id === this.id) {
      this.nhap.value = '';
      this.nhapTheoPhien.delete(id);
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
