param(
  [Parameter(Mandatory = $true)]
  [string]$Marker
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$recordPath = Join-Path $logDir "$Marker-window-tree.json"

if (!(Test-Path $markerPath)) {
  throw "Marker JSON not found: $markerPath"
}

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class CodexWindowTree {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumChildWindows(IntPtr hwndParent, EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

  [DllImport("user32.dll", CharSet=CharSet.Unicode)]
  public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern int GetWindowTextLength(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool IsWindowEnabled(IntPtr hWnd);

  [DllImport("user32.dll")]
  public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

  [DllImport("user32.dll")]
  public static extern IntPtr GetParent(IntPtr hWnd);

  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }
}
"@

function Get-WindowClass {
  param([IntPtr]$Handle)

  $builder = New-Object System.Text.StringBuilder 512
  [CodexWindowTree]::GetClassName($Handle, $builder, $builder.Capacity) | Out-Null
  return $builder.ToString()
}

function Get-WindowTitle {
  param([IntPtr]$Handle)

  $length = [CodexWindowTree]::GetWindowTextLength($Handle)
  $builder = New-Object System.Text.StringBuilder ([Math]::Max($length + 1, 512))
  [CodexWindowTree]::GetWindowText($Handle, $builder, $builder.Capacity) | Out-Null
  return $builder.ToString()
}

function Get-WindowRectRecord {
  param([IntPtr]$Handle)

  $rect = New-Object CodexWindowTree+RECT
  [CodexWindowTree]::GetWindowRect($Handle, [ref]$rect) | Out-Null
  return [ordered]@{
    left = $rect.Left
    top = $rect.Top
    right = $rect.Right
    bottom = $rect.Bottom
    width = $rect.Right - $rect.Left
    height = $rect.Bottom - $rect.Top
  }
}

$markerRecord = Get-Content $markerPath -Raw | ConvertFrom-Json
if (!$markerRecord.debuggerPid) {
  throw "Marker JSON does not include debuggerPid: $markerPath"
}

$debuggerPid = [int]$markerRecord.debuggerPid
$debuggerProcess = Get-Process -Id $debuggerPid -ErrorAction Stop
if ($debuggerProcess.ProcessName -ne "x32dbg") {
  throw "Process is not x32dbg: pid=$debuggerPid name=$($debuggerProcess.ProcessName)"
}

$rootHandle = $debuggerProcess.MainWindowHandle
if ($rootHandle -eq [IntPtr]::Zero) {
  throw "x32dbg main window handle is zero: pid=$debuggerPid"
}

$children = New-Object System.Collections.Generic.List[object]
$callback = [CodexWindowTree+EnumWindowsProc]{
  param([IntPtr]$child, [IntPtr]$lParam)

  $children.Add([ordered]@{
    hwnd = "0x$($child.ToInt64().ToString('x'))"
    parent = "0x$(([CodexWindowTree]::GetParent($child)).ToInt64().ToString('x'))"
    className = Get-WindowClass $child
    text = Get-WindowTitle $child
    visible = [CodexWindowTree]::IsWindowVisible($child)
    enabled = [CodexWindowTree]::IsWindowEnabled($child)
    rect = Get-WindowRectRecord $child
  })
  return $true
}

[CodexWindowTree]::EnumChildWindows($rootHandle, $callback, [IntPtr]::Zero) | Out-Null

$record = [ordered]@{
  marker = $Marker
  debuggerPid = $debuggerPid
  root = [ordered]@{
    hwnd = "0x$($rootHandle.ToInt64().ToString('x'))"
    className = Get-WindowClass $rootHandle
    text = Get-WindowTitle $rootHandle
    rect = Get-WindowRectRecord $rootHandle
  }
  childCount = $children.Count
  children = $children
  recordedAt = (Get-Date).ToString("o")
}

$record | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $recordPath
$record | ConvertTo-Json -Depth 10
