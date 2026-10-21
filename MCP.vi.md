# MCP quản trị BIMUP Zalo Assistance — 0.6.0

MCP này dành cho Codex/AI quản trị **app**, khác với việc cấp MCP tool cho Antigravity khi trả lời khách. Antigravity vẫn dùng hồ sơ soạn nháp không có tool/MCP.

## Công cụ

- `app_status`, `list_ai_connections`, `list_assistants`, `get_assistant`.
- `save_ai_connection`: tạo/sửa tên, provider và model; không nhận API key.
- `save_assistant`: tạo/sửa tên, tuổi, tính cách, vai trò, skill, AI được gán và chiến lược.
- `activate_assistant`: chuyển trợ lý khi agent dừng, luôn về thử nháp.
- `delete_assistant`, `delete_ai_connection`: giữ quy tắc không xóa trợ lý mặc định/đang chọn hoặc AI đang dùng; tài liệu và lịch sử trợ lý vẫn còn trên máy.
- `list_knowledge`, `read_knowledge`, `write_knowledge`: tài liệu Markdown trong thư mục riêng của từng trợ lý.
- `test_assistant`: dùng tin giả, có gọi AI và tiêu thụ hạn mức, không gửi Zalo.

Không có công cụ chạy shell, xuất API key/cookie, tự quét QR, bật agent gửi thật hay gửi tin Zalo. QR và ghép chủ vẫn thực hiện trên giao diện.

## Kết nối Codex

App cần đang mở. Server MCP dùng stdio, nối đến bộ điều khiển app qua loopback có token theo phiên. Token chỉ lưu trong thư mục `.private` được giới hạn cho người dùng Windows; không đưa token vào cấu hình Codex. Đóng app sẽ đóng bridge và xóa descriptor.

Sau khi cài, cấu hình MCP Codex có tên **bimup-zalo-assistance**. Mở phiên Codex mới hoặc khởi động lại Codex để nạp cấu hình mới nếu công cụ chưa xuất hiện. Có thể kiểm tra bằng `codex mcp get bimup-zalo-assistance`.

Lệnh mẫu để đăng ký thủ công:

```powershell
codex mcp add bimup-zalo-assistance -- "<node.exe đã cài kèm app>" "<thư mục cài>/mcp-launcher.cjs"
```

Launcher đọc `installation.json` để tìm engine của phiên bản đang cài, không mở trực tiếp SQLite và không tạo một worker Zalo thứ hai. Các thay đổi qua MCP dùng cùng controller với giao diện, hiện ngay trong app. App phải dừng agent trước khi sửa cấu hình hoặc tài liệu.

Tài liệu cấu hình Codex chính thức: https://learn.chatgpt.com/docs/extend/mcp?surface=cli
SDK/giao thức: https://modelcontextprotocol.io/docs/develop/build-server
