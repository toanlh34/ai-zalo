# Kết quả đọc mã nguồn Zalo — 20/10/2026

## Phiên bản đã đọc

Các repo đã clone về máy, không chỉ đọc README:

| Repo | Commit |
|---|---|
| ChickenAI/zalo-node | b08c2f17f9733ce045fe93f7a833dd44ccf1b684 |
| toannguyen1412/zalo-api | e6d6074feffb941db2c1e45fe0dc2f946952a0e3 |
| ChickenAI/multizlogin | 655db95499c38f7da7dd45a8c35805ba95ce0cf4 |

Đường dẫn dưới đây tính từ thư mục `C:\Setups\zalo-local-lab`. Có thể đối chiếu bản GitHub bằng URL blob gắn commit ở trên.

## Giấy phép thực tế

- `zalo-node/LICENSE.md`: nội dung MIT, copyright 2022 n8n; `package.json` cũng khai MIT. Tên n8n trong copyright có dấu vết template, không tự chứng minh toàn bộ nguồn gốc tác quyền.
- `zalo-api/LICENSE`: MIT, copyright 2024–2025 RFS-ADRENO, truong9c2208, JustKemForFun.
- `multizlogin/LICENSE`: MIT, copyright 2025 MultiZLogin.
- MIT cho phép dùng/sửa/phân phối, kể cả thương mại, với điều kiện giữ thông báo bản quyền và giấy phép trong bản sao/phần đáng kể; phần mềm không bảo hành. Đây là giấy phép mã nguồn, không phải sự cấp quyền truy cập từ Zalo. Phụ thuộc có giấy phép riêng; chưa thực hiện kiểm toán pháp lý hoặc toàn bộ chuỗi phụ thuộc.

## Luồng kết nối có bằng chứng từ mã

| Việc | File và hàm | Điều thấy trong mã |
|---|---|---|
| Thư viện nền | `zalo-node/package.json`, dependencies và `pnpm-lock.yaml` | `zca-js` khai ^2.1.2, lock là 2.1.2. Có peer n8n-core/n8n-workflow. |
| Quan hệ repo liên quan | `zalo-api/package.json` | Tên gói cũng là zca-js 2.1.2, repository metadata trỏ RFS-ADRENO/zca-js. Repo toannguyen là bản nguồn liên quan, không được mặc định đồng nhất từng byte với gói npm đã xuất bản. |
| Đăng nhập từ n8n | `zalo-node/nodes/ZaloLoginByQr/ZaloLoginByQr.node.ts`, `execute()` | Thử `zalo.login({cookie,imei,userAgent})`; nếu không được thì `loginQR()`. Callback GotLoginInfo nhận ba trường phiên. |
| Lưu phiên trong n8n | cùng `execute()`, nhánh promise `.then()` | POST `/api/v1/credentials` bằng X-N8N-API-KEY tới URL n8n cấu hình; không phải bắt buộc của giao thức Zalo. QR được trả dưới dạng binary sau QRCodeGenerated. |
| Đăng nhập SDK | `zalo-api/src/zalo.ts`, `Zalo.login`, `loginCookie`, `loginQR`, `parseCookies` | Dựng CookieJar, gắn imei/userAgent, lấy login/server info, tạo API cùng khóa phiên và địa chỉ WebSocket. QR tạo imei và phát GotLoginInfo, sau đó tiếp tục loginCookie. |
| QR ở mức HTTP | `zalo-api/src/apis/loginQR.ts`, `loginQR`, `loadLoginPage`, `generate`, `waitingScan`, `waitingConfirm`, `checkSession` | Gọi luồng id.zalo.me, chờ quét và xác nhận, xuất cookie của phiên chính người quét. Khi có callback, ảnh chỉ được lưu nếu callback tự ghi hoặc gọi actions.saveToFile. |
| HTTP sau đăng nhập | `zalo-api/src/apis/login.ts`, `login`, `getServerInfo`, `getEncryptParam` | Gọi wpa.chat.zalo.me/api/login/getLoginInfo và getServerInfo với tham số/mã hóa theo giao thức web. |
| Nhận tin | `zalo-api/src/apis/listen.ts`, `Listener.start()` | Mở WebSocket với cookie/user-agent và origin chat.zalo.me; phân loại userMsgs/groupMsgs, tạo GroupMessage và phát sự kiện message. |
| Xác định nhóm | `zalo-api/src/models/Message.ts`, `GroupMessage.constructor()` | type Group; threadId lấy data.idTo; isSelf suy từ uidFrom. Không dùng tên nhóm làm khóa lọc. |
| Vòng đời kết nối | `zalo-api/src/apis/listen.ts`, `start`, `canRetry`, `stop` | Có ping và cơ chế retry theo mã đóng khi bật retryOnClose. Mặc định start không bật retry; session còn hợp lệ không đồng nghĩa kết nối luôn còn sống. |
| Trigger n8n | `zalo-node/nodes/ZaloMessageTrigger/ZaloMessageTrigger.node.ts`, `webhookMethods.default.create/delete`, `webhook()` | Đăng nhập, đăng ký listener.on(message), POST toàn message vào webhook n8n, lưu static data; delete dừng listener. |
| Gửi văn bản | `zalo-node/nodes/ZaloSendMessage/ZaloSendMessage.node.ts`, `execute()` | login, lấy threadId/type, dựng messageContent rồi gọi sendTypingEvent và api.sendMessage. |
| Gửi/quote SDK | `zalo-api/src/apis/sendMessage.ts`, `sendMessageFactory` trả hàm `sendMessage()` | Nhận nội dung, threadId, ThreadType.Group để gửi nhóm; quote dùng uidFrom, msgId, cliMsgId, ts, msgType… Không phải chỉ truyền một ID là đầy đủ. |
| Tìm ID nhóm | `zalo-api/src/apis/getAllGroups.ts`, `getAllGroupsFactory`; `getGroupInfo.ts`, `getGroupInfoFactory` | Lấy gridVerMap rồi thông tin nhóm theo ID. Bản thử dùng ở lệnh riêng, trước khi bật listener. |
| Multi-account server | `multizlogin/src/api/zalo/zalo.js`, `loginZaloAccount`, `sendMessageByAccount`; `src/eventListeners.js`, `setupEventListeners` | Quản lý nhiều API, login/QR, ghi cred_<ownId>.json dạng JSON, gửi message sang webhook cấu hình; có HTTP/WS/UI server. |

