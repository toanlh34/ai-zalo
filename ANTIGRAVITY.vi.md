# Antigravity trong BIMUP Zalo Assistance 0.3.0

1. Đóng bản app cũ, mở shortcut **BIMUP Zalo Assistance** trên Desktop.
2. Dừng agent, vào **Thiết lập**, chọn **Antigravity CLI · tài khoản Google**.
3. Để trống model để CLI chọn mặc định. Không cần nhập API key.
4. Giữ **Thử nháp**, bấm **Lưu cấu hình AI**.
5. Bấm **Kiểm tra CLI**, sau đó **Thử kết nối AI**. Nút thử dùng lời chào giả và kiến thức trong app, có tiêu thụ hạn mức AI, không gửi Zalo.
6. Nếu thành công, chọn nhóm/ghép chủ như trước, rồi bấm **Chạy agent** ở Tổng quan. Xem bản nháp trong hàng chờ.

Máy phải cài CLI chính thức và đăng nhập Google một lần bằng lệnh `agy`. Nếu cần xác minh tài khoản, hoàn tất trong trình duyệt rồi thử lại. App tìm cả vị trí cài mặc định `%LOCALAPPDATA%/agy/bin/agy.exe`, kể cả khi PATH chưa cập nhật.

App gọi CLI ẩn bằng phiên đăng nhập sẵn có của cùng người dùng Windows; không đọc hoặc sao chép OAuth token. Quyền dùng model và hạn mức do Google/tài khoản quyết định. Gói Pro không đồng nghĩa API key hoặc hạn mức API.

Mỗi yêu cầu dùng hồ sơ soạn nháp riêng, không cho AI dùng tool/MCP. App tự kiểm tra JSON và quy tắc duyệt/gửi. Nếu hết hạn mức, AI tạm dừng; khi có hạn mức trở lại, bấm **Cho AI chạy lại** và thử lại task cần xử lý.

Giao diện, cấu hình và SQLite nằm local; dữ liệu yêu cầu được gửi tới AI qua mạng. Đóng app/tắt máy sẽ dừng agent. Bản cập nhật giữ dữ liệu `%APPDATA%/jev-bimup-desktop`.

Tài liệu CLI: https://www.antigravity.google/docs/cli/headless/
