import { useEffect, useRef, useState } from "react";
import type { Agent } from "./model";
import { chronological, approvedHistory } from "./history.mjs";
import {
  paintVillage,
  residentPosition,
  WORLD_W,
  WORLD_H,
} from "./villageScene";
import { Avatar } from "./Avatar";
import { avatarDefinition } from "./avatars.mjs";
import { GameMenu } from "./GameMenu";
import "./world.css";

export function Yard({
  agents,
  onSelect,
  onMap,
  onActivity,
  onWork,
  onAdd,
  onExport,
  onExamples,
  showExamples,
  query,
  onQuery,
}: {
  agents: Agent[];
  onSelect: (id: string) => void;
  onMap: () => void;
  onActivity: () => void;
  onWork: () => void;
  onAdd: () => void;
  onExport: () => void;
  onExamples?: () => void;
  showExamples?: boolean;
  query: string;
  onQuery: (s: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const [paused, setPaused] = useState(false);
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const pages = Math.max(1, Math.ceil(agents.length / 8));
  const current = Math.min(page, pages - 1);
  const residents = agents.slice(current * 8, current * 8 + 8);
  const residentIds = residents.map((a) => a.id).join(",");
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const backdrop = document.createElement("canvas");
    backdrop.width = WORLD_W;
    backdrop.height = WORLD_H;
    paintVillage(backdrop.getContext("2d")!);
    const values = residentIds ? residentIds.split(",") : [];
    let frame = 0,
      last = -100;
    const draw = (now: number) => {
      if (now - last > 70) {
        const time = now / 1000;
        ctx.clearRect(0, 0, WORLD_W, WORLD_H);
        ctx.drawImage(backdrop, 0, 0);
        values.forEach((_, i) => {
          const pos = residentPosition(i, time, !paused && !reduced);
          const button = buttons.current[i];
          if (button) {
            button.style.left = `${(pos.x / WORLD_W) * 100}%`;
            button.style.top = `${((pos.y - 115) / WORLD_H) * 100}%`;
            button.style.zIndex = String(Math.round(pos.y));
          }
        });
        last = now;
      }
      if (!paused && !reduced) frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => cancelAnimationFrame(frame);
  }, [residentIds, paused, reduced]);
  useEffect(() => {
    const camera = scroll.current;
    if (!camera) return;
    const center = () => {
      camera.scrollLeft = (camera.scrollWidth - camera.clientWidth) / 2;
      camera.scrollTop = (camera.scrollHeight - camera.clientHeight) / 2;
    };
    const observer = new ResizeObserver(center);
    observer.observe(camera);
    center();
    return () => observer.disconnect();
  }, []);
  return (
    <section className="game-world" aria-label="Agent yard">
      <div className="world-camera" ref={scroll}>
        <div className="world-stage" ref={stage}>
          <canvas
            ref={canvas}
            width={WORLD_W}
            height={WORLD_H}
            aria-hidden="true"
          />
          {residents.map((agent, i) => {
            const pos = residentPosition(i, 0, false);
            const latest = chronological(approvedHistory(agent))[0];
            return (
              <button
                key={agent.id}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                className="yard-resident world-resident"
                style={{
                  left: `${(pos.x / WORLD_W) * 100}%`,
                  top: `${((pos.y - 115) / WORLD_H) * 100}%`,
                  zIndex: Math.round(pos.y),
                }}
                aria-label={`Visit ${agent.name}`}
                onClick={() => onSelect(agent.id)}
              >
                <Avatar
                  avatarId={agent.avatarId}
                  animated={!paused && !reduced}
                  size={96}
                />
                {latest && (
                  <span className="resident-thought">{latest.title}</span>
                )}
                <span className="world-name">{agent.name}</span>
              </button>
            );
          })}
        </div>
      </div>
      <header className="world-header">
        <div className="world-identity">
          <span className="world-emblem">a</span>
          <div>
            <strong>agentarium</strong>
          </div>
        </div>
        <div className="world-tools">
          <button
            className="world-button"
            aria-label="Find an agent"
            title="Search"
            aria-expanded={filters}
            onClick={() => setFilters(!filters)}
          >
            ⌕
          </button>
          <button
            className="world-button motion-button"
            onClick={() => setPaused(!paused)}
            disabled={reduced}
            aria-pressed={paused || reduced}
            aria-label={
              paused || reduced ? "Movement paused" : "Pause movement"
            }
            title={paused || reduced ? "Resume" : "Pause"}
          >
            {paused || reduced ? "▶" : "Ⅱ"}
          </button>
          <GameMenu
            onExport={onExport}
            onExamples={onExamples}
            showExamples={showExamples}
          />
        </div>
      </header>
      {filters && (
        <div className="world-filter-panel">
          <label>
            Search
            <input
              aria-label="Search agents"
              placeholder="Name"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
            />
          </label>
          {query && (
            <button
              onClick={() => {
                onQuery("");
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
      {agents.length === 0 && (
        <div className="world-empty">
          <h2>No agents</h2>
          <button
            className="world-button"
            onClick={() => {
              onQuery("");
            }}
          >
            Clear
          </button>
        </div>
      )}
      <footer className="world-hud">
        <nav className="world-dock" aria-label="Workspace navigation">
          <button
            className="dock-selected"
            aria-label="The yard"
            onClick={() => {
              onQuery("");
              setPage(0);
            }}
          >
            <span aria-hidden="true">⌂</span>Yard
          </button>
          <button onClick={onMap} aria-label="Agent map">
            <span aria-hidden="true">▦</span>Agents
          </button>
          <button onClick={onActivity} aria-label="Recent evolution">
            <span aria-hidden="true">◷</span>Journal
          </button>
          <button onClick={onWork} aria-label="Agent iş özeti">
            <span aria-hidden="true">≡</span>Özet
          </button>
          <i />
          <button onClick={onAdd} aria-label="Add an agent">
            <span aria-hidden="true">＋</span>Add
          </button>
        </nav>
        <div className="world-pagination">
          {pages > 1 ? (
            <>
              <button
                className="world-button"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
                aria-label="Previous garden"
              >
                ←
              </button>
              <span>
                {current + 1} / {pages}
              </span>
              <button
                className="world-button"
                disabled={current === pages - 1}
                onClick={() => setPage(current + 1)}
                aria-label="Next garden"
              >
                →
              </button>
            </>
          ) : null}
        </div>
      </footer>
      <div className="world-mobile-roster" aria-label="Residents">
        {residents.map((agent) => (
          <button
            key={agent.id}
            title={avatarDefinition(agent.avatarId).name}
            onClick={() => onSelect(agent.id)}
          >
            {agent.name}
          </button>
        ))}
      </div>
    </section>
  );
}
