from datetime import datetime
from dateutil import parser
import re

def normalize_number(value):
    """
    Normalize number input:
    - Remove spaces: "2 000" -> "2000"
    - Handle both comma and dot decimals: "3,22" or "3.22" -> 3.22
    """
    if isinstance(value, (int, float)):
        return float(value)
    
    if not isinstance(value, str):
        return value
    
    # Remove all spaces
    value = value.replace(' ', '')
    
    # Count dots and commas to determine decimal separator
    dot_count = value.count('.')
    comma_count = value.count(',')
    
    # If has comma as decimal (European style): 1.234,56
    if comma_count == 1 and dot_count >= 0:
        if dot_count > 0:
            # Remove thousand separators (dots)
            value = value.replace('.', '')
        # Replace comma with dot
        value = value.replace(',', '.')
    # If has dot as decimal (US style): 1,234.56
    elif dot_count == 1 and comma_count >= 0:
        # Remove thousand separators (commas)
        value = value.replace(',', '')
    
    try:
        return float(value)
    except ValueError:
        return None

def normalize_date(date_input, output_format='%d-%b-%Y'):
    """
    Convert any date format to DD-MMM-YYYY
    Accepts: YYYY-MM-DD, DD/MM/YYYY, MM-DD-YYYY, etc.
    Returns: 21-Feb-2026
    """
    if not date_input:
        return None
    
    if isinstance(date_input, datetime):
        return date_input.strftime(output_format)
    
    try:
        # Try to parse any reasonable date format
        parsed_date = parser.parse(str(date_input), dayfirst=True)
        return parsed_date.strftime(output_format)
    except (ValueError, TypeError):
        return None

def format_excel_number(value, locale='en'):
    """
    Format number for Excel export based on locale
    """
    if value is None:
        return ''
    
    try:
        num = float(value)
        if locale in ['fr', 'es']:  # European format
            return str(num).replace('.', ',')
        else:  # US/UK format
            return str(num)
    except (ValueError, TypeError):
        return value

# Test examples
if __name__ == '__main__':
    print(normalize_number("2 000"))      # 2000.0
    print(normalize_number("3,22"))       # 3.22
    print(normalize_number("3.22"))       # 3.22
    print(normalize_number("1.234,56"))   # 1234.56
    print(normalize_number("1,234.56"))   # 1234.56
    
    print(normalize_date("2026-02-21"))   # 21-Feb-2026
    print(normalize_date("21/02/2026"))   # 21-Feb-2026
    print(normalize_date("02-21-2026"))   # 21-Feb-2026