// inventory.js — Inventory page
console.log('✅ Inventory loaded');

let invProjects = [];

// ── Notification ──────────────────────────────────────────────────────────
function invNotify(msg, type='info') {
    const bg  = type==='error'?'#FEE2E2':type==='success'?'#D1FAE5':'#FEF3C7';
    const col = type==='error'?'#991B1B':type==='success'?'#065F46':'#92400E';
    const ic  = type==='error'?'❌':type==='success'?'✅':'ℹ️';
    const el  = document.createElement('div');
    el.style.cssText = `position:fixed;top:90px;right:20px;z-index:9999;padding:1rem 1.5rem;
        background:${bg};color:${col};border:2px solid ${col};border-radius:8px;
        box-shadow:0 4px 12px rgba(0,0,0,.15);display:flex;align-items:center;gap:.75rem;
        max-width:420px;animation:slideIn .3s ease-out`;
    el.innerHTML = `<span style="font-size:1.4rem">${ic}</span><span>${msg}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.animation='slideOut .3s ease-out'; setTimeout(()=>el.remove(),300); }, 4000);
}

// ── Tab switching ─────────────────────────────────────────────────────────
function invTab(tab) {
    ['items','parcels','history'].forEach(t => {
        document.getElementById(`inv-panel-${t}`).style.display = t===tab ? '' : 'none';
        const btn = document.getElementById(`inv-tab-${t}`);
        if (btn) btn.classList.toggle('inv-tab-active', t===tab);
    });
    if (tab === 'history') invLoadHistory();
}

// ── Init ──────────────────────────────────────────────────────────────────
async function invInit() {
    try {
        const data = await fetch('/api/projects').then(r=>r.json());
        invProjects = (data.data || []).filter(p=>p.is_active);
        const opts = '<option value="">All Projects</option>' +
            invProjects.map(p=>`<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`).join('');
        ['inv-items-project','inv-parcels-project'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = opts;
        });
        // Retroactively populate project codes in basic_data (silent background call)
        fetch('/api/cargo/recalculate-projects', {method:'POST'}).catch(()=>{});
    } catch(e) { invNotify('Init error: '+e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════════════════════
//  ITEM INVENTORY
// ════════════════════════════════════════════════════════════════════════════

let invItemsData = [];

async function invLoadItems() {
    const project = document.getElementById('inv-items-project').value;
    const params  = new URLSearchParams();
    if (project) params.set('project', project);
    try {
        const data = await fetch('/api/inventory/items?' + params).then(r=>r.json());
        if (!data.success) return invNotify(data.message, 'error');
        invItemsData = data.items || [];
        const tbody = document.getElementById('inv-items-body');
        if (!invItemsData.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:2rem">No stock found</td></tr>';
            document.getElementById('inv-items-save').style.display = 'none';
            document.getElementById('inv-items-info').textContent = '';
            return;
        }
        tbody.innerHTML = invItemsData.map((r,i) => `
            <tr id="inv-item-row-${i}">
                <td>${r.project_code||''}</td>
                <td>${r.item_code||''}</td>
                <td>${r.item_description||''}</td>
                <td>${r.batch_no||''}</td>
                <td>${invExpStyle(r.exp_date)}</td>
                <td style="font-size:.85rem;color:#6B7280">${r.parcel_number||'—'}</td>
                <td style="font-size:.85rem;color:#6B7280">${r.pallet_number||'—'}</td>
                <td style="text-align:right">${(r.net_stock||0).toFixed(3)}</td>
                <td><input type="number" class="form-input" style="width:100px;text-align:right"
                           id="inv-phys-${i}" placeholder="0" min="0" step="any"
                           oninput="invCalcVariance(${i},${r.net_stock||0})"></td>
                <td id="inv-var-${i}" style="text-align:right;font-weight:700">—</td>
                <td><input type="text" class="form-input" style="width:140px" placeholder="Notes" id="inv-note-${i}"></td>
            </tr>
        `).join('');
        document.getElementById('inv-items-save').style.display = '';
        document.getElementById('inv-items-info').textContent =
            `${invItemsData.length} item-batch combinations loaded`;
    } catch(e) { invNotify('Load error: '+e.message, 'error'); }
}

function invCalcVariance(i, systemQty) {
    const phys = parseFloat(document.getElementById(`inv-phys-${i}`)?.value);
    const varCell = document.getElementById(`inv-var-${i}`);
    if (isNaN(phys)) {
        varCell.textContent = '—';
        varCell.style.color = '';
        varCell.closest('tr').className = '';
        return;
    }
    const variance = phys - systemQty;
    varCell.textContent = variance.toFixed(3);
    const tr = varCell.closest('tr');
    tr.className = '';
    if (variance < 0) { varCell.style.color='#EF4444'; tr.classList.add('variance-neg'); }
    else if (variance > 0) { varCell.style.color='#065F46'; tr.classList.add('variance-pos'); }
    else { varCell.style.color='#374151'; }
}

async function invSaveItemCount() {
    const project = document.getElementById('inv-items-project').value || null;
    const lines   = invItemsData.map((r,i) => {
        const phys = parseFloat(document.getElementById(`inv-phys-${i}`)?.value);
        if (isNaN(phys)) return null;
        return {
            item_code:        r.item_code,
            item_description: r.item_description,
            batch_no:         r.batch_no,
            exp_date:         r.exp_date,
            parcel_number:    r.parcel_number || null,
            system_qty:       r.net_stock || 0,
            physical_qty:     phys,
            notes:            document.getElementById(`inv-note-${i}`)?.value.trim() || '',
        };
    }).filter(Boolean);

    if (!lines.length) return invNotify('Enter at least one physical quantity.', 'error');
    try {
        const r = await fetch('/api/inventory/count', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                count_date:   new Date().toISOString().slice(0,10),
                project_code: project,
                count_type:   'item',
                lines,
            })
        }).then(r=>r.json());
        if (!r.success) return invNotify(r.message, 'error');
        invNotify(`✅ Item count saved (ID: ${r.count_id})`, 'success');
    } catch(e) { invNotify('Save error: '+e.message, 'error'); }
}

function invExportBlankItems() {
    const project = document.getElementById('inv-items-project').value;
    const params  = new URLSearchParams({ type: 'item' });
    if (project) params.set('project', project);
    window.open('/api/inventory/blank-sheet?' + params, '_blank');
}

// ════════════════════════════════════════════════════════════════════════════
//  PARCEL INVENTORY
// ════════════════════════════════════════════════════════════════════════════

let invParcelsData = [];

// ── Barcode scanner (parcel inventory) ────────────────────────────────────
function invBeep(ok) {
    try {
        const ctx  = new (window.AudioContext || window.webkitAudioContext)();
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = ok ? 880 : 300;
        osc.type = ok ? 'sine' : 'square';
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.15 : 0.4));
        osc.start(); osc.stop(ctx.currentTime + (ok ? 0.15 : 0.4));
    } catch(e) {}
}

function invParcelScan() {
    const input   = document.getElementById('inv-parcel-barcode');
    const barcode = (input?.value || '').trim();
    if (!barcode) return;
    const idx     = invParcelsData.findIndex(p => String(p.parcel_number) === barcode);
    const resultEl = document.getElementById('inv-scan-result');
    if (idx === -1) {
        invBeep(false);
        resultEl.innerHTML = '<span style="color:#EF4444;font-weight:700">❌ Not found</span>';
    } else {
        const cb = document.getElementById(`inv-pcheck-${idx}`);
        if (cb && !cb.checked) {
            cb.checked = true;
            const row = cb.closest('tr');
            if (row) { row.style.background = '#D1FAE5'; setTimeout(() => row.style.background = '', 1000); }
        }
        invBeep(true);
        resultEl.innerHTML = '<span style="color:#065F46;font-weight:700">✅ Marked present</span>';
    }
    input.value = ''; input.focus();
    setTimeout(() => { if (resultEl) resultEl.innerHTML = ''; }, 2000);
}

async function invLoadParcels() {
    const project = document.getElementById('inv-parcels-project').value;
    const params  = new URLSearchParams();
    if (project) params.set('project', project);
    try {
        const data = await fetch('/api/inventory/parcels?' + params).then(r=>r.json());
        if (!data.success) return invNotify(data.message, 'error');
        invParcelsData = data.parcels || [];
        const tbody = document.getElementById('inv-parcels-body');
        if (!invParcelsData.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:2rem">No received parcels found</td></tr>';
            document.getElementById('inv-parcels-save').style.display = 'none';
            document.getElementById('inv-parcel-scanner').style.display = 'none';
            return;
        }
        tbody.innerHTML = invParcelsData.map((p,i) => `
            <tr>
                <td><strong>${p.parcel_number||''}</strong></td>
                <td>${p.packing_ref||''}</td>
                <td>${p.project_code||''}</td>
                <td>${p.pallet_number||'—'}</td>
                <td style="text-align:right">${p.item_count||0}</td>
                <td style="text-align:right">${(p.total_weight||0).toFixed(2)}</td>
                <td style="font-size:.85rem;color:#6B7280">${p.received_at||''}</td>
                <td style="text-align:center">
                    <input type="checkbox" id="inv-pcheck-${i}" style="width:18px;height:18px">
                </td>
                <td><input type="text" class="form-input" style="width:140px" placeholder="Notes" id="inv-pnote-${i}"></td>
            </tr>
        `).join('');
        document.getElementById('inv-parcels-save').style.display = '';
        // Show and focus barcode scanner for hands-free operation
        const scanner = document.getElementById('inv-parcel-scanner');
        if (scanner) {
            scanner.style.display = '';
            const barcodeInput = document.getElementById('inv-parcel-barcode');
            if (barcodeInput) { barcodeInput.value = ''; barcodeInput.focus(); }
        }
    } catch(e) { invNotify('Load error: '+e.message, 'error'); }
}

async function invSaveParcelCount() {
    const project = document.getElementById('inv-parcels-project').value || null;
    const lines   = invParcelsData.map((p,i) => {
        const present = document.getElementById(`inv-pcheck-${i}`)?.checked ? 1 : 0;
        return {
            parcel_number:    p.parcel_number,
            item_code:        null,
            item_description: null,
            system_qty:       1,
            physical_qty:     present,
            notes:            document.getElementById(`inv-pnote-${i}`)?.value.trim() || '',
        };
    });
    try {
        const r = await fetch('/api/inventory/count', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({
                count_date:   new Date().toISOString().slice(0,10),
                project_code: project,
                count_type:   'parcel',
                lines,
            })
        }).then(r=>r.json());
        if (!r.success) return invNotify(r.message, 'error');
        invNotify(`✅ Parcel count saved (ID: ${r.count_id})`, 'success');
    } catch(e) { invNotify('Save error: '+e.message, 'error'); }
}

function invExportBlankParcels() {
    const project = document.getElementById('inv-parcels-project').value;
    const params  = new URLSearchParams({ type: 'parcel' });
    if (project) params.set('project', project);
    window.open('/api/inventory/blank-sheet?' + params, '_blank');
}

// ════════════════════════════════════════════════════════════════════════════
//  COUNT HISTORY
// ════════════════════════════════════════════════════════════════════════════

async function invLoadHistory() {
    try {
        const data = await fetch('/api/inventory/counts').then(r=>r.json());
        if (!data.success) return invNotify(data.message, 'error');
        const counts = data.counts || [];
        const tbody  = document.getElementById('inv-history-body');
        if (!counts.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9CA3AF;padding:2rem">No inventory counts yet</td></tr>';
            return;
        }
        tbody.innerHTML = counts.map((c,i) => {
            const totalVar = parseFloat(c.total_variance||0);
            const varColor = totalVar > 0 ? '#EF4444' : '#065F46';
            const altBg = i%2===0 ? '' : 'background:#F9FAFB';
            const badge = `<span style="background:#D1FAE5;color:#065F46;padding:.15rem .5rem;border-radius:4px;font-size:.82rem">${c.status||''}</span>`;
            return `<tr style="${altBg}">
                <td><a href="#" style="color:#1F3A8A;font-weight:600;text-decoration:none"
                       onclick="invShowCount(${c.id});return false">${c.count_date||''}</a></td>
                <td>${c.project_code||'ALL'}</td>
                <td>${c.count_type||''}</td>
                <td>${badge}</td>
                <td style="text-align:right">${c.line_count||0}</td>
                <td style="text-align:right;color:${varColor};font-weight:700">${totalVar.toFixed(3)}</td>
                <td>${c.created_by_name||''}</td>
                <td>
                    <button class="btn" style="background:#1F3A8A;color:#fff;padding:.2rem .6rem;font-size:.82rem"
                            onclick="invExportCount(${c.id})">📥 Export</button>
                </td>
            </tr>`;
        }).join('');
    } catch(e) { invNotify('Load error: '+e.message, 'error'); }
}

function invExportCount(id) {
    window.open(`/api/inventory/counts/${id}/export`, '_blank');
}

// ── Shared detail modal ───────────────────────────────────────────────────
function showDocModal(title, bodyHtml) {
    let ov = document.getElementById('doc-detail-overlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'doc-detail-overlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center';
        ov.onclick = e => { if (e.target === ov) ov.remove(); };
        document.body.appendChild(ov);
    }
    ov.innerHTML = `<div style="background:#fff;border-radius:12px;padding:1.5rem;max-width:960px;
        width:95vw;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
            <h3 style="margin:0;color:#1F3A8A">${title}</h3>
            <button onclick="document.getElementById('doc-detail-overlay').remove()"
                    style="border:none;background:none;font-size:1.5rem;cursor:pointer;color:#6B7280;line-height:1">✕</button>
        </div>${bodyHtml}</div>`;
}

// ── Inventory count detail popup ───────────────────────────────────────────
async function invShowCount(id) {
    try {
        const data = await fetch(`/api/inventory/counts/${id}`).then(r=>r.json());
        if (!data.success) return invNotify(data.message, 'error');
        const c = data.count;
        const lines = (data.lines || []).map((l, i) => {
            const v = parseFloat(l.variance || 0);
            const vColor = v < 0 ? '#EF4444' : v > 0 ? '#065F46' : '#374151';
            return `<tr style="background:${i%2?'#F9FAFB':''}">
                <td>${l.parcel_number||l.item_code||''}</td>
                <td>${l.item_description||''}</td>
                <td>${l.batch_no||''}</td>
                <td>${l.exp_date||''}</td>
                <td style="text-align:right">${(l.system_qty||0).toFixed(3)}</td>
                <td style="text-align:right">${l.physical_qty!=null?(+l.physical_qty).toFixed(3):'—'}</td>
                <td style="text-align:right;font-weight:700;color:${vColor}">${l.variance!=null?Number(l.variance).toFixed(3):'—'}</td>
                <td>${l.notes||''}</td>
            </tr>`;
        }).join('');
        showDocModal(`🗃️ Inventory Count #${id} — ${c.count_date}`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem 2rem;margin-bottom:1rem;font-size:.9rem">
                <div><span style="color:#6B7280">Date:</span> ${c.count_date}</div>
                <div><span style="color:#6B7280">Type:</span> ${c.count_type}</div>
                <div><span style="color:#6B7280">Project:</span> ${c.project_code||'All'}</div>
                <div><span style="color:#6B7280">By:</span> ${c.created_by_name||''}</div>
                ${c.notes ? `<div style="grid-column:1/-1"><span style="color:#6B7280">Notes:</span> ${c.notes}</div>` : ''}
            </div>
            <table class="data-table" style="font-size:.88rem"><thead><tr>
                <th>Parcel / Item</th><th>Description</th><th>Batch</th><th>Exp Date</th>
                <th style="text-align:right">System</th><th style="text-align:right">Physical</th>
                <th style="text-align:right">Variance</th><th>Notes</th>
            </tr></thead><tbody>${lines||'<tr><td colspan="8" style="text-align:center;color:#9CA3AF">No lines</td></tr>'}</tbody></table>`);
    } catch(e) { invNotify('Load error: ' + e.message, 'error'); }
}

// ── Expiry color helper ───────────────────────────────────────────────────
function invExpStyle(exp) {
    if (!exp) return '<span style="color:#9CA3AF">—</span>';
    const days = Math.floor((new Date(exp) - new Date()) / 86400000);
    const color = days < 0 ? '#EF4444' : days < 30 ? '#EF4444' : days < 90 ? '#F59E0B' : '#374151';
    return `<span style="color:${color}">${exp}</span>`;
}

// ── Re-init hook for navigation.js ────────────────────────────────────────
function initInventoryPage() { invInit(); }

// ── Boot ──────────────────────────────────────────────────────────────────
invInit();

// ── Global exports (required for onclick handlers in dynamically loaded HTML) ──
window.initInventoryPage     = initInventoryPage;
window.invTab                = invTab;
window.invLoadItems          = invLoadItems;
window.invCalcVariance       = invCalcVariance;
window.invSaveItemCount      = invSaveItemCount;
window.invExportBlankItems   = invExportBlankItems;
window.invLoadParcels        = invLoadParcels;
window.invSaveParcelCount    = invSaveParcelCount;
window.invExportBlankParcels = invExportBlankParcels;
window.invLoadHistory        = invLoadHistory;
window.invExportCount        = invExportCount;
window.invBeep               = invBeep;
window.invParcelScan         = invParcelScan;
window.invShowCount          = invShowCount;
window.showDocModal          = showDocModal;
