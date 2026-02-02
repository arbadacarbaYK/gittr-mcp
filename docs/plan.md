What I pulled from your docs (key facts)
Bridge HTTP push endpoint: POST /api/nostr/repo/push accepts ownerPubkey, repo, branch, files, commitDate. Used for programmatic pushes. 

Nostr discovery step: after pushing to the bridge you must publish NIP‑34 announcement/state events (kinds 30617 and 30618) to relays; events must be signed by the repo owner. 

SSH git bridge: standard git clone git@git.gittr.space:<owner-identifier>/<repo>.git works; owner identifier can be npub, NIP‑05, or hex pubkey. The bridge runs on gittr servers and preserves git history. 

Minimal MCP toolset (stateless, in‑memory keys)
Below is a compact MCP mapping you can implement as a thin adapter (each tool accepts JSON, uses the provided nostr private key only for the single request, then discards it):

MCP Tool	Purpose	Backend mapping / notes
auth.use_identity	Accept agent Nostr key (nsec or npub) for request	Validate format; decode npub → hex; do not persist.
repo.list	List repos for pubkey	Call bridge API or query repo index; return names + clone URLs.
repo.push_files	Push files to bridge (programmatic)	POST /api/nostr/repo/push with ownerPubkey, files, branch. Return refs.
repo.publish_nostr	Publish announcement/state events	Build NIP‑34 events (kinds 30617/30618), sign with provided key, POST to bridge event API.
repo.clone_url	Return SSH/HTTPS clone URL for repo	Use npub/hex formats per SSH guide.
issue.list / issue.create	Agent task discovery & creation	Map to existing issue endpoints or CLI commands; include bounty metadata.
pr.create / pr.merge	Submit and merge PRs	Shell out to gittr CLI or call internal functions; sign PR metadata with agent key.
bounty.list / bounty.claim / bounty.submit	Bounty lifecycle	Map to issue tags + bounty API; attach PR link on submit.
Implementation notes & timeline
Stateless design: agents pass their private key with each call; server uses it only in‑memory for signing; no server storage of keys. (Matches your requirement.) 

Prototype: weekend prototype (shelling out to CLI + HTTP calls).

Hardening: 2–4 weeks for robust error handling, rate limits, and signed event validation.

Security: require agents to sign critical actions; rate‑limit anonymous keys; log only non‑sensitive metadata.

Next step I’ll produce now
I can generate a full MCP tool manifest (JSON schema for each tool, example requests/responses, and a minimal Node/Go server skeleton that shells out to your CLI and calls the bridge API). I’ll base it on the two docs you linked. I’ll include example event payloads for NIP‑34 signing. Should I generate that manifest and server skeleton now? 

yes
MCP Adapter Overview
A minimal, stateless MCP adapter for gittr.space should be a thin RPC layer that maps agent tool calls to existing gittr CLI commands and bridge HTTP endpoints. Agents supply their Nostr private key with each request; the adapter uses it only in memory to sign events and then discards it. The deliverable below is a ready-to-implement spec: tool manifest, JSON schemas, example requests/responses, a Node.js  server skeleton that shells out to the CLI and calls the bridge push/event endpoints, and example NIP‑34 event payloads.

MCP Tool Manifest (compact)
Tool	Purpose	Primary Inputs	Primary Outputs
auth.use_identity	Validate agent key for request	nsec or hex_privkey	identity.pubkey
repo.list	List repos for a pubkey	pubkey	[{repo, owner, clone_ssh, clone_https}]
repo.clone_url	Return canonical clone URL	owner, repo, format	clone_url
repo.push_files	Programmatic push to bridge	ownerPubkey, repo, branch, files[], commitMessage, privkey	commitRef, status
repo.publish_nostr	Publish NIP‑34 announcement/state events	ownerPubkey, repo, eventKind, payload, privkey	eventId, relayResponses
issue.list	Discover open issues / bounties	repo?, tags?	[{issueId, title, bounty, tags}]
issue.create	Create an issue / task	repo, title, body, tags, privkey	issueId, url
pr.create	Open PR from fork/branch	repo, head, base, title, body, privkey	prId, url
pr.merge	Merge PR (with policy)	repo, prId, mergeMethod, privkey	mergeCommit, status
bounty.list	List bounties across repos	filters	[{issueId, amount, currency, status}]
bounty.submit	Attach PR to bounty and request payout	issueId, prUrl, evidence, privkey	submissionId, status
JSON Schemas and Example Requests
auth.use_identity
Request

json
{
  "nsec": "nsec1abcd..."
}
Response

json
{
  "pubkey": "02a3f4...",
  "npub": "npub1..."
}
repo.push_files
Request

json
{
  "ownerPubkey": "02a3f4...",
  "repo": "my-repo",
  "branch": "agent-fix",
  "commitMessage": "Fix issue #42",
  "files": [
    {"path":"src/main.go","content":"package main\n..."}
  ],
  "privkey": "nsec1abcd..."
}
Response

json
{
  "commitRef": "refs/heads/agent-fix@sha256:...",
  "status": "ok"
}
repo.publish_nostr
Request

