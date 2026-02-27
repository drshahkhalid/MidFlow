// cargo-followup.js — Dispatch Cargo page
console.log('✅ Dispatch Cargo loaded');

let dcOutTypes      = [];
let dcProjects      = [];
let dcEndUsers      = [];
let dcThirdParties  = [];
let dcDispatchLines = [];      // [{parcel_number, item_code, ...}]
let dcSelectedParcels = new Set(); // parcel numbers already in dispatch lines
let dcItemRows        = [];  // raw rows from /api/dispatch/items
let dcMapParcels      = [];  // raw rows from /api/dispatch/parcel-map
let dcParcelStatusMap = {};  // { parcel_number: 'received'|'dispatched'|'pending' }
let dcVisualRows      = [];  // grouped rows for visual map: [{project,packing_ref,item_code,...,parcels:[{parcel_number,qty,weight_kg}]}]
let dcCurrentTab      = 'parcel';

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Escape a value so it can be used as a single-quoted JS string inside an HTML attribute.
 *  e.g.  onclick="fn('${dcEscStr(val)}')" */
function dcEscStr(s) { return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }

// ── Notification ─────────────────────────────────────────────────────────────
function dcNotify(msg, type='info') {
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

// ── Init ──────────────────────────────────────────────────────────────────────
async function dcInit() {
    try {
        const today = new Date().toISOString().slice(0,10);
        const dateEl = document.getElementById('dc-date');
        if (dateEl) dateEl.value = today;

        const [projRes, euRes, tpRes, typRes] = await Promise.all([
            fetch('/api/projects').then(r=>r.json()),
            fetch('/api/end-users').then(r=>r.json()),
            fetch('/api/third-parties').then(r=>r.json()),
            fetch('/api/movements/types?direction=OUT').then(r=>r.json()),
        ]);

        dcProjects     = (projRes.data       || []).filter(p=>p.is_active);
        dcEndUsers     = euRes.end_users      || [];
        dcThirdParties = tpRes.third_parties  || [];
        dcOutTypes     = typRes.types         || [];

        // OUT type dropdown
        const typeEl = document.getElementById('dc-doc-type');
        if (typeEl) {
            typeEl.innerHTML = '<option value="">— select type —</option>' +
                dcOutTypes.map(t=>`<option value="${t.code}">${t.code} — ${t.label}</option>`).join('');
            typeEl.addEventListener('change', dcOnTypeChange);
        }

        // Project dropdowns
        const projectOpts = dcProjects.map(p=>`<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`).join('');
        ['dc-source-project','dc-dest-project'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = (id==='dc-dest-project'?'<option value="">— none —</option>':'<option value="">— select project —</option>') + projectOpts;
        });
        const fiPrEl = document.getElementById('dc-fi-project');
        if (fiPrEl) fiPrEl.innerHTML = '<option value="">All Projects</option>' + projectOpts;
        const mapPrEl = document.getElementById('dc-map-project');
        if (mapPrEl) mapPrEl.innerHTML = '<option value="">All Projects</option>' + projectOpts;

        // End users
        const euEl = document.getElementById('dc-end-user');
        if (euEl) {
            euEl.innerHTML = '<option value="">— select —</option>' +
                dcEndUsers.map(u=>`<option value="${u.end_user_id}">${u.name}</option>`).join('');
        }

        // Third parties
        const tpEl = document.getElementById('dc-third-party');
        if (tpEl) {
            tpEl.innerHTML = '<option value="">— select —</option>' +
                dcThirdParties.map(t=>`<option value="${t.third_party_id}">${t.name}</option>`).join('');
        }

        // Sync project codes before loading data (so project column is populated)
        try { await fetch('/api/cargo/recalculate-projects', { method: 'POST' }); } catch(e) {}

        dcLoadItems();
        dcLoadMap();
    } catch(e) { dcNotify('Init error: '+e.message, 'error'); }
}

// ── Type change handler ───────────────────────────────────────────────────────
function dcOnTypeChange() {
    const code    = document.getElementById('dc-doc-type')?.value;
    const typeObj = dcOutTypes.find(t=>t.code===code);
    const party   = typeObj ? typeObj.required_party : null;
    const euReq   = document.getElementById('dc-eu-req');
    const tpReq   = document.getElementById('dc-tp-req');
    if (euReq) euReq.style.display = party==='end_user'    ? '' : 'none';
    if (tpReq) tpReq.style.display = party==='third_party' ? '' : 'none';
}

