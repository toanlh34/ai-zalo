# Báo cáo tự kiểm thử JEV — 20/10/2026

**Kết quả: 71/71 đạt, 0 lỗi, 0 bỏ qua.** Thực hiện trên Windows, Node.js 24.15.0. Lần chạy toàn bộ khoảng 1,98 giây theo Node test runner. Kiểm thử ghi thay cấu hình nguyên tử được chạy ngoài sandbox Windows với guard offline vì sandbox trả EPERM khi rename đè file tạm.

## Phạm vi

Không chạy executable Claude, không gọi dịch vụ AI/Zalo, không đọc config.json hoặc phiên trong .private. Provider và transport là dữ liệu/hàm giả; SQLite, bộ lọc, worker, bộ xử lý lệnh và tiến trình dùng cho crash test là mã thật. DB thử nằm trong thư mục tạm, được đóng trước khi dọn.

`scripts/offline-guard.mjs` được nạp trước test và truyền tiếp sang tiến trình Node con: chặn HTTP/HTTPS, TCP/TLS, DNS, UDP và fetch; chặn executable ngoài Node và taskkill dùng cho dọn tiến trình thử trên Windows. Có kiểm thử xác nhận các lời gọi bị chặn. Đây là guard trong tiến trình test, không phải sandbox hệ điều hành.

| Nhóm | Đạt |
| --- | ---: |
| Hợp đồng CLI với tiến trình Node giả, JSON, UTF-8, timeout/hủy và lỗi | 16 |
| Bộ lọc nhận tin | 3 |
| SQLite, rollback, nâng DB, hàng chờ và khôi phục | 12 |
| Worker và quy tắc gửi | 13 |
| Ghép luồng offline, lệnh quản lý và crash test | 10 |
| Onboarding, QR/ghép chủ và xuyên suốt đến runtime | 10 |
| Runtime, quyền điều khiển DM và graceful shutdown | 7 |
| **Tổng** | **71** |

## Kịch bản ghép luồng

1. Chặn nhóm khác, tin riêng, tin tự gửi và tệp trước khi ghi DB hoặc gọi provider giả.
2. Nhận lời chào → xếp hàng → tạo quyết định giả → gửi giả đúng nhóm → báo chủ đúng địa chỉ; không đưa báo cáo nội bộ vào câu gửi khách.
3. Yêu cầu giá chuyển review; chủ thay nội dung và duyệt bằng cùng bộ xử lý lệnh của CLI; chỉ gửi câu đã duyệt.
4. Đóng/mở DB rồi nhận lại tin cũ: không gọi AI hoặc gửi lại; lịch sử bot vẫn còn.
5. Dry-run lưu bản nháp/báo cáo qua mở lại, không gọi hàm gửi hoặc tạo lịch sử bot giả.
6. Tin bị cắt ở giới hạn 8.000 ký tự luôn chờ chủ duyệt, kể cả provider giả trả action=send/category=greeting.
7. Hạn mức giả → dừng AI qua mở lại → hàng chờ đầy → từ chối task → resume-ai → xử lý tiếp; tin vượt giới hạn không được lưu.
8. Hai tick đồng thời và pause khi AI chưa trả kết quả: không gọi AI trùng hoặc gửi sau pause; resume chỉ gửi mỗi câu một lần.
9. Gửi DM báo chủ lỗi không làm gửi lại câu đã xác nhận cho khách; báo cáo chưa rõ kết quả không tự gửi lại. Lỗi AI cần chủ soạn câu; reject/retry/close-task không vượt trạng thái cho phép.
10. Chạy tiến trình con với DB thật rồi dừng cưỡng bức ở thinking và sending. Ở sending, transport giả ghi tác động trước khi dừng. Mở lại DB: review/uncertain tương ứng; không lặp gửi, không tự retry uncertain.
11. QR giả → chọn nhóm → ghép chủ bằng mã DM → lưu cấu hình → chạy runtime → nhận tin nhóm → chủ duyệt qua DM → gửi đúng câu đã duyệt và báo chủ.
12. Mã chủ hết hạn/sai/đã dùng/tự ghép/đưa vào nhóm bị bỏ qua. QR đăng nhập lỗi không lưu phiên và luôn dọn ảnh. Khóa chặn agent/setup chạy chồng, không xóa khóa thay thế.
13. Chỉ đúng chủ trong DM mới thực thi lệnh. Replay tin lệnh sau mở lại DB không duyệt/gửi lại. Biên nhận và duyệt rollback nếu lỗi tạo phản hồi cho chủ.
14. Ctrl+C tương đương stop runtime: hủy AI bằng AbortSignal, không gửi muộn; lượt gửi đang chạy được ghi nhận trước khi stop hoàn tất. Listener đóng cũng drain và dừng nhận; lỗi socket đến muộn sau stop không gây unhandled error.

## Lỗi tìm thấy và đã sửa

Tin nhắn bắt đầu bằng lời chào, tiếp theo là nhiều khoảng trắng và yêu cầu nghiệp vụ sau ký tự 8.000 bị cắt mất phần nghiệp vụ. Worker trước đây có thể tự gửi lời chào vì chỉ xét phần còn lại. Kiểm thử hồi quy đã tái hiện trạng thái sai `sent` trước sửa.

Inbox nay ghi `truncated`; worker luôn đưa tin bị rút gọn vào review và báo chủ cần xem bản đầy đủ. Kiểm thử sau sửa xác nhận không gọi gửi khách.

## Chạy lại

```powershell
npm test
# hoặc cùng bộ kiểm thử:
npm run test:offline
# 27 kiểm thử onboarding/runtime/ghép luồng:
npm run smoke
```

`npm run smoke:claude` là lệnh riêng có kết nối Claude; không thuộc bộ kiểm thử này và không được chạy trong đợt tự test này.

## Giới hạn của kết quả

Các kết quả trên kiểm chứng onboarding, quyền chủ, xử lý ứng dụng và dừng/khôi phục bằng SDK/tài khoản/QR giả. Anh sẽ đăng ký tài khoản agent sau; chưa kiểm chứng chất lượng quyết định của mô hình thật, đăng nhập/nhận/gửi Zalo thật hoặc MCP thật. Các thông báo quota/DM lỗi trong output là lỗi giả được đưa vào có chủ đích.
