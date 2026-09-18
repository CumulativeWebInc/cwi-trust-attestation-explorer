# Kill rule — Attestation Explorer

**Kill rule:** zero external verifications with checkable receipts by **2026-10-09**
→ fold this standalone app back into the memory-chain PWA and kill the repo.

This app exists to serve kill gate 3 of the blockchain memory layer: at least one
external party must independently verify a CWI anchor. An "external verification"
counts only with a checkable receipt: a dated verification report produced by this
app against the live public records (screenshot of a VERIFIED report + the UID,
or a run of the published verification recipe), attributable to someone outside CWI.

- **Measured:** external verification receipts, counted weekly from 2026-09-18.
- **Result named:** any stranger verifies any CWI attestation in under a minute, no help from us.
- **Failure mode it guards against:** a verification tool nobody outside the company ever uses is theater, not infrastructure.

Receipts log (append, never rewrite):
- 2026-09-18 — shipped v1.0.0. Receipts so far: 0 external. (Dogfood verifications are internal — 3/3 live records verify clean via the Node test suite; they do not count toward this gate.)
