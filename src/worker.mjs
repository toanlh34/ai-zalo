import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { validateDecision } from './agent.mjs';
import { scopeOf } from './filter.mjs';

// Các chủ đề nhạy cảm bắt buộc chuyển chủ duyệt:
// - Giá, báo giá, chiết khấu, giảm giá, khuyến mãi, số tiền
// - Thanh toán, chuyển khoản, stk, số tài khoản, tiền nong
// - Hợp đồng, pháp lý, cam kết tiến độ, đền bù, bồi thường
// - Khiếu nại, phàn nàn, tranh chấp
const boundary = '[^\\p{L}\\p{N}_]';
const sensitiveWords = '(?:giá|báo giá|chiết khấu|giảm giá|khuyến mãi|sale|discount|thanh toán|chuyển khoản|stk|số tài khoản|tiền|hợp đồng|pháp lý|cam kết|đền bù|khiếu nại|phàn nàn|bồi thường|tranh chấp)';
export const sensitivePattern = new RegExp(`(?:^|${boundary})${sensitiveWords}(?:$|${boundary})`, 'iu');

export function isSensitiveContent(text = '') {
  return sensitivePattern.test(String(text ?? ''));
}

// Mô tả cuộc trò chuyện cho AI và cho báo cáo gửi chủ.
export function conversationOf(input,task,config) {
  const kind=input.kind??'group';
  const owner=kind==='owner'&&String(task.group_id)===String(config.ownerUserId??'');
  const who=input.senderName?`${input.senderName} (${input.sender})`:String(input.sender??'');
  const place=kind==='group'?(input.threadName?`Nhóm «${input.threadName}»`:`Nhóm ${task.group_id}`):owner?'Tin riêng của anh':'Tin riêng';
  return {
    owner,threadType:kind==='group'?1:0,label:`${place}${owner?'':` · ${who}`}`,
    forAi:{type:kind==='group'?'group':'private',withOwner:owner,addressedBy:input.addressedBy??null,
      note:owner?'Đây là chủ của bạn nhắn riêng. Trò chuyện tự nhiên, hỗ trợ công việc và trả lời trực tiếp vào reply.'
        :kind==='group'?'Tin trong nhóm Zalo có người gọi bạn (tag, trả lời tin của bạn hoặc gọi tên). Chủ động giải đáp chuyên môn và thông tin chung; chỉ chuyển chủ (escalate) nếu là vấn đề nhạy cảm (giá, chiết khấu, cam kết, khiếu nại).'
        :'Tin nhắn riêng từ khách. Chủ động trả lời thân thiện, lịch sự; chỉ chuyển chủ (escalate) khi gặp vấn đề nhạy cảm như giá cả, thanh toán, hợp đồng, khiếu nại.'}
  };
}

