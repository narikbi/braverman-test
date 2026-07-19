// Ядро данных: цвета нейромедиаторов, порядок осей и реестр языков.
// Тексты и вопросы — в content-ru.js и content-kk.js.
// Принадлежность вопроса к блоку используется ТОЛЬКО для подсчёта —
// проходящий тест не видит деления на блоки.

// Цвета не зависят от языка.
const NEURO_COLOR = {
  dopamine: '#FF6B6B',
  acetylcholine: '#7C5CFC',
  gaba: '#2DB58A',
  serotonin: '#F4A93D'
};

// Порядок ключей задаёт порядок осей на графике результата.
const NEURO_ORDER = ['dopamine', 'acetylcholine', 'gaba', 'serotonin'];

// Доступные языки. RU и KK объявлены в content-ru.js / content-kk.js.
const CONTENT = { ru: RU, kk: KK };

const LANGS = [
  { code: 'ru', label: 'Рус' },
  { code: 'kk', label: 'Қаз' }
];