// ── Tab switch ────────────────────────────────────────────────────────────────
function dcTab(tab) {
    dcCurrentTab = tab;
    ['parcel','item','map'].forEach(t => {
        const div = document.getElementById(`dc-tab-${t}`);
        const btn = document.getElementById(`dc-tab-${t}-btn`);
        if (!div || !btn) return;
        const active = t === tab;
        div.style.display = active ? '' : 'none';
        if (active) {
            btn.className = 'btn btn-primary';
            btn.style.borderRadius = '6px 6px 0 0';
        } else {
            btn.className = 'btn';
            btn.style.cssText = 'background:#E5E7EB;color:#374151;border-radius:6px 6px 0 0';
        }
    });
    if (tab === 'parcel') {
        const bc = document.getElementById('dc-parcel-barcode'); if (bc) bc.focus();
    } else if (tab === 'map') {
        dcRenderMap();
        const bc = document.getElementById('dc-map-barcode'); if (bc) bc.focus();
    }
}

// ── Barcode scanner (By Parcel tab) ──────────────────────────────────────────
let dcScanTimer = null;
function dcHandleScan() {
    clearTimeout(dcScanTimer);
    const val = (document.getElementById('dc-parcel-barcode')?.value||'').trim();
    if (!val) return;
    dcScanTimer = setTimeout(async () => {
        const res = document.getElementById('dc-scan-result');
        if (res) res.textContent = '⏳';
        await dcAddParcelByNumber(val);
        const bc = document.getElementById('dc-parcel-barcode');
        if (bc) { bc.value=''; bc.focus(); }
        if (res) res.textContent = '';
    }, 600);
}

async function dcAddParcelManual() {
    const val = (document.getElementById('dc-parcel-barcode')?.value||'').trim();
    if (!val) return dcNotify('Enter a parcel number first.', 'error');
    await dcAddParcelByNumber(val);
    const bc = document.getElementById('dc-parcel-barcode');
    if (bc) { bc.value=''; bc.focus(); }
}

// ── Barcode scanner (Map tab) ─────────────────────────────────────────────────
let dcMapScanTimer = null;
function dcHandleMapScan() {
    clearTimeout(dcMapScanTimer);
    const val = (document.getElementById('dc-map-barcode')?.value||'').trim();
    if (!val) return;
    dcMapScanTimer = setTimeout(async () => {
        await dcAddParcelByNumber(val);
        const bc = document.getElementById('dc-map-barcode');
        if (bc) { bc.value=''; bc.focus(); }
        dcRenderMap();
    }, 600);
}

// ── Fetch parcel contents and add to dispatch lines ───────────────────────────
async function dcAddParcelByNumber(parcelNo) {
    if (dcSelectedParcels.has(parcelNo)) {
        dcNotify(`Parcel ${parcelNo} already added.`, 'info');
        return;
    }
    try {
        const data = await fetch(`/api/dispatch/parcel/${encodeURIComponent(parcelNo)}`).then(r=>r.json());
        if (!data.success) { dcNotify(data.message||'Parcel not found.', 'error'); return; }
        const rows = data.items || data.rows || [];
        if (!rows.length) { dcNotify(`Parcel ${parcelNo}: no received items found.`, 'error'); return; }
        rows.forEach(row => dcDispatchLines.push(row));
        dcSelectedParcels.add(parcelNo);
        dcNotify(`✅ Added parcel ${parcelNo} (${rows.length} lines).`, 'success');
        dcRenderParcelSummary();
        dcRenderLines();
    } catch(e) { dcNotify('Error: '+e.message, 'error'); }
}

// ── Remove a parcel ────────────────────────────────────────────────────────────
function dcRemoveParcel(parcelNo) {
    dcDispatchLines = dcDispatchLines.filter(r => r.parcel_number !== parcelNo);
    dcSelectedParcels.delete(parcelNo);
    dcRenderParcelSummary();
    dcRenderLines();
    if (dcCurrentTab==='item') dcRenderItemTable();
    if (dcCurrentTab==='map')  dcRenderMap();
}

