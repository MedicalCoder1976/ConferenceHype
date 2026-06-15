import { ExternalLink, Radio, ShieldAlert, Tv } from "lucide-react";
import type { Segment, StreamState } from "@/lib/types";
import { YoutubeFrame } from "@/components/YoutubeFrame";

type Props = {
  streamState: StreamState;
  currentSegment?: Segment;
};

export function PublicPlayer({ streamState, currentSegment }: Props) {
  const audioStreamUrl = process.env.NEXT_PUBLIC_AUDIO_STREAM_URL;
  const youtubeEmbedEnabled =
    process.env.YOUTUBE_EMBED_ENABLED === "true";
  const youtubeStatus = streamState.youtubeStatus ?? "not_scheduled";
  const isYoutubeLive = youtubeStatus === "live";
  const isYoutubeQueued =
    youtubeStatus === "queued" || youtubeStatus === "rendering";
  const isYoutubeComplete = youtubeStatus === "completed";
  const youtubeId =
    streamState.youtubeVideoId ?? process.env.NEXT_PUBLIC_YOUTUBE_VIDEO_ID;
  const youtubeChannelId =
    process.env.NEXT_PUBLIC_YOUTUBE_CHANNEL_ID ?? "UCp9ihETXF_55sQIB-vDLvcA";
  const hlsUrl = process.env.NEXT_PUBLIC_HLS_URL;
  const youtubeWatchUrl = youtubeId
    ? streamState.youtubeUrl ?? `https://www.youtube.com/watch?v=${youtubeId}`
    : youtubeChannelId
      ? `https://www.youtube.com/channel/${youtubeChannelId}/live`
      : undefined;
  const streamLabel = audioStreamUrl
    ? "audio saver"
    : youtubeId
      ? isYoutubeLive
        ? "youtube live"
        : isYoutubeComplete
          ? "youtube replay"
          : "youtube"
      : youtubeChannelId
        ? "youtube"
      : hlsUrl
      ? "low hls"
      : streamState.mode;
  const playerHeading = isYoutubeLive
    ? "Live now on YouTube"
    : isYoutubeComplete
      ? "Rehearsal recording"
      : isYoutubeQueued
        ? "Rehearsal preparing"
        : "Watch on YouTube";
  const playerDescription = isYoutubeLive
    ? "This broadcast is live on YouTube. Open the player directly to watch and listen."
    : isYoutubeComplete
      ? "This rehearsal has ended. Open the recording on YouTube to review the completed program."
      : isYoutubeQueued
        ? "The next rehearsal is being prepared. Its YouTube page is available while rendering finishes."
        : "Open the ConferenceHype YouTube player to watch the latest program.";
  const youtubeActionLabel = isYoutubeLive
    ? "Open live on YouTube"
    : isYoutubeComplete
      ? "Watch rehearsal recording"
      : "Open on YouTube";

  return (
    <div className="overflow-hidden border border-ink/15 bg-white shadow-panel lg:min-h-[520px] xl:min-h-[580px]">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 p-3 md:p-4">
        <div className="flex items-center gap-2">
          <Radio className="h-5 w-5 text-broadcast" />
          <span className="text-sm font-black uppercase tracking-wide md:text-base">
            {isYoutubeLive ? "Tap in live" : "ConferenceHype video"}
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
        ) : (youtubeId || youtubeChannelId) && youtubeEmbedEnabled ? (
          <YoutubeFrame
            videoId={youtubeId ?? undefined}
            channelId={youtubeId ? undefined : youtubeChannelId ?? undefined}
            className="h-full w-full"
          />
        ) : youtubeWatchUrl ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-5 text-center text-white md:p-8">
            <Tv className="h-10 w-10 text-cyanline md:h-12 md:w-12" />
            <h2 className="text-xl font-black md:text-2xl">
              {playerHeading}
            </h2>
            <p className="max-w-md text-sm leading-6 text-white/75">
              {playerDescription}
            </p>
            <a
              className="inline-flex min-h-11 items-center justify-center gap-2 bg-white px-4 py-2 text-xs font-black uppercase tracking-wide text-ink"
              href={youtubeWatchUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-4 w-4" />
              {youtubeActionLabel}
            </a>
          </div>
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
            {youtubeActionLabel}
          </a>
        ) : null}
        {isYoutubeLive ? (
          <>
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
          </>
        ) : (
          <>
            <div className="text-xs font-black uppercase tracking-wide text-broadcast">
              Broadcast status
            </div>
            <h3 className="mt-1 text-lg font-black leading-tight text-ink md:text-xl xl:text-2xl">
              {isYoutubeComplete
                ? "Rehearsal completed"
                : isYoutubeQueued
                  ? "Preparing the next rehearsal"
                  : "No live broadcast right now"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-ink/70">
              {isYoutubeComplete
                ? "The completed rehearsal is available from the YouTube link above."
                : "Live topic details will appear here when the next broadcast begins."}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
