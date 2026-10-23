// Claude Office: ghép cảnh 3D, người, giao diện và dữ liệu phiên lấy từ máy chủ trên máy này.
import * as THREE from 'three';
import { OrbitControls } from '/vendor/OrbitControls.js';
import { dungVanPhong, capNhatVanPhong, veBangMucDung, BIEN, KHU } from './van-phong.js';
import { DieuPhoi } from './hanh-vi.js';
import { ManHinh } from './man-hinh.js';
import { GiaoDien } from './giao-dien.js';
import { taoDemo } from './demo.js';

const khung = document.getElementById('canh');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
khung.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ece6dc');

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.3, 400);
camera.position.set(-3, 30, 24);
// Điều khiển kiểu xem bản đồ: kéo chuột (hay một ngón) là dời cảnh, lăn chuột (hay hai ngón) là
// phóng to/thu nhỏ. Khoá xoay để cảnh không bao giờ quay vòng.
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0.5);
controls.enableRotate = false;
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
controls.enableDamping = true;
controls.dampingFactor = 0.14;
controls.zoomSpeed = 0.7;
controls.minDistance = 7;
controls.maxDistance = 120;
controls.screenSpacePanning = false;
controls.update();

const troi = new THREE.HemisphereLight('#fdf7ee', '#9c8f7c', 0.95);
scene.add(troi);
const nang = new THREE.DirectionalLight('#fff1dc', 1.5);
nang.position.set(-16, 32, 20);
nang.castShadow = true;
nang.shadow.mapSize.set(2048, 2048);
const sc = nang.shadow.camera;
sc.left = -24;
sc.right = 24;
sc.top = 20;
sc.bottom = -20;
sc.near = 5;
sc.far = 90;
nang.shadow.bias = -0.0005;
nang.shadow.normalBias = 0.03;
scene.add(nang);
scene.add(nang.target);
const moi = new THREE.AmbientLight('#ffffff', 0.12);
scene.add(moi);

const manHinh = new ManHinh();
const vp = dungVanPhong(scene, manHinh);
const dieuPhoi = new DieuPhoi(vp, scene, manHinh);

// ---------- sáng / tối theo máy: giao diện tối thì văn phòng lên đèn buổi tối, khỏi chói ----------
const toi = window.matchMedia('(prefers-color-scheme: dark)');
function datChuDe() {
  const dem = toi.matches;
  scene.background.set(dem ? '#1f1d1b' : '#ece6dc');
  troi.color.set(dem ? '#c3cbe0' : '#fdf7ee');
  troi.groundColor.set(dem ? '#4a4038' : '#9c8f7c');
  troi.intensity = dem ? 0.62 : 0.95;
  nang.color.set(dem ? '#ffd9b0' : '#fff1dc');
  nang.intensity = dem ? 0.9 : 1.5;
  moi.intensity = dem ? 0.1 : 0.12;
  vp.dong.kinhCuaSo.emissive.set(dem ? '#24324f' : '#9cc7e8');
  for (const w of vp.tuong) w.vl[2].emissive.copy(vp.dong.kinhCuaSo.emissive);
}
datChuDe();
toi.addEventListener?.('change', datChuDe);

// ---------- máy quay ----------
// Cả phiên nhìn theo một hướng cố định, chọn một lần lúc mở trang: màn ngang nhìn từ phía nam,
// màn dọc (điện thoại) nhìn từ phía tây cho văn phòng nằm dọc theo màn. Đổi khu chỉ trượt và
// phóng/thu (nội suy tâm nhìn và khoảng cách, giữ nguyên hướng), nên không bao giờ xoay.
const MAN_DOC = window.innerHeight > window.innerWidth * 1.1;
const HUONG = new THREE.Vector3(...(MAN_DOC ? [-0.62, 0.78, 0.08] : [-0.12, 0.8, 0.59])).normalize();
const KHU_NHIN = { toan: BIEN, duyet: KHU.duyet, lam: KHU.lam, cafe: KHU.cafe, vuon: KHU.vuon };
let gocHienTai = 'toan';
let truotAnim = null;

