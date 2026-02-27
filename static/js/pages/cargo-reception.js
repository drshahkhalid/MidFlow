// ============================================================
//  Cargo Reception  —  cargo-reception.js  v2
//  International: upload Cargo Summary + Packing List → scan/receive parcels
//  Local: manual entry or Excel import
// ============================================================
console.log('✅ Cargo Reception v2 loaded');

// ── State ─────────────────────────────────────────────────────
let crMode          = 'international';
let crParcels       = [];       // loaded from /api/cargo/parcels (basic_data)
let crSummaryData   = [];       // in-memory parsed cargo summary rows
let crPackingData   = [];       // in-memory parsed packing list (expanded)
let crSessionId     = '';       // per-visit session id
let crCurrentPallet = '';       // active pallet number
let crPalletCount   = 0;        // parcels received on current pallet
let crUploadOpen    = true;     // collapsible upload state
let crPendingParcel = null;     // parcel object waiting in confirm modal
let crSummaryLoaded = false;    // flag: cargo summary saved this session
let crPackingLoaded = false;    // flag: packing list saved this session
let crLocalRows     = [];       // local-order manual rows (legacy parcel entry)
let crLocalKey      = 0;        // key counter for local rows
let crLocalLines    = [];       // local order_lines loaded from DB
let crPendingLine   = null;     // line object waiting in receive-line modal

// ── Init ──────────────────────────────────────────────────────
async function initCargoReceptionPage() {
    crMode          = 'international';
    crParcels       = [];
    crSummaryData   = [];
    crPackingData   = [];
    crCurrentPallet = '';
    crPalletCount   = 0;
    crUploadOpen    = true;
    crPendingParcel = null;
    crSummaryLoaded = false;
    crPackingLoaded = false;
    crLocalRows     = [];
    crLocalKey      = 0;
    crLocalLines    = [];
    crPendingLine   = null;
    crSessionId     = 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    crApplyMode();
    crUpdatePalletUI();

    // Show close-pallet as disabled initially
    const closeBtn = document.getElementById('cr-close-pallet-btn');
    if (closeBtn) closeBtn.disabled = true;

    await Promise.all([crLoadMissionInfo(), crLoadData()]);

    // Focus barcode input
    setTimeout(() => {
        const inp = document.getElementById('cr-barcode-input');
        if (inp) inp.focus();
    }, 150);
}

// ── Load mission info / next reception number ─────────────────
async function crLoadMissionInfo() {
    try {
        const r = await fetch('/api/cargo/mission-info');
        const d = await r.json();
        if (d.success) {
            const badge = document.getElementById('cr-reception-number-badge');
            const numEl = document.getElementById('cr-next-recep-num');
            if (numEl) numEl.textContent = d.next_reception_number || '—';
            if (badge) badge.style.display = '';
        }
    } catch (e) { /* silent */ }
}

// ── Load parcels from basic_data ──────────────────────────────
async function crLoadData() {
    try {
        const r = await fetch('/api/cargo/parcels');
        const d = await r.json();
        if (d.success) {
            crParcels = d.parcels || [];
            crRenderReceiveTable();
            await crUpdateStats();
            const badge = document.getElementById('cr-upload-status-badge');
            if (badge) badge.style.display = crParcels.length ? '' : 'none';
        }
    } catch (e) { /* silent */ }
}

// ── Mode switch ───────────────────────────────────────────────
function crSwitchMode(mode) {
    crMode = mode;
    crApplyMode();
}

function crApplyMode() {
    const intlSec     = document.getElementById('cr-intl-section');
    const locSec      = document.getElementById('cr-local-section');
    const tabIntl     = document.getElementById('cr-tab-intl');
    const tabLoc      = document.getElementById('cr-tab-local');
    const recvSec     = document.getElementById('cr-receive-section');  // shared parcel table
    const scannerCard = document.querySelector('#cr-page .form-card[style*="border-left:4px solid var(--cyan-flow)"]');

    const base   = 'padding:0.55rem 1.4rem;border:none;cursor:pointer;border-radius:6px 6px 0 0;font-size:0.88rem;transition:all .2s;';
    const active = base + 'background:linear-gradient(135deg,var(--primary-dark-blue),var(--mid-blue));color:#fff;font-weight:600;';
    const idle   = base + 'background:#F3F4F6;color:#6B7280;font-weight:500;margin-left:4px;';

    if (crMode === 'international') {
        if (intlSec)  intlSec.style.display = '';
        if (locSec)   locSec.style.display  = 'none';
        if (recvSec)  recvSec.style.display = '';      // show international parcel table
        if (tabIntl)  tabIntl.setAttribute('style', active);
        if (tabLoc)   tabLoc.setAttribute('style', idle);
    } else {
        if (intlSec)  intlSec.style.display = 'none';
        if (locSec)   locSec.style.display  = '';
        if (recvSec)  recvSec.style.display = 'none';  // hide — local uses order_lines table above
        if (tabIntl)  tabIntl.setAttribute('style', idle.replace('margin-left:4px;', ''));
        if (tabLoc)   tabLoc.setAttribute('style', active + 'margin-left:4px;');
        crLoadLocalLines();
    }
}

// ── Upload collapse toggle ────────────────────────────────────
function crToggleUpload() {
    crUploadOpen = !crUploadOpen;
    const body  = document.getElementById('cr-upload-body');
    const arrow = document.getElementById('cr-upload-arrow');
    if (body)  body.style.display    = crUploadOpen ? '' : 'none';
    if (arrow) arrow.style.transform = crUploadOpen ? '' : 'rotate(-90deg)';
}

// ── SheetJS loader ─────────────────────────────────────────────
function crLoadSheetJS() {
    return new Promise((res, rej) => {
        if (typeof XLSX !== 'undefined') { res(); return; }
        const sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
        sc.onload = () => {
            if (typeof XLSX === 'undefined' && typeof XLSXStyle !== 'undefined')
                window.XLSX = window.XLSXStyle;
            res();
        };
        sc.onerror = () => {
            const sc2 = document.createElement('script');
            sc2.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            sc2.onload = res;
            sc2.onerror = () => rej(new Error('SheetJS load failed'));
            document.head.appendChild(sc2);
        };
        document.head.appendChild(sc);
    });
}

// ── Web Audio API sounds ──────────────────────────────────────
function crPlaySound(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'success') {
            // Rising two-tone happy beep
            [880, 1100].forEach((freq, i) => {
                const osc  = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                const t = ctx.currentTime + i * 0.13;
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                osc.start(t); osc.stop(t + 0.18);
            });
        } else if (type === 'warning') {
            // Mid single tone
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 660; osc.type = 'sine';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.35);
        } else {
            // Low buzz error
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.frequency.value = 180; osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
        }
        setTimeout(() => { try { ctx.close(); } catch (e) {} }, 1500);
    } catch (e) { /* audio not supported */ }
}

// ── Scan feedback display ─────────────────────────────────────
function crShowScanFeedback(icon, msg, color, autoClear) {
    const iconEl = document.getElementById('cr-scan-icon');
    const msgEl  = document.getElementById('cr-scan-msg');
    if (iconEl) {
        iconEl.textContent = icon;
        iconEl.style.transition = 'transform 0.15s';
        iconEl.style.transform  = 'scale(1.3)';
        setTimeout(() => { iconEl.style.transform = 'scale(1)'; }, 150);
    }
    if (msgEl) {
        msgEl.textContent   = msg;
        msgEl.style.color   = color;
        msgEl.style.fontWeight = '600';
    }
    if (autoClear !== false) {
        setTimeout(() => {
            if (iconEl) iconEl.textContent = '—';
            if (msgEl)  msgEl.textContent  = '';
        }, 4000);
    }
}

