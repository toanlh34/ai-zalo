import {existsSync,readFileSync,writeFileSync,rmSync,cpSync,mkdirSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {secureDirectory,loadSession} from '../src/session.mjs';
import {acquireLock} from '../src/lock.mjs';
import {openStore} from '../src/store.mjs';
import {createAgent} from '../src/agent.mjs';
import {createRuntime,validateRuntimeConfig} from '../src/runtime.mjs';
import {defaultAssistantNames} from '../src/filter.mjs';
import {loginWithQR} from '../src/zalo-login.mjs';
import {listGroups,pairOwner,saveConfig} from '../src/onboarding.mjs';
import {handleLocalCommand} from '../src/commands.mjs';
import {resolveAntigravityCommand} from '../src/antigravity.mjs';
import {createAssistantRegistry,createAssistantAgent} from '../src/assistants.mjs';

export function createDesktopController({dataRoot,sourceRoot,emit=()=>{},dependencies={}}){
  const secure=dependencies.secureDirectory??secureDirectory;
  mkdirSync(dataRoot,{recursive:true});
  for(const name of ['agent','knowledge'])if(!existsSync(join(dataRoot,name)))cpSync(join(sourceRoot,name),join(dataRoot,name),{recursive:true});
  const baseDir=join(dataRoot,'.private');secure(baseDir);
  const release=(dependencies.acquireLock??acquireLock)(join(baseDir,'worker.lock'));
  const configPath=join(dataRoot,'config.json');
  const savedConfig=existsSync(configPath);
  let config=JSON.parse(readFileSync(savedConfig?configPath:join(sourceRoot,'config.example.json'),'utf8'));
  if(!savedConfig)config={...config,ai:{}};
  const registry=createAssistantRegistry(dataRoot,savedConfig?config.ai:null,config);
  let activeId=registry.snapshot().activeId;
  let dir=activeId?join(registry.folder(activeId),'.private'):null;if(dir)secure(dir);
  config=activeId?{...config,chatScope:undefined,...registry.assistant(activeId).platforms.zalo,ai:registry.config(registry.assistant(activeId).connectionIds[0])}:{...config,allowedGroupId:'',groupName:'',ownerUserId:'',mode:'dry-run',ai:{}};
  const storePath=id=>id==='default'?join(baseDir,'jev.sqlite'):join(baseDir,`assistant-${id}.sqlite`);
  let store=activeId?(dependencies.openStore??openStore)(storePath(activeId)):null;
  let pausePath=activeId?join(baseDir,activeId==='default'?'PAUSED':`PAUSED-${activeId}`):null;
  const profileKeys={...(dependencies.profileKeys??{})};
  const managedAgent=(id=activeId)=>createAssistantAgent(registry,id,{keys:profileKeys,factory:dependencies.createAgent??createAgent,onUse:c=>emit('log',`Trợ lý ${registry.assistant(id).name} dùng ${c.name}${c.model?' · '+c.model:''}`)});
  let runtime,api,operation=null,controller,connected=false,groups=[],closed=false,stopping=false;
  store?.recover();
  const persist=()=>saveConfig(configPath,config);
  const idle=()=>{if(runtime||operation||stopping)throw Error('Dừng agent hoặc hủy thiết lập trước khi thay đổi.');};
  const requireActive=()=>{if(!activeId)throw Error('Cần tạo và chọn trợ lý trước khi thiết lập Zalo hoặc chạy agent.');};
  async function client(){
    const {Zalo,LoginQRCallbackEventType}=await (dependencies.zalo??(()=>import('zca-js')))();
    return {zalo:new Zalo({selfListen:false,logging:false,checkUpdate:false}),events:LoginQRCallbackEventType};
  }
  async function connect(){requireActive();if(!api){const {zalo}=await client();api=await zalo.login((dependencies.loadSession??loadSession)(dir));}return api;}
  async function runOperation(name,fn){
    idle();operation=name;controller=new AbortController();emit('state');
    try{return await fn(controller.signal);}finally{operation=null;controller=null;emit('qr',null);emit('pair',null);emit('state');}
  }
  function snapshot(){
    return {running:!!runtime,connected,operation,stopping,session:!!dir&&existsSync(join(dir,'session.dpapi')),config:{...config,ai:activeId?registry.config(registry.assistant(activeId).connectionIds[0]):{}},management:{...registry.snapshot(),connections:registry.snapshot().connections.map(c=>({...c,keySaved:!!profileKeys[c.id]}))},
      paused:!!pausePath&&existsSync(pausePath),...(store?.stats()??{statuses:{},pending:0,pendingReports:0,aiPaused:false}),groups,
      tasks:store?store.db.prepare('SELECT * FROM tasks ORDER BY rowid DESC LIMIT 100').all():[],
      reports:store?store.db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 100').all():[]};
  }
  async function stop(){
    if(stopping)return;stopping=true;emit('state');
    try{await runtime?.stop();runtime=null;api?.listener.stop();api=null;connected=false;}
    finally{stopping=false;emit('state');}
  }
  async function dispatch(action,payload={}){
    if(closed)throw Error('Ứng dụng đã đóng.');
    if(action==='snapshot')return snapshot();
    if(action==='cancel'){controller?.abort();return;}
    if(action==='set-profile-key'){idle();registry.connection(payload.id);if(typeof payload.key!=='string'||!payload.key.trim()||payload.key.length>1000)throw Error('Cần API key hợp lệ.');profileKeys[payload.id]=payload.key;return;}
    if(action==='save-connection'){idle();const previous=payload.id?registry.connection(payload.id):null;const result=registry.saveConnection(payload);if(previous&&previous.provider!==result.provider)delete profileKeys[result.id];emit('state');return result;}
    if(action==='save-assistant'){idle();const result=registry.saveAssistant(payload);emit('state');return result;}
    if(action==='delete-connection'){idle();registry.removeConnection(payload.id);delete profileKeys[payload.id];emit('state');return;}
    if(action==='delete-assistant'){
      idle();registry.removeAssistant(payload.id);
      if(payload.id===activeId){
        api?.listener.stop();api=null;groups=[];connected=false;store?.close();store=null;activeId=null;dir=null;pausePath=null;
        config={...config,allowedGroupId:'',groupName:'',ownerUserId:'',mode:'dry-run',ai:{}};persist();
      }
      emit('state');return;
    }
    if(action==='assistant-folder')return registry.folder(payload.id);
    if(['knowledge-list','knowledge-read','knowledge-write'].includes(action)){
      const folder=join(registry.folder(payload.id),'knowledge');
      if(action==='knowledge-list')return readdirSync(folder).filter(name=>name.endsWith('.md')&&lstatSync(join(folder,name)).isFile()).map(name=>({filename:name,bytes:lstatSync(join(folder,name)).size}));
      if(typeof payload.filename!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,96}\.md$/.test(payload.filename)||payload.filename.includes('..'))throw Error('Cần tên file Markdown, không kèm đường dẫn.');
      const path=join(folder,payload.filename);
      if(existsSync(path)&&(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||realpathSync(path)!==join(realpathSync(folder),payload.filename)))throw Error('Cần file Markdown thông thường trong thư mục kiến thức.');
      if(action==='knowledge-read'){if(lstatSync(path).size>240000)throw Error('Cần tài liệu dưới 240 KB.');return {filename:payload.filename,content:readFileSync(path,'utf8')};}
      idle();if(typeof payload.content!=='string'||payload.content.length>60000)throw Error('Cần nội dung dưới 60000 ký tự.');
      writeFileSync(path,payload.content,{flag:'w',mode:0o600});return {ok:true,filename:payload.filename};
    }
    if(action==='activate-assistant'){
      idle();registry.assistant(payload.id);
      if(payload.id===activeId)return;
      const next=(dependencies.openStore??openStore)(storePath(payload.id));
      try{next.recover();registry.activate(payload.id);}catch(error){next.close();throw error;}
      api?.listener.stop();api=null;groups=[];connected=false;
      store?.close();store=next;activeId=payload.id;pausePath=join(baseDir,activeId==='default'?'PAUSED':`PAUSED-${activeId}`);
      dir=join(registry.folder(activeId),'.private');secure(dir);
      config={...config,chatScope:undefined,...registry.assistant(activeId).platforms.zalo,mode:'dry-run',ai:registry.config(registry.assistant(activeId).connectionIds[0])};persist();emit('state');return;
    }
    if(action==='test-assistant')return runOperation('Đang thử trợ lý',async signal=>{
      const result=await managedAgent(payload.id).decide({message:{id:'assistant-test',text:String(payload.text??'Xin chào').slice(0,4000)},context:[]},{signal});
      return {ok:true,message:result.reply};
    });
    if(action==='set-key'){idle();if(!['deepseek','gemini-api'].includes(payload.provider??'deepseek'))throw Error('Chọn AI dùng API key hợp lệ.');process.env[payload.provider==='gemini-api'?'GEMINI_API_KEY':'DEEPSEEK_API_KEY']=String(payload.key);return;}
    if(action==='cli-status'){
      try{(dependencies.resolveAntigravityCommand??resolveAntigravityCommand)();return {installed:true,supported:true,message:'Đã tìm thấy Antigravity CLI (agy). Bấm Thử kết nối AI để kiểm tra phiên Google bằng một lời chào giả.'};}
      catch{return {installed:false,supported:true,message:'Chưa tìm thấy Antigravity CLI (agy). Cài agy và đăng nhập Google một lần; không cần cài Gemini CLI cũ.'};}
    }
    if(['test-ai','set-mode','settings','login','groups','group','pair','start','command'].includes(action))requireActive();
    if(action==='test-ai')return runOperation('Đang thử kết nối AI',async signal=>{
      const agent=managedAgent();
      const decision=await agent.decide({message:{id:'connection-test',sender:'BIMUP',text:'Xin chào'},context:[]},{signal});
      return {ok:true,message:'AI đã trả lời thành công: '+decision.reply};
    });
    if(action==='stop')return stop();
    if(action==='set-mode'){
      idle();if(!['live','dry-run'].includes(payload.mode))throw Error('Chọn chế độ hợp lệ.');
      if(config.mode==='dry-run'&&payload.mode==='live'&&(store.stats().statuses.approved??0)>0)throw Error('Cần chạy chế độ thử để xử lý các bản đã duyệt còn chờ trước khi bật gửi thật.');
      config={...config,mode:payload.mode};persist();return;
    }
    if(action==='settings'){
      idle();if(!['deepseek','claude-cli','gemini-api','antigravity-cli'].includes(payload.provider))throw Error('Chọn AI hợp lệ.');
      const model=String(payload.model??'').trim();if(model.length>150)throw Error('Tên model quá dài.');
      if(config.mode==='dry-run'&&payload.mode==='live'&&(store.stats().statuses.approved??0)>0)throw Error('Cần chạy chế độ thử để xử lý các bản đã duyệt còn chờ trước khi bật gửi thật.');
      if(activeId!=='default'||registry.assistant(activeId).connectionIds[0]!=='legacy-ai'){
        config={...config,mode:payload.mode==='live'?'live':'dry-run'};persist();return;
      }
      config={...config,mode:payload.mode==='live'?'live':'dry-run',ai:{provider:payload.provider,model,
        executable:payload.provider==='antigravity-cli'?'agy':'claude',apiKeyEnv:payload.provider==='gemini-api'?'GEMINI_API_KEY':'DEEPSEEK_API_KEY',timeoutMs:120000,mcpServers:{},allowedMcpTools:[],enableTools:payload.provider==='antigravity-cli'}};
      registry.saveConnection({id:'legacy-ai',name:'AI hiện có',provider:payload.provider,model});
      persist();return;
    }
    if(action==='login')return runOperation('Đang chờ quét QR',async signal=>{
      api?.listener.stop();api=null;
      const {zalo,events}=await client();
      api=await loginWithQR({zalo,events,privateDir:dir,signal,onQr:path=>emit('qr','data:image/png;base64,'+readFileSync(path).toString('base64'))});
      // A new agent account must be paired again, even if it has similar groups.
      config={...config,allowedGroupId:'',groupName:'',ownerUserId:''};groups=[];registry.saveZalo(activeId,config);persist();
      groups=await listGroups(api);return groups;
    });
    if(action==='groups')return runOperation('Đang tải nhóm',async()=>{groups=await listGroups(await connect());return groups;});
    if(action==='group'){
      idle();if(payload.id==='*'){config={...config,chatScope:'all',allowedGroupId:'',groupName:''};registry.saveZalo(activeId,config);persist();return;} // '*' = mọi nhóm + tin riêng
      const group=groups.find(g=>g.id===payload.id);if(!group)throw Error('Tải lại và chọn nhóm trong danh sách.');
      config={...config,chatScope:'single',allowedGroupId:group.id,groupName:group.name};registry.saveZalo(activeId,config);persist();return;
    }
    if(action==='pair')return runOperation('Đang chờ ghép chủ',async signal=>{
      const owner=await pairOwner({api:await connect(),signal,onCode:code=>emit('pair',`/jev pair ${code}`)});
      config={...config,ownerUserId:owner};registry.saveZalo(activeId,config);persist();return;
    });
    if(action==='start'){
      idle();validateRuntimeConfig(config);
      if(config.mode==='live'&&payload.confirmLive!==true)throw Error('Cần xác nhận bật gửi thật.');
      return runOperation('Đang kết nối Zalo',async()=>{
        const agent=managedAgent();
        await connect();
        runtime=(dependencies.createRuntime??createRuntime)({api,store,agent,config:{...config,assistantNames:[registry.assistant(activeId).name,...defaultAssistantNames]},pausePath,
          log:message=>{if(message.includes('đã kết nối'))connected=true;emit('log',message);emit('state');},
          onClosed:()=>{runtime=null;api=null;connected=false;emit('log','Zalo đã ngắt kết nối. Nhấn Chạy để kết nối lại.');emit('state');}});
        try{runtime.start();}catch(error){await runtime.stop();runtime=null;throw error;}
      });
    }
    if(action==='command'){
      const allowed=['approve','reject','retry','close-task','pause','resume','resume-ai'];
      if(!allowed.includes(payload.command))throw Error('Lệnh không hợp lệ.');
      if(payload.command==='approve'&&config.mode==='live'&&payload.confirmLive!==true)throw Error('Cần xác nhận gửi bản nháp đã duyệt.');
      const words=payload.reply===undefined?[]:[String(payload.reply)];
      handleLocalCommand({store,command:payload.command,id:String(payload.id??''),words,pausePath,log:text=>emit('log',text)});
      return;
    }
    throw Error('Thao tác không hỗ trợ.');
  }
  return {dispatch,snapshot,async close(){if(closed)return;controller?.abort();await stop();store?.close();release();closed=true;}};
}
