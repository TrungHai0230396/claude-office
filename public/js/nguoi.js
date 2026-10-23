// Một người trong văn phòng: thân, đầu, tay chân dựng bằng khối đơn giản, có khớp vai, khuỷu,
// hông, gối. Tư thế (ngồi gõ phím, đứng cầm cà phê, ôm tờ trình, ngủ gục…) được nội suy mượt,
// rồi chồng thêm nhịp đi, nhịp gõ, nhịp thở cho sống động.
import * as THREE from 'three';

const HINH = {
  than: new THREE.CapsuleGeometry(0.165, 0.27, 4, 12),
  hong: new THREE.CylinderGeometry(0.165, 0.155, 0.2, 12),
  co: new THREE.CylinderGeometry(0.05, 0.058, 0.1, 8),
  dau: new THREE.SphereGeometry(0.16, 18, 14),
  tocNgan: new THREE.SphereGeometry(0.168, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52),
  tocSau: new THREE.CapsuleGeometry(0.13, 0.2, 4, 10),
  bui: new THREE.SphereGeometry(0.075, 12, 10),
  xoan: new THREE.SphereGeometry(0.06, 8, 6),
  muDinh: new THREE.CylinderGeometry(0.17, 0.17, 0.1, 18, 1, false, 0, Math.PI * 2),
  luoiTrai: new THREE.BoxGeometry(0.22, 0.02, 0.14),
  mat: new THREE.SphereGeometry(0.02, 8, 6),
  gong: new THREE.TorusGeometry(0.036, 0.007, 6, 16),
  cauKinh: new THREE.BoxGeometry(0.03, 0.008, 0.008),
  ma: new THREE.SphereGeometry(0.03, 8, 6),
  canhTay: new THREE.CapsuleGeometry(0.054, 0.19, 4, 8),
  cangTay: new THREE.CapsuleGeometry(0.047, 0.18, 4, 8),
  banTay: new THREE.SphereGeometry(0.052, 10, 8),
  dui: new THREE.CapsuleGeometry(0.072, 0.27, 4, 8),
  cang: new THREE.CapsuleGeometry(0.062, 0.29, 4, 8),
  ban: new THREE.BoxGeometry(0.11, 0.075, 0.24),
  coc: new THREE.CylinderGeometry(0.042, 0.036, 0.1, 12),
  matCoc: new THREE.CircleGeometry(0.036, 12),
  quaiCoc: new THREE.TorusGeometry(0.025, 0.007, 6, 10, Math.PI),
  bia: new THREE.BoxGeometry(0.25, 0.33, 0.025),
  giayTo: new THREE.BoxGeometry(0.22, 0.29, 0.03),
  dienThoai: new THREE.BoxGeometry(0.075, 0.14, 0.012),
  caVat: new THREE.BoxGeometry(0.05, 0.26, 0.02),
  coAo: new THREE.BoxGeometry(0.16, 0.06, 0.02),
  trungChe: new THREE.CylinderGeometry(0.32, 0.32, 1.95, 8),
};
HINH.matCoc.rotateX(-Math.PI / 2);

const KHO_VL = new Map();
export function vatLieu(mau, them = {}) {
  const khoa = mau + JSON.stringify(them);
  let v = KHO_VL.get(khoa);
  if (!v) {
    v = new THREE.MeshStandardMaterial({ color: mau, roughness: 0.78, metalness: 0, ...them });
    KHO_VL.set(khoa, v);
  }
  return v;
}

export const MAU_DA = ['#f3d4b8', '#e9bd9b', '#d6a07a', '#b97f58', '#8f5c3d'];
export const MAU_TOC = ['#2a211d', '#3e2c20', '#59391f', '#7a4a29', '#1b1b1d', '#a2774a', '#c8a26c', '#6b6b6b'];
export const MAU_QUAN = ['#2f3a4f', '#3a3a3d', '#4b5059', '#5a4a3b', '#2f4b40', '#283046', '#6a5a4c'];
export const KIEU_TOC = ['ngan', 'ngan', 'dai', 'bui', 'xoan', 'mu', 'troc'];

