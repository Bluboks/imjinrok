param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [Parameter(Mandatory = $true)]
  [string]$CommandsPath,
  [int]$InitialDelayMilliseconds = 1000,
  [int]$PerCommandDelayMilliseconds = 1500
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$recordPath = Join-Path $logDir "$Marker-command-sequence.json"

New-Item -ItemType Directory -Path $logDir -Force | Out-Null

if (!(Test-Path $CommandsPath)) {
  $missing = [ordered]@{
    marker = $Marker
    status = "missing-commands"
    commandsPath = $CommandsPath
  }
  $missing | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $recordPath
  $missing | ConvertTo-Json -Depth 6
  exit 3
}

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CodexUser32 {
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

$commands = @()
foreach ($line in @(Get-Content $CommandsPath)) {
  $value = [string]$line
  if ($value.Trim().Length -gt 0) {
    $commands += $value
  }
}
$ws = New-Object -ComObject WScript.Shell

Start-Sleep -Milliseconds $InitialDelayMilliseconds

$releaseNotes = [CodexUser32]::FindWindow($null, "Release Notes")
$releaseNotesClosed = $false
if ($releaseNotes -ne [IntPtr]::Zero) {
  [CodexUser32]::SendMessage($releaseNotes, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  $releaseNotesClosed = $true
  Start-Sleep -Milliseconds 800
}

$markerRecordPath = Join-Path $logDir "$Marker.json"
$debuggerPid = $null
if (Test-Path $markerRecordPath) {
  $markerRecord = Get-Content $markerRecordPath -Raw | ConvertFrom-Json
  if ($markerRecord.debuggerPid) {
    $debuggerPid = [int]$markerRecord.debuggerPid
  }
}

$activatedByPid = $false
$activatedByTitle = $false
if ($debuggerPid) {
  $debuggerProcess = Get-Process -Id $debuggerPid -ErrorAction SilentlyContinue
  if ($debuggerProcess -and $debuggerProcess.MainWindowHandle -ne [IntPtr]::Zero) {
    [CodexUser32]::ShowWindow($debuggerProcess.MainWindowHandle, 9) | Out-Null
    [CodexUser32]::SetForegroundWindow($debuggerProcess.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
  }
  $activatedByPid = $ws.AppActivate($debuggerPid)
}
if (!$activatedByPid) {
  $activatedByTitle = $ws.AppActivate("x32dbg")
}
Start-Sleep -Milliseconds 500

$sent = @()
foreach ($command in @($commands)) {
  $commandActivatedByPid = $false
  $commandActivatedByTitle = $false
  $inputMode = "sendkeys"
  if ($debuggerPid) {
    $debuggerProcess = Get-Process -Id $debuggerPid -ErrorAction SilentlyContinue
    if ($debuggerProcess -and $debuggerProcess.MainWindowHandle -ne [IntPtr]::Zero) {
      [CodexUser32]::ShowWindow($debuggerProcess.MainWindowHandle, 9) | Out-Null
      [CodexUser32]::SetForegroundWindow($debuggerProcess.MainWindowHandle) | Out-Null
      Start-Sleep -Milliseconds 200
      $rect = New-Object CodexUser32+RECT
      if ([CodexUser32]::GetWindowRect($debuggerProcess.MainWindowHandle, [ref]$rect)) {
        $commandX = $rect.Left + 90
        $commandY = $rect.Bottom - 39
        [CodexUser32]::SetCursorPos($commandX, $commandY) | Out-Null
        [CodexUser32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [CodexUser32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
        Start-Sleep -Milliseconds 150
      }
    }
    $commandActivatedByPid = $ws.AppActivate($debuggerPid)
  }
  if (!$commandActivatedByPid) {
    $commandActivatedByTitle = $ws.AppActivate("x32dbg")
  }
  Start-Sleep -Milliseconds 200
  $ws.SendKeys("^{ENTER}")
  Start-Sleep -Milliseconds 250
  try {
    Set-Clipboard -Value $command
    Start-Sleep -Milliseconds 150
    $ws.SendKeys("^v")
    $inputMode = "clipboard"
  } catch {
    $ws.SendKeys($command)
    $inputMode = "sendkeys-fallback"
  }
  Start-Sleep -Milliseconds 250
  $ws.SendKeys("{ENTER}")
  Start-Sleep -Milliseconds $PerCommandDelayMilliseconds
  $sent += [ordered]@{
    command = $command
    activatedByPid = $commandActivatedByPid
    activatedByTitle = $commandActivatedByTitle
    inputMode = $inputMode
    sentAt = (Get-Date).ToString("o")
  }
}

$record = [ordered]@{
  marker = $Marker
  status = "commands-sent"
  commandsPath = $CommandsPath
  debuggerPid = $debuggerPid
  releaseNotesClosed = $releaseNotesClosed
  x32dbgActivated = ($activatedByPid -or $activatedByTitle)
  activatedByPid = $activatedByPid
  activatedByTitle = $activatedByTitle
  sent = $sent
  recordedAt = (Get-Date).ToString("o")
}

$record | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $recordPath
$record | ConvertTo-Json -Depth 6
