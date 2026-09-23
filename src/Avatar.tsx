import { useEffect, useRef, useState } from "react";
import { avatarDefinition } from "./avatars.mjs";

const images = new Map<string, Promise<HTMLImageElement>>();
function loadSprite(file: string) {
  const url = `${import.meta.env.BASE_URL}assets/${file}`;
  if (!images.has(url)) {
    images.set(
      url,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
          images.delete(url);
          reject(new Error("Artwork unavailable"));
        };
        image.src = url;
      }),
    );
  }
  return images.get(url)!;
}

export function Avatar({
  avatarId,
  size = 90,
  animated = false,
}: {
  avatarId?: string;
  size?: number;
  animated?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState("loading");
  const avatar = avatarDefinition(avatarId);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    setStatus("loading");
    const paths =
      avatar.kind === "sheet"
        ? [`huberthart/${avatar.file}`]
        : animated
          ? Array.from(
              { length: 8 },
              (_, i) => `styloo/${avatar.file}/walk-${i}.png`,
            )
          : [`styloo/${avatar.file}/idle.png`];
    Promise.all(paths.map(loadSprite))
      .then((frames) => {
        if (disposed) return;
        const ctx = canvas.current?.getContext("2d");
        if (!ctx) return;
        let frame = 0;
        const draw = () => {
          ctx.clearRect(0, 0, 288, 356);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          if (avatar.kind === "sheet") {
            // Original sheets use 288px cells. Crop only transparent padding.
            ctx.drawImage(
              frames[0],
              frame * 288 + 72,
              110,
              144,
              178,
              0,
              0,
              288,
              356,
            );
            frame = (frame + 1) % 4;
          } else {
            ctx.drawImage(frames[frame], 0, 0, 288, 356);
            frame = (frame + 1) % frames.length;
          }
        };
        draw();
        setStatus("ready");
        if (animated) timer = setInterval(draw, 1000 / avatar.fps);
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      });
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [avatar.file, avatar.kind, avatar.fps, animated]);
  return (
    <span
      className="character-avatar"
      data-avatar={avatar.id}
      data-status={status}
      role="img"
      aria-label={`${avatar.name} avatar${status === "error" ? " — artwork unavailable" : ""}`}
      style={{ width: size, height: (size * 178) / 144 }}
    >
      <canvas ref={canvas} width={288} height={356} aria-hidden="true" />
      {status !== "ready" && (
        <span className="avatar-fallback">
          {status === "error" ? "Artwork unavailable" : "Loading…"}
        </span>
      )}
    </span>
  );
}
