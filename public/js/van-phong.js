// Dựng văn phòng: sàn, tường, cửa sổ, khu bàn làm việc (mỗi dự án một cụm bàn), phòng duyệt
// vách kính có bàn sếp và hàng chờ, góc cà phê, góc ngả lưng, vườn dạo. Trả về các chỗ đứng/ngồi
// để người tới, lưới đi lại, và vài thứ động (hơi cà phê, đèn chờ duyệt, đồng hồ, con dấu).
import * as THREE from 'three';
import { mergeGeometries } from '/vendor/BufferGeometryUtils.js';
import { LuoiDi } from './duong-di.js';
import { vatLieu } from './nguoi.js';

export const BIEN = { xMin: -17, xMax: 17, zMin: -12, zMax: 12 };
export const KHU = {
  lam: { xMin: -16.4, xMax: 3.4, zMin: -11.4, zMax: 5.4 },
  duyet: { xMin: 6, xMax: 17, zMin: -12, zMax: -2.5 },
  cafe: { xMin: 6, xMax: 17, zMin: 0.8, zMax: 12 },
  vuon: { xMin: -17, xMax: 3.6, zMin: 6.8, zMax: 12 },
};
const CAO_TUONG = 3.2;
const CUA_DUYET = { x1: 7.0, x2: 8.8 };

// ---------- vài hàm vẽ chữ, vân sàn ----------
function anhChu(chu, { rong = 512, cao = 128, nen = '#ffffff', mau = '#2b2420', co = 64, dam = 800, vien = null, phu = null } = {}) {
  const cv = document.createElement('canvas');
  cv.width = rong;
  cv.height = cao;
  const g = cv.getContext('2d');
  if (nen) {
    g.fillStyle = nen;
    g.beginPath();
    g.roundRect(0, 0, rong, cao, Math.min(28, cao * 0.22));
    g.fill();
  }
  if (vien) {
    g.strokeStyle = vien;
    g.lineWidth = 10;
    g.beginPath();
    g.roundRect(5, 5, rong - 10, cao - 10, Math.min(24, cao * 0.2));
    g.stroke();
  }
  g.fillStyle = mau;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let c = co;
  g.font = `${dam} ${c}px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif`;
  while (g.measureText(chu).width > rong * 0.9 && c > 12) {
    c -= 2;
    g.font = `${dam} ${c}px -apple-system, "SF Pro Display", Helvetica, Arial, sans-serif`;
  }
  g.fillText(chu, rong / 2, phu ? cao * 0.4 : cao / 2 + 2);
  if (phu) {
    g.globalAlpha = 0.75;
    g.font = `600 ${Math.round(c * 0.42)}px -apple-system, Helvetica, Arial, sans-serif`;
    g.fillText(phu, rong / 2, cao * 0.78);
    g.globalAlpha = 1;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function vanSan(loai) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d');
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  if (loai === 'go') {
    g.fillStyle = '#cfb48f';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) {
      let x = -r() * 200;
      while (x < 512) {
        const dai = 150 + r() * 160;
        const l = 0.92 + r() * 0.12;
        g.fillStyle = `rgb(${207 * l | 0}, ${180 * l | 0}, ${143 * l | 0})`;
        g.fillRect(x, y, dai, 32);
        g.fillStyle = 'rgba(90,60,30,0.18)';
        g.fillRect(x, y, 2, 32);
        for (let k = 0; k < 3; k++) {
          g.fillStyle = 'rgba(120,85,50,0.07)';
          g.fillRect(x + r() * dai, y + 4 + r() * 24, 30 + r() * 60, 1.5);
        }
        x += dai;
      }
      g.fillStyle = 'rgba(90,60,30,0.22)';
      g.fillRect(0, y, 512, 1.5);
    }
  } else if (loai === 'tham') {
    g.fillStyle = '#9ea8b3';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
      g.fillRect(r() * 512, r() * 512, 2, 2);
    }
    g.strokeStyle = 'rgba(70,80,95,0.16)';
    g.lineWidth = 2;
    for (let i = 0; i <= 512; i += 128) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
  } else if (loai === 'gach') {
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? '#e9e4dc' : '#f7f4ef';
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.08)';
    for (let i = 0; i <= 512; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
  } else if (loai === 'co') {
    g.fillStyle = '#86b46d';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 14000; i++) {
      const l = r();
      g.fillStyle = l < 0.5 ? 'rgba(60,110,40,0.18)' : 'rgba(190,230,140,0.16)';
      g.fillRect(r() * 512, r() * 512, 2, 3 + r() * 3);
    }
  } else if (loai === 'tham-do') {
    g.fillStyle = '#b48a7c';
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,236,214,0.4)';
    g.lineWidth = 10;
    g.strokeRect(24, 24, 464, 464);
    g.lineWidth = 3;
    g.strokeRect(48, 48, 416, 416);
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.fillRect(r() * 512, r() * 512, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

// ---------- bộ dựng: gom đồ tĩnh theo vật liệu cho nhẹ máy ----------
class BoDung {
  constructor() {
    this.theoVL = new Map();
    this.boc = new THREE.Group();
  }
  // Thêm hình (đã có vị trí/góc) vào nhóm gộp.
  them(hinh, vl, x = 0, y = 0, z = 0, yaw = 0, { bong = true, nhan = true, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0 } = {}) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    );
    const g = (hinh.index ? hinh.toNonIndexed() : hinh.clone()).applyMatrix4(m);
    for (const ten of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(ten)) g.deleteAttribute(ten);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const khoa = vl.uuid + (bong ? 'b' : '') + (nhan ? 'n' : '');
    if (!this.theoVL.has(khoa)) this.theoVL.set(khoa, { vl, bong, nhan, ds: [] });
    this.theoVL.get(khoa).ds.push(g);
  }
  hop(rong, cao, sau, vl, x, y, z, yaw = 0, tuyChon = {}) {
    // y là đáy hộp.
    this.them(new THREE.BoxGeometry(rong, cao, sau), vl, x, y + cao / 2, z, yaw, tuyChon);
  }
  // Gộp xong thì gắn vào cảnh.
  dong(cha) {
    for (const { vl, bong, nhan, ds } of this.theoVL.values()) {
      const g = mergeGeometries(ds, false);
      const m = new THREE.Mesh(g, vl);
      m.castShadow = bong;
      m.receiveShadow = nhan;
      m.matrixAutoUpdate = false;
      cha.add(m);
    }
    this.theoVL.clear();
  }
}

const HINH = {
  hop: new THREE.BoxGeometry(1, 1, 1),
  tru: new THREE.CylinderGeometry(0.5, 0.5, 1, 16),
  truThap: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  cau: new THREE.SphereGeometry(0.5, 14, 10),
  la: new THREE.IcosahedronGeometry(0.5, 1),
  non: new THREE.ConeGeometry(0.5, 1, 10),
};

const VL = {
  tuong: vatLieu('#efe8de', { roughness: 0.95 }),
  chanTuong: vatLieu('#b9a58c'),
  matBan: vatLieu('#f6f3ec', { roughness: 0.5 }),
  chanBan: vatLieu('#8e959d', { roughness: 0.4, metalness: 0.5 }),
  vachBan: vatLieu('#dcd6cc'),
  manHinhVo: vatLieu('#2a2d33', { roughness: 0.45 }),
  banPhim: vatLieu('#d9dbe0', { roughness: 0.5 }),
  goToi: vatLieu('#5c3b2a', { roughness: 0.55 }),
  goSang: vatLieu('#b58a62', { roughness: 0.6 }),
  da: vatLieu('#1f1f22', { roughness: 0.45 }),
  thep: vatLieu('#c9ced3', { roughness: 0.3, metalness: 0.75 }),
  den: vatLieu('#2b2b2e', { roughness: 0.4 }),
  trang: vatLieu('#fbfaf7', { roughness: 0.5 }),
  da2: vatLieu('#f1efe9', { roughness: 0.25 }),
  chau: vatLieu('#c9b8a2', { roughness: 0.8 }),
  dat: vatLieu('#5b4334'),
  la1: vatLieu('#4f8f4a'),
  la2: vatLieu('#6aa84f'),
  la3: vatLieu('#3d7a3b'),
  than: vatLieu('#7a5236'),
  soi: vatLieu('#d9cdb3', { roughness: 0.95 }),
  sofa: vatLieu('#5f7f8f', { roughness: 0.9 }),
  sofa2: vatLieu('#c97c5d', { roughness: 0.9 }),
  ghe: vatLieu('#3b3f46', { roughness: 0.7 }),
  khung: vatLieu('#6f757c', { roughness: 0.4, metalness: 0.6 }),
  sach: [vatLieu('#c0392b'), vatLieu('#2d6cdf'), vatLieu('#e0a72e'), vatLieu('#2f9e6b'), vatLieu('#8e44ad')],
  hoa: [vatLieu('#f28482'), vatLieu('#f6bd60'), vatLieu('#f7ede2'), vatLieu('#b388eb')],
  nuoc: vatLieu('#8ecae6', { roughness: 0.15, transparent: true, opacity: 0.85 }),
};

