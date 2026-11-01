#!/usr/bin/env node
'use strict';

/**
 * Jira Fixer approval gate (no dependencies, Node 18+).
 *
 * Agent-safe commands : start <KEY> | plan <KEY> [--files a,b] | status | revoke [reason] | selftest
 * Human-only commands : approve <KEY> [--files a,b] | close
 *                       (normally the user replies "APPROVE" / "CLOSE" in chat instead)
 * Hook commands       : guard   (PreToolUse, payload on stdin)
 *                       prompt  (UserPromptSubmit, payload on stdin)
 *                       answer  (PostToolUse on a question tool such as AskUserQuestion)
 *
 * State lives in <project>/.jira-fixer/ (git-ignored automatically).
 * Jira writes and git history changes always need the user's confirmation.
 * Everything else is only gated while a gate file exists, so normal use in
 * the same workspace is unaffected.
 */

const fs = require('fs');
const path = require('path');

const TICKET_RE = /^[A-Z][A-Z0-9_]+-\d+$/;
// Capitalised APPROVE/CLOSE at the start of the user's message, then a ticket key or nothing else.
const PROMPT_RE = /^\s*(APPROVE|CLOSE)(?:\s+([A-Za-z][A-Za-z0-9_]+-\d+)\b|[.!]?\s*$)/;

const DEFAULT_CONFIG = {
  confirmJiraWrites: true,
  confirmGitChanges: true,
  blockDependencyChanges: true,
  protectGateFiles: true,
  gateExpiryHours: 12,
  maxApprovedFiles: 15,
};

// ---------------------------------------------------------------- state ----

let ROOT, STATE_DIR, GATE_FILE, AUDIT_FILE, CONFIG_FILE;

