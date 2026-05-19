import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import trainedWeights from './trainedWeights.json'
import { setTrainedWeights } from './gameLogic'

// Trained weights are opt-in. Flip "enabled": true in src/trainedWeights.json
// (then reload) to use the evolved per-tier weights; otherwise the AI uses
// the hand-tuned DEFAULT_WEIGHTS from gameLogic.js.
if (trainedWeights.enabled) {
  const tiers = { ...trainedWeights }
  delete tiers.enabled
  setTrainedWeights(tiers)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
