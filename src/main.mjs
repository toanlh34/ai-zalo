import { Zalo, LoginQRCallbackEventType } from 'zca-js';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createInbox } from './filter.mjs';
import { secureDirectory, saveSession, loadSession } from './session.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateDir = join(root, '.private');
const qrPath = join(privateDir, 'login-qr.png');
const command = process.argv[2] ?? 'listen';
if (!['login', 'groups', 'listen'].includes(command)) {
  console.error('Lệnh: npm run login | npm run groups | npm start');
  process.exit(1);
}
let api;
try {
  // Fail closed, before any login/network request, when the group is unset.
  const config = command === 'listen' ? JSON.parse(readFileSync(join(root, 'config.json'), 'utf8')) : null;
  const inbox = config ? createInbox(config.allowedGroupId, config.contextLimit) : null;
  secureDirectory(privateDir);
  const zalo = new Zalo({ selfListen: false, logging: false, checkUpdate: false });
  if (command === 'login') {
    let credentials;
    try {
      api = await zalo.loginQR({ qrPath }, event => {
        if (event.type === LoginQRCallbackEventType.QRCodeGenerated) {
          writeFileSync(qrPath, Buffer.from(event.data.image, 'base64'), { mode: 0o600 });
          console.log(`Mở ảnh trên máy này và quét bằng tài khoản SIM riêng: ${qrPath}`);
        } else if (event.type === LoginQRCallbackEventType.GotLoginInfo) {
          credentials = event.data;
        } else if ([LoginQRCallbackEventType.QRCodeExpired, LoginQRCallbackEventType.QRCodeDeclined].includes(event.type)) {
          event.actions.abort();
        }
      });
      if (!credentials) throw new Error('Không có phiên đăng nhập.');
      saveSession(privateDir, credentials);
      console.log('Đã đăng nhập và lưu phiên được mã hóa bằng Windows DPAPI. Chưa bật nhận tin.');
    } finally {
      rmSync(qrPath, { force: true });
    }
  } else {
    api = await zalo.login(loadSession(privateDir));
    if (command === 'groups') {
      const groups = await api.getAllGroups();
      for (const id of Object.keys(groups.gridVerMap)) {
        const info = await api.getGroupInfo(id);
        console.log(JSON.stringify({ id, name: info.gridInfoMap[id]?.name ?? '' }));
      }
      console.log('Chỉ đọc danh sách nhóm; chưa bật listener. Chép ID nhóm thử vào config.json.');
    } else {
      api.listener.on('message', message => {
        const accepted = inbox.accept(message);
        if (!accepted) return;
        console.log(JSON.stringify({ received: accepted.item, contextSize: accepted.context.length }));
      });
      api.listener.on('connected', () => console.log('Đã nối listener. Chỉ hiển thị văn bản của nhóm được phép; gửi tin đã tắt.'));
      api.listener.on('error', () => console.error('Lỗi kết nối listener. Không in dữ liệu phiên.'));
      api.listener.on('closed', () => { console.error('Listener đã đóng. Chạy lại khi cần.'); process.exitCode = 1; });
      const stop = () => { api.listener.stop(); process.exit(0); };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
      // No auto-relogin loop. No sendMessage, typing, attachment or AI calls.
      api.listener.start({ retryOnClose: false });
    }
  }
} catch {
  console.error('Chưa chạy được. Kiểm tra config.json, phiên DPAPI của Windows hiện tại và kết nối mạng. Nếu phiên hết hạn: npm run login. Không gửi file phiên vào chat.');
  process.exitCode = 1;
}
