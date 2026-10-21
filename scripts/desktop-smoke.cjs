const {_electron:electron,chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'desktop-test-artifacts');fs.mkdirSync(artifacts,{recursive:true});
  const portableName=`BIMUP-Zalo-Assistance-${require('../package.json').version}-Windows.exe`;
  const data=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'jev-desktop-smoke-'));
  const portable=process.argv.includes('--portable');
  const packaged=process.argv.includes('--packaged')||portable;
  if(packaged)for(const name of ['zod','zca-js','@modelcontextprotocol/sdk'])assert.ok(fs.existsSync(path.join(root,'release','win-unpacked','resources','engine','node_modules',name,'package.json')),`Missing bundled dependency: ${name}`);
  const env={...process.env,JEV_DESKTOP_DATA:data};delete env.ELECTRON_RUN_AS_NODE;
  let app;
  if(portable){
    // The NSIS launcher does not pipe Electron's inspector output to Playwright.
    // Attach to the unpacked UI via a loopback debugging port for this test only.
    const server=require('node:net').createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const port=server.address().port;await new Promise(resolve=>server.close(resolve));
    const child=require('node:child_process').spawn(path.join(root,'release',portableName),[`--remote-debugging-port=${port}`],{env,windowsHide:true,stdio:'ignore'});
    let browser;const deadline=Date.now()+90000;
    while(Date.now()<deadline){try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`,{timeout:1000});break;}catch{await new Promise(resolve=>setTimeout(resolve,700));}}
    if(!browser)throw Error('Portable app did not expose its test window');
    app={async firstWindow(){for(let n=0;n<30;n++){const page=browser.contexts()[0]?.pages()[0];if(page)return page;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('No portable window');},async close(){const page=browser.contexts()[0]?.pages()[0];if(page)await page.evaluate(()=>window.close()).catch(()=>{});await new Promise(resolve=>setTimeout(resolve,1200));await browser.close().catch(()=>{});}};
  }else app=await electron.launch({executablePath:packaged?path.join(root,'release','win-unpacked','BIMUP Zalo Assistance.exe'):require('electron'),args:packaged?[]:[root],env,timeout:60000});
  try{
    const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.waitForFunction(()=>document.querySelector('#side-status')?.textContent==='Đã dừng',null,{timeout:20000}).catch(async error=>{console.log(await page.evaluate(async()=>{try{return {url:location.href,state:await window.jev.request('snapshot')};}catch(e){return {url:location.href,error:e.message,bridge:typeof window.jev};}}));await page.screenshot({path:path.join(artifacts,'launch-failure.png')});throw error;});
    assert.equal(await page.title(),'BIMUP Zalo Assistance');
    await page.waitForFunction(()=>document.querySelector('#mcp-status')?.textContent==='MCP quản trị app: sẵn sàng · chỉ trên máy này',null,{timeout:15000}).catch(async error=>{console.log('MCP startup status',JSON.stringify((await page.evaluate(()=>window.jev.request('snapshot'))).mcp));throw error;});
    const {Client}=await import('@modelcontextprotocol/sdk/client/index.js');const {StdioClientTransport}=await import('@modelcontextprotocol/sdk/client/stdio.js');
    const mcpClient=new Client({name:'bimup-smoke',version:'1.0.0'});
    const transport=new StdioClientTransport({command:packaged?path.join(root,'release','win-unpacked','resources','runtime','node.exe'):process.execPath,args:[packaged?path.join(root,'release','win-unpacked','resources','engine','src','app-mcp.mjs'):path.join(root,'src','app-mcp.mjs')],env:{...process.env,BIMUP_APP_DATA:data}});
    try{
      await mcpClient.connect(transport);const catalog=await mcpClient.listTools();assert.equal(catalog.tools.length,13);
      const call=async(name,args={})=>{const r=await mcpClient.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r.content));return JSON.parse(r.content[0].text);};
      assert.equal((await call('app_status')).running,false);
      const created=await call('save_assistant',{name:'MCP kiểm thử',role:'Hỗ trợ',skill:'Chỉ dùng tài liệu',connectionIds:['legacy-ai']});
      assert.ok((await page.evaluate(()=>window.jev.request('snapshot'))).management.assistants.some(a=>a.id===created.id),'MCP-created profile is immediately visible to app');
      await call('write_knowledge',{id:created.id,filename:'example.md',content:'Dữ liệu giả · tiếng Việt'});assert.equal((await call('read_knowledge',{id:created.id,filename:'example.md'})).content,'Dữ liệu giả · tiếng Việt');
      const descriptor=JSON.parse(fs.readFileSync(path.join(data,'.private','mcp-bridge.json'),'utf8'));
      assert.equal((await fetch('http://127.0.0.1:'+descriptor.port+'/call',{method:'POST',headers:{Authorization:'Bearer invalid'},body:'{}'})).status,403);
      assert.equal((await fetch('http://127.0.0.1:'+descriptor.port+'/call',{method:'POST',headers:{Authorization:'Bearer '+descriptor.token,Origin:'https://untrusted.invalid'},body:'{}'})).status,403);
      await call('delete_assistant',{id:created.id});
    }finally{await mcpClient.close();}

    await page.screenshot({path:path.join(artifacts,packaged?'packaged-dashboard.png':'dashboard.png'),fullPage:true});
    assert.equal(await page.locator('#start').isDisabled(),true);
    await page.locator('[data-page="setup"]').click();
    assert.equal(await page.locator('#setup #login').count(),0,'Platform setup belongs to assistant');
    assert.equal(await page.locator('#manager #connection-provider').count(),0,'Model configuration stays in Settings AI');
    await page.fill('#connection-model','deepseek-flash');await page.locator('#connection-save').click();
    await page.waitForFunction(()=>document.querySelector('#connection-save').disabled===false);
    await page.fill('#connection-key','synthetic-ui-test-key');await page.locator('#connection-save-key').click();
    await page.waitForFunction(()=>document.querySelector('#connection-key-status').textContent.includes('Đã lưu'));
    const encrypted=fs.readFileSync(path.join(data,'deepseek-key.bin'));assert.ok(!encrypted.includes(Buffer.from('synthetic-ui-test-key')));
    await page.selectOption('#connection-provider','gemini-api');await page.fill('#connection-model','gemini-3.8-flash');await page.locator('#connection-save').click();
    await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.config.ai.provider==='gemini-api';});
    await page.fill('#connection-key','synthetic-gemini-ui-test-key');await page.locator('#connection-save-key').click();
    await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.geminiKeySaved;});
    assert.deepEqual(fs.readFileSync(path.join(data,'deepseek-key.bin')),encrypted);
    assert.ok(!fs.readFileSync(path.join(data,'gemini-key.bin')).includes(Buffer.from('synthetic-gemini-ui-test-key')));
    await page.selectOption('#connection-provider','antigravity-cli');await page.fill('#connection-model','');await page.locator('#connection-save').click();
    await page.waitForFunction(()=>!document.querySelector('#connection-cli-status').hidden);
    await page.locator('#connection-cli-status').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Antigravity'));
    await page.locator('#connection-new').click();await page.fill('#connection-name','API chung · test');await page.selectOption('#connection-provider','deepseek');await page.fill('#connection-model','test-model');await page.locator('#connection-save').click();
    await page.waitForFunction(()=>document.querySelector('#connection-id').value.length===36);
    const connectionId=await page.locator('#connection-id').inputValue();
    await page.fill('#connection-key','SYNTHETIC_NAMED_KEY');await page.locator('#connection-save-key').click();
    await page.waitForFunction(()=>document.querySelector('#connection-key-status').textContent.includes('Đã lưu'));
    assert.ok(!fs.readFileSync(path.join(data,'ai-connections.bin')).includes(Buffer.from('SYNTHETIC_NAMED_KEY')));
    await page.screenshot({path:path.join(artifacts,'setup.png'),fullPage:true});
    await page.locator('#open-manager').click();await page.locator('#manager').waitFor({state:'visible'});await page.locator('#manager-new').click();
    await page.fill('#assistant-name','Hana · test');await page.fill('#assistant-age','25');await page.fill('#assistant-personality','Điềm tĩnh');await page.fill('#assistant-role','Hỗ trợ kỹ thuật');await page.fill('#assistant-skill','Trả lời tiếng Nhật theo tài liệu');await page.selectOption('#assistant-strategy','fallback');

    await page.getByRole('checkbox',{name:'API chung · test',exact:true}).check();await page.getByRole('checkbox',{name:'AI hiện có',exact:true}).check();await page.locator('#assistant-save').click();
    await page.waitForFunction(()=>document.querySelector('#assistant-id').value.length===36);
    const assistantId=await page.locator('#assistant-id').inputValue();
    await page.locator('#assistant-profile-tab').click();
    await page.locator('#assistant-activate').click();await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.management.activeId===document.querySelector('#assistant-id').value;});
    const managed=await page.evaluate(()=>window.jev.request('snapshot')),profile=managed.management.assistants.find(a=>a.id===assistantId);
    assert.equal(managed.config.mode,'dry-run');assert.deepEqual(profile.connectionIds,[connectionId,'legacy-ai']);assert.equal(profile.age,'25');assert.equal(profile.personality,'Điềm tĩnh');assert.equal(managed.session,false);assert.ok(!JSON.stringify(managed).includes('SYNTHETIC_NAMED_KEY'));
    await page.locator('#assistant-platform-tab').click();assert.equal(await page.locator('#login').isVisible(),true);assert.equal(await page.locator('#assistant-teams-tenant').count(),0);await page.screenshot({path:path.join(artifacts,'zalo-connections.png'),fullPage:true});await page.locator('#assistant-profile-tab').click();
    await page.locator('#assistant-name').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(artifacts,'assistant-manager.png'),fullPage:true});
    await page.locator('#manager-list button').filter({hasText:'BIMUP'}).click();await page.locator('#assistant-activate').click();await page.waitForFunction(async()=>{const s=await window.jev.request('snapshot');return s.management.activeId==='default';});
    await page.locator('#manager-close').click();
    // Seed a synthetic customer request without any Zalo or AI calls.
    const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(path.join(data,'.private','jev.sqlite'));
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
    assert.deepEqual(errors,[]);console.log('PASS: desktop boots, encrypted API keys, shared AI assignments, assistant manager, isolated activation, API/CLI selection, validation, edited draft approval, navigation.');
  }finally{await app.close();await new Promise(resolve=>setTimeout(resolve,500));
    assert.equal(fs.existsSync(path.join(data,'.private','mcp-bridge.json')),false,'Closing app removes MCP descriptor');
    assert.equal(fs.existsSync(path.join(data,'.private','worker.lock')),false,'Closing app releases worker lock');
    fs.rmSync(data,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
