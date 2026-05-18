# Low-Bandwidth Operating Rule

ASCO Hype should assume conference bandwidth is congested. Thousands of people may be sharing hotel, convention center, or mobile networks.

## Public Site

- Keep the page lightweight and mostly text/CSS.
- Avoid large hero images, background video, heavy animations, and large client bundles.
- Put the player first on mobile so people arriving from X do not scroll.
- Prefer audio-only stream playback when available.
- Use muted autoplay where browsers allow it, with a clear tap-for-sound prompt.
- Use `preload="metadata"` for media instead of forcing full preload.

## Stream Priority

The public player should choose streams in this order:

1. `NEXT_PUBLIC_AUDIO_STREAM_URL` for audio-only low-bandwidth playback.
2. `NEXT_PUBLIC_HLS_URL` for low-bitrate/adaptive HLS video.
3. `NEXT_PUBLIC_YOUTUBE_VIDEO_ID` for the heavier YouTube embed.

## Recommended Bitrates

- Audio-only: 48-96 kbps AAC.
- Low video: 360p at 400-800 kbps.
- Standard video: 720p at 1.5-2.5 Mbps.
- Keep a fallback loop available at the lowest useful bitrate.

## FFmpeg Direction

Create an audio-only stream artifact for the public site and a separate YouTube/RTMP feed for broad distribution. Do not make the website depend only on the YouTube iframe during live conference use.

Example audio output shape:

```powershell
ffmpeg -i approved-segment.wav -c:a aac -b:a 64k public/rendered/audio-saver.m4a
```

For HLS, prefer short segments and multiple variants only if the worker can handle them reliably.
