let managerData,managerConnections=[],managerBusy=false,connectionsLoaded=false;
function managerStatus(text,error=false){if(!$('manager').open)notice(text,error);$('manager-status').textContent=text;$('manager-status').classList.toggle('error',error);}
async function managerAction(action,payload){
  if(managerBusy)return;managerBusy=true;managerControls();managerStatus('Đang xử lý…');
  try{const result=await request(action,payload);state=await request('snapshot');render();managerData=state.management;managerList();managerStatus('Đã thực hiện.');return result??true;}
  catch(error){managerStatus(error.message,true);return false;}
  finally{managerBusy=false;managerControls();}
}
function managerControls(){
  const disabled=managerBusy||locked||state?.running||!!state?.operation||state?.stopping;
  for(const id of ['assistant-save','assistant-activate','assistant-delete','assistant-test','connection-save','connection-delete','connection-save-key'])$(id).disabled=disabled;
  if(disabled&&!managerBusy)managerStatus('Dừng agent hoặc hủy thiết lập ở cửa sổ chính trước khi thay đổi.');
  $('manager-close').disabled=managerBusy;
}
function managerList(){
  if(!managerData)return;
  $('manager-active').textContent='Đang chọn: '+managerData.assistants.find(a=>a.id===managerData.activeId)?.name;
  $('manager-new').textContent='+ Tạo trợ lý';
  $('manager-list').replaceChildren();
  for(const item of managerData.assistants){
    const button=node('button',undefined,'manager-item');button.type='button';button.append(node('strong',item.name));
    button.append(node('small',`${item.connectionIds.length} AI${item.id===managerData.activeId?' · Đang chọn':''}`));
    button.onclick=()=>{if(managerBusy)return;editAssistant(item);};$('manager-list').append(button);
  }
}
function managerAssignments(){
  $('assistant-connections').replaceChildren();
  const ids=[...managerConnections,...managerData.connections.filter(c=>!managerConnections.includes(c.id)).map(c=>c.id)];
  for(const id of ids){const c=managerData.connections.find(c=>c.id===id);if(!c)continue;
    const row=node('div',undefined,'assignment-row'),label=node('label'),check=node('input');check.type='checkbox';check.checked=managerConnections.includes(id);check.setAttribute('aria-label',c.name);
    check.onchange=()=>{managerConnections=check.checked?[...managerConnections,id]:managerConnections.filter(x=>x!==id);managerAssignments();};
    label.append(check,node('span',c.name+' · '+(c.model||providerNames[c.provider])));row.append(label);
    if(check.checked)for(const [caption,offset] of [['↑',-1],['↓',1]]){const b=node('button',caption,'secondary');b.type='button';b.setAttribute('aria-label',`${caption} ${c.name}`);const index=managerConnections.indexOf(id);b.disabled=index+offset<0||index+offset>=managerConnections.length;b.onclick=()=>{[managerConnections[index],managerConnections[index+offset]]=[managerConnections[index+offset],managerConnections[index]];managerAssignments();};row.append(b);}
    $('assistant-connections').append(row);
  }
}
function editAssistant(a={}){
  managerPane('profile');
  $('assistant-age').value=a.age??'';$('assistant-personality').value=a.personality||'';
  $('assistant-platforms').hidden=a.id!==managerData.activeId;$('platform-selection-note').textContent=a.id===managerData.activeId?'Zalo của trợ lý này: phiên đăng nhập, nhóm và chủ riêng.':'Lưu và bấm Dùng trợ lý này để cài kết nối Zalo riêng.';
  $('assistant-id').value=a.id||'';$('assistant-name').value=a.name||'';$('assistant-role').value=a.role||'';$('assistant-skill').value=a.skill||'';$('assistant-strategy').value=a.strategy||'primary';
  managerConnections=[...(a.connectionIds||[])];managerAssignments();$('assistant-result').hidden=true;
  for(const id of ['assistant-activate','assistant-knowledge','assistant-delete','assistant-test'])$(id).hidden=!a.id;
  $('assistant-delete').hidden=!a.id||a.id==='default'||a.id===managerData.activeId;managerControls();
}
function editConnection(c={}){
  $('connection-id').value=c.id||'';$('connection-name').value=c.name||'';$('connection-provider').value=c.provider||'deepseek';$('connection-model').value=c.model||'';$('connection-key').value='';
  $('connection-key-area').hidden=!c.id||!['deepseek','gemini-api'].includes(c.provider);
  $('connection-key-status').textContent=c.keySaved?'Đã lưu key mã hóa trên Windows.':'Chưa lưu key cho kết nối này.';
  $('connection-usage').textContent=c.id?'Đang dùng bởi: '+(managerData.assistants.filter(a=>a.connectionIds.includes(c.id)).map(a=>a.name).join(', ')||'Chưa gán trợ lý'):'';
  $('connection-cli-status').hidden=c.provider!=='antigravity-cli';
  $('connection-delete').hidden=!c.id||c.id==='legacy-ai';managerControls();
}
function managementRefresh(){
  managerData=state.management;if(!managerData)return;
  $('connection-list').replaceChildren();for(const c of managerData.connections){const b=node('button',undefined,'manager-item');b.append(node('strong',c.name),node('small',providerNames[c.provider]+' · '+(c.model||'Mặc định')));b.onclick=()=>{if(!managerBusy)editConnection(c);};$('connection-list').append(b);}
  if(!connectionsLoaded){connectionsLoaded=true;editConnection(managerData.connections[0]);}
  if($('manager').open){managerList();managerControls();}
}
$('open-manager').onclick=async()=>{await refresh();managerData=state.management;managerList();editAssistant(managerData.assistants.find(a=>a.id===managerData.activeId));managerStatus('Chọn trợ lý để chỉnh sửa hoặc tạo mới.');$('manager').showModal();managerControls();};
$('manager-close').onclick=()=>{$('manager').close();settingsLoaded=false;void refresh();};
$('manager').oncancel=e=>{if(managerBusy)e.preventDefault();else{settingsLoaded=false;void refresh();}};
$('manager-new').onclick=()=>{if(!managerBusy)editAssistant();};
$('connection-new').onclick=()=>{if(!managerBusy)editConnection();};
$('assistant-form').onsubmit=async e=>{e.preventDefault();const result=await managerAction('save-assistant',{id:$('assistant-id').value||undefined,name:$('assistant-name').value,age:$('assistant-age').value,personality:$('assistant-personality').value,role:$('assistant-role').value,skill:$('assistant-skill').value,strategy:$('assistant-strategy').value,connectionIds:managerConnections});if(result)editAssistant(result);};
$('connection-form').onsubmit=async e=>{e.preventDefault();const result=await managerAction('save-connection',{id:$('connection-id').value||undefined,name:$('connection-name').value,provider:$('connection-provider').value,model:$('connection-model').value});if(result)editConnection(managerData.connections.find(c=>c.id===result.id));};
$('assistant-activate').onclick=async()=>{if(await managerAction('activate-assistant',{id:$('assistant-id').value})){settingsLoaded=false;editAssistant(managerData.assistants.find(a=>a.id===managerData.activeId));}};
$('assistant-knowledge').onclick=()=>managerAction('open-assistant-knowledge',{id:$('assistant-id').value});
$('assistant-test').onclick=async()=>{const result=await managerAction('test-assistant',{id:$('assistant-id').value,text:$('assistant-test-text').value});if(result){$('assistant-result').textContent=result.message;$('assistant-result').hidden=false;}};
$('assistant-delete').onclick=async()=>{if(!await confirm('Xóa cấu hình trợ lý?','Tài liệu và lịch sử trên máy được giữ lại.'))return;if(await managerAction('delete-assistant',{id:$('assistant-id').value}))editAssistant();};
$('connection-delete').onclick=async()=>{if(!await confirm('Xóa kết nối AI?','Chỉ xóa được khi không có trợ lý nào đang dùng kết nối.'))return;if(await managerAction('delete-connection',{id:$('connection-id').value}))editConnection();};
$('connection-save-key').onclick=async()=>{const key=$('connection-key').value;$('connection-key').value='';const c=managerData.connections.find(c=>c.id===$('connection-id').value);if(!c)return;if(await managerAction(c.id==='legacy-ai'?'save-key':'save-profile-key',c.id==='legacy-ai'?{provider:c.provider,key}:{id:c.id,key}))editConnection(managerData.connections.find(c=>c.id===$('connection-id').value));};
$('connection-provider').onchange=()=>{$('connection-key-area').hidden=true;};

$('connection-cli-status').onclick=async()=>{const result=await managerAction('cli-status',{});if(result)managerStatus(result.message,!result.installed);};

function managerPane(name){$('profile-pane').hidden=name!=='profile';$('platform-pane').hidden=name!=='platform';$('assistant-profile-tab').className=name==='profile'?'primary':'secondary';$('assistant-platform-tab').className=name==='platform'?'primary':'secondary';document.querySelector('.manager-layout').scrollTop=0;}
$('assistant-profile-tab').onclick=()=>managerPane('profile');$('assistant-platform-tab').onclick=()=>managerPane('platform');

async function openPlatforms(){if(!$('manager').open)await $('open-manager').onclick();managerPane('platform');}
