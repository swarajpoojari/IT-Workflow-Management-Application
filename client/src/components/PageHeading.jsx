import { createContext, useContext, useState } from 'react';

// The heading now renders inline inside TopBar.jsx (sharing its background —
// a separate content-area heading left the top bar looking like an empty
// box above a disconnected title). This file keeps only the slot a page can
// portal heading-adjacent controls into, such as the dashboard's date-range
// selector, independently of that rendering location.
//
// The slot is a DOM node, not a fixed prop, so a page far from Layout can
// portal into it without Layout knowing what it renders. useState (not a
// plain ref) so mounting the node triggers the re-render a page's first
// portal attempt needs — a ref alone would stay null through that render.
const PageHeadingActionsContext = createContext(null);

export function PageHeadingActionsProvider({ children }) {
  const [node, setNode] = useState(null);
  return (
    <PageHeadingActionsContext.Provider value={node}>
      {children(setNode)}
    </PageHeadingActionsContext.Provider>
  );
}

/** Returns the heading's actions slot, or null before it has mounted. */
export function usePageHeadingActions() {
  return useContext(PageHeadingActionsContext);
}