function khoangHienTai() {
  return camera.position.distanceTo(controls.target);
}
function datMay(dich, d) {
  controls.target.copy(dich);
  camera.position.copy(dich).addScaledVector(HUONG, d);
}
// Trượt tâm nhìn tới "dich" và đổi khoảng cách tới "d" (phóng/thu đều theo tỉ lệ), giữ hướng.
function truot(dich, d, giay) {
  const tuD = khoangHienTai();
  const xa = controls.target.distanceTo(dich);
  const ti = Math.abs(Math.log(d / tuD));
  const dai = giay ?? Math.min(0.9, Math.max(0.35, 0.3 + xa / 45 + ti * 0.5));
  truotAnim = { tuT: controls.target.clone(), denT: dich.clone(), tuD, denD: d, bd: performance.now(), dai: dai * 1000 };
}

// Khoảng cách vừa đủ để cả một khu (hộp trên sàn) nằm trong phần màn hình còn trống. Luôn tính như
// lúc bảng bên đang mở, nên mở hay gập bảng không phải canh lại (cảnh chỉ dịch sang ngang).
const camThu = new THREE.PerspectiveCamera();
function khoangVua(hop) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const lech = w >= 900 ? bang.offsetWidth + 12 : 0;
  camThu.copy(camera);
  camThu.aspect = (w + lech) / h;
  if (lech > 0.5) camThu.setViewOffset(w + lech, h, lech, 0, w, h);
  else camThu.clearViewOffset();
  camThu.updateProjectionMatrix();
  const goc = [];
  for (const x of [hop.xMin, hop.xMax]) for (const z of [hop.zMin, hop.zMax]) for (const y of [0, 2.6]) goc.push(new THREE.Vector3(x, y, z));
  const dich = new THREE.Vector3((hop.xMin + hop.xMax) / 2, 0.4, (hop.zMin + hop.zMax) / 2);
  const tt = document.getElementById('thanh-tren').getBoundingClientRect();
  const day = document.getElementById('goc-nhin').getBoundingClientRect().top;
  const tren = 1 - (2 * (tt.bottom + 10)) / h;
  const duoi = -1 + (2 * (h - day + 10)) / h;
  const trai = -1 + (2 * 14) / w;
  const phai = 1 - (2 * (lech + 14)) / w;
  const v = new THREE.Vector3();
  let gan = 4;
  let xa = 300;
  for (let i = 0; i < 26; i++) {
    const d = (gan + xa) / 2;
    camThu.position.copy(dich).addScaledVector(HUONG, d);
    camThu.lookAt(dich);
    camThu.updateMatrixWorld();
    let vua = true;
    for (const g of goc) {
      v.copy(g).project(camThu);
      if (v.x < trai || v.x > phai || v.y < duoi || v.y > tren) {
        vua = false;
        break;
      }
    }
    if (vua) xa = d;
    else gan = d;
  }
  return { dich, d: xa };
}
// Không cho lùi xa hơn toàn cảnh một chút, khỏi thu văn phòng thành một chấm.
function datGioiHan() {
  controls.maxDistance = Math.max(30, khoangVua(BIEN).d * 1.15);
}
function veGoc(ten, ngay = false) {
  const { dich, d } = khoangVua(KHU_NHIN[ten]);
  if (ngay) {
    truotAnim = null;
    datMay(dich, d);
    controls.update();
  } else truot(dich, d);
}

// Người được chọn mà đang nằm ngoài phần màn hình còn trống thì trượt ngang tới, giữ độ xa.
const viTriTam = new THREE.Vector3();
const vTam = new THREE.Vector3();
function trongKhung(p) {
  vTam.copy(p).project(camera);
  if (vTam.z > 1) return false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const x = (vTam.x * 0.5 + 0.5) * w;
  const y = (-vTam.y * 0.5 + 0.5) * h;
  const tren = document.getElementById('thanh-tren').getBoundingClientRect().bottom + 30;
  const day = document.getElementById('goc-nhin').getBoundingClientRect().top - 30;
  return x > 30 && x < w - lechHienTai - 30 && y > tren && y < day;
}
function hienNguoi(ma) {
  const p = dieuPhoi.viTri(ma, viTriTam);
  if (!p || trongKhung(p)) return;
  gocHienTai = null;
  giaoDien.chonGoc(null);
  truot(new THREE.Vector3(p.x, controls.target.y, p.z), khoangHienTai());
}
let diTheo = false;

