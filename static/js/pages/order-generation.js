// ============================================================
//  Order Generation — order-generation.js  v3
//  · Local number format: YY/ProjCode/Family/LPnn
//  · Order Family: Med / Log / Lib
//  · Excel upload for BOTH Local & International
//  · IO order number is editable
//  · Fullscreen lines editor modal
// ============================================================
console.log('✅ Order Generation script loaded');
// NOTE for DB admin: add 'Waiting for Quotation' to the CHECK constraint on
// order_lines.validation_status. Run in DB Browser:
//   ALTER TABLE order_lines RENAME TO order_lines_old;
// Then recreate with updated CHECK — or simply remove the CHECK constraint.
// Quick workaround (removes constraint): see orders_api_routes.py comments.

let ogOrders = [];
let ogFiltered = [];
let ogProjects = [];
let ogCurrentType = 'Local';
let ogEditingId = null;
let ogDeletingId = null;
let ogLineKey = 0;
let ogDirty = false;          // true when editor has unsaved changes
let ogCurrency = 'EUR';       // active currency code for this order (default EUR for humanitarian ops)

function ogSetDirty() { ogDirty = true; }
function ogClearDirty() { ogDirty = false; }

// ISO 4217 currency list — sorted alphabetically by code
const OG_CURRENCIES = {
    AED: { symbol: 'AED', name: 'AED — UAE Dirham' },
    AFN: { symbol: '؋', name: 'AFN — Afghan Afghani' },
    ALL: { symbol: 'L', name: 'ALL — Albanian Lek' },
    AMD: { symbol: '֏', name: 'AMD — Armenian Dram' },
    ANG: { symbol: 'ƒ', name: 'ANG — Netherlands Antillean Guilder' },
    AOA: { symbol: 'Kz', name: 'AOA — Angolan Kwanza' },
    ARS: { symbol: '$', name: 'ARS — Argentine Peso' },
    AUD: { symbol: 'A$', name: 'AUD — Australian Dollar' },
    AWG: { symbol: 'ƒ', name: 'AWG — Aruban Florin' },
    AZN: { symbol: '₼', name: 'AZN — Azerbaijani Manat' },
    BAM: { symbol: 'KM', name: 'BAM — Bosnia-Herzegovina Convertible Mark' },
    BBD: { symbol: 'Bds$', name: 'BBD — Barbadian Dollar' },
    BDT: { symbol: '৳', name: 'BDT — Bangladeshi Taka' },
    BGN: { symbol: 'лв', name: 'BGN — Bulgarian Lev' },
    BHD: { symbol: 'BD', name: 'BHD — Bahraini Dinar' },
    BMD: { symbol: '$', name: 'BMD — Bermudian Dollar' },
    BND: { symbol: 'B$', name: 'BND — Brunei Dollar' },
    BOB: { symbol: 'Bs', name: 'BOB — Bolivian Boliviano' },
    BRL: { symbol: 'R$', name: 'BRL — Brazilian Real' },
    BSD: { symbol: '$', name: 'BSD — Bahamian Dollar' },
    BTN: { symbol: 'Nu', name: 'BTN — Bhutanese Ngultrum' },
    BWP: { symbol: 'P', name: 'BWP — Botswana Pula' },
    BYN: { symbol: 'Br', name: 'BYN — Belarusian Ruble' },
    BZD: { symbol: 'BZ$', name: 'BZD — Belize Dollar' },
    CAD: { symbol: 'CA$', name: 'CAD — Canadian Dollar' },
    CDF: { symbol: 'FC', name: 'CDF — Congolese Franc' },
    CHF: { symbol: 'CHF', name: 'CHF — Swiss Franc' },
    CLP: { symbol: '$', name: 'CLP — Chilean Peso' },
    CNY: { symbol: '¥', name: 'CNY — Chinese Yuan' },
    COP: { symbol: '$', name: 'COP — Colombian Peso' },
    CRC: { symbol: '₡', name: 'CRC — Costa Rican Colón' },
    CUP: { symbol: '$', name: 'CUP — Cuban Peso' },
    CVE: { symbol: '$', name: 'CVE — Cape Verdean Escudo' },
    CZK: { symbol: 'Kč', name: 'CZK — Czech Koruna' },
    DJF: { symbol: 'Fdj', name: 'DJF — Djiboutian Franc' },
    DKK: { symbol: 'kr', name: 'DKK — Danish Krone' },
    DOP: { symbol: 'RD$', name: 'DOP — Dominican Peso' },
    DZD: { symbol: 'دج', name: 'DZD — Algerian Dinar' },
    EGP: { symbol: 'E£', name: 'EGP — Egyptian Pound' },
    ERN: { symbol: 'Nfk', name: 'ERN — Eritrean Nakfa' },
    ETB: { symbol: 'Br', name: 'ETB — Ethiopian Birr' },
    EUR: { symbol: '€', name: 'EUR — Euro' },
    FJD: { symbol: 'FJ$', name: 'FJD — Fijian Dollar' },
    GBP: { symbol: '£', name: 'GBP — British Pound' },
    GEL: { symbol: '₾', name: 'GEL — Georgian Lari' },
    GHS: { symbol: '₵', name: 'GHS — Ghanaian Cedi' },
    GMD: { symbol: 'D', name: 'GMD — Gambian Dalasi' },
    GNF: { symbol: 'FG', name: 'GNF — Guinean Franc' },
    GTQ: { symbol: 'Q', name: 'GTQ — Guatemalan Quetzal' },
    GYD: { symbol: '$', name: 'GYD — Guyanese Dollar' },
    HKD: { symbol: 'HK$', name: 'HKD — Hong Kong Dollar' },
    HNL: { symbol: 'L', name: 'HNL — Honduran Lempira' },
    HRK: { symbol: 'kn', name: 'HRK — Croatian Kuna' },
    HTG: { symbol: 'G', name: 'HTG — Haitian Gourde' },
    HUF: { symbol: 'Ft', name: 'HUF — Hungarian Forint' },
    IDR: { symbol: 'Rp', name: 'IDR — Indonesian Rupiah' },
    ILS: { symbol: '₪', name: 'ILS — Israeli New Shekel' },
    INR: { symbol: '₹', name: 'INR — Indian Rupee' },
    IQD: { symbol: 'ع.د', name: 'IQD — Iraqi Dinar' },
    IRR: { symbol: '﷼', name: 'IRR — Iranian Rial' },
    ISK: { symbol: 'kr', name: 'ISK — Icelandic Króna' },
    JMD: { symbol: 'J$', name: 'JMD — Jamaican Dollar' },
    JOD: { symbol: 'JD', name: 'JOD — Jordanian Dinar' },
    JPY: { symbol: '¥', name: 'JPY — Japanese Yen' },
    KES: { symbol: 'KSh', name: 'KES — Kenyan Shilling' },
    KGS: { symbol: 'с', name: 'KGS — Kyrgystani Som' },
    KHR: { symbol: '៛', name: 'KHR — Cambodian Riel' },
    KMF: { symbol: 'CF', name: 'KMF — Comorian Franc' },
    KPW: { symbol: '₩', name: 'KPW — North Korean Won' },
    KRW: { symbol: '₩', name: 'KRW — South Korean Won' },
    KWD: { symbol: 'KD', name: 'KWD — Kuwaiti Dinar' },
    KYD: { symbol: '$', name: 'KYD — Cayman Islands Dollar' },
    KZT: { symbol: '₸', name: 'KZT — Kazakhstani Tenge' },
    LAK: { symbol: '₭', name: 'LAK — Laotian Kip' },
    LBP: { symbol: 'ل.ل', name: 'LBP — Lebanese Pound' },
    LKR: { symbol: 'Rs', name: 'LKR — Sri Lankan Rupee' },
    LRD: { symbol: '$', name: 'LRD — Liberian Dollar' },
    LSL: { symbol: 'L', name: 'LSL — Lesotho Loti' },
    LYD: { symbol: 'LD', name: 'LYD — Libyan Dinar' },
    MAD: { symbol: 'MAD', name: 'MAD — Moroccan Dirham' },
    MDL: { symbol: 'L', name: 'MDL — Moldovan Leu' },
    MGA: { symbol: 'Ar', name: 'MGA — Malagasy Ariary' },
    MKD: { symbol: 'ден', name: 'MKD — Macedonian Denar' },
    MMK: { symbol: 'K', name: 'MMK — Myanmar Kyat' },
    MNT: { symbol: '₮', name: 'MNT — Mongolian Tögrög' },
    MOP: { symbol: 'P', name: 'MOP — Macanese Pataca' },
    MRU: { symbol: 'UM', name: 'MRU — Mauritanian Ouguiya' },
    MUR: { symbol: 'Rs', name: 'MUR — Mauritian Rupee' },
    MVR: { symbol: 'Rf', name: 'MVR — Maldivian Rufiyaa' },
    MWK: { symbol: 'MK', name: 'MWK — Malawian Kwacha' },
    MXN: { symbol: '$', name: 'MXN — Mexican Peso' },
    MYR: { symbol: 'RM', name: 'MYR — Malaysian Ringgit' },
    MZN: { symbol: 'MT', name: 'MZN — Mozambican Metical' },
    NAD: { symbol: '$', name: 'NAD — Namibian Dollar' },
    NGN: { symbol: '₦', name: 'NGN — Nigerian Naira' },
    NIO: { symbol: 'C$', name: 'NIO — Nicaraguan Córdoba' },
    NOK: { symbol: 'kr', name: 'NOK — Norwegian Krone' },
    NPR: { symbol: 'Rs', name: 'NPR — Nepalese Rupee' },
    NZD: { symbol: 'NZ$', name: 'NZD — New Zealand Dollar' },
    OMR: { symbol: 'ر.ع.', name: 'OMR — Omani Rial' },
    PAB: { symbol: 'B/.', name: 'PAB — Panamanian Balboa' },
    PEN: { symbol: 'S/.', name: 'PEN — Peruvian Sol' },
    PGK: { symbol: 'K', name: 'PGK — Papua New Guinean Kina' },
    PHP: { symbol: '₱', name: 'PHP — Philippine Peso' },
    PKR: { symbol: '₨', name: 'PKR — Pakistani Rupee' },
    PLN: { symbol: 'zł', name: 'PLN — Polish Zloty' },
    PYG: { symbol: '₲', name: 'PYG — Paraguayan Guaraní' },
    QAR: { symbol: 'ر.ق', name: 'QAR — Qatari Riyal' },
    RON: { symbol: 'lei', name: 'RON — Romanian Leu' },
    RSD: { symbol: 'din', name: 'RSD — Serbian Dinar' },
    RUB: { symbol: '₽', name: 'RUB — Russian Ruble' },
    RWF: { symbol: 'RF', name: 'RWF — Rwandan Franc' },
    SAR: { symbol: 'ر.س', name: 'SAR — Saudi Riyal' },
    SBD: { symbol: '$', name: 'SBD — Solomon Islands Dollar' },
    SCR: { symbol: 'Rs', name: 'SCR — Seychellois Rupee' },
    SDG: { symbol: 'ج.س.', name: 'SDG — Sudanese Pound' },
    SEK: { symbol: 'kr', name: 'SEK — Swedish Krona' },
    SGD: { symbol: 'S$', name: 'SGD — Singapore Dollar' },
    SLL: { symbol: 'Le', name: 'SLL — Sierra Leonean Leone' },
    SOS: { symbol: 'Sh', name: 'SOS — Somali Shilling' },
    SRD: { symbol: '$', name: 'SRD — Surinamese Dollar' },
    SSP: { symbol: '£', name: 'SSP — South Sudanese Pound' },
    STN: { symbol: 'Db', name: 'STN — São Tomé & Príncipe Dobra' },
    SVC: { symbol: '₡', name: 'SVC — Salvadoran Colón' },
    SYP: { symbol: '£', name: 'SYP — Syrian Pound' },
    SZL: { symbol: 'L', name: 'SZL — Swazi Lilangeni' },
    THB: { symbol: '฿', name: 'THB — Thai Baht' },
    TJS: { symbol: 'SM', name: 'TJS — Tajikistani Somoni' },
    TMT: { symbol: 'T', name: 'TMT — Turkmenistani Manat' },
    TND: { symbol: 'DT', name: 'TND — Tunisian Dinar' },
    TOP: { symbol: 'T$', name: 'TOP — Tongan Paʻanga' },
    TRY: { symbol: '₺', name: 'TRY — Turkish Lira' },
    TTD: { symbol: 'TT$', name: 'TTD — Trinidad & Tobago Dollar' },
    TWD: { symbol: 'NT$', name: 'TWD — New Taiwan Dollar' },
    TZS: { symbol: 'Sh', name: 'TZS — Tanzanian Shilling' },
    UAH: { symbol: '₴', name: 'UAH — Ukrainian Hryvnia' },
    UGX: { symbol: 'Sh', name: 'UGX — Ugandan Shilling' },
    USD: { symbol: '$', name: 'USD — US Dollar' },
    UYU: { symbol: '$', name: 'UYU — Uruguayan Peso' },
    UZS: { symbol: 'soʻm', name: 'UZS — Uzbekistani Som' },
    VES: { symbol: 'Bs.S', name: 'VES — Venezuelan Bolívar' },
    VND: { symbol: '₫', name: 'VND — Vietnamese Dong' },
    VUV: { symbol: 'Vt', name: 'VUV — Vanuatu Vatu' },
    WST: { symbol: 'T', name: 'WST — Samoan Tālā' },
    XAF: { symbol: 'Fr', name: 'XAF — Central African CFA Franc' },
    XCD: { symbol: '$', name: 'XCD — East Caribbean Dollar' },
    XOF: { symbol: 'Fr', name: 'XOF — West African CFA Franc' },
    XPF: { symbol: 'Fr', name: 'XPF — CFP Franc' },
    YER: { symbol: '﷼', name: 'YER — Yemeni Rial' },
    ZAR: { symbol: 'R', name: 'ZAR — South African Rand' },
    ZMW: { symbol: 'ZK', name: 'ZMW — Zambian Kwacha' },
    ZWL: { symbol: '$', name: 'ZWL — Zimbabwean Dollar' },
};
function ogCurrencySymbol(code) {
    return (OG_CURRENCIES[code] || OG_CURRENCIES['EUR']).symbol;
}
// Populate the currency <select> from OG_CURRENCIES — called on init and after DOM ready
function ogPopulateCurrencySelect() {
    const sel = document.getElementById('og-currency-select');
    if (!sel) return;
    sel.innerHTML = Object.entries(OG_CURRENCIES)
        .map(([code, c]) => `<option value="${code}">${c.symbol} ${c.name}</option>`)
        .join('');
    sel.value = ogCurrency;
}
function ogSetCurrency(code) {
    ogCurrency = code || 'EUR';
    // Re-render column headers so Price/Pk and Total show updated currency symbol
    ogRenderTableHeader(ogCurrentType);
    // Re-render all total_price cells to update symbol display
    document.querySelectorAll('[data-field="total_price"]').forEach(td => {
        const tr = td.closest('tr');
        if (!tr) return;
        const qty = parseFloat(tr.querySelector('[data-field="quantity"]')?.value) || 0;
        const price = parseFloat(tr.querySelector('[data-field="price_per_pack"]')?.value) || 0;
        td.textContent = ogFmtPrice(qty * price);
    });
    ogUpdateTotals();
    ogSetDirty();
}

