param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [string]$DebuggerPath = "C:\rev\tools\x64dbg\release\x32\x32dbg.exe",
  [string]$WorkingDirectory = "C:\rev\work\imjinrok2-ascii",
  [string]$TargetPath = "C:\rev\work\imjinrok2-ascii\imjinrok2.exe"
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$processNames = @("x32dbg", "imjinrok2", "headless")

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$markerPath = Join-Path $logDir "$Marker.json"

$existing = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $processNames -contains $_.ProcessName } |
  Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding

if ($existing) {
  $blocked = [ordered]@{
    marker = $Marker
    status = "blocked-existing-process"
    existing = $existing
  }
  $blocked | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
  $blocked | ConvertTo-Json -Depth 6
  exit 2
}

$startedAt = Get-Date
$debugger = Start-Process -FilePath $DebuggerPath -ArgumentList "`"$TargetPath`"" -WorkingDirectory $WorkingDirectory -PassThru
Start-Sleep -Seconds 5

$tracked = @()
foreach ($name in @("x32dbg", "imjinrok2")) {
  $matches = Get-Process -Name $name -ErrorAction SilentlyContinue |
    Where-Object { $_.StartTime -ge $startedAt.AddSeconds(-2) } |
    Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding
  foreach ($match in @($matches)) {
    if ($match.Id) {
      $tracked += $match
    }
  }
}

$record = [ordered]@{
  marker = $Marker
  status = "launched"
  launchMode = "x32dbg-target"
  launchedAt = $startedAt.ToString("o")
  debuggerPath = $DebuggerPath
  workingDirectory = $WorkingDirectory
  targetPath = $TargetPath
  debuggerPid = $debugger.Id
  processes = $tracked
}

$record | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
$record | ConvertTo-Json -Depth 6
