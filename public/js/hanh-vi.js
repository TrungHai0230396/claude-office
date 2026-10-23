// Điều phối người trong văn phòng theo trạng thái phiên:
//   đang làm  → về bàn mình, ngồi gõ (màn hình đổi theo việc: viết mã, chạy lệnh, đọc, lướt web…)
//   chờ duyệt → ôm tờ trình sang phòng duyệt, xếp hàng trước bàn sếp (chờ lâu thì ngồi ghế chờ)
//   xong việc → vươn vai, đi pha cà phê, rồi đứng bàn cao, ngồi sofa, dạo vườn, ngồi ghế đá…
//   lỗi       → ngồi ôm đầu trước màn hình đỏ
//   lâu không dùng → gục bàn ngủ
import * as THREE from 'three';
import { Nguoi, TroLy, ngoaiHinhTheoMa, bam } from './nguoi.js';
import { xepBan, dongDauDuyet, datHoiCaPhe, KHU } from './van-phong.js';

export const NGU_SAU = 8 * 3600e3;
const CHO_LAU = 60 * 60e3;
const LOI_VAO = { x: 4.8, z: 11.0 };
const BANG_MAU = ['#d08a6c', '#6e9cc8', '#7eae8c', '#a48bc4', '#d2ae5a', '#cc8b9c', '#6eb0b0', '#98a2ad', '#c09068', '#8193c9'];

const MAN_THEO_VIEC = { nghi: 'nghi', go: 'ma', viet: 'ma', lenh: 'lenh', doc: 'doc', web: 'web', trinhDuyet: 'web', giaoViec: 'troLy', doi: 'lenh' };
const TU_THE_THEO_VIEC = { nghi: 'ngoiNghi', go: 'ngoiGo', viet: 'ngoiGo', lenh: 'ngoiGo', doc: 'ngoiChuot', web: 'ngoiChuot', trinhDuyet: 'ngoiChuot', giaoViec: 'ngoiGo', doi: 'ngoiNghi' };
const MUC_GO = { go: 1, viet: 0.8, lenh: 0.7, giaoViec: 0.5 };

export function trangThaiHien(p, bayGio) {
  if (p.trangThai === 'lam') return 'lam';
  if (p.trangThai === 'cho') return 'cho';
  if (p.trangThai === 'loi') return 'loi';
  const nghi = bayGio - (p.hoatDongCuoi || 0);
  return nghi > NGU_SAU ? 'ngu' : 'nghi';
}

function ngauNhien(hat) {
  let s = (hat >>> 0) || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909);
    s ^= s >>> 16;
    return (s >>> 0) / 4294967296;
  };
}

export class DieuPhoi {
  constructor(vp, scene, manHinh) {
    this.vp = vp;
    this.scene = scene;
    this.manHinh = manHinh;
    this.ds = new Map();
    this.ghe = new Map();
    this.mauDuAn = new Map();
    this.khoaBan = '';
    this.lanDau = true;
    this.t = 0;
    this.soCho = 0;
    this.manDangDung = new Set(['sep']);
    this.dsDuAn = [];

    const s = this.vp.gheSep;
    this.sep = new Nguoi(
      { mauAo: '#26324a', mauDa: '#e9bd9b', mauToc: '#2a211d', mauQuan: '#1f2638', kieuToc: 'ngan', kinh: true, cao: 1.02, hat: 0.37 },
      { laSep: true },
    );
    this.sep.goc.position.set(s.x, 0, s.z);
    this.sep.goc.rotation.y = s.yaw;
    this.sep.datTuThe('ngoiChuot');
    this.sep.goc.userData.ma = 'sep';
    this.sep.trung.userData.ma = 'sep';
    scene.add(this.sep.goc);
    this.sepDongDauDen = -10;
  }