// ── Barcode Scan / Process ────────────────────────────────────
async function crProcessScan() {
    const input     = document.getElementById('cr-barcode-input');
    if (!input) return;
    const parcelNum = input.value.trim();
    if (!parcelNum) return;

    // Search in already-loaded parcels first
    let parcel = crParcels.find(p => String(p.parcel_number).trim() === parcelNum);

    if (!parcel) {
        // Re-fetch from DB in case data was added in another tab
        try {
            const r = await fetch('/api/cargo/parcels');
            const d = await r.json();
            if (d.success) {
                crParcels = d.parcels || [];
                crRenderReceiveTable();
                parcel = crParcels.find(p => String(p.parcel_number).trim() === parcelNum);
            }
        } catch (e) { /* silent */ }
    }

    if (!parcel) {
        crPlaySound('error');
        crShowScanFeedback('❌', 'Not found: ' + parcelNum, '#DC2626');
        input.select();
        return;
    }

    // Found — check status
    if (parcel.reception_status === 'Received') {
        crPlaySound('warning');
        crShowScanFeedback('⚠️',
            'Already received' + (parcel.reception_number ? ' — ' + parcel.reception_number : ''),
            '#D97706');
        input.value = '';
        return;
    }

    // Ready to receive — auto-receive immediately, NO modal needed
    input.value = '';
    crPlaySound('success');
    crShowScanFeedback('⏳', 'Receiving ' + parcelNum + '…', '#059669', false);
    await crAutoReceive(parcel);
}

// ── Auto-receive (scan path — no modal) ──────────────────────
async function crAutoReceive(parcel) {
    try {
        const r = await fetch('/api/cargo/receive-parcel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parcel_number: parcel.parcel_number,
                pallet_number: crCurrentPallet || '',
                notes:         parcel.parcel_note || '',
                session_id:    crSessionId,
                order_type:    parcel.order_type || 'International'
            })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'Reception failed');

        if (crCurrentPallet) {
            crPalletCount++;
            crUpdatePalletUI();
        }

        crShowScanFeedback('✅',
            'Received — ' + (d.reception_number || ''),
            '#059669');

        await Promise.all([crLoadMissionInfo(), crLoadData()]);
    } catch (e) {
        crPlaySound('error');
        crShowScanFeedback('❌', 'Error: ' + e.message, '#DC2626');
    } finally {
        setTimeout(() => {
            const inp = document.getElementById('cr-barcode-input');
            if (inp) inp.focus();
        }, 80);
    }
}

// ── Open confirm reception modal ──────────────────────────────
async function crOpenConfirmModal(parcel) {
    crPendingParcel = parcel;

    const modal   = document.getElementById('cr-confirm-modal');
    const title   = document.getElementById('cr-confirm-title');
    const msg     = document.getElementById('cr-confirm-msg');
    const notes   = document.getElementById('cr-confirm-notes');
    const recDiv  = document.getElementById('cr-confirm-recep-num');
    const recVal  = document.getElementById('cr-confirm-recep-val');

    if (title) title.textContent = '📦 Confirm Reception';
    if (msg) msg.innerHTML =
        `<strong style="font-size:1rem;color:var(--primary-dark-blue);">${crSafe(parcel.parcel_number)}</strong><br>` +
        `<span style="font-size:0.82rem;color:#6B7280;line-height:1.6;">` +
        `Field Ref: <b>${crSafe(parcel.field_ref)}</b> &nbsp;|&nbsp; ` +
        `Packing Ref: <b>${crSafe(parcel.packing_ref)}</b><br>` +
        `Items: <b>${parcel.item_count || '—'}</b> &nbsp;|&nbsp; ` +
        `Weight: <b>${parcel.weight_kg != null ? parcel.weight_kg + ' kg' : '—'}</b>` +
        (crCurrentPallet ? ` &nbsp;|&nbsp; Pallet: <b style="color:#5B21B6;">${crSafe(crCurrentPallet)}</b>` : '') +
        `</span>`;

    if (notes) notes.value = '';
    if (recDiv) recDiv.style.display = 'none';

    // Reset exp/batch fields and set min = today (no past dates)
    const expDateInput = document.getElementById('cr-confirm-exp-date');
    const expNaInput   = document.getElementById('cr-confirm-exp-na');
    const batchInput   = document.getElementById('cr-confirm-batch-no');
    const expErr       = document.getElementById('cr-confirm-exp-error');
    const today        = new Date().toISOString().split('T')[0];
    if (expDateInput) { expDateInput.value = ''; expDateInput.min = today; expDateInput.style.background = ''; }
    if (expNaInput)   expNaInput.value   = '';
    if (batchInput)   batchInput.value   = '';
    if (expErr)       expErr.style.display = 'none';

    // Fetch next reception number for display
    try {
        const r = await fetch('/api/cargo/mission-info');
        const d = await r.json();
        if (d.success && d.next_reception_number) {
            if (recVal) recVal.textContent = d.next_reception_number;
            if (recDiv) recDiv.style.display = '';
        }
    } catch (e) { /* silent */ }

    if (modal) modal.style.display = 'flex';
    setTimeout(() => { if (notes) notes.focus(); }, 100);
}

// ── N/A button for international confirm modal ────────────────
function crConfirmSetNA() {
    const expDateInput = document.getElementById('cr-confirm-exp-date');
    const expNaInput   = document.getElementById('cr-confirm-exp-na');
    const expErr       = document.getElementById('cr-confirm-exp-error');
    if (expDateInput) { expDateInput.value = ''; expDateInput.style.background = '#F0FDF4'; }
    if (expNaInput)   expNaInput.value = 'N/A';
    if (expErr)       expErr.style.display = 'none';
}

// ── Start receive from table button ──────────────────────────
function crStartReceive(parcelNum) {
    const parcel = crParcels.find(p => String(p.parcel_number).trim() === String(parcelNum).trim());
    if (parcel) crOpenConfirmModal(parcel);
}

// ── Confirm reception ─────────────────────────────────────────
async function crConfirmReceive() {
    if (!crPendingParcel) return;
    const btn          = document.getElementById('cr-confirm-btn');
    const notes        = document.getElementById('cr-confirm-notes')?.value || '';
    const expDateInput = document.getElementById('cr-confirm-exp-date');
    const expNaInput   = document.getElementById('cr-confirm-exp-na');
    const batchInput   = document.getElementById('cr-confirm-batch-no');
    const expErr       = document.getElementById('cr-confirm-exp-error');

    // Determine expiry value: date input takes priority; N/A only if no date entered
    const rawDate = expDateInput?.value || '';
    let expDate = rawDate ? rawDate : (expNaInput?.value === 'N/A' ? 'N/A' : '');

    // Validate: must be set
    if (!expDate) {
        if (expErr) expErr.style.display = '';
        if (expDateInput) expDateInput.focus();
        return;
    }
    // Validate: date must not be in the past
    if (expDate !== 'N/A') {
        const today = new Date().toISOString().split('T')[0];
        if (expDate < today) {
            if (expErr) { expErr.textContent = '⚠️ Expiry date cannot be in the past'; expErr.style.display = ''; }
            if (expDateInput) expDateInput.focus();
            return;
        }
    }
    if (expErr) expErr.style.display = 'none';

    const batchNo = batchInput?.value || '';

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
    try {
        const r = await fetch('/api/cargo/receive-parcel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parcel_number: crPendingParcel.parcel_number,
                pallet_number: crCurrentPallet || '',
                notes,
                session_id:  crSessionId,
                order_type:  crPendingParcel.order_type || 'International',
                exp_date:    expDate,
                batch_no:    batchNo
            })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'Reception failed');

        // Update pallet count
        if (crCurrentPallet) {
            crPalletCount++;
            crUpdatePalletUI();
        }

        crCloseConfirmModal();

        // Show success toast briefly
        crShowScanFeedback('✅',
            'Received — ' + (d.reception_number || ''),
            '#059669');

        // Refresh data
        await Promise.all([crLoadMissionInfo(), crLoadData()]);

        // Refocus barcode input
        setTimeout(() => {
            const inp = document.getElementById('cr-barcode-input');
            if (inp) inp.focus();
        }, 100);
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✅ Confirm Received'; }
    }
}

// ── Save parcel note (inline edit, on blur / Enter) ──────────
async function crSaveParcelNote(parcelNum, note) {
    // Update local cache silently
    const p = crParcels.find(x => String(x.parcel_number) === String(parcelNum));
    if (p) p.parcel_note = note || '';
    try {
        await fetch('/api/cargo/parcel-note', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parcel_number: parcelNum, note })
        });
    } catch (e) { /* silent — input still has value */ }
}

