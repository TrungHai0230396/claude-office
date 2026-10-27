// Claude Office chạy trên máy (npm start): phục vụ trang 3D trong public/ và trạng thái các phiên
// Claude trên máy này. Chỉ nghe 127.0.0.1. Phiên của app Claude chỉ đọc; phiên do văn phòng tự chạy
// (Claude Agent SDK, bằng đăng nhập Claude Code của bạn) thì điều khiển được, nhưng chỉ nhận lệnh từ
// chính trang văn phòng (lib/bao-ve.js).
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TheoDoiPhien } from './lib/theo-doi.js';
import { QuanLyPhienVP } from './lib/phien-vp.js';
import { LayMucDung } from './lib/lay-muc-dung.js';
import { TuXa } from './lib/tu-xa.js';
import { taoKhoa, kiemLenh, LoiNguoiDung } from './lib/bao-ve.js';

const GOC = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(GOC, 'public');
const CONG = Number(process.env.PORT) || 5230;
const MAY = '127.0.0.1';
const THAN_TOI_DA = 256 * 1024;
const KIEU = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
// Không cho trang khác nhúng văn phòng vào khung (chống lừa bấm "Cho phép"), không lộ địa chỉ khi bấm link.
const DAU_AN_TOAN = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// Mã bí mật của lần chạy này: chỉ nằm trong trang văn phòng, mọi lệnh điều khiển phải kèm.
// VPC_DIEU_KHIEN=0 tắt hẳn phần giao việc (máy dùng chung nhiều tài khoản: ai trên máy cũng mở được 127.0.0.1).
const DIEU_KHIEN = process.env.VPC_DIEU_KHIEN !== '0';
const KHOA = taoKhoa();
// Mã của lần chạy (không phải mã bí mật): trang thấy mã này đổi là biết máy chủ vừa khởi động lại.
const LAN_CHAY = taoKhoa().slice(0, 12);
let theoDoi = null;
const quanLy = DIEU_KHIEN ? new QuanLyPhienVP({ khiDoi: () => theoDoi?.phat() }) : null;
const nguoiNghe = new Set();
// Mở trên điện thoại qua Tailscale (tailscale serve → 127.0.0.1): chỉ nhận đúng tài khoản chủ máy.
const tuXa = new TuXa();
// Mức dùng gói lấy thẳng từ Claude Code (/usage), chỉ khi có trang đang mở. Chế độ chỉ xem thì không chạy
// Claude Code, chỉ đọc tệp app Claude ghi.
const layMucDung = DIEU_KHIEN ? new LayMucDung({ coNguoiXem: () => nguoiNghe.size > 0, khiDoi: () => theoDoi?.phat() }) : null;
theoDoi = new TheoDoiPhien({ phienVP: quanLy, layMucDung });

function guiJson(res, ma, du) {
  res.writeHead(ma, { ...DAU_AN_TOAN, 'Content-Type': KIEU['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(du));
}

async function guiTep(res, tep) {
  try {
    const st = await fsp.stat(tep);
    if (!st.isFile()) return false;
    let du = await fsp.readFile(tep);
    const kieu = KIEU[path.extname(tep).toLowerCase()] || 'application/octet-stream';
    if (DIEU_KHIEN && tep === path.join(WEB, 'index.html')) du = du.toString('utf8').replace('</head>', `  <meta name="vpc-khoa" content="${KHOA}">\n</head>`);
    res.writeHead(200, { ...DAU_AN_TOAN, 'Content-Type': kieu, 'Cache-Control': kieu.startsWith('text/html') ? 'no-store' : 'no-cache' });
    res.end(du);
    return true;
  } catch {
    return false;
  }
}

function docThan(req) {
  return new Promise((xong, hong) => {
    let n = 0;
    const ds = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > THAN_TOI_DA) {
        hong(new LoiNguoiDung('Thân lệnh lớn quá', 413));
        req.destroy();
      } else ds.push(c);
    });
    req.on('end', () => {
      try {
        const chu = Buffer.concat(ds).toString('utf8');
        const du = chu ? JSON.parse(chu) : {};
        if (!du || typeof du !== 'object' || Array.isArray(du)) throw new Error();
        xong(du);
      } catch {
        hong(new LoiNguoiDung('Thân lệnh không phải JSON hợp lệ'));
      }
    });
    req.on('error', hong);
  });
}

