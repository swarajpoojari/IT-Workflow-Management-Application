import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import { store } from './app/store.js';
import { readStoredTheme } from './features/settings/settingsSlice.js';
import App from './App.jsx';
// Tailwind + shadcn/ui, wired to this app's tokens. Loaded first: Tailwind's
// own reset and utilities live inside @layer, so the unlayered rules in the
// files below always win on overlapping properties regardless of load order
// — this is just the conceptual "framework underneath" position.
import './styles/shadcn.css';
import './styles/index.css';
// Loaded after index.css so they can build on the tokens defined there.
import './styles/modules.css';
import './styles/modules2.css';
import './styles/builder.css';
// Last: enterprise surface polish, refining what the files above define.
import './styles/theme.css';

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
