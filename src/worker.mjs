import { existsSync } from 'node:fs';
import { validateDecision } from './agent.mjs';
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
        if(task.group_id!==config.allowedGroupId){transition(task.id,task.status,'review','Nhóm đã thay đổi; cần kiểm tra.');}
        else {
          if(task.status==='queued'&&store.transition(task.id,'queued','thinking')){
            try {
              const decision=validateDecision(await agent.decide({message:JSON.parse(task.input),context:store.context(task.group_id,config.contextLimit??30,task.id)},{signal:controller.signal}));
              const input=JSON.parse(task.input);
              const greeting=/^(chào( anh| chị| em| bạn)?|xin chào|hello|hi|alo)[!.\s]*$/iu.test(input.text.trim());
              const auto=!input.truncated&&decision.action==='send'&&(config.autoSendCategories??[]).includes(decision.category)&&(decision.category!=='greeting'||greeting);
              const text=`${input.truncated?'Tin nhắn đã bị rút gọn; cần xem bản đầy đủ trên Zalo.\n':''}${auto?'JEV đề xuất tự gửi':'Cần anh tham gia'}: ${decision.report}\nLý do: ${decision.reason}\nBản nháp: ${decision.reply}`;
              if(store.decision(task.id,decision,auto?'approved':'review',{report:text}))logReport(task.id,text);
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
            if(decision&&config.mode!=='live'){transition(task.id,'approved','dry_run',`THỬ KHÔ — chưa gửi khách: ${decision.reply}`);}
            else if(decision&&!existsSync(pausePath)&&store.transition(task.id,'approved','sending')){
              try{
                await send(decision.reply,task.group_id,1);
                const text=`Đã gửi khách: ${decision.reply}`;
                if(store.finishSend(task.id,decision.reply,text))logReport(task.id,text);
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
