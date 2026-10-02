import sqlite3
from contextlib import contextmanager
from pathlib import Path
from datetime import datetime

APP_DIR = Path(__file__).resolve().parent
DB_PATH = APP_DIR / "registrations.db"

@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def generate_number(prefix: str, table: str, col: str) -> str:
    """الرقم التالي = أكبر رقم تسلسلي مستعمل + 1 (وليس رقم آخر سطر حسب id —
    كان ذلك يعطي رقماً مكرراً عند المعالجة بغير الترتيب)"""
    year = datetime.now().year
    with get_db() as conn:
        row = conn.execute(
            f"SELECT MAX(CAST(substr({col}, length(?) + 1) AS INTEGER)) FROM {table} WHERE {col} LIKE ?",
            (f"{prefix}-{year}-", f"{prefix}-{year}-%")
        ).fetchone()
    num = (row[0] or 0) + 1
    return f"{prefix}-{year}-{num:06d}"

def check_deputy_contract_date(end_date: str, driver_id: int) -> tuple[bool, str]:
    with get_db() as conn:
        rental = conn.execute("""
            SELECT rc.end_date FROM rental_contracts rc
            JOIN door_licenses dl ON dl.id = rc.door_license_id
            WHERE rc.driver_id = ? AND rc.is_current = 1
        """, (driver_id,)).fetchone()
    if rental and rental["end_date"]:
        if end_date > rental["end_date"]:
            return False, f"تاريخ انتهاء عقد المناوب ({end_date}) يتجاوز عقد الكراء ({rental['end_date']})"
    return True, "OK"

