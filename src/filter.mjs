// No logging, persistence or model calls before this boundary.
export function createInbox(groupId, limit = 30) {
  if (!/^[0-9]+$/.test(groupId)) throw new Error('Cần cấu hình đúng một ID nhóm bằng chữ số.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('contextLimit phải từ 1 đến 100.');
  const context = [];
  const seen = new Set();
  return {
    accept(message) {
      if (message?.type !== 1 || message.threadId !== groupId || message.isSelf !== false) return null;
      const data = message.data;
      if (!data || typeof data.content !== 'string' || !data.content.trim()) return null;
      if (!data.msgId || !data.uidFrom) return null;
      const key = String(data.msgId);
      if (seen.has(key)) return null;
      const item = { id: key, sender: String(data.uidFrom), text: data.content.slice(0, 8000), truncated: data.content.length > 8000, timestamp: String(data.ts ?? '') };
      seen.add(key);
      context.push(item);
      if (context.length > limit) seen.delete(context.shift().id);
      return { item, context: context.map(entry => ({ ...entry })) };
    }
  };
}


export const defaultAssistantNames = ['JEV', 'Javis', 'Jarvis'];

export function parseMessagePayload(data) {
  if (!data) return { text: '', attachment: null };
  let raw = data.content;
  let text = '';
  let attachment = null;

  if (typeof raw === 'string') {
    text = raw.trim();
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const obj = JSON.parse(text);
        if (obj && typeof obj === 'object') {
          const title = obj.title || obj.fileName || obj.name;
          const url = obj.href || obj.fileUrl || obj.url;
          if (title || url) {
            attachment = { title: title || 'Tệp đính kèm', url: url || '', size: obj.fileSize || obj.totalSize, type: obj.type || obj.extention };
            const desc = obj.description ? ` (${obj.description})` : '';
            text = `[Đính kèm: ${title || 'Tệp'}${desc}]`;
          }
        }
      } catch {}
    }
  } else if (typeof raw === 'object' && raw !== null) {
    const title = raw.title || raw.fileName || raw.name;
    const url = raw.href || raw.fileUrl || raw.url;
    attachment = { title: title || 'Tệp đính kèm', url: url || '', size: raw.fileSize || raw.totalSize, type: raw.type || raw.extention };
    const desc = raw.description ? ` (${raw.description})` : '';
    text = `[Đính kèm: ${title || 'Tệp'}${desc}]`;
  }

  if (!attachment && data.params && typeof data.params === 'object') {
    const title = data.params.fileName || data.params.title;
    const url = data.params.fileUrl || data.params.url;
    if (title || url) {
      attachment = { title: title || 'Tệp đính kèm', url: url || '', size: data.params.totalSize, type: data.params.extention };
      if (!text) text = `[Đính kèm: ${title || 'Tệp'}]`;
    }
  }

  return { text: text.trim(), attachment };
}

// 'all': mọi nhóm agent tham gia + tin riêng. 'single': chỉ một nhóm (cấu hình cũ).
export function scopeOf(config = {}) {
  if (config.chatScope === 'all') return 'all';
  if (config.chatScope === 'single') return 'single';
  return /^[0-9]+$/.test(config.allowedGroupId ?? '') ? 'single' : 'all';
}

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanLabel = value => String(value ?? '').replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').trim().slice(0, 100);

export function assistantNameList(names = []) {
  const result = new Set();
  for (const raw of names) {
    const full = String(raw ?? '').trim();
    // "Hana · hỗ trợ khách" -> cũng nhận "Hana".
    for (const name of [full, full.split(/[·|,(–-]/u)[0].trim()]) if (name.length >= 2 && name.length <= 60) result.add(name);
  }
  return [...result];
}

// No logging, persistence or model calls before this boundary.
export function createRouter({ config, selfId = '', names = defaultAssistantNames }) {
  const scope = scopeOf(config);
  const limit = config.contextLimit ?? 30;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('contextLimit phải từ 1 đến 100.');
  if (scope === 'single' && !/^[0-9]+$/.test(config.allowedGroupId ?? '')) throw new Error('Cần cấu hình đúng một ID nhóm bằng chữ số.');
  const owner = String(config.ownerUserId ?? ''), self = String(selfId ?? '');
  const nameList = assistantNameList(names);
  const boundary = '[^\\p{L}\\p{N}_]';
  const namePattern = nameList.length ? `(?:${nameList.map(escapeRegExp).join('|')})` : null;
  const nameTest = namePattern ? new RegExp(`(?:^|${boundary})${namePattern}(?=$|${boundary})`, 'iu') : null;
  const nameStrip = namePattern ? new RegExp(`(^|${boundary})@?${namePattern}(?:\\s+ơi)?(?=$|${boundary})`, 'giu') : null;
  const seen = new Set(), order = [];
  const remember = key => {
    if (seen.has(key)) return false;
    seen.add(key); order.push(key);
    if (order.length > 2000) seen.delete(order.shift());
    return true;
  };
  return {
    scope,
    accept(message) {
      if (!message || message.isSelf !== false) return null;
      const data = message.data;
      if (!data || !data.msgId || !data.uidFrom) return null;
      const { text, attachment } = parseMessagePayload(data);
      if (!text) return null;
      const threadId = String(message.threadId ?? ''), sender = String(data.uidFrom);
      if (!/^[0-9]+$/.test(threadId) || (self && sender === self)) return null;
      let kind;
      if (message.type === 1) {
        if (scope === 'single' && threadId !== config.allowedGroupId) return null;
        kind = 'group';
      } else if (message.type === 0) {
        if (scope === 'single' || threadId !== sender) return null;
        kind = /^[0-9]+$/.test(owner) && sender === owner ? 'owner' : 'dm';
      } else return null;
      if (!remember(`${threadId}:${data.msgId}`)) return null;
      const mentions = Array.isArray(data.mentions) ? data.mentions : [];
      const mentioned = !!self && mentions.some(m => String(m?.uid) === self);
      const quoted = !!self && String(data.quote?.ownerId ?? '') === self;
      const named = !!nameTest && nameTest.test(text);
      // Câu đã bỏ @tag/tên trợ lý, dùng để nhận diện lời chào.
      let clean = text;
      for (const m of mentions.filter(m => Number.isInteger(m?.pos) && Number.isInteger(m?.len) && m.len > 0).sort((a, b) => b.pos - a.pos)) clean = clean.slice(0, m.pos) + ' ' + clean.slice(m.pos + m.len);
      if (nameStrip) clean = clean.replace(nameStrip, '$1 ');
      clean = clean.replace(/\s+/gu, ' ').replace(/^[\s,:;.!-]+/u, '').trim();
      const item = { id: String(data.msgId), sender, text: text.slice(0, 8000), truncated: text.length > 8000, timestamp: String(data.ts ?? ''), kind, threadId, threadType: message.type };
      if (attachment) item.attachment = attachment;
      const senderName = cleanLabel(data.dName);
      if (senderName) item.senderName = senderName;
      if (clean && clean !== text.trim()) item.cleanText = clean.slice(0, 8000);
      if (mentioned || quoted || named) item.addressedBy = mentioned ? 'mention' : quoted ? 'reply' : 'name';
      // Chế độ nhiều nhóm: tin nhóm chỉ thành task khi gọi trợ lý; tin khác chỉ làm ngữ cảnh.
      const addressed = kind !== 'group' || scope === 'single' || mentioned || quoted || named;
      return { item, addressed };
    }
  };
}
