// Màn hình máy tính trên bàn: mỗi kiểu việc một màn (viết mã, chạy lệnh, đọc tài liệu, lướt web,
// đang nghĩ, chờ duyệt, lỗi, tắt). Mỗi kiểu là một canvas dùng chung cho mọi bàn, vẽ lại vài lần
// mỗi giây cho chữ chạy.
import * as THREE from 'three';

const R = 256;
const C = 160;
const MAU_MA = ['#c678dd', '#61afef', '#98c379', '#e5c07b', '#e06c75', '#56b6c2', '#abb2bf'];

function ngauNhien(hat) {
  let s = hat >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function taoDongMa(so, hat) {
  const r = ngauNhien(hat);
  const ds = [];
  let thut = 0;
  for (let i = 0; i < so; i++) {
    const manh = [];
    let x = 0;
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const dai = 10 + r() * 44;
      manh.push({ x, dai, mau: MAU_MA[Math.floor(r() * MAU_MA.length)] });
      x += dai + 6;
    }
    if (r() < 0.25) thut = Math.min(3, thut + 1);
    else if (r() < 0.25) thut = Math.max(0, thut - 1);
    ds.push({ thut, manh, trong: r() < 0.12 });
  }
  return ds;
}

const VE = {
  tat(g) {
    const gr = g.createLinearGradient(0, 0, R, C);
    gr.addColorStop(0, '#15181d');
    gr.addColorStop(1, '#0b0d10');
    g.fillStyle = gr;
    g.fillRect(0, 0, R, C);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(R * 0.5, 0);
    g.lineTo(R * 0.2, C);
    g.lineTo(0, C);
    g.fill();
  },
  ma(g, t, s) {
    g.fillStyle = '#1f2227';
    g.fillRect(0, 0, R, C);
    g.fillStyle = '#2a2e35';
    g.fillRect(0, 0, R, 14);
    g.fillStyle = '#d97757';
    g.fillRect(6, 4, 40, 6);
    g.fillStyle = '#4a505a';
    g.fillRect(52, 4, 30, 6);
    const cao = 11;
    const cuon = (t * 9) % (s.dong.length * cao);
    g.save();
    g.beginPath();
    g.rect(0, 15, R, C - 15);
    g.clip();
    for (let i = 0; i < 16; i++) {
      const so = Math.floor(cuon / cao) + i;
      const d = s.dong[so % s.dong.length];
      const y = 18 + i * cao - (cuon % cao);
      g.fillStyle = '#4b5263';
      g.fillRect(4, y + 2, 12, 5);
      if (d.trong) continue;
      for (const m of d.manh) {
        g.fillStyle = m.mau;
        g.fillRect(24 + d.thut * 12 + m.x, y + 1, m.dai, 6);
      }
    }
    // Con trỏ nhấp nháy ở dòng cuối.
    if (Math.floor(t * 2.5) % 2 === 0) {
      g.fillStyle = '#e6e6e6';
      g.fillRect(24 + 60 + ((t * 40) % 120), 18 + 13 * cao - (cuon % cao), 3, 9);
    }
    g.restore();
  },
  lenh(g, t, s) {
    g.fillStyle = '#0d0f12';
    g.fillRect(0, 0, R, C);
    const cao = 12;
    const cuon = (t * 7) % (s.dong.length * cao);
    for (let i = 0; i < 13; i++) {
      const so = Math.floor(cuon / cao) + i;
      const d = s.dong[so % s.dong.length];
      const y = 6 + i * cao - (cuon % cao);
      if (so % 5 === 0) {
        g.fillStyle = '#d97757';
        g.fillRect(6, y + 2, 8, 6);
        g.fillStyle = '#e8e8e8';
        g.fillRect(18, y + 2, 40 + d.manh[0].dai * 2, 6);
      } else {
        g.fillStyle = so % 7 === 3 ? '#98c379' : '#7f8794';
        g.fillRect(6, y + 2, 20 + (d.manh[0].dai + (d.manh[1]?.dai || 0)) * 2.2, 5);
      }
    }
    if (Math.floor(t * 2) % 2 === 0) {
      g.fillStyle = '#e8e8e8';
      g.fillRect(6, C - 14, 7, 9);
    }
  },
  doc(g, t) {
    g.fillStyle = '#e9ecef';
    g.fillRect(0, 0, R, C);
    g.fillStyle = '#ffffff';
    g.fillRect(40, 0, 176, C);
    const cuon = (t * 6) % 200;
    for (let i = 0; i < 20; i++) {
      const y = 10 + i * 10 - (cuon % 10);
      const n = Math.floor(cuon / 10) + i;
      if (n % 9 === 0) {
        g.fillStyle = '#343a40';
        g.fillRect(52, y, 90, 6);
      } else {
        g.fillStyle = '#adb5bd';
        g.fillRect(52, y + 1, 150 - ((n * 37) % 50), 4);
      }
    }
    g.fillStyle = 'rgba(255, 214, 102, 0.45)';
    g.fillRect(48, 60 + Math.sin(t * 0.8) * 30, 160, 9);
  },
  web(g, t) {
    g.fillStyle = '#f8f9fa';
    g.fillRect(0, 0, R, C);
    g.fillStyle = '#dee2e6';
    g.fillRect(0, 0, R, 16);
    for (const [x, m] of [[6, '#ff6058'], [16, '#ffbd2e'], [26, '#28c940']]) {
      g.fillStyle = m;
      g.beginPath();
      g.arc(x, 8, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.fillRect(40, 4, 170, 8);
    const cuon = (t * 10) % 120;
    g.save();
    g.beginPath();
    g.rect(0, 17, R, C - 17);
    g.clip();
    const y0 = 22 - cuon;
    for (let k = 0; k < 3; k++) {
      const y = y0 + k * 120;
      g.fillStyle = '#d97757';
      g.fillRect(14, y, 228, 34);
      g.fillStyle = '#ffffff';
      g.fillRect(24, y + 10, 100, 8);
      for (let i = 0; i < 3; i++) {
        g.fillStyle = ['#a5d8ff', '#b2f2bb', '#ffd8a8'][i];
        g.fillRect(14 + i * 78, y + 42, 70, 40);
        g.fillStyle = '#ced4da';
        g.fillRect(14 + i * 78, y + 86, 60, 4);
        g.fillRect(14 + i * 78, y + 94, 44, 4);
      }
    }
    g.restore();
  },
  nghi(g, t) {
    g.fillStyle = '#1c1917';
    g.fillRect(0, 0, R, C);
    g.save();
    g.translate(R / 2, C / 2 - 10);
    g.rotate(t * 1.6);
    g.fillStyle = '#d97757';
    for (let i = 0; i < 8; i++) {
      g.rotate(Math.PI / 4);
      g.beginPath();
      g.ellipse(0, -18, 4, 14, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.fillStyle = '#e7d9cf';
    g.font = '600 15px -apple-system, Helvetica, Arial';
    g.textAlign = 'center';
    g.fillText('Đang nghĩ' + '.'.repeat(1 + (Math.floor(t * 2) % 3)), R / 2, C - 26);
  },
  troLy(g, t) {
    g.fillStyle = '#1b1e23';
    g.fillRect(0, 0, R, C);
    for (let i = 0; i < 3; i++) {
      const x = 8 + i * 83;
      g.fillStyle = '#262a31';
      g.fillRect(x, 10, 75, C - 20);
      g.fillStyle = ['#61afef', '#98c379', '#c678dd'][i];
      g.beginPath();
      g.arc(x + 37, 38, 14, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#4b5263';
      g.fillRect(x + 8, 66, 59, 6);
      g.fillStyle = ['#61afef', '#98c379', '#c678dd'][i];
      g.fillRect(x + 8, 66, 59 * ((t * 0.13 + i * 0.31) % 1), 6);
      for (let k = 0; k < 5; k++) {
        g.fillStyle = '#5c6370';
        g.fillRect(x + 8, 84 + k * 11, 30 + ((k * 23 + i * 17) % 30), 4);
      }
    }
  },
  cho(g, t) {
    g.fillStyle = '#23201b';
    g.fillRect(0, 0, R, C);
    const nhay = 0.6 + 0.4 * Math.sin(t * 4);
    g.strokeStyle = `rgba(240, 180, 67, ${nhay})`;
    g.lineWidth = 4;
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.roundRect(28, 22, 200, 116, 10);
    g.fill();
    g.stroke();
    g.fillStyle = '#c9820f';
    g.font = '700 30px -apple-system, Helvetica, Arial';
    g.textAlign = 'center';
    g.fillText('?', R / 2, 62);
    g.fillStyle = '#3b2a12';
    g.font = '600 15px -apple-system, Helvetica, Arial';
    g.fillText('Đang chờ duyệt', R / 2, 88);
    g.fillStyle = '#2f9e6b';
    g.beginPath();
    g.roundRect(48, 104, 70, 22, 6);
    g.fill();
    g.fillStyle = '#d0c7bb';
    g.beginPath();
    g.roundRect(138, 104, 70, 22, 6);
    g.fill();
  },
  loi(g, t) {
    const nhay = Math.random() < 0.08 ? 0.6 : 1;
    g.fillStyle = `rgba(178, 34, 34, ${nhay})`;
    g.fillRect(0, 0, R, C);
    g.fillStyle = '#ffffff';
    g.font = '800 44px -apple-system, Helvetica, Arial';
    g.textAlign = 'center';
    g.fillText('⚠', R / 2, 78);
    g.font = '700 16px -apple-system, Helvetica, Arial';
    g.fillText('Có lỗi', R / 2, 112);
    if (Math.floor(t * 3) % 2) {
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(0, (t * 80) % C, R, 3);
    }
  },
  ngu(g, t) {
    g.fillStyle = '#0b1020';
    g.fillRect(0, 0, R, C);
    for (let i = 0; i < 24; i++) {
      const x = (i * 97 + t * (6 + (i % 5) * 3)) % R;
      const y = (i * 53) % C;
      g.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * Math.abs(Math.sin(t + i))})`;
      g.fillRect(x, y, 2, 2);
    }
    g.fillStyle = '#c3cbe6';
    g.font = '600 20px -apple-system, Helvetica, Arial';
    g.textAlign = 'center';
    g.fillText('z Z z', R / 2 + Math.sin(t) * 20, C / 2 + 6);
  },
  sep(g, t, s) {
    g.fillStyle = '#f5f1ea';
    g.fillRect(0, 0, R, C);
    g.fillStyle = '#2b2420';
    g.font = '700 14px -apple-system, Helvetica, Arial';
    g.textAlign = 'left';
    g.fillText('Hồ sơ chờ duyệt', 12, 22);
    const n = s.soCho || 0;
    for (let i = 0; i < 6; i++) {
      const y = 34 + i * 20;
      g.fillStyle = i < n ? '#fff1d6' : '#ebe5dc';
      g.fillRect(10, y, 236, 16);
      if (i < n) {
        g.fillStyle = '#c9820f';
        g.fillRect(14, y + 4, 8, 8);
        g.fillStyle = '#6f645b';
        g.fillRect(28, y + 5, 120 + ((i * 41) % 80), 5);
      }
    }
  },
};

export class ManHinh {
  constructor() {
    this.kieu = {};
    this.trangThaiSep = { soCho: 0, dong: [] };
    for (const ten of Object.keys(VE)) {
      const cv = document.createElement('canvas');
      cv.width = R;
      cv.height = C;
      const g = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const vl = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      const s = ten === 'sep' ? this.trangThaiSep : { dong: taoDongMa(48, ten.length * 7919 + 13) };
      this.kieu[ten] = { cv, g, tex, vl, s, dong: ten !== 'tat' };
      VE[ten](g, 0, s);
      tex.needsUpdate = true;
    }
    this.lanVe = 0;
  }

  vatLieu(ten) {
    return (this.kieu[ten] || this.kieu.tat).vl;
  }

  // Chỉ vẽ lại kiểu đang có người dùng, tối đa ~10 lần mỗi giây.
  capNhat(t, dangDung) {
    if (t - this.lanVe < 0.1) return;
    this.lanVe = t;
    for (const [ten, k] of Object.entries(this.kieu)) {
      if (!k.dong || (dangDung && !dangDung.has(ten))) continue;
      VE[ten](k.g, t, k.s);
      k.tex.needsUpdate = true;
    }
  }
}
