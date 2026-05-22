$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
$recordingsDir = Join-Path $renderDir "recordings"
$wavPath = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.wav"
$mp3Path = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.mp3"
$trimmedPath = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.trimmed.mp3"

New-Item -ItemType Directory -Force $recordingsDir | Out-Null

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue

py -3.12 (Join-Path $root "scripts\generate-kokoro-dj-voice.py") --output $wavPath

& $ffmpeg -hide_banner -loglevel error -y -i $wavPath `
  -af "volume=0.94,equalizer=f=120:t=q:w=1:g=1.8,equalizer=f=3100:t=q:w=1:g=1.1,acompressor=threshold=-22dB:ratio=2.0:attack=10:release=90,alimiter=limit=0.94" `
  -t 60 `
  -c:a libmp3lame -b:a 128k $trimmedPath

Move-Item -LiteralPath $trimmedPath -Destination $mp3Path -Force
Copy-Item -LiteralPath $mp3Path -Destination (Join-Path $renderDir "day1-opening-voice.mp3") -Force
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue
Write-Host "Open-source Kokoro DJ recording generated: $mp3Path"
