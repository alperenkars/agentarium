export function GameMenu({ onExport }: { onExport: () => void }) {
  return (
    <details className="game-menu">
      <summary aria-label="Menu" title="Menu">
        ☰
      </summary>
      <div className="game-menu-panel">
        <button onClick={onExport} aria-label="Export workspace">
          Export
        </button>
        <details>
          <summary>Credits</summary>
          <a
            href="https://huberthart.itch.io/2d-character-cute-chibi-free-pack"
            target="_blank"
            rel="noreferrer"
          >
            Huberthart
          </a>
          <a
            href="https://styloo.itch.io/chibi"
            target="_blank"
            rel="noreferrer"
          >
            Styloo
          </a>
        </details>
      </div>
    </details>
  );
}
