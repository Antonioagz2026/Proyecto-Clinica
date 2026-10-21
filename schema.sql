-- ============================================================
--  Clínica Vida Plena — Esquema de base de datos (SQLite 3)
--  Normalizado a 3FN, con llaves foráneas, CHECKs e índices.
-- ============================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS especialidades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    icono       TEXT DEFAULT '🩺'
);

CREATE TABLE IF NOT EXISTS doctores (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre           TEXT NOT NULL,
    apellido         TEXT NOT NULL,
    especialidad_id  INTEGER NOT NULL REFERENCES especialidades(id),
    colegiado        TEXT UNIQUE,                 -- N° de colegiación (CMH)
    telefono         TEXT,
    email            TEXT,
    duracion_cita_min INTEGER NOT NULL DEFAULT 30 CHECK (duracion_cita_min BETWEEN 10 AND 120),
    activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

-- Horario semanal de cada doctor (0 = lunes ... 6 = domingo)
CREATE TABLE IF NOT EXISTS horarios_doctor (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    doctor_id   INTEGER NOT NULL REFERENCES doctores(id) ON DELETE CASCADE,
    dia_semana  INTEGER NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    hora_inicio TEXT NOT NULL,                    -- 'HH:MM'
    hora_fin    TEXT NOT NULL,
    CHECK (hora_inicio < hora_fin)
);
CREATE INDEX IF NOT EXISTS idx_horarios_doctor ON horarios_doctor(doctor_id, dia_semana);

CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre        TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol           TEXT NOT NULL CHECK (rol IN ('admin','recepcion','doctor')),
    doctor_id     INTEGER REFERENCES doctores(id) ON DELETE SET NULL,
    activo        INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0,1))
);

CREATE TABLE IF NOT EXISTS pacientes (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    identidad          TEXT NOT NULL UNIQUE,      -- DNI hondureño 0000-0000-00000
    nombre             TEXT NOT NULL,
    apellido           TEXT NOT NULL,
    fecha_nacimiento   TEXT,
    sexo               TEXT CHECK (sexo IN ('F','M','O')),
    telefono           TEXT,
    email              TEXT,
    direccion          TEXT,
    contacto_emergencia TEXT,
    creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre ON pacientes(apellido, nombre);

-- Expediente médico básico: relación 1 a 1 con el paciente
CREATE TABLE IF NOT EXISTS expedientes (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    paciente_id           INTEGER NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
    tipo_sangre           TEXT CHECK (tipo_sangre IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
    alergias              TEXT,
    enfermedades_cronicas TEXT,
    antecedentes          TEXT,
    actualizado_en        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS citas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo      TEXT,                             -- código público de la cita (VP-XXXXXX); con la identidad permite consultarla/cancelarla
    paciente_id INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    doctor_id   INTEGER NOT NULL REFERENCES doctores(id),
    fecha       TEXT NOT NULL,                    -- 'YYYY-MM-DD'
    hora        TEXT NOT NULL,                    -- 'HH:MM'
    motivo      TEXT,
    estado      TEXT NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','confirmada','atendida','cancelada','no_asistio')),
    origen      TEXT NOT NULL DEFAULT 'interno' CHECK (origen IN ('web','interno')),
    creado_en   TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- Un doctor no puede tener dos citas activas a la misma fecha y hora
CREATE UNIQUE INDEX IF NOT EXISTS ux_cita_doctor_slot
    ON citas(doctor_id, fecha, hora) WHERE estado <> 'cancelada';
CREATE UNIQUE INDEX IF NOT EXISTS ux_cita_codigo ON citas(codigo);
CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_paciente ON citas(paciente_id);

-- Historial clínico: una consulta por cita atendida
CREATE TABLE IF NOT EXISTS consultas (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    cita_id      INTEGER UNIQUE REFERENCES citas(id) ON DELETE SET NULL,
    paciente_id  INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    doctor_id    INTEGER NOT NULL REFERENCES doctores(id),
    fecha        TEXT NOT NULL DEFAULT (date('now','localtime')),
    peso_kg      REAL,
    altura_cm    REAL,
    presion      TEXT,
    temperatura  REAL,
    diagnostico  TEXT NOT NULL,
    tratamiento  TEXT,
    observaciones TEXT
);
CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON consultas(paciente_id, fecha);


-- Bitácora de auditoría: quién hizo qué (accesos, cambios en expedientes, citas, reportes)
CREATE TABLE IF NOT EXISTS auditoria (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    usuario    TEXT NOT NULL,                     -- nombre al momento de la acción (o 'Paciente (web)')
    rol        TEXT,
    accion     TEXT NOT NULL,
    detalle    TEXT,
    ip         TEXT,
    creado_en  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha ON auditoria(creado_en);

-- Control de abuso (límite de intentos). Se guarda en la base para que funcione con varios procesos.
CREATE TABLE IF NOT EXISTS limites  (clave TEXT NOT NULL, ts REAL NOT NULL);
CREATE INDEX IF NOT EXISTS idx_limites ON limites(clave, ts);
CREATE TABLE IF NOT EXISTS bloqueos (clave TEXT PRIMARY KEY, hasta REAL NOT NULL);