function ogT(key) {
    // 1. Check window.i18n translations with og_ prefix (JSON keys use og_ prefix)
    const t = window.i18n?.translations;
    if (t) {
        if (t[`og_${key}`]) return t[`og_${key}`];   // e.g. og_val_approved
        if (t[key]) return t[key];             // bare key fallback
    }
    // 2. Fall back to hidden span (English default, updated by i18n system)
    const el = document.getElementById(`og-trans-${key}`);
    if (el) return el.textContent.trim();
    return key;
}

function ogGetColumns(type) {
    const base = [
        { key: 'line_no', label: () => '#', width: '28px' },
        { key: 'item_code', label: () => ogT('col_item_code'), width: '105px', required: true },
        { key: 'item_description', label: () => ogT('col_description'), width: '255px' },
        { key: 'quantity', label: () => ogT('col_qty'), width: '55px', type: 'number' },
        { key: 'packaging', label: () => ogT('col_pack'), width: '65px' },
        { key: 'price_per_pack', label: () => `${ogT('col_price_pk')} (${ogCurrencySymbol(ogCurrency)})`, width: '70px', type: 'number' },
        { key: 'total_price', label: () => `${ogT('col_total')} (${ogCurrencySymbol(ogCurrency)})`, width: '70px', readonly: true },
        { key: 'remarks', label: () => ogT('col_remarks'), width: '95px' },
        {
            key: 'project',
            label: () => type === 'Local' ? ogT('col_project') : '',
            width: type === 'Local' ? '88px' : '0',
            type: type === 'Local' ? 'project' : 'hidden_text'
        },
        { key: 'order_family', type: 'hidden_text', label: () => '' },
    ];
    if (type === 'Local') {
        base.push({ key: 'validation_status', label: () => ogT('col_validation'), width: '142px', type: 'validation' });
    }
    base.push({ key: '_del', label: () => '', width: '26px', type: 'delete' });
    return base;
}

// ── Init ──────────────────────────────────────────────────────
async function initOrderGenerationPage() {
    console.log('🚀 Initialising Order Generation page…');
    await new Promise(r => setTimeout(r, 120));
    ogPopulateCurrencySelect();          // fill currency dropdown before any data loads
    await Promise.all([ogLoadProjects(), ogLoadOrders()]);
    ogSetTodayDate();
}

function ogSetTodayDate() {
    const el = document.getElementById('og-stock-date');
    if (el && !el.value) el.value = new Date().toISOString().split('T')[0];
}

// ── Projects ──────────────────────────────────────────────────
async function ogLoadProjects() {
    try {
        const r = await fetch('/api/projects');
        const d = await r.json();
        if (d.success) { ogProjects = d.data || []; ogRefreshProjectDropdowns(); }
    } catch (e) { console.warn('Projects not loaded:', e.message); }
}

function ogRefreshProjectDropdowns() {
    // Build option HTML using mission_details.mission_name (nested or flat)
    const makeOpt = (p, selected = '') => {
        const code = p.project_code || p.code || '';
        const name = ogMissionName(p);
        const label = name ? `${code} — ${name}` : code;
        return `<option value="${ogEsc(code)}" ${code === selected ? 'selected' : ''}>${ogEsc(label)}</option>`;
    };

    // Filter dropdown in list view only
    const fp = document.getElementById('og-filter-project');
    if (fp) {
        fp.innerHTML = `<option value="">All Projects</option>` +
            ogProjects.map(p => makeOpt(p)).join('');
    }

    // Header project dropdown in editor — populate but visibility
    // is controlled by ogSwitchType (hidden for Local, shown for IO)
    const hp = document.getElementById('og-header-project');
    if (hp) {
        const cur = hp.value;
        hp.innerHTML = `<option value="">— Select Project —</option>` +
            ogProjects.map(p => makeOpt(p, cur)).join('');
    }
}

