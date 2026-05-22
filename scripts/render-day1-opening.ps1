$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
$recordingsDir = Join-Path $renderDir "recordings"
New-Item -ItemType Directory -Force $renderDir | Out-Null
New-Item -ItemType Directory -Force $recordingsDir | Out-Null

$durationSeconds = 180
$slideSeconds = [int]($durationSeconds / 6)

$slides = @(
@"
TumorCrusher on the desk
ASCO 2026 is ON
Friday May 29, 7:00 AM CT test clock
One-minute channel intro
Three voice open-source booth test
"@,
@"
Day 1 is not a warm-up
24 agenda sessions
67 timed oral abstract presentations
Pediatric Oncology leads the board
Medical Ed is right behind it
"@,
@"
Tracks lighting up
Pediatric Oncology
Medical Education
Care Delivery
Lymphoma and CLL
"@,
@"
Opening window: launch mode
No session starts in this exact window
That is the ramp
Set the map
Then the day starts moving
"@,
@"
Circle the afternoon hits
1:00 PM CT: Lymphoma and CLL, E450a
1:00 PM CT: Lung Cancer NSCLC Metastatic, Hall D2
2:45 PM CT: Medical Education, E450b
Verify rooms before moving
"@,
@"
Feed the desk
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
TumorCrusher on the ASCO Hype desk. ASCO 2026 is live on the board, and Day 1 is not a warm-up. It is seven o'clock Central on Friday, May 29. This is the one-minute lock-in.

Quick hits. Twenty-four agenda sessions. Sixty-seven timed oral abstract presentations. Pediatric Oncology leads the early watch board. Medical Education is right behind it.

No session starts inside this exact opening window. That makes this the ramp: set the map, mark the rooms, then move when the day moves.

Circle one PM Central: Lymphoma and CLL in E450a, metastatic non-small cell lung cancer in Hall D2, and two forty-five for Medical Education in E450b. Verify rooms before walking.

Coffee line, snack win, poster crowd, media moment, hallway buzz: tag #ASCOHype. If it clears review, it can hit the stream. ASCO Hype is interactive AI commentary only, not official reporting or medical advice. TumorCrusher here. ASCO 2026 Day 1 is on.
"@

$scriptPath = Join-Path $renderDir "day1-opening-script.txt"
$voicePath = Join-Path $renderDir "day1-opening-voice.mp3"
$preferredCacheFile = if ($env:INTRO_VOICE_CACHE) { $env:INTRO_VOICE_CACHE } else { "tumorcrusher-free-dj-day1-intro-v1.mp3" }
$cachedVoicePath = Join-Path $recordingsDir $preferredCacheFile
$paidVoicePath = Join-Path $recordingsDir "tumorcrusher-tyler-cruz-day1-intro-v1.mp3"
$outputPath = Join-Path $renderDir "fallback-loop.mp4"
$previewPath = Join-Path $renderDir "fallback-loop-preview.png"

Set-Content -LiteralPath $scriptPath -Value $script -Encoding UTF8

if ((Test-Path -LiteralPath $cachedVoicePath) -and !(Test-Path -LiteralPath $voicePath)) {
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
