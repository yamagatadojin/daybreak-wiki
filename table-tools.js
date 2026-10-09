// 表のタグ絞り込みと並べ替え（全武器一覧表など）
// - <div class="tag-filter" data-target="表のid"> の中の <button data-tag="..."> を押すと、そのタグを全部持つ行だけ表示
// - <table class="sortable"> の thead の td を押すと並べ替え（数値は数値として）
(() => {
  document.querySelectorAll('.tag-filter').forEach(box => {
    const table = document.getElementById(box.dataset.target);
    const count = box.querySelector('.tag-count');
    const selected = new Set();
    const apply = () => {
      let n = 0;
      table.querySelectorAll('tbody tr').forEach(tr => {
        const tags = (tr.dataset.tags || '').split(' ');
        const show = [...selected].every(t => tags.includes(t));
        tr.style.display = show ? '' : 'none';
        if (show) n++;
      });
      if (count) count.textContent = `${n}件`;
    };
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tag === undefined) {
        selected.clear();
        box.querySelectorAll('button.on').forEach(x => x.classList.remove('on'));
      } else if (selected.has(b.dataset.tag)) {
        selected.delete(b.dataset.tag);
        b.classList.remove('on');
      } else {
        selected.add(b.dataset.tag);
        b.classList.add('on');
      }
      apply();
    });
    apply();
  });

  document.querySelectorAll('table.sortable').forEach(table => {
    const heads = table.querySelectorAll('thead tr:last-child td');
    heads.forEach((td, i) => td.addEventListener('click', () => {
      const asc = !td.classList.contains('asc');
      heads.forEach(h => h.classList.remove('sorted', 'asc'));
      td.classList.add('sorted');
      if (asc) td.classList.add('asc');
      const body = table.tBodies[0];
      const key = tr => {
        const c = tr.children[i];
        const v = c ? (c.dataset.sort ?? c.textContent.trim()) : '';
        const n = parseFloat(v);
        return isNaN(n) ? v : n;
      };
      [...body.rows].sort((a, b) => {
        const x = key(a), y = key(b);
        const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'ja');
        return asc ? r : -r;
      }).forEach(tr => body.appendChild(tr));
    }));
  });
})();
