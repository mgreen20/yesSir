export default function BidChoices({ validBids, isDealer, onBid }) {
  return (
    <div className="actions">
      <div className="action-label">
        Your Bid {isDealer ? "(Dealer — cannot make total = 13)" : ""}:
      </div>
      <div className="bid-choices">
        {validBids.map((b) => (
          <button key={b} className="btn bid-btn" onClick={() => onBid(b)}>
            {b}
          </button>
        ))}
      </div>
    </div>
  );
}
