// expiry-report.js — Expiry Report page
console.log('✅ Expiry Report loaded');

let expProjects  = [];
let expRows      = [];   // current report rows
let expSelected  = new Set(); // keys of selected rows: "item_code|batch_no|exp_date|project_code"

// ── Translation helper ────────────────────────────────────────────────────
function t(key) {
    if (window.i18n && window.i18n.translations && window.i18n.translations[key])
        return window.i18n.translations[key];
    return key;
}

// ── Notification ──────────────────────────────────────────────────────────
function expNotify(msg, type='info') {
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
    setTimeout(() => { el.style.animation='slideOut .3s ease-out'; setTimeout(()=>el.remove(),300); }, 5000);
}

// ── Row key helper ────────────────────────────────────────────────────────
function expRowKey(r) {
    return `${r.item_code}|${r.batch_no||''}|${r.exp_date||''}|${r.project_code||''}`;
}

// ── Init ──────────────────────────────────────────────────────────────────
async function expInit() {
    try {
        const data = await fetch('/api/projects').then(r=>r.json());
        expProjects = (data.data || []).filter(p=>p.is_active);
        const el = document.getElementById('exp-project');
        if (el) {
            el.innerHTML = `<option value="">${t('all_projects')}</option>` +
                expProjects.map(p=>`<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`).join('');
        }
        expLoad();
    } catch(e) { expNotify('Init error: '+e.message, 'error'); }
}

// ── Load report ───────────────────────────────────────────────────────────
async function expLoad() {
    const project    = document.getElementById('exp-project')?.value    || '';
    const withinDays = document.getElementById('exp-within-days')?.value || '90';
    const params = new URLSearchParams({ within_days: withinDays });
    if (project) params.set('project', project);

    const tbody = document.getElementById('exp-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:2rem">⏳ ${t('loading')}...</td></tr>`;

    try {
        const data = await fetch('/api/reports/expiry?' + params).then(r=>r.json());
        if (!data.success) return expNotify(data.message, 'error');
        expRows = data.rows || [];
        expSelected.clear();
        const selAll = document.getElementById('exp-select-all');
        if (selAll) selAll.checked = false;
        expRenderSummary(expRows);
        expRenderTable(expRows);
        const info = document.getElementById('exp-info');
        if (info) info.textContent = `${expRows.length} ${t('exp_combinations_found')}`;
    } catch(e) { expNotify('Load error: '+e.message, 'error'); }
}

// ── Summary badges ────────────────────────────────────────────────────────
function expRenderSummary(rows) {
    const expired  = rows.filter(r=>r.status==='Expired').length;
    const critical = rows.filter(r=>r.status==='Critical').length;
    const warning  = rows.filter(r=>r.status==='Warning').length;
    const ok       = rows.filter(r=>r.status==='OK').length;
    const el = document.getElementById('exp-summary');
    if (!el) return;
    el.innerHTML = [
        expired  ? `<span style="background:#FEE2E2;color:#991B1B;padding:.4rem 1rem;border-radius:6px;font-weight:600">❌ ${t('exp_status_expired')}: ${expired}</span>` : '',
        critical ? `<span style="background:#FEE2E2;color:#B91C1C;padding:.4rem 1rem;border-radius:6px;font-weight:600">🔴 ${t('exp_badge_critical')}: ${critical}</span>` : '',
        warning  ? `<span style="background:#FEF3C7;color:#92400E;padding:.4rem 1rem;border-radius:6px;font-weight:600">🟡 ${t('exp_badge_warning')}: ${warning}</span>` : '',
        ok       ? `<span style="background:#D1FAE5;color:#065F46;padding:.4rem 1rem;border-radius:6px;font-weight:600">✅ ${t('exp_status_ok')}: ${ok}</span>` : '',
    ].join('');
}

// ── Render table ──────────────────────────────────────────────────────────
function expRenderTable(rows) {
    const tbody = document.getElementById('exp-body');
    if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#9CA3AF;padding:2rem">${t('exp_no_items')}</td></tr>`;
        return;
    }
    tbody.innerHTML = rows.map((r, idx) => {
        const days = r.days_left;
        const key  = expRowKey(r);
        let rowStyle = '';
        let daysStyle = 'font-weight:700;';
        let badge = '';
        if (r.status === 'Expired') {
            rowStyle  = 'background:#FEE2E2';
            daysStyle += 'color:#991B1B';
            badge = `<span style="background:#EF4444;color:#fff;padding:.15rem .4rem;border-radius:4px;font-size:.8rem">${t('exp_status_expired')}</span>`;
        } else if (r.status === 'Critical') {
            rowStyle  = 'background:#FFE4E4';
            daysStyle += 'color:#DC2626';
            badge = `<span style="background:#F87171;color:#fff;padding:.15rem .4rem;border-radius:4px;font-size:.8rem">${t('exp_status_critical')}</span>`;
        } else if (r.status === 'Warning') {
            rowStyle  = 'background:#FFFBEB';
            daysStyle += 'color:#D97706';
            badge = `<span style="background:#FCD34D;color:#78350F;padding:.15rem .4rem;border-radius:4px;font-size:.8rem">${t('exp_status_warning')}</span>`;
        } else {
            daysStyle += 'color:#065F46';
            badge = `<span style="background:#D1FAE5;color:#065F46;padding:.15rem .4rem;border-radius:4px;font-size:.8rem">${t('exp_status_ok')}</span>`;
        }
        const daysText = days < 0
            ? `${Math.abs(days)} ${t('exp_days_ago')}`
            : `${days}d`;
        const checked = expSelected.has(key) ? 'checked' : '';
        return `<tr style="${rowStyle}" data-key="${key}" data-idx="${idx}">
            <td style="text-align:center"><input type="checkbox" class="exp-row-cb" ${checked} onchange="expToggleRow('${key}',this)"></td>
            <td>${r.project_code||''}</td>
            <td><strong>${r.item_code||''}</strong></td>
            <td>${r.item_description||''}</td>
            <td>${r.batch_no||''}</td>
            <td>${r.exp_date||''}</td>
            <td style="text-align:right;${daysStyle}">${daysText}</td>
            <td style="text-align:right;font-weight:600">${(r.net_stock||0).toFixed(3)}</td>
            <td>${badge}</td>
        </tr>`;
    }).join('');
}

