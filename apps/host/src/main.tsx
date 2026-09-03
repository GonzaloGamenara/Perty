import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import FitToScreen from './FitToScreen';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FitToScreen>
      <App />
    </FitToScreen>
  </StrictMode>,
);
