// 开屏星星的可用性检查：node test_egg_click.js [index.html]
// 蓝星=彩蛋，必须点得到；这里用最小 DOM/Canvas 垫片真跑一遍页面脚本。
// 关键场景：手指落下到 click 派发有延时，星星已经跑走 —— 旧位置也得算命中。
const fs = require('fs');
const js = fs.readFileSync(process.argv[2] || 'index.html', 'utf8').match(/<script>([\s\S]*)<\/script>/)[1];

const els = {};
function mkEl(id) {
  const listeners = {};
  return (els[id] = {
    id, hidden: false, textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach(x => this._s.add(x)); }, remove(...c) { c.forEach(x => this._s.delete(x)); },
      contains(c) { return this._s.has(c); }, toggle() {},
    },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    _fire(t, e) { (listeners[t] || []).forEach(f => f(e)); },
    appendChild() {}, removeAttribute() {}, setAttribute() {},
    querySelector() { return mkEl(id + '-inner'); },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 800 }; },
  });
}
let events = [];
const t = {};
const ctx = new Proxy(t, {
  get(g, k) {
    if (k === 'arc') return (x, y) => events.push({ type: 'arc', x, y });
    if (k === 'setTransform') return () => {};
    if (k in g) return g[k];
    return () => {};
  },
  set(g, k, v) { if (k === 'fillStyle') events.push({ type: 'fill', color: v }); g[k] = v; return true; },
});

const canvas = mkEl('canvas');
canvas.getContext = () => ctx;
global.document = { getElementById: (id) => els[id] || mkEl(id), createElement: () => mkEl('new'), addEventListener() {} };
global.window = { innerWidth: 400, innerHeight: 800, devicePixelRatio: 1, addEventListener() {} };
global.location = { hash: '' };
let now = 0, queue = [];
global.performance = { now: () => now };
global.requestAnimationFrame = (cb) => { queue.push(cb); };
eval(js);

function step(ms) {
  now += ms;
  const q = queue.slice();
  queue.length = 0;
  if (!q.length) throw new Error('没有待跑的 rAF');
  q.forEach((cb) => cb(now));
}
// 蓝星头部 = 紧跟其后的 fillStyle 是蛋色的那个 arc
function blueHeads() {
  const out = [];
  for (let i = 0; i < events.length - 1; i++) {
    if (events[i].type === 'arc' && events[i + 1].type === 'fill' && events[i + 1].color === '#4FC3F7') out.push(events[i]);
  }
  return out;
}
function fire(x, y) { els.modal.classList.add('hide'); canvas._fire('click', { clientX: x, clientY: y }); return !els.modal.classList.contains('hide'); }

for (let i = 0; i < 400; i++) { events = []; step(16); }
const blues = blueHeads();
console.log('第 400 帧：蓝星 ' + blues.length + ' 颗，UI 已淡入 ' + els.ui.classList.contains('visible'));
console.log('点蓝星头部：' + blues.map(b => fire(b.x, b.y) ? '✅' : '❌').join(''));
console.log('偏 19px 命中 ' + (fire(blues[0].x + 19, blues[0].y) ? '✅' : '❌') + ' / 偏 40px 不中 ' + (fire(blues[0].x + 40, blues[0].y) ? '❌' : '✅'));

// 回归：手指落下 → click 之间的时延，星星已跑走
const lines = [];
for (const lag of [0, 80, 160, 240, 400, 700]) {
  events = []; step(16);
  const head = blueHeads()[0];
  if (!head) { lines.push(lag + 'ms: 无蓝星'); continue; }
  for (let i = 0; i < Math.round(lag / 16); i++) { events = []; step(16); }
  lines.push('延迟 ' + String(lag).padStart(3) + 'ms 点旧位置: ' + (fire(head.x, head.y) ? '✅ 命中' : '❌ 点不到'));
}
console.log(lines.join('\n'));
