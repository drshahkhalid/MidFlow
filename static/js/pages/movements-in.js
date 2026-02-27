// movements-in.js — IN Movements page
console.log('✅ Movements IN loaded');

let miProjects    = [];
let miThirdParties = [];
let miEndUsers    = [];
let miInTypes     = [];
let miLineKey     = 0;
let miStockCache  = {};

const MI_CURRENCIES = ['USD','EUR','GBP','CHF','AED','AFN','DZD','CAD','SAR','TRY'];

// ── Notification helper ───────────────────────────────────────────────────
function miNotify(msg, type='info') {
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
async function miInit() {
    await Promise.all([miLoadMeta(), miLoadList()]);
    // Set today's date
    document.getElementById('mi-date').value = new Date().toISOString().slice(0,10);
}

async function miLoadMeta() {
    try {
        const [proj, tp, eu, types] = await Promise.all([
            fetch('/api/projects').then(r=>r.json()),
            fetch('/api/third-parties').then(r=>r.json()),
            fetch('/api/end-users').then(r=>r.json()),
            fetch('/api/movements/types?direction=IN').then(r=>r.json()),
        ]);
        miProjects     = proj.data          || [];
        miThirdParties = tp.third_parties  || [];
        miEndUsers     = eu.end_users      || [];
        miInTypes      = types.types       || [];

        // Populate project selects
        const projOpts = miProjects.filter(p=>p.is_active).map(p=>`<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`).join('');
        document.getElementById('mi-dest-project').innerHTML = '<option value="">— select project —</option>' + projOpts;

        // Populate type selects
        const typeOpts = miInTypes.map(t=>`<option value="${t.code}">${t.code} — ${t.label}</option>`).join('');
        document.getElementById('mi-doc-type').innerHTML = '<option value="">— select type —</option>' + typeOpts;
        document.getElementById('mi-filter-type').innerHTML = '<option value="">All Types</option>' + miInTypes.map(t=>`<option value="${t.code}">${t.code} — ${t.label}</option>`).join('');

        // Third parties
        const tpOpts = miThirdParties.map(tp=>`<option value="${tp.third_party_id}">${tp.name}</option>`).join('');
        document.getElementById('mi-third-party').innerHTML = '<option value="">— select —</option>' + tpOpts;

        // End users
        const euOpts = miEndUsers.map(eu=>`<option value="${eu.end_user_id}">${eu.name}</option>`).join('');
        document.getElementById('mi-end-user').innerHTML = '<option value="">— select —</option>' + euOpts;
    } catch(e) { miNotify('Failed to load metadata: ' + e.message, 'error'); }
}

// ── Type change → show/hide party fields ─────────────────────────────────
function miOnTypeChange() {
    const code     = document.getElementById('mi-doc-type').value;
    const typeObj  = miInTypes.find(t=>t.code===code);
    const party    = typeObj ? typeObj.required_party : null;
    document.getElementById('mi-tp-wrap').style.display = party==='third_party' ? '' : 'none';
    document.getElementById('mi-eu-wrap').style.display = party==='end_user'    ? '' : 'none';
}

// ── New draft / cancel ────────────────────────────────────────────────────
function miNewDraft() {
    document.getElementById('mi-editing-id').value = '';
    document.getElementById('mi-editor-title').textContent = 'New IN Movement';
    document.getElementById('mi-doc-type').value     = '';
    document.getElementById('mi-dest-project').value = '';
    document.getElementById('mi-third-party').value  = '';
    document.getElementById('mi-end-user').value     = '';
    document.getElementById('mi-notes').value        = '';
    document.getElementById('mi-date').value         = new Date().toISOString().slice(0,10);
    miOnTypeChange();
    miClearLines();
    document.getElementById('mi-editor').style.display = '';
    document.getElementById('mi-editor').scrollIntoView({behavior:'smooth'});
}

function miCancelDraft() {
    document.getElementById('mi-editor').style.display = 'none';
}

// ── Lines management ──────────────────────────────────────────────────────
function miClearLines() {
    miLineKey = 0;
    document.getElementById('mi-lines-body').innerHTML =
        '<tr id="mi-empty-row"><td colspan="12" style="text-align:center;color:#9CA3AF;padding:1rem">No lines yet — click "+ Add Line"</td></tr>';
}

function miAddLine(data={}) {
    const emptyRow = document.getElementById('mi-empty-row');
    if (emptyRow) emptyRow.remove();
    miLineKey++;
    const k = miLineKey;
    const currOpts = MI_CURRENCIES.map(c=>`<option value="${c}" ${(data.currency||'USD')===c?'selected':''}>${c}</option>`).join('');
    const tr = document.createElement('tr');
    tr.id = `mi-line-${k}`;
    tr.innerHTML = `
        <td style="text-align:center;color:#9CA3AF">${k}</td>
        <td><input type="text" class="form-input" style="min-width:110px" value="${data.item_code||''}" placeholder="Code" id="mi-lk-${k}-code"></td>
        <td><input type="text" class="form-input" style="min-width:200px" value="${data.item_description||''}" placeholder="Description" id="mi-lk-${k}-desc"></td>
        <td><input type="number" class="form-input" style="width:80px" value="${data.qty||''}" placeholder="0" min="0" step="any" id="mi-lk-${k}-qty" oninput="miCalcTotal(${k})"></td>
        <td><input type="text" class="form-input" style="width:70px" value="${data.unit||''}" placeholder="pcs" id="mi-lk-${k}-unit"></td>
        <td><input type="text" class="form-input" style="width:110px" value="${data.batch_no||''}" placeholder="Batch" id="mi-lk-${k}-batch"></td>
        <td style="white-space:nowrap">
          <input type="date" class="form-input" style="width:130px"
                 value="${data.exp_date && data.exp_date!=='N/A' ? data.exp_date : ''}"
                 id="mi-lk-${k}-exp" ${data.exp_date==='N/A'?'disabled':''}>
          <label style="font-size:.8rem;cursor:pointer;display:block;text-align:center;margin-top:2px">
            <input type="checkbox" id="mi-lk-${k}-na" onchange="miToggleNA(${k})"
                   ${data.exp_date==='N/A'?'checked':''}> N/A
          </label>
        </td>
        <td><input type="number" class="form-input" style="width:80px" value="${data.weight_kg||''}" placeholder="0" min="0" step="any" id="mi-lk-${k}-wt"></td>
        <td><input type="number" class="form-input" style="width:80px" value="${data.volume_m3||''}" placeholder="0" min="0" step="any" id="mi-lk-${k}-vol"></td>
        <td><input type="number" class="form-input" style="width:90px" value="${data.unit_price||''}" placeholder="0" min="0" step="any" id="mi-lk-${k}-price" oninput="miCalcTotal(${k})"></td>
        <td><select class="form-input" style="width:80px" id="mi-lk-${k}-curr">${currOpts}</select></td>
        <td><button class="btn" style="background:#EF4444;color:#fff;padding:.2rem .5rem;font-size:.8rem" onclick="miRemoveLine(${k})">✕</button></td>
    `;
    document.getElementById('mi-lines-body').appendChild(tr);
}

function miToggleNA(k) {
    const na  = document.getElementById(`mi-lk-${k}-na`).checked;
    const exp = document.getElementById(`mi-lk-${k}-exp`);
    exp.disabled = na;
    if (na) exp.value = '';
}

function miCalcTotal(k) {
    const qty   = parseFloat(document.getElementById(`mi-lk-${k}-qty`)?.value)   || 0;
    const price = parseFloat(document.getElementById(`mi-lk-${k}-price`)?.value) || 0;
    // total_value computed on save
}

function miRemoveLine(k) {
    const tr = document.getElementById(`mi-line-${k}`);
    if (tr) tr.remove();
    if (!document.getElementById('mi-lines-body').querySelector('tr:not(#mi-empty-row)')) {
        document.getElementById('mi-lines-body').innerHTML =
            '<tr id="mi-empty-row"><td colspan="12" style="text-align:center;color:#9CA3AF;padding:1rem">No lines yet — click "+ Add Line"</td></tr>';
    }
}

function miCollectLines() {
    const rows = document.querySelectorAll('#mi-lines-body tr[id^="mi-line-"]');
    return Array.from(rows).map(tr => {
        const k = tr.id.replace('mi-line-', '');
        return {
            item_code:        document.getElementById(`mi-lk-${k}-code`)?.value.trim()  || '',
            item_description: document.getElementById(`mi-lk-${k}-desc`)?.value.trim()  || '',
            qty:              parseFloat(document.getElementById(`mi-lk-${k}-qty`)?.value)    || 0,
            unit:             document.getElementById(`mi-lk-${k}-unit`)?.value.trim()  || '',
            batch_no:         document.getElementById(`mi-lk-${k}-batch`)?.value.trim() || '',
            exp_date:         document.getElementById(`mi-lk-${k}-na`)?.checked ? 'N/A' : (document.getElementById(`mi-lk-${k}-exp`)?.value || ''),
            weight_kg:        parseFloat(document.getElementById(`mi-lk-${k}-wt`)?.value)    || 0,
            volume_m3:        parseFloat(document.getElementById(`mi-lk-${k}-vol`)?.value)   || 0,
            unit_price:       parseFloat(document.getElementById(`mi-lk-${k}-price`)?.value) || 0,
            currency:         document.getElementById(`mi-lk-${k}-curr`)?.value          || 'USD',
        };
    });
}

function miCollectHeader() {
    return {
        id:             parseInt(document.getElementById('mi-editing-id').value) || null,
        doc_type:       document.getElementById('mi-doc-type').value,
        movement_date:  document.getElementById('mi-date').value,
        dest_project:   document.getElementById('mi-dest-project').value,
        third_party_id: document.getElementById('mi-third-party').value || null,
        end_user_id:    document.getElementById('mi-end-user').value    || null,
        notes:          document.getElementById('mi-notes').value.trim(),
    };
}

// ── Save Draft ────────────────────────────────────────────────────────────
async function miSaveDraft() {
    const payload = { ...miCollectHeader(), lines: miCollectLines() };
    if (!payload.doc_type) return miNotify('Please select an IN type.', 'error');
    if (!payload.movement_date) return miNotify('Please select a date.', 'error');
    const noExp = payload.lines.filter(l => !l.exp_date);
    if (noExp.length) return miNotify('Each line needs an expiry date or N/A checked.', 'error');
    try {
        const r = await fetch('/api/movements/in', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        }).then(r=>r.json());
        if (!r.success) return miNotify(r.message, 'error');
        document.getElementById('mi-editing-id').value = r.id;
        miNotify('Draft saved.', 'success');
        miLoadList();
    } catch(e) { miNotify('Save failed: '+e.message, 'error'); }
}