// ── Unreceive parcel ──────────────────────────────────────────
async function crUnreceive(parcelNum) {
    if (!confirm(`Undo reception for parcel "${parcelNum}"?\nThis will remove the stock transaction record.`)) return;
    try {
        const r = await fetch('/api/cargo/unreceive-parcel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parcel_number: parcelNum })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message);
        await Promise.all([crLoadMissionInfo(), crLoadData()]);
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

function crCloseConfirmModal() {
    const m = document.getElementById('cr-confirm-modal');
    if (m) m.style.display = 'none';
    crPendingParcel = null;
}

// ── Pallet Management ─────────────────────────────────────────
async function crStartNewPallet() {
    let suggestion = 'P001';
    try {
        const r = await fetch('/api/cargo/next-pallet');
        const d = await r.json();
        if (d.success && d.next_pallet) suggestion = d.next_pallet;
    } catch (e) { /* silent */ }

    const input = document.getElementById('cr-pallet-input');
    if (input) input.value = suggestion;

    const modal = document.getElementById('cr-pallet-modal');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => { if (input) { input.select(); input.focus(); } }, 100);
}

function crConfirmNewPallet() {
    const input = document.getElementById('cr-pallet-input');
    const val   = input ? input.value.trim() : '';
    if (!val) { alert('Please enter a pallet number.'); return; }

    crCurrentPallet = val;
    crPalletCount   = 0;
    crUpdatePalletUI();
    crClosePalletModal();

    const closeBtn = document.getElementById('cr-close-pallet-btn');
    if (closeBtn) closeBtn.disabled = false;

    setTimeout(() => {
        const inp = document.getElementById('cr-barcode-input');
        if (inp) inp.focus();
    }, 100);
}

function crClosePallet() {
    if (!crCurrentPallet) return;
    if (!confirm(`Close pallet ${crCurrentPallet}? (${crPalletCount} parcel(s) assigned)`)) return;
    crCurrentPallet = '';
    crPalletCount   = 0;
    crUpdatePalletUI();
    const closeBtn = document.getElementById('cr-close-pallet-btn');
    if (closeBtn) closeBtn.disabled = true;
}

function crUpdatePalletUI() {
    const display  = document.getElementById('cr-current-pallet-display');
    const countEl  = document.getElementById('cr-pallet-count');
    const statPal  = document.getElementById('cr-stat-pallet');

    if (display) display.textContent = crCurrentPallet || 'None';
    if (countEl) {
        if (crCurrentPallet) {
            countEl.textContent    = crPalletCount + ' parcel(s)';
            countEl.style.display  = '';
        } else {
            countEl.style.display  = 'none';
        }
    }
    if (statPal) statPal.textContent = crCurrentPallet || '—';
}

function crClosePalletModal() {
    const m = document.getElementById('cr-pallet-modal');
    if (m) m.style.display = 'none';
}

// ── Render: Receive Parcels Table ─────────────────────────────
function crRenderReceiveTable() {
    const tbody = document.getElementById('cr-receive-tbody');
    if (!tbody) return;

    if (!crParcels.length) {
        tbody.innerHTML = `<tr><td colspan="13"
            style="text-align:center;padding:2.5rem;color:#9CA3AF;font-size:0.88rem;">
            📂 Upload Cargo Summary + Packing List, or add Local Order rows to see parcels
            </td></tr>`;
        return;
    }

    tbody.innerHTML = crParcels.map(r => {
        const isRcvd    = r.reception_status === 'Received';
        const orderType = r.order_type || 'International';

        const typeBadge = (orderType === 'Local')
            ? `<span style="background:#EFF6FF;color:#1E40AF;border-radius:8px;
                padding:0.1rem 0.45rem;font-size:0.72rem;font-weight:600;white-space:nowrap;">🏠 Local</span>`
            : `<span style="background:#ECFDF5;color:#065F46;border-radius:8px;
                padding:0.1rem 0.45rem;font-size:0.72rem;font-weight:600;white-space:nowrap;">🌍 Intl</span>`;

        const projectCell = r.project_code
            ? `<span style="background:#FEF3C7;color:#92400E;border-radius:8px;
                padding:0.1rem 0.45rem;font-size:0.72rem;font-weight:600;">${crSafe(r.project_code)}</span>`
            : `<span style="color:#9CA3AF;font-size:0.75rem;">—</span>`;

        const statusBadge = isRcvd
            ? `<span style="background:#D1FAE5;color:#065F46;border-radius:10px;
                padding:0.15rem 0.55rem;font-size:0.75rem;font-weight:600;">✅ Received</span>`
            : `<span style="background:#FEF3C7;color:#92400E;border-radius:10px;
                padding:0.15rem 0.55rem;font-size:0.75rem;font-weight:600;">⏳ Pending</span>`;

        const actionBtn = isRcvd
            ? `<button onclick="crUnreceive('${crEsc(r.parcel_number)}')"
                style="padding:0.3rem 0.65rem;font-size:0.78rem;border:1px solid #FCA5A5;
                background:#FEE2E2;color:#991B1B;border-radius:5px;cursor:pointer;">↩ Undo</button>`
            : `<button onclick="crStartReceive('${crEsc(r.parcel_number)}')"
                style="padding:0.3rem 0.65rem;font-size:0.78rem;border:none;
                background:linear-gradient(135deg,#059669,#047857);color:#fff;
                border-radius:5px;cursor:pointer;font-weight:600;">✓ Receive</button>`;

        const noteVal   = r.parcel_note || '';
        const noteTitle = noteVal ? noteVal.replace(/"/g, '&quot;') : '';
        const noteCell  = `<div style="display:flex;align-items:center;gap:4px;min-width:80px;">
            <input type="text" id="pn-${crEsc(r.parcel_number)}"
              value="${String(noteVal).replace(/"/g, '&quot;')}"
              placeholder="📝 note…"
              title="${noteTitle}"
              onblur="crSaveParcelNote('${crEsc(r.parcel_number)}',this.value)"
              onkeydown="if(event.key==='Enter'){this.blur();document.getElementById('cr-barcode-input')?.focus();}"
              style="width:110px;padding:0.2rem 0.4rem;border:1px solid #E5E7EB;
                border-radius:4px;font-size:0.75rem;background:${isRcvd?'#F9FAFB':'#FFFBEB'};
                color:#374151;box-sizing:border-box;">
            </div>`;

        const itemsBtn = (r.item_count > 0)
            ? `<button onclick="crViewItems('${crEsc(r.parcel_number)}')"
                style="padding:0.2rem 0.55rem;font-size:0.75rem;border:1px solid #E5E7EB;
                background:#F9FAFB;border-radius:5px;cursor:pointer;"
                title="View packing list items">📋 ${r.item_count}</button>`
            : `<span style="color:#9CA3AF;font-size:0.75rem;">—</span>`;

        const palletLabel = r.pallet_number
            ? `<span style="background:#EDE9FE;color:#5B21B6;border-radius:8px;
                padding:0.1rem 0.45rem;font-size:0.75rem;font-weight:600;">${crSafe(r.pallet_number)}</span>`
            : `<span style="color:#9CA3AF;font-size:0.75rem;">—</span>`;
        const palletCell = `<div style="display:flex;align-items:center;gap:3px">
            ${palletLabel}
            <button onclick="crChangePallet('${crEsc(r.parcel_number)}','${crEsc(r.pallet_number||'')}')"
                style="border:none;background:none;cursor:pointer;font-size:.75rem;color:#9CA3AF;padding:1px 3px"
                title="Change pallet">✏️</button>
            </div>`;

        const rowBg = isRcvd ? '#FAFAFA' : 'white';

        return `<tr data-parcel="${crEsc(r.parcel_number)}" data-order="${crEsc(r.field_ref)}"
            data-status="${r.reception_status || 'Pending'}"
            data-type="${crEsc(orderType)}"
            style="border-bottom:1px solid #F3F4F6;background:${rowBg};cursor:default;"
            onmouseover="this.style.background='#EFF6FF'"
            onmouseout="this.style.background='${rowBg}'">
          <td style="padding:0.4rem 0.5rem;text-align:center;">${typeBadge}</td>
          <td style="padding:0.4rem 0.7rem;font-family:monospace;font-size:0.8rem;font-weight:700;
            color:var(--primary-dark-blue);">${crSafe(r.parcel_number)}</td>
          <td style="padding:0.4rem 0.7rem;font-weight:600;color:#1A73E8;font-size:0.82rem;">${crSafe(r.field_ref)}</td>
          <td style="padding:0.4rem 0.6rem;text-align:center;">${projectCell}</td>
          <td style="padding:0.4rem 0.7rem;font-size:0.8rem;color:#4B5563;">${crSafe(r.packing_ref)}</td>
          <td style="padding:0.4rem 0.7rem;font-size:0.8rem;color:#6B7280;">${crSafe(r.transport_reception)}</td>
          <td style="padding:0.4rem 0.7rem;text-align:right;font-size:0.8rem;">${r.weight_kg != null ? Number(r.weight_kg).toFixed(2) + ' kg' : '—'}</td>
          <td style="padding:0.4rem 0.7rem;text-align:right;font-size:0.8rem;">${r.volume_m3 != null ? Number(r.volume_m3).toFixed(3) + ' m³' : '—'}</td>
          <td style="padding:0.4rem 0.7rem;text-align:center;">${itemsBtn}</td>
          <td style="padding:0.4rem 0.7rem;text-align:center;">${palletCell}</td>
          <td style="padding:0.4rem 0.5rem;">${noteCell}</td>
          <td style="padding:0.4rem 0.7rem;text-align:center;">${statusBadge}</td>
          <td style="padding:0.4rem 0.7rem;text-align:center;">${actionBtn}</td>
        </tr>`;
    }).join('');
}

// ── Filter parcel table ───────────────────────────────────────
function crFilterParcels() {
    const search = (document.getElementById('cr-search-parcel')?.value || '').toLowerCase().trim();
    const status = document.getElementById('cr-status-filter')?.value || '';
    const type   = document.getElementById('cr-type-filter')?.value   || '';
    document.querySelectorAll('#cr-receive-tbody tr').forEach(tr => {
        const parcel  = (tr.dataset.parcel || '').toLowerCase();
        const order   = (tr.dataset.order  || '').toLowerCase();
        const st      = tr.dataset.status  || '';
        const tp      = tr.dataset.type    || '';
        const ok = (!search || parcel.includes(search) || order.includes(search)) &&
                   (!status || st === status) &&
                   (!type   || tp === type);
        tr.style.display = ok ? '' : 'none';
    });
}

// ── Update stat cards ─────────────────────────────────────────
async function crUpdateStats() {
    try {
        const r = await fetch('/api/cargo/summary/stats');
        const d = await r.json();
        if (!d.success) return;
        const tot = document.getElementById('cr-stat-total');
        const rec = document.getElementById('cr-stat-received');
        const pen = document.getElementById('cr-stat-pending');
        const wt  = document.getElementById('cr-stat-weight');
        if (tot) tot.textContent = d.total    || 0;
        if (rec) rec.textContent = d.received || 0;
        if (pen) pen.textContent = d.pending  || 0;
        if (wt)  wt.textContent  = d.weight_received != null
            ? Number(d.weight_received).toFixed(1) + ' kg'
            : '0 kg';
        // Local order stats
        const loTot  = document.getElementById('cr-stat-lo-total');
        const loFull = document.getElementById('cr-stat-lo-full');
        const loPart = document.getElementById('cr-stat-lo-partial');
        if (loTot)  loTot.textContent  = d.lo_total   ?? 0;
        if (loFull) loFull.textContent = d.lo_full    ?? 0;
        if (loPart) loPart.textContent = d.lo_partial ?? 0;
    } catch (e) { /* silent */ }
}

// ── View packing items modal ──────────────────────────────────
async function crViewItems(parcelNum) {
    const modal = document.getElementById('cr-items-modal');
    const title = document.getElementById('cr-items-modal-title');
    const body  = document.getElementById('cr-items-modal-body');
    if (!modal || !body) return;

    if (title) title.textContent = '📦 Packing Items — Parcel ' + parcelNum;
    body.innerHTML = '<p style="color:#9CA3AF;padding:1rem;">Loading…</p>';
    modal.style.display = 'flex';

    try {
        const r = await fetch('/api/cargo/packing-list/' + encodeURIComponent(parcelNum));
        const d = await r.json();
        if (!d.success) throw new Error(d.message);
        const items = d.items || [];
        if (!items.length) {
            body.innerHTML = '<p style="color:#9CA3AF;padding:1rem;">No items found for this parcel.</p>';
            return;
        }
        body.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
            <thead>
              <tr style="background:linear-gradient(135deg,var(--primary-dark-blue),var(--mid-blue));color:#fff;">
                <th style="padding:0.4rem 0.6rem;text-align:left;">Line</th>
                <th style="padding:0.4rem 0.6rem;text-align:left;">Item Code</th>
                <th style="padding:0.4rem 0.6rem;text-align:left;">Description</th>
                <th style="padding:0.4rem 0.6rem;text-align:right;">Qty Ordered</th>
                <th style="padding:0.4rem 0.6rem;text-align:right;">Qty Rcvd</th>
                <th style="padding:0.4rem 0.6rem;text-align:right;">Balance</th>
                <th style="padding:0.4rem 0.6rem;text-align:left;">Batch</th>
                <th style="padding:0.4rem 0.6rem;text-align:left;">Exp. Date</th>
                <th style="padding:0.4rem 0.6rem;text-align:right;">Kg</th>
                <th style="padding:0.4rem 0.6rem;text-align:right;">dm³</th>
              </tr>
            </thead>
            <tbody>
            ${items.map((it, i) => {
              const qtyOrd  = parseFloat(it.qty_unit_tot) || 0;
              const qtyRcvd = parseFloat(it.qty_received) || 0;
              const balance = qtyOrd - qtyRcvd;
              const balColor = balance <= 0 ? '#059669' : '#DC2626';
              return `
              <tr style="border-bottom:1px solid #F3F4F6;background:${i % 2 === 0 ? 'white' : '#F9FAFB'};">
                <td style="padding:0.35rem 0.6rem;">${crSafe(it.line_no)}</td>
                <td style="padding:0.35rem 0.6rem;font-weight:700;color:var(--primary-dark-blue);">${crSafe(it.item_code)}</td>
                <td style="padding:0.35rem 0.6rem;max-width:200px;white-space:nowrap;
                  overflow:hidden;text-overflow:ellipsis;" title="${crSafe(it.item_description)}">${crSafe(it.item_description)}</td>
                <td style="padding:0.35rem 0.6rem;text-align:right;font-weight:600;">${crSafe(it.qty_unit_tot)}</td>
                <td style="padding:0.35rem 0.6rem;text-align:right;font-weight:600;color:#059669;">${qtyRcvd > 0 ? qtyRcvd : '—'}</td>
                <td style="padding:0.35rem 0.6rem;text-align:right;font-weight:700;color:${balColor};">${balance > 0 ? balance : '✅'}</td>
                <td style="padding:0.35rem 0.6rem;">${crSafe(it.batch_no_received || it.batch_no)}</td>
                <td style="padding:0.35rem 0.6rem;">${crSafe(it.exp_date_received || it.exp_date)}</td>
                <td style="padding:0.35rem 0.6rem;text-align:right;">${crSafe(it.kg_total)}</td>
                <td style="padding:0.35rem 0.6rem;text-align:right;">${crSafe(it.dm3_total)}</td>
              </tr>`;
            }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (e) {
        body.innerHTML = `<p style="color:#DC2626;padding:1rem;">Error: ${crSafe(e.message)}</p>`;
    }
}

function crCloseItemsModal() {
    const m = document.getElementById('cr-items-modal');
    if (m) m.style.display = 'none';
}

function crClosePreview() {
    const m = document.getElementById('cr-preview-modal');
    if (m) m.style.display = 'none';
}

// ── Drag / Drop helpers ───────────────────────────────────────
function crDragOver(event, zoneId) {
    event.preventDefault();
    const z = document.getElementById(zoneId);
    if (z) z.style.cssText += 'border-color:var(--cyan-flow);background:#EFF6FF;';
}
function crDragLeave(zoneId) {
    const z = document.getElementById(zoneId);
    if (z) z.style.cssText = z.style.cssText.replace(/border-color[^;]*;/g, '').replace(/background[^;]*;/g, '') +
        'border-color:var(--border-light);background:#F9FAFB;';
}
function crDropFile(event, type) {
    event.preventDefault();
    const zoneId = type === 'summary' ? 'cr-cs-drop' : 'cr-pl-drop';
    crDragLeave(zoneId);
    const file = event.dataTransfer.files[0];
    if (file) crProcessFile(file, type);
}
function crHandleFile(event, type) {
    const file = event.target.files[0];
    if (file) crProcessFile(file, type);
    event.target.value = '';
}

// ── Parcel range parser ───────────────────────────────────────
function crParseParcelRange(text) {
    if (!text && text !== 0) return [null];
    const s = String(text).trim();
    const range = s.match(/(\d+)\s+to\s+(\d+)/i);
    if (range) {
        const start = parseInt(range[1]), end = parseInt(range[2]);
        const result = [];
        for (let i = start; i <= end; i++) result.push(i);
        return result;
    }
    const single = s.match(/\d+/);
    if (single) return [parseInt(single[0])];
    return [null];
}

// ── Flexible column finder ────────────────────────────────────
function crFindCol(headers, ...candidates) {
    for (const c of candidates) {
        const idx = headers.findIndex(h =>
            h.toLowerCase().replace(/[^a-z0-9]/g, '').includes(
                c.toLowerCase().replace(/[^a-z0-9]/g, '')
            )
        );
        if (idx >= 0) return idx;
    }
    return -1;
}

// ── File processor dispatcher ─────────────────────────────────
async function crProcessFile(file, type) {
    const statusId = type === 'summary' ? 'cr-cs-status'
                   : type === 'packing' ? 'cr-pl-status'
                   : 'cr-local-status';
    const statusEl = document.getElementById(statusId);
    if (statusEl) statusEl.innerHTML = crStatusMsg('info', '⏳ Reading…');
    try {
        await crLoadSheetJS();
        const buf  = await file.arrayBuffer();
        const wb   = XLSX.read(buf, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        if (rows.length < 2) throw new Error('File appears empty or has no data rows');

        if      (type === 'summary') await crParseSummary(rows, statusEl);
        else if (type === 'packing') await crParsePacking(rows, statusEl);
    } catch (e) {
        if (statusEl) statusEl.innerHTML = crStatusMsg('error', '❌ ' + e.message);
    }
}

// ── Parse Cargo Summary Excel ─────────────────────────────────
async function crParseSummary(rows, statusEl) {
    const hdrs = rows[0].map(h => String(h));
    const col  = (...cc) => crFindCol(hdrs, ...cc);

    const map = {
        transport_reception:     col('Transport reception', 'Transport'),
        sub_folder:              col('Sub folder', 'Subfolder'),
        field_ref:               col('Field ref', 'Field ref.', 'Fieldref'),
        ref_op_msfl:             col('Ref op MSFL', 'Ref op', 'MSFL'),
        goods_reception:         col('Goods reception', 'Goodsreception', 'Packing ref'),
        parcel_nb:               col('Parcel nb', 'Parcel nb.', 'Parcelnb'),
        weight_kg:               col('Weight', 'Weight (kg)', 'Weightkg'),
        volume_m3:               col('Volume', 'Volume (m3)', 'Volumem3'),
        invoice_credit_note_ref: col('Invoice', 'Invoice/credit', 'Invoiceref'),
        estim_value_eu:          col('Estim', 'value', 'Estimvalue'),
    };

    crSummaryData = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every(c => c === '' || c == null)) continue;

        const gr = map.goods_reception >= 0 ? String(row[map.goods_reception] || '').trim() : '';
        const pn = map.parcel_nb       >= 0 ? String(row[map.parcel_nb]       || '').trim() : '';
        const autoParcel = gr && pn ? gr + pn : (gr + pn) || null;

        crSummaryData.push({
            parcel_number:           autoParcel || null,
            transport_reception:     map.transport_reception     >= 0 ? String(row[map.transport_reception]     || '').trim() : '',
            sub_folder:              map.sub_folder              >= 0 ? row[map.sub_folder]              || null : null,
            field_ref:               map.field_ref               >= 0 ? String(row[map.field_ref]               || '').trim() : '',
            ref_op_msfl:             map.ref_op_msfl             >= 0 ? row[map.ref_op_msfl]             || null : null,
            goods_reception:         gr || null,
            parcel_nb:               pn || null,
            weight_kg:               map.weight_kg               >= 0 ? parseFloat(row[map.weight_kg])   || null : null,
            volume_m3:               map.volume_m3               >= 0 ? parseFloat(row[map.volume_m3])   || null : null,
            invoice_credit_note_ref: map.invoice_credit_note_ref >= 0 ? String(row[map.invoice_credit_note_ref] || '').trim() : '',
            estim_value_eu:          map.estim_value_eu          >= 0 ? parseFloat(row[map.estim_value_eu])   || null : null,
        });
    }

    if (!crSummaryData.length) throw new Error('No valid rows in Cargo Summary');

    const resp = await fetch('/api/cargo/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: crSummaryData, order_type: 'International', session_id: crSessionId })
    });
    const result = await resp.json();
    if (!result.success) throw new Error(result.message || 'Save failed');

    crSummaryLoaded = true;
    if (statusEl) statusEl.innerHTML = crStatusMsg('ok', `✅ ${crSummaryData.length} rows imported — <a href="#" onclick="crShowDataPreview('summary');return false;" style="color:#1E40AF;">👁 Preview</a>`);

    const badge = document.getElementById('cr-cs-badge');
    if (badge) { badge.textContent = crSummaryData.length + ' rows'; badge.style.display = ''; }

    crCheckBothLoaded();
}

// ── Parse Packing List Excel ──────────────────────────────────
async function crParsePacking(rows, statusEl) {
    const hdrs = rows[0].map(h => String(h));
    const col  = (...cc) => crFindCol(hdrs, ...cc);

    const map = {
        packing_ref: col('Packing ref', 'Packingref', 'Packing_ref'),
        line_no:     col('Line no', 'Lineno', 'Line_no', 'Line'),
        item_code:   col('Item code', 'Itemcode', 'Item_code'),
        item_desc:   col('Item description', 'Description', 'Itemdescription'),
        qty:         col('Qty unit', 'Qty unit. tot', 'Qty', 'Quantity'),
        packaging:   col('Packaging', 'Pack'),
        parcel_n:    col('Parcel n°', 'Parcel no', 'Parceln', 'Parcel_n'),
        nb_parcels:  col('Nb parcels', 'Nbparcels', 'Nb_parcels'),
        batch_no:    col('Batch no', 'Batchno', 'Batch_no', 'Batch'),
        exp_date:    col('Exp. date', 'Expdate', 'Exp_date', 'Expiry'),
        kg_total:    col('Kg (total)', 'Kg total', 'Kgtotal'),
        dm3_total:   col('dm3 (total)', 'dm3', 'Dm3'),
    };

    crPackingData = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.every(c => c === '' || c == null)) continue;

        const packRef    = map.packing_ref >= 0 ? String(row[map.packing_ref] || '').trim() : '';
        const lineNo     = map.line_no     >= 0 ? parseInt(row[map.line_no])  || i : i;
        const itemCode   = map.item_code   >= 0 ? String(row[map.item_code]   || '').trim() : '';
        const itemDesc   = map.item_desc   >= 0 ? String(row[map.item_desc]   || '').trim() : '';
        const qty        = map.qty         >= 0 ? parseFloat(row[map.qty])    || null : null;
        const packaging  = map.packaging   >= 0 ? parseFloat(row[map.packaging]) || null : null;
        const parcelNRaw = map.parcel_n    >= 0 ? String(row[map.parcel_n]    || '').trim() : '';
        const nbParcels  = map.nb_parcels  >= 0 ? parseInt(row[map.nb_parcels]) || null : null;
        const batchNo    = map.batch_no    >= 0 ? String(row[map.batch_no]    || '').trim() : '';
        const expDate    = map.exp_date    >= 0 ? String(row[map.exp_date]    || '').trim() : '';
        const kgTotal    = map.kg_total    >= 0 ? parseFloat(row[map.kg_total]) || null : null;
        const dm3Total   = map.dm3_total   >= 0 ? parseFloat(row[map.dm3_total]) || null : null;

        // Expand "Parcel no X to Y" — divide totals by nb_parcels per expanded row
        const parcelNums  = crParseParcelRange(parcelNRaw);
        const validCount  = parcelNums.filter(x => x !== null).length;
        // Prefer the declared Nb_parcels field; fall back to range size
        const divisor     = (nbParcels && nbParcels > 1) ? nbParcels
                          : (validCount  > 1 ? validCount : 1);

        for (const pnb of parcelNums) {
            const parcelNum = packRef && pnb ? String(packRef) + String(pnb) : null;
            crPackingData.push({
                parcel_number:    parcelNum,
                packing_ref:      packRef     || null,
                line_no:          lineNo,
                item_code:        itemCode    || null,
                item_description: itemDesc    || null,
                // Divide totals evenly across all parcels in this range
                qty_unit_tot: qty     != null ? Math.round(qty     / divisor * 10000) / 10000 : null,
                packaging:    packaging,
                parcel_n:     parcelNRaw || null,
                nb_parcels:   nbParcels,
                batch_no:     batchNo   || null,
                exp_date:     expDate   || null,
                kg_total:  kgTotal  != null ? Math.round(kgTotal  / divisor * 10000) / 10000 : null,
                dm3_total: dm3Total != null ? Math.round(dm3Total / divisor * 10000) / 10000 : null,
                parcel_nb:    pnb,
            });
        }
    }

    if (!crPackingData.length) throw new Error('No valid rows in Packing List');

    const resp = await fetch('/api/cargo/packing-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: crPackingData, session_id: crSessionId })
    });
    const result = await resp.json();
    if (!result.success) throw new Error(result.message || 'Save failed');

    crPackingLoaded = true;
    if (statusEl) statusEl.innerHTML = crStatusMsg('ok', `✅ ${crPackingData.length} rows imported (parcel ranges expanded) — <a href="#" onclick="crShowDataPreview('packing');return false;" style="color:#065F46;">👁 Preview</a>`);

    const badge = document.getElementById('cr-pl-badge');
    if (badge) { badge.textContent = crPackingData.length + ' rows'; badge.style.display = ''; }

    crCheckBothLoaded();

    // Merge already happened server-side — refresh table
    await crLoadData();
}

// ── Both files loaded → show merge row ────────────────────────
function crCheckBothLoaded() {
    const mergeRow = document.getElementById('cr-merge-row');
    if (mergeRow && crSummaryLoaded && crPackingLoaded) {
        mergeRow.style.display = 'flex';
    }
}

// ── Merge trigger (reload parcels) ───────────────────────────
async function crMergeTrigger() {
    const statusEl = document.getElementById('cr-merge-status');
    if (statusEl) statusEl.textContent = '⏳ Loading parcels…';
    await crLoadData();
    const cnt = crParcels.length;
    if (statusEl) statusEl.textContent = `✅ ${cnt} parcel(s) loaded`;
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    // Auto-collapse upload section when data is present
    if (crUploadOpen && cnt > 0) crToggleUpload();
}

// ── Show data preview modal ───────────────────────────────────
function crShowDataPreview(type) {
    const modal = document.getElementById('cr-preview-modal');
    const title = document.getElementById('cr-preview-title');
    const body  = document.getElementById('cr-preview-body');
    if (!modal || !body) return;

    if (type === 'summary') {
        if (title) title.textContent = '📋 Cargo Summary Preview';
        const data = crSummaryData;
        if (!data.length) { body.innerHTML = '<p style="color:#9CA3AF;">No data loaded.</p>'; modal.style.display = 'flex'; return; }
        body.innerHTML = `
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead><tr style="background:linear-gradient(135deg,var(--primary-dark-blue),var(--mid-blue));color:#fff;">
              <th style="padding:0.35rem 0.55rem;">Parcel #</th>
              <th style="padding:0.35rem 0.55rem;">Field Ref</th>
              <th style="padding:0.35rem 0.55rem;">Goods Recep.</th>
              <th style="padding:0.35rem 0.55rem;">Parcel Nb</th>
              <th style="padding:0.35rem 0.55rem;">Transport</th>
              <th style="padding:0.35rem 0.55rem;text-align:right;">Weight</th>
              <th style="padding:0.35rem 0.55rem;text-align:right;">Volume</th>
              <th style="padding:0.35rem 0.55rem;text-align:right;">Est. Value</th>
            </tr></thead>
            <tbody>${data.map((r, i) => `<tr style="border-bottom:1px solid #F3F4F6;background:${i%2===0?'white':'#F9FAFB'};">
              <td style="padding:0.3rem 0.55rem;font-family:monospace;">${crSafe(r.parcel_number)}</td>
              <td style="padding:0.3rem 0.55rem;font-weight:600;color:#1A73E8;">${crSafe(r.field_ref)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.goods_reception)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.parcel_nb)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.transport_reception)}</td>
              <td style="padding:0.3rem 0.55rem;text-align:right;">${r.weight_kg != null ? r.weight_kg : '—'}</td>
              <td style="padding:0.3rem 0.55rem;text-align:right;">${r.volume_m3 != null ? r.volume_m3 : '—'}</td>
              <td style="padding:0.3rem 0.55rem;text-align:right;">${r.estim_value_eu != null ? '€' + r.estim_value_eu : '—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    } else {
        if (title) title.textContent = '📦 Packing List Preview';
        const data = crPackingData;
        if (!data.length) { body.innerHTML = '<p style="color:#9CA3AF;">No data loaded.</p>'; modal.style.display = 'flex'; return; }
        body.innerHTML = `
        <p style="font-size:0.8rem;color:#6B7280;margin-bottom:0.5rem;">${data.length} rows after parcel range expansion</p>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
            <thead><tr style="background:linear-gradient(135deg,var(--primary-dark-blue),var(--mid-blue));color:#fff;">
              <th style="padding:0.35rem 0.55rem;">Parcel #</th>
              <th style="padding:0.35rem 0.55rem;">Pack. Ref</th>
              <th style="padding:0.35rem 0.55rem;">Line</th>
              <th style="padding:0.35rem 0.55rem;">Item Code</th>
              <th style="padding:0.35rem 0.55rem;">Description</th>
              <th style="padding:0.35rem 0.55rem;text-align:right;">Qty</th>
              <th style="padding:0.35rem 0.55rem;">Parcel n°</th>
              <th style="padding:0.35rem 0.55rem;">Batch</th>
              <th style="padding:0.35rem 0.55rem;">Exp</th>
            </tr></thead>
            <tbody>${data.map((r, i) => `<tr style="border-bottom:1px solid #F3F4F6;background:${i%2===0?'white':'#F9FAFB'};">
              <td style="padding:0.3rem 0.55rem;font-family:monospace;font-size:0.78rem;">${crSafe(r.parcel_number)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.packing_ref)}</td>
              <td style="padding:0.3rem 0.55rem;text-align:right;">${crSafe(r.line_no)}</td>
              <td style="padding:0.3rem 0.55rem;font-weight:600;">${crSafe(r.item_code)}</td>
              <td style="padding:0.3rem 0.55rem;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${crSafe(r.item_description)}</td>
              <td style="padding:0.3rem 0.55rem;text-align:right;">${crSafe(r.qty_unit_tot)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.parcel_n)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.batch_no)}</td>
              <td style="padding:0.3rem 0.55rem;">${crSafe(r.exp_date)}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>`;
    }
    modal.style.display = 'flex';
}

// ── Clear session ─────────────────────────────────────────────
async function crClearSession() {
    if (!confirm('Clear all loaded cargo data for this session?\nThis will remove uploaded records but NOT finalized receptions.')) return;
    try {
        await fetch('/api/cargo/summary/session/' + crSessionId, { method: 'DELETE' });
        await fetch('/api/cargo/packing-list/session/' + crSessionId, { method: 'DELETE' });
    } catch (e) { /* silent */ }

    crParcels       = [];
    crSummaryData   = [];
    crPackingData   = [];
    crSummaryLoaded = false;
    crPackingLoaded = false;
    crSessionId     = 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    ['cr-cs-status', 'cr-pl-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
    ['cr-cs-badge', 'cr-pl-badge'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const mergeRow = document.getElementById('cr-merge-row');
    if (mergeRow) mergeRow.style.display = 'none';
    const badge = document.getElementById('cr-upload-status-badge');
    if (badge) badge.style.display = 'none';

    // Reload from DB (show any previously saved + received data)
    await crLoadData();
    await crUpdateStats();
}

// ═══════════════════════════════════════════════════════════════
//  LOCAL ORDER — item-based reception from order_lines DB
// ═══════════════════════════════════════════════════════════════

async function crLoadLocalLines() {
    const statusEl = document.getElementById('cr-local-lines-status');
    const tbody    = document.getElementById('cr-local-lines-tbody');
    if (statusEl) statusEl.textContent = '⏳ Loading local order lines…';
    try {
        const r = await fetch('/api/cargo/local-lines');
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'Load failed');
        crLocalLines = d.lines || [];
        crRenderLocalLinesTable(crLocalLines);
        if (statusEl) statusEl.textContent = `${crLocalLines.length} local order line(s) loaded`;
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    } catch (e) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="12" style="text-align:center;padding:2rem;color:#DC2626;">
            Error loading local lines: ${crSafe(e.message)}</td></tr>`;
        if (statusEl) statusEl.textContent = '';
    }
}

