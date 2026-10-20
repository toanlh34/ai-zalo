import { existsSync } from 'node:fs';
import { validateDecision } from './agent.mjs';
export function createWorker({store,agent,config,send,pausePath}) {
  let busy=false;
  const report=(id,text)=>{store.report(id,text);console.log(JSON.stringify({task:id,report:text}));};
  return { async tick(){
    if(busy)return;busy=true;
    try {
      const task=store.next();
      if(task){
        if(task.group_id!==config.allowedGroupId){store.transition(task.id,task.status,'review');report(task.id,'Nhóm đã thay đổi; cần kiểm tra.');}
        else {
          let decision=task.decision?JSON.parse(task.decision):null;
          if(task.status==='queued'&&store.transition(task.id,'queued','thinking')){
            try {
              decision=validateDecision(await agent.decide({message:JSON.parse(task.input),context:store.context(task.group_id,config.contextLimit??30)}));
              const input=JSON.parse(task.input);
              const greeting=/^(chào( anh| chị| em| bạn)?|xin chào|hello|hi|alo)[!.\s]*$/iu.test(input.text.trim());
              const auto=decision.action==='send'&&(config.autoSendCategories??[]).includes(decision.category)&&(decision.category!=='greeting'||greeting);
              store.decision(task.id,decision,auto?'approved':'review');
              report(task.id,`${auto?'JEV đề xuất tự gửi':'Cần anh tham gia'}: ${decision.report}\nLý do: ${decision.reason}\nBản nháp: ${decision.reply}`);
            }catch{store.transition(task.id,'thinking','review');report(task.id,'AI lỗi, hết hạn mức hoặc trả dữ liệu sai. Cần anh kiểm tra.');}
          }
          const fresh=store.get(task.id);
          if(fresh.status==='approved'&&decision){
            if(config.mode!=='live'){store.transition(task.id,'approved','dry_run');report(task.id,`THỬ KHÔ — chưa gửi khách: ${decision.reply}`);}
            else if(!existsSync(pausePath)&&store.transition(task.id,'approved','sending')){
              try{await send(decision.reply,task.group_id,1);store.transition(task.id,'sending','sent');report(task.id,`Đã gửi khách: ${decision.reply}`);}
              catch{store.transition(task.id,'sending','uncertain');report(task.id,'Gửi lỗi/không rõ kết quả. Kiểm tra Zalo; không tự gửi lại.');}
            }
          }
        }
      }
      if(config.mode==='live')for(const r of store.pendingReports()){
        store.markReport(r.id,'sending');
        try{await send(`[JEV ${r.task_id}]\n${r.text}`.slice(0,1950),config.ownerUserId,0);store.markReport(r.id,'sent');}
        catch{store.markReport(r.id,'uncertain');console.error('Báo cáo chưa xác nhận gửi được; đã lưu để anh kiểm tra.');break;}
      }
    }finally{busy=false;}
  }};
}