// ── Confirm movement ──────────────────────────────────────────────────────
async function miConfirmDraft() {
    // Auto-save first
    const payload = { ...miCollectHeader(), lines: miCollectLines() };
    if (!payload.doc_type)      return miNotify('Please select an IN type.', 'error');
    if (!payload.movement_date) return miNotify('Please select a date.', 'error');
    if (!payload.dest_project)  return miNotify('Please select a destination project.', 'error');
    if (miCollectLines().length === 0) return miNotify('Add at least one line.', 'error');
    const noExp = payload.lines.filter(l => !l.exp_date);
    if (noExp.length) return miNotify('Each line needs an expiry date or N/A checked.', 'error');

    if (!confirm('Confirm this IN movement? This will generate a document number and cannot be undone.')) return;
    try {
        const save = await fetch('/api/movements/in', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body:JSON.stringify(payload)
        }).then(r=>r.json());
        if (!save.success) return miNotify(save.message, 'error');

        const confirm_r = await fetch(`/api/movements/in/${save.id}/confirm`, {
            method:'POST'
        }).then(r=>r.json());
        if (!confirm_r.success) return miNotify(confirm_r.message, 'error');

        miNotify(`✅ Confirmed! Document: ${confirm_r.document_number}`, 'success');
        document.getElementById('mi-editor').style.display = 'none';
        miLoadList();
    } catch(e) { miNotify('Confirm failed: '+e.message, 'error'); }
}

