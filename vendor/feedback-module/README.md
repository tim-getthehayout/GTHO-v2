# feedback-module

Shared in-app feedback interview for Tim Joseph's software projects.

This repository is the versioned home for the reusable chat UI, structured-item contract, and backend pieces. Applications pin a release. They should not invent a parallel interview flow inside the app repo.

Get the Hay Out (GTHO) is the first planned adopter.

## Status

The shared interview contract is written in [`CONTRACT.md`](CONTRACT.md). It was confirmed on November 8, 2026, America/New_York, and landed as written from the [Shared feedback model](https://cursor.com/canvas/store-05ad9d20-3dcc-471c-95b6-acbcf39cec96/ade976c2-0dad-47cd-924a-d0a5a7e99e76) Page. The JavaScript ESM interview library now implements the pinned `0.1.2` item/review rules with no runtime dependencies. The hosted backend can import it; transport, model calls, storage and authorized host adapters remain outside this library. This repository does not authorize host implementation by itself; each app pins a tagged release and adopts it through its own Design → Build → Git Bridge change.

## Rules

- The interviewer streams a live chat using the xAI API through an application backend (for example a Supabase Edge Function).
- The API key never lives in a client app.
- The module does not invent product decisions or write host-application code.
- Offline-first apps save the user's first note and finish the interview when online.
- File only after the user accepts or corrects a review card.

## Structured item

See [`CONTRACT.md`](CONTRACT.md) for the full item contract. A completed item includes at least:

- title
- type (`bug` or `request`)
- expected versus actual
- reproduction steps
- severity
- screen or route
- build stamp

Intake hands a completed item to that project's Design bot, or directly to Build when the item is a well-specified bug that needs no product decision.

## Process

Roster and flow live in [Homelab/project-framework](https://git.sarnford.com/Homelab/project-framework) (`TEAM.md` and `AGENTS.md`).


## Library

Requires a modern Node.js runtime supporting ESM, `structuredClone`, `node:crypto`
and `node:test` (tested on Node 26). No compile step or install is needed:

```sh
npm test
# or: node --test
```

Import from `feedback-module` when installed from a pinned repository revision,
or from `./src/index.js` in this checkout. This increment creates no release tag
and authorizes neither publishing nor host/GTHO adoption.

```js
import {
  createSession, recordFirstNote, nextQuestion, applyAnswer,
  presentReview, acceptReview, prepareHandoff,
} from './src/index.js';

const known = (value, source = 'user') => ({ state: 'known', value, source });
// authenticatedContext is supplied by the host, never by model output.
// It includes itemId, contractVersion: '0.1.2', appId, original screen/buildStamp
// (known values with source:'host', or unavailable with reason), and capturedAt.
let session = createSession(authenticatedContext, {
  scoped: true, reporterAvailable: true,
});
session = await recordFirstNote(session, typedNote, async snapshot => {
  await durableHostSave(snapshot); // must complete, not merely enqueue
  return { saved: true };
});
if (session.saveError) { /* retain session, show failure, retry persistDraft */ }
const question = nextQuestion(session); // one question object or null
// After a human answer, the trusted caller supplies reviewed facts:
session = applyAnswer(session, { expected: known(userExpectedOutcome) });
// Continue the interview/review; provide all required fields before acceptance.
// For impact, partial patches merge so each question can be answered separately.
// Example: applyAnswer(session, { impact: { workaround: {state:'unknown', source:'user'} } })
session = presentReview(session);
await showCardToUser(session.review); // do not accept until an explicit action
const confirmation = await hostHumanConfirmation(session.review);
// confirmation: {source:'host', confirmed:true, revision:session.review.revision,
//                destination:session.review.destination, evidence:opaqueHostRef}
session = acceptReview(session, confirmation);
const payload = prepareHandoff(session); // does NOT file; host adapter owns I/O
```

This is illustrative host code: no persistence, UI, authentication, model, or
adapter is bundled. Never pass model output to trusted host functions.

### Data and trust boundary

Facts use `{state:'known', value, source:'user'|'host'}`. Explicit uncertainty
uses `{state:'unknown', source:'user'|'host'}`. `title`, `firstNote`, and `expected`
need known text. `actual` may be unknown. `reproSteps` is a known nonempty ordered
string array, unknown, or `not_reproducible`; requests require
`{state:'not_applicable', source:'user'}`. Severity is a known supported bug label,
unknown, or request `not_applicable`. Impact contains `affectedWork`, `workaround`
and `dataRisk`, each a text fact or explicit unknown. Draft impact can be partial.
Host screen/build can be `{state:'unavailable', reason, source:'host'}`.
`capturedAt` is an ISO timestamp with timezone; this library never reads the clock.
`scope` is the host's authorized opaque operation/workspace ID string, not an
authorization decision by this library. Conditional requirements use the
`scoped`, `reporterAvailable`, and `adapted` host options. Adapted items require
`sourcePurpose`; host-specific legacy ID/history validation remains in the adapter.

Optional category, area, sourcePurpose, legacy references, conversationId, related
item IDs, diagnostic context, runtime/adapter versions, and other legacy fields
are preserved exactly as supplied in the host context. The module does not rename
legacy fields or translate urgency into severity. Attachments are only references:
`{reference: opaqueHostReference, authorized:true, reviewed:true}`; no automatic
capture, fetching, audio retention, tool execution or data dumps occur.
`needsDecision` and `unknowns` are arrays of unresolved question strings.

`validateItem(item, {phase:'draft'|'filing', ...hostOptions})` returns
`{valid, errors:[{field,message}]}`. Filing requires host confirmation whose
revision matches `itemRevision(item)` and whose destination matches routing.
Revision hashes include every item field (including legacy metadata) except
confirmation itself. All content must be JSON-compatible. Session snapshots are
immutable; serialize them for host storage and use `resumeDraft` after recovery.
A recovered initial snapshot saved before its persistence acknowledgement can
be passed to `persistDraft` again; retries always keep the existing itemId.

Source labels and confirmation evidence are **trusted caller attestations**, not
proof of authenticity. The host must verify user/host provenance, authorized
scope, relevant attachments, truthful facts and the actual human action outside
the model. The library cannot semantically detect a fabricated statement that a
trusted caller falsely labels as a user fact. Model-source facts and model consent
are rejected. Untrusted text is never evaluated or parsed as instructions.

### Lifecycle helpers

- `createSession`, `recordFirstNote`, `persistDraft`: stable host identity and
  first capture; no prompting until durable storage reports success. A storage
  failure returns the note plus visible `saveError`, not a lost note or saved claim.
  The host must retain this returned snapshot and durably save later changes too.
- `nextQuestion`, `applyAnswer`: focused questions and trusted user corrections.
  Questions about impact accept partial merged answers. An `undefined` patch value
  removes an editable field to return to an incomplete draft (clear request-only
  steps/severity as well when clearing its classification). Neither the original note
  nor original host capture can be overwritten; corrections retain old/new fact
  provenance in the session. Resume context does not replace capture context.
- `proposeStructuredFields`: stores labeled model suggestions separately from
  item facts. A user-reviewed proposal enters the item only through `applyAnswer`.
  Host fields, attachment authorization and consent cannot be proposed or patched.
- `isActionable` / `readyForReview`: stops interviewing at a clear outcome,
  classified type, observed/current behavior (possibly explicitly unknown), impact
  and saved capture. Not the same as filing-valid: missing title, severity or steps
  stay visible on the review card and must be supplied/reviewed, never fabricated.
  Help-only input stays unclassified; its routing is intentionally not implemented.
- `buildReviewCard`, `presentReview`, `acceptReview`: include the required card
  contents and unresolved/missing fields. The host shows the current card and
  obtains explicit confirmation. `applyAnswer` corrections invalidate stale
  confirmation and delivery reports; the host must show the revised card again.
- `preserveDraft` (`stop`, `decline`, `disconnect`, `cancel`), `cancelReview`,
  `resumeDraft`: preserve content without filing. These are pure state changes;
  the host is responsible for storing the resulting snapshot.
- `routeDestination`: Design by default; Build eligibility only for a complete
  known bug with no unresolved facts/decisions. `prepareHandoff` requires confirmed
  filing-valid content and returns a feedback-only payload, never a farm write.
- `recordHostDelivery`: records `local_save`, `sync_queue`, or
  `acknowledged_handoff` separately, with stable itemId, current revision and opaque
  host evidence. Queue/ack reports also name the confirmed destination. No later
  state is inferred. `deliveryComplete` is true only after host acknowledgement
  for this confirmed item revision/destination. Delivery observations live in the
  session envelope, not the model-generated item. No network calls are performed.

The host must persist a confirmed item before actual delivery, use itemId as its
idempotency key, record separate filing time in its envelope, and retry that same
identity. This module makes no promises about external exactly-once delivery.
