> Bản 0.5.0: **Thiết lập AI** quản lý model/key; **Trợ lý** quản lý hồ sơ, skill và kết nối Zalo riêng. [Hướng dẫn mới](ASSISTANTS.vi.md).

> Bản 0.4.0: đã thêm cửa sổ [Trợ lý & AI](ASSISTANTS.vi.md), hỗ trợ gán nhiều AI và dùng chung kết nối.

# BIMUP Zalo Assistance

**Phiên bản 0.3.0:** đã tích hợp Antigravity CLI cho tài khoản Google và nút thử kết nối AI. Xem [cách dùng Antigravity](ANTIGRAVITY.vi.md).

## App Windows

Đã có giao diện desktop để xem trạng thái, chọn AI, lưu key, quét QR, chọn nhóm, ghép chủ, bật/dừng và duyệt bản nháp. Mở `release/BIMUP-Zalo-Assistance-0.5.0-Windows.exe`; không cần terminal để vận hành. Xem [hướng dẫn app Windows](DESKTOP.vi.md). Đóng cửa sổ sẽ dừng agent. Các lệnh bên dưới vẫn dành cho cách chạy CLI.

## Bổ sung DeepSeek

JEV hỗ trợ hai provider: `claude-cli` (giữ cách đăng nhập cũ) và `deepseek` (API key riêng). Khi `npm run setup`, chọn `deepseek`; setup vẫn lưu mode=dry-run. Xem [cấu trúc chương trình](ARCHITECTURE.vi.md) để hiểu vai trò Zalo, chương trình trên PC và AI.

Lần cài đầu cần Node.js >=22 và chạy `npm ci --ignore-scripts`. Trong PowerShell 7, nhập key ẩn vào môi trường của terminal đang chạy, không viết key vào lệnh hoặc file config:

```powershell
$env:DEEPSEEK_API_KEY = Read-Host 'DeepSeek API key' -MaskInput
npm run setup
npm run agent -- --dry-run
```

Biến chỉ tồn tại trong phiên terminal này; mở terminal mới cần nhập lại. Sau khi xem nháp (`npm run jev -- reports`), Ctrl+C rồi `npm run agent -- --live` để bật gửi. Tin nhóm và tài liệu `knowledge/` sẽ gửi đến DeepSeek khi dùng provider này, kể cả dry-run. API cần key và số dư; không dùng phiên đăng nhập web DeepSeek.

Nếu đã setup Zalo trước đó, có thể sửa riêng phần `ai` trong `config.json` thành:

```json
{
  "provider": "deepseek",
  "model": "deepseek-flash",
  "apiKeyEnv": "DEEPSEEK_API_KEY",
  "timeoutMs": 120000,
  "mcpServers": {},
  "allowedMcpTools": []
}
```

Đây là giá trị của trường `ai`, không thay toàn bộ config (cần giữ ID nhóm/chủ và mode). DeepSeek hiện chỉ dùng tin văn bản và tài liệu, chưa hỗ trợ MCP. HTTP 402/429 tạm dừng AI và giữ task để chủ xử lý; có số dư/hạn mức trở lại thì dùng `/jev resume-ai`, rồi `/jev retry <id>` nếu cần. Bản nháp sai JSON hoặc lỗi mạng chuyển review và không gửi khách.

