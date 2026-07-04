# Music Licensing

Put light jazz techno tracks in this folder only if you own the track or have a license covering:

- Website playback
- YouTube livestream use
- Social clips on X and other platforms
- Commercial or promotional use, if the channel is monetized or sponsored

Recommended workflow:

1. Download a royalty-free track from a trusted source.
2. Rename it to `light-jazz-techno.mp3` for the default worker command.
3. Paste the license name, creator, URL, and allowed uses below.

## Licenses

- `gap-clips/*.mp3`: 20-second clips generated from user-supplied purchased
  techno tracks in `C:\Users\lijos\Downloads`: `Elevate.mp3`,
  `Nightclub_System_Overload.mp3`, `Subterranean_Pulse.mp3`, and
  `Skyline_Echo.mp3`. Each clip includes a Kokoro open-source ConferenceHype channel
  intro to the next speaker. Keep purchase/license proof outside the repo.
- `conferencehype-gap-music-6min-v1.mp3`: generated in-repo with
  `scripts/generate-gap-music.ps1` using synthetic ffmpeg tones/noise and
  Kokoro open-source speech for ConferenceHype stingers. No third-party music
  sample or paid voice is used.
- `conferencehype-gap-music-6min-v2.mp3`: smoother replacement gap bed with
  fewer ConferenceHype stingers, less high-frequency synth, deeper bass, and no
  chirpy pulse layer.
- `conferencehype-gap-music-6min-v3.mp3`: louder version of the smoother gap
  bed with the base music raised while keeping the stingers controlled.
- `conferencehype-gap-music-6min-v4.mp3`: added a `[clap]` layer gated to fire
  once every `mod(t,1)` second. Since this bed loops under the entire hour
  (not just gap transitions), that gate read as a constant background buzz
  for the whole broadcast. Superseded — do not use.
- `conferencehype-gap-music-6min-v5.mp3` / `conferencehype-gap-music-20sec-preview-v3.mp3`
  (current, 2026-07-04): the `[clap]` layer removed entirely. See the
  "Broadcast Presentation" section of the top-level `README.md` for the rule
  against reintroducing a sub-6-second periodic gate in this filter graph.
