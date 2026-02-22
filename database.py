import sqlite3
import os
from datetime import datetime

# Ensure data directory exists
if not os.path.exists('data'):
    os.makedirs('data')
    print("Created 'data' directory")

DATABASE = 'data/inventory.db'

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