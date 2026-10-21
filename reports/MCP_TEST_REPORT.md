# MCP quản trị app — 0.6.1

Nghiệm thu ngày 21/10/2026 trên Windows.

- 126 kiểm thử offline đạt, không có kiểm thử thất bại.
- Smoke bản portable đạt: giao diện, lưu khóa mã hóa, quản lý trợ lý, phân tách dữ liệu, lựa chọn API/CLI và quy trình bản nháp.
- MCP SDK chuẩn khởi tạo và liệt kê đủ 13 tool; tạo trợ lý xuất hiện trong app, ghi/đọc Markdown tiếng Việt, từ chối token sai và Origin của website. Descriptor và worker lock được dọn khi đóng app.
- Đã sửa lỗi thiếu dependency trong portable bằng cách đóng gói rõ engine/node_modules, kiểm tra zod, zca-js và MCP SDK trong artifact. Bridge chạy trong Node engine; lỗi AI được truyền bằng mã và thông báo an toàn.
- Đã sửa singleton lock để các cửa sổ dùng thư mục dữ liệu khác nhau không chuyển nhầm vào app đang chạy.
- Đã cài 0.6.1 và đăng ký MCP bimup-zalo-assistance trong Codex qua launcher ổn định. Mở lại Codex hoặc chat mới để nạp danh sách tool.
- Thử trên bản đã cài: app_status thành công, tạo trợ lý Mai qua MCP, giữ trợ lý default hoạt động. Gọi test_assistant của Mai qua Antigravity CLI thành công và nhận câu chào đúng tên/vai trò.
- Không gửi tin Zalo thật. Đăng nhập Zalo và luồng gửi thực tế chưa được nghiệm thu trong lượt này. Kiến thức hiện là Markdown riêng cho mỗi trợ lý, chưa có vector RAG.
