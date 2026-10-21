# Kiểm tra app Windows — 21/10/2026

- 84/84 test offline đạt (bao gồm DeepSeek và desktop controller).
- Electron UI đã chạy thử trên Windows với dữ liệu tạm: chuyển màn hình, lưu cấu hình AI, lưu key mã hóa, không trả key trong snapshot, nhập/sửa và duyệt nháp, chặn chạy khi chưa có nhóm/chủ.
- Bản đóng gói `win-unpacked` cũng vượt qua cùng kiểm tra giao diện.
- File portable `JEV-BIMUP-0.1.0-Windows.exe` đã vượt qua cùng kiểm tra thực tế (khởi động, cấu hình, mã hóa key, duyệt nháp và đóng app). Đã sửa kiểm tra IPC khi Windows dùng đường dẫn ngắn trong thư mục giải nén portable.
- Đóng app nhả `worker.lock`; không để engine tiếp tục chạy sau khi đóng.
- SDK Zalo trong engine staging đã được import thành công từ một thư mục tạm độc lập, không dựa vào node_modules của source.
- Đã xem ảnh chụp màn Tổng quan và Thiết lập để kiểm tra bố cục.
- Test dùng dữ liệu giả, không gọi DeepSeek/Zalo thật và không gửi tin thật.

Chạy lại: `npm test`, `npm run test:desktop`, `node scripts/desktop-smoke.cjs --packaged`, `node scripts/desktop-smoke.cjs --portable`. Ảnh kiểm tra lưu tại `desktop-test-artifacts/` (không đưa lên Git).

Chưa xác minh: QR tài khoản thật, ghép tài khoản chủ thật, nhận/gửi Zalo thật, chất lượng và chi phí DeepSeek với API key thật. App chưa có tự cập nhật, tự chạy cùng Windows hoặc chữ ký số phát hành.
