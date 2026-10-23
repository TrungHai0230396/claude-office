// Phần chữ nổi trên cảnh 3D. Chỉ làm nổi việc cần bạn, còn lại để chìm:
//   - bảng bên: "Chờ bạn" là thẻ to có nút mở phiên, "Đang làm" mỗi người một dòng, "Đang nghỉ" và "Lỗi" gập sẵn
//   - nhãn trên đầu chỉ cho người đang chờ, đang làm, gặp lỗi; người nghỉ rê chuột mới hiện tên
//   - thông báo chỉ khi có người mới xin duyệt hay vừa gặp lỗi
import * as THREE from 'three';

export const TEN_TRANG_THAI = { lam: 'Đang làm', cho: 'Chờ bạn', loi: 'Gặp lỗi', nghi: 'Đang nghỉ', ngu: 'Ngủ gật' };
export const LOAI_DUYET = {
  quyen: 'Xin phép dùng công cụ',
  hoi: 'Đang hỏi bạn',
  keHoach: 'Xin duyệt kế hoạch',
  deNghi: 'Đề nghị mở phiên mới',
  quyetDinh: 'Chờ bạn quyết',
  xemLai: 'Nộp bài, chờ bạn xem',
};
const VIEC_NGHI = {
  mayPha: 'Đang pha cà phê',
  banCao: 'Đứng uống cà phê',
  sofa: 'Ngồi sofa nghỉ ngơi',
  vong: 'Đang dạo vườn',
  gheDa: 'Ngồi ghế đá trong vườn',
  cayNuoc: 'Đứng ở cây nước',
};

export function rutGon(chu, toiDa) {
  if (!chu) return '';
  const s = String(chu).replace(/\s+/g, ' ').trim();
  return s.length > toiDa ? s.slice(0, toiDa - 1).trimEnd() + '…' : s;
}

