# Claude Office

Văn phòng 3D cho các phiên Claude Code trên máy Mac: mỗi phiên là một người.

> **English.** *Claude Office* is a local 3D dashboard for the Claude desktop app's
> Code sessions and Claude Code CLI sessions on macOS. Every session is a worker: running sessions type at
> their project's desk, sessions waiting on you (permission prompt, question, plan approval, "shall I push?")
> queue in a glass approval room in front of your desk, finished ones get coffee or walk in the garden. A wall
> clock and a usage board show the 5-hour limit. It runs on `127.0.0.1`, only reads local files and sends
> nothing anywhere. The UI is in Vietnamese. Unofficial, not affiliated with Anthropic.

![Claude Office chạy với dữ liệu mẫu](docs/anh-man-hinh.jpg)

> **Lưu ý.** Đây là dự án cá nhân, **không chính thức**, không liên quan tới Anthropic ("Claude" là thương
> hiệu của Anthropic). Trang đọc các tệp nội bộ chưa công bố của app Claude và Claude Code (định dạng có thể
> đổi bất cứ lúc nào khi app cập nhật), chỉ đọc chứ không ghi hay gửi đi đâu. Hiện chỉ chạy trên macOS.

| Phiên đang… | Người trong văn phòng |
|---|---|
| chạy (đang nghĩ, chạy lệnh, sửa mã, đọc tệp, lướt web, thử trình duyệt) | ngồi bàn của dự án mình, gõ phím; màn hình đổi theo việc; có trợ lý con thì robot nhỏ bay quanh bàn |
| chờ bạn: xin quyền dùng công cụ, hỏi bạn, trình kế hoạch, đề nghị mở phiên mới, hỏi "commit/push không?", nộp bài chờ xem | ôm tờ trình sang **phòng duyệt**, xếp hàng trước bàn sếp (là bạn); chờ quá 1 giờ thì ngồi ghế chờ; đèn trên cửa nhấp nháy |
| vừa xong lượt | vươn vai, đi pha cà phê, rồi đứng bàn cao, ngồi sofa tán gẫu, dạo vườn, ngồi ghế đá |
| lỗi (hết lượt dùng, đầy ổ đĩa, lỗi API…) | ngồi ôm đầu trước màn hình đỏ |
| hơn 8 giờ không có việc | gục bàn ngủ |

Được duyệt xong (phiên chạy tiếp) thì sếp đóng dấu "ĐÃ DUYỆT" và người đó quay về bàn.

Trang chỉ làm nổi việc cần bạn, phần còn lại để chìm cho đỡ rối mắt:

- **Bảng bên**: "Chờ bạn trả lời" là thẻ to (câu hỏi, đã chờ bao lâu, nút **Mở để trả lời** mở đúng
  phiên trong app Claude qua `claude://claude.ai/epitaxy/<mã phiên>`); "Đang làm" mỗi người một dòng;
  "Đang nghỉ" và "Gặp lỗi" gập sẵn. Bấm một thẻ hay một dòng thì dưới chân người đó hiện vòng sáng.
- **Trong cảnh** chỉ người đứng đầu hàng chờ và người đang làm có nhãn tên; người chờ sau là chấm vàng,
  lỗi mới là chấm đỏ, người nghỉ không có nhãn. Rê chuột vào ai cũng hiện ô gợi ý.
- **Thông báo** chỉ bật khi có người mới xin duyệt hay vừa gặp lỗi; nút 🔔 bật thêm chuông và thông báo
  của máy.
- Giao diện theo chủ đề sáng/tối của máy (tối thì văn phòng lên đèn buổi tối).
- **Máy quay như xem bản đồ**: kéo chuột (một ngón) để dời cảnh, lăn chuột (hai ngón) để phóng to/thu
  nhỏ, không xoay. Cả phiên nhìn một hướng cố định (màn dọc thì nhìn từ phía tây cho văn phòng nằm
  dọc); nút góc nhìn chỉ trượt và phóng tới khu đó. Chọn ai thì máy quay đứng yên, dưới chân người đó
  hiện vòng sáng; người đó nằm ngoài màn hình thì cảnh chỉ trượt ngang tới, giữ nguyên độ xa. Gập/mở
  bảng bên chỉ dịch cảnh sang ngang.

## Chạy

Cần macOS, Node 18 trở lên, và app Claude (thẻ Code) hay Claude Code trên cùng máy.

```bash
git clone https://github.com/TrungHai0230396/claude-office.git
cd claude-office && npm start
```

Rồi mở <http://127.0.0.1:5230>. Không cần cài gói nào (three.js r152 nằm sẵn trong `public/vendor/`).
Muốn xem thử với dữ liệu mẫu: <http://127.0.0.1:5230/?demo>. Đổi cổng: `PORT=5300 npm start`.

Máy chủ chỉ nghe `127.0.0.1`, chỉ **đọc** tệp, không gửi gì ra ngoài, và từ chối yêu cầu có `Host`
khác localhost.

### Chạy nền tự động

```bash
npm run cai-tu-chay
```

Chép mã sang `~/Library/Application Support/ClaudeOffice/app` (macOS chặn tiến trình nền đọc
`~/Documents`) và đăng ký LaunchAgent `com.claudeoffice.server`: bật mỗi khi đăng nhập, tự bật lại nếu
bị tắt. Nhật ký ở `~/Library/Logs/ClaudeOffice/server.log`. **Sửa mã xong thì chạy lại lệnh này** để
bản chạy nền dùng mã mới. Gỡ hẳn: `npm run go-tu-chay`.

