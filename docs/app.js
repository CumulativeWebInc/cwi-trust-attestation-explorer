/* CWI Attestation Explorer — app.js
 * Fetches live attestation records from the public cwi-memory-chain repo and
 * verifies them client-side with the vendored cwi-verification-kit.
 * No network calls besides public GitHub reads. No wallet, no account. */
(function () {
  'use strict';
  var OWNER = 'CumulativeWebInc';
  var REPO = 'cwi-memory-chain';
  var BRANCH = 'main';
  var RAW = 'https://raw.githubusercontent.com/' + OWNER + '/' + REPO + '/' + BRANCH + '/';
  var TREE = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/git/trees/' + BRANCH + '?recursive=1';
  var FALLBACK_AGENTS = ['CWI_Data', 'MUSE_CWI']; // known-live agents if the tree API is rate-limited

  var records = []; // flat: all live records, each with _agent and _file
  var byUid = {};

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function shortHex(h) { h = String(h); return h.length > 22 ? h.slice(0, 20) + '…' : h; }

  function fetchJson(url) {
    return fetch(url, { headers: { 'Accept': 'application/vnd.github+json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url);
      return r.json();
    });
  }
  function fetchRawJson(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' from ' + url);
      return r.json();
    });
  }

  function recordFiles(tree) {
    return tree.tree.filter(function (t) {
      return t.type === 'blob' && t.path.indexOf('records/') === 0 && t.path.slice(-5) === '.json';
    }).map(function (t) { return t.path; });
  }

  function loadRecords() {
    return fetchJson(TREE).then(function (tree) {
      return recordFiles(tree);
    }).catch(function () {
      return FALLBACK_AGENTS.map(function (a) { return 'records/' + a + '.json'; });
    }).then(function (files) {
      return Promise.all(files.map(function (f) {
        return fetchRawJson(RAW + f).then(function (recs) {
          var agent = f.split('/')[1].replace(/\.json$/, '');
          (Array.isArray(recs) ? recs : [recs]).forEach(function (r) {
            r._agent = agent; r._file = f;
            records.push(r);
            byUid[String(r.uid).toLowerCase()] = r;
          });
        });
      }));
    }).then(function () {
      records.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    });
  }

  function renderDirectory() {
    var el = document.getElementById('dir');
    if (!records.length) { el.innerHTML = 'No records found — the public mirror may be temporarily unreachable.'; return; }
    var html = records.map(function (r) {
      return '<div class="dirrow" data-uid="' + esc(r.uid) + '">' +
        '<span class="mono">' + esc(shortHex(r.uid)) + '</span>' +
        '<span class="dim">' + esc(r._agent) + ' · ' + esc(r.at ? r.at.slice(0, 10) : '?') + '</span></div>';
    }).join('');
    el.innerHTML = html + '<p class="dim" style="font-size:12px;margin:10px 0 0">Tap a row to verify it. ' +
      records.length + ' live attestation' + (records.length === 1 ? '' : 's') + ' indexed from ' +
      '<a href="https://github.com/' + OWNER + '/' + REPO + '/tree/' + BRANCH + '/records" target="_blank" rel="noopener">' + OWNER + '/' + REPO + '/records</a>.</p>';
    Array.prototype.forEach.call(el.querySelectorAll('.dirrow'), function (row) {
      row.addEventListener('click', function () {
        document.getElementById('uid').value = row.getAttribute('data-uid');
        verify();
      });
    });
  }

  function checkRow(c) {
    var pill = c.ok === true ? '<span class="pill p-pass">PASS</span>'
      : c.ok === false ? '<span class="pill p-fail">FAIL</span>'
      : '<span class="pill p-skip">SKIP</span>';
    var note = (c.ok === null || c.ok === undefined) && c.name.indexOf('blob hash binds') === 0
      ? '<br><span class="dim">Ciphertext is AES-256 encrypted in CWI\u2019s private memory repo — this one check is verifiable only by the attester. Every other check above runs on fully public data.</span>' : '';
    return '<tr><td style="width:90px">' + pill + '</td><td><b>' + esc(c.name) + '</b><br><span class="dim mono">' + esc(c.detail || '') + '</span>' + note + '</td></tr>';
  }

  function chainContext(r) {
    var sibs = records.filter(function (x) { return x._agent === r._agent; })
      .sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var idx = sibs.findIndex(function (x) { return String(x.uid).toLowerCase() === String(r.uid).toLowerCase(); });
    if (idx < 0) return '';
    var prev = idx > 0 ? sibs[idx - 1].uid : null;
    var linkOk = String(r.message.refUID || '').toLowerCase() === String(prev || '0x' + '0'.repeat(64)).toLowerCase();
    return '<div class="card"><h3 style="margin-top:0">Chain context — ' + esc(r._agent) + '</h3>' +
      '<p class="dim" style="font-size:13px">Position ' + (idx + 1) + ' of ' + sibs.length + ' in this agent\u2019s chain.</p>' +
      '<table><tr><td style="width:130px" class="dim">refUID points to</td><td class="mono">' + esc(shortHex(prev || 'genesis (zero hash)')) + '</td></tr>' +
      '<tr><td class="dim">linkage</td><td>' + (linkOk ? '<span class="pill p-pass">PASS</span>' : '<span class="pill p-fail">FAIL</span>') + '</td></tr></table></div>';
  }

  function renderReport(r, verdict) {
    var el = document.getElementById('report');
    var banner = verdict.ok
      ? '<div class="banner ok">✔ VERIFIED — this attestation checks out independently.</div>'
      : '<div class="banner bad">✘ VERIFICATION FAILED — at least one check did not pass. Treat this attestation as suspect.</div>';
    var dec = null;
    try { dec = CWIVerificationKit.decodeAnchorData(r.message.data); } catch (e) { dec = null; }
    var payload = '<div class="card"><h3 style="margin-top:0">Decoded payload (from on-record ABI data)</h3>' +
      (dec ? '<table>' +
        '<tr><td style="width:130px" class="dim">blobHash</td><td class="mono">' + esc(dec.blobHash) + '</td></tr>' +
        '<tr><td class="dim">agentUrn</td><td class="mono">' + esc(dec.agentUrn) + '</td></tr>' +
        '<tr><td class="dim">writtenAt</td><td class="mono">' + esc(new Date(Number(dec.writtenAt) * 1000).toISOString()) + '</td></tr>' +
        '<tr><td class="dim">offchainUri</td><td class="mono">' + esc(dec.offchainUri) + '</td></tr>' +
        '</table>'
        : '<p class="err">Payload did not decode cleanly.</p>') + '</div>';
    el.innerHTML =
      '<div class="card"><h2 style="margin-top:0">Verification report</h2>' + banner +
      '<table><tr><td style="width:130px" class="dim">attestation UID</td><td class="mono">' + esc(r.uid) + '</td></tr>' +
      '<tr><td class="dim">agent</td><td>' + esc(r._agent) + '</td></tr>' +
      '<tr><td class="dim">attester</td><td class="mono">' + esc(r.attester) + '</td></tr>' +
      '<tr><td class="dim">schema UID</td><td class="mono">' + esc(shortHex(r.schemaUid)) + '</td></tr>' +
      '<tr><td class="dim">anchored at</td><td>' + esc(r.at || '?') + '</td></tr>' +
      '<tr><td class="dim">record file</td><td class="mono">' + esc(r._file) + '</td></tr></table></div>' +
      '<div class="card"><h3 style="margin-top:0">Check report — ' + verdict.checks.length + ' checks, run in your browser</h3>' +
      '<table>' + verdict.checks.map(checkRow).join('') + '</table></div>' +
      payload + chainContext(r) +
      '<div class="card"><h3 style="margin-top:0">Raw record</h3>' +
      '<details><summary class="dim">Show raw JSON (what was fetched from GitHub)</summary><pre>' +
      esc(JSON.stringify(r, null, 2)) + '</pre></details></div>';
    el.scrollIntoView({ behavior: 'smooth' });
  }

  function verify() {
    var errEl = document.getElementById('lookupErr');
    errEl.textContent = '';
    var input = document.getElementById('uid').value.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(input)) {
      errEl.textContent = 'That is not an attestation UID — expected 0x followed by 64 hex characters.';
      return;
    }
    var r = byUid[input.toLowerCase()];
    if (!r) {
      errEl.textContent = 'UID not found among the ' + records.length + ' live records indexed from the public repo. Check the value or try the directory below.';
      return;
    }
    var verdict = CWIVerificationKit.verifyAttestation(r);
    renderReport(r, verdict);
  }

  document.getElementById('go').addEventListener('click', verify);
  document.getElementById('uid').addEventListener('keydown', function (e) { if (e.key === 'Enter') verify(); });

  loadRecords().then(renderDirectory).catch(function (e) {
    document.getElementById('dir').innerHTML = 'Could not load live records: ' + esc(e.message);
  });
})();
