// Mở văn phòng trên điện thoại qua Tailscale (mạng riêng, mã hoá, chỉ máy của bạn): lệnh `tailscale serve`
// chuyển https://<máy>.<mạng>.ts.net về 127.0.0.1:5230 trên máy này. Máy chủ vẫn chỉ nghe 127.0.0.1.
// Yêu cầu đi qua tailscale serve chỉ được nhận khi Tailscale báo người truy cập (đầu Tailscale-User-Login do
// tailscale serve tự gắn, không giả được từ máy khác) đúng là tài khoản chủ máy này: mạng Tailscale có thêm
// máy của người khác thì họ cũng không mở được văn phòng. Không bao giờ dùng `tailscale funnel` (mở ra Internet).
import { execFile } from 'node:child_process';

const CLI = ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale'];
const MAY_NAY = new Set(['127.0.0.1', 'localhost', '[::1]']);

// Từ kết quả `tailscale status --json`: tên máy này trong mạng Tailscale và tài khoản chủ máy.
export function docTrangThaiTs(du) {
  if (!du || du.BackendState !== 'Running' || !du.Self) return null;
  const host = String(du.Self.DNSName || '')
    .replace(/\.$/, '')
    .toLowerCase();
  const login = String(du.User?.[du.Self.UserID]?.LoginName || '').toLowerCase();
  if (!host.endsWith('.ts.net') || !login) return null;
  return { host, login };
}

function tenHost(h) {
  return String(h || '')
    .replace(/:\d+$/, '')
    .toLowerCase();
}

// Một yêu cầu tới máy chủ có được nhận không. ts: { host, login } của máy này, hoặc null (chưa có Tailscale).
// Trả về { hopLe, tuXa, lyDo }.
export function kiemTruyCap(headers = {}, ts = null) {
  const host = tenHost(headers.host);
  const ai = String(headers['tailscale-user-login'] || '').toLowerCase();
  // Qua tailscale serve thì có X-Forwarded-For (và đầu danh tính); trình duyệt trên chính máy này thì không.
  const quaProxy = !!headers['x-forwarded-for'] || !!ai;
  if (!quaProxy && MAY_NAY.has(host)) return { hopLe: true, tuXa: false };
  if (!ts) return { hopLe: false, lyDo: quaProxy ? 'Chưa nhận ra Tailscale trên máy này' : 'Host không phải máy này' };
  if (host !== ts.host && !(quaProxy && MAY_NAY.has(host))) return { hopLe: false, lyDo: 'Host không phải máy này' };
  if (!ai || ai !== ts.login) return { hopLe: false, lyDo: 'Tài khoản Tailscale này không phải chủ máy' };
  return { hopLe: true, tuXa: true };
}

// Lệnh Tailscale có thể treo khi Tailscale chưa đăng nhập: quá giờ thì giết hẳn (SIGKILL), không để dồn lại.
function chayJson(duong, thamSo) {
  return new Promise((xong) => {
    execFile(duong, thamSo, { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 4 * 1024 * 1024 }, (loi, out) => {
      if (loi) return xong(null);
      try {
        xong(JSON.parse(out));
      } catch {
        xong(null);
      }
    });
  });
}

// Hỏi macOS (scutil, công cụ của hệ thống) xem VPN Tailscale đã nối chưa, không đụng tới app Tailscale.
function vpnDaNoi() {
  return new Promise((xong) => {
    execFile('/usr/sbin/scutil', ['--nc', 'status', 'Tailscale'], { timeout: 3000, killSignal: 'SIGKILL' }, (loi, out) => {
      xong(!loi && /^Connected\b/.test(String(out || '').trim()));
    });
  });
}

// Theo dõi Tailscale trên máy (bật sau máy chủ cũng nhận ra trong vòng một phút). Chỉ gọi lệnh Tailscale khi
// VPN đã nối, mỗi lúc một lệnh.
export class TuXa {
  constructor({ chay = chayJson, daNoi = vpnDaNoi } = {}) {
    this.chay = chay;
    this.daNoi = daNoi;
    this.ts = null;
    this.dangDo = false;
  }

  async lamMoi() {
    if (this.dangDo) return this.ts;
    this.dangDo = true;
    try {
      if (!(await this.daNoi())) {
        this.ts = null;
        return null;
      }
      for (const duong of CLI) {
        const du = await this.chay(duong, ['status', '--json']);
        if (du) {
          this.ts = docTrangThaiTs(du);
          return this.ts;
        }
      }
      this.ts = null;
      return null;
    } finally {
      this.dangDo = false;
    }
  }

  batDau() {
    this.lamMoi();
    setInterval(() => this.lamMoi(), 60e3).unref();
  }

  kiem(headers) {
    return kiemTruyCap(headers, this.ts);
  }

  // Origin hợp lệ thêm cho lệnh gửi từ điện thoại.
  nguonThem() {
    return this.ts ? [`https://${this.ts.host}`] : [];
  }
}