## Đồng hồ và mức dùng

Tường sau khu làm việc có đồng hồ treo tường (chạy theo giờ máy) và bảng **Mức dùng Claude**; thanh trên
có bản nhỏ: giờ, phần trăm giới hạn 5 giờ, giờ hết giới hạn (rê chuột để xem giới hạn tuần).

Mức dùng chỉ đọc những gì app Claude tự ghi ra đĩa, không đụng khoá đăng nhập (`lib/muc-dung.js`):

- **Phần trăm** (5 giờ, tuần): tệp `~/Library/Application Support/Claude/plan-usage-history.json`, app ghi
  khoảng 15 phút một lần — nhưng **chỉ khi biểu tượng Claude trên thanh menu được bấm trong 24 giờ qua**
  (nhật ký app: "background poll paused: tray not opened recently"). Lâu không bấm thì trang báo chưa có số.
- **Giờ hết giới hạn**: chính xác khi có phiên vừa chạm giới hạn (câu lỗi "resets 6:50pm"); ngoài ra ước
  tính từ lúc phần trăm tụt hay từ 0 nhích lên (khung 5 giờ mới mở) + 5 giờ, ghi "~" và sai số. Mẫu không
  có giờ hết, và khung có thể mở từ máy khác (claude.ai, điện thoại), nên không tự đoán theo nhật ký trên máy.

## Lấy trạng thái từ đâu

Mỗi giây máy chủ đọc lại những tệp vừa đổi (`lib/theo-doi.js`):

- `~/.claude/sessions/<pid>.json` — tệp trạng thái sống mà mỗi tiến trình Claude Code ghi:
  `status` (`busy` / `idle` / `waiting`), `waitingFor` (`permission prompt` / `input needed`),
  `hostSessionId` (mã phiên của app). Chỉ tin tệp có pid còn sống và giờ bắt đầu khớp `procStart`.
- `~/Library/Application Support/Claude/claude-code-sessions/<tài khoản>/<tổ chức>/local_*.json` —
  tên phiên, thư mục, tóm tắt cuối lượt (`postTurnSummary`: completed / blocked / review_ready / failed),
  lỗi, phiên mẹ/con. Lấy thư mục tài khoản có phiên mới nhất.
- `~/.claude/projects/*/<cliSessionId>.jsonl` — đuôi nhật ký: công cụ đang chạy, lượt đã xong chưa,
  lời tóm tắt `wrap_up`, bị ngắt, lỗi API, lời nhờ cuối của bạn. Thư mục `subagents/` cho biết trợ lý con.

Luật xếp trạng thái nằm trong `lib/trang-thai.js` (hàm thuần, có bài kiểm), theo đúng thứ tự app
Claude dùng ở thanh bên: chờ người > đang chạy > lỗi > cần trả lời > xong. Phiên mở từ VS Code hay
terminal (có tệp trạng thái sống nhưng không có tệp phiên của app) cũng được đưa vào, không có nút mở phiên.

## Cấu trúc

- `server.js` — phục vụ `public/`, `GET /api/trang-thai` (ảnh chụp JSON), `GET /api/su-kien` (SSE, đẩy khi có thay đổi)
- `lib/doc-phien.js` — đọc tệp (có đệm theo mtime/size), đuôi nhật ký, bảng tiến trình
- `lib/trang-thai.js` — suy trạng thái từng phiên
- `lib/theo-doi.js` — vòng quét mỗi giây, so ảnh chụp để chỉ đẩy khi đổi
- `lib/muc-dung.js` — phần trăm giới hạn 5 giờ/tuần và giờ hết, từ tệp app Claude ghi
- `scripts/cai-tu-chay.sh`, `scripts/go-tu-chay.sh` — cài/gỡ chạy nền (LaunchAgent)
- `public/js/van-phong.js` — dựng văn phòng (khu bàn theo dự án, phòng duyệt, góc cà phê, vườn)
- `public/js/nguoi.js` — người và trợ lý nhỏ, tư thế và nhịp đi/gõ/thở
- `public/js/hanh-vi.js` — điều phối ai đi đâu theo trạng thái, hàng chờ, việc lúc nghỉ
- `public/js/duong-di.js` — lưới đi lại và tìm đường A*
- `public/js/man-hinh.js` — màn hình máy tính theo từng kiểu việc
- `public/js/giao-dien.js` — nhãn trên đầu, ô gợi ý, bảng bên, thẻ chi tiết, thông báo, chuông
- `public/js/demo.js` — dữ liệu mẫu cho `?demo`

## Kiểm

```bash
npm test
```

Kiểm tìm đường, tóm đuôi nhật ký, luật suy trạng thái và mức dùng (25 bài).

## Giới hạn

- Câu hỏi "có cần bạn trả lời không" khi lượt xong dựa vào tóm tắt cuối lượt của app; phiên tắt tóm tắt
  thì đoán theo câu cuối có dấu "?".
- Trang chỉ xem và mở phiên; trả lời, cho phép hay lưu trữ phiên vẫn làm trong app Claude.
- Đường dẫn tệp của app Claude là của macOS; Linux và Windows chưa chạy được.

## Giấy phép

[MIT](LICENSE). three.js trong `public/vendor/` cũng theo giấy phép MIT (`public/vendor/three-LICENSE.txt`).
