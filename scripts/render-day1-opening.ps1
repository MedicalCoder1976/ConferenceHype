$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
$recordingsDir = Join-Path $renderDir "recordings"
New-Item -ItemType Directory -Force $renderDir | Out-Null
New-Item -ItemType Directory -Force $recordingsDir | Out-Null

$durationSeconds = if ($env:INTRO_DURATION_SECONDS) { [int]$env:INTRO_DURATION_SECONDS } else { 180 }
$slideSeconds = [int]($durationSeconds / 6)

$slides = @(
@"
TumorCrusher on the desk
ASCO 2026 is ON
Friday May 29, 7:00 AM CT test clock
Fenrir schedule desk
Marisol Latina DJ
Rebecca reporter desk
AussieOnc global hype
Adam social desk
"@,
@"
Hourly voice cycle
Fenrir / Marisol / Rebecca / Jax
AussieOnc / Maya / Cole / Adam
Fresh booth energy every hour
Saved audio for reruns
"@,
@"
Disease desks assigned
Breast / Lung / GU / Gyn / Skin
Colorectal / Upper GI / Hepatobiliary
CNS / Endocrine / Soft Tissue
"@,
@"
Marisol and Rebecca
Latina DJ hype
Poster wall motion
Media desk signals
Source-labeled handoffs
"@,
@"
Jax, Maya, and Cole
US hourly rotation voices
Science-to-signal reads
Prime-time and late-hour handoffs
Keep the facts clean
"@,
@"
Adam reads the feed
Coffee lines. Snack wins. Poster crowds.
Media moments. Hallway buzz.
Tag #ASCOHype
If it clears review, it hits the stream
"@
)

for ($i = 0; $i -lt $slides.Count; $i++) {
  Set-Content -LiteralPath (Join-Path $renderDir "day1-opening-slide-$($i + 1).txt") -Value $slides[$i] -Encoding UTF8
}

$script = @"
Fenrir on the TumorCrusher schedule desk. Ask-oh 2026 Day 1 is live, and the hourly cycle is loading.

Thanks, Fenrir. Marisol Vega is on the Latina DJ desk with the volume up. Thanks, Marisol. Rebecca has the reporter pulse. Thanks, Rebecca. Jax Rivers is on the U.S. prime-time desk. Thanks, Jax. AussieOnc has the global hype. Thanks, AussieOnc. Maya Steele has the science-to-signal read. Thanks, Maya. Cole Maddox takes the late-hour handoff. Thanks, Cole. Adam reads the social feed with the sarcasm calibrated.

Every hour, rotate the booth. Schedule check. Disease desk. Social hit. Source check. If it is official, we anchor it. If it is buzz, we badge it.

The disease reporters are assigned: breast, lung, G U, G Y N, skin, colorectal, upper G I and hepatobiliary, CNS, endocrine, and soft tissue.

Nova has breast. Kai has lung. Diego has G U. Amara has G Y N. Miles has skin. Sofia has colorectal. Benji has upper G I and hepatobiliary. Elena has CNS. Grant has endocrine. Talia has soft tissue.

Ask-oh pronunciation check: we say Ask-oh as one word in spoken scripts, not A S C O as letters.

Adam on social. Coffee line, snack win, poster crowd, media moment, hallway buzz: tag #ASCOHype. If it clears review, it can hit the stream. Ask-oh Hype is interactive AI commentary only, not official reporting or medical advice. TumorCrusher here. Ask-oh 2026 Day 1 is on.
"@

$scriptPath = Join-Path $renderDir "day1-opening-script.txt"
$voicePath = Join-Path $renderDir "day1-opening-voice.mp3"
$preferredCacheFile = if ($env:INTRO_VOICE_CACHE) { $env:INTRO_VOICE_CACHE } else { "tumorcrusher-hourly-cycle-voices-day1-v1.mp3" }
$cachedVoicePath = Join-Path $recordingsDir $preferredCacheFile
$paidVoicePath = Join-Path $recordingsDir "tumorcrusher-tyler-cruz-day1-intro-v1.mp3"
$outputPath = Join-Path $renderDir "fallback-loop.mp4"
$previewPath = Join-Path $renderDir "fallback-loop-preview.png"

Set-Content -LiteralPath $scriptPath -Value $script -Encoding UTF8

if (Test-Path -LiteralPath $cachedVoicePath) {
  Copy-Item -LiteralPath $cachedVoicePath -Destination $voicePath -Force
}

if ((Test-Path -LiteralPath $paidVoicePath) -and !(Test-Path -LiteralPath $voicePath)) {
  Copy-Item -LiteralPath $paidVoicePath -Destination $voicePath -Force
}

if (!(Test-Path -LiteralPath $voicePath)) {
  throw "Missing $voicePath. Generate a free cached recording with scripts\generate-free-dj-voice.ps1, or save a paid recording to $cachedVoicePath before rendering reruns."
}

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
function Escape-DrawText([string]$value) {
  return $value.Replace("\", "\\").Replace(":", "\:").Replace("'", "\'").Replace("%", "\%")
}

$slideFilters = @()
for ($i = 0; $i -lt $slides.Count; $i++) {
  $fontsize = @(44, 42, 38, 40, 34, 36)[$i]
  $y = @(150, 150, 130, 150, 145, 155)[$i]
  $chain = "[$i`:v]"
  $lines = $slides[$i] -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 }
  for ($lineIndex = 0; $lineIndex -lt $lines.Count; $lineIndex++) {
    $line = Escape-DrawText($lines[$lineIndex].Trim())
    $color = if ($lineIndex -eq 0) { "white" } elseif ($lineIndex -eq 1) { "0xffcf5a" } else { "0xe8edf5" }
    $lineY = $y + ($lineIndex * ($fontsize + 18))
    $chain += "drawtext=font='Arial':text='$line':x=70:y=$lineY`:fontsize=$fontsize`:fontcolor=$color,"
  }
  $chain += "drawbox=x=0:y=0:w=1280:h=16:color=0xf4483a@1:t=fill,drawbox=x=0:y=704:w=1280:h=16:color=0x33d6c5@1:t=fill[v$i]"
  $slideFilters += $chain
}
$filter = ($slideFilters -join ";") + ";[v0][v1][v2][v3][v4][v5]concat=n=6:v=1:a=0[v]"

& $ffmpeg -y `
  -f lavfi -i "color=c=0x11151f:s=1280x720:r=30:d=$slideSeconds" `
  -f lavfi -i "color=c=0x151a27:s=1280x720:r=30:d=$slideSeconds" `
  -f lavfi -i "color=c=0x101722:s=1280x720:r=30:d=$slideSeconds" `
  -f lavfi -i "color=c=0x171925:s=1280x720:r=30:d=$slideSeconds" `
  -f lavfi -i "color=c=0x11151f:s=1280x720:r=30:d=$slideSeconds" `
  -f lavfi -i "color=c=0x151a27:s=1280x720:r=30:d=$slideSeconds" `
  -i $voicePath `
  -filter_complex $filter `
  -map "[v]" -map "6:a" `
  -t $durationSeconds `
  -c:v libx264 -preset veryfast -pix_fmt yuv420p `
  -c:a aac -b:a 128k `
  -shortest $outputPath

& $ffmpeg -y -i $outputPath -frames:v 1 -update 1 $previewPath
Write-Host "Rendered fallback loop: $outputPath"