// ── Render parcel summary (tab 1) ─────────────────────────────────────────────
function dcRenderParcelSummary() {
    const tbody = document.getElementById('dc-parcel-body');
    if (!tbody) return;
    const parcels = [...dcSelectedParcels];
    if (!parcels.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9CA3AF;padding:1.5rem" data-i18n="dc_parcel_empty">Scan or enter parcel numbers to add them</td></tr>';
        return;
    }
    const map = {};
    dcDispatchLines.forEach(r => {
        if (!map[r.parcel_number]) map[r.parcel_number] = {project:'',pallet:'',items:0,weight:0,vol:0};
        const p = map[r.parcel_number];
        p.project = r.project_code || p.project;
        p.pallet  = r.pallet_number || p.pallet;
        p.items  += 1;
        p.weight += parseFloat(r.weight_kg)||0;
        p.vol    += parseFloat(r.volume_m3)||0;
    });
    tbody.innerHTML = parcels.map((pno, i) => {
        const p = map[pno] || {};
        return `<tr>
            <td style="color:#9CA3AF">${i+1}</td>
            <td><strong>${pno}</strong></td>
            <td>${p.project||'—'}</td>
            <td>${p.pallet||'—'}</td>
            <td style="text-align:right">${p.items||0}</td>
            <td style="text-align:right">${(p.weight||0).toFixed(2)}</td>
            <td style="text-align:right">${(p.vol||0).toFixed(3)}</td>
            <td><button class="btn" style="background:#FEE2E2;color:#991B1B;padding:.2rem .5rem;font-size:.8rem"
                onclick="dcRemoveParcel('${dcEscStr(pno)}')">✕</button></td>
        </tr>`;
    }).join('');
}

// ── Load items (FEFO, tab 2) ──────────────────────────────────────────────────
async function dcLoadItems() {
    try {
        const params = new URLSearchParams();
        const item    = document.getElementById('dc-fi-item')?.value.trim();
        const project = document.getElementById('dc-fi-project')?.value;
        const parcel  = document.getElementById('dc-fi-parcel')?.value.trim();
        const cargo   = document.getElementById('dc-fi-cargo')?.value.trim();
        const srcProj = document.getElementById('dc-source-project')?.value;
        if (item)    params.set('item', item);
        if (project) params.set('project', project);
        else if (srcProj) params.set('project', srcProj);
        if (parcel)  params.set('parcel_number', parcel);
        if (cargo)   params.set('cargo_session', cargo);

        const data = await fetch('/api/dispatch/items?' + params).then(r=>r.json());
        if (!data.success) { dcNotify(data.message, 'error'); return; }
        dcItemRows = data.items || [];

        const info = document.getElementById('dc-item-info');
        if (info) info.textContent = `${dcItemRows.length} item lines`;

        dcRenderItemTable();
    } catch(e) { dcNotify('Load error: '+e.message, 'error'); }
}

// ── Render item table ──────────────────────────────────────────────────────────
function dcRenderItemTable() {
    const tbody = document.getElementById('dc-item-body');
    if (!tbody) return;
    if (!dcItemRows.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#9CA3AF;padding:2rem">No items found</td></tr>';
        return;
    }
    tbody.innerHTML = dcItemRows.map((r, i) => {
        const selected = dcSelectedParcels.has(r.parcel_number);
        const rowBg    = selected ? 'background:#D1FAE5' : (i%2===0 ? '' : 'background:#F9FAFB');
        const exp      = (r.exp_date||'').slice(0,10);
        const expStyle = exp && exp < new Date().toISOString().slice(0,10) ? 'color:#DC2626;font-weight:600' : '';
        return `<tr style="${rowBg};cursor:pointer" onclick="dcSelectParcel('${dcEscStr(r.parcel_number)}')"
                    title="Click to select entire parcel ${r.parcel_number}">
            <td style="text-align:center">${selected ? '✅' : '☐'}</td>
            <td>${r.project_code||'—'}</td>
            <td style="font-size:.85rem"><strong>${r.parcel_number||''}</strong></td>
            <td style="font-size:.85rem">${r.item_code||''}</td>
            <td style="font-size:.85rem">${r.item_description||''}</td>
            <td style="font-size:.85rem">${r.batch_no||''}</td>
            <td style="font-size:.85rem;${expStyle}">${exp||'—'}</td>
            <td style="text-align:right">${r.qty||0}</td>
            <td style="font-size:.85rem">${r.unit||''}</td>
            <td style="text-align:right">${(parseFloat(r.weight_kg)||0).toFixed(2)}</td>
        </tr>`;
    }).join('');
}

