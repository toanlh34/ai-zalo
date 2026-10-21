const {app,BrowserWindow,ipcMain,safeStorage,shell,dialog}=require('electron');
const {spawn}=require('node:child_process');
const {createInterface}=require('node:readline');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let startupError='',mcpError=null,mcpEnabled=false,window,child,ready=false,quitting=false,counter=0;
const pending=new Map();
// Bind the singleton lock to this data directory before claiming it. Test/profile
// windows must not redirect to an unrelated running production instance.
const data=process.env.JEV_DESKTOP_DATA||path.join(app.getPath('appData'),app.isPackaged?'jev-bimup-desktop':'zalo-local-assistant');
fs.mkdirSync(data,{recursive:true});app.setPath('userData',data);
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{window?.show();window?.focus();});
app.whenReady().then(async()=>{
  app.setAppUserModelId('vn.bimup.jev');
  // Resolve Windows short paths before ESM imports (portable extraction uses 8.3 paths).
  const source=fs.realpathSync.native(app.isPackaged?path.join(process.resourcesPath,'engine'):path.join(__dirname,'..'));
  // Preserve the existing data location when changing the visible product name.
  const secretPath=path.join(data,'deepseek-key.bin');
  const geminiSecretPath=path.join(data,'gemini-key.bin');
  const vaultPath=path.join(data,'ai-connections.bin');
  let profileKeys={};try{if(fs.existsSync(vaultPath))profileKeys=JSON.parse(safeStorage.decryptString(fs.readFileSync(vaultPath)));}catch{}
  let key='';try{if(fs.existsSync(secretPath))key=safeStorage.decryptString(fs.readFileSync(secretPath));}catch{}
  let geminiKey='';try{if(fs.existsSync(geminiSecretPath))geminiKey=safeStorage.decryptString(fs.readFileSync(geminiSecretPath));}catch{}
  const node=app.isPackaged?path.join(process.resourcesPath,'runtime','node.exe'):process.env.JEV_NODE_EXE||path.join(__dirname,'..','.desktop-runtime','node.exe');
  window=new BrowserWindow({width:1320,height:900,minWidth:1050,minHeight:720,title:'BIMUP Zalo Assistance',backgroundColor:'#f4f6fa',show:false,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.removeMenu();window.once('ready-to-show',()=>window.show());
  const page=pathToFileURL(path.join(__dirname,'index.html')).href;
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',e=>e.preventDefault());
  window.loadFile(path.join(__dirname,'index.html'));
  const emit=(event,data)=>{if(!window.isDestroyed())window.webContents.send('jev:event',{event,data});};
  function request(action,payload){
    return new Promise((resolve,reject)=>{
      if(!ready&&action!=='shutdown'){reject(Error(startupError||'Bộ máy đang khởi động. Thử lại sau vài giây.'));return;}
      const id=++counter;pending.set(id,{resolve,reject});
      child.stdin.write(JSON.stringify({id,action,payload})+'\n',error=>{if(error){pending.delete(id);reject(Error('Bộ máy đã dừng.'));}});
    });
  }
  child=spawn(node,[path.join(source,'desktop','service.mjs')],{cwd:source,windowsHide:true,stdio:['pipe','pipe','pipe'],
    env:{...process.env,JEV_AI_KEYS:JSON.stringify(profileKeys),JEV_DATA_ROOT:data,JEV_SOURCE_ROOT:source,DEEPSEEK_API_KEY:key||process.env.DEEPSEEK_API_KEY||'',GEMINI_API_KEY:geminiKey||process.env.GEMINI_API_KEY||''}});
  createInterface({input:child.stdout}).on('line',line=>{
    let value;try{value=JSON.parse(line);}catch{return;}
    if(value.event==='ready'){ready=true;mcpEnabled=!!value.mcpEnabled;mcpError=value.mcpError??null;}
    if(value.event==='mcp-request'){
      const call=value.data;
      handleAction(call.action,call.payload).then(result=>child.stdin.write(JSON.stringify({event:'mcp-response',id:call.id,result})+'\n')).catch(error=>child.stdin.write(JSON.stringify({event:'mcp-response',id:call.id,error:error.message,errorCode:error.code})+'\n'));return;
    }
    if(value.id){const call=pending.get(value.id);if(call){pending.delete(value.id);value.error?call.reject(Object.assign(Error(value.error),{code:value.errorCode})):call.resolve(value.result);}}
    else emit(value.event,value.data);
  });
  child.stderr.on('data',chunk=>{
    if(ready)return;
    const missing=String(chunk).match(/Cannot find (?:package|module) ['"]([^'"\r\n]+)['"]/);
    if(missing)startupError='Thiếu mô-đun khởi động: '+missing[1];
  });
  child.on('error',()=>emit('fatal','Không khởi động được bộ máy Node. Hãy build lại app.'));
  child.on('exit',()=>{ready=false;for(const call of pending.values())call.reject(Error('Bộ máy đã dừng. Mở lại ứng dụng.'));pending.clear();if(!quitting)emit('fatal','Bộ máy đã dừng. Đóng và mở lại app để phục hồi.');});
  async function handleAction(action,payload={}){
    const allowed=['snapshot','settings','set-mode','login','groups','group','pair','cancel','start','stop','command','save-key','open-data','open-knowledge','cli-status','test-ai','save-connection','save-assistant','delete-connection','delete-assistant','activate-assistant','test-assistant','save-profile-key','open-assistant-knowledge','knowledge-list','knowledge-read','knowledge-write'];
    if(!allowed.includes(action))throw Error('Invalid action');
    if(action==='save-connection'){
      const before=await request('snapshot');const previous=before.management.connections.find(c=>c.id===payload.id);
      const result=await request(action,payload);
      if(previous&&previous.provider!==result.provider&&profileKeys[result.id]){delete profileKeys[result.id];fs.writeFileSync(vaultPath,safeStorage.encryptString(JSON.stringify(profileKeys)));}
      return result;
    }
    if(action==='save-profile-key'){
      const state=await request('snapshot');if(state.running||state.operation||state.stopping)throw Error('Dừng agent trước khi lưu key.');
      const connection=state.management.connections.find(c=>c.id===payload.id);
      if(!connection||connection.id==='legacy-ai'||!['deepseek','gemini-api'].includes(connection.provider))throw Error('Chọn kết nối API riêng hợp lệ.');
      if(!safeStorage.isEncryptionAvailable())throw Error('Windows không sẵn sàng mã hóa API key.');
      const value=String(payload.key??'').trim();if(!value||value.length>1000)throw Error('Nhập API key hợp lệ.');
      const updated={...profileKeys,[payload.id]:value};
      fs.writeFileSync(vaultPath+'.tmp',safeStorage.encryptString(JSON.stringify(updated)));fs.renameSync(vaultPath+'.tmp',vaultPath);profileKeys=updated;
      await request('set-profile-key',{id:payload.id,key:value});return true;
    }
    if(action==='open-assistant-knowledge'){
      const folder=await request('assistant-folder',{id:payload.id});await shell.openPath(path.join(folder,'knowledge'));return;
    }
    if(action==='save-key'){
      const state=await request('snapshot');if(state.running||state.operation)throw Error('Dừng agent trước khi lưu key.');
      if(!safeStorage.isEncryptionAvailable())throw Error('Windows không sẵn sàng mã hóa API key.');
      const value=String(payload.key??'').trim();if(!value||value.length>1000)throw Error('Nhập API key hợp lệ.');
      const provider=payload.provider??'deepseek';if(!['deepseek','gemini-api'].includes(provider))throw Error('Chọn nhà cung cấp API hợp lệ.');
      fs.writeFileSync(provider==='gemini-api'?geminiSecretPath:secretPath,safeStorage.encryptString(value));
      // Set only the engine environment; key never travels back to renderer.
      await request('set-key',{key:value,provider});return true;
    }
    if(action==='open-data'){await shell.openPath(data);return;}
    if(action==='open-knowledge'){const state=await request('snapshot');const folder=await request('assistant-folder',{id:state.management.activeId});await shell.openPath(path.join(folder,'knowledge'));return;}
    const result=await request(action,payload);
    if(action==='snapshot')return {...result,management:{...result.management,connections:result.management.connections.map(c=>({...c,keySaved:c.id==='legacy-ai'?fs.existsSync(c.provider==='gemini-api'?geminiSecretPath:secretPath):c.keySaved}))},keySaved:fs.existsSync(secretPath),geminiKeySaved:fs.existsSync(geminiSecretPath),dataRoot:data,mcp:{enabled:mcpEnabled,localOnly:true,errorCode:mcpError}};
    if(action==='delete-connection'&&profileKeys[payload.id]){delete profileKeys[payload.id];fs.writeFileSync(vaultPath,safeStorage.encryptString(JSON.stringify(profileKeys)));}
    return result;
  }
  ipcMain.handle('jev:request',async(event,action,payload={})=>{
    if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame||event.senderFrame.url!==window.webContents.getURL())throw Error('Invalid sender');
    return handleAction(action,payload);
  });
  app.on('before-quit',event=>{
    if(quitting)return;event.preventDefault();quitting=true;
    emit('log','Đang dừng agent trước khi đóng ứng dụng…');
    request('shutdown').then(()=>app.quit()).catch(()=>app.quit());
  });
  window.on('close',event=>{if(!quitting){event.preventDefault();app.quit();}});
});
}
