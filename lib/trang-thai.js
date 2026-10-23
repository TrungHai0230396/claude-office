// Suy trạng thái một phiên Claude từ ba nguồn (hàm thuần, không đọc tệp — dễ kiểm):
//   so     – tệp trạng thái sống của tiến trình CLI (~/.claude/sessions/<pid>.json): busy | idle | waiting
//   nk     – tóm tắt đuôi nhật ký (lib/doc-phien.js → tomDuoi): lượt đang mở hay đã xong, công cụ đang chờ…
//   meta   – tệp phiên của app Claude (tóm tắt cuối lượt, lỗi, phiên chưa khởi động…)
// Thứ tự luật theo đúng cách app Claude xếp trạng thái ở thanh bên: chờ người > đang chạy > lỗi > cần trả lời > xong.
import path from 'node:path';

const BAY_NGAY = 7 * 86400e3;

export function rutGon(chu, toiDa = 160) {
  if (!chu) return '';
  const s = String(chu).replace(/\s+/g, ' ').trim();
  return s.length > toiDa ? s.slice(0, toiDa - 1).trimEnd() + '…' : s;
}

function tenTep(p) {
  return p ? path.basename(String(p)) : '';
}

function cauDau(chu) {
  const s = rutGon(chu, 400);
  const m = /^(.{12,}?[.!?…])(\s|$)/.exec(s);
  return m ? m[1] : rutGon(s, 160);
}

// Việc đang làm, đọc từ công cụ đang chạy.
export function viecCua(cc) {
  if (!cc) return null;
  const v = cc.input || {};
  const ten = cc.ten || '';
  const tu = cc.luc || 0;
  const ra = (loai, chu) => ({ loai, chu: rutGon(chu, 140), congCu: ten, tu });
  if (ten === 'Bash') return ra('lenh', 'Đang chạy: ' + (v.description || String(v.command || '').split('\n')[0]));
  if (ten === 'Edit' || ten === 'MultiEdit') return ra('go', 'Đang sửa ' + tenTep(v.file_path));
  if (ten === 'Write') return ra('go', 'Đang viết ' + tenTep(v.file_path));
  if (ten === 'NotebookEdit') return ra('go', 'Đang sửa sổ ' + tenTep(v.notebook_path));
  if (ten === 'Read') return ra('doc', 'Đang đọc ' + tenTep(v.file_path));
  if (ten === 'Grep') return ra('doc', `Đang tìm “${rutGon(v.pattern, 50)}”`);
  if (ten === 'Glob') return ra('doc', `Đang tìm tệp ${rutGon(v.pattern, 50)}`);
  if (ten === 'WebSearch') return ra('web', 'Đang tra: ' + (v.query || ''));
  if (ten === 'WebFetch') {
    let host = '';
    try {
      host = new URL(v.url).host;
    } catch {}
    return ra('web', 'Đang đọc web ' + host);
  }
  if (ten === 'Agent' || ten === 'Task') return ra('giaoViec', 'Giao việc cho trợ lý: ' + (v.description || v.subagent_type || ''));
  if (ten === 'Workflow') return ra('giaoViec', 'Đang chạy quy trình nhiều trợ lý');
  if (ten === 'mcp__ccd_session__start_session') return ra('giaoViec', 'Đang mở phiên mới: ' + (v.title || ''));
  if (ten === 'SendMessage' || /send_message$/.test(ten)) return ra('giaoViec', 'Đang nhắn phiên khác');
  if (ten === 'AskUserQuestion') return ra('doi', 'Đang hỏi bạn');
  if (ten === 'ExitPlanMode') return ra('doi', 'Đang trình kế hoạch');
  if (/^(TodoWrite|TaskCreate|TaskUpdate)$/.test(ten)) return ra('viet', 'Đang lên danh sách việc');
  if (ten === 'Skill') return ra('doc', 'Đang mở kỹ năng ' + (v.skill || ''));
  if (/^(Monitor|ScheduleWakeup|TaskOutput|TaskStop)$/.test(ten)) return ra('doi', 'Đang chờ việc chạy nền');
  if (ten === 'Artifact') return ra('go', 'Đang dựng trang');
  if (ten === 'mcp__ccd_turn__wrap_up') return ra('viet', 'Đang tóm tắt lượt');
  if (/^mcp__(Claude_Browser|claude-in-chrome)__/.test(ten)) return ra('trinhDuyet', 'Đang thử trên trình duyệt');
  if (ten.startsWith('mcp__')) {
    const [, may, cong] = ten.split('__');
    return ra('web', `Đang dùng ${cong || ten}` + (may && !/^[0-9a-f-]{20,}$/.test(may) ? ` (${may})` : ''));
  }
  return ra('go', 'Đang dùng ' + ten);
}

