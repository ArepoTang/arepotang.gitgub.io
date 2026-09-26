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
    if (k === 'arc') return (x, y, r) => events.push({ type: 'arc', x, y, r, alpha: g.globalAlpha });
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
let fails = 0;
function check(label, cond, extra) {
  if (!cond) fails++;
  console.log((cond ? '✅ ' : '❌ ') + label + (extra ? '  ' + extra : ''));
}
function fire(x, y) { els.modal.classList.add('hide'); canvas._fire('click', { clientX: x, clientY: y }); return !els.modal.classList.contains('hide'); }

const ringR = [], ringA = [], headA = [];
for (let i = 0; i < 400; i++) {
  events = []; step(16);
  for (const a of blueHeads()) {
    if (a.r > 4) { ringR.push(a.r); ringA.push(a.alpha); }   // 半径 >4px 的是外扩圈，星头只有 1~3px
    else headA.push(a.alpha);
  }
}
const blues = blueHeads();
check('第 400 帧有蓝星可点', blues.length > 0, blues.length + ' 颗');
check('底部栏 UI 已淡入', els.ui.classList.contains('visible'));
check('顶部提示条「看蓝星」弹过', els.hint.classList.contains('show'));

let hitAll = blues.every((b) => fire(b.x, b.y));
check('每个蓝星头部都点得到', hitAll, blues.length + ' 颗');
check('贴着头偏 19px 命中', fire(blues[0].x + 19, blues[0].y));

// 沿轨迹偏 40px 也该中（整条蓝线可点是有意为之），所以这里用「垂直轨迹」方向判不中
let miss = 0;
for (const b of blues) {
  const n = Math.hypot(b.x, b.y) || 1;
  if (!fire(b.x + (b.x / n) * 40, b.y + (b.y / n) * 40)) miss++;
}
check('垂直轨迹偏 40px 不中', miss >= blues.length * 0.8, miss + '/' + blues.length);

// 回归：手指落下 → click 之间的时延，星星已跑走
const lagOk = [];
for (const lag of [0, 80, 160, 240, 400]) {
  events = []; step(16);
  const h = blueHeads()[0];
  for (let i = 0; i < Math.round(lag / 16); i++) { events = []; step(16); }
  lagOk.push(fire(h.x, h.y));
}
check('输入延迟 0~400ms 点旧位置仍命中', lagOk.every(Boolean), lagOk.map((v) => (v ? '✅' : '❌')).join(''));
events = []; step(16);
const stale = blueHeads()[0];
for (let i = 0; i < 60; i++) { events = []; step(16); }   // ~1s 后
check('延迟 1s 的旧位置点不到（窗口是 0.5s）', !fire(stale.x, stale.y));

// 观感：闪烁 + 外扩圈（含开屏那一下强调）
const lo = Math.min(...headA), hi = Math.max(...headA);
check('蓝星在闪烁', hi - lo > 0.3 && lo < 0.6, 'alpha ' + lo.toFixed(2) + '~' + hi.toFixed(2));
const rMax = Math.max(...ringR), aMax = Math.max(...ringA), aMin = Math.min(...ringA);
check('外扩圈半径够远且越来越淡', rMax > 20 && aMax > 0.25 && aMin < 0.08,
  Math.min(...ringR).toFixed(1) + '→' + rMax.toFixed(1) + 'px, alpha ' + aMin.toFixed(2) + '~' + aMax.toFixed(2));
check('开屏一次性强调圈出现过（半径 >60px）', rMax > 60);

console.log('\n' + (fails ? '❌ ' + fails + ' 项不通过' : '✅ 全部通过'));
process.exit(fails ? 1 : 0);