// ── Mission detail helpers ───────────────────────────────────
// /api/projects now JOINs mission_details and returns mission_abbreviation
// and mission_name as flat fields on every project row.
function ogMissionAbbrev(proj) {
    if (!proj) return 'XXX';
    // Flat fields joined from mission_details table
    return proj.mission_abbreviation || proj.mission_abbrev || proj.abbreviation || proj.abbrev || proj.short_code || 'XXX';
}
function ogMissionName(proj) {
    if (!proj) return '';
    // mission_name joined from mission_details; fall back to project_name
    return proj.mission_name || proj.project_name || proj.name || '';
}
function ogFindProjByCode(code) {
    if (!code) return ogProjects[0] || null;   // for Local: any project carries the same mission fields
    return ogProjects.find(p => (p.project_code || p.code) === code) || ogProjects[0] || null;
}

// ── Order number: YY/MissionAbbrev/Family/LPnn ──────────────
function ogGetMissionAbbrev() {
    // For Local: project is per-line — read from first line's project select.
    // For IO: read from the header project dropdown.
    let projCode = '';
    if (ogCurrentType === 'Local') {
        const firstLineSel = document.querySelector('#og-lines-tbody select[data-field="project"]');
        projCode = firstLineSel?.value || '';
        // If no lines yet, use first project in the list
        if (!projCode && ogProjects.length) {
            projCode = ogProjects[0].project_code || ogProjects[0].code || '';
        }
    } else {
        projCode = document.getElementById('og-header-project')?.value || '';
    }
    // Use helper that handles both nested mission_details object and flat fields
    const proj = ogFindProjByCode(projCode);
    const abbrev = ogMissionAbbrev(proj);
    return abbrev || 'XXX';
}

async function ogBuildLocalNum() {
    const abbrev = ogGetMissionAbbrev();
    const family = document.getElementById('og-order-family')?.value || 'Med';
    const yy = String(new Date().getFullYear()).slice(-2);
    try {
        const r = await fetch(`/api/orders/next-number?type=Local&project=${encodeURIComponent(abbrev)}&family=${encodeURIComponent(family)}`);
        const d = await r.json();
        if (d.success) return d.order_number;
    } catch (e) { /* fallback below */ }
    const seq = String(ogOrders.filter(o =>
        o.order_type === 'Local' &&
        (o.order_number || '').startsWith(`${yy}/${abbrev}/${family}/`)
    ).length + 1).padStart(2, '0');
    return `${yy}/${abbrev}/${family}/LP${seq}`;
}

async function ogUpdateLocalNum() {
    if (ogCurrentType !== 'Local' || ogEditingId) return;
    const num = await ogBuildLocalNum();
    const el = document.getElementById('og-order-number');
    if (el) el.value = num;
}

// ── Load orders ───────────────────────────────────────────────
async function ogLoadOrders() {
    const tbody = document.getElementById('og-orders-tbody');
    try {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:2rem;color:#9CA3AF;">⏳ Loading…</td></tr>`;
        const r = await fetch('/api/orders');
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d = await r.json();
        if (!d.success) throw new Error(d.message);
        ogOrders = d.orders || [];
        ogFiltered = [...ogOrders];
        ogRenderList();
        ogUpdateStats();
    } catch (e) {
        console.error('❌ load orders', e);
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:2rem;color:#EF4444;">❌ ${e.message}</td></tr>`;
    }
}

function ogUpdateStats() {
    const lines = ogOrders.flatMap(o => o.lines || []);
    const s = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    s('og-stat-total', ogOrders.length);
    s('og-stat-local', ogOrders.filter(o => o.order_type === 'Local').length);
    s('og-stat-intl', ogOrders.filter(o => o.order_type === 'International').length);
    s('og-stat-pending', lines.filter(l => l.validation_status === 'Requested').length);
    s('og-stat-approved', lines.filter(l => l.validation_status === 'Approved').length);
}

function ogRenderList() {
    const tbody = document.getElementById('og-orders-tbody');
    if (!tbody) return;
    if (!ogFiltered.length) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:3rem;color:#9CA3AF;">
            <div style="font-size:3rem;">📋</div><p data-i18n='og_no_orders'>No orders yet</p>
            <p style="font-size:0.85rem;" data-i18n="og_click_new_order">Click "New Order" to get started</p></td></tr>`;
        return;
    }
    const famColors = { Med: ['#FEF3C7', '#92400E'], Log: ['#DCFCE7', '#166534'], Lib: ['#EDE9FE', '#6D28D9'] };
    tbody.innerHTML = ogFiltered.map(o => {
        const isL = o.order_type === 'Local';
        const badge = isL
            ? `<span style="background:#EDE9FE;color:#6D28D9;padding:0.13rem 0.45rem;border-radius:8px;font-size:0.77rem;font-weight:600;">🏪 ${ogT('stat_local')}</span>`
            : `<span style="background:#E0F2FE;color:#0284C7;padding:0.13rem 0.45rem;border-radius:8px;font-size:0.77rem;font-weight:600;">🌍 ${ogT('stat_intl')}</span>`;
        const [fbg, ftc] = famColors[o.order_family] || ['#F3F4F6', '#6B7280'];
        const famBadge = o.order_family
            ? `<span style="background:${fbg};color:${ftc};padding:0.1rem 0.4rem;border-radius:5px;font-size:0.73rem;font-weight:600;">${ogEsc(o.order_family)}</span>`
            : '—';
        const updatedAt = o.updated_at || o.created_at;
        const updBadge = updatedAt
            ? `<span style="font-size:0.75rem;color:#6B7280;">${ogFmtDate(updatedAt)}</span>`
            : '—';
        return `<tr style="border-bottom:1px solid var(--border-light);" onmouseover="this.style.background='#F9FAFB'" onmouseout="this.style.background=''">
            <td style="padding:0.6rem 0.65rem;"><span style="font-weight:700;color:var(--primary-dark-blue);cursor:pointer;font-size:0.88rem;" onclick="ogEditOrder(${o.order_id})">${ogEsc(o.order_number)}</span></td>
            <td style="padding:0.6rem 0.65rem;">${badge}</td>
            <td style="padding:0.6rem 0.65rem;">${famBadge}</td>
            <td style="padding:0.6rem 0.65rem;font-size:0.85rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${ogEsc(o.order_description || '—')}</td>
            <td style="padding:0.6rem 0.65rem;font-size:0.82rem;color:#6B7280;white-space:nowrap;">${ogFmtDate(o.stock_date)}</td>
            <td style="padding:0.6rem 0.65rem;font-size:0.82rem;color:#6B7280;white-space:nowrap;">${ogFmtDate(o.requested_delivery_date)}</td>
            <td style="padding:0.6rem 0.65rem;text-align:center;">${updBadge}</td>
            <td style="padding:0.6rem 0.65rem;text-align:center;"><span style="background:#EFF6FF;color:#1D4ED8;padding:0.13rem 0.5rem;border-radius:8px;font-weight:600;font-size:0.82rem;">${(o.lines || []).length}</span></td>
            <td style="padding:0.6rem 0.65rem;text-align:center;">
                <div style="display:flex;gap:0.25rem;justify-content:center;flex-wrap:wrap;">
                    <button onclick="ogEditOrder(${o.order_id})" title="${ogT('tooltip_edit')}"
                        style="background:#FFFBEB;color:#92400E;border:1px solid #FDE68A;border-radius:5px;padding:0.28rem 0.45rem;cursor:pointer;font-size:0.83rem;">✏️</button>
                    <button onclick="ogOpenDeleteModal(${o.order_id})" title="${ogT('tooltip_delete')}"
                        style="background:#FEF2F2;color:#991B1B;border:1px solid #FECACA;border-radius:5px;padding:0.28rem 0.45rem;cursor:pointer;font-size:0.83rem;">🗑️</button>
                    <button onclick="ogExportOrder(${o.order_id})" title="${ogT('tooltip_export')}"
                        style="background:#F0FDF4;color:#166534;border:1px solid #BBF7D0;border-radius:5px;padding:0.28rem 0.45rem;cursor:pointer;font-size:0.83rem;">📥</button>
                    <button onclick="ogShareOrderByEmail(${o.order_id})" title="${ogT('tooltip_email')}"
                        style="background:#EFF6FF;color:#1D4ED8;border:1px solid #BFDBFE;border-radius:5px;padding:0.28rem 0.45rem;cursor:pointer;font-size:0.83rem;">📧</button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function ogFilterOrders() {
    const type = document.getElementById('og-filter-type')?.value || '';
    const proj = document.getElementById('og-filter-project')?.value || '';
    const search = (document.getElementById('og-search')?.value || '').toLowerCase();
    ogFiltered = ogOrders.filter(o => {
        if (type && o.order_type !== type) return false;
        if (proj && !(o.lines || []).some(l => l.project === proj)) return false;
        if (search && !`${o.order_number} ${o.order_description}`.toLowerCase().includes(search)) return false;
        return true;
    });
    ogRenderList();
}

function ogClearFilters() {
    ['og-filter-type', 'og-filter-project', 'og-search'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ogFiltered = [...ogOrders]; ogRenderList();
}

// ── New / Edit ────────────────────────────────────────────────
async function ogNewOrder() {
    ogEditingId = null;
    document.getElementById('og-editor-title').textContent = ogT('new_order_title');
    document.getElementById('og-order-number').value = '';
    document.getElementById('og-order-desc').value = '';
    document.getElementById('og-delivery-date').value = '';
    document.getElementById('og-order-family').value = 'Med';
    ogSetTodayDate();
    ogClearAllLines();
    ogRefreshProjectDropdowns();
    await ogSwitchType('Local', false);
    await ogUpdateLocalNum();
    // Default currency EUR
    ogCurrency = 'EUR';
    ogPopulateCurrencySelect();
    ogClearDirty();
    ogShowEditor();
}

async function ogEditOrder(orderId) {
    try {
        const r = await fetch(`/api/orders/${orderId}`);
        const d = await r.json();
        if (!d.success) throw new Error(d.message);
        const o = d.order;
        ogEditingId = orderId;
        document.getElementById('og-editor-title').textContent = ogT('edit_order_title') + ' — ' + o.order_number;
        document.getElementById('og-order-number').value = o.order_number || '';
        document.getElementById('og-order-desc').value = o.order_description || '';
        document.getElementById('og-stock-date').value = o.stock_date || '';
        document.getElementById('og-delivery-date').value = o.requested_delivery_date || '';
        ogRefreshProjectDropdowns();
        await ogSwitchType(o.order_type || 'Local', false);
        const projSel = document.getElementById('og-header-project');
        const famSel = document.getElementById('og-order-family');
        if (projSel) projSel.value = o.order_project || '';
        if (famSel) famSel.value = o.order_family || 'Med';
        // Load saved currency
        ogCurrency = o.currency || 'EUR';
        ogPopulateCurrencySelect();
        const numEl = document.getElementById('og-order-number');
        numEl.readOnly = (o.order_type === 'Local');
        numEl.style.background = (o.order_type === 'Local') ? '#F9FAFB' : 'white';
        ogClearAllLines();
        (o.lines || []).forEach(l => ogAddLine(l));
        ogUpdateTotals();
        ogClearDirty();
        ogShowEditor();
    } catch (e) { ogNotify(ogT('error_loading') + ': ' + e.message, 'error'); }
}

function ogShowEditor() {
    document.getElementById('og-list-section').style.display = 'none';
    document.getElementById('og-editor-section').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Attach dirty-tracking to all header inputs/selects
    ['og-order-desc', 'og-stock-date', 'og-delivery-date', 'og-order-family', 'og-header-project'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeEventListener('input', ogSetDirty); el.removeEventListener('change', ogSetDirty);
            el.addEventListener('input', ogSetDirty); el.addEventListener('change', ogSetDirty);
        }
    });
}

