// Show/hide sections
function showSection(section) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(`${section}-section`).style.display = 'block';
    
    if (section === 'items') loadItems();
    if (section === 'packing') loadPackingLists();
}

// Add item form submission
document.getElementById('add-item-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const data = {
        barcode: document.getElementById('barcode').value,
        name: document.getElementById('name').value,
        quantity: parseInt(document.getElementById('quantity').value),
        location: document.getElementById('location').value
    };
    
    const response = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    
    const result = await response.json();
    
    if (result.success) {
        alert('Item added successfully!');
        e.target.reset();
        loadItems();
    } else {
        alert('Error: ' + result.message);
    }
});

// Load all items
async function loadItems() {
    const response = await fetch('/api/items');
    const items = await response.json();
    
    const list = document.getElementById('items-list');
    list.innerHTML = items.map(item => `
        <div class="item-card">
            <strong>${item.name}</strong> (${item.barcode})<br>
            Quantity: ${item.quantity} | Location: ${item.location || 'N/A'}
        </div>
    `).join('');
}

// Barcode validation
async function validateBarcode(barcode) {
    const response = await fetch(`/api/items/${barcode}`);
    const result = await response.json();
    
    if (result.success) {
        return { valid: true, item: result.item };
    } else {
        return { valid: false, message: 'Item not found' };
    }
}

// Barcode scanner popup (placeholder)
function scanBarcode() {
    alert('Barcode scanner integration coming soon!\nFor now, enter barcode manually.');
    // In future: integrate QuaggaJS or similar library
}

function closePopup() {
    document.getElementById('barcode-popup').style.display = 'none';
}

// Load packing lists
async function loadPackingLists() {
    const response = await fetch('/api/packing-lists');
    const lists = await response.json();
    
    const container = document.getElementById('packing-lists');
    container.innerHTML = lists.map(list => `
        <div class="item-card">
            <strong>${list.list_name}</strong><br>
            Status: ${list.status} | Created: ${list.created_at}<br>
            <button onclick="exportPackingList(${list.id})">Export to Excel</button>
        </div>
    `).join('');
}

// Export packing list
function exportPackingList(listId) {
    window.location.href = `/api/export/packing-list/${listId}`;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadItems();
});