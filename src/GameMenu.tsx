export function GameMenu({
  onExport,
  onExamples,
  showExamples,
}: {
  onExport: () => void;
  onExamples?: () => void;
  showExamples?: boolean;
}) {
  return (
    <details className="game-menu">
      <summary aria-label="Menu" title="Menu">
        ☰
      </summary>
      <div className="game-menu-panel">
        <button onClick={onExport} aria-label="Export workspace">
          Export
        </button>
        {onExamples && (
          <button onClick={onExamples}>
            {showExamples ? "Hide examples" : "Show examples"}
          </button>
        )}
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
