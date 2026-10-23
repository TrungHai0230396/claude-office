// Lưới đi lại trên sàn văn phòng: chia sàn thành ô vuông, đánh dấu ô vướng (tường, bàn, đồ đạc),
// tìm đường bằng A* rồi nắn thẳng những đoạn nhìn thấy nhau để người đi cho tự nhiên.
// Không dùng three.js, chạy được cả trong Node để kiểm.

export class LuoiDi {
  constructor(xMin, zMin, xMax, zMax, o = 0.5) {
    this.xMin = xMin;
    this.zMin = zMin;
    this.o = o;
    this.cot = Math.ceil((xMax - xMin) / o);
    this.hang = Math.ceil((zMax - zMin) / o);
    this.vuong = new Uint8Array(this.cot * this.hang);
  }

  xoa() {
    this.vuong.fill(0);
  }

  oCua(x, z) {
    return [Math.floor((x - this.xMin) / this.o), Math.floor((z - this.zMin) / this.o)];
  }

  tam(c, h) {
    return [this.xMin + (c + 0.5) * this.o, this.zMin + (h + 0.5) * this.o];
  }

  trong(c, h) {
    return c >= 0 && h >= 0 && c < this.cot && h < this.hang;
  }

  diDuoc(c, h) {
    return this.trong(c, h) && this.vuong[h * this.cot + c] === 0;
  }

  diDuocXZ(x, z) {
    const [c, h] = this.oCua(x, z);
    return this.diDuoc(c, h);
  }

