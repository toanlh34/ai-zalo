import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync} from 'node:fs';
import {rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspect} from 'node:util';
import {createAgent, resolveCliCommand} from '../src/agent.mjs';

const privateMarker='PRIVATE_CLI_CONTEXT_123';
const decision={action:'send',category:'greeting',reply:'Xin chào anh, em có thể hỗ trợ gì ạ?',reason:'Chào hỏi',report:'Khách chào hỏi.'};
const input={message:{id:'synthetic-test',sender:'test',text:'Chào anh'},context:[]};

function fixture(t) {
  const root=mkdtempSync(join(tmpdir(),'jev-agent-test-'));
  mkdirSync(join(root,'agent','skills','customer-support'),{recursive:true});
  mkdirSync(join(root,'knowledge'));
  writeFileSync(join(root,'agent','IDENTITY.md'),privateMarker);
  writeFileSync(join(root,'agent','skills','customer-support','SKILL.md'),'Synthetic test instructions');
  t.after(()=>rm(root,{recursive:true,force:true,maxRetries:20,retryDelay:50}));
  return root;
}

function fakeAgent(t,source,overrides={}) {
  const root=fixture(t);
  const executable=join(root,'fake-cli.mjs');
  // Consume stdin, as a real CLI does, to exercise the complete child-process path.
  writeFileSync(executable,"let request=''; for await (const chunk of process.stdin) request+=chunk;\n"+source);
  return createAgent({provider:'claude-cli',executable,timeoutMs:5000,...overrides},root);
}

function rejectsWithCode(promise,code) {
  return assert.rejects(promise,error=>{
    assert.equal(error.code,code);
    assert.ok(!inspect(error).includes(privateMarker),'Provider errors must not expose stdout, stderr, or context');
    return true;
  });
}

test('nhận structured_output qua tiến trình CLI và giữ nguyên UTF-8 khi chia chunk',async t=>{
  const source=`
const input=JSON.parse(request);
if(input.message.text!=='Chào anh'||!input.notice) process.exit(9);
const body=Buffer.from(JSON.stringify({is_error:false,structured_output:${JSON.stringify(decision)}}));
const split=body.indexOf(Buffer.from('à'))+1;
process.stdout.write(body.subarray(0,split));
await new Promise(resolve=>setTimeout(resolve,30));
process.stdout.write(body.subarray(split));`;
  assert.deepEqual(await fakeAgent(t,source).decide(input),decision);
});

const failures=[
  ['hạn mức HTTP 429 kể cả mã thoát khác 0','CLAUDE_RATE_LIMITED',`process.stdout.write(JSON.stringify({is_error:true,api_error_status:429,result:${JSON.stringify(privateMarker)}})); process.exitCode=1;`],
  ['hạn mức thuê bao không có mã HTTP','CLAUDE_RATE_LIMITED',`process.stdout.write(JSON.stringify({is_error:true,api_error:'usage_limit_reached',result:${JSON.stringify(privateMarker)}}));`],
  ['mã thoát khác 0','CLAUDE_EXIT_FAILED',`process.stdout.write(${JSON.stringify(privateMarker)}); process.stderr.write(${JSON.stringify(privateMarker)}); process.exitCode=7;`],
  ['JSON không hợp lệ','CLAUDE_INVALID_JSON',`process.stdout.write(${JSON.stringify(privateMarker)});`],
  ['CLI báo is_error','CLAUDE_ERROR_RESULT',`process.stdout.write(JSON.stringify({is_error:true,result:${JSON.stringify(privateMarker)}}));`],
  ['thiếu structured_output','CLAUDE_MISSING_OUTPUT',`process.stdout.write(JSON.stringify({is_error:false,result:${JSON.stringify(privateMarker)}}));`],
  ['quyết định không hợp lệ','CLAUDE_INVALID_DECISION',`process.stdout.write(JSON.stringify({structured_output:${JSON.stringify({...decision,reply:'',report:privateMarker})}}));`],
  ['vượt giới hạn đầu ra','CLAUDE_OUTPUT_LIMIT',`process.stderr.write(${JSON.stringify(privateMarker)}); process.stdout.write('x'.repeat(2000001));`],
];
for(const [name,code,source] of failures) {
  test(`phân loại lỗi ${name} mà không lộ dữ liệu`,async t=>{
    await rejectsWithCode(fakeAgent(t,source).decide(input),code);
  });
}