// ── Checkbox helpers ──────────────────────────────────────────────────────
function expToggleRow(key, cb) {
    if (cb.checked) expSelected.add(key);
    else expSelected.delete(key);
}

function expToggleAll(masterCb) {
    document.querySelectorAll('.exp-row-cb').forEach(cb => {
        cb.checked = masterCb.checked;
        const key = cb.closest('tr')?.dataset.key;
        if (key) {
            if (masterCb.checked) expSelected.add(key);
            else expSelected.delete(key);
        }
    });
}

// ── Remove from Stock (write-off) ─────────────────────────────────────────
function expRemoveFromStock() {
    if (expSelected.size === 0) {
        expNotify(t('exp_select_items'), 'error');
        return;
    }

    const selectedRows = expRows.filter(r => expSelected.has(expRowKey(r)));

    // All selected rows must share the same project
    const projects = [...new Set(selectedRows.map(r => r.project_code || ''))];
    if (projects.length > 1) {
        expNotify(t('exp_same_project'), 'error');
        return;
    }
    const project = projects[0] || '';

    // Populate project dropdown in modal
    const projEl = document.getElementById('exp-wo-project');
    if (projEl) {
        projEl.innerHTML = expProjects.map(p =>
            `<option value="${p.project_code}" ${p.project_code === project ? 'selected' : ''}>${p.project_code} — ${p.project_name}</option>`
        ).join('');
        if (!expProjects.find(p => p.project_code === project) && project) {
            projEl.innerHTML = `<option value="${project}" selected>${project}</option>` + projEl.innerHTML;
        }
    }

    // Set today's date
    const dateEl = document.getElementById('exp-wo-date');
    if (dateEl) dateEl.value = new Date().toISOString().slice(0,10);

    // Summary of selected items
    const summaryEl = document.getElementById('exp-writeoff-summary');
    if (summaryEl) {
        summaryEl.innerHTML = `<strong>${selectedRows.length}</strong> ${t('exp_combinations_found')} |
            ${t('exp_col_project')}: <strong>${project || '—'}</strong> |
            ${t('exp_col_stock')}: <strong>${selectedRows.reduce((s,r)=>s+(r.net_stock||0),0).toFixed(3)}</strong>`;
    }

    document.getElementById('exp-writeoff-modal').style.display = 'flex';
}

