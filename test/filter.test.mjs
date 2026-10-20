import test from 'node:test';
import assert from 'node:assert/strict';
import { createInbox } from '../src/filter.mjs';
const message = (id = '1') => ({ type: 1, threadId: '123', isSelf: false, data: { msgId: id, uidFrom: '5', content: 'thử', ts: '1' } });
test('chặn nhóm khác, tin riêng, tin tự gửi và tệp đính kèm', () => {
  const inbox = createInbox('123');
  for (const change of [{ type: 0 }, { threadId: '999' }, { isSelf: true }, { data: { content: { href: 'secret' } } }]) {
    assert.equal(inbox.accept({ ...message(), ...change }), null);
  }
  assert.equal(inbox.accept(message()).context.length, 1);
});
test('giới hạn ngữ cảnh, chặn bản trùng trong cửa sổ và không lộ mảng nội bộ', () => {
  const inbox = createInbox('123', 2);
  inbox.accept(message());
  assert.equal(inbox.accept(message()), null);
  inbox.accept(message('2'));
  const result = inbox.accept(message('3'));
  assert.deepEqual(result.context.map(x => x.id), ['2', '3']);
  result.context[0].text = 'changed';
  assert.equal(inbox.accept(message('4')).context[0].text, 'thử');
});
test('thiếu ID hoặc giới hạn sai thì dừng', () => {
  for (const id of ['', '*', '123,456']) assert.throws(() => createInbox(id));
  assert.throws(() => createInbox('123', 101));
});
