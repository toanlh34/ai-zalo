# Điểm tiếp tục — 20/10/2026

## Đích đã chốt với anh

- Cần agent nhận/trả lời thực sự trong Zalo; giữ Claude CLI làm AI. Anh sẽ đăng ký tài khoản Zalo agent sau, nên chưa bắt đầu đăng nhập hoặc kết nối thật trong đợt này.
- Đã nối luồng sản phẩm: `npm run setup` → quét QR tài khoản agent → chọn nhóm → tài khoản chủ gửi mã ghép qua DM → xác nhận cấu hình → `npm run agent -- --dry-run` hoặc `--live`. `npm start` nay cũng chạy agent; listener cũ chuyển sang `npm run listen`.
- Setup không gọi Claude hoặc gửi tin. QR dọn sau đăng nhập; phiên dùng DPAPI. Mã ghép chủ ngẫu nhiên, một lần, 5 phút, chỉ chấp nhận DM đúng người gửi và không nhận tài khoản bot làm chủ. Setup lưu cấu hình nguyên tử, mặc định dry-run, giữ lựa chọn Claude/model cũ.
- Đã có `/jev help`, status/list, approve/reject/retry/close-task, pause/resume/resume-ai trong DM đúng chủ. Router kiểm tra danh tính SDK, loại DM khác trước DB/AI. Biên nhận lệnh và thay trạng thái/báo cáo chung giao dịch; chống thực thi trùng qua khởi động lại.
- Runtime đã tách riêng, dừng nhận trước khi drain worker, hủy CLI qua AbortSignal, đợi gửi đang chạy ghi kết quả rồi mới đóng DB/nhả khóa. Setup/worker dùng chung khóa có token sở hữu; xử lý lỗi socket đến sau stop.
- 71/71 kiểm thử offline đạt; smoke gồm 27 kịch bản. Có kịch bản xuyên suốt QR giả → chọn nhóm → ghép chủ → lưu → nhận nhóm → chủ duyệt qua DM → gửi giả, cùng kiểm thử quyền chủ và graceful shutdown.
- **Chưa online, chưa xác minh Zalo/Claude thật cùng nhau.** Bước cần người dùng: đăng ký tài khoản riêng rồi chạy setup để quét QR; sau đó thử nhóm đã chọn. Không coi test giả là đã triển khai.

## Đã xây

- Provider Claude Code CLI bằng đăng nhập thuê bao; không dùng API key. Giao diện decide() để thay provider về sau (hiện mới triển khai claude-cli).
- Nạp chỉ dẫn, skill hỗ trợ khách hàng và tài liệu Markdown vào system prompt. Đây là nạp nội dung tường minh, không dựa vào tự khám phá skill của CLI.
- Đầu ra có cấu trúc: action/category/reply/reason/report. JEV đề xuất tự gửi hoặc chuyển chủ; ứng dụng kiểm tra trước khi gửi.
- SQLite lưu yêu cầu, quyết định, báo cáo; chống trùng xuyên khởi động, không tự gửi lại khi kết quả không rõ. File ở .private, không đưa lên Git. Nội dung hội thoại/báo cáo DB chưa mã hóa; thư mục có ACL giới hạn người dùng Windows.
- Trạng thái, quyết định, lịch sử và báo cáo được cập nhật bằng giao dịch SQLite; dùng điều kiện trạng thái cũ để tránh duyệt hoặc ghi đè bản nháp đã thay đổi. Đã thử lỗi ghi DB bằng trigger để kiểm chứng rollback.
- Hàng chờ có `maxPendingTasks` mặc định 100 (1–10000), tính cả review/uncertain trên toàn DB. Tin trùng vẫn được nhận diện khi đầy. Tin mới vượt giới hạn không được lưu/xử lý; terminal cảnh báo và cần gửi lại bằng tin mới khi có chỗ. Không có tự dọn DB cũ.
- Lịch sử có vai trò user/assistant, chỉ ghi câu JEV đã xác nhận gửi. Ngữ cảnh giới hạn tổng số tin, không lặp tin hiện tại hoặc lẫn yêu cầu xếp sau. Có nâng DB cũ, phục hồi bot chỉ từ task sent; không khôi phục được mốc gửi chính xác của bot cũ.
- Khi Claude hết hạn mức, lưu trạng thái tạm dừng AI qua khởi động lại; giữ tin sau trong hàng chờ, không gọi provider liên tục. `resume-ai` cho phép chạy lại; `retry <id>` chỉ xếp lại review và bỏ nháp cũ, không tự bỏ dừng AI.
- Chế độ dry-run không gửi bất cứ tin nào. Live có gửi đúng nhóm và báo cáo riêng tới ownerUserId. Hiện chỉ chào hỏi đơn giản nằm trong phạm vi tự gửi mặc định; còn lại chuyển chủ.
- Lệnh quản lý cục bộ: `npm run jev -- help`, `status`, `list`, `reports`, `approve <task-id> [nội dung thay thế]`, `reject <task-id>`, `retry <task-id>`, `close-task <task-id>`, `pause`, `resume`, `resume-ai`. `help` không cần SDK/phiên Zalo; SDK chỉ nạp khi chạy listener.
- MCP mặc định trống; có cấu hình server và danh sách công cụ. Chưa tích hợp MCP BIMUP thật. Không cấp công cụ Bash/đọc/ghi file cho CLI mặc định.

## Kiểm thử và giới hạn

