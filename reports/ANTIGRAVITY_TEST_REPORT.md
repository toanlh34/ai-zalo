# Antigravity CLI — 0.3.0

Ngày kiểm tra: 21/10/2026.

- Offline suite: 112 kiểm thử đạt, chạy bằng `node --import ./scripts/offline-guard.mjs --test --test-reporter=dot`.
- Portable UI: `node scripts/desktop-smoke.cjs --portable` đạt; khởi động, lưu key mã hóa, chọn API/CLI, phát hiện CLI, validation, duyệt bản nháp sửa và điều hướng. Dùng dữ liệu giả trong thư mục tạm.
- CLI thật: đã nhận quyết định JSON hợp lệ cho lời chào giả bằng Antigravity, hồ sơ tools/MCP rỗng, dùng phiên đăng nhập có sẵn. Không gửi Zalo.
- Adapter: kiểm thử phân mảnh UTF-8, JSON sai, schema sai, quota/auth, thiếu CLI, timeout, cancel, output limit, tool attempt và xóa profile tạm.
- Giới hạn: chưa kiểm thử nhận/gửi Zalo thật với tài khoản khách, chưa có Teams trong bản này. File Windows chưa có chữ ký phát hành riêng.
