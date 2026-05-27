import { ExternalLink, Radio, ShieldAlert, Tv } from "lucide-react";
import type { Segment, StreamState } from "@/lib/types";

type Props = {
  streamState: StreamState;
  currentSegment?: Segment;
};

export function PublicPlayer({ streamState, currentSegment }: Props) {
  const audioStreamUrl = process.env.NEXT_PUBLIC_AUDIO_STREAM_URL;
  const youtubeId = process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID;
  const youtubeChannelId =
    process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID ?? "UCp9ihETXF_55sQIB-vDLvcA";
  const hlsUrl = process.env.NEXT_PUBLIC_HLS_URL;
  const youtubeEmbedUrl = youtubeChannelId
    ? `https://www.youtube.com/embed/live_stream?channel=${youtubeChannelId}&autoplay=1&mute=1&playsinline=1&rel=0`
    : youtubeId
      ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1&mute=1&playsinline=1&rel=0`
      : undefined;
  const youtubeWatchUrl = youtubeChannelId
    ? `https://www.youtube.com/channel/${youtubeChannelId}/live`
    : youtubeId
      ? `https://www.youtube.com/watch?v=${youtubeId}`
      : undefined;
  const streamLabel = audioStreamUrl
    ? "audio saver"
    : youtubeEmbedUrl
      ? "youtube"
      : hlsUrl
      ? "low hls"
      : streamState.mode;

  return (
    <div className="overflow-hidden border border-ink/15 bg-white shadow-panel lg:min-h-[520px] xl:min-h-[580px]">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 p-3 md:p-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-broadcast" />
          <span className="text-sm font-black uppercase tracking-wide md:text-base">
            Tap in live
          </span>
        </div>
        <span className="rounded-full bg-mint px-3 py-1 text-xs font-black uppercase text-white">
          {streamLabel}
        </span>
      </div>

      <div className="aspect-video bg-ink lg:aspect-[16/9]">
        {streamState.emergencyActive ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-white md:p-8">
            <ShieldAlert className="h-10 w-10 text-gold md:h-12 md:w-12" />
            <h2 className="text-xl font-black md:text-2xl">Emergency override active</h2>
            <p className="max-w-md text-sm text-white/75">
              The automated stream is paused while operators review the current
              queue.
            </p>
          </div>
        ) : audioStreamUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center text-white md:p-8">
            <Radio className="h-10 w-10 text-cyanline md:h-12 md:w-12" />
            <h2 className="text-xl font-black md:text-2xl">
              Audio saver stream
            </h2>
            <p className="max-w-md text-sm text-white/75">
              Built for crowded conference Wi-Fi. Starts muted when allowed;
              tap once for sound.
            </p>
            <audio
              className="w-full max-w-md"
              autoPlay
              muted
              controls
              preload="metadata"
              src={audioStreamUrl}
            />
          </div>
        ) : youtubeEmbedUrl ? (
          <iframe
            className="h-full w-full"
            src={youtubeEmbedUrl}
            title="ASCO Hype live stream"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : hlsUrl ? (
          <video
            className="h-full w-full"
            autoPlay
            muted
            controls
            playsInline
            preload="metadata"
            src={hlsUrl}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center text-white md:p-8">
            <Tv className="h-10 w-10 text-cyanline md:h-12 md:w-12" />
            <h2 className="text-xl font-black md:text-2xl">Stream warming up</h2>
            <p className="max-w-md text-sm text-white/75">
              When the YouTube or HLS stream is connected, it will start muted
              automatically. Tap once for sound.
            </p>
          </div>
        )}
      </div>

      <div className="p-3 md:p-4 lg:p-5">
        <div className="mb-3 bg-paper px-3 py-2 text-xs font-black uppercase tracking-wide text-ink/70">
          Bandwidth saver: audio first, low-bitrate video next. Tap for sound.
        </div>
        {youtubeWatchUrl ? (
          <a
            className="mb-3 inline-flex min-h-10 items-center justify-center gap-2 border border-ink bg-white px-3 py-2 text-xs font-black uppercase tracking-wide text-ink"
            href={youtubeWatchUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Watch live on YouTube
          </a>
        ) : null}
        <div className="text-xs font-black uppercase tracking-wide text-broadcast">
          Current topic
        </div>
        <h3 className="mt-1 text-lg font-black leading-tight text-ink md:text-xl xl:text-2xl">
          {currentSegment?.title ?? "Awaiting first live topic"}
        </h3>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          {currentSegment?.summary ??
            "Commentary topics will appear here as the stream comes online."}
        </p>
      </div>
    </div>
  );
}
