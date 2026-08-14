// NIP-22 comment tag shape + bounty isolation smoke
'use strict';

const path = require('path');
const gittr = require(path.join(__dirname, '..', 'index.js'));

function assert(cond, msg) {
  if (!cond) {
    console.error(`✗ ${msg}`);
    process.exit(1);
  }
  console.log(`✓ ${msg}`);
}

assert(gittr.KIND_COMMENT === 1111, 'KIND_COMMENT is 1111');
assert(gittr.KIND_BOUNTY === 9806, 'KIND_BOUNTY unchanged at 9806');
assert(gittr.KIND_ISSUE === 1621, 'KIND_ISSUE unchanged');
assert(gittr.KIND_PULL_REQUEST === 1618, 'KIND_PULL_REQUEST unchanged');
assert(typeof gittr.listBountiesForIssue === 'function', 'listBountiesForIssue still exported');
assert(typeof gittr.publishBountyToNostr === 'function', 'publishBountyToNostr still exported');
assert(typeof gittr.createIssue === 'function', 'createIssue still exported');
assert(typeof gittr.createPR === 'function', 'createPR still exported');
assert(typeof gittr.createIssueComment === 'function', 'createIssueComment exported');
assert(typeof gittr.createPRComment === 'function', 'createPRComment exported');
assert(typeof gittr.listIssueComments === 'function', 'listIssueComments exported');
assert(typeof gittr.listPRComments === 'function', 'listPRComments exported');

const rootId = 'a'.repeat(64);
const rootPubkey = 'b'.repeat(64);
const commentId = 'c'.repeat(64);
const commentAuthor = 'd'.repeat(64);

const topLevel = gittr.buildCommentTags({
  rootId,
  rootKind: 1621,
  rootPubkey,
  repoEntity: rootPubkey,
  repoName: 'demo-repo',
});

assert(topLevel.some((t) => t[0] === 'repo' && t[1] === rootPubkey && t[2] === 'demo-repo'), 'repo tag present');
assert(topLevel.some((t) => t[0] === 'E' && t[1] === rootId), 'uppercase E root');
assert(topLevel.some((t) => t[0] === 'K' && t[1] === '1621'), 'uppercase K root kind');
assert(topLevel.some((t) => t[0] === 'P' && t[1] === rootPubkey), 'uppercase P root pubkey');
assert(topLevel.some((t) => t[0] === 'e' && t[1] === rootId), 'lowercase e parent = root');
assert(topLevel.some((t) => t[0] === 'k' && t[1] === '1621'), 'lowercase k parent kind = issue');
assert(topLevel.some((t) => t[0] === 'p' && t[1] === rootPubkey), 'lowercase p parent pubkey');
assert(!topLevel.some((t) => t[0] === 'status' || t[0] === 'e' && t[3] === 'issue'), 'no bounty-style tags');

const reply = gittr.buildCommentTags({
  rootId,
  rootKind: 1618,
  rootPubkey,
  replyTo: commentId,
  parentPubkey: commentAuthor,
});

assert(reply.some((t) => t[0] === 'E' && t[1] === rootId), 'reply keeps root E');
assert(reply.some((t) => t[0] === 'K' && t[1] === '1618'), 'reply keeps PR root kind');
assert(reply.some((t) => t[0] === 'e' && t[1] === commentId), 'reply parent e = comment');
assert(reply.some((t) => t[0] === 'k' && t[1] === '1111'), 'reply parent k = comment kind');
assert(reply.some((t) => t[0] === 'p' && t[1] === commentAuthor), 'reply parent p = comment author');

let threw = false;
try {
  gittr.buildCommentTags({});
} catch (_) {
  threw = true;
}
assert(threw, 'buildCommentTags requires rootId');

console.log('\n✓ comment tag + bounty isolation tests passed');