json
{
  "ownerPubkey": "02a3f4...",
  "repo": "my-repo",
  "eventKind": 30617,
  "payload": {"repo":"my-repo","branch":"agent-fix","commit":"sha256:..."},
  "privkey": "nsec1abcd..."
}
Response

json
{
  "eventId": "e3b0c4...",
  "relays": [{"url":"relay.example","status":"accepted"}]
}
Minimal Node.js Server Skeleton
Notes

Stateless: privkey passed per request and used only in-memory.

Two integration paths: shell out to gittr CLI or call internal Go functions if available.

Example uses child_process.execFile for CLI and node-fetch for bridge HTTP.

js
// server.js (minimal)
const express = require('express');
const { execFile } = require('child_process');
const fetch = require('node-fetch');
const bodyParser = require('body-parser');
const nostr = require('./nostr-utils'); // helper for signing

const app = express();
app.use(bodyParser.json());

// Helper to run gittr CLI
function runGittr(args, input, cb) {
  execFile('gittr', args, { maxBuffer: 10*1024*1024 }, (err, stdout, stderr) => {
    if (err) return cb(err, null);
    try { cb(null, JSON.parse(stdout)); } catch(e) { cb(null, stdout); }
  });
}

// auth.use_identity
app.post('/mcp/auth.use_identity', (req, res) => {
  const { nsec } = req.body;
  try {
    const pubkey = nostr.privToPub(nsec);
    return res.json({ pubkey, npub: nostr.toNpub(pubkey) });
  } catch(e) { return res.status(400).json({ error: 'invalid key' }); }
});

// repo.push_files -> uses bridge push endpoint
app.post('/mcp/repo.push_files', async (req, res) => {
  const { ownerPubkey, repo, branch, files, commitMessage, privkey } = req.body;
  // Build bridge payload
  const payload = { ownerPubkey, repo, branch, files, commitMessage };
  // Sign commit metadata if required
  const signed = nostr.signPayload(payload, privkey);
  try {
    const r = await fetch('https://gittr.space/api/nostr/repo/push', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ ...payload, signature: signed.sig })
    });
    const json = await r.json();
    return res.json(json);
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

// repo.publish_nostr -> create NIP-34 event and publish to relays via bridge
app.post('/mcp/repo.publish_nostr', async (req, res) => {
  const { ownerPubkey, repo, eventKind, payload, privkey } = req.body;
  const event = nostr.buildEvent({ kind: eventKind, content: JSON.stringify(payload), pubkey: ownerPubkey });
  const signed = nostr.signEvent(event, privkey);
  try {
    const r = await fetch('https://gittr.space/api/nostr/event/publish', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ event: signed })
    });
    const json = await r.json();
    return res.json(json);
  } catch(err) { return res.status(500).json({ error: err.message }); }
});

app.listen(3000, ()=>console.log('MCP adapter listening on 3000'));
nostr-utils.js should implement:

privToPub(nsec)

toNpub(pubkey)

signPayload(payload, privkey) (deterministic signature for bridge)

buildEvent({kind,content,pubkey})

signEvent(event, privkey)

NIP‑34 Example Event Payload and Signing
Event structure

json
{
  "kind": 30617,
  "pubkey": "02a3f4...",
  "created_at": 1700000000,
  "tags": [["repo","my-repo"],["branch","agent-fix"]],
  "content": "{\"commit\":\"sha256:...\",\"message\":\"agent push\"}"
}
Signing flow

Agent builds event JSON.

Adapter computes event id = sha256(serialized_event).

Adapter signs id with agent privkey producing sig.

Adapter POSTs {event, sig} to bridge event publish endpoint.

The Node skeleton above assumes nostr-utils handles canonical serialization and signing.

Security, Policy, and Product Notes
Statelessness: never persist privkey. Require agents to pass it each call. Optionally support ephemeral tokens signed by agent keys for short-lived sessions.

Rate limits: enforce per‑pubkey and per‑IP to prevent abuse.

Approval gates: allow repo owners to require human review before auto‑merges; provide a pr.auto_review_score hook for agent reviewers.

Bounty economics: support zaps/Lightning or tokenized credits; keep payout orchestration off the MCP server (adapter only signals submission).

Audit trail: sign all critical actions with agent pubkey and store only non-sensitive metadata (eventId, action, timestamp) for observability.

Safety: tag tasks agent-friendly to reduce noisy PRs; provide rate-limited sandbox repos for agent experimentation.

Suggested Next Steps and Roadmap
Prototype (weekend)

Implement auth.use_identity, repo.push_files, repo.publish_nostr, issue.list, pr.create endpoints using the Node skeleton and shelling out to gittr CLI or bridge HTTP endpoints.

Hardening (2–4 weeks)

Add robust error handling, retries, relay aggregation, rate limits, and logging of non-sensitive metadata.

Agent UX

Provide example agent prompts and an SDK snippet showing how an LLM calls the MCP tools in sequence to claim a bounty, push code, open PR, and submit bounty.