// Ghế văn phòng (đặt tại chỗ ngồi, quay mặt về bàn).
function gheVanPhong(bd, x, z, yaw, mauNem) {
  const vlNem = vatLieu(mauNem, { roughness: 0.85 });
  const tien = (dx, dz) => [x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, z - Math.sin(yaw) * dx + Math.cos(yaw) * dz];
  bd.them(HINH.tru, VL.chanBan, x, 0.22, z, 0, { sx: 0.05, sy: 0.36, sz: 0.05 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    bd.them(HINH.hop, VL.den, x + Math.cos(a) * 0.17, 0.04, z + Math.sin(a) * 0.17, -a, { sx: 0.34, sy: 0.04, sz: 0.05 });
  }
  bd.them(HINH.hop, vlNem, x, 0.42, z, yaw, { sx: 0.48, sy: 0.08, sz: 0.46 });
  const [lx, lz] = tien(0, -0.25);
  bd.them(HINH.hop, vlNem, lx, 0.78, lz, yaw, { sx: 0.44, sy: 0.5, sz: 0.07, rx: -0.08 });
}

function chauCay(bd, x, z, to = 1) {
  bd.them(HINH.tru, VL.chau, x, 0.22 * to, z, 0, { sx: 0.5 * to, sy: 0.44 * to, sz: 0.5 * to });
  bd.them(HINH.tru, VL.dat, x, 0.44 * to, z, 0, { sx: 0.44 * to, sy: 0.02, sz: 0.44 * to });
  bd.them(HINH.la, VL.la1, x, 0.85 * to, z, 0, { sx: 0.7 * to, sy: 0.85 * to, sz: 0.7 * to });
  bd.them(HINH.la, VL.la2, x + 0.12 * to, 1.15 * to, z - 0.05, 0.6, { sx: 0.5 * to, sy: 0.6 * to, sz: 0.5 * to });
  bd.them(HINH.la, VL.la3, x - 0.1 * to, 1.05 * to, z + 0.1, 1.3, { sx: 0.45 * to, sy: 0.55 * to, sz: 0.45 * to });
}

function cayVuon(bd, x, z, to = 1, kieu = 0) {
  bd.them(HINH.tru, VL.than, x, 0.8 * to, z, 0, { sx: 0.22 * to, sy: 1.6 * to, sz: 0.22 * to });
  if (kieu % 2 === 0) {
    bd.them(HINH.la, VL.la1, x, 2.05 * to, z, 0, { sx: 1.7 * to, sy: 1.5 * to, sz: 1.7 * to });
    bd.them(HINH.la, VL.la2, x + 0.4 * to, 2.5 * to, z + 0.2, 0.7, { sx: 1.1 * to, sy: 1.0 * to, sz: 1.1 * to });
    bd.them(HINH.la, VL.la3, x - 0.45 * to, 2.35 * to, z - 0.2, 1.4, { sx: 1.0 * to, sy: 0.95 * to, sz: 1.0 * to });
  } else {
    bd.them(HINH.non, VL.la3, x, 1.9 * to, z, 0, { sx: 1.5 * to, sy: 1.8 * to, sz: 1.5 * to });
    bd.them(HINH.non, VL.la1, x, 2.6 * to, z, 0.5, { sx: 1.1 * to, sy: 1.4 * to, sz: 1.1 * to });
  }
}

function gheDa(bd, x, z, yaw) {
  // Ghế băng gỗ, mặt ngồi cao 0.45, quay mặt theo yaw.
  const sau = (d) => [x - Math.sin(yaw) * d, z - Math.cos(yaw) * d];
  bd.them(HINH.hop, VL.goSang, x, 0.43, z, yaw, { sx: 1.6, sy: 0.06, sz: 0.46 });
  const [bx, bz] = sau(0.22);
  bd.them(HINH.hop, VL.goSang, bx, 0.75, bz, yaw, { sx: 1.6, sy: 0.32, sz: 0.05, rx: -0.12 });
  for (const d of [-0.7, 0.7]) {
    bd.them(HINH.hop, VL.den, x + Math.cos(yaw) * d, 0.2, z - Math.sin(yaw) * d, yaw, { sx: 0.06, sy: 0.4, sz: 0.44 });
  }
}

export function dungVanPhong(scene, manHinh) {
  const vp = {
    scene,
    luoi: new LuoiDi(BIEN.xMin, BIEN.zMin, BIEN.xMax, BIEN.zMax, 0.5),
    tinh: [],
    cho: { hangCho: [], gheCho: [], mayPha: [], banCao: [], sofa: [], nguTrua: [], gheDa: [], cayNuoc: [] },
    vongDao: [],
    gheSep: null,
    ban: [],
    tuong: [],
    dong: {},
  };
  const nhom = new THREE.Group();
  scene.add(nhom);
  const bd = new BoDung();
  const chanTinh = (x, z, r, s, yaw = 0, le) => vp.tinh.push(['chan', x, z, r, s, yaw, le]);
  const chanDoan = (x1, z1, x2, z2, day) => vp.tinh.push(['doan', x1, z1, x2, z2, day]);

  // ---------- sàn ----------
  const san = (khu, tex, lap, y = 0) => {
    const rong = khu.xMax - khu.xMin;
    const sau = khu.zMax - khu.zMin;
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set(rong / lap, sau / lap);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rong, sau), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }));
    m.rotation.x = -Math.PI / 2;
    m.position.set((khu.xMin + khu.xMax) / 2, y, (khu.zMin + khu.zMax) / 2);
    m.receiveShadow = true;
    nhom.add(m);
    return m;
  };
  const go = vanSan('go');
  san(BIEN, go, 6);
  san({ xMin: KHU.lam.xMin, xMax: KHU.lam.xMax, zMin: KHU.lam.zMin, zMax: KHU.lam.zMax }, vanSan('tham'), 4, 0.005);
  san({ xMin: 9.3, xMax: 16.6, zMin: -11.6, zMax: -4.0 }, vanSan('tham-do'), 7.3, 0.006);
  san({ xMin: KHU.cafe.xMin + 0.2, xMax: KHU.cafe.xMax, zMin: KHU.cafe.zMin, zMax: KHU.cafe.zMax }, vanSan('gach'), 4, 0.005);
  san(KHU.vuon, vanSan('co'), 5, 0.006);
  // Viền ngoài và nền đất bên dưới.
  const nen = new THREE.Mesh(new THREE.BoxGeometry(BIEN.xMax - BIEN.xMin + 1.2, 0.5, BIEN.zMax - BIEN.zMin + 1.2), vatLieu('#a99376'));
  nen.position.set(0, -0.252, 0);
  nen.receiveShadow = true;
  nhom.add(nen);

  // ---------- tường (tường nào che tầm nhìn sẽ mờ đi) ----------
  const vlKinhCuaSo = new THREE.MeshStandardMaterial({ color: '#cfe6f7', roughness: 0.1, metalness: 0.1, emissive: '#9cc7e8', emissiveIntensity: 0.25 });
  vp.dong.kinhCuaSo = vlKinhCuaSo;
  const tuong = (x1, z1, x2, z2, phapX, phapZ, cuaSo, chuaCuaSo = null) => {
    const dai = Math.hypot(x2 - x1, z2 - z1);
    const yaw = -Math.atan2(z2 - z1, x2 - x1);
    const g = new THREE.Group();
    const vl = VL.tuong.clone();
    vl.transparent = true;
    const vlChan = VL.chanTuong.clone();
    vlChan.transparent = true;
    const vlKinh = vlKinhCuaSo.clone();
    vlKinh.transparent = true;
    const tuongM = new THREE.Mesh(new THREE.BoxGeometry(dai, CAO_TUONG, 0.2), vl);
    tuongM.position.y = CAO_TUONG / 2;
    tuongM.receiveShadow = true;
    tuongM.castShadow = true;
    g.add(tuongM);
    const chan = new THREE.Mesh(new THREE.BoxGeometry(dai, 0.14, 0.24), vlChan);
    chan.position.y = 0.07;
    g.add(chan);
    if (cuaSo) {
      for (let s = -dai / 2 + 2.4; s < dai / 2 - 1.5; s += 3.6) {
        if (chuaCuaSo && s + 1.1 > chuaCuaSo[0] && s + 1.1 < chuaCuaSo[1]) continue;
        const k = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.24), vlKinh);
        k.position.set(s + 1.1, 1.75, 0);
        g.add(k);
        const thanh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.26), vlChan);
        thanh.position.set(s + 1.1, 1.75, 0);
        g.add(thanh);
      }
    }
    g.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
    g.rotation.y = yaw;
    nhom.add(g);
    vp.tuong.push({ g, vl: [vl, vlChan, vlKinh], x: (x1 + x2) / 2, z: (z1 + z2) / 2, phapX, phapZ, mo: 1 });
    chanDoan(x1, z1, x2, z2, 0.2);
  };
  // Tường sau chừa một đoạn không cửa sổ để treo đồng hồ và bảng mức dùng.
  tuong(BIEN.xMin, BIEN.zMin, BIEN.xMax, BIEN.zMin, 0, 1, true, [-11, -2]);
  tuong(BIEN.xMin, BIEN.zMin, BIEN.xMin, BIEN.zMax, 1, 0, true);
  tuong(BIEN.xMax, BIEN.zMin, BIEN.xMax, BIEN.zMax, -1, 0, true);
  // Mép trước để ngỏ, chỉ có bồn cây thấp.
  for (let x = BIEN.xMin + 1; x < BIEN.xMax; x += 2.2) {
    if (x > 3.2 && x < 6.4) continue;
    bd.them(HINH.hop, VL.chau, x, 0.2, BIEN.zMax - 0.2, 0, { sx: 1.9, sy: 0.4, sz: 0.36 });
    bd.them(HINH.hop, Math.round(x) % 2 ? VL.la2 : VL.la1, x, 0.6, BIEN.zMax - 0.2, 0, { sx: 1.84, sy: 0.34, sz: 0.32 });
  }
  chanDoan(BIEN.xMin, BIEN.zMax - 0.2, BIEN.xMax, BIEN.zMax - 0.2, 0.4);

  // ---------- phòng duyệt ----------
  const vlKinh = new THREE.MeshStandardMaterial({ color: '#bfe1f5', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false });
  const vachKinh = (x1, z1, x2, z2) => {
    const dai = Math.hypot(x2 - x1, z2 - z1);
    const yaw = -Math.atan2(z2 - z1, x2 - x1);
    const k = new THREE.Mesh(new THREE.BoxGeometry(dai, 2.55, 0.05), vlKinh);
    k.position.set((x1 + x2) / 2, 1.3, (z1 + z2) / 2);
    k.rotation.y = yaw;
    k.renderOrder = 2;
    nhom.add(k);
    bd.them(HINH.hop, VL.khung, (x1 + x2) / 2, 2.62, (z1 + z2) / 2, yaw, { sx: dai, sy: 0.08, sz: 0.09 });
    bd.them(HINH.hop, VL.khung, (x1 + x2) / 2, 0.03, (z1 + z2) / 2, yaw, { sx: dai, sy: 0.06, sz: 0.09 });
    const so = Math.max(1, Math.round(dai / 2));
    for (let i = 0; i <= so; i++) {
      const t = i / so;
      bd.them(HINH.hop, VL.khung, x1 + (x2 - x1) * t, 1.33, z1 + (z2 - z1) * t, yaw, { sx: 0.07, sy: 2.6, sz: 0.09 });
    }
    chanDoan(x1, z1, x2, z2, 0.1);
  };
  const D = KHU.duyet;
  vachKinh(D.xMin, D.zMin + 0.1, D.xMin, D.zMax);
  vachKinh(D.xMin, D.zMax, CUA_DUYET.x1, D.zMax);
  vachKinh(CUA_DUYET.x2, D.zMax, D.xMax - 0.1, D.zMax);
  // Biển và đèn báo trên cửa.
  const bienDuyet = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.62),
    new THREE.MeshBasicMaterial({ map: anhChu('PHÒNG DUYỆT', { nen: '#2b2420', mau: '#ffe2c2', co: 70, rong: 640, cao: 116 }), toneMapped: false }),
  );
  bienDuyet.position.set((CUA_DUYET.x1 + CUA_DUYET.x2) / 2 + 0.8, 2.98, D.zMax + 0.06);
  nhom.add(bienDuyet);
  bd.them(HINH.hop, VL.den, bienDuyet.position.x, 2.98, D.zMax, 0, { sx: 3.5, sy: 0.7, sz: 0.06 });
  const vlDenBao = new THREE.MeshStandardMaterial({ color: '#ffb347', emissive: '#ff8c1a', emissiveIntensity: 0.1, roughness: 0.3 });
  const denBao = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), vlDenBao);
  denBao.position.set(CUA_DUYET.x1 - 0.35, 2.95, D.zMax + 0.1);
  nhom.add(denBao);
  const anhDenBao = new THREE.PointLight('#ff9d2e', 0, 6, 2);
  anhDenBao.position.set(CUA_DUYET.x1 - 0.35, 2.7, D.zMax + 0.5);
  nhom.add(anhDenBao);
  vp.dong.denBao = { vl: vlDenBao, anh: anhDenBao };

  // Bàn sếp.
  const bx = 13.0;
  const bz = -8.6;
  bd.hop(2.6, 0.06, 1.15, VL.goToi, bx, 0.76, bz);
  bd.hop(2.5, 0.72, 0.06, VL.goToi, bx, 0.04, bz + 0.5);
  bd.hop(0.06, 0.74, 1.05, VL.goToi, bx - 1.22, 0.02, bz);
  bd.hop(0.06, 0.74, 1.05, VL.goToi, bx + 1.22, 0.02, bz);
  bd.hop(0.55, 0.62, 1.0, VL.goToi, bx + 0.9, 0.06, bz);
  chanTinh(bx, bz, 1.3, 0.6);
  // Màn hình sếp quay về phía ghế sếp.
  const mhX = bx + 0.85;
  const mhZ = bz - 0.2;
  const mhYaw = Math.atan2(bx - mhX, bz - 1.12 - mhZ);
  bd.them(HINH.hop, VL.manHinhVo, mhX, 0.88, mhZ, mhYaw, { sx: 0.12, sy: 0.14, sz: 0.12 });
  bd.them(HINH.hop, VL.manHinhVo, mhX, 1.16, mhZ, mhYaw, { sx: 0.8, sy: 0.48, sz: 0.04 });
  const mhSep = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.43), manHinh.vatLieu('sep'));
  mhSep.position.set(mhX + Math.sin(mhYaw) * 0.025, 1.16, mhZ + Math.cos(mhYaw) * 0.025);
  mhSep.rotation.y = mhYaw;
  nhom.add(mhSep);
  // Bảng tên trên bàn.
  const bangTen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 0.15),
    new THREE.MeshBasicMaterial({ map: anhChu('SẾP DUYỆT', { nen: '#f4e3c3', mau: '#4a3020', co: 70, rong: 512, cao: 124 }), toneMapped: false }),
  );
  bangTen.position.set(bx - 0.5, 0.88, bz + 0.47);
  bangTen.rotation.x = -0.35;
  nhom.add(bangTen);
  bd.hop(0.66, 0.12, 0.1, VL.goSang, bx - 0.5, 0.79, bz + 0.45);
  // Con dấu (động) và khay hồ sơ.
  const conDau = new THREE.Group();
  const canDau = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 10), vatLieu('#3b2a1e'));
  canDau.position.y = 0.11;
  conDau.add(canDau);
  const deDau = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), vatLieu('#b3261e'));
  deDau.position.y = 0.03;
  conDau.add(deDau);
  conDau.position.set(bx - 0.75, 0.79, bz - 0.05);
  conDau.traverse((o) => { o.castShadow = true; });
  nhom.add(conDau);
  bd.hop(0.4, 0.08, 0.3, VL.goSang, bx + 0.15, 0.79, bz + 0.2);
  bd.hop(0.32, 0.06, 0.24, VL.trang, bx + 0.15, 0.86, bz + 0.2);
  // Dấu "ĐÃ DUYỆT" bay lên mỗi khi duyệt.
  const vlDau = new THREE.SpriteMaterial({ map: anhChu('ĐÃ DUYỆT ✓', { nen: null, mau: '#c0392b', vien: '#c0392b', co: 76, rong: 512, cao: 150 }), transparent: true, opacity: 0, depthTest: false });
  const dauDuyet = new THREE.Sprite(vlDau);
  dauDuyet.scale.set(1.9, 0.56, 1);
  dauDuyet.position.set(bx, 2.1, bz);
  dauDuyet.renderOrder = 5;
  nhom.add(dauDuyet);
  vp.dong.dau = { conDau, sprite: dauDuyet, vl: vlDau, t: -10 };
  // Ghế sếp (lưng cao bọc da).
  bd.them(HINH.tru, VL.chanBan, bx, 0.24, bz - 1.15, 0, { sx: 0.06, sy: 0.4, sz: 0.06 });
  bd.them(HINH.hop, VL.da, bx, 0.45, bz - 1.15, 0, { sx: 0.6, sy: 0.12, sz: 0.56 });
  bd.them(HINH.hop, VL.da, bx, 0.98, bz - 1.45, 0, { sx: 0.58, sy: 0.95, sz: 0.1, rx: 0.08 });
  vp.gheSep = { x: bx, z: bz - 1.12, yaw: 0 };
  // Kệ sách, đồng hồ, cây.
  for (let k = 0; k < 2; k++) {
    const kx = 14.6 + k * 1.3;
    const kz = D.zMin + 0.35;
    // Kệ hở mặt trước: tấm lưng, hai vách, năm tầng.
    bd.hop(1.2, 2.1, 0.04, VL.goSang, kx, 0, kz - 0.18);
    bd.hop(0.04, 2.1, 0.4, VL.goSang, kx - 0.58, 0, kz);
    bd.hop(0.04, 2.1, 0.4, VL.goSang, kx + 0.58, 0, kz);
    for (let tang = 0; tang < 5; tang++) bd.hop(1.16, 0.03, 0.38, VL.goSang, kx, 0.06 + tang * 0.5, kz);
    for (let tang = 0; tang < 4; tang++) {
      for (let s = 0; s < 6; s++) {
        if ((s + tang * 2 + k) % 7 === 6) continue;
        bd.hop(0.12, 0.3 + ((s * 7 + tang) % 3) * 0.04, 0.26, VL.sach[(s + tang + k) % 5], kx - 0.42 + s * 0.165, 0.09 + tang * 0.5, kz + 0.02, ((s + tang) % 4 === 0 ? 0.12 : 0));
      }
    }
  }
  chanTinh(15.25, D.zMin + 0.35, 1.3, 0.25);
  chauCay(bd, D.xMax - 0.7, D.zMax - 0.7, 1.1);
  chanTinh(D.xMax - 0.7, D.zMax - 0.7, 0.3, 0.3);
  chauCay(bd, D.xMin + 0.7, D.zMin + 0.7, 1);
  chanTinh(D.xMin + 0.7, D.zMin + 0.7, 0.3, 0.3);
  const dongHo = new THREE.Group();
  const mat = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), vatLieu('#fbfaf7'));
  dongHo.add(mat);
  const vanh = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 8, 32), VL.goToi);
  dongHo.add(vanh);
  const kim = (dai, day, mau) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(day, dai, 0.01), vatLieu(mau));
    m.position.y = dai / 2;
    m.position.z = 0.01;
    g.add(m);
    dongHo.add(g);
    return g;
  };
  const kimGio = kim(0.22, 0.04, '#2b2420');
  const kimPhut = kim(0.33, 0.025, '#2b2420');
  const kimGiay = kim(0.36, 0.01, '#c0392b');
  dongHo.position.set(bx, 2.35, D.zMin + 0.12);
  nhom.add(dongHo);
  vp.dong.dongHo = { kimGio, kimPhut, kimGiay };

  // Hàng chờ: đứng xếp hàng từ trước bàn sếp ra phía cửa.
  for (let i = 0; i < 7; i++) {
    const x = bx - 0.25 - i * 0.62;
    const z = bz + 1.65 + i * 0.58;
    const truoc = i === 0 ? { x: bx - 0.25, z: bz } : { x: bx - 0.25 - (i - 1) * 0.62, z: bz + 1.65 + (i - 1) * 0.58 };
    vp.cho.hangCho.push({ id: 'hang-' + i, x, z, yaw: Math.atan2(truoc.x - x, truoc.z - z), tuThe: 'dungCho', cu: 'xemGio', nguoi: null });
  }
  // Ghế chờ dọc vách kính bên trái, ai chờ lâu thì ngồi.
  for (let i = 0; i < 6; i++) {
    const z = -11.2 + i * 1.0;
    gheVanPhong(bd, D.xMin + 0.75, z, Math.PI / 2, '#9c6b4a');
    vp.cho.gheCho.push({ id: 'ghe-cho-' + i, x: D.xMin + 0.75, z, yaw: Math.PI / 2, tuThe: 'ngoi', cu: '', nguoi: null });
  }
  bd.hop(0.5, 0.45, 0.5, VL.goSang, D.xMin + 0.75, 0, -5.25);
  chanTinh(D.xMin + 0.75, -5.25, 0.25, 0.25);

  // ---------- góc cà phê ----------
  const C2 = KHU.cafe;
  // Quầy dọc tường phải.
  bd.hop(1.0, 0.92, 6.8, VL.goSang, C2.xMax - 0.65, 0, 5.0);
  bd.hop(1.1, 0.05, 6.9, VL.da2, C2.xMax - 0.65, 0.92, 5.0);
  bd.hop(0.55, 0.8, 6.8, VL.goSang, C2.xMax - 0.4, 1.7, 5.0);
  chanTinh(C2.xMax - 0.65, 5.0, 0.55, 3.45);
  // Máy pha cà phê.
  const mx = C2.xMax - 0.75;
  const mz = 2.6;
  bd.hop(0.55, 0.62, 0.5, VL.den, mx, 0.97, mz);
  bd.hop(0.5, 0.12, 0.45, VL.thep, mx, 1.59, mz);
  bd.hop(0.12, 0.2, 0.2, VL.thep, mx - 0.27, 1.2, mz);
  bd.hop(0.06, 0.05, 0.12, VL.den, mx - 0.36, 1.12, mz);
  bd.hop(0.3, 0.02, 0.3, VL.thep, mx - 0.3, 0.97, mz);
  const denMay = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: '#4cd964', toneMapped: false }));
  denMay.position.set(mx - 0.28, 1.45, mz);
  nhom.add(denMay);
  // Hơi cà phê.
  const vlHoi = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false });
  const hoi = [];
  for (let i = 0; i < 6; i++) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), vlHoi.clone());
    h.position.set(mx - 0.3, 1.1, mz);
    nhom.add(h);
    hoi.push({ m: h, pha: i / 6 });
  }
  vp.dong.hoi = { ds: hoi, x: mx - 0.3, z: mz, manh: 0.3 };
  // Cốc, lọ đường, máy pha thứ hai, tủ lạnh, cây nước.
  for (let i = 0; i < 5; i++) bd.them(HINH.tru, VL.trang, mx - 0.1, 0.99, mz + 0.55 + i * 0.12, 0, { sx: 0.08, sy: 0.1, sz: 0.08 });
  bd.hop(0.5, 0.35, 0.4, VL.thep, mx, 0.97, 5.2);
  bd.hop(0.45, 0.25, 0.38, VL.den, mx, 0.97, 6.4);
  bd.hop(0.8, 1.95, 0.75, VL.thep, C2.xMax - 0.55, 0, 9.25);
  bd.hop(0.04, 0.6, 0.05, VL.den, C2.xMax - 0.96, 1.2, 9.0);
  chanTinh(C2.xMax - 0.55, 9.25, 0.42, 0.4);
  bd.them(HINH.tru, VL.trang, 6.8, 0.55, 1.5, 0, { sx: 0.34, sy: 1.1, sz: 0.34 });
  bd.them(HINH.tru, VL.nuoc, 6.8, 1.3, 1.5, 0, { sx: 0.3, sy: 0.42, sz: 0.3 });
  chanTinh(6.8, 1.5, 0.2, 0.2);
  // Biển góc cà phê trên quầy.
  const bienCafe = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 0.6),
    new THREE.MeshBasicMaterial({ map: anhChu('☕ GÓC CÀ PHÊ', { nen: '#5b3a26', mau: '#ffe9d1', co: 66, rong: 560, cao: 128 }), toneMapped: false }),
  );
  bienCafe.position.set(C2.xMax - 0.12, 2.8, 4.4);
  bienCafe.rotation.y = -Math.PI / 2;
  nhom.add(bienCafe);
  vp.cho.mayPha.push({ id: 'may-0', x: mx - 0.95, z: mz, yaw: Math.PI / 2, tuThe: 'phaCaPhe', cu: '', nguoi: null });
  vp.cho.mayPha.push({ id: 'may-1', x: mx - 1.35, z: mz + 1.0, yaw: Math.PI / 2 + 0.3, tuThe: 'dung', cu: '', nguoi: null });
  vp.cho.cayNuoc.push({ id: 'nuoc-0', x: 7.6, z: 1.35, yaw: -Math.PI / 2, tuThe: 'camCoc', cu: 'noi', nguoi: null });
  vp.cho.cayNuoc.push({ id: 'nuoc-1', x: 7.25, z: 2.35, yaw: -2.65, tuThe: 'camCoc', cu: 'noi', nguoi: null });
  // Hai bàn đứng tròn.
  for (const [tx, tz] of [[12.0, 2.9], [9.0, 2.9]]) {
    bd.them(HINH.tru, VL.goSang, tx, 1.04, tz, 0, { sx: 0.95, sy: 0.05, sz: 0.95 });
    bd.them(HINH.tru, VL.khung, tx, 0.52, tz, 0, { sx: 0.07, sy: 1.02, sz: 0.07 });
    bd.them(HINH.tru, VL.khung, tx, 0.02, tz, 0, { sx: 0.5, sy: 0.04, sz: 0.5 });
    chanTinh(tx, tz, 0.42, 0.42);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const x = tx + Math.sin(a) * 0.82;
      const z = tz + Math.cos(a) * 0.82;
      vp.cho.banCao.push({ id: `cao-${tx}-${k}`, x, z, yaw: Math.atan2(tx - x, tz - z), tuThe: 'camCoc', cu: 'hop', nguoi: null, nhom: tx });
    }
  }
  // Sofa quanh bàn trà trên thảm.
  const tham = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 5.4), new THREE.MeshStandardMaterial({ color: '#d8c3a5', roughness: 1 }));
  tham.rotation.x = -Math.PI / 2;
  tham.position.set(10.4, 0.012, 8.2);
  tham.receiveShadow = true;
  nhom.add(tham);
  const sofa = (cx, cz, yaw, vl, so = 3) => {
    const dai = so * 0.9 + 0.3;
    const sau = (d) => [cx - Math.sin(yaw) * d, cz - Math.cos(yaw) * d];
    bd.them(HINH.hop, vl, cx, 0.22, cz, yaw, { sx: dai, sy: 0.44, sz: 0.9 });
    const [lx, lz] = sau(0.38);
    bd.them(HINH.hop, vl, lx, 0.62, lz, yaw, { sx: dai, sy: 0.6, sz: 0.2 });
    for (const d of [-dai / 2 + 0.1, dai / 2 - 0.1]) {
      bd.them(HINH.hop, vl, cx + Math.cos(yaw) * d, 0.5, cz - Math.sin(yaw) * d, yaw, { sx: 0.2, sy: 0.32, sz: 0.88 });
    }
    chanTinh(cx, cz, dai / 2, 0.45, yaw, 0.05);
    for (let i = 0; i < so; i++) {
      const d = (i - (so - 1) / 2) * 0.9;
      const [ex, ez] = [cx + Math.cos(yaw) * d + Math.sin(yaw) * 0.08, cz - Math.sin(yaw) * d + Math.cos(yaw) * 0.08];
      vp.cho.sofa.push({ id: `sofa-${cx}-${cz}-${i}`, x: ex, z: ez, yaw, tuThe: 'ngoiCoc', cu: 'noi', nguoi: null, ngoi: true });
    }
  };
  sofa(10.6, 6.3, 0, VL.sofa);
  sofa(10.6, 10.1, Math.PI, VL.sofa);
  sofa(7.8, 8.2, Math.PI / 2, VL.sofa2, 2);
  bd.hop(1.9, 0.38, 1.0, VL.goSang, 10.6, 0, 8.2);
  for (let i = 0; i < 3; i++) bd.them(HINH.tru, VL.trang, 10.1 + i * 0.4, 0.43, 8.1 + (i % 2) * 0.2, 0, { sx: 0.08, sy: 0.1, sz: 0.08 });
  chanTinh(10.6, 8.2, 0.95, 0.5);
  // Góc ngả lưng: gối lười.
  const vlGoi = [vatLieu('#e9a03b', { roughness: 1 }), vatLieu('#7aa6c2', { roughness: 1 }), vatLieu('#b5838d', { roughness: 1 }), vatLieu('#8fb996', { roughness: 1 })];
  [[13.9, 10.9, 2.7], [15.5, 10.7, -2.6], [15.0, 9.3, -2.2], [12.8, 11.3, 3.0]].forEach(([x, z, yaw], i) => {
    bd.them(HINH.cau, vlGoi[i], x, 0.24, z, yaw, { sx: 1.0, sy: 0.5, sz: 1.05 });
    bd.them(HINH.cau, vlGoi[i], x - Math.sin(yaw) * 0.35, 0.45, z - Math.cos(yaw) * 0.35, yaw, { sx: 0.8, sy: 0.6, sz: 0.4 });
    vp.cho.nguTrua.push({ id: 'goi-' + i, x: x + Math.sin(yaw) * 0.05, z: z + Math.cos(yaw) * 0.05, yaw, tuThe: 'ngaNgu', cu: '', nguoi: null, ngoi: true });
  });
  chauCay(bd, 16.4, 11.4, 1.2);
  chanTinh(16.4, 11.4, 0.35, 0.35);
  chauCay(bd, 6.5, 11.4, 1.0);
  chanTinh(6.5, 11.4, 0.3, 0.3);

  // ---------- vườn dạo ----------
  const V = KHU.vuon;
  const lx1 = V.xMin + 2.2;
  const lx2 = V.xMax - 2.2;
  const lz1 = 7.7;
  const lz2 = 11.1;
  const vlSoi = VL.soi;
  // Lối đi vòng (hình sân vận động): hai đoạn thẳng + hai nửa vòng.
  const banKinh = (lz2 - lz1) / 2;
  const cz = (lz1 + lz2) / 2;
  const diemVong = [];
  for (let x = lx1; x <= lx2; x += 0.8) diemVong.push([x, lz1]);
  for (let a = -Math.PI / 2; a <= Math.PI / 2; a += Math.PI / 10) diemVong.push([lx2 + Math.cos(a) * banKinh, cz + Math.sin(a) * banKinh]);
  for (let x = lx2; x >= lx1; x -= 0.8) diemVong.push([x, lz2]);
  for (let a = Math.PI / 2; a <= (Math.PI * 3) / 2; a += Math.PI / 10) diemVong.push([lx1 + Math.cos(a) * banKinh, cz + Math.sin(a) * banKinh]);
  vp.vongDao = diemVong;
  for (let i = 0; i < diemVong.length; i++) {
    const [x, z] = diemVong[i];
    const [x2, z2] = diemVong[(i + 1) % diemVong.length];
    const dai = Math.hypot(x2 - x, z2 - z);
    bd.them(HINH.hop, vlSoi, (x + x2) / 2, 0.012, (z + z2) / 2, -Math.atan2(z2 - z, x2 - x), { sx: dai + 0.25, sy: 0.02, sz: 1.15, bong: false });
  }
  // Cây có bồn hoa quanh gốc, ghế đá giữa hai cây quay ra lối đi phía trước.
  [[-13.4, 0], [-8.0, 1], [-2.6, 0]].forEach(([x, k]) => {
    cayVuon(bd, x, cz, 1, k);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + k;
      bd.them(HINH.cau, VL.hoa[(i + k) % 4], x + Math.cos(a) * 0.62, 0.12, cz + Math.sin(a) * 0.62, 0, { sx: 0.22, sy: 0.18, sz: 0.22 });
    }
    bd.them(HINH.la, VL.la2, x, 0.1, cz, x, { sx: 1.5, sy: 0.18, sz: 1.5 });
    chanTinh(x, cz, 0.75, 0.75);
  });
  for (const x of [-10.7, -5.3]) {
    gheDa(bd, x, cz + 0.2, 0);
    chanTinh(x, cz + 0.2, 0.8, 0.26, 0, 0.05);
    vp.cho.gheDa.push({ id: `da-${x}-a`, x: x - 0.42, z: cz + 0.27, yaw: 0, tuThe: 'ngoiDienThoai', cu: '', nguoi: null, ngoi: true, cam: 'dienThoai' });
    vp.cho.gheDa.push({ id: `da-${x}-b`, x: x + 0.42, z: cz + 0.27, yaw: 0, tuThe: 'ngoi', cu: 'noi', nguoi: null, ngoi: true });
  }
  // Đài phun nước nhỏ ở đầu vườn.
  bd.them(HINH.tru, VL.chau, 0.4, 0.22, cz, 0, { sx: 1.5, sy: 0.44, sz: 1.5 });
  bd.them(HINH.tru, VL.nuoc, 0.4, 0.42, cz, 0, { sx: 1.3, sy: 0.06, sz: 1.3 });
  bd.them(HINH.tru, VL.chau, 0.4, 0.75, cz, 0, { sx: 0.2, sy: 0.7, sz: 0.2 });
  bd.them(HINH.cau, VL.nuoc, 0.4, 1.12, cz, 0, { sx: 0.35, sy: 0.25, sz: 0.35 });
  chanTinh(0.4, cz, 0.75, 0.75);

  // ---------- đồng hồ treo tường và bảng mức dùng ----------
  const zTuong = BIEN.zMin + 0.12;
  const xDH = -9.4;
  const yDH = 1.95;
  const cvMat = document.createElement('canvas');
  cvMat.width = cvMat.height = 512;
  {
    const g = cvMat.getContext('2d');
    g.fillStyle = '#fffdf8';
    g.beginPath();
    g.arc(256, 256, 256, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const dai = i % 5 === 0 ? 34 : 14;
      g.strokeStyle = i % 5 === 0 ? '#2b2420' : '#9a8f84';
      g.lineWidth = i % 5 === 0 ? 9 : 3;
      g.beginPath();
      g.moveTo(256 + Math.sin(a) * 236, 256 - Math.cos(a) * 236);
      g.lineTo(256 + Math.sin(a) * (236 - dai), 256 - Math.cos(a) * (236 - dai));
      g.stroke();
    }
    g.fillStyle = '#2b2420';
    g.font = '700 64px -apple-system, Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (let h = 1; h <= 12; h++) {
      const a = (h / 12) * Math.PI * 2;
      g.fillText(String(h), 256 + Math.sin(a) * 168, 256 - Math.cos(a) * 168 + 3);
    }
    g.fillStyle = '#d97757';
    g.font = '700 30px -apple-system, Helvetica, Arial, sans-serif';
    g.fillText('✻ CLAUDE', 256, 340);
  }
  const texMat = new THREE.CanvasTexture(cvMat);
  texMat.colorSpace = THREE.SRGBColorSpace;
  texMat.anisotropy = 8;
  const dhLon = new THREE.Group();
  const matDH = new THREE.Mesh(new THREE.CircleGeometry(0.8, 64), new THREE.MeshBasicMaterial({ map: texMat, toneMapped: false }));
  dhLon.add(matDH);
  const vanhDH = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.06, 10, 64), VL.goToi);
  vanhDH.castShadow = true;
  dhLon.add(vanhDH);
  const kimLon = (dai, day, mau, z) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(day, dai, 0.012), new THREE.MeshBasicMaterial({ color: mau, toneMapped: false }));
    m.position.set(0, dai / 2 - 0.06, z);
    g.add(m);
    dhLon.add(g);
    return g;
  };
  const kimGioLon = kimLon(0.44, 0.06, '#2b2420', 0.012);
  const kimPhutLon = kimLon(0.64, 0.038, '#2b2420', 0.022);
  const kimGiayLon = kimLon(0.7, 0.014, '#c0392b', 0.032);
  const tamDH = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), new THREE.MeshBasicMaterial({ color: '#c0392b', toneMapped: false }));
  tamDH.position.z = 0.04;
  dhLon.add(tamDH);
  dhLon.position.set(xDH, yDH, zTuong + 0.03);
  nhom.add(dhLon);
  vp.dong.dongHoLon = { kimGio: kimGioLon, kimPhut: kimPhutLon, kimGiay: kimGiayLon };

  const cvMD = document.createElement('canvas');
  cvMD.width = 1024;
  cvMD.height = 576;
  const texMD = new THREE.CanvasTexture(cvMD);
  texMD.colorSpace = THREE.SRGBColorSpace;
  texMD.anisotropy = 8;
  const bangMD = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.86), new THREE.MeshBasicMaterial({ map: texMD, toneMapped: false }));
  bangMD.position.set(-4.6, yDH, zTuong + 0.05);
  nhom.add(bangMD);
  bd.hop(3.46, 2.02, 0.06, VL.goToi, -4.6, yDH - 1.01, zTuong);
  vp.dong.bangMD = { cv: cvMD, tex: texMD, khoa: '' };
  veBangMucDung(vp, null, Date.now());

  // Vài chậu cây trong khu làm việc.
  for (const [x, z] of [[-16.1, -11.1], [3.0, -11.1], [-16.1, 5.0], [3.0, 5.0]]) {
    chauCay(bd, x, z, 1.15);
    chanTinh(x, z, 0.32, 0.32);
  }

  bd.dong(nhom);
  vp.nhomTinh = nhom;
  vp.nhomBan = new THREE.Group();
  scene.add(vp.nhomBan);
  dungLuoi(vp);
  return vp;
}

