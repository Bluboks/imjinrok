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
$recordPath = Join-Path $logDir "$Marker-k01-defeat-state-$safeLabel.json"

if (!(Test-Path $markerPath)) {
  throw "Marker JSON not found: $markerPath"
}

Add-Type @"
using System;
using System.Runtime.InteropServices;

public static class CodexK01DefeatProbeMemory {
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

function Read-Memory {
  param(
    [IntPtr]$Handle,
    [int64]$Address,
    [int]$Size
  )

  $buffer = New-Object byte[] $Size
  $read = [UIntPtr]::Zero
  $ok = [CodexK01DefeatProbeMemory]::ReadProcessMemory($Handle, [IntPtr]$Address, $buffer, [uint32]$Size, [ref]$read)
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

function Get-HeroSummary {
  param(
    [byte[]]$RecordBytes,
    [int]$CurrentOwner,
    [int64]$RecordBase,
    [int]$RecordStride,
    [int]$RecordCount
  )

  $activeCount = 0
  $currentOwnerCount = 0
  $currentOwnerAliveHeroCheckCount = 0
  $heroes = @()
  $typeCounts = @{}

  for ($index = 0; $index -lt $RecordCount; $index += 1) {
    $offset = $index * $RecordStride
    $type = [int]$RecordBytes[$offset]
    $owner = [int]$RecordBytes[$offset + 1]
    $aliveCheckWord = [BitConverter]::ToInt16($RecordBytes, $offset + 0x07)
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
    }

    if (($type -eq 0x4c -or $type -eq 0x4e) -and $owner -eq ($CurrentOwner -band 0xff)) {
      if ($aliveCheckWord -gt 0) {
        $currentOwnerAliveHeroCheckCount += 1
      }

      $heroes += [ordered]@{
        index = $index
        address = "0x$(([int64]$RecordBase + $offset).ToString('x8'))"
        type = "0x$($type.ToString('x2'))"
        owner = $owner
        aliveCheckWord = $aliveCheckWord
        progress = $progress
        first128 = ConvertTo-HexString ([byte[]]($RecordBytes[$offset..($offset + 0x7f)]))
      }
    }
  }

  return [ordered]@{
    activeCount = $activeCount
    currentOwnerCount = $currentOwnerCount
    currentOwnerHeroCount = $heroes.Count
    currentOwnerAliveHeroCheckCount = $currentOwnerAliveHeroCheckCount
    typeCounts = $typeCounts
    currentOwnerHeroes = $heroes
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
$handle = [CodexK01DefeatProbeMemory]::OpenProcess(($PROCESS_VM_READ -bor $PROCESS_QUERY_INFORMATION), $false, [uint32]$targetPid)
if ($handle -eq [IntPtr]::Zero) {
  $lastError = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
  throw "OpenProcess failed for pid=$targetPid error=$lastError"
}

try {
  $ownerAddress = 0x00bccc44
  $victoryTimerAddress = 0x0084373c
  $defeatTimerAddress = 0x00843740
  $globalTickAddress = 0x00882e04
  $missionTickAddress = 0x007c5f80
  $defeatCodeAddress = 0x0048a812
  $defeatCodeSize = 0x70
  $resultGateAddress = 0x0048d6f0
  $resultGateSize = 0x50
  $recordBase = 0x0063528f
  $recordStride = 0x558
  $recordCount = 0x4b0
  $scanBytes = $recordStride * $recordCount

  $defeatCodeBytes = Read-Memory $handle $defeatCodeAddress $defeatCodeSize
  $resultGateBytes = Read-Memory $handle $resultGateAddress $resultGateSize

  $samplesOut = @()
  for ($sampleIndex = 0; $sampleIndex -lt $Samples; $sampleIndex += 1) {
    $currentOwner = [BitConverter]::ToInt16((Read-Memory $handle $ownerAddress 2), 0)
    $victoryTimer = [BitConverter]::ToInt32((Read-Memory $handle $victoryTimerAddress 4), 0)
    $defeatTimer = [BitConverter]::ToInt32((Read-Memory $handle $defeatTimerAddress 4), 0)
    $globalTick = [BitConverter]::ToInt32((Read-Memory $handle $globalTickAddress 4), 0)
    $missionTick = [BitConverter]::ToInt32((Read-Memory $handle $missionTickAddress 4), 0)
    $recordBytes = Read-Memory $handle $recordBase $scanBytes

    $samplesOut += [ordered]@{
      sample = $sampleIndex
      sampledAt = (Get-Date).ToString("o")
      currentOwner = $currentOwner
      victoryTimer = $victoryTimer
      defeatTimer = $defeatTimer
      globalTick = $globalTick
      missionTick = $missionTick
      defeatTimerDelta = if ($defeatTimer -ne 0) { [Math]::Abs($globalTick - $defeatTimer) } else { 0 }
      heroSummary = Get-HeroSummary $recordBytes $currentOwner $recordBase $recordStride $recordCount
    }

    if ($sampleIndex -lt ($Samples - 1)) {
      Start-Sleep -Milliseconds $DelayMilliseconds
    }
  }

  $observedDefeatTimerValues = @($samplesOut | ForEach-Object { $_.defeatTimer } | Where-Object { $_ -ne 0 } | Sort-Object -Unique)
  $status = if ($observedDefeatTimerValues.Count -gt 0) {
    "observed-k01-defeat-timer-set"
  } else {
    "observed-k01-defeat-timer-not-set"
  }

  $record = [ordered]@{
    marker = $Marker
    label = $Label
    status = $status
    method = "direct-process-memory-runtime-probe"
    targetPid = $targetPid
    processStartTime = $process.StartTime.ToString("o")
    defeatCodeAddress = "0x$($defeatCodeAddress.ToString('x8'))"
    defeatCodeFirstBytes = ConvertTo-HexString $defeatCodeBytes
    resultGateAddress = "0x$($resultGateAddress.ToString('x8'))"
    resultGateFirstBytes = ConvertTo-HexString $resultGateBytes
    recordBase = "0x$($recordBase.ToString('x8'))"
    recordStride = "0x$($recordStride.ToString('x'))"
    recordCount = $recordCount
    samples = $samplesOut
    recordedAt = (Get-Date).ToString("o")
  }

  $record | ConvertTo-Json -Depth 14 | Set-Content -Encoding UTF8 $recordPath
  $record | ConvertTo-Json -Depth 14
} finally {
  [CodexK01DefeatProbeMemory]::CloseHandle($handle) | Out-Null
}