// ── Load list ─────────────────────────────────────────────────────────────
async function miLoadList() {
    const statusFilter = document.getElementById('mi-filter-status')?.value || '';
    const typeFilter   = document.getElementById('mi-filter-type')?.value   || '';
    try {
        const data = await fetch('/api/movements/in').then(r=>r.json());
        if (!data.success) return;
        let rows = data.movements || [];
        if (statusFilter) rows = rows.filter(m=>m.status===statusFilter);
        if (typeFilter)   rows = rows.filter(m=>m.doc_type===typeFilter);

        const tbody = document.getElementById('mi-list-body');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:2rem">No IN movements found</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map(m => {
            const statusBadge = m.status==='Confirmed'
                ? '<span style="background:#D1FAE5;color:#065F46;padding:.2rem .6rem;border-radius:999px;font-size:.82rem">Confirmed</span>'
                : '<span style="background:#FEF3C7;color:#92400E;padding:.2rem .6rem;border-radius:999px;font-size:.82rem">Draft</span>';
            const party = m.end_user_name || m.third_party_name || '—';
            const certTypesMI = ['IDN','IBR','IROL'];
            const certBtnMI = (m.status==='Confirmed' && certTypesMI.includes(m.doc_type))
                ? `<button class="btn" style="background:#7C3AED;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="miShowCert(${m.id})">📜 Cert</button>`
                : '';
            const actions = m.status==='Confirmed'
                ? `<button class="btn" style="background:#1F3A8A;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="miExport(${m.id})">📥 PL</button>
                   <button class="btn" style="background:#374151;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="miShowDetail(${m.id})">👁 View</button>
                   ${certBtnMI}`
                : `<button class="btn btn-primary" style="padding:.2rem .6rem;font-size:.82rem" onclick="miEditDraft(${m.id})">✏️ Edit</button>
                   <button class="btn" style="background:#16a34a;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="miExport(${m.id})">📥 PL</button>
                   <button class="btn" style="background:#EF4444;color:#fff;padding:.2rem .6rem;font-size:.82rem" onclick="miDeleteDraft(${m.id})">🗑</button>`;
            const docCell = m.document_number
                ? `<a href="#" style="color:#1F3A8A;font-weight:600;text-decoration:none" onclick="miShowDetail(${m.id});return false">${m.document_number}</a>`
                : `<i style="color:#9CA3AF">Draft</i>`;
            return `<tr>
                <td>${docCell}</td>
                <td>${m.doc_type}</td>
                <td>${m.movement_date||''}</td>
                <td>${m.dest_project||''}</td>
                <td>${party}</td>
                <td style="text-align:center">${m.line_count||0}</td>
                <td style="text-align:right">${(m.total_weight_kg||0).toFixed(2)}</td>
                <td>${statusBadge}</td>
                <td>${actions}</td>
            </tr>`;
        }).join('');
    } catch(e) { miNotify('Failed to load list: '+e.message, 'error'); }
}

