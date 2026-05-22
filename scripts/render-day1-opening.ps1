$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
New-Item -ItemType Directory -Force $renderDir | Out-Null

$slides = @(
@"
Echo Sage on the desk
ASCO 2026 is ON
Friday May 29, 7:00 AM CT test clock
Day 1 starts loud
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
Echo Sage on the ASCO Hype desk. ASCO 2026 is live on the board, and Day 1 is not a warm-up. It is seven o'clock Central on Friday, May 29, and this is the first fifteen. Quick hits. Fast map. No fake certainty.

Here is the signal. Twenty-four agenda sessions. Sixty-seven timed oral abstract presentations. Pediatric Oncology leads the watch board. Medical Education is right behind it. Care Delivery is awake early. Lymphoma and CLL has afternoon heat.

The setup matters: the official ASCO program index does not show a session starting inside this exact opening window. Translation: this is the ramp. The room map. The watch list. The part where you get oriented before the day starts moving.

Now circle the hits. One PM Central: Hematologic Malignancies, Lymphoma and CLL, room E450a. One PM Central: Lung Cancer, non-small cell metastatic, Hall D2. Two forty-five Central: Medical Education and Professional Development, room E450b. Rooms can change, so verify in the ASCO app and on-site signage before you make the walk.

Audience desk, this is your lane. Coffee line with a real wait? Snack table doing numbers? Poster wall starting to pull a crowd? Media moment forming? Tag #ASCOHype. If it is useful, and if it clears review, it can hit the stream.

One clean reminder before we move: ASCO Hype is interactive AI commentary only. It is not associated with the American Society of Clinical Oncology. It is not medical advice, clinical guidance, scientific validation, legal advice, financial advice, or official reporting.

Echo Sage here, keeping the dial up. ASCO 2026 Day 1 is on. The board is set. The next hit is coming.
"@

$scriptPath = Join-Path $renderDir "day1-opening-script.txt"
$voicePath = Join-Path $renderDir "day1-opening-voice.mp3"
$outputPath = Join-Path $renderDir "fallback-loop.mp4"
$previewPath = Join-Path $renderDir "fallback-loop-preview.png"

Set-Content -LiteralPath $scriptPath -Value $script -Encoding UTF8

if (!(Test-Path -LiteralPath $voicePath)) {
  throw "Missing $voicePath. Generate it with the configured TTS provider before rendering."
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
  -f lavfi -i "color=c=0x11151f:s=1280x720:r=30:d=150" `
  -f lavfi -i "color=c=0x151a27:s=1280x720:r=30:d=150" `
  -f lavfi -i "color=c=0x101722:s=1280x720:r=30:d=150" `
  -f lavfi -i "color=c=0x171925:s=1280x720:r=30:d=150" `
  -f lavfi -i "color=c=0x11151f:s=1280x720:r=30:d=150" `
  -f lavfi -i "color=c=0x151a27:s=1280x720:r=30:d=150" `
  -stream_loop -1 -i $voicePath `
  -filter_complex $filter `
  -map "[v]" -map "6:a" `
  -t 900 `
  -c:v libx264 -preset veryfast -pix_fmt yuv420p `
  -c:a aac -b:a 128k `
  -shortest $outputPath

& $ffmpeg -y -i $outputPath -frames:v 1 -update 1 $previewPath
& $ffmpeg -hide_banner -i $outputPath
