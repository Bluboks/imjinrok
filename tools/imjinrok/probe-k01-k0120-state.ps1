param(
  [Parameter(Mandatory = $true)]
  [string]$Marker,
  [string]$Label = "probe",
  [int]$Samples = 1,
  [int]$DelayMilliseconds = 500
)

$ErrorActionPreference = "Stop"

$logDir = "C:\rev\logs"
$markerPath = Join-Path $logDir "$Marker.json"
$safeLabel = $Label -replace '[^A-Za-z0-9_.-]+', '-'
$recordPath = Join-Path $logDir "$Marker-k01-k0120-state-$safeLabel.json"

if (!(Test-Path $markerPath)) {
  throw "Marker JSON not found: $markerPath"
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CodexK0120ProbeMemory {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(UInt32 desiredAccess, bool inheritHandle, UInt32 processId);

  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool ReadProcessMemory(IntPtr process, IntPtr baseAddress, byte[] buffer, UInt32 size, out UIntPtr bytesRead);

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

function ConvertTo-AsciiString {
  param([byte[]]$Bytes)

  $chars = @()
  foreach ($byte in $Bytes) {
    if ($byte -eq 0) {
      break
    }
    if ($byte -ge 0x20 -and $byte -le 0x7e) {
      $chars += [char]$byte
    } else {
      $chars += "."
    }
  }
  return -join $chars
}

function Read-Memory {
  param(
    [IntPtr]$Handle,
    [int64]$Address,
    [int]$Size
  )

  $buffer = New-Object byte[] $Size
  $read = [UIntPtr]::Zero
  $ok = [CodexK0120ProbeMemory]::ReadProcessMemory($Handle, [IntPtr]$Address, $buffer, [uint32]$Size, [ref]$read)
  if (!$ok -or $read.ToUInt64() -ne [uint64]$Size) {
    $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    throw "ReadProcessMemory failed at 0x$($Address.ToString('x')) size=$Size read=$($read.ToUInt64()) error=$lastError"
  }

  return $buffer
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

function Get-UnitSummary {
  param(
    [byte[]]$RecordBytes,
    [int]$CurrentOwner,
    [int64]$RecordBase,
    [int]$RecordStride,
    [int]$RecordCount
  )

  $activeCount = 0
  $currentOwnerCount = 0
  $currentOwnerBeaconFull = 0
  $currentOwnerBeaconAny = 0
  $typeCounts = @{}
  $currentOwnerSamples = @()
  $beaconSamples = @()

  for ($index = 0; $index -lt $RecordCount; $index += 1) {
    $offset = $index * $RecordStride
    $type = [int]$RecordBytes[$offset]
    $owner = [int]$RecordBytes[$offset + 1]
    $progress = [int]$RecordBytes[$offset + 0x55]

    if ($type -ne 0) {
      $activeCount += 1
      $typeKey = "0x$($type.ToString('x2'))"
      if (!$typeCounts.ContainsKey($typeKey)) {
        $typeCounts[$typeKey] = 0
      }
      $typeCounts[$typeKey] += 1
    }

    if ($owner -eq ($CurrentOwner -band 0xff) -and $type -ne 0) {
      $currentOwnerCount += 1
      if ($currentOwnerSamples.Count -lt 12) {
        $currentOwnerSamples += [ordered]@{
          index = $index
          address = "0x$(([int64]$RecordBase + $offset).ToString('x8'))"
          type = "0x$($type.ToString('x2'))"
          owner = $owner
          progress = $progress
        }
      }
    }

    if ($type -eq 0x34 -and $owner -eq ($CurrentOwner -band 0xff)) {
      $currentOwnerBeaconAny += 1
      if ($progress -eq 0x64) {
        $currentOwnerBeaconFull += 1
      }
      if ($beaconSamples.Count -lt 12) {
        $beaconSamples += [ordered]@{
          index = $index
          address = "0x$(([int64]$RecordBase + $offset).ToString('x8'))"
          owner = $owner
          progress = $progress
        }
      }
    }
  }

  return [ordered]@{
    activeCount = $activeCount
    currentOwnerCount = $currentOwnerCount
    currentOwnerBeaconAny = $currentOwnerBeaconAny
    currentOwnerBeaconFull = $currentOwnerBeaconFull
    typeCounts = $typeCounts
    currentOwnerSamples = $currentOwnerSamples
    beaconSamples = $beaconSamples
  }
}

$markerRecord = Get-Content $markerPath -Raw | ConvertFrom-Json
$targetPid = Get-TargetPid $markerRecord
$process = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if (!$process -or $process.ProcessName -ne "imjinrok2") {
  throw "Target process is not running as imjinrok2: pid=$targetPid"
}

$PROCESS_VM_READ = 0x0010
$PROCESS_QUERY_INFORMATION = 0x0400
$handle = [CodexK0120ProbeMemory]::OpenProcess(($PROCESS_VM_READ -bor $PROCESS_QUERY_INFORMATION), $false, [uint32]$targetPid)
if ($handle -eq [IntPtr]::Zero) {
  $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed for pid=$targetPid error=$lastError"
}

try {
  $ownerAddress = 0x00bccc44
  $oneShotAddress = 0x008438dc
  $tickAddress = 0x007c5f80
  $scriptEngineAddress = 0x00bcbe08
  $k0120CodeAddress = 0x0048a731
  $k0120CodeSize = 0xc8
  $k0120ScriptPathAddress = 0x004c2f38
  $recordBase = 0x0063528f
  $recordStride = 0x558
  $recordCount = 0x4b0
  $scanBytes = $recordStride * $recordCount

  $codeBytes = Read-Memory $handle $k0120CodeAddress $k0120CodeSize
  $scriptPathBytes = Read-Memory $handle $k0120ScriptPathAddress 0x20

  $samplesOut = @()
  for ($sampleIndex = 0; $sampleIndex -lt $Samples; $sampleIndex += 1) {
    $currentOwnerBytes = Read-Memory $handle $ownerAddress 2
    $currentOwner = [BitConverter]::ToInt16($currentOwnerBytes, 0)
    $oneShot = [BitConverter]::ToInt16((Read-Memory $handle $oneShotAddress 2), 0)
    $tick = [BitConverter]::ToInt32((Read-Memory $handle $tickAddress 4), 0)
    $scriptEngine = [BitConverter]::ToInt32((Read-Memory $handle $scriptEngineAddress 4), 0)
    $recordBytes = Read-Memory $handle $recordBase $scanBytes

    $samplesOut += [ordered]@{
      sample = $sampleIndex
      sampledAt = (Get-Date).ToString("o")
      currentOwnerAddress = "0x$($ownerAddress.ToString('x8'))"
      currentOwner = $currentOwner
      oneShotAddress = "0x$($oneShotAddress.ToString('x8'))"
      oneShot = $oneShot
      tickAddress = "0x$($tickAddress.ToString('x8'))"
      tick = $tick
      scriptEngineAddress = "0x$($scriptEngineAddress.ToString('x8'))"
      scriptEngine = "0x$($scriptEngine.ToString('x8'))"
      unitSummary = Get-UnitSummary $recordBytes $currentOwner $recordBase $recordStride $recordCount
    }

    if ($sampleIndex -lt ($Samples - 1)) {
      Start-Sleep -Milliseconds $DelayMilliseconds
    }
  }

  $observedOneShotValues = @($samplesOut | ForEach-Object { $_.oneShot } | Sort-Object -Unique)
  $status = if ($observedOneShotValues -contains 1) {
    "observed-k0120-one-shot-set"
  } else {
    "observed-k0120-one-shot-not-set"
  }

  $record = [ordered]@{
    marker = $Marker
    label = $Label
    status = $status
    method = "direct-process-memory-runtime-probe"
    targetPid = $targetPid
    processStartTime = $process.StartTime.ToString("o")
    k0120CodeAddress = "0x$($k0120CodeAddress.ToString('x8'))"
    k0120CodeFirstBytes = ConvertTo-HexString $codeBytes
    k0120ScriptPathAddress = "0x$($k0120ScriptPathAddress.ToString('x8'))"
    k0120ScriptPathBytes = ConvertTo-HexString $scriptPathBytes
    k0120ScriptPathAscii = ConvertTo-AsciiString $scriptPathBytes
    recordBase = "0x$($recordBase.ToString('x8'))"
    recordStride = "0x$($recordStride.ToString('x'))"
    recordCount = $recordCount
    samples = $samplesOut
    recordedAt = (Get-Date).ToString("o")
  }

  $record | ConvertTo-Json -Depth 14 | Set-Content -Encoding UTF8 $recordPath
  $record | ConvertTo-Json -Depth 14
} finally {
  [CodexK0120ProbeMemory]::CloseHandle($handle) | Out-Null
}
