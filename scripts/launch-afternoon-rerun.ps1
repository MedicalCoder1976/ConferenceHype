$ErrorActionPreference = "Stop"

$env:STREAM_DURATION_SECONDS = "3600"
$env:STREAM_INPUT_PATH = "public/rendered/conferencehype-hour-broadcast.mp4"

npm run job:stream
