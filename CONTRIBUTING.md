# Đóng góp cho Claude Office

Cảm ơn bạn ghé qua. Báo lỗi hay góp ý thì mở **Issue**; muốn sửa thì gửi **Pull Request** (PR). Chủ kho đọc và
duyệt từng PR rồi mới gộp vào `main`.

> **English.** Bug reports and ideas: open an Issue. Code: fork, branch from `main`, run `npm test`, open a pull
> request. UI text and code comments are in Vietnamese; please keep that, and never include personal data.

## Gửi một thay đổi

1. **Fork** kho này, tạo nhánh mới từ `main`.
2. Cài và chạy thử (macOS, Node 18 trở lên):

   ```bash
   npm ci
   npm test
   npm start
   ```

   Mở <http://127.0.0.1:5230>; không có phiên Claude nào thì xem bằng dữ liệu mẫu ở <http://127.0.0.1:5230/?demo>.
3. Mở **Pull Request** vào `main` và điền mẫu có sẵn. Mỗi PR tự chạy bài kiểm trên GitHub; PR đầu tiên của bạn
   chờ chủ kho bấm cho chạy.

## Quy ước

- Chữ trên trang và chú thích trong mã viết **tiếng Việt**; tên biến, hàm theo kiểu tiếng Việt không dấu như mã
  đang có (`trangThai`, `veBangMucDung`…).
- Đổi luật trong `lib/` thì thêm hay sửa **bài kiểm** trong `test/`. `npm test` phải qua hết.
- **Không đưa dữ liệu riêng** lên kho: đường dẫn kiểu `/Users/<tên>`, tên dự án hay tên phiên thật, nhật ký,
  token. Ảnh chụp màn hình chỉ chụp từ `?demo`.
- **Giữ nguyên các lớp khoá** (xem mục "Khoá máy chủ thế nào" trong README và `lib/bao-ve.js`):
  - máy chủ chỉ nghe `127.0.0.1`;
  - lệnh điều khiển phải đúng `Host`, đúng `Origin`, kèm mã bí mật, thân lệnh JSON;
  - không bao giờ dùng chế độ bỏ qua quyền (`bypassPermissions`, `dontAsk`, `auto`);
  - mỗi lời xin quyền chỉ được trả lời bằng cú bấm của người dùng;
  - không đưa chữ lấy từ ngoài vào trang bằng `innerHTML`.
- **Không đụng thông tin đăng nhập**: không đọc, lưu hay chuyển token; phiên chạy bằng đăng nhập Claude Code
  của chính người dùng. Với phiên của app Claude desktop, chỉ đọc tệp, không ghi.
- Thêm thư viện mới thì nói rõ vì sao trong PR; kho cố giữ ít phụ thuộc.

## Lỗ hổng bảo mật

Đừng mở Issue công khai kèm chi tiết khai thác. Liên hệ riêng chủ kho qua GitHub trước.