// Danh sách dự án cho ô chọn khi giao việc: các dự án có phiên gần đây, cộng mọi thư mục nằm cạnh chúng
// (vd. cả ~/Documents/Project) để chọn được dự án chưa từng mở bằng Claude. Kèm đường dẫn đầy đủ để mở
// phiên mới trong app Claude desktop bằng link claude://code/new.
const NHA = os.homedir();
const rutNha = (p) => (p.startsWith(NHA + '/') ? '~' + p.slice(NHA.length) : p);
const dayDu = (p) => (p.startsWith('~/') ? path.join(NHA, p.slice(2)) : p);
async function dsThuMuc() {
  const anh = await theoDoi.anh();
  const ganDay = new Map();
  for (const p of anh.phien || []) {
    const duong = String(p.thuMuc || '').replace(/\/\.claude\/worktrees\/.*$/, '');
    if (!duong || duong === '~') continue;
    const cu = ganDay.get(duong);
    if (!cu || (p.hoatDongCuoi || 0) > cu.lanCuoi) ganDay.set(duong, { duong, tuyetDoi: dayDu(duong), ten: path.basename(duong), lanCuoi: p.hoatDongCuoi || 0, ganDay: true });
  }
  const ds = [...ganDay.values()].sort((a, b) => b.lanCuoi - a.lanCuoi).slice(0, 15);
  // Thư mục cha của các dự án gần đây (trong thư mục nhà, không phải chính thư mục nhà).
  const cha = [...new Set([...ganDay.values()].map((t) => path.dirname(t.tuyetDoi)))].filter((d) => d.startsWith(NHA + '/')).slice(0, 6);
  const them = [];
  for (const d of cha) {
    let con = [];
    try {
      con = await fsp.readdir(d, { withFileTypes: true });
    } catch {
      continue; // macOS chưa cho vào (Documents…) hay thư mục đã mất: bỏ qua
    }
    for (const c of con) {
      if (!c.isDirectory() || c.name.startsWith('.') || c.name === 'node_modules') continue;
      const tuyetDoi = path.join(d, c.name);
      const duong = rutNha(tuyetDoi);
      if (ganDay.has(duong)) continue;
      them.push({ duong, tuyetDoi, ten: c.name, lanCuoi: 0, ganDay: false });
    }
  }
  them.sort((a, b) => a.ten.localeCompare(b.ten, 'vi'));
  return [...ds, ...them.slice(0, 300)];
}

// Lệnh điều khiển phiên văn phòng: /api/vp/...
async function lenhVP(req, res, url, truyCap) {
  if (!quanLy) return guiJson(res, 403, { loi: 'Phần giao việc đang tắt (VPC_DIEU_KHIEN=0).' });
  const doc = req.method === 'GET';
  const tuChoi = kiemLenh({ method: req.method, headers: req.headers, cong: CONG, khoa: KHOA, ghi: !doc, truyCap, nguonThem: tuXa.nguonThem() });
  if (tuChoi) return guiJson(res, 403, { loi: tuChoi });
  const phan = url.pathname.split('/').filter(Boolean); // ['api','vp',...]
  try {
    if (doc && phan[2] === 'phien' && phan[4] === 'hoi-thoai' && phan.length === 5) {
      const tu = Math.max(0, Number(url.searchParams.get('tu')) || 0);
      return guiJson(res, 200, quanLy.hoiThoai(phan[3], tu));
    }
    if (!doc && phan[2] === 'phien') {
      const than = await docThan(req);
      if (phan.length === 3) {
        const id = await quanLy.tao({ cwd: than.thuMuc, loiNhan: than.loiNhan, cheDo: than.cheDo });
        return guiJson(res, 200, { ok: true, id });
      }
      const id = phan[3];
      if (phan.length === 5 && phan[4] === 'gui') await quanLy.gui(id, than.loiNhan);
      else if (phan.length === 5 && phan[4] === 'tra-loi') quanLy.traLoi(id, than);
      else if (phan.length === 5 && phan[4] === 'dung') await quanLy.dung(id);
      else if (phan.length === 5 && phan[4] === 'che-do') await quanLy.doiCheDo(id, than.cheDo);
      else if (phan.length === 5 && phan[4] === 'dong') quanLy.dong(id, than.xoa === true);
      else return guiJson(res, 404, { loi: 'Không có lệnh này' });
      return guiJson(res, 200, { ok: true });
    }
    return guiJson(res, 404, { loi: 'Không có lệnh này' });
  } catch (e) {
    if (e instanceof LoiNguoiDung) return guiJson(res, e.ma || 400, { loi: e.message, ...(e.quyen ? { quyen: true } : {}) });
    console.error('Lỗi lệnh văn phòng:', e);
    return guiJson(res, 500, { loi: 'Máy chủ gặp lỗi: ' + (e?.message || e) });
  }
}

