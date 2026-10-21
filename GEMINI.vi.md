> Bản 0.3.0 đã bổ sung Antigravity CLI. Dùng [hướng dẫn mới](ANTIGRAVITY.vi.md); phần Gemini CLI bên dưới là lịch sử, không dùng để đăng nhập mới.

> Cập nhật 0.2.2: Google đã ngừng đăng nhập Gemini CLI bằng tài khoản cá nhân/AI Pro từ 18/06/2026. Phần hướng dẫn CLI cũ bên dưới không còn áp dụng. App chặn provider này và chưa hỗ trợ Antigravity. Dùng Gemini API bằng key để tiếp tục.

# Gemini trong JEV 0.2.0

App có hai lựa chọn riêng trong **Thiết lập → Nhà cung cấp**. Các phiên Zalo, nhóm, chủ và dữ liệu hiện có được giữ lại khi cập nhật app. Không cần gỡ bản cũ hoặc nhập lại key DeepSeek.

## Gemini API

1. Dừng agent nếu đang chạy.
2. Chọn **Gemini API**. Model mặc định là `gemini-3.8-flash`; có thể sửa theo model tài khoản được cấp quyền.
3. Nhập Gemini API key từ Google AI Studio và bấm **Lưu key an toàn**. Key được mã hóa bằng Windows, lưu riêng với DeepSeek.
4. Chọn **Thử nháp**, bấm **Lưu cấu hình AI**, rồi chạy agent từ Tổng quan.

API dùng key và hạn mức/billing của Google AI Studio. Gói Google AI Pro và Google Cloud credits cần được kích hoạt đúng tài khoản/project; JEV không tự kích hoạt hoặc xác nhận quyền lợi thuê bao. API key không được hiển thị lại hoặc đưa vào config/log.

## Gemini CLI — tài khoản Google

Chọn **Gemini CLI · tài khoản Google** nếu đã cài Gemini CLI chính thức và đăng nhập Google trên cùng người dùng Windows. Không cần nhập API key. Có nút **Kiểm tra Gemini CLI** trong app để xem chương trình đã được tìm thấy chưa; nút này không gọi AI và không xác minh hạn mức hoặc phiên đăng nhập.

Cài đặt/đăng nhập một lần, theo tài liệu Gemini CLI:

```powershell
npm install -g @google/gemini-cli
gemini
```

Chọn **Sign in with Google**, dùng tài khoản đã mua Pro nếu muốn dùng quyền lợi CLI của gói. Sau khi đăng nhập, đóng CLI và mở lại JEV để cập nhật PATH nếu vừa cài. Để trống model để Gemini CLI chọn mặc định, rồi lưu cấu hình và chạy bằng các nút trong JEV.

JEV gọi CLI bằng tiến trình ẩn, sử dụng phiên đăng nhập đã lưu. Không sao chép OAuth token và không tự chuyển sang API key. Nếu CLI cũ không hỗ trợ các cờ chạy hiện tại, cần cập nhật Gemini CLI. Gemini CLI hiện không được gói sẵn vào file JEV; Gemini API không cần cài CLI.

## Giới hạn của tích hợp hiện tại

- Hai chế độ đều nhận văn bản nhóm và tài liệu Markdown trong `knowledge/` để soạn bản nháp. Quy tắc duyệt/gửi, dry-run và hàng chờ không thay đổi.
- Khi Google báo HTTP 429/hết quota, AI tạm dừng và task vào review. Sau khi hạn mức khôi phục, bấm **Cho AI chạy lại**, rồi thử lại task nếu cần.
- Lỗi auth, JSON, đầu ra bị chặn hoặc bị cắt ngắn không được gửi cho khách.
- **Gemini trong JEV chưa bật MCP.** Gemini CLI độc lập có khả năng dùng MCP, nhưng adapter này chỉ soạn trả lời, tắt công cụ/MCP/extensions/hook trong lượt xử lý tin khách. Không tự dùng các MCP toàn cục của tài khoản. Việc nối MCP BIMUP cần thiết kế và cấp quyền riêng.
- Chưa kiểm chứng gọi Gemini thật khi chưa có API key hoặc phiên Google thật. Các test dùng HTTP và CLI giả; test giao diện chỉ dùng key tổng hợp.

CLI truyền cấu hình system cho từng lượt, policy từ chối công cụ, và system prompt từ tài liệu JEV. Các file ngữ cảnh tạm trong `.private/` được xóa khi lượt kết thúc; nếu app bị dừng cưỡng bức, chúng có thể còn trên máy. Nội dung tin nhóm/tài liệu vẫn gửi đến Google khi chạy, kể cả thử nháp.

Tài liệu chính thức: [Gemini API structured output](https://ai.google.dev/gemini-api/docs/generate-content/structured-output), [Gemini CLI đăng nhập](https://geminicli.com/docs/get-started/authentication/), [chạy CLI headless](https://geminicli.com/docs/cli/headless/), [CLI policy](https://geminicli.com/docs/reference/policy-engine/).