export function createWorker({store,agent,config,send,pausePath}) {
  let busy=false,stopped=false,active=Promise.resolve(),controller;
  const logReport=(id,text)=>console.log(JSON.stringify({task:id,report:text}));
  const transition=(id,from,to,text)=>{
    const changed=store.transition(id,from,to,text);
    if(changed&&text)logReport(id,text);
    return changed;
  };
  return { async tick(){
    if(busy||stopped)return;busy=true;
    let drained;active=new Promise(resolve=>{drained=resolve;});
    controller=new AbortController();
    try {
      const task=store.next({includeQueued:!store.aiPaused(),includeApproved:config.mode!=='live'||!existsSync(pausePath)});
      if(task){
        if(scopeOf(config)==='single'&&task.group_id!==config.allowedGroupId){transition(task.id,task.status,'review','Nhóm đã thay đổi; cần kiểm tra.');}
        else {
          const input=JSON.parse(task.input);
          let messageForAi = input;
          if (input.attachment?.url && /^https?:\/\//i.test(input.attachment.url)) {
            try {
              const attachDir = join(store.db ? dirname(store.db.name) : process.cwd(), 'attachments');
              mkdirSync(attachDir, { recursive: true });
              const cleanFileName = (input.attachment.title || input.attachment.fileName || 'file.pdf').replace(/[/\\?%*:|"<>]/g, '_');
              const dest = join(attachDir, `${task.id.replace(/[:/\\]/g, '_')}_${cleanFileName}`);
              if (!existsSync(dest)) {
                const resp = await fetch(input.attachment.url);
                if (resp.ok) {
                  const buf = Buffer.from(await resp.arrayBuffer());
                  writeFileSync(dest, buf);
                  messageForAi = { ...input, attachedFilePath: dest, text: `${input.text}\n[Tệp đính kèm đã tải về: "${dest}"] Hãy dùng công cụ read_file để đọc nội dung file này và trả lời.` };
                }
              } else {
                messageForAi = { ...input, attachedFilePath: dest, text: `${input.text}\n[Tệp đính kèm đã tải về: "${dest}"] Hãy dùng công cụ read_file để đọc nội dung file này và trả lời.` };
              }
            } catch {}
          }
          const conversation=conversationOf(input,task,config);
          if(task.status==='queued'&&store.transition(task.id,'queued','thinking')){
            try {
              const decision=validateDecision(await agent.decide({message:messageForAi,context:store.context(task.group_id,config.contextLimit??30,task.id),...(input.kind?{conversation:conversation.forAi}:{})},{signal:controller.signal}));
              const cleanText=(input.cleanText??input.text).trim();
              const greeting=/^(chào( anh| chị| em| bạn)?|xin chào|hello|hi|alo)[!.\s]*$/iu.test(cleanText);
              const isMultiGroup=scopeOf(config)==='all';
              const rawCategories=config.autoSendCategories??['greeting','documented_answer','other'];
              const categories=isMultiGroup?['greeting','documented_answer','other',...rawCategories]:rawCategories;
              const categoryAllowed=categories.includes(decision.category)||categories.includes('*');
              const sensitive=decision.action==='escalate'||isSensitiveContent(cleanText)||isSensitiveContent(decision.reply);
              // Tự gửi khi:
              // - Chủ nhắn riêng: luôn tự gửi
              // - Người khác: không bị cắt, action=send, không nhạy cảm, danh mục hợp lệ
              const auto=!input.truncated&&(conversation.owner
                ?!!decision.reply.trim()
                :decision.action==='send'&&!sensitive&&categoryAllowed&&(decision.category!=='greeting'||greeting));

              const notifyOwnerOnAuto=!isMultiGroup&&!config.notifySensitiveOnly;
              const text=`${input.kind?conversation.label+'\n':''}${input.truncated?'Tin nhắn đã bị rút gọn; cần xem bản đầy đủ trên Zalo.\n':''}${auto?'JEV đề xuất tự gửi':'Cần anh tham gia'}: ${decision.report}\nLý do: ${decision.reason}\nBản nháp: ${decision.reply}`;

              if(auto){
                if(conversation.owner){
                  store.decision(task.id,decision,'approved');
                } else if(notifyOwnerOnAuto){
                  if(store.decision(task.id,decision,'approved',{report:text}))logReport(task.id,text);
                } else {
                  // Ghi log local vào reports để app hiển thị, không gửi DM làm phiền Zalo của chủ
                  store.decision(task.id,decision,'approved');
                  store.db.prepare("INSERT INTO reports(task_id,text,status) VALUES(?,?,?)").run(task.id,text,'local');
                  logReport(task.id,text);
                }
              } else {
                // Nhạy cảm hoặc cần duyệt: gửi báo cáo pending để báo về Zalo cho chủ
                if(store.decision(task.id,decision,'review',{report:text}))logReport(task.id,text);
              }
            }catch(error){
              if(['CLAUDE_RATE_LIMITED','AI_RATE_LIMITED'].includes(error?.code)) {
                const text='AI hết hạn mức hoặc số dư. Đã tạm dừng gọi AI; khi có hạn mức, dùng resume-ai rồi retry task cần xử lý lại.';
                if(store.pauseAi(task.id,text))logReport(task.id,text);
              } else transition(task.id,'thinking','review',stopped?'Agent đã dừng khi đang xử lý; chưa gửi khách.':'AI lỗi hoặc trả dữ liệu sai. Cần anh kiểm tra.');
            }
          }
          const fresh=store.get(task.id);
          if(!stopped&&fresh.status==='approved'){
            let decision;
            try{decision=validateDecision(JSON.parse(fresh.decision));}
            catch{transition(task.id,'approved','review','Bản nháp không hợp lệ; cần anh kiểm tra trước khi gửi.');}
            if(decision&&config.mode!=='live'){transition(task.id,'approved','dry_run',`THỬ KHÔ — chưa gửi${input.kind?' ('+conversation.label+')':' khách'}: ${decision.reply}`);}
            else if(decision&&!existsSync(pausePath)&&store.transition(task.id,'approved','sending')){
              try{
                await send(decision.reply,task.group_id,conversation.threadType);
                const isMultiGroup=scopeOf(config)==='all';
                const notifyOwnerOnAuto=!isMultiGroup&&!config.notifySensitiveOnly;
                const sentText=`Đã gửi ${input.kind?conversation.label:'khách'}: ${decision.reply}`;
                if(conversation.owner){
                  store.finishSend(task.id,decision.reply);
                } else if(notifyOwnerOnAuto){
                  if(store.finishSend(task.id,decision.reply,sentText))logReport(task.id,sentText);
                } else {
                  store.finishSend(task.id,decision.reply);
                  store.db.prepare("INSERT INTO reports(task_id,text,status) VALUES(?,?,?)").run(task.id,sentText,'local');
                  logReport(task.id,sentText);
                }
              }
              catch{transition(task.id,'sending','uncertain','Gửi lỗi/không rõ kết quả. Kiểm tra Zalo; không tự gửi lại.');}
            }
          }
        }
      }
      if(config.mode==='live')for(const r of store.pendingReports()){
        if(stopped)break;
        if(!store.markReport(r.id,'sending','pending'))continue;
        const label=r.task_id?.startsWith('owner-command:')?'JEV':`JEV ${r.task_id}`;
        try{await send(`[${label}]\n${r.text}`.slice(0,1950),config.ownerUserId,0);store.markReport(r.id,'sent');}
        catch{store.markReport(r.id,'uncertain');console.error('Báo cáo chưa xác nhận gửi được; đã lưu để anh kiểm tra.');break;}
      }
    }finally{busy=false;controller=null;drained();}
  },async stop(){stopped=true;controller?.abort();await active;}};
}
