export function PaneHeader(p: { crumbs: React.ReactNode[]; badge?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="pane-head">
      <nav aria-label="Breadcrumb">
        <ol className="crumbs">
          {p.crumbs.map((c, i) => <li key={i} aria-current={i === p.crumbs.length - 1 ? 'page' : undefined}>{c}</li>)}
        </ol>
      </nav>
      {p.badge}
      <div className="actions">{p.actions}</div>
    </header>
  );
}