  // ---------- nhận dữ liệu mới ----------
  capNhatPhien(dsPhien, bayGio) {
    const ds = [...dsPhien].sort((a, b) => (a.taoLuc || 0) - (b.taoLuc || 0));
    // Màu theo dự án (xếp theo tên cho ổn định).
    const tenDuAn = [...new Set(ds.map((p) => p.duAn))].sort((a, b) => a.localeCompare(b, 'vi'));
    tenDuAn.forEach((ten, i) => {
      if (!this.mauDuAn.has(ten)) {
        const daDung = new Set(this.mauDuAn.values());
        const mau = BANG_MAU.find((m) => !daDung.has(m)) || BANG_MAU[i % BANG_MAU.length];
        this.mauDuAn.set(ten, mau);
      }
    });
    // Cụm bàn: dự án đông người xếp trước.
    const theoDuAn = new Map();
    for (const p of ds) {
      if (!theoDuAn.has(p.duAn)) theoDuAn.set(p.duAn, []);
      theoDuAn.get(p.duAn).push(p.id);
    }
    const nhom = [...theoDuAn.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'vi'))
      .map(([ten, ma]) => ({ ten, mau: this.mauDuAn.get(ten), ma }));
    this.dsDuAn = nhom.map((n) => ({ ten: n.ten, mau: n.mau, so: n.ma.length }));
    const khoa = JSON.stringify(nhom.map((n) => [n.ten, n.ma]));
    let doiBan = false;
    if (khoa !== this.khoaBan) {
      this.khoaBan = khoa;
      this.ghe = xepBan(this.vp, this.manHinh, nhom);
      doiBan = true;
    }

