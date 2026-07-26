param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [int]$MaxPatches = 2
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$recordPath = Join-Path $logDir "$Marker-k01-k0120-condition-patch.json"

if (!(Test-Path $markerPath)) {
  throw "Marker JSON not found: $markerPath"
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CodexK0120Memory {
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
  $ok = [CodexK0120Memory]::ReadProcessMemory($Handle, [IntPtr]$Address, $buffer, [uint32]$Size, [ref]$read)
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
  $ok = [CodexK0120Memory]::WriteProcessMemory($Handle, [IntPtr]$Address, $Bytes, [uint32]$Bytes.Length, [ref]$written)
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
$handle = [CodexK0120Memory]::OpenProcess($PROCESS_ACCESS, $false, [uint32]$targetPid)
if ($handle -eq [IntPtr]::Zero) {
  $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed for pid=$targetPid error=$lastError"
}

try {
  $ownerAddress = 0x00bccc44
  $oneShotAddress = 0x008438dc
  $recordBase = 0x0063528f
  $recordStride = 0x558
  $recordCount = 0x4b0
  $scanBytes = $recordStride * $recordCount
  $currentOwnerBytes = Read-Memory $handle $ownerAddress 2
  $currentOwner = [BitConverter]::ToInt16($currentOwnerBytes, 0)
  $oneShotBeforeBytes = Read-Memory $handle $oneShotAddress 2
  $oneShotBefore = [BitConverter]::ToInt16($oneShotBeforeBytes, 0)
  $recordBytes = Read-Memory $handle $recordBase $scanBytes

  $priorityByType = @{
    0x07 = 0
    0x0a = 1
    0x02 = 2
    0x04 = 3
    0x0b = 4
    0x30 = 5
    0x31 = 6
    0x32 = 7
    0x33 = 8
  }
  $candidateTypes = @($priorityByType.Keys)
  $candidates = @()

  for ($index = 0; $index -lt $recordCount; $index += 1) {
    $offset = $index * $recordStride
    $type = [int]$recordBytes[$offset]
    $owner = [int]$recordBytes[$offset + 1]
    $progress = [int]$recordBytes[$offset + 0x55]

    if ($owner -eq $currentOwner -and $candidateTypes -contains $type) {
      $candidates += [ordered]@{
        index = $index
        address = "0x$(([int64]$recordBase + $offset).ToString('x8'))"
        typeBefore = "0x$($type.ToString('x2'))"
        ownerBefore = $owner
        progressBefore = $progress
        priority = [int]$priorityByType[$type]
      }
    }
  }

  $selected = @($candidates | Sort-Object priority,index | Select-Object -First $MaxPatches)
  if ($selected.Count -lt 1) {
    $blocked = [ordered]@{
      marker = $Marker
      status = "blocked-no-k01-owner-record-candidates"
      targetPid = $targetPid
      currentOwner = $currentOwner
      oneShotBefore = $oneShotBefore
      scannedRecords = $recordCount
      note = "No current-owner records with known K01 local unit/building type were found."
    }
    $blocked | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $recordPath
    $blocked | ConvertTo-Json -Depth 8
    exit 2
  }

  Write-Memory $handle $oneShotAddress ([byte[]](0x00, 0x00))
  $patches = @()
  foreach ($candidate in $selected) {
    $recordAddress = [Convert]::ToInt64(([string]$candidate.address).Substring(2), 16)
    $before = Read-Memory $handle $recordAddress 0x80
    Write-Memory $handle $recordAddress ([byte[]](0x34))
    Write-Memory $handle ($recordAddress + 1) ([byte[]]($currentOwner -band 0xff))
    Write-Memory $handle ($recordAddress + 0x55) ([byte[]](0x64))
    $after = Read-Memory $handle $recordAddress 0x80

    $patches += [ordered]@{
      index = $candidate.index
      address = $candidate.address
      typeBefore = $candidate.typeBefore
      ownerBefore = $candidate.ownerBefore
      progressBefore = $candidate.progressBefore
      typeAfter = "0x34"
      ownerAfter = ($currentOwner -band 0xff)
      progressAfter = 100
      first128Before = ConvertTo-HexString $before
      first128After = ConvertTo-HexString $after
    }
  }

  $oneShotAfter = [BitConverter]::ToInt16((Read-Memory $handle $oneShotAddress 2), 0)
  $record = [ordered]@{
    marker = $Marker
    status = "patched"
    method = "debugger-assisted-condition-forcing"
    purpose = "Force the original K01 K0120 scan to see a current-owner full-construction beacon record, then observe original executable trigger code."
    targetPid = $targetPid
    currentOwnerAddress = "0x$($ownerAddress.ToString('x8'))"
    currentOwner = $currentOwner
    oneShotAddress = "0x$($oneShotAddress.ToString('x8'))"
    oneShotBefore = $oneShotBefore
    oneShotAfter = $oneShotAfter
    recordBase = "0x$($recordBase.ToString('x8'))"
    recordStride = "0x$($recordStride.ToString('x'))"
    scannedRecords = $recordCount
    candidateCount = $candidates.Count
    patches = $patches
    patchedAt = (Get-Date).ToString("o")
  }

  $record | ConvertTo-Json -Depth 12 | Set-Content -Encoding UTF8 $recordPath
  $record | ConvertTo-Json -Depth 12
} finally {
  [CodexK0120Memory]::CloseHandle($handle) | Out-Null
}
