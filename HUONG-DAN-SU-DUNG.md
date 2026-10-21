# BIMUP Zalo Assistance — Hướng dẫn sử dụng

**Windows · phiên bản 0.6.2 · cập nhật 21/10/2026**

Luồng bắt đầu: **Cài app → kết nối AI → chọn trợ lý → kết nối Zalo → thử nháp → gửi thật.**

## 1. Cài đặt và mở app

1. Đóng BIMUP Zalo Assistance cũ nếu đang mở.
2. Chạy **BIMUP-Zalo-Assistance-Setup-0.6.2.exe** và hoàn tất trình cài đặt. App cài cho tài khoản Windows hiện tại, không yêu cầu quyền quản trị; không cần cài Node.js để chạy app.
3. Mở **BIMUP Zalo Assistance** từ Start hoặc lối tắt được tạo khi cài đặt.

Bộ cài nội bộ chưa ký số.

Máy mới bắt đầu với danh sách trợ lý và kết nối AI trống; anh tự tạo các mục cần dùng. Nếu máy đã có trợ lý **Javis** và kết nối **BIMUP Project**, các mục này được giữ lại. Vào **Trợ lý**, chọn **Javis** rồi bấm **Dùng trợ lý này** để tiếp tục; kiểm tra AI và Zalo trước khi chạy.

## 2. Tạo kết nối AI

1. Vào **Thiết lập AI → + Tạo kết nối AI**.
2. Nhập **Tên kết nối / tài khoản AI**, tự chọn **Nhà cung cấp** và nhập **Model** nếu cần chỉ định model.
3. Bấm **Lưu kết nối**.
4. Nếu dùng **DeepSeek API** hoặc **Gemini API**: nhập **API key riêng**, bấm **Lưu key mã hóa** và đợi báo **Đã lưu key mã hóa trên Windows**. Tài khoản API cần có quyền truy cập và hạn mức/số dư phù hợp.
5. Nếu dùng **Antigravity CLI** hoặc **Claude CLI**: cài và đăng nhập công cụ CLI tương ứng trên chính tài khoản Windows này trước. Bộ cài app không thay thế bước đó. Với Antigravity, có nút **Kiểm tra Antigravity CLI** trong kết nối đã lưu.

Key đã lưu không hiển thị lại. Sửa model hoặc key của một kết nối ảnh hưởng các trợ lý cùng dùng kết nối đó.

## 3. Tạo, chọn và bổ sung kiến thức cho trợ lý

1. Mở **Trợ lý → + Tạo trợ lý → Hồ sơ & skill**.
2. Nhập **Tên trợ lý**, **Vai trò**, **Skill / cách xử lý**. Tuổi và tính cách là tùy chọn.
3. Chọn ít nhất một mục trong **Các AI được gán · thứ tự ưu tiên**. Lần đầu có thể dùng **AI đầu tiên**; dùng mũi tên ↑ ↓ để sắp xếp nếu gán nhiều AI.
4. Bấm **Lưu trợ lý**, rồi **Dùng trợ lý này**. Kiểm tra tên ở nhãn **Đang chọn**.
5. Bấm **Mở kiến thức riêng ↗**, thêm tài liệu văn bản dạng **.md**, mã hóa UTF-8, vào thư mục vừa mở. Nên ghi rõ thông tin công ty, phạm vi hỗ trợ, quy trình và những điều cần hỏi lại. Nếu dùng Notepad, lưu với đuôi `.md`, tránh thành `.md.txt`.
6. Quay lại app, nhập một câu vào **Tin nhắn thử**, rồi bấm **Thử trợ lý đã lưu**. Đọc câu trả lời và sửa hồ sơ/tài liệu nếu cần. Lưu thay đổi hồ sơ trước khi thử lại.

Thử trợ lý có gọi AI, gửi tin thử và kiến thức đến nhà cung cấp, dùng hạn mức nhưng không gửi Zalo. Tài liệu được đọc lại mỗi yêu cầu. Mỗi lần chọn trợ lý khác, app chuyển về **Thử nháp**. Hiện một trợ lý hoạt động tại một thời điểm.

## 4. Kết nối Zalo, chọn nhóm và ghép chủ

Thực hiện trong **Trợ lý → chọn trợ lý → Dùng trợ lý này → Kết nối Zalo**.

1. Bấm **Đăng nhập bằng QR**. Dùng tài khoản Zalo dành riêng cho trợ lý trên điện thoại để quét mã.
2. Bấm **Tải danh sách nhóm**, chọn nhóm thử có cả tài khoản trợ lý và tài khoản chủ, rồi bấm **Chọn nhóm này**.
3. Bấm **Ghép tài khoản chủ**. Dùng Zalo cá nhân của chủ gửi riêng cho tài khoản trợ lý đúng dòng mã đang hiện trong app. Mã dùng một lần và hết hạn sau 5 phút; không gửi vào nhóm.
4. Đợi thông báo **Đã ghép chủ**. Có thể bấm **Hủy thiết lập** nếu muốn dừng chờ QR hoặc ghép chủ.

Phiên Zalo, nhóm và chủ được tách theo trợ lý. Nếu đăng nhập lại hoặc đổi tài khoản Zalo, cần chọn nhóm và ghép chủ lại.

## 5. Thử nháp, duyệt và bật gửi thật

