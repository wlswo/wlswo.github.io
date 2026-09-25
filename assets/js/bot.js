/*
 * 캐릭터의 시선(bot.html)
 *
 * 마우스(손가락)가 움직이면 화면에 떠 있는 캐릭터마다 두 눈이 그쪽으로 옮겨 가
 * 쳐다보고, 옆을 볼수록 눈이 조금 좁아진다(동그라미가 고개를 돌린 것처럼).
 * 몸도 그쪽으로 살짝 쏠린다. 멀리 있을수록 끝까지 쳐다본다.
 * 창을 새로 열어 캐릭터가 생겨도 따로 할 일이 없게, 움직일 때마다 찾아 쓴다.
 */
const EYE_X = 20; // 눈이 옮겨 갈 수 있는 거리(viewBox 단위, 반지름 56)
const EYE_Y = 17;
const LEAN = 3; // 몸이 쏠리는 거리
const REACH = 320; // 이만큼 떨어지면 끝까지 본다(px)

let pointer = null;
let raf = 0;

const clamp = (v) => Math.max(-1, Math.min(1, v));

function look() {
  raf = 0;
  for (const bot of document.querySelectorAll('[data-bot]')) {
    const r = bot.getBoundingClientRect();
    if (!r.width) continue;
    const face = bot.querySelector('[data-bot-face]');
    const head = bot.querySelector('[data-bot-head]');
    if (!pointer) {
      face.style.transform = '';
      head.style.transform = '';
      continue;
    }
    const nx = clamp((pointer.x - (r.left + r.width / 2)) / REACH);
    const ny = clamp((pointer.y - (r.top + r.height / 2)) / REACH);
    const squeeze = 1 - Math.abs(nx) * 0.18;
    face.style.transform = `translate(${(nx * EYE_X).toFixed(2)}px, ${(ny * EYE_Y).toFixed(2)}px) scaleX(${squeeze.toFixed(3)})`;
    head.style.transform = `translate(${(nx * LEAN).toFixed(2)}px, ${(ny * LEAN).toFixed(2)}px)`;
  }
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(look);
}

addEventListener(
  'pointermove',
  (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    schedule();
  },
  { passive: true },
);
// 마우스가 창 밖으로 나가면 앞을 본다.
document.documentElement.addEventListener('pointerleave', () => {
  pointer = null;
  schedule();
});