function crRenderLocalLinesTable(lines) {
    const tbody = document.getElementById('cr-local-lines-tbody');
    if (!tbody) return;
    if (!lines.length) {
        tbody.innerHTML = `<tr><td colspan="12"
            style="text-align:center;padding:2rem;color:#9CA3AF;">
            No local order lines found — create Local orders in the Orders module first
        </td></tr>`;
        return;
    }

    const statusBadge = (s) => {
        const cfg = {
            'Fully Received': { bg:'#D1FAE5', color:'#065F46', icon:'✅' },
            'Partial':        { bg:'#FEF3C7', color:'#92400E', icon:'🔄' },
            'Pending':        { bg:'#FEE2E2', color:'#991B1B', icon:'⏳' },
        };
        const c = cfg[s] || cfg['Pending'];
        return `<span style="background:${c.bg};color:${c.color};
            border-radius:10px;padding:0.15rem 0.55rem;font-size:0.73rem;font-weight:600;
            white-space:nowrap;">${c.icon} ${crSafe(s)}</span>`;
    };

    tbody.innerHTML = lines.map((ln, i) => {
        const qtyOrd   = parseFloat(ln.qty_ordered)  || 0;
        const qtyRcvd  = parseFloat(ln.qty_received) || 0;
        const balance  = parseFloat(ln.balance_qty)  || (qtyOrd - qtyRcvd);
        const status   = ln.reception_status || 'Pending';
        const isFullyDone = status === 'Fully Received';
        const balColor = balance <= 0 ? '#059669' : '#DC2626';

        return `<tr style="border-bottom:1px solid #F3F4F6;background:${i % 2 === 0 ? 'white' : '#F9FAFB'};
            ${isFullyDone ? 'opacity:0.65;' : ''}">
          <td style="padding:0.4rem 0.7rem;font-weight:700;color:var(--primary-dark-blue);white-space:nowrap;">
            ${crSafe(ln.order_number)}
          </td>
          <td style="padding:0.4rem 0.5rem;text-align:center;color:#6B7280;">${crSafe(ln.line_no)}</td>
          <td style="padding:0.4rem 0.7rem;font-family:monospace;font-size:0.79rem;font-weight:600;">
            ${crSafe(ln.item_code)}
          </td>
          <td style="padding:0.4rem 0.7rem;max-width:190px;white-space:nowrap;overflow:hidden;
            text-overflow:ellipsis;" title="${crSafe(ln.item_description)}">${crSafe(ln.item_description)}</td>
          <td style="padding:0.4rem 0.6rem;text-align:left;font-size:0.78rem;color:#6B7280;">
            ${crSafe(ln.project_code)}
          </td>
          <td style="padding:0.4rem 0.6rem;text-align:right;font-weight:600;">
            ${qtyOrd || '—'}
          </td>
          <td style="padding:0.4rem 0.6rem;text-align:right;font-weight:600;color:#059669;">
            ${qtyRcvd > 0 ? qtyRcvd : '—'}
          </td>
          <td style="padding:0.4rem 0.6rem;text-align:right;font-weight:700;color:${balColor};">
            ${balance > 0 ? balance : '✅'}
          </td>
          <td style="padding:0.4rem 0.6rem;font-size:0.78rem;color:#6B7280;">${crSafe(ln.batch_no_received)}</td>
          <td style="padding:0.4rem 0.6rem;font-size:0.78rem;color:#6B7280;">${crSafe(ln.exp_date_received)}</td>
          <td style="padding:0.4rem 0.7rem;">${statusBadge(status)}</td>
          <td style="padding:0.4rem 0.7rem;text-align:center;">
            ${isFullyDone
                ? `<span style="font-size:0.78rem;color:#9CA3AF;">Done</span>`
                : `<button onclick="crOpenReceiveLineModal(${ln.line_id})"
                    style="padding:0.25rem 0.65rem;border:1.5px solid #10B981;border-radius:6px;
                      background:#D1FAE5;color:#065F46;font-size:0.78rem;font-weight:600;
                      cursor:pointer;white-space:nowrap;">
                    ✓ Receive
                   </button>`
            }
          </td>
        </tr>`;
    }).join('');
}

