// reports.js — Reports page
console.log('✅ Reports loaded');

let rptProjects = [];
let rptInTypes  = [];
let rptOutTypes = [];

// ── Notification ──────────────────────────────────────────────────────────
function rptNotify(msg, type='info') {
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
function rptTab(tab) {
    ['summary','card','transactions'].forEach(t => {
        document.getElementById(`rpt-panel-${t}`).style.display = t===tab ? '' : 'none';
        const btn = document.getElementById(`rpt-tab-${t}`);
        if (btn) btn.classList.toggle('rpt-tab-active', t===tab);
    });
}

// ── Init ──────────────────────────────────────────────────────────────────
async function rptInit() {
    try {
        const [proj, types] = await Promise.all([
            fetch('/api/projects').then(r=>r.json()),
            fetch('/api/movements/types').then(r=>r.json()),
        ]);
        rptProjects = proj.projects || [];
        rptInTypes  = types.in_types  || [];
        rptOutTypes = types.out_types || [];
        const allTypes = [...rptInTypes, ...rptOutTypes];

        const projOpts = '<option value="">All Projects</option>' +
            rptProjects.filter(p=>p.is_active).map(p=>
                `<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`
            ).join('');
        ['rpt-ss-project','rpt-sc-project','rpt-tx-project'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = projOpts;
        });

        const txTypeOpts = '<option value="">All Types</option>' +
            allTypes.map(t=>`<option value="${t.code}">${t.code} — ${t.label}</option>`).join('');
        const el = document.getElementById('rpt-tx-type');
        if (el) el.innerHTML = txTypeOpts;
    } catch(e) { rptNotify('Init error: '+e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════════════════════
//  STOCK SUMMARY
// ════════════════════════════════════════════════════════════════════════════

async function rptLoadSummary() {
    const project = document.getElementById('rpt-ss-project').value;
    const item    = document.getElementById('rpt-ss-item').value.trim();
    const params  = new URLSearchParams();
    if (project) params.set('project', project);
    if (item)    params.set('item', item);

    try {
        const data = await fetch('/api/reports/stock-summary?' + params).then(r=>r.json());
        if (!data.success) return rptNotify(data.message, 'error');
        const rows = data.rows || [];
        const tbody = document.getElementById('rpt-ss-body');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#9CA3AF;padding:2rem">No stock data found</td></tr>';
            document.getElementById('rpt-ss-footer').textContent = '';
            return;
        }
        tbody.innerHTML = rows.map((r,i) => {
            const stock = r.net_stock || 0;
            const expStyle = rptExpColor(r.exp_date);
            let stockColor = '#374151';
            if (stock <= 0) stockColor = '#EF4444';
            else if (stock < 10) stockColor = '#F59E0B';
            const altBg = i%2===0 ? '' : 'background:#F9FAFB';
            return `<tr style="${altBg}">
                <td>${r.project_code||''}</td>
                <td>${r.item_code||''}</td>
                <td>${r.item_description||''}</td>
                <td>${r.batch_no||''}</td>
                <td>${expStyle}</td>
                <td style="text-align:right">${(r.total_in||0).toFixed(3)}</td>
                <td style="text-align:right">${(r.total_out||0).toFixed(3)}</td>
                <td style="text-align:right;font-weight:700;color:${stockColor}">${stock.toFixed(3)}</td>
            </tr>`;
        }).join('');
        const totalRows = rows.length;
        const totalStock = rows.reduce((s,r)=>(r.net_stock||0)+s, 0);
        document.getElementById('rpt-ss-footer').textContent =
            `${totalRows} item-batch combinations | Total net stock across view: ${totalStock.toFixed(3)}`;
    } catch(e) { rptNotify('Load error: '+e.message, 'error'); }
}

function rptExportSummary() {
    const project = document.getElementById('rpt-ss-project').value;
    const item    = document.getElementById('rpt-ss-item').value.trim();
    const params  = new URLSearchParams();
    if (project) params.set('project', project);
    if (item)    params.set('item', item);
    window.open('/api/reports/stock-summary/export?' + params, '_blank');
}

// ════════════════════════════════════════════════════════════════════════════
//  STOCK CARD
// ════════════════════════════════════════════════════════════════════════════

async function rptLoadCard() {
    const item    = document.getElementById('rpt-sc-item').value.trim();
    const project = document.getElementById('rpt-sc-project').value;
    if (!item) return rptNotify('Enter an item code.', 'error');
    const params = new URLSearchParams({ item });
    if (project) params.set('project', project);

    try {
        const data = await fetch('/api/reports/stock-card?' + params).then(r=>r.json());
        if (!data.success) return rptNotify(data.message, 'error');
        const txns = data.transactions || [];
        document.getElementById('rpt-sc-info').textContent =
            `Item: ${data.item}  |  Project: ${data.project}  |  ${txns.length} transactions`;

        const tbody = document.getElementById('rpt-sc-body');
        if (!txns.length) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:#9CA3AF;padding:2rem">No transactions found for this item</td></tr>';
            return;
        }
        tbody.innerHTML = txns.map((t,i) => {
            const dirBadge = t.source==='OUT'
                ? `<span style="background:#FEE2E2;color:#991B1B;padding:.15rem .5rem;border-radius:4px;font-size:.8rem">${t.doc_type}</span>`
                : `<span style="background:#D1FAE5;color:#065F46;padding:.15rem .5rem;border-radius:4px;font-size:.8rem">${t.doc_type}</span>`;
            const balColor = (t.running_balance||0) <= 0 ? '#EF4444' : '#065F46';
            const altBg = i%2===0 ? '' : 'background:#F9FAFB';
            return `<tr style="${altBg}">
                <td>${t.txn_date||''}</td>
                <td>${dirBadge}</td>
                <td>${t.document_number||''}</td>
                <td>${t.project_code||''}</td>
                <td>${t.batch_no||''}</td>
                <td>${rptExpColor(t.exp_date)}</td>
                <td style="text-align:right;color:#065F46">${t.qty_in ? t.qty_in.toFixed(3) : ''}</td>
                <td style="text-align:right;color:#EF4444">${t.qty_out ? t.qty_out.toFixed(3) : ''}</td>
                <td style="text-align:right;font-weight:700;color:${balColor}">${(t.running_balance||0).toFixed(3)}</td>
                <td>${t.user_name||''}</td>
                <td style="font-size:.8rem;color:#9CA3AF">${t.source||''}</td>
            </tr>`;
        }).join('');
    } catch(e) { rptNotify('Load error: '+e.message, 'error'); }
}

function rptExportCard() {
    const item    = document.getElementById('rpt-sc-item').value.trim();
    const project = document.getElementById('rpt-sc-project').value;
    if (!item) return rptNotify('Enter an item code first.', 'error');
    const params = new URLSearchParams({ item });
    if (project) params.set('project', project);
    window.open('/api/reports/stock-card/export?' + params, '_blank');
}

// ════════════════════════════════════════════════════════════════════════════
//  TRANSACTIONS HISTORY
// ════════════════════════════════════════════════════════════════════════════

let rptTxTotal = 0;
let rptTxPage  = 1;

async function rptLoadTx() {
    rptTxPage = 1;
    await _rptFetchTx();
}

async function _rptFetchTx() {
    const project   = document.getElementById('rpt-tx-project').value;
    const direction = document.getElementById('rpt-tx-direction').value;
    const docType   = document.getElementById('rpt-tx-type').value;
    const from      = document.getElementById('rpt-tx-from').value;
    const to        = document.getElementById('rpt-tx-to').value;
    const params    = new URLSearchParams({ page: rptTxPage, limit: 100 });
    if (project)   params.set('project',   project);
    if (direction) params.set('direction', direction);
    if (docType)   params.set('doc_type',  docType);
    if (from)      params.set('date_from', from);
    if (to)        params.set('date_to',   to);

    try {
        const data = await fetch('/api/reports/transactions?' + params).then(r=>r.json());
        if (!data.success) return rptNotify(data.message, 'error');
        rptTxTotal = data.total || 0;
        const movs = data.movements || [];
        const tbody = document.getElementById('rpt-tx-body');
        if (!movs.length) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#9CA3AF;padding:2rem">No transactions found</td></tr>';
            document.getElementById('rpt-tx-footer').textContent = '';
            return;
        }
        tbody.innerHTML = movs.map((m,i) => {
            const dirBadge = m.movement_type==='OUT'
                ? `<span style="background:#FEE2E2;color:#991B1B;padding:.15rem .5rem;border-radius:4px;font-size:.8rem">OUT</span>`
                : `<span style="background:#D1FAE5;color:#065F46;padding:.15rem .5rem;border-radius:4px;font-size:.8rem">IN</span>`;
            const dest = m.end_user_name || m.third_party_name || m.dest_project || '—';
            const altBg = i%2===0 ? '' : 'background:#F9FAFB';
            return `<tr style="${altBg}">
                <td>${m.document_number||''}</td>
                <td>${dirBadge}</td>
                <td><span style="font-weight:600">${m.doc_type}</span></td>
                <td>${m.movement_date||''}</td>
                <td>${m.source_project||''}</td>
                <td>${dest}</td>
                <td style="text-align:right">${m.line_count||0}</td>
                <td style="text-align:right">${(m.total_weight_kg||0).toFixed(2)}</td>
                <td><span style="background:#D1FAE5;color:#065F46;padding:.15rem .5rem;border-radius:4px;font-size:.8rem">Confirmed</span></td>
                <td>
                    <button class="btn" style="background:#1F3A8A;color:#fff;padding:.2rem .6rem;font-size:.82rem"
                            onclick="rptExportOnePL(${m.id},'${m.movement_type}')">📥 PL</button>
                </td>
            </tr>`;
        }).join('');
        document.getElementById('rpt-tx-footer').textContent =
            `Showing ${movs.length} of ${rptTxTotal} transactions`;
    } catch(e) { rptNotify('Load error: '+e.message, 'error'); }
}

