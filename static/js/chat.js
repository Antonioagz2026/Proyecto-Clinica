/* Asistente virtual: envía la pregunta a /api/publico/chat y muestra la respuesta. */
(() => {
  const $ = s => document.querySelector(s);
  const box = $('#chat'); if (!box) return;
  const body = $('#chat-b'), chips = $('#chat-q'), inp = $('#chat-i'), btn = $('#chat-btn');
  const MENU = ['Horarios', 'Doctores', '¿Cuándo hay cita?', 'Cómo agendar', 'Tengo un síntoma'];
  let iniciado = false;
  const historial = [];   // últimos turnos, para que la IA recuerde de qué se está hablando

  // textContent (no innerHTML): lo que escribe la persona nunca se interpreta como HTML
  const msg = (txt, quien) => { const d = document.createElement('div'); d.className = 'cm ' + quien; d.textContent = txt; body.appendChild(d); body.scrollTop = body.scrollHeight; return d; };
  const sugerir = (lista, agendar) => {
    chips.replaceChildren();
    lista.forEach(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => enviar(t); chips.appendChild(b); });
    if (agendar) { const a = document.createElement('a'); a.href = '#cita'; a.className = 'go'; a.textContent = 'Agendar ahora'; a.onclick = alternar; chips.appendChild(a); }
  };

  async function enviar(texto) {
    texto = texto.trim(); if (!texto) return;
    msg(texto, 'me'); inp.value = ''; chips.replaceChildren();
    const esc = msg('', 'bot typing'); esc.append(...[0, 1, 2].map(() => document.createElement('i')));
    try {
      const r = await fetch('/api/publico/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto, historial: historial.slice(-6) }) });
      const d = await r.json(); await new Promise(ok => setTimeout(ok, 500));
      esc.remove(); msg(r.ok ? d.respuesta : (d.error || 'No pude responder.'), 'bot'); sugerir(d.sugerencias || MENU, d.enlace);
      if (r.ok) { historial.push({ rol: 'user', texto }, { rol: 'assistant', texto: d.respuesta }); $('.chat-h small').textContent = d.modo === 'ia' ? 'Con inteligencia artificial' : 'Respuestas al instante'; }
    } catch { esc.remove(); msg('No logro conectar con el servidor. Intenta de nuevo.', 'bot'); sugerir(MENU); }
  }

  function alternar() {
    const abrir = box.hidden; box.hidden = !abrir; btn.classList.toggle('on', abrir);
    if (!abrir) return;
    if (!iniciado) { iniciado = true; msg('¡Hola! Soy el asistente virtual de Vida Plena. Respondo dudas sobre horarios, doctores y citas. No doy diagnósticos.', 'bot'); sugerir(MENU); }
    inp.focus();
  }
  btn.onclick = alternar; $('#chat-x').onclick = alternar;
  $('#chat-f').onsubmit = e => { e.preventDefault(); enviar(inp.value); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && !box.hidden) alternar(); });

  // Sección «¿No sabes con quién consultar?»: abre el chat y envía la pregunta
  const preguntar = t => { if (box.hidden) alternar(); enviar(t); };
  const f = $('#ia-f');
  if (f) f.onsubmit = e => { e.preventDefault(); const i = $('#ia-i'); if (i.value.trim()) { preguntar(i.value); i.value = ''; } };
  document.querySelectorAll('.ia-q button').forEach(b => b.onclick = () => preguntar(b.textContent));
})();
