import CardFace from "./Card";

const POSITIONS = ["you", "west", "north", "east"];

export default function TrickArea({ currentTrick, winnerPosition }) {
  // Animation is CSS-only — the keyframe holds at played position for the
  // first 47% of its duration (~500ms) so the user sees the completed trick
  // before the cards fly toward the winner. This is more robust than
  // useDeferredValue or rAF-deferred state updates, which depend on React's
  // render scheduling and can collapse paints under heavy compute (e.g.
  // when Master tier is running multi-trick MCTS in the same tick).
  const collectClass = winnerPosition ? `collect-to-${winnerPosition}` : "";

  return (
    <div className="trick-area">
      {currentTrick.map((t, i) => {
        const fromPos = POSITIONS[t.player];
        return (
          <div
            key={i}
            className={`played-card pos-${fromPos} ${collectClass}`.trim()}
          >
            <CardFace rank={t.card.rank} suit={t.card.suit} />
          </div>
        );
      })}
    </div>
  );
}
