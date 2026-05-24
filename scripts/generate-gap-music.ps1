$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$musicDir = Join-Path $root "public\music"
$tmpDir = Join-Path $root ".tmp"
$outputPath = Join-Path $musicDir "conferencehype-gap-music-6min-v3.mp3"
$stingerPath = Join-Path $tmpDir "conferencehype-stinger.wav"

New-Item -ItemType Directory -Force $musicDir | Out-Null
New-Item -ItemType Directory -Force $tmpDir | Out-Null

py -3.12 (Join-Path $root "scripts\generate-kokoro-dj-voice.py") --mode stinger --voice am_adam --output $stingerPath

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
if (!(Test-Path $ffmpeg)) {
  $ffmpeg = "ffmpeg"
}

$delays = @(18, 108, 198, 288)
$stingers = @()
for ($i = 0; $i -lt $delays.Count; $i++) {
  $ms = $delays[$i] * 1000
  $stingers += "[5:a]volume=1.15,adelay=$ms|$ms,apad[s$i]"
}
$stingerLabels = (0..($delays.Count - 1) | ForEach-Object { "[s$_]" }) -join ""

$filter = @"
[0:a]volume=1.18[kick];
[1:a]volume=1.02,lowpass=f=180[bass];
[2:a]volume=0.32,lowpass=f=900[pad];
[3:a]volume=0.055,highpass=f=5200,lowpass=f=9200[hatair];
[4:a]volume=0.20,lowpass=f=260[lowdrive];
$($stingers -join ";");
[kick][bass][pad][hatair][lowdrive]$stingerLabels amix=inputs=9:duration=longest:normalize=0,acompressor=threshold=-13dB:ratio=2.4:attack=10:release=180,alimiter=limit=0.93,afade=t=in:st=0:d=2,afade=t=out:st=356:d=4[out]
"@

& $ffmpeg -y `
  -f lavfi -i "aevalsrc=0.95*sin(2*PI*52*t)*exp(-mod(t\,0.50)*18):d=360:s=44100" `
  -f lavfi -i "aevalsrc=0.52*sin(2*PI*(65+16*gt(mod(t\,4)\,2))*t)*(0.55+0.45*sin(2*PI*0.125*t)):d=360:s=44100" `
  -f lavfi -i "aevalsrc=(sin(2*PI*146.83*t)+0.8*sin(2*PI*185*t)+0.55*sin(2*PI*220*t))*(0.38+0.22*sin(2*PI*0.04*t)):d=360:s=44100" `
  -f lavfi -i "anoisesrc=d=360:c=pink:r=44100" `
  -f lavfi -i "aevalsrc=0.38*sin(2*PI*39*t)*(0.45+0.55*gt(mod(t\,2)\,1)):d=360:s=44100" `
  -i $stingerPath `
  -filter_complex $filter `
  -map "[out]" `
  -t 360 `
  -ar 44100 `
  -ac 2 `
  -c:a libmp3lame `
  -b:a 192k `
  $outputPath

Write-Host "Generated gap music: $outputPath"
