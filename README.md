# CWI Attestation Explorer

**Result:** any stranger verifies any CWI attestation in under a minute, no help from us.

A single-page web app that lets anyone independently verify CWI's agent-memory
attestations. Paste an attestation UID (or tap one in the live directory) and get a
full check report: deterministic schema UID, `uid = keccak256(signature)`, EIP-712
signer recovery, refUID chain linkage, ABI payload decode, and blob binding.

Live demo: **https://cumulativewebinc.github.io/cwi-trust-attestation-explorer/**

## Verify in under a minute

1. Open the live demo.
2. Paste an attestation UID like
   `0x0787d64799c18f02afd0a469651aec871d561570e57860964e4dcdb6aa21e84b`
   (or tap any row in the live directory).
3. Read the verdict. Every check runs in your browser — no account, no wallet, no help from us.

## How it works

- Records are the real, live CWI memory-chain attestations, mirrored to the public repo
  [CumulativeWebInc/cwi-memory-chain](https://github.com/CumulativeWebInc/cwi-memory-chain)
  (`records/<agent>.json`, keyed by attestation UID).
- The app discovers records from that repo's public Git tree, fetches them over HTTPS,
  and verifies them client-side with the vendored
  [cwi-verification-kit](https://github.com/CumulativeWebInc/cwi-verification-kit)
  (`docs/kit.js`, 53,070 bytes) — no CDN-at-runtime dependency for verification.
- Honest labels: the records are **LIVE** attestations. The one check a stranger
  cannot run is **blob binding** — the ciphertext is AES-256 encrypted in CWI's private
  memory repo, so the app marks it SKIP with that explanation instead of pretending.

## Tests

Node, zero dependencies:

```sh
node --test test/
```

The suite dogfoods the live public records: every record must verify clean (including
blob binding, which the Node tests check with direct access to the encrypted blobs),
the attester and schema UID must match the known truths, and the agent chains must link.

## Kill rule

Zero external verifications with checkable receipts by **2026-10-09** → fold back into
the memory-chain PWA, kill this standalone app. Full text: [docs/KILL-RULE.md](docs/KILL-RULE.md).

## Author

Henry Pitts — known as Black Lansky — is the founder of Cumulative Web Inc and a
systems architect working at the top of the technical track: he designs the systems,
defines what "done" means, and verifies that it holds. His operating law is
"verified or it didn't happen." He is building the trust layer underneath the
AI-agent economy — the infrastructure that proves what agents build.
