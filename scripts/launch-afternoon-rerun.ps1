$ErrorActionPreference = "Stop"

$env:STREAM_DURATION_SECONDS = "10800"
$env:STREAM_INPUT_PATH = "public/rendered/asco-hype-hour-broadcast.mp4"

npm run job:stream
