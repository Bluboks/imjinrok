param(
  [Parameter(Mandatory = $true)]
  [string]$Marker
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$cleanupPath = Join-Path $logDir "$Marker-cleanup.json"

if (!(Test-Path $markerPath)) {
  $missing = [ordered]@{
    marker = $Marker
    status = "missing-marker-log"
    recordPath = $markerPath
  }
  $missing | ConvertTo-Json -Depth 6
  exit 3
}

$record = Get-Content $markerPath -Raw | ConvertFrom-Json
$entries = @()

if ($record.processes) {
  foreach ($entry in @($record.processes)) {
    if ($entry.Id -and $entry.ProcessName) {
      $entries += [pscustomobject]@{
        Id = [int]$entry.Id
        ProcessName = [string]$entry.ProcessName
      }
    }
  }
}

if ($record.game) {
  foreach ($entry in @($record.game)) {
    if ($entry.Id -and $entry.ProcessName) {
      $entries += [pscustomobject]@{
        Id = [int]$entry.Id
        ProcessName = [string]$entry.ProcessName
      }
    }
  }
}

$deduped = @()
$seen = @{}
foreach ($entry in @($entries)) {
  $key = "$($entry.ProcessName):$($entry.Id)"
  if (!$seen.ContainsKey($key)) {
    $seen[$key] = $true
    $deduped += $entry
  }
}

$stopped = @()
$skipped = @()

foreach ($entry in @($deduped)) {
  $proc = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
  if (!$proc) {
    $skipped += [ordered]@{ id = $entry.Id; processName = $entry.ProcessName; reason = "not-running" }
    continue
  }
  if ($proc.ProcessName -ne $entry.ProcessName) {
    $skipped += [ordered]@{
      id = $entry.Id
      processName = $entry.ProcessName
      reason = "process-name-mismatch"
      actual = $proc.ProcessName
    }
    continue
  }

  Stop-Process -Id $entry.Id -Force -ErrorAction SilentlyContinue
  try { Wait-Process -Id $entry.Id -Timeout 5 -ErrorAction SilentlyContinue } catch {}
  $stopped += [ordered]@{ id = $entry.Id; processName = $entry.ProcessName }
}

Start-Sleep -Milliseconds 500
$remaining = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ProcessName -match "headless|imjinrok|x32dbg" } |
  Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding

$result = [ordered]@{
  marker = $Marker
  status = "cleanup-complete"
  cleanedAt = (Get-Date).ToString("o")
  stopped = $stopped
  skipped = $skipped
  remainingMatchingProcess = $remaining
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $cleanupPath
$result | ConvertTo-Json -Depth 6
