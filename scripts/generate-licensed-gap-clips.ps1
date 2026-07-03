$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$clipDir = Join-Path $root "public\music\gap-clips"
$tmpDir = Join-Path $root ".tmp\gap-clips"
New-Item -ItemType Directory -Force $clipDir | Out-Null
New-Item -ItemType Directory -Force $tmpDir | Out-Null

$ffmpeg = Join-Path $root "node_modules\ffmpeg-static\ffmpeg.exe"
if (!(Test-Path $ffmpeg)) {
  $ffmpeg = "ffmpeg"
}

$clips = @(
  @{
    Id = "elevate-fenrir"
    Title = "Elevate into Fenrir"
    Source = "C:\Users\lijos\Downloads\Elevate.mp3"
    Output = "conferencehype-gap-elevate-to-fenrir-20s.mp3"
    Start = 0
    Voice = "am_fenrir"
    NextSpeaker = "Fenrir"
    NextRole = "schedule desk"
  },
  @{
    Id = "nightclub-rebecca"
    Title = "Nightclub System Overload into Rebecca"
    Source = "C:\Users\lijos\Downloads\Nightclub_System_Overload.mp3"
    Output = "conferencehype-gap-nightclub-to-rebecca-20s.mp3"
    Start = 0
    Voice = "af_bella"
    NextSpeaker = "Rebecca"
    NextRole = "high-hype reporter desk"
  },
  @{
    Id = "subterranean-adam"
    Title = "Subterranean Pulse into Adam"
    Source = "C:\Users\lijos\Downloads\Subterranean_Pulse.mp3"
    Output = "conferencehype-gap-subterranean-to-adam-20s.mp3"
    Start = 0
    Voice = "am_adam"
    NextSpeaker = "Adam"
    NextRole = "snarky social feed"
  },
  @{
    Id = "skyline-aussieonc"
    Title = "Skyline Echo into AussieOnc"
    Source = "C:\Users\lijos\Downloads\Skyline_Echo.mp3"
    Output = "conferencehype-gap-skyline-to-aussieonc-20s.mp3"
    Start = 0
    Voice = "bm_lewis"
    NextSpeaker = "AussieOnc"
    NextRole = "global hype desk"
  }
)

$manifestItems = @()
foreach ($clip in $clips) {
  $musicClip = Join-Path $tmpDir "$($clip.Id)-music.wav"
  $intro = Join-Path $tmpDir "$($clip.Id)-intro.wav"
  $output = Join-Path $clipDir $clip.Output
  $introText = "This is ConferenceHype. Up next, $($clip.NextSpeaker) on the $($clip.NextRole)."

  py -3.12 (Join-Path $root "scripts\generate-kokoro-dj-voice.py") `
    --mode stinger `
    --voice $clip.Voice `
    --text $introText `
    --output $intro

  if (Test-Path -LiteralPath $clip.Source) {
    & $ffmpeg -y `
      -ss $clip.Start `
      -i $clip.Source `
      -t 20 `
      -af "loudnorm=I=-16:LRA=8:TP=-1.5,afade=t=in:st=0:d=0.6,afade=t=out:st=19:d=1" `
      -ar 44100 `
      -ac 2 `
      $musicClip
  } elseif (Test-Path -LiteralPath $output) {
    # The first 10 seconds of the existing licensed clip precede its spoken ID.
    # Reuse only that clean music section when the purchased master was moved.
    & $ffmpeg -y `
      -i $output `
      -t 10 `
      -af "loudnorm=I=-16:LRA=8:TP=-1.5,afade=t=in:st=0:d=0.6" `
      -ar 44100 `
      -ac 2 `
      $musicClip
  } else {
    throw "Missing licensed source track and existing clip for $($clip.Id)"
  }

  & $ffmpeg -y `
    -stream_loop 1 `
    -i $musicClip `
    -i $intro `
    -filter_complex "[0:a]volume=1.0[music];[1:a]volume=1.35,adelay=10500|10500,apad[intro];[music][intro]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.94[out]" `
    -map "[out]" `
    -t 20 `
    -ar 44100 `
    -ac 2 `
    -c:a libmp3lame `
    -b:a 192k `
    $output

  $manifestItems += [ordered]@{
    id = $clip.Id
    title = $clip.Title
    sourceTrack = [IO.Path]::GetFileName($clip.Source)
    nextSpeaker = $clip.NextSpeaker
    nextRole = $clip.NextRole
    durationSeconds = 20
    audioPath = "/music/gap-clips/$($clip.Output)"
    introText = $introText
  }
}

$manifest = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  licenseNote = "User supplied these as purchased techno tracks for ConferenceHype broadcast use. Keep proof of purchase outside the repo."
  rotationRule = "Use one 20-second clip between approved broadcast segments, matching nextSpeaker when possible. Each clip includes a ConferenceHype channel intro to the next speaker."
  clips = $manifestItems
}

$manifestPath = Join-Path $clipDir "manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$playlistPath = Join-Path $clipDir "broadcast-gap-rotation.m3u"
$playlistLines = @("#EXTM3U")
foreach ($item in $manifestItems) {
  $playlistLines += "#EXTINF:20,$($item.title) - next: $($item.nextSpeaker)"
  $playlistLines += $item.audioPath
}
$playlistLines | Set-Content -LiteralPath $playlistPath -Encoding UTF8

Write-Host "Generated licensed gap clips in $clipDir"
