// Claude Office chạy trên máy (npm start): phục vụ trang 3D trong public/ và trạng thái các phiên
// Claude của app Claude trên máy này. Chỉ nghe 127.0.0.1, chỉ đọc tệp, không gửi gì ra ngoài.
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TheoDoiPhien } from './lib/theo-doi.js';

const GOC = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(GOC, 'public');
const CONG = Number(process.env.PORT) || 5230;
const MAY = '127.0.0.1';
const KIEU = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

const theoDoi = new TheoDoiPhien();
const nguoiNghe = new Set();

async function guiTep(res, tep) {
  try {
    const st = await fsp.stat(tep);
    if (!st.isFile()) return false;
    res.writeHead(200, { 'Content-Type': KIEU[path.extname(tep).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await fsp.readFile(tep));
    return true;
  } catch {
    return false;
  }
}

// Chỉ trả lời yêu cầu từ chính máy này (Host đúng localhost), tránh trang lạ đọc trộm qua DNS rebinding.
function hopLe(req) {
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
}

const mayChu = http.createServer(async (req, res) => {
  if (!hopLe(req)) {
    res.writeHead(403).end('Chỉ mở từ chính máy này.');
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/api/trang-thai') {
    res.writeHead(200, { 'Content-Type': KIEU['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(await theoDoi.anh()));
    return;
  }
  if (url.pathname === '/api/su-kien') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n');
    const nghe = { res };
    nguoiNghe.add(nghe);
    req.on('close', () => nguoiNghe.delete(nghe));
    res.write(`event: trang-thai\ndata: ${JSON.stringify(await theoDoi.anh())}\n\n`);
    return;
  }
  let tep = path.normalize(path.join(WEB, decodeURIComponent(url.pathname)));
  if (!tep.startsWith(WEB)) {
    res.writeHead(400).end();
    return;
  }
  if (url.pathname.endsWith('/')) tep = path.join(tep, 'index.html');
  if (!(await guiTep(res, tep))) res.writeHead(404, { 'Content-Type': KIEU['.txt'] }).end('Không có trang này.');
});

// Đổi gì thì đẩy ngay cho mọi trang đang mở; 20 giây không đổi thì gửi nhịp giữ kết nối.
theoDoi.khiDoi((anh) => {
  const goi = `event: trang-thai\ndata: ${JSON.stringify(anh)}\n\n`;
  for (const { res } of nguoiNghe) res.write(goi);
});
setInterval(() => {
  for (const { res } of nguoiNghe) res.write(': giu\n\n');
}, 20e3).unref();

theoDoi.batDau();
mayChu.listen(CONG, MAY, () => {
  console.log(`Claude Office: http://${MAY}:${CONG}`);
});
