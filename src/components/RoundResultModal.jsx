export default function RoundResultModal({ playerNames, bids, tricksTaken, roundScores, onContinue }) {
  return (
    <div className="table-overlay">
      <div className="round-results">
        <h3>Round Results</h3>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              <th>Bid</th>
              <th>Won</th>
              <th>Points</th>
            </tr>
          </thead>
          <tbody>
            {playerNames.map((name, i) => (
              <tr key={i} className={roundScores[i] > 0 ? "hit-bid" : "missed-bid"}>
                <td>{name}</td>
                <td>{bids[i]}</td>
                <td>{tricksTaken[i]}</td>
                <td>{roundScores[i] > 0 ? `+${roundScores[i]}` : "0"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn primary" onClick={onContinue}>
        Next Round
      </button>
    </div>
  );
}