function crFilterLocalLines() {
    const search = (document.getElementById('cr-local-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('cr-local-status-filter')?.value || '';
    const filtered = crLocalLines.filter(ln => {
        const matchSearch = !search || [
            ln.order_number, ln.item_code, ln.item_description, ln.project_code
        ].some(v => String(v || '').toLowerCase().includes(search));
        const matchStatus = !status || (ln.reception_status || 'Pending') === status;
        return matchSearch && matchStatus;
    });
    crRenderLocalLinesTable(filtered);
    const statusEl = document.getElementById('cr-local-lines-status');
    if (statusEl) statusEl.textContent = filtered.length < crLocalLines.length
        ? `Showing ${filtered.length} of ${crLocalLines.length} lines`
        : '';
}

function crOpenReceiveLineModal(lineId) {
    const ln = crLocalLines.find(l => l.line_id === lineId);
    if (!ln) return;
    crPendingLine = ln;

    const qtyOrd  = parseFloat(ln.qty_ordered)  || 0;
    const qtyRcvd = parseFloat(ln.qty_received) || 0;
    const balance = qtyOrd - qtyRcvd;

    // Populate info summary
    const info = document.getElementById('cr-line-info');
    if (info) info.innerHTML =
        `<strong>${crSafe(ln.order_number)}</strong> — Line ${crSafe(ln.line_no)}<br>` +
        `<span style="font-weight:700;">${crSafe(ln.item_code)}</span>` +
        (ln.item_description ? ` &nbsp;·&nbsp; ${crSafe(ln.item_description)}` : '') +
        (ln.project_code ? `<br><span style="color:#065F46;">Project: ${crSafe(ln.project_code)}</span>` : '');

    // Qty counters
    const qtyOrdEl   = document.getElementById('cr-line-qty-ordered');
    const qtyPrevEl  = document.getElementById('cr-line-qty-prev');
    const qtyBalEl   = document.getElementById('cr-line-qty-balance');
    if (qtyOrdEl)  qtyOrdEl.textContent  = qtyOrd;
    if (qtyPrevEl) qtyPrevEl.textContent = qtyRcvd || '0';
    if (qtyBalEl)  qtyBalEl.textContent  = balance;

    // Reset inputs
    const qtyInput  = document.getElementById('cr-line-qty-input');
    const expInput  = document.getElementById('cr-line-exp-date');
    const expNa     = document.getElementById('cr-line-exp-na');
    const batchInp  = document.getElementById('cr-line-batch-no');
    const errEl     = document.getElementById('cr-line-error');
    const today     = new Date().toISOString().split('T')[0];
    if (qtyInput)  { qtyInput.value = ''; qtyInput.max = balance; }
    if (expInput)  { expInput.value = ''; expInput.min = today; expInput.style.background = ''; expInput.placeholder = ''; }
    if (expNa)     expNa.value = '';
    if (batchInp)  batchInp.value = ln.batch_no_received || '';
    if (errEl)     errEl.style.display = 'none';

    const modal = document.getElementById('cr-line-modal');
    if (modal) modal.style.display = 'flex';
    setTimeout(() => { if (qtyInput) qtyInput.focus(); }, 100);
}

function crLineReceiveAll() {
    if (!crPendingLine) return;
    const qtyOrd  = parseFloat(crPendingLine.qty_ordered)  || 0;
    const qtyRcvd = parseFloat(crPendingLine.qty_received) || 0;
    const balance = qtyOrd - qtyRcvd;
    const inp = document.getElementById('cr-line-qty-input');
    if (inp) inp.value = balance > 0 ? balance : 0;
}

function crLineSetNA() {
    const expInput = document.getElementById('cr-line-exp-date');
    const expNa    = document.getElementById('cr-line-exp-na');
    const errEl    = document.getElementById('cr-line-error');
    if (expInput)  { expInput.value = ''; expInput.style.background = '#F0FDF4'; expInput.placeholder = 'N/A'; }
    if (expNa)     expNa.value = 'N/A';
    if (errEl)     errEl.style.display = 'none';
}

function crCloseLineModal() {
    const m = document.getElementById('cr-line-modal');
    if (m) m.style.display = 'none';
    crPendingLine = null;
    const expInput = document.getElementById('cr-line-exp-date');
    if (expInput) { expInput.placeholder = ''; expInput.style.background = ''; expInput.value = ''; }
    const expNa = document.getElementById('cr-line-exp-na');
    if (expNa) expNa.value = '';
}

async function crConfirmReceiveLine() {
    if (!crPendingLine) return;

    const qtyInput = document.getElementById('cr-line-qty-input');
    const expInput = document.getElementById('cr-line-exp-date');
    const expNa    = document.getElementById('cr-line-exp-na');
    const batchInp = document.getElementById('cr-line-batch-no');
    const errEl    = document.getElementById('cr-line-error');
    const btn      = document.getElementById('cr-line-confirm-btn');

    const qty      = parseFloat(qtyInput?.value || 0);
    // Date input takes priority over N/A; N/A only counts if no date was typed
    const rawDate  = expInput?.value || '';
    let expDate    = rawDate ? rawDate : (expNa?.value === 'N/A' ? 'N/A' : '');
    const batchNo  = batchInp?.value || '';

    // Validations
    if (!qty || qty <= 0) {
        if (errEl) { errEl.textContent = '⚠️ Please enter a quantity greater than 0'; errEl.style.display = ''; }
        if (qtyInput) qtyInput.focus();
        return;
    }
    if (!expDate) {
        if (errEl) { errEl.textContent = '⚠️ Expiry date is required — enter a date or click N/A'; errEl.style.display = ''; }
        if (expInput) expInput.focus();
        return;
    }
    if (expDate !== 'N/A') {
        const today = new Date().toISOString().split('T')[0];
        if (expDate < today) {
            if (errEl) { errEl.textContent = '⚠️ Expiry date cannot be in the past'; errEl.style.display = ''; }
            if (expInput) expInput.focus();
            return;
        }
    }
    if (errEl) errEl.style.display = 'none';

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Saving…'; }
    try {
        const resp = await fetch('/api/cargo/receive-line', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                line_id:      crPendingLine.line_id,
                qty_received: qty,
                exp_date:     expDate,
                batch_no:     batchNo
            })
        });
        const d = await resp.json();
        if (!d.success) throw new Error(d.message || 'Reception failed');

        crCloseLineModal();

        // Show success feedback
        crShowScanFeedback('✅',
            `Received ${qty} — ${d.reception_number || ''}`,
            '#059669');
        crPlaySound('success');

        // Reload lines
        await crLoadLocalLines();
    } catch (e) {
        if (errEl) { errEl.textContent = '❌ ' + e.message; errEl.style.display = ''; }
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '✅ Receive'; }
    }
}

