$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
$recordingsDir = Join-Path $renderDir "recordings"
$scriptPath = Join-Path $renderDir "day1-opening-script.txt"
$wavPath = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.wav"
$mp3Path = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.mp3"
$trimmedPath = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.trimmed.mp3"

New-Item -ItemType Directory -Force $recordingsDir | Out-Null

if (!(Test-Path -LiteralPath $scriptPath)) {
  $renderScript = Get-Content (Join-Path $root "scripts\render-day1-opening.ps1") -Raw
  $match = [regex]::Match($renderScript, '(?s)\$script = @"\r?\n(.*?)\r?\n"@')
  if (!$match.Success) {
    throw "Could not extract intro script from scripts\render-day1-opening.ps1"
  }
  Set-Content -LiteralPath $scriptPath -Value $match.Groups[1].Value -Encoding UTF8
}

$script = (Get-Content -LiteralPath $scriptPath -Raw).Trim()
$voice = New-Object -ComObject SAPI.SpVoice
$stream = New-Object -ComObject SAPI.SpFileStream
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue
$stream.Open($wavPath, 3, $false)
$voice.AudioOutputStream = $stream
$voice.Rate = 4
$voice.Volume = 100
[void]$voice.Speak($script, 0)
$stream.Close()

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
& $ffmpeg -y -i $wavPath `
  -af "volume=0.82,atempo=1.06,equalizer=f=180:t=q:w=1:g=2,equalizer=f=2800:t=q:w=1:g=1.5,acompressor=threshold=-18dB:ratio=2.5:attack=8:release=80" `
  -t 60 `
  -c:a libmp3lame -b:a 128k $trimmedPath

Move-Item -LiteralPath $trimmedPath -Destination $mp3Path -Force
Copy-Item -LiteralPath $mp3Path -Destination (Join-Path $renderDir "day1-opening-voice.mp3") -Force
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue
Write-Host "Free DJ recording generated: $mp3Path"