def init_db():
    with get_db() as conn:

        conn.execute("""CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'driver',
            token TEXT UNIQUE,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER UNIQUE REFERENCES accounts(id),
            nom_ar TEXT, prenom_ar TEXT,
            nom_fr TEXT, prenom_fr TEXT,
            date_naissance TEXT, lieu_naissance_ar TEXT, lieu_naissance_fr TEXT,
            wilaya_naissance TEXT, commune TEXT, wilaya TEXT, adresse TEXT,
            nationalite TEXT DEFAULT 'جزائري',
            nin TEXT UNIQUE,
            telephone TEXT, telephone2 TEXT,
            image_cni_recto_path TEXT,
            image_cni_verso_path TEXT,
            ocr_cni_raw TEXT,
            statut TEXT DEFAULT 'نشط',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS driver_licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            num_permis TEXT,
            date_delivrance TEXT, date_expiration TEXT,
            lieu_delivrance TEXT, wilaya_delivrance TEXT,
            categories TEXT,
            image_permis_recto_path TEXT,
            image_permis_verso_path TEXT,
            ocr_permis_raw TEXT,
            is_current INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            num_immatriculation TEXT, num_precedent TEXT,
            marque TEXT, type_vehicule TEXT,
            num_serie TEXT, genre TEXT, carrosserie TEXT,
            energie TEXT, puissance TEXT, nb_places TEXT,
            poids_total TEXT, charge_utile TEXT, annee_circulation TEXT,
            date_delivrance TEXT, lieu_delivrance TEXT, wilaya_delivrance TEXT,
            quittance_num TEXT, quittance_montant TEXT, quittance_date TEXT,
            proprietaire_nom_ar TEXT, proprietaire_prenom_ar TEXT,
            proprietaire_nom TEXT, proprietaire_prenom TEXT,
            proprietaire_dob TEXT, proprietaire_lieu TEXT,
            proprietaire_adresse TEXT, proprietaire_commune TEXT,
            proprietaire_wilaya TEXT, profession TEXT,
            image_carte_grise_path TEXT,
            ocr_carte_grise_raw TEXT,
            is_current INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS beneficiaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom_ar TEXT NOT NULL, prenom_ar TEXT NOT NULL,
            nom_fr TEXT, prenom_fr TEXT,
            date_naissance TEXT, lieu_naissance TEXT,
            nin TEXT UNIQUE, telephone TEXT, adresse TEXT, wilaya TEXT,
            sifa TEXT NOT NULL,
            image_cni_recto_path TEXT,
            image_cni_verso_path TEXT,
            ocr_cni_raw TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS door_licenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            beneficiary_id INTEGER NOT NULL REFERENCES beneficiaries(id),
            door_number TEXT UNIQUE NOT NULL,
            wilaya TEXT NOT NULL,
            exploitation_commune TEXT,
            decision_type TEXT NOT NULL,
            decision_number TEXT, decision_date TEXT, decision_wilaya TEXT,
            image_decision_path TEXT,
            ocr_decision_raw TEXT,
            current_driver_id INTEGER REFERENCES drivers(id),
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS rental_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            door_license_id INTEGER NOT NULL REFERENCES door_licenses(id),
            beneficiary_id INTEGER NOT NULL REFERENCES beneficiaries(id),
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            contract_number TEXT UNIQUE,
            contract_date TEXT NOT NULL,
            end_date TEXT,
            end_reason TEXT,
            is_current INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS deputies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            nom_ar TEXT, prenom_ar TEXT, nom_fr TEXT, prenom_fr TEXT,
            date_naissance TEXT, lieu_naissance TEXT,
            nin TEXT, telephone TEXT, adresse TEXT,
            image_cni_recto_path TEXT,
            image_cni_verso_path TEXT,
            ocr_cni_raw TEXT,
            num_permis TEXT, date_delivrance_permis TEXT,
            date_expiration_permis TEXT, categories_permis TEXT,
            image_permis_recto_path TEXT,
            image_permis_verso_path TEXT,
            ocr_permis_raw TEXT,
            wilaya_permis TEXT, lieu_delivrance_permis TEXT,
            is_current INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS deputy_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            deputy_id INTEGER NOT NULL REFERENCES deputies(id),
            contract_number TEXT UNIQUE,
            contract_date TEXT NOT NULL,
            end_date TEXT,
            end_reason TEXT,
            is_current INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            activity_type TEXT NOT NULL,
            zone TEXT,
            is_current INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            request_type TEXT NOT NULL,
            statut TEXT DEFAULT 'جديد',
            request_data TEXT,
            attachments TEXT,
            notes TEXT, admin_notes TEXT,
            request_number TEXT UNIQUE,
            processed_at TEXT,
            processed_by INTEGER REFERENCES accounts(id),
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS vehicles_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
            change_reason TEXT,
            date_start TEXT, date_end TEXT,
            request_id INTEGER REFERENCES requests(id),
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS activity_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            activity_type TEXT NOT NULL,
            zone TEXT,
            date_start TEXT, date_end TEXT,
            request_id INTEGER REFERENCES requests(id),
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            status_type TEXT NOT NULL,
            date_start TEXT NOT NULL, date_end TEXT,
            notes TEXT,
            request_id INTEGER REFERENCES requests(id),
            changed_by INTEGER REFERENCES accounts(id),
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS deputies_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            deputy_id INTEGER NOT NULL REFERENCES deputies(id),
            date_start TEXT, date_end TEXT,
            end_reason TEXT,
            request_id INTEGER REFERENCES requests(id),
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        # ══ جديد: رخصة السائق الإضافي ══
        conn.execute("""CREATE TABLE IF NOT EXISTS deputy_permits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id    INTEGER NOT NULL REFERENCES drivers(id),
            deputy_id    INTEGER REFERENCES deputies(id),
            request_id   INTEGER REFERENCES requests(id),
            permit_number TEXT UNIQUE,
            issue_date    TEXT NOT NULL,
            expiry_date   TEXT,
            door_number   TEXT,
            num_immatriculation TEXT,
            activity_type TEXT,
            wilaya        TEXT,
            commune       TEXT,
            issued_by     INTEGER REFERENCES accounts(id),
            is_current    INTEGER DEFAULT 1,
            notes         TEXT,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            updated_at    TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id INTEGER NOT NULL REFERENCES drivers(id),
            notif_type TEXT NOT NULL,
            urgency TEXT NOT NULL,
            message TEXT NOT NULL,
            related_date TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.execute("""CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER UNIQUE REFERENCES accounts(id),
            nom_ar TEXT,
            nom_fr TEXT,
            registre_commerce TEXT UNIQUE,
            num_fiscal TEXT,
            telephone TEXT,
            telephone2 TEXT,
            adresse TEXT,
            wilaya TEXT,
            commune TEXT,
            representant_nom TEXT,
            representant_fonction TEXT,
            representant_nin TEXT,
            email TEXT,
            date_creation TEXT,
            image_rc_path TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        conn.commit()
        print("✅ تم إنشاء الجداول بنجاح (مع deputy_permits)")

def migrate_db():
    """إضافة أعمدة وجداول جديدة إن لم تكن موجودة"""
    new_columns = [
        ("accounts", "google_id",    "TEXT"),  # UNIQUE index added below via CREATE INDEX
        ("accounts", "reset_otp",        "TEXT"),
        ("accounts", "reset_otp_expiry", "TEXT"),
        ("accounts", "reset_attempts",   "INTEGER DEFAULT 0"),
        ("rental_contracts", "monthly_rent", "INTEGER"),
        ("accounts", "google_email", "TEXT"),
        ("drivers",   "sexe",                   "TEXT"),
        ("drivers",   "groupe_sanguin",          "TEXT"),
        ("drivers",   "autorite_delivrance",     "TEXT"),
        ("drivers",   "date_delivrance_cni",     "TEXT"),
        ("drivers",   "date_expiration_cni",     "TEXT"),
        ("drivers",   "num_document_cni",        "TEXT"),
        ("deputies",       "wilaya_permis",           "TEXT"),
        ("deputies",       "lieu_delivrance_permis",  "TEXT"),
        ("door_licenses",  "wilaya",                  "TEXT"),
        ("door_licenses",  "current_driver_id",       "INTEGER"),
        ("door_licenses",  "exploitation_commune",    "TEXT"),
        ("rental_contracts", "end_reason",            "TEXT"),
        ("rental_contracts", "updated_at",            "TEXT DEFAULT (datetime('now','localtime'))"),
        ("beneficiaries",    "num_document_cni",        "TEXT"),
        ("beneficiaries",    "date_delivrance_cni",     "TEXT"),
        ("beneficiaries",    "sexe",                    "TEXT"),
        ("beneficiaries",    "groupe_sanguin",          "TEXT"),
        # صفة الاستغلال: 'مستأجر' (عقد كراء) أو 'مستفيد' (صاحب الرخصة يستغلها بنفسه — بلا عقد)
        ("door_licenses",    "exploitation_mode",       "TEXT DEFAULT 'مستأجر'"),
        # عمود التتبع لتاريخ آخر تعديل على سجل الحالة
        ("status_history",   "updated_at",              "TEXT DEFAULT (datetime('now','localtime'))"),
    ]
    with get_db() as conn:
        for table, col, typ in new_columns:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
                print(f"✅ أُضيف {col} إلى {table}")
            except Exception as e:
                if "duplicate column" in str(e).lower():
                    pass
                else:
                    print(f"❌ {col}: {e}")

        # إنشاء جدول deputy_permits إن لم يكن موجوداً (للقواعد القديمة)
        conn.execute("""CREATE TABLE IF NOT EXISTS deputy_permits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            driver_id    INTEGER NOT NULL REFERENCES drivers(id),
            deputy_id    INTEGER REFERENCES deputies(id),
            request_id   INTEGER REFERENCES requests(id),
            permit_number TEXT UNIQUE,
            issue_date    TEXT NOT NULL,
            expiry_date   TEXT,
            door_number   TEXT,
            num_immatriculation TEXT,
            activity_type TEXT,
            wilaya        TEXT,
            commune       TEXT,
            issued_by     INTEGER REFERENCES accounts(id),
            is_current    INTEGER DEFAULT 1,
            notes         TEXT,
            created_at    TEXT DEFAULT (datetime('now','localtime')),
            updated_at    TEXT DEFAULT (datetime('now','localtime'))
        )""")
        print("✅ deputy_permits: OK")
        # إنشاء جدول الشركات إن لم يكن موجوداً (للقواعد القديمة)
        conn.execute("""CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER UNIQUE REFERENCES accounts(id),
            nom_ar TEXT,
            nom_fr TEXT,
            registre_commerce TEXT UNIQUE,
            num_fiscal TEXT,
            telephone TEXT,
            telephone2 TEXT,
            adresse TEXT,
            wilaya TEXT,
            commune TEXT,
            representant_nom TEXT,
            representant_fonction TEXT,
            representant_nin TEXT,
            email TEXT,
            date_creation TEXT,
            image_rc_path TEXT,
            notes TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")
        print("✅ companies: OK")

        # ── هوية الشركة: السجل التجاري + المسيّر ──
        for col in ["rc_date", "gerant_nom_ar", "gerant_prenom_ar", "gerant_nom_fr",
                    "gerant_prenom_fr", "gerant_date_naissance", "gerant_lieu_naissance",
                    "gerant_nin", "gerant_adresse", "gerant_cni_recto_path",
                    "gerant_cni_verso_path", "num_agrement", "date_agrement"]:
            try:
                conn.execute(f"ALTER TABLE companies ADD COLUMN {col} TEXT")
            except Exception:
                pass

        # ── سائقو الشركة ──
        conn.execute("""CREATE TABLE IF NOT EXISTS company_drivers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            nom_ar TEXT, prenom_ar TEXT, nom_fr TEXT, prenom_fr TEXT,
            date_naissance TEXT, lieu_naissance TEXT, nin TEXT, telephone TEXT,
            num_permis TEXT, date_delivrance TEXT, date_expiration TEXT,
            lieu_delivrance TEXT, wilaya_delivrance TEXT, categories TEXT,
            image_permis_recto_path TEXT, image_permis_verso_path TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")

        # ── مركبات الشركة (driver_id = السائق المرتبط بها) ──
        conn.execute("""CREATE TABLE IF NOT EXISTS company_vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            driver_id INTEGER REFERENCES company_drivers(id),
            num_immatriculation TEXT, num_precedent TEXT,
            marque TEXT, type_vehicule TEXT, num_serie TEXT, genre TEXT,
            carrosserie TEXT, energie TEXT, puissance TEXT, nb_places TEXT,
            poids_total TEXT, charge_utile TEXT, annee_circulation TEXT,
            date_delivrance TEXT, lieu_delivrance TEXT, wilaya_delivrance TEXT,
            quittance_num TEXT, quittance_montant TEXT, quittance_date TEXT,
            proprietaire_nom_ar TEXT, proprietaire_prenom_ar TEXT,
            proprietaire_nom TEXT, proprietaire_prenom TEXT,
            proprietaire_adresse TEXT, proprietaire_wilaya TEXT,
            image_carte_grise_path TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )""")
        # ── طلبات توظيف السائقين الأجراء → رخصة سائق أجير ──
        conn.execute("""CREATE TABLE IF NOT EXISTS company_hire_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            driver_id  INTEGER NOT NULL REFERENCES company_drivers(id),
            vehicle_id INTEGER REFERENCES company_vehicles(id),
            num_immatriculation TEXT,
            contract_start TEXT, contract_end TEXT,
            contract_path TEXT,
            statut TEXT DEFAULT 'جديد',
            admin_notes TEXT,
            permit_number TEXT UNIQUE,
            issue_date TEXT, expiry_date TEXT,
            is_current INTEGER DEFAULT 1,
            processed_by INTEGER REFERENCES accounts(id),
            processed_at TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")
        for col in ["contract_number", "end_reason", "terminated_at"]:
            try:
                conn.execute(f"ALTER TABLE company_hire_requests ADD COLUMN {col} TEXT")
            except Exception:
                pass
        try:
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hire_contract_number "
                         "ON company_hire_requests(contract_number) WHERE contract_number IS NOT NULL")
            # عقد ساري واحد فقط لكل سائق (يمنع التكرار عند الضغط المزدوج)
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_hire_one_active "
                         "ON company_hire_requests(driver_id) WHERE is_current=1 AND statut IN ('جديد','مقبول')")
        except Exception as e:
            print(f"⚠️ فهارس العقود: {e}")
        # ── طلبات تغيير مركبة الشركة (نفس مبدأ تغيير_سيارة عند السائقين) ──
        conn.execute("""CREATE TABLE IF NOT EXISTS company_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            vehicle_id INTEGER REFERENCES company_vehicles(id),
            request_type TEXT NOT NULL DEFAULT 'تغيير_مركبة',
            request_number TEXT UNIQUE,
            old_data TEXT, new_data TEXT,
            statut TEXT DEFAULT 'جديد',
            admin_notes TEXT,
            processed_by INTEGER REFERENCES accounts(id),
            processed_at TEXT,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )""")
        print("✅ company_drivers / company_vehicles / company_hire_requests / company_requests: OK")
        conn.commit()


if __name__ == "__main__":
    init_db()
    migrate_db()
    with get_db() as conn:
        tables = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
        print("\n📋 الجداول الموجودة:")
        for i, t in enumerate(tables, 1):
            print(f"  {i}. {t['name']}")
        print(f"\n✅ المجموع: {len(tables)} جدول")
