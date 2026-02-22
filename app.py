from flask import Flask, render_template, request, jsonify, send_file, redirect, url_for, flash, session
from flask_login import LoginManager, login_user, logout_user, login_required, current_user
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
from database import init_db, get_db_connection, DATABASE, update_database_schema
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill
from datetime import datetime
import os
from auth import User, has_permission
from utils import normalize_number, normalize_date, format_excel_number
from excel_import import ExcelImporter
import shutil
import zipfile
import hashlib
import json

app = Flask(__name__)
app.secret_key = 'your-secret-key-change-this-in-production'  # Change this!

# Upload configuration
UPLOAD_FOLDER = 'data/uploads'
ALLOWED_EXTENSIONS = {'xlsx', 'xls'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

# Flask-Login setup
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)

# Initialize folders and database on first run
os.makedirs('data', exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs('templates/pages', exist_ok=True)  # Create pages folder

if not os.path.exists(DATABASE):
    init_db()
else:
    # Update schema for existing database
    update_database_schema()

def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ============== AUTHENTICATION ROUTES ==============

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        language = request.form.get('language', 'en')  # Get language from hidden field
        
        user = User.authenticate(username, password)
        if user:
            # Save language to session
            session['language'] = language
            
            # Update user's language preference in database
            user.update_language(language)
            
            # Log the user in
            login_user(user)
            
            flash('Login successful!', 'success')
            return redirect(url_for('dashboard'))
        else:
            flash('Invalid username or password', 'error')
            return render_template('login.html', error='Invalid username or password')
    
    return render_template('login.html')

@app.route('/logout')
@login_required
def logout():
    logout_user()
    session.clear()
    return redirect(url_for('login'))

@app.route('/')
@login_required
def dashboard():
    return render_template('dashboard.html')

# ============== PAGE ROUTES (Dynamic Loading) ==============

@app.route('/page/<page_name>')
@login_required
def load_page(page_name):
    """Load individual page HTML"""
    try:
        # Security: whitelist allowed pages
        allowed_pages = [
            'backup', 'restore', 'mission-details', 'projects', 'end-users', 'third-parties',
            'user-management',  # NEW: User Management
            'order-generation', 'orders-followup', 'order-details', 'back-orders',
            'cargo-reception', 'cargo-followup', 'upload-cargo',
            'dispatch-parcels', 'dispatch-item', 'receive-parcel', 'receive-item', 'parcel-followup',
            'stock-availability', 'stock-card', 'parcel-tracing', 'change-location',
            'donations', 'losses', 'sleeping-stock', 'expiry-report'
        ]
        
        if page_name not in allowed_pages:
            return "<div class='page-content active'><div class='coming-soon'>Page not found</div></div>", 404
        
        # Convert page-name to page_name.html
        template_name = f"pages/{page_name.replace('-', '_')}.html"
        
        return render_template(template_name)
    
    except Exception as e:
        # Return coming soon page if template doesn't exist
        return f"""
        <div class='page-content active'>
            <div class='page-header'>
                <h2>{page_name.replace('-', ' ').title()}</h2>
            </div>
            <div class='coming-soon'>This page is under development. Coming soon!</div>
        </div>
        """, 200

# ============== API ROUTES ==============

@app.route('/api/user-language', methods=['GET'])
@login_required
def get_user_language():
    """Get current user's language preference"""
    language = session.get('language', current_user.language if hasattr(current_user, 'language') else 'en')
    return jsonify({'language': language})

@app.route('/api/set-language', methods=['POST'])
@login_required
def set_language():
    """Set user's language preference"""
    data = request.json
    language = data.get('language', 'en')
    
    # Save to session
    session['language'] = language
    
    # Update user in database
    current_user.update_language(language)
    
    return jsonify({'success': True, 'language': language})

@app.route('/api/user-role', methods=['GET'])
@login_required
def get_user_role():
    """Get current user's role"""
    return jsonify({'role': current_user.role})

@app.route('/api/items', methods=['GET', 'POST'])
@login_required
def manage_items():
    """Get all items or add new item"""
    conn = get_db_connection()
    
    if request.method == 'POST':
        if not has_permission(current_user, 'manage_items'):
            return jsonify({'success': False, 'message': 'Permission denied'}), 403
        
        data = request.json
        barcode = data.get('barcode')
        name = data.get('name')
        quantity = normalize_number(data.get('quantity', 0))
        location = data.get('location', '')
        
        try:
            conn.execute(
                'INSERT INTO items (barcode, name, quantity, location) VALUES (?, ?, ?, ?)',
                (barcode, name, quantity, location)
            )
            conn.commit()
            conn.close()
            return jsonify({'success': True, 'message': 'Item added successfully'})
        except sqlite3.IntegrityError:
            conn.close()
            return jsonify({'success': False, 'message': 'Barcode already exists'}), 400
    
    else:  # GET
        items = conn.execute('SELECT * FROM items ORDER BY created_at DESC').fetchall()
        conn.close()
        return jsonify([dict(item) for item in items])

@app.route('/api/items/<barcode>', methods=['GET'])
@login_required
def get_item_by_barcode(barcode):
    """Get item by barcode for validation"""
    conn = get_db_connection()
    item = conn.execute('SELECT * FROM items WHERE barcode = ?', (barcode,)).fetchone()
    conn.close()
    
    if item:
        return jsonify({'success': True, 'item': dict(item)})
    else:
        return jsonify({'success': False, 'message': 'Item not found'}), 404

@app.route('/api/packing-lists', methods=['GET', 'POST'])
@login_required
def manage_packing_lists():
    """Get all packing lists or create new one"""
    conn = get_db_connection()
    
    if request.method == 'POST':
        if not has_permission(current_user, 'create_packing_list'):
            return jsonify({'success': False, 'message': 'Permission denied'}), 403
        
        data = request.json
        list_name = data.get('list_name')
        
        cursor = conn.execute(
            'INSERT INTO packing_lists (list_name, created_by) VALUES (?, ?)',
            (list_name, current_user.id)
        )
        conn.commit()
        list_id = cursor.lastrowid
        conn.close()
        return jsonify({'success': True, 'list_id': list_id})
    
    else:  # GET
        if has_permission(current_user, 'view_all'):
            lists = conn.execute('''
                SELECT pl.*, u.username as created_by_name 
                FROM packing_lists pl
                LEFT JOIN users u ON pl.created_by = u.id
                ORDER BY pl.created_at DESC
            ''').fetchall()
        else:
            lists = conn.execute('''
                SELECT pl.*, u.username as created_by_name 
                FROM packing_lists pl
                LEFT JOIN users u ON pl.created_by = u.id
                WHERE pl.created_by = ?
                ORDER BY pl.created_at DESC
            ''', (current_user.id,)).fetchall()
        conn.close()
        return jsonify([dict(pl) for pl in lists])

# ============== MISSION DETAILS ROUTES ==============

@app.route('/api/mission-details', methods=['GET'])
@login_required
def get_mission_details():
    """Get active mission details"""
    conn = get_db_connection()
    mission = conn.execute('''
        SELECT md.*, u.username as created_by_name
        FROM mission_details md
        LEFT JOIN users u ON md.created_by = u.id
        WHERE md.is_active = 1
        ORDER BY md.created_at DESC
        LIMIT 1
    ''').fetchone()
    conn.close()
    
    if mission:
        return jsonify({'success': True, 'data': dict(mission), 'exists': True})
    else:
        return jsonify({'success': True, 'data': None, 'exists': False})

@app.route('/api/mission-details/check', methods=['GET'])
@login_required
def check_mission_details():
    """Check if mission details exist"""
    conn = get_db_connection()
    count = conn.execute('SELECT COUNT(*) as count FROM mission_details WHERE is_active = 1').fetchone()['count']
    conn.close()
    
    return jsonify({'exists': count > 0})

@app.route('/api/mission-details', methods=['POST'])
@login_required
def create_mission_details():
    """Create new mission details (any user can create if none exist)"""
    conn = get_db_connection()
    
    # Check if mission details already exist
    existing = conn.execute('SELECT COUNT(*) as count FROM mission_details WHERE is_active = 1').fetchone()['count']
    
    if existing > 0:
        # Only admin can create when one already exists
        if not has_permission(current_user, 'manage_all'):
            conn.close()
            return jsonify({'success': False, 'message': 'Only administrators can update mission details'}), 403
    
    data = request.json
    
    # Validate required fields
    required_fields = ['mission_name', 'mission_abbreviation', 'cover_period_months']
    for field in required_fields:
        if not data.get(field):
            conn.close()
            return jsonify({'success': False, 'message': f'{field} is required'}), 400
    
    try:
        # Deactivate any existing active mission
        conn.execute('UPDATE mission_details SET is_active = 0 WHERE is_active = 1')
        
        # Insert new mission details
        cursor = conn.execute('''
            INSERT INTO mission_details (
                mission_name, mission_abbreviation,
                lead_time_months, cover_period_months, security_stock_months,
                is_active, created_by
            ) VALUES (?, ?, ?, ?, ?, 1, ?)
        ''', (
            data.get('mission_name'),
            data.get('mission_abbreviation'),
            data.get('lead_time_months', 0),
            data.get('cover_period_months'),
            data.get('security_stock_months', 0),
            current_user.id
        ))
        
        conn.commit()
        mission_id = cursor.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'message': 'Mission details saved successfully', 'id': mission_id})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/mission-details/<int:mission_id>', methods=['PUT'])
