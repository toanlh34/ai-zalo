> Bản 0.6.1 bổ sung [MCP quản trị app](MCP.vi.md): tạo/sửa trợ lý, gán AI và quản lý kiến thức từ Codex.

> Bản 0.5.0: **Thiết lập AI** quản lý model/key; **Trợ lý** quản lý hồ sơ, skill và kết nối Zalo riêng. [Hướng dẫn mới](ASSISTANTS.vi.md).

> Bản 0.4.0: đã thêm cửa sổ [Trợ lý & AI](ASSISTANTS.vi.md), hỗ trợ gán nhiều AI và dùng chung kết nối.

# BIMUP Zalo Assistance — ứng dụng Windows

Chạy `release/BIMUP-Zalo-Assistance-Setup-0.6.2.exe` để cài cho tài khoản Windows hiện tại. Sau đó mở **BIMUP Zalo Assistance** ngoài Desktop hoặc Start Menu. Bộ cài kèm [hướng dẫn sử dụng](HUONG-DAN-SU-DUNG.md), không cần cài Node.js hoặc mở terminal. Các nhà cung cấp CLI vẫn cần cài và đăng nhập riêng; API cần key và hạn mức. Cập nhật hoặc gỡ app giữ dữ liệu trong `%APPDATA%/jev-bimup-desktop`.

## Lần đầu sử dụng

1. Vào **Thiết lập AI**, bấm **Tạo kết nối AI**, đặt tên và tự chọn nhà cung cấp/model rồi lưu. Nếu dùng API, nhập key và bấm **Lưu key mã hóa**. App mới không tạo sẵn trợ lý hoặc kết nối. Vào **Trợ lý**, tạo hồ sơ, gán AI và bấm **Dùng trợ lý này** trước khi thiết lập Zalo.
2. Bấm **Đăng nhập bằng QR**, quét bằng tài khoản Zalo riêng của JEV trên điện thoại.
3. Chọn nhóm thử và bấm **Chọn nhóm này**. Tài khoản JEV phải có trong nhóm.
4. Bấm **Ghép tài khoản chủ**. Dùng Zalo cá nhân của anh gửi riêng cho JEV dòng mã hiện trong app. Mã hết hạn sau 5 phút. Có nút hủy nếu muốn dừng chờ QR/ghép chủ.
5. Giữ chế độ **Thử nháp**, về **Tổng quan** và bấm **Chạy agent**. Nhắn tin mới trong nhóm bằng tài khoản khách/chủ để thử.
6. Vào **Hàng chờ & duyệt**. Có thể đọc tin, sửa bản nháp, duyệt, từ chối và thử lại AI. Tin chào đủ điều kiện ở chế độ thử nằm trong bộ lọc **Đã thử nháp**.
7. Khi đã kiểm tra, bấm **Dừng agent**, đổi sang **Gửi thật**, lưu cấu hình và chạy lại. App yêu cầu xác nhận trước khi bật gửi thật. Khi duyệt một bản nháp ở chế độ thật, app cũng xác nhận trước.

## Quản lý hàng ngày

- **Tổng quan**: trạng thái kết nối Zalo, AI đang dùng, số tin chờ và cần duyệt; nút chạy/dừng và tạm ngưng/cho phép gửi.
- **Thiết lập**: chọn AI, lưu key mã hóa trên Windows, QR, chọn nhóm, ghép chủ và mở thư mục kiến thức.
- **Hàng chờ & duyệt**: chọn tin, sửa nội dung gửi khách và duyệt. Khi hết số dư/hạn mức, nạp lại rồi bấm **Cho AI chạy lại**; thử lại từng task review nếu cần.
- **Nhật ký**: hoạt động phiên và 100 báo cáo gần nhất lưu trong DB.

**Đóng app sẽ dừng agent**, kết thúc lượt gửi đang chạy, đóng DB và nhả khóa. Không chạy ẩn trong khay hệ thống và chưa tự chạy cùng Windows. PC cần bật và có mạng. Khi Zalo ngắt kết nối, trạng thái cập nhật trong app; anh có thể bấm chạy lại.

Khi trạng thái tin là **Chưa rõ kết quả**, kiểm tra tin thực tế trên Zalo rồi bấm **Đã kiểm tra · đóng tin**. Không tự gửi lại để tránh trùng tin. Tin đã duyệt trong chế độ thử được lưu như thử nháp, không chuyển thành gửi thật khi bật live sau đó.

## Dữ liệu

App dùng thư mục dữ liệu riêng `%APPDATA%/jev-bimup-desktop` (tên thư mục thực tế xem nút **Mở thư mục dữ liệu**). Không dùng chung DB/phiên với terminal trong thư mục source. Lần đầu app sao chép `agent/` và `knowledge/` làm dữ liệu khởi đầu; các lần sau giữ nguyên tài liệu anh đã sửa ở thư mục dữ liệu app.

Key DeepSeek được mã hóa bằng Windows và không hiển thị lại. Phiên Zalo dùng DPAPI theo người dùng Windows. Nội dung hội thoại trong SQLite chưa mã hóa. Khi chạy, tin và tài liệu được gửi đến nhà cung cấp AI đã chọn, kể cả thử nháp.

## Dành cho phát triển

```powershell
npm install
npm run desktop
npm run build:desktop
npm run build:installer
npm test
npm run test:desktop
node scripts/desktop-smoke.cjs --packaged
```

Build Windows x64 gồm Electron UI và Node runtime riêng. Main process bảo vệ IPC, renderer không có Node hoặc quyền truy cập trực tiếp filesystem. Engine dùng lại hàng chờ/worker/AI của CLI; trao đổi với app qua stdin/stdout, không mở cổng HTTP.

Kiểm tra giao diện dùng dữ liệu giả ở thư mục tạm, không đăng nhập Zalo hoặc gọi AI thật. Bản này chưa kiểm chứng nhận/gửi Zalo thật và DeepSeek thật nếu chưa có tài khoản/key. Không bao gồm tự cập nhật hoặc ký số phát hành.

## Antigravity CLI (0.3.0)

Xem [hướng dẫn Antigravity](ANTIGRAVITY.vi.md). App dùng CLI đã cài, không cần API key.