// ── Edit draft ────────────────────────────────────────────────────────────
async function miEditDraft(id) {
    try {
        const data = await fetch(`/api/movements/in/${id}`).then(r=>r.json());
        if (!data.success) return miNotify(data.message, 'error');
        const m = data.movement;
        document.getElementById('mi-editing-id').value    = m.id;
        document.getElementById('mi-doc-type').value      = m.doc_type;
        document.getElementById('mi-date').value          = m.movement_date;
        document.getElementById('mi-dest-project').value  = m.dest_project  || '';
        document.getElementById('mi-third-party').value   = m.third_party_id || '';
        document.getElementById('mi-end-user').value      = m.end_user_id   || '';
        document.getElementById('mi-notes').value         = m.notes         || '';
        miOnTypeChange();
        miClearLines();
        (data.lines || []).forEach(ln => miAddLine(ln));
        document.getElementById('mi-editor-title').textContent = `Edit Draft — ${m.doc_type}`;
        document.getElementById('mi-editor').style.display = '';
        document.getElementById('mi-editor').scrollIntoView({behavior:'smooth'});
    } catch(e) { miNotify('Load error: '+e.message, 'error'); }
}

// ── Delete draft ──────────────────────────────────────────────────────────
async function miDeleteDraft(id) {
    if (!confirm('Delete this draft IN movement?')) return;
    try {
        const r = await fetch(`/api/movements/in/${id}`, {method:'DELETE'}).then(r=>r.json());
        if (!r.success) return miNotify(r.message, 'error');
        miNotify('Draft deleted.', 'success');
        miLoadList();
    } catch(e) { miNotify('Delete error: '+e.message, 'error'); }
}