export function bam(chuoi) {
  let h = 2166136261;
  for (let i = 0; i < chuoi.length; i++) {
    h ^= chuoi.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Ngoại hình cố định theo mã phiên: cùng phiên thì lần nào mở cũng là người ấy.
export function ngoaiHinhTheoMa(ma, mauAo) {
  const h = bam(ma);
  const chon = (ds, dich) => ds[(h >>> dich) % ds.length];
  return {
    mauAo,
    mauDa: chon(MAU_DA, 0),
    mauToc: chon(MAU_TOC, 4),
    mauQuan: chon(MAU_QUAN, 8),
    kieuToc: chon(KIEU_TOC, 12),
    kinh: ((h >>> 16) & 7) < 2,
    cao: 0.95 + ((h >>> 20) % 9) / 100,
    hat: (h % 1000) / 1000,
  };
}

const TU_THE_GOC = {
  hongY: 0.9, hongX: 0, thanX: 0, thanZ: 0, thanY: 0, dauX: 0, dauY: 0, dauZ: 0,
  vaiTX: 0, vaiTZ: 0.1, khuyuTX: -0.15, vaiPX: 0, vaiPZ: -0.1, khuyuPX: -0.15,
  duiTX: 0, duiTZ: 0, goiTX: 0, duiPX: 0, duiPZ: 0, goiPX: 0,
};
const NGOI = { hongY: 0.5, duiTX: -1.5, goiTX: 1.5, duiPX: -1.5, goiPX: 1.5, duiTZ: 0.06, duiPZ: -0.06 };

// Tư thế nền; các nhịp động (gõ, đi, thở) được cộng thêm khi chạy.
export const TU_THE = {
  dung: {},
  di: {},
  ngoi: { ...NGOI, vaiTX: -0.25, khuyuTX: -0.9, vaiPX: -0.25, khuyuPX: -0.9 },
  ngoiGo: { ...NGOI, thanX: 0.15, dauX: 0.05, vaiTX: -0.45, vaiTZ: -0.08, khuyuTX: -1.05, vaiPX: -0.45, vaiPZ: 0.08, khuyuPX: -1.05 },
  ngoiChuot: { ...NGOI, thanX: 0.04, dauX: 0.05, vaiTX: -0.2, vaiTZ: 0.02, khuyuTX: -1.25, vaiPX: -0.55, vaiPZ: -0.12, khuyuPX: -1.0 },
  ngoiNghi: { ...NGOI, thanX: -0.05, dauX: -0.12, dauZ: 0.12, vaiTX: -0.3, vaiTZ: -0.2, khuyuTX: -1.5, vaiPX: -0.95, vaiPZ: 0.32, khuyuPX: -2.35 },
  ngoiOmDau: { ...NGOI, thanX: 0.22, dauX: 0.3, vaiTX: -2.25, vaiTZ: 0.45, khuyuTX: -1.95, vaiPX: -2.25, vaiPZ: -0.45, khuyuPX: -1.95 },
  nguGuc: { ...NGOI, thanX: 0.62, dauX: 0.5, dauZ: 0.35, vaiTX: -0.95, vaiTZ: -0.18, khuyuTX: -1.45, vaiPX: -0.95, vaiPZ: 0.18, khuyuPX: -1.45 },
  ngoiSofa: { ...NGOI, hongY: 0.46, thanX: -0.18, dauX: -0.05, vaiTX: -0.15, vaiTZ: 0.3, khuyuTX: -0.7, vaiPX: -0.15, vaiPZ: -0.3, khuyuPX: -0.7 },
  ngoiCoc: { ...NGOI, hongY: 0.46, thanX: -0.12, vaiTX: -0.15, vaiTZ: 0.25, khuyuTX: -0.8, vaiPX: -0.3, vaiPZ: -0.12, khuyuPX: -1.5 },
  ngoiDienThoai: { ...NGOI, thanX: 0.14, dauX: 0.5, vaiTX: -0.4, vaiTZ: -0.2, khuyuTX: -1.75, vaiPX: -0.4, vaiPZ: 0.2, khuyuPX: -1.75 },
  ngaNgu: { ...NGOI, hongY: 0.34, duiTX: -1.25, goiTX: 1.0, duiPX: -1.25, goiPX: 1.0, duiTZ: 0.22, duiPZ: -0.22, thanX: -0.55, dauX: -0.15, dauZ: 0.45, vaiTZ: 0.45, khuyuTX: -0.35, vaiPZ: -0.45, khuyuPX: -0.35 },
  camCoc: { vaiPX: -0.32, vaiPZ: -0.08, khuyuPX: -1.55, vaiTZ: 0.12 },
  omGiay: { vaiTX: -0.42, vaiTZ: -0.05, khuyuTX: -1.62, vaiPX: -0.42, vaiPZ: 0.05, khuyuPX: -1.62 },
  dungCho: { vaiTX: -0.42, vaiTZ: -0.05, khuyuTX: -1.62, vaiPX: -0.42, vaiPZ: 0.05, khuyuPX: -1.62, dauX: 0.05 },
  phaCaPhe: { thanX: 0.06, dauX: 0.18, vaiPX: -0.9, vaiPZ: 0.05, khuyuPX: -0.55, vaiTZ: 0.12 },
  vuonVai: { thanX: -0.12, dauX: -0.3, vaiTX: -2.9, vaiTZ: 0.2, khuyuTX: -0.25, vaiPX: -2.9, vaiPZ: -0.2, khuyuPX: -0.25 },
  ngam: { dauX: -0.22, vaiTX: 0.15, vaiTZ: 0.05, khuyuTX: -0.3, vaiPX: 0.15, vaiPZ: -0.05, khuyuPX: -0.3 },
};

const TEN_KHOP = Object.keys(TU_THE_GOC);

export class Nguoi {
  constructor(nh, { laSep = false } = {}) {
    this.nh = nh;
    this.laSep = laSep;
    this.goc = new THREE.Group();
    this.goc.scale.setScalar(nh.cao || 1);
    const vlAo = vatLieu(nh.mauAo);
    const vlDa = vatLieu(nh.mauDa);
    const vlToc = vatLieu(nh.mauToc, { roughness: 0.9 });
    const vlQuan = vatLieu(nh.mauQuan);
    const vlGiay = vatLieu('#2a2522');
    const vlMat = vatLieu('#1d1a18', { roughness: 0.4 });

    const luoi = (hinh, vl, cha, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(hinh, vl);
      m.position.set(x, y, z);
      m.castShadow = true;
      cha.add(m);
      return m;
    };
    const khop = (cha, x, y, z) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      cha.add(g);
      return g;
    };

    this.hongG = khop(this.goc, 0, 0.9, 0);
    luoi(HINH.hong, vlQuan, this.hongG, 0, 0.02, 0).scale.set(1, 1, 0.74);
    this.thanG = khop(this.hongG, 0, 0.06, 0);
    const than = luoi(HINH.than, vlAo, this.thanG, 0, 0.27, 0);
    than.scale.set(1, 1, 0.74);
    luoi(HINH.co, vlDa, this.thanG, 0, 0.6, 0);
    if (laSep) {
      luoi(HINH.coAo, vatLieu('#f7f7f4'), this.thanG, 0, 0.53, 0.105).rotation.x = -0.25;
      luoi(HINH.caVat, vatLieu('#c0392b'), this.thanG, 0, 0.38, 0.122);
    }

    this.dauG = khop(this.thanG, 0, 0.64, 0);
    luoi(HINH.dau, vlDa, this.dauG, 0, 0.13, 0);
    luoi(HINH.mat, vlMat, this.dauG, 0.055, 0.15, 0.145);
    luoi(HINH.mat, vlMat, this.dauG, -0.055, 0.15, 0.145);
    const ma = vatLieu('#e9937d', { transparent: true, opacity: 0.35 });
    luoi(HINH.ma, ma, this.dauG, 0.09, 0.09, 0.125).scale.set(1, 0.6, 0.4);
    luoi(HINH.ma, ma, this.dauG, -0.09, 0.09, 0.125).scale.set(1, 0.6, 0.4);
    this._dungToc(nh.kieuToc, vlToc, luoi);
    if (nh.kinh) {
      const vlKinh = vatLieu('#222222', { roughness: 0.3, metalness: 0.4 });
      luoi(HINH.gong, vlKinh, this.dauG, 0.055, 0.15, 0.152);
      luoi(HINH.gong, vlKinh, this.dauG, -0.055, 0.15, 0.152);
      luoi(HINH.cauKinh, vlKinh, this.dauG, 0, 0.152, 0.155);
    }

    const tay = (ben) => {
      const vai = khop(this.thanG, 0.215 * ben, 0.5, 0);
      luoi(HINH.canhTay, vlAo, vai, 0, -0.13, 0);
      const khuyu = khop(vai, 0, -0.27, 0);
      luoi(HINH.cangTay, laSep ? vlAo : vlDa, khuyu, 0, -0.12, 0);
      const banTay = khop(khuyu, 0, -0.255, 0);
      luoi(HINH.banTay, vlDa, banTay);
      return { vai, khuyu, banTay };
    };
    const t = tay(1);
    const p = tay(-1);
    this.vaiT = t.vai; this.khuyuT = t.khuyu; this.tayT = t.banTay;
    this.vaiP = p.vai; this.khuyuP = p.khuyu; this.tayP = p.banTay;

    const chan = (ben) => {
      const dui = khop(this.hongG, 0.088 * ben, -0.02, 0);
      luoi(HINH.dui, vlQuan, dui, 0, -0.2, 0);
      const goi = khop(dui, 0, -0.42, 0);
      luoi(HINH.cang, vlQuan, goi, 0, -0.2, 0);
      luoi(HINH.ban, vlGiay, goi, 0, -0.43, 0.045);
      return { dui, goi };
    };
    const ct = chan(1);
    const cp = chan(-1);
    this.duiT = ct.dui; this.goiT = ct.goi;
    this.duiP = cp.dui; this.goiP = cp.goi;

    // Đồ cầm tay, ẩn sẵn.
    this.coc = new THREE.Group();
    luoi(HINH.coc, vatLieu('#fbfaf7'), this.coc, 0, 0, 0);
    luoi(HINH.matCoc, vatLieu('#5b3a26'), this.coc, 0, 0.049, 0);
    const quai = luoi(HINH.quaiCoc, vatLieu('#fbfaf7'), this.coc, -0.045, 0, 0);
    quai.rotation.z = Math.PI / 2;
    this.coc.position.set(0, -0.04, 0.05);
    this.coc.visible = false;
    this.tayP.add(this.coc);

    this.giay = new THREE.Group();
    luoi(HINH.bia, vatLieu('#e9c46a'), this.giay, 0, 0, 0);
    luoi(HINH.giayTo, vatLieu('#ffffff'), this.giay, 0, 0.02, 0.006);
    this.giay.position.set(0, 0.28, 0.24);
    this.giay.rotation.x = -0.25;
    this.giay.visible = false;
    this.thanG.add(this.giay);

    this.dienThoai = new THREE.Mesh(HINH.dienThoai, vatLieu('#22252b', { roughness: 0.3 }));
    this.dienThoai.position.set(0.0, -0.05, 0.035);
    this.dienThoai.rotation.x = -1.1;
    this.dienThoai.visible = false;
    this.tayP.add(this.dienThoai);

    // Khối vô hình để bấm chọn cho dễ trúng.
    this.trung = new THREE.Mesh(HINH.trungChe, new THREE.MeshBasicMaterial());
    this.trung.position.y = 0.98;
    this.trung.visible = false;
    this.goc.add(this.trung);

    this.hienTai = { ...TU_THE_GOC };
    this.mucTieu = { ...TU_THE_GOC };
    this.tuTheTen = 'dung';
    this.nhipDi = 0;
    this.trongSoDi = 0;
    this.trongSoGo = 0;
    this.mucGo = 0;
    this.tocDo = 0;
    this.nhipRieng = nh.hat * 100;
    this.camDo('');
  }

  _dungToc(kieu, vlToc, luoi) {
    const d = this.dauG;
    if (kieu === 'troc') return;
    if (kieu === 'mu') {
      const vlMu = vatLieu(['#d64545', '#2d6cdf', '#2f9e6b', '#e0a72e'][Math.floor(this.nh.hat * 4)]);
      luoi(HINH.muDinh, vlMu, d, 0, 0.245, -0.005).scale.set(1, 1, 1.02);
      luoi(HINH.tocNgan, vlMu, d, 0, 0.17, -0.005).scale.set(1, 0.85, 1);
      luoi(HINH.luoiTrai, vlMu, d, 0, 0.215, 0.17).rotation.x = 0.12;
      return;
    }
    luoi(HINH.tocNgan, vlToc, d, 0, 0.15, -0.012).rotation.x = -0.18;
    if (kieu === 'dai') {
      luoi(HINH.tocSau, vlToc, d, 0, 0.02, -0.08).scale.set(1.1, 1, 0.55);
    } else if (kieu === 'bui') {
      luoi(HINH.bui, vlToc, d, 0, 0.27, -0.11);
    } else if (kieu === 'xoan') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        luoi(HINH.xoan, vlToc, d, Math.cos(a) * 0.12, 0.24 + Math.sin(a * 2) * 0.02, Math.sin(a) * 0.12 - 0.02);
      }
    }
  }

  // "coc", "giay", "dienThoai" hoặc "" (tay không).
  camDo(ten) {
    this.coc.visible = ten === 'coc';
    this.giay.visible = ten === 'giay';
    this.dienThoai.visible = ten === 'dienThoai';
    this.doCam = ten;
  }

  datTuThe(ten) {
    if (this.tuTheTen === ten) return;
    this.tuTheTen = ten;
    const tt = TU_THE[ten] || {};
    for (const k of TEN_KHOP) this.mucTieu[k] = tt[k] ?? TU_THE_GOC[k];
  }

  // tocDo: mét/giây khi đang đi (0 khi đứng yên); go: mức gõ phím 0..1.
  capNhat(dt, t, { tocDo = 0, go = 0, nhinY = 0, cu = '' } = {}) {
    const mem = 1 - Math.exp(-dt * 7);
    const h = this.hienTai;
    for (const k of TEN_KHOP) h[k] += (this.mucTieu[k] - h[k]) * mem;
    this.trongSoDi += ((tocDo > 0.05 ? 1 : 0) - this.trongSoDi) * (1 - Math.exp(-dt * 9));
    this.trongSoGo += (go - this.trongSoGo) * (1 - Math.exp(-dt * 5));
    if (tocDo > 0.05) this.nhipDi += dt * tocDo * 5.6;
    const r = this.nhipRieng;
    const td = t + r;

    let { hongY, hongX, thanX, thanY, thanZ, dauX, dauY, dauZ } = h;
    let { vaiTX, vaiTZ, khuyuTX, vaiPX, vaiPZ, khuyuPX, duiTX, duiTZ, goiTX, duiPX, duiPZ, goiPX } = h;

    // Thở.
    thanX += Math.sin(td * 1.7) * 0.012;
    // Ngó quanh nhè nhẹ, trừ lúc ngủ.
    const ngu = this.tuTheTen === 'nguGuc' || this.tuTheTen === 'ngaNgu';
    if (!ngu) {
      dauY += Math.sin(td * 0.23) * 0.06 + Math.sin(td * 0.61) * 0.02 + nhinY;
      dauX += Math.sin(td * 0.41) * 0.015;
    } else {
      thanX += Math.sin(td * 0.9) * 0.02;
    }

    // Nhịp đi.
    const w = this.trongSoDi;
    if (w > 0.001) {
      const p = this.nhipDi;
      const s = Math.sin(p);
      const c = Math.cos(p);
      const bien = Math.min(1, 0.55 + tocDo * 0.25);
      duiTX += w * -0.52 * s * bien;
      duiPX += w * 0.52 * s * bien;
      goiTX += w * (0.08 + 0.85 * Math.max(0, c)) * bien;
      goiPX += w * (0.08 + 0.85 * Math.max(0, -c)) * bien;
      if (this.doCam !== 'giay') {
        vaiTX += w * 0.42 * s * bien;
        if (this.doCam !== 'coc') vaiPX += w * -0.42 * s * bien;
        khuyuTX += w * -0.22;
        if (this.doCam !== 'coc') khuyuPX += w * -0.22;
      }
      hongY += w * 0.028 * Math.cos(2 * p);
      thanY += w * 0.07 * s;
      thanX += w * 0.05;
    }

    // Nhịp gõ phím: hai tay so le, có lúc ngừng tay.
    const g = this.trongSoGo;
    if (g > 0.001) {
      const dot = 0.55 + 0.45 * Math.sign(Math.sin(td * 0.9) + 0.35);
      khuyuTX += g * dot * Math.sin(td * 23) * 0.09;
      khuyuPX += g * dot * Math.sin(td * 25.5 + 1.7) * 0.09;
      vaiTZ += g * Math.sin(td * 3.1) * 0.03;
      vaiPZ += g * Math.sin(td * 2.7 + 1) * 0.03;
      dauX += g * Math.sin(td * 1.3) * 0.03;
    }

    // Động tác lặp theo kiểu việc đang làm.
    if (cu === 'hop' && this.doCam === 'coc') {
      // Nhấp ngụm cà phê mỗi 7 giây.
      const chu = (td % 7) / 7;
      const e = chu < 0.15 ? Math.sin((chu / 0.15) * Math.PI) : 0;
      vaiPX += e * -0.55;
      khuyuPX += e * -0.75;
      dauX += e * -0.18;
    } else if (cu === 'noi') {
      vaiTX += Math.sin(td * 2.1) * 0.18;
      khuyuTX += Math.sin(td * 2.6 + 1) * 0.25;
      vaiTZ += Math.max(0, Math.sin(td * 1.3)) * 0.25;
      dauY += Math.sin(td * 0.8) * 0.3;
      dauX += Math.sin(td * 4.2) * 0.04;
    } else if (cu === 'xemGio') {
      const chu = (td % 9) / 9;
      const e = chu > 0.7 && chu < 0.9 ? Math.sin(((chu - 0.7) / 0.2) * Math.PI) : 0;
      vaiTX += e * -0.7;
      vaiTZ += e * -0.2;
      khuyuTX += e * -0.4;
      dauX += e * 0.35;
      dauY += e * 0.3;
      hongY += Math.sin(td * 0.6) * 0.004;
      thanZ += Math.sin(td * 0.6) * 0.03;
    } else if (cu === 'dongDau') {
      const chu = (td % 2.6) / 2.6;
      const e = chu < 0.5 ? Math.sin((chu / 0.5) * Math.PI) : 0;
      vaiPX += -0.5 - e * 0.9;
      khuyuPX += -0.6 + e * 0.3;
    } else if (cu === 'vay') {
      vaiPX = -2.7;
      vaiPZ = -0.35 + Math.sin(td * 9) * 0.25;
      khuyuPX = -0.3;
    } else if (cu === 'cuon') {
      khuyuPX += Math.sin(td * 5) * 0.04;
      dauX += Math.sin(td * 0.7) * 0.04;
    }

    this.hongG.position.y = hongY;
    this.hongG.rotation.x = hongX;
    this.thanG.rotation.set(thanX, thanY, thanZ);
    this.dauG.rotation.set(dauX, dauY, dauZ, 'YXZ');
    this.vaiT.rotation.set(vaiTX, 0, vaiTZ);
    this.vaiP.rotation.set(vaiPX, 0, vaiPZ);
    this.khuyuT.rotation.x = khuyuTX;
    this.khuyuP.rotation.x = khuyuPX;
    this.duiT.rotation.set(duiTX, 0, duiTZ);
    this.duiP.rotation.set(duiPX, 0, duiPZ);
    this.goiT.rotation.x = goiTX;
    this.goiP.rotation.x = goiPX;
  }

  // Toạ độ đỉnh đầu (để gắn nhãn).
  dinhDau(dich = new THREE.Vector3()) {
    this.dauG.getWorldPosition(dich);
    dich.y += 0.42;
    return dich;
  }
}

