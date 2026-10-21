/* Movimiento de la interfaz. Todo es opcional: si este archivo falla, la página se ve igual. */
(() => {
  const $$ = s => [...document.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Revelado al hacer scroll (sitio público)
  const io = !calm && 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in', 'seen'); io.unobserve(e.target);
    setTimeout(() => e.target.classList.remove('rv', 'in'), 1300);   // libera el hover normal de la tarjeta
  }), { threshold: .12 }) : null;
  const revelar = () => io && $$('.head,.card,.paso,.wizard,.ia,.faq details').forEach(el => {
    if (el.dataset.fx || el.closest('#view')) return;
    el.dataset.fx = 1;
    el.style.setProperty('--d', Math.min([...el.parentNode.children].indexOf(el), 6) * 70 + 'ms');
    el.classList.add('rv'); io.observe(el);
  });

  // Foco de luz en tarjetas
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.card.hover');
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });

  // Navegación y barra de progreso
  const nav = document.querySelector('.nav'), prog = document.createElement('div');
  prog.id = 'prog'; if (nav) document.body.appendChild(prog);
  const onScroll = () => {
    if (!nav) return;
    nav.classList.toggle('sc', scrollY > 10);
    prog.style.transform = `scaleX(${scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)})`;
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Panel: filas escalonadas y contadores que suben
  const animarVista = () => {
    $$('#view tr,.slot').forEach((tr, i) => tr.style.setProperty('--i', Math.min(i, 14)));
    if (calm) return;
    $$('#view .stat b').forEach(b => {
      const n = parseInt(b.textContent, 10);
      if (b.dataset.fx || String(n) !== b.textContent.trim()) return;
      b.dataset.fx = 1; const t0 = performance.now();
      (function paso(t) { const k = Math.min(1, (t - t0) / 900); b.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(paso); })(t0);
    });
  };

  // Título del inicio: aparece palabra por palabra
  const h1 = document.querySelector('.hero h1');
  if (h1 && !calm) {
    let i = 0; const w = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT), ns = [];
    while (w.nextNode()) ns.push(w.currentNode);
    ns.forEach(n => { const f = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(p => { if (!p.trim()) return f.append(p);
        const s = document.createElement('span'); s.className = 'w'; s.style.setProperty('--w', i++); s.textContent = p; f.append(s); });
      n.replaceWith(f); });
  }

  // Tarjeta del inicio que se inclina con el mouse
  const hero = document.querySelector('.hero'), card = document.querySelector('.hero-card');
  if (hero && card && !calm && matchMedia('(hover:hover)').matches) {
    hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect();
      card.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 10 + 'deg');
      card.style.setProperty('--rx', -((e.clientY - r.top) / r.height - .5) * 8 + 'deg'); });
    hero.addEventListener('pointerleave', () => { card.style.setProperty('--ry', '0deg'); card.style.setProperty('--rx', '0deg'); });
  }

  // Botones principales con efecto imán
  if (!calm) $$('.hero .btn,.cta-band .btn').forEach(b => {
    b.addEventListener('pointermove', e => { const r = b.getBoundingClientRect();
      b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px,${(e.clientY - r.top - r.height / 2) * .28}px)`; });
    b.addEventListener('pointerleave', () => b.style.transform = '');
  });

  // Menú: resalta la sección que estás viendo
  const links = $$('.nav ul a[href^="#"]');
  if (links.length && 'IntersectionObserver' in window) {
    const sp = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting)
      links.forEach(a => a.classList.toggle('act', a.getAttribute('href') === '#' + e.target.id)); }), { rootMargin: '-45% 0px -50% 0px' });
    links.forEach(a => { const t = document.querySelector(a.getAttribute('href')); t && sp.observe(t); });
  }

  // Modo oscuro: botón de la barra; recuerda la elección en este navegador
  const tb = document.getElementById('theme');
  if (tb) {
    const oscuro = () => document.documentElement.dataset.theme === 'dark';
    const etiqueta = () => tb.setAttribute('aria-label', oscuro() ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    etiqueta();
    tb.onclick = () => {
      const h = document.documentElement; h.classList.add('tx');
      h.dataset.theme = oscuro() ? 'light' : 'dark';
      try { localStorage.setItem('tema', h.dataset.theme); } catch (e) {}
      etiqueta(); setTimeout(() => h.classList.remove('tx'), 450);
    };
  }

  // Contadores (valores reales de la base de datos) que suben al verse
  const contar = () => $$('[data-count],[data-live]').forEach(el => {
    if (el.dataset.run) return;
    const n = el.dataset.live ? document.querySelectorAll(el.dataset.live).length : +el.dataset.count;
    if (!n) return;
    el.dataset.run = 1;
    if (calm || !('IntersectionObserver' in window)) { el.textContent = n; return; }
    new IntersectionObserver((es, o) => es.forEach(e => {
      if (!e.isIntersecting) return; o.disconnect();
      const t0 = performance.now();
      (function p(t) { const k = Math.min(1, (t - t0) / 1200); el.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(p); })(t0);
    }), { threshold: .6 }).observe(el);
  });

  // Botón flotante "Agendar cita": aparece al bajar y se oculta cuando ya estás en el formulario
  const fab = document.querySelector('.fab'), cita = document.getElementById('cita');
  if (fab) addEventListener('scroll', () => {
    const r = cita && cita.getBoundingClientRect();
    fab.classList.toggle('show', scrollY > innerHeight * .7 && !(r && r.top < innerHeight * .7 && r.bottom > 0));
  }, { passive: true });

  new MutationObserver(() => { revelar(); animarVista(); contar(); }).observe(document.body, { childList: true, subtree: true });
  revelar(); animarVista(); contar();
})();
