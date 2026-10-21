const ICONOS = {"Medicina General": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M11 2v2M5 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1\"/><path d=\"M8 15a6 6 0 0 0 12 0v-3\"/><circle cx=\"20\" cy=\"10\" r=\"2\"/></svg>", "Pediatría": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\"/><path d=\"M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\"/></svg>", "Ginecología": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"9\" r=\"5\"/><path d=\"M12 14v7M9 18h6\"/></svg>", "Cardiología": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z\"/></svg>", "Dermatología": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\"/></svg>", "Odontología": "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01\"/></svg>"};
const icono = n => ICONOS[n] || ICONOS['Medicina General'];
const $ = s => document.querySelector(s);
const DIAS = ['L','M','X','J','V','S','D'];
const api = async (url, opt) => {
  const r = await fetch(url, opt); const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.error || 'Error de servidor'); e.espera = d.espera; throw e; } return d;
};
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtF = f => f ? f.split('-').reverse().join('/') : '';
// Máscara del DNI hondureño mientras se escribe: 0801-1990-12345
const maskDNI = el => el && el.addEventListener('input', () => {
  const d = el.value.replace(/\D/g, '').slice(0, 13);
  el.value = [d.slice(0, 4), d.slice(4, 8), d.slice(8)].filter(Boolean).join('-');
});
// Bloquea un botón con cuenta regresiva (cuando el servidor responde 429 «demasiados intentos»)
function cuentaRegresiva(btn, seg){
  const txt = btn.textContent; btn.disabled = true;
  const t = setInterval(() => { seg--; if (seg <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = txt; } else btn.textContent = `Espera ${seg} s…`; }, 1000);
  btn.textContent = `Espera ${seg} s…`;
}
maskDNI(document.querySelector('#f-ident')); maskDNI(document.querySelector('#mc-ident'));
const post = (u, b) => api(u, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b)});
let sel = {hora:null}, doctores = [];

(async function init(){
  const esp = await api('/api/publico/especialidades');
  $('#esp-list').innerHTML = esp.map(e => `<div class="card esp hover"><div class="ico">${icono(e.nombre)}</div><h3>${e.nombre}</h3><p>${e.descripcion}</p><p style="margin-top:8px"><span class="tag">${e.doctores} doctor(es)</span></p></div>`).join('');
  $('#f-esp').innerHTML = esp.map(e => `<option value="${e.id}">${e.nombre}</option>`).join('');
  doctores = await api('/api/publico/doctores');
  $('#doc-list').innerHTML = doctores.map(d => {
    const on = new Set(d.horario.map(h => h.dia_semana));
    return `<div class="card doc hover"><div class="avatar">${d.nombre[0]}${d.apellido[0]}</div><h3 style="font-size:1.15rem">Dr(a). ${d.nombre} ${d.apellido}</h3><span class="tag">${d.especialidad}</span><div class="dias">${DIAS.map((x,i)=>`<span class="${on.has(i)?'on':''}">${x}</span>`).join('')}</div></div>`;
  }).join('');
  const hoy = new Date(); const iso = d => new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
  $('#f-fecha').min = iso(hoy); $('#f-fecha').value = iso(new Date(hoy.getTime()+864e5));
  loadDocs();
})();

function loadDocs(){
  const id = +$('#f-esp').value;
  $('#f-doc').innerHTML = doctores.filter(d => d.especialidad_id === id).map(d => `<option value="${d.id}">Dr(a). ${d.nombre} ${d.apellido}</option>`).join('') || '<option value="">Sin doctores disponibles</option>';
  loadSlots();
}
async function loadSlots(){
  sel.hora = null; $('#to2').disabled = true;
  const did = $('#f-doc').value, f = $('#f-fecha').value;
  if(!did || !f){ $('#slots').innerHTML = '<span style="color:var(--muted)">Elige doctor y fecha…</span>'; return; }
  try {
    const {horas} = await api(`/api/doctores/${did}/disponibilidad?fecha=${f}`);
    $('#slots').innerHTML = horas.length ? horas.map(h => `<button type="button" class="slot" data-h="${h}">${h}</button>`).join('')
      : '<span style="color:var(--muted)">El doctor no atiende o no hay espacios ese día. Prueba otra fecha.</span>';
  } catch(e){ $('#slots').textContent = e.message; }
}
$('#f-esp').onchange = loadDocs; $('#f-doc').onchange = loadSlots; $('#f-fecha').onchange = loadSlots;
$('#slots').onclick = e => { const b = e.target.closest('.slot'); if(!b) return;
  document.querySelectorAll('.slot').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel.hora = b.dataset.h; $('#to2').disabled = false; };
