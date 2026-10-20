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
      const item = { id: key, sender: String(data.uidFrom), text: data.content.slice(0, 8000), timestamp: String(data.ts ?? '') };
      seen.add(key);
      context.push(item);
      if (context.length > limit) seen.delete(context.shift().id);
      return { item, context: context.map(entry => ({ ...entry })) };
    }
  };
}
