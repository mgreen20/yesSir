import { NO_TRUMP, SUIT_NAMES } from "../gameLogic";

export default function GameHeader({ roundNumber, dealerName, trumpSuit, trickNumber, onQuit }) {
  const isRed = trumpSuit === "♥" || trumpSuit === "♦";
  return (
    <div className="header">
      <div className="header-top">
        <h1>Yes Sir!</h1>
        <button className="btn abort-btn" onClick={onQuit}>Quit Game</button>
      </div>
      <div className="info-bar">
        <span>Round: {roundNumber}/8</span>
        <span>Dealer: {dealerName}</span>
        {trumpSuit && (
          <span className={`trump-indicator ${isRed ? "red" : ""}`}>
            Trump: {trumpSuit === NO_TRUMP
              ? "No Trump"
              : `${trumpSuit} ${SUIT_NAMES[trumpSuit]}`}
          </span>
        )}
        {trickNumber > 0 && <span>Trick: {trickNumber}/13</span>}
      </div>
    </div>
  );
}
