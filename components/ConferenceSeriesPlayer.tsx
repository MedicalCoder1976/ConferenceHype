"use client";

import { useState } from "react";
import { seriesPlaylistUrl, youtubeThumbnail, type ConferenceVideo } from "@/lib/conferences/types";

// One video at a time on our own page, newest first by default, with the
// whole series a click away on YouTube.
export function ConferenceSeriesPlayer({ videos, displayName }: { videos: ConferenceVideo[]; displayName: string }) {
  const newestFirst = [...videos].reverse();
  const [selectedId, setSelectedId] = useState(newestFirst[0]?.videoId);
  const selected = newestFirst.find((video) => video.videoId === selectedId) ?? newestFirst[0];
  if (!selected) return null;

  const embed = `https://www.youtube.com/embed/${encodeURIComponent(selected.videoId)}?${new URLSearchParams({
    rel: "0",
    playsinline: "1",
    origin: "https://conferencehype.com"
  })}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <div className="aspect-video w-full bg-ink shadow-panel">
          <iframe
            key={selected.videoId}
            className="h-full w-full"
            src={embed}
            title={selected.title}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
        <div className="mt-3">
          {selected.label ? (
            <span className="text-xs font-black uppercase text-broadcast">{selected.label}</span>
          ) : null}
          <h2 className="text-xl font-black leading-7 text-ink">{selected.headline}</h2>
          <p className="mt-1 text-xs font-bold text-ink/55">{formatDay(selected.publishedAt)}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={seriesPlaylistUrl(videos)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center bg-broadcast px-4 py-2 text-xs font-black uppercase text-white"
          >
            Watch the full {displayName} series on YouTube
          </a>
          <a
            href={`https://www.youtube.com/watch?v=${encodeURIComponent(selected.videoId)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center border border-ink px-4 py-2 text-xs font-black uppercase text-ink"
          >
            Open this video on YouTube
          </a>
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="text-xs font-black uppercase tracking-wide text-ink/55">
          All {videos.length} {videos.length === 1 ? "video" : "videos"}, newest first
        </h3>
        <ol className="mt-2 grid max-h-[640px] gap-2 overflow-y-auto pr-1">
          {newestFirst.map((video) => {
            const active = video.videoId === selected.videoId;
            return (
              <li key={video.videoId}>
                <button
                  onClick={() => {
                    setSelectedId(video.videoId);
                    if (window.innerWidth < 1024) window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  aria-current={active ? "true" : undefined}
                  className={`grid w-full grid-cols-[120px_minmax(0,1fr)] gap-3 border p-2 text-left ${
                    active ? "border-broadcast bg-white" : "border-ink/10 bg-white/70 hover:border-ink/30"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={youtubeThumbnail(video.videoId)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black uppercase text-broadcast">
                      {video.label ?? formatDay(video.publishedAt)}
                    </span>
                    <span className="line-clamp-3 text-xs font-bold leading-4 text-ink">{video.headline}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function formatDay(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