const paso = n => { $('#st1').classList.toggle('hide', n!==1); $('#st2').classList.toggle('hide', n!==2);
  document.querySelectorAll('.steps div').forEach((d,i) => d.classList.toggle('on', i<n)); };
$('#to2').onclick = () => paso(2); $('#back1').onclick = () => paso(1);
$('#st2').onsubmit = async e => {
  e.preventDefault(); const btn = $('#send'); btn.disabled = true;
  const body = Object.fromEntries(new FormData(e.target)); Object.assign(body, {doctor_id:$('#f-doc').value, fecha:$('#f-fecha').value, hora:sel.hora});
  const box = $('#resumen'); box.style.display = 'block';
  try {
    const r = await post('/api/publico/citas', body);
    box.className = 'msg ok';
    box.innerHTML = `✅ ${esc(r.mensaje)}<br>${fmtF(body.fecha)} a las ${esc(body.hora)}<br><b>Tu código de cita: <span style="font-size:1.2rem;letter-spacing:.06em">${esc(r.codigo)}</span></b> — guárdalo y úsalo en «Mi cita».`;
    e.target.reset(); setTimeout(()=>{ paso(1); loadSlots(); btn.disabled = false; }, 3500);
  } catch(err){ box.className = 'msg bad'; box.textContent = '⚠️ ' + err.message; err.espera ? cuentaRegresiva(btn, err.espera) : (btn.disabled = false); }
};

// Reserva directa desde «Próximas horas libres»: precarga especialidad, doctor, fecha y hora en el agendador
async function reservar(did, espId, fecha, hora) {
  $('#f-esp').value = espId;
  $('#f-doc').innerHTML = doctores.filter(d => d.especialidad_id === espId).map(d => `<option value="${d.id}">Dr(a). ${d.nombre} ${d.apellido}</option>`).join('');
  $('#f-doc').value = did; $('#f-fecha').value = fecha;
  await loadSlots();
  const b = $('#slots').querySelector(`.slot[data-h="${hora}"]`); if (b) b.click();
  $('#cita').scrollIntoView({ behavior: 'smooth' });
}
(async function proximas() {
  try {
    const l = await api('/api/publico/proximas');
    $('#prox-list').innerHTML = l.map(p => `<div class="card prox hover"><div class="ph"><div class="avatar">${p.nombre.split(' ').map(x => x[0]).join('').slice(0, 2)}</div><div><b>Dr(a). ${p.nombre}</b><small>${p.especialidad}</small></div></div><span class="live"><i></i>${p.dia}</span><div class="hrs">${p.horas.map(h => `<button type="button" class="hbtn" onclick="reservar(${p.doctor_id},${p.especialidad_id},'${p.fecha}','${h}')">${h}</button>`).join('')}</div></div>`).join('')
      || '<p style="color:var(--muted)">No hay horas libres por ahora.</p>';
  } catch (e) { $('#disponibles').style.display = 'none'; }
})();


