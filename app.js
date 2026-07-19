// ============================================================
//  НАСТРОЙКА: URL вашего Google Apps Script Web App.
//  Инструкция — в README.md.
// ============================================================
const SHEET_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzoufS3rbkK19yHu3lwpzjL8VKOo-bA262nsatcqPZ1XF-UUA21mLlc6gISv_6VBFWLpA/exec';

const STORAGE_KEY = 'braverman_progress_v1';
const LANG_KEY = 'braverman_lang';

// ---------- Состояние ----------
let lang = localStorage.getItem(LANG_KEY) || 'ru';
if (!CONTENT[lang]) lang = 'ru';

const state = {
  name: '',
  order: [],   // заполняется в applyLang()
  answers: [],
  index: 0
};

let chartInstance = null;

// Текущий языковой пакет
const T = () => CONTENT[lang];

// Строит единый список вопросов: по одному из каждого блока по кругу,
// чтобы подряд не шли тематически однородные пункты (тест ощущается цельным).
// Индексы одинаковы во всех языках, поэтому ответы при смене языка не теряются.
function buildOrder() {
  const Q = T().questions;
  const order = [];
  const maxLen = Math.max(...NEURO_ORDER.map((k) => Q[k].length));
  for (let i = 0; i < maxLen; i++) {
    for (const key of NEURO_ORDER) {
      if (i < Q[key].length) order.push({ neuro: key, text: Q[key][i] });
    }
  }
  return order;
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const screens = { intro: $('intro'), quiz: $('quiz'), result: $('result') };

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- Язык ----------
function renderLangSwitch() {
  const box = $('langSwitch');
  box.innerHTML = '';
  LANGS.forEach((l) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-btn' + (l.code === lang ? ' active' : '');
    b.textContent = l.label;
    b.addEventListener('click', () => setLang(l.code));
    box.appendChild(b);
  });
}

function setLang(code) {
  if (!CONTENT[code] || code === lang) return;
  lang = code;
  try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
  applyLang();
}

// Проставляет все статичные надписи из языкового пакета
function applyLang() {
  const u = T().ui;

  document.documentElement.lang = lang;
  document.title = u.htmlTitle;

  $('t-badge').textContent = u.badge;
  $('t-h1').innerHTML = u.h1;
  $('t-lead').textContent = u.lead;
  $('t-factMinutes').textContent = u.factMinutes;
  $('t-factQuestions').textContent = u.factQuestions;
  $('t-factNeuro').textContent = u.factNeuro;
  $('t-nameLabel').textContent = u.nameLabel;
  $('nameInput').placeholder = u.namePlaceholder;
  $('nameError').textContent = u.nameError;
  $('startBtn').textContent = u.startBtn;
  $('t-startHint').textContent = u.startHint;

  $('backBtn').textContent = u.back;
  $('yesBtn').textContent = u.yes;
  $('noBtn').textContent = u.no;
  $('t-keyHint').innerHTML = u.keyHint;

  $('t-resultEyebrow').textContent = u.resultEyebrow;
  $('t-chartTitle').textContent = u.chartTitle;
  $('downloadBtn').textContent = u.download;
  $('restartBtn').textContent = u.restart;

  renderLangSwitch();

  // Вопросы перестраиваем на новом языке (индексы совпадают — ответы целы)
  state.order = buildOrder();
  if (screens.quiz.classList.contains('active')) renderQuestion();
}

// ---------- Вступление ----------
$('startBtn').addEventListener('click', startTest);
$('nameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') startTest();
});

function startTest() {
  const name = $('nameInput').value.trim();
  if (!name) {
    $('nameError').hidden = false;
    $('nameInput').focus();
    return;
  }
  $('nameError').hidden = true;
  state.name = name;
  state.answers = [];
  state.index = 0;
  saveProgress();
  showScreen('quiz');
  renderQuestion();
}

// ---------- Вопросы ----------
$('yesBtn').addEventListener('click', () => answer(1));
$('noBtn').addEventListener('click', () => answer(0));
$('backBtn').addEventListener('click', goBack);

document.addEventListener('keydown', (e) => {
  if (!screens.quiz.classList.contains('active')) return;
  if (e.key === '1') answer(1);
  else if (e.key === '2') answer(0);
  else if (e.key === 'Backspace' || e.key === 'ArrowLeft') { e.preventDefault(); goBack(); }
});

function renderQuestion() {
  const total = state.order.length;
  const i = state.index;

  $('qIndex').textContent = String(i + 1).padStart(2, '0');
  $('questionText').textContent = state.order[i].text;
  $('counter').textContent = T().ui.counter(i + 1, total);
  $('progressBar').style.width = `${(i / total) * 100}%`;
  $('backBtn').disabled = i === 0;

  const card = $('quizCard');
  card.classList.remove('swap');
  void card.offsetWidth; // перезапуск анимации
  card.classList.add('swap');
}

function answer(value) {
  state.answers[state.index] = value;
  saveProgress();

  if (state.index < state.order.length - 1) {
    state.index++;
    renderQuestion();
  } else {
    finish();
  }
}

function goBack() {
  if (state.index === 0) return;
  state.index--;
  renderQuestion();
}

// ---------- Подсчёт (абсолютные баллы: число «Да» по блоку) ----------
function computeScores() {
  const counts = { dopamine: 0, acetylcholine: 0, gaba: 0, serotonin: 0 };
  state.order.forEach((q, i) => {
    if (state.answers[i] === 1) counts[q.neuro]++;
  });
  const max = {};
  NEURO_ORDER.forEach((k) => { max[k] = T().questions[k].length; });
  return { counts, max };
}