const mayChu = http.createServer(async (req, res) => {
  // Chỉ trả lời yêu cầu gửi tới chính máy này (Host đúng localhost), chặn trang lạ dùng DNS rebinding.
  // Thêm: qua Tailscale thì phải đúng tài khoản chủ máy (lib/tu-xa.js).
  const truyCap = tuXa.kiem(req.headers);
  if (!truyCap.hopLe) {
    res.writeHead(403, { 'Content-Type': KIEU['.txt'] }).end(truyCap.lyDo || 'Chỉ mở từ chính máy này.');
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/vp/')) return lenhVP(req, res, url, truyCap);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, DAU_AN_TOAN).end();
    return;
  }
  if (url.pathname === '/api/trang-thai') return guiJson(res, 200, { ...(await theoDoi.anh()), lanChay: LAN_CHAY });
  if (url.pathname === '/api/thu-muc') return guiJson(res, 200, { ds: await dsThuMuc(), nha: NHA });
  if (url.pathname === '/api/su-kien') {
    res.writeHead(200, { ...DAU_AN_TOAN, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    const nghe = { res };
    nguoiNghe.add(nghe);
    req.on('close', () => nguoiNghe.delete(nghe));
    layMucDung?.nhacLay();
    res.write(`event: trang-thai\ndata: ${JSON.stringify({ ...(await theoDoi.anh()), lanChay: LAN_CHAY })}\n\n`);
    return;
  }
  let tep;
  try {
    tep = path.normalize(path.join(WEB, decodeURIComponent(url.pathname)));
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (tep !== WEB && !tep.startsWith(WEB + path.sep)) {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname.endsWith('/')) tep = path.join(tep, 'index.html');
  if (!(await guiTep(res, tep))) res.writeHead(404, { ...DAU_AN_TOAN, 'Content-Type': KIEU['.txt'] }).end('Không có trang này.');
});

// Đổi gì thì đẩy ngay cho mọi trang đang mở; 20 giây không đổi thì gửi nhịp giữ kết nối.
theoDoi.khiDoi((anh) => {
  const goi = `event: trang-thai\ndata: ${JSON.stringify({ ...anh, lanChay: LAN_CHAY })}\n\n`;
  for (const { res } of nguoiNghe) res.write(goi);
});
setInterval(() => {
  for (const { res } of nguoiNghe) res.write(': giu\n\n');
}, 20e3).unref();

// Tắt máy chủ thì đóng các phiên văn phòng cho gọn; nhắn tiếp sau đó là phiên chạy lại từ chỗ cũ.
for (const tin of ['SIGTERM', 'SIGINT']) {
  process.on(tin, () => {
    quanLy?.tatHet();
    // Đóng gọn kênh cập nhật để trình duyệt nối lại êm (khỏi báo lỗi kết nối bị cắt ngang).
    for (const { res } of nguoiNghe) res.end();
    mayChu.close();
    setTimeout(() => process.exit(0), 300).unref();
  });
}

mayChu.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(
      `Cổng ${CONG} đang bận — có thể máy chủ chạy nền (npm run cai-tu-chay) đang chạy rồi: mở http://${MAY}:${CONG}.\n` +
        'Muốn chạy từ Terminal thay cho bản nền: npm run go-tu-chay rồi npm start (hoặc PORT=5231 npm start).',
    );
    process.exit(1);
  }
  throw e;
});

await quanLy?.napLai();
theoDoi.batDau();
layMucDung?.batDau();
tuXa.batDau();
mayChu.listen(CONG, MAY, () => {
  console.log(`Claude Office: http://${MAY}:${CONG}`);
});