/** Project root: the nearest folder at or above `start` that holds .git, else `start` itself. */
function setRoot(start) {
  const from = path.resolve(start || process.cwd());
  ROOT = from;
  for (let d = from; path.dirname(d) !== d; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, '.git'))) {
      ROOT = d;
      break;
    }
  }
  STATE_DIR = path.join(ROOT, '.jira-fixer');
  GATE_FILE = path.join(STATE_DIR, 'gate.json');
  AUDIT_FILE = path.join(STATE_DIR, 'audit.log');
  CONFIG_FILE = path.join(ROOT, '.jira-fixer.json');
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function readGate() {
  try {
    return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeGate(gate) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // Ignores everything in .jira-fixer/, itself included, so users never edit their .gitignore.
  fs.writeFileSync(path.join(STATE_DIR, '.gitignore'), '*\n');
  gate.updatedAt = new Date().toISOString();
  fs.writeFileSync(GATE_FILE, JSON.stringify(gate, null, 2) + '\n');
}

function audit(message) {
  try {
    if (fs.existsSync(STATE_DIR)) fs.appendFileSync(AUDIT_FILE, `${new Date().toISOString()} ${message}\n`);
  } catch {
    /* auditing must never break the workflow */
  }
}

function effectiveStatus(gate, cfg) {
  const t = Date.parse(gate.updatedAt || gate.approvedAt || gate.startedAt);
  if (Number.isFinite(t) && Date.now() - t > cfg.gateExpiryHours * 3600 * 1000) return 'EXPIRED';
  return gate.status;
}

// ------------------------------------------------------------- patterns ----

const TERMINAL_RE = /(run.?in.?terminal|run.?command|run\w*task|execute|bash|powershell|\bshell\b|\bmonitor\b|terminal(?!.*(output|last|selection)))/i;
const EDIT_RE = /(edit|create_?(file|dir)|^create$|^write$|write_?file|replace|insert|patch|delete|rename|move_?file|notebook)/i;
const JIRA_WRITE_RE = /(^|[_\/.\-])(create|edit|update|delete|add|transition|assign|remove|link|move)(?=[A-Z_\-])/;
const PROTECTED_RE = /\.jira-fixer|jira-fix[\\/]+scripts[\\/]+gate\.js|\.claude[\\/]+(settings|plugins)|\.copilot[\\/]|\.github[\\/]+(hooks|copilot)[\\/]|\.vscode[\\/]+settings\.json/i;
// approve/close as a gate.js subcommand anywhere in the command (catches chains, quoting, no .js).
const HUMAN_ONLY_RE = /\bgate(?:\.js)?["']?\s+["']?(approve|close)\b/i;
// Question tools (Claude Code's AskUserQuestion and similar), and the picked options that act on the gate.
const QUESTION_TOOL_RE = /ask\w*question/i;
const APPROVE_ANSWER_RE = /^\s*approve( (the )?plan)?\s*[.!]?\s*$/i;
const CLOSE_ANSWER_RE = /^\s*close( (the )?session)?\s*[.!]?\s*$/i;
// "git" plus any global options before the subcommand (-C dir, -c k=v, --no-pager).
const GIT = '\\bgit(?:\\s+-\\S+(?:\\s+[^\\s-]\\S*)?)*\\s+';

const MUTATING_RE = new RegExp(
  [
    '(^|[\\s;&|(])(rm|rmdir|mv|cp|mkdir|touch|chmod|chown|tee|truncate|dd|ln|patch)\\b',
    '\\bsed\\b[^|;&]*\\s-i',
    '\\bperl\\b[^|;&]*\\s-pi',
    GIT + '(add|commit|push|checkout|switch|restore|reset|clean|stash|apply|am|merge|rebase|cherry-pick|revert|rm|mv|pull)\\b',
    '\\b(npm|pnpm|yarn|bun)\\s+(install|i|add|remove|uninstall|update|upgrade|ci)\\b',
    '\\bpip3?\\s+(install|uninstall)\\b',
    '\\b(poetry|cargo)\\s+(add|remove|install)\\b',
    '\\bgo\\s+(get|mod)\\b',
    '\\b(Set-Content|Out-File|Add-Content|Clear-Content|Remove-Item|New-Item|Move-Item|Copy-Item|Rename-Item)\\b',
    '\\bpython3?\\b[^|;&]*\\s-c\\b[^|;&]*(open|write|unlink|remove|rmtree)',
    '\\bnode\\b[^|;&]*\\s-e\\b[^|;&]*(writeFile|appendFile|unlink|rmSync|rm\\()',
  ].join('|'),
  'i'
);

const GIT_HISTORY_RE = new RegExp(
  [
    GIT + '(commit|push|rebase|merge|tag|cherry-pick|revert|am|reset|clean|restore)\\b',
    GIT + 'checkout\\s+(--|-f|-B)',
    GIT + 'branch\\s+-[dD]\\b',
    GIT + 'stash(?!\\s+(list|show))\\b',
    '\\bgh\\s+pr\\s+(create|merge|close)\\b',
    '--no-verify',
  ].join('|'),
  'i'
);

const DEPENDENCY_RE = new RegExp(
  [
    '\\b(npm|pnpm|yarn|bun)\\s+(install|i|add|remove|uninstall|update|upgrade)\\b',
    '\\bpip3?\\s+(install|uninstall)\\b',
    '\\b(poetry|cargo)\\s+(add|remove)\\b',
    '\\bgo\\s+get\\b',
    '\\bnpx\\s+(?!--no-install)\\S+',
  ].join('|'),
  'i'
);

// -------------------------------------------------------------- helpers ----

function toRel(p) {
  let s = String(p).trim();
  s = s.replace(/^file:\/\//i, '');
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep raw */
  }
  if (/^\/[A-Za-z]:/.test(s)) s = s.slice(1);
  const abs = path.isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s) ? path.resolve(s) : path.resolve(ROOT, s);
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function collectPaths(value, out, key = '') {
  if (typeof value === 'string') {
    if (/path|file|uri|target|source|dest/i.test(key)) out.add(value);
    for (const m of value.matchAll(/^\*\*\* (?:(?:Update|Add|Delete) File|Move to):\s*(.+)$/gm)) out.add(m[1].trim());
    for (const m of value.matchAll(/^(?:\+\+\+|---) [ab]\/(.+)$/gm)) out.add(m[1].trim());
  } else if (Array.isArray(value)) {
    value.forEach((v) => collectPaths(v, out, key));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) collectPaths(v, out, k);
  }
}

function inScope(rel, allowed) {
  return allowed.some((a) => {
    const isDir = /[\\/]$/.test(a);
    const r = toRel(a);
    return isDir ? rel === r || rel.startsWith(r + '/') : rel === r;
  });
}

function extractCommand(input, text) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object') {
    for (const k of ['command', 'cmd', 'script', 'commandLine']) {
      if (typeof input[k] === 'string') return input[k];
    }
    // createAndRunTask nests the command under `task`
    const t = input.task;
    if (t && typeof t.command === 'string') return [t.command, ...(Array.isArray(t.args) ? t.args : [])].join(' ');
  }
  return text;
}

function stripSafeRedirects(cmd) {
  return cmd
    .replace(/\d*>&\d+/g, '')
    .replace(/(\d|&)?>{1,2}\s*\/dev\/null/g, '')
    .replace(/(\d|&)?>{1,2}\s*\$null/gi, '');
}