// ── Select / deselect entire parcel (from item table click) ───────────────────
async function dcSelectParcel(parcelNo) {
    if (dcSelectedParcels.has(parcelNo)) {
        dcRemoveParcel(parcelNo);
        dcRenderItemTable();
        return;
    }
    await dcAddParcelByNumber(parcelNo);
    dcRenderItemTable();
}

// ── Filter item tab by source project ────────────────────────────────────────
function dcFilterByProject() {
    const srcProj = document.getElementById('dc-source-project')?.value;
    const fiProj  = document.getElementById('dc-fi-project');
    if (fiProj && srcProj) fiProj.value = srcProj;
}

function dcClearItemFilters() {
    ['dc-fi-item','dc-fi-parcel','dc-fi-cargo'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const fiProj = document.getElementById('dc-fi-project');
    if (fiProj) fiProj.value = '';
    dcLoadItems();
}

// ── Load map data: items + parcel statuses in parallel ────────────────────────
async function dcLoadMap() {
    const container = document.getElementById('dc-map-container');
    if (container) container.innerHTML = '<div style="text-align:center;color:#9CA3AF;padding:3rem">⏳ Loading…</div>';
    try {
        const params = new URLSearchParams();
        const project = document.getElementById('dc-map-project')?.value;
        if (project) params.set('project', project);

        const [itemsRes, mapRes] = await Promise.all([
            fetch('/api/dispatch/items?' + params).then(r=>r.json()),
            fetch('/api/dispatch/parcel-map?' + params).then(r=>r.json()),
        ]);

        // Build parcel status map { parcel_number → 'received'|'dispatched'|'pending' }
        dcParcelStatusMap = {};
        (mapRes.parcels || []).forEach(p => { dcParcelStatusMap[p.parcel_number] = p.status; });

        // Group items by (project, packing_ref, item_code, batch_no, exp_date)
        const gMap = {};
        (itemsRes.items || []).forEach(r => {
            const key = [r.project_code||'', r.packing_ref||'', r.item_code||'', r.batch_no||'', r.exp_date||''].join('||');
            if (!gMap[key]) gMap[key] = {
                project_code: r.project_code, packing_ref: r.packing_ref,
                item_code: r.item_code, item_description: r.item_description,
                batch_no: r.batch_no, exp_date: r.exp_date, unit: r.unit,
                parcels: [],
            };
            gMap[key].parcels.push({ parcel_number: r.parcel_number, qty: r.qty, weight_kg: r.weight_kg });
        });
        dcVisualRows = Object.values(gMap);
        dcRenderMap();
    } catch(e) { dcNotify('Map load error: '+e.message, 'error'); }
}

// ── Render visual map: item table with inline parcel tiles ────────────────────
function dcRenderMap() {
    const container = document.getElementById('dc-map-container');
    if (!container) return;

    const search     = (document.getElementById('dc-map-search')?.value||'').trim().toLowerCase();
    const projFilter = document.getElementById('dc-map-project')?.value||'';

    let data = dcVisualRows;
    if (search) data = data.filter(g =>
        (g.item_code||'').toLowerCase().includes(search) ||
        (g.item_description||'').toLowerCase().includes(search) ||
        (g.packing_ref||'').toLowerCase().includes(search));
    if (projFilter) data = data.filter(g => g.project_code === projFilter);

    if (!data.length) {
        container.innerHTML = '<div style="text-align:center;color:#9CA3AF;padding:3rem">No items found — click Refresh or adjust filters</div>';
        return;
    }

    const today = new Date().toISOString().slice(0,10);
    const rows = data.map((g, i) => {
        const exp      = (g.exp_date||'').slice(0,10);
        const expStyle = exp && exp < today ? 'color:#DC2626;font-weight:600' : '';
        const rowBg    = i%2===0 ? '' : 'background:#F9FAFB';

        // Deduplicate parcels for this item group
        const seen = new Set();
        const uniqueParcels = g.parcels.filter(p => { if (seen.has(p.parcel_number)) return false; seen.add(p.parcel_number); return true; });

        const tiles = uniqueParcels.map(p => {
            const baseStatus = dcParcelStatusMap[p.parcel_number] || 'pending';
            const displayStatus = dcSelectedParcels.has(p.parcel_number) ? 'selected' : baseStatus;
            const C = {
                pending:    {bg:'#F3F4F6',color:'#6B7280',border:'#D1D5DB'},
                received:   {bg:'#D1FAE5',color:'#065F46',border:'#6EE7B7'},
                selected:   {bg:'#FEF3C7',color:'#92400E',border:'#F59E0B'},
                dispatched: {bg:'#FEE2E2',color:'#991B1B',border:'#FCA5A5'},
            }[displayStatus] || {bg:'#F3F4F6',color:'#6B7280',border:'#D1D5DB'};
            const canClick = (baseStatus==='received' || displayStatus==='selected');
            const cursor = canClick ? 'cursor:pointer' : 'cursor:not-allowed;opacity:.7';
            const icon   = displayStatus==='selected' ? '✅ ' : displayStatus==='dispatched' ? '🚚 ' : displayStatus==='pending' ? '⏳ ' : '';
            return `<span onclick="dcMapToggleParcel('${dcEscStr(p.parcel_number)}','${baseStatus}')"
                         title="${displayStatus==='dispatched'?'Already dispatched':displayStatus==='pending'?'Not yet received':'Click to '+(displayStatus==='selected'?'deselect':'select')+' parcel '+p.parcel_number}"
                         style="display:inline-block;background:${C.bg};color:${C.color};
                                border:2px solid ${C.border};border-radius:5px;
                                padding:.18rem .45rem;margin:.1rem;font-size:.78rem;font-weight:700;
                                min-width:30px;text-align:center;${cursor};line-height:1.5;
                                transition:box-shadow .1s"
                         onmouseover="if(${canClick})this.style.boxShadow='0 2px 8px rgba(0,0,0,.25)'"
                         onmouseout="this.style.boxShadow=''"
                         >${icon}${p.parcel_number}</span>`;
        }).join('');

        return `<tr style="${rowBg}">
            <td style="font-size:.82rem;font-weight:600">${g.project_code||'—'}</td>
            <td style="font-size:.82rem">${g.packing_ref||'—'}</td>
            <td style="font-size:.82rem">${g.item_code||''}</td>
            <td style="font-size:.82rem">${g.item_description||''}</td>
            <td style="font-size:.82rem">${g.batch_no||'—'}</td>
            <td style="font-size:.82rem;${expStyle}">${exp||'—'}</td>
            <td style="font-size:.82rem;text-align:right">${g.unit||''}</td>
            <td style="white-space:nowrap;max-width:320px;overflow-x:auto">${tiles}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th data-i18n="dc_col_project">Project</th>
                    <th data-i18n="dc_map_col_pklist">Pack List</th>
                    <th data-i18n="rpt_ss_col_item">Item Code</th>
                    <th data-i18n="rpt_ss_col_desc">Description</th>
                    <th>Batch</th>
                    <th data-i18n="exp_col_exp">Exp Date</th>
                    <th>Unit</th>
                    <th data-i18n="dc_map_col_parcels">Parcels ➜ (click to select/deselect)</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;

    // Re-apply i18n if available
    if (typeof window.translatePage === 'function') window.translatePage();
}

// ── Toggle parcel selection from map tile ─────────────────────────────────────
async function dcMapToggleParcel(parcelNo, baseStatus) {
    if (dcSelectedParcels.has(parcelNo)) {
        dcRemoveParcel(parcelNo);
        dcRenderMap();
        return;
    }
    if (baseStatus === 'dispatched') { dcNotify('This parcel has already been dispatched.', 'info'); return; }
    if (baseStatus === 'pending')    { dcNotify('This parcel has not been received yet.', 'info'); return; }
    await dcAddParcelByNumber(parcelNo);
    dcRenderMap();
}

// ── Render dispatch lines table ────────────────────────────────────────────────
function dcRenderLines() {
    const tbody = document.getElementById('dc-lines-body');
    const totEl = document.getElementById('dc-total-info');
    if (!tbody) return;

    if (!dcDispatchLines.length) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#9CA3AF;padding:2rem" data-i18n="dc_lines_empty">No parcels selected yet</td></tr>';
        if (totEl) totEl.textContent = '';
        return;
    }

    let totalWeight = 0;
    tbody.innerHTML = dcDispatchLines.map((r, i) => {
        totalWeight += parseFloat(r.weight_kg)||0;
        const exp = (r.exp_date||'').slice(0,10);
        return `<tr style="${i%2===0?'':'background:#F9FAFB'}">
            <td style="color:#9CA3AF">${i+1}</td>
            <td style="font-size:.85rem"><strong>${r.parcel_number||''}</strong></td>
            <td style="font-size:.85rem">${r.item_code||''}</td>
            <td style="font-size:.85rem">${r.item_description||''}</td>
            <td style="text-align:right">${r.qty||0}</td>
            <td style="font-size:.85rem">${r.unit||''}</td>
            <td style="font-size:.85rem">${r.batch_no||''}</td>
            <td style="font-size:.85rem">${exp||'—'}</td>
            <td style="text-align:right">${(parseFloat(r.weight_kg)||0).toFixed(2)}</td>
            <td><button class="btn" style="background:#FEE2E2;color:#991B1B;padding:.2rem .5rem;font-size:.8rem"
                onclick="dcRemoveLine(${i})">✕</button></td>
        </tr>`;
    }).join('');

    if (totEl) totEl.textContent = `${dcDispatchLines.length} lines | ${totalWeight.toFixed(2)} kg`;
}

// ── Remove single line ─────────────────────────────────────────────────────────
function dcRemoveLine(idx) {
    const removed = dcDispatchLines.splice(idx, 1)[0];
    if (removed && !dcDispatchLines.some(r=>r.parcel_number===removed.parcel_number)) {
        dcSelectedParcels.delete(removed.parcel_number);
        dcRenderParcelSummary();
        if (dcCurrentTab==='item') dcRenderItemTable();
        if (dcCurrentTab==='map')  dcRenderMap();
    }
    dcRenderLines();
}

// ── Clear all lines ────────────────────────────────────────────────────────────
function dcClearLines() {
    if (!dcDispatchLines.length) return;
    if (!confirm('Clear all dispatch lines?')) return;
    dcDispatchLines = [];
    dcSelectedParcels.clear();
    dcRenderParcelSummary();
    dcRenderLines();
    if (dcCurrentTab==='item') dcRenderItemTable();
    if (dcCurrentTab==='map')  dcRenderMap();
}

// ── Build header from form ─────────────────────────────────────────────────────
function dcGetHeader() {
    return {
        doc_type:       document.getElementById('dc-doc-type')?.value||'',
        movement_date:  document.getElementById('dc-date')?.value||'',
        source_project: document.getElementById('dc-source-project')?.value||'',
        end_user_id:    parseInt(document.getElementById('dc-end-user')?.value)||null,
        third_party_id: parseInt(document.getElementById('dc-third-party')?.value)||null,
        dest_project:   document.getElementById('dc-dest-project')?.value||null,
        notes:          document.getElementById('dc-notes')?.value.trim()||'',
    };
}

// ── Validate ───────────────────────────────────────────────────────────────────
function dcValidate() {
    if (!dcDispatchLines.length) { dcNotify('No parcels selected.', 'error'); return false; }
    const h = dcGetHeader();
    if (!h.doc_type)       { dcNotify('Select an OUT type.', 'error'); return false; }
    if (!h.movement_date)  { dcNotify('Select a date.', 'error'); return false; }
    if (!h.source_project) { dcNotify('Select a source project.', 'error'); return false; }
    const typeObj = dcOutTypes.find(t=>t.code===h.doc_type);
    if (typeObj?.required_party==='end_user'    && !h.end_user_id)    { dcNotify('End User is required for this type.', 'error'); return false; }
    if (typeObj?.required_party==='third_party' && !h.third_party_id) { dcNotify('Third Party is required for this type.', 'error'); return false; }
    return true;
}

// ── Export PL ─────────────────────────────────────────────────────────────────
async function dcExportPL() {
    if (!dcDispatchLines.length) { dcNotify('No parcels selected.', 'error'); return; }
    const h = dcGetHeader();
    try {
        dcNotify('Generating packing list...', 'info');
        const resp = await fetch('/api/dispatch/packing-list', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ lines: dcDispatchLines, header: h }),
        });
        if (!resp.ok) { dcNotify('Export failed.', 'error'); return; }
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `DispatchPL_${new Date().toISOString().slice(0,10)}.xlsx`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch(e) { dcNotify('Export error: '+e.message, 'error'); }
}

// ── Share PL ───────────────────────────────────────────────────────────────────
async function dcShare() {
    if (!dcDispatchLines.length) { dcNotify('No parcels selected.', 'error'); return; }
    await dcExportPL();
    const subject = 'Dispatch Packing List — MidFlow';
    const body    = 'Please find attached the Dispatch Packing List.\n\nGenerated by MidFlow.';
    setTimeout(() => {
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }, 900);
}

// ── Save draft OUT ──────────────────────────────────────────────────────────────
async function dcSaveDraft() {
    if (!dcValidate()) return;
    const h = dcGetHeader();
    const payload = {
        doc_type: h.doc_type, movement_date: h.movement_date,
        source_project: h.source_project, end_user_id: h.end_user_id,
        third_party_id: h.third_party_id, dest_project: h.dest_project,
        notes: h.notes,
        lines: dcDispatchLines.map(r => ({
            item_code: r.item_code, description: r.item_description,
            qty: r.qty, unit: r.unit, batch_no: r.batch_no, exp_date: r.exp_date,
            weight_kg: r.weight_kg, volume_m3: r.volume_m3||0, parcel_number: r.parcel_number,
        })),
    };
    try {
        const data = await fetch('/api/movements/out', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload),
        }).then(r=>r.json());
        if (!data.success) { dcNotify(data.message||'Save failed.', 'error'); return; }
        dcNotify('Draft saved — opening Movements OUT.', 'success');
        setTimeout(() => { if (typeof loadPage==='function') loadPage('movements-out'); }, 1200);
    } catch(e) { dcNotify('Error: '+e.message, 'error'); }
}

// ── Confirm Dispatch ────────────────────────────────────────────────────────────
async function dcConfirm() {
    if (!dcValidate()) return;
    if (!confirm('Confirm this dispatch? Stock will be reduced. Cannot be undone.')) return;
    const h = dcGetHeader();
    const payload = {
        doc_type: h.doc_type, movement_date: h.movement_date,
        source_project: h.source_project, end_user_id: h.end_user_id,
        third_party_id: h.third_party_id, dest_project: h.dest_project,
        notes: h.notes,
        lines: dcDispatchLines.map(r => ({
            item_code: r.item_code, description: r.item_description,
            qty: r.qty, unit: r.unit, batch_no: r.batch_no, exp_date: r.exp_date,
            weight_kg: r.weight_kg, volume_m3: r.volume_m3||0, parcel_number: r.parcel_number,
        })),
    };
    try {
        // Step 1: Save as draft
        const saveResp = await fetch('/api/movements/out', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload),
        }).then(r=>r.json());
        if (!saveResp.success) { dcNotify(saveResp.message||'Save failed.', 'error'); return; }

        // Step 2: Confirm the draft
        const confirmResp = await fetch(`/api/movements/out/${saveResp.id}/confirm`, {
            method:'POST',
        }).then(r=>r.json());
        if (!confirmResp.success) { dcNotify(confirmResp.message||'Confirm failed.', 'error'); return; }

        dcNotify(`✅ Dispatch confirmed! Document: ${confirmResp.document_number}`, 'success');
        window.open(`/api/movements/out/${saveResp.id}/export`, '_blank');
        setTimeout(() => { if (typeof loadPage==='function') loadPage('movements-out'); }, 1500);
    } catch(e) { dcNotify('Error: '+e.message, 'error'); }
}

// ── Re-init hook ───────────────────────────────────────────────────────────────
function initCargoFollowupPage() {
    dcDispatchLines = [];
    dcSelectedParcels.clear();
    dcItemRows        = [];
    dcMapParcels      = [];
    dcVisualRows      = [];
    dcParcelStatusMap = {};
    dcCurrentTab      = 'parcel';
    dcInit();
}

// ── Boot ───────────────────────────────────────────────────────────────────────
dcInit();

// ── Global exports ─────────────────────────────────────────────────────────────
window.initCargoFollowupPage = initCargoFollowupPage;
window.dcTab                 = dcTab;
window.dcHandleScan          = dcHandleScan;
window.dcAddParcelManual     = dcAddParcelManual;
window.dcHandleMapScan       = dcHandleMapScan;
window.dcRemoveParcel        = dcRemoveParcel;
window.dcLoadItems           = dcLoadItems;
window.dcSelectParcel        = dcSelectParcel;
window.dcFilterByProject     = dcFilterByProject;
window.dcClearItemFilters    = dcClearItemFilters;
window.dcLoadMap             = dcLoadMap;
window.dcRenderMap           = dcRenderMap;
window.dcMapToggleParcel     = dcMapToggleParcel;
window.dcRemoveLine          = dcRemoveLine;
window.dcClearLines          = dcClearLines;
window.dcExportPL            = dcExportPL;
window.dcShare               = dcShare;
window.dcSaveDraft           = dcSaveDraft;
window.dcConfirm             = dcConfirm;