// Trợ lý nhỏ (subagent) bay lơ lửng cạnh bàn khi phiên đang giao việc.
const HINH_TL = {
  than: new THREE.SphereGeometry(0.13, 16, 12),
  mat: new THREE.BoxGeometry(0.16, 0.05, 0.02),
  ang: new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6),
  dinh: new THREE.SphereGeometry(0.025, 8, 6),
};
export class TroLy {
  constructor(mau) {
    this.goc = new THREE.Group();
    const than = new THREE.Mesh(HINH_TL.than, vatLieu('#f4f1ec', { roughness: 0.4 }));
    than.castShadow = true;
    this.goc.add(than);
    const mat = new THREE.Mesh(HINH_TL.mat, new THREE.MeshBasicMaterial({ color: mau, toneMapped: false }));
    mat.position.set(0, 0.02, 0.122);
    this.goc.add(mat);
    const ang = new THREE.Mesh(HINH_TL.ang, vatLieu('#888888'));
    ang.position.y = 0.17;
    this.goc.add(ang);
    const dinh = new THREE.Mesh(HINH_TL.dinh, new THREE.MeshBasicMaterial({ color: mau, toneMapped: false }));
    dinh.position.y = 0.23;
    this.goc.add(dinh);
    this.pha = Math.random() * 10;
  }
  capNhat(t, x, z, yaw) {
    const p = t * 1.3 + this.pha;
    this.goc.position.set(x + Math.sin(p * 0.7) * 0.12, 1.25 + Math.sin(p * 2.1) * 0.06, z + Math.cos(p * 0.5) * 0.08);
    this.goc.rotation.y = yaw + Math.sin(p) * 0.4;
  }
}