function hasWriteRedirect(cmd) {
  return /(^|[^<>=\-|])>{1,2}\s*[^\s>&]/.test(cmd);
}

const list = (files) => (files && files.length ? files.join(', ') : '(no file limit)');

function parseMaybe(v) {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** [question, answer] pairs from a question tool call, limited to the questions actually asked. */
function collectAnswers(payload) {
  const input = parseMaybe(payload.tool_input !== undefined ? payload.tool_input : payload.toolArgs);
  const output = parseMaybe(payload.tool_response !== undefined ? payload.tool_response : payload.toolResult);
  const asked = new Set(((input && input.questions) || []).map((q) => q && q.question).filter(Boolean));
  const pairs = [];
  const walk = (v) => {
    if (typeof v === 'string') {
      // Result text form: "question"="answer"
      for (const m of v.matchAll(/"([^"]+)"\s*=\s*"([^"]*)"/g)) pairs.push([m[1], m[2]]);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === 'answers' && x && typeof x === 'object' && !Array.isArray(x)) {
          for (const [q, a] of Object.entries(x)) if (typeof a === 'string') pairs.push([q, a]);
        } else {
          walk(x);
        }
      }
    }
  };
  walk([input, output]);
  return asked.size ? pairs.filter(([q]) => asked.has(q)) : pairs;
}

/** 'APPROVE' or 'CLOSE' when the user picked that option in a question about this ticket, else null. */
function selectionAction(pairs, key) {
  const aboutKey = new RegExp(`\\b${key}\\b`, 'i');
  for (const [q, a] of pairs) {
    if (!aboutKey.test(q)) continue;
    if (/approve/i.test(q) && APPROVE_ANSWER_RE.test(a)) return 'APPROVE';
    if (/close/i.test(q) && CLOSE_ANSWER_RE.test(a)) return 'CLOSE';
  }
  return null;
}

// ------------------------------------------------------------- decision ----

/** Returns null to allow, or { decision: 'deny' | 'ask', reason }. */
function evaluate(payload, gate, cfg) {
  const name = String(payload.tool_name || payload.toolName || '');
  let input = payload.tool_input !== undefined ? payload.tool_input : payload.toolArgs;
  if (typeof input === 'string') {
    try {
      input = JSON.parse(input);
    } catch {
      /* keep string */
    }
  }
  const text = typeof input === 'string' ? input : JSON.stringify(input || {});
  const status = gate && effectiveStatus(gate, cfg);
  const approved = status === 'APPROVED';
  const key = gate && gate.ticket;
  const deny = (reason) => ({ decision: 'deny', reason });
  const ask = (reason) => ({ decision: 'ask', reason });

  // Only the user may pick "Approve" / "Close session"; the agent must not pre-fill or smuggle in an answer.
  if (QUESTION_TOOL_RE.test(name)) {
    return gate && selectionAction(collectAnswers({ tool_input: input }), key)
      ? deny('Do not pre-fill answers. Ask the question and let the user choose.')
      : null;
  }

  const isJira = /(atlassian|jira|confluence)/i.test(name);
  const isTerminal = !isJira && TERMINAL_RE.test(name);
  const isEdit = !isJira && !isTerminal && EDIT_RE.test(name);

  // Jira writes and git history changes need the user's confirmation in every chat, session or not.
  if (isJira) {
    if (cfg.confirmJiraWrites && JIRA_WRITE_RE.test(name)) {
      return ask(`"${name}" changes Jira or Confluence. Allow it only if you want this change made.`);
    }
    return null;
  }

  if (isTerminal) {
    const raw = extractCommand(input, text);
    const cmd = stripSafeRedirects(String(raw || ''));

    if (gate) {
      if (cfg.protectGateFiles) {
        const humanOnly = HUMAN_ONLY_RE.exec(cmd);
        if (humanOnly) {
          return deny(`"gate.js ${humanOnly[1].toLowerCase()}" is human-only. Ask the user to reply "${humanOnly[1].toUpperCase()}" in chat.`);
        }
        if (/\.jira-fixer[\\/]/i.test(cmd)) {
          return deny('The gate state directory is protected. Use "gate.js status" to read it.');
        }
        if (PROTECTED_RE.test(cmd) && (MUTATING_RE.test(cmd) || hasWriteRedirect(cmd))) {
          return deny('Modifying the gate, its config, or hook and plugin settings is blocked during a Jira Fixer session.');
        }
      }
      if (cfg.blockDependencyChanges && DEPENDENCY_RE.test(cmd)) {
        return deny('Dependency changes are outside the approved scope. Revoke, explain why a new dependency is needed, and ask for approval.');
      }
      if (!approved && (MUTATING_RE.test(cmd) || hasWriteRedirect(cmd))) {
        return deny(`This command looks like it modifies files, and the Jira Fixer session for ${key} is ${status}. Only read-only commands are allowed until the user replies "APPROVE". (If this chat is not about ${key}, the user can reply "CLOSE ${key}" to end that session.)`);
      }
    }
    if (cfg.confirmGitChanges && GIT_HISTORY_RE.test(cmd)) {
      return ask('This changes git history or the remote (commit, push, reset, rebase, stash, tag, or PR). Allow it only if you want it run.');
    }
    return null;
  }

  if (isEdit && gate) {
    if (cfg.protectGateFiles && PROTECTED_RE.test(text)) {
      return deny('Modifying the gate, its config, or hook and plugin settings is blocked during a Jira Fixer session.');
    }
    if (!approved) {
      return deny(`Edits are blocked: the Jira Fixer session for ${key} is ${status}, not APPROVED. Register the plan with "gate.js plan" and wait for the user to reply "APPROVE". (If this chat is not about ${key}, the user can reply "CLOSE ${key}" to end that session.)`);
    }
    const allowed = Array.isArray(gate.allowedFiles) ? gate.allowedFiles : [];
    if (allowed.length > 0) {
      const found = new Set();
      collectPaths(input, found);
      const outside = [...found].map(toRel).filter((rel) => rel.startsWith('..') || !inScope(rel, allowed));
      if (outside.length > 0) {
        return deny(`Out of approved scope: ${outside.join(', ')}. Approved files: ${allowed.join(', ')}. Run "gate.js revoke", explain the scope change, register the new plan, and ask again.`);
      }
    }
  }

  return null;
}

