const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_WORKS = 5000;
const MAX_BYTES = 5 * 1024 * 1024;

function snapshotPath() {
  const directory = process.env.RESEARCH_DESK_CACHE_DIR || (process.env.NETLIFY ? os.tmpdir() : path.join(__dirname, '../../.cache'));
  return path.join(directory, 'citation-snapshots.json');
}

function readSnapshots() {
  try { return JSON.parse(fs.readFileSync(snapshotPath(), 'utf8')); } catch { return {}; }
}

function writeSnapshots(snapshots) {
  const target = snapshotPath();
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(snapshots), 'utf8');
    fs.renameSync(temporary, target);
    return true;
  } catch { return false; }
}

function recordSnapshot(workId, timeline, retrievedAt = new Date().toISOString()) {
  if (!workId || !Array.isArray(timeline)) return false;
  const snapshots = readSnapshots();
  const history = Array.isArray(snapshots[workId]) ? snapshots[workId] : [];
  history.push({ retrievedAt, timeline });
  snapshots[workId] = history.slice(-12);
  const keys = Object.keys(snapshots).slice(-MAX_WORKS);
  const bounded = Object.fromEntries(keys.map((key) => [key, snapshots[key]]));
  if (Buffer.byteLength(JSON.stringify(bounded), 'utf8') > MAX_BYTES) return false;
  return writeSnapshots(bounded);
}

function getSnapshotHistory(workId) { return readSnapshots()[workId] || []; }

module.exports = { recordSnapshot, getSnapshotHistory, snapshotPath, MAX_WORKS, MAX_BYTES };