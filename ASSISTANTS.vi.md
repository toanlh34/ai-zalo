# Trợ lý và Thiết lập AI — bản 0.5.0

Hai nơi có nhiệm vụ riêng:

- **Thiết lập AI**: tạo các kết nối, chọn nhà cung cấp/model và lưu API key. Một kết nối dùng chung được cho nhiều trợ lý.
- **Trợ lý**: đặt tên, tuổi (tùy chọn), tính cách, vai trò, skill, kiến thức, chọn AI đã kết nối và thiết lập Zalo riêng.

## Bắt đầu

1. Đóng app cũ, mở shortcut BIMUP Zalo Assistance mới. Dừng agent trước khi sửa cấu hình.
2. Vào **Thiết lập AI** và tạo kết nối. App mới bắt đầu với danh sách trống, không tự tạo trợ lý BIMUP, kết nối “AI hiện có” hoặc chọn sẵn nhà cung cấp. Chọn provider, model và lưu. Nếu là API, nhập key rồi lưu mã hóa. CLI dùng phiên đăng nhập sẵn trên Windows.
3. Vào **Trợ lý → Tạo trợ lý → Hồ sơ & skill**. Nhập tên, tuổi nếu muốn, tính cách, vai trò và skill. Chọn một hoặc nhiều AI; dùng ↑ ↓ để đổi thứ tự ưu tiên.
4. Lưu và bấm **Dùng trợ lý này**. Mỗi lần chuyển trợ lý, app quay về thử nháp.
5. Vào tab **Kết nối Zalo** trong cửa sổ Trợ lý. Quét QR bằng tài khoản Zalo dành cho trợ lý này, tải/chọn nhóm và ghép chủ. Dữ liệu của trợ lý khác không tự chuyển sang.
6. Trở lại **Hồ sơ & skill**, mở thư mục kiến thức riêng và thêm file Markdown .md. Bấm **Thử trợ lý đã lưu** để thử bằng tin giả; phép thử có gọi AI và dùng hạn mức, không gửi Zalo.
7. Đóng cửa sổ Trợ lý, bấm **Chạy agent** ở Tổng quan. Xem hàng chờ/bản nháp. Muốn đổi sang gửi thật: dừng agent, vào **Trợ lý → Kết nối Zalo**, chọn chế độ và lưu; bật lại agent sẽ yêu cầu xác nhận.

## Cách dùng nhiều AI

- **AI đầu tiên**: chỉ gọi kết nối đứng đầu.
- **Dự phòng**: gọi lần lượt khi hết hạn mức, lỗi mạng/HTTP hoặc timeout. Lỗi đăng nhập, bản nháp sai, yêu cầu tool và hủy không tự chuyển AI.
- **Luân phiên**: một AI mỗi lượt, bộ đếm bắt đầu lại khi chạy lại agent. Không gọi mọi AI cùng lúc.

Sửa model hoặc key của một kết nối sẽ ảnh hưởng các trợ lý dùng chung kết nối đó. API key được mã hóa bằng Windows safeStorage, không hiển thị lại. Kết nối AI hiện có giữ hai key DeepSeek/Gemini từ bản cũ và cũng quản lý ngay trong Thiết lập AI.

Các cấu hình Antigravity/Claude vẫn dùng phiên CLI của người dùng Windows, chưa phải nhiều tài khoản Google/Claude độc lập. Hạn mức có thể dùng chung.

## Dữ liệu và phạm vi

Mỗi trợ lý có hồ sơ, tài liệu, phiên Zalo, nhóm, tài khoản chủ, hàng chờ/lịch sử và trạng thái pause riêng. Trợ lý BIMUP mặc định giữ phiên/tài liệu/DB cũ. Trợ lý mới cần QR riêng. Hiện **chỉ một trợ lý hoạt động tại một thời điểm**, có thể chuyển giữa các trợ lý/tài khoản đã lưu.

Khi agent đã dừng, có thể xóa cả trợ lý mặc định cũ, trợ lý đang chọn hoặc trợ lý cuối cùng. Xóa trợ lý đang chọn sẽ bỏ lựa chọn hiện tại, không tự chuyển sang trợ lý khác. Xóa cấu hình không xóa tài liệu, phiên hay lịch sử trên ổ đĩa. Có thể xóa kết nối “AI hiện có” sau khi không còn trợ lý nào dùng nó. Các mục đã xóa không tự tạo lại khi mở app. Kiến thức đọc từ .md, chưa có embedding/tìm kiếm vector RAG; skill là chỉ dẫn soạn nháp.

Theo phạm vi hiện tại chỉ triển khai **Zalo**. Teams và nền tảng khác để sau. Giao diện/dữ liệu nằm local, yêu cầu AI gửi đến nhà cung cấp kể cả khi thử hoặc dùng AI dự phòng. Đóng app sẽ dừng agent.