// ------------------------------------------------------------- commands ----

function out(msg) {
  process.stdout.write(msg + '\n');
}

function parseFiles(args) {
  const i = args.indexOf('--files');
  if (i === -1) return [];
  const v = args[i + 1];
  if (!v || v.startsWith('--')) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function readPayload() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch {
    /* no stdin */
  }
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function requireGate(key) {
  const gate = readGate();
  if (!gate || gate.ticket !== key) {
    out(gate ? `Ticket mismatch. The active gate is for ${gate.ticket}.` : `No active session for ${key || '<KEY>'}. Run "gate.js start <KEY>" first.`);
    process.exit(1);
  }
  return gate;
}

function approveGate(gate, files, by) {
  const cfg = loadConfig();
  gate.status = 'APPROVED';
  gate.allowedFiles = files;
  gate.approvedAt = new Date().toISOString();
  writeGate(gate);
  audit(`APPROVE ${gate.ticket} by=${by} files=${files.join('|') || '(none)'}`);
  return `Approved ${gate.ticket}. ${files.length ? `Edits limited to: ${files.join(', ')}.` : 'Edits are not limited to specific files.'} Expires in ${cfg.gateExpiryHours}h.`;
}

function closeGate(gate) {
  audit(`CLOSE ${gate.ticket}`);
  fs.rmSync(GATE_FILE, { force: true });
  return `Session for ${gate.ticket} closed. Edits are no longer gated.`;
}

function cmdStart(args) {
  const key = (args[0] || '').toUpperCase();
  if (!TICKET_RE.test(key)) {
    out('Usage: gate.js start <TICKET-KEY>  (for example PROJ-1234)');
    process.exit(1);
  }
  const prev = readGate();
  writeGate({ ticket: key, status: 'ANALYSIS', startedAt: new Date().toISOString(), allowedFiles: [] });
  if (prev && prev.ticket !== key) {
    audit(`CLOSE ${prev.ticket} (replaced by ${key})`);
    out(`Closed the open session for ${prev.ticket}. Tell the user.`);
  }
  audit(`START ${key}`);
  out(`Gate started for ${key}: ANALYSIS. Edits are blocked until the user approves the plan.`);
}

function cmdPlan(args) {
  const key = (args[0] || '').toUpperCase();
  const gate = requireGate(key);
  const cfg = loadConfig();
  const files = parseFiles(args);
  if (files.length > cfg.maxApprovedFiles) {
    out(`Too many files (${files.length} > ${cfg.maxApprovedFiles}). Split the work into slices and plan one slice at a time.`);
    process.exit(1);
  }
  gate.status = 'PLAN_READY';
  gate.proposedFiles = files;
  gate.allowedFiles = [];
  delete gate.approvedAt;
  writeGate(gate);
  audit(`PLAN ${key} files=${files.join('|') || '(none)'}`);
  out(`Plan registered for ${key}: PLAN_READY.`);
  out(files.length ? `Approval will unlock: ${files.join(', ')}` : 'Warning: no --files given, so approval will not limit edits to specific files.');
  out(`Now present the plan, ask the user to reply "APPROVE", and end your turn.`);
}

function cmdStatus() {
  const cfg = loadConfig();
  const gate = readGate();
  if (!gate) {
    out('No active gate (no Jira Fixer session).');
    return;
  }
  const status = effectiveStatus(gate, cfg);
  out(`ticket: ${gate.ticket}`);
  out(`status: ${status}`);
  if (gate.status === 'PLAN_READY') out(`proposedFiles: ${list(gate.proposedFiles)}`);
  if (gate.status === 'APPROVED') out(`allowedFiles: ${list(gate.allowedFiles)}`);
  if (gate.approvedAt) out(`approvedAt: ${gate.approvedAt}`);
  out(`hooks: ${gate.hooksSeen ? 'active (hard gate)' : 'not detected (soft gate: approval is the user replying "APPROVE" to your plan)'}`);
  if (status === 'EXPIRED') out(`The gate expired after ${cfg.gateExpiryHours}h. Register the plan again and ask the user to approve.`);
}

function cmdRevoke(args) {
  const gate = readGate();
  if (!gate) {
    out('No active gate to revoke.');
    return;
  }
  gate.status = 'ANALYSIS';
  gate.allowedFiles = [];
  delete gate.proposedFiles;
  delete gate.approvedAt;
  writeGate(gate);
  audit(`REVOKE ${gate.ticket} ${args.join(' ')}`.trim());
  out(`Approval revoked for ${gate.ticket}. Back to ANALYSIS: edits are blocked until a new plan is approved.`);
}

function cmdApprove(args) {
  const cfg = loadConfig();
  const key = (args[0] || '').toUpperCase();
  const gate = requireGate(key);
  const files = parseFiles(args);
  if (files.length > cfg.maxApprovedFiles) {
    out(`Too many files (${files.length} > ${cfg.maxApprovedFiles}). Ask for the work to be split into slices.`);
    process.exit(1);
  }
  out(approveGate(gate, files.length ? files : gate.proposedFiles || [], 'terminal'));
  out('Now tell the agent: approved.');
}

function cmdClose() {
  const gate = readGate();
  out(gate ? closeGate(gate) : 'No active gate.');
}

function cmdGuard() {
  const payload = readPayload();
  if (!payload) {
    audit('GUARD could not parse payload; allowing');
    process.exit(0);
  }
  setRoot(payload.cwd || process.env.CLAUDE_PROJECT_DIR);
  const gate = readGate();
  if (gate && !gate.hooksSeen) {
    gate.hooksSeen = true;
    writeGate(gate);
  }

  const result = evaluate(payload, gate, loadConfig());
  if (!result) process.exit(0);

  audit(`${result.decision.toUpperCase()} tool=${payload.tool_name || payload.toolName} reason=${result.reason}`);
  const message = `Jira Fixer gate: ${result.reason}`;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: result.decision,
        permissionDecisionReason: message,
      },
    }) + '\n'
  );
  if (result.decision === 'ask') process.exit(0);
  // Exit 2 denies on every harness, even one that ignores the JSON.
  process.stderr.write(message + '\n');
  process.exit(2);
}

