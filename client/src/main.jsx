import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './app/store.js';
import { readStoredTheme } from './features/settings/settingsSlice.js';
import App from './App.jsx';
import './styles/index.css';

// Applied before the first paint so a dark-mode user never sees a light flash.
const savedTheme = readStoredTheme();
if (savedTheme !== 'system') document.documentElement.setAttribute('data-theme', savedTheme);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>,
);
