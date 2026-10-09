// 潜在する力ページ: 「比べるキャラ」を選ぶと、産まれ直しの各タイプの能力値に、そのキャラからの増減を書き足す
(() => {
  const sel = document.getElementById('rebirth-compare');
  if (!sel || typeof HERO_STATS === 'undefined') return;
  const table = document.querySelector('.rebirth-table table');
  const apply = () => {
    const base = HERO_STATS[sel.value];
    table.querySelectorAll('tbody tr').forEach(tr => {
      const cells = tr.querySelectorAll('td.stat');
      cells.forEach((td, i) => {
        const v = +td.dataset.v;
        if (!base) { td.textContent = v; return; }
        const d = v - base[i];
        const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
        td.innerHTML = `${v}<br><small class="${cls}">${d > 0 ? '+' : ''}${d === 0 ? '±0' : d}</small>`;
      });
      // 比べているキャラの行を目立たせる
      const th = tr.querySelector('th');
      tr.classList.toggle('picked', !!base && tr.querySelector('td.base') && th && th.textContent === sel.value);
    });
  };
  sel.addEventListener('change', apply);
})();