// Доминанта/минимум — по доле (баллы / число вопросов в блоке),
// чтобы сравнение было корректным, даже если блоки разной длины.
function dominantOf(val) {
  return NEURO_ORDER.reduce((best, k) => (val[k] > val[best] ? k : best), NEURO_ORDER[0]);
}
function lowestOf(val) {
  return NEURO_ORDER.reduce((low, k) => (val[k] < val[low] ? k : low), NEURO_ORDER[0]);
}

// ---------- Завершение ----------
function finish() {
  $('progressBar').style.width = '100%';
  const { counts, max } = computeScores();
  const prop = {};
  NEURO_ORDER.forEach((k) => { prop[k] = max[k] ? counts[k] / max[k] : 0; });
  const domKey = dominantOf(prop);
  const lowKey = lowestOf(prop);

  renderResult(counts, max, domKey, lowKey);
  showScreen('result');
  renderChart(counts, max, domKey);
  clearProgress();

  submitToSheet({
    name: state.name,
    dopamine: counts.dopamine,
    acetylcholine: counts.acetylcholine,
    gaba: counts.gaba,
    serotonin: counts.serotonin,
    dominant: T().neuro[domKey].name,
    lobe: T().neuro[domKey].lobe,
    lang: lang
  });
}

function renderResult(counts, max, domKey, lowKey) {
  const N = T().neuro;
  const dom = N[domKey];
  $('dominantTitle').textContent = dom.title;
  $('dominantMeta').textContent = `${dom.name} · ${dom.lobe} · ${dom.func}`;
  $('dominantDesc').textContent = dom.description;

  // Список абсолютных баллов с мини-полосками
  const list = $('scoreList');
  list.innerHTML = '';
  NEURO_ORDER.forEach((k) => {
    const color = NEURO_COLOR[k];
    const fillW = max[k] ? Math.round((counts[k] / max[k]) * 100) : 0;
    const li = document.createElement('li');
    li.innerHTML =
      `<span class="dot" style="background:${color}"></span>` +
      `<span class="label">${N[k].name}</span>` +
      `<span class="track"><span class="fill" style="width:${fillW}%;background:${color}"></span></span>` +
      `<span class="pct">${counts[k]} / ${max[k]}</span>`;
    list.appendChild(li);
  });

  const low = N[lowKey];
  $('lowNote').innerHTML =
    `<b>${T().ui.lowPrefix} — ${low.name} (${counts[lowKey]} / ${max[lowKey]}):</b> ${low.lowNote}`;
}

// ---------- График ----------
function renderChart(counts, max, domKey) {
  const ctx = $('chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();

  const N = T().neuro;
  const labels = NEURO_ORDER.map((k) => N[k].name);
  const data = NEURO_ORDER.map((k) => counts[k]);
  const yMax = Math.max(...NEURO_ORDER.map((k) => max[k]));
  const pointColors = NEURO_ORDER.map((k) => NEURO_COLOR[k]);
  const pointSizes = NEURO_ORDER.map((k) => (k === domKey ? 10 : 6));

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#C7CBDA',
        borderWidth: 2,
        tension: 0.3,
        fill: false,
        pointBackgroundColor: pointColors,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: pointSizes,
        pointHoverRadius: pointSizes.map((s) => s + 2)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => T().ui.tooltip(c.parsed.y, yMax) } }
      },
      scales: {
        y: {
          min: 0, max: yMax,
          ticks: { stepSize: Math.max(1, Math.round(yMax / 5)), color: '#9AA0AE' },
          grid: { color: '#EEF0F4' }
        },
        x: {
          ticks: { color: '#4B5563', font: { size: 13, weight: '600' } },
          grid: { display: false }
        }
      }
    }
  });
}

$('downloadBtn').addEventListener('click', () => {
  if (!chartInstance) return;
  const link = document.createElement('a');
  link.download = `${T().ui.fileName}-${state.name || 'result'}.png`;
  link.href = chartInstance.toBase64Image('image/png', 1);
  link.click();
});

$('restartBtn').addEventListener('click', () => {
  state.name = '';
  state.answers = [];
  state.index = 0;
  $('nameInput').value = '';
  clearProgress();
  showScreen('intro');
});

// ---------- Отправка в Google Sheet ----------
async function submitToSheet(payload) {
  const status = $('saveStatus');
  if (!SHEET_ENDPOINT || SHEET_ENDPOINT.includes('PASTE')) {
    status.textContent = '';
    return;
  }
  try {
    await fetch(SHEET_ENDPOINT, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify(payload)
    });
    status.textContent = T().ui.saved;
  } catch (err) {
    console.error('Не удалось отправить результат:', err);
    status.textContent = T().ui.notSaved;
  }
}

// ---------- Сохранение прогресса ----------
function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      name: state.name, answers: state.answers, index: state.index
    }));
  } catch (e) { /* localStorage недоступен — игнорируем */ }
}
function clearProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}
function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved.name || !Array.isArray(saved.answers) || saved.answers.length === 0) return false;
    state.name = saved.name;
    state.answers = saved.answers;
    state.index = Math.min(saved.index || 0, state.order.length - 1);
    $('nameInput').value = saved.name;
    showScreen('quiz');
    renderQuestion();
    return true;
  } catch (e) { return false; }
}

// ---------- Старт ----------
applyLang();    // строит state.order и проставляет надписи
loadProgress(); // если есть незавершённая сессия — продолжаем с того же места
