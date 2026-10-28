#!/usr/bin/env node
// 站台冊命令列工具：不開瀏覽器，直接讀寫 repo 裡的 data.enc（格式與 index.html 相同）。
// 通關密碼讀 ~/.test-sites-pass，GitHub token 讀 ~/.github-token；兩者都不會印出來。
//
//   node tools/ts.mjs list                 列出站名（不含任何密碼欄）
//   node tools/ts.mjs show <站名>           顯示一站（密碼欄遮掉）
//   node tools/ts.mjs upsert <json檔>       依站名新增或更新一站（只改 json 裡有的欄位）
//   加 --dry 只驗證、不推上 GitHub
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { webcrypto as crypto } from 'node:crypto';

const OWNER = 'xd1104', REPO = 'test-sites', BRANCH = 'main', DATA_PATH = 'data.enc', MAGIC = 'TSV1:';
const SECRET = new Set(['fePassword', 'boPassword']);
const enc = new TextEncoder(), dec = new TextDecoder();

function readSecret(name, label) {
  try { return readFileSync(join(homedir(), name), 'utf8').replace(/^﻿/, '').trim(); }
  catch { throw new Error(`找不到 ~/${name}（${label}）`); }
}

async function deriveKey(password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptJSON(password, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(28 + ct.length);
  out.set(salt, 0); out.set(iv, 16); out.set(ct, 28);
  return MAGIC + Buffer.from(out).toString('base64');
}
async function decryptJSON(password, payload) {
  const buf = Buffer.from(payload.startsWith(MAGIC) ? payload.slice(MAGIC.length) : payload, 'base64');
  const key = await deriveKey(password, buf.subarray(0, 16));
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.subarray(16, 28) }, key, buf.subarray(28));
    return JSON.parse(dec.decode(pt));
  } catch { throw new Error('解不開：~/.test-sites-pass 的通關密碼不對'); }
}

function gh(token, path, init = {}) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(init.headers || {}) },
  });
}
async function pull(token) {
  const r = await gh(token, `/contents/${DATA_PATH}?ref=${BRANCH}`);
  if (!r.ok) throw new Error(`讀不到 data.enc：HTTP ${r.status}`);
  const j = await r.json();
  return { sha: j.sha, text: Buffer.from(j.content, 'base64').toString('utf8') };
}
async function push(token, sha, payload, message) {
  const r = await gh(token, `/contents/${DATA_PATH}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(payload).toString('base64'), branch: BRANCH, sha }),
  });
  if (r.status === 409 || r.status === 422) throw new Error('有人剛存過，重跑一次即可');
  if (!r.ok) throw new Error(`儲存失敗 HTTP ${r.status}`);
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const masked = s => Object.fromEntries(Object.entries(s).map(([k, v]) =>
  [k, SECRET.has(k) ? (v ? '（已填）' : '') : k === 'moreAccounts' ? (v || []).map(a => ({ ...a, pwd: a.pwd ? '（已填）' : '' })) : v]));

const [cmd, arg] = process.argv.slice(2).filter(a => a !== '--dry');
const dry = process.argv.includes('--dry');
const pass = readSecret('.test-sites-pass', '站台冊通關密碼');
const token = readSecret('.github-token', 'GitHub token');
const remote = await pull(token);
const data = await decryptJSON(pass, remote.text);
const sites = data.sites || (data.sites = []);

if (cmd === 'list') {
  for (const s of sites) console.log(`${s.system}\t${s.name}\t${s.testStage || ''}\t${s.lastTested || ''}`);
} else if (cmd === 'show') {
  const s = sites.find(x => x.name === arg);
  if (!s) throw new Error(`沒有這個站：${arg}`);
  console.log(JSON.stringify(masked(s), null, 1));
} else if (cmd === 'upsert') {
  const patch = JSON.parse(readFileSync(arg, 'utf8').replace(/^﻿/, ''));
  if (!patch.name || !patch.system) throw new Error('json 至少要有 name 與 system');
  const now = new Date().toISOString();
  let s = sites.find(x => x.name === patch.name);
  const added = !s;
  if (added) { s = { id: uid(), status: '使用中', moreAccounts: [] }; sites.push(s); }
  Object.assign(s, patch, { updatedAt: now });
  data.updatedAt = now;
  console.log(`${added ? '新增' : '更新'}：${s.name}（共 ${sites.length} 站）`);
  if (dry) console.log('--dry：沒有推上 GitHub');
  else {
    await push(token, remote.sha, await encryptJSON(pass, data), `${added ? '新增' : '更新'}站台：${s.name}`);
    const back = await decryptJSON(pass, (await pull(token)).text);
    if (!back.sites.some(x => x.name === s.name)) throw new Error('推上去了但讀回來找不到，請檢查');
    console.log('已存進 GitHub，讀回確認 OK');
  }
} else {
  console.log('用法：node tools/ts.mjs list | show <站名> | upsert <json檔> [--dry]');
}
