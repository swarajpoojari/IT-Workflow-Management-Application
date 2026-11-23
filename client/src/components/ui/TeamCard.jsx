/**
 * One team, as a card: department, status, what it does, who leads it, and the
 * work it carries. Used by the Teams panel in User Management and by the
 * New Project screen, where it shows which teams an SOP will pull in.
 */
export function TeamCard({ team, stageCount, stageLabel = 'owned stages', actions, onManage }) {
  const owned = stageCount ?? team.ownedStageCount ?? 0;
  const lead = team.leadName;

  return (
    <article className={`team-card-lg ${team.isActive === false ? 'is-inactive' : ''}`}>
      <header className="team-lg-head">
        <div className="team-lg-ident">
          <h4>{team.name}</h4>
          {team.category && <span className="team-lg-dept">{team.category}</span>}
        </div>
        <div className="team-lg-right">
          <span className={`state-pill ${team.isActive === false ? 'is-inactive' : 'is-active'}`}>
            {team.isActive === false ? 'Inactive' : 'Active'}
          </span>
          {actions}
        </div>
      </header>

      {team.description && <p className="team-lg-desc">{team.description}</p>}

      <div className="team-lg-lead">
        {lead ? (
          <>
            <span className="lead-avatar">{lead.slice(0, 1)}</span>
            <strong>{lead}</strong>
            <span className="muted xsmall">Team lead</span>
          </>
        ) : (
          <span className="muted xsmall">No team lead assigned</span>
        )}
      </div>

      <footer className="team-lg-foot">
        <span>{team.memberCount ?? 0} member{(team.memberCount ?? 0) === 1 ? '' : 's'}</span>
        <span>{owned} {owned === 1 ? stageLabel.replace(/s$/, '') : stageLabel}</span>
        {onManage && (
          <button type="button" className="link team-lg-manage" onClick={() => onManage(team)}>
            Manage
          </button>
        )}
      </footer>
    </article>
  );
}