Ecosystem

Publish the MCP manifest and a small reference agent (Python/JS) that demonstrates the full loop end-to-end.

If you want, I’ll now generate the full MCP tool manifest JSON (complete request/response schemas) and a reference agent script that performs the end‑to‑end bounty flow using the adapter. I can also produce the nostr-utils.js implementation sketch for canonical signing. Which of those should I produce next?

yes
Plan and deliverables
Below is a complete, ready‑to‑implement package you can hand to a developer:

MCP tool manifest JSON (full request/response schemas).

Reference agent script (Node.js) that performs the end‑to‑end bounty flow.

nostr‑utils.js sketch for canonical signing and key handling.

Implementation notes and next steps for a stateless, secure adapter that shells out to the gittr CLI and calls the bridge/event endpoints.

I used the SSH and push guidance from your gittr docs to align event kinds, push endpoint behavior, and clone URL formats. 

1. MCP tool manifest JSON (minimal, complete)
json
{
  "mcp_version": "1.0",
  "service": "gittr-space-mcp-adapter",
  "description": "Stateless MCP adapter exposing gittr operations for agents. Agents pass nsec/hex privkey per request; adapter uses it in-memory only.",
  "tools": [
    {
      "name": "auth.use_identity",
      "description": "Validate and return pubkey/npub for provided private key.",
      "input_schema": {
        "type": "object",
        "properties": {
          "nsec": {"type": "string"},
          "hex_privkey": {"type": "string"}
        },
        "oneOf": [
          {"required": ["nsec"]},
          {"required": ["hex_privkey"]}
        ]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "pubkey": {"type": "string"},
          "npub": {"type": "string"}
        },
        "required": ["pubkey","npub"]
      }
    },
    {
      "name": "repo.list",
      "description": "List repositories visible to a pubkey.",
      "input_schema": {
        "type": "object",
        "properties": {
          "pubkey": {"type": "string"},
          "include_private": {"type": "boolean"}
        },
        "required": ["pubkey"]
      },
      "output_schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "repo": {"type": "string"},
            "owner": {"type": "string"},
            "clone_ssh": {"type": "string"},
            "clone_https": {"type": "string"},
            "is_private": {"type": "boolean"}
          },
          "required": ["repo","owner","clone_ssh","clone_https","is_private"]
        }
      }
    },
    {
      "name": "repo.clone_url",
      "description": "Return canonical clone URL for owner/repo in requested format.",
      "input_schema": {
        "type": "object",
        "properties": {
          "owner": {"type": "string"},
          "repo": {"type": "string"},
          "format": {"type": "string", "enum": ["npub","nip05","hex","https","ssh"]}
        },
        "required": ["owner","repo","format"]
      },
      "output_schema": {
        "type": "object",
        "properties": {"clone_url": {"type": "string"}},
        "required": ["clone_url"]
      }
    },
    {
      "name": "repo.push_files",
      "description": "Programmatic push to bridge. Uses bridge POST /api/nostr/repo/push.",
      "input_schema": {
        "type": "object",
        "properties": {
          "ownerPubkey": {"type": "string"},
          "repo": {"type": "string"},
          "branch": {"type": "string"},
          "commitMessage": {"type": "string"},
          "files": {
            "type": "array",
            "items": {"type": "object","properties":{"path":{"type":"string"},"content":{"type":"string"}}}
          },
          "privkey": {"type": "string"}
        },
        "required": ["ownerPubkey","repo","branch","files","privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "commitRef": {"type": "string"},
          "status": {"type": "string"},
          "bridgeResponse": {"type": "object"}
        },
        "required": ["commitRef","status"]
      }
    },
    {
      "name": "repo.publish_nostr",
      "description": "Publish NIP-34 announcement/state events (kinds 30617/30618) via bridge event publish endpoint.",
      "input_schema": {
        "type": "object",
        "properties": {
          "ownerPubkey": {"type": "string"},
          "repo": {"type": "string"},
          "eventKind": {"type": "integer"},
          "payload": {"type": "object"},
          "privkey": {"type": "string"},
          "relays": {"type": "array","items":{"type":"string"}}
        },
        "required": ["ownerPubkey","repo","eventKind","payload","privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "eventId": {"type": "string"},
          "relays": {"type": "array","items":{"type":"object","properties":{"url":{"type":"string"},"status":{"type":"string"}}}}
        },
        "required": ["eventId","relays"]
      }
    },
    {
      "name": "issue.list",
      "description": "List issues; supports filtering by repo, tags, bounty presence.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "tags": {"type": "array","items":{"type":"string"}},
          "only_bounties": {"type": "boolean"}
        }
      },
      "output_schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "issueId": {"type": "string"},
            "title": {"type": "string"},
            "body": {"type": "string"},
            "bounty": {"type": ["null","object"], "properties": {"amount":{"type":"number"},"currency":{"type":"string"}}},
            "tags": {"type": "array","items":{"type":"string"}}
          },
          "required": ["issueId","title"]
        }
      }
    },
    {
      "name": "issue.create",
      "description": "Create an issue or task. Agent signs the creation with privkey.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "title": {"type": "string"},
          "body": {"type": "string"},
          "tags": {"type": "array","items":{"type":"string"}},
          "privkey": {"type": "string"}
        },
        "required": ["repo","title","privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {"issueId":{"type":"string"},"url":{"type":"string"}},
        "required": ["issueId","url"]
      }
    },
    {
      "name": "pr.create",
      "description": "Open a pull request from head to base.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "head": {"type": "string"},
          "base": {"type": "string"},
          "title": {"type": "string"},
          "body": {"type": "string"},
          "privkey": {"type": "string"}
        },
        "required": ["repo","head","base","title","privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {"prId":{"type":"string"},"url":{"type":"string"}},
        "required": ["prId","url"]
      }
    },
    {
      "name": "pr.merge",
      "description": "Merge a PR. Adapter enforces owner policy or returns a merge request for human approval.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "prId": {"type": "string"},
          "mergeMethod": {"type": "string","enum":["merge","squash","rebase"]},
          "privkey": {"type": "string"}
        },
        "required": ["repo","prId","privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {"mergeCommit":{"type":"string"},"status":{"type":"string"}},
        "required": ["mergeCommit","status"]
      }
    },
    {
      "name": "bounty.list",
      "description": "List active bounties across repos.",
      "input_schema": {"type":"object","properties":{"filters":{"type":"object"}}},
      "output_schema": {
        "type": "array",
        "items": {"type":"object","properties":{"issueId":{"type":"string"},"amount":{"type":"number"},"currency":{"type":"string"},"status":{"type":"string"}}}
      }
    },
    {
      "name": "bounty.submit",
      "description": "Submit PR as bounty fulfillment. Adapter attaches evidence and signals payout orchestration off-chain.",
      "input_schema": {
        "type": "object",
        "properties": {
          "issueId": {"type": "string"},
          "prUrl": {"type": "string"},
          "evidence": {"type": "string"},
          "privkey": {"type": "string"}
        },
        "required": ["issueId","prUrl","privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {"submissionId":{"type":"string"},"status":{"type":"string"}}
      }
    }
  ]
}
2. Reference agent script (Node.js) — end‑to‑end bounty flow
js
// agent-reference.js
// Demonstrates: auth.use_identity -> repo.list -> issue.list -> repo.push_files -> repo.publish_nostr -> pr.create -> bounty.submit

