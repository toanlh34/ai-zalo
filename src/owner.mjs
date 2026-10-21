import {handleLocalCommand} from './commands.mjs';

const help='JEV — lệnh riêng của chủ:\n/jev status\n/jev list\n/jev approve <id> [câu trả lời]\n/jev reject <id>\n/jev retry <id>\n/jev close-task <id>\n/jev pause\n/jev resume\n/jev resume-ai';
const allowed=new Set(['status','list','approve','reject','retry','close-task','pause','resume','resume-ai','help']);
export function createOwnerController({store,config,pausePath}) {
  return {handle(message){
    const data=message?.data,owner=String(config.ownerUserId??'');
    // Check SDK identity and conversation type before parsing text or touching storage.
    if(!/^\d+$/.test(owner)||message?.type!==0||message.isSelf!==false
      ||String(message.threadId)!==owner||String(data?.uidFrom)!==owner
      ||!data?.msgId||typeof data.content!=='string'||!/^\/jev(?:\s|$)/u.test(data.content))return false;
    const id=`${owner}:${String(data.msgId)}`;
    const [command='help',taskId,...words]=data.content.length>4000?[]:data.content.trim().split(/\s+/u).slice(1);
    const execute=()=>{
      if(data.content.length>4000)return 'Lệnh quá dài. Câu trả lời thay thế tối đa 1.800 ký tự.';
      if(!allowed.has(command)||command==='help')return help;
      const output=[];
      handleLocalCommand({store,command,id:taskId,words,pausePath,log:text=>output.push(text)});
      if(command==='status'){
        const stats=JSON.parse(output[0]);
        return `JEV đang nhận lệnh.\nHàng chờ: ${stats.pending}\nAI: ${stats.aiPaused?'tạm dừng do hạn mức':'được phép chạy'}\nBáo cáo chờ: ${stats.pendingReports}\n${Object.entries(stats.statuses).map(([state,count])=>`${state}: ${count}`).join('\n')}`;
      }
      if(command==='list')return store.list().slice(0,10).map(task=>`${task.id} • ${task.status}`).join('\n')||'Chưa có yêu cầu.';
      return output.join('\n')||'Đã xử lý lệnh.';
    };
    try{store.ownerCommand(id,execute);}
    catch(error){
      const reply=error.message?.startsWith('Cần')?error.message:'Chưa xử lý được lệnh. Kiểm tra trạng thái task hoặc gửi /jev help.';
      store.ownerCommand(id,()=>reply);
    }
    return true;
  }};
}
