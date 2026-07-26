param(
  [Parameter(Mandatory = $true)]
  [string]$AttachToMarker,
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [string]$DebuggerPath = "C:\rev\tools\x64dbg\release\x32\x32dbg.exe"
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$attachRecordPath = Join-Path $logDir "$AttachToMarker.json"
$markerPath = Join-Path $logDir "$Marker.json"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (!(Test-Path $attachRecordPath)) {
  $blocked = [ordered]@{
    marker = $Marker
    status = "blocked-missing-attach-marker"
    attachToMarker = $AttachToMarker
  }
  $blocked | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
  $blocked | ConvertTo-Json -Depth 6
  exit 3
}

$attachRecord = Get-Content $attachRecordPath -Raw | ConvertFrom-Json
$targetProcesses = @()

if ($attachRecord.game) {
  foreach ($entry in @($attachRecord.game)) {
    if ($entry.Id -and $entry.ProcessName -eq "imjinrok2") {
      $targetProcesses += $entry
    }
  }
}

if ($targetProcesses.Count -lt 1) {
  $blocked = [ordered]@{
    marker = $Marker
    status = "blocked-no-imjinrok-target"
    attachToMarker = $AttachToMarker
  }
  $blocked | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
  $blocked | ConvertTo-Json -Depth 6
  exit 4
}

$targetPid = [int]$targetProcesses[0].Id
$target = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (!$target -or $target.ProcessName -ne "imjinrok2") {
  $blocked = [ordered]@{
    marker = $Marker
    status = "blocked-target-not-running"
    attachToMarker = $AttachToMarker
    targetPid = $targetPid
  }
  $blocked | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
  $blocked | ConvertTo-Json -Depth 6
  exit 5
}

$existingDebuggers = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match "x32dbg|headless" } |
  Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding

if ($existingDebuggers) {
  $blocked = [ordered]@{
    marker = $Marker
    status = "blocked-existing-debugger"
    existing = $existingDebuggers
  }
  $blocked | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
  $blocked | ConvertTo-Json -Depth 6
  exit 6
}

$startedAt = Get-Date
$debugger = Start-Process -FilePath $DebuggerPath -ArgumentList "-p $targetPid" -PassThru
Start-Sleep -Seconds 5

$tracked = @()
foreach ($name in @("x32dbg", "imjinrok2")) {
  $matches = Get-Process -Name $name -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -eq $debugger.Id -or $_.Id -eq $targetPid -or $_.StartTime -ge $startedAt.AddSeconds(-2) } |
    Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding
  foreach ($match in @($matches)) {
    if ($match.Id) {
      $tracked += $match
    }
  }
}

$record = [ordered]@{
  marker = $Marker
  status = "attached"
  launchMode = "x32dbg-attach"
  attachedAt = $startedAt.ToString("o")
  attachToMarker = $AttachToMarker
  debuggerPath = $DebuggerPath
  debuggerPid = $debugger.Id
  targetPid = $targetPid
  processes = $tracked
}

$record | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath
$record | ConvertTo-Json -Depth 6