function ogCloseEditor() {
    if (ogDirty) {
        if (!confirm(ogT('unsaved_warning'))) return;
    }
    ogClearDirty();
    document.getElementById('og-editor-section').style.display = 'none';
    document.getElementById('og-list-section').style.display = 'block';
    ogEditingId = null;
}

// ── Switch type ───────────────────────────────────────────────
async function ogSwitchType(type, generateNum = true) {
    // When editing an existing order, type is locked — prevents order-number corruption
    if (ogEditingId && type !== ogCurrentType) {
        ogNotify(ogT('type_locked'), 'error');
        return;
    }
    ogCurrentType = type;
    const ON = 'background:linear-gradient(135deg,var(--mid-blue),var(--cyan-flow));color:white;border:none;';
    const OFF = 'background:white;color:#6B7280;border:1px solid #E5E7EB;';
    // When editing, the inactive tab is visually locked (dimmed, not-allowed cursor)
    const LOCK = 'background:#F3F4F6;color:#D1D5DB;border:1px solid #E5E7EB;cursor:not-allowed;opacity:0.55;';
    const base = 'padding:0.65rem 1.75rem;border-radius:0;font-weight:600;font-size:0.95rem;transition:all 0.2s;cursor:pointer;';
    const tL = document.getElementById('og-tab-local');
    const tI = document.getElementById('og-tab-intl');
    const isEditing = !!ogEditingId;
    if (tL) tL.setAttribute('style', (type === 'Local' ? ON : (isEditing ? LOCK : OFF)) + base);
    if (tI) tI.setAttribute('style', (type === 'International' ? ON : (isEditing ? LOCK : OFF)) + base);

    const exLabel = document.getElementById('og-excel-type-label');
    if (exLabel) exLabel.textContent = type === 'Local' ? 'Local' : 'International';

    const numEl = document.getElementById('og-order-number');
    const numBadge = document.getElementById('og-num-badge');
    if (numEl && !ogEditingId) {
        if (type === 'Local') {
            numEl.readOnly = true;
            numEl.style.background = '#F9FAFB';
            numEl.placeholder = '';
            if (numBadge) { numBadge.textContent = 'Auto'; numBadge.style.display = ''; }
        } else {
            numEl.readOnly = false;
            numEl.style.background = 'white';
            numEl.value = '';
            numEl.placeholder = 'Enter IO reference…';
            if (numBadge) numBadge.style.display = 'none';
        }
    }

    const famGroup = document.getElementById('og-order-family')?.closest('.form-group');
    if (famGroup) famGroup.style.opacity = (type === 'Local') ? '1' : '0.45';

    // Hide project dropdown in header for Local orders — not needed there
    // (project is selected per-line for Local, and mission_abbrev comes from projects API)
    const projGroup = document.getElementById('og-header-project')?.closest('.form-group');
    if (projGroup) projGroup.style.display = (type === 'Local') ? 'none' : '';

    ogRenderTableHeader(type);
    ogClearAllLines();
    if (generateNum && type === 'Local') await ogUpdateLocalNum();
}

function ogRenderTableHeader(type) {
    const thead = document.getElementById('og-lines-thead');
    if (!thead) return;
    const cols = ogGetColumns(type).filter(c => c.type !== 'hidden_text');
    // Add colgroup to parent table for fixed widths
    const tbl = document.getElementById('og-lines-table');
    if (tbl) {
        let cg = tbl.querySelector('colgroup');
        if (!cg) { cg = document.createElement('colgroup'); tbl.prepend(cg); }
        cg.innerHTML = cols.map(c => `<col style="width:${c.width || 'auto'};">`).join('');
    }
    thead.innerHTML = `<tr style="background:linear-gradient(135deg,#1E3A5F,#374151);color:white;position:sticky;top:0;z-index:2;">` +
        cols.map(c =>
            `<th style="padding:0.45rem 0.4rem;text-align:left;font-size:0.77rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${typeof c.label === 'function' ? c.label() : c.label}</th>`
        ).join('') + `</tr>`;
}

// ── Lines ─────────────────────────────────────────────────────
function ogAddLine(data = {}, targetTbodyId = 'og-lines-tbody') {
    const tbody = document.getElementById(targetTbodyId);
    const emptyRow = document.getElementById('og-empty-row');
    if (!tbody) return;
    if (emptyRow && targetTbodyId === 'og-lines-tbody') emptyRow.style.display = 'none';

    // Auto-inherit project and order_family from header if not in data
    const headerProject = document.getElementById('og-header-project')?.value || '';
    const headerFamily = document.getElementById('og-order-family')?.value || '';
    if (!data.project) data.project = headerProject;
    if (!data.order_family) data.order_family = headerFamily;

    ogLineKey++;
    const k = ogLineKey;
    const cols = ogGetColumns(ogCurrentType);
    const lineNo = tbody.querySelectorAll('tr:not(#og-empty-row)').length + 1;

    const tr = document.createElement('tr');
    tr.setAttribute('data-key', k);
    tr.style.cssText = 'border-bottom:1px solid #E5E7EB;';
    tr.onmouseover = () => tr.style.background = '#F8FAFF';
    tr.onmouseout = () => tr.style.background = '';

    tr.innerHTML = cols.map(col => {
        const val = data[col.key] ?? '';
        if (col.type === 'delete') return `<td style="padding:0.28rem;text-align:center;"><button onclick="ogRemoveLine(${k})" style="background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;border-radius:4px;padding:0.2rem 0.38rem;cursor:pointer;font-size:0.82rem;">✕</button></td>`;
        if (col.key === 'line_no') return `<td style="padding:0.42rem 0.5rem;text-align:center;font-weight:700;color:#9CA3AF;font-size:0.8rem;" data-field="line_no">${lineNo}</td>`;
        if (col.key === 'total_price') return `<td style="padding:0.42rem 0.5rem;text-align:right;font-weight:700;color:var(--primary-dark-blue);font-size:0.83rem;" data-field="total_price">${ogFmtPrice(val)}</td>`;
        // Hidden text fields (project, order_family) — stored as hidden inputs, not shown in table
        if (col.type === 'hidden_text') return `<td style="display:none;"><input type="hidden" data-field="${col.key}" value="${ogEsc(String(val))}"></td>`;
        if (col.type === 'project') {
            const opts = ogProjects.map(p => {
                const code = p.project_code || p.code || '';
                const mName = ogMissionName(p);
                const label = code + (mName ? ' – ' + mName : '');
                return `<option value="${ogEsc(code)}" ${code === val ? 'selected' : ''}>${ogEsc(label)}</option>`;
            }).join('');
            return `<td style="padding:0.22rem 0.25rem;"><select data-field="project" style="width:100%;padding:0.28rem;border:1px solid #D1D5DB;border-radius:4px;font-size:0.76rem;background:white;" onchange="ogUpdateLocalNum()"><option value=''>${ogT('select_project_opt')}</option>${opts}</select></td>`;
        }
        if (col.type === 'validation') return `<td style="padding:0.22rem 0.3rem;" data-field="validation_status">${ogRenderValCell(k, val)}</td>`;
        if (col.type === 'number') return `<td style="padding:0.22rem 0.25rem;"><input type="number" data-field="${col.key}" value="${val}" min="0" step="any" onchange="ogLineChanged(${k})" style="width:100%;padding:0.28rem;border:1px solid #D1D5DB;border-radius:4px;font-size:0.78rem;text-align:right;"></td>`;
        return `<td style="padding:0.22rem 0.25rem;"><input type="text" data-field="${col.key}" value="${ogEsc(String(val))}" style="width:100%;padding:0.28rem;border:1px solid #D1D5DB;border-radius:4px;font-size:0.78rem;" ${col.key === 'remarks' ? 'placeholder="…"' : ''}></td>`;
    }).join('');

    tbody.appendChild(tr);
    ogUpdateLineNumbers(targetTbodyId);
    ogUpdateTotals();
    ogSetDirty();
}

