/**
 * Keep flushing until no new revision was produced while the previous flush
 * was in flight. Revisions must be monotonically increasing.
 */
export async function flushRevisionBarrier(
  getRevision: () => number,
  flushRevision: (revision: number) => Promise<void>
) {
  while (true) {
    const revision = getRevision();
    await flushRevision(revision);
    if (getRevision() === revision) return;
  }
}