export function truoc(ms, bayGio = Date.now()) {
  if (!ms) return '';
  const s = Math.max(0, (bayGio - ms) / 1000);
  if (s < 60) return 'vừa xong';
  if (s < 3600) return `${Math.round(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  if (s < 2 * 86400) return 'hôm qua';
  return `${Math.floor(s / 86400)} ngày trước`;
}

export function khoang(ms) {
  const s = Math.max(0, ms / 1000);
  if (s < 60) return 'mới';
  if (s < 3600) return `${Math.round(s / 60)} phút`;
  if (s < 86400) {
    const g = Math.floor(s / 3600);
    const p = Math.round((s % 3600) / 60);
    return p ? `${g} giờ ${p} phút` : `${g} giờ`;
  }
  return `${Math.floor(s / 86400)} ngày`;
}

function el(the, lop, chu) {
  const e = document.createElement(the);
  if (lop) e.className = lop;
  if (chu !== undefined) e.textContent = chu;
  return e;
}

function docLuu(khoa, macDinh) {
  try {
    const v = localStorage.getItem(khoa);
    return v === null ? macDinh : JSON.parse(v);
  } catch {
    return macDinh;
  }
}
function luu(khoa, v) {
  try {
    localStorage.setItem(khoa, JSON.stringify(v));
  } catch {}
}

export class GiaoDien {
  constructor({ dieuPhoi, camera, khiChon, khiGocNhin, khiDiTheo }) {
    this.dp = dieuPhoi;
    this.camera = camera;
    this.khiChon = khiChon;
    this.khiDiTheo = khiDiTheo;
    this.lop = document.getElementById('lop-nhan');
    this.goiY = document.getElementById('goi-y');
    this.nhan = new Map();
    this.chon = null;
    this.tro = null;
    this.troXY = null;
    this.diTheo = false;
    this.ban = [];
    this.bayGio = Date.now();
    this.coAm = docLuu('vpc-am', false);
    this.mo = docLuu('vpc-mo', { nghi: false, loi: false });
    this.moChiTiet = false;
    this.v = new THREE.Vector3();
    this._nutAm();

    document.getElementById('nut-am').addEventListener('click', () => {
      this.coAm = !this.coAm;
      luu('vpc-am', this.coAm);
      this._nutAm();
      if (this.coAm) {
        this._chuong();
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      }
    });
    this.bang = document.getElementById('bang');
    const nutBang = document.getElementById('nut-bang');
    // Màn hẹp thì gập bảng sẵn cho thấy trọn văn phòng; bấm ☰ để mở.
    if (window.innerWidth > 0 && window.innerWidth < 900) this._datBang(false);
    nutBang.addEventListener('click', () => this._datBang(this.bang.classList.contains('gap')));
    for (const nut of document.querySelectorAll('#dem .so-lieu')) {
      nut.addEventListener('click', () => {
        const muc = nut.dataset.muc;
        this._datBang(true);
        if (muc === 'nghi' || muc === 'loi') {
          this.mo[muc] = true;
          luu('vpc-mo', this.mo);
          this.veDanhSach();
        }
        document.getElementById('muc-' + muc)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    for (const nut of document.querySelectorAll('#goc-nhin button')) {
      nut.addEventListener('click', () => {
        this.chonGoc(nut.dataset.goc);
        khiGocNhin(nut.dataset.goc);
      });
    }
    this.md = null;
    // Đồng hồ trên thanh trên: chỉ vẽ lại khi sang phút mới.
    this.phutVe = -1;
    setInterval(() => this._veDongHo(), 1000);
    this._veDongHo();
    this.nhanKhu = [];
    for (const [chu, x, z] of [
      ['Khu làm việc', -6.5, -11.0],
      ['Phòng duyệt', 11.5, -11.5],
      ['Góc cà phê', 11.5, 11.6],
      ['Vườn', -6.5, 11.6],
    ]) {
      const e = el('div', 'nhan-khu', chu);
      this.lop.appendChild(e);
      this.nhanKhu.push({ e, p: new THREE.Vector3(x, 0.05, z) });
    }
  }

  chonGoc(ten) {
    for (const n of document.querySelectorAll('#goc-nhin button')) n.classList.toggle('chon', n.dataset.goc === ten);
  }

  _datBang(mo) {
    this.bang.classList.toggle('gap', !mo);
    document.getElementById('nut-bang').setAttribute('aria-expanded', String(mo));
  }

  _nutAm() {
    const n = document.getElementById('nut-am');
    n.textContent = this.coAm ? '🔔' : '🔕';
    n.setAttribute('aria-pressed', String(this.coAm));
    n.title = this.coAm ? 'Đang bật chuông khi có người xin duyệt' : 'Bật chuông khi có người xin duyệt';
  }

  _chuong() {
    try {
      this.am = this.am || new (window.AudioContext || window.webkitAudioContext)();
      const a = this.am;
      const bd = a.currentTime;
      [880, 1318.5].forEach((f, i) => {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, bd + i * 0.14);
        g.gain.exponentialRampToValueAtTime(0.16, bd + i * 0.14 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, bd + i * 0.14 + 0.6);
        o.connect(g).connect(a.destination);
        o.start(bd + i * 0.14);
        o.stop(bd + i * 0.14 + 0.65);
      });
    } catch {}
  }

  capNhatMucDung(md) {
    this.md = md || null;
    this.phutVe = -1;
    this._veDongHo();
  }

  _veDongHo() {
    const bay = new Date();
    const phut = Math.floor(bay.getTime() / 60e3);
    if (phut === this.phutVe) return;
    this.phutVe = phut;
    const hop = document.getElementById('dong-ho');
    if (!hop) return;
    const hhmm = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
    hop.querySelector('.gio-may').textContent = hhmm(bay.getTime());
    const md = this.md;
    const chu = hop.querySelector('.chu');
    const thanh = hop.querySelector('.thanh i');
    hop.classList.remove('vang', 'do', 'chua');
    chu.textContent = '';
    const tieuDe = [bay.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })];
    if (md?.namGio) {
      const pt = Math.max(0, Math.min(100, Math.round(md.namGio.phanTram)));
      thanh.style.width = pt + '%';
      if (pt >= 85) hop.classList.add('do');
      else if (pt >= 60) hop.classList.add('vang');
      const b = el('b', '', pt + '%');
      chu.append('5 giờ ', b);
      if (md.het) chu.append(` · hết ${md.het.chinhXac ? '' : '~'}${hhmm(md.het.luc)}`);
      tieuDe.push(`Giới hạn 5 giờ: đã dùng ${pt}% (số app ghi lúc ${hhmm(md.namGio.luc)})`);
      if (md.het) tieuDe.push(md.het.chinhXac ? `Hết giới hạn lúc ${hhmm(md.het.luc)}` : `Hết giới hạn khoảng ${hhmm(md.het.luc)} (ước tính, lệch chừng ${Math.max(1, Math.round((md.het.saiSo || 0) / 60e3))} phút)`);
      else tieuDe.push('Giờ hết sẽ hiện khi khung 5 giờ đổi lần tới (app cần ghi vài mẫu quanh lúc đó).');
      if (md.tuan) tieuDe.push(`Giới hạn tuần: ${Math.round(md.tuan.phanTram)}%`);
      if (md.namGio.cu) {
        chu.append(` (lúc ${hhmm(md.namGio.luc)})`);
        hop.classList.add('chua');
      }
    } else {
      thanh.style.width = '0';
      hop.classList.add('chua');
      chu.textContent = 'Mức dùng: chưa có số';
    }
    if (md?.goiY) tieuDe.push(md.goiY);
    hop.title = tieuDe.join('\n');
  }

  datKetNoi(trangThai, chu) {
    const e = document.getElementById('ket-noi');
    e.className = 'ket-noi ' + trangThai;
    e.textContent = chu;
  }

  // ---------- dữ liệu mới ----------
  capNhat(dsPhien, bayGio, laDau) {
    this.bayGio = bayGio;
    const cu = new Map(this.ban.map((p) => [p.id, p]));
    this.ban = dsPhien;
    const dem = { cho: 0, lam: 0, nghi: 0, loi: 0 };
    for (const p of dsPhien) {
      const h = this._hien(p);
      dem[h === 'ngu' ? 'nghi' : h]++;
      if (!laDau) this._baoDoi(cu.get(p.id), p);
    }
    for (const nut of document.querySelectorAll('#dem .so-lieu')) {
      const muc = nut.dataset.muc;
      nut.querySelector('.so').textContent = dem[muc];
      if (muc === 'cho') nut.classList.toggle('co', dem.cho > 0);
      if (muc === 'loi') nut.classList.toggle('an', dem.loi === 0);
    }
    document.title = dem.cho ? `(${dem.cho}) Claude Office` : 'Claude Office';
    this.veDanhSach();
    this._dungNhan();
    if (this.chon) this.veThe();
  }

  _hien(p) {
    return this.dp.ds.get(p.id)?.hien || (p.trangThai === 'xong' || p.trangThai === 'dung' ? 'nghi' : p.trangThai);
  }

  // Chỉ báo hai việc cần bạn để ý: có người mới xin duyệt, có người vừa gặp lỗi.
  _baoDoi(cu, p) {
    if (cu && cu.trangThai === p.trangThai && (p.trangThai !== 'cho' || cu.duyet?.chu === p.duyet?.chu)) return;
    const ten = rutGon(p.ten, 48);
    if (p.trangThai === 'cho') {
      const loai = LOAI_DUYET[p.duyet?.loai] || 'Chờ bạn';
      this.thongBao(`🙋 ${ten} · ${loai}`, rutGon(p.duyet?.chu || '', 140), 'cho', p.id);
      if (this.coAm) this._chuong();
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(`${ten} cần bạn`, { body: rutGon(p.duyet?.chu || loai, 160), tag: p.id });
          n.onclick = () => {
            window.focus();
            this.khiChon(p.id, true);
          };
        } catch {}
      }
    } else if (p.trangThai === 'loi' && cu) {
      this.thongBao(`⚠️ ${ten} gặp lỗi`, rutGon(p.loi?.chu || '', 120), 'loi', p.id);
    }
  }

  thongBao(dau, than, loai, ma) {
    const hop = document.getElementById('thong-bao');
    const e = el('div', 'tb ' + loai);
    e.append(el('b', '', dau), el('span', '', than));
    e.addEventListener('click', () => {
      if (ma) this.khiChon(ma, true);
      e.remove();
    });
    hop.prepend(e);
    while (hop.children.length > 2) hop.lastChild.remove();
    setTimeout(() => {
      e.classList.add('di');
      setTimeout(() => e.remove(), 320);
    }, 7000);
  }

  // ---------- bảng bên ----------
  veDanhSach() {
    const hop = document.getElementById('danh-sach');
    const nhom = { cho: [], lam: [], nghi: [], loi: [] };
    for (const p of this.ban) {
      const h = this._hien(p);
      nhom[h === 'ngu' ? 'nghi' : h].push(p);
    }
    nhom.cho.sort((a, b) => (b.duyet?.tu || 0) - (a.duyet?.tu || 0));
    for (const k of ['lam', 'nghi', 'loi']) nhom[k].sort((a, b) => (b.hoatDongCuoi || 0) - (a.hoatDongCuoi || 0));

    const moi = document.createDocumentFragment();
    // Chờ bạn: luôn mở, thẻ to.
    const mucCho = el('section', 'muc');
    mucCho.id = 'muc-cho';
    const dauCho = el('div', 'muc-dau');
    dauCho.append(el('span', '', 'Chờ bạn trả lời'), el('span', 'dem-nho', String(nhom.cho.length)));
    mucCho.append(dauCho);
    if (!nhom.cho.length) mucCho.append(el('div', 'trong-rong', 'Không ai chờ bạn. Cứ để mọi người làm việc nhé.'));
    for (const p of nhom.cho) mucCho.append(this._theCho(p));
    moi.append(mucCho);

    // Đang làm: mỗi người một dòng.
    const mucLam = el('section', 'muc');
    mucLam.id = 'muc-lam';
    const dauLam = el('div', 'muc-dau');
    dauLam.append(el('span', '', 'Đang làm'), el('span', 'dem-nho', String(nhom.lam.length)));
    mucLam.append(dauLam);
    if (!nhom.lam.length) mucLam.append(el('div', 'trong-rong', 'Chưa ai đang chạy.'));
    for (const p of nhom.lam) mucLam.append(this._dong(p, 'lam'));
    moi.append(mucLam);

    // Nghỉ và lỗi: gập sẵn, bấm để mở.
    for (const [k, tieuDe] of [['loi', 'Gặp lỗi'], ['nghi', 'Đang nghỉ']]) {
      if (!nhom[k].length) continue;
      const muc = el('section', 'muc' + (this.mo[k] ? ' mo' : ''));
      muc.id = 'muc-' + k;
      const dau = el('div', 'muc-dau');
      const nut = el('button');
      nut.append(el('span', 'mui', '▸'), tieuDe);
      nut.setAttribute('aria-expanded', String(!!this.mo[k]));
      nut.addEventListener('click', () => {
        this.mo[k] = !this.mo[k];
        luu('vpc-mo', this.mo);
        this.veDanhSach();
      });
      dau.append(nut, el('span', 'dem-nho', String(nhom[k].length)));
      muc.append(dau);
      if (this.mo[k]) for (const p of nhom[k]) muc.append(this._dong(p, k));
      moi.append(muc);
    }

    const cuon = hop.scrollTop;
    hop.textContent = '';
    hop.appendChild(moi);
    hop.scrollTop = cuon;
  }

  _mau(p) {
    return this.dp.mauDuAn.get(p.duAn) || '#999';
  }

  _theCho(p) {
    const d = el('div', 'the-cho');
    d.dataset.ma = p.id;
    d.style.setProperty('--mau', this._mau(p));
    const cho = this.bayGio - (p.duyet?.tu || this.bayGio);
    if (cho < 30 * 60e3) d.classList.add('moi');
    if (p.id === this.chon) d.classList.add('chon');
    const dong1 = el('div', 'dong1');
    dong1.append(el('span', 'ten', p.ten || '(chưa có tên)'), el('span', 'gio', khoang(cho)));
    d.append(dong1, el('div', 'loai', `${LOAI_DUYET[p.duyet?.loai] || 'Chờ bạn'} · ${p.duAn}`));
    d.append(el('div', 'hoi', p.duyet?.chu || 'Phiên đang chờ bạn trả lời.'));
    const nut = el('div', 'nut-dong');
    if (p.lienKet) {
      const a = el('a', 'nut chinh nho', 'Mở để trả lời');
      a.href = p.lienKet;
      a.addEventListener('click', (e) => e.stopPropagation());
      nut.append(a);
    }
    d.append(nut);
    d.title = 'Bấm để xem người này trong văn phòng';
    d.addEventListener('click', () => this.khiChon(p.id, true));
    return d;
  }

  _dong(p, k) {
    const b = el('button', 'dong ' + k);
    b.dataset.ma = p.id;
    if (p.id === this.chon) b.classList.add('chon');
    const cham = el('span', 'cham');
    cham.style.background = this._mau(p);
    let gio = '';
    let phu = '';
    if (k === 'lam') {
      gio = p.viec?.tu ? khoang(this.bayGio - p.viec.tu) : '';
      phu = (p.viec?.chu || 'Đang làm') + (p.troLy ? ` · ${p.troLy} trợ lý` : '');
    } else if (k === 'loi') {
      gio = truoc(p.loi?.luc || p.hoatDongCuoi, this.bayGio);
      phu = p.loi?.chu || 'Gặp lỗi';
    } else {
      gio = truoc(p.hoatDongCuoi, this.bayGio);
      phu = p.tomTat || p.duAn;
    }
    b.append(cham, el('span', 'ten', p.ten || '(chưa có tên)'), el('span', 'gio', gio), el('span', 'phu', phu));
    b.title = `${p.ten}\n${phu}`;
    b.addEventListener('click', () => this.khiChon(p.id, true));
    return b;
  }

  // ---------- thẻ chi tiết ----------
  chonNguoi(ma) {
    this.chon = ma;
    for (const d of document.querySelectorAll('.dong, .the-cho')) d.classList.toggle('chon', d.dataset.ma === ma);
    for (const [, n] of this.nhan) n.noi = '';
    if (!ma) {
      this.diTheo = false;
      this.khiDiTheo(false);
      document.getElementById('the').classList.add('an');
      return;
    }
    this.veThe();
  }

  veThe() {
    const the = document.getElementById('the');
    const ma = this.chon;
    the.textContent = '';
    const dau = el('div', 'dau');
    const x = el('button', 'dong-x', '✕');
    x.setAttribute('aria-label', 'Đóng');
    x.addEventListener('click', () => this.khiChon(null));
    if (ma === 'sep') {
      dau.append(el('h3', '', 'Bạn (sếp)'), x);
      const so = this.ban.filter((p) => this._hien(p) === 'cho').length;
      const hop = el('div', 'chinh-yeu' + (so ? ' cho' : ''));
      hop.append(el('b', '', 'Bàn duyệt'), el('p', '', so ? `${so} phiên đang chờ bạn. Bấm "Mở để trả lời" ở bảng bên để mở đúng phiên trong app Claude.` : 'Không ai chờ bạn.'));
      the.append(dau, hop);
      the.classList.remove('an');
      return;
    }
    const p = this.ban.find((q) => q.id === ma);
    if (!p) {
      the.classList.add('an');
      return;
    }
    const h = this._hien(p);
    dau.append(el('h3', '', p.ten || '(chưa có tên)'), x);
    the.append(dau);

    const nhanDong = el('div', 'nhan-dong');
    nhanDong.append(el('span', 'huy-hieu hh-' + h, TEN_TRANG_THAI[h]));
    const da = el('span', 'huy-hieu');
    const i = el('i');
    i.style.background = this._mau(p);
    da.append(i, p.duAn);
    nhanDong.append(da);
    if (p.trangThai === 'dung') nhanDong.append(el('span', 'huy-hieu', p.lyDo || 'bị ngắt giữa chừng'));
    if (p.nguon === 'vscode' || p.nguon === 'terminal') nhanDong.append(el('span', 'huy-hieu', p.nguon === 'vscode' ? 'mở từ VS Code' : 'mở từ terminal'));
    the.append(nhanDong);

    const chinh = (lop, tieuDe, noiDung) => {
      const d = el('div', 'chinh-yeu ' + lop);
      d.append(el('b', '', tieuDe), el('p', '', noiDung));
      the.append(d);
    };
    if (h === 'cho') chinh('cho', `${LOAI_DUYET[p.duyet?.loai] || 'Chờ bạn'} · đã ${khoang(this.bayGio - (p.duyet?.tu || this.bayGio))}`, p.duyet?.chu || 'Phiên đang chờ bạn trả lời.');
    else if (h === 'lam') chinh('lam', `Đang làm${p.viec?.tu ? ' · ' + khoang(this.bayGio - p.viec.tu) : ''}`, (p.viec?.chu || 'Đang làm') + (p.troLy ? `\n${p.troLy} trợ lý đang chạy cùng` : ''));
    else if (h === 'loi') chinh('loi', 'Lỗi', p.loi?.chu || 'Phiên gặp lỗi.');
    else {
      const nv = this.dp.ds.get(p.id);
      const dangLam = h === 'ngu' ? `Đã ${khoang(this.bayGio - (p.hoatDongCuoi || this.bayGio))} không có việc.` : VIEC_NGHI[nv?.viec?.loai] || 'Đang nghỉ';
      chinh('', dangLam, p.tomTat ? 'Lượt vừa xong: ' + p.tomTat : 'Xong lượt ' + truoc(p.hoatDongCuoi, this.bayGio) + '.');
    }

    const nut = el('div', 'nut-dong');
    if (p.lienKet) {
      const a = el('a', 'nut chinh', h === 'cho' ? 'Mở để trả lời' : 'Mở trong Claude');
      a.href = p.lienKet;
      nut.append(a);
    }
    const theo = el('button', 'nut' + (this.diTheo ? ' bat' : ''), this.diTheo ? 'Thôi đi theo' : 'Đi theo');
    theo.addEventListener('click', () => {
      this.diTheo = !this.diTheo;
      this.khiDiTheo(this.diTheo);
      this.veThe();
    });
    nut.append(theo);
    the.append(nut);

    // Phần phụ gập lại cho đỡ rối.
    const ct = el('details');
    ct.open = this.moChiTiet;
    ct.addEventListener('toggle', () => {
      this.moChiTiet = ct.open;
    });
    ct.append(el('summary', '', 'Chi tiết'));
    const doan = (tieuDe, noiDung) => {
      if (!noiDung) return;
      const d = el('div', 'doan');
      d.append(el('b', '', tieuDe), el('p', '', noiDung));
      ct.append(d);
    };
    doan('Bạn nhờ lần cuối', rutGon(p.yeuCau, 300));
    const gon = (s) => String(s || '').replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();
    const ketQua = p.baoCao || p.tomTat;
    if (ketQua && gon(ketQua) !== gon(p.duyet?.chu) && h !== 'nghi' && h !== 'ngu') doan('Lượt vừa xong', rutGon(ketQua, 420));
    else if (p.baoCao && p.baoCao !== p.tomTat) doan('Báo cáo', rutGon(p.baoCao, 420));
    const dl = el('dl');
    const dong = (k, v) => {
      if (!v) return;
      dl.append(el('dt', '', k));
      const dd = el('dd');
      if (v instanceof Node) dd.append(v);
      else dd.textContent = v;
      dl.append(dd);
    };
    dong('Thư mục', p.thuMuc);
    dong('Mô hình', [p.moHinh, p.effort].filter(Boolean).join(' · '));
    dong('Chế độ quyền', p.cheDo);
    dong('Bắt đầu', truoc(p.taoLuc, this.bayGio));
    dong('Hoạt động cuối', truoc(p.hoatDongCuoi, this.bayGio));
    if (p.luotXong) dong('Số lượt đã xong', String(p.luotXong));
    if (p.cha) {
      const cha = this.ban.find((q) => q.id === p.cha);
      const a = el('a', '', cha ? rutGon(cha.ten, 40) : 'phiên đã đóng');
      if (cha) a.addEventListener('click', () => this.khiChon(cha.id, true));
      dong('Phiên mẹ', a);
    }
    const con = this.ban.filter((q) => q.cha === p.id);
    if (con.length) {
      const s = el('span');
      con.forEach((c, k) => {
        const a = el('a', '', rutGon(c.ten, 32));
        a.addEventListener('click', () => this.khiChon(c.id, true));
        s.append(a);
        if (k < con.length - 1) s.append(', ');
      });
      dong('Phiên con', s);
    }
    ct.append(dl);
    the.append(ct);
    the.classList.remove('an');
  }

  // ---------- nhãn trên đầu ----------
  _dungNhan() {
    const ds = [...this.ban.map((p) => p.id), 'sep'];
    for (const [id, n] of this.nhan) {
      if (!ds.includes(id)) {
        n.e.remove();
        this.nhan.delete(id);
      }
    }
    for (const id of ds) {
      if (this.nhan.has(id)) continue;
      const e = el('div', 'nhan');
      const cham = el('span', 'cham-tt');
      const chu = el('span', 'ten-nho');
      e.append(cham, chu);
      e.addEventListener('click', () => this.khiChon(id, false));
      e.addEventListener('pointerenter', (ev) => this.datTro(id, ev.clientX, ev.clientY));
      e.addEventListener('pointerleave', () => {
        if (this.tro === id) this.datTro(null);
      });
      this.lop.appendChild(e);
      this.nhan.set(id, { e, chu, noi: '', rong: 0, cao: 0, uuTien: 9, hien: false });
    }
  }

  // Nội dung và độ ưu tiên của nhãn; trả về false nếu người này không cần nhãn.
  _noiDungNhan(id, n) {
    let lop = 'nhan';
    let chu = '';
    if (id === 'sep') {
      lop += ' sep';
      chu = 'Bạn';
      n.uuTien = 1.5;
    } else {
      const p = this.ban.find((q) => q.id === id);
      const nv = this.dp.ds.get(id);
      if (!p || !nv) return false;
      const h = nv.hien;
      const duocChon = id === this.chon;
      if (h === 'cho') {
        lop += ' cho';
        // Người đứng đầu hàng hiện tên; những người chờ sau chỉ là chấm vàng, rê chuột mới hiện.
        const dauHang = nv.dich?.loai === 'hang' && nv.dich?.sau === 0;
        n.uuTien = dauHang ? 0 : 1;
        n.gonSan = !dauHang;
      } else if (h === 'lam') {
        lop += ' lam';
        n.uuTien = 2.5;
        n.gonSan = false;
      } else if (h === 'loi') {
        // Lỗi cũ (quá 1 giờ) chỉ nằm trong bảng bên, khỏi chấm đỏ khắp văn phòng.
        if (!duocChon && this.bayGio - (p.loi?.luc || p.hoatDongCuoi || 0) > 3600e3) return false;
        lop += ' loi';
        n.uuTien = 2;
      } else if (!duocChon) return false;
      chu = rutGon(p.ten || '(chưa có tên)', 24);
    }
    if (id === this.chon) lop += ' chon';
    const khoa = lop + '|' + chu;
    if (khoa !== n.noi) {
      n.noi = khoa;
      n.chu.textContent = chu;
      // Đo cỡ thật lúc nhãn đang hiện đủ (nhãn ẩn hay thu gọn đo ra sai).
      n.e.className = lop;
      n.e.style.display = '';
      n.rong = n.e.offsetWidth;
      n.cao = n.e.offsetHeight;
      if (n.gon) n.e.classList.add('gon');
      if (!n.hien) n.e.style.display = 'none';
    }
    return true;
  }

  // Rê chuột vào một người: hiện ô gợi ý gọn (tên, đang làm gì).
  datTro(ma, x, y) {
    this.tro = ma;
    if (ma && x !== undefined) this.troXY = [x, y];
    const g = this.goiY;
    if (!ma) {
      g.classList.add('an');
      return;
    }
    let tieuDe = '';
    let dong = '';
    if (ma === 'sep') {
      tieuDe = 'Bạn (sếp)';
      dong = 'Ngồi bàn duyệt';
    } else {
      const p = this.ban.find((q) => q.id === ma);
      const nv = this.dp.ds.get(ma);
      if (!p || !nv) return;
      tieuDe = p.ten;
      const h = nv.hien;
      if (h === 'cho') dong = `${LOAI_DUYET[p.duyet?.loai] || 'Chờ bạn'}: ${rutGon(p.duyet?.chu, 110)}`;
      else if (h === 'lam') dong = p.viec?.chu || 'Đang làm';
      else if (h === 'loi') dong = rutGon(p.loi?.chu || 'Gặp lỗi', 110);
      else if (h === 'ngu') dong = `Ngủ gật · ${truoc(p.hoatDongCuoi, this.bayGio)}`;
      else dong = `${VIEC_NGHI[nv.viec?.loai] || 'Đang nghỉ'} · ${p.duAn}`;
    }
    g.textContent = '';
    g.append(el('b', '', tieuDe), el('span', '', dong));
    g.classList.remove('an');
    if (this.troXY) {
      const [cx, cy] = this.troXY;
      const r = g.getBoundingClientRect();
      const left = Math.min(window.innerWidth - r.width - 8, cx + 14);
      const top = cy + 18 + r.height > window.innerHeight - 8 ? cy - r.height - 12 : cy + 18;
      g.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
    }
  }

  // Gọi mỗi khung hình: đặt nhãn theo vị trí đầu người; nhãn nào chồng nhãn quan trọng hơn thì thu thành chấm.
  datNhan(rongMH, caoMH) {
    const cam = this.camera;
    const dat = [];
    for (const [id, n] of this.nhan) {
      const can = this._noiDungNhan(id, n);
      const p = can ? this.dp.viTri(id, this.v) : null;
      if (!p) {
        if (n.hien) {
          n.e.style.display = 'none';
          n.hien = false;
        }
        continue;
      }
      const kc = cam.position.distanceTo(p);
      p.project(cam);
      if (p.z > 1 || p.x < -1.1 || p.x > 1.1 || p.y < -1.1 || p.y > 1.1) {
        if (n.hien) {
          n.e.style.display = 'none';
          n.hien = false;
        }
        continue;
      }
      let uu = n.uuTien;
      if (id === this.chon) uu = -1;
      else if (id === this.tro) uu = -0.5;
      dat.push({ id, n, x: (p.x * 0.5 + 0.5) * rongMH, y: (-p.y * 0.5 + 0.5) * caoMH, uu, kc });
    }
    dat.sort((a, b) => a.uu - b.uu || a.kc - b.kc);
    const daDat = [];
    const chong = (r) => daDat.some((o) => r.x1 < o.x2 && r.x2 > o.x1 && r.y1 < o.y2 && r.y2 > o.y1);
    for (const d of dat) {
      const { n, x, y } = d;
      const day = { x1: x - n.rong / 2 - 3, x2: x + n.rong / 2 + 3, y1: y - n.cao - 2, y2: y + 2 };
      let gon = false;
      if (d.uu > 0 && (n.gonSan || chong(day))) {
        gon = true;
        daDat.push({ x1: x - 7, x2: x + 7, y1: y - 14, y2: y });
      } else daDat.push(day);
      if (!n.hien) {
        n.e.style.display = '';
        n.hien = true;
      }
      if (n.gon !== gon) {
        n.e.classList.toggle('gon', gon);
        n.gon = gon;
      }
      n.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      n.e.style.zIndex = String(100 - Math.round(d.uu * 10));
    }
    for (const k of this.nhanKhu) {
      const p = this.v.copy(k.p).project(cam);
      if (p.z > 1) {
        k.e.style.display = 'none';
        continue;
      }
      k.e.style.display = '';
      k.e.style.transform = `translate(${((p.x * 0.5 + 0.5) * rongMH).toFixed(1)}px, ${((-p.y * 0.5 + 0.5) * caoMH).toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
}