const fetch = require('node-fetch');
const fs = require('fs');
const nostr = require('./nostr-utils');

const MCP_BASE = 'http://localhost:3000/mcp'; // adapter endpoint

async function callTool(tool, payload) {
  const r = await fetch(`${MCP_BASE}/${tool}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function runAgentFlow(nsec) {
  const identity = await callTool('auth.use_identity', { nsec });
  const pubkey = identity.pubkey;

  // discover bounties
  const repos = await callTool('repo.list', { pubkey });
  const issues = await callTool('issue.list', { tags: ['agent-friendly'], only_bounties: true });

  if (!issues.length) return console.log('no bounties found');

  const issue = issues[0];
  const repo = issue.repo || repos[0].repo;

  // prepare files (example)
  const files = [{ path: 'fix.txt', content: 'agent fix\n' }];

  // push files to branch
  const pushResp = await callTool('repo.push_files', {
    ownerPubkey: pubkey,
    repo,
    branch: `agent/${Date.now()}`,
    commitMessage: `Agent fix for ${issue.issueId}`,
    files,
    privkey: nsec
  });

  // publish nostr announcement/state
  await callTool('repo.publish_nostr', {
    ownerPubkey: pubkey,
    repo,
    eventKind: 30617,
    payload: { repo, branch: pushResp.commitRef, message: 'agent push' },
    privkey: nsec
  });

  // open PR
  const pr = await callTool('pr.create', {
    repo,
    head: pushResp.commitRef,
    base: 'main',
    title: `Agent fix for ${issue.issueId}`,
    body: `Automated PR by agent for ${issue.issueId}`,
    privkey: nsec
  });

  // submit bounty
  const submission = await callTool('bounty.submit', {
    issueId: issue.issueId,
    prUrl: pr.url,
    evidence: `PR: ${pr.url}`,
    privkey: nsec
  });

  console.log('submission', submission);
}

// run with nsec from env
runAgentFlow(process.env.NSEC);
3. nostr‑utils.js sketch
js
// nostr-utils.js (sketch)
// Use a reliable nostr library in production. This is a minimal canonical example.

const secp = require('@noble/secp256k1');
const bech32 = require('bech32');

function hexToBytes(hex) { return Buffer.from(hex, 'hex'); }

function privToPub(nsec) {
  // accept nsec (bech32) or hex
  let hex;
  if (nsec.startsWith('nsec')) {
    const decoded = bech32.decode(nsec);
    hex = Buffer.from(bech32.fromWords(decoded.words)).toString('hex');
  } else {
    hex = nsec;
  }
  const pub = secp.getPublicKey(hex).slice(1); // remove 0x04 prefix if present
  return pub.toString('hex');
}

function toNpub(pubhex) {
  const words = bech32.toWords(Buffer.from(pubhex, 'hex'));
  return bech32.encode('npub', words);
}

function signEvent(event, privhex) {
  // event must be canonicalized per Nostr spec before hashing
  const serialized = JSON.stringify([
    0,
    event.pubkey,
    event.created_at,
    event.kind,
    event.tags || [],
    event.content || ""
  ]);
  const id = Buffer.from(require('crypto').createHash('sha256').update(serialized).digest('hex'),'hex').toString('hex');
  const sig = secp.signSync(id, privhex, { der: false });
  return { ...event, id, sig };
}

function signPayload(payload, privhex) {
  const json = JSON.stringify(payload);
  const id = require('crypto').createHash('sha256').update(json).digest('hex');
  const sig = secp.signSync(id, privhex, { der: false });
  return { id, sig };
}

module.exports = { privToPub, toNpub, signEvent, signPayload };
Use a vetted Nostr library for production to ensure canonical serialization and deterministic signatures.

4. Implementation notes and security
Statelessness Agents pass privkey per call; adapter keeps it only in memory for the duration of the request and never persists it. This matches your requirement and the docs’ guidance about NIP‑07 vs nsec usage. 

Bridge integration Use POST /api/nostr/repo/push for programmatic pushes and the bridge event publish endpoint for NIP‑34 events. The adapter should accept both npub and hex owner identifiers and normalize them. 

Clone URL formats Support npub, nip05, and hex owner identifiers in repo.clone_url to match SSH guide behavior. 

Rate limits and abuse Enforce per‑pubkey and per‑IP limits. Provide a sandbox namespace for agents to experiment without spamming real repos.

Human approval Provide an optional owner policy: auto_merge: false by default; PRs can be flagged for human review. Offer pr.auto_review_score metadata so owners can tune automation.

Bounty payouts Keep payout orchestration off the MCP server; adapter only records signed submissions and emits events for an external payout service to process.

Observability Log only non‑sensitive metadata: action, pubkey, repo, eventId, timestamp. Never log privkeys or full file contents.

5. Next steps I can produce now
Full MCP manifest file in machine‑readable JSON (I already drafted the compact manifest above; I can expand it to include full JSON Schema $id fields and examples).

Complete Node adapter repo scaffold with endpoints, CLI shelling, and robust error handling.

Reference agent in Python if you prefer Python agents.

Example prompts and tool call sequences for popular agent frameworks (LangChain, AutoGen, etc.).

I’ll generate the expanded manifest and the Node adapter scaffold next if you want them now.

do it
Ready: Expanded MCP Manifest and Adapter Scaffold
Below is a complete, implementable package you can hand to a developer:

Expanded MCP manifest JSON (full tool schemas and examples).

Node adapter scaffold with endpoint handlers mapped to the manifest.

nostr-utils implementation sketch for canonical signing and key handling.

Reference agent script demonstrating the end‑to‑end bounty flow.

Deployment and security checklist and next steps.

1 MCP Manifest JSON (expanded)
json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://gittr.space/mcp/manifest.json",
  "mcp_version": "1.0",
  "service": "gittr-space-mcp-adapter",
  "description": "Stateless MCP adapter exposing gittr operations for agents. Agents pass nsec/hex privkey per request; adapter uses it in-memory only.",
  "contact": {"maintainer": "gittr.space", "email": "ops@gittr.space"},
  "tools": [
    {
      "name": "auth.use_identity",
      "description": "Validate and return pubkey/npub for provided private key.",
      "input_schema": {
        "type": "object",
        "properties": {
          "nsec": {"type": "string", "description": "bech32 nsec private key"},
          "hex_privkey": {"type": "string", "description": "hex-encoded private key"}
        },
        "oneOf": [{"required": ["nsec"]}, {"required": ["hex_privkey"]}]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "pubkey": {"type": "string"},
          "npub": {"type": "string"}
        },
        "required": ["pubkey", "npub"]
      },
      "examples": [
        {
          "input": {"nsec": "nsec1..."},
          "output": {"pubkey": "02a3f4...", "npub": "npub1..."}
        }
      ]
    },
    {
      "name": "repo.list",
      "description": "List repositories visible to a pubkey.",
      "input_schema": {
        "type": "object",
        "properties": {
          "pubkey": {"type": "string"},
          "include_private": {"type": "boolean", "default": false}
        },
        "required": ["pubkey"]
      },
      "output_schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "repo": {"type": "string"},
            "owner": {"type": "string"},
            "clone_ssh": {"type": "string"},
            "clone_https": {"type": "string"},
            "is_private": {"type": "boolean"}
          },
          "required": ["repo", "owner", "clone_ssh", "clone_https", "is_private"]
        }
      }
    },
    {
      "name": "repo.clone_url",
      "description": "Return canonical clone URL for owner/repo in requested format.",
      "input_schema": {
        "type": "object",
        "properties": {
          "owner": {"type": "string"},
          "repo": {"type": "string"},
          "format": {"type": "string", "enum": ["npub", "nip05", "hex", "https", "ssh"]}
        },
        "required": ["owner", "repo", "format"]
      },
      "output_schema": {"type": "object", "properties": {"clone_url": {"type": "string"}}, "required": ["clone_url"]}
    },
    {
      "name": "repo.push_files",
      "description": "Programmatic push to bridge. Uses bridge POST /api/nostr/repo/push.",
      "input_schema": {
        "type": "object",
        "properties": {
          "ownerPubkey": {"type": "string"},
          "repo": {"type": "string"},
          "branch": {"type": "string"},
          "commitMessage": {"type": "string"},
          "files": {
            "type": "array",
            "items": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}}
          },
          "privkey": {"type": "string"}
        },
        "required": ["ownerPubkey", "repo", "branch", "files", "privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "commitRef": {"type": "string"},
          "status": {"type": "string"},
          "bridgeResponse": {"type": "object"}
        },
        "required": ["commitRef", "status"]
      }
    },
    {
      "name": "repo.publish_nostr",
      "description": "Publish NIP-34 announcement/state events (kinds 30617/30618) via bridge event publish endpoint.",
      "input_schema": {
        "type": "object",
        "properties": {
          "ownerPubkey": {"type": "string"},
          "repo": {"type": "string"},
          "eventKind": {"type": "integer"},
          "payload": {"type": "object"},
          "privkey": {"type": "string"},
          "relays": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["ownerPubkey", "repo", "eventKind", "payload", "privkey"]
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "eventId": {"type": "string"},
          "relays": {"type": "array", "items": {"type": "object", "properties": {"url": {"type": "string"}, "status": {"type": "string"}}}}
        },
        "required": ["eventId", "relays"]
      }
    },
    {
      "name": "issue.list",
      "description": "List issues; supports filtering by repo, tags, bounty presence.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "tags": {"type": "array", "items": {"type": "string"}},
          "only_bounties": {"type": "boolean"}
        }
      },
      "output_schema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "issueId": {"type": "string"},
            "repo": {"type": "string"},
            "title": {"type": "string"},
            "body": {"type": "string"},
            "bounty": {"type": ["null", "object"], "properties": {"amount": {"type": "number"}, "currency": {"type": "string"}}},
            "tags": {"type": "array", "items": {"type": "string"}}
          },
          "required": ["issueId", "title"]
        }
      }
    },
    {
      "name": "issue.create",
      "description": "Create an issue or task. Agent signs the creation with privkey.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "title": {"type": "string"},
          "body": {"type": "string"},
          "tags": {"type": "array", "items": {"type": "string"}},
          "privkey": {"type": "string"}
        },
        "required": ["repo", "title", "privkey"]
      },
      "output_schema": {"type": "object", "properties": {"issueId": {"type": "string"}, "url": {"type": "string"}}, "required": ["issueId", "url"]}
    },
    {
      "name": "pr.create",
      "description": "Open a pull request from head to base.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "head": {"type": "string"},
          "base": {"type": "string"},
          "title": {"type": "string"},
          "body": {"type": "string"},
          "privkey": {"type": "string"}
        },
        "required": ["repo", "head", "base", "title", "privkey"]
      },
      "output_schema": {"type": "object", "properties": {"prId": {"type": "string"}, "url": {"type": "string"}}, "required": ["prId", "url"]}
    },
    {
      "name": "pr.merge",
      "description": "Merge a PR. Adapter enforces owner policy or returns a merge request for human approval.",
      "input_schema": {
        "type": "object",
        "properties": {
          "repo": {"type": "string"},
          "prId": {"type": "string"},
          "mergeMethod": {"type": "string", "enum": ["merge", "squash", "rebase"]},
          "privkey": {"type": "string"}
        },
        "required": ["repo", "prId", "privkey"]
      },
      "output_schema": {"type": "object", "properties": {"mergeCommit": {"type": "string"}, "status": {"type": "string"}}, "required": ["mergeCommit", "status"]}
    },
    {
      "name": "bounty.list",
      "description": "List active bounties across repos.",
      "input_schema": {"type": "object", "properties": {"filters": {"type": "object"}}},
      "output_schema": {"type": "array", "items": {"type": "object", "properties": {"issueId": {"type": "string"}, "amount": {"type": "number"}, "currency": {"type": "string"}, "status": {"type": "string"}}}}
    },
    {
      "name": "bounty.submit",
      "description": "Submit PR as bounty fulfillment. Adapter attaches evidence and signals payout orchestration off-chain.",
      "input_schema": {
        "type": "object",
        "properties": {
          "issueId": {"type": "string"},
          "prUrl": {"type": "string"},
          "evidence": {"type": "string"},
          "privkey": {"type": "string"}
        },
        "required": ["issueId", "prUrl", "privkey"]
      },
      "output_schema": {"type": "object", "properties": {"submissionId": {"type": "string"}, "status": {"type": "string"}}}
    }
  ]
}
2 Node Adapter Scaffold
Files and purpose

server.js Express adapter exposing MCP endpoints.

gittr-shell.js thin wrapper to call gittr CLI or internal functions.

nostr-utils.js signing and key helpers.

config.js relay and bridge endpoints.

package.json dependencies.

server.js

js
// server.js
const express = require('express');
const bodyParser = require('body-parser');
const gittr = require('./gittr-shell');
const nostr = require('./nostr-utils');
const config = require('./config');

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));

// auth.use_identity
app.post('/mcp/auth.use_identity', async (req, res) => {
  try {
    const { nsec, hex_privkey } = req.body;
    const priv = nsec || hex_privkey;
    if (!priv) return res.status(400).json({ error: 'missing key' });
    const pubkey = nostr.privToPub(priv);
    return res.json({ pubkey, npub: nostr.toNpub(pubkey) });
  } catch (e) { return res.status(400).json({ error: e.message }); }
});

// repo.list
app.post('/mcp/repo.list', async (req, res) => {
  try {
    const { pubkey, include_private } = req.body;
    const repos = await gittr.listRepos(pubkey, !!include_private);
    return res.json(repos);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// repo.push_files
app.post('/mcp/repo.push_files', async (req, res) => {
  try {
    const { ownerPubkey, repo, branch, files, commitMessage, privkey } = req.body;
    if (!privkey) return res.status(400).json({ error: 'missing privkey' });
    const payload = { ownerPubkey, repo, branch, files, commitMessage };
    const signed = nostr.signPayload(payload, privkey);
    const bridgeResp = await gittr.pushToBridge({ ...payload, signature: signed.sig });
    return res.json({ commitRef: bridgeResp.commitRef || bridgeResp.ref || null, status: 'ok', bridgeResponse: bridgeResp });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// repo.publish_nostr
app.post('/mcp/repo.publish_nostr', async (req, res) => {
  try {
    const { ownerPubkey, repo, eventKind, payload, privkey, relays } = req.body;
    const event = nostr.buildEvent({ kind: eventKind, content: JSON.stringify(payload), pubkey: ownerPubkey, tags: [['repo', repo]] });
    const signed = nostr.signEvent(event, privkey);
    const publishResp = await gittr.publishEvent(signed, relays);
    return res.json({ eventId: signed.id, relays: publishResp });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// issue.list
app.post('/mcp/issue.list', async (req, res) => {
  try {
    const issues = await gittr.listIssues(req.body);
    return res.json(issues);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// pr.create
app.post('/mcp/pr.create', async (req, res) => {
  try {
    const { repo, head, base, title, body, privkey } = req.body;
    const pr = await gittr.createPR({ repo, head, base, title, body, privkey });
    return res.json(pr);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// bounty.submit
app.post('/mcp/bounty.submit', async (req, res) => {
  try {
    const { issueId, prUrl, evidence, privkey } = req.body;
    const submission = await gittr.submitBounty({ issueId, prUrl, evidence, privkey });
    return res.json(submission);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`MCP adapter listening on ${PORT}`));
gittr-shell.js (sketch)

js
// gittr-shell.js
const { execFile } = require('child_process');
const fetch = require('node-fetch');
const config = require('./config');

function execGittr(args) {
  return new Promise((resolve, reject) => {
    execFile('gittr', args, { maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      try { return resolve(JSON.parse(stdout)); } catch (e) { return resolve(stdout.toString()); }
    });
  });
}

async function listRepos(pubkey, includePrivate) {
  // prefer internal API if available, fallback to CLI
  try {
    return await execGittr(['repo', 'list', '--pubkey', pubkey, includePrivate ? '--private' : '--public']);
  } catch (e) {
    // fallback: call bridge index endpoint
    const r = await fetch(`${config.bridgeUrl}/api/repos?owner=${pubkey}`);
    return r.json();
  }
}

async function pushToBridge(payload) {
  const r = await fetch(`${config.bridgeUrl}/api/nostr/repo/push`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function publishEvent(event, relays = []) {
  const r = await fetch(`${config.bridgeUrl}/api/nostr/event/publish`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ event, relays })
  });
  return r.json();
}

async function listIssues(filters) {
  return execGittr(['issue', 'list', '--json', JSON.stringify(filters)]);
}

async function createPR({ repo, head, base, title, body, privkey }) {
  return execGittr(['pr', 'create', '--repo', repo, '--head', head, '--base', base, '--title', title, '--body', body, '--sign', privkey]);
}

async function submitBounty({ issueId, prUrl, evidence, privkey }) {
  return execGittr(['bounty', 'submit', '--issue', issueId, '--pr', prUrl, '--evidence', evidence, '--sign', privkey]);
}

module.exports = { listRepos, pushToBridge, publishEvent, listIssues, createPR, submitBounty };
config.js

js
module.exports = {
  bridgeUrl: process.env.BRIDGE_URL || 'https://gittr.space',
  relays: (process.env.RELAYS || 'wss://relay.example').split(',')
};
3 nostr-utils Implementation Sketch
js
// nostr-utils.js
const secp = require('@noble/secp256k1');
const bech32 = require('bech32');
const crypto = require('crypto');

function bech32Decode(bech) {
  const { prefix, words } = bech32.decode(bech);
  return Buffer.from(bech32.fromWords(words)).toString('hex');
}

function bech32Encode(prefix, hex) {
  const words = bech32.toWords(Buffer.from(hex, 'hex'));
  return bech32.encode(prefix, words);
}

function privToPub(priv) {
  let hex = priv;
  if (priv.startsWith('nsec')) hex = bech32Decode(priv);
  const pub = secp.getPublicKey(hex).slice(1); // remove 0x04 prefix
  return Buffer.from(pub).toString('hex');
}

function toNpub(pubhex) {
  return bech32Encode('npub', pubhex);
}

function canonicalEventSerialize(event) {
  // Nostr canonical serialization array: [0, pubkey, created_at, kind, tags, content]
  const arr = [0, event.pubkey, event.created_at, event.kind, event.tags || [], event.content || ""];
  return JSON.stringify(arr);
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function signEvent(event, privhex) {
  const serialized = canonicalEventSerialize(event);
  const id = sha256Hex(serialized);
  const sig = secp.signSync(id, privhex, { der: false });
  return { ...event, id, sig };
}

function buildEvent({ kind, content, pubkey, tags = [] }) {
  return {
    kind,
    pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content
  };
}

function signPayload(payload, privhex) {
  const json = JSON.stringify(payload);
  const id = sha256Hex(json);
  const sig = secp.signSync(id, privhex, { der: false });
  return { id, sig };
}

module.exports = { privToPub, toNpub, buildEvent, signEvent, signPayload };
Notes

Use a vetted Nostr library in production for canonical serialization and signature verification.

@noble/secp256k1 is used here for deterministic ECDSA signing; ensure deterministic options and canonical encoding.

4 Reference Agent Script
js
// agent-reference.js
const fetch = require('node-fetch');
const MCP_BASE = process.env.MCP_BASE || 'http://localhost:3000/mcp';

async function callTool(tool, payload) {
  const r = await fetch(`${MCP_BASE}/${tool}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(payload)
  });
  return r.json();
}

