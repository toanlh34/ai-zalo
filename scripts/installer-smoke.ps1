param(
  [Parameter(Mandatory=$true)][string]$InstallerPath,
  [Parameter(Mandatory=$true)][string]$InstallDirectory,
  [string]$ExpectedExecutableName='BIMUP Zalo Installer Smoke.exe',
  [int]$TimeoutSeconds=180
)
$ErrorActionPreference='Stop'
$repoRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$testRoot=[IO.Path]::GetFullPath((Join-Path $repoRoot '.installer-test'))
$testPrefix=$testRoot+[IO.Path]::DirectorySeparatorChar
$installer=[IO.Path]::GetFullPath($InstallerPath)
$install=[IO.Path]::GetFullPath($InstallDirectory)
$manifest=Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$expectedVersion=[string]$manifest.version
$nodeExe=(Get-Command node -ErrorAction Stop).Source
if($TimeoutSeconds -lt 15 -or $TimeoutSeconds -gt 600){throw 'TimeoutSeconds must be between 15 and 600'}
if(!$install.StartsWith($testPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'InstallDirectory must be inside this workspace .installer-test directory'}
if($installer.StartsWith($install+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Installer cannot be inside the directory that will be uninstalled'}
if([IO.Path]::GetFileName($installer) -notmatch 'Installer-Smoke.*\.exe$'){throw 'Refusing production installer: artifact name must contain Installer-Smoke'}
if($ExpectedExecutableName -ne [IO.Path]::GetFileName($ExpectedExecutableName) -or $ExpectedExecutableName -notmatch '^BIMUP Zalo Installer Smoke\.exe$'){throw 'ExpectedExecutableName must identify the isolated smoke executable'}
if(!(Test-Path -LiteralPath $installer -PathType Leaf)){throw 'Smoke installer does not exist'}
$installerInfo=(Get-Item -LiteralPath $installer).VersionInfo
if($installerInfo.ProductName -ne 'BIMUP Zalo Installer Smoke'){throw 'Smoke installer must have a separate BIMUP Zalo Installer Smoke product identity'}
if($installerInfo.ProductVersion -notlike ($expectedVersion+'*')){throw 'Smoke installer version differs from package.json'}
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
for($ancestor=$install;$ancestor -and $ancestor.Length -ge $testRoot.Length;$ancestor=Split-Path $ancestor -Parent){
  if((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Smoke install path cannot contain directory links'}
  if($ancestor -eq $testRoot){break}
}
if((Test-Path -LiteralPath $install) -and @(Get-ChildItem -LiteralPath $install -Force).Count){throw 'InstallDirectory must be absent or empty'}
$productionData=Join-Path $env:APPDATA 'jev-bimup-desktop'
if(Test-Path -LiteralPath (Join-Path $productionData '.private\worker.lock')){throw 'Close the production app before checking that its data stays unchanged'}
$productionAsar=Join-Path $repoRoot 'release\win-unpacked\resources\app.asar'
if(!(Test-Path -LiteralPath $productionAsar -PathType Leaf)){throw 'Build the production package before its smoke installer'}

function Get-TextHash([string]$Value){
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value))).Replace('-','')}
  finally{$sha.Dispose()}
}
function Get-DirectoryContentHash([string]$Directory){
  if(!(Test-Path -LiteralPath $Directory)){return 'ABSENT'}
  $entries=@(Get-ChildItem -LiteralPath $Directory -Recurse -Force -File | Sort-Object FullName | ForEach-Object {
    $_.FullName.Substring($Directory.Length)+':'+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
  })
  return Get-TextHash ($entries -join "`n")
}
$productionGuid=& $nodeExe -e 'const {UUID}=require("builder-util-runtime");process.stdout.write(UUID.v5("vn.bimup.jev",UUID.parse("50e065bc-3134-11e6-9bab-38c9862bdaf3")))'
if($LASTEXITCODE -ne 0 -or $productionGuid -notmatch '^[a-f0-9-]{36}$'){throw 'Cannot determine production NSIS registry identity'}
function Get-ProductionRegistryHash {
  $entries=New-Object 'System.Collections.Generic.List[string]'
  function Add-KeySnapshot($Key,[string]$Label){
    $entries.Add($Label)
    foreach($name in @($Key.GetValueNames() | Sort-Object)){
      $value=$Key.GetValue($name,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $serialized=ConvertTo-Json -InputObject $value -Compress -Depth 8
      $entries.Add($Label+'|'+$name+'|'+$Key.GetValueKind($name)+'|'+$serialized)
    }
    foreach($childName in @($Key.GetSubKeyNames() | Sort-Object)){
      $child=$Key.OpenSubKey($childName)
      try{Add-KeySnapshot $child ($Label+'\'+$childName)}finally{$child.Dispose()}
    }
  }
  foreach($view in @([Microsoft.Win32.RegistryView]::Registry32,[Microsoft.Win32.RegistryView]::Registry64)){
    $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,$view)
    try{
      foreach($relative in @(('Software\'+$productionGuid),('Software\Microsoft\Windows\CurrentVersion\Uninstall\'+$productionGuid))){
        $key=$base.OpenSubKey($relative)
        if($null -eq $key){$entries.Add([string]$view+'|'+$relative+'|ABSENT');continue}
        try{Add-KeySnapshot $key ([string]$view+'|'+$relative)}finally{$key.Dispose()}
      }
    }finally{$base.Dispose()}
  }
  return Get-TextHash ($entries -join "`n")
}
function Invoke-HiddenProcess([string]$File,[string]$Arguments,[string]$OutputPath='', [string]$ErrorPath=''){
  $settings=@{FilePath=$File;ArgumentList=$Arguments;PassThru=$true;WindowStyle='Hidden';WorkingDirectory=$repoRoot}
  if($OutputPath){$settings.RedirectStandardOutput=$OutputPath;$settings.RedirectStandardError=$ErrorPath}
  $process=Start-Process @settings
  $timer=[Diagnostics.Stopwatch]::StartNew()
  try{
    while(!$process.WaitForExit(1000)){
      if($timer.Elapsed.TotalSeconds -gt $TimeoutSeconds){$process.Kill();throw ('Process timed out: '+[IO.Path]::GetFileName($File))}
    }
    $process.WaitForExit()
    $process.Refresh()
    if($OutputPath -and (Test-Path -LiteralPath $OutputPath)){Get-Content -LiteralPath $OutputPath | Write-Host}
    if($process.ExitCode -ne 0){
      if($ErrorPath -and (Test-Path -LiteralPath $ErrorPath)){Get-Content -LiteralPath $ErrorPath | Write-Host}
      throw ([IO.Path]::GetFileName($File)+' failed with exit code '+$process.ExitCode)
    }
  }finally{$process.Dispose()}
}

$beforeData=Get-DirectoryContentHash $productionData
$beforeRegistry=Get-ProductionRegistryHash
$data=Join-Path $testRoot ('data-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $data | Out-Null
$sentinel=Join-Path $data 'installer-preservation.sentinel'
$sentinelValue=[Guid]::NewGuid().ToString('N')
Set-Content -LiteralPath $sentinel -Value $sentinelValue -Encoding UTF8
$appExe=Join-Path $install $ExpectedExecutableName
$uninstaller=Join-Path $install 'Uninstall BIMUP Zalo Installer Smoke.exe'
$failures=New-Object 'System.Collections.Generic.List[string]'
$installerStarted=$false
try{
  $installerStarted=$true
  # NSIS requires /D to be last; its path is not enclosed in quotes.
  Invoke-HiddenProcess $installer ('/S /D='+$install)
  foreach($relative in @($ExpectedExecutableName,'resources\app.asar','resources\runtime\node.exe','resources\engine\src\app-mcp.mjs','resources\engine\node_modules\zca-js\package.json','resources\engine\node_modules\zod\package.json','resources\engine\node_modules\@modelcontextprotocol\sdk\package.json','HUONG-DAN-SU-DUNG.md','Uninstall BIMUP Zalo Installer Smoke.exe')){
    if(!(Test-Path -LiteralPath (Join-Path $install $relative) -PathType Leaf)){throw ('Missing installed artifact: '+$relative)}
  }
  if((Get-FileHash -LiteralPath (Join-Path $install 'resources\app.asar')).Hash -ne (Get-FileHash -LiteralPath $productionAsar).Hash){throw 'Installed app.asar differs from production app.asar'}
  foreach($guide in @('HUONG-DAN-SU-DUNG.md','HUONG-DAN-SU-DUNG.html')){
    $reference=Join-Path $repoRoot ('release\win-unpacked\'+$guide)
    if(Test-Path -LiteralPath $reference){
      $installedGuide=Join-Path $install $guide
      if(!(Test-Path -LiteralPath $installedGuide) -or (Get-FileHash -LiteralPath $installedGuide).Hash -ne (Get-FileHash -LiteralPath $reference).Hash){throw ('Installed guide differs: '+$guide)}
    }
  }
  $arguments='"'+(Join-Path $PSScriptRoot 'desktop-smoke.cjs')+'" --installed "'+$appExe+'" --data-root "'+$data+'"'
  Invoke-HiddenProcess $nodeExe $arguments (Join-Path $testRoot 'installed-ui-smoke.stdout.log') (Join-Path $testRoot 'installed-ui-smoke.stderr.log')
}catch{$failures.Add($_.Exception.Message)}
finally{
  if($installerStarted -and (Test-Path -LiteralPath $uninstaller -PathType Leaf)){
    try{
      $resolvedUninstaller=[IO.Path]::GetFullPath((Resolve-Path -LiteralPath $uninstaller).Path)
      if(!$resolvedUninstaller.StartsWith($install+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Uninstaller escaped the verified workspace install directory'}
      Invoke-HiddenProcess $resolvedUninstaller '/S'
      $timer=[Diagnostics.Stopwatch]::StartNew()
      while((Test-Path -LiteralPath $appExe) -and $timer.Elapsed.TotalSeconds -lt 30){Start-Sleep -Milliseconds 250}
      if(Test-Path -LiteralPath $appExe){throw 'Uninstaller did not remove the isolated app executable'}
    }catch{$failures.Add('Uninstall verification: '+$_.Exception.Message)}
  }elseif($installerStarted -and (Test-Path -LiteralPath $appExe)){$failures.Add('Isolated app remains without its expected smoke uninstaller')}
  if(!(Test-Path -LiteralPath $sentinel) -or (Get-Content -LiteralPath $sentinel -Raw).Trim() -ne $sentinelValue){$failures.Add('Uninstall changed the isolated app-data preservation sentinel')}
  try{if((Get-DirectoryContentHash $productionData) -ne $beforeData){$failures.Add('Production app data changed during isolated installer smoke')}}catch{$failures.Add('Production data verification: '+$_.Exception.Message)}
  try{if((Get-ProductionRegistryHash) -ne $beforeRegistry){$failures.Add('Production installer registry changed during isolated installer smoke')}}catch{$failures.Add('Production registry verification: '+$_.Exception.Message)}
}
if($failures.Count){throw ($failures -join "`n")}
Write-Output ('PASS: isolated installer, bundled app and guides, installed UI, uninstall, preserved app data; production data and registry unchanged. Version '+$expectedVersion)
