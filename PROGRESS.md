# Điểm tiếp tục — 20/10/2026

## Đã xây

- Provider Claude Code CLI bằng đăng nhập thuê bao; không dùng API key. Giao diện decide() để thay provider về sau (hiện mới triển khai claude-cli).
- Nạp chỉ dẫn, skill hỗ trợ khách hàng và tài liệu Markdown vào system prompt. Đây là nạp nội dung tường minh, không dựa vào tự khám phá skill của CLI.
- Đầu ra có cấu trúc: action/category/reply/reason/report. JEV đề xuất tự gửi hoặc chuyển chủ; ứng dụng kiểm tra trước khi gửi.
- SQLite lưu yêu cầu, quyết định, báo cáo; chống trùng xuyên khởi động, không tự gửi lại khi kết quả không rõ. File ở .private, không đưa lên Git. Nội dung hội thoại/báo cáo DB chưa mã hóa; thư mục có ACL giới hạn người dùng Windows.
- Chế độ dry-run không gửi bất cứ tin nào. Live có gửi đúng nhóm và báo cáo riêng tới ownerUserId. Hiện chỉ chào hỏi đơn giản nằm trong phạm vi tự gửi mặc định; còn lại chuyển chủ.
- Lệnh quản lý cục bộ: `npm run jev -- list`, `reports`, `approve <task-id> [nội dung thay thế]`, `reject <task-id>`, `pause`, `resume`.
- MCP mặc định trống; có cấu hình server và danh sách công cụ. Chưa tích hợp MCP BIMUP thật. Không cấp công cụ Bash/đọc/ghi file cho CLI mặc định.

## Kiểm thử và giới hạn

- 11/11 kiểm thử tự động đạt: lọc tin, quyết định, báo chủ, duyệt, thử khô, chống trùng, lỗi AI và gửi không rõ kết quả.
- Kiểm tra cú pháp jev.mjs đạt.
- Claude Code 2.1.304 có sẵn, đăng nhập thuê bao được xác nhận; không lưu thông tin định danh vào repo.
- **Smoke test `node src/smoke.mjs` dùng tin giả thất bại: `Claude CLI failed or invalid JSON`. Cần chẩn đoán cờ CLI/đầu ra trước khi coi provider hoạt động. Không bật live.**
- Chưa đăng nhập hoặc thử Zalo thật; chưa gửi khách, chưa báo cáo DM thật.
- Cấu hình cá nhân hiện tại giữ nguyên; cần điền ownerUserId và thêm các trường trong config.example.json khi tiếp tục.
- Điều khiển duyệt hiện qua terminal trên máy chủ, chưa nhận lệnh duyệt từ tin nhắn Zalo. Báo cáo DM chỉ gửi ở live; dry-run xem terminal/DB.
- Nếu worker chết đột ngột, kiểm tra tiến trình rồi mới xóa `.private/worker.lock`; trạng thái thinking/sending được chuyển review khi khởi động lại. Pause dừng gửi khách, không dừng nhận tin/AI hay báo cáo.
- Cần hoàn thiện giao dịch nguyên tử giữa thay trạng thái và tạo báo cáo, kiểm soát số lượng hàng chờ, lưu ngữ cảnh có phản hồi bot, và kiểm thử MCP/quyền trước dùng thực tế.

## Chạy tiếp

1. Sửa smoke test Claude CLI trước: `node src/smoke.mjs` (chỉ dữ liệu giả, không Zalo).
2. Chạy `npm test`.
3. Đăng nhập Zalo bằng `npm run login`, cấu hình đúng ID nhóm thử và ID chủ.
4. Chọn mode=dry-run, chạy `npm run jev`; kiểm tra báo cáo và bản nháp.
5. Chỉ bật mode=live sau khi xác minh toàn bộ luồng với tài khoản/nhóm thử.
