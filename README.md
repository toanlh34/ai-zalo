# Trợ lý Zalo cục bộ — bản thử nhận tin

> Đang xây thêm JEV. Xem **[PROGRESS.md](PROGRESS.md)** để biết trạng thái mới nhất và cách tiếp tục. Provider Claude CLI hiện chưa qua smoke test; chưa dùng chế độ live. Nội dung phía dưới mô tả bản nhận tin ban đầu.

Đã tải mã và dựng dự án ngày 20/10/2026. Dùng tài khoản cá nhân, không dùng OA và chưa cần n8n/VPS.

## Trạng thái thực tế

- Đã cài `zca-js@2.1.2`, có package-lock.json; bỏ chạy lifecycle scripts khi cài.
- Đã kiểm thử 3 trường hợp tự động về lọc tin và ngữ cảnh; tất cả đạt.
- Đã kiểm thử mã hóa/giải mã và ghi đè phiên DPAPI bằng dữ liệu giả trên máy này; đạt.
- Đã kiểm tra thiếu ID nhóm thì chương trình dừng trước đăng nhập.
- CHƯA quét QR, CHƯA xác minh nhận/gửi tin thật. Đây chưa phải trợ lý AI hoàn chỉnh.

## Chạy trên PowerShell

```powershell
cd C:\Setups\zalo-local-lab\assistant
npm run login
```

Chương trình hiện đường dẫn `.private\login-qr.png`. Mở ảnh trên chính máy này, dùng Zalo của tài khoản SIM riêng quét và xác nhận. Không quét bằng tài khoản của người khác. QR sẽ bị xóa sau khi đăng nhập kết thúc. Nếu QR hết hạn, chạy lại lệnh.

Tạo nhóm thử riêng, thêm tài khoản bot và tài khoản của bạn; nên có thêm một người thử vì thư viện có loại bỏ tin do chính tài khoản bot gửi. Sau đó:

```powershell
npm run groups
notepad config.json
```

Lệnh groups chỉ lấy ID và tên nhóm của tài khoản, chưa bật listener, không lưu danh sách. Điền đúng ID nhóm thử, ví dụ (thay số này bằng ID thật):

```json
{"allowedGroupId":"1234567890","contextLimit":30}
```

```powershell
npm start
```

Nhờ tài khoản khác gửi văn bản vào nhóm thử. Terminal sẽ hiện tin và số tin trong ngữ cảnh. Thử gửi ở nhóm khác và tin riêng: không được hiện trong terminal. Ctrl+C để dừng. Chạy `npm test` để kiểm thử lại bằng dữ liệu giả.

## Phạm vi và dữ liệu

- Chỉ một tài khoản và đúng một ID nhóm được xử lý. Chỉ nhận văn bản mới; không tải ảnh/tệp, không đọc lịch sử.
- Kết nối cấp tài khoản có thể đưa tin ở các cuộc trò chuyện khác tới SDK trong bộ nhớ. Bộ lọc ứng dụng loại ngay trước khi ghi log/giữ ngữ cảnh; không thể cam kết máy chủ chỉ chuyển riêng nhóm được phép.
- Ngữ cảnh giữ tối đa 30 tin trong RAM (cấu hình 1–100), mỗi tin tối đa 8.000 ký tự, mất khi dừng. Terminal có hiển thị nội dung nhóm thử; không chia sẻ bản ghi terminal chứa dữ liệu khách hàng.
- Không có mã gọi sendMessage, gửi typing, webhook hoặc nhà cung cấp AI. Không có cổng HTTP công khai.
- Phiên lưu tại `.private\session.dpapi`, mã hóa bằng Windows DPAPI theo người dùng Windows hiện tại, thư mục bỏ ACL kế thừa và cấp quyền cho người dùng hiện tại. Không phải kho bí mật chống lại phần mềm đang chạy cùng người dùng hoặc quản trị viên.
- Không đọc cookie trình duyệt, không nhập cookie từ tài khoản khác. Không gửi session/QR/config cá nhân lên Git hay vào chat. `.gitignore` đã loại dữ liệu riêng.
- Phiên hết hạn thì chạy lại login; không thử đăng nhập liên tục. Muốn thu hồi quyền: đăng xuất phiên trong Zalo trên điện thoại rồi xóa file phiên cục bộ.
- Chưa có AI: bước tiếp theo là tạo bản nháp trả lời từ ngữ cảnh trong nhóm, có người xem trước; chỉ thêm cơ chế gửi khi đã thống nhất quy tắc trả lời.

Xem báo cáo mã nguồn ở `RESEARCH.vi.md`.

