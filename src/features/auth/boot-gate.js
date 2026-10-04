/**
 * @file Boot gate for new vs existing operations.
 * localStorage is per browser. An empty cache is not proof the user has no
 * operation — a failed membership lookup must not start the new-operation wizard.
 */

/**
 * Decide whether to paint the app, run the new-operation wizard, or block.
 * Call this only after a member with an empty local store has had an operations
 * pull attempted. A member whose pull did not hydrate the store is `blocked`,
 * never `wizard` — creating an operation there writes a duplicate.
 *
 * @param {{ localOperationCount: number, membershipStatus: 'member'|'none'|'error'|null|undefined }} input
 * @returns {'app'|'wizard'|'blocked'}
 */
export function decideBootGate({ localOperationCount, membershipStatus }) {
  if (localOperationCount > 0) return 'app';
  if (membershipStatus === 'none') return 'wizard';
  return 'blocked';
}
