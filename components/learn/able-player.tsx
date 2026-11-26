"use client";

import "ableplayer/build/ableplayer.min.css";
import { useEffect, useRef, useState } from "react";
import type { Track } from "@/lib/learn/library";

type Able = { dispose?: () => void };

// Able Player (MIT, github.com/ableplayer/ableplayer) builds its own controls around a media
// element, so React only owns the empty box and the player is made and removed by hand.
export default function AblePlayer({ id, tracks, title, onFinished }: { id: string; tracks: Track[]; title: string; onFinished?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const finished = useRef(onFinished);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    finished.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    const host = box.current;
    if (!host || !tracks.length) return;
    let player: Able | null = null;
    let gone = false;
    const first = tracks[0];
    const youtube = first.src.startsWith("youtube:") ? first.src.slice(8) : null;

    const media = document.createElement(youtube ? "video" : "audio");
    media.id = id;
    media.setAttribute("preload", "none");
    media.setAttribute("title", title);
    media.setAttribute("data-heading-level", "0");
    if (first.start) media.setAttribute("data-start-time", String(first.start));
    if (youtube) {
      media.setAttribute("data-youtube-id", youtube);
      media.setAttribute("data-youtube-nocookie", "true");
    }
    host.append(media);

    if (!youtube && tracks.length === 1) {
      const s = document.createElement("source");
      s.src = first.src;
      s.type = "audio/mpeg";
      media.append(s);
    }
    if (!youtube && tracks.length > 1) {
      const list = document.createElement("ul");
      list.className = "able-playlist";
      list.dataset.player = id;
      for (const t of tracks) {
        const li = document.createElement("li");
        const s = document.createElement("span");
        s.className = "able-source";
        s.dataset.src = t.src;
        s.dataset.type = "audio/mpeg";
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = t.title;
        li.append(s, b);
        list.append(li);
      }
      host.append(list);
    }

    const last = tracks[tracks.length - 1].src;
    const ended = () => {
      if (media.currentSrc === last || tracks.length === 1) finished.current?.();
    };
    media.addEventListener("ended", ended);

    import("ableplayer")
      .then(({ default: Player }) => {
        if (gone) return;
        player = new Player(media) as Able;
        setReady(true);
      })
      .catch(() => !gone && setFailed(true));

    return () => {
      gone = true;
      media.removeEventListener("ended", ended);
      player?.dispose?.();
      host.replaceChildren();
    };
  }, [id, tracks, title]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={box} className={ready ? "able-host" : "able-host able-host-loading"} aria-busy={!ready} />
      {failed && (
        <p role="alert" className="text-danger text-[14px]">
          The player did not load. Check your connection and reload the page.
        </p>
      )}
    </div>
  );
}
