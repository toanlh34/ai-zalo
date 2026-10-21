# JEV là gì?

JEV hiện có app Windows (Electron) và bộ máy Node.js xử lý Zalo. App quản lý cấu hình, QR, trạng thái, bật/dừng, hàng chờ và duyệt tin; Zalo là nơi khách nhắn và cũng cho phép chủ điều khiển qua DM. Chưa tự khởi động cùng Windows. Đóng app sẽ dừng bộ máy. Xem [cách dùng app](DESKTOP.vi.md).

```text
Khách nhắn trong nhóm Zalo đã chọn
                |
         Bộ lọc nhận tin
                |
     SQLite: hàng chờ + lịch sử
                |
   Worker đọc tài liệu knowledge/
                |
     AI: Claude CLI hoặc DeepSeek API
                |
       Kiểm tra bản nháp JSON
          /                 \
 Chào hỏi được phép     Nghiệp vụ / chưa chắc
          |                 |
          |         Báo chủ qua Zalo riêng
          |           Chủ duyệt / sửa / từ chối
          \                 /
         JEV gửi về nhóm (khi live)
```

AI chỉ đề xuất nội dung. JEV kiểm tra quy tắc, quyền chủ và chế độ chạy trước khi gửi. Dry-run vẫn gọi AI nhưng không gửi tin. Chỉ nhận văn bản mới trong nhóm đã chọn, chưa xử lý ảnh/tệp hoặc đọc lịch sử Zalo cũ.

## Các phần trong code

| Phần | Vai trò |
| --- | --- |
| `src/setup.mjs`, `onboarding.mjs` | Chọn AI, đăng nhập QR, chọn nhóm, ghép chủ |
| `src/jev.mjs`, `runtime.mjs` | Khởi động, nhận tin, điều phối và dừng |
| `src/filter.mjs`, `owner.mjs` | Lọc nhóm và xác thực lệnh chủ |
| `src/store.mjs`, `worker.mjs` | SQLite, hàng chờ, nháp, báo cáo và gửi tin |
| `src/agent.mjs`, `deepseek.mjs` | Gọi AI và kiểm tra kết quả |
| `agent/`, `knowledge/` | Quy tắc và kiến thức BIMUP |
| `.private/` | Phiên Zalo và dữ liệu vận hành trên máy |

## Hướng phát triển

App desktop đã dùng lại lõi hàng chờ và worker hiện tại; `desktop/main.cjs` mở giao diện, `desktop/controller.mjs` điều khiển engine riêng qua `desktop/service.mjs`. Tiếp theo cần chạy thử nhóm riêng với DeepSeek và hoàn thiện kiến thức. Nếu cần chạy liên tục sau này thì bổ sung tự khởi động, giám sát và phương án máy luôn bật.
