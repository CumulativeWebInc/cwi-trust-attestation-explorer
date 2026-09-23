// Attestation Explorer — dogfood test suite (node, zero deps).
// Verifies ALL live CWI memory-chain records end to end against the vendored
// docs/kit.js bundle, including blob binding (transient private-repo access;
// the browser app honestly marks that check SKIP for strangers).
// Blob-binding note (2026-09-23 correction): only the LATEST record per agent
// can bind the live blob — historic records bind historic blobs by design
// (every memory write re-encrypts the ciphertext, changing its hash).
// Asserting otherwise made the suite fail on correct chains, so the blob
// check runs against the latest record only; older records take the honest
// SKIP path while keeping every other check (signature, schema, uid, chain).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('https');
const { execFileSync } = require('child_process');
const { createHash } = require('crypto');
const { writeFileSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');
const kit = require('../docs/kit.js');

const GHAPI = '/home/hatch/workspace/skills/github/bin/ghapi';
const EXPECT_ATTESTER = '0x6732470224e98832386815bF09aFECB29C1f6d78';
const EXPECT_SCHEMA = '0x0fda26f5e5ce5d61e2b2e344a2f1712d254711550a1667cbac143df218c163f8';
const PASSFILE = process.env.HOME + '/.config/cwi-agent-memory/passphrase';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept-Encoding': 'identity', 'User-Agent': 'cwi-attestation-explorer-test' } }, (r) => {
      let b = '';
      r.on('data', (c) => { b += c; });
      r.on('end', () => { r.statusCode === 200 ? resolve(b) : reject(new Error('HTTP ' + r.statusCode + ' ' + url)); });
    }).on('error', reject);
  });
}
function ghapi(path) {
  return execFileSync(GHAPI, ['GET', path], { maxBuffer: 50 * 1024 * 1024 }).toString();
}
function decrypt(buf) {
  const tmp = join(tmpdir(), `ae-dec-${Date.now()}-${Math.random().toString(16).slice(2)}.gpg`);
  writeFileSync(tmp, buf);
  return execFileSync('gpg', ['--decrypt', '--batch', '--yes', '--passphrase-file', PASSFILE, '--output', '-', tmp], { encoding: 'utf8' });
}

test('vendored kit.js loads and rejects junk records', () => {
  const v = kit.verifyAttestation({ foo: 'bar' });
  assert.equal(v.ok, false);
  assert.ok(v.checks.length >= 1);
});

test('public repo exposes the live record layout (records/*.json)', async () => {
  const tree = JSON.parse(ghapi('/repos/CumulativeWebInc/cwi-memory-chain/git/trees/main?recursive=1'));
  const files = tree.tree.filter((t) => t.path.startsWith('records/') && t.path.endsWith('.json')).map((t) => t.path);
  assert.ok(files.length >= 2, 'expected at least 2 record files, got ' + files.length);
  assert.ok(files.includes('records/CWI_Data.json'));
  assert.ok(files.includes('records/MUSE_CWI.json'));
  global.__recFiles = files;
});

test('ALL live records verify clean; latest per agent binds the live blob; chain linkage holds', async (t) => {
  const files = global.__recFiles || ['records/CWI_Data.json', 'records/MUSE_CWI.json'];
  let total = 0;
  for (const f of files) {
    const agent = f.split('/')[1].replace('.json', '');
    const recs = JSON.parse(await get('https://raw.githubusercontent.com/CumulativeWebInc/cwi-memory-chain/main/' + f));
    assert.ok(recs.length >= 1, agent + ' has no records');
    // private ciphertext via the AUTHORITATIVE path (Contents API content field can lie — take sha, use git/blobs)
    const meta = JSON.parse(ghapi('/repos/CumulativeWebInc/cwi-agent-memory/contents/agents/' + agent + '.json.gpg'));
    const blob = JSON.parse(ghapi('/repos/CumulativeWebInc/cwi-agent-memory/git/blobs/' + meta.sha));
    const ciphertext = Buffer.from(blob.content.replace(/\n/g, ''), 'base64');
    const doc = JSON.parse(decrypt(ciphertext));
    for (let i = 0; i < recs.length; i++) {
      const r = recs[i];
      const isLatest = i === recs.length - 1;
      total++;
      // Blob binding is only meaningful for the latest record (see header note).
      const v = kit.verifyAttestation(r, isLatest ? { ciphertext, saltHex: doc.salt } : undefined);
      const failed = v.checks.filter((c) => c.ok === false).map((c) => c.name);
      assert.equal(failed.length, 0, agent + ' ' + r.uid.slice(0, 20) + ' failed: ' + failed.join(';'));
      if (isLatest) {
        const blobCk = v.checks.find((c) => c.name.startsWith('blob hash binds'));
        assert.ok(blobCk && blobCk.ok === true, agent + ' latest record must bind the live blob, got: ' + (blobCk ? blobCk.detail : 'check missing'));
      }
      assert.equal(r.attester.toLowerCase(), EXPECT_ATTESTER.toLowerCase(), 'attester mismatch');
      assert.equal(r.schemaUid.toLowerCase(), EXPECT_SCHEMA.toLowerCase(), 'schemaUid mismatch');
      assert.ok(String(r.schemaUid).startsWith('0x0fda26') && String(r.schemaUid).endsWith('f8'), 'schema UID bookends');
    }
    if (recs.length > 1) {
      const vc = kit.verifyChain(recs);
      assert.equal(vc.ok, true, agent + ' chain linkage failed');
    }
  }
  assert.ok(total >= 3, 'expected at least 3 live records, got ' + total);
  console.log('    live records verified clean: ' + total);
});

test('tampered record fails verification (negative control)', async () => {
  const recs = JSON.parse(await get('https://raw.githubusercontent.com/CumulativeWebInc/cwi-memory-chain/main/records/CWI_Data.json'));
  const tampered = JSON.parse(JSON.stringify(recs[0]));
  tampered.message.time = String(Number(tampered.message.time) + 1);
  const v = kit.verifyAttestation(tampered);
  assert.equal(v.ok, false, 'tampered record must NOT verify');
});
