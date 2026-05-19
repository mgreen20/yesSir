import { SUITS, NO_TRUMP, SUIT_NAMES } from "../gameLogic";

export default function TrumpChoices({ onChoose }) {
  return (
    <div className="actions">
      <div className="action-label">Choose Trump Suit:</div>
      <div className="trump-choices">
        {SUITS.map((suit) => (
          <button
            key={suit}
            className={`btn trump-btn ${suit === "♥" || suit === "♦" ? "red" : "black"}`}
            onClick={() => onChoose(suit)}
          >
            {suit} {SUIT_NAMES[suit]}
          </button>
        ))}
        <button
          key={NO_TRUMP}
          className="btn trump-btn nt"
          onClick={() => onChoose(NO_TRUMP)}
        >
          No Trump
        </button>
      </div>
    </div>
  );
}
