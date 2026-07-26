param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [string]$HeadlessWorkingDirectory = "C:\rev\work",
  [string]$HeadlessArguments = "-cf codex-imjinrok-campaign-init-smoke.xdbg",
  [int]$TimeoutMilliseconds = 20000
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$headless = "C:\rev\tools\x64dbg\release\x32\headless.exe"
$processNames = @("headless", "imjinrok2", "x32dbg")

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$markerPath = Join-Path $logDir "$Marker.json"
$cleanupPath = Join-Path $logDir "$Marker-cleanup.json"
$stdoutPath = Join-Path $logDir "$Marker-headless.stdout.txt"
$stderrPath = Join-Path $logDir "$Marker-headless.stderr.txt"

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
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $headless
$psi.WorkingDirectory = $HeadlessWorkingDirectory
$psi.Arguments = $HeadlessArguments
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true

$process = [System.Diagnostics.Process]::Start($psi)

$launchRecord = [ordered]@{
  marker = $Marker
  status = "started"
  launchedAt = $startedAt.ToString("o")
  processName = "headless"
  pid = $process.Id
  executable = $headless
  workingDirectory = $HeadlessWorkingDirectory
  arguments = $HeadlessArguments
  timeoutMilliseconds = $TimeoutMilliseconds
  stdoutPath = $stdoutPath
  stderrPath = $stderrPath
}
$launchRecord | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $markerPath

$finished = $process.WaitForExit($TimeoutMilliseconds)
$status = "exited"
if (!$finished) {
  $status = "timeout-killed"
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  try { Wait-Process -Id $process.Id -Timeout 5 -ErrorAction SilentlyContinue } catch {}
}

$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$stdout | Set-Content -Encoding UTF8 $stdoutPath
$stderr | Set-Content -Encoding UTF8 $stderrPath

$stopped = @()
$remainingAfterRun = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $processNames -contains $_.ProcessName } |
  Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding

foreach ($remaining in @($remainingAfterRun)) {
  if (!$remaining.Id) {
    continue
  }
  if ($remaining.StartTime -and $remaining.StartTime -lt $startedAt.AddSeconds(-2)) {
    continue
  }

  Stop-Process -Id $remaining.Id -Force -ErrorAction SilentlyContinue
  try { Wait-Process -Id $remaining.Id -Timeout 5 -ErrorAction SilentlyContinue } catch {}
  $stopped += [ordered]@{
    id = $remaining.Id
    processName = $remaining.ProcessName
  }
}

Start-Sleep -Milliseconds 500
$remainingFinal = Get-Process -ErrorAction SilentlyContinue |
  Where-Object { $processNames -contains $_.ProcessName } |
  Select-Object Id, ProcessName, StartTime, MainWindowTitle, Responding

$result = [ordered]@{
  marker = $Marker
  status = $status
  exitCode = if ($finished) { $process.ExitCode } else { $null }
  cleanedAt = (Get-Date).ToString("o")
  stopped = $stopped
  remainingMatchingProcess = $remainingFinal
  stdoutPath = $stdoutPath
  stderrPath = $stderrPath
  stdoutContainsInitLoaded = $stdout.Contains("IMJINROK_TRACE_INIT_LOADED")
  stdoutContainsInitStopped = $stdout.Contains("IMJINROK_TRACE_INIT_STOPPED")
}

$result | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $cleanupPath
$result | ConvertTo-Json -Depth 6