function dungLuoi(vp) {
  vp.luoi.xoa();
  for (const c of vp.tinh) {
    if (c[0] === 'chan') vp.luoi.chan(c[1], c[2], c[3], c[4], c[5], c[6]);
    else vp.luoi.chanDoan(c[1], c[2], c[3], c[4], c[5]);
  }
  // Mở cửa phòng duyệt.
  vp.luoi.mo((CUA_DUYET.x1 + CUA_DUYET.x2) / 2, KHU.duyet.zMax, (CUA_DUYET.x2 - CUA_DUYET.x1) / 2 - 0.25, 0.6);
  for (const c of vp.chanBan || []) vp.luoi.chan(c[0], c[1], c[2], c[3], c[4], c[5]);
}

// ---------- cụm bàn theo dự án ----------
const BUOC_X = 1.5;
const BUOC_Z = 4.7;
const NUA_SAU_CUM = 1.62;

// nhomDuAn: [{ ten, mau, ma: [mã phiên theo thứ tự ghế] }]
// Trả về Map mã phiên → ghế { x, z, yaw, manHinh, duAn }.
export function xepBan(vp, manHinh, nhomDuAn) {
  for (const c of [...vp.nhomBan.children]) {
    vp.nhomBan.remove(c);
    c.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material?.map && o.userData.rieng) o.material.map.dispose();
    });
  }
  const cum = [];
  for (const da of nhomDuAn) {
    for (let i = 0; i < da.ma.length; i += 8) {
      const ma = da.ma.slice(i, i + 8);
      cum.push({ da, ma, k: Math.max(1, Math.ceil(ma.length / 2)), phan: i / 8 });
    }
  }
  // Xếp từng hàng từ trong ra ngoài, mỗi hàng căn giữa khu làm việc.
  const L = KHU.lam;
  const rongKhu = L.xMax - L.xMin - 0.6;
  const hang = [];
  let dong = [];
  let rongDong = 0;
  for (const c of cum) {
    const rong = c.k * BUOC_X + 0.5;
    if (dong.length && rongDong + 1.6 + rong > rongKhu) {
      hang.push({ ds: dong, rong: rongDong });
      dong = [];
      rongDong = 0;
    }
    rongDong += (dong.length ? 1.6 : 0) + rong;
    dong.push(c);
  }
  if (dong.length) hang.push({ ds: dong, rong: rongDong });

  const ghe = new Map();
  vp.chanBan = [];
  const bd = new BoDung();
  const giua = (L.xMin + L.xMax) / 2;
  const sauKhoi = hang.length * BUOC_Z - (BUOC_Z - 2 * NUA_SAU_CUM);
  const zDau = Math.max(L.zMin + 1.25, Math.min((L.zMin + L.zMax) / 2 - sauKhoi / 2, L.zMax - 0.6 - sauKhoi));
  hang.forEach((h, iHang) => {
    const czc = zDau + NUA_SAU_CUM + iHang * BUOC_Z;
    let x = giua - h.rong / 2;
    for (const c of h.ds) {
      const rong = c.k * BUOC_X + 0.5;
      const cxc = x + rong / 2;
      dungCum(vp, bd, manHinh, c, cxc, czc, ghe);
      x += rong + 1.6;
    }
  });
  bd.dong(vp.nhomBan);
  dungLuoi(vp);
  return ghe;
}