// Vòng sáng dưới chân người đang được chọn (thay cho việc bay máy quay tới).
const vongChon = new THREE.Mesh(
  new THREE.RingGeometry(0.42, 0.58, 48),
  new THREE.MeshBasicMaterial({ color: '#d97757', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
);
vongChon.rotation.x = -Math.PI / 2;
vongChon.renderOrder = 3;
vongChon.visible = false;
scene.add(vongChon);
function datVongChon(t) {
  const ma = giaoDien.chon;
  let x = null;
  let z = null;
  if (ma === 'sep') {
    x = vp.gheSep.x;
    z = vp.gheSep.z;
  } else if (ma) {
    const nv = dieuPhoi.ds.get(ma);
    if (nv) {
      x = nv.x;
      z = nv.z;
    }
  }
  vongChon.visible = x !== null;
  if (!vongChon.visible) return;
  vongChon.position.set(x, 0.035, z);
  const s = 1 + 0.08 * Math.sin(t * 3);
  vongChon.scale.set(s, s, s);
}

const giaoDien = new GiaoDien({
  dieuPhoi,
  camera,
  khiChon: (ma, timToi) => {
    giaoDien.chonNguoi(ma);
    if (ma && timToi) hienNguoi(ma);
  },
  khiGocNhin: (ten) => {
    diTheo = false;
    giaoDien.diTheo = false;
    if (giaoDien.chon) giaoDien.veThe();
    gocHienTai = ten;
    veGoc(ten);
  },
  khiDiTheo: (bat) => {
    diTheo = bat;
    if (bat) {
      truotAnim = null;
      gocHienTai = null;
      giaoDien.chonGoc(null);
    }
  },
});

// ---------- bấm chọn, rê chuột ----------
const tia = new THREE.Raycaster();
const chuot = new THREE.Vector2();
let nhanXuong = null;
function trungAi(e) {
  const r = renderer.domElement.getBoundingClientRect();
  chuot.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  tia.setFromCamera(chuot, camera);
  const ds = tia.intersectObjects(dieuPhoi.khoiBam(), false);
  return ds.length ? ds[0].object.userData.ma : null;
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  nhanXuong = { x: e.clientX, y: e.clientY };
});
// Bấm vào ai trong cảnh: chỉ chọn (hiện thẻ và vòng sáng), máy quay đứng yên.
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!nhanXuong || Math.hypot(e.clientX - nhanXuong.x, e.clientY - nhanXuong.y) > 6) return;
  giaoDien.chonNguoi(trungAi(e));
});
let choTro = null;
renderer.domElement.addEventListener('pointermove', (e) => {
  if (e.buttons) {
    giaoDien.datTro(null);
    return;
  }
  choTro = e;
});
renderer.domElement.addEventListener('pointerleave', () => {
  choTro = null;
  giaoDien.datTro(null);
  khung.classList.remove('tro');
});
controls.addEventListener('start', () => {
  truotAnim = null;
  gocHienTai = null;
  giaoDien.chonGoc(null);
  if (diTheo) {
    diTheo = false;
    giaoDien.diTheo = false;
    if (giaoDien.chon) giaoDien.veThe();
  }
});

