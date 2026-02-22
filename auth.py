from flask_login import UserMixin
from werkzeug.security import check_password_hash
from database import get_db_connection

class User(UserMixin):
    def __init__(self, id, username, role, language='en'):
        self.id = id
        self.username = username
        self.role = role
        self.language = language

    @staticmethod
    def get(user_id):
        """Get user by ID"""
        conn = get_db_connection()
        user_data = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        conn.close()
        
        if user_data:
            # Handle language field - sqlite3.Row doesn't have .get()
            try:
                language = user_data['language'] if user_data['language'] else 'en'
            except (KeyError, IndexError):
                language = 'en'
            
            return User(
                user_data['id'],
                user_data['username'],
                user_data['role'],
                language
            )
        return None

    @staticmethod
    def authenticate(username, password):
        """Authenticate user"""
        conn = get_db_connection()
        user_data = conn.execute('SELECT * FROM users WHERE username = ?', (username,)).fetchone()
        conn.close()
        
        if user_data and check_password_hash(user_data['password'], password):
            # Handle language field - sqlite3.Row doesn't have .get()
            try:
                language = user_data['language'] if user_data['language'] else 'en'
            except (KeyError, IndexError):
                language = 'en'
            
            return User(
                user_data['id'],
                user_data['username'],
                user_data['role'],
                language
            )
        return None

    def update_language(self, language):
        """Update user's language preference"""
        try:
            conn = get_db_connection()
            conn.execute('UPDATE users SET language = ? WHERE id = ?', (language, self.id))
            conn.commit()
            conn.close()
            self.language = language
        except Exception as e:
            print(f"Error updating language: {e}")

def has_permission(user, permission):
    """Check if user has permission"""
    role = user.role.upper() if hasattr(user, 'role') else ''
    
    # Administrator/HQ has all permissions
    if role in ['ADMINISTRATOR', 'HQ']:
        return True
    
    # Coordinator permissions
    if role == 'COORDINATOR':
        return permission in [
            'view_all',
            'create_packing_list',
            'manage_items',
            'export'
        ]
    
    # Manager permissions
    if role == 'MANAGER':
        return permission in [
            'create_packing_list',
            'manage_items',
            'export'
        ]
    
    # Supervisor permissions
    if role == 'SUPERVISOR':
        return permission in [
            'create_packing_list',
            'manage_items'
        ]
    
    # Special permission mappings
    permission_map = {
        'manage_all': ['ADMINISTRATOR', 'HQ'],
        'view_all': ['ADMINISTRATOR', 'HQ', 'COORDINATOR'],
        'create_packing_list': ['ADMINISTRATOR', 'HQ', 'COORDINATOR', 'MANAGER', 'SUPERVISOR'],
        'manage_items': ['ADMINISTRATOR', 'HQ', 'COORDINATOR', 'MANAGER', 'SUPERVISOR'],
        'export': ['ADMINISTRATOR', 'HQ', 'COORDINATOR', 'MANAGER']
    }
    
    return role in permission_map.get(permission, [])