function dungCum(vp, bd, manHinh, c, cx, cz, ghe) {
  const { da, ma, k } = c;
  const rong = k * BUOC_X;
  const vlVach = vatLieu(da.mau, { roughness: 0.85 });
  // Vách ngăn giữa hai dãy, mang màu dự án.
  bd.hop(rong - 0.1, 0.42, 0.05, vlVach, cx, 0.74, cz);
  for (let hang = 0; hang < 2; hang++) {
    const huong = hang === 0 ? -1 : 1; // -1: dãy phía trong (người ngồi ở z nhỏ hơn)
    const zBan = cz + huong * 0.37;
    bd.hop(rong - 0.05, 0.04, 0.72, VL.matBan, cx, 0.72, zBan);
    for (let i = 0; i <= k; i++) {
      const xc = cx - rong / 2 + i * BUOC_X;
      bd.hop(0.04, 0.72, 0.66, VL.chanBan, Math.min(cx + rong / 2 - 0.05, Math.max(cx - rong / 2 + 0.05, xc)), 0, zBan);
    }
  }
  vp.chanBan.push([cx, cz, rong / 2, 0.76, 0, 0.18]);

  ma.forEach((maPhien, i) => {
    const cot = Math.floor(i / 2);
    const hang = i % 2;
    const huong = hang === 0 ? -1 : 1;
    const x = cx - rong / 2 + BUOC_X / 2 + cot * BUOC_X;
    const zBan = cz + huong * 0.37;
    const zNguoi = cz + huong * 1.0;
    const yaw = huong === -1 ? 0 : Math.PI;
    // Màn hình (động) quay về người ngồi.
    const zMh = cz + huong * 0.15;
    bd.hop(0.1, 0.16, 0.08, VL.manHinhVo, x, 0.74, zMh);
    bd.hop(0.25, 0.015, 0.18, VL.manHinhVo, x, 0.74, zMh);
    bd.them(HINH.hop, VL.manHinhVo, x, 1.08, zMh, 0, { sx: 0.66, sy: 0.42, sz: 0.035 });
    const mh = new THREE.Mesh(new THREE.PlaneGeometry(0.61, 0.37), manHinh.vatLieu('tat'));
    mh.position.set(x, 1.08, zMh + huong * 0.019);
    mh.rotation.y = huong === -1 ? Math.PI : 0;
    vp.nhomBan.add(mh);
    // Bàn phím, chuột, đồ lặt vặt.
    bd.hop(0.44, 0.02, 0.15, VL.banPhim, x - 0.02, 0.74, zBan + huong * 0.12);
    bd.hop(0.06, 0.02, 0.1, VL.banPhim, x + 0.32, 0.74, zBan + huong * 0.12);
    const h = (maPhien.charCodeAt(6) || 0) + i;
    if (h % 3 === 0) bd.them(HINH.tru, VL.sach[h % 5], x - 0.48, 0.79, zBan + huong * 0.05, 0, { sx: 0.08, sy: 0.1, sz: 0.08 });
    else if (h % 3 === 1) bd.hop(0.2, 0.04, 0.28, VL.trang, x - 0.45, 0.74, zBan + huong * 0.02, 0.3);
    else {
      bd.them(HINH.tru, VL.chau, x - 0.5, 0.8, zBan + huong * 0.05, 0, { sx: 0.1, sy: 0.12, sz: 0.1 });
      bd.them(HINH.la, VL.la2, x - 0.5, 0.92, zBan + huong * 0.05, h, { sx: 0.18, sy: 0.2, sz: 0.18 });
    }
    gheVanPhong(bd, x, zNguoi, yaw, da.mau);
    ghe.set(maPhien, { x, z: zNguoi, yaw, manHinh: mh, duAn: da.ten, mau: da.mau, banX: x, banZ: zBan });
  });

  // Biển tên dự án treo trên cụm.
  const tex = anhChu(da.ten, { nen: da.mau, mau: '#ffffff', co: 62, rong: 640, cao: 120, phu: c.phan ? `cụm ${c.phan + 1}` : null });
  const bien = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(3.2, rong + 0.4), 0.6), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
  bien.userData.rieng = true;
  bien.position.set(cx, 2.55, cz);
  vp.nhomBan.add(bien);
  bd.them(HINH.tru, VL.khung, cx - Math.min(1.5, rong / 2), 2.95, cz, 0, { sx: 0.015, sy: 0.5, sz: 0.015, bong: false });
  bd.them(HINH.tru, VL.khung, cx + Math.min(1.5, rong / 2), 2.95, cz, 0, { sx: 0.015, sy: 0.5, sz: 0.015, bong: false });
}