function ogRenderValCell(key, currentVal) {
    const steps = [
        { val: 'Waiting for Quotation', icon: '💬', label: ogT('val_waiting_quote'), color: '#92400E', bg: '#FEF3C7' },
        { val: 'Requested', icon: '📨', label: ogT('val_requested'), color: '#1D4ED8', bg: '#DBEAFE' },
        { val: 'Approved', icon: '✅', label: ogT('val_approved'), color: '#065F46', bg: '#D1FAE5' },
        { val: 'Rejected', icon: '❌', label: ogT('val_rejected'), color: '#991B1B', bg: '#FEE2E2' },
        { val: 'Shared with Supply', icon: '📤', label: ogT('val_with_supply'), color: '#6D28D9', bg: '#EDE9FE' },
    ];
    return `<div style="display:flex;flex-direction:column;gap:0.08rem;">` +
        steps.map(s => {
            const a = currentVal === s.val;
            const sty = a ? `background:${s.bg};color:${s.color};border:1px solid ${s.color};font-weight:700;`
                : 'background:#F9FAFB;color:#9CA3AF;border:1px solid #E5E7EB;';
            return `<button type="button" data-val="${s.val}" onclick="ogToggleValidation(${key},'${s.val}')"
                style="${sty}border-radius:3px;padding:0.07rem 0.22rem;cursor:pointer;font-size:0.63rem;
                       display:flex;align-items:center;gap:0.12rem;white-space:nowrap;width:100%;line-height:1.25;">
                <span style="font-size:0.58rem;">${s.icon}</span><span>${s.label}</span></button>`;
        }).join('') + `</div>`;
}

function ogToggleValidation(key, clicked) {
    const tr = document.querySelector(`tr[data-key="${key}"]`);
    if (!tr) return;
    const cell = tr.querySelector('[data-field="validation_status"]');
    if (!cell) return;
    let hv = tr.querySelector('input[data-hidden-val]');
    if (!hv) {
        hv = document.createElement('input'); hv.type = 'hidden';
        hv.setAttribute('data-hidden-val', '1'); hv.setAttribute('data-field', 'validation_status');
        tr.appendChild(hv);
    }
    hv.value = (hv.value === clicked) ? '' : clicked;
    cell.innerHTML = ogRenderValCell(key, hv.value);
}

function ogLineChanged(key) {
    ogSetDirty();
    const tr = document.querySelector(`tr[data-key="${key}"]`);
    if (!tr) return;
    const qty = parseFloat(tr.querySelector('[data-field="quantity"]')?.value) || 0;
    const price = parseFloat(tr.querySelector('[data-field="price_per_pack"]')?.value) || 0;
    const total = tr.querySelector('[data-field="total_price"]');
    if (total) total.textContent = ogFmtPrice(qty * price);
    ogUpdateTotals(); ogUpdateFsTotals();
}

function ogRemoveLine(key) {
    ogSetDirty();
    const tr = document.querySelector(`tr[data-key="${key}"]`);
    if (tr) tr.remove();
    ['og-lines-tbody', 'og-fs-lines'].forEach(id => ogUpdateLineNumbers(id));
    ogUpdateTotals(); ogUpdateFsTotals();
    const tbody = document.getElementById('og-lines-tbody');
    if (tbody && !tbody.querySelectorAll('tr:not(#og-empty-row)').length) {
        const er = document.getElementById('og-empty-row'); if (er) er.style.display = '';
    }
}

function ogClearAllLines() {
    ['og-lines-tbody', 'og-fs-lines'].forEach(id => {
        const t = document.getElementById(id);
        if (t) t.querySelectorAll('tr:not(#og-empty-row)').forEach(r => r.remove());
    });
    const er = document.getElementById('og-empty-row'); if (er) er.style.display = '';
    ogUpdateTotals(); ogUpdateFsTotals();
}

function ogUpdateLineNumbers(tbodyId = 'og-lines-tbody') {
    const tbody = document.getElementById(tbodyId); if (!tbody) return;
    tbody.querySelectorAll('tr:not(#og-empty-row)').forEach((tr, i) => {
        const c = tr.querySelector('[data-field="line_no"]'); if (c) c.textContent = i + 1;
    });
    const cnt = tbody.querySelectorAll('tr:not(#og-empty-row)').length;
    const el = document.getElementById('og-line-count'); if (el) el.textContent = cnt;
}

function ogUpdateTotals() {
    const tbody = document.getElementById('og-lines-tbody'); if (!tbody) return;
    let tQ = 0, tP = 0;
    tbody.querySelectorAll('tr:not(#og-empty-row)').forEach(tr => {
        tQ += parseFloat(tr.querySelector('[data-field="quantity"]')?.value) || 0;
        tP += parseFloat((tr.querySelector('[data-field="total_price"]')?.textContent || '').replace(/,/g, '')) || 0;
    });
    const cnt = tbody.querySelectorAll('tr:not(#og-empty-row)').length;
    const bar = document.getElementById('og-totals-bar'); if (bar) bar.style.display = cnt ? 'flex' : 'none';
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('og-total-lines-label', cnt); set('og-total-qty', ogFmtNum(tQ)); set('og-total-price', ogFmtPrice(tP)); set('og-line-count', cnt);
}

function ogUpdateFsTotals() {
    const tbody = document.getElementById('og-fs-lines'); if (!tbody) return;
    let tQ = 0, tP = 0;
    tbody.querySelectorAll('tr:not(#og-empty-row)').forEach(tr => {
        tQ += parseFloat(tr.querySelector('[data-field="quantity"]')?.value) || 0;
        tP += parseFloat((tr.querySelector('[data-field="total_price"]')?.textContent || '').replace(/,/g, '')) || 0;
    });
    const cnt = tbody.querySelectorAll('tr:not(#og-empty-row)').length;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('og-fs-line-count', cnt); set('og-fs-total-qty', ogFmtNum(tQ)); set('og-fs-total-price', ogFmtNum(tP));
}

function ogGetLines(tbodyId = 'og-lines-tbody') {
    const tbody = document.getElementById(tbodyId); if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr:not(#og-empty-row)')).map(tr => {
        const get = f => { const el = tr.querySelector(`[data-field="${f}"]`); return el ? (el.value ?? el.textContent ?? '').toString().trim() : ''; };
        // total_price cell may contain currency symbol — strip it for numeric parse
        const qty = parseFloat(get('quantity')) || 0, price = parseFloat(get('price_per_pack')) || 0;
        const hv = tr.querySelector('input[data-hidden-val]');
        let val = hv ? hv.value : '';
        if (!val) {
            const vc = tr.querySelector('[data-field="validation_status"]');
            if (vc) { const ab = Array.from(vc.querySelectorAll('button[data-val]')).find(b => b.style.background && !b.style.background.includes('249, 250, 251')); if (ab) val = ab.getAttribute('data-val') || ''; }
        }
        return {
            item_code: get('item_code'),
            item_description: get('item_description'),
            quantity: qty,
            project: get('project'),
            order_family: get('order_family'),
            packaging: get('packaging'),
            price_per_pack: price,
            // total_price omitted — it is VIRTUAL GENERATED in SQLite, server must not INSERT it
            validation_status: val || null,
            remarks: get('remarks'),
        };
    });
}

