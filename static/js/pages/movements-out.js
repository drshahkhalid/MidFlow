// movements-out.js — OUT Movements page
console.log('✅ Movements OUT loaded');

let moProjects     = [];
let moThirdParties = [];
let moEndUsers     = [];
let moOutTypes     = [];
let moLineKey      = 0;
let moStockRows    = [];   // full stock for current project

const MO_CURRENCIES = ['USD','EUR','GBP','CHF','AED','AFN','DZD','CAD','SAR','TRY'];

// ── Notification ──────────────────────────────────────────────────────────
function moNotify(msg, type='info') {
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

// ── Init ──────────────────────────────────────────────────────────────────
async function moInit() {
    await Promise.all([moLoadMeta(), moLoadList()]);
    document.getElementById('mo-date').value = new Date().toISOString().slice(0,10);
}

async function moLoadMeta() {
    try {
        const [proj, tp, eu, types] = await Promise.all([
            fetch('/api/projects').then(r=>r.json()),
            fetch('/api/third-parties').then(r=>r.json()),
            fetch('/api/end-users').then(r=>r.json()),
            fetch('/api/movements/types?direction=OUT').then(r=>r.json()),
        ]);
        moProjects     = proj.data        || [];
        moThirdParties = tp.third_parties || [];
        moEndUsers     = eu.end_users     || [];
        moOutTypes     = types.types      || [];

        const activeProj = moProjects.filter(p=>p.is_active);
        const projOpts   = activeProj.map(p=>`<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`).join('');
        ['mo-source-project','mo-dest-project'].forEach(id => {
            document.getElementById(id).innerHTML = '<option value="">— select project —</option>' + projOpts;
        });

        const typeOpts = moOutTypes.map(t=>`<option value="${t.code}">${t.code} — ${t.label}</option>`).join('');
        document.getElementById('mo-doc-type').innerHTML = '<option value="">— select type —</option>' + typeOpts;
        document.getElementById('mo-filter-type').innerHTML = '<option value="">All Types</option>' + typeOpts;

        const tpOpts = moThirdParties.map(tp=>`<option value="${tp.third_party_id}">${tp.name}</option>`).join('');
        document.getElementById('mo-third-party').innerHTML = '<option value="">— select —</option>' + tpOpts;

        const euOpts = moEndUsers.map(eu=>`<option value="${eu.end_user_id}">${eu.name}</option>`).join('');
        document.getElementById('mo-end-user').innerHTML = '<option value="">— select —</option>' + euOpts;
    } catch(e) { moNotify('Meta load error: '+e.message, 'error'); }
}

// ── Type change → show/hide destination fields ────────────────────────────
function moOnTypeChange() {
    const code    = document.getElementById('mo-doc-type').value;
    const typeObj = moOutTypes.find(t=>t.code===code);
    const party   = typeObj ? typeObj.required_party : null;
    // Destination project shown when a type is selected
    document.getElementById('mo-dest-project-wrap').style.display = code ? '' : 'none';
    // Both End User and Third Party are always visible; only the required one gets asterisk
    document.getElementById('mo-eu-req').style.display = party==='end_user'    ? '' : 'none';
    document.getElementById('mo-tp-req').style.display = party==='third_party' ? '' : 'none';
}

// ── Load available stock for source project ───────────────────────────────
async function moLoadStock() {
    const project = document.getElementById('mo-source-project').value;
    if (!project) {
        document.getElementById('mo-stock-section').style.display = 'none';
        return;
    }
    try {
        const data = await fetch(`/api/movements/stock?project=${encodeURIComponent(project)}`).then(r=>r.json());
        if (!data.success) return moNotify(data.message, 'error');
        moStockRows = data.stock || [];
        moRenderStockTable(moStockRows);
        document.getElementById('mo-stock-section').style.display = '';
    } catch(e) { moNotify('Stock load error: '+e.message, 'error'); }
}

function moRenderStockTable(rows) {
    const tbody = document.getElementById('mo-stock-body');
    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#9CA3AF;padding:1rem">No stock available for this project</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map((r,i) => `
        <tr style="cursor:pointer" onclick="moAddLineFromStock(${i})"
            onmouseover="this.style.background='#EEF2FF'" onmouseout="this.style.background=''">
            <td>${r.item_code||''}</td>
            <td>${r.item_description||''}</td>
            <td>${r.batch_no||''}</td>
            <td>${moExpStyle(r.exp_date)}</td>
            <td style="text-align:right;font-weight:600">${(r.available_qty||0).toFixed(3)}</td>
        </tr>
    `).join('');
}

function moExpStyle(exp) {
    if (!exp) return '<span style="color:#9CA3AF">—</span>';
    const days = Math.floor((new Date(exp) - new Date()) / 86400000);
    const color = days < 30 ? '#EF4444' : days < 90 ? '#F59E0B' : '#065F46';
    return `<span style="color:${color};font-weight:600">${exp}</span>`;
}

function moFilterStock() {
    const q = document.getElementById('mo-stock-search').value.toLowerCase();
    const filtered = q ? moStockRows.filter(r=>
        (r.item_code||'').toLowerCase().includes(q) ||
        (r.item_description||'').toLowerCase().includes(q)
    ) : moStockRows;
    moRenderStockTable(filtered);
}

function moAddLineFromStock(idx) {
    const r = moStockRows[idx];
    if (!r) return;
    moAddLine({
        item_code:        r.item_code,
        item_description: r.item_description,
        batch_no:         r.batch_no,
        exp_date:         r.exp_date,
        available_qty:    r.available_qty,
    });
}

// ── New draft / cancel ────────────────────────────────────────────────────
function moNewDraft() {
    document.getElementById('mo-editing-id').value = '';
    document.getElementById('mo-editor-title').textContent = 'New OUT Movement';
    document.getElementById('mo-doc-type').value       = '';
    document.getElementById('mo-source-project').value = '';
    document.getElementById('mo-dest-project').value   = '';
    document.getElementById('mo-third-party').value    = '';
    document.getElementById('mo-end-user').value       = '';
    document.getElementById('mo-notes').value          = '';
    document.getElementById('mo-date').value           = new Date().toISOString().slice(0,10);
    moOnTypeChange();
    moClearLines();
    document.getElementById('mo-stock-section').style.display = 'none';
    document.getElementById('mo-editor').style.display = '';
    document.getElementById('mo-editor').scrollIntoView({behavior:'smooth'});
}

function moCancelDraft() {
    document.getElementById('mo-editor').style.display = 'none';
}

// ── Lines management ──────────────────────────────────────────────────────
function moClearLines() {
    moLineKey = 0;
    document.getElementById('mo-lines-body').innerHTML =
        '<tr id="mo-empty-row"><td colspan="13" style="text-align:center;color:#9CA3AF;padding:1rem">No lines yet — select items from stock above</td></tr>';
}

function moAddLine(data={}) {
    const emptyRow = document.getElementById('mo-empty-row');
    if (emptyRow) emptyRow.remove();
    moLineKey++;
    const k = moLineKey;
    const availQty = data.available_qty != null ? parseFloat(data.available_qty) : null;
    const availDisp = availQty != null ? availQty.toFixed(3) : '—';
    const currOpts = MO_CURRENCIES.map(c=>`<option value="${c}" ${(data.currency||'USD')===c?'selected':''}>${c}</option>`).join('');
    const tr = document.createElement('tr');
    tr.id = `mo-line-${k}`;
    tr.dataset.availQty = availQty != null ? availQty : '';
    tr.innerHTML = `
        <td style="text-align:center;color:#9CA3AF">${k}</td>
        <td><input type="text" class="form-input" style="min-width:110px" value="${data.item_code||''}" placeholder="Code" id="mo-lk-${k}-code"></td>
        <td><input type="text" class="form-input" style="min-width:180px" value="${data.item_description||''}" placeholder="Description" id="mo-lk-${k}-desc"></td>
        <td><input type="text" class="form-input" style="width:110px" value="${data.batch_no||''}" placeholder="Batch" id="mo-lk-${k}-batch"></td>
        <td><input type="date" class="form-input" style="width:135px" value="${data.exp_date||''}" id="mo-lk-${k}-exp"></td>
        <td style="text-align:center;color:#065F46;font-weight:600" id="mo-lk-${k}-avail">${availDisp}</td>
        <td><input type="number" class="form-input" style="width:85px" value="${data.qty||''}" placeholder="0" min="0" step="any"
                   id="mo-lk-${k}-qty" oninput="moCheckQty(${k},${availQty != null ? availQty : 'null'})"></td>
        <td><input type="text" class="form-input" style="width:65px" value="${data.unit||''}" placeholder="pcs" id="mo-lk-${k}-unit"></td>
        <td><input type="number" class="form-input" style="width:80px" value="${data.weight_kg||''}" placeholder="0" min="0" step="any" id="mo-lk-${k}-wt"></td>
        <td><input type="number" class="form-input" style="width:80px" value="${data.volume_m3||''}" placeholder="0" min="0" step="any" id="mo-lk-${k}-vol"></td>
        <td><input type="number" class="form-input" style="width:85px" value="${data.unit_price||''}" placeholder="0" min="0" step="any" id="mo-lk-${k}-price"></td>
        <td><select class="form-input" style="width:75px" id="mo-lk-${k}-curr">${currOpts}</select></td>
        <td><button class="btn" style="background:#EF4444;color:#fff;padding:.2rem .5rem;font-size:.8rem" onclick="moRemoveLine(${k})">✕</button></td>
    `;
    document.getElementById('mo-lines-body').appendChild(tr);
}

function moAddEmptyLine() {
    const project = document.getElementById('mo-source-project').value;
    if (!project) return moNotify('Select a source project first.', 'error');
    moAddLine({});
}

function moCheckQty(k, availQty) {
    const qtyInput = document.getElementById(`mo-lk-${k}-qty`);
    const qty = parseFloat(qtyInput?.value) || 0;
    if (availQty !== null && qty > availQty) {
        qtyInput.style.borderColor = '#EF4444';
        qtyInput.title = `Max available: ${availQty}`;
    } else {
        qtyInput.style.borderColor = '';
        qtyInput.title = '';
    }
}

function moRemoveLine(k) {
    const tr = document.getElementById(`mo-line-${k}`);
    if (tr) tr.remove();
    if (!document.getElementById('mo-lines-body').querySelector('tr:not(#mo-empty-row)')) {
        document.getElementById('mo-lines-body').innerHTML =
            '<tr id="mo-empty-row"><td colspan="13" style="text-align:center;color:#9CA3AF;padding:1rem">No lines yet</td></tr>';
    }
}

function moCollectLines() {
    const rows = document.querySelectorAll('#mo-lines-body tr[id^="mo-line-"]');
    return Array.from(rows).map(tr => {
        const k = tr.id.replace('mo-line-', '');
        return {
            item_code:        document.getElementById(`mo-lk-${k}-code`)?.value.trim()  || '',
            item_description: document.getElementById(`mo-lk-${k}-desc`)?.value.trim()  || '',
            batch_no:         document.getElementById(`mo-lk-${k}-batch`)?.value.trim() || '',
            exp_date:         document.getElementById(`mo-lk-${k}-exp`)?.value           || '',
            qty:              parseFloat(document.getElementById(`mo-lk-${k}-qty`)?.value)    || 0,
            unit:             document.getElementById(`mo-lk-${k}-unit`)?.value.trim()  || '',
            weight_kg:        parseFloat(document.getElementById(`mo-lk-${k}-wt`)?.value)    || 0,
            volume_m3:        parseFloat(document.getElementById(`mo-lk-${k}-vol`)?.value)   || 0,
            unit_price:       parseFloat(document.getElementById(`mo-lk-${k}-price`)?.value) || 0,
            currency:         document.getElementById(`mo-lk-${k}-curr`)?.value          || 'USD',
        };
    });
}

function moCollectHeader() {
    return {
        id:             parseInt(document.getElementById('mo-editing-id').value) || null,
        doc_type:       document.getElementById('mo-doc-type').value,
        movement_date:  document.getElementById('mo-date').value,
        source_project: document.getElementById('mo-source-project').value,
        dest_project:   document.getElementById('mo-dest-project').value   || null,
        third_party_id: document.getElementById('mo-third-party').value    || null,
        end_user_id:    document.getElementById('mo-end-user').value        || null,
        notes:          document.getElementById('mo-notes').value.trim(),
    };
}

// ── Save Draft ────────────────────────────────────────────────────────────
async function moSaveDraft() {
    const payload = { ...moCollectHeader(), lines: moCollectLines() };
    if (!payload.doc_type)       return moNotify('Please select an OUT type.', 'error');
    if (!payload.movement_date)  return moNotify('Please select a date.', 'error');
    if (!payload.source_project) return moNotify('Please select a source project.', 'error');
    try {
        const r = await fetch('/api/movements/out', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        }).then(r=>r.json());
        if (!r.success) return moNotify(r.message, 'error');
        document.getElementById('mo-editing-id').value = r.id;
        moNotify('Draft saved.', 'success');
        moLoadList();
    } catch(e) { moNotify('Save failed: '+e.message, 'error'); }
}

// ── Confirm ───────────────────────────────────────────────────────────────
async function moConfirmDraft() {
    const payload = { ...moCollectHeader(), lines: moCollectLines() };
    if (!payload.doc_type)       return moNotify('Please select an OUT type.', 'error');
    if (!payload.movement_date)  return moNotify('Please select a date.', 'error');
    if (!payload.source_project) return moNotify('Please select a source project.', 'error');
    if (moCollectLines().length === 0) return moNotify('Add at least one line.', 'error');
    if (!confirm('Confirm this OUT movement? Stock will be reduced. Cannot be undone.')) return;
    try {
        const save = await fetch('/api/movements/out', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        }).then(r=>r.json());
        if (!save.success) return moNotify(save.message, 'error');

        const confirm_r = await fetch(`/api/movements/out/${save.id}/confirm`, {
            method:'POST'
        }).then(r=>r.json());
        if (!confirm_r.success) return moNotify(confirm_r.message, 'error');

        moNotify(`✅ Confirmed! Document: ${confirm_r.document_number}`, 'success');
        document.getElementById('mo-editor').style.display = 'none';
        moLoadList();
    } catch(e) { moNotify('Confirm failed: '+e.message, 'error'); }
}

// ── Load list ─────────────────────────────────────────────────────────────
async function moLoadList() {
    const statusFilter = document.getElementById('mo-filter-status')?.value || '';
    const typeFilter   = document.getElementById('mo-filter-type')?.value   || '';
    try {
        const data = await fetch('/api/movements/out').then(r=>r.json());
        if (!data.success) return;
        let rows = data.movements || [];
        if (statusFilter) rows = rows.filter(m=>m.status===statusFilter);
        if (typeFilter)   rows = rows.filter(m=>m.doc_type===typeFilter);

        const tbody = document.getElementById('mo-list-body');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:2rem">No OUT movements found</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(m => {
            const statusBadge = m.status==='Confirmed'
                ? '<span style="background:#D1FAE5;color:#065F46;padding:.2rem .6rem;border-radius:999px;font-size:.82rem">Confirmed</span>'
                : '<span style="background:#FEF3C7;color:#92400E;padding:.2rem .6rem;border-radius:999px;font-size:.82rem">Draft</span>';
            const dest = m.end_user_name || m.third_party_name || m.dest_project || '—';
            const certTypesMO = ['ODN','OLOAN','OROB'];
            const certBtnMO = (m.status==='Confirmed' && certTypesMO.includes(m.doc_type))
                ? `<button class="btn" style="background:#7C3AED;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="moShowCert(${m.id})">📜 Cert</button>`
                : '';
            const actions = m.status==='Confirmed'
                ? `<button class="btn" style="background:#1F3A8A;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="moExport(${m.id})">📥 PL</button>
                   <button class="btn" style="background:#374151;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="moShowDetail(${m.id})">👁 View</button>
                   ${certBtnMO}`
                : `<button class="btn btn-primary" style="padding:.2rem .6rem;font-size:.82rem" onclick="moEditDraft(${m.id})">✏️ Edit</button>
                   <button class="btn" style="background:#16a34a;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="moExport(${m.id})">📥 PL</button>
                   <button class="btn" style="background:#EF4444;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="moDeleteDraft(${m.id})">🗑</button>`;
            const docCell = m.document_number
                ? `<a href="#" style="color:#1F3A8A;font-weight:600;text-decoration:none" onclick="moShowDetail(${m.id});return false">${m.document_number}</a>`
                : `<i style="color:#9CA3AF">Draft</i>`;
            return `<tr>
                <td>${docCell}</td>
                <td>${m.doc_type}</td>
                <td>${m.movement_date||''}</td>
                <td>${m.source_project||''}</td>
                <td>${dest}</td>
                <td style="text-align:center">${m.line_count||0}</td>
                <td style="text-align:right">${(m.total_weight_kg||0).toFixed(2)}</td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    } catch(e) { moNotify('Load error: '+e.message, 'error'); }
}

async function moEditDraft(id) {
    try {
        const data = await fetch(`/api/movements/out/${id}`).then(r=>r.json());
        if (!data.success) return moNotify(data.message, 'error');
        const m = data.movement;
        document.getElementById('mo-editing-id').value     = m.id;
        document.getElementById('mo-doc-type').value       = m.doc_type;
        document.getElementById('mo-date').value           = m.movement_date;
        document.getElementById('mo-source-project').value = m.source_project || '';
        document.getElementById('mo-dest-project').value   = m.dest_project   || '';
        document.getElementById('mo-third-party').value    = m.third_party_id || '';
        document.getElementById('mo-end-user').value       = m.end_user_id    || '';
        document.getElementById('mo-notes').value          = m.notes          || '';
        moOnTypeChange();
        moClearLines();
        (data.lines || []).forEach(ln => moAddLine(ln));
        document.getElementById('mo-editor-title').textContent = `Edit Draft — ${m.doc_type}`;
        document.getElementById('mo-editor').style.display = '';
        document.getElementById('mo-editor').scrollIntoView({behavior:'smooth'});
        moLoadStock();   // fire-and-forget after editor is visible
    } catch(e) { moNotify('Load error: '+e.message, 'error'); }
}

async function moDeleteDraft(id) {
    if (!confirm('Delete this draft OUT movement?')) return;
    try {
        const r = await fetch(`/api/movements/out/${id}`, {method:'DELETE'}).then(r=>r.json());
        if (!r.success) return moNotify(r.message, 'error');
        moNotify('Draft deleted.', 'success');
        moLoadList();
    } catch(e) { moNotify('Delete error: '+e.message, 'error'); }
}

function moExport(id) {
    window.open(`/api/movements/out/${id}/export`, '_blank');
}

function moExportCurrent() {
    const id = parseInt(document.getElementById('mo-editing-id').value);
    if (!id) return moNotify('Save the draft first to download a PL.', 'error');
    moExport(id);
}

function moShowCert(id) {
    showDocModal('📜 Certificate', `
        <div style="display:flex;flex-direction:column;gap:1rem;padding:.5rem">
            <p style="color:#374151;margin:0">Download or share the certificate for this movement.</p>
            <div style="display:flex;gap:.75rem;flex-wrap:wrap">
                <button class="btn" style="background:#1F3A8A;color:#fff;padding:.5rem 1.2rem"
                        onclick="window.open('/api/movements/out/${id}/certificate','_blank')">📥 Download Certificate</button>
                <button class="btn" style="background:#16a34a;color:#fff;padding:.5rem 1.2rem"
                        onclick="shareByEmail('/api/movements/out/${id}/certificate','Certificate — Movement ${id}','Please find attached the certificate.\\n\\nGenerated by MidFlow.');document.getElementById('doc-detail-overlay').remove()">📧 Share via Email</button>
            </div>
        </div>`);
}

// ── Share by email helper (download + open local mail client) ─────────────
function shareByEmail(downloadUrl, subject, body) {
    const a = document.createElement('a');
    a.href = downloadUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => {
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }, 800);
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

// ── OUT Movement detail popup ──────────────────────────────────────────────
async function moShowDetail(id) {
    try {
        const data = await fetch(`/api/movements/out/${id}`).then(r=>r.json());
        if (!data.success) return moNotify(data.message, 'error');
        const m = data.movement;
        const lines = (data.lines || []).map((l, i) => `
            <tr style="background:${i%2?'#F9FAFB':''}">
                <td>${i+1}</td>
                <td><strong>${l.item_code||''}</strong></td>
                <td>${l.item_description||''}</td>
                <td>${l.qty||0} ${l.unit||''}</td>
                <td>${l.batch_no||''}</td>
                <td>${l.exp_date||''}</td>
                <td style="text-align:right">${(l.weight_kg||0).toFixed(2)}</td>
                <td style="text-align:right">${l.unit_price||0} ${l.currency||''}</td>
                <td>${l.notes||''}</td>
            </tr>`).join('');
        const dest = m.end_user_name || m.third_party_name || m.dest_project || '—';
        showDocModal(`📤 OUT Movement — ${m.document_number||'Draft'}`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem 2rem;margin-bottom:1rem;font-size:.9rem">
                <div><span style="color:#6B7280">Type:</span> <strong>${m.doc_type}</strong></div>
                <div><span style="color:#6B7280">Date:</span> ${m.movement_date||''}</div>
                <div><span style="color:#6B7280">Source:</span> ${m.source_project||'—'}</div>
                <div><span style="color:#6B7280">Status:</span> ${m.status||''}</div>
                <div><span style="color:#6B7280">Destination:</span> ${dest}</div>
                ${m.notes ? `<div><span style="color:#6B7280">Notes:</span> ${m.notes}</div>` : ''}
            </div>
            <table class="data-table" style="font-size:.88rem"><thead><tr>
                <th>#</th><th>Item Code</th><th>Description</th><th>Qty</th>
                <th>Batch</th><th>Exp Date</th><th style="text-align:right">Weight kg</th>
                <th style="text-align:right">Price</th><th>Notes</th>
            </tr></thead><tbody>${lines||'<tr><td colspan="9" style="text-align:center;color:#9CA3AF">No lines</td></tr>'}</tbody></table>`);
    } catch(e) { moNotify('Load error: ' + e.message, 'error'); }
}

