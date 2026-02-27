import sqlite3
import os
import sys
from datetime import datetime

# Ensure stdout can handle Unicode/emoji on Windows (cp1252 terminal)
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except AttributeError:
    pass

# Always resolve paths relative to this file, not the CWD
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Ensure data directory exists
_data_dir = os.path.join(_BASE_DIR, 'data')
if not os.path.exists(_data_dir):
    os.makedirs(_data_dir)
    print("Created 'data' directory")

DATABASE = os.path.join(_BASE_DIR, 'data', 'inventory.db')

def init_db():
    """Initialize the database with tables"""
    try:
        conn = sqlite3.connect(DATABASE)
        cursor = conn.cursor()
        
        # Create users table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                role TEXT NOT NULL,
                language TEXT DEFAULT 'en',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create items table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                barcode TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                quantity REAL DEFAULT 0,
                location TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create packing_lists table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS packing_lists (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                list_name TEXT NOT NULL,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending',
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        ''')
        
        # Create packing_list_items table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS packing_list_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                packing_list_id INTEGER,
                item_id INTEGER,
                quantity REAL,
                FOREIGN KEY (packing_list_id) REFERENCES packing_lists(id),
                FOREIGN KEY (item_id) REFERENCES items(id)
            )
        ''')
        
        # Create basic_data table for Excel imports
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS basic_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                unique_id TEXT UNIQUE NOT NULL,
                packing_ref TEXT,
                line_no TEXT,
                item_code TEXT,
                item_description TEXT,
                qty_unit_tot REAL,
                packaging TEXT,
                parcel_no TEXT,
                nb_parcels INTEGER,
                batch_no TEXT,
                exp_date TEXT,
                kg_total REAL,
                dm3_total REAL,
                transport_reception TEXT,
                sub_folder TEXT,
                field_ref TEXT,
                ref_op_msfl TEXT,
                parcel_nb TEXT,
                weight_kg REAL,
                volume_m3 REAL,
                invoice_credit_note_ref TEXT,
                estim_value_eu REAL,
                source_file TEXT,
                imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                imported_by INTEGER,
                FOREIGN KEY (imported_by) REFERENCES users(id)
            )
        ''')
        
        # Create column_mappings table for flexible Excel imports
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS column_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mapping_name TEXT NOT NULL,
                source_column TEXT NOT NULL,
                target_column TEXT NOT NULL,
                file_type TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # NEW: Create mission_details table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS mission_details (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                mission_name TEXT NOT NULL,
                mission_abbreviation TEXT NOT NULL,
                lead_time_months INTEGER DEFAULT 0,
                cover_period_months INTEGER NOT NULL,
                security_stock_months INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        ''')
        
        # NEW: Create projects table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_name TEXT NOT NULL,
                project_code TEXT UNIQUE NOT NULL,
                description TEXT,
                display_order INTEGER DEFAULT 0,
                is_active INTEGER DEFAULT 1,
                created_by INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        ''')
        
        # Create end_users table
        cursor.execute('''
                CREATE TABLE IF NOT EXISTS end_users (
                    end_user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    user_type TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
        
            # Create indexes for end_users
        cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_end_users_name 
                ON end_users(name)
            ''')
            
        cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_end_users_type 
                ON end_users(user_type)
            ''')

        conn.commit()
        conn.close()
        print("✅ Database initialized successfully")


        # Create third_parties table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS third_parties (
                third_party_id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                city TEXT,
                address TEXT,
                contact_person TEXT,
                email TEXT,
                phone TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Create indexes for third_parties
        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_third_parties_name 
            ON third_parties(name)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_third_parties_type 
            ON third_parties(type)
        ''')

        cursor.execute('''
            CREATE INDEX IF NOT EXISTS idx_third_parties_city 
            ON third_parties(city)
        ''')

        # Import here to avoid circular imports
        from werkzeug.security import generate_password_hash
        
        # Insert default users (password: admin123 for all)
        default_users = [
            ('admin', generate_password_hash('admin123'), 'HQ', 'en'),
            ('coordinator', generate_password_hash('admin123'), 'Coordinator', 'en'),
            ('manager', generate_password_hash('admin123'), 'Manager', 'en'),
            ('supervisor', generate_password_hash('admin123'), 'Supervisor', 'en'),
        ]
        
        for username, password, role, language in default_users:
            try:
                cursor.execute('''
                    INSERT INTO users (username, password, role, language)
                    VALUES (?, ?, ?, ?)
                ''', (username, password, role, language))
            except sqlite3.IntegrityError:
                pass  # User already exists
        
        conn.commit()
        conn.close()
        
        print("✅ Database initialized successfully!")
        print("\n📋 Default users created:")
        print("  - admin/admin123 (HQ - Administrator)")
        print("  - coordinator/admin123 (Coordinator)")
        print("  - manager/admin123 (Manager)")
        print("  - supervisor/admin123 (Supervisor)")
        print("\n🔐 Please change default passwords after first login!")
        
    except Exception as e:
        print(f"❌ Error initializing database: {e}")
        raise

def update_database_schema():
    """Update database schema for new features"""
    conn = sqlite3.connect(DATABASE)
    cursor = conn.cursor()
    
    try:
        print("🔄 Checking database schema for updates...")
        
        # Check if users table needs updating
        cursor.execute("PRAGMA table_info(users)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if 'language' not in columns:
            cursor.execute('ALTER TABLE users ADD COLUMN language TEXT DEFAULT "en"')
            print("✅ Added language column to users table")
        
        if 'updated_at' not in columns:
            # Use NULL as default for existing rows, then update them
            cursor.execute('ALTER TABLE users ADD COLUMN updated_at TIMESTAMP')
            cursor.execute('UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL')
            print("✅ Added updated_at column to users table")
        
        # Check if mission_details table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='mission_details'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE mission_details (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mission_name TEXT NOT NULL,
                    mission_abbreviation TEXT NOT NULL,
                    lead_time_months INTEGER DEFAULT 0,
                    cover_period_months INTEGER NOT NULL,
                    security_stock_months INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            ''')
            print("✅ Created mission_details table")
        
        # Check if projects table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE projects (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_name TEXT NOT NULL,
                    project_code TEXT UNIQUE NOT NULL,
                    description TEXT,
                    display_order INTEGER DEFAULT 0,
                    is_active INTEGER DEFAULT 1,
                    created_by INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (created_by) REFERENCES users(id)
                )
            ''')
            print("✅ Created projects table")
        
        # Update existing user roles to new format if needed
        cursor.execute("SELECT id, role FROM users WHERE role IN ('administrator', 'coordinator', 'manager', 'supervisor')")
        users_to_update = cursor.fetchall()
        
        role_mapping = {
            'administrator': 'HQ',
            'coordinator': 'Coordinator',
            'manager': 'Manager',
            'supervisor': 'Supervisor'
        }
        
        for user_id, old_role in users_to_update:
            new_role = role_mapping.get(old_role.lower(), old_role)
            cursor.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
        
        if users_to_update:
            print(f"✅ Updated {len(users_to_update)} user roles to new format")
        
        # ── Cargo Reception tables ────────────────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cargo_summary'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE cargo_summary (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parcel_number TEXT UNIQUE,
                    transport_reception TEXT,
                    sub_folder NUMERIC,
                    field_ref TEXT,
                    ref_op_msfl NUMERIC,
                    goods_reception NUMERIC,
                    parcel_nb NUMERIC,
                    weight_kg REAL,
                    volume_m3 REAL,
                    invoice_credit_note_ref NUMERIC,
                    estim_value_eu REAL,
                    reception_status TEXT DEFAULT 'Pending',
                    received_at TIMESTAMP,
                    received_by INTEGER,
                    order_type TEXT DEFAULT 'Internal',
                    notes TEXT,
                    cargo_session_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (received_by) REFERENCES users(id)
                )
            ''')
            cursor.execute('''
                CREATE TRIGGER trg_cargo_summary_insert
                AFTER INSERT ON cargo_summary
                FOR EACH ROW
                BEGIN
                    UPDATE cargo_summary
                    SET parcel_number =
                        CASE
                            WHEN NEW.goods_reception IS NOT NULL AND NEW.goods_reception != ''
                            THEN CAST(NEW.goods_reception AS TEXT) || CAST(COALESCE(NEW.parcel_nb,'') AS TEXT)
                            ELSE CAST(COALESCE(NEW.parcel_nb,'') AS TEXT)
                        END
                    WHERE id = NEW.id AND (NEW.parcel_number IS NULL OR NEW.parcel_number = '');
                END
            ''')
            cursor.execute('''
                CREATE TRIGGER trg_cargo_summary_update
                AFTER UPDATE OF goods_reception, parcel_nb ON cargo_summary
                FOR EACH ROW
                BEGIN
                    UPDATE cargo_summary
                    SET parcel_number =
                        CASE
                            WHEN NEW.goods_reception IS NOT NULL AND NEW.goods_reception != ''
                            THEN CAST(NEW.goods_reception AS TEXT) || CAST(COALESCE(NEW.parcel_nb,'') AS TEXT)
                            ELSE CAST(COALESCE(NEW.parcel_nb,'') AS TEXT)
                        END
                    WHERE id = NEW.id;
                END
            ''')
            print("✅ Created cargo_summary table + triggers")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cargo_packing_list'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE cargo_packing_list (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parcel_number TEXT,
                    packing_ref TEXT,
                    line_no INTEGER,
                    item_code TEXT,
                    item_description TEXT,
                    qty_unit_tot REAL,
                    packaging REAL,
                    parcel_n TEXT,
                    nb_parcels INTEGER,
                    batch_no TEXT,
                    exp_date TEXT,
                    kg_total REAL,
                    dm3_total REAL,
                    parcel_nb INTEGER,
                    cargo_session_id TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_cpl_parcel_number ON cargo_packing_list(parcel_number)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_cpl_packing_ref ON cargo_packing_list(packing_ref)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_cpl_session ON cargo_packing_list(cargo_session_id)
            ''')
            print("✅ Created cargo_packing_list table")

        # Add reception_status / received columns to cargo_summary if missing (schema migration)
        cursor.execute("PRAGMA table_info(cargo_summary)")
        cs_cols = [c[1] for c in cursor.fetchall()]
        for col, defn in [
            ('reception_status',  "TEXT DEFAULT 'Pending'"),
            ('received_at',       'TIMESTAMP'),
            ('received_by',       'INTEGER'),
            ('order_type',        "TEXT DEFAULT 'Internal'"),
            ('notes',             'TEXT'),
            ('cargo_session_id',  'TEXT'),
            ('created_at',        'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'),
        ]:
            if col not in cs_cols:
                try:
                    cursor.execute(f'ALTER TABLE cargo_summary ADD COLUMN {col} {defn}')
                    print(f"✅ Added {col} to cargo_summary")
                except Exception:
                    pass

        # ── stock_transactions table (cargo reception ledger) ──────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='stock_transactions'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE stock_transactions (
                    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                    reception_number     TEXT,
                    transaction_type     TEXT DEFAULT 'RECEPTION',
                    parcel_number        TEXT,
                    packing_ref          TEXT,
                    line_no              INTEGER,
                    item_code            TEXT,
                    item_description     TEXT,
                    qty_received         REAL,
                    packaging            REAL,
                    batch_no             TEXT,
                    exp_date             TEXT,
                    order_number         TEXT,
                    field_ref            TEXT,
                    pallet_number        TEXT,
                    transport_reception  TEXT,
                    weight_kg            REAL,
                    volume_m3            REAL,
                    estim_value_eu       REAL,
                    mission_abbreviation TEXT,
                    received_by          INTEGER,
                    received_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    cargo_session_id     TEXT,
                    notes                TEXT,
                    FOREIGN KEY (received_by) REFERENCES users(id)
                )
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_st_reception_number ON stock_transactions(reception_number)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_st_parcel_number ON stock_transactions(parcel_number)
            ''')
            cursor.execute('''
                CREATE INDEX IF NOT EXISTS idx_st_item_code ON stock_transactions(item_code)
            ''')
            print("✅ Created stock_transactions table")

        # ── Cargo-reception columns on basic_data (schema migration) ──────────
        cursor.execute("PRAGMA table_info(basic_data)")
        bd_cols = [c[1] for c in cursor.fetchall()]

        # Fix legacy capital-P column name (Parcel_number → parcel_number)
        if 'Parcel_number' in bd_cols:
            try:
                cursor.execute('ALTER TABLE basic_data RENAME COLUMN "Parcel_number" TO parcel_number')
                bd_cols = [c if c != 'Parcel_number' else 'parcel_number' for c in bd_cols]
                print("✅ Renamed Parcel_number → parcel_number in basic_data")
            except Exception as _re:
                print(f"⚠️ Could not rename Parcel_number: {_re}")

        for col, defn in [
            ('parcel_number',    'TEXT'),
            ('reception_status', "TEXT DEFAULT 'Pending'"),
            ('reception_number', 'TEXT'),
            ('received_at',      'TIMESTAMP'),
            ('received_by',      'INTEGER'),
            ('pallet_number',    'TEXT'),
            ('cargo_session_id', 'TEXT'),
            ('order_type',       'TEXT'),
            ('parcel_note',      'TEXT'),
            ('project_code',     'TEXT'),
            ('qty_received',     'REAL'),
            ('exp_date_received','TEXT'),
            ('batch_no_received','TEXT'),
        ]:
            if col not in bd_cols:
                try:
                    cursor.execute(f'ALTER TABLE basic_data ADD COLUMN {col} {defn}')
                    print(f"✅ Added {col} to basic_data")
                except Exception:
                    pass

        # ── Cargo-reception columns on order_lines (schema migration) ─────────
        cursor.execute("PRAGMA table_info(order_lines)")
        ol_cols = [c[1] for c in cursor.fetchall()]

        for col, defn in [
            ('order_type',        'TEXT'),
            ('qty_received',      'REAL DEFAULT 0'),
            ('exp_date_received', 'TEXT'),
            ('batch_no_received', 'TEXT'),
            ('received_at',       'TIMESTAMP'),
            ('received_by',       'INTEGER'),
            ('reception_status',  "TEXT DEFAULT 'Pending'"),
        ]:
            if col not in ol_cols:
                try:
                    cursor.execute(f'ALTER TABLE order_lines ADD COLUMN {col} {defn}')
                    print(f"✅ Added {col} to order_lines")
                except Exception:
                    pass

        # Backfill order_lines.order_type from orders.order_type
        cursor.execute("""
            UPDATE order_lines
            SET order_type = (
                SELECT o.order_type FROM orders o
                WHERE o.order_number = order_lines.order_number
                LIMIT 1
            )
            WHERE order_type IS NULL
        """)
        backfilled = cursor.rowcount
        if backfilled > 0:
            print(f"✅ Backfilled order_type for {backfilled} order_lines rows")

        # ── movement_lines extra column: parcel_number ────────────────────────
        cursor.execute("PRAGMA table_info(movement_lines)")
        ml_cols = [c[1] for c in cursor.fetchall()]
        if ml_cols and 'parcel_number' not in ml_cols:
            try:
                cursor.execute('ALTER TABLE movement_lines ADD COLUMN parcel_number TEXT')
                print("✅ Added parcel_number to movement_lines")
            except Exception:
                pass

        # ── stock_transactions extra columns for IN/OUT movements ────────────
        cursor.execute("PRAGMA table_info(stock_transactions)")
        st_cols = [c[1] for c in cursor.fetchall()]
        for col, defn in [
            ('project_code', 'TEXT'),
            ('sign',         'INTEGER DEFAULT 1'),
            ('movement_id',  'INTEGER'),
        ]:
            if st_cols and col not in st_cols:
                try:
                    cursor.execute(f'ALTER TABLE stock_transactions ADD COLUMN {col} {defn}')
                    print(f"✅ Added {col} to stock_transactions")
                except Exception:
                    pass

        # ── end_users / third_parties (ensure exist for fresh installs) ───────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='end_users'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE end_users (
                    end_user_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    user_type TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_end_users_name ON end_users(name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_end_users_type ON end_users(user_type)')
            print("✅ Created end_users table")

        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='third_parties'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE third_parties (
                    third_party_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    city TEXT,
                    address TEXT,
                    contact_person TEXT,
                    email TEXT,
                    phone TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_third_parties_name ON third_parties(name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_third_parties_type ON third_parties(type)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_third_parties_city ON third_parties(city)')
            print("✅ Created third_parties table")

        # ── doc_sequences (document number counters) ──────────────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='doc_sequences'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE doc_sequences (
                    id       INTEGER PRIMARY KEY AUTOINCREMENT,
                    doc_type TEXT NOT NULL,
                    year     INTEGER NOT NULL,
                    last_seq INTEGER DEFAULT 0,
                    UNIQUE(doc_type, year)
                )
            ''')
            print("✅ Created doc_sequences table")

        # ── movements (IN/OUT document headers) ───────────────────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='movements'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE movements (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_number TEXT UNIQUE,
                    movement_type   TEXT NOT NULL,
                    doc_type        TEXT NOT NULL,
                    movement_date   TEXT NOT NULL,
                    source_project  TEXT,
                    dest_project    TEXT,
                    end_user_id     INTEGER REFERENCES end_users(end_user_id),
                    third_party_id  INTEGER REFERENCES third_parties(third_party_id),
                    status          TEXT DEFAULT 'Draft',
                    total_weight_kg REAL DEFAULT 0,
                    total_volume_m3 REAL DEFAULT 0,
                    notes           TEXT,
                    created_by      INTEGER REFERENCES users(id),
                    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mov_doc_number ON movements(document_number)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mov_type ON movements(movement_type)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mov_date ON movements(movement_date)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mov_source ON movements(source_project)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mov_dest ON movements(dest_project)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_mov_status ON movements(status)')
            print("✅ Created movements table")

        # ── movement_lines (line items for each movement) ─────────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='movement_lines'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE movement_lines (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    movement_id      INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
                    document_number  TEXT,
                    line_no          INTEGER,
                    item_code        TEXT,
                    item_description TEXT,
                    qty              REAL NOT NULL DEFAULT 0,
                    unit             TEXT,
                    batch_no         TEXT,
                    exp_date         TEXT,
                    unit_price       REAL DEFAULT 0,
                    currency         TEXT DEFAULT 'USD',
                    total_value      REAL DEFAULT 0,
                    weight_kg        REAL DEFAULT 0,
                    volume_m3        REAL DEFAULT 0,
                    pallet_number    TEXT,
                    notes            TEXT,
                    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ml_movement_id ON movement_lines(movement_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ml_item_code ON movement_lines(item_code)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_ml_doc_number ON movement_lines(document_number)')
            print("✅ Created movement_lines table")

        # ── inventory_counts (physical inventory sessions) ────────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_counts'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE inventory_counts (
                    id           INTEGER PRIMARY KEY AUTOINCREMENT,
                    count_date   TEXT NOT NULL,
                    project_code TEXT,
                    count_type   TEXT NOT NULL,
                    status       TEXT DEFAULT 'Open',
                    notes        TEXT,
                    created_by   INTEGER REFERENCES users(id),
                    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            print("✅ Created inventory_counts table")

        # ── inventory_count_lines ─────────────────────────────────────────────
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='inventory_count_lines'")
        if not cursor.fetchone():
            cursor.execute('''
                CREATE TABLE inventory_count_lines (
                    id               INTEGER PRIMARY KEY AUTOINCREMENT,
                    count_id         INTEGER NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
                    parcel_number    TEXT,
                    item_code        TEXT,
                    item_description TEXT,
                    batch_no         TEXT,
                    exp_date         TEXT,
                    system_qty       REAL DEFAULT 0,
                    physical_qty     REAL DEFAULT 0,
                    variance         REAL DEFAULT 0,
                    notes            TEXT
                )
            ''')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_icl_count_id ON inventory_count_lines(count_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_icl_item_code ON inventory_count_lines(item_code)')
            print("✅ Created inventory_count_lines table")

        conn.commit()
        print("✅ Database schema updated successfully")

    except Exception as e:
        print(f"⚠️ Error updating schema: {e}")
        conn.rollback()
    finally:
        conn.close()
        
def get_db_connection():
    """Get a database connection"""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def backup_database(backup_path=None):
    """Create a backup of the database"""
    if backup_path is None:
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = f'data/backups/inventory_backup_{timestamp}.db'
    
    # Create backups directory if it doesn't exist
    os.makedirs('data/backups', exist_ok=True)
    
    try:
        # Copy database file
        import shutil
        shutil.copy2(DATABASE, backup_path)
        print(f"✅ Database backed up to: {backup_path}")
        return backup_path
    except Exception as e:
        print(f"❌ Error backing up database: {e}")
        return None

def restore_database(backup_path):
    """Restore database from backup"""
    if not os.path.exists(backup_path):
        print(f"❌ Backup file not found: {backup_path}")
        return False
    
    try:
        import shutil
        # Create a backup of current database first
        current_backup = backup_database()
        
        # Restore from backup
        shutil.copy2(backup_path, DATABASE)
        print(f"✅ Database restored from: {backup_path}")
        print(f"📋 Previous database backed up to: {current_backup}")
        return True
    except Exception as e:
        print(f"❌ Error restoring database: {e}")
        return False

if __name__ == '__main__':
    print("🚀 Initializing MidFlow Database...")
    print("=" * 50)
    init_db()
    update_database_schema()
    print("=" * 50)
    print("✅ Database setup complete!")