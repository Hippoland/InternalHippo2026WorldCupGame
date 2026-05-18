const state = { matches: [], leaderboard: [], myPredictions: {} };
const $ = (id) => document.getElementById(id);

const savedName = localStorage.getItem('wc_player_name') || '';
const savedEmail = localStorage.getItem('wc_player_email') || '';
$('playerName').value = savedName;
$('playerEmail').value = savedEmail;
$('playerName').addEventListener('input', e => localStorage.setItem('wc_player_name', e.target.value.trim()));
$('playerEmail').addEventListener('input', e => localStorage.setItem('wc_player_email', e.target.value.trim().toLowerCase()));
$('refreshBtn').addEventListener('click', loadData);

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_' + Math.random().toString(36).slice(2);
    const url = new URL(window.APP_CONFIG.WEB_APP_URL);
    url.searchParams.set('action', action);
    url.searchParams.set('callback', callbackName);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value ?? ''));

    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Заявката отне твърде много време.'));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (data) => {
      cleanup();
      if (data && data.ok === false) reject(new Error(data.error || 'Възникна грешка.'));
      else resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error('Неуспешна връзка с Google Apps Script.'));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function setStatus(message, type = '') {
  const el = $('status');
  el.textContent = message;
  el.className = 'status ' + type;
}

function formatDeadline(value) {
  if (!value) return 'Няма краен срок';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('bg-BG', { dateStyle: 'medium', timeStyle: 'short' });
}

function isClosed(match) {
  if (!match.deadline_iso) return false;
  return new Date(match.deadline_iso).getTime() <= Date.now();
}

async function loadData() {
  try {
    if (!window.APP_CONFIG.WEB_APP_URL || window.APP_CONFIG.WEB_APP_URL.includes('PASTE_')) {
      setStatus('Първо попълни WEB_APP_URL в config.js.', 'error');
      return;
    }
    setStatus('Зареждане...');
    const email = $('playerEmail').value.trim().toLowerCase();
    const data = await jsonp('getData', { email });
    state.matches = data.matches || [];
    state.leaderboard = data.leaderboard || [];
    state.myPredictions = data.myPredictions || {};
    renderMatches();
    renderLeaderboard();
    setStatus(`Заредени са ${state.matches.length} отворени мача.`, 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderMatches() {
  const container = $('matches');
  container.innerHTML = '';
  if (!state.matches.length) {
    container.innerHTML = '<p class="muted">В момента няма отворени мачове за прогнози.</p>';
    return;
  }

  state.matches.forEach(match => {
    const previous = state.myPredictions[match.match_id] || {};
    const locked = isClosed(match);
    const card = document.createElement('div');
    card.className = 'match-card';
    card.innerHTML = `
      <div>
        <div class="match-meta">${escapeHtml(match.stage)} · краен срок: ${escapeHtml(formatDeadline(match.deadline_iso || match.deadline))}</div>
        <div class="teams">${escapeHtml(match.home_team)} <span class="muted">vs</span> ${escapeHtml(match.away_team)}</div>
      </div>
      <div class="prediction-box">
        <input type="number" min="0" max="30" inputmode="numeric" aria-label="Голове за ${escapeHtml(match.home_team)}" value="${previous.pred_home ?? ''}" ${locked ? 'disabled' : ''} />
        <span class="score-separator">:</span>
        <input type="number" min="0" max="30" inputmode="numeric" aria-label="Голове за ${escapeHtml(match.away_team)}" value="${previous.pred_away ?? ''}" ${locked ? 'disabled' : ''} />
        <button ${locked ? 'disabled' : ''}>Запази</button>
      </div>
    `;
    const [homeInput, awayInput] = card.querySelectorAll('input');
    const btn = card.querySelector('button');
    btn.addEventListener('click', () => submitPrediction(match, homeInput.value, awayInput.value, btn));
    container.appendChild(card);
  });
}

async function submitPrediction(match, predHome, predAway, btn) {
  const name = $('playerName').value.trim();
  const email = $('playerEmail').value.trim().toLowerCase();
  if (!name || !email) return setStatus('Попълни име и имейл преди да запазиш прогноза.', 'error');
  if (predHome === '' || predAway === '') return setStatus('Попълни и двата резултата.', 'error');
  if (Number(predHome) < 0 || Number(predAway) < 0) return setStatus('Резултатите не могат да са отрицателни.', 'error');

  try {
    btn.disabled = true;
    btn.textContent = 'Запис...';
    await jsonp('submitPrediction', {
      name, email,
      match_id: match.match_id,
      pred_home: Number(predHome),
      pred_away: Number(predAway)
    });
    setStatus('Прогнозата е записана успешно.', 'success');
    await loadData();
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Запази';
  }
}

function renderLeaderboard() {
  const tbody = $('leaderboard');
  tbody.innerHTML = '';
  if (!state.leaderboard.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Още няма класиране.</td></tr>';
    return;
  }
  state.leaderboard.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(row.name)}</td>
      <td><strong>${row.points}</strong></td>
      <td>${row.exact}</td>
      <td>${row.sign}</td>
      <td>${row.predictions}</td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

loadData();