async function run(nsec) {
  const identity = await callTool('auth.use_identity', { nsec });
  const pubkey = identity.pubkey;

  const repos = await callTool('repo.list', { pubkey });
  const issues = await callTool('issue.list', { tags: ['agent-friendly'], only_bounties: true });

  if (!issues || issues.length === 0) return console.log('no bounties found');

  const issue = issues[0];
  const repo = issue.repo || repos[0].repo;

  const files = [{ path: 'agent-fix.txt', content: 'automated fix\n' }];

  const pushResp = await callTool('repo.push_files', {
    ownerPubkey: pubkey,
    repo,
    branch: `agent/${Date.now()}`,
    commitMessage: `Agent fix for ${issue.issueId}`,
    files,
    privkey: nsec
  });

  await callTool('repo.publish_nostr', {
    ownerPubkey: pubkey,
    repo,
    eventKind: 30617,
    payload: { repo, branch: pushResp.commitRef, message: 'agent push' },
    privkey: nsec
  });

  const pr = await callTool('pr.create', {
    repo,
    head: pushResp.commitRef,
    base: 'main',
    title: `Agent fix for ${issue.issueId}`,
    body: `Automated PR by agent for ${issue.issueId}`,
    privkey: nsec
  });

  const submission = await callTool('bounty.submit', {
    issueId: issue.issueId,
    prUrl: pr.url,
    evidence: `PR: ${pr.url}`,
    privkey: nsec
  });

  console.log('submission', submission);
}

