$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$musicDir = Join-Path $root "public\music"
$tmpDir = Join-Path $root ".tmp"
$durationSeconds = if ($env:GAP_MUSIC_SECONDS) { [int]$env:GAP_MUSIC_SECONDS } else { 360 }
$version = if ($durationSeconds -le 20) { "20sec-preview-v2" } else { "6min-v4" }
$outputPath = Join-Path $musicDir "conferencehype-gap-music-$version.mp3"
$stingerPath = Join-Path $tmpDir "conferencehype-stinger.wav"

New-Item -ItemType Directory -Force $musicDir | Out-Null
New-Item -ItemType Directory -Force $tmpDir | Out-Null

py -3.12 (Join-Path $root "scripts\generate-kokoro-dj-voice.py") --mode stinger --voice am_adam --output $stingerPath

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
if (!(Test-Path $ffmpeg)) {
  $ffmpeg = "ffmpeg"
}

$delays = if ($durationSeconds -le 20) { @(6) } else { @(18, 108, 198, 288) }
$stingers = @()
for ($i = 0; $i -lt $delays.Count; $i++) {
  $ms = $delays[$i] * 1000
  $stingers += "[7:a]volume=1.10,adelay=$ms|$ms,apad[s$i]"
}
$stingerLabels = (0..($delays.Count - 1) | ForEach-Object { "[s$_]" }) -join ""
$inputCount = 7 + $delays.Count

$filter = @"
[0:a]volume=1.16,lowpass=f=130[kick];
[1:a]volume=1.22,lowpass=f=105[sub];
[2:a]volume=0.72,lowpass=f=230[bassline];
[3:a]volume=0.18,lowpass=f=780[pad];
[4:a]volume=0.05,highpass=f=5200,lowpass=f=9600[hatair];
[5:a]volume='if(between(mod(t\,1)\,0.48\,0.60)\,0.25\,0)':eval=frame,highpass=f=900,lowpass=f=5200[clap];
[6:a]volume=0.18,lowpass=f=250[lowdrive];
$($stingers -join ";");
[kick][sub][bassline][pad][hatair][clap][lowdrive]$stingerLabels amix=inputs=${inputCount}:duration=longest:normalize=0,acompressor=threshold=-12dB:ratio=2.2:attack=8:release=180,alimiter=limit=0.94,afade=t=in:st=0:d=1,afade=t=out:st=$($durationSeconds - 2):d=2[out]
"@

& $ffmpeg -y `
  -f lavfi -i "aevalsrc=(sin(2*PI*47*t)+0.42*sin(2*PI*94*t))*exp(-mod(t\,0.50)*24):d=${durationSeconds}:s=44100" `
  -f lavfi -i "aevalsrc=sin(2*PI*(39+5*gt(mod(t\,2)\,1))*t)*(0.70+0.30*gt(mod(t\,0.50)\,0.18)):d=${durationSeconds}:s=44100" `
  -f lavfi -i "aevalsrc=sin(2*PI*(78+12*gt(mod(t\,4)\,2)+7*gt(mod(t\,1)\,0.5))*t)*(0.42+0.58*gt(mod(t\,0.50)\,0.24)):d=${durationSeconds}:s=44100" `
  -f lavfi -i "aevalsrc=(sin(2*PI*146.83*t)+0.65*sin(2*PI*196*t)+0.45*sin(2*PI*246.94*t))*(0.28+0.18*sin(2*PI*0.04*t)):d=${durationSeconds}:s=44100" `
  -f lavfi -i "anoisesrc=d=${durationSeconds}:c=pink:r=44100" `
  -f lavfi -i "anoisesrc=d=${durationSeconds}:c=white:r=44100" `
  -f lavfi -i "aevalsrc=sin(2*PI*31*t)*(0.40+0.60*gt(mod(t\,2)\,1)):d=${durationSeconds}:s=44100" `
  -i $stingerPath `
  -filter_complex $filter `
  -map "[out]" `
  -t $durationSeconds `
  -ar 44100 `
  -ac 2 `
  -c:a libmp3lame `
  -b:a 192k `
  $outputPath

Write-Host "Generated gap music: $outputPath"