// Một câu cho phần "xin quyền": phiên muốn làm gì.
export function xinQuyen(cc) {
  if (!cc) return 'Đang chờ bạn cho phép';
  const v = cc.input || {};
  const ten = cc.ten || '';
  if (ten === 'Bash') return rutGon('Cho phép chạy: ' + (v.description ? `${v.description} (${String(v.command || '').split('\n')[0]})` : String(v.command || '')), 200);
  if (ten === 'Edit' || ten === 'MultiEdit' || ten === 'Write' || ten === 'NotebookEdit') return 'Cho phép sửa ' + tenTep(v.file_path || v.notebook_path);
  if (ten === 'Read') return 'Cho phép đọc ' + (v.file_path || '');
  if (ten === 'WebFetch') return 'Cho phép đọc trang ' + (v.url || '');
  if (ten === 'WebSearch') return 'Cho phép tìm trên mạng: ' + (v.query || '');
  return 'Cho phép dùng ' + ten.replace(/^mcp__[^_]+__/, '');
}

function cauHoi(cc) {
  const q = cc?.input?.questions?.[0];
  if (!q) return 'Claude cần bạn trả lời';
  const chon = (q.options || []).map((o) => o.label).filter(Boolean);
  return rutGon(q.question + (chon.length ? ` (${chon.join(' / ')})` : ''), 220);
}