function expCloseWriteOffModal() {
    document.getElementById('exp-writeoff-modal').style.display = 'none';
}

async function expConfirmWriteOff() {
    const docType   = document.getElementById('exp-wo-type')?.value;
    const project   = document.getElementById('exp-wo-project')?.value;
    const date      = document.getElementById('exp-wo-date')?.value;
    const notes     = document.getElementById('exp-wo-notes')?.value?.trim() || '';

    if (!docType || !project || !date) {
        expNotify(t('required_fields_missing') || 'Please fill all required fields', 'error');
        return;
    }

    const selectedRows = expRows.filter(r => expSelected.has(expRowKey(r)));
    if (!selectedRows.length) { expNotify(t('exp_select_items'), 'error'); return; }

    const lines = selectedRows.map((r, i) => ({
        line_no:          i + 1,
        item_code:        r.item_code,
        item_description: r.item_description || '',
        qty:              r.net_stock || 0,
        unit:             r.unit || '',
        batch_no:         r.batch_no || '',
        exp_date:         r.exp_date || '',
        unit_price:       0,
        currency:         'USD',
        total_value:      0,
        weight_kg:        0,
        volume_m3:        0,
        parcel_number:    null,
    }));

    const btn = document.getElementById('exp-wo-confirm-btn');
    const orig = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = '⏳ ...';

    try {
        // Step 1: create draft OUT movement
        const saveResp = await fetch('/api/movements/out', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doc_type:       docType,
                movement_date:  date,
                source_project: project,
                notes:          notes || `Expiry write-off — ${new Date().toISOString().slice(0,10)}`,
                lines,
            }),
        }).then(r=>r.json());

        if (!saveResp.success) throw new Error(saveResp.message || 'Save failed');
        const movId = saveResp.id;

        // Step 2: confirm the movement
        const confResp = await fetch(`/api/movements/out/${movId}/confirm`, {
            method: 'POST',
        }).then(r=>r.json());

        if (!confResp.success) throw new Error(confResp.message || 'Confirm failed');

        expNotify(`${t('exp_remove_success')} — ${confResp.document_number}`, 'success');
        expCloseWriteOffModal();
        expSelected.clear();
        expLoad();
    } catch(e) {
        expNotify(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = orig;
    }
}

// ── Export ────────────────────────────────────────────────────────────────
function expExport() {
    const project    = document.getElementById('exp-project')?.value    || '';
    const withinDays = document.getElementById('exp-within-days')?.value || '90';
    const params = new URLSearchParams({ within_days: withinDays });
    if (project) params.set('project', project);
    window.open('/api/reports/expiry/export?' + params, '_blank');
}

// ── Keyboard / overlay close ──────────────────────────────────────────────
document.addEventListener('keydown', e => { if (e.key === 'Escape') expCloseWriteOffModal(); });
document.addEventListener('click', e => { if (e.target.id === 'exp-writeoff-modal') expCloseWriteOffModal(); });

// ── Re-init hook ──────────────────────────────────────────────────────────
function initExpiryReportPage() { expInit(); }

// ── Boot ──────────────────────────────────────────────────────────────────
expInit();

// ── Global exports ────────────────────────────────────────────────────────
window.initExpiryReportPage  = initExpiryReportPage;
window.expLoad               = expLoad;
window.expExport             = expExport;
window.expToggleAll          = expToggleAll;
window.expToggleRow          = expToggleRow;
window.expRemoveFromStock    = expRemoveFromStock;
window.expCloseWriteOffModal = expCloseWriteOffModal;
window.expConfirmWriteOff    = expConfirmWriteOff;