// ---------- «Mi cita»: consultar, cancelar o reprogramar con código + identidad
const ESTADOS = {pendiente:'Pendiente de confirmar', confirmada:'Confirmada', atendida:'Atendida', cancelada:'Cancelada', no_asistio:'No asistió'};
let mc = null, mcAuth = null, mcHora = null;
function mcMsg(txt, ok){ const b = $('#mc-msg'); b.style.display = txt ? 'block' : 'none'; b.className = 'msg ' + (ok ? 'ok' : 'bad'); b.textContent = txt; }
async function mcBuscar(){
  mc = await post('/api/publico/mi-cita', mcAuth);
  $('#mc-res').classList.remove('hide'); $('#mc-rep').classList.add('hide');
  $('#mc-info').innerHTML = `<b class="cod">${esc(mc.codigo)}</b><br><b>${fmtF(mc.fecha)}</b> a las <b>${esc(mc.hora)}</b><br>Dr(a). ${esc(mc.doctor)} · ${esc(mc.especialidad)}<br>Estado: <span class="tag">${ESTADOS[mc.estado] || esc(mc.estado)}</span>${mc.motivo ? `<br><small>Motivo: ${esc(mc.motivo)}</small>` : ''}`;
  $('#mc-acc').innerHTML = mc.puede_modificar
    ? '<button class="btn teal" id="mc-b-rep" type="button">Cambiar fecha u hora</button><button class="btn ghost" id="mc-b-can" type="button">Cancelar cita</button>'
    : '<span style="color:var(--muted);font-size:.9rem">Esta cita ya no se puede cambiar en línea (debe estar activa y faltar al menos 2 horas). Llama a la clínica si necesitas ayuda.</span>';
  if ($('#mc-b-can')) $('#mc-b-can').onclick = mcCancelar;
  if ($('#mc-b-rep')) $('#mc-b-rep').onclick = mcReprogramar;
}
$('#mc-form').onsubmit = async e => {
  e.preventDefault(); const btn = $('#mc-buscar'); btn.disabled = true; mcMsg('');
  mcAuth = {codigo: $('#mc-codigo').value.trim().toUpperCase(), identidad: $('#mc-ident').value};
  try { await mcBuscar(); btn.disabled = false; }
  catch(err){ $('#mc-res').classList.add('hide'); mcMsg('⚠️ ' + err.message); err.espera ? cuentaRegresiva(btn, err.espera) : (btn.disabled = false); }
};
async function mcCancelar(){
  if (!confirm('¿Seguro que quieres cancelar tu cita?')) return;
  try { const r = await post('/api/publico/mi-cita/cancelar', mcAuth); await mcBuscar(); mcMsg('✅ ' + r.mensaje, true); }
  catch(err){ mcMsg('⚠️ ' + err.message); }
}
function mcReprogramar(){
  $('#mc-rep').classList.remove('hide'); const f = $('#mc-fecha'); const hoy = new Date();
  f.min = new Date(hoy.getTime() - hoy.getTimezoneOffset()*6e4).toISOString().slice(0,10); f.value = mc.fecha >= f.min ? mc.fecha : f.min;
  f.onchange = mcSlots; mcSlots();
}
async function mcSlots(){
  mcHora = null; $('#mc-ok').disabled = true;
  try {
    const {horas} = await api(`/api/doctores/${mc.doctor_id}/disponibilidad?fecha=${$('#mc-fecha').value}`);
    $('#mc-slots').innerHTML = horas.length ? horas.map(h => `<button type="button" class="slot" data-h="${h}">${h}</button>`).join('') : '<span style="color:var(--muted)">Sin espacios ese día. Prueba otra fecha.</span>';
  } catch(e){ $('#mc-slots').textContent = e.message; }
}
$('#mc-slots').onclick = e => { const b = e.target.closest('.slot'); if (!b) return;
  document.querySelectorAll('#mc-slots .slot').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); mcHora = b.dataset.h; $('#mc-ok').disabled = false; };
$('#mc-ok').onclick = async () => {
  try { const r = await post('/api/publico/mi-cita/reprogramar', {...mcAuth, fecha: $('#mc-fecha').value, hora: mcHora}); await mcBuscar(); mcMsg('✅ ' + r.mensaje, true); }
  catch(err){ mcMsg('⚠️ ' + err.message); }
};
