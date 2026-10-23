// Theo dõi các phiên Claude trên máy: mỗi giây đọc lại những tệp vừa đổi, suy ra trạng thái từng
// phiên, báo cho máy chủ khi ảnh chụp trạng thái khác lần trước.
import os from 'node:os';
import path from 'node:path';
import { dsTepPhien, docMeta, timNhatKy, docNhatKy, demTroLy, dsTienTrinh, docSoTrangThai, soConSong } from './doc-phien.js';
import { suyTrangThai, rutGon } from './trang-thai.js';
import { docLichSu, tinhMucDung } from './muc-dung.js';

const NHA = os.homedir();

function rutNha(p) {
  if (!p) return '';
  return p.startsWith(NHA) ? '~' + p.slice(NHA.length) : p;
}

// Dự án = thư mục làm việc (bỏ phần worktree của Claude nếu có).
export function tenDuAn(cwd) {
  const goc = String(cwd || '').replace(/\/\.claude\/worktrees\/.*$/, '');
  return path.basename(goc) || 'khác';
}

export class TheoDoiPhien {
  constructor({ chuKy = 1000 } = {}) {
    this.chuKy = chuKy;
    this.ngheDoi = [];
    this.anhCuoi = null;
    this.khoa = '';
    this.truoc = new Map();
    this.tt = null;
    this.lucPs = 0;
  }

  khiDoi(f) {
    this.ngheDoi.push(f);
  }

  batDau() {
    const chay = async () => {
      try {
        await this.quet();
      } catch (e) {
        console.error('Lỗi khi đọc phiên:', e);
      }
      this.hen = setTimeout(chay, this.chuKy);
    };
    chay();
  }

  dung() {
    clearTimeout(this.hen);
  }

  async anh() {
    if (!this.anhCuoi) await this.quet();
    return { ...this.anhCuoi, bayGio: Date.now() };
  }

  async quet() {
    const bayGio = Date.now();
    if (!this.tt || bayGio - this.lucPs > 2000) {
      this.tt = await dsTienTrinh();
      this.lucPs = bayGio;
    }
    const dsSo = (await docSoTrangThai()).filter((so) => soConSong(so, this.tt));
    const soTheoPhien = new Map();
    const soLe = [];
    for (const so of dsSo) {
      if (!so.hostSessionId) {
        soLe.push(so);
        continue;
      }
      const cu = soTheoPhien.get(so.hostSessionId);
      if (!cu || (so.statusUpdatedAt || 0) > (cu.statusUpdatedAt || 0)) soTheoPhien.set(so.hostSessionId, so);
    }

    const phien = [];
    const loiGioiHan = [];
    const dsTep = await dsTepPhien();
    for (const t of dsTep) {
      const meta = await docMeta(t);
      if (!meta || meta.isArchived || !meta.sessionId) continue;
      if (meta.error && /limit/i.test(meta.error)) loiGioiHan.push({ chu: meta.error, luc: meta.errorAt || 0 });
      const so = soTheoPhien.get(meta.sessionId) || null;
      const duong = await timNhatKy(so?.sessionId || meta.cliSessionId, meta.cwd, meta.originCwd);
      const nk = duong ? await docNhatKy(duong) : null;
      if (nk?.loiApi && /limit/i.test(nk.loiApi.chu || '')) loiGioiHan.push({ chu: nk.loiApi.chu, luc: nk.loiApi.luc });
      phien.push(await this._dung({ meta, so, nk, duong, bayGio, nguon: 'app' }));
    }
    // Phiên mở từ VS Code hay terminal: không có tệp phiên của app, chỉ có tệp trạng thái sống.
    for (const so of soLe) {
      if (so.status === 'idle' && bayGio - (so.statusUpdatedAt || 0) > 24 * 3600e3) continue;
      const duong = await timNhatKy(so.sessionId, so.cwd);
      const nk = duong ? await docNhatKy(duong) : null;
      const meta = { sessionId: 'cli_' + so.sessionId, title: so.name || tenDuAn(so.cwd), cwd: so.cwd, createdAt: so.startedAt, lastActivityAt: so.statusUpdatedAt };
      phien.push(await this._dung({ meta, so, nk, duong, bayGio, nguon: so.entrypoint === 'claude-vscode' ? 'vscode' : 'terminal' }));
    }

    const md = tinhMucDung({ mau: await docLichSu(), org: dsTep.org, loi: loiGioiHan, bayGio });
    const anh = { phien, mucDung: md };
    const khoa = JSON.stringify(anh);
    this.anhCuoi = anh;
    if (khoa !== this.khoa) {
      this.khoa = khoa;
      for (const f of this.ngheDoi) f({ ...anh, bayGio });
    }
  }

  async _dung({ meta, so, nk, duong, bayGio, nguon }) {
    const id = meta.sessionId;
    let kq = suyTrangThai({ meta, so, nk, bayGio });
    if (kq.giu) kq = this.truoc.get(id) || { trangThai: 'xong' };
    else this.truoc.set(id, kq);
    const conViec = kq.trangThai === 'lam' || kq.trangThai === 'cho' || (so && so.status !== 'idle');
    const troLy = conViec ? await demTroLy(duong, bayGio) : 0;
    const hoatDongCuoi = Math.max(meta.lastActivityAt || 0, nk?.mtimeMs || 0, so && so.status !== 'idle' ? so.statusUpdatedAt || 0 : 0);
    const p = {
      id,
      ten: meta.title || '(chưa có tên)',
      duAn: tenDuAn(meta.cwd || meta.originCwd),
      thuMuc: rutNha(meta.cwd),
      lienKet: nguon === 'app' ? `claude://claude.ai/epitaxy/${id}` : '',
      nguon,
      trangThai: kq.trangThai,
      tomTat: kq.tomTat || '',
      baoCao: rutGon(meta.lastTurnReport || nk?.wrapUp?.recap || '', 600),
      yeuCau: rutGon(nk?.yeuCau || '', 300),
      moHinh: meta.model || '',
      effort: meta.effort || '',
      cheDo: meta.permissionMode || '',
      taoLuc: meta.createdAt || 0,
      hoatDongCuoi,
      luotXong: meta.completedTurns || 0,
      cha: meta.spawnedFrom?.sessionId || meta.forkedFromSessionId || null,
      troLy,
    };
    if (kq.viec) p.viec = kq.viec;
    if (kq.duyet) p.duyet = kq.duyet;
    if (kq.loi) p.loi = { ...kq.loi, chu: rutGon(kq.loi.chu, 240) };
    if (kq.lyDo) p.lyDo = kq.lyDo;
    return p;
  }
}
