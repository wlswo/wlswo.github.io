/*
 * 모양(라이트 · 다크)
 *
 * 맥의 '모양' 설정처럼 자동(시스템을 따름) · 라이트 · 다크 가운데 하나.
 * 고른 것은 기억하고, html[data-theme] 에 실제로 쓸 쪽(light · dark)을 적는다.
 * 첫 그림 전에는 head.html 의 작은 스크립트가 같은 일을 먼저 한다.
 */
const KEY = 'ephemeris:appearance';
const dark = matchMedia('(prefers-color-scheme: dark)');

export function getAppearance() {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

function apply() {
  const v = getAppearance();
  const isDark = v === 'dark' || (v === 'auto' && dark.matches);
  const root = document.documentElement;
  if (root.dataset.theme !== (isDark ? 'dark' : 'light')) root.dataset.theme = isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#1c1c1e' : '#ffffff');
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', isDark ? 'dark' : 'light');
  for (const item of document.querySelectorAll('[data-appearance]')) {
    item.setAttribute('aria-checked', String(item.dataset.appearance === v));
  }
  dispatchEvent(new CustomEvent('ephemeris:theme', { detail: { appearance: v, dark: isDark } }));
}

export function setAppearance(v) {
  try {
    localStorage.setItem(KEY, v);
  } catch {}
  apply();
}

dark.addEventListener('change', apply);
for (const item of document.querySelectorAll('[data-appearance]')) {
  item.addEventListener('click', () => setAppearance(item.dataset.appearance));
}
apply();