function rptExportTx() {
    const project   = document.getElementById('rpt-tx-project').value;
    const direction = document.getElementById('rpt-tx-direction').value;
    const docType   = document.getElementById('rpt-tx-type').value;
    const from      = document.getElementById('rpt-tx-from').value;
    const to        = document.getElementById('rpt-tx-to').value;
    const params    = new URLSearchParams();
    if (project)   params.set('project',   project);
    if (direction) params.set('direction', direction);
    if (docType)   params.set('doc_type',  docType);
    if (from)      params.set('date_from', from);
    if (to)        params.set('date_to',   to);
    window.open('/api/reports/transactions/export?' + params, '_blank');
}

function rptExportOnePL(id, movType) {
    const route = movType === 'OUT' ? 'out' : 'in';
    window.open(`/api/movements/${route}/${id}/export`, '_blank');
}

// ── Expiry date color helper ──────────────────────────────────────────────
function rptExpColor(exp) {
    if (!exp) return '<span style="color:#9CA3AF">—</span>';
    const days = Math.floor((new Date(exp) - new Date()) / 86400000);
    const color = days < 0 ? '#EF4444' : days < 30 ? '#EF4444' : days < 90 ? '#F59E0B' : '#374151';
    const badge = days < 0 ? ' ⚠️' : days < 90 ? ' ⏰' : '';
    return `<span style="color:${color}">${exp}${badge}</span>`;
}

// ── Re-init hook for navigation.js ────────────────────────────────────────
function initReportsPage() { rptInit(); }

// ── Boot ──────────────────────────────────────────────────────────────────
rptInit();

// ── Global exports (required for onclick handlers in dynamically loaded HTML) ──
window.initReportsPage  = initReportsPage;
window.rptTab           = rptTab;
window.rptLoadSummary   = rptLoadSummary;
window.rptExportSummary = rptExportSummary;
window.rptLoadCard      = rptLoadCard;
window.rptExportCard    = rptExportCard;
window.rptLoadTx        = rptLoadTx;
window.rptExportTx      = rptExportTx;
window.rptExportOnePL   = rptExportOnePL;
