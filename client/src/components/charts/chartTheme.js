import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

const TOKENS = [
  'accent', 'accent-dark', 'green', 'amber', 'red', 'slate', 'violet',
  'border', 'border-strong', 'surface', 'text', 'text-2', 'text-3',
];

function readTokens() {
  if (typeof window === 'undefined') return {};
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    TOKENS.map((token) => [token, styles.getPropertyValue(`--${token}`).trim()]),
  );
}

/**
 * Recharts takes literal colours, not CSS variables, so the tokens are read
 * off the document and re-read whenever the theme changes. That keeps one
 * source of truth: edit index.css and the charts follow.
 */
export function useChartTheme() {
  const theme = useSelector((s) => s.settings.mine.theme);
  const [tokens, setTokens] = useState(readTokens);

  useEffect(() => {
    // The theme attribute is written to <html> in the same tick as the setting
    // changes; a frame's delay guarantees the new values are readable.
    const id = requestAnimationFrame(() => setTokens(readTokens()));
    return () => cancelAnimationFrame(id);
  }, [theme]);

  return tokens;
}

/**
 * Shared status palette, used by every chart and every progress bar:
 * green = done, blue = moving, red = stopped, amber = everything in between.
 */
export const STATUS_COLOR = {
  COMPLETED: 'green',
  IN_PROGRESS: 'accent',
  ON_HOLD: 'red',
  BLOCKED: 'amber',
  AT_RISK: 'amber',
  NOT_STARTED: 'slate',
};

export const STATUS_LABEL = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  AT_RISK: 'At risk',
  NOT_STARTED: 'Pending',
  BLOCKED: 'Blocked',
};