Endpoint/model theo [tài liệu DeepSeek](https://api-docs.deepseek.com/). Adapter dùng JSON output và kiểm tra lại quyết định trong chương trình. Các test DeepSeek giả lập HTTP; chưa xác minh API thật nếu chưa có key.

JEV chạy trên PC Windows, dùng Claude CLI đã đăng nhập hoặc DeepSeek API để đọc tin nhóm, soạn trả lời và báo chủ qua tin riêng. Chủ duyệt hoặc điều khiển ngay trong Zalo. Hiện đã xây luồng thiết lập/chạy; **chưa online vì tài khoản Zalo agent sẽ được đăng ký sau**. Chưa xác minh AI và Zalo thật trả lời thành công cùng nhau.

## Khi đã có tài khoản Zalo riêng

1. Đăng ký tài khoản cho agent trên điện thoại. Kết bạn với tài khoản cá nhân của chủ; tạo một nhóm thử và thêm cả hai tài khoản.
2. Trên PC, vào thư mục dự án và chạy:

```powershell
npm run setup
```

3. Quét QR bằng **tài khoản agent**. QR được mở trên máy Windows và xóa sau đăng nhập. Nếu đã có phiên, setup cho chọn dùng lại; phiên hỏng sẽ chuyển sang QR mới.
4. Chọn nhóm theo danh sách. Dùng **tài khoản chủ** nhắn riêng vào agent dòng `/jev pair <mã>` đang hiện trên terminal. Mã dùng một lần, hết hạn sau 5 phút. Không gửi mã vào nhóm. Xác nhận nhóm/chủ trên terminal bằng `LUU`.
5. Setup lưu cấu hình với Claude CLI và mode=dry-run. Chạy để xem bản nháp trước:

```powershell
npm run agent -- --dry-run
```

Dry-run có kết nối Zalo và có gọi Claude với tin nhóm/tài liệu kiến thức, nhưng **không gửi tin nhóm hoặc phản hồi DM**. Xem `npm run jev -- list` / `reports`, Ctrl+C để dừng.
6. Để bật trả lời thật đúng nhóm vừa chọn:

```powershell
npm run agent -- --live
# hoặc:
npm start -- --live
```

Cờ mode chỉ áp dụng cho lần chạy đó; file cấu hình vẫn giữ dry-run từ setup. Giữ PC và tiến trình này chạy; đây chưa phải dịch vụ tự khởi động hoặc máy chủ chạy 24/7.

## Agent làm gì

- Chỉ nhận văn bản mới trong đúng nhóm đã chọn; không đọc lại lịch sử Zalo hoặc tải ảnh/tệp.
- Dùng chỉ dẫn trong `agent/`, tài liệu Markdown trong `knowledge/` và ngữ cảnh nhóm để gọi Claude CLI. Không sao chép token/OAuth; không dùng API key.
- Mặc định chỉ tự gửi lời chào đơn giản. Câu hỏi nghiệp vụ, giá, giảm giá hoặc trường hợp không chắc tạo bản nháp và báo chủ để duyệt. Cần bổ sung kiến thức thật vào `knowledge/` để trợ lý biết nội dung BIMUP.
- Chỉ ghi câu JEV đã xác nhận gửi vào lịch sử bot. Bản nháp/thử khô/gửi chưa rõ kết quả không được coi là câu đã gửi.
- Báo cáo nội bộ chỉ gửi riêng cho chủ, không ghép vào câu trả lời khách.

## Chủ điều khiển qua tin riêng

Khi agent chạy live, dùng tài khoản đã ghép nhắn riêng cho agent. Lệnh trong nhóm hoặc từ người khác không có quyền điều khiển. Tin lệnh không được chuyển cho Claude. Trong dry-run, lệnh vẫn có thể cập nhật trạng thái nhưng phản hồi chỉ lưu cục bộ.

| Tin riêng | Tác dụng |
| --- | --- |
| `/jev help` | Xem trợ giúp. |
| `/jev status` | Xem hàng chờ, trạng thái AI và báo cáo chờ. |
| `/jev list` | Xem 10 task gần nhất và ID để duyệt. |
| `/jev approve <id>` | Duyệt bản nháp đang review. |
| `/jev approve <id> <câu trả lời>` | Chủ thay nội dung rồi duyệt. Cũng dùng được khi AI lỗi chưa có nháp. |
| `/jev reject <id>` | Từ chối review, giải phóng chỗ hàng chờ. |
| `/jev pause` / `/jev resume` | Dừng / cho phép gửi khách; không dừng AI hoặc báo cáo cho chủ. |
| `/jev resume-ai` | Cho phép gọi AI lại sau khi provider hoạt động trở lại. |
| `/jev retry <id>` | Xếp lại review và bỏ nháp cũ, có thể tự gửi theo mode/quy tắc hiện tại. |
| `/jev close-task <id>` | Sau khi kiểm tra thực tế, đóng uncertain mà không gửi lại. |

ID task được ghi đầu báo cáo, ví dụ `[JEV 123:456]`. Chép `123:456` vào lệnh duyệt. Lệnh có biên nhận trong SQLite nên replay cùng tin nhắn không thực thi lại, kể cả sau khởi động lại. Phản hồi của chủ và quyết định được lưu cùng giao dịch; phản hồi gửi lỗi/không rõ kết quả không tự gửi lại.

Các lệnh tương đương vẫn dùng được cục bộ qua `npm run jev -- <lệnh>`. `npm run jev -- reports` xem tối đa 100 báo cáo gần nhất. `npm run agent -- --help` và `npm run setup -- --help` không đăng nhập hay kết nối dịch vụ.

## Hàng chờ, gián đoạn và hạn mức

- `maxPendingTasks` mặc định 100 (số nguyên 1–10000), tính toàn DB với queued/thinking/approved/sending/review/uncertain. Khi đầy, tin mới **không được lưu hoặc xử lý**; terminal cảnh báo. Xử lý tồn đọng rồi gửi lại bằng tin mới. Chưa có tự dọn DB cũ.
- `contextLimit` mặc định 30 (1–100), tính tổng lịch sử khách và JEV. Không lặp tin hiện tại hoặc đưa yêu cầu xếp sau vào ngữ cảnh của yêu cầu trước.
- Tin dài hơn 8.000 ký tự bị rút gọn và luôn cần chủ duyệt.
- Claude hết hạn mức: task hiện tại vào review, AI tạm dừng qua khởi động lại; tin tiếp theo vẫn xếp hàng trong giới hạn. Chủ vẫn điều khiển/soạn câu duyệt được. Chỉ resume-ai khi provider hoạt động trở lại.
- Ctrl+C khi runtime đang chạy sẽ ngừng nhận tin, hủy yêu cầu Claude đang chờ, đợi lượt gửi đang thực hiện ghi kết quả rồi đóng DB/nhả khóa; không khởi động worker mới chồng lên worker chưa dừng.
- Sau dừng cưỡng bức, thinking thành review; sending hoặc báo cáo đang gửi thành uncertain. Không retry uncertain; kiểm tra Zalo thực tế trước khi close-task.
- Nếu báo worker.lock đã tồn tại, kiểm tra PID trong file và tiến trình cũ trước khi xóa khóa. Setup và agent dùng cùng khóa, không tự xóa khóa của nhau.
- DB cũ được nâng thêm bảng khi mở, giữ task/báo cáo và phục hồi lịch sử bot chỉ từ sent. Bot cũ không có mốc gửi chính xác.

## Dữ liệu và quyền

Phiên nằm ở `.private/session.dpapi`, mã hóa bằng Windows DPAPI theo người dùng Windows hiện tại. Thư mục .private giới hạn ACL; nội dung hội thoại/nháp/báo cáo trong SQLite hiện **chưa mã hóa**. Không đưa phiên, QR, config cá nhân hoặc log hội thoại lên Git/chat. File tạm của cấu hình cũng được bỏ qua trong Git.

SDK kết nối cấp tài khoản có thể đưa tin cuộc trò chuyện khác vào bộ nhớ; router loại chúng trước ghi DB/gọi AI. Ngoại lệ là lệnh DM đúng tài khoản chủ, được xử lý riêng. Tin của nhóm được chọn và tài liệu Markdown dự án sẽ gửi tới Claude khi chạy agent, kể cả dry-run. Công cụ CLI mặc định trống; chưa tích hợp MCP BIMUP thật.

## Kiểm thử và công cụ phụ

`npm test` / `npm run test:offline`: **71 kiểm thử offline**. `npm run smoke`: **27 kiểm thử onboarding, runtime và ghép luồng**. Chỉ dùng dữ liệu/QR/transport/CLI giả và DB tạm; guard chặn mạng/executable ngoài Node/test cleanup. Không gọi Claude hay Zalo thật. Các thông báo quota/DM lỗi trong output là tình huống giả có chủ đích.

Xem [báo cáo kiểm thử](reports/OFFLINE_TEST_REPORT.md) và [điểm tiếp tục](PROGRESS.md). Kiểm tra provider thật riêng bằng `npm run smoke:claude` không nằm trong test/smoke và chưa được chạy lại trong đợt này.

`npm run listen` là bản listener chỉ nhận tin ban đầu. `npm run login` / `groups` là công cụ QR/danh sách nhóm riêng; luồng agent chính là setup → agent, không cần sửa ID bằng tay.

Đã cài theo package-lock.json với `npm ci --ignore-scripts`; zca-js@2.1.2. Đã kiểm thử trên Node.js 24.15.0, Windows. Thư viện Zalo là zca-js không chính thức; trạng thái nhận/gửi thật chỉ được xác minh khi đăng nhập tài khoản của anh và thử trong nhóm riêng.

Khảo sát mở rộng Teams: [phương án và các bước triển khai](TEAMS_RESEARCH.vi.md). Teams chưa nằm trong bản 0.3.0.