// Bảng bên mở thì dời tâm cảnh sang phần còn trống (setViewOffset), khỏi che phòng duyệt.
const bang = document.getElementById('bang');
let lechHienTai = 0;
function lechMuc() {
  return !bang.classList.contains('gap') && window.innerWidth >= 900 ? bang.offsetWidth + 12 : 0;
}
function datKhung(lech = lechHienTai) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = (w + lech) / h;
  if (lech > 0.5) camera.setViewOffset(w + lech, h, lech, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  lechHienTai = lechMuc();
  datKhung();
  datGioiHan();
  if (gocHienTai) veGoc(gocHienTai, true);
});
lechHienTai = lechMuc();
datKhung();
datGioiHan();
// Trang tải lại (máy chủ vừa khởi động lại, hay bấm ⌘R) thì giữ nguyên góc nhìn, độ xa, người đang chọn:
// lưu vào sessionStorage của thẻ trình duyệt này lúc rời trang, đọc lại lúc mở.
const KHOA_MAY = 'vpc-may';
function luuMay() {
  try {
    const t = controls.target;
    sessionStorage.setItem(KHOA_MAY, JSON.stringify({ luc: Date.now(), t: [t.x, t.y, t.z], d: khoangHienTai(), goc: gocHienTai, chon: giaoDien.chon, diTheo }));
  } catch {}
}
window.addEventListener('pagehide', luuMay);
window.addEventListener('beforeunload', luuMay);
let mayCu = null;
try {
  mayCu = JSON.parse(sessionStorage.getItem(KHOA_MAY) || 'null');
  if (!mayCu || Date.now() - mayCu.luc > 30 * 60e3 || !Array.isArray(mayCu.t) || !(mayCu.d > 0)) mayCu = null;
} catch {}
if (mayCu) {
  datMay(new THREE.Vector3(...mayCu.t), Math.min(controls.maxDistance, Math.max(controls.minDistance, mayCu.d)));
  controls.update();
  gocHienTai = KHU_NHIN[mayCu.goc] ? mayCu.goc : null;
  giaoDien.chonGoc(gocHienTai);
} else veGoc('toan', true);
window.addEventListener('keydown', (e) => {
  // Escape đóng thẻ, trừ khi đang gõ hay đang mở hộp giao việc (hộp tự đóng bằng Escape).
  if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
  if (/^(TEXTAREA|INPUT|SELECT)$/.test(document.activeElement?.tagName || '')) {
    document.activeElement.blur();
    return;
  }
  giaoDien.chonNguoi(null);
});

// ---------- dữ liệu ----------
const thamSo = new URLSearchParams(location.search);
let banMoi = null;
let laDau = true;
let lanChayDau = null;
function nhan(du) {
  if (du.lanChay) {
    if (!lanChayDau) lanChayDau = du.lanChay;
    // Máy chủ vừa khởi động lại: đang tải lại trang thì thôi, khỏi gửi lệnh bằng mã cũ.
    else if (du.lanChay !== lanChayDau && giaoDien.mayChuKhoiDongLai()) return;
  }
  banMoi = du;
  dieuPhoi.capNhatPhien(du.phien, Date.now());
  giaoDien.capNhat(du.phien, Date.now(), laDau);
  giaoDien.capNhatMucDung(du.mucDung);
  giaoDien.datDieuKhien(du.dieuKhien);
  veBangMucDung(vp, du.mucDung || null, Date.now());
  if (laDau) {
    laDau = false;
    document.getElementById('cho-tai').classList.add('xong');
    // ?chon=<mã phiên>: mở sẵn thẻ của người đó (link từ thông báo, ảnh chụp màn hình). Không có thì chọn lại
    // người đang chọn trước khi trang tải lại, không dời máy quay.
    const chon = thamSo.get('chon');
    if (chon && du.phien.some((p) => p.id === chon)) setTimeout(() => giaoDien.khiChon(chon, true), 300);
    else if (mayCu?.chon && (mayCu.chon === 'sep' || du.phien.some((p) => p.id === mayCu.chon))) {
      giaoDien.khiChon(mayCu.chon, false);
      if (mayCu.diTheo) {
        diTheo = true;
        giaoDien.diTheo = true;
        giaoDien.veThe();
      }
    }
  }
}
// Bảng mức dùng trên tường: giờ và "còn bao lâu" đổi theo phút (hàm tự bỏ qua nếu chưa sang phút mới).
setInterval(() => veBangMucDung(vp, banMoi?.mucDung || null, Date.now()), 5e3);
// Thời gian "đã chờ bao lâu" và trạng thái "ngủ gật" tính lại mỗi 30 giây.
setInterval(() => {
  if (banMoi) {
    dieuPhoi.capNhatPhien(banMoi.phien, Date.now());
    giaoDien.capNhat(banMoi.phien, Date.now(), true);
  }
}, 30e3);

