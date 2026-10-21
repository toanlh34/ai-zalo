# Kiểm tra bộ cài BIMUP Zalo Assistance 0.6.2

Ngày kiểm tra: 21/10/2026 (Asia/Bangkok). Nền tảng: Windows x64.

## Bản phát hành

- `BIMUP-Zalo-Assistance-Setup-0.6.2.exe`, NSIS assisted, giao diện tiếng Việt.
- Metadata bộ cài: ProductName `BIMUP Zalo Assistance`, ProductVersion `0.6.2`.
- Version đồng nhất trong package.json gốc, package-lock.json và desktop/package.json.
- Có runtime Node, engine và dependencies kèm theo; hướng dẫn HTML/Markdown và launcher MCP trong thư mục cài.
- Nội dung hướng dẫn và launcher trong gói trùng SHA-256 với nguồn cuối cùng.
- Bộ cài nội bộ chưa ký số (`NotSigned`).

## Kết quả

1. `npm test`: **138/138 đạt**, không gọi AI hoặc Zalo thật.
2. Hướng dẫn HTML: đã xem bản render desktop/mobile, không tràn ngang, mục lục hoạt động, không dùng JavaScript hoặc tài nguyên ngoài.
3. Cài/gỡ: **đạt**. Dùng bộ cài kiểm thử với appId, tên sản phẩm, tên executable riêng và không tạo shortcut sản phẩm thật. Payload app.asar và tài liệu trùng SHA-256 với bản phát hành.
4. App sau cài: **đạt**. Khởi động rỗng, kết nối AI được tạo tường minh, key mã hóa, MCP qua launcher kèm bộ cài, gán trợ lý, duyệt nháp, xóa trợ lý đang chọn/cuối cùng, giữ lịch sử/tài liệu và mở lại không tạo mặc định. Không có lỗi JavaScript giao diện.
5. Gỡ bản kiểm thử: **đạt**. Executable đã được gỡ, dữ liệu kiểm thử và sentinel vẫn còn. Hash toàn bộ dữ liệu app thật cùng registry NSIS của app thật không thay đổi.

Lệnh tái hiện sau khi build bộ cài kiểm thử có định danh riêng:

```powershell
./scripts/installer-smoke.ps1 -InstallerPath '<workspace>/.installer-test/release/BIMUP-Zalo-Installer-Smoke-0.6.2.exe' -InstallDirectory '<workspace>/.installer-test/installed'
```

Chưa thực hiện đăng nhập AI/Zalo thật hoặc gửi tin thật trong đợt đóng gói này.