function keHoach(cc) {
  const dong = String(cc?.input?.plan || '')
    .split('\n')
    .map((d) => d.replace(/^[#>*\-\s]+/, '').trim())
    .filter(Boolean);
  return rutGon(dong[0] ? 'Kế hoạch: ' + dong[0] : 'Xin duyệt kế hoạch', 200);
}

const UU_TIEN_CHO = { AskUserQuestion: 0, ExitPlanMode: 1 };
function moiNhat(ds) {
  if (!ds?.length) return null;
  return [...ds].sort((a, b) => (UU_TIEN_CHO[a.ten] ?? 9) - (UU_TIEN_CHO[b.ten] ?? 9) || b.luc - a.luc)[0];
}

// Trả về { trangThai, viec?, duyet?, loi?, lyDo?, tomTat? } hoặc { giu: true } (vừa xong lượt,
// tóm tắt chưa về: giữ trạng thái cũ vài giây cho khỏi chớp).
export function suyTrangThai({ meta = {}, so = null, nk = null, bayGio = Date.now() }) {
  const cho = nk?.choCongCu || [];
  const daXong = !!nk?.ketThuc;

  if (meta.pendingFirstStart) {
    if (meta.error) return { trangThai: 'loi', loi: { loai: meta.errorCategory || 'khoi_dong', chu: meta.error, luc: meta.errorAt || 0 } };
    return { trangThai: 'lam', viec: { loai: 'nghi', chu: 'Đang khởi động', congCu: '', tu: meta.pendingFirstStart.since || 0 } };
  }

  if (so?.status === 'waiting') {
    const cc = moiNhat(cho);
    const tu = so.statusUpdatedAt || 0;
    if (so.waitingFor === 'input needed') return { trangThai: 'cho', duyet: { loai: 'hoi', chu: cauHoi(cc), tu } };
    if (cc?.ten === 'ExitPlanMode') return { trangThai: 'cho', duyet: { loai: 'keHoach', chu: keHoach(cc), tu } };
    if (cc?.ten === 'AskUserQuestion') return { trangThai: 'cho', duyet: { loai: 'hoi', chu: cauHoi(cc), tu } };
    return { trangThai: 'cho', duyet: { loai: 'quyen', chu: xinQuyen(cc), tu } };
  }

  const deNghi = cho.find((c) => c.ten === 'mcp__ccd_session__start_session' && c.input?.initiation === 'offer');
  if (deNghi) return { trangThai: 'cho', duyet: { loai: 'deNghi', chu: rutGon('Đề nghị mở phiên mới: ' + (deNghi.input.title || ''), 200), tu: deNghi.luc } };

  if (so?.status === 'busy') {
    if (!daXong) return { trangThai: 'lam', viec: viecCua(moiNhat(cho)) || viecNghi(nk) };
    return { trangThai: 'lam', viec: { loai: 'giaoViec', chu: 'Đang chờ trợ lý chạy nền', congCu: '', tu: nk?.lucKetThuc || 0 } };
  }

  if (!so && nk && !daXong) {
    // CLI cũ không có tệp trạng thái, hoặc tiến trình đã tắt.
    const cc = moiNhat(cho);
    if (cc?.ten === 'AskUserQuestion') return { trangThai: 'cho', duyet: { loai: 'hoi', chu: cauHoi(cc), tu: cc.luc } };
    if (cc?.ten === 'ExitPlanMode') return { trangThai: 'cho', duyet: { loai: 'keHoach', chu: keHoach(cc), tu: cc.luc } };
    if (bayGio - (nk.mtimeMs || 0) < 60e3) return { trangThai: 'lam', viec: viecCua(cc) || viecNghi(nk) };
    const lyDo = meta.interruptedByQuitAt ? (meta.interruptedAwaitingPerson ? 'Tắt app lúc đang chờ bạn' : 'Tắt app giữa chừng') : 'Tiến trình đã tắt giữa lượt';
    return { trangThai: 'dung', lyDo };
  }

  // Lượt đã xong.
  if (nk?.ngat) return { trangThai: 'dung', lyDo: 'Bạn đã dừng giữa chừng' };
  if (nk?.loiApi) return { trangThai: 'loi', loi: nk.loiApi };
  if (meta.error && bayGio - (meta.errorAt || bayGio) < BAY_NGAY) return { trangThai: 'loi', loi: { loai: meta.errorCategory || 'cli', chu: meta.error, luc: meta.errorAt || 0 } };

  const W = nk?.wrapUp || null;
  const tt = meta.postTurnSummary;
  const sum = tt && nk?.troLyCuoiUuid && (tt.summarizes_uuid || meta.postTurnSummaryFor) === nk.troLyCuoiUuid ? tt : null;
  const lucXong = nk?.lucKetThuc || nk?.lucCuoi || meta.lastActivityAt || 0;
  if (W?.blocked) return { trangThai: 'cho', duyet: { loai: 'quyetDinh', chu: rutGon(W.ask || W.recap || 'Chờ bạn quyết', 240), tu: lucXong } };
  if (sum && (sum.status_category === 'blocked' || sum.status_category === 'need_input')) {
    return { trangThai: 'cho', duyet: { loai: 'quyetDinh', chu: rutGon(sum.needs_action || sum.status_detail || 'Chờ bạn quyết', 240), tu: lucXong }, tomTat: sum.status_detail || '' };
  }
  if (sum?.status_category === 'failed') return { trangThai: 'loi', loi: { loai: 'turn_failed', chu: sum.status_detail || 'Lượt vừa rồi thất bại', luc: lucXong } };
  if (W?.ask) return { trangThai: 'cho', duyet: { loai: 'quyetDinh', chu: rutGon(W.ask, 240), tu: lucXong }, tomTat: W.recap ? cauDau(W.recap) : '' };
  if (sum?.status_category === 'review_ready') return { trangThai: 'cho', duyet: { loai: 'xemLai', chu: rutGon(sum.status_detail || 'Xong, chờ bạn xem lại', 240), tu: lucXong }, tomTat: sum.status_detail || '' };
  if (!sum && nk && daXong && bayGio - lucXong < 8e3) return { giu: true };
  if (!sum && !W && nk && daXong) {
    // Không có tóm tắt cuối lượt: câu cuối là câu hỏi thì coi như đang chờ bạn trả lời.
    const chu = String(nk.chuTroLyCuoi || '').trim();
    if (/[?？]["'”»)\]]*\s*$/.test(chu)) {
      const cau = chu.split(/(?<=[.!?…])\s+/).filter(Boolean).pop() || chu;
      return { trangThai: 'cho', duyet: { loai: 'quyetDinh', chu: rutGon(cau, 240), tu: lucXong } };
    }
  }
  return { trangThai: 'xong', tomTat: rutGon(sum?.status_detail || (W?.recap ? cauDau(W.recap) : '') || meta.turnWrapUp?.description || cauDau(meta.lastTurnReport || ''), 200) };
}

function viecNghi(nk) {
  if (nk?.khoiCuoi === 'text') return { loai: 'viet', chu: 'Đang viết trả lời', congCu: '', tu: nk.lucCuoi || 0 };
  return { loai: 'nghi', chu: 'Đang nghĩ…', congCu: '', tu: nk?.lucCuoi || 0 };
}
