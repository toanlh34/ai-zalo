$ErrorActionPreference='Stop'
$repoRoot=Split-Path $PSScriptRoot -Parent
$version=(Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
if($version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid app version'}
$installRoot=Join-Path $env:LOCALAPPDATA 'Programs\BIMUP\ZaloAssistance'
$target=Join-Path $installRoot $version
$source=Join-Path $repoRoot 'release\win-unpacked'
if(!(Test-Path -LiteralPath (Join-Path $source 'BIMUP Zalo Assistance.exe'))){throw 'Build the app before installing'}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'mcp-launcher.cjs') -Destination (Join-Path $installRoot 'mcp-launcher.cjs') -Force
$appExe=Join-Path $target 'BIMUP Zalo Assistance.exe'
$menu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\BIMUP'
New-Item -ItemType Directory -Path $menu -Force | Out-Null
$ws=New-Object -ComObject WScript.Shell
foreach($linkPath in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'BIMUP Zalo Assistance.lnk'),(Join-Path $menu 'BIMUP Zalo Assistance.lnk'))){
  $link=$ws.CreateShortcut($linkPath);$link.TargetPath=$appExe;$link.WorkingDirectory=$target;$link.Description="BIMUP Zalo Assistance $version";$link.IconLocation="$appExe,0";$link.Save()
}
@{version=$version;executable=$appExe;installedAt=(Get-Date).ToString('o');dataDirectory=(Join-Path $env:APPDATA 'jev-bimup-desktop')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $installRoot 'installation.json') -Encoding UTF8
if((Get-FileHash -LiteralPath (Join-Path $source 'resources\app.asar')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target 'resources\app.asar')).Hash){throw 'Installed app verification failed'}
Write-Output "Installed BIMUP Zalo Assistance $version : $appExe"