function chayDemo(ly) {
  giaoDien.datKetNoi('thu', ly);
  taoDemo(nhan);
}
if (thamSo.has('demo') || location.protocol === 'file:') {
  chayDemo('dữ liệu mẫu');
} else {
  let daCo = false;
  const nguon = new EventSource('/api/su-kien');
  nguon.addEventListener('trang-thai', (e) => {
    daCo = true;
    giaoDien.datKetNoi('song', 'trực tiếp');
    nhan(JSON.parse(e.data));
  });
  nguon.addEventListener('error', () => {
    giaoDien.datKetNoi('mat', daCo ? 'mất kết nối, đang nối lại…' : 'chưa nối được máy chủ');
    if (!daCo && nguon.readyState === EventSource.CLOSED) chayDemo('dữ liệu mẫu (không có máy chủ)');
  });
  setTimeout(() => {
    if (!daCo) {
      nguon.close();
      chayDemo('dữ liệu mẫu (không có máy chủ)');
    }
  }, 6000);
}

// ---------- vòng vẽ ----------
const dongHo = new THREE.Clock();
let t = 0;
function ve() {
  requestAnimationFrame(ve);
  const dt = Math.min(0.1, dongHo.getDelta());
  t += dt;
  // Bảng bên mở/gập: cảnh chỉ trượt ngang theo (dời tâm chiếu), không phóng/thu.
  const lech = lechMuc();
  if (lech !== lechHienTai) {
    lechHienTai = Math.abs(lech - lechHienTai) > 0.5 ? lechHienTai + (lech - lechHienTai) * (1 - Math.exp(-dt * 10)) : lech;
    datKhung();
  }
  if (truotAnim) {
    const a = truotAnim;
    const k = Math.min(1, (performance.now() - a.bd) / a.dai);
    const e = 1 - Math.pow(1 - k, 3);
    const dich = new THREE.Vector3().lerpVectors(a.tuT, a.denT, e);
    datMay(dich, a.tuD * Math.pow(a.denD / a.tuD, e));
    if (k >= 1) truotAnim = null;
  } else if (diTheo && giaoDien.chon) {
    const p = dieuPhoi.viTri(giaoDien.chon, viTriTam);
    if (p) {
      // Đi theo: trượt êm theo người, giữ hướng và độ xa.
      const doi = new THREE.Vector3(p.x - controls.target.x, 0, p.z - controls.target.z).multiplyScalar(1 - Math.exp(-dt * 2));
      controls.target.add(doi);
      camera.position.add(doi);
    }
  }
  controls.target.x = Math.max(BIEN.xMin, Math.min(BIEN.xMax, controls.target.x));
  controls.target.z = Math.max(BIEN.zMin, Math.min(BIEN.zMax, controls.target.z));
  controls.update();

  dieuPhoi.capNhat(dt, t, Date.now());
  datVongChon(t);
  capNhatVanPhong(vp, dt, t, { soCho: dieuPhoi.soCho, camera });
  manHinh.capNhat(t, dieuPhoi.manDangDung);
  if (choTro) {
    const ma = trungAi(choTro);
    giaoDien.datTro(ma, choTro.clientX, choTro.clientY);
    khung.classList.toggle('tro', !!ma);
    choTro = null;
  }
  renderer.render(scene, camera);
  giaoDien.datNhan(window.innerWidth, window.innerHeight);
}
ve();
window.__vpc = { dieuPhoi, giaoDien, camera, controls, scene, renderer, vp };