// ── Save ──────────────────────────────────────────────────────
async function ogSaveOrder() {
    if (document.getElementById('og-fullscreen-modal')?.style.display === 'flex') ogSyncFsToMain();
    const num = document.getElementById('og-order-number').value.trim();
    const desc = document.getElementById('og-order-desc').value.trim();
    const sDate = document.getElementById('og-stock-date').value;
    const dDate = document.getElementById('og-delivery-date').value;
    const fam = document.getElementById('og-order-family')?.value || '';
    const lines = ogGetLines();
    // For International, project is from the header dropdown; for Local, it comes per-line
    let proj = document.getElementById('og-header-project')?.value || '';
    if (ogCurrentType === 'Local' && !proj) {
        // Derive from the first line that has a project set
        proj = lines.find(l => l.project)?.project || '';
    }
    // All header fields are mandatory
    if (!num) { ogHighlight('og-order-number'); ogNotify(ogT('order_num_required'), 'error'); return; }
    if (!proj && ogCurrentType !== 'Local') { ogHighlight('og-header-project'); ogNotify(ogT('project_required'), 'error'); return; }
    if (!desc) { ogHighlight('og-order-desc'); ogNotify(ogT('desc_required'), 'error'); return; }
    if (!sDate) { ogHighlight('og-stock-date'); ogNotify(ogT('stock_date_required'), 'error'); return; }
    if (!dDate) { ogHighlight('og-delivery-date'); ogNotify(ogT('delivery_required'), 'error'); return; }
    if (!lines.length) { ogNotify(ogT('at_least_one_line'), 'error'); return; }
    if (lines.some(l => !l.item_code)) { ogNotify(ogT('item_code_required'), 'error'); return; }
    if (lines.some(l => l.quantity <= 0)) { ogNotify(ogT('qty_required'), 'error'); return; }
    const btn = document.getElementById('og-save-btn'), orig = btn.innerHTML;
    try {
        btn.disabled = true; btn.innerHTML = ogT('saving');
        const url = ogEditingId ? `/api/orders/${ogEditingId}` : '/api/orders';
        // Stamp header values onto every line before saving
        const today = new Date().toISOString().split('T')[0];
        const stampedLines = lines.map(l => ({
            ...l,
            // For Local orders, preserve each line's own project; for IO, use header project
            project: ogCurrentType === 'Local' ? (l.project || proj) : proj,
            order_family: fam,
            order_description: desc,
            order_generation_date: today,
            requested_delivery_date: dDate || null,
        }));
        const r = await fetch(url, {
            method: ogEditingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_number: num, order_type: ogCurrentType, order_description: desc, order_family: fam, order_project: proj, stock_date: sDate, requested_delivery_date: dDate || null, order_generation_date: today, currency: ogCurrency, lines: stampedLines })
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.message || 'Save failed');
        ogClearDirty(); ogNotify(ogT('order_saved'), 'success'); ogCloseEditor(); await ogLoadOrders();
    } catch (e) { ogNotify(ogT('error_saving') + ': ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = orig; }
}

// ── Fullscreen ────────────────────────────────────────────────
function ogOpenFullscreen() {
    // Toggle the lines table between normal height and expanded height
    const wrapper = document.getElementById('og-lines-wrapper');
    const btn = document.querySelector('[onclick="ogOpenFullscreen()"]');
    if (!wrapper) return;
    const isExpanded = wrapper.getAttribute('data-expanded') === '1';
    if (isExpanded) {
        wrapper.style.maxHeight = '45vh';
        wrapper.removeAttribute('data-expanded');
        if (btn) { btn.innerHTML = ogT('expand'); btn.title = 'Expand lines editor'; }
    } else {
        wrapper.style.maxHeight = 'calc(100vh - 280px)';
        wrapper.setAttribute('data-expanded', '1');
        if (btn) { btn.innerHTML = ogT('collapse'); btn.title = 'Collapse lines editor'; }
    }
}

function ogSyncFsToMain() { /* no-op: fullscreen modal removed, table is now in-page */ }

function ogCloseFullscreen() {
    ogOpenFullscreen(); // Just toggles collapse
}

function ogFsAddLine() { ogAddLine(); } // fullscreen removed, delegate to normal add

function ogFsClearAll() { ogClearAllLines(); } // fullscreen removed

// ── Excel ─────────────────────────────────────────────────────
function ogHandleDrop(event) {
    event.preventDefault();
    // Reset both possible drop zone element ids
    ['og-drop-zone', 'og-excel-pill'].forEach(id => {
        const dz = document.getElementById(id);
        if (dz) { dz.style.borderColor = 'var(--border-light)'; dz.style.background = ''; }
    });
    const file = event.dataTransfer.files[0]; if (file) ogProcessExcel(file);
}
function ogHandleExcelUpload(event) {
    const file = event.target.files[0]; if (file) ogProcessExcel(file); event.target.value = '';
}

async function ogProcessExcel(file) {
    const s = document.getElementById('og-upload-status');
    if (s) s.innerHTML = `<p style="color:#6B7280;font-size:0.88rem;">⏳ Reading…</p>`;
    try {
        if (typeof XLSX === 'undefined') await ogLoadSheetJS();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        if (rows.length < 2) throw new Error('File appears empty');
        const hdrs = rows[0].map(h => String(h).toLowerCase().trim());
        const col = (...cc) => { for (const c of cc) { const i = hdrs.findIndex(h => h.includes(c)); if (i >= 0) return i; } return -1; };
        const map = {
            item_code: col('item code', 'item_code', 'code'), item_description: col('item description', 'description', 'item desc'),
            packaging: col('packaging', 'pack'), price_per_pack: col('price/pack', 'price per pack', 'unit price'),
            total_price: col('total price', 'total_price', 'total'), quantity: col('confirmed qty', 'confirmed_qty', 'qty', 'quantity')
        };
        ogClearAllLines();
        let n = 0;
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i]; if (row.every(c => c === '' || c == null)) continue;
            const ld = {
                item_code: map.item_code >= 0 ? String(row[map.item_code] || '').trim() : '',
                item_description: map.item_description >= 0 ? String(row[map.item_description] || '').trim() : '',
                packaging: map.packaging >= 0 ? String(row[map.packaging] || '').trim() : '',
                price_per_pack: map.price_per_pack >= 0 ? parseFloat(row[map.price_per_pack]) || 0 : 0,
                total_price: map.total_price >= 0 ? parseFloat(row[map.total_price]) || 0 : 0,
                quantity: map.quantity >= 0 ? parseFloat(row[map.quantity]) || 0 : 0
            };
            if (!ld.item_code && !ld.item_description) continue;
            ogAddLine(ld); n++;
        }
        if (s) {
            s.innerHTML = `<div style="background:#D1FAE5;color:#065F46;border:1px solid #6EE7B7;border-radius:6px;padding:0.35rem 0.75rem;font-size:0.82rem;">✅ <strong>${n}</strong> ${ogT("lines_imported")}</div>`;
            setTimeout(() => { s.innerHTML = ''; }, 4000);
        }
    } catch (e) {
        if (s) {
            s.innerHTML = `<div style="background:#FEE2E2;color:#991B1B;border:1px solid #FECACA;border-radius:6px;padding:0.35rem 0.75rem;font-size:0.82rem;">❌ ${e.message}</div>`;
            setTimeout(() => { s.innerHTML = ''; }, 5000);
        }
    }
}

