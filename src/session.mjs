import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function secureDirectory(dir) {
  if (process.platform !== 'win32') throw new Error('Bản thử này dùng Windows DPAPI.');
  mkdirSync(dir, { recursive: true });
  const identity = execFileSync('whoami.exe', [], { encoding: 'utf8', windowsHide: true }).trim();
  execFileSync('icacls.exe', [dir, '/inheritance:r', '/grant:r', `${identity}:(OI)(CI)F`], { stdio: 'pipe', windowsHide: true });
}
function powershell(script, input) {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; " + script],
    { input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}
export function saveSession(dir, credentials) {
  const encrypted = powershell("[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); $b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))", JSON.stringify(credentials));
  writeFileSync(join(dir, 'session.dpapi'), encrypted, { encoding: 'utf8' });
}
export function loadSession(dir) {
  const encrypted = readFileSync(join(dir, 'session.dpapi'), 'utf8');
  const json = powershell("[void][Reflection.Assembly]::LoadWithPartialName('System.Security'); $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))", encrypted);
  return JSON.parse(json);
}