@login_required
def update_mission_details(mission_id):
    """Update mission details (only admin/HQ)"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can update mission details'}), 403
    
    conn = get_db_connection()
    data = request.json
    
    # Validate required fields
    required_fields = ['mission_name', 'mission_abbreviation', 'cover_period_months']
    for field in required_fields:
        if not data.get(field):
            conn.close()
            return jsonify({'success': False, 'message': f'{field} is required'}), 400
    
    try:
        conn.execute('''
            UPDATE mission_details SET
                mission_name = ?,
                mission_abbreviation = ?,
                lead_time_months = ?,
                cover_period_months = ?,
                security_stock_months = ?
            WHERE id = ?
        ''', (
            data.get('mission_name'),
            data.get('mission_abbreviation'),
            data.get('lead_time_months', 0),
            data.get('cover_period_months'),
            data.get('security_stock_months', 0),
            mission_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Mission details updated successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

# ============== PROJECTS ROUTES ==============

@app.route('/api/projects', methods=['GET'])
@login_required
def get_projects():
    """Get all projects"""
    conn = get_db_connection()
    projects = conn.execute('''
        SELECT p.*, u.username as created_by_name
        FROM projects p
        LEFT JOIN users u ON p.created_by = u.id
        WHERE p.is_active = 1
        ORDER BY p.display_order, p.created_at
    ''').fetchall()
    conn.close()
    
    return jsonify({'success': True, 'data': [dict(p) for p in projects]})

@app.route('/api/projects/<int:project_id>', methods=['GET'])
@login_required
def get_project(project_id):
    """Get single project"""
    conn = get_db_connection()
    project = conn.execute('SELECT * FROM projects WHERE id = ?', (project_id,)).fetchone()
    conn.close()
    
    if project:
        return jsonify({'success': True, 'data': dict(project)})
    else:
        return jsonify({'success': False, 'message': 'Project not found'}), 404

@app.route('/api/projects', methods=['POST'])
@login_required
def create_project():
    """Create new project (unlimited)"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can create projects'}), 403
    
    conn = get_db_connection()
    data = request.json
    
    # Validate required fields
    if not data.get('project_name') or not data.get('project_code'):
        conn.close()
        return jsonify({'success': False, 'message': 'Project name and code are required'}), 400
    
    try:
        # Get current max display order
        max_order = conn.execute('SELECT MAX(display_order) as max_order FROM projects WHERE is_active = 1').fetchone()['max_order']
        next_order = (max_order or 0) + 1
        
        cursor = conn.execute('''
            INSERT INTO projects (
                project_name, project_code, description,
                display_order, created_by
            ) VALUES (?, ?, ?, ?, ?)
        ''', (
            data.get('project_name'),
            data.get('project_code').upper(),
            data.get('description', ''),
            next_order,
            current_user.id
        ))
        
        conn.commit()
        project_id = cursor.lastrowid
        conn.close()
        
        return jsonify({'success': True, 'message': 'Project created successfully', 'id': project_id})
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'message': 'Project code already exists'}), 400
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/projects/<int:project_id>', methods=['PUT'])
@login_required
def update_project(project_id):
    """Update project"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can update projects'}), 403
    
    conn = get_db_connection()
    data = request.json
    
    try:
        conn.execute('''
            UPDATE projects SET
                project_name = ?,
                project_code = ?,
                description = ?
            WHERE id = ?
        ''', (
            data.get('project_name'),
            data.get('project_code').upper(),
            data.get('description', ''),
            project_id
        ))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Project updated successfully'})
    
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'success': False, 'message': 'Project code already exists'}), 400
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/projects/<int:project_id>', methods=['DELETE'])
@login_required
def delete_project(project_id):
    """Delete (deactivate) project"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can delete projects'}), 403
    
    conn = get_db_connection()
    
    try:
        conn.execute('UPDATE projects SET is_active = 0 WHERE id = ?', (project_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Project deleted successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/projects/reorder', methods=['POST'])
@login_required
def reorder_projects():
    """Reorder projects"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can reorder projects'}), 403
    
    conn = get_db_connection()
    data = request.json
    project_ids = data.get('project_ids', [])
    
    try:
        for index, project_id in enumerate(project_ids, start=1):
            conn.execute('UPDATE projects SET display_order = ? WHERE id = ?', (index, project_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Projects reordered successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

# ============== USER MANAGEMENT ROUTES ==============

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    """Get all users (admin only)"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    
    conn = get_db_connection()
    users = conn.execute('''
        SELECT id, username, role, language, created_at
        FROM users
        ORDER BY created_at DESC
    ''').fetchall()
    conn.close()
    
    return jsonify({
        'success': True, 
        'data': [dict(u) for u in users],
        'current_user_id': current_user.id
    })

@app.route('/api/users', methods=['POST'])
@login_required
def create_user():
    """Create new user (admin only)"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    role = data.get('role', '').strip()
    language = data.get('language', 'en')
    
    # Validate
    if not username or not password or not role:
        return jsonify({'success': False, 'message': 'Username, password, and role are required'}), 400
    
    if len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
    
    if role not in ['HQ', 'Coordinator', 'Manager', 'Supervisor']:
        return jsonify({'success': False, 'message': 'Invalid role'}), 400
    
    conn = get_db_connection()
    
    try:
        # Check if username exists
        existing = conn.execute('SELECT id FROM users WHERE username = ?', (username,)).fetchone()
        if existing:
            conn.close()
            return jsonify({'success': False, 'message': 'Username already exists'}), 400
        
        # Create user
        password_hash = generate_password_hash(password)
        conn.execute('''
            INSERT INTO users (username, password, role, language)
            VALUES (?, ?, ?, ?)
        ''', (username, password_hash, role, language))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'User created successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@login_required
def update_user(user_id):
    """Update user (admin only)"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    
    data = request.json
    username = data.get('username', '').strip()
    role = data.get('role', '').strip()
    language = data.get('language', 'en')
    password = data.get('password', '').strip()
    
    # Validate
    if not username or not role:
        return jsonify({'success': False, 'message': 'Username and role are required'}), 400
    
    if role not in ['HQ', 'Coordinator', 'Manager', 'Supervisor']:
        return jsonify({'success': False, 'message': 'Invalid role'}), 400
    
    if password and len(password) < 6:
        return jsonify({'success': False, 'message': 'Password must be at least 6 characters'}), 400
    
    conn = get_db_connection()
    
    try:
        # Check if username exists for another user
        existing = conn.execute('SELECT id FROM users WHERE username = ? AND id != ?', (username, user_id)).fetchone()
        if existing:
            conn.close()
            return jsonify({'success': False, 'message': 'Username already exists'}), 400
        
        # Update user
        if password:
            password_hash = generate_password_hash(password)
            conn.execute('''
                UPDATE users SET
                    username = ?,
                    password = ?,
                    role = ?,
                    language = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (username, password_hash, role, language, user_id))
        else:
            conn.execute('''
                UPDATE users SET
                    username = ?,
                    role = ?,
                    language = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            ''', (username, role, language, user_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'User updated successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@login_required
def delete_user(user_id):
    """Delete user (admin only)"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    
    # Cannot delete self
    if user_id == current_user.id:
        return jsonify({'success': False, 'message': 'You cannot delete your own account'}), 400
    
    conn = get_db_connection()
    
    try:
        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'User deleted successfully'})
    
    except Exception as e:
        conn.close()
        return jsonify({'success': False, 'message': str(e)}), 500
    
# ============== EXCEL EXPORT ROUTES ==============

@app.route('/api/export/packing-list/<int:list_id>')
@login_required
def export_packing_list(list_id):
    """Export packing list to Excel with custom formatting"""
    if not has_permission(current_user, 'export'):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403
    
    conn = get_db_connection()
    
    # Get packing list info
    packing_list = conn.execute('''
        SELECT pl.*, u.username as created_by_name 
        FROM packing_lists pl
        LEFT JOIN users u ON pl.created_by = u.id
        WHERE pl.id = ?
    ''', (list_id,)).fetchone()
    
    if not packing_list:
        conn.close()
        return jsonify({'success': False, 'message': 'Packing list not found'}), 404
    
    # Get items in the packing list
    items = conn.execute('''
        SELECT i.barcode, i.name, i.location, pli.quantity
        FROM packing_list_items pli
        JOIN items i ON pli.item_id = i.id
        WHERE pli.packing_list_id = ?
    ''', (list_id,)).fetchall()
    conn.close()
    
    # Create Excel file
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Packing List"
    
    # Define colors from theme
    header_fill = PatternFill(start_color="1F3A8A", end_color="1F3A8A", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=12)
    title_font = Font(bold=True, size=16, color="1F3A8A")
    
    # Title
    ws['A1'] = f"Packing List: {packing_list['list_name']}"
    ws['A1'].font = title_font
    ws.merge_cells('A1:D1')
    
    # Metadata
    current_date = normalize_date(datetime.now())
    ws['A2'] = f"Date: {current_date}"
    ws['A3'] = f"Created by: {packing_list['created_by_name']}"
    ws['A4'] = f"Status: {packing_list['status']}"
    
    # Column headers
    headers = ['Barcode', 'Item Name', 'Location', 'Quantity']
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=6, column=col)
        cell.value = header
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')
    
    # Data rows
    for row, item in enumerate(items, 7):
        ws.cell(row=row, column=1, value=item['barcode'])
        ws.cell(row=row, column=2, value=item['name'])
        ws.cell(row=row, column=3, value=item['location'])
        
        # Format quantity based on user's language/locale
        quantity_formatted = format_excel_number(item['quantity'], current_user.language)
        ws.cell(row=row, column=4, value=quantity_formatted)
    
    # Adjust column widths
    ws.column_dimensions['A'].width = 15
    ws.column_dimensions['B'].width = 35
    ws.column_dimensions['C'].width = 15
    ws.column_dimensions['D'].width = 12
    
    # Save file
    filename = f"packing_list_{list_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join('data', filename)
    wb.save(filepath)
    
    return send_file(filepath, as_attachment=True, download_name=filename)

@app.route('/api/basic-data/export', methods=['GET'])
@login_required
def export_basic_data():
    """Export basic_data to Excel"""
    if not has_permission(current_user, 'export'):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403
    
    conn = get_db_connection()
    data = conn.execute('SELECT * FROM basic_data ORDER BY imported_at DESC').fetchall()
    conn.close()
    
    # Create Excel file
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Basic Data"
    
    # Headers
    headers = [
        'Unique ID', 'Packing Ref', 'Line No', 'Item Code', 'Item Description',
        'Qty Unit Tot', 'Packaging', 'Parcel N°', 'Nb Parcels', 'Batch No',
        'Exp Date', 'Kg Total', 'dm3 Total', 'Transport Reception', 'Sub Folder',
        'Field Ref', 'Ref Op MSFL', 'Parcel Nb', 'Weight (kg)', 'Volume (m3)',
        'Invoice/Credit Note Ref', 'Estim Value (EU)', 'Imported At'
    ]
    
    # Style headers
    header_fill = PatternFill(start_color="1F3A8A", end_color="1F3A8A", fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF")
    
    for col, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col)
        cell.value = header
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')
    
    # Data rows
    for row_idx, record in enumerate(data, 2):
        ws.cell(row=row_idx, column=1, value=record['unique_id'])
        ws.cell(row=row_idx, column=2, value=record['packing_ref'])
        ws.cell(row=row_idx, column=3, value=record['line_no'])
        ws.cell(row=row_idx, column=4, value=record['item_code'])
        ws.cell(row=row_idx, column=5, value=record['item_description'])
        ws.cell(row=row_idx, column=6, value=record['qty_unit_tot'])
        ws.cell(row=row_idx, column=7, value=record['packaging'])
        ws.cell(row=row_idx, column=8, value=record['parcel_no'])
        ws.cell(row=row_idx, column=9, value=record['nb_parcels'])
        ws.cell(row=row_idx, column=10, value=record['batch_no'])
        ws.cell(row=row_idx, column=11, value=record['exp_date'])
        ws.cell(row=row_idx, column=12, value=record['kg_total'])
        ws.cell(row=row_idx, column=13, value=record['dm3_total'])
        ws.cell(row=row_idx, column=14, value=record['transport_reception'])
        ws.cell(row=row_idx, column=15, value=record['sub_folder'])
        ws.cell(row=row_idx, column=16, value=record['field_ref'])
        ws.cell(row=row_idx, column=17, value=record['ref_op_msfl'])
        ws.cell(row=row_idx, column=18, value=record['parcel_nb'])
        ws.cell(row=row_idx, column=19, value=record['weight_kg'])
        ws.cell(row=row_idx, column=20, value=record['volume_m3'])
        ws.cell(row=row_idx, column=21, value=record['invoice_credit_note_ref'])
        ws.cell(row=row_idx, column=22, value=record['estim_value_eu'])
        ws.cell(row=row_idx, column=23, value=record['imported_at'])
    
    # Auto-adjust column widths
    for column in ws.columns:
        max_length = 0
        column_letter = column[0].column_letter
        for cell in column:
            try:
                if len(str(cell.value)) > max_length:
                    max_length = len(str(cell.value))
            except:
                pass
        adjusted_width = min(max_length + 2, 50)
        ws.column_dimensions[column_letter].width = adjusted_width
    
    # Save file
    filename = f"basic_data_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    filepath = os.path.join('data', filename)
    wb.save(filepath)
    
    return send_file(filepath, as_attachment=True, download_name=filename)

# ============== EXCEL IMPORT ROUTES ==============

@app.route('/api/import/preview', methods=['POST'])
@login_required
def preview_import():
    """Preview Excel file before importing"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file uploaded'}), 400
    
    file = request.files['file']
    file_type = request.form.get('file_type', 'file1')
    
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected'}), 400
    
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            data_rows, columns = ExcelImporter.read_excel_file(filepath, file_type)
            preview = data_rows[:10]  # First 10 rows for preview
            
            return jsonify({
                'success': True,
                'preview': preview,
                'columns': columns,
                'total_rows': len(data_rows),
                'filename': filename
            })
        except Exception as e:
            return jsonify({'success': False, 'message': f'Error reading file: {str(e)}'}), 500
    
    return jsonify({'success': False, 'message': 'Invalid file type. Only .xlsx and .xls allowed'}), 400

@app.route('/api/import/execute', methods=['POST'])
@login_required
def execute_import():
    """Execute the import of one or two Excel files"""
    if not has_permission(current_user, 'manage_items'):
        return jsonify({'success': False, 'message': 'Permission denied'}), 403
    
    data = request.json
    file1_name = data.get('file1')
    file2_name = data.get('file2')
    
    if not file1_name:
        return jsonify({'success': False, 'message': 'At least one file is required'}), 400
    
    try:
        # Read first file
        file1_path = os.path.join(app.config['UPLOAD_FOLDER'], file1_name)
        
        if not os.path.exists(file1_path):
            return jsonify({'success': False, 'message': 'File 1 not found'}), 404
        
        file1_data, _ = ExcelImporter.read_excel_file(file1_path, 'file1')
        
        # If second file provided, merge data
        if file2_name:
            file2_path = os.path.join(app.config['UPLOAD_FOLDER'], file2_name)
            
            if not os.path.exists(file2_path):
                return jsonify({'success': False, 'message': 'File 2 not found'}), 404
            
            file2_data, _ = ExcelImporter.read_excel_file(file2_path, 'file2')
            merged_data = ExcelImporter.merge_data(file1_data, file2_data)
        else:
            merged_data = file1_data
        
        # Import to database
        source_files = f"{file1_name}" + (f" + {file2_name}" if file2_name else "")
        imported_count, errors = ExcelImporter.import_to_database(
            merged_data, 
            source_files, 
            current_user.id
        )
        
        return jsonify({
            'success': True,
            'imported_count': imported_count,
            'total_rows': len(merged_data),
            'errors': errors[:10] if errors else []  # Return first 10 errors
        })
    
    except Exception as e:
        return jsonify({'success': False, 'message': f'Import failed: {str(e)}'}), 500

@app.route('/api/basic-data', methods=['GET'])
@login_required
def get_basic_data():
    """Get all basic_data records with pagination"""
    conn = get_db_connection()
    
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)
    search = request.args.get('search', '', type=str)
    offset = (page - 1) * per_page
    
    # Build search query
    where_clause = ""
    params = []
    
    if search:
        where_clause = """
            WHERE bd.packing_ref LIKE ? OR 
                  bd.item_code LIKE ? OR 
                  bd.item_description LIKE ?
        """
        search_term = f"%{search}%"
        params = [search_term, search_term, search_term]
    
    # Get total count
    count_query = f"SELECT COUNT(*) as count FROM basic_data bd {where_clause}"
    total = conn.execute(count_query, params).fetchone()['count']
    
    # Get paginated data
    data_query = f"""
        SELECT bd.*, u.username as imported_by_name
        FROM basic_data bd
        LEFT JOIN users u ON bd.imported_by = u.id
        {where_clause}
        ORDER BY bd.imported_at DESC
        LIMIT ? OFFSET ?
    """
    data = conn.execute(data_query, params + [per_page, offset]).fetchall()
    
    conn.close()
    
    return jsonify({
        'success': True,
        'data': [dict(row) for row in data],
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': (total + per_page - 1) // per_page
    })

@app.route('/api/basic-data/<int:record_id>', methods=['GET'])
@login_required
def get_basic_data_by_id(record_id):
    """Get a single basic_data record by ID"""
    conn = get_db_connection()
    record = conn.execute('''
        SELECT bd.*, u.username as imported_by_name
        FROM basic_data bd
        LEFT JOIN users u ON bd.imported_by = u.id
        WHERE bd.id = ?
    ''', (record_id,)).fetchone()
    conn.close()
    
    if record:
        return jsonify({'success': True, 'data': dict(record)})
    else:
        return jsonify({'success': False, 'message': 'Record not found'}), 404



# ============== BACKUP & RESTORE ROUTES ==============

import zipfile
import hashlib
import json

@app.route('/api/backup/create', methods=['POST'])
@login_required
def create_backup():
    """Create a backup zip file"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can create backups'}), 403
    
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Get mission abbreviation for filename
        conn = get_db_connection()
        mission = conn.execute('SELECT mission_abbreviation FROM mission_details WHERE is_active = 1 LIMIT 1').fetchone()
        conn.close()
        
        mission_code = mission['mission_abbreviation'] if mission else 'MIDFLOW'
        backup_filename = f"midflow_backup_{mission_code}_{timestamp}.zip"
        backup_path = os.path.join('data', 'backups', backup_filename)
        
        # Create backups directory
        os.makedirs('data/backups', exist_ok=True)
        
        # Check if database exists
        if not os.path.exists(DATABASE):
            return jsonify({'success': False, 'message': 'Database file not found'}), 404
        
        # Compute SHA-256 hash
        sha256_hash = hashlib.sha256()
        db_size = os.path.getsize(DATABASE)
        with open(DATABASE, 'rb') as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        db_sha256 = sha256_hash.hexdigest()
        
        # Create backup metadata
        backup_meta = {
            "app_name": "MidFlow",
            "app_version": "1.0.0",
            "backup_date": datetime.now().isoformat(),
            "mission_code": mission_code,
            "created_by": current_user.username,
            "db_file": "inventory.db",
            "db_sha256": db_sha256,
            "db_size_bytes": db_size
        }
        
        # Create zip file
        with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            # Add database
            zipf.write(DATABASE, 'inventory.db')
            
            # Add metadata
            metadata_json = json.dumps(backup_meta, indent=2)
            zipf.writestr("backup_meta.json", metadata_json)
        
        return jsonify({
            'success': True,
            'message': 'Backup created successfully',
            'filename': backup_filename,
            'size': os.path.getsize(backup_path),
            'download_url': f'/api/backup/download/{backup_filename}'
        })
    
    except Exception as e:
        print(f"❌ Error creating backup: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/backup/download/<filename>')
@login_required
def download_backup(filename):
    """Download a backup file"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    
    try:
        backup_path = os.path.join('data', 'backups', filename)
        
        if not os.path.exists(backup_path):
            return jsonify({'success': False, 'message': 'Backup file not found'}), 404
        
        return send_file(
            backup_path,
            as_attachment=True,
            download_name=filename,
            mimetype='application/zip'
        )
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/backup/list', methods=['GET'])
@login_required
def list_backups():
    """List all available backups"""
    try:
        backups_dir = os.path.join('data', 'backups')
        
        # Create directory if it doesn't exist
        if not os.path.exists(backups_dir):
            print(f'📁 Creating backups directory: {backups_dir}')
            os.makedirs(backups_dir, exist_ok=True)
            return jsonify({'success': True, 'backups': []})
        
        backups = []
        
        # List all zip files
        for filename in os.listdir(backups_dir):
            if filename.endswith('.zip'):
                filepath = os.path.join(backups_dir, filename)
                
                try:
                    file_stat = os.stat(filepath)
                    
                    backups.append({
                        'filename': filename,
                        'size': file_stat.st_size,
                        'created_at': datetime.fromtimestamp(file_stat.st_mtime).isoformat()
                    })
                except Exception as e:
                    print(f'⚠️ Error reading file {filename}: {e}')
                    continue
        
        # Sort by creation date (newest first)
        backups.sort(key=lambda x: x['created_at'], reverse=True)
        
        print(f'✅ Found {len(backups)} backup files in {backups_dir}')
        
        return jsonify({'success': True, 'backups': backups})
    
    except Exception as e:
        print(f'❌ Error listing backups: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/backup/restore', methods=['POST'])
@login_required
def restore_backup():
    """Restore from uploaded backup file"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Only administrators can restore backups'}), 403
    
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'message': 'No file uploaded'}), 400
        
        file = request.files['file']
        
        if file.filename == '':
            return jsonify({'success': False, 'message': 'No file selected'}), 400
        
        if not file.filename.endswith('.zip'):
            return jsonify({'success': False, 'message': 'Invalid file type. Only .zip files allowed'}), 400
        
        # Save uploaded file temporarily
        temp_zip = os.path.join('data', 'temp_restore.zip')
        file.save(temp_zip)
        
        # Extract and validate
        temp_dir = 'data/temp_restore'
        os.makedirs(temp_dir, exist_ok=True)
        
        with zipfile.ZipFile(temp_zip, 'r') as zip_ref:
            zip_contents = zip_ref.namelist()
            
            # Check if database exists in backup
            if 'inventory.db' not in zip_contents:
                os.remove(temp_zip)
                shutil.rmtree(temp_dir, ignore_errors=True)
                return jsonify({'success': False, 'message': 'Invalid backup file: database not found'}), 400
            
            # Load metadata if available
            backup_meta = None
            if 'backup_meta.json' in zip_contents:
                metadata_content = zip_ref.read('backup_meta.json')
                backup_meta = json.loads(metadata_content)
            
            # Extract all files
            zip_ref.extractall(temp_dir)
        
        # Verify database file
        extracted_db = os.path.join(temp_dir, 'inventory.db')
        
        if not os.path.exists(extracted_db):
            os.remove(temp_zip)
            shutil.rmtree(temp_dir, ignore_errors=True)
            return jsonify({'success': False, 'message': 'Database file not found in backup'}), 400
        
        # Verify SHA-256 hash if metadata exists
        if backup_meta and 'db_sha256' in backup_meta:
            sha256_hash = hashlib.sha256()
            with open(extracted_db, 'rb') as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            computed_hash = sha256_hash.hexdigest()
            expected_hash = backup_meta['db_sha256']
            
            if computed_hash != expected_hash:
                os.remove(temp_zip)
                shutil.rmtree(temp_dir, ignore_errors=True)
                return jsonify({
                    'success': False,
                    'message': 'Database integrity check failed! File may be corrupted.',
                    'expected_hash': expected_hash,
                    'computed_hash': computed_hash
                }), 400
        
        # Create safety backup of current database
        if os.path.exists(DATABASE):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safety_backup = os.path.join('data', 'backups', f'pre_restore_safety_{timestamp}.db')
            shutil.copy(DATABASE, safety_backup)
        
        # Replace current database
        shutil.copy(extracted_db, DATABASE)
        
        # Clean up
        os.remove(temp_zip)
        shutil.rmtree(temp_dir, ignore_errors=True)
        
        # Count records in key tables
        conn = get_db_connection()
        tables_info = []
        
        for table in ['users', 'projects', 'mission_details', 'items']:
            try:
                count = conn.execute(f'SELECT COUNT(*) as count FROM {table}').fetchone()['count']
                tables_info.append({'table': table, 'count': count})
            except:
                pass
        
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Database restored successfully',
            'backup_info': backup_meta,
            'tables': tables_info
        })
    
    except Exception as e:
        print(f"❌ Error restoring backup: {e}")
        # Clean up on error
        if os.path.exists('data/temp_restore.zip'):
            os.remove('data/temp_restore.zip')
        if os.path.exists('data/temp_restore'):
            shutil.rmtree('data/temp_restore', ignore_errors=True)
        
        return jsonify({'success': False, 'message': str(e)}), 500

@app.route('/api/backup/delete/<filename>', methods=['DELETE'])
@login_required
def delete_backup(filename):
    """Delete a backup file"""
    if not has_permission(current_user, 'manage_all'):
        return jsonify({'success': False, 'message': 'Access denied'}), 403
    
    try:
        backup_path = os.path.join('data', 'backups', filename)
        
        if not os.path.exists(backup_path):
            return jsonify({'success': False, 'message': 'Backup file not found'}), 404
        
        os.remove(backup_path)
        
        return jsonify({'success': True, 'message': 'Backup deleted successfully'})
    
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500
            

if __name__ == '__main__':
    app.run(debug=True, port=5000)