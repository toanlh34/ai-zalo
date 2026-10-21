# Gemini — JEV 0.2.0

Kết quả: **100/100 test offline đạt**. File portable `JEV-BIMUP-0.2.0-Windows.exe` cũng đã vượt qua smoke test giao diện và đóng sạch, bao gồm các lựa chọn Gemini API/CLI và hai key mã hóa riêng.

- Gemini API: kiểm tra URL/header key, system instruction riêng, schema JSON, lỗi 401/403/429/500, đầu ra bị chặn/cắt ngắn, tool call ngoài dự kiến, JSON sai, giới hạn kích thước, timeout và hủy.
- Gemini CLI: tiến trình giả kiểm tra phiên OAuth, loại API key khỏi môi trường, cấu hình tắt tools/MCP/extensions/hooks, policy từ chối công cụ, đọc JSON response, quota, lỗi tiến trình, giới hạn đầu ra, timeout/hủy và dọn file tạm.
- Windows resolver: chạy bin JavaScript của gói @google/gemini-cli chính thức thay cho thực thi shell shim.
- Giao diện: chọn/lưu Gemini API và CLI, kiểm tra CLI, lưu key Gemini mã hóa riêng, xác nhận key DeepSeek vẫn giữ nguyên, không trả key trong snapshot, sửa/duyệt nháp và đóng app sạch.

Test không đăng nhập Google/Zalo, không xác minh quyền lợi AI Pro và không gọi API thật.