### Thử trước

1. Trong **Trợ lý → Kết nối Zalo**, chọn **Thử nháp · không gửi tin**, bấm **Lưu chế độ chạy**.
2. Đóng cửa sổ Trợ lý, về **Tổng quan**, bấm **Chạy agent**.
3. Dùng tài khoản chủ hoặc khách gửi **tin văn bản mới** vào nhóm đã chọn. App xử lý tin mới trong nhóm này; không đọc lại lịch sử cũ để thử.
4. Mở **Hàng chờ & duyệt**. Xem **Cần duyệt** hoặc đổi bộ lọc sang **Đã thử nháp** / **Tất cả trạng thái**.
5. Chọn tin, đọc và sửa bản nháp, rồi dùng **Duyệt bản trả lời**, **Từ chối** hoặc **Thử lại AI**. Trong chế độ thử, bản được duyệt vẫn không gửi cho khách.

Thử nháp vẫn dùng AI và hạn mức. Tin nhắn và tài liệu được gửi đến nhà cung cấp AI đã chọn.

### Khi đã sẵn sàng gửi

1. Về **Tổng quan → Dừng agent**.
2. Mở **Trợ lý → Kết nối Zalo**, chọn **Gửi thật · áp dụng quy tắc duyệt**, bấm **Lưu chế độ chạy**.
3. Đóng cửa sổ Trợ lý, bấm **Chạy agent**, kiểm tra đúng nhóm và xác nhận bật gửi thật.
4. Duyệt các bản nháp trong **Hàng chờ & duyệt**. App yêu cầu xác nhận khi duyệt gửi thật. Lời chào đơn giản đủ điều kiện có thể được tự gửi theo quy tắc của app.

Các tin đã xử lý ở chế độ thử không tự chuyển thành tin gửi thật khi đổi chế độ.

## 6. Dùng hằng ngày và giữ dữ liệu

- Giữ app mở, máy thức và có mạng trong thời gian muốn nhận tin. **Đóng app sẽ dừng agent**; app không tự tiếp tục làm việc trong khay hệ thống.
- **Tạm ngưng gửi** chặn gửi khách khi agent vẫn đang chạy. Bấm **Cho phép gửi lại** để tiếp tục. Dùng **Dừng agent** trước khi đổi cấu hình hoặc trợ lý.
- Vào **Nhật ký** để xem hoạt động và báo cáo. Khi tin có trạng thái **Chưa rõ kết quả**, kiểm tra Zalo thực tế trước khi bấm **Đã kiểm tra · đóng tin**; tránh gửi trùng.
- **Xóa cấu hình** gỡ trợ lý khỏi danh sách, giữ tài liệu, phiên và lịch sử trên ổ đĩa. Xóa trợ lý đang chọn sẽ bỏ lựa chọn hiện tại. Muốn xóa kết nối AI, gỡ nó khỏi các trợ lý hoặc xóa các cấu hình trợ lý đang dùng nó trước.
- Bộ cài giữ dữ liệu người dùng khi cập nhật hoặc gỡ app. Nút **Mở thư mục dữ liệu ↗** giúp tìm đúng thư mục; đóng app trước khi sao lưu toàn bộ thư mục đó. Key và phiên mã hóa gắn với người dùng Windows; khi chuyển máy/tài khoản có thể cần nhập lại key và đăng nhập Zalo lại.

## 7. Khi gặp vướng mắc

| Hiện tượng | Cách xử lý |
| --- | --- |
| Nút Chạy agent chưa bấm được | Chọn trợ lý bằng **Dùng trợ lý này**, kiểm tra đã gán AI, có phiên Zalo, nhóm và chủ. |
| Không thấy thiết lập Zalo | Mở **Trợ lý**, chọn hồ sơ, bấm **Dùng trợ lý này**, rồi vào **Kết nối Zalo**. |
| Không thấy nhóm cần dùng | Đảm bảo tài khoản Zalo của trợ lý đã vào nhóm, rồi bấm **Tải danh sách nhóm**. |
| QR hoặc mã ghép chủ hết hạn | Bấm **Hủy thiết lập**, bắt đầu lại. Mã chủ phải gửi bằng tài khoản chủ qua tin riêng cho trợ lý. |
| AI báo key/đăng nhập không hợp lệ | Kiểm tra đúng nhà cung cấp; lưu lại API key hoặc đăng nhập lại CLI trên cùng tài khoản Windows. |
| AI hết hạn mức hoặc số dư | Bổ sung hạn mức/số dư tại nhà cung cấp. Trong app bấm **Cho AI chạy lại**, rồi **Thử lại AI** cho tin cần xử lý. Thử lại áp dụng chế độ đang chọn. |
| Có tin trong nhóm nhưng app chưa nhận | Kiểm tra app đang chạy, mạng, tài khoản và nhóm đã chọn; gửi một tin văn bản mới. Xem **Nhật ký**. |
| Không xóa được kết nối AI | Xem **Đang dùng bởi** và gỡ kết nối khỏi các trợ lý trước. Dừng agent trước khi sửa/xóa. |

Nếu app báo có phiên làm việc khác đang chạy, đóng cửa sổ BIMUP Zalo Assistance cũ rồi mở lại. Không xóa dữ liệu hoặc tệp khóa khi còn tiến trình đang hoạt động.