// ---------- bảng mức dùng trên tường ----------
// md: { namGio: { phanTram, luc, cu, nguon }, het: { luc, chinhXac }, tuan: { phanTram, ten, het }, nguonCC } hoặc null.
// nguon 'claude-code': số lấy từ lệnh /usage của Claude Code; không có thì là số app Claude ghi ra tệp.
export function veBangMucDung(vp, md, bayGio) {
  const b = vp.dong.bangMD;
  const phut = Math.floor(bayGio / 60e3);
  const khoa = JSON.stringify(md) + '|' + phut;
  if (khoa === b.khoa) return;
  b.khoa = khoa;
  const g = b.cv.getContext('2d');
  const F = '-apple-system, "SF Pro Display", Helvetica, Arial, sans-serif';
  const hhmm = (ms) => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  g.fillStyle = '#fbf8f2';
  g.fillRect(0, 0, 1024, 576);
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillStyle = '#2b2420';
  g.font = `800 44px ${F}`;
  g.fillText('MỨC DÙNG CLAUDE', 48, 82);
  g.textAlign = 'right';
  g.fillStyle = '#6f645b';
  g.font = `700 40px ${F}`;
  const ngay = new Date(bayGio).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
  g.fillText(`${hhmm(bayGio)} · ${ngay}`, 976, 82);

  const co = md?.namGio;
  if (!co && !md?.het) {
    // Chưa có số: nói thẳng phải làm gì, thay cho vòng đo rỗng.
    g.fillStyle = '#f1ebe2';
    g.beginPath();
    g.arc(170, 300, 96, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#c9820f';
    g.font = `800 120px ${F}`;
    g.textAlign = 'center';
    g.fillText('i', 170, 342);
    g.textAlign = 'left';
    // Chế độ điều khiển qua web: văn phòng tự hỏi /usage của Claude Code. Chế độ chỉ xem: chờ app Claude ghi số.
    const [tieuDe, dong, chan] =
      md?.nguonCC === 'dangLay'
        ? ['Đang lấy số mức dùng', ['Văn phòng đang hỏi Claude Code', '(lệnh /usage, không tốn lượt dùng).', 'Số hiện ở đây sau vài giây.'], 'Cập nhật 5 phút một lần khi có người mở trang.']
        : md?.nguonCC === 'khongCo'
          ? ['Không có giới hạn gói', ['Claude Code trên máy đang dùng API key', '(tính tiền theo API), nên không có', '% giới hạn 5 giờ hay tuần để hiện.'], 'Đăng nhập bằng gói Claude: chạy claude, gõ /login.']
          : [
              'Chưa có số mức dùng',
              ['App Claude chỉ ghi số khi bạn bấm vào', 'biểu tượng Claude trên thanh menu', '(góc trên bên phải màn hình Mac).', 'Bấm một lần, số hiện ở đây sau ít phút.'],
              'Sau lần bấm đó app tự cập nhật mỗi 15 phút, trong 24 giờ.',
            ];
    g.fillStyle = '#2b2420';
    g.font = `800 52px ${F}`;
    g.fillText(tieuDe, 310, 222);
    g.fillStyle = '#4a4038';
    g.font = `600 33px ${F}`;
    dong.forEach((d, i) => g.fillText(d, 310, 290 + i * 50));
    g.fillStyle = '#9a8f84';
    g.font = `600 26px ${F}`;
    g.fillText(chan, 48, 536);
    b.tex.needsUpdate = true;
    return;
  }
  const pt = co ? Math.max(0, Math.min(100, Math.round(co.phanTram))) : null;
  const mau = pt === null ? '#b9b0a6' : pt >= 85 ? '#c93b3b' : pt >= 60 ? '#d08a1c' : '#2f9e6b';
  // Vòng đo phần trăm giới hạn 5 giờ.
  const cx = 230;
  const cy = 330;
  g.lineCap = 'round';
  g.lineWidth = 46;
  g.strokeStyle = '#e8e1d6';
  g.beginPath();
  g.arc(cx, cy, 150, 0, Math.PI * 2);
  g.stroke();
  if (pt) {
    g.strokeStyle = mau;
    g.beginPath();
    g.arc(cx, cy, 150, -Math.PI / 2, -Math.PI / 2 + (pt / 100) * Math.PI * 2);
    g.stroke();
  }
  g.textAlign = 'center';
  g.fillStyle = pt === null ? '#9a8f84' : '#2b2420';
  g.font = `800 ${pt === null ? 84 : 96}px ${F}`;
  g.fillText(pt === null ? '—' : pt + '%', cx, cy + 22);
  g.fillStyle = '#6f645b';
  g.font = `600 28px ${F}`;
  g.fillText('giới hạn 5 giờ', cx, cy + 66);

  g.textAlign = 'left';
  const x = 450;
  if (md?.het) {
    g.fillStyle = '#6f645b';
    g.font = `600 34px ${F}`;
    g.fillText(md.het.chinhXac ? 'Hết giới hạn lúc' : 'Hết giới hạn khoảng', x, 210);
    g.fillStyle = '#2b2420';
    g.font = `800 112px ${F}`;
    g.fillText(hhmm(md.het.luc), x, 318);
    const con = Math.max(0, md.het.luc - bayGio);
    const gio = Math.floor(con / 3600e3);
    const ph = Math.round((con % 3600e3) / 60e3);
    g.fillStyle = mau;
    g.font = `700 36px ${F}`;
    g.fillText(con <= 0 ? 'đã hết, đang mở khung mới' : `còn ${gio ? gio + ' giờ ' : ''}${ph} phút`, x, 372);
  } else {
    // Có phần trăm mà chưa đoán được giờ hết (cần thêm mẫu quanh lúc khung đổi).
    g.fillStyle = '#6f645b';
    g.font = `600 34px ${F}`;
    g.fillText('Giờ hết giới hạn', x, 230);
    g.fillStyle = '#4a4038';
    g.font = `700 40px ${F}`;
    g.fillText('sẽ hiện khi khung 5 giờ', x, 292);
    g.fillText('đổi lần tới', x, 342);
  }
  if (md?.tuan) {
    g.fillStyle = '#2b2420';
    g.font = `700 36px ${F}`;
    g.fillText(`Giới hạn tuần${md.tuan.ten ? ` (${md.tuan.ten})` : ''}: ${Math.round(md.tuan.phanTram)}%`, x, 440);
    if (md.tuan.het) {
      g.fillStyle = '#6f645b';
      g.font = `600 28px ${F}`;
      const ngayHet = new Date(md.tuan.het).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
      g.fillText(`mở lại ${hhmm(md.tuan.het)} ${ngayHet}`, x, 482);
    }
  }
  g.font = `600 26px ${F}`;
  if (co?.nguon === 'claude-code') {
    g.fillStyle = '#9a8f84';
    g.fillText(`Claude Code báo lúc ${hhmm(co.luc)} (lệnh /usage) · cập nhật 5 phút một lần`, 48, 536);
  } else if (co?.cu) {
    g.fillStyle = '#b86e00';
    g.fillText(`Số app ghi lúc ${hhmm(co.luc)} · bấm biểu tượng Claude trên thanh menu để cập nhật`, 48, 536);
  } else if (co) {
    g.fillStyle = '#9a8f84';
    g.fillText(`Số app Claude ghi lúc ${hhmm(co.luc)}${md.het && !md.het.chinhXac ? ' · giờ hết là ước tính' : ''}`, 48, 536);
  }
  b.tex.needsUpdate = true;
}

// ---------- phần động ----------
export function capNhatVanPhong(vp, dt, t, { soCho = 0, camera }) {
  // Đèn báo chờ duyệt nhấp nháy khi có người chờ.
  const db = vp.dong.denBao;
  const muc = soCho > 0 ? 0.6 + 0.4 * Math.sin(t * 5) : 0.08;
  db.vl.emissiveIntensity = muc * 2.2;
  db.anh.intensity = soCho > 0 ? muc * 2.5 : 0;

  // Hơi cà phê bốc lên.
  const h = vp.dong.hoi;
  for (const p of h.ds) {
    const chu = (t * 0.45 + p.pha) % 1;
    p.m.position.set(h.x + Math.sin(chu * 9 + p.pha * 7) * 0.05, 1.12 + chu * 0.6, h.z + Math.cos(chu * 7) * 0.04);
    p.m.scale.setScalar(0.6 + chu * 1.6);
    p.m.material.opacity = h.manh * (1 - chu);
  }

  // Đồng hồ chạy theo giờ máy.
  const now = new Date();
  const giay = now.getSeconds() + now.getMilliseconds() / 1000;
  const phut = now.getMinutes() + giay / 60;
  const gio = (now.getHours() % 12) + phut / 60;
  const d = vp.dong.dongHo;
  d.kimGiay.rotation.z = -(giay / 60) * Math.PI * 2;
  d.kimPhut.rotation.z = -(phut / 60) * Math.PI * 2;
  d.kimGio.rotation.z = -(gio / 12) * Math.PI * 2;
  const l = vp.dong.dongHoLon;
  l.kimGiay.rotation.z = -(giay / 60) * Math.PI * 2;
  l.kimPhut.rotation.z = -(phut / 60) * Math.PI * 2;
  l.kimGio.rotation.z = -(gio / 12) * Math.PI * 2;

  // Con dấu và chữ "ĐÃ DUYỆT".
  const dau = vp.dong.dau;
  const sau = t - dau.t;
  if (sau >= 0 && sau < 2.2) {
    const nhac = sau < 0.25 ? sau / 0.25 : sau < 0.4 ? 1 - (sau - 0.25) / 0.15 : 0;
    dau.conDau.position.y = 0.79 + nhac * 0.3;
    dau.vl.opacity = sau < 0.35 ? 0 : Math.max(0, 1 - (sau - 0.35) / 1.8);
    dau.sprite.position.y = 1.6 + (sau - 0.35) * 0.4;
    const s = sau < 0.5 ? 1.4 - (sau - 0.35) * 2.6 : 1;
    dau.sprite.scale.set(1.9 * s, 0.56 * s, 1);
  } else {
    dau.conDau.position.y = 0.79;
    dau.vl.opacity = 0;
  }

  // Tường nằm giữa máy quay và văn phòng thì mờ đi.
  if (camera) {
    for (const w of vp.tuong) {
      const ngoai = (camera.position.x - w.x) * w.phapX + (camera.position.z - w.z) * w.phapZ < 0;
      const dich = ngoai ? 0.12 : 1;
      w.mo += (dich - w.mo) * (1 - Math.exp(-dt * 6));
      for (const vl of w.vl) {
        vl.opacity = w.mo;
        vl.depthWrite = w.mo > 0.95;
      }
    }
  }
}

export function dongDauDuyet(vp, t) {
  vp.dong.dau.t = t;
}

export function datHoiCaPhe(vp, manh) {
  vp.dong.hoi.manh = manh;
}
