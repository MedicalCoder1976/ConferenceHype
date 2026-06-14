"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  channelId?: string;
  videoId?: string;
  className?: string;
};

export function YoutubeFrame({ channelId, videoId, className }: Props) {
  const [key, setKey] = useState(0);
  const playingRef = useRef(false);

  const embedUrl = channelId
    ? `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1`
    : `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&playsinline=1&rel=0&enablejsapi=1`;

  useEffect(() => {
    const handleMessage = (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        // YouTube IFrame API: playerState 1 = playing
        if (data?.event === "infoDelivery" && data?.info?.playerState === 1) {
          playingRef.current = true;
        }
      } catch {
        // ignore non-JSON postMessages from other frames
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    // Reload the iframe every 90 s until the stream is detected as playing.
    // Stops reloading once the stream is live to avoid interrupting viewers.
    const id = setInterval(() => {
      if (!playingRef.current) {
        setKey((k) => k + 1);
      }
    }, 90_000);
    return () => clearInterval(id);
  }, []);

  return (
    <iframe
      key={key}
      className={className}
      src={embedUrl}
      title="ConferenceHype live stream"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}
