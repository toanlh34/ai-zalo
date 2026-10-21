const $=id=>document.getElementById(id);
let state,selected=null,settingsLoaded=false,locked=false,polling=false;
const logs=[];
const statuses={queued:'Đang xếp hàng',thinking:'AI đang soạn',review:'Cần duyệt',approved:'Đã duyệt',sending:'Đang gửi',sent:'Đã gửi',dry_run:'Đã thử nháp',uncertain:'Chưa rõ kết quả',closed:'Đã đóng',rejected:'Đã từ chối'};
function notice(text,error=false){$('notice').textContent=text;$('notice').classList.toggle('error',error);$('notice').hidden=false;}
function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function navigate(page){document.querySelectorAll('.page').forEach(el=>el.classList.toggle('active',el.id===page));document.querySelectorAll('.nav').forEach(el=>el.classList.toggle('active',el.dataset.page===page));$('page-title').textContent={dashboard:'Tổng quan',setup:'Thiết lập AI',tasks:'Hàng chờ & duyệt',logs:'Nhật ký'}[page];}
document.querySelectorAll('[data-page]').forEach(el=>el.onclick=()=>navigate(el.dataset.page));
document.querySelectorAll('[data-goto]').forEach(el=>el.onclick=()=>navigate(el.dataset.goto));
async function confirm(title,text){$('confirm-title').textContent=title;$('confirm-text').textContent=text;$('confirm').showModal();return new Promise(resolve=>{const finish=value=>{$('confirm').close();resolve(value);};$('confirm-yes').onclick=()=>finish(true);$('confirm-no').onclick=()=>finish(false);$('confirm').oncancel=event=>{event.preventDefault();finish(false);};});}
async function request(action,payload){try{return await window.jev.request(action,payload);}catch(error){throw Error(error.message.replace(/^Error invoking remote method '[^']+': Error: /,''));}}
async function perform(action,payload={},message){
  if(locked)return;locked=true;renderControls();
  try{const result=await request(action,payload);if(message)notice(message);await refresh();return result;}
  catch(error){notice(error.message,true);}
  finally{locked=false;renderControls();}
}
async function refresh(){if(polling)return;polling=true;try{state=await request('snapshot');render();}catch{}finally{polling=false;}}
function renderControls(){if(!state)return;const busy=locked||!!state.operation||state.stopping;
  for(const id of ['save-settings','login','load-groups','save-group','pair'])$(id).disabled=busy||state.running;
  $('start').disabled=busy||state.running||!state.session||!state.config.allowedGroupId||!state.config.ownerUserId;
  $('stop').disabled=!state.running||state.stopping;
  $('pause').disabled=busy||!state.running;
  $('cancel').hidden=!state.operation;
}
function render(){const c=state.config,s=state.statuses;
  $('mcp-status').textContent=state.mcp?.enabled?'MCP quản trị app: sẵn sàng · chỉ trên máy này':'MCP quản trị app: chưa sẵn sàng';
  const live=c.mode==='live',provider=providerNames[c.ai?.provider]||c.ai?.provider;
  $('mode-badge').textContent=live?'GỬI THẬT':'THỬ NHÁP';$('mode-badge').classList.toggle('live',live);
  const status=state.operation||(state.stopping?'Đang dừng':state.connected?'Đã kết nối':state.running?'Đang kết nối':'Đã dừng');
  $('side-status').textContent=status;$('side-dot').classList.toggle('on',state.connected);
  $('hero-title').textContent=state.running?(state.paused?'BIMUP Zalo Assistance đang tạm ngưng gửi.':state.aiPaused?'AI đang tạm dừng.':'BIMUP Zalo Assistance đang làm việc cùng anh.'):'Sẵn sàng hỗ trợ cùng anh.';
  $('hero-description').textContent=state.operation|| (state.running?(live?'Đang theo dõi nhóm đã chọn. Anh có thể duyệt tin ngay trong app.':'Chế độ thử: BIMUP Zalo Assistance soạn nháp và lưu trên máy, chưa gửi bất kỳ tin nào.'):'Hoàn thành thiết lập rồi nhấn Chạy agent. Mọi trạng thái sẽ hiển thị tại đây.');
  $('connection').textContent=state.connected?'Đã kết nối':state.running?'Đang nối…':state.session?'Có phiên đăng nhập':'Chưa đăng nhập';
  $('group-summary').textContent=c.groupName||c.allowedGroupId||'Chưa chọn nhóm';
  $('review-count').textContent=s.review||0;$('queue-count').textContent=(s.queued||0)+(s.thinking||0);
  $('provider-summary').textContent=provider;$('ai-summary').textContent=state.aiPaused?'Đang dừng do số dư / hạn mức':c.ai?.model||'Model mặc định';
  if(state.management){const a=state.management.assistants.find(a=>a.id===state.management.activeId);$('provider-summary').textContent=a.name;$('ai-summary').textContent=`${a.connectionIds.length} AI · ${a.strategy==='fallback'?'Có dự phòng':a.strategy==='round-robin'?'Luân phiên':provider}`;}
  $('pause').textContent=state.paused?'Cho phép gửi lại':'Tạm ngưng gửi';
  $('owner-status').textContent=c.ownerUserId?`Đã ghép chủ: ${c.ownerUserId}`:'Chưa ghép tài khoản chủ.';

  $('resume-ai').hidden=!state.aiPaused;
  if(!settingsLoaded){$('mode').value=c.mode;settingsLoaded=true;}
  const current=$('group').value;const opts=state.groups.length?state.groups:c.allowedGroupId?[{id:c.allowedGroupId,name:c.groupName||c.allowedGroupId}]:[];
  if(JSON.stringify(opts)!==$('group').dataset.options){$('group').replaceChildren(node('option','Chọn nhóm…'));$('group').firstChild.value='';for(const g of opts){const option=node('option',g.name);option.value=g.id;$('group').append(option);}$('group').value=opts.some(g=>g.id===current)?current:c.allowedGroupId;$('group').dataset.options=JSON.stringify(opts);}
  $('checklist').replaceChildren();
  for(const [done,title,description] of [[!['deepseek','gemini-api'].includes(c.ai?.provider)||state.management?.connections.find(ai=>ai.id===state.management.assistants.find(a=>a.id===state.management.activeId)?.connectionIds[0])?.keySaved,'Cấu hình AI',provider],[state.session,'Đăng nhập tài khoản BIMUP Zalo Assistance','Quét QR bằng tài khoản agent'],[!!c.allowedGroupId,'Chọn nhóm trả lời',c.groupName||c.allowedGroupId||'Bắt đầu với nhóm thử'],[!!c.ownerUserId,'Ghép tài khoản chủ','Chỉ chủ mới có quyền điều khiển qua Zalo']]){
    const row=node('div',undefined,'check'+(done?' done':''));row.append(node('i',done?'✓':'○'));const text=node('div',title);text.append(node('small',description));row.append(text);$('checklist').append(row);
  }
  renderTasks();renderReports();renderControls();if(typeof managementRefresh==='function')managementRefresh();
}
const providerNames={'deepseek':'DeepSeek','claude-cli':'Claude CLI','gemini-api':'Gemini API','gemini-cli':'Gemini CLI cũ','antigravity-cli':'Antigravity CLI'};
const defaultModels={'deepseek':'deepseek-flash','gemini-api':'gemini-3.8-flash','antigravity-cli':'','claude-cli':''};
$('save-settings').onclick=()=>perform('set-mode',{mode:$('mode').value},'Đã lưu chế độ chạy.');
$('login').onclick=async()=>{if(state.session&&!await confirm('Đăng nhập lại Zalo?','Anh sẽ phải chọn nhóm và ghép chủ lại sau khi đổi tài khoản.'))return;await perform('login',{},'Đã đăng nhập Zalo. Chọn nhóm và ghép chủ để hoàn tất.');};
$('load-groups').onclick=()=>perform('groups');
$('save-group').onclick=()=>perform('group',{id:$('group').value},'Đã chọn nhóm.');
$('pair').onclick=()=>perform('pair',{},'Đã ghép tài khoản chủ.');
$('cancel').onclick=()=>request('cancel').catch(error=>notice(error.message,true));
$('start').onclick=async()=>{if(state.config.mode==='live'&&!await confirm('Bật gửi tin thật?','BIMUP Zalo Assistance sẽ gửi tin về nhóm '+(state.config.groupName||state.config.allowedGroupId)+'. Lời chào có thể được tự gửi; các tin cần duyệt sẽ chờ anh.'))return;await perform('start',{confirmLive:true},'Agent đã khởi động.');};
$('stop').onclick=()=>perform('stop',{},'Agent đã dừng.');
$('pause').onclick=()=>perform('command',{command:state.paused?'resume':'pause'});
$('resume-ai').onclick=()=>perform('command',{command:'resume-ai'},'Đã cho phép AI chạy lại. Dùng Thử lại cho tin đang review nếu cần.');
$('open-data').onclick=()=>perform('open-data');
$('task-filter').onchange=()=>{selected=null;renderTasks();};
let detailSignature='';
function renderTasks(){const tasks=state.tasks.filter(task=>$('task-filter').value==='all'||task.status===$('task-filter').value);
  $('task-list').replaceChildren();if(!tasks.length)$('task-list').append(node('div','Chưa có tin ở trạng thái này.','empty'));
  for(const task of tasks){const input=JSON.parse(task.input);const button=node('button',undefined,'task-row'+(selected===task.id?' active':''));button.append(node('span',statuses[task.status]||task.status,'badge'),node('strong',input.text||'(Không có văn bản)'),node('small',task.created+' · '+task.id));button.onclick=()=>{selected=task.id;detailSignature='';renderTasks();};$('task-list').append(button);}
  const task=state.tasks.find(t=>t.id===selected);const signature=task?JSON.stringify(task):'';if(signature===detailSignature)return;detailSignature=signature;
  $('task-detail').replaceChildren();if(!task){$('task-detail').append(node('div','Chọn một tin trong danh sách để xem nội dung.','empty'));return;}
  const input=JSON.parse(task.input);let decision={};try{decision=JSON.parse(task.decision)||{};}catch{}
  $('task-detail').append(node('h3',statuses[task.status]||task.status),node('div',task.id+' · '+task.created,'task-meta'),node('h3','Tin nhắn khách'),node('div',input.text,'message'));
  const label=node('label','Bản nháp trả lời khách'),editor=node('textarea');editor.value=decision.reply||'';editor.disabled=task.status!=='review';label.append(editor);$('task-detail').append(label);
  if(decision.reason)$('task-detail').append(node('p','Lý do: '+decision.reason,'hint'));
  if(decision.report)$('task-detail').append(node('p','Nội bộ: '+decision.report,'hint'));
  const actions=node('div',undefined,'task-actions');
  const add=(text,command,className)=>{const button=node('button',text,className);button.onclick=async()=>{
    if(command==='approve'&&!await confirm('Duyệt bản trả lời?',state.config.mode==='live'?'Bản đã sửa sẽ được gửi về nhóm khi agent đang chạy và không tạm ngưng gửi.':'Đây là chế độ thử: bản duyệt chỉ được xử lý như bản nháp, không gửi khách.'))return;
    if(command==='close-task'&&!await confirm('Đã kiểm tra Zalo thực tế?','Chỉ đóng sau khi anh đã kiểm tra tin đã gửi hay chưa. BIMUP Zalo Assistance sẽ không gửi lại.'))return;
    if(command==='retry'&&!await confirm('Cho AI xử lý lại?','Bản nháp cũ sẽ bị bỏ. Ở chế độ thật, câu đủ điều kiện có thể được tự gửi.'))return;
    await perform('command',{command,id:task.id,...(command==='approve'?{reply:editor.value,confirmLive:true}:{})});
  };actions.append(button);};
  if(task.status==='review'){add('✓ Duyệt bản trả lời','approve','primary');add('Từ chối','reject','danger');add('Thử lại AI','retry','secondary');}
  if(task.status==='uncertain'){$('task-detail').append(node('p','Kết quả gửi chưa rõ. Kiểm tra tin trên Zalo trước khi đóng. Không tự gửi lại.','hint'));add('Đã kiểm tra · đóng tin','close-task','secondary');}
  $('task-detail').append(actions);
}
function renderReports(){const target=$('report-list');target.replaceChildren();if(!state.reports.length){target.append(node('div','Chưa có báo cáo.','empty'));return;}for(const report of state.reports){const item=node('div',undefined,'log-entry');item.append(node('small',`${report.task_id||'BIMUP Zalo Assistance'} · ${report.status}`),node('div',report.text));target.append(item);}}
function addLog(text){logs.unshift({time:new Date().toLocaleTimeString('vi-VN'),text:String(text)});if(logs.length>200)logs.pop();for(const [id,limit] of [['session-logs',200],['recent-logs',4]]){const target=$(id);target.classList.remove('empty');target.replaceChildren();for(const log of logs.slice(0,limit)){const row=node('div',undefined,'log-entry');row.append(node('small',log.time),node('div',log.text));target.append(row);}}}
window.jev.onEvent(({event,data})=>{
  if(event==='qr'){$('qr-area').hidden=!data;if(data){$('qr').src=data;void openPlatforms();}else $('qr').removeAttribute('src');}
  if(event==='pair'){$('pair-area').hidden=!data;$('pair-code').textContent=data||'';}
  if(event==='log')addLog(data);
  if(event==='fatal'){notice(data,true);addLog(data);if(state){state.running=false;state.connected=false;render();}}
  if(event==='state'||event==='ready')void refresh();
});
void refresh();setInterval(refresh,1800);
