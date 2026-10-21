const $ = s => document.querySelector(s);
const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const ESTADOS = {pendiente:'Pendiente',confirmada:'Confirmada',atendida:'Atendida',cancelada:'Cancelada',no_asistio:'No asistió'};
let USER = null, view = 'dashboard';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, method='GET', body){
  const r = await fetch(url, {method, headers:{'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined});
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { showLogin(); throw new Error(d.error); }
  if (!r.ok) throw new Error(d.error || 'Error de servidor');
  return d;
}
function toast(msg, bad){ const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (bad ? ' bad' : ''); setTimeout(() => t.className = 'toast', 3200); }
const guard = fn => async (...a) => { try { await fn(...a); } catch(e){ if(e.message) toast(e.message, true); } };
const fmtF = f => f ? f.split('-').reverse().join('/') : '';
const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const edad = f => f ? Math.floor((Date.now() - new Date(f)) / 31557600000) : '';
const canMed = () => ['admin','doctor'].includes(USER.rol);

function openModal(html){ $('#modal').innerHTML = html; $('#modal-bg').classList.add('open'); }
function closeModal(){ $('#modal-bg').classList.remove('open'); }
$('#modal-bg').onclick = e => { if (e.target.id === 'modal-bg') closeModal(); };

// ---------- sesión
function showLogin(){ $('#app').classList.add('hide'); $('#login').classList.remove('hide'); }
$('#login-form').onsubmit = async e => {
  e.preventDefault(); const b = Object.fromEntries(new FormData(e.target));
  try { USER = await api('/api/login', 'POST', b); $('#login-err').classList.add('hide'); start(); }
  catch(err){ const m = $('#login-err'); m.textContent = err.message; m.classList.remove('hide'); }
};
$('#logout').onclick = async () => { await api('/api/logout', 'POST'); USER = null; showLogin(); };
function start(){
  $('#login').classList.add('hide'); $('#app').classList.remove('hide');
  $('#who-n').textContent = USER.nombre; $('#who-r').textContent = {admin:'Administrador',recepcion:'Recepción',doctor:'Médico'}[USER.rol];
  document.querySelectorAll('[data-adm]').forEach(a => a.classList.toggle('hide', USER.rol !== 'admin'));   // Reportes y Auditoría: solo administrador
  go('dashboard');
}
document.querySelectorAll('.side a[data-v]').forEach(a => a.onclick = () => go(a.dataset.v));
function go(v){ view = v; document.querySelectorAll('.side a[data-v]').forEach(a => a.classList.toggle('on', a.dataset.v === v)); guard(VIEWS[v])(); }
(async () => { try { USER = await api('/api/me'); start(); } catch { showLogin(); } })();

// ---------- DASHBOARD
async function dashboard(){
  const d = await api('/api/dashboard'); const max = Math.max(1, ...d.por_especialidad.map(x => x.total));
  $('#view').innerHTML = `<div class="top"><h1>Hola, ${esc(USER.nombre.split(' ')[0])} 👋</h1><span style="color:var(--muted)">${new Date().toLocaleDateString('es-HN',{weekday:'long',day:'numeric',month:'long'})}</span></div>
  <div class="stats"><div class="stat"><b>${d.citas_hoy}</b><span>Citas de hoy</span></div><div class="stat"><b>${d.pendientes}</b><span>Pendientes por confirmar</span></div>
  <div class="stat"><b>${d.pacientes}</b><span>Pacientes registrados</span></div><div class="stat"><b>${d.doctores}</b><span>Doctores activos</span></div></div>
  <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:18px" class="dgrid">
   <div><h3 style="margin-bottom:10px">Próximas citas</h3><div class="tablewrap"><table><tr><th>Fecha</th><th>Paciente</th><th>Doctor</th><th>Estado</th></tr>
   ${d.proximas.map(c => `<tr><td>${fmtF(c.fecha)} ${c.hora}</td><td>${esc(c.paciente)}</td><td>${esc(c.doctor)}<br><small style="color:var(--muted)">${esc(c.especialidad)}</small></td><td><span class="badge b-${c.estado}">${ESTADOS[c.estado]}</span></td></tr>`).join('') || '<tr><td colspan=4 class="empty">Sin citas próximas</td></tr>'}</table></div></div>
   <div class="card bars"><h3 style="margin-bottom:6px">Citas por especialidad</h3>${d.por_especialidad.map(x => `<div class="bar"><span>${esc(x.nombre)}</span><i style="width:${x.total/max*100}%"></i><b>${x.total}</b></div>`).join('')}</div></div>`;
}

// ---------- CITAS
async function citas(){
  const [docs] = await Promise.all([api('/api/doctores')]);
  $('#view').innerHTML = `<div class="top"><h1>Citas</h1>${USER.rol !== 'doctor' ? '<button class="btn" id="nc">＋ Nueva cita</button>' : ''}</div>
  <div class="filters"><input type="date" id="fl-f"><select id="fl-e"><option value="">Todos los estados</option>${Object.entries(ESTADOS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select>
  ${USER.rol !== 'doctor' ? `<select id="fl-d"><option value="">Todos los doctores</option>${docs.map(d => `<option value="${d.id}">${esc(d.nombre+' '+d.apellido)}</option>`).join('')}</select>` : ''}
  <button class="btn ghost sm" id="fl-x">Limpiar</button></div><div class="tablewrap" id="ct"></div>`;
  const load = guard(async () => {
    const p = new URLSearchParams(); [['fecha','#fl-f'],['estado','#fl-e'],['doctor_id','#fl-d']].forEach(([k,s]) => { const el = $(s); if (el && el.value) p.set(k, el.value); });
    const rows = await api('/api/citas?' + p);
    $('#ct').innerHTML = `<table><tr><th>Fecha</th><th>Paciente</th><th>Doctor</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr>` + (rows.map(c => `<tr>
      <td><b>${fmtF(c.fecha)}</b><br>${c.hora}<br><small style="color:var(--muted)">${esc(c.codigo)}</small></td><td>${esc(c.paciente)}<br><small style="color:var(--muted)">${esc(c.tel_paciente)}</small></td>
      <td>${esc(c.doctor)}<br><small style="color:var(--muted)">${esc(c.especialidad)}</small></td><td>${esc(c.motivo)}${c.origen==='web'?' <span class="tag">web</span>':''}</td>
      <td><span class="badge b-${c.estado}">${ESTADOS[c.estado]}</span></td>
      <td style="white-space:nowrap">${acciones(c)}</td></tr>`).join('') || '<tr><td colspan=6 class="empty">No hay citas con esos filtros</td></tr>') + '</table>';
  });
  ['#fl-f','#fl-e','#fl-d'].forEach(s => $(s) && ($(s).onchange = load));
  $('#fl-x').onclick = () => { ['#fl-f','#fl-e','#fl-d'].forEach(s => $(s) && ($(s).value = '')); load(); };
  if ($('#nc')) $('#nc').onclick = guard(nuevaCita);
  window._reloadCitas = load; load();
}
// Recordatorio por WhatsApp: abre wa.me con el mensaje ya escrito (no necesita API ni costo)
function waLink(c){
  const d = String(c.tel_paciente || '').replace(/\D/g, ''), num = d.length === 8 ? '504' + d : d;
  const msg = `Hola ${c.paciente.split(' ')[0]}, le recordamos su cita en Clínica Vida Plena con Dr(a). ${c.doctor} el ${fmtF(c.fecha)} a las ${c.hora}. Código de cita: ${c.codigo}. Si necesita cambiarla puede hacerlo en nuestro sitio web (sección «Mi cita»).`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
function acciones(c){
  const wa = ['pendiente','confirmada'].includes(c.estado) ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waLink(c)}">📲 Recordar</a> ` : '';
  const b = (est, txt, cls='ghost') => `<button class="btn sm ${cls}" onclick="setEstado(${c.id},'${est}')">${txt}</button> `;
  if (c.estado === 'pendiente') return b('confirmada','Confirmar','teal') + wa + b('cancelada','Cancelar');
  if (c.estado === 'confirmada') return (canMed() ? `<button class="btn sm teal" onclick="atender(${c.id},${c.paciente_id},${c.doctor_id})">Atender</button> ` : '') + b('no_asistio','No asistió') + wa + b('cancelada','Cancelar');
  if (c.estado === 'cancelada' && USER.rol === 'admin') return `<button class="btn sm danger" onclick="delCita(${c.id})">Eliminar</button>`;
  return '';
}
window.setEstado = guard(async (id, estado) => { await api('/api/citas/' + id, 'PATCH', {estado}); toast('Cita actualizada'); closeModal(); window._reloadCitas(); });
window.delCita = guard(async id => { if (confirm('¿Eliminar esta cita definitivamente?')) { await api('/api/citas/' + id, 'DELETE'); window._reloadCitas(); } });

async function nuevaCita(){
  const [pacs, docs] = await Promise.all([api('/api/pacientes'), api('/api/doctores')]);
  openModal(`<h2>Nueva cita</h2><label>Paciente</label><select id="n-p">${pacs.map(p => `<option value="${p.id}">${esc(p.apellido+', '+p.nombre)} — ${esc(p.identidad)}</option>`).join('')}</select>
  <label>Doctor</label><select id="n-d">${docs.filter(d => d.activo).map(d => `<option value="${d.id}">${esc(d.nombre+' '+d.apellido)} · ${esc(d.especialidad)}</option>`).join('')}</select>
  <label>Fecha</label><input type="date" id="n-f" min="${hoyISO()}" value="${hoyISO()}"><label>Hora disponible</label><div class="slots" id="n-s"></div>
  <label>Motivo</label><textarea id="n-m" rows="2"></textarea><div class="acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn teal" id="n-ok" disabled>Guardar cita</button></div>`);
  let hora = null;
  const slots = guard(async () => { hora = null; $('#n-ok').disabled = true; const r = await api(`/api/doctores/${$('#n-d').value}/disponibilidad?fecha=${$('#n-f').value}`);
    $('#n-s').innerHTML = r.horas.map(h => `<button type="button" class="slot" data-h="${h}">${h}</button>`).join('') || '<span style="color:var(--muted)">Sin espacios ese día</span>'; });
  $('#n-d').onchange = slots; $('#n-f').onchange = slots; slots();
  $('#n-s').onclick = e => { const b = e.target.closest('.slot'); if (!b) return; document.querySelectorAll('#n-s .slot').forEach(x => x.classList.remove('sel')); b.classList.add('sel'); hora = b.dataset.h; $('#n-ok').disabled = false; };
  $('#n-ok').onclick = guard(async () => { await api('/api/citas', 'POST', {paciente_id:$('#n-p').value, doctor_id:$('#n-d').value, fecha:$('#n-f').value, hora, motivo:$('#n-m').value}); closeModal(); toast('Cita creada'); window._reloadCitas(); });
}

window.atender = (cid, pid, did) => consultaForm(pid, did, cid);
function consultaForm(pid, did, cid){
  openModal(`<h2>Registrar consulta</h2><div class="row3"><div><label>Peso (kg)</label><input type="number" step=".1" id="c-peso"></div><div><label>Altura (cm)</label><input type="number" step=".1" id="c-alt"></div><div><label>Presión</label><input id="c-pre" placeholder="120/80"></div></div>
  <label>Temperatura (°C)</label><input type="number" step=".1" id="c-tem"><label>Diagnóstico *</label><textarea id="c-dx" rows="2"></textarea>
  <label>Tratamiento / receta</label><textarea id="c-tx" rows="2"></textarea><label>Observaciones</label><textarea id="c-ob" rows="2"></textarea>
  <div class="acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn teal" id="c-ok">Guardar consulta</button></div>`);
  $('#c-ok').onclick = guard(async () => {
    await api(`/api/pacientes/${pid}/consultas`, 'POST', {cita_id:cid||null, doctor_id:did, peso_kg:$('#c-peso').value, altura_cm:$('#c-alt').value, presion:$('#c-pre').value,
      temperatura:$('#c-tem').value, diagnostico:$('#c-dx').value, tratamiento:$('#c-tx').value, observaciones:$('#c-ob').value});
    closeModal(); toast('Consulta registrada'); if (view === 'citas' || view === 'calendario') window._reloadCitas(); else expediente(pid);
  });
}

// ---------- PACIENTES
async function pacientes(){
  $('#view').innerHTML = `<div class="top"><h1>Pacientes</h1>${USER.rol !== 'doctor' ? '<button class="btn" id="np">＋ Nuevo paciente</button>' : ''}</div>
  <div class="filters"><input id="pq" placeholder="Buscar por nombre, identidad o teléfono…" style="min-width:320px"></div><div class="tablewrap" id="pt"></div>`;
  const load = guard(async () => {
    const rows = await api('/api/pacientes?q=' + encodeURIComponent($('#pq').value));
    $('#pt').innerHTML = `<table><tr><th>Paciente</th><th>Identidad</th><th>Edad</th><th>Teléfono</th><th>Acciones</th></tr>` + (rows.map(p => `<tr>
      <td><b>${esc(p.apellido)}, ${esc(p.nombre)}</b></td><td>${esc(p.identidad)}</td><td>${edad(p.fecha_nacimiento)}</td><td>${esc(p.telefono)}</td>
      <td style="white-space:nowrap"><button class="btn sm teal" onclick="expediente(${p.id})">Expediente</button> ${USER.rol !== 'doctor' ? `<button class="btn sm ghost" onclick="pacForm(${p.id})">Editar</button> ` : ''}${USER.rol === 'admin' ? `<button class="btn sm danger" onclick="delPac(${p.id})">Eliminar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan=5 class="empty">Sin resultados</td></tr>') + '</table>';
  });
  let t; $('#pq').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); };
  if ($('#np')) $('#np').onclick = () => pacForm();
  window._reloadPac = load; load();
}
window.delPac = guard(async id => { if (confirm('Se eliminará el paciente con su expediente y citas. ¿Continuar?')) { await api('/api/pacientes/' + id, 'DELETE'); toast('Paciente eliminado'); window._reloadPac(); } });
window.pacForm = guard(async id => {
  const p = id ? await api('/api/pacientes/' + id) : {};
  const f = (k, l, t='text', ph='') => `<div><label>${l}</label><input type="${t}" id="p-${k}" value="${esc(p[k])}" placeholder="${ph}"></div>`;
  openModal(`<h2>${id ? 'Editar' : 'Nuevo'} paciente</h2><div class="row2">${f('nombre','Nombres *')}${f('apellido','Apellidos *')}</div>
  <div class="row2">${f('identidad','Identidad *','text','0801-1990-12345')}${f('telefono','Teléfono *')}</div>
  <div class="row3">${f('fecha_nacimiento','Nacimiento','date')}<div><label>Sexo</label><select id="p-sexo"><option value="">—</option>${['F','M','O'].map(s => `<option ${p.sexo===s?'selected':''}>${s}</option>`).join('')}</select></div>${f('email','Correo','email')}</div>
  ${f('direccion','Dirección')}${f('contacto_emergencia','Contacto de emergencia')}
  <div class="acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn teal" id="p-ok">Guardar</button></div>`);
  $('#p-identidad').oninput = e => { const d = e.target.value.replace(/\D/g, '').slice(0, 13); e.target.value = [d.slice(0,4), d.slice(4,8), d.slice(8)].filter(Boolean).join('-'); };
  $('#p-ok').onclick = guard(async () => {
    const b = {}; ['nombre','apellido','identidad','telefono','fecha_nacimiento','sexo','email','direccion','contacto_emergencia'].forEach(k => b[k] = $('#p-' + k).value);
    await api(id ? '/api/pacientes/' + id : '/api/pacientes', id ? 'PUT' : 'POST', b); closeModal(); toast('Paciente guardado'); window._reloadPac && window._reloadPac();
  });
});

window.expediente = guard(async pid => {
  const [p, e] = await Promise.all([api('/api/pacientes/' + pid), api(`/api/pacientes/${pid}/expediente`)]); const x = e.expediente;
  openModal(`<h2>Expediente de ${esc(p.nombre)} ${esc(p.apellido)}</h2><p style="color:var(--muted);margin-bottom:12px">${esc(p.identidad)} · ${edad(p.fecha_nacimiento)} años · ${esc(p.telefono)}</p>
  <div class="row2"><div><label>Tipo de sangre</label><select id="e-ts"><option value="">—</option>${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(s => `<option ${x.tipo_sangre===s?'selected':''}>${s}</option>`).join('')}</select></div><div></div></div>
  <label>Alergias</label><input id="e-al" value="${esc(x.alergias)}"><label>Enfermedades crónicas</label><input id="e-ch" value="${esc(x.enfermedades_cronicas)}">
  <label>Antecedentes</label><textarea id="e-an" rows="2">${esc(x.antecedentes)}</textarea>
  <div class="acts" style="margin-top:12px"><button class="btn teal sm" id="e-ok">Guardar datos básicos</button></div>
  <h3 style="margin-top:20px">Historial de consultas</h3>
  ${USER.rol === 'recepcion' ? '<p class="empty">El historial clínico solo es visible para el personal médico.</p>' :
   `<div class="timeline">${e.consultas.map(c => `<div class="it"><b>${fmtF(c.fecha)}</b> · ${esc(c.doctor)}<br><b>Dx:</b> ${esc(c.diagnostico)}<br>${c.tratamiento ? `<b>Tx:</b> ${esc(c.tratamiento)}<br>` : ''}<small style="color:var(--muted)">${[c.peso_kg&&c.peso_kg+' kg',c.altura_cm&&c.altura_cm+' cm',c.presion&&'PA '+c.presion,c.temperatura&&c.temperatura+' °C'].filter(Boolean).join(' · ')}</small>
  ${canMed() ? `<div style="margin-top:6px"><a class="btn sm ghost" target="_blank" rel="noopener" href="/documento/receta/${c.id}">🧾 Receta</a> <a class="btn sm ghost" target="_blank" rel="noopener" href="/documento/constancia/${c.id}">📄 Constancia</a></div>` : ''}</div>`).join('') || '<p style="color:var(--muted)">Aún no hay consultas registradas.</p>'}</div>`}
  <div class="acts"><button class="btn ghost" onclick="closeModal()">Cerrar</button>${canMed() ? `<button class="btn" id="e-nc">＋ Nueva consulta</button>` : ''}</div>`);
  $('#e-ok').onclick = guard(async () => { await api(`/api/pacientes/${pid}/expediente`, 'PUT', {tipo_sangre:$('#e-ts').value, alergias:$('#e-al').value, enfermedades_cronicas:$('#e-ch').value, antecedentes:$('#e-an').value}); toast('Expediente actualizado'); });
  if ($('#e-nc')) $('#e-nc').onclick = () => consultaForm(pid, USER.doctor_id, null);
});

// ---------- DOCTORES
async function doctores(){
  const docs = await api('/api/doctores'); const adm = USER.rol === 'admin';
  $('#view').innerHTML = `<div class="top"><h1>Doctores y horarios</h1>${adm ? '<button class="btn" id="nd">＋ Nuevo doctor</button>' : ''}</div><div class="tablewrap"><table><tr><th>Doctor</th><th>Especialidad</th><th>Horario semanal</th><th>Cita</th>${adm ? '<th>Acciones</th>' : ''}</tr>` +
  docs.map(d => `<tr style="${d.activo ? '' : 'opacity:.5'}"><td><b>${esc(d.nombre)} ${esc(d.apellido)}</b><br><small style="color:var(--muted)">${esc(d.colegiado)} · ${esc(d.telefono)}</small></td><td>${esc(d.especialidad)}</td>
  <td>${d.horario.map(h => `<span class="tag" style="margin:2px">${DIAS[h.dia_semana].slice(0,3)} ${h.hora_inicio}–${h.hora_fin}</span>`).join('') || '<small>Sin horario</small>'}</td><td>${d.duracion_cita_min} min</td>
  ${adm ? `<td style="white-space:nowrap"><button class="btn sm ghost" onclick="docForm(${d.id})">Editar</button> <button class="btn sm teal" onclick="horarioForm(${d.id})">Horario</button> ${d.activo ? `<button class="btn sm danger" onclick="baja(${d.id})">Dar de baja</button>` : ''}</td>` : ''}</tr>`).join('') + '</table></div>';
  if (adm) $('#nd').onclick = () => docForm();
}
window.baja = guard(async id => { if (confirm('El doctor dejará de aparecer para nuevas citas (se conserva su historial). ¿Continuar?')) { await api('/api/doctores/' + id, 'DELETE'); doctores(); } });
window.docForm = guard(async id => {
  const [esp, docs] = await Promise.all([api('/api/especialidades'), api('/api/doctores')]); const d = id ? docs.find(x => x.id === id) : {duracion_cita_min:30, activo:1};
  const f = (k, l, t='text') => `<div><label>${l}</label><input type="${t}" id="d-${k}" value="${esc(d[k])}"></div>`;
  openModal(`<h2>${id ? 'Editar' : 'Nuevo'} doctor</h2><div class="row2">${f('nombre','Nombres *')}${f('apellido','Apellidos *')}</div>
  <label>Especialidad *</label><select id="d-esp">${esp.map(e => `<option value="${e.id}" ${d.especialidad_id===e.id?'selected':''}>${esc(e.nombre)}</option>`).join('')}</select>
  <div class="row3">${f('colegiado','Colegiado')}${f('telefono','Teléfono')}${f('duracion_cita_min','Minutos por cita','number')}</div>${f('email','Correo','email')}
  <div class="acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn teal" id="d-ok">Guardar</button></div>`);
  $('#d-ok').onclick = guard(async () => { const b = {especialidad_id:$('#d-esp').value, activo:d.activo !== 0}; ['nombre','apellido','colegiado','telefono','email','duracion_cita_min'].forEach(k => b[k] = $('#d-' + k).value);
    await api(id ? '/api/doctores/' + id : '/api/doctores', id ? 'PUT' : 'POST', b); closeModal(); toast('Doctor guardado'); doctores(); });
});
window.horarioForm = guard(async id => {
  const d = (await api('/api/doctores')).find(x => x.id === id); let bl = d.horario.map(h => ({...h}));
  const draw = () => { $('#h-list').innerHTML = bl.map((b, i) => `<div class="row3" style="grid-template-columns:1.3fr 1fr 1fr auto;align-items:end"><div><label>Día</label><select data-i="${i}" data-k="dia_semana">${DIAS.map((n,j) => `<option value="${j}" ${b.dia_semana===j?'selected':''}>${n}</option>`).join('')}</select></div>
    <div><label>Desde</label><input type="time" data-i="${i}" data-k="hora_inicio" value="${b.hora_inicio}"></div><div><label>Hasta</label><input type="time" data-i="${i}" data-k="hora_fin" value="${b.hora_fin}"></div><button class="btn sm danger" onclick="window._rm(${i})">✕</button></div>`).join('') || '<p class="empty">Sin bloques de atención</p>'; };
  openModal(`<h2>Horario de ${esc(d.nombre)} ${esc(d.apellido)}</h2><p style="color:var(--muted)">Cada bloque se divide en citas de ${d.duracion_cita_min} minutos.</p><div id="h-list"></div>
  <button class="btn ghost sm" style="margin-top:12px" id="h-add">＋ Agregar bloque</button><div class="acts"><button class="btn ghost" onclick="closeModal()">Cancelar</button><button class="btn teal" id="h-ok">Guardar horario</button></div>`);
  draw(); window._rm = i => { bl.splice(i, 1); draw(); };
  $('#h-list').onchange = e => { const t = e.target, i = +t.dataset.i; if (t.dataset.k) bl[i][t.dataset.k] = t.dataset.k === 'dia_semana' ? +t.value : t.value; };
  $('#h-add').onclick = () => { bl.push({dia_semana:0, hora_inicio:'08:00', hora_fin:'12:00'}); draw(); };
  $('#h-ok').onclick = guard(async () => { await api(`/api/doctores/${id}/horario`, 'PUT', {bloques:bl}); closeModal(); toast('Horario actualizado'); doctores(); });
});

// ---------- CALENDARIO SEMANAL
let calSemana = null;
const isoD = d => new Date(d.getTime() - d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const lunesDe = d => { const x = new Date(d); x.setHours(12,0,0,0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
async function calendario(){
  calSemana = calSemana || lunesDe(new Date());
  const docs = USER.rol === 'doctor' ? [] : await api('/api/doctores');
  $('#view').innerHTML = `<div class="top"><h1>Calendario semanal</h1></div>
  <div class="cal-bar"><button class="btn ghost sm" id="cal-prev">← Anterior</button><b id="cal-rango"></b><button class="btn ghost sm" id="cal-next">Siguiente →</button><button class="btn ghost sm" id="cal-hoy">Hoy</button>
  ${docs.length ? `<select id="cal-doc"><option value="">Todos los doctores</option>${docs.filter(d => d.activo).map(d => `<option value="${d.id}">${esc(d.nombre+' '+d.apellido)}</option>`).join('')}</select>` : ''}</div><div class="cal" id="cal"></div>`;
  let filas = [];
  const load = guard(async () => {
    const fin = sumarDias(calSemana, 6), p = new URLSearchParams({desde: isoD(calSemana), hasta: isoD(fin)});
    if ($('#cal-doc') && $('#cal-doc').value) p.set('doctor_id', $('#cal-doc').value);
    filas = (await api('/api/citas?' + p)).sort((a, b) => a.hora.localeCompare(b.hora));
    $('#cal-rango').textContent = `${fmtF(isoD(calSemana)).slice(0,5)} – ${fmtF(isoD(fin))}`;
    $('#cal').innerHTML = DIAS.map((dia, i) => { const f = isoD(sumarDias(calSemana, i)), del = filas.filter(c => c.fecha === f);
      return `<div class="col ${f === hoyISO() ? 'hoy' : ''}"><h4>${dia}<small>${fmtF(f).slice(0,5)}</small></h4>` +
        (del.map(c => `<button class="ev ${c.estado}" data-id="${c.id}"><b>${c.hora}</b> ${esc(c.paciente)}<br><small style="color:var(--muted)">${esc(c.doctor)}</small></button>`).join('') || '<div class="vacio">Sin citas</div>') + '</div>'; }).join('');
  });
  $('#cal-prev').onclick = () => { calSemana = sumarDias(calSemana, -7); load(); };
  $('#cal-next').onclick = () => { calSemana = sumarDias(calSemana, 7); load(); };
  $('#cal-hoy').onclick = () => { calSemana = lunesDe(new Date()); load(); };
  if ($('#cal-doc')) $('#cal-doc').onchange = load;
  $('#cal').onclick = e => { const b = e.target.closest('.ev'); if (!b) return; const c = filas.find(x => x.id == b.dataset.id); if (!c) return;
    openModal(`<h2>Cita ${esc(c.codigo)}</h2><p style="line-height:1.8"><b>${fmtF(c.fecha)}</b> a las <b>${c.hora}</b><br>Paciente: ${esc(c.paciente)} · ${esc(c.tel_paciente)}<br>Doctor: ${esc(c.doctor)} (${esc(c.especialidad)})<br>Motivo: ${esc(c.motivo) || '—'}<br>Estado: <span class="badge b-${c.estado}">${ESTADOS[c.estado]}</span></p>
    <div class="acts" style="flex-wrap:wrap">${acciones(c)}<button class="btn ghost sm" onclick="closeModal()">Cerrar</button></div>`); };
  window._reloadCitas = load; load();
}

// ---------- REPORTES (administrador)
async function reportes(){
  const h = hoyISO();
  $('#view').innerHTML = `<div class="top"><h1>Reportes</h1></div>
  <div class="filters"><span style="color:var(--muted)">Desde</span><input type="date" id="r-d" value="${h.slice(0,8)}01"><span style="color:var(--muted)">Hasta</span><input type="date" id="r-h" value="${h}">
  <button class="btn sm teal" id="r-go">Ver</button><a class="btn sm ghost" id="r-csv">⬇️ Descargar CSV (Excel)</a><button class="btn sm ghost" id="r-pr">🖨️ Imprimir / PDF</button></div><div id="r-out"></div>`;
  const load = guard(async () => {
    const q = `desde=${$('#r-d').value}&hasta=${$('#r-h').value}`; $('#r-csv').href = '/api/reportes/citas.csv?' + q;
    const r = await api('/api/reportes/resumen?' + q);
    $('#r-out').innerHTML = `<div class="rep-total">${r.total} citas entre ${fmtF(r.desde)} y ${fmtF(r.hasta)}</div><div class="tablewrap"><table><tr><th>Doctor</th><th>Especialidad</th><th>Total</th><th>Atendidas</th><th>Confirmadas</th><th>Pendientes</th><th>Canceladas</th><th>No asistió</th></tr>` +
      r.por_doctor.map(f => `<tr><td><b>${esc(f.doctor)}</b></td><td>${esc(f.especialidad)}</td><td><b>${f.total}</b></td><td>${f.atendidas}</td><td>${f.confirmadas}</td><td>${f.pendientes}</td><td>${f.canceladas}</td><td>${f.no_asistio}</td></tr>`).join('') + '</table></div>';
  });
  $('#r-go').onclick = load; $('#r-pr').onclick = () => window.print(); load();
}

// ---------- AUDITORÍA (administrador)
async function auditoria(){
  $('#view').innerHTML = `<div class="top"><h1>Bitácora de auditoría</h1></div><div class="filters"><input id="a-q" placeholder="Buscar por usuario, acción o detalle…" style="min-width:320px"></div><div class="tablewrap" id="a-t"></div>`;
  const load = guard(async () => {
    const rows = await api('/api/auditoria?q=' + encodeURIComponent($('#a-q').value));
    $('#a-t').innerHTML = `<table><tr><th>Fecha y hora</th><th>Usuario</th><th>Acción</th><th>Detalle</th><th>IP</th></tr>` + (rows.map(a => `<tr><td style="white-space:nowrap">${esc(a.creado_en)}</td><td>${esc(a.usuario)}<br><small style="color:var(--muted)">${esc(a.rol)}</small></td><td>${esc(a.accion)}</td><td>${esc(a.detalle)}</td><td><small>${esc(a.ip)}</small></td></tr>`).join('') || '<tr><td colspan=5 class="empty">Sin registros</td></tr>') + '</table>';
  });
  let t; $('#a-q').oninput = () => { clearTimeout(t); t = setTimeout(load, 250); }; load();
}

const VIEWS = {dashboard, citas, pacientes, doctores, calendario, reportes, auditoria};
