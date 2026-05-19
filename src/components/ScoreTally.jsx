export default function ScoreTally({
  scoreHistory,
  bidHistory,
  bids,
  scores,
  tallyHeaders,
  showCurrentRound,
}) {
  return (
    <div className="score-tally">
      <table>
        <thead>
          <tr>
            <th>Rd</th>
            {tallyHeaders.map((h, i) => <th key={i}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {scoreHistory.map((round, ri) => (
            <tr key={ri}>
              <td className="round-num">{ri + 1}</td>
              {round.map((pts, pi) => (
                <td key={pi} className={pts > 0 ? "scored" : "missed"}>
                  {pts > 0 ? pts : <s>{bidHistory[ri][pi]}</s>}
                </td>
              ))}
            </tr>
          ))}
          {showCurrentRound && (
            <tr className="current-round">
              <td className="round-num">{scoreHistory.length + 1}</td>
              {[0, 1, 2, 3].map((i) => (
                <td key={i}>{bids[i] !== null ? bids[i] : "-"}</td>
              ))}
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="total-row">
            <td>Tot</td>
            {scores.map((s, i) => <td key={i}>{s}</td>)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
