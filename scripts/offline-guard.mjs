import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import dgram from 'node:dgram';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {resolve} from 'node:path';

const blocked=()=>{throw Object.assign(Error('Offline tests cannot connect to external services'),{code:'OFFLINE_TEST_BLOCKED'});};
globalThis[Symbol.for('jev.offlineTest')]=true;
for(const module of [http,https])for(const name of ['request','get'])module[name]=blocked;
http2.connect=blocked;
net.connect=net.createConnection=net.Socket.prototype.connect=blocked;
tls.connect=blocked;
dgram.createSocket=blocked;
for(const module of [dns,dns.promises]) {
  const prototype=module.Resolver?.prototype;
  if(prototype)for(const name of Object.getOwnPropertyNames(prototype))if(/^(lookup|resolve|reverse)/.test(name))prototype[name]=blocked;
}
for(const name of Object.keys(dns))if(/^(lookup|resolve|reverse)/.test(name)&&typeof dns[name]==='function')dns[name]=blocked;
for(const name of Object.keys(dns.promises))if(typeof dns.promises[name]==='function')dns.promises[name]=blocked;
globalThis.fetch=async()=>blocked();
globalThis.WebSocket=class {constructor(){blocked();}};

// Fake CLI fixtures use Node. The only other permitted process is Windows cleanup.
for(const name of ['spawn','spawnSync','execFile','execFileSync']) {
  const original=childProcess[name];
  childProcess[name]=function(command,args,...rest) {
    const node=typeof command==='string'&&resolve(command).toLowerCase()===resolve(process.execPath).toLowerCase();
    const cleanup=process.platform==='win32'&&command==='taskkill.exe'&&Array.isArray(args)
      &&args.length===4&&args[0]==='/PID'&&/^\d+$/.test(args[1])&&args[2]==='/T'&&args[3]==='/F';
    if(!node&&!cleanup)blocked();
    return original.call(this,command,args,...rest);
  };
}
childProcess.exec=childProcess.execSync=blocked;
const fork=childProcess.fork;
childProcess.fork=function(modulePath,args,options) {
  const settings=Array.isArray(args)?options:args;
  if(settings?.execPath&&resolve(settings.execPath).toLowerCase()!==resolve(process.execPath).toLowerCase())blocked();
  return fork.call(this,modulePath,args,options);
};
syncBuiltinESMExports();

// Carry the same restrictions into spawned Node fixtures as well as test workers.
const option=`--import=${import.meta.url}`;
if(!(process.env.NODE_OPTIONS??'').includes(option))process.env.NODE_OPTIONS=`${process.env.NODE_OPTIONS??''} ${option}`.trim();
