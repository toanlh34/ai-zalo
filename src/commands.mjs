import {writeFileSync,rmSync} from 'node:fs';
import {validateDecision} from './agent.mjs';

export const usage='Lệnh: run/list/status/reports/approve <id> [nội dung]/reject <id>/retry <id>/close-task <id>/pause/resume/resume-ai/help';
export function handleLocalCommand({store,command,id,words=[],pausePath,log=console.log}) {
  if(command==='list')log(JSON.stringify(store.list(),null,2));
  else if(command==='status')log(JSON.stringify(store.stats(),null,2));
  else if(command==='reports')log(JSON.stringify(store.db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 100').all(),null,2));
  else if(command==='pause'){writeFileSync(pausePath,'paused');log('Đã dừng gửi khách.');}
  else if(command==='resume'){rmSync(pausePath,{force:true});log('Đã bỏ dừng gửi khách.');}
  else if(command==='resume-ai'){store.resumeAi();log('Đã cho phép gọi AI. Dùng retry <task-id> nếu cần xử lý lại task đang review.');}
  else if(command==='retry'){
    if(!store.retry(id))throw Error('Cần task ở trạng thái review');
    log('Đã xếp lại task. Nếu AI đang dừng do hạn mức, cần resume-ai khi đã có hạn mức.');
  }else if(command==='close-task'){
    if(!store.closeTask(id))throw Error('Cần task ở trạng thái uncertain');
    log('Đã đóng task; không gửi lại và không ghi thêm câu trả lời vào lịch sử bot.');
  }else if(command==='approve'){
    const task=store.get(id);if(!task||task.status!=='review')throw Error('Cần task ở trạng thái review');
    const decision=task.decision?JSON.parse(task.decision):{action:'escalate',category:'other',reason:'Chủ xử lý',report:'Chủ cung cấp câu trả lời'};
    if(words.length)decision.reply=words.join(' ');
    if(!decision.reply?.trim()||decision.reply.length>1800)throw Error('Cần nội dung trả lời hợp lệ');
    validateDecision(decision);
    if(!store.decision(id,decision,'approved',{from:'review',report:'Anh đã duyệt nội dung trả lời.'}))throw Error('Cần task ở trạng thái review');
    log('Đã duyệt. Worker sẽ xử lý theo mode hiện tại.');
  }else if(command==='reject'){
    if(!store.transition(id,'review','rejected','Anh từ chối bản nháp; chưa gửi khách.'))throw Error('Cần task ở trạng thái review');
  }else return false;
  return true;
}