  // Đánh dấu (hoặc mở lại) mọi ô có tâm nằm trong hình chữ nhật, nới thêm "le" mét cho bề ngang
  // thân người. "huong" là góc của cạnh dài trên mặt sàn, tính từ trục +x quay sang +z.
  _to(x, z, nuaRong, nuaSau, huong, le, giaTri) {
    const r = nuaRong + le;
    const s = nuaSau + le;
    const cos = Math.cos(huong);
    const sin = Math.sin(huong);
    const banKinh = Math.hypot(r, s);
    const [c0, h0] = this.oCua(x - banKinh, z - banKinh);
    const [c1, h1] = this.oCua(x + banKinh, z + banKinh);
    for (let h = Math.max(0, h0); h <= Math.min(this.hang - 1, h1); h++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cot - 1, c1); c++) {
        const [tx, tz] = this.tam(c, h);
        const dx = tx - x;
        const dz = tz - z;
        // Chiếu lên hai cạnh của hình.
        const u = dx * cos + dz * sin;
        const v = -dx * sin + dz * cos;
        if (Math.abs(u) <= r && Math.abs(v) <= s) this.vuong[h * this.cot + c] = giaTri;
      }
    }
  }

  // Chặn một món đồ đặt như trong three.js: quay "yaw" quanh trục đứng (rotation.y).
  chan(x, z, nuaRong, nuaSau, yaw = 0, le = 0.22) {
    this._to(x, z, nuaRong, nuaSau, -yaw, le, 1);
  }

  mo(x, z, nuaRong, nuaSau) {
    this._to(x, z, nuaRong, nuaSau, 0, 0, 0);
  }

  // Tường là một đoạn thẳng có bề dày.
  chanDoan(x1, z1, x2, z2, day = 0.2, le = 0.22) {
    const dai = Math.hypot(x2 - x1, z2 - z1);
    const goc = Math.atan2(z2 - z1, x2 - x1);
    this._to((x1 + x2) / 2, (z1 + z2) / 2, dai / 2, day / 2, goc, le, 1);
  }

  // Ô đi được gần nhất (tìm loang), dùng khi điểm đầu hay điểm cuối nằm sát đồ đạc.
  oGanNhat(c, h, banKinhToiDa = 12) {
    if (this.diDuoc(c, h)) return [c, h];
    for (let r = 1; r <= banKinhToiDa; r++) {
      let tot = null;
      let totKc = Infinity;
      for (let dh = -r; dh <= r; dh++) {
        for (let dc = -r; dc <= r; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dh)) !== r) continue;
          if (!this.diDuoc(c + dc, h + dh)) continue;
          const kc = dc * dc + dh * dh;
          if (kc < totKc) {
            totKc = kc;
            tot = [c + dc, h + dh];
          }
        }
      }
      if (tot) return tot;
    }
    return null;
  }

  // Đoạn thẳng giữa hai điểm có đi qua ô vướng nào không (lấy mẫu dày hơn cỡ ô).
  nhinThay(x1, z1, x2, z2) {
    const dai = Math.hypot(x2 - x1, z2 - z1);
    const buoc = Math.max(1, Math.ceil(dai / (this.o * 0.35)));
    for (let i = 0; i <= buoc; i++) {
      const t = i / buoc;
      if (!this.diDuocXZ(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t)) return false;
    }
    return true;
  }

  // Trả về các điểm [x, z] nối từ (x1, z1) tới đúng (x2, z2), không gồm điểm đầu.
  // null nếu không có đường.
  timDuong(x1, z1, x2, z2) {
    const dau = this.oGanNhat(...this.oCua(x1, z1));
    const cuoi = this.oGanNhat(...this.oCua(x2, z2));
    if (!dau || !cuoi) return null;
    const n = this.cot * this.hang;
    const iDau = dau[1] * this.cot + dau[0];
    const iCuoi = cuoi[1] * this.cot + cuoi[0];
    if (iDau === iCuoi) return [[x2, z2]];

    const g = new Float32Array(n).fill(Infinity);
    const truoc = new Int32Array(n).fill(-1);
    const dong = new Uint8Array(n);
    const dong2 = new HeapNho();
    const cc = cuoi[0];
    const hc = cuoi[1];
    const uocLuong = (c, h) => {
      const dx = Math.abs(c - cc);
      const dz = Math.abs(h - hc);
      return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
    };
    g[iDau] = 0;
    dong2.them(iDau, uocLuong(dau[0], dau[1]));
    const KE = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];
    let thay = false;
    while (dong2.co()) {
      const i = dong2.lay();
      if (dong[i]) continue;
      dong[i] = 1;
      if (i === iCuoi) {
        thay = true;
        break;
      }
      const c = i % this.cot;
      const h = (i - c) / this.cot;
      for (const [dc, dh, gia] of KE) {
        const c2 = c + dc;
        const h2 = h + dh;
        if (!this.diDuoc(c2, h2)) continue;
        // Đi chéo chỉ khi hai ô cạnh đều trống, khỏi cắt góc bàn.
        if (dc !== 0 && dh !== 0 && (!this.diDuoc(c + dc, h) || !this.diDuoc(c, h + dh))) continue;
        const j = h2 * this.cot + c2;
        if (dong[j]) continue;
        const gMoi = g[i] + gia;
        if (gMoi < g[j]) {
          g[j] = gMoi;
          truoc[j] = i;
          dong2.them(j, gMoi + uocLuong(c2, h2));
        }
      }
    }
    if (!thay) return null;

    const o = [];
    for (let i = iCuoi; i !== -1; i = truoc[i]) {
      const c = i % this.cot;
      o.push(this.tam(c, (i - c) / this.cot));
    }
    o.reverse();
    o[0] = [x1, z1];
    o[o.length - 1] = [x2, z2];
    // Nắn thẳng: từ mỗi điểm nhảy tới điểm xa nhất còn nhìn thấy.
    const gon = [];
    let k = 0;
    while (k < o.length - 1) {
      let xa = k + 1;
      for (let m = o.length - 1; m > k + 1; m--) {
        if (this.nhinThay(o[k][0], o[k][1], o[m][0], o[m][1])) {
          xa = m;
          break;
        }
      }
      gon.push(o[xa]);
      k = xa;
    }
    return gon;
  }
}

// Hàng đợi ưu tiên (đống nhị phân) theo điểm số nhỏ nhất.
class HeapNho {
  constructor() {
    this.id = [];
    this.diem = [];
  }
  co() {
    return this.id.length > 0;
  }
  them(id, diem) {
    const a = this.id;
    const d = this.diem;
    a.push(id);
    d.push(diem);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (d[p] <= d[i]) break;
      [a[p], a[i]] = [a[i], a[p]];
      [d[p], d[i]] = [d[i], d[p]];
      i = p;
    }
  }
  lay() {
    const a = this.id;
    const d = this.diem;
    const dau = a[0];
    const cuoiId = a.pop();
    const cuoiDiem = d.pop();
    if (a.length) {
      a[0] = cuoiId;
      d[0] = cuoiDiem;
      let i = 0;
      for (;;) {
        const t = 2 * i + 1;
        const p = t + 1;
        let nho = i;
        if (t < a.length && d[t] < d[nho]) nho = t;
        if (p < a.length && d[p] < d[nho]) nho = p;
        if (nho === i) break;
        [a[nho], a[i]] = [a[i], a[nho]];
        [d[nho], d[i]] = [d[i], d[nho]];
        i = nho;
      }
    }
    return dau;
  }
}
