$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
$recordingsDir = Join-Path $renderDir "recordings"
$wavPath = Join-Path $recordingsDir "tumorcrusher-fenrir-adam-day1-run-v1.wav"
$mp3Path = Join-Path $recordingsDir "tumorcrusher-fenrir-adam-day1-run-v1.mp3"
$trimmedPath = Join-Path $recordingsDir "tumorcrusher-fenrir-adam-day1-run-v1.trimmed.mp3"
$voices = @("am_fenrir", "am_adam")
$standardVoiceFilter = "volume=0.94,equalizer=f=120:t=q:w=1:g=1.8,equalizer=f=3100:t=q:w=1:g=1.1,acompressor=threshold=-22dB:ratio=2.0:attack=10:release=90,alimiter=limit=0.94"
$adamVoiceFilter = "volume=1.0,equalizer=f=75:t=q:w=1:g=3.4,equalizer=f=135:t=q:w=1:g=2.4,equalizer=f=2800:t=q:w=1:g=1.3,acompressor=threshold=-25dB:ratio=2.8:attack=6:release=120,alimiter=limit=0.93"
$combinedFilter = "volume=0.96,equalizer=f=90:t=q:w=1:g=2.2,equalizer=f=135:t=q:w=1:g=1.4,equalizer=f=3100:t=q:w=1:g=1.1,acompressor=threshold=-23dB:ratio=2.2:attack=8:release=100,alimiter=limit=0.94"

New-Item -ItemType Directory -Force $recordingsDir | Out-Null

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue

py -3.12 (Join-Path $root "scripts\generate-kokoro-dj-voice.py") --mode lineup --output $wavPath --voices ($voices -join ",") --recordings-dir $recordingsDir

& $ffmpeg -hide_banner -loglevel error -y -i $wavPath `
  -af $combinedFilter `
  -c:a libmp3lame -b:a 128k $trimmedPath

Move-Item -LiteralPath $trimmedPath -Destination $mp3Path -Force

foreach ($voiceName in $voices) {
  $voiceWav = Join-Path $recordingsDir "tumorcrusher-kokoro-$voiceName-minute-v1.wav"
  $voiceMp3 = Join-Path $recordingsDir "tumorcrusher-kokoro-$voiceName-minute-v1.mp3"
  if (Test-Path -LiteralPath $voiceWav) {
    $voiceFilter = if ($voiceName -eq "am_adam") { $adamVoiceFilter } else { $standardVoiceFilter }
    & $ffmpeg -hide_banner -loglevel error -y -i $voiceWav `
      -af $voiceFilter `
      -c:a libmp3lame -b:a 128k $voiceMp3
    Remove-Item -LiteralPath $voiceWav -Force -ErrorAction SilentlyContinue
  }
}

Copy-Item -LiteralPath $mp3Path -Destination (Join-Path $renderDir "day1-opening-voice.mp3") -Force
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue
Write-Host "Open-source Kokoro Fenrir schedule / Adam social recording generated: $mp3Path"