// ── Export packing list ───────────────────────────────────────────────────
function miExport(id) {
    window.open(`/api/movements/in/${id}/export`, '_blank');
}

function miExportCurrent() {
    const id = parseInt(document.getElementById('mi-editing-id').value);
    if (!id) return miNotify('Save the draft first to download a PL.', 'error');
    miExport(id);
}

function miShowCert(id) {
    showDocModal('📜 Certificate', `
        <div style="display:flex;flex-direction:column;gap:1rem;padding:.5rem">
            <p style="color:#374151;margin:0">Download or share the certificate for this movement.</p>
            <div style="display:flex;gap:.75rem;flex-wrap:wrap">
                <button class="btn" style="background:#1F3A8A;color:#fff;padding:.5rem 1.2rem"
                        onclick="window.open('/api/movements/in/${id}/certificate','_blank')">📥 Download Certificate</button>
                <button class="btn" style="background:#16a34a;color:#fff;padding:.5rem 1.2rem"
                        onclick="shareByEmail('/api/movements/in/${id}/certificate','Certificate — Movement ${id}','Please find attached the certificate.\\n\\nGenerated by MidFlow.');document.getElementById('doc-detail-overlay').remove()">📧 Share via Email</button>
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

// ── IN Movement detail popup ───────────────────────────────────────────────
async function miShowDetail(id) {
    try {
        const data = await fetch(`/api/movements/in/${id}`).then(r=>r.json());
        if (!data.success) return miNotify(data.message, 'error');
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
        showDocModal(`📥 IN Movement — ${m.document_number||'Draft'}`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem 2rem;margin-bottom:1rem;font-size:.9rem">
                <div><span style="color:#6B7280">Type:</span> <strong>${m.doc_type}</strong></div>
                <div><span style="color:#6B7280">Date:</span> ${m.movement_date||''}</div>
                <div><span style="color:#6B7280">Destination:</span> ${m.dest_project||'—'}</div>
                <div><span style="color:#6B7280">Status:</span> ${m.status||''}</div>
                <div><span style="color:#6B7280">Party:</span> ${m.end_user_name||m.third_party_name||'—'}</div>
                ${m.notes ? `<div><span style="color:#6B7280">Notes:</span> ${m.notes}</div>` : ''}
            </div>
            <table class="data-table" style="font-size:.88rem"><thead><tr>
                <th>#</th><th>Item Code</th><th>Description</th><th>Qty</th>
                <th>Batch</th><th>Exp Date</th><th style="text-align:right">Weight kg</th>
                <th style="text-align:right">Price</th><th>Notes</th>
            </tr></thead><tbody>${lines||'<tr><td colspan="9" style="text-align:center;color:#9CA3AF">No lines</td></tr>'}</tbody></table>`);
    } catch(e) { miNotify('Load error: ' + e.message, 'error'); }
}

// ── Re-init hook for navigation.js ────────────────────────────────────────
function initMovementsInPage() {
    miLineKey = 0;
    miInit();
}

// ── Boot ──────────────────────────────────────────────────────────────────
miInit();

// ── Global exports (required for onclick handlers in dynamically loaded HTML) ──
window.initMovementsInPage = initMovementsInPage;
window.miNewDraft          = miNewDraft;
window.miCancelDraft       = miCancelDraft;
window.miOnTypeChange      = miOnTypeChange;
window.miAddLine           = miAddLine;
window.miRemoveLine        = miRemoveLine;
window.miCalcTotal         = miCalcTotal;
window.miSaveDraft         = miSaveDraft;
window.miConfirmDraft      = miConfirmDraft;
window.miLoadList          = miLoadList;
window.miEditDraft         = miEditDraft;
window.miDeleteDraft       = miDeleteDraft;
window.miExport            = miExport;
window.miExportCurrent     = miExportCurrent;
window.miShowCert          = miShowCert;
window.shareByEmail        = shareByEmail;
window.miToggleNA          = miToggleNA;
window.miShowDetail        = miShowDetail;
window.showDocModal        = showDocModal;