// ══════════════════════════════════════════════════════════════
// EXCEL EXPORT — layout matches user spec exactly
//   Row 1:  "{Family} Order {Type}"   LEFT-aligned, Tahoma 14 bold
//   Row 2:  "{Mission full name}"     LEFT-aligned, Tahoma 14 bold
//   Row 3:  "Order No.: …"            LEFT-aligned, Tahoma 10 bold
//   Row 4:  "Description: …"          LEFT-aligned, Tahoma 10 bold
//   Row 5:  "Stock Date: …   Expected Reception: …"  LEFT-aligned, Tahoma 10 bold
//   Row 6:  "Generated: …   Last Updated: …"         LEFT-aligned, Tahoma 10 bold
//   Gap row
//   Col headers: brown background, white text, bold Tahoma
//   Data rows: alternating white / light blue, all bordered
//   Totals row: bold, light brown background
//   Print: A4 landscape, fit all columns to one page
// ══════════════════════════════════════════════════════════════
async function ogExportOrder(orderId, sendEmail = false) {
    let o = ogOrders.find(x => (x.order_id || x.id) === orderId);
    if (!o) {
        try {
            const r = await fetch(`/api/orders/${orderId}`);
            const d = await r.json();
            if (!d.success) throw new Error(d.message);
            o = d.order;
        } catch (e) { ogNotify(ogT('error_saving') + ': ' + e.message, 'error'); return; }
    }

    if (typeof ogLoadSheetJSStyle !== 'undefined') await ogLoadSheetJSStyle();
    if (typeof XLSX === 'undefined') await ogLoadSheetJS();

    const wb = XLSX.utils.book_new();

    // ── Lookup project / mission info ─────────────────────────
    // For Local orders the project lives per-line; for IO it's on the order header.
    // Try order_project first; if blank, fall back to the first line's project.
    let projCode = o.order_project || '';
    if (!projCode && (o.lines || []).length) {
        projCode = o.lines[0].project || '';
    }
    const proj = ogFindProjByCode(projCode) || {};
    // mission_details may be a nested object OR the API may return flat fields —
    // ogMissionAbbrev / ogMissionName handle both shapes.
    const missionAbbrev = ogMissionAbbrev(proj) || projCode || '';
    const missionFull = ogMissionName(proj) || missionAbbrev || '';
    const isLocal = o.order_type === 'Local';

    // ── Column definitions ────────────────────────────────────
    // Currency for this order — used in column headers (not in cell values, to preserve calculations)
    const orderCurrency = o.currency || 'EUR';
    const orderCurrSym = ogCurrencySymbol(orderCurrency);

    const cols = [
        { h: '#', k: 'line_no', w: 7, num: true },
        { h: ogT('col_item_code'), k: 'item_code', w: 15, num: false },
        { h: ogT('col_description'), k: 'item_description', w: 38, num: false },
        { h: ogT('col_qty'), k: 'quantity', w: 7, num: true },
        { h: ogT('col_pack'), k: 'packaging', w: 12, num: false },
        { h: `${ogT('col_price_pk')} (${orderCurrSym})`, k: 'price_per_pack', w: 14, num: true },
        { h: `${ogT('col_total')} (${orderCurrSym})`, k: 'total_price', w: 14, num: true },
        { h: ogT('col_remarks'), k: 'remarks', w: 18, num: false },
    ];
    if (isLocal) {
        cols.push({ h: ogT('col_project'), k: 'project', w: 14, num: false });
        cols.push({ h: ogT('col_validation'), k: 'validation_status', w: 22, num: false });
    }

    const NC = cols.length; // total number of columns

    // ── Build rows array ──────────────────────────────────────
    // We place text in the LAST column (NC-1) so right-alignment in that cell looks right-aligned
    // Cols 0..NC-2 are empty for header rows; col NC-1 has the text.
    // Everything else uses full-width merge across all columns.

    const EMPTY = Array(NC).fill('');

    // All header text in col 0 (left-aligned, merged across all columns)
    const upd = (o.updated_at || o.created_at || '').toString().replace('T', ' ').slice(0, 19);
    const hdr1 = [...EMPTY]; hdr1[0] = `${o.order_family || ''} Order ${o.order_type || ''}`;
    const hdr2 = [...EMPTY]; hdr2[0] = missionFull;
    const hdr3 = [...EMPTY]; hdr3[0] = `Order No.: ${o.order_number || ''}`;
    const hdr4 = [...EMPTY]; hdr4[0] = `Description: ${o.order_description || ''}`;
    const hdr5 = [...EMPTY]; hdr5[0] = `Stock Date: ${o.stock_date || ''}   Expected Reception: ${o.requested_delivery_date || ''}`;
    const hdr6 = [...EMPTY]; hdr6[0] = `Generated: ${o.order_generation_date || ''}   Last Updated: ${upd}   Currency: ${orderCurrency} (${orderCurrSym})`;
    const gap = [...EMPTY];

    const colHdr = cols.map(c => c.h);

    const lines = o.lines || [];
    const dataRows = lines.map((l, i) => cols.map(c => {
        if (c.k === 'line_no') return i + 1;
        if (c.k === 'total_price') return Math.round(((parseFloat(l.quantity) || 0) * (parseFloat(l.price_per_pack) || 0)) * 100) / 100;
        const v = l[c.k];
        return (v === null || v === undefined) ? '' : v;
    }));

    const totalQty = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
    const totalPrice = lines.reduce((s, l) => s + ((parseFloat(l.quantity) || 0) * (parseFloat(l.price_per_pack) || 0)), 0);
    const totRow = cols.map((c, i) => {
        if (i === 0) return 'TOTAL';
        if (c.k === 'quantity') return totalQty;
        if (c.k === 'total_price') return Math.round(totalPrice * 100) / 100;
        return '';
    });

    const ws_data = [hdr1, hdr2, hdr3, hdr4, hdr5, hdr6, gap, colHdr, ...dataRows, totRow, gap];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);

    // ── Row / column indices (0-based) ────────────────────────
    const R_H1 = 0;   // "{Family} Order {Type}"
    const R_H2 = 1;   // Mission name
    const R_H3 = 2;   // Order No.
    const R_H4 = 3;   // Description
    const R_H5 = 4;   // Stock / Delivery dates
    const R_H6 = 5;   // Generated / Updated
    const R_GAP1 = 6;
    const R_COL = 7;   // Column headers
    const R_DATA0 = 8;   // First data row
    const R_DATAN = R_DATA0 + lines.length - 1;
    const R_TOT = R_DATA0 + lines.length;
    const R_GAP2 = R_TOT + 1;
    const C_LAST = NC - 1;

    // ── Column widths ─────────────────────────────────────────
    ws['!cols'] = cols.map(c => ({ wch: c.w }));

    // ── Row heights ───────────────────────────────────────────
    ws['!rows'] = [];
    for (let r = 0; r <= R_GAP2; r++) {
        if (r === R_H1 || r === R_H2) ws['!rows'][r] = { hpt: 28 };
        else if (r === R_COL) ws['!rows'][r] = { hpt: 22 };
        else ws['!rows'][r] = { hpt: 18 };
    }

    // ── Merges ───────────────────────────────────────────────
    // Merge info rows across ALL columns so border looks clean
    ws['!merges'] = [
        { s: { r: R_H1, c: 0 }, e: { r: R_H1, c: C_LAST } },
        { s: { r: R_H2, c: 0 }, e: { r: R_H2, c: C_LAST } },
        { s: { r: R_H3, c: 0 }, e: { r: R_H3, c: C_LAST } },
        { s: { r: R_H4, c: 0 }, e: { r: R_H4, c: C_LAST } },
        { s: { r: R_H5, c: 0 }, e: { r: R_H5, c: C_LAST } },
        { s: { r: R_H6, c: 0 }, e: { r: R_H6, c: C_LAST } },
    ];

    // ── Print setup: A4 landscape, fit all columns to one page ─
    // The CORRECT way (verified against openpyxl-generated ooxml):
    //   XML needs: <sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
    //              <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
    // SheetJS/xlsx-js-style maps these as follows:
    ws['!sheetPr'] = { pageSetUpPr: { fitToPage: true } };   // → <sheetPr><pageSetUpPr fitToPage="1"/>
    ws['!pageSetup'] = {
        paperSize: 9,          // A4
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,          // fit ALL columns on one page
        fitToHeight: 0,          // unlimited page height
    };
    ws['!margins'] = { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 };

    // ── Cell styles ───────────────────────────────────────────
    const CR = r => c => XLSX.utils.encode_cell({ r, c });
    const ref = (r, c) => XLSX.utils.encode_cell({ r, c });

    // Brown shades (like the heading spec)
    const BROWN_DARK = '5C3317';  // dark brown for col header text
    const BROWN_BG = 'C4956A';  // medium brown for col header fill
    const BROWN_LIGHT = 'F5E6D3';  // light brown for totals row
    const BLUE_ALT = 'EEF4FF';  // alternating row tint
    const NAVY = '1E3A5F';  // order number color
    const WHITE = 'FFFFFF';

    const thinBorder = s => ({ style: 'thin', color: { rgb: s || 'C4956A' } });
    const allBorders = (clr) => ({ top: thinBorder(clr), bottom: thinBorder(clr), left: thinBorder(clr), right: thinBorder(clr) });

    function setCell(r, c, style, value) {
        const k = ref(r, c);
        if (!ws[k]) {
            const v = value !== undefined ? value : '';
            ws[k] = { v, t: typeof v === 'number' ? 'n' : 's' };
            // Ensure cell is included in sheet range
            const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
            if (r > range.e.r) range.e.r = r;
            if (c > range.e.c) range.e.c = c;
            ws['!ref'] = XLSX.utils.encode_range(range);
        }
        ws[k].s = style;
    }

    // Header rows 1-2: LEFT-aligned, Tahoma 14 bold
    const styleH12 = {
        font: { name: 'Tahoma', sz: 14, bold: true, color: { rgb: NAVY } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
        fill: { fgColor: { rgb: 'F8F4EF' } },
    };
    for (let c = 0; c < NC; c++) setCell(R_H1, c, styleH12);
    for (let c = 0; c < NC; c++) setCell(R_H2, c, styleH12);
    // Text already in col 0 (merged) — no need to rewrite

    // Info rows 3-6: LEFT-aligned, Tahoma 10 bold
    const styleInfo = {
        font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: '3D2B1F' } },
        alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
        fill: { fgColor: { rgb: 'FAF6F1' } },
    };
    [R_H3, R_H4, R_H5, R_H6].forEach(row => {
        for (let c = 0; c < NC; c++) setCell(row, c, styleInfo);
    });

    // Gap row — white
    for (let c = 0; c < NC; c++) setCell(R_GAP1, c, { fill: { fgColor: { rgb: WHITE } } });

    // Column header row — brown background, white bold Tahoma
    const styleColHdr = {
        font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: WHITE } },
        fill: { fgColor: { rgb: BROWN_BG } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: false },
        border: allBorders('8B5C2A'),
    };
    for (let c = 0; c < NC; c++) setCell(R_COL, c, styleColHdr);

    // Data rows — alternating fill, all borders
    for (let i = 0; i < lines.length; i++) {
        const row = R_DATA0 + i;
        const fill = i % 2 === 0 ? WHITE : BLUE_ALT;
        for (let c = 0; c < NC; c++) {
            const isNum = cols[c].num;
            setCell(row, c, {
                font: { name: 'Tahoma', sz: 10 },
                fill: { fgColor: { rgb: fill } },
                alignment: { horizontal: isNum ? 'right' : 'left', vertical: 'center' },
                border: allBorders('C4A882'),
                numFmt: (isNum && cols[c].k !== 'line_no') ? '#,##0.00' : undefined,
            });
        }
    }

    // Totals row — light brown, bold
    const styleTot = {
        font: { name: 'Tahoma', sz: 10, bold: true, color: { rgb: BROWN_DARK } },
        fill: { fgColor: { rgb: BROWN_LIGHT } },
        alignment: { horizontal: 'right', vertical: 'center' },
        border: allBorders('8B5C2A'),
    };
    const styleTotLabel = { ...styleTot, alignment: { horizontal: 'left', vertical: 'center' } };
    for (let c = 0; c < NC; c++) {
        setCell(R_TOT, c, c === 0 ? styleTotLabel : styleTot);
    }

    // Gap after totals
    for (let c = 0; c < NC; c++) setCell(R_GAP2, c, { fill: { fgColor: { rgb: WHITE } } });

    // ── Write file ───────────────────────────────────────────
    const sheetName = (o.order_number || 'Order').replace(/[\\/*?:[\]]/g, '-').slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    const safeNum = (o.order_number || 'order').replace(/[/\\]/g, '-');
    const fileName = `${safeNum}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    if (sendEmail) {
        // Write to blob and trigger mailto with attachment note
        const wbOut = XLSX.write(wb, { bookType: 'xlsx', type: 'array', bookSST: false });
        const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        // Download first, then open mailto (browsers block attachments via mailto)
        const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
        setTimeout(() => {
            const subject = encodeURIComponent(`Supply Order: ${o.order_number || ''}`);
            const body = encodeURIComponent(
                `Please find attached the supply order:\n\nOrder No.: ${o.order_number || ''}\nDescription: ${o.order_description || ''}\nMission: ${missionFull}\nStock Date: ${o.stock_date || ''}\nExpected Reception: ${o.requested_delivery_date || ''}\n\nFile: ${fileName}\n\nKindly review and confirm.`
            );
            window.location.href = `mailto:?subject=${subject}&body=${body}`;
            URL.revokeObjectURL(url);
        }, 800);
        ogNotify('📧 ' + ogT('email_sent'), 'info');
    } else {
        XLSX.writeFile(wb, fileName, { bookType: 'xlsx', type: 'binary' });
        ogNotify(`${ogT('export_success')}: ${fileName}`, 'success');
    }
}

async function ogShareOrderByEmail(orderId) {
    await ogExportOrder(orderId, true);
}

// Loads xlsx-js-style (with cell-style support) for Excel EXPORT.
// Defined here (not in the HTML template) so it is always available
// regardless of whether the page was loaded directly or via SPA navigation.
window._xlsxJsStyleLoaded = false;
function ogLoadSheetJSStyle() {
    return new Promise((resolve) => {
        if (window._xlsxJsStyleLoaded || typeof XLSXStyle !== 'undefined') { resolve(); return; }
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
        s.onload = () => {
            window.XLSX = window.XLSXStyle || window.XLSX;
            window._xlsxJsStyleLoaded = true;
            resolve();
        };
        s.onerror = () => resolve(); // graceful fallback — export will use plain xlsx
        document.head.appendChild(s);
    });
}

function ogLoadSheetJS() {
    return new Promise((res, rej) => {
        if (typeof XLSX !== 'undefined') { res(); return; }
        // xlsx-js-style supports cell styles (font, fill, alignment, border)
        // which the standard xlsx library does NOT support in community edition
        const sc = document.createElement('script');
        sc.src = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
        sc.onload = () => {
            // Normalise global: xlsx-js-style may expose as XLSXStyle or XLSX
            if (typeof XLSX === 'undefined' && typeof XLSXStyle !== 'undefined') window.XLSX = window.XLSXStyle;
            res();
        };
        sc.onerror = () => {
            // fallback to standard xlsx (no styles)
            const sc2 = document.createElement('script');
            sc2.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            sc2.onload = () => { res(); };
            sc2.onerror = () => rej(new Error('Failed to load SheetJS'));
            document.head.appendChild(sc2);
        };
        document.head.appendChild(sc);
    });
}

// ── Delete ────────────────────────────────────────────────────
function ogOpenDeleteModal(orderId) {
    const o = ogOrders.find(x => (x.order_id || x.id) === orderId); if (!o) return;
    ogDeletingId = orderId;
    document.getElementById('og-delete-label').textContent = o.order_number + (o.order_description ? ' — ' + o.order_description : '');
    document.getElementById('og-delete-modal').style.display = 'flex';
}
function ogCloseDeleteModal() { document.getElementById('og-delete-modal').style.display = 'none'; ogDeletingId = null; }

async function ogConfirmDelete() {
    if (!ogDeletingId) return;
    const btn = document.getElementById('og-confirm-delete-btn'), orig = btn.innerHTML;
    try {
        btn.disabled = true; btn.innerHTML = ogT('deleting');
        const r = await fetch(`/api/orders/${ogDeletingId}`, { method: 'DELETE' });
        const d = await r.json(); if (!d.success) throw new Error(d.message);
        ogNotify(ogT('order_deleted'), 'success'); ogCloseDeleteModal(); await ogLoadOrders();
    } catch (e) { ogNotify(ogT('error_saving') + ': ' + e.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = orig; }
}

// ── Helpers ───────────────────────────────────────────────────
function ogNotify(msg, type = 'info') {
    const bg = type === 'error' ? '#FEE2E2' : type === 'success' ? '#D1FAE5' : '#FEF3C7';
    const tc = type === 'error' ? '#991B1B' : type === 'success' ? '#065F46' : '#92400E';
    const ic = type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️';
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;top:90px;right:20px;z-index:9999;padding:0.85rem 1.3rem;font-size:0.95rem;background:${bg};color:${tc};border:2px solid ${tc};border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:0.7rem;max-width:420px;`;
    el.innerHTML = `<span style="font-size:1.25rem;">${ic}</span><span>${msg}</span>`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 4500);
}
function ogEsc(t) { const d = document.createElement('div'); d.textContent = String(t ?? ''); return d.innerHTML; }

function ogHighlight(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.style.border;
    el.style.border = '2px solid #DC2626';
    el.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.18)';
    el.focus();
    setTimeout(() => { el.style.border = prev || ''; el.style.boxShadow = ''; }, 2500);
}

function ogToggleHeader() {
    const body = document.getElementById('og-header-body');
    const btn = document.getElementById('og-header-toggle');
    if (!body || !btn) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    btn.innerHTML = isHidden ? '▼' : '▶';
    btn.title = isHidden ? 'Collapse order details' : 'Expand order details';
}
function ogFmtDate(d) { if (!d) return '—'; try { return new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; } }
function ogFmtNum(n) { const v = parseFloat(n) || 0; return v % 1 === 0 ? v.toLocaleString() : v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function ogFmtPrice(n) {
    // Format number with currency symbol prefix — used in totals bar and total_price cell
    const sym = ogCurrencySymbol(ogCurrency);
    const formatted = ogFmtNum(n);
    return sym + ' ' + formatted;   // non-breaking space between symbol and number
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') { ogCloseDeleteModal(); ogCloseFullscreen(); } });
document.addEventListener('click', e => { if (e.target.id === 'og-delete-modal') ogCloseDeleteModal(); if (e.target.id === 'og-fullscreen-modal') ogCloseFullscreen(); });

// ── Globals ───────────────────────────────────────────────────
window.initOrderGenerationPage = initOrderGenerationPage;
window.ogNewOrder = ogNewOrder;
window.ogEditOrder = ogEditOrder;
window.ogCloseEditor = ogCloseEditor;
window.ogSwitchType = ogSwitchType;
window.ogAddLine = ogAddLine;
window.ogRemoveLine = ogRemoveLine;
window.ogClearAllLines = ogClearAllLines;
window.ogLineChanged = ogLineChanged;
window.ogToggleValidation = ogToggleValidation;
window.ogSaveOrder = ogSaveOrder;
window.ogLoadOrders = ogLoadOrders;
window.ogFilterOrders = ogFilterOrders;
window.ogClearFilters = ogClearFilters;
window.ogOpenDeleteModal = ogOpenDeleteModal;
window.ogCloseDeleteModal = ogCloseDeleteModal;
window.ogConfirmDelete = ogConfirmDelete;
window.ogHandleDrop = ogHandleDrop;
window.ogHandleExcelUpload = ogHandleExcelUpload;
window.ogOpenFullscreen = ogOpenFullscreen;
window.ogCloseFullscreen = ogCloseFullscreen;
window.ogFsAddLine = ogFsAddLine;
window.ogFsClearAll = ogFsClearAll;
// ── Real-time language change re-render ─────────────────────
// When the i18n system switches language it:
//   1. Updates textContent of all [data-i18n] elements (including our hidden og-trans-* spans)
//   2. May set document.documentElement.lang
// We detect this via MutationObserver and re-render all dynamic content.
function ogOnLanguageChange() {
    // 1. Re-render dynamic JS content
    ogRenderList();
    if (document.getElementById('og-editor-section')?.style.display !== 'none') {
        ogRenderTableHeader(ogCurrentType);
        document.querySelectorAll('[data-field="total_price"]').forEach(td => {
            const tr = td.closest('tr');
            if (!tr) return;
            const qty = parseFloat(tr.querySelector('[data-field="quantity"]')?.value) || 0;
            const price = parseFloat(tr.querySelector('[data-field="price_per_pack"]')?.value) || 0;
            td.textContent = ogFmtPrice(qty * price);
        });
        ogUpdateTotals();
    }
    // 2. Update placeholder attributes (data-i18n-placeholder)
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const val = ogT(key);
        if (val && val !== key) el.placeholder = val;
    });
    // 3. The i18n system handles static data-i18n elements automatically;
    //    but call it explicitly if available to ensure all static text is updated
    if (typeof window.i18n?.applyTranslations === 'function') {
        window.i18n.applyTranslations();
    }
}

// Watch for text changes on any og-trans-* span — that's our signal that i18n ran
function ogSetupLangWatcher() {
    const sentinel = document.getElementById('og-trans-order_saved');
    if (!sentinel) { setTimeout(ogSetupLangWatcher, 500); return; }
    let lastText = sentinel.textContent;
    const obs = new MutationObserver(() => {
        const cur = sentinel.textContent;
        if (cur !== lastText) { lastText = cur; ogOnLanguageChange(); }
    });
    obs.observe(sentinel, { childList: true, characterData: true, subtree: true });
    // Also watch html[lang] attribute changes
    const htmlObs = new MutationObserver(() => ogOnLanguageChange());
    htmlObs.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}
document.addEventListener('DOMContentLoaded', ogSetupLangWatcher);
// Also call setup now in case DOM is already ready
if (document.readyState !== 'loading') ogSetupLangWatcher();

window.ogUpdateLocalNum = ogUpdateLocalNum;
window.ogExportOrder = ogExportOrder;
window.ogShareOrderByEmail = ogShareOrderByEmail;
window.ogGetMissionAbbrev = ogGetMissionAbbrev;