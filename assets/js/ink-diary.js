/*
 * Tom Riddle's Diary
 * 한 글자씩 잉크가 배어 나오고, 잠시 머물렀다가 종이에 스며들어 사라진다.
 */
(function () {
  'use strict';

  var QUOTES = [
    { text: 'Talk is cheap. Show me the code.', by: 'Linus Torvalds' },
    { text: 'Premature optimization is the root of all evil.', by: 'Donald Knuth' },
    { text: 'There are only two hard things in Computer Science: cache invalidation and naming things.', by: 'Phil Karlton' },
    { text: 'Simplicity is prerequisite for reliability.', by: 'Edsger W. Dijkstra' },
    { text: 'Programs must be written for people to read, and only incidentally for machines to execute.', by: 'Harold Abelson' },
    { text: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.', by: 'Martin Fowler' },
    { text: 'First, solve the problem. Then, write the code.', by: 'John Johnson' },
    { text: 'It works on my machine.', by: 'every developer, at least once' },
    { text: 'Weeks of coding can save you hours of planning.', by: 'anonymous' },
    { text: 'The best error message is the one that never shows up.', by: 'Thomas Fuchs' },
    { text: 'Deleted code is debugged code.', by: 'Jeff Sickel' },
    { text: 'Make it work, make it right, make it fast.', by: 'Kent Beck' },
    { text: 'Debugging is twice as hard as writing the code in the first place.', by: 'Brian Kernighan' },
    { text: 'If you think good architecture is expensive, try bad architecture.', by: 'Brian Foote' },
    { text: 'Code never lies, comments sometimes do.', by: 'Ron Jeffries' },
    { text: 'It is not a bug. It is an undocumented feature.', by: 'anonymous' },
    { text: 'A user interface is like a joke. If you have to explain it, it is not that good.', by: 'Martin LeBlanc' },
    { text: 'Everything is a tradeoff.', by: 'anonymous' },
    { text: 'Own your code. Nobody else will.', by: 'anonymous' },
    { text: 'The computer was born to solve problems that did not exist before.', by: 'Bill Gates' }
  ];

  // 타이밍 (ms)
  var WRITE_SPEED = 55; // 글자당 필기 속도
  var PAUSE_COMMA = 180; // 쉼표 뒤 호흡
  var PAUSE_PERIOD = 340; // 마침표 뒤 호흡
  var HOLD = 5000; // 다 쓰고 머무는 시간
  var SOAK_SPEED = 26; // 스며들며 사라지는 속도
  var GAP = 1400; // 다음 문장까지 간격

  var line = document.getElementById('ink-line');
  var attrib = document.getElementById('ink-attrib');
  if (!line || !attrib) return;

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 매 방문마다 다른 순서로. 한 바퀴 다 돌기 전엔 같은 문장이 반복되지 않는다.
  var order = QUOTES.map(function (_, i) { return i; });
  for (var i = order.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = order[i]; order[i] = order[j]; order[j] = t;
  }
  var cursor = 0;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function pauseAfter(ch) {
    if (ch === '.' || ch === '?' || ch === '!' || ch === ':') return PAUSE_PERIOD;
    if (ch === ',' || ch === ';') return PAUSE_COMMA;
    return 0;
  }

  // 글자를 각각 span 으로 쪼갠다. 단어 중간에서 줄이 끊기지 않도록 단어 단위로 감싼다.
  function render(text) {
    line.textContent = '';
    var chars = [];
    text.split(' ').forEach(function (word, wi, words) {
      var wrap = document.createElement('span');
      wrap.className = 'ink-word';
      word.split('').forEach(function (ch) {
        var s = document.createElement('span');
        s.className = 'ink-char';
        s.textContent = ch;
        wrap.appendChild(s);
        chars.push(s);
      });
      if (wi < words.length - 1) {
        var sp = document.createElement('span');
        sp.className = 'ink-char';
        sp.innerHTML = '&nbsp;';
        wrap.appendChild(sp);
        chars.push(sp);
      }
      line.appendChild(wrap);
    });
    return chars;
  }

  async function play(quote) {
    var chars = render(quote.text);
    attrib.textContent = '';
    attrib.classList.remove('is-visible');

    for (var i = 0; i < chars.length; i++) {
      chars[i].classList.add('is-inked');
      var extra = pauseAfter(chars[i].textContent);
      await sleep(WRITE_SPEED + extra);
    }

    attrib.textContent = '— ' + quote.by;
    attrib.classList.add('is-visible');

    await sleep(HOLD);

    // 잉크가 종이에 스며든다 — 쓴 순서 그대로 앞에서부터
    attrib.classList.remove('is-visible');
    for (var k = 0; k < chars.length; k++) {
      chars[k].classList.remove('is-inked');
      chars[k].classList.add('is-soaking');
      await sleep(SOAK_SPEED);
    }
    await sleep(700);
  }

  async function loop() {
    while (true) {
      var quote = QUOTES[order[cursor]];
      cursor = (cursor + 1) % order.length;
      await play(quote);
      await sleep(GAP);
    }
  }

  if (reduceMotion) {
    // 애니메이션을 원치 않는 사용자에겐 한 문장만 조용히 보여준다.
    var q = QUOTES[order[0]];
    render(q.text).forEach(function (c) { c.classList.add('is-inked'); });
    attrib.textContent = '— ' + q.by;
    attrib.classList.add('is-visible');
    return;
  }

  // 탭이 백그라운드일 땐 브라우저가 타이머를 조여서 문장이 뭉개진다.
  // 돌아왔을 때 처음부터 다시 쓰도록 한 번만 시작을 미룬다.
  if (document.visibilityState === 'visible') {
    loop();
  } else {
    document.addEventListener('visibilitychange', function once() {
      if (document.visibilityState === 'visible') {
        document.removeEventListener('visibilitychange', once);
        loop();
      }
    });
  }
})();
