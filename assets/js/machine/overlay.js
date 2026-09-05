// 화면 위에 얹히는 글자와 조작부.
//
// 캔버스에 그리지 않고 DOM 으로 둔다. 이유는 두 가지다. 한글은 브라우저가
// 그리는 편이 훨씬 곱고, 그리고 이렇게 두면 장 목록이 항상 접근성 트리에
// 남는다. 캔버스 하나만 있는 화면은 스크린 리더에게 빈 상자다.

const NBSP = ' ';

export function buildOverlay(root, scenes, handlers) {
  const hud = root.querySelector('.machine__hud');
  const slugNo = root.querySelector('.machine__no');
  const slugName = root.querySelector('.machine__name');
  const krEl = root.querySelector('.machine__kr');
  const lineEl = root.querySelector('.machine__line');
  const numsEl = root.querySelector('.machine__nums');
  const listEl = root.querySelector('.machine__scenes');
  const railEl = root.querySelector('.machine__rail');
  const playedEl = root.querySelector('.machine__played');
  const headEl = root.querySelector('.machine__head');
  const clockEl = root.querySelector('.machine__clock');
  const playBtn = root.querySelector('[data-act="play"]');

  // ── 장 목록 ──
  // 접근성 대체 내용이면서 동시에 눈에 보이는 장 색인이다. 두 벌을 만들지
  // 않는다 — 하나가 두 일을 하면 어긋날 일이 없다.
  const total = scenes.reduce((a, s) => a + s.dur, 0);
  listEl.textContent = '';
  const items = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const li = document.createElement('li');
    li.className = 'machine__scene';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'machine__sceneBtn';
    btn.dataset.index = String(i);
    btn.innerHTML =
      '<span class="machine__sceneNo">' + s.no + '</span>' +
      '<span class="machine__sceneName">' + s.title + '</span>' +
      '<span class="machine__sceneKr">' + s.kr + '</span>';
    btn.addEventListener('click', () => handlers.goScene(i));
    li.appendChild(btn);
    listEl.appendChild(li);
    items.push({ li, btn });
  }

  // ── 진행 막대의 장 눈금 ──
  let at = 0;
  for (let i = 0; i < scenes.length; i++) {
    const tick = document.createElement('span');
    tick.className = 'machine__tick';
    tick.style.left = (at / total * 100) + '%';
    tick.title = scenes[i].no + ' ' + scenes[i].title;
    railEl.appendChild(tick);
    at += scenes[i].dur;
  }

  // ── 조작 ──
  root.querySelector('[data-act="prev"]').addEventListener('click', () => handlers.step(-1));
  root.querySelector('[data-act="next"]').addEventListener('click', () => handlers.step(1));
  playBtn.addEventListener('click', () => handlers.toggle());

  let railDrag = false;
  function railSeek(e) {
    const r = railEl.getBoundingClientRect();
    const x = (e.clientX - r.left) / Math.max(1, r.width);
    handlers.seekFraction(Math.max(0, Math.min(1, x)));
  }
  railEl.addEventListener('pointerdown', (e) => {
    railDrag = true;
    railEl.setPointerCapture(e.pointerId);
    railSeek(e);
  });
  railEl.addEventListener('pointermove', (e) => { if (railDrag) railSeek(e); });
  const endRail = () => { railDrag = false; };
  railEl.addEventListener('pointerup', endRail);
  railEl.addEventListener('pointercancel', endRail);
  railEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { handlers.nudge(-2); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { handlers.nudge(2); e.preventDefault(); }
  });

  let lastScene = -1;

  return {
    total,

    update(t, scene, film) {
      if (scene.index !== lastScene) {
        lastScene = scene.index;
        slugNo.textContent = scene.no;
        slugName.textContent = scene.title;
        krEl.textContent = scene.kr;
        lineEl.textContent = scene.line || NBSP;

        numsEl.textContent = '';
        const nums = scene.nums || [];
        for (let i = 0; i < nums.length; i++) {
          const d = document.createElement('span');
          d.className = 'machine__num';
          d.style.setProperty('--i', String(i));
          d.textContent = nums[i];
          numsEl.appendChild(d);
        }

        for (let i = 0; i < items.length; i++) {
          const on = i === scene.index;
          items[i].li.classList.toggle('is-current', on);
          items[i].li.classList.toggle('is-past', i < scene.index);
          if (on) items[i].btn.setAttribute('aria-current', 'true');
          else items[i].btn.removeAttribute('aria-current');
        }

        // 글자가 새로 들어오는 것을 CSS 에 알린다. 애니메이션을 다시
        // 시작시키려면 클래스를 뗐다 붙이는 것만으로는 안 되고 리플로가 필요하다.
        hud.classList.remove('is-in');
        void hud.offsetWidth;
        hud.classList.add('is-in');

        const canvas = root.querySelector('.machine__canvas');
        if (canvas) canvas.setAttribute('aria-label', scene.no + '장 ' + scene.title + '. ' + scene.kr + '. ' + (scene.line || ''));
      }

      const f = total > 0 ? t / total : 0;
      playedEl.style.transform = 'scaleX(' + f.toFixed(4) + ')';
      headEl.style.left = (f * 100).toFixed(3) + '%';
      railEl.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      railEl.setAttribute('aria-valuetext', scene.no + '장 ' + scene.title);
      clockEl.textContent = fmt(t) + ' / ' + fmt(total);

      playBtn.setAttribute('aria-label', film.playing ? '멈춤' : '재생');
      playBtn.classList.toggle('is-playing', film.playing);
      root.classList.toggle('is-ended', film.ended);
    },

    setReduced(on) { root.classList.toggle('is-reduced', on); }
  };
}

function fmt(sec) {
  const s = Math.max(0, Math.floor(sec));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