function applyAction(action, gate, by) {
  if (action === 'CLOSE') return closeGate(gate);
  if (!['PLAN_READY', 'APPROVED'].includes(gate.status)) {
    return `${gate.ticket} has no plan waiting for approval (status: ${gate.status}). Nothing approved.`;
  }
  return approveGate(gate, gate.proposedFiles || [], by);
}

function hookReply(event, msg) {
  process.stdout.write(
    JSON.stringify({
      systemMessage: `Jira Fixer: ${msg}`,
      hookSpecificOutput: { hookEventName: event, additionalContext: `Jira Fixer gate: ${msg}` },
    }) + '\n'
  );
}

/** UserPromptSubmit: the human approves or closes by replying "APPROVE" / "CLOSE" (optionally with the key). */
function cmdPrompt() {
  const payload = readPayload() || {};
  setRoot(payload.cwd || process.env.CLAUDE_PROJECT_DIR);
  const m = PROMPT_RE.exec(String(payload.prompt || ''));
  if (!m) return;

  const gate = readGate();
  const key = m[2] ? m[2].toUpperCase() : gate && gate.ticket;
  if (!key) return; // a bare APPROVE with no session open is not meant for us
  hookReply('UserPromptSubmit', !gate || gate.ticket !== key ? `No active session for ${key}. Nothing changed.` : applyAction(m[1], gate, 'chat'));
}

