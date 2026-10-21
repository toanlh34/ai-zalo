# Tích hợp Teams vào BIMUP Zalo Assistance

Khảo sát ngày 21/10/2026. Đây là đề xuất triển khai, chưa có kết nối Teams trong bản 0.3.0 và chưa thử trên tenant Microsoft 365 của BIMUP.

## Kết luận

Có thể dùng chung giao diện quản lý, kho kiến thức và các adapter AI hiện có. Phải bổ sung adapter Teams và sửa lõi hàng chờ để phân biệt kênh. Đề xuất thử trước với một nhóm hoặc kênh tiêu chuẩn của Teams công ty, bot chỉ nhận khi được @mention; soạn nháp, chủ duyệt trong app rồi mới gửi bằng danh tính bot.

Teams SDK hỗ trợ hội thoại riêng, nhóm và kênh. Bot mặc định chỉ nhận @mention trong nhóm/kênh. Nếu cần đọc tất cả tin trong phạm vi cài đặt, cần khai báo RSC và chủ nhóm/chat chấp thuận: `ChannelMessage.Read.Group` hoặc `ChatMessage.Read.Chat`. Không xin quyền đọc toàn bộ tenant cho bản thử. Kênh riêng có hạn chế gửi tin theo tài liệu hiện tại, chưa đưa vào phạm vi đầu tiên. [Microsoft: hội thoại nhóm/kênh](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/channel-and-group-conversations), [RSC](https://learn.microsoft.com/en-us/microsoftteams/platform/agents-in-teams/enable-receive-all-chat-messages).

## Chạy local hay cloud

Teams gửi sự kiện tới HTTPS công khai; không gọi được localhost trực tiếp. Khi thử có thể dùng Microsoft Dev Tunnel chuyển tiếp tới receiver local, vẫn cần xác thực activity/JWT. Khi dùng thường xuyên, đề xuất một dịch vụ nhận sự kiện nhỏ trên server, app Windows kết nối ra ngoài bằng kết nối xác thực để lấy hàng chờ và gửi lệnh duyệt. Đây là đề xuất kiến trúc của dự án; Microsoft cung cấp yêu cầu HTTPS và phương án tunnel. [Microsoft: tunnel](https://learn.microsoft.com/en-us/microsoftteams/platform/teams-sdk/developer-tools/local-tunnels).

Với AI CLI trên PC: tắt máy sẽ dừng soạn nháp và gửi duyệt. Server có thể giữ hàng chờ nếu đã triển khai, nhưng không tự biến CLI trên PC thành dịch vụ 24/7. Muốn xử lý liên tục phải có máy luôn bật hoặc AI API trên server. Không đưa token Antigravity sang server.

## So sánh cách kết nối

| Phương án | Đặc điểm | Quyết định đề xuất |
| --- | --- | --- |
| Bot qua Teams SDK | Danh tính trợ lý riêng, nhận sự kiện và trả lời theo hội thoại/thread | Dùng cho bản đầu |
| Microsoft Graph đăng nhập theo người dùng | Có quyền đọc/gửi theo tài khoản, cần thiết kế consent, token và subscription | Chỉ khảo sát tiếp nếu cần danh tính người dùng |
| Graph application permissions | Gửi tin theo API create-message thông thường chỉ hỗ trợ application permission cho migration theo tài liệu hiện tại | Không dùng quyền migration để gửi trả lời bot |
| Incoming webhook đơn thuần | Không thay thế được luồng nhận tin, hàng chờ và hội thoại hai chiều | Không đáp ứng mục tiêu hiện tại |

Nguồn: [gửi chatMessage](https://learn.microsoft.com/en-us/graph/api/chatmessage-post?view=graph-rest-1.0), [Graph subscriptions](https://learn.microsoft.com/en-us/graph/teams-changenotifications-chatmessage), [chọn SDK](https://microsoft.github.io/teams-sdk/teams/choosing-an-sdk/). Nếu dùng Graph subscriptions, phải gia hạn và xử lý lifecycle; không coi subscription là kết nối vĩnh viễn.

## Những điểm phải sửa trong repo

- `src/filter.mjs`, `runtime.mjs`, `owner.mjs` đang gắn với event Zalo và ID dạng số. Thêm chuẩn tin nhắn chung, adapter Zalo/Teams riêng; chủ Teams xác thực bằng tenant + Entra user ID.
- `src/store.mjs` hiện dùng `group_id`, khóa task và lịch sử theo nhóm. Bổ sung channel/tenant/conversation/thread, định danh task theo kênh + tenant + conversation + message ID; migration gán dữ liệu cũ về Zalo để giữ nguyên lịch sử.
- `src/worker.mjs` đang gọi `send(text,group,1)` và báo chủ kiểu Zalo. Tách bộ gửi theo kênh, lưu conversation reference, trả lời đúng thread; giữ bước duyệt, dry-run và trạng thái gửi chưa rõ kết quả để tránh gửi trùng.
- `desktop/controller.mjs`, `index.html`, `renderer.js`: thêm trang Kết nối Teams, chọn tenant/hội thoại cho phép, trạng thái receiver, hàng chờ lọc theo kênh. Mỗi kết nối có nút chạy/dừng riêng, cùng kho kiến thức và AI.
- Receiver xác thực SDK, lọc tenant/hội thoại, bỏ tin do chính bot gửi, lưu chống trùng trước khi ACK. Không cho webhook gọi trực tiếp lệnh gửi hoặc điều khiển máy.
- Dùng lại `src/agent.mjs`, `deepseek.mjs`, `gemini.mjs`, `antigravity.mjs`, schema quyết định và tài liệu BIMUP. Không cần cho AI dùng MCP để kết nối Teams.

## Thứ tự triển khai

1. Xác nhận Teams công ty hay cá nhân, tenant và người có quyền cài custom app. Chưa xác minh khả năng cài ứng dụng trên tài khoản của anh; không đồng nhất personal scope của bot với Teams tài khoản cá nhân.
2. Chuẩn hóa định danh/hàng chờ, migration Zalo và test cách ly lịch sử giữa các kênh.
3. Đăng ký app/bot, tạo manifest phạm vi cần dùng, dựng receiver và tunnel thử nghiệm. Chưa tạo tài nguyên Microsoft hoặc mở endpoint công khai trong đợt khảo sát này.
4. Thử một nhóm/kênh: @mention → lưu task → AI → duyệt local → trả lời đúng hội thoại. Test trùng event, mất mạng, restart, sai tenant, hủy, gửi không rõ kết quả.
5. Chỉ bổ sung RSC đọc mọi tin khi có nhu cầu. Bot phải được cài vào nhóm/team đích để gửi chủ động; lưu conversation reference để duyệt sau vẫn trả lời đúng nơi. [Microsoft: proactive messages](https://learn.microsoft.com/en-us/microsoftteams/platform/bots/how-to/conversations/send-proactive-messages).

Chi phí cloud, quyền quản trị và license chưa xác minh trên tenant thực tế. Chưa thể cam kết dùng được ngay với mọi tài khoản Teams chỉ bằng đăng nhập trong app.