    // Người mới vào, người đã đi (phiên lưu trữ).
    const con = new Set(ds.map((p) => p.id));
    for (const [id, nv] of this.ds) {
      if (!con.has(id)) {
        this._traCho(nv);
        for (const tl of nv.troLy) this.scene.remove(tl.goc);
        this.scene.remove(nv.nguoi.goc);
        this.ds.delete(id);
      }
    }
    for (const p of ds) {
      let nv = this.ds.get(p.id);
      const moi = !nv;
      if (moi) {
        const mau = new THREE.Color(this.mauDuAn.get(p.duAn));
        mau.offsetHSL(0, -0.05, ((bam(p.id) % 13) - 6) / 100);
        const nguoi = new Nguoi(ngoaiHinhTheoMa(p.id, '#' + mau.getHexString()));
        nguoi.goc.userData.ma = p.id;
        nguoi.trung.userData.ma = p.id;
        this.scene.add(nguoi.goc);
        nv = {
          id: p.id,
          nguoi,
          phien: p,
          hien: null,
          x: LOI_VAO.x,
          z: LOI_VAO.z,
          yaw: Math.PI,
          duong: [],
          tocDo: 0,
          tocDoMuc: 1.35,
          dich: null,
          treo: 0,
          viec: null,
          choGiu: null,
          troLy: [],
          ngau: ngauNhien(bam(p.id)),
          luotViec: 0,
          vongHuong: bam(p.id) % 2 ? 1 : -1,
        };
        this.ds.set(p.id, nv);
      }
      const truoc = nv.hien;
      nv.phien = p;
      nv.hien = trangThaiHien(p, bayGio);
      const ghe = this.ghe.get(p.id);
      nv.ghe = ghe;
      if (moi && this.lanDau) {
        // Lần đầu mở trang: mọi người đã ở sẵn chỗ của mình.
        nv.daoNgay = true;
      }
      if (nv.hien !== truoc || (doiBan && this._dichLaGhe(nv))) this._doiTrangThai(nv, truoc);
    }
    this._xepHangCho(bayGio);
    if (this.lanDau) {
      for (const nv of this.ds.values()) {
        if (nv.dich) {
          nv.x = nv.dich.x;
          nv.z = nv.dich.z;
          nv.yaw = nv.dich.yaw;
          nv.duong = [];
          nv.den = true;
          nv.nguoi.datTuThe(nv.dich.tuThe);
          nv.treo = 0;
          if (nv.dich.loai === 'vong') nv.vongI = nv.dich.vongI;
        }
        nv.daoNgay = false;
      }
    }
    this.lanDau = false;
  }

  _dichLaGhe(nv) {
    return nv.dich && nv.dich.loai === 'ghe';
  }

  _doiTrangThai(nv, truoc) {
    const h = nv.hien;
    if (h === 'lam' || h === 'loi' || h === 'ngu') {
      this._traCho(nv);
      nv.viec = null;
      if (truoc === 'cho' && h === 'lam') {
        // Vừa được duyệt: sếp đóng dấu, người vui vẻ quay về bàn.
        this.sepDongDauDen = this.t + 2.6;
        dongDauDuyet(this.vp, this.t);
        nv.camLai = '';
      }
      this._denGhe(nv, h === 'lam' && truoc !== 'lam' && truoc !== null ? 1.9 : 1.35);
    } else if (h === 'cho') {
      this._traCho(nv);
      nv.viec = null;
      nv.nguoi.camDo('giay');
      // Chỗ trong hàng chờ được xếp chung ở _xepHangCho.
      nv.dich = null;
    } else if (h === 'nghi') {
      nv.luotViec = 0;
      if (truoc === 'lam' && !nv.daoNgay) {
        // Xong việc: vươn vai ở bàn rồi đi pha cà phê.
        nv.nguoi.datTuThe('vuonVai');
        nv.treo = this.t + 2.6;
        nv.viec = { loai: 'mayPha', het: 0 };
      } else {
        nv.viec = null;
      }
      this._viecNghiTiep(nv, true);
    }
  }

  _denGhe(nv, tocDo = 1.35) {
    const g = nv.ghe;
    if (!g) return;
    nv.nguoi.camDo('');
    const tuThe = nv.hien === 'loi' ? 'ngoiOmDau' : nv.hien === 'ngu' ? 'nguGuc' : TU_THE_THEO_VIEC[nv.phien.viec?.loai] || 'ngoiGo';
    this._datDich(nv, { loai: 'ghe', x: g.x, z: g.z, yaw: g.yaw, tuThe, cu: '', ngoi: true }, tocDo);
  }

  // ---------- hàng chờ duyệt ----------
  _xepHangCho(bayGio) {
    const cho = [...this.ds.values()].filter((nv) => nv.hien === 'cho');
    this.soCho = cho.length;
    cho.sort((a, b) => (a.phien.duyet?.tu || 0) - (b.phien.duyet?.tu || 0) || a.id.localeCompare(b.id));
    const hang = this.vp.cho.hangCho;
    const ghe = this.vp.cho.gheCho;
    const lau = cho.filter((nv) => bayGio - (nv.phien.duyet?.tu || bayGio) > CHO_LAU);
    const moi = cho.filter((nv) => !lau.includes(nv));
    // Chờ lâu thì ngồi ghế chờ (hết ghế thì đứng cuối hàng); người mới đứng hàng theo thứ tự đến.
    const ngoi = lau.slice(0, ghe.length);
    const dung = [...moi, ...lau.slice(ghe.length)];
    const chon = new Map();
    ngoi.forEach((nv, i) => chon.set(nv.id, { ...ghe[i], loai: 'gheCho', tuThe: 'ngoi', cu: '', ngoi: true, sau: i }));
    dung.forEach((nv, i) => {
      if (i < hang.length) chon.set(nv.id, { ...hang[i], loai: 'hang', sau: i });
      else {
        // Hàng dài quá cửa: đứng nối ra hành lang.
        const k = i - hang.length;
        chon.set(nv.id, { id: 'ngoai-' + k, x: 7.9 + (k % 2) * 0.7, z: -1.7 + Math.floor(k / 2) * 0.75, yaw: Math.PI, tuThe: 'dungCho', cu: 'xemGio', loai: 'hang', sau: i });
      }
    });
    for (const nv of cho) {
      const d = chon.get(nv.id);
      if (!nv.dich || nv.dich.id !== d.id) this._datDich(nv, d, nv.dich ? 1.2 : 1.8);
    }
  }

  // ---------- việc lúc nghỉ ----------
  _traCho(nv) {
    if (nv.choGiu) {
      nv.choGiu.nguoi = null;
      nv.choGiu = null;
    }
  }

  _layCho(nhom, nv) {
    const ds = this.vp.cho[nhom].filter((c) => !c.nguoi);
    if (!ds.length) return null;
    // Bàn cao, sofa: ưu tiên chỗ cạnh người đang đứng sẵn để có bạn nói chuyện.
    let chon = ds[Math.floor(nv.ngau() * ds.length)];
    if (nhom === 'banCao' || nhom === 'sofa') {
      const coNguoi = this.vp.cho[nhom].filter((c) => c.nguoi);
      const gan = ds.filter((c) => coNguoi.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 1.9));
      if (gan.length && nv.ngau() < 0.7) chon = gan[Math.floor(nv.ngau() * gan.length)];
    }
    chon.nguoi = nv.id;
    nv.choGiu = chon;
    return chon;
  }

  _viecNghiTiep(nv, batDau = false) {
    const r = nv.ngau;
    this._traCho(nv);
    let loai = nv.viec?.loai;
    if (!batDau || !loai) {
      const truoc = nv.viec?.loai;
      const coCoc = nv.nguoi.doCam === 'coc';
      // Ưu tiên ngồi yên (sofa, ghế đá) cho cảnh đỡ rối mắt; đi dạo ít thôi.
      const chon = [
        ['banCao', coCoc ? 2.5 : 1],
        ['sofa', coCoc ? 3.5 : 2.5],
        ['vong', 0.9],
        ['gheDa', 2.2],
        ['cayNuoc', 0.7],
        ['mayPha', coCoc ? 0.2 : 1.5],
      ].filter(([l]) => l !== truoc);
      let tong = chon.reduce((s, [, w]) => s + w, 0);
      let x = r() * tong;
      loai = chon[chon.length - 1][0];
      for (const [l, w] of chon) {
        x -= w;
        if (x <= 0) {
          loai = l;
          break;
        }
      }
    }
    const thoiGian = { mayPha: 12, banCao: 110, sofa: 180, vong: 70, gheDa: 150, cayNuoc: 60 }[loai];
    nv.viec = { loai, het: this.t + (thoiGian * (0.7 + r() * 0.6)) + (nv.treo > this.t ? nv.treo - this.t : 0) };
    nv.luotViec++;
    if (loai === 'vong') {
      // Tới điểm gần nhất trên lối dạo rồi đi vòng.
      const v = this.vp.vongDao;
      let tot = 0;
      let kc = Infinity;
      v.forEach(([x, z], i) => {
        const d = Math.hypot(x - nv.x, z - nv.z);
        if (d < kc) {
          kc = d;
          tot = i;
        }
      });
      if (nv.daoNgay) tot = Math.floor(r() * v.length);
      this._datDich(nv, { loai: 'vong', id: 'vong', x: v[tot][0], z: v[tot][1], yaw: 0, tuThe: nv.nguoi.doCam === 'coc' ? 'camCoc' : 'dung', cu: '', vongI: tot }, 1.2);
      return;
    }
    const cho = this._layCho(loai, nv);
    if (!cho) {
      // Hết chỗ: đi dạo.
      nv.viec.loai = 'vong';
      return this._viecNghiTiep(nv, true);
    }
    if (loai === 'gheDa' && cho.cam === 'dienThoai' && nv.nguoi.doCam !== 'coc') nv.camLai = 'dienThoai';
    let tuThe = cho.tuThe;
    if (loai === 'sofa' && nv.nguoi.doCam !== 'coc') tuThe = 'ngoiSofa';
    if (loai === 'banCao' && nv.nguoi.doCam !== 'coc') nv.camLai = 'coc';
    this._datDich(nv, { ...cho, loai, tuThe }, 1.2);
  }

  // ---------- đi lại ----------
  _datDich(nv, dich, tocDo = 1.35) {
    nv.dich = dich;
    nv.den = false;
    nv.tocDoMuc = tocDo;
    const duong = this.vp.luoi.timDuong(nv.x, nv.z, dich.x, dich.z);
    nv.duong = duong || [[dich.x, dich.z]];
    // Đang ngồi thì đứng dậy trước.
    const dangNgoi = nv.nguoi.tuTheTen.startsWith('ngoi') || nv.nguoi.tuTheTen === 'nguGuc' || nv.nguoi.tuTheTen === 'ngaNgu';
    if (dangNgoi && Math.hypot(dich.x - nv.x, dich.z - nv.z) > 0.3) {
      nv.nguoi.datTuThe(nv.nguoi.doCam === 'giay' ? 'omGiay' : 'dung');
      nv.treo = Math.max(nv.treo, this.t + 0.55);
    }
  }

  capNhat(dt, t, bayGio) {
    this.t = t;
    this.manDangDung.clear();
    this.manDangDung.add('sep');
    let coAiPha = false;
    for (const nv of this.ds.values()) {
      this._buoc(nv, dt, t);
      if (nv.den && nv.dich?.loai === 'mayPha' && nv.dich.id === 'may-0') coAiPha = true;
    }
    datHoiCaPhe(this.vp, coAiPha ? 0.55 : 0.16);
    this._sep(dt, t);
  }

  _buoc(nv, dt, t) {
    const ng = nv.nguoi;
    // Hết giờ việc nghỉ thì chuyển việc khác.
    if (nv.hien === 'nghi' && nv.viec && t > nv.viec.het && t > nv.treo) {
      if (nv.viec.loai === 'mayPha' && nv.den) ng.camDo('coc');
      this._viecNghiTiep(nv);
    }
    let tocDo = 0;
    if (t >= nv.treo && !nv.den) {
      if (ng.tuTheTen === 'vuonVai') ng.datTuThe('dung');
      const doCam = nv.hien === 'cho' ? 'giay' : ng.doCam;
      ng.datTuThe(doCam === 'giay' ? 'omGiay' : doCam === 'coc' ? 'camCoc' : 'dung');
      const dich = nv.duong[0];
      if (dich) {
        const dx = dich[0] - nv.x;
        const dz = dich[1] - nv.z;
        const kc = Math.hypot(dx, dz);
        nv.tocDo += (nv.tocDoMuc - nv.tocDo) * (1 - Math.exp(-dt * 4));
        const di = Math.min(kc, nv.tocDo * dt);
        if (kc > 1e-4) {
          nv.x += (dx / kc) * di;
          nv.z += (dz / kc) * di;
          nv.yaw = xoayVe(nv.yaw, Math.atan2(dx, dz), dt * 8);
        }
        tocDo = nv.tocDo;
        if (kc - di < 0.02) nv.duong.shift();
      }
      if (!nv.duong.length) {
        if (nv.dich?.loai === 'vong' && nv.hien === 'nghi') {
          // Đi tiếp điểm kế trên vòng dạo.
          const v = this.vp.vongDao;
          nv.dich.vongI = (nv.dich.vongI + nv.vongHuong + v.length) % v.length;
          nv.duong = [v[nv.dich.vongI]];
          nv.tocDoMuc = 0.7 + (bam(nv.id) % 20) / 100;
        } else {
          nv.den = true;
          nv.tocDo = 0;
          if (nv.dich) ng.datTuThe(nv.dich.tuThe);
          if (nv.camLai !== undefined) {
            if (nv.hien === 'nghi' || nv.camLai === '') ng.camDo(nv.camLai);
            nv.camLai = undefined;
          }
          if (nv.hien === 'cho') ng.camDo('giay');
        }
      }
    } else if (nv.den && nv.dich) {
      nv.yaw = xoayVe(nv.yaw, nv.dich.yaw, dt * 5);
      // Đang ngồi làm việc: tư thế theo việc đang làm.
      if (nv.dich.loai === 'ghe') {
        const tuThe = nv.hien === 'loi' ? 'ngoiOmDau' : nv.hien === 'ngu' ? 'nguGuc' : TU_THE_THEO_VIEC[nv.phien.viec?.loai] || 'ngoiGo';
        ng.datTuThe(tuThe);
      }
    }

    const dangLam = nv.hien === 'lam' && nv.den && nv.dich?.loai === 'ghe';
    const loaiViec = nv.phien.viec?.loai;
    const go = dangLam ? MUC_GO[loaiViec] || 0 : 0;
    let cu = nv.dich?.cu || '';
    if (nv.den && nv.dich?.loai === 'hang') cu = 'xemGio';
    if (dangLam && (loaiViec === 'doc' || loaiViec === 'web' || loaiViec === 'trinhDuyet')) cu = 'cuon';
    if (nv.den && ng.doCam === 'coc' && (nv.dich?.loai === 'banCao' || nv.dich?.loai === 'sofa' || nv.dich?.loai === 'vong')) cu = cu === 'noi' && Math.sin(t * 0.21 + nv.luotViec) > 0 ? 'noi' : 'hop';
    if (!nv.den && ng.doCam === 'coc') cu = 'hop';
    ng.capNhat(dt, t, { tocDo, go, cu, nhinY: this._nhin(nv) });
    ng.goc.position.set(nv.x, 0, nv.z);
    ng.goc.rotation.y = nv.yaw;

    // Màn hình ở bàn.
    if (nv.ghe) {
      const kieu = nv.hien === 'lam' ? MAN_THEO_VIEC[loaiViec] || 'ma' : nv.hien === 'cho' ? 'cho' : nv.hien === 'loi' ? 'loi' : nv.hien === 'ngu' ? 'ngu' : 'tat';
      const vl = this.manHinh.vatLieu(kieu);
      if (nv.ghe.manHinh.material !== vl) nv.ghe.manHinh.material = vl;
      this.manDangDung.add(kieu);
    }

    // Trợ lý (subagent) bay quanh bàn.
    const soTL = nv.hien === 'lam' || nv.hien === 'cho' ? Math.min(4, nv.phien.troLy || 0) : 0;
    while (nv.troLy.length < soTL) {
      const tl = new TroLy(this.mauDuAn.get(nv.phien.duAn) || '#d97757');
      this.scene.add(tl.goc);
      nv.troLy.push(tl);
    }
    while (nv.troLy.length > soTL) this.scene.remove(nv.troLy.pop().goc);
    if (nv.ghe) {
      nv.troLy.forEach((tl, i) => {
        const lech = (i - (nv.troLy.length - 1) / 2) * 0.5;
        tl.capNhat(t, nv.ghe.banX + lech, nv.ghe.banZ, nv.ghe.yaw + Math.PI);
      });
    }
  }

  // Quay đầu nhìn người bên cạnh khi đứng nói chuyện.
  _nhin(nv) {
    if (!nv.den || !nv.dich || !['banCao', 'sofa', 'cayNuoc', 'gheDa'].includes(nv.dich.loai)) return 0;
    let tot = null;
    let kc = 2.2;
    for (const o of this.ds.values()) {
      if (o === nv || !o.den || o.dich?.loai !== nv.dich.loai) continue;
      const d = Math.hypot(o.x - nv.x, o.z - nv.z);
      if (d < kc) {
        kc = d;
        tot = o;
      }
    }
    if (!tot) return 0;
    let lech = Math.atan2(tot.x - nv.x, tot.z - nv.z) - nv.yaw;
    lech = Math.atan2(Math.sin(lech), Math.cos(lech));
    return Math.max(-0.9, Math.min(0.9, lech));
  }

  _sep(dt, t) {
    const sep = this.sep;
    const dongDau = t < this.sepDongDauDen;
    sep.datTuThe(this.soCho > 0 ? 'ngoiNghi' : 'ngoiChuot');
    let nhinY = 0;
    if (this.soCho > 0) {
      const dau = [...this.ds.values()].find((nv) => nv.hien === 'cho' && nv.den && nv.dich?.sau === 0 && nv.dich?.loai === 'hang');
      if (dau) {
        const lech = Math.atan2(dau.x - sep.goc.position.x, dau.z - sep.goc.position.z) - sep.goc.rotation.y;
        nhinY = Math.max(-0.8, Math.min(0.8, Math.atan2(Math.sin(lech), Math.cos(lech))));
      }
    }
    if (dongDau) sep.datTuThe('ngoi');
    sep.capNhat(dt, t, { cu: dongDau ? 'dongDau' : this.soCho ? '' : 'cuon', nhinY });
    this.manHinh.trangThaiSep.soCho = this.soCho;
  }

  // Vị trí đỉnh đầu của một người (để gắn nhãn, bay máy quay tới).
  viTri(ma, dich = new THREE.Vector3()) {
    if (ma === 'sep') return this.sep.dinhDau(dich);
    const nv = this.ds.get(ma);
    if (!nv) return null;
    return nv.nguoi.dinhDau(dich);
  }

  khoiBam() {
    const ds = [this.sep.trung];
    for (const nv of this.ds.values()) ds.push(nv.nguoi.trung);
    return ds;
  }
}

function xoayVe(hienTai, dich, buoc) {
  let lech = dich - hienTai;
  lech = Math.atan2(Math.sin(lech), Math.cos(lech));
  return hienTai + lech * Math.min(1, buoc);
}

export { KHU };