// ── Utility helpers ───────────────────────────────────────────
function crSafe(v) {
    if (v == null || v === '') return '—';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// For use in onclick attributes — only escapes quotes
function crEsc(v) {
    if (v == null) return '';
    return String(v).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function crStatusMsg(type, text) {
    const bg = type === 'ok' ? '#D1FAE5' : type === 'error' ? '#FEE2E2' : '#EFF6FF';
    const fg = type === 'ok' ? '#065F46' : type === 'error' ? '#991B1B' : '#1E40AF';
    const bd = type === 'ok' ? '#6EE7B7' : type === 'error' ? '#FECACA' : '#BFDBFE';
    return `<div style="background:${bg};color:${fg};border:1px solid ${bd};
        border-radius:6px;padding:0.3rem 0.7rem;font-size:0.8rem;display:inline-block;">${text}</div>`;
}

// ── Change pallet ─────────────────────────────────────────────
async function crChangePallet(parcelNum, currentPallet) {
    const newPallet = prompt(`Change pallet for parcel ${parcelNum}\nCurrent: ${currentPallet || '(none)'}`, currentPallet || '');
    if (newPallet === null) return; // cancelled
    const trimmed = newPallet.trim();
    if (!trimmed) return alert('Pallet number cannot be empty.');
    try {
        const r = await fetch('/api/cargo/change-pallet', {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ parcel_number: parcelNum, new_pallet: trimmed })
        }).then(r => r.json());
        if (!r.success) return alert(r.message || 'Failed to change pallet');
        crLoadData();
    } catch(e) { alert('Error: ' + e.message); }
}