- 71/71 kiểm thử offline đạt. Có guard chặn API mạng và executable ngoài Node/test cleanup; không gọi Claude, không kết nối Zalo, không đọc cấu hình/phiên thật. Xem reports/OFFLINE_TEST_REPORT.md. Trường hợp rename thay file cấu hình bị sandbox Windows trả EPERM đã được xác minh ngoài sandbox với guard mạng: đạt, không đổi cơ chế lưu nguyên tử.
- `npm test` / `npm run test:offline` chạy toàn bộ; `npm run smoke` mặc định chạy 27 kịch bản offline. Kiểm tra provider thật cũ chỉ còn ở lệnh riêng `npm run smoke:claude`, không chạy trong đợt này.
- Đã chạy tiến trình con thật với DB giả, dừng cưỡng bức tại thinking và sending, rồi mở lại DB: thinking về review; sending về uncertain, không gọi AI/gửi lại. Luồng gửi giả cố ý ghi tác động trước khi bị dừng để mô phỏng đã gửi nhưng chưa ghi trạng thái.
- Kiểm thử ghép luồng phát hiện và đã sửa: tin quá dài bị cắt mất phần nghiệp vụ có thể bị coi là chào hỏi. Inbox nay ghi cờ truncated; worker không tự gửi bất kỳ tin bị cắt nào và báo chủ xem bản đầy đủ. Kiểm thử đã thất bại trước sửa và đạt sau sửa.
- Lệnh quản lý được tách thành src/commands.mjs, dùng chung giữa CLI thật và kiểm thử ghép luồng; không cần giả lập lại logic duyệt trong test.
- Đã cài 31 gói theo package-lock.json tại thư mục hiện tại bằng `npm ci --ignore-scripts`; `npm ls --depth=0` xác nhận zca-js@2.1.2. Không chạy lifecycle script, chưa đăng nhập Zalo.
- Đã sửa khởi chạy trên Windows: tìm executable thật hoặc entry JavaScript của gói npm Claude Code thay vì chạy shim `.cmd`/`.ps1`. Giữ `shell:false`; không đổi sang chạy lệnh qua shell.
- Đầu ra UTF-8 được giải mã đúng khi ký tự tiếng Việt bị chia giữa các chunk. Dừng CLI khi timeout có phương án trực tiếp nếu `taskkill` không chạy được; tiến trình thử có thời gian sống 60 giây đã kết thúc trong dưới 1 giây.
- Lỗi khởi chạy, mã thoát, JSON sai, thiếu/sai quyết định, timeout và hạn mức có mã lỗi riêng. Không đưa stdout/stderr thô vào lỗi; chẩn đoán chỉ dùng nhãn cố định.
- Claude Code đang tìm thấy trên PATH là 2.1.303. Đã xác minh lời gọi CLI đi tới dịch vụ bằng dữ liệu hoàn toàn giả; không lưu thông tin định danh vào repo.
- **Kết quả gọi Claude thật ở đợt trước: HTTP 429, `api_error=usage_limit_reached`, dịch vụ thông báo mở lại 14:00 ngày 22/10/2026, Asia/Bangkok. Chưa kiểm tra quyết định từ provider thật thành công; không lấy hạn mức Claude làm điều kiện cho bộ kiểm thử offline. Không bật live.**
- Lệnh riêng `npm run smoke:claude` có gọi dịch vụ Claude với chỉ dẫn/tin giả trong thư mục tạm. Chỉ chạy khi có yêu cầu kiểm tra provider thật; không dùng trong lần tự test hiện tại.
- Chưa đăng nhập hoặc thử Zalo thật; chưa gửi khách, chưa báo cáo DM thật.
- Cấu hình cá nhân hiện tại giữ nguyên; cần điền ownerUserId và thêm các trường trong config.example.json khi tiếp tục.
- Duyệt qua terminal hoặc tin DM của chủ đã ghép. Báo cáo/phản hồi DM chỉ gửi ở live; dry-run vẫn nhận lệnh chủ nhưng chỉ lưu phản hồi trong DB.
- Nếu worker chết đột ngột, kiểm tra tiến trình rồi mới xóa `.private/worker.lock`; thinking chuyển review, sending chuyển uncertain khi khởi động lại. Không retry uncertain; kiểm tra Zalo rồi `close-task <id>` để đóng mà không gửi lại. Các task review từng được khôi phục bởi bản cũ cần kiểm tra thực tế trước khi retry/approve vì bản cũ chưa phân biệt sending bị gián đoạn.
- Pause dừng gửi khách, không dừng nhận tin/AI hay báo cáo. Mỗi lượt lấy tối đa 10 báo cáo và nhận quyền gửi bằng điều kiện trạng thái pending; báo cáo đang gửi khi gián đoạn thành uncertain.
- Graceful shutdown đã kiểm thử với SDK/CLI giả khi AI chờ, khi đang gửi và khi listener đóng. Còn kiểm thử toàn bộ luồng với Zalo/Claude thật, MCP/quyền thật; chưa có tự khởi động cùng Windows hoặc chính sách dọn/mã hóa DB.

## Chạy tiếp

1. Tiếp tục phát triển và chạy `npm run smoke` / `npm test` hoàn toàn offline, không chờ hoặc gọi Claude.
2. Anh đăng ký tài khoản Zalo agent, kết bạn với chủ, tạo nhóm thử; chạy `npm run setup`. Luồng này lấy nhóm/chủ trực tiếp từ Zalo, không cần nhập ID thủ công.
3. Sau setup, chạy `npm run agent -- --dry-run`; thử tin và kiểm tra list/reports. Khi bật trả lời thật: `npm run agent -- --live`, chủ điều khiển qua `/jev help` trong DM. Giữ Claude CLI như đã chọn; nếu provider còn quota lỗi thì xử lý trạng thái AI, không báo agent đã trả lời thật.
4. Nếu worker thật từng bị dừng AI do hạn mức, chỉ resume-ai sau khi provider hoạt động trở lại; review có thể retry, uncertain phải kiểm tra thực tế và không tự gửi lại.