## Những điểm cần tránh sao chép nguyên trạng

1. Trigger có lựa chọn eventTypes trong UI nhưng nhánh kiểm tra `eventTypes.includes(message.type)` đang bị comment. Mã hiện đọc đăng ký listener gửi toàn message vào webhook; chưa có allowlist ID nhóm trước bước đó.
2. `triggerApi` và `reconnectTimer` nằm cấp module; cần xem lại khi chạy nhiều workflow/tài khoản. Có biến reconnectTimer không chứng minh thực tế đã có vòng reconnect hoàn chỉnh.
3. Node gửi dựng quote chỉ với msgId/senderId/content, không khớp toàn bộ trường mà SDK 2.1.2 dùng. Chưa kiểm thử quote thật; không khẳng định tính năng quote hoạt động.
4. Login node mô tả QR lưu backup nhưng callback không gọi actions.saveToFile. Trong nguồn SDK liên quan, có callback thì SDK không tự lưu ảnh theo nhánh mặc định. Bản thử tự ghi ảnh QR từ callback để tránh phụ thuộc giả định này.
5. Node gửi log cả messageContent và có gửi typing. Bản thử không dùng node đó.
6. MultiZLogin có nhiều lớp server, quản lý tài khoản, lưu cookie rõ trong JSON và webhook; vượt nhu cầu một tài khoản, một nhóm. Không cài/chạy server này để thử đơn giản.

## Phần n8n và phần tái sử dụng

Phần n8n gồm INodeType, description/properties, execute, credentials, workflow static data, webhook lifecycle, chuẩn output/binary, NodeOperationError và API lưu credentials. Không cần mang các lớp này sang app riêng.

Phần độc lập nằm trong SDK: new Zalo, login/loginQR, API.listener, ThreadType/GroupMessage, getAllGroups/getGroupInfo, sendMessage. App riêng dùng SDK trực tiếp. helper.ts có tải tệp vào thư mục .n8n/temp_files và sharp metadata; bản thử văn bản không cần các phần đó.

## Lựa chọn và kiểm thử

Dựng `assistant/` dùng zca-js pin 2.1.2, cùng phiên bản lock của zalo-node để có mốc đối chiếu rõ. Cài gói npm, không build/chạy ba repo nghiên cứu. Chưa xác nhận gói npm giống hoàn toàn nguồn repo liên quan. Chưa làm audit bảo mật toàn bộ mã SDK; npm audit tại thời điểm cài báo 0 lỗ hổng đã biết và có cảnh báo crypto-js ngừng duy trì.

Bản thử đã vượt kiểm thử lọc nhóm/tin riêng/tin tự gửi/tệp, loại trùng trong cửa sổ, giới hạn context; kiểm tra cú pháp/import SDK; thử lưu/đọc/ghi đè DPAPI bằng dữ liệu giả; chạy thiếu ID nhóm dừng trước kết nối. Không có cuộc đăng nhập thật, không nhận tin nhóm thật, không gửi tin thật. Cơ chế nhóm chỉ lọc sau khi SDK nhận ở cấp tài khoản, không giới hạn luồng máy chủ ở cấp nhóm.

Để trở thành trợ lý AI: sau khi thử nhận tin thành công, thêm tầng tạo bản nháp từ cửa sổ ngữ cảnh của nhóm, chọn nơi xử lý AI và quy tắc dùng dữ liệu, rồi kiểm thử trước khi có cơ chế gửi được người dùng duyệt. Hiện không cần mua VPS hay quyết định n8n.
