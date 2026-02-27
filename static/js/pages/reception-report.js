// reception-report.js — Reception Report page
console.log('✅ Reception Report loaded');

let rrProjects = [];

// ── Notification ──────────────────────────────────────────────────────────
function rrNotify(msg, type='info') {
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
async function rrInit() {
    try {
        const data = await fetch('/api/projects').then(r=>r.json());
        rrProjects = (data.data || []).filter(p=>p.is_active);
        const el = document.getElementById('rr-project');
        if (el) {
            el.innerHTML = '<option value="">All Projects</option>' +
                rrProjects.map(p=>`<option value="${p.project_code}">${p.project_code} — ${p.project_name}</option>`).join('');
        }
        rrLoad();
    } catch(e) { rrNotify('Init error: '+e.message, 'error'); }
}

// ── Build query params ─────────────────────────────────────────────────────
function rrParams() {
    const params = new URLSearchParams();
    const project   = document.getElementById('rr-project')?.value;
    const orderType = document.getElementById('rr-order-type')?.value;
    const recNo     = document.getElementById('rr-rec-no')?.value.trim();
    const cargo     = document.getElementById('rr-cargo')?.value.trim();
    const dateFrom  = document.getElementById('rr-date-from')?.value;
    const dateTo    = document.getElementById('rr-date-to')?.value;
    if (project)   params.set('project', project);
    if (orderType) params.set('order_type', orderType);
    if (recNo)     params.set('reception_number', recNo);
    if (cargo)     params.set('cargo_session', cargo);
    if (dateFrom)  params.set('date_from', dateFrom);
    if (dateTo)    params.set('date_to', dateTo);
    return params;
}

// ── Load ──────────────────────────────────────────────────────────────────
async function rrLoad() {
    try {
        const data = await fetch('/api/reports/reception?' + rrParams()).then(r=>r.json());
        if (!data.success) return rrNotify(data.message, 'error');
        const rows = data.rows || [];
        const sum  = data.summary || {};

        // Summary cards
        const sumEl = document.getElementById('rr-summary');
        if (sumEl) {
            sumEl.innerHTML = [
                `<span style="background:#DBEAFE;color:#1E40AF;padding:.4rem 1rem;border-radius:6px;font-weight:600">📦 Parcels: ${sum.total_parcels||0}</span>`,
                `<span style="background:#D1FAE5;color:#065F46;padding:.4rem 1rem;border-radius:6px;font-weight:600">📋 Items: ${sum.total_items||0}</span>`,
                `<span style="background:#FEF3C7;color:#92400E;padding:.4rem 1rem;border-radius:6px;font-weight:600">⚖️ Weight: ${(sum.total_weight||0).toFixed(2)} kg</span>`,
            ].join('');
        }

        const info = document.getElementById('rr-info');
        if (info) info.textContent = `${rows.length} parcels found`;

        const tbody = document.getElementById('rr-body');
        if (!rows.length) {
            tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#9CA3AF;padding:2rem">No received parcels found matching the criteria</td></tr>';
            return;
        }
        tbody.innerHTML = rows.map((r, i) => {
            const altBg = i%2===0 ? '' : 'background:#F9FAFB';
            const typeBadge = r.order_type === 'Local'
                ? '<span style="background:#FEF3C7;color:#92400E;padding:.1rem .4rem;border-radius:4px;font-size:.8rem">🏠 Local</span>'
                : '<span style="background:#DBEAFE;color:#1E40AF;padding:.1rem .4rem;border-radius:4px;font-size:.8rem">✈️ Intl</span>';
            return `<tr style="${altBg}">
                <td style="color:#9CA3AF">${i+1}</td>
                <td><strong>${r.parcel_number||''}</strong></td>
                <td style="font-size:.85rem;color:#374151">${r.field_ref||''}</td>
                <td>${r.project_code||''}</td>
                <td>${typeBadge}</td>
                <td>${r.pallet_number||'—'}</td>
                <td style="text-align:right">${r.item_count||0}</td>
                <td style="text-align:right">${(r.total_weight||0).toFixed(2)}</td>
                <td style="font-size:.85rem">${r.reception_number||''}</td>
                <td style="font-size:.85rem">${(r.received_at||'').slice(0,16)}</td>
                <td style="font-size:.85rem">${r.received_by_name||''}</td>
                <td style="font-size:.85rem;color:#6B7280">${r.parcel_note||''}</td>
            </tr>`;
        }).join('');
    } catch(e) { rrNotify('Load error: '+e.message, 'error'); }
}

// ── Clear filters ─────────────────────────────────────────────────────────
function rrClear() {
    ['rr-project','rr-order-type'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    ['rr-rec-no','rr-cargo','rr-date-from','rr-date-to'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    rrLoad();
}

// ── Export Excel ──────────────────────────────────────────────────────────
function rrExport() {
    window.open('/api/reports/reception/export?' + rrParams(), '_blank');
}

// ── Share via email (download + open mailto:) ─────────────────────────────
function rrShare() {
    const url = '/api/reports/reception/export?' + rrParams();
    const a = document.createElement('a');
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    const subject = 'Reception Report — MidFlow';
    const body    = 'Please find attached the Reception Report.\n\nGenerated by MidFlow.';
    setTimeout(() => {
        window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    }, 800);
}

// ── Re-init hook for navigation.js ────────────────────────────────────────
function initReceptionReportPage() { rrInit(); }

// ── Boot ──────────────────────────────────────────────────────────────────
rrInit();

// ── Global exports ────────────────────────────────────────────────────────
window.initReceptionReportPage = initReceptionReportPage;
window.rrLoad                  = rrLoad;
window.rrClear                 = rrClear;
window.rrExport                = rrExport;
window.rrShare                 = rrShare;