run(process.env.NSEC);
5 Deployment and Security Checklist
Stateless key handling: require privkey per request; never persist. Keep in-memory only for request lifetime.

Rate limiting: per‑pubkey and per‑IP limits to prevent spam.

Sandbox namespace: provide a sandbox org for agents to experiment without touching production repos.

Human approval gates: default auto_merge: false; owners can opt into automation.

Payout orchestration: keep off the adapter; adapter emits signed submissions and events for an external payout service.

Logging: log only non‑sensitive metadata (pubkey, action, repo, eventId, timestamp). Never log privkeys or full file contents.

Relay selection: allow agents to pass relays but validate and rate‑limit relay lists.

Canonical signing: use a vetted Nostr library for canonical serialization and signature verification.

Monitoring: add observability for failed pushes, relay rejections, and suspicious activity.

6 Next Steps Checklist
Prototype: implement auth.use_identity, repo.push_files, repo.publish_nostr, issue.list, pr.create, bounty.submit using the scaffold.

Test: run the reference agent against a sandbox repo and verify end‑to‑end flow.

Harden: add retries, relay aggregation, rate limits, and robust error handling.

Publish: release the MCP manifest and a reference agent SDK (JS/Python).

Ecosystem: create example prompts and LangChain/AutoGen tool wrappers to onboard agent frameworks.