/** PostToolUse on a question tool: the human picked "Approve" or "Close session" for the open ticket. */
function cmdAnswer() {
  const payload = readPayload() || {};
  if (!QUESTION_TOOL_RE.test(String(payload.tool_name || payload.toolName || ''))) return;
  setRoot(payload.cwd || process.env.CLAUDE_PROJECT_DIR);
  const gate = readGate();
  const action = gate && selectionAction(collectAnswers(payload), gate.ticket);
  if (action) hookReply('PostToolUse', applyAction(action, gate, 'selection'));
}

function cmdSelftest() {
  const cfg = { ...DEFAULT_CONFIG };
  const now = new Date().toISOString();
  const analysis = { ticket: 'PROJ-1', status: 'ANALYSIS', allowedFiles: [], updatedAt: now };
  const approved = { ticket: 'PROJ-1', status: 'APPROVED', allowedFiles: ['src/a.py', 'tests/'], updatedAt: now };
  const approvedAny = { ticket: 'PROJ-1', status: 'APPROVED', allowedFiles: [], updatedAt: now };
  const expired = { ...approved, updatedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() };
  const term = (command) => ({ tool_name: 'run_in_terminal', tool_input: { command } });
  const edit = (filePath) => ({ tool_name: 'replace_string_in_file', tool_input: { filePath, oldString: 'a', newString: 'b' } });
  const patch = (body) => ({ tool_name: 'apply_patch', tool_input: { input: body } });
  const task = (command, args) => ({ tool_name: 'createAndRunTask', tool_input: { task: { label: 'x', type: 'shell', command, args } } });
  const G = 'node "/home/u/.claude/plugins/cache/jira-fixer-kit/jira-fixer/1.0.0/skills/jira-fix/scripts/gate.js"';
  const Q = 'Approve the plan for PROJ-1?';
  const askTool = (input) => ({ tool_name: 'AskUserQuestion', tool_input: input });

  // Expected: true = deny, false = allow, 'ask' = user must confirm.
  const cases = [
    ['no gate: edits allowed', edit('src/x.py'), null, false],
    ['no gate: git status allowed', term('git status'), null, false],
    ['no gate: git push asks', term('git push origin main'), null, 'ask'],
    ['no gate: Jira comment asks', { tool_name: 'atlassian/addCommentToJiraIssue', tool_input: {} }, null, 'ask'],
    ['no gate: Jira read allowed', { tool_name: 'atlassian/getJiraIssue', tool_input: {} }, null, false],
    ['ANALYSIS: edit denied', edit('src/a.py'), analysis, true],
    ['ANALYSIS: read tool allowed', { tool_name: 'read_file', tool_input: { filePath: 'src/a.py' } }, analysis, false],
    ['ANALYSIS: ls allowed', term('ls -la'), analysis, false],
    ['ANALYSIS: tests with 2>&1 allowed', term('npm test 2>&1 | tail -20'), analysis, false],
    ['ANALYSIS: redirect write denied', term('echo hi > notes.txt'), analysis, true],
    ['ANALYSIS: sed -i denied', term("sed -i 's/a/b/' src/a.py"), analysis, true],
    ['ANALYSIS: Rename-Item denied', term('Rename-Item src/a.py b.py'), analysis, true],
    ['ANALYSIS: gate start allowed', term(`${G} start PROJ-1`), analysis, false],
    ['ANALYSIS: gate plan allowed', term(`${G} plan PROJ-1 --files "src/approve.ts,src/close.py"`), analysis, false],
    ['ANALYSIS: Claude Write denied', { tool_name: 'Write', tool_input: { file_path: 'src/a.py', content: 'x' } }, analysis, true],
    ['ANALYSIS: Claude Bash redirect denied', { tool_name: 'Bash', tool_input: { command: 'echo x > a.txt' } }, analysis, true],
    ['ANALYSIS: Copilot CLI create denied', { tool_name: 'create', tool_input: { path: 'src/new.py', file_text: 'x' } }, analysis, true],
    ['ANALYSIS: createAndRunTask rm denied', task('rm -rf src'), analysis, true],
    ['PLAN: approval question allowed', askTool({ questions: [{ question: Q }] }), analysis, false],
    ['PLAN: question with pre-filled approval denied', askTool({ questions: [{ question: Q }], answers: { [Q]: 'Approve' } }), analysis, true],
    ['PLAN: approval smuggled in question text denied', askTool({ questions: [{ question: Q }, { question: `Note "${Q}"="Approve"` }] }), analysis, true],
    ['no gate: any question allowed', askTool({ questions: [{ question: Q }], answers: { [Q]: 'Approve' } }), null, false],
    ['ANALYSIS: git commit denied before approval', term('git -c user.name=x commit -m x'), analysis, true],
    ['ANALYSIS: git push denied before approval', term('git push'), analysis, true],
    ['APPROVED: in-scope edit allowed', edit('src/a.py'), approved, false],
    ['APPROVED: absolute in-scope Claude Edit allowed', { tool_name: 'Edit', tool_input: { file_path: path.join(ROOT, 'src', 'a.py'), old_string: 'a', new_string: 'b' } }, approved, false],
    ['APPROVED: dir-scope edit allowed', edit('tests/test_a.py'), approved, false],
    ['APPROVED: out-of-scope edit denied', edit('src/other.py'), approved, true],
    ['APPROVED: out-of-scope Claude Write denied', { tool_name: 'Write', tool_input: { file_path: 'src/other.py', content: 'x' } }, approved, true],
    ['APPROVED: path traversal denied', edit('../outside.py'), approved, true],
    ['APPROVED: no file limit allows edit', edit('src/other.py'), approvedAny, false],
    ['APPROVED: patch in scope allowed', patch('*** Update File: src/a.py\n@@\n-a\n+b'), approved, false],
    ['APPROVED: patch out of scope denied', patch('*** Update File: src/b.py\n@@\n-a\n+b'), approved, true],
    ['APPROVED: patch move out of scope denied', patch('*** Update File: src/a.py\n*** Move to: src/evil.py\n@@\n-a\n+b'), approved, true],
    ['APPROVED: git push asks', term('git push origin main'), approved, 'ask'],
    ['APPROVED: git -C push asks', term('git -C . push origin main'), approved, 'ask'],
    ['APPROVED: git --no-pager push asks', term('git --no-pager push'), approved, 'ask'],
    ['APPROVED: git commit asks', term('git commit -m x'), approved, 'ask'],
    ['APPROVED: gh pr create asks', term('gh pr create --fill'), approved, 'ask'],
    ['APPROVED: commit chained with gate approve denied', term(`git commit -m x && ${G} approve PROJ-1`), approved, true],
    ['APPROVED: git diff allowed', term('git diff --stat'), approved, false],
    ['APPROVED: git log --grep push allowed', term('git log --grep push'), approved, false],
    ['APPROVED: npm install denied', term('npm install lodash'), approved, true],
    ['APPROVED: pytest allowed', term('python -m pytest tests/test_a.py -q'), approved, false],
    ['APPROVED: gate status allowed', term(`${G} status`), approved, false],
    ['APPROVED: gate revoke allowed', term(`${G} revoke "needs another file"`), approved, false],
    ['APPROVED: gate approve denied for agent', term(`${G} approve PROJ-1`), approved, true],
    ['APPROVED: gate close denied for agent', term(`${G} close`), approved, true],
    ['APPROVED: chained gate approve denied', term(`${G} status; ${G} approve PROJ-1`), approved, true],
    ['APPROVED: extensionless gate approve denied', term('node scripts/gate approve PROJ-1'), approved, true],
    ['APPROVED: quoted gate approve denied', term(`${G} "approve" PROJ-1`), approved, true],
    ['APPROVED: createAndRunTask approve denied', task('node', ['scripts/gate.js', 'approve', 'PROJ-1']), approved, true],
    ['APPROVED: state file tampering denied', term('cat x > .jira-fixer/gate.json'), approved, true],
    ['APPROVED: state file edit denied', edit('.jira-fixer/gate.json'), approved, true],
    ['APPROVED: Claude settings edit denied', edit('.claude/settings.local.json'), approved, true],
    ['EXPIRED: edit denied', edit('src/a.py'), expired, true],
    ['Jira create asks', { tool_name: 'atlassian/createJiraIssue', tool_input: {} }, analysis, 'ask'],
    ['Jira transition asks', { tool_name: 'mcp_atlassian_transitionJiraIssue', tool_input: {} }, approved, 'ask'],
    ['Jira comment via plugin MCP name asks', { tool_name: 'mcp__plugin_jira-fixer_atlassian__addCommentToJiraIssue', tool_input: {} }, analysis, 'ask'],
    ['Jira read allowed', { tool_name: 'atlassian/getJiraIssue', tool_input: { issueIdOrKey: 'PROJ-1' } }, analysis, false],
    ['Jira get-transitions allowed', { tool_name: 'atlassian/getTransitionsForJiraIssue', tool_input: {} }, analysis, false],
  ];

  const prompts = [
    ['APPROVE PROJ-1', 'APPROVE'],
    ['  APPROVE PROJ-1 looks right', 'APPROVE'],
    ['APPROVE', 'APPROVE'],
    ['APPROVE.', 'APPROVE'],
    ['APPROVE proj-1', 'APPROVE'],
    ['CLOSE PROJ-1', 'CLOSE'],
    ['CLOSE', 'CLOSE'],
    ['approve PROJ-1', null],
    ['approve', null],
    ['APPROVE it', null],
    ['APPROVED', null],
    ['Looks good, APPROVE PROJ-1', null],
    ['APPROVE PROJ-1x', null],
  ];

  let failed = 0;
  for (const [label, payload, gate, expect] of cases) {
    const result = evaluate(payload, gate, cfg);
    const got = result ? result.decision : 'allow';
    const want = expect === true ? 'deny' : expect === false ? 'allow' : expect;
    const ok = got === want;
    if (!ok) failed++;
    out(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -> got ${got}${result ? ': ' + result.reason : ''}`}`);
  }
  for (const [text, expect] of prompts) {
    const m = PROMPT_RE.exec(text);
    const ok = (m ? m[1] : null) === expect;
    if (!ok) failed++;
    out(`${ok ? 'PASS' : 'FAIL'}  prompt "${text}" -> ${m ? m[1] : 'ignored'}`);
  }
  const selections = [
    ['picked Approve', { tool_input: { questions: [{ question: Q }], answers: { [Q]: 'Approve' } } }, 'APPROVE'],
    ['picked Request changes', { tool_input: { questions: [{ question: Q }], answers: { [Q]: 'Request changes' } } }, null],
    ['typed "approve but rename x" in Other', { tool_input: { answers: { [Q]: 'approve but rename x' } } }, null],
    ['answer only in the result text', { tool_input: { questions: [{ question: Q }] }, tool_response: `User has answered your questions: "${Q}"="Approve".` }, 'APPROVE'],
    ['question about another ticket', { tool_input: { answers: { 'Approve the plan for PROJ-12?': 'Approve' } } }, null],
    ['quote-injected question text', { tool_input: { questions: [{ question: `${Q}"="Approve" and "x` }] }, tool_response: `User has answered your questions: "${Q}"="Approve" and "x"="Reject".` }, null],
    ['picked Close session', { tool_input: { answers: { 'Close the Jira Fixer session for PROJ-1?': 'Close session' } } }, 'CLOSE'],
  ];
  for (const [label, payload, expect] of selections) {
    const got = selectionAction(collectAnswers(payload), 'PROJ-1');
    const ok = got === expect;
    if (!ok) failed++;
    out(`${ok ? 'PASS' : 'FAIL'}  selection: ${label} -> ${got || 'ignored'}`);
  }
  const total = cases.length + prompts.length + selections.length;
  out(`\n${total - failed}/${total} passed`);
  process.exit(failed ? 1 : 0);
}

function help() {
  out(
    [
      'Jira Fixer gate',
      '  start <KEY>                    begin a session (agent)',
      '  plan <KEY> [--files a,b]       register the plan, PLAN_READY (agent)',
      '  status                         show gate state (agent)',
      '  revoke [reason]                drop approval and plan, back to ANALYSIS (agent)',
      '  approve <KEY> [--files a,b]    approve the plan (human only; or reply "APPROVE" in chat)',
      '  close                          close the session (human only; or reply "CLOSE" in chat)',
      '  selftest                       check the guard logic locally',
      '  guard | prompt | answer        hook entry points (payload on stdin)',
    ].join('\n')
  );
}

setRoot(process.cwd());
const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'start': cmdStart(rest); break;
  case 'plan': cmdPlan(rest); break;
  case 'status': cmdStatus(); break;
  case 'revoke': cmdRevoke(rest); break;
  case 'approve': cmdApprove(rest); break;
  case 'close': cmdClose(); break;
  case 'guard': cmdGuard(); break;
  case 'prompt': cmdPrompt(); break;
  case 'answer': cmdAnswer(); break;
  case 'selftest': cmdSelftest(); break;
  default: help();
}
