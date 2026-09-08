/** A stable, quiet reading skeleton. Announce the status once, not every line. */
export function ReadingPlaceholder({ label }: { label: string }) {
  return <div className="ui-reading-placeholder" role="status"><span className="visually-hidden">{label}</span><div aria-hidden="true"><i /><i /><i /></div></div>;
}
