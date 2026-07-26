param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [string]$Label = "ui-callsite",
  [string]$Scope = "stage-select",
  [string]$Mode = "int3",
  [string]$LaunchExecutable = "",
  [string]$LaunchArguments = "",
  [string]$LaunchWorkDir = "",
  [switch]$StopTargetOnExit,
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$safeLabel = $Label -replace '[^A-Za-z0-9_.-]+', '-'
$recordPath = Join-Path $logDir "$Marker-ui-callsite-debug-$safeLabel.json"
$armedPath = Join-Path $logDir "$Marker-ui-callsite-debug-$safeLabel-armed.json"
$errorPath = Join-Path $logDir "$Marker-ui-callsite-debug-$safeLabel-error.json"
$launchUnderDebug = $LaunchExecutable.Length -gt 0

trap {
  try {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    [ordered]@{
      marker = $Marker
      label = $Label
      status = "unhandled-error"
      message = $_.Exception.Message
      type = $_.Exception.GetType().FullName
      scriptStackTrace = $_.ScriptStackTrace
      position = $_.InvocationInfo.PositionMessage
      recordedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $errorPath
  } catch {
  }
  break
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CodexUiDebugNative {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(UInt32 desiredAccess, bool inheritHandle, UInt32 processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenThread(UInt32 desiredAccess, bool inheritHandle, UInt32 threadId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern UInt32 SuspendThread(IntPtr thread);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern UInt32 ResumeThread(IntPtr thread);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesRead);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool WriteProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesWritten);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool FlushInstructionCache(IntPtr process, IntPtr baseAddress, UIntPtr size);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr handle);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool DebugActiveProcess(UInt32 processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool DebugActiveProcessStop(UInt32 processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool DebugSetProcessKillOnExit(bool killOnExit);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool WaitForDebugEvent(out DEBUG_EVENT debugEvent, UInt32 milliseconds);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ContinueDebugEvent(UInt32 processId, UInt32 threadId, UInt32 continueStatus);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool Wow64GetThreadContext(IntPtr thread, ref WOW64_CONTEXT context);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool Wow64SetThreadContext(IntPtr thread, ref WOW64_CONTEXT context);

  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern bool CreateProcess(
    string applicationName,
    System.Text.StringBuilder commandLine,
    IntPtr processAttributes,
    IntPtr threadAttributes,
    bool inheritHandles,
    UInt32 creationFlags,
    IntPtr environment,
    string currentDirectory,
    ref STARTUPINFO startupInfo,
    out PROCESS_INFORMATION processInformation);
}

[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct STARTUPINFO {
  public UInt32 cb;
  public string lpReserved;
  public string lpDesktop;
  public string lpTitle;
  public UInt32 dwX;
  public UInt32 dwY;
  public UInt32 dwXSize;
  public UInt32 dwYSize;
  public UInt32 dwXCountChars;
  public UInt32 dwYCountChars;
  public UInt32 dwFillAttribute;
  public UInt32 dwFlags;
  public UInt16 wShowWindow;
  public UInt16 cbReserved2;
  public IntPtr lpReserved2;
  public IntPtr hStdInput;
  public IntPtr hStdOutput;
  public IntPtr hStdError;
}

[StructLayout(LayoutKind.Sequential)]
public struct PROCESS_INFORMATION {
  public IntPtr hProcess;
  public IntPtr hThread;
  public UInt32 dwProcessId;
  public UInt32 dwThreadId;
}

[StructLayout(LayoutKind.Sequential)]
public struct DEBUG_EVENT {
  public UInt32 dwDebugEventCode;
  public UInt32 dwProcessId;
  public UInt32 dwThreadId;
  public DEBUG_EVENT_UNION u;
}

[StructLayout(LayoutKind.Explicit)]
public struct DEBUG_EVENT_UNION {
  [FieldOffset(0)]
  public EXCEPTION_DEBUG_INFO Exception;
  [FieldOffset(0)]
  public EXIT_PROCESS_DEBUG_INFO ExitProcess;
}

[StructLayout(LayoutKind.Sequential)]
public struct EXCEPTION_DEBUG_INFO {
  public EXCEPTION_RECORD ExceptionRecord;
  public UInt32 dwFirstChance;
}

[StructLayout(LayoutKind.Sequential)]
public struct EXCEPTION_RECORD {
  public UInt32 ExceptionCode;
  public UInt32 ExceptionFlags;
  public IntPtr ExceptionRecord;
  public IntPtr ExceptionAddress;
  public UInt32 NumberParameters;
  [MarshalAs(UnmanagedType.ByValArray, SizeConst=15)]
  public UIntPtr[] ExceptionInformation;
}

[StructLayout(LayoutKind.Sequential)]
public struct EXIT_PROCESS_DEBUG_INFO {
  public UInt32 dwExitCode;
}

[StructLayout(LayoutKind.Sequential)]
public struct WOW64_FLOATING_SAVE_AREA {
  public UInt32 ControlWord;
  public UInt32 StatusWord;
  public UInt32 TagWord;
  public UInt32 ErrorOffset;
  public UInt32 ErrorSelector;
  public UInt32 DataOffset;
  public UInt32 DataSelector;
  [MarshalAs(UnmanagedType.ByValArray, SizeConst=80)]
  public byte[] RegisterArea;
  public UInt32 Cr0NpxState;
}

[StructLayout(LayoutKind.Sequential)]
public struct WOW64_CONTEXT {
  public UInt32 ContextFlags;
  public UInt32 Dr0;
  public UInt32 Dr1;
  public UInt32 Dr2;
  public UInt32 Dr3;
  public UInt32 Dr6;
  public UInt32 Dr7;
  public WOW64_FLOATING_SAVE_AREA FloatSave;
  public UInt32 SegGs;
  public UInt32 SegFs;
  public UInt32 SegEs;
  public UInt32 SegDs;
  public UInt32 Edi;
  public UInt32 Esi;
  public UInt32 Ebx;
  public UInt32 Edx;
  public UInt32 Ecx;
  public UInt32 Eax;
  public UInt32 Ebp;
  public UInt32 Eip;
  public UInt32 SegCs;
  public UInt32 EFlags;
  public UInt32 Esp;
  public UInt32 SegSs;
  [MarshalAs(UnmanagedType.ByValArray, SizeConst=512)]
  public byte[] ExtendedRegisters;
}
"@

function ConvertTo-HexString {
  param([byte[]]$Bytes)

  if ($Bytes.Length -eq 0) {
    return ""
  }

  return [BitConverter]::ToString($Bytes)
}

function Format-Hex32 {
  param([uint32]$Value)

  return "0x$($Value.ToString('x8'))"
}

function Join-CommandLine {
  param(
    [string]$Executable,
    [string]$Arguments
  )

  $escapedExecutable = $Executable.Replace('"', '\"')
  if ($Arguments.Length -eq 0) {
    return '"' + $escapedExecutable + '"'
  }

  return '"' + $escapedExecutable + '" ' + $Arguments
}

function Start-DebuggedProcess {
  param(
    [string]$Executable,
    [string]$Arguments,
    [string]$WorkDir
  )

  if (!(Test-Path $Executable)) {
    throw "LaunchExecutable not found: $Executable"
  }

  $resolvedWorkDir = $WorkDir
  if ($resolvedWorkDir.Length -eq 0) {
    $resolvedWorkDir = Split-Path $Executable -Parent
  }
  if (!(Test-Path $resolvedWorkDir)) {
    throw "LaunchWorkDir not found: $resolvedWorkDir"
  }

  $startupInfo = New-Object STARTUPINFO
  $startupInfo.cb = [uint32][Runtime.InteropServices.Marshal]::SizeOf([type][STARTUPINFO])
  $processInfo = New-Object PROCESS_INFORMATION
  $commandLine = New-Object System.Text.StringBuilder (Join-CommandLine $Executable $Arguments)
  $DEBUG_ONLY_THIS_PROCESS = [uint32]0x00000002

  $ok = [CodexUiDebugNative]::CreateProcess(
    $Executable,
    $commandLine,
    [IntPtr]::Zero,
    [IntPtr]::Zero,
    $false,
    $DEBUG_ONLY_THIS_PROCESS,
    [IntPtr]::Zero,
    $resolvedWorkDir,
    [ref]$startupInfo,
    [ref]$processInfo)

  if (!$ok) {
    $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "CreateProcess failed for $Executable error=$lastError"
  }

  return [ordered]@{
    processHandle = $processInfo.hProcess
    threadHandle = $processInfo.hThread
    processId = [int]$processInfo.dwProcessId
    initialThreadId = [int]$processInfo.dwThreadId
    executable = $Executable
    arguments = $Arguments
    workDir = $resolvedWorkDir
  }
}

function Read-Memory {
  param(
    [IntPtr]$Handle,
    [int64]$Address,
    [int]$Size
  )

  $buffer = New-Object byte[] $Size
  $read = [UIntPtr]::Zero
  $ok = [CodexUiDebugNative]::ReadProcessMemory($Handle, [IntPtr]$Address, $buffer, [uint32]$Size, [ref]$read)
  if (!$ok -or $read.ToUInt64() -ne [uint64]$Size) {
    $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "ReadProcessMemory failed at 0x$($Address.ToString('x')) size=$Size read=$($read.ToUInt64()) error=$lastError"
  }

  return $buffer
}

function Read-AsciiCandidate {
  param(
    [IntPtr]$Handle,
    [uint32]$Address,
    [int]$MaxLength = 96
  )

  if ($Address -lt 0x00400000 -or $Address -gt 0x02000000) {
    return $null
  }

  try {
    $bytes = Read-Memory $Handle ([int64]$Address) $MaxLength
  } catch {
    return $null
  }

  $chars = @()
  foreach ($byte in $bytes) {
    if ($byte -eq 0) {
      break
    }
    if ($byte -lt 0x20 -or $byte -gt 0x7e) {
      if ($chars.Count -eq 0) {
        return $null
      }
      break
    }
    $chars += [char]$byte
  }

  $text = -join $chars
  if ($text.Length -lt 3) {
    return $null
  }

  return $text
}

function ConvertTo-DwordTrace {
  param(
    [IntPtr]$Handle,
    [int64]$BaseAddress,
    [byte[]]$Bytes,
    [int]$Count = 16
  )

  $records = @()
  $recordCount = [Math]::Min($Count, [int]($Bytes.Length / 4))
  for ($index = 0; $index -lt $recordCount; $index += 1) {
    $offset = $index * 4
    $value = [BitConverter]::ToUInt32($Bytes, $offset)
    $record = [ordered]@{
      index = $index
      offset = "0x$($offset.ToString('x2'))"
      address = "0x$((($BaseAddress + $offset) -band 0xffffffff).ToString('x8'))"
      value = Format-Hex32 $value
    }
    $ascii = Read-AsciiCandidate $Handle $value
    if ($ascii) {
      $record.ascii = $ascii
    }
    $records += $record
  }

  return $records
}

function ConvertTo-RegisterPointerTrace {
  param(
    [IntPtr]$Handle,
    [WOW64_CONTEXT]$Context
  )

  $registers = [ordered]@{
    eax = $Context.Eax
    ebx = $Context.Ebx
    ecx = $Context.Ecx
    edx = $Context.Edx
    esi = $Context.Esi
    edi = $Context.Edi
    ebp = $Context.Ebp
    esp = $Context.Esp
    eip = $Context.Eip
  }
  $records = @()

  foreach ($name in $registers.Keys) {
    $value = [uint32]$registers[$name]
    $ascii = Read-AsciiCandidate $Handle $value
    if ($ascii) {
      $records += [ordered]@{
        register = $name
        value = Format-Hex32 $value
        ascii = $ascii
      }
    }
  }

  return $records
}

function Write-Memory {
  param(
    [IntPtr]$Handle,
    [int64]$Address,
    [byte[]]$Bytes
  )

  $written = [UIntPtr]::Zero
  $ok = [CodexUiDebugNative]::WriteProcessMemory($Handle, [IntPtr]$Address, $Bytes, [uint32]$Bytes.Length, [ref]$written)
  if (!$ok -or $written.ToUInt64() -ne [uint64]$Bytes.Length) {
    $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "WriteProcessMemory failed at 0x$($Address.ToString('x')) size=$($Bytes.Length) written=$($written.ToUInt64()) error=$lastError"
  }
}

function Get-TargetPid {
  param($MarkerRecord)

  if ($MarkerRecord.targetPid) {
    return [int]$MarkerRecord.targetPid
  }

  if ($MarkerRecord.game -and $MarkerRecord.game.Id) {
    return [int]$MarkerRecord.game.Id
  }

  foreach ($entry in @($MarkerRecord.processes)) {
    if ($entry.ProcessName -eq "imjinrok2" -and $entry.Id) {
      return [int]$entry.Id
    }
  }

  throw "Unable to find imjinrok2 PID in marker $Marker"
}

function New-Wow64Context {
  param([uint32]$ContextFlags = 0x00010007)

  $context = New-Object WOW64_CONTEXT
  $context.ContextFlags = $ContextFlags
  $floatSave = New-Object WOW64_FLOATING_SAVE_AREA
  $floatSave.RegisterArea = New-Object byte[] 80
  $context.FloatSave = $floatSave
  $context.ExtendedRegisters = New-Object byte[] 512
  return $context
}

function Get-BreakpointSpecs {
  param([string]$ScopeName)

  $stageSelect = @(
    [ordered]@{ id = "select-stage-border-bind-resource"; address = 0x004aafda; target = "0x00442dd0"; preCall = "push 0x0094ba60,yfnt\\selectstageborder.spr" },
    [ordered]@{ id = "select-stage-border-bind-control"; address = 0x004aafeb; target = "0x004434a0"; preCall = "fields esi+0x000010ec" },
    [ordered]@{ id = "select-stage-saveload-resource"; address = 0x004ab043; target = "0x00442dd0"; preCall = "push 0x0094ba60,yfnt\\saveloadbar.spr" },
    [ordered]@{ id = "select-stage-saveload-control"; address = 0x004ab054; target = "0x004434a0"; preCall = "fields esi+0x00001ce4" }
  )
  $hud = @(
    [ordered]@{ id = "mouse-interface-primary-resource"; address = 0x004a51de; target = "0x00442dd0"; preCall = "push 0x2,0x0094ba60,yfnt\\mouseinterface.spr; stack 0x0c=0x119,0x24=0x185" },
    [ordered]@{ id = "mouse-interface-primary-control"; address = 0x004a5210; target = "0x004434a0"; preCall = "push 0x00c80318" },
    [ordered]@{ id = "mouse-interface-secondary-resource"; address = 0x004aaae3; target = "0x00442dd0"; preCall = "push 0x3,0x0094ba60,yfnt\\mouseinterface.spr; stack 0x0c=0x120,0x34=0x1c2" },
    [ordered]@{ id = "mouse-interface-secondary-control"; address = 0x004aab15; target = "0x004434a0"; preCall = "push 0x00c88b60" }
  )
  $hudResourceCandidates = @(
    [ordered]@{ id = "objective-border-resource"; address = 0x004a577a; target = "0x00442dd0"; preCall = "push 0x0094ba60,yfnt\\objectiveborder.spr" },
    [ordered]@{ id = "hero-panel-resource"; address = 0x004a7445; target = "0x00442dd0"; preCall = "push 0x0094ba60,yfnt\\hero.spr" },
    [ordered]@{ id = "progress-bar-resource"; address = 0x004a952d; target = "0x00442dd0"; preCall = "stack copy yfnt\\ProgressBar_Small.spr/yfnt\\ProgressBar_Large.spr; push 0x0094ba60" },
    [ordered]@{ id = "game-speed-resource"; address = 0x004ac3bd; target = "0x00442dd0"; preCall = "push 0x0094ba60,yfnt\\gamespeed.spr; stack 0x0c=0x11c,0x54=0x194" }
  )
  $heroPanelDrawCandidates = @(
    [ordered]@{ id = "hero-panel-name-lookup-call"; address = 0x004a76d0; target = "0x004a8870"; preCall = "push hero/control name pointer; returns hero table index in AX" },
    [ordered]@{ id = "hero-panel-name-table-read"; address = 0x004a887f; target = "0x00c83e00"; preCall = "read DWORD PTR [eax*4+0x00c83e00] from hero.spr setup table" },
    [ordered]@{ id = "hero-panel-frame-table-read"; address = 0x004a7758; target = "0x00c84348"; preCall = "read DWORD PTR [eax*4+0x00c84348], add 0x00c84a7c frame/base offset" },
    [ordered]@{ id = "hero-panel-frame-draw-call"; address = 0x004a7778; target = "0x0044dfd0"; preCall = "push 0,0,0x00c83e8c,0x00c83e90,frame/resource candidate from 0x00c84348+0x00c84a7c" }
  )
  $heroPanelFrameCandidates = @(
    [ordered]@{ id = "hero-panel-frame-presence-check"; address = 0x004a7716; target = "0x0044abb0"; preCall = "push handle from [edi*4+0x00549588]" },
    [ordered]@{ id = "hero-panel-frame-clear-call"; address = 0x004a773d; target = "0x0044c8c0"; preCall = "push 0,0,0x00c83e8c-1,0x00c83e90-1,0xfe clear/fill candidate" },
    [ordered]@{ id = "hero-panel-frame-table-read"; address = 0x004a7758; target = "0x00c84348"; preCall = "read DWORD PTR [eax*4+0x00c84348], add 0x00c84a7c frame/base offset" },
    [ordered]@{ id = "hero-panel-frame-draw-call"; address = 0x004a7778; target = "0x0044dfd0"; preCall = "push 0,0,0x00c83e8c,0x00c83e90,frame/resource candidate from 0x00c84348+0x00c84a7c" }
  )
  $heroPanelDrawOnlyCandidates = @(
    [ordered]@{ id = "hero-panel-frame-clear-call"; address = 0x004a773d; target = "0x0044c8c0"; preCall = "push 0,0,0x00c83e8c-1,0x00c83e90-1,0xfe clear/fill candidate" },
    [ordered]@{ id = "hero-panel-frame-table-read"; address = 0x004a7758; target = "0x00c84348"; preCall = "read DWORD PTR [eax*4+0x00c84348], add 0x00c84a7c frame/base offset" },
    [ordered]@{ id = "hero-panel-frame-draw-call"; address = 0x004a7778; target = "0x0044dfd0"; preCall = "push 0,0,0x00c83e8c,0x00c83e90,frame/resource candidate from 0x00c84348+0x00c84a7c" },
    [ordered]@{ id = "hero-panel-frame-release-call"; address = 0x004a778a; target = "0x0044ada0"; preCall = "push handle from [edi*4+0x00549588] after frame draw candidate" }
  )
  $selectedPanelProgressCandidates = @(
    [ordered]@{ id = "selected-panel-progress-entry"; address = 0x004a7880; target = "function-entry"; preCall = "selected unit/building panel progress overlay path" },
    [ordered]@{ id = "selected-panel-progress-state-call"; address = 0x004a78c4; target = "0x004a8410"; preCall = "push selected slot progress record before percent clamp/update" },
    [ordered]@{ id = "selected-panel-progress-percent-read"; address = 0x004a7906; target = "progress-word"; preCall = "read WORD [esi+edi*2+0x13c], clamp against 0x64, and use 0x51eb851f division constants" },
    [ordered]@{ id = "selected-panel-progress-overlay-call"; address = 0x004a79b8; target = "vtable+0x14"; preCall = "draw selected panel progress overlay using handle [edi*4+0x00549588] and computed rect" }
  )
  $selectedPanelProductionTextCandidates = @(
    [ordered]@{ id = "selected-panel-production-text-branch-call"; address = 0x004a8564; target = "0x004a81f0"; preCall = "non-0x004a7880 selected slot branch after state rect setup and vtable+0x1c draw call" },
    [ordered]@{ id = "selected-panel-production-text-entry"; address = 0x004a81f0; target = "function-entry"; preCall = "selected unit/building production text overlay path" },
    [ordered]@{ id = "selected-panel-production-text-state-call"; address = 0x004a8278; target = "0x004a8410"; preCall = "compute slot text rectangle before writing highlight bounds" },
    [ordered]@{ id = "selected-panel-production-text-present-call"; address = 0x004a83e7; target = "vtable+0x68"; preCall = "present composed production/name text surface back to selected panel object" }
  )
  $selectedPanelSlotDispatchCandidates = @(
    [ordered]@{ id = "selected-panel-slot-dispatch-entry"; address = 0x004a84e0; target = "function-entry"; preCall = "selected panel slot dispatch entry that draws base rect and iterates four slot records" },
    [ordered]@{ id = "selected-panel-slot-base-draw-call"; address = 0x004a8511; target = "vtable+0x1c"; preCall = "draw selected panel base slot rect using 0x0054927c and helper rect 0x004a8480" },
    [ordered]@{ id = "selected-panel-slot-progress-branch-call"; address = 0x004a8534; target = "0x004a7880"; preCall = "branch used only when active slot record kind equals 1" },
    [ordered]@{ id = "selected-panel-slot-production-text-branch-call"; address = 0x004a8564; target = "0x004a81f0"; preCall = "alternate active slot branch for production/name text surface" }
  )
  $bottomPanelTextCandidates = @(
    [ordered]@{ id = "bottom-panel-text-numeric-entry"; address = 0x004567c0; target = "function-entry"; preCall = "bottom selection panel text/numeric draw path entry, ECX becomes ESI owner object" },
    [ordered]@{ id = "bottom-panel-label-format-plain"; address = 0x0045687f; target = "%s"; preCall = "format label from [esi+0x94] into stack text buffer when optional [esi+0x29c] suffix is absent" },
    [ordered]@{ id = "bottom-panel-primary-value-format"; address = 0x00456f6b; target = " %d "; preCall = "format first numeric field from [esi+0x294] before drawing it beside the label" },
    [ordered]@{ id = "bottom-panel-primary-value-draw-call"; address = 0x00456f9b; target = "[0x004b7050]"; preCall = "draw first formatted numeric field with coordinates derived from EBP/EBX and measured label width" }
  )
  $bottomPanelValueDrawCandidates = @(
    [ordered]@{ id = "bottom-panel-value0-draw-call"; address = 0x00456f9b; target = "[0x004b7050]"; preCall = "draw numeric field [esi+0x294] after optional frame at 0x008cb2d8" },
    [ordered]@{ id = "bottom-panel-value1-draw-call"; address = 0x004570cc; target = "[0x004b7050]"; preCall = "draw numeric field [esi+0x296] after optional frame at 0x008cb2dc" },
    [ordered]@{ id = "bottom-panel-value2-draw-call"; address = 0x004571fd; target = "[0x004b7050]"; preCall = "draw numeric field [esi+0x298] after optional frame at 0x008cb2e0" },
    [ordered]@{ id = "bottom-panel-value3-draw-call"; address = 0x0045732e; target = "[0x004b7050]"; preCall = "draw numeric field [esi+0x29a] after optional frame at 0x008cb2e4" }
  )
  $bottomPanelLabelDrawCandidates = @(
    [ordered]@{ id = "bottom-panel-label-format-with-suffix"; address = 0x00456e16; target = "%s(%c)"; preCall = "format selected label from [esi+0x94] plus optional [esi+0x29c] suffix before final label draw" },
    [ordered]@{ id = "bottom-panel-label-format-plain-final"; address = 0x00456e32; target = "%s"; preCall = "format selected label from [esi+0x94] before final label draw" },
    [ordered]@{ id = "bottom-panel-label-draw-call"; address = 0x00456e57; target = "[0x004b7050]"; preCall = "draw selected label text using coordinates derived from centered bottom-panel layout" },
    [ordered]@{ id = "bottom-panel-label-measure-after-draw"; address = 0x00456e7b; target = "[0x004b7058]"; preCall = "measure selected label text after final label draw before testing numeric fields" }
  )
  $bottomPanelExtraLineCandidates = @(
    [ordered]@{ id = "bottom-panel-extra-line-loop-entry"; address = 0x0045738b; target = "[esi+0x88]/[esi+0x114]"; preCall = "iterate three extra text records after numeric fields; records start at [esi+0x88] and text starts at [esi+0x114]" },
    [ordered]@{ id = "bottom-panel-extra-line-draw-call"; address = 0x004573af; target = "[0x004b7050]"; preCall = "draw one active extra text line from [esi+0x114 + n*0x80]" },
    [ordered]@{ id = "bottom-panel-extra-line-measure-call"; address = 0x004573cd; target = "[0x004b7058]"; preCall = "measure the extra text line after drawing it" },
    [ordered]@{ id = "bottom-panel-final-blit-call"; address = 0x00457438; target = "[esi+0x1c]"; preCall = "blit cached bottom-panel surface 0x00549270 into main surface 0x00549580 after composition" }
  )
  $heroPanelFinalDrawCandidates = @(
    [ordered]@{ id = "hero-panel-frame-draw-call"; address = 0x004a7778; target = "0x0044dfd0"; preCall = "push 0,0,0x00c83e8c,0x00c83e90,frame/resource candidate from 0x00c84348+0x00c84a7c" },
    [ordered]@{ id = "hero-panel-frame-release-call"; address = 0x004a778a; target = "0x0044ada0"; preCall = "push handle from [edi*4+0x00549588] after frame draw candidate" },
    [ordered]@{ id = "hero-panel-transient-resource-load"; address = 0x004a77f3; target = "0x00442dd0"; preCall = "push transient resource path and 0x0094ba60 after YPRG004 diagnostic branch" },
    [ordered]@{ id = "hero-panel-transient-resource-apply"; address = 0x004a783d; target = "0x004414a0"; preCall = "push transient resource handle with 0,0 after load" }
  )
  $nonHeroDrawCandidates = @(
    [ordered]@{ id = "objective-border-frame-draw-call"; address = 0x004a5a10; target = "0x0044dfd0"; preCall = "push 0x51,0x70 plus globals 0x0088b498/0x0088bbcc/0x0088afe0/0x0088afdc from objectiveborder.spr setup path" },
    [ordered]@{ id = "progress-bar-frame-draw-call"; address = 0x004a967b; target = "0x0044dfd0"; preCall = "push progress table values from [eax+0x00c8567c/0x00c84a90/0x00c84a8c]" },
    [ordered]@{ id = "progress-bar-extra-frame-draw-call"; address = 0x004a96b5; target = "0x0044e160"; preCall = "push 0x00534668 plus progress table values from [eax+0x00c8567c/0x00c84a90/0x00c84a8c]" },
    [ordered]@{ id = "game-speed-frame-map-call"; address = 0x004ac5b1; target = "vtable+0x10"; preCall = "push 0x00cd9048 and stack word frame-state map before gamespeed.spr vtable draw/update call" }
  )
  $objectiveDrawCandidates = @(
    [ordered]@{ id = "objective-border-presence-check"; address = 0x004a59b5; target = "0x0044abb0"; preCall = "push candidate handle from caller stack for objectiveborder.spr resource presence" },
    [ordered]@{ id = "objective-border-rect-query"; address = 0x004a59dc; target = "0x0044ae80"; preCall = "push output rect buffers before objective frame draw" },
    [ordered]@{ id = "objective-border-frame-draw-call"; address = 0x004a5a10; target = "0x0044dfd0"; preCall = "push 0x51,0x70 plus globals 0x0088b498/0x0088bbcc/0x0088afe0/0x0088afdc" },
    [ordered]@{ id = "objective-border-frame-release-call"; address = 0x004a5a32; target = "0x0044ada0"; preCall = "release objectiveborder.spr handle after frame draw" }
  )
  $progressDrawCandidates = @(
    [ordered]@{ id = "progress-bar-table-release-call"; address = 0x004a95fa; target = "0x00443440"; preCall = "release/decrement ProgressBar setup table entry when 0x00c84a80 reaches zero" },
    [ordered]@{ id = "progress-bar-frame-draw-call"; address = 0x004a967b; target = "0x0044dfd0"; preCall = "push progress table values from [eax+0x00c8567c/0x00c84a90/0x00c84a8c]" },
    [ordered]@{ id = "progress-bar-extra-frame-draw-call"; address = 0x004a96b5; target = "0x0044e160"; preCall = "push 0x00534668 plus progress table values from [eax+0x00c8567c/0x00c84a90/0x00c84a8c]" },
    [ordered]@{ id = "progress-bar-input-index-update"; address = 0x004a971d; target = "vtable+0x20"; preCall = "push derived progress index before progress vtable update" }
  )
  $gameSpeedDrawCandidates = @(
    [ordered]@{ id = "game-speed-draw-entry"; address = 0x004ac4c0; target = "function-entry"; preCall = "build stack word frame-state map from current WORD [ecx+0x10]" },
    [ordered]@{ id = "game-speed-state-jump-table"; address = 0x004ac547; target = "jump-table"; preCall = "dispatch current speed state through table at 0x004ac5bc" },
    [ordered]@{ id = "game-speed-resource-table-push"; address = 0x004ac5ac; target = "0x00cd9048"; preCall = "push gamespeed.spr resource table after frame-state map construction" },
    [ordered]@{ id = "game-speed-frame-map-call"; address = 0x004ac5b1; target = "vtable+0x10"; preCall = "call gamespeed control vtable with resource table and stack word frame-state map" }
  )
  $gameSpeedFrameOnlyCandidates = @(
    [ordered]@{ id = "game-speed-state-jump-table"; address = 0x004ac547; target = "jump-table"; preCall = "dispatch current speed state through table at 0x004ac5bc" },
    [ordered]@{ id = "game-speed-resource-table-push"; address = 0x004ac5ac; target = "0x00cd9048"; preCall = "push gamespeed.spr resource table after frame-state map construction" },
    [ordered]@{ id = "game-speed-frame-map-call"; address = 0x004ac5b1; target = "vtable+0x10"; preCall = "call gamespeed control vtable with resource table and stack word frame-state map" },
    [ordered]@{ id = "game-speed-state-setter-call"; address = 0x004ac5db; target = "vtable+0x04"; preCall = "push requested game speed state into gamespeed control vtable setter" }
  )

  switch ($ScopeName) {
    "stage-select" { return $stageSelect }
    "hud-mouse-interface" { return $hud }
    "hud-resource-candidates" { return $hudResourceCandidates }
    "hud-resource-candidates-no-hero" { return @($hudResourceCandidates | Where-Object { $_.id -ne "hero-panel-resource" }) }
    "hud-hero-panel-draw-candidates" { return $heroPanelDrawCandidates }
    "hud-hero-panel-frame-candidates" { return $heroPanelFrameCandidates }
    "hud-hero-panel-draw-only-candidates" { return $heroPanelDrawOnlyCandidates }
    "hud-selected-progress-candidates" { return $selectedPanelProgressCandidates }
    "hud-selected-production-text-candidates" { return $selectedPanelProductionTextCandidates }
    "hud-selected-slot-dispatch-candidates" { return $selectedPanelSlotDispatchCandidates }
    "hud-bottom-panel-text-candidates" { return $bottomPanelTextCandidates }
    "hud-bottom-panel-value-draw-candidates" { return $bottomPanelValueDrawCandidates }
    "hud-bottom-panel-label-draw-candidates" { return $bottomPanelLabelDrawCandidates }
    "hud-bottom-panel-extra-line-candidates" { return $bottomPanelExtraLineCandidates }
    "hud-hero-panel-final-draw-candidates" { return $heroPanelFinalDrawCandidates }
    "hud-nonhero-draw-candidates" { return $nonHeroDrawCandidates }
    "hud-objective-draw-candidates" { return $objectiveDrawCandidates }
    "hud-progress-draw-candidates" { return $progressDrawCandidates }
    "hud-game-speed-draw-candidates" { return $gameSpeedDrawCandidates }
    "hud-game-speed-frame-only-candidates" { return $gameSpeedFrameOnlyCandidates }
    "stage-and-hud" { return @($stageSelect + $hud) }
    default { throw "Unknown scope: $ScopeName" }
  }
}

function Get-HardwareDr7 {
  param([int]$Count)

  $dr7 = [uint32]0
  for ($index = 0; $index -lt $Count; $index += 1) {
    $dr7 = $dr7 -bor ([uint32](1 -shl ($index * 2)))
  }
  return [uint32]$dr7
}

function Set-HardwareBreakpointsOnThread {
  param(
    [int]$ThreadId,
    [object[]]$BreakpointSpecs,
    [bool]$Clear = $false
  )

  $thread = [CodexUiDebugNative]::OpenThread($THREAD_ACCESS, $false, [uint32]$ThreadId)
  if ($thread -eq [IntPtr]::Zero) {
    return [ordered]@{
      threadId = $ThreadId
      status = "open-thread-failed"
      error = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    }
  }

  $suspended = $false
  try {
    $suspendResult = [CodexUiDebugNative]::SuspendThread($thread)
    if ($suspendResult -eq [uint32]::MaxValue) {
      return [ordered]@{
        threadId = $ThreadId
        status = "suspend-thread-failed"
        error = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      }
    }
    $suspended = $true

    $context = New-Wow64Context 0x00010017
    if (![CodexUiDebugNative]::Wow64GetThreadContext($thread, [ref]$context)) {
      return [ordered]@{
        threadId = $ThreadId
        status = "get-context-failed"
        suspendResult = $suspendResult
        error = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      }
    }

    if ($Clear) {
      $context.Dr0 = 0
      $context.Dr1 = 0
      $context.Dr2 = 0
      $context.Dr3 = 0
      $context.Dr6 = 0
      $context.Dr7 = 0
    } else {
      $context.Dr0 = if ($BreakpointSpecs.Count -gt 0) { [uint32]$BreakpointSpecs[0].address } else { 0 }
      $context.Dr1 = if ($BreakpointSpecs.Count -gt 1) { [uint32]$BreakpointSpecs[1].address } else { 0 }
      $context.Dr2 = if ($BreakpointSpecs.Count -gt 2) { [uint32]$BreakpointSpecs[2].address } else { 0 }
      $context.Dr3 = if ($BreakpointSpecs.Count -gt 3) { [uint32]$BreakpointSpecs[3].address } else { 0 }
      $context.Dr6 = 0
      $context.Dr7 = Get-HardwareDr7 $BreakpointSpecs.Count
    }

    if (![CodexUiDebugNative]::Wow64SetThreadContext($thread, [ref]$context)) {
      return [ordered]@{
        threadId = $ThreadId
        status = "set-context-failed"
        suspendResult = $suspendResult
        error = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      }
    }

    return [ordered]@{
      threadId = $ThreadId
      status = if ($Clear) { "cleared" } else { "armed" }
      suspendResult = $suspendResult
      dr0 = Format-Hex32 $context.Dr0
      dr1 = Format-Hex32 $context.Dr1
      dr2 = Format-Hex32 $context.Dr2
      dr3 = Format-Hex32 $context.Dr3
      dr7 = Format-Hex32 $context.Dr7
    }
  } finally {
    if ($suspended) {
      [CodexUiDebugNative]::ResumeThread($thread) | Out-Null
    }
    [CodexUiDebugNative]::CloseHandle($thread) | Out-Null
  }
}

function Set-HardwareBreakpointsOnProcessThreads {
  param(
    [int]$ProcessId,
    [object[]]$BreakpointSpecs,
    [bool]$Clear = $false
  )

  $target = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (!$target) {
    return @()
  }

  $results = @()
  foreach ($thread in @($target.Threads)) {
    $results += Set-HardwareBreakpointsOnThread ([int]$thread.Id) $BreakpointSpecs $Clear
  }
  return $results
}

$debugLaunch = $null
$targetPid = $null
$process = $null
if ($launchUnderDebug) {
  if ($Mode -ne "hardware") {
    throw "LaunchExecutable currently requires -Mode hardware."
  }
  $debugLaunch = Start-DebuggedProcess $LaunchExecutable $LaunchArguments $LaunchWorkDir
  $targetPid = [int]$debugLaunch.processId
  $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  $gameRecord = if ($process) {
    [ordered]@{
      Id = $process.Id
      ProcessName = $process.ProcessName
      StartTime = $process.StartTime
      MainWindowTitle = $process.MainWindowTitle
      Responding = $process.Responding
    }
  } else {
    [ordered]@{ Id = $targetPid; ProcessName = "imjinrok2" }
  }
  $launchRecord = [ordered]@{
    marker = $Marker
    status = "launched-under-debug"
    launchMode = "direct-createprocess-debug"
    launchedAt = (Get-Date).ToString("o")
    helperPid = $PID
    targetPid = $targetPid
    targetInitialThreadId = $debugLaunch.initialThreadId
    workDir = $debugLaunch.workDir
    launcher = $debugLaunch.executable
    launchArguments = $debugLaunch.arguments
    processName = "imjinrok2"
    game = $gameRecord
  }
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $launchRecord | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $markerPath
} else {
  if (!(Test-Path $markerPath)) {
    throw "Marker JSON not found: $markerPath"
  }
  $markerRecord = Get-Content $markerPath -Raw | ConvertFrom-Json
  $targetPid = Get-TargetPid $markerRecord
  $process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
  if (!$process -or $process.ProcessName -ne "imjinrok2") {
    throw "Target process is not running as imjinrok2: pid=$targetPid"
  }
}

$breakpoints = Get-BreakpointSpecs $Scope
if ($Mode -ne "int3" -and $Mode -ne "hardware") {
  throw "Unknown mode: $Mode"
}
if ($Mode -eq "hardware" -and $breakpoints.Count -gt 4) {
  throw "Hardware mode supports at most four call-sites; use a narrower scope."
}
$method = if ($Mode -eq "hardware") {
  "direct-windows-debug-api-hardware-breakpoint-runtime-probe"
} else {
  "direct-windows-debug-api-int3-runtime-probe"
}
$PROCESS_ACCESS = 0x001F0FFF
$THREAD_ACCESS = 0x001F03FF
$EXCEPTION_DEBUG_EVENT = [uint32]1
$CREATE_THREAD_DEBUG_EVENT = [uint32]2
$EXIT_PROCESS_DEBUG_EVENT = [uint32]5
$EXCEPTION_BREAKPOINT = [uint32]2147483651
$EXCEPTION_SINGLE_STEP = [uint32]2147483652
$EXCEPTION_WOW64_SINGLE_STEP = [uint32]1073741854
$DBG_CONTINUE = [uint32]65538
$DBG_EXCEPTION_NOT_HANDLED = [uint32]2147549185

$handle = [CodexUiDebugNative]::OpenProcess($PROCESS_ACCESS, $false, [uint32]$targetPid)
if ($handle -eq [IntPtr]::Zero) {
  $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed for pid=$targetPid error=$lastError"
}

$attached = $false
$patched = @()
$threadBreakpointResults = @()
$threadBreakpointClearResults = @()
$eventsSeen = @()
$hit = $null
$helperError = $null
$status = "no-hit"
$startedAt = Get-Date

function New-RecordSnapshot {
  param([string]$SnapshotStatus)

  $processStartTime = $null
  try {
    if ($process -and $process.StartTime) {
      $processStartTime = $process.StartTime.ToString("o")
    }
  } catch {
    $processStartTime = $null
  }

  return [ordered]@{
    marker = $Marker
    label = $Label
    status = $SnapshotStatus
    method = $method
    mode = $Mode
    launchMode = if ($launchUnderDebug) { "direct-createprocess-debug" } else { "attach-existing-process" }
    stopTargetOnExit = [bool]$StopTargetOnExit
    scope = $Scope
    timeoutSeconds = $TimeoutSeconds
    targetPid = $targetPid
    processStartTime = $processStartTime
    breakpoints = $patched
    threadBreakpointResults = @($threadBreakpointResults | Select-Object -First 32)
    threadBreakpointClearResults = @($threadBreakpointClearResults | Select-Object -First 32)
    hit = $hit
    helperError = $helperError
    eventsSeen = @($eventsSeen | Select-Object -First 32)
    eventsSeenTail = @($eventsSeen | Select-Object -Last 32)
    eventCount = $eventsSeen.Count
    recordedAt = (Get-Date).ToString("o")
  }
}

function Write-RecordSnapshot {
  param([string]$SnapshotStatus)

  $snapshot = New-RecordSnapshot $SnapshotStatus
  $snapshot | ConvertTo-Json -Depth 16 | Set-Content -Encoding UTF8 $recordPath
  return $snapshot
}

try {
  [CodexUiDebugNative]::DebugSetProcessKillOnExit($false) | Out-Null
  if ($launchUnderDebug) {
    $attached = $true
  } else {
    if (![CodexUiDebugNative]::DebugActiveProcess([uint32]$targetPid)) {
      $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
      throw "DebugActiveProcess failed for pid=$targetPid error=$lastError"
    }
    $attached = $true
  }

  if ($Mode -eq "hardware") {
    $slot = 0
    foreach ($breakpoint in $breakpoints) {
      $patched += [ordered]@{
        id = $breakpoint.id
        address = "0x$(([int64]$breakpoint.address).ToString('x8'))"
        target = $breakpoint.target
        preCall = $breakpoint.preCall
        mode = "hardware"
        slot = $slot
        cleared = $false
      }
      $slot += 1
    }
    $threadBreakpointResults = @(Set-HardwareBreakpointsOnProcessThreads $targetPid $breakpoints $false)
  } else {
    foreach ($breakpoint in $breakpoints) {
      $address = [int64]$breakpoint.address
      $original = Read-Memory $handle $address 1
      Write-Memory $handle $address ([byte[]](0xcc))
      $patched += [ordered]@{
        id = $breakpoint.id
        address = "0x$($address.ToString('x8'))"
        target = $breakpoint.target
        preCall = $breakpoint.preCall
        mode = "int3"
        originalByte = ConvertTo-HexString $original
        restored = $false
      }
    }
    [CodexUiDebugNative]::FlushInstructionCache($handle, [IntPtr]::Zero, [UIntPtr]::Zero) | Out-Null
  }
  $armed = [ordered]@{
    marker = $Marker
    label = $Label
    status = "armed"
    method = $method
    mode = $Mode
    scope = $Scope
    targetPid = $targetPid
    breakpoints = $patched
    threadBreakpointResults = $threadBreakpointResults
    armedAt = (Get-Date).ToString("o")
  }
  $armed | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 $armedPath

  while (((Get-Date) - $startedAt).TotalSeconds -lt $TimeoutSeconds) {
    $debugEvent = New-Object DEBUG_EVENT
    if (![CodexUiDebugNative]::WaitForDebugEvent([ref]$debugEvent, 500)) {
      continue
    }

    $continueStatus = $DBG_CONTINUE
    $eventSummary = [ordered]@{
      eventCode = $debugEvent.dwDebugEventCode
      processId = $debugEvent.dwProcessId
      threadId = $debugEvent.dwThreadId
    }

    if ($debugEvent.dwDebugEventCode -eq $EXCEPTION_DEBUG_EVENT) {
      $exception = $debugEvent.u.Exception
      $exceptionCode = $exception.ExceptionRecord.ExceptionCode
      $exceptionAddress = $exception.ExceptionRecord.ExceptionAddress.ToInt64()
      $eventSummary.exceptionCode = "0x$($exceptionCode.ToString('x8'))"
      $eventSummary.exceptionAddress = "0x$($exceptionAddress.ToString('x8'))"
      $eventSummary.firstChance = $exception.dwFirstChance

      $isExpectedBreakpointException =
        $exceptionCode -eq $EXCEPTION_BREAKPOINT -or
        $exceptionCode -eq $EXCEPTION_SINGLE_STEP -or
        ($Mode -eq "hardware" -and $exceptionCode -eq $EXCEPTION_WOW64_SINGLE_STEP)

      if ($isExpectedBreakpointException) {
        $thread = [CodexUiDebugNative]::OpenThread($THREAD_ACCESS, $false, [uint32]$debugEvent.dwThreadId)
        if ($thread -ne [IntPtr]::Zero) {
          try {
            $context = New-Wow64Context 0x00010017
            if ([CodexUiDebugNative]::Wow64GetThreadContext($thread, [ref]$context)) {
              $eip = [int64]$context.Eip
              $matched = $null
              foreach ($breakpoint in $breakpoints) {
                $address = [int64]$breakpoint.address
                if (
                  $exceptionAddress -eq $address -or
                  $exceptionAddress -eq ($address + 1) -or
                  $eip -eq $address -or
                  $eip -eq ($address + 1)
                ) {
                  $matched = $breakpoint
                  break
                }
              }

              if ($matched) {
                $address = [int64]$matched.address
                $stackBytes = Read-Memory $handle ([int64]$context.Esp) 0x80
                $codeBytes = Read-Memory $handle $address 0x20
                if ($Mode -eq "hardware") {
                  $threadBreakpointClearResults = @(Set-HardwareBreakpointsOnProcessThreads $targetPid $breakpoints $true)
                  foreach ($patchedEntry in $patched) {
                    $patchedEntry.cleared = $true
                  }
                } else {
                  foreach ($patchedEntry in $patched) {
                    if ($patchedEntry.id -eq $matched.id) {
                      Write-Memory $handle $address ([byte[]]([Convert]::ToByte($patchedEntry.originalByte, 16)))
                      $patchedEntry.restored = $true
                      break
                    }
                  }
                  [CodexUiDebugNative]::FlushInstructionCache($handle, [IntPtr]::Zero, [UIntPtr]::Zero) | Out-Null
                  $context.Eip = [uint32]$address
                  [CodexUiDebugNative]::Wow64SetThreadContext($thread, [ref]$context) | Out-Null
                }

                $hit = [ordered]@{
                  id = $matched.id
                  address = "0x$($address.ToString('x8'))"
                  target = $matched.target
                  preCall = $matched.preCall
                  exceptionAddress = "0x$($exceptionAddress.ToString('x8'))"
                  exceptionCode = "0x$($exceptionCode.ToString('x8'))"
                  mode = $Mode
                  registers = [ordered]@{
                    eax = Format-Hex32 $context.Eax
                    ebx = Format-Hex32 $context.Ebx
                    ecx = Format-Hex32 $context.Ecx
                    edx = Format-Hex32 $context.Edx
                    esi = Format-Hex32 $context.Esi
                    edi = Format-Hex32 $context.Edi
                    ebp = Format-Hex32 $context.Ebp
                    esp = Format-Hex32 $context.Esp
                    eip = Format-Hex32 $context.Eip
                    eflags = Format-Hex32 $context.EFlags
                    dr6 = Format-Hex32 $context.Dr6
                    dr7 = Format-Hex32 $context.Dr7
                  }
                  stackBytes = ConvertTo-HexString $stackBytes
                  stackDwords = @(ConvertTo-DwordTrace $handle ([int64]$context.Esp) $stackBytes 16)
                  registerPointers = @(ConvertTo-RegisterPointerTrace $handle $context)
                  codeBytesAtCallsite = ConvertTo-HexString $codeBytes
                  hitAt = (Get-Date).ToString("o")
                }
                $status = "hit"
                $eventsSeen += $eventSummary
                Write-RecordSnapshot $status | Out-Null
                [CodexUiDebugNative]::ContinueDebugEvent($debugEvent.dwProcessId, $debugEvent.dwThreadId, $DBG_CONTINUE) | Out-Null
                break
              }
            } else {
              $eventSummary.contextError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
            }
          } finally {
            [CodexUiDebugNative]::CloseHandle($thread) | Out-Null
          }
        }
      } else {
        $continueStatus = $DBG_EXCEPTION_NOT_HANDLED
      }
    }
    if ($Mode -eq "hardware" -and $debugEvent.dwDebugEventCode -eq $CREATE_THREAD_DEBUG_EVENT) {
      $threadBreakpointResults = @($threadBreakpointResults) + @(Set-HardwareBreakpointsOnThread ([int]$debugEvent.dwThreadId) $breakpoints $false)
    }
    if ($debugEvent.dwDebugEventCode -eq $EXIT_PROCESS_DEBUG_EVENT) {
      $status = "target-exited"
      $eventSummary.exitCode = "0x$($debugEvent.u.ExitProcess.dwExitCode.ToString('x8'))"
      $eventsSeen += $eventSummary
      [CodexUiDebugNative]::ContinueDebugEvent($debugEvent.dwProcessId, $debugEvent.dwThreadId, $DBG_CONTINUE) | Out-Null
      break
    }

    $eventsSeen += $eventSummary
    [CodexUiDebugNative]::ContinueDebugEvent($debugEvent.dwProcessId, $debugEvent.dwThreadId, $continueStatus) | Out-Null
  }
} catch {
  $status = "helper-error"
  $helperError = [ordered]@{
    message = $_.Exception.Message
    type = $_.Exception.GetType().FullName
    scriptStackTrace = $_.ScriptStackTrace
    at = (Get-Date).ToString("o")
  }
  try {
    Write-RecordSnapshot $status | Out-Null
  } catch {
  }
} finally {
  if ($Mode -eq "hardware") {
    $threadBreakpointClearResults = @($threadBreakpointClearResults) + @(Set-HardwareBreakpointsOnProcessThreads $targetPid $breakpoints $true)
    foreach ($patchedEntry in $patched) {
      $patchedEntry.cleared = $true
    }
  } else {
    foreach ($patchedEntry in $patched) {
      if (!$patchedEntry.restored) {
        $address = [Convert]::ToInt64(([string]$patchedEntry.address).Substring(2), 16)
        try {
          Write-Memory $handle $address ([byte[]]([Convert]::ToByte($patchedEntry.originalByte, 16)))
          $patchedEntry.restored = $true
        } catch {
          $patchedEntry.restoreError = $_.Exception.Message
        }
      }
    }
    try {
      [CodexUiDebugNative]::FlushInstructionCache($handle, [IntPtr]::Zero, [UIntPtr]::Zero) | Out-Null
    } catch {
    }
  }
  if ($attached) {
    try {
      [CodexUiDebugNative]::DebugActiveProcessStop([uint32]$targetPid) | Out-Null
    } catch {
    }
  }
  if ($StopTargetOnExit) {
    try {
      $target = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
      if ($target) {
        Stop-Process -Id $targetPid -Force
        try { Wait-Process -Id $targetPid -Timeout 5 -ErrorAction SilentlyContinue } catch {}
      }
    } catch {
    }
  }
  if ($debugLaunch) {
    try { [CodexUiDebugNative]::CloseHandle($debugLaunch.threadHandle) | Out-Null } catch {}
    try { [CodexUiDebugNative]::CloseHandle($debugLaunch.processHandle) | Out-Null } catch {}
  }
  try {
    [CodexUiDebugNative]::CloseHandle($handle) | Out-Null
  } catch {
  }
}

$record = Write-RecordSnapshot $status
$record | ConvertTo-Json -Depth 16
