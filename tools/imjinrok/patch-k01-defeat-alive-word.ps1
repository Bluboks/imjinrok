param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [ValidateSet("both", "gwon-yul", "ryu-seong-ryong")]
  [string]$Target = "both",
  [switch]$ResetDefeatTimer
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$recordPath = Join-Path $logDir "$Marker-k01-defeat-alive-word-patch.json"

if (!(Test-Path $markerPath)) {
  throw "Marker JSON not found: $markerPath"
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CodexK01DefeatAliveWordPatchMemory {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(UInt32 desiredAccess, bool inheritHandle, UInt32 processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesRead);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool WriteProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesWritten);

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
  $ok = [CodexK01DefeatAliveWordPatchMemory]::ReadProcessMemory($Handle, [IntPtr]$Address, $buffer, [uint32]$Size, [ref]$read)
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
  $ok = [CodexK01DefeatAliveWordPatchMemory]::WriteProcessMemory($Handle, [IntPtr]$Address, $Bytes, [uint32]$Bytes.Length, [ref]$written)
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

$markerRecord = Get-Content $markerPath -Raw | ConvertFrom-Json
$targetPid = Get-TargetPid $markerRecord
$process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (!$process -or $process.ProcessName -ne "imjinrok2") {
  throw "Target process is not running as imjinrok2: pid=$targetPid"
}

$PROCESS_ACCESS = 0x001F0FFF
$handle = [CodexK01DefeatAliveWordPatchMemory]::OpenProcess($PROCESS_ACCESS, $false, [uint32]$targetPid)
if ($handle -eq [IntPtr]::Zero) {
  $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed for pid=$targetPid error=$lastError"
}

try {
  $ownerAddress = 0x00bccc44
  $defeatTimerAddress = 0x00843740
  $globalTickAddress = 0x00882e04
  $recordBase = 0x0063528f
  $recordStride = 0x558
  $recordCount = 0x4b0
  $scanBytes = $recordStride * $recordCount
  $currentOwner = [BitConverter]::ToInt16((Read-Memory $handle $ownerAddress 2), 0)
  $defeatTimerBefore = [BitConverter]::ToInt32((Read-Memory $handle $defeatTimerAddress 4), 0)
  $globalTickBefore = [BitConverter]::ToInt32((Read-Memory $handle $globalTickAddress 4), 0)
  $recordBytes = Read-Memory $handle $recordBase $scanBytes

  if ($ResetDefeatTimer) {
    Write-Memory $handle $defeatTimerAddress ([byte[]](0x00, 0x00, 0x00, 0x00))
  }

  $targetTypes = @()
  if ($Target -eq "both" -or $Target -eq "gwon-yul") {
    $targetTypes += 0x4c
  }
  if ($Target -eq "both" -or $Target -eq "ryu-seong-ryong") {
    $targetTypes += 0x4e
  }

  $patches = @()
  for ($index = 0; $index -lt $recordCount; $index += 1) {
    $offset = $index * $recordStride
    $type = [int]$recordBytes[$offset]
    $owner = [int]$recordBytes[$offset + 1]
    if ($owner -ne ($currentOwner -band 0xff) -or !($targetTypes -contains $type)) {
      continue
    }

    $recordAddress = [int64]$recordBase + $offset
    $before = Read-Memory $handle $recordAddress 0x80
    $aliveWordBefore = [BitConverter]::ToInt16($before, 0x07)
    Write-Memory $handle ($recordAddress + 0x07) ([byte[]](0x00, 0x00))
    $after = Read-Memory $handle $recordAddress 0x80
    $aliveWordAfter = [BitConverter]::ToInt16($after, 0x07)

    $patches += [ordered]@{
      index = $index
      address = "0x$($recordAddress.ToString('x8'))"
      type = "0x$($type.ToString('x2'))"
      owner = $owner
      aliveWordBefore = $aliveWordBefore
      aliveWordAfter = $aliveWordAfter
      first128Before = ConvertTo-HexString $before
      first128After = ConvertTo-HexString $after
    }
  }

  if ($patches.Count -lt 1) {
    $blocked = [ordered]@{
      marker = $Marker
      status = "blocked-no-current-owner-k01-hero-records"
      targetPid = $targetPid
      currentOwner = $currentOwner
      target = $Target
      defeatTimerBefore = $defeatTimerBefore
      globalTickBefore = $globalTickBefore
      note = "No current-owner type 0x4c/0x4e records were found to patch."
    }
    $blocked | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $recordPath
    $blocked | ConvertTo-Json -Depth 8
    exit 2
  }

  $defeatTimerAfter = [BitConverter]::ToInt32((Read-Memory $handle $defeatTimerAddress 4), 0)
  $globalTickAfter = [BitConverter]::ToInt32((Read-Memory $handle $globalTickAddress 4), 0)
  $record = [ordered]@{
    marker = $Marker
    status = "patched"
    method = "debugger-assisted-alive-word-forcing"
    purpose = "Force K01 current-owner hero records 0x4c/0x4e to fail the original 0x441de0 alive check without deleting type/owner records."
    targetPid = $targetPid
    currentOwner = $currentOwner
    target = $Target
    resetDefeatTimer = [bool]$ResetDefeatTimer
    defeatTimerAddress = "0x$($defeatTimerAddress.ToString('x8'))"
    defeatTimerBefore = $defeatTimerBefore
    defeatTimerAfter = $defeatTimerAfter
    globalTickBefore = $globalTickBefore
    globalTickAfter = $globalTickAfter
    recordBase = "0x$($recordBase.ToString('x8'))"
    recordStride = "0x$($recordStride.ToString('x'))"
    patches = $patches
    patchedAt = (Get-Date).ToString("o")
  }

  $record | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 $recordPath
  $record | ConvertTo-Json -Depth 12
} finally {
  [CodexK01DefeatAliveWordPatchMemory]::CloseHandle($handle) | Out-Null
}
