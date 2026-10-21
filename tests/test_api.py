"""Pruebas automáticas de la API. Ejecutar:  python -m unittest discover -s tests -v   (o: pytest)"""
import os
import sys
import tempfile
import unittest
from datetime import date, timedelta

_tmp = tempfile.mkdtemp()
os.environ["DB_PATH"] = os.path.join(_tmp, "prueba.db")      # base de datos aislada: no toca clinica.db
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import app as clinica  # noqa: E402

_n = [0]


def identidad_nueva():
    """DNI hondureño válido y distinto en cada llamada."""
    _n[0] += 1
    return f"0801-1990-{_n[0]:05d}"


class Base(unittest.TestCase):
    def setUp(self):
        self.c = clinica.app.test_client()
        with clinica.app.app_context():                  # cada prueba parte sin bloqueos previos
            clinica.run("DELETE FROM limites")
            clinica.run("DELETE FROM bloqueos")

    def login(self, email, pw, client=None):
        return (client or self.c).post("/api/login", json={"email": email, "password": pw})

    def cliente(self, email, pw):
        c = clinica.app.test_client()
        self.assertEqual(self.login(email, pw, c).status_code, 200)
        return c

    def slot_libre(self, doctor=1, saltar=0):
        """Primera (fecha, hora) libre de un doctor en los próximos 30 días."""
        for i in range(1, 31):
            f = (date.today() + timedelta(days=i)).isoformat()
            horas = self.c.get(f"/api/doctores/{doctor}/disponibilidad?fecha={f}").get_json()["horas"]
            if len(horas) > saltar:
                return f, horas[saltar]
        self.fail("No hay horarios libres en el seed")

    def datos_cita(self, ident=None, **extra):
        f, h = self.slot_libre()
        d = {"identidad": ident or identidad_nueva(), "nombre": "Prueba", "apellido": "Tester", "telefono": "9999-1234",
             "doctor_id": 1, "fecha": f, "hora": h, "motivo": "Chequeo"}
        d.update(extra)
        return d


class TestValidaciones(Base):
    def test_identidad_honduras(self):
        v = clinica.valid_identidad
        self.assertTrue(v("0801-1990-12345"))
        self.assertTrue(v("0801199012345"))
        self.assertFalse(v("1999-1990-12345"))      # departamento 19 no existe (01-18)
        self.assertFalse(v("0001-1990-12345"))      # departamento 00
        self.assertFalse(v("0801-1850-12345"))      # año imposible
        self.assertFalse(v("0801-2999-12345"))      # año en el futuro
        self.assertFalse(v("abcd-1990-12345"))

    def test_telefono_honduras(self):
        v = clinica.valid_tel
        for ok in ("9999-1234", "99991234", "+504 9999-1234", "2230-1122", "3300-1122", "8800-1122"):
            self.assertTrue(v(ok), ok)
        for mal in ("1234-5678", "999-123", "5555-5555", "abcd"):
            self.assertFalse(v(mal), mal)


class TestCitasPublicas(Base):
    def test_reserva_devuelve_codigo_y_evita_doble_agenda(self):
        d = self.datos_cita()
        r = self.c.post("/api/publico/citas", json=d)
        self.assertEqual(r.status_code, 201)
        self.assertRegex(r.get_json()["codigo"], r"^VP-[A-Z0-9]{6}$")
        r2 = self.c.post("/api/publico/citas", json={**d, "identidad": identidad_nueva()})
        self.assertEqual(r2.status_code, 409)                      # mismo doctor, fecha y hora

    def test_validaciones_de_datos(self):
        self.assertEqual(self.c.post("/api/publico/citas", json=self.datos_cita(telefono="1234-5678")).status_code, 400)
        self.assertEqual(self.c.post("/api/publico/citas", json=self.datos_cita(ident="1999-1990-12345")).status_code, 400)
        r = self.c.post("/api/publico/citas", json=self.datos_cita(fecha_nacimiento="1985-05-05"))   # el DNI dice 1990
        self.assertEqual(r.status_code, 400)
        self.assertIn("no coincide", r.get_json()["error"])

    def test_bloqueo_por_identidad_repetida(self):
        ident = identidad_nueva()
        malo = self.datos_cita(ident=ident, telefono="000")        # falla validación, pero cuenta como intento
        codigos = [self.c.post("/api/publico/citas", json=malo).status_code for _ in range(4)]
        self.assertEqual(codigos, [400, 400, 400, 429])            # el 4.º intento en 30 s se bloquea
        r = self.c.post("/api/publico/citas", json=self.datos_cita(ident=ident))
        self.assertEqual(r.status_code, 429)                       # sigue bloqueada aunque ahora los datos sean buenos
        self.assertGreater(r.get_json()["espera"], 0)
        self.assertIn("Retry-After", r.headers)
        self.assertEqual(self.c.post("/api/publico/citas", json=self.datos_cita()).status_code, 201)   # otra identidad sí puede

    def test_csv_neutraliza_formulas(self):
        self.assertEqual(clinica._celda_csv("=1+1"), "'=1+1")
        self.assertEqual(clinica._celda_csv("normal"), "normal")


