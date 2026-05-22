$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
New-Item -ItemType Directory -Force $renderDir | Out-Null

$slides = @(
@"
ASCO Hype - Day 1 Opening
Friday May 29, 7:00 AM CT test clock
Turn it up: first 15 minutes live
Conference-desk hype from the ASCO agenda spine
"@,
@"
Desk map: Day 1 is loaded
24 agenda sessions
67 timed oral abstract presentations
Pediatric Oncology leads the watch board
Every hot take stays review-gated
"@,
@"
Watch tracks lighting up
Pediatric Oncology
Medical Education and Professional Development
Care Delivery and Models of Care
Heme malignancies lymphoma and CLL
"@,
@"
First 15 minutes: launch mode
No session starts in this exact window
So we set the board, mark the rooms, cue the day
Verify rooms in the ASCO app and on-site signage
Audience tips are buzz until approved
"@,
@"
Tentpoles circled in red
1:00 PM CT: Hematologic Malignancies Lymphoma and CLL, E450a
1:00 PM CT: Lung Cancer NSCLC Metastatic, Hall D2
2:45 PM CT: Medical Education and Professional Development, E450b
No plenary session is scheduled for Day 1 in this index
"@,
@"
Audience loop: feed the desk
Tag #ASCOHype with coffee, snacks, poster-wall buzz, and media moments
We are watching OncLive, STAT News, The ASCO Post, X, and operator inputs
If it clears review, it can hit the stream
"@
)

for ($i = 0; $i -lt $slides.Count; $i++) {
  Set-Content -LiteralPath (Join-Path $renderDir "day1-opening-slide-$($i + 1).txt") -Value $slides[$i] -Encoding UTF8
}

$script = @"
ASCO Hype is interactive AI commentary only. It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice. ASCO Hype is not associated with the American Society of Clinical Oncology in any way.

All right, ASCO Hype, wake up the feed. This is the Day 1 opening desk, and for this production rehearsal we are setting the clock to Friday, May 29, seven o'clock Central Time. The doors are opening, the tabs are loaded, the agenda spine is hot, and the first fifteen minutes are about getting everybody locked in before the day starts throwing fastballs.

Here is the board. Day 1 is not empty. It is stacked. Twenty-four agenda sessions. Sixty-seven timed oral abstract presentations. Pediatric Oncology is leading the watch board. Medical Education and Professional Development is right behind it. Care Delivery and Models of Care is on the radar. And later today, Heme malignancies, lymphoma, and CLL gets a major afternoon spotlight.

Now, important desk call. The official ASCO program index does not show a session starting in this exact opening window. So we are not inventing drama. We are setting the room map. We are marking the watch tracks. We are getting the audience ready. Every abstract title signal stays provisional until primary sources and full text support it. Every social hit stays buzz until a human operator clears the framing.

Circle these tentpoles. One PM Central, Hematologic Malignancies, Lymphoma and CLL, room E450a. One PM Central, Lung Cancer, non-small cell metastatic, Hall D2. Two forty-five PM Central, Medical Education and Professional Development, room E450b. Say the rooms twice before you move, and still verify in the ASCO app and on-site signage, because conference rooms can change and nobody needs a hallway sprint for the wrong door.

And now the audience loop. If you see a coffee line worth knowing about, a snack table with real value, a poster-wall crowd forming, a media moment, a hallway tip, or a booth that is suddenly pulling attention, tag #ASCOHype. We are watching OncLive, STAT News, The ASCO Post, X, and operator-approved floor inputs. If it clears review, it can interrupt the stream.

That is the launch block. ASCO Hype is live, source-forward, fast-moving, and review-gated. Keep the dial here. The next schedule spine hit is coming up.

Reminder: ASCO Hype is interactive AI commentary only. It is not reporting, journalism, medical education, clinical guidance, scientific validation, legal advice, or financial advice.
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
