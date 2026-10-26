const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-in-production';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'submissions.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure data dir
const dataDir = path.dirname(DATA_FILE);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const Q1_OPTIONS = [
  "Small pop-up window showing either Compliant or Non-Compliant.",
  "Large pop-up window with details explaining why a furnace is Compliant or Non-Compliant.",
  "Flashing indicator or light: green for Compliant and red for Non-Compliant.",
  "Customizable combination of the first three options.",
  "None of the above."
];
const Q2_OPTIONS = [
  "Simple acknowledgment pop-up before starting a recipe, whether the furnace is Compliant or Non-Compliant.",
  "Warning pop-up requiring a supervisor’s override when the furnace is Non-Compliant.",
  "Full furnace lockout until compliance has been restored.",
  "Customizable combination of the first three options.",
  "None of the above."
];

function validateRanks(ranks) {
  if (!Array.isArray(ranks) || ranks.length !== 5) return false;
  const set = new Set(ranks);
  if (set.size !== 5) return false;
  for (const r of ranks) {
    if (typeof r !== 'number' || r < 1 || r > 5 || !Number.isInteger(r)) return false;
  }
  return true;
}

function hashIp(ip) {
  return crypto.createHash('sha256').update(ip + (process.env.IP_SALT || 'c3survey')).digest('hex').slice(0, 16);
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getMime(ext) {
  const mimes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json' };
  return mimes[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS for same origin mostly
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API routes
  if (pathname === '/api/submit' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { clientToken, q1Ranks, q1Comment = '', q2Ranks, q2Comment = '' } = payload;
        if (!clientToken || typeof clientToken !== 'string' || clientToken.length < 10 || clientToken.length > 100) {
          return sendJSON(res, 400, { error: 'Invalid submission token' });
        }
        if (!validateRanks(q1Ranks) || !validateRanks(q2Ranks)) {
          return sendJSON(res, 400, { error: 'Invalid rankings. Each question must have unique ranks 1-5.' });
        }
        if (typeof q1Comment !== 'string' || q1Comment.length > 2000 || typeof q2Comment !== 'string' || q2Comment.length > 2000) {
          return sendJSON(res, 400, { error: 'Comments too long (max 2000 characters)' });
        }

        const data = loadData();
        if (data.some(s => s.client_token === clientToken)) {
          return sendJSON(res, 409, { error: 'This response has already been submitted. Please refresh the page if you need to start over.' });
        }

        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
        const submission = {
          id: data.length + 1,
          client_token: clientToken,
          q1_ranks: q1Ranks,
          q1_comment: q1Comment.trim(),
          q2_ranks: q2Ranks,
          q2_comment: q2Comment.trim(),
          created_at: new Date().toISOString(),
          ip_hash: hashIp(ip)
        };
        data.push(submission);
        saveData(data);
        sendJSON(res, 200, { success: true, id: submission.id });
      } catch (err) {
        console.error(err);
        sendJSON(res, 500, { error: 'Server error. Please try again.' });
      }
    });
    return;
  }

  if (pathname === '/api/results' && req.method === 'GET') {
    try {
      const rows = loadData();
      const total = rows.length;

      function computeAggregate(rankArrays) {
        const points = Array(5).fill(0);
        const firsts = Array(5).fill(0);
        const rankSums = Array(5).fill(0);
        for (const ranks of rankArrays) {
          for (let i = 0; i < 5; i++) {
            const rank = ranks[i];
            points[i] += (6 - rank);
            rankSums[i] += rank;
            if (rank === 1) firsts[i]++;
          }
        }
        const items = points.map((pts, i) => ({
          optionIndex: i,
          points: pts,
          firstPlace: firsts[i],
          avgRank: total ? +(rankSums[i] / total).toFixed(2) : 0
        }));
        items.sort((a, b) => b.points - a.points || b.firstPlace - a.firstPlace);
        let rank = 1;
        for (let i = 0; i < items.length; i++) {
          if (i > 0 && items[i].points < items[i - 1].points) rank = i + 1;
          items[i].overallRank = rank;
        }
        return items;
      }

      sendJSON(res, 200, {
        totalSubmissions: total,
        question1: {
          title: "How should compliance status appear in your ERP?",
          options: Q1_OPTIONS,
          results: computeAggregate(rows.map(r => r.q1_ranks))
        },
        question2: {
          title: "Rank your preferred ERP response before a recipe begins.",
          options: Q2_OPTIONS,
          results: computeAggregate(rows.map(r => r.q2_ranks))
        }
      });
    } catch (err) {
      console.error(err);
      sendJSON(res, 500, { error: 'Failed to compute results' });
    }
    return;
  }

  function checkAdmin(req) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return false;
    return auth.slice(7) === ADMIN_PASSWORD;
  }

  if (pathname === '/api/admin/submissions' && req.method === 'GET') {
    if (!checkAdmin(req)) return sendJSON(res, 401, { error: 'Unauthorized' });
    const rows = loadData().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    sendJSON(res, 200, rows);
    return;
  }

  if (pathname === '/api/admin/export.csv' && req.method === 'GET') {
    if (!checkAdmin(req)) return sendJSON(res, 401, { error: 'Unauthorized' });
    const rows = loadData().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    let csv = 'id,created_at,q1_rank1,q1_rank2,q1_rank3,q1_rank4,q1_rank5,q1_comment,q2_rank1,q2_rank2,q2_rank3,q2_rank4,q2_rank5,q2_comment\n';
    for (const r of rows) {
      const esc = (s) => `"${(s || '').replace(/"/g, '""')}"`;
      csv += [r.id, r.created_at, ...r.q1_ranks, esc(r.q1_comment), ...r.q2_ranks, esc(r.q2_comment)].join(',') + '\n';
    }
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="c3-survey-export.csv"'
    });
    res.end(csv);
    return;
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    sendJSON(res, 200, { ok: true, submissions: loadData().length });
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(PUBLIC_DIR, filePath);
  if (!fullPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': getMime(ext) });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`C3 Data Survey running on port ${PORT}`);
});
