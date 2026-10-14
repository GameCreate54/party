// 画面づくりの小道具（全ゲーム共通）
(() => {

// 入力途中の文字を再描画で消さないための置き場
const drafts = {};

// h('div', {class:'x', onclick: fn}, 子要素...) で要素を作る
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el[k.toLowerCase()] = v;
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

// 文字入力欄。id ごとに入力中の文字を覚えておく
function inputBox(id, opts = {}) {
  const el = h('input', {
    id,
    class: 'input' + (opts.big ? ' big' : ''),
    type: 'text',
    placeholder: opts.placeholder,
    maxlength: opts.maxlength,
    autocomplete: 'off',
    autocapitalize: 'off',
    inputmode: opts.digits ? 'numeric' : opts.inputmode,
    pattern: opts.digits ? '[0-9]*' : null,
    value: drafts[id] || '',
  });
  // 画面の差し替えで要素が入れ替わっても動くよう、必ず e.target（実際の入力欄）を使う
  el.oninput = (e) => {
    const t = e.target;
    if (opts.digits) t.value = t.value.replace(/\D/g, '');
    drafts[id] = t.value;
    if (opts.onInput) opts.onInput(t.value);
  };
  if (opts.onEnter) {
    el.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        if (!opts.keepFocus) e.target.blur();
        opts.onEnter();
      }
    };
  }
  if (opts.disabled) el.disabled = true;
  if (opts.enterkeyhint) el.setAttribute('enterkeyhint', opts.enterkeyhint);
  return el;
}

function button(label, onclick, cls = '', extra = {}) {
  return h('button', { class: 'btn ' + cls, onclick, type: 'button', ...extra }, label);
}

// 数を増減するボタン
function stepper(value, min, max, onChange, editable = true) {
  return h('div', { class: 'stepper' },
    h('button', { class: 'step', type: 'button', disabled: !editable || value <= min, onclick: () => onChange(value - 1) }, '−'),
    h('span', { class: 'step-value' }, value),
    h('button', { class: 'step', type: 'button', disabled: !editable || value >= max, onclick: () => onChange(value + 1) }, '＋'),
  );
}

// 選択肢から1つ選ぶボタン列
function segmented(options, value, onChange, editable = true) {
  return h('div', { class: 'seg' },
    options.map((o) => h('button', {
      type: 'button',
      class: 'seg-btn' + (o.value === value ? ' on' : ''),
      disabled: !editable,
      onclick: () => o.value !== value && onChange(o.value),
    }, o.label)));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- 画面の差し替え ----------
// 新しく作った画面と今の画面を見比べて、違う部分だけ書き換える。
// 入力中の欄はそのまま残るので、キーボードが閉じず、日本語変換も途切れない。
const EVENTS = ['onclick', 'oninput', 'onkeydown', 'onkeyup', 'onpointerdown', 'onchange', 'onfocus', 'onblur'];
const same = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.id || '') === (b.id || '');

function morph(a, b) {
  if (!same(a, b)) { a.replaceWith(b); return b; }
  if (a.nodeType !== 1) {
    if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
    return a;
  }
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name)) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) if (a.getAttribute(name) !== value) a.setAttribute(name, value);
  for (const ev of EVENTS) if (a[ev] !== b[ev]) a[ev] = b[ev];
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') {
    if (document.activeElement !== a && a.value !== b.value) a.value = b.value;
    if (a.disabled !== b.disabled) a.disabled = b.disabled;
    return a;
  }
  const olds = [...a.childNodes];
  const news = [...b.childNodes];
  const newIds = new Set(news.filter((n) => n.id).map((n) => n.id));
  const oldIds = new Set(olds.filter((n) => n.id).map((n) => n.id));
  let i = 0;
  for (const nb of news) {
    let ob = olds[i];
    // 名前付きの要素（入力欄など）が前の画面にもあるなら、その手前の消えた要素を取り除いて位置を合わせる
    if (nb.id && oldIds.has(nb.id)) {
      while (ob && ob.id !== nb.id && !(ob.id && newIds.has(ob.id))) { ob.remove(); ob = olds[++i]; }
    }
    if (!ob) { a.appendChild(nb); continue; }
    // 今の要素が後ろで使われる名前付き要素なら、新しい要素をその前に差し込む
    if (!same(ob, nb) && ob.id && newIds.has(ob.id)) { a.insertBefore(nb, ob); continue; }
    morph(ob, nb);
    i++;
  }
  for (; i < olds.length; i++) olds[i].remove();
  return a;
}

// container の中身を view に差し替える
function patch(container, view) {
  const cur = container.firstChild;
  if (cur && container.childNodes.length === 1) morph(cur, view);
  else container.replaceChildren(view);
}

// 確認ダイアログ（ブラウザ標準の confirm() はアプリ内ブラウザで出ないことがあるので自前で出す）
// 使い方：ask('ロビーに戻りますか？', () => 実行すること)
function ask(message, onYes, opts = {}) {
  const old = document.getElementById('party-ask');
  if (old) old.remove();
  const close = () => box.remove();
  const box = h('div', { id: 'party-ask', class: 'ask-overlay', onclick: (e) => { if (e.target === box) close(); } },
    h('div', { class: 'ask-sheet', role: 'dialog', 'aria-modal': 'true' },
      h('p', { class: 'ask-msg' }, message),
      h('div', { class: 'ask-btns' },
        h('button', { type: 'button', class: 'btn ghost', onclick: close }, opts.no || 'やめる'),
        h('button', { type: 'button', class: 'btn primary', onclick: () => { close(); onYes(); } }, opts.yes || 'OK'))));
  document.body.appendChild(box);
}

let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

window.Party = window.Party || {};
window.Party.ui = { drafts, h, inputBox, button, stepper, segmented, shuffle, pick, toast, patch, ask };
})();
