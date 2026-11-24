const COLOR_MODE_STORAGE_KEY = 'studysphere.studentColorMode';

const swatch = (role, hex) => {
  const value = hex.replace('#', '');
  return {
    role,
    hex: `#${value.toUpperCase()}`,
    rgb: `${parseInt(value.slice(0, 2), 16)}, ${parseInt(value.slice(2, 4), 16)}, ${parseInt(value.slice(4, 6), 16)}`,
    color: `#${value}`,
  };
};

export const COLOR_MODES = [
  {
    id: 'light-a',
    group: 'ライト',
    name: 'デイライト・ペーパー',
    description: '日中の学習向け。眩しさを抑えた紙の白です。',
    preview: {
      label: 'AI枠・ヘッダー',
      image: 'linear-gradient(180deg, #EEF2FF 0%, #F8FAFC 100%)',
    },
    swatches: [
      swatch('教科書の地', '#F9FAFB'),
      swatch('AI枠・ヘッダー（上）', '#EEF2FF'),
      swatch('AI枠・ヘッダー（下）', '#F8FAFC'),
      swatch('本文', '#1E293B'),
      swatch('補足・説明', '#64748B'),
      swatch('ボタン・強調', '#3B82F6'),
    ],
  },
  {
    id: 'light-b',
    group: 'ライト',
    name: 'ウォーム・セピア',
    description: '長時間の読書向け。暖色でブルーライトを減らします。',
    preview: {
      label: '画面全体',
      image: 'linear-gradient(135deg, #FAF6F0 0%, #F3ECE1 100%)',
    },
    swatches: [
      swatch('画面背景（上）', '#FAF6F0'),
      swatch('画面背景（下）', '#F3ECE1'),
      swatch('教科書カード', '#FDFBF7'),
      swatch('本文', '#2C2520'),
      swatch('補足・説明', '#786D63'),
      swatch('ボタン・強調', '#D97706'),
    ],
  },
  {
    id: 'dark-a',
    group: 'ダーク',
    name: 'ソフト・スレート',
    description: '灰色の背景と、刺さらない薄い白文字です。',
    preview: {
      label: '画面全体',
      image: 'linear-gradient(180deg, #2D3139 0%, #22252B 100%)',
    },
    swatches: [
      swatch('画面背景（上）', '#2D3139'),
      swatch('画面背景（下）', '#22252B'),
      swatch('教科書カード', '#282C34'),
      swatch('本文', '#CBD5E1'),
      swatch('補足・説明', '#8B949E'),
      swatch('ボタン・強調', '#38BDF8'),
    ],
  },
  {
    id: 'dark-b',
    group: 'ダーク',
    name: '深い黒',
    description: '背景はグラデーションのない、深い黒です。',
    preview: {
      label: '画面全体',
      color: '#0A0A0A',
    },
    swatches: [
      swatch('画面背景', '#0A0A0A'),
      swatch('ヘッダー・AI枠', '#141414'),
      swatch('教科書カード', '#1C1C1C'),
      swatch('本文', '#E8E8E8'),
      swatch('補足・説明', '#9A9A9A'),
      swatch('ボタン・強調', '#F5F5F5'),
    ],
  },
];

const COLOR_MODE_IDS = COLOR_MODES.map((mode) => mode.id);

export function readColorMode() {
  try {
    const stored = localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    if (stored === 'dark') return 'dark-a';
    if (stored === 'light') return 'light-a';
    if (COLOR_MODE_IDS.includes(stored)) return stored;
  } catch (error) {
    return 'light-a';
  }
  return 'light-a';
}

export function isStudentColorPath(pathname) {
  if (/\/instructor\/student(?:\/|$|-)/.test(pathname)) {
    return false;
  }
  return /\/student(?:\/|$)|\/student-login(?:\/|$)/.test(pathname);
}

export function applyStudentColorMode(mode) {
  const next = COLOR_MODE_IDS.includes(mode) ? mode : 'light-a';
  document.documentElement.setAttribute('data-student-color', next);
}

export function clearStudentColorMode() {
  document.documentElement.removeAttribute('data-student-color');
}

export function writeColorMode(mode) {
  const next = COLOR_MODE_IDS.includes(mode) ? mode : 'light-a';
  try {
    localStorage.setItem(COLOR_MODE_STORAGE_KEY, next);
  } catch (error) {
    // 保存できなくても、今開いている画面の見た目は切り替える
  }
  applyStudentColorMode(next);
  return next;
}

export function syncStudentColorMode(pathname) {
  if (isStudentColorPath(pathname)) {
    applyStudentColorMode(readColorMode());
    return;
  }
  clearStudentColorMode();
}
