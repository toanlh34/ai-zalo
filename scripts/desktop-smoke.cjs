const {_electron:electron,chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'desktop-test-artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const portableName=`BIMUP-Zalo-Assistance-${require('../package.json').version}-Windows.exe`;
  const installedIndex=process.argv.indexOf('--installed'),installedExecutable=installedIndex<0?null:process.argv[installedIndex+1];
  if(installedIndex>=0){
    assert.ok(installedExecutable&&path.isAbsolute(installedExecutable),'Usage: node scripts/desktop-smoke.cjs --installed <absolute app executable>');
    assert.ok(fs.statSync(installedExecutable).isFile(),'Installed app executable must be an existing file');
    assert.ok(!process.argv.includes('--portable'),'Choose either --installed or --portable');
  }
  const portable=process.argv.includes('--portable');
  const packaged=process.argv.includes('--packaged')||portable||!!installedExecutable;
  const bundleRoot=installedExecutable?path.dirname(installedExecutable):path.join(root,'release','win-unpacked'),resources=path.join(bundleRoot,'resources');
  if(packaged){
    for(const name of ['zod','zca-js','@modelcontextprotocol/sdk'])assert.ok(fs.existsSync(path.join(resources,'engine','node_modules',name,'package.json')),`Missing bundled dependency: ${name}`);
    for(const entry of [path.join('runtime','node.exe'),path.join('engine','src','app-mcp.mjs')])assert.ok(fs.existsSync(path.join(resources,entry)),`Missing bundled entry: ${entry}`);
  }
  const mcpEntry=installedExecutable?path.join(bundleRoot,'mcp-launcher.cjs'):packaged?path.join(resources,'engine','src','app-mcp.mjs'):path.join(root,'src','app-mcp.mjs');
  if(installedExecutable)assert.ok(fs.existsSync(mcpEntry),'Missing installed MCP launcher');
  const dataIndex=process.argv.indexOf('--data-root'),suppliedData=dataIndex<0?null:process.argv[dataIndex+1];
  if(dataIndex>=0){
    assert.ok(installedExecutable,'--data-root is only supported with --installed');
    assert.ok(suppliedData&&path.isAbsolute(suppliedData),'--data-root requires an absolute isolated test directory');
    fs.mkdirSync(suppliedData,{recursive:true});const info=fs.lstatSync(suppliedData);
    assert.ok(info.isDirectory()&&!info.isSymbolicLink(),'Test data directory must be a regular directory');
    assert.ok(fs.readdirSync(suppliedData).every(name=>name==='installer-preservation.sentinel'),'Test data directory must be empty except installer-preservation.sentinel');
  }
  const data=suppliedData||fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jev-desktop-smoke-'));
  const sentinelPath=path.join(data,'installer-preservation.sentinel'),sentinelContents=fs.existsSync(sentinelPath)?fs.readFileSync(sentinelPath):null;
  const env={...process.env,JEV_DESKTOP_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  async function launchApp(){
  if(portable){
    // The NSIS launcher does not pipe Electron's inspector output to Playwright.
    // Attach to the unpacked UI via a loopback debugging port for this test only.
    const server=require('node:net').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=require('node:child_process').spawn(path.join(root,'release',portableName),[`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:'ignore'});
    let browser;const deadline=Date.now()+90000;
    while(Date.now()<deadline){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});break;}catch{await new Promise(resolve=>setTimeout(resolve,700));}}
    if(!browser)throw Error('Portable app did not expose its test window');
    return {async firstWindow(){for(let n=0;n<30;n++){const page=browser.contexts()[0]?.pages()[0];if(page)return page;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('No portable window');},async close(){const page=browser.contexts()[0]?.pages()[0];if(page)await page.evaluate(()=>window.close()).catch(()=>{});await new Promise(resolve=>setTimeout(resolve,1200));await browser.close().catch(()=>{});}};
  }else return electron.launch({executablePath:packaged?installedExecutable||path.join(bundleRoot,'BIMUP Zalo Assistance.exe'):require('electron'),args:packaged?[]:[root],env,timeout:60000});
  }
  let app=await launchApp();
  try{
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.querySelector('#side-status')?.textContent==='Đã dừng',null,{timeout:20000}).catch(async error=>{console.log(await page.evaluate(async()=>{try{return {url:location.href,state:await window.jev.request('snapshot')};}catch(e){return {url:location.href,error:e.message,bridge:typeof window.jev};}}));await page.screenshot({path:path.join(artifacts,'launch-failure.png')});throw error;});
    assert.equal(await page.title(),'BIMUP Zalo Assistance');
    const assertEmpty=async currentPage=>{
      const state=await currentPage.evaluate(()=>window.jev.request('snapshot'));
      assert.equal(state.management.activeId,null);assert.deepEqual(state.management.assistants,[]);assert.deepEqual(state.management.connections,[]);
      assert.ok(!state.config.ai?.provider);assert.equal(state.session,false);assert.deepEqual(state.tasks,[]);
      assert.equal(await currentPage.locator('#connection-provider').inputValue(),'');
      assert.equal(await currentPage.locator('#start').isDisabled(),true);
      assert.equal(await currentPage.locator('#provider-summary').textContent(),'Chưa chọn trợ lý');
    };
    await assertEmpty(page);
    await page.reload();await page.waitForFunction(()=>document.querySelector('#side-status')?.textContent==='Đã dừng');await assertEmpty(page);
    await page.locator('#open-manager').click();await page.locator('#manager').waitFor({state:'visible'});
    for(const id of ['assistant-name','assistant-age','assistant-personality','assistant-role','assistant-skill','assistant-test-text'])assert.equal(await page.locator('#'+id).inputValue(),'');
    assert.equal(await page.locator('#assistant-delete').isVisible(),false);assert.equal(await page.locator('#assistant-platforms').isVisible(),false);
    await page.locator('#manager-close').click();
    await page.waitForFunction(()=>document.querySelector('#mcp-status')?.textContent==='MCP quản trị app: sẵn sàng · chỉ trên máy này',null,{timeout:15000}).catch(async error=>{console.log('MCP startup status',JSON.stringify((await page.evaluate(()=>window.jev.request('snapshot'))).mcp));throw error;});
    const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
    const mcpClient=new Client({name:'bimup-smoke',version:'1.0.0'});
    const transport=new StdioClientTransport({command:packaged?path.join(resources,'runtime','node.exe'):process.execPath,args:[mcpEntry],env:{...process.env,BIMUP_APP_DATA:data}});
    try{
      await mcpClient.connect(transport);const catalog=await mcpClient.listTools();assert.equal(catalog.tools.length,13);
      const call=async(name,args={})=>{const r=await mcpClient.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r.content));return JSON.parse(r.content[0].text);};
      assert.equal((await call('app_status')).running,false);
      const mcpConnection=await call('save_ai_connection',{name:'MCP AI kiểm thử',provider:'claude-cli',model:''});
      const created=await call('save_assistant',{name:'MCP kiểm thử',role:'Hỗ trợ',skill:'Chỉ dùng tài liệu',connectionIds:[mcpConnection.id]});
      assert.ok((await page.evaluate(()=>window.jev.request('snapshot'))).management.assistants.some(a=>a.id===created.id),'MCP-created profile is immediately visible to app');
      await call('write_knowledge',{id:created.id,filename:'example.md',content:'Dữ liệu giả · tiếng Việt'});assert.equal((await call('read_knowledge',{id:created.id,filename:'example.md'})).content,'Dữ liệu giả · tiếng Việt');
      const descriptor=JSON.parse(fs.readFileSync(path.join(data,'.private','mcp-bridge.json'),'utf8'));
      assert.equal((await fetch('http://127.0.0.1:'+descriptor.port+'/call',{method:'POST',headers:{Authorization:'Bearer invalid'},body:'{}'})).status,403);
      assert.equal((await fetch('http://127.0.0.1:'+descriptor.port+'/call',{method:'POST',headers:{Authorization:'Bearer '+descriptor.token,Origin:'https://untrusted.invalid'},body:'{}'})).status,403);
      await call('delete_assistant',{id:created.id});
      await call('delete_ai_connection',{id:mcpConnection.id});
    }finally{await mcpClient.close();}

    await page.screenshot({path:path.join(artifacts,installedExecutable?'installed-dashboard.png':packaged?'packaged-dashboard.png':'dashboard.png'),fullPage:true});
    assert.equal(await page.locator('#start').isDisabled(),true);
    await page.locator('[data-page="setup"]').click();
    assert.equal(await page.locator('#setup #login').count(),0,'Platform setup belongs to assistant');
    assert.equal(await page.locator('#manager #connection-provider').count(),0,'Model configuration stays in Settings AI');
    await page.locator('#connection-new').click();assert.equal(await page.locator('#connection-provider').inputValue(),'');
    await page.fill('#connection-name','CLI dự phòng · test');await page.selectOption('#connection-provider','deepseek');await page.fill('#connection-model','deepseek-flash');await page.locator('#connection-save').click();
    await page.waitForFunction(()=>document.querySelector('#connection-id').value.length===36&&!document.querySelector('#connection-save').disabled);
    const fallbackConnectionId=await page.locator('#connection-id').inputValue();
    await page.fill('#connection-key','synthetic-ui-test-key');await page.locator('#connection-save-key').click();
    await page.waitForFunction(()=>document.querySelector('#connection-key-status').textContent.includes('Đã lưu'));
    const encrypted=fs.readFileSync(path.join(data,'ai-connections.bin'));assert.ok(!encrypted.includes(Buffer.from('synthetic-ui-test-key')));
    assert.equal(fs.existsSync(path.join(data,'deepseek-key.bin')),false);assert.equal(fs.existsSync(path.join(data,'gemini-key.bin')),false);
    await page.selectOption('#connection-provider','gemini-api');await page.fill('#connection-model','gemini-3.8-flash');await page.locator('#connection-save').click();
    await page.waitForFunction(async id=>{const s=await window.jev.request('snapshot'),c=s.management.connections.find(c=>c.id===id);return c?.provider==='gemini-api'&&!c.keySaved&&!document.querySelector('#connection-save').disabled;},fallbackConnectionId);
    await page.fill('#connection-key','synthetic-gemini-ui-test-key');await page.locator('#connection-save-key').click();
    await page.waitForFunction(async id=>{const s=await window.jev.request('snapshot');return s.management.connections.find(c=>c.id===id)?.keySaved;},fallbackConnectionId);
    assert.ok(!fs.readFileSync(path.join(data,'ai-connections.bin')).includes(Buffer.from('synthetic-gemini-ui-test-key')));
    assert.ok(!JSON.stringify(await page.evaluate(()=>window.jev.request('snapshot'))).includes('synthetic-gemini-ui-test-key'));
    await page.selectOption('#connection-provider','antigravity-cli');await page.fill('#connection-model','');await page.locator('#connection-save').click();
    await page.waitForFunction(()=>!document.querySelector('#connection-cli-status').hidden&&!document.querySelector('#connection-save').disabled);
    assert.equal((await page.evaluate(()=>window.jev.request('snapshot'))).management.connections.find(c=>c.id===fallbackConnectionId).keySaved,false);
    await page.locator('#connection-cli-status').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Antigravity')&&!document.querySelector('#connection-save').disabled);
    await page.locator('#connection-new').click();await page.fill('#connection-name','API chung · test');await page.selectOption('#connection-provider','deepseek');await page.fill('#connection-model','test-model');await page.locator('#connection-save').click();
    await page.waitForFunction(()=>document.querySelector('#connection-id').value.length===36);
    const connectionId=await page.locator('#connection-id').inputValue();
    await page.fill('#connection-key','SYNTHETIC_NAMED_KEY');await page.locator('#connection-save-key').click();
    await page.waitForFunction(()=>document.querySelector('#connection-key-status').textContent.includes('Đã lưu'));
    assert.ok(!fs.readFileSync(path.join(data,'ai-connections.bin')).includes(Buffer.from('SYNTHETIC_NAMED_KEY')));
    await page.screenshot({path:path.join(artifacts,'setup.png'),fullPage:true});
    await page.locator('#open-manager').click();await page.locator('#manager').waitFor({state:'visible'});await page.locator('#manager-new').click();
    await page.fill('#assistant-name','Hana · test');await page.fill('#assistant-age','25');await page.fill('#assistant-personality','Điềm tĩnh');await page.fill('#assistant-role','Hỗ trợ kỹ thuật');await page.fill('#assistant-skill','Trả lời tiếng Nhật theo tài liệu');await page.selectOption('#assistant-strategy','fallback');

    await page.getByRole('checkbox',{name:'API chung · test',exact:true}).check();await page.getByRole('checkbox',{name:'CLI dự phòng · test',exact:true}).check();await page.locator('#assistant-save').click();
    await page.waitForFunction(()=>document.querySelector('#assistant-id').value.length===36);
    const assistantId=await page.locator('#assistant-id').inputValue();
    await page.locator('#assistant-profile-tab').click();
    await page.locator('#assistant-activate').click();await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.management.activeId===document.querySelector('#assistant-id').value;});
    const managed=await page.evaluate(()=>window.jev.request('snapshot')),profile=managed.management.assistants.find(a=>a.id===assistantId);
    assert.equal(managed.config.mode,'dry-run');assert.deepEqual(profile.connectionIds,[connectionId,fallbackConnectionId]);assert.equal(profile.age,'25');assert.equal(profile.personality,'Điềm tĩnh');assert.equal(managed.session,false);assert.ok(!JSON.stringify(managed).includes('SYNTHETIC_NAMED_KEY'));
    await page.locator('#assistant-platform-tab').click();assert.equal(await page.locator('#login').isVisible(),true);assert.equal(await page.locator('#assistant-teams-tenant').count(),0);await page.screenshot({path:path.join(artifacts,'zalo-connections.png'),fullPage:true});await page.locator('#assistant-profile-tab').click();
    await page.locator('#assistant-name').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'assistant-manager.png'),fullPage:true});
    await page.locator('#manager-close').click();
    // Seed a synthetic customer request without any Zalo or AI calls.
    const historyPath=path.join(data,'.private',`assistant-${assistantId}.sqlite`);
    const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(historyPath);
    try{db.prepare('INSERT INTO tasks(id,group_id,input,status) VALUES(?,?,?,?)').run('123:demo','123',JSON.stringify({text:'BIMUP có hỗ trợ triển khai Revit không anh?'}),'review');}finally{db.close();}
    await page.locator('[data-page="tasks"]').click();
    await page.locator('.task-row').waitFor();await page.locator('.task-row').click();
    await page.locator('#task-detail textarea').fill('Em xin chuyển anh phụ trách xác nhận phạm vi triển khai ạ.');
    await page.locator('#task-detail button').filter({hasText:'Duyệt bản trả lời'}).click();
    await page.locator('#confirm-yes').click();
    await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.tasks[0]?.status==='approved';});
    await page.selectOption('#task-filter','all');await page.locator('.task-row').click();
    await page.screenshot({path:path.join(artifacts,'tasks.png'),fullPage:true});
    await page.locator('[data-page="logs"]').click();await page.screenshot({path:path.join(artifacts,'logs.png'),fullPage:true});
    // Remove the active and last assistant through the same controls users see.
    await page.locator('#open-manager').click();await page.locator('#manager').waitFor({state:'visible'});
    assert.equal(await page.locator('#assistant-delete').isVisible(),true);
    await page.locator('#assistant-delete').click();await page.locator('#confirm-yes').click();
    await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.management.activeId===null&&s.management.assistants.length===0&&!document.querySelector('#assistant-save').disabled;});
    assert.equal(await page.locator('#assistant-platforms').isVisible(),false);
    await page.locator('#manager-close').click();
    assert.ok(fs.existsSync(historyPath),'Deleting a profile keeps its queue history');
    assert.ok(fs.existsSync(path.join(data,'assistants',assistantId,'agent','IDENTITY.md')),'Deleting a profile keeps its documents');
    await page.locator('[data-page="setup"]').click();
    for(const connectionName of ['API chung · test','CLI dự phòng · test']){
      await page.locator('#connection-list button').filter({hasText:connectionName}).click();
      const deletingId=await page.locator('#connection-id').inputValue();
      await page.locator('#connection-delete').click();await page.locator('#confirm-yes').click();
      await page.waitForFunction(async id=>{const s=await window.jev.request('snapshot');return !s.management.connections.some(c=>c.id===id)&&!document.querySelector('#connection-save').disabled;},deletingId);
    }
    await assertEmpty(page);await page.screenshot({path:path.join(artifacts,'empty-after-delete.png'),fullPage:true});
    assert.equal(fs.existsSync(path.join(data,'deepseek-key.bin')),false);assert.equal(fs.existsSync(path.join(data,'gemini-key.bin')),false);
    await app.close();app=null;await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(fs.existsSync(path.join(data,'.private','mcp-bridge.json')),false);assert.equal(fs.existsSync(path.join(data,'.private','worker.lock')),false);
    app=await launchApp();const reopened=await app.firstWindow();reopened.on('pageerror',e=>errors.push(e.message));
    await reopened.waitForFunction(()=>document.querySelector('#side-status')?.textContent==='Đã dừng',null,{timeout:20000});
    await assertEmpty(reopened);
    const savedRegistry=JSON.parse(fs.readFileSync(path.join(data,'assistants.json'),'utf8'));
    assert.deepEqual(savedRegistry,{version:1,activeId:null,connections:[],assistants:[]});
    assert.deepEqual(errors,[]);console.log('PASS: empty startup and restart, explicit named connections, encrypted API keys, MCP management, shared AI assignments, active/last profile deletion, preserved history, API/CLI selection, edited draft approval, navigation.');
  }finally{await app?.close();await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(fs.existsSync(path.join(data,'.private','mcp-bridge.json')),false,'Closing app removes MCP descriptor');
    assert.equal(fs.existsSync(path.join(data,'.private','worker.lock')),false,'Closing app releases worker lock');
    if(sentinelContents!==null)assert.deepEqual(fs.readFileSync(sentinelPath),sentinelContents,'Desktop operations preserve the installer data sentinel');
    if(!suppliedData)fs.rmSync(data,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
