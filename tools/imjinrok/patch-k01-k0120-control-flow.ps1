param(
  [Parameter(Mandatory = $true)]
  [string]$Marker
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$recordPath = Join-Path $logDir "$Marker-k01-k0120-control-flow-patch.json"

if (!(Test-Path $markerPath)) {
  throw "Marker JSON not found: $markerPath"
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CodexK0120CodePatchMemory {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(UInt32 desiredAccess, bool inheritHandle, UInt32 processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesRead);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool WriteProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesWritten);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool FlushInstructionCache(IntPtr process, IntPtr baseAddress, UIntPtr size);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr handle);
}
"@

function ConvertTo-HexString {
  param([byte[]]$Bytes)

  if ($Bytes.Length -eq 0) {
    return ""
  }

  return [BitConverter]::ToString($Bytes)
}

function Read-Memory {
  param(
    [IntPtr]$Handle,
    [int64]$Address,
    [int]$Size
  )

  $buffer = New-Object byte[] $Size
  $read = [UIntPtr]::Zero
  $ok = [CodexK0120CodePatchMemory]::ReadProcessMemory($Handle, [IntPtr]$Address, $buffer, [uint32]$Size, [ref]$read)
  if (!$ok -or $read.ToUInt64() -ne [uint64]$Size) {
    $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "ReadProcessMemory failed at 0x$($Address.ToString('x')) size=$Size read=$($read.ToUInt64()) error=$lastError"
  }

  return $buffer
}

function Write-Memory {
  param(
    [IntPtr]$Handle,
    [int64]$Address,
    [byte[]]$Bytes
  )

  $written = [UIntPtr]::Zero
  $ok = [CodexK0120CodePatchMemory]::WriteProcessMemory($Handle, [IntPtr]$Address, $Bytes, [uint32]$Bytes.Length, [ref]$written)
  if (!$ok -or $written.ToUInt64() -ne [uint64]$Bytes.Length) {
    $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "WriteProcessMemory failed at 0x$($Address.ToString('x')) size=$($Bytes.Length) written=$($written.ToUInt64()) error=$lastError"
  }
  [CodexK0120CodePatchMemory]::FlushInstructionCache($Handle, [IntPtr]::Zero, [UIntPtr]::Zero) | Out-Null
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

$markerRecord = Get-Content $markerPath -Raw | ConvertFrom-Json
$targetPid = Get-TargetPid $markerRecord
$process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (!$process -or $process.ProcessName -ne "imjinrok2") {
  throw "Target process is not running as imjinrok2: pid=$targetPid"
}

$PROCESS_ACCESS = 0x001F0FFF
$handle = [CodexK0120CodePatchMemory]::OpenProcess($PROCESS_ACCESS, $false, [uint32]$targetPid)
if ($handle -eq [IntPtr]::Zero) {
  $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed for pid=$targetPid error=$lastError"
}

try {
  $jumpAddress = 0x0048a72b
  $expectedBefore = [byte[]](0x0f, 0x85, 0xc1, 0x00, 0x00, 0x00)
  $patchedBytes = [byte[]](0x90, 0x90, 0x90, 0x90, 0x90, 0x90)
  $contextAddress = 0x0048a724
  $contextSize = 0x20
  $contextBefore = Read-Memory $handle $contextAddress $contextSize
  $before = Read-Memory $handle $jumpAddress $expectedBefore.Length

  $matchesExpected = (ConvertTo-HexString $before) -eq (ConvertTo-HexString $expectedBefore)
  $alreadyPatched = (ConvertTo-HexString $before) -eq (ConvertTo-HexString $patchedBytes)
  if ($alreadyPatched) {
    $record = [ordered]@{
      marker = $Marker
      status = "already-patched"
      method = "k0120-control-flow-forcing"
      purpose = "Bypass the pre-scan guard at 0x0048a72b so the original K0120 unit-scan and post-trigger code can be observed after a separate beacon-condition memory patch."
      targetPid = $targetPid
      jumpAddress = "0x$($jumpAddress.ToString('x8'))"
      staticMeaning = "Original bytes are JNE 0x0048a7f2 immediately after call 0x00487fa0/test eax,eax; patched bytes are six NOPs."
      before = ConvertTo-HexString $before
      after = ConvertTo-HexString $before
      contextAddress = "0x$($contextAddress.ToString('x8'))"
      contextBefore = ConvertTo-HexString $contextBefore
      contextAfter = ConvertTo-HexString $contextBefore
      patchedAt = (Get-Date).ToString("o")
    }
    $record | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $recordPath
    $record | ConvertTo-Json -Depth 8
    exit 0
  }

  if (!$matchesExpected) {
    $blocked = [ordered]@{
      marker = $Marker
      status = "blocked-unexpected-control-flow-bytes"
      method = "k0120-control-flow-forcing"
      targetPid = $targetPid
      jumpAddress = "0x$($jumpAddress.ToString('x8'))"
      expectedBefore = ConvertTo-HexString $expectedBefore
      actualBefore = ConvertTo-HexString $before
      contextAddress = "0x$($contextAddress.ToString('x8'))"
      contextBefore = ConvertTo-HexString $contextBefore
      recordedAt = (Get-Date).ToString("o")
    }
    $blocked | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $recordPath
    $blocked | ConvertTo-Json -Depth 8
    exit 2
  }

  Write-Memory $handle $jumpAddress $patchedBytes
  $after = Read-Memory $handle $jumpAddress $patchedBytes.Length
  $contextAfter = Read-Memory $handle $contextAddress $contextSize

  $record = [ordered]@{
    marker = $Marker
    status = "patched"
    method = "k0120-control-flow-forcing"
    purpose = "Bypass the pre-scan guard at 0x0048a72b so the original K0120 unit-scan and post-trigger code can be observed after a separate beacon-condition memory patch."
    targetPid = $targetPid
    jumpAddress = "0x$($jumpAddress.ToString('x8'))"
    staticMeaning = "Original bytes are JNE 0x0048a7f2 immediately after call 0x00487fa0/test eax,eax; patched bytes are six NOPs."
    before = ConvertTo-HexString $before
    after = ConvertTo-HexString $after
    contextAddress = "0x$($contextAddress.ToString('x8'))"
    contextBefore = ConvertTo-HexString $contextBefore
    contextAfter = ConvertTo-HexString $contextAfter
    patchedAt = (Get-Date).ToString("o")
  }

  $record | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $recordPath
  $record | ConvertTo-Json -Depth 8
} finally {
  [CodexK0120CodePatchMemory]::CloseHandle($handle) | Out-Null
}
