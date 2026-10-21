"""Datos de ejemplo. Se cargan solos la primera vez; también: python seed.py"""
import os
import sqlite3
from datetime import date, timedelta
from werkzeug.security import generate_password_hash


def seed(db):
    db.execute("PRAGMA foreign_keys = ON")
    esp = [("Medicina General", "Consulta integral para toda la familia", "🩺"),
           ("Pediatría", "Atención médica para bebés, niños y adolescentes", "🧸"),
           ("Ginecología", "Salud de la mujer, control prenatal y más", "🌸"),
           ("Cardiología", "Corazón, presión arterial y circulación", "❤️"),
           ("Dermatología", "Cuidado de la piel, cabello y uñas", "✨"),
           ("Odontología", "Salud dental y limpieza bucal", "🦷")]
    db.executemany("INSERT INTO especialidades(nombre,descripcion,icono) VALUES (?,?,?)", esp)

    docs = [("Carlos", "Mejía", 1, "CMH-4521", "9988-1100", "cmejia@vidaplena.hn", 30),
            ("Lucía", "Reyes", 2, "CMH-5033", "9988-2200", "lreyes@vidaplena.hn", 30),
            ("Sofía", "Bonilla", 3, "CMH-4877", "9988-3300", "sbonilla@vidaplena.hn", 40),
            ("Andrés", "Cruz", 4, "CMH-3912", "9988-4400", "acruz@vidaplena.hn", 30),
            ("Mariela", "Fúnez", 5, "CMH-5210", "9988-5500", "mfunez@vidaplena.hn", 30),
            ("Roberto", "Zelaya", 6, "CMH-4410", "9988-6600", "rzelaya@vidaplena.hn", 45)]
    db.executemany("""INSERT INTO doctores(nombre,apellido,especialidad_id,colegiado,telefono,email,duracion_cita_min)
                      VALUES (?,?,?,?,?,?,?)""", docs)

    # (doctor, [días], inicio, fin)
    horarios = [(1, [0, 1, 2, 3, 4], "08:00", "12:00"), (1, [0, 2, 4], "14:00", "17:00"),
                (2, [0, 1, 3], "09:00", "13:00"), (2, [2, 4], "14:00", "18:00"),
                (3, [1, 3], "08:00", "12:00"), (3, [4], "13:00", "17:00"),
                (4, [0, 2], "10:00", "16:00"), (4, [5], "08:00", "12:00"),
                (5, [1, 2, 3], "09:00", "15:00"),
                (6, [0, 1, 2, 3, 4], "13:00", "18:00")]
    for did, dias, ini, fin in horarios:
        for d in dias:
            db.execute("INSERT INTO horarios_doctor(doctor_id,dia_semana,hora_inicio,hora_fin) VALUES (?,?,?,?)", (did, d, ini, fin))

    # En producción defina ADMIN_PASSWORD, RECEPCION_PASSWORD y DOCTOR_PASSWORD para no usar las de ejemplo
    usuarios = [("Administrador", "admin@vidaplena.hn", os.environ.get("ADMIN_PASSWORD", "Admin123!"), "admin", None),
                ("Recepción", "recepcion@vidaplena.hn", os.environ.get("RECEPCION_PASSWORD", "Recep123!"), "recepcion", None),
                ("Dr. Carlos Mejía", "doctor@vidaplena.hn", os.environ.get("DOCTOR_PASSWORD", "Doctor123!"), "doctor", 1)]
    for n, e, pw, rol, did in usuarios:
        db.execute("INSERT INTO usuarios(nombre,email,password_hash,rol,doctor_id) VALUES (?,?,?,?,?)",
                   (n, e, generate_password_hash(pw), rol, did))

    pacientes = [("0801-1990-01234", "María", "López", "1990-03-14", "F", "9911-2233", "Col. Kennedy, Tegucigalpa", "A+", "Penicilina", ""),
                 ("0801-1985-05678", "José", "Hernández", "1985-07-02", "M", "9922-3344", "Col. Palmira, Tegucigalpa", "O+", "", "Hipertensión"),
                 ("0501-2015-00987", "Daniela", "Pineda", "2015-11-20", "F", "9933-4455", "Res. Altos del Trapiche", "B+", "Ninguna conocida", ""),
                 ("0801-1978-03321", "Ana", "Castillo", "1978-01-30", "F", "9944-5566", "Col. Miraflores", "AB+", "Mariscos", "Diabetes tipo 2"),
                 ("0801-2001-07765", "Kevin", "Ordóñez", "2001-09-09", "M", "9955-6677", "Col. 21 de Octubre", "O-", "", ""),
                 ("0801-1992-02210", "Gabriela", "Mendoza", "1992-05-18", "F", "9966-7788", "Col. Lomas del Guijarro", "A-", "Polen", "Asma"),
                 ("0801-1969-04412", "Héctor", "Maradiaga", "1969-12-01", "M", "9977-8899", "Col. Los Pinos", "B-", "", "Hipertensión, colesterol alto"),
                 ("0801-2010-08890", "Valeria", "Rivera", "2010-04-25", "F", "9988-9900", "Col. El Hogar", "O+", "", "")]
    for ident, n, a, fn, sx, tel, dire, sg, al, ch in pacientes:
        pid = db.execute("""INSERT INTO pacientes(identidad,nombre,apellido,fecha_nacimiento,sexo,telefono,direccion,contacto_emergencia)
                            VALUES (?,?,?,?,?,?,?,?)""", (ident, n, a, fn, sx, tel, dire, "Familiar - 9900-0000")).lastrowid
        db.execute("INSERT INTO expedientes(paciente_id,tipo_sangre,alergias,enfermedades_cronicas) VALUES (?,?,?,?)",
                   (pid, sg, al, ch))

    hoy = date.today()
    def proximo_dia(dow, offset=0):
        d = hoy + timedelta(days=1 + offset)
        while d.weekday() != dow:
            d += timedelta(days=1)
        return d.isoformat()

    citas = [(1, 1, proximo_dia(0), "08:00", "Chequeo general", "confirmada"),
             (2, 1, proximo_dia(0), "08:30", "Control de presión", "confirmada"),
             (3, 2, proximo_dia(1), "09:00", "Control de niño sano", "pendiente"),
             (4, 4, proximo_dia(2), "10:00", "Revisión de glucosa y corazón", "confirmada"),
             (6, 5, proximo_dia(2), "09:30", "Alergia en la piel", "pendiente"),
             (7, 4, proximo_dia(0, 7), "10:30", "Seguimiento hipertensión", "pendiente"),
             (5, 6, proximo_dia(3), "14:00", "Limpieza dental", "confirmada")]
    for pid, did, f, h, m, e in citas:
        db.execute("INSERT INTO citas(paciente_id,doctor_id,fecha,hora,motivo,estado) VALUES (?,?,?,?,?,?)", (pid, did, f, h, m, e))

    ayer = (hoy - timedelta(days=10)).isoformat()
    cid = db.execute("INSERT INTO citas(paciente_id,doctor_id,fecha,hora,motivo,estado) VALUES (2,1,?,?,?,?)",
                     (ayer, "09:00", "Dolor de cabeza frecuente", "atendida")).lastrowid
    db.execute("""INSERT INTO consultas(cita_id,paciente_id,doctor_id,fecha,peso_kg,altura_cm,presion,temperatura,diagnostico,tratamiento,observaciones)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
               (cid, 2, 1, ayer, 82.5, 175, "140/90", 36.6, "Cefalea tensional asociada a hipertensión",
                "Losartán 50 mg cada 24 h. Reducir sal.", "Control en 15 días"))
    db.commit()


if __name__ == "__main__":
    path = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "clinica.db"))
    if os.path.exists(path):
        os.remove(path)
    import app  # recrea esquema + datos
    print("Base de datos reiniciada:", path)
