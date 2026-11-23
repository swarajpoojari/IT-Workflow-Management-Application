import { useState } from 'react';

/**
 * One segment per stage, coloured by status:
 *   green  — completed
 *   blue   — in progress
 *   red    — on hold
 *   amber  — blocked, and anything else mid-flight
 *   grey   — not started
 *
 * Hovering a segment names the stage and whoever owns it, which is the
 * question people actually ask of a progress bar.
 */
const SEGMENT_CLASS = {
  COMPLETED: 'seg-complete',
  IN_PROGRESS: 'seg-progress',
  ON_HOLD: 'seg-hold',
  BLOCKED: 'seg-blocked',
  NOT_STARTED: 'seg-pending',
};

const SEGMENT_LABEL = {
  COMPLETED: 'Completed',
  IN_PROGRESS: 'In progress',
  ON_HOLD: 'On hold',
  BLOCKED: 'Blocked',
  NOT_STARTED: 'Not started',
};

export function StageProgressBar({ stages = [], onSelect }) {
  const [hovered, setHovered] = useState(null);

  if (!stages.length) return null;

  return (
    <div className="stage-bar-wrap">
      <div className="stage-bar" role="img" aria-label={`${stages.length} stages`}>
        {stages.map((stage, index) => {
          const tone = SEGMENT_CLASS[stage.status] ?? 'seg-pending';
          const active = hovered === stage.id;

          return (
            <button
              key={stage.id}
              type="button"
              className={`stage-seg ${tone} ${active ? 'is-hovered' : ''}`}
              style={{ flexGrow: 1 }}
              onMouseEnter={() => setHovered(stage.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(stage.id)}
              onBlur={() => setHovered(null)}
              onClick={() => onSelect?.(stage.id)}
              aria-label={`${stage.sequence}. ${stage.name} — ${SEGMENT_LABEL[stage.status] ?? stage.status}${stage.assigneeName ? `, ${stage.assigneeName}` : ''}`}
            >
              {active && (
                <span className="stage-seg-tip" role="tooltip">
                  <strong>{stage.sequence}. {stage.name}</strong>
                  <span className={`tip-status ${tone}`}>{SEGMENT_LABEL[stage.status] ?? stage.status}</span>
                  <span className="tip-owner">
                    {stage.assigneeName
                      ? <>Assigned to <b>{stage.assigneeName}</b></>
                      : 'Unassigned'}
                  </span>
                  {stage.dueDate && <span className="tip-due">Due {stage.dueDate}</span>}
                </span>
              )}
              <span className="sr-only">{index + 1}</span>
            </button>
          );
        })}
      </div>

      <ol className="stage-rail">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className={`rail-step ${SEGMENT_CLASS[stage.status] ?? 'seg-pending'} ${hovered === stage.id ? 'is-hovered' : ''}`}
            onMouseEnter={() => setHovered(stage.id)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="rail-mark" aria-hidden="true">
              {stage.status === 'COMPLETED' ? '✓' : stage.status === 'NOT_STARTED' ? '' : '●'}
            </span>
            <span className="rail-name">{stage.sequence}. {stage.name}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