// ── Re-init hook for navigation.js ────────────────────────────────────────
function initMovementsOutPage() {
    moLineKey = 0;
    moStockRows = [];
    moInit();
}

// ── Boot ──────────────────────────────────────────────────────────────────
moInit();

// ── Global exports (required for onclick handlers in dynamically loaded HTML) ──
window.initMovementsOutPage = initMovementsOutPage;
window.moNewDraft           = moNewDraft;
window.moCancelDraft        = moCancelDraft;
window.moOnTypeChange       = moOnTypeChange;
window.moLoadStock          = moLoadStock;
window.moFilterStock        = moFilterStock;
window.moAddLineFromStock   = moAddLineFromStock;
window.moAddEmptyLine       = moAddEmptyLine;
window.moCheckQty           = moCheckQty;
window.moRemoveLine         = moRemoveLine;
window.moSaveDraft          = moSaveDraft;
window.moConfirmDraft       = moConfirmDraft;
window.moLoadList           = moLoadList;
window.moEditDraft          = moEditDraft;
window.moDeleteDraft        = moDeleteDraft;
window.moExport             = moExport;
window.moExportCurrent      = moExportCurrent;
window.moShowCert           = moShowCert;
window.shareByEmail         = shareByEmail;
window.moShowDetail         = moShowDetail;
window.showDocModal         = showDocModal;