class TestMiCita(Base):
    def reservar(self):
        d = self.datos_cita()
        r = self.c.post("/api/publico/citas", json=d).get_json()
        return d, r["codigo"]

    def test_consultar_reprogramar_y_cancelar(self):
        d, codigo = self.reservar()
        auth = {"codigo": codigo, "identidad": d["identidad"]}
        self.assertEqual(self.c.post("/api/publico/mi-cita", json={**auth, "identidad": identidad_nueva()}).status_code, 404)
        r = self.c.post("/api/publico/mi-cita", json=auth)
        self.assertEqual(r.status_code, 200)
        self.assertNotIn("identidad", r.get_json())                # no se filtran datos personales
        f, h = self.slot_libre(saltar=3)
        r = self.c.post("/api/publico/mi-cita/reprogramar", json={**auth, "fecha": f, "hora": h})
        self.assertEqual(r.status_code, 200)
        r = self.c.post("/api/publico/mi-cita", json=auth).get_json()
        self.assertEqual((r["fecha"], r["hora"], r["estado"]), (f, h, "pendiente"))
        self.assertEqual(self.c.post("/api/publico/mi-cita/cancelar", json=auth).status_code, 200)
        self.assertEqual(self.c.post("/api/publico/mi-cita", json=auth).get_json()["estado"], "cancelada")
        self.assertEqual(self.c.post("/api/publico/mi-cita/cancelar", json=auth).status_code, 409)   # ya cancelada

    def test_no_se_puede_adivinar_un_codigo(self):
        d, codigo = self.reservar()
        malos = [self.c.post("/api/publico/mi-cita", json={"codigo": codigo, "identidad": identidad_nueva()}).status_code for _ in range(6)]
        self.assertEqual(malos[:5], [404] * 5)
        self.assertEqual(malos[5], 429)
        self.assertEqual(self.c.post("/api/publico/mi-cita", json={"codigo": codigo, "identidad": d["identidad"]}).status_code, 429)


class TestSeguridadPanel(Base):
    def test_bloqueo_de_login(self):
        malos = [self.login("admin@vidaplena.hn", "mala").status_code for _ in range(6)]
        self.assertEqual(malos, [401] * 5 + [429])
        self.assertEqual(self.login("admin@vidaplena.hn", "Admin123!").status_code, 429)   # bloqueado aunque acierte

    def test_roles(self):
        rec = self.cliente("recepcion@vidaplena.hn", "Recep123!")
        self.assertEqual(rec.get("/api/auditoria").status_code, 403)
        self.assertEqual(rec.get("/api/reportes/citas.csv").status_code, 403)
        self.assertEqual(rec.get("/api/reportes/resumen").status_code, 403)
        self.assertEqual(rec.get("/api/pacientes/1/expediente").get_json()["consultas"], [])    # privacidad clínica
        self.assertEqual(self.c.get("/api/pacientes").status_code, 401)
        self.assertEqual(clinica.app.test_client().get("/documento/receta/1").status_code, 401)

    def test_reporte_csv_y_auditoria(self):
        self.c.post("/api/publico/citas", json=self.datos_cita(motivo="=HYPERLINK(\"x\")"))
        adm = self.cliente("admin@vidaplena.hn", "Admin123!")
        hoy = date.today()
        r = adm.get(f"/api/reportes/citas.csv?desde={hoy}&hasta={hoy + timedelta(days=60)}")
        self.assertEqual(r.status_code, 200)
        txt = r.get_data(as_text=True)
        self.assertTrue(txt.startswith("\ufeffFecha"))
        self.assertIn("'=HYPERLINK", txt)
        self.assertEqual(adm.get("/api/reportes/citas.csv?desde=2026-13-01").status_code, 400)
        self.assertIn("doctor", adm.get("/api/reportes/resumen").get_json()["por_doctor"][0])
        acciones = " ".join(a["accion"] for a in adm.get("/api/auditoria").get_json())
        for esperado in ("Inicio de sesión", "Cita solicitada por la web", "Reporte de citas exportado"):
            self.assertIn(esperado, acciones)

    def test_receta_y_constancia(self):
        doc = self.cliente("doctor@vidaplena.hn", "Doctor123!")
        r = doc.post("/api/pacientes/1/consultas", json={"diagnostico": "Gripe <b>común</b>", "tratamiento": "Reposo e hidratación"})
        self.assertEqual(r.status_code, 201)
        cid = r.get_json()["id"]
        for tipo in ("receta", "constancia"):
            h = doc.get(f"/documento/{tipo}/{cid}")
            self.assertEqual(h.status_code, 200)
            self.assertIn("Clínica Vida Plena", h.get_data(as_text=True))
        self.assertIn("Reposo e hidratación", doc.get(f"/documento/receta/{cid}").get_data(as_text=True))
        self.assertEqual(doc.get("/documento/otro/1").status_code, 404)

    def test_calendario_por_rango(self):
        adm = self.cliente("admin@vidaplena.hn", "Admin123!")
        hoy = date.today()
        r = adm.get(f"/api/citas?desde={hoy}&hasta={hoy + timedelta(days=60)}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(adm.get("/api/citas?desde=hola").status_code, 400)


if __name__ == "__main__":
    unittest.main()
