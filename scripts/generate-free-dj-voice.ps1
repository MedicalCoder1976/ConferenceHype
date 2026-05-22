$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$renderDir = Join-Path $root "public\rendered"
$recordingsDir = Join-Path $renderDir "recordings"
$scriptPath = Join-Path $renderDir "day1-opening-script.txt"
$wavPath = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.wav"
$mp3Path = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.mp3"
$trimmedPath = Join-Path $recordingsDir "tumorcrusher-free-dj-day1-intro-v1.trimmed.mp3"
$takeDir = Join-Path $recordingsDir "free-dj-take"

New-Item -ItemType Directory -Force $recordingsDir | Out-Null

if (!(Test-Path -LiteralPath $scriptPath)) {
  $renderScript = Get-Content (Join-Path $root "scripts\render-day1-opening.ps1") -Raw
  $match = [regex]::Match($renderScript, '(?s)\$script = @"\r?\n(.*?)\r?\n"@')
  if (!$match.Success) {
    throw "Could not extract intro script from scripts\render-day1-opening.ps1"
  }
  Set-Content -LiteralPath $scriptPath -Value $match.Groups[1].Value -Encoding UTF8
}

$performanceLines = @(
  @{ Rate = 2; Pitch = 1.02; Pause = 180; Text = "TumorCrusher on the ASCO Hype desk." },
  @{ Rate = 2; Pitch = 1.10; Pause = 360; Text = "ASCO 2026 is live, and Day 1 is not a warm-up." },
  @{ Rate = 1; Pitch = 0.98; Pause = 300; Text = "Seven o'clock Central, Friday May 29." },
  @{ Rate = 2; Pitch = 1.06; Pause = 420; Text = "This is the one-minute lock-in." },
  @{ Rate = 3; Pitch = 1.12; Pause = 180; Text = "Quick hits." },
  @{ Rate = 2; Pitch = 1.01; Pause = 180; Text = "Twenty-four agenda sessions." },
  @{ Rate = 2; Pitch = 1.04; Pause = 220; Text = "Sixty-seven timed oral abstract presentations." },
  @{ Rate = 1; Pitch = 1.06; Pause = 320; Text = "Pediatric Oncology and Medical Education lead the board." },
  @{ Rate = 1; Pitch = 0.96; Pause = 260; Text = "This opening window is the ramp." },
  @{ Rate = 3; Pitch = 1.07; Pause = 120; Text = "Set the map." },
  @{ Rate = 3; Pitch = 1.03; Pause = 120; Text = "Mark the rooms." },
  @{ Rate = 3; Pitch = 1.10; Pause = 320; Text = "Move when the day moves." },
  @{ Rate = 1; Pitch = 1.03; Pause = 200; Text = "Circle one PM Central." },
  @{ Rate = 1; Pitch = 0.99; Pause = 200; Text = "Lymphoma and CLL in E450a." },
  @{ Rate = 1; Pitch = 0.99; Pause = 200; Text = "Metastatic non-small cell lung cancer in Hall D2." },
  @{ Rate = 1; Pitch = 1.01; Pause = 280; Text = "Then two forty-five for Medical Education in E450b." },
  @{ Rate = 0; Pitch = 0.94; Pause = 360; Text = "Verify rooms before walking." },
  @{ Rate = 3; Pitch = 1.08; Pause = 110; Text = "Coffee line." },
  @{ Rate = 3; Pitch = 1.12; Pause = 110; Text = "Snack win." },
  @{ Rate = 3; Pitch = 1.06; Pause = 110; Text = "Poster crowd." },
  @{ Rate = 3; Pitch = 1.11; Pause = 260; Text = "Hallway buzz." },
  @{ Rate = 2; Pitch = 1.07; Pause = 280; Text = "Tag hashtag ASCO Hype." },
  @{ Rate = 0; Pitch = 0.98; Pause = 260; Text = "If it clears review, it can hit the stream." },
  @{ Rate = 0; Pitch = 0.94; Pause = 240; Text = "Interactive AI commentary only. Not official reporting or medical advice." },
  @{ Rate = 2; Pitch = 1.12; Pause = 0; Text = "TumorCrusher here. ASCO 2026 Day 1 is on." }
)

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
Remove-Item -LiteralPath $takeDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $takeDir | Out-Null
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue

$voice = New-Object -ComObject SAPI.SpVoice
$concatFiles = @()
$sampleRate = 22050

for ($i = 0; $i -lt $performanceLines.Count; $i++) {
  $line = $performanceLines[$i]
  $rawPhrase = Join-Path $takeDir ("phrase-{0:D2}-raw.wav" -f $i)
  $phrase = Join-Path $takeDir ("phrase-{0:D2}.wav" -f $i)
  $stream = New-Object -ComObject SAPI.SpFileStream
  $stream.Open($rawPhrase, 3, $false)
  $voice.AudioOutputStream = $stream
  $voice.Rate = $line.Rate
  $voice.Volume = 100
  [void]$voice.Speak($line.Text, 0)
  $stream.Close()

  $pitchRate = [int]($sampleRate * $line.Pitch)
  $tempo = [Math]::Round(1 / $line.Pitch, 4)
  & $ffmpeg -hide_banner -loglevel error -y -i $rawPhrase `
    -af "asetrate=$pitchRate,aresample=$sampleRate,atempo=$tempo,volume=0.95" `
    -ar $sampleRate -ac 1 $phrase | Out-Null
  $concatFiles += $phrase

  if ($line.Pause -gt 0) {
    $silence = Join-Path $takeDir ("silence-{0:D2}.wav" -f $i)
    $pauseSeconds = [Math]::Round($line.Pause / 1000, 3)
    & $ffmpeg -hide_banner -loglevel error -y -f lavfi -i "anullsrc=r=$sampleRate`:cl=mono" -t $pauseSeconds $silence | Out-Null
    $concatFiles += $silence
  }
}

$concatPath = Join-Path $takeDir "concat.txt"
Set-Content -LiteralPath $concatPath -Value (($concatFiles | ForEach-Object {
  "file '$($_.Replace("\", "/").Replace("'", "'\''"))'"
}) -join "`n") -Encoding ASCII

& $ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i $concatPath -c copy $wavPath

& $ffmpeg -hide_banner -loglevel error -y -i $wavPath `
  -af "volume=0.9,atempo=1.14,equalizer=f=150:t=q:w=1:g=2.2,equalizer=f=2800:t=q:w=1:g=1.2,acompressor=threshold=-20dB:ratio=2.2:attack=12:release=120,alimiter=limit=0.92" `
  -t 60 `
  -c:a libmp3lame -b:a 128k $trimmedPath

Move-Item -LiteralPath $trimmedPath -Destination $mp3Path -Force
Copy-Item -LiteralPath $mp3Path -Destination (Join-Path $renderDir "day1-opening-voice.mp3") -Force
Remove-Item -LiteralPath $wavPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $takeDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Free DJ recording generated: $mp3Path"
