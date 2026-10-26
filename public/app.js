// Client token for duplicate prevention
const CLIENT_TOKEN = crypto.randomUUID ? crypto.randomUUID() : 'tok-' + Math.random().toString(36).slice(2) + Date.now();

function updateRankNumbers(list) {
  const items = list.querySelectorAll('.rank-item');
  items.forEach((item, idx) => {
    item.querySelector('.rank-number').textContent = idx + 1;
  });
}

function setupRanking(listId) {
  const list = document.getElementById(listId);
  updateRankNumbers(list);

  // Sortable drag-drop
  new Sortable(list, {
    animation: 150,
    ghostClass: 'dragging',
    onEnd: () => updateRankNumbers(list)
  });

  // Up/down buttons (accessible, mobile, keyboard)
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.preventDefault();
    const item = btn.closest('.rank-item');
    if (!item) return;
    if (btn.getAttribute('aria-label') === 'Move up') {
      const prev = item.previousElementSibling;
      if (prev) list.insertBefore(item, prev);
    } else if (btn.getAttribute('aria-label') === 'Move down') {
      const next = item.nextElementSibling;
      if (next) list.insertBefore(next, item);
    }
    updateRankNumbers(list);
  });

  // Keyboard support on items
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const item = e.target.closest('.rank-item');
    if (!item) return;
    e.preventDefault();
    if (e.key === 'ArrowUp') {
      const prev = item.previousElementSibling;
      if (prev) list.insertBefore(item, prev);
    } else {
      const next = item.nextElementSibling;
      if (next) list.insertBefore(next, item);
    }
    updateRankNumbers(list);
    item.focus();
  });

  // Make items focusable
  list.querySelectorAll('.rank-item').forEach(item => item.setAttribute('tabindex', '0'));
}

setupRanking('q1-list');
setupRanking('q2-list');

function getRanks(listId) {
  const list = document.getElementById(listId);
  const ranks = new Array(5).fill(0);
  const items = list.querySelectorAll('.rank-item');
  items.forEach((item, position) => {
    const opt = parseInt(item.dataset.option, 10) - 1; // 0-based
    ranks[opt] = position + 1; // 1 = best (top)
  });
  return ranks;
}

document.getElementById('survey-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  const msg = document.getElementById('message');
  btn.disabled = true;
  msg.style.display = 'none';

  const payload = {
    clientToken: CLIENT_TOKEN,
    q1Ranks: getRanks('q1-list'),
    q1Comment: document.getElementById('q1-feedback').value,
    q2Ranks: getRanks('q2-list'),
    q2Comment: document.getElementById('q2-feedback').value
  };

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok && data.success) {
      msg.className = 'message success';
      msg.textContent = 'Thank you! Your response has been recorded successfully.';
      msg.style.display = 'block';
      document.getElementById('survey-form').querySelectorAll('textarea, button').forEach(el => el.disabled = true);
    } else {
      msg.className = 'message error';
      msg.textContent = data.error || 'Submission failed. Please try again.';
      msg.style.display = 'block';
      btn.disabled = false;
    }
  } catch (err) {
    msg.className = 'message error';
    msg.textContent = 'Network error. Please check your connection and try again. Your rankings are preserved.';
    msg.style.display = 'block';
    btn.disabled = false;
  }
});
