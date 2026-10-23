// Dữ liệu giả để xem thử văn phòng khi chưa có máy chủ (mở trang với ?demo).
const DU_AN = ['cua-hang-online', 'ung-dung-ghi-chu', 'bao-cao-doanh-thu', 'tro-choi-co-vua', 'trang-gioi-thieu'];
const TEN = [
  'Sửa lỗi đăng nhập Google', 'Thêm chế độ tối', 'Tối ưu ảnh sản phẩm', 'Viết bài kiểm giỏ hàng', 'Trang thanh toán mới',
  'Lọc bình luận rác', 'Bàn cờ: thêm đồng hồ', 'Đồng bộ ghi chú ngoại tuyến', 'Nhắc việc theo giờ', 'Xuất báo cáo PDF',
  'Biểu đồ doanh thu tuần', 'Chuyển tên miền', 'Đếm lượt cài ứng dụng', 'Trang giới thiệu nhóm', 'Soát chính tả bài viết',
  'Kiểm tra quyền truy cập',
];
const VIEC = [
  ['lenh', 'Đang chạy: npm test', 'Bash'],
  ['go', 'Đang sửa app.js', 'Edit'],
  ['go', 'Đang viết cart.js', 'Write'],
  ['doc', 'Đang đọc README.md', 'Read'],
  ['doc', 'Đang tìm “checkout”', 'Grep'],
  ['web', 'Đang tra: three.js CapsuleGeometry', 'WebSearch'],
  ['trinhDuyet', 'Đang thử trên trình duyệt', 'mcp__Claude_Browser__computer'],
  ['giaoViec', 'Giao việc cho trợ lý: soát lỗi giao diện', 'Agent'],
  ['nghi', 'Đang nghĩ…', ''],
];
const HOI = [
  ['quyetDinh', 'Bạn có muốn mình commit và push lên GitHub luôn không?'],
  ['quyen', 'Cho phép chạy lệnh: git push origin main'],
  ['hoi', 'Bạn muốn nút “Mua ngay” đặt bên trái hay bên phải?'],
  ['keHoach', 'Kế hoạch 4 bước: tách bảng, thêm chỉ mục, sửa API, chạy kiểm. Duyệt nhé?'],
  ['xemLai', 'Đã mở pull request #12, chờ bạn xem lại'],
  ['deNghi', 'Mở phiên mới để viết bài kiểm cho giỏ hàng?'],
];

// Hai phiên mẫu "chạy trong văn phòng": có khung chat và hộp duyệt (nút bấm chỉ để xem thử).
function phienVanPhongMau(bayGio) {
  const tin = (i, loai, chu, truoc) => ({ i, loai, chu, luc: bayGio - truoc * 1000 });
  return [
    {
      id: 'vp_demo_dang_nhap',
      ten: 'Sửa lỗi nút Đăng nhập trên điện thoại',
      duAn: 'cua-hang-online',
      thuMuc: '~/Projects/cua-hang-online',
      lienKet: '',
      nguon: 'vanphong',
      vanPhong: true,
      demo: true,
      conChay: true,
      trangThai: 'cho',
      taoLuc: bayGio - 9 * 60e3,
      hoatDongCuoi: bayGio - 40e3,
      moHinh: 'claude-opus-5-5',
      cheDo: 'default',
      luotXong: 0,
      troLy: 0,
      phienBan: 7,
      duyet: { ma: 'demo-1', loai: 'quyen', congCu: 'Bash', tu: bayGio - 40e3, soCho: 1, chu: 'Cho phép chạy: Chạy bài kiểm giao diện (npm test -- login)', chiTiet: 'npm test -- login', moTa: 'Chạy bài kiểm giao diện', coLuon: true },
      demoHoiThoai: [
        tin(0, 'ban', 'Nút Đăng nhập trên điện thoại bấm không ăn, sửa giúp mình rồi chạy bài kiểm nhé.', 540),
        tin(1, 'claude', 'Để mình xem component **LoginButton** và phần xử lý chạm trước.', 530),
        tin(2, 'congCu', 'Đang đọc LoginButton.tsx', 525),
        tin(3, 'congCu', 'Đang tìm “onTouchStart”', 520),
        tin(4, 'claude', 'Tìm ra rồi: lớp phủ `.banner-cookie` trong suốt nằm đè lên nút trên màn hẹp nên chạm không tới nút.\n\nMình sẽ:\n- thêm `pointer-events: none` cho lớp phủ khi đã ẩn\n- thêm bài kiểm chạm cho màn 375px', 400),
        tin(5, 'congCu', 'Đang sửa banner.css', 380),
        tin(6, 'traLoi', '✓ Cho phép: sửa banner.css', 370),
        tin(7, 'claude', 'Đã sửa xong. Giờ mình chạy bài kiểm giao diện cho phần đăng nhập.', 45),
      ],
    },
    {
      id: 'vp_demo_thanh_toan',
      ten: 'Lên kế hoạch trang thanh toán mới',
      duAn: 'cua-hang-online',
      thuMuc: '~/Projects/cua-hang-online',
      lienKet: '',
      nguon: 'vanphong',
      vanPhong: true,
      demo: true,
      conChay: true,
      trangThai: 'cho',
      taoLuc: bayGio - 25 * 60e3,
      hoatDongCuoi: bayGio - 3 * 60e3,
      moHinh: 'claude-opus-5-5',
      cheDo: 'plan',
      luotXong: 0,
      troLy: 0,
      phienBan: 4,
      duyet: { ma: 'demo-2', loai: 'keHoach', congCu: 'ExitPlanMode', tu: bayGio - 3 * 60e3, soCho: 1, chu: 'Xin duyệt kế hoạch' },
      demoDuyet: {
        ma: 'demo-2',
        loai: 'keHoach',
        soCho: 1,
        keHoach:
          '## Trang thanh toán mới\n\n1. Tách `Checkout.tsx` thành 3 bước: địa chỉ, giao hàng, thanh toán\n2. Lưu nháp từng bước vào `localStorage` để tải lại không mất\n3. Thêm kiểm tra số điện thoại Việt Nam\n4. Viết bài kiểm cho cả 3 bước, chạy `npm test`\n\nKhông đụng tới phần cổng thanh toán.',
      },
      demoHoiThoai: [
        tin(0, 'ban', 'Lên kế hoạch làm lại trang thanh toán cho gọn, mình duyệt rồi hẵng làm.', 1500),
        tin(1, 'congCu', 'Đang đọc Checkout.tsx', 1490),
        tin(2, 'congCu', 'Đang tìm “paymentGateway”', 1400),
        tin(3, 'claude', 'Mình đã đọc xong luồng hiện tại. Kế hoạch ở dưới, bạn xem rồi duyệt nhé.', 190),
      ],
    },
  ];
}

