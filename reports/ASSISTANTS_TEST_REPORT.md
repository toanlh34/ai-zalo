# Quản lý trợ lý — 0.4.0

Ngày 21/10/2026.

- 118 kiểm thử offline đạt, gồm lưu/đọc lại quan hệ nhiều-nhiều, thứ tự ưu tiên, primary/fallback/round-robin, không chuyển AI khi auth/JSON/tool/cancel lỗi, không mượn API key khác, tách kiến thức, hàng chờ và pause state, chuyển trợ lý về dry-run, không lộ key trong snapshot.
- UI smoke phát triển đạt: tạo kết nối AI, lưu key mã hóa, tạo trợ lý dùng hai AI, kích hoạt và chuyển lại trợ lý mặc định; các bước chọn provider, lưu key cũ, duyệt nháp và điều hướng vẫn đạt.
- Smoke file portable 0.4.0 cũng đạt với cùng luồng; đã cài thư mục phiên bản riêng và cập nhật shortcut Desktop/Start Menu, giữ nguyên dữ liệu app cũ.
- Dùng dữ liệu giả/thư mục tạm; không gửi Zalo, không gọi AI thật trong smoke quản lý.
- Chưa kiểm chứng nhiều API account thật, chưa kiểm chứng nhận/gửi Zalo thật trong luồng đa trợ lý. Chỉ một trợ lý hoạt động trên kết nối Zalo hiện có.
