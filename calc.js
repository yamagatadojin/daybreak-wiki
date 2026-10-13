// 火力計算機（calc.html）。データは build.py の build_calc が calc-data.js に書き出す（window.CALC）
(function () {
  'use strict';
  const D = window.CALC;
  if (!D) return;
  const $ = (id) => document.getElementById(id);
  const ELEM = ['物理', '魔力', '炎', '雷', '聖'];
  const STAT = ['生命力', '精神力', '持久力', '筋力', '技量', '知力', '信仰', '神秘'];
  // 攻撃の番号と名前（片手。両手は +200）。多段の攻撃は番号 +1〜+4 に続きのヒットがある
  const ATTACKS = [[0, 'R1 1段目'], [10, 'R1 2段目'], [20, 'R1 3段目'], [30, 'R1 4段目'], [40, 'R1 5段目'], [50, 'R1 6段目'],
    [100, 'R2'], [105, 'タメR2'], [110, 'R2 2段目'], [115, 'タメR2 2段目'], [120, 'ダッシュR1'], [125, 'ダッシュR2'],
    [130, '回避R1'], [140, 'バックステップR1'], [150, 'ジャンプR1'], [160, 'ジャンプR2'], [180, 'ガードカウンター']];
  const OTHER = [[500, '致命の一撃（背後）'], [510, '致命の一撃（正面）']];
  const E = D.effects;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const opt = (v, t, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(t)}</option>`;

  let sel = [];          // 選んだ効果 [{o: D.effects の番号, on: 発動中か}]
  // 敵のカット率 [標準, 打撃, 斬撃, 刺突, 魔力, 炎, 雷, 聖]（夜の王のページと同じ順）
  const CUT = ['標準', '打撃', '斬撃', '刺突', '魔力', '炎', '雷', '聖'];
  let cut = [100, 100, 100, 100, 100, 100, 100, 100];
  // 物理の種類（AtkParam の atkAttribute: 0 斬撃 1 打撃 2 刺突 3 標準）→ カット率の列
  const PHYS_CUT = { 0: 2, 1: 1, 2: 3, 3: 0 };

  // ---------- 計算 ----------
  function graph(g, x) {
    const p = D.graphs[g];
    if (!p) return 0;
    if (x <= p[0][0]) return p[0][1];
    for (let i = 0; i < 4; i++) {
      const [s0, g0, adj] = p[i], [s1, g1] = p[i + 1];
      if (x <= s1) {
        let r = (x - s0) / (s1 - s0);
        r = adj > 0 ? Math.pow(r, adj) : 1 - Math.pow(1 - r, -adj);
        return g0 + (g1 - g0) * r;
      }
    }
    return p[4][1];
  }

  // 属性ごとの攻撃力（モーション値 100 のとき）。stats = [筋力, 技量, 知力, 信仰, 神秘]
  function attackPower(w, stats) {
    const m = D.aec[w.ae];
    return w.a.map((base, e) => {
      if (!base) return 0;
      let sum = 0;
      for (let s = 0; s < 5; s++) {
        const [inf, ow] = m ? m[e][s] : [1, -1];
        if (!inf) continue;
        const corr = ow >= 0 ? ow : w.s[s];
        sum += corr / 100 * inf * graph(w.ct[e], stats[s]) / 100;
      }
      return base * 0.6 * (1 + sum);
    });
  }

  // レベルの区切り（1・2・12・15）の間は直線で推定
  function heroStats(h, lv) {
    const L = h.l;
    let a = L[0], b = L[L.length - 1];
    for (const x of L) { if (x.lv <= lv) a = x; }
    for (let i = L.length - 1; i >= 0; i--) { if (L[i].lv >= lv) b = L[i]; }
    if (a.lv === b.lv) return a.stats.slice();
    const t = (lv - a.lv) / (b.lv - a.lv);
    return a.stats.map((v, k) => Math.floor(v + (b.stats[k] - v) * t));
  }

  function strength(o) {
    let s = 1;
    for (const m of o.m) s *= m.r.reduce((x, y) => x + y, 0) / 5;
    return s + o.st.reduce((x, y) => x + y, 0) / 100;
  }

  // 重ね掛け: 同じ exclusivityId の組は一番強いものだけ。「重ね掛け✕」の効果は同じもの（同じバフ）を1つ分だけ
  function effective() {
    const best = {}, out = [];
    sel.forEach((s, i) => {
      if (!s.on) return;
      const o = E[s.o];
      let key = null;
      if (o.ex !== -1) key = 'x' + o.ex;
      else if (o.mk === '✕') key = o.b.length ? 'b' + o.b.join(',') : 'n' + o.n;
      if (!key) { out.push(i); return; }
      if (!(key in best) || strength(o) > strength(E[sel[best[key]].o])) best[key] = i;
    });
    return new Set(out.concat(Object.values(best)));
  }

  function multipliers(sub, w, eff) {
    const m = [1, 1, 1, 1, 1];
    eff.forEach((i) => {
      for (const md of E[sel[i].o].m) {
        if (md.wt && md.wt !== w.t) continue;
        if (md.sub.length && !md.sub.some((x) => sub.includes(x))) continue;
        for (let e = 0; e < 5; e++) m[e] *= md.r[e];
      }
    });
    return m;
  }

  // 効果時間の無い足し算の攻撃力（「出撃時の武器に○攻撃力を付加」など）。表示攻撃力には × 0.6 で入る
  function flatAdds(sub, w, eff) {
    const f = [0, 0, 0, 0, 0];
    eff.forEach((i) => {
      for (const md of E[sel[i].o].m) {
        if (!md.fl) continue;
        if (md.wt && md.wt !== w.t) continue;
        if (md.sub.length && !md.sub.some((x) => sub.includes(x))) continue;
        for (let e = 0; e < 5; e++) f[e] += md.fl[e] * 0.6;
      }
    });
    return f;
  }

  // エンチャント・脂（同時に1つ）。データの値 × 0.6 が表示攻撃力に足される
  function enchant() {
    const x = (D.enchants || [])[+$('c-ench').value];
    return x ? x.fl.map((v) => v * 0.6) : [0, 0, 0, 0, 0];
  }

  // ---------- 画面 ----------
  const hero = () => D.heroes[+$('c-hero').value];
  const weapon = () => D.weapons[+$('c-weapon').value];

  function fillWeapons(keepId) {
    const t = +$('c-type').value;
    $('c-weapon').innerHTML = D.weapons.map((w, i) => (w.t === t ? opt(i, w.n, w.id === keepId) : '')).join('');
    fillSkills();
  }

  function fillSkills(keep) {
    const w = weapon();
    if (!w) return;
    const ks = w.k.slice().sort((a, b) => (a === w.d ? -1 : b === w.d ? 1 : D.skills[a].n.localeCompare(D.skills[b].n, 'ja')));
    $('c-skill').innerHTML = opt(-1, '（なし）') + ks.map((k) => opt(k, D.skills[k].n + (k === w.d ? '（初期）' : ''), keep !== undefined ? k === keep : k === w.d)).join('');
  }

  // 効果の箱（種類ごと: 遺物効果 / 深層の遺物効果 / 深層のデメリット / 武器の付帯効果）
  const KINDS = Object.keys(D.kinds);

  function fillOptions(k) {
    const q = $('c-q-' + k).value.trim();
    $('c-opts-' + k).innerHTML = E.map((o, i) => (o.k === k && (!q || o.n.includes(q))
      ? opt(i, `${o.n}${o.v ? '（' + o.v + '）' : ''}`) : '')).join('');
  }

  function motionTable(w, h) {
    const mt = D.mtypes[w.t] || {};
    let v = w.v;
    if (w.hv > 0 && (mt.heroes || []).includes(h.id) && D.motions[w.hv]) v = w.hv;
    if (!D.motions[v]) v = mt.base;
    // 固有の動き（402 など）は違う攻撃だけを持ち、無い攻撃は百の位の動き（400）を使う
    const tab = Object.assign({}, D.motions[v - v % 100] || {}, D.motions[v] || {});
    return { tab, hero: v === w.hv && w.hv > 0 };
  }

  function hitsAt(tab, j) {
    const out = [];
    for (let k = j; k < j + 5; k++) if (tab[k]) out.push([tab[k][0], [0, 0, 0, 0, 0], tab[k][1], tab[k][2], 0]);
    return out;
  }

  function render() {
    const h = hero(), w = weapon();
    if (!h || !w) return;
    const lv = +$('c-lv').value, hand = +$('c-hand').value;
    const eff = effective();
    const stats = heroStats(h, lv);
    const add = [0, 0, 0, 0, 0, 0, 0, 0];
    eff.forEach((i) => E[sel[i].o].st.forEach((v, k) => { add[k] += v; }));
    const total = stats.map((v, k) => Math.max(0, Math.min(99, v + add[k])));
    $('c-stats').innerHTML = '<table class="calc-mini">' + STAT.map((n, k) => `<tr><th>${n}</th><td>${total[k]}${add[k] ? ` <small>(${stats[k]}${add[k] > 0 ? '+' : ''}${add[k]})</small>` : ''}</td></tr>`).join('') + '</table>'
      + (h.l.some((x) => x.lv === lv) ? '' : '<small class="muted">このレベルの能力値は推定</small>');

    const st5 = total.slice(3, 8);
    const ap = attackPower(w, st5);
    const { tab, hero: heroMotion } = motionTable(w, h);
    const r1 = tab[hand] ? tab[hand][0] : [100, 100, 100, 100, 100];
    const ench = enchant();
    const fl1 = flatAdds(tab[hand] ? tab[hand][1] : [], w, eff);
    const shown = ap.map((x, e) => Math.max(0, x + fl1[e]) * r1[e] / 100);
    const shownTotal = shown.reduce((a, b) => a + Math.floor(b), 0);
    const enchShown = ench.reduce((a, v, e) => a + v * r1[e] / 100, 0);
    $('c-ar').innerHTML = `<p><b>表示攻撃力 ${shownTotal}${enchShown ? ' + ' + Math.floor(enchShown) : ''}</b>（${hand ? '両手' : '片手'}）`
      + ` <small>${shown.map((x, e) => (x ? `${ELEM[e]} ${Math.floor(x)}` : '')).filter(Boolean).join(' ／ ')}</small>`
      + `${heroMotion ? '<br><small>キャラ専用モーション</small>' : ''}</p>`
      + `<small>図録の攻撃力 ${w.a.map((x, e) => (x ? ELEM[e] + ' ' + x : '')).filter(Boolean).join(' ／ ')}`
      + `、補正 ${['筋', '技', '知', '信', '神'].map((n, s) => (w.s[s] ? n + ' ' + w.s[s] : '')).filter(Boolean).join(' ')}</small>`;

    // 選んだ効果の一覧（種類ごとの箱の下）
    for (const k of KINDS) {
      const items = sel.map((s, i) => [s, i]).filter(([s]) => E[s.o].k === k);
      $('c-sel-' + k).innerHTML = items.length ? '<table class="calc-mini calc-sel">' + items.map(([s, i]) => {
        const o = E[s.o], ok = eff.has(i);
        const state = !s.on ? '<span class="muted">外している</span>' : ok ? '' : '<span class="calc-off">重ならないので無効</span>';
        return `<tr><td>${esc(o.n)}${o.v ? ` <small>（${esc(o.v)}）</small>` : ''} ${state}</td>`
          + `<td class="nowrap">${o.tr ? `<label><input type="checkbox" data-on="${i}"${s.on ? ' checked' : ''}> 発動中</label> ` : ''}`
          + `<button type="button" data-del="${i}">×</button></td></tr>`;
      }).join('') + '</table>' : '<p class="muted"><small>まだ無し</small></p>';
    }

    // 攻撃ごとのダメージ
    const rows = [];
    // gc = ガードカウンター（最終段のエンチャントはモーション値でなく × 1。参考 wiki の検証）
    const line = (label, hits, note, gc) => {
      if (!hits.length) return;
      const dmg = hits.map(([mv, fixed, sub, attr, bullet], n) => {
        const m = multipliers(sub, w, eff);
        const fl = flatAdds(sub, w, eff);
        // 253 / 252 = 武器の物理の種類（1つ目 / 2つ目）を使う
        const a = attr === 253 ? w.p[0] : attr === 252 ? w.p[1] : attr;
        const physCut = cut[PHYS_CUT[a] !== undefined ? PHYS_CUT[a] : 0];
        let d = 0;
        for (let e = 0; e < 5; e++) {
          const en = bullet ? 0 : ench[e] * (gc && n === hits.length - 1 ? 100 : mv[e]) / 100;   // 弾にはエンチャントが乗らない
          d += (Math.max(0, ap[e] + fl[e]) * mv[e] / 100 + fixed[e] + en) * m[e] * (e ? cut[e + 3] : physCut) / 100;
        }
        return Math.floor(d);
      });
      const sum = dmg.reduce((a, b) => a + b, 0);
      const mvText = hits.map(([mv]) => mv[0]).join('+');
      rows.push(`<tr><th>${esc(label)}${note ? ` <small class="muted">${note}</small>` : ''}</th><td class="c">${mvText}</td>`
        + `<td class="c">${dmg.length > 1 ? dmg.join(' + ') : ''}</td><td class="c"><b>${sum}</b></td></tr>`);
    };
    for (const [j, label] of ATTACKS) line(label, hitsAt(tab, j + hand), '', j === 180);
    for (const [j, label] of OTHER) line(label, hitsAt(tab, j));
    if (!hand) {
      let n = 0;
      for (let j = 800; j < 890; j += 10) if (tab[j]) line(`二刀 L1 ${++n}段目`, hitsAt(tab, j));
      line('二刀 ジャンプL1', hitsAt(tab, 890));
    }
    const k = +$('c-skill').value;
    if (k >= 0) {
      const s = D.skills[k];
      s.m.forEach((m, n) => {
        line(`戦技「${s.n}」${s.m.length > 1 ? ' ' + (n + 1) : ''}`, m.h, `#${m.a}`);
        line(`戦技「${s.n}」${s.m.length > 1 ? ' ' + (n + 1) : ''}（FP 不足）`, m.nf);
      });
    }
    const melee = multipliers([130], w, eff);
    $('c-out').innerHTML = `<p><small>効果の倍率（近接攻撃）: ${melee.map((x, e) => (w.a[e] ? `${ELEM[e]} ×${x.toFixed(3)}` : '')).filter(Boolean).join(' ／ ')}</small></p>`
      + `<div class="ie5 fit"><table class="style_table"><colgroup><col style="width:34%"><col style="width:16%"><col style="width:34%"><col style="width:16%"></colgroup>`
      + '<thead><tr><td>攻撃</td><td>モーション値</td><td>ヒットごと</td><td>ダメージ</td></tr></thead><tbody>'
      + (rows.join('') || '<tr><td colspan="4">モーション値のデータが無い</td></tr>') + '</tbody></table></div>';
    saveHash();
  }

  // ---------- 状態を URL に残す（共有用） ----------
  function saveHash() {
    const w = weapon(), h = hero();
    const st = { h: h.id, l: +$('c-lv').value, w: w.id, d: +$('c-hand').value, s: +$('c-skill').value,
      e: sel.map((s) => [E[s.o].id, E[s.o].k, s.on ? 1 : 0]), c: cut, en: +$('c-enemy').value, n: +$('c-ench').value };
    try { history.replaceState(null, '', '#' + encodeURIComponent(JSON.stringify(st))); } catch (e) { /* 無視 */ }
  }

  function loadHash() {
    try {
      const st = JSON.parse(decodeURIComponent(location.hash.slice(1)));
      const hi = D.heroes.findIndex((x) => x.id === st.h);
      if (hi >= 0) $('c-hero').value = hi;
      if (st.l) $('c-lv').value = st.l;
      const wi = D.weapons.findIndex((x) => x.id === st.w);
      if (wi >= 0) { $('c-type').value = D.weapons[wi].t; fillWeapons(st.w); }
      if (st.d !== undefined) $('c-hand').value = st.d;
      if (st.s !== undefined) fillSkills(st.s);
      sel = (st.e || []).map(([id, k, on]) => ({ o: E.findIndex((o) => o.id === id && o.k === k), on: !!on })).filter((s) => s.o >= 0);
      if (Array.isArray(st.c) && st.c.length === 8) cut = st.c.map(Number);
      if (st.en !== undefined) $('c-enemy').value = st.en;
      if (st.n !== undefined) $('c-ench').value = st.n;
    } catch (e) { /* 初期状態のまま */ }
  }

  function init() {
    $('c-hero').innerHTML = D.heroes.map((h, i) => opt(i, h.n)).join('');
    let lvs = '';
    for (let l = 1; l <= 15; l++) lvs += opt(l, 'Lv' + l, l === 15);
    $('c-lv').innerHTML = lvs;
    const types = Object.keys(D.types).map(Number).filter((t) => D.weapons.some((w) => w.t === t));
    $('c-type').innerHTML = types.map((t) => opt(t, D.types[t])).join('');
    $('c-pickers').innerHTML = KINDS.map((k) => `<fieldset class="calc-pick"><legend>${esc(D.kinds[k])}</legend>`
      + `<input type="search" id="c-q-${k}" data-q="${k}" placeholder="検索（攻撃力 など）"><br>`
      + `<select id="c-opts-${k}" data-opts="${k}" size="6"></select><br>`
      + `<button type="button" data-add="${k}">追加</button> <small>（ダブルクリックでも追加）</small>`
      + `<div id="c-sel-${k}"></div></fieldset>`).join('');
    const srcs = [...new Set((D.enchants || []).map((x) => x.src))];
    $('c-ench').innerHTML = opt(-1, '（なし）') + srcs.map((src) => `<optgroup label="${esc(src)}">`
      + D.enchants.map((x, i) => (x.src === src ? opt(i, `${x.n}（${x.fl.map((v, e) => (v ? ELEM[e] + '+' + Math.floor(v * 0.6) : '')).filter(Boolean).join('・')}）`) : '')).join('')
      + '</optgroup>').join('');
    const groups = [...new Set((D.enemies || []).map((x) => x.g))];
    $('c-enemy').innerHTML = opt(-1, '（手入力）') + groups.map((g) => `<optgroup label="${esc(g)}">`
      + D.enemies.map((x, i) => (x.g === g ? opt(i, x.n) : '')).join('') + '</optgroup>').join('');
    $('c-cut').innerHTML = CUT.map((n, e) => `<label>${n} <input type="number" min="0" max="300" step="5" data-cut="${e}" value="${cut[e]}"></label>`).join(' ');
    fillWeapons();
    if (location.hash.length > 1) loadHash();
    $('c-cut').querySelectorAll('input').forEach((x) => { x.value = cut[+x.dataset.cut]; });
    KINDS.forEach(fillOptions);

    $('c-type').addEventListener('change', () => { fillWeapons(); render(); });
    $('c-weapon').addEventListener('change', () => { fillSkills(); render(); });
    ['c-hero', 'c-lv', 'c-hand', 'c-skill', 'c-ench'].forEach((id) => $(id).addEventListener('change', render));
    const addSel = (k) => {
      const box = $('c-opts-' + k), i = +box.value;
      if (box.value === '' || isNaN(i)) return;
      sel.push({ o: i, on: true });
      render();
    };
    const P = $('c-pickers');
    P.addEventListener('input', (ev) => { const k = ev.target.dataset.q; if (k) fillOptions(k); });
    P.addEventListener('dblclick', (ev) => {
      const t = ev.target.closest ? ev.target.closest('[data-opts]') : ev.target;
      if (t && t.dataset.opts) addSel(t.dataset.opts);
    });
    P.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t.dataset.add) addSel(t.dataset.add);
      else if (t.dataset.del !== undefined) { sel.splice(+t.dataset.del, 1); render(); }
    });
    P.addEventListener('change', (ev) => {
      const t = ev.target;
      if (t.dataset.on !== undefined) { sel[+t.dataset.on].on = t.checked; render(); }
    });
    $('c-cut').addEventListener('input', (ev) => {
      const e = ev.target.dataset.cut;
      if (e !== undefined) { cut[+e] = Math.max(0, +ev.target.value || 0); $('c-enemy').value = '-1'; render(); }
    });
    $('c-enemy').addEventListener('change', () => {
      const x = (D.enemies || [])[+$('c-enemy').value];
      cut = x ? x.c.map((v) => Math.round(v * 100)) : [100, 100, 100, 100, 100, 100, 100, 100];
      $('c-cut').querySelectorAll('input').forEach((el) => { el.value = cut[+el.dataset.cut]; });
      render();
    });
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