// ── Expose globals ────────────────────────────────────────────
window.initCargoReceptionPage  = initCargoReceptionPage;
window.crAutoReceive           = crAutoReceive;
window.crSaveParcelNote        = crSaveParcelNote;
window.crSwitchMode            = crSwitchMode;
window.crToggleUpload          = crToggleUpload;
window.crLoadData              = crLoadData;
window.crProcessScan           = crProcessScan;
window.crStartReceive          = crStartReceive;
window.crConfirmReceive        = crConfirmReceive;
window.crUnreceive             = crUnreceive;
window.crCloseConfirmModal     = crCloseConfirmModal;
window.crConfirmSetNA          = crConfirmSetNA;
window.crStartNewPallet        = crStartNewPallet;
window.crConfirmNewPallet      = crConfirmNewPallet;
window.crClosePallet           = crClosePallet;
window.crClosePalletModal      = crClosePalletModal;
window.crViewItems             = crViewItems;
window.crCloseItemsModal       = crCloseItemsModal;
window.crClosePreview          = crClosePreview;
window.crShowDataPreview       = crShowDataPreview;
window.crDragOver              = crDragOver;
window.crDragLeave             = crDragLeave;
window.crDropFile              = crDropFile;
window.crHandleFile            = crHandleFile;
window.crFilterParcels         = crFilterParcels;
window.crMergeTrigger          = crMergeTrigger;
window.crClearSession          = crClearSession;
window.crLoadLocalLines        = crLoadLocalLines;
window.crFilterLocalLines      = crFilterLocalLines;
window.crOpenReceiveLineModal  = crOpenReceiveLineModal;
window.crLineReceiveAll        = crLineReceiveAll;
window.crLineSetNA             = crLineSetNA;
window.crCloseLineModal        = crCloseLineModal;
window.crConfirmReceiveLine    = crConfirmReceiveLine;
window.crChangePallet          = crChangePallet;