export function taoDemo(khiCo) {
  const bayGio = Date.now();
  let s = 12345;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ds = TEN.map((ten, i) => {
    const trangThai = i < 4 ? 'lam' : i < 7 ? 'cho' : i === 7 ? 'loi' : 'xong';
    return {
      id: 'local_demo' + String(i).padStart(4, '0'),
      ten,
      duAn: DU_AN[i < 8 ? 0 : i < 11 ? 1 : i < 13 ? 2 : i < 14 ? 3 : 4],
      thuMuc: '~/Documents/Project/…',
      lienKet: '',
      trangThai,
      taoLuc: bayGio - (i + 1) * 3600e3,
      hoatDongCuoi: bayGio - (trangThai === 'xong' ? (i > 13 ? 30 * 3600e3 : r() * 3600e3) : 5e3),
      moHinh: 'claude-opus-5-5',
      effort: 'max',
      cheDo: 'bypassPermissions',
      luotXong: Math.floor(r() * 40),
      troLy: 0,
    };
  });
  const dat = (p, bayGio) => {
    p.viec = undefined;
    p.duyet = undefined;
    p.loi = undefined;
    p.troLy = 0;
    if (p.trangThai === 'lam') {
      const v = VIEC[Math.floor(r() * VIEC.length)];
      p.viec = { loai: v[0], chu: v[1], congCu: v[2], tu: bayGio };
      if (v[0] === 'giaoViec') p.troLy = 1 + Math.floor(r() * 3);
      p.hoatDongCuoi = bayGio;
    } else if (p.trangThai === 'cho') {
      const h = HOI[Math.floor(r() * HOI.length)];
      p.duyet = { loai: h[0], chu: h[1], tu: bayGio - r() * 1800e3 };
    } else if (p.trangThai === 'loi') {
      p.loi = { loai: 'gioi_han', chu: "You've hit your session limit · resets 6:50pm", luc: bayGio };
    } else {
      p.tomTat = 'Đã push lên main; trang thật khớp repo';
    }
  };
  ds.forEach((p) => dat(p, bayGio));
  // Mức dùng mẫu: 61% giới hạn 5 giờ, hết sau 1 giờ 31 phút.
  const mucDung = { namGio: { phanTram: 61, luc: bayGio - 5 * 60e3, cu: false }, het: { luc: bayGio + 91 * 60e3, chinhXac: false, saiSo: 7 * 60e3 }, tuan: { phanTram: 22, luc: bayGio - 5 * 60e3 }, goiY: null };
  const dsVP = phienVanPhongMau(bayGio);
  khiCo({ bayGio, phien: [...dsVP, ...ds.map((p) => ({ ...p }))], mucDung });
  setInterval(() => {
    const bay = Date.now();
    // Mỗi nhịp đổi trạng thái vài người cho thấy văn phòng sống.
    for (let k = 0; k < 2; k++) {
      const p = ds[Math.floor(r() * (ds.length - 2))];
      const cu = p.trangThai;
      const tiep = { lam: r() < 0.45 ? 'cho' : 'xong', cho: 'lam', xong: 'lam', loi: 'xong' }[cu];
      p.trangThai = tiep;
      dat(p, bay);
    }
    // Người đang làm thỉnh thoảng đổi việc.
    for (const p of ds) if (p.trangThai === 'lam' && r() < 0.3) dat(p, bay);
    khiCo({ bayGio: bay, phien: [...dsVP, ...ds.map((p) => ({ ...p }))], mucDung });
  }, 7000);
}