test('hết thời gian thì dừng CLI và trả lỗi riêng',async t=>{
  const started=Date.now();
  const agent=fakeAgent(t,`process.stderr.write(${JSON.stringify(privateMarker)}); await new Promise(resolve=>setTimeout(resolve,60000));`,{timeoutMs:200});
  t.after(()=>assert.ok(Date.now()-started<5000,'Timed-out CLI must terminate promptly so its working directory can be removed'));
  await rejectsWithCode(agent.decide(input),'CLAUDE_TIMEOUT');
});

test('không khởi động được CLI thì trả lỗi riêng',async t=>{
  const root=fixture(t);
  const agent=createAgent({provider:'claude-cli',executable:join(root,'missing-cli.exe'),timeoutMs:5000},root);
  await rejectsWithCode(agent.decide(input),'CLAUDE_START_FAILED');
});

test('hủy yêu cầu khi dừng agent không chờ CLI hết thời gian và không lộ ngữ cảnh',async t=>{
  const agent=fakeAgent(t,`await new Promise(resolve=>setTimeout(resolve,60000));`,{timeoutMs:10000});
  const pre=new AbortController();pre.abort();
  await rejectsWithCode(agent.decide(input,{signal:pre.signal}),'CLAUDE_CANCELLED');
  const controller=new AbortController();
  const pending=agent.decide(input,{signal:controller.signal});
  const timer=setTimeout(()=>controller.abort(),150);
  try{await rejectsWithCode(pending,'CLAUDE_CANCELLED');}finally{clearTimeout(timer);}
});

test('script CLI dùng Node trực tiếp, kể cả đường dẫn có dấu cách',t=>{
  const root=fixture(t);
  const script=join(root,'script có dấu cách.mjs');
  writeFileSync(script,'');
  assert.deepEqual(resolveCliCommand(script),{command:process.execPath,args:[script]});
});

test('Windows tìm executable thật trên PATH',t=>{
  const root=fixture(t);
  const executable=join(root,'claude.exe');
  writeFileSync(executable,'');
  assert.deepEqual(resolveCliCommand('claude',{platform:'win32',env:{PATH:root},cwd:root}),{command:executable,args:[]});
});

test('Windows mở bin đã khai báo của gói npm thay cho shim cmd/ps1',t=>{
  const root=fixture(t);
  for(const [label,bin] of [['native','bin/claude.exe'],['script','cli.js']]) {
    const npmDirectory=join(root,label);
    const packageDirectory=join(npmDirectory,'node_modules','@anthropic-ai','claude-code');
    mkdirSync(join(packageDirectory,'bin'),{recursive:true});
    writeFileSync(join(packageDirectory,'package.json'),JSON.stringify({name:'@anthropic-ai/claude-code',bin:{claude:bin}}));
    const target=join(packageDirectory,bin);
    writeFileSync(target,'');
    const expected=bin.endsWith('.js')?{command:process.execPath,args:[target]}:{command:target,args:[]};
    for(const extension of ['cmd','ps1']) {
      const shim=join(npmDirectory,`claude.${extension}`);
      writeFileSync(shim,'');
      assert.deepEqual(resolveCliCommand(shim,{platform:'win32',env:{PATH:npmDirectory},cwd:root}),expected);
    }
    assert.deepEqual(resolveCliCommand('claude',{platform:'win32',env:{PATH:npmDirectory},cwd:root}),expected);
  }
});

test('không chạy shim shell không thuộc gói Claude Code đã biết',t=>{
  const root=fixture(t);
  const shim=join(root,'unknown.cmd');
  writeFileSync(shim,'echo unsafe');
  assert.throws(()=>resolveCliCommand(shim,{platform:'win32',env:{PATH:root},cwd:root}));
});
