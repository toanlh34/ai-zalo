# Hồ sơ trợ lý và Zalo riêng — 0.5.0

Ngày 21/10/2026.

- 120 kiểm thử offline đạt. Thêm kiểm tra lưu/đọc lại tuổi, tính cách, đưa vào prompt, giữ cấu hình nền tảng khi sửa hồ sơ và từ chối tuổi không hợp lệ.
- Kiểm tra controller chuyển trợ lý: đọc phiên từ thư mục riêng, không kế thừa phiên/nhóm/chủ của trợ lý trước, chuyển về mặc định khôi phục đúng cấu hình, hàng chờ và pause state.
- UI phát triển đạt: Thiết lập AI chứa model/key, Trợ lý chứa hồ sơ và kết nối Zalo, tạo/sửa hồ sơ, gán AI, lưu key mã hóa cũ/mới, kích hoạt và chuyển lại trợ lý. Không có trường cấu hình Teams trong UI hiện tại.
- Các luồng AI, duyệt nháp và điều hướng cũ tiếp tục đạt. Chưa gọi AI thật hoặc gửi Zalo thật trong kiểm thử thay đổi này.
- Smoke bản portable 0.5.0 đạt; đã cài bản riêng và cập nhật shortcut Desktop/Start Menu, giữ nguyên dữ liệu phiên bản trước. Đã đối chiếu hash app và controller cài đặt với bản build.
- Phạm vi: lưu nhiều trợ lý/tài khoản Zalo, một trợ lý hoạt động tại một thời điểm. Teams chưa triển khai; không bật endpoint hoặc tạo tài nguyên Microsoft.

## Thử Antigravity thật sau cài đặt

Chạy `scripts/assistant-live-smoke.mjs --installed` bằng Node runtime của bản 0.5.0, nhập module từ engine đã cài. Dùng phiên Antigravity Google hiện có, tạo trợ lý/tài liệu giả trong thư mục tạm; không thay đổi cấu hình hoặc kiến thức người dùng.

Kết quả: đạt trong 12 giây. Trợ lý trả đúng tên Hana Test, tuổi 25 và mã ngẫu nhiên chỉ có trong tài liệu riêng. JSON đã qua validation của adapter. Không gửi tin Zalo. Thư mục kiểm thử được xóa sau khi hoàn tất. Cấu hình app lưu trước đó đang chọn `antigravity-cli`, model để trống.
