// ==================== المتغيرات العامة ====================
let surveyMap = null;
let mapPoints = [];
let mapPolygonLayer = null;
let mapMarkers = [];

let croquisNorthMap = null;
let compassPts = [];
let compassLineLayer = null;
let compassMarkers = [];

let trianglesList = [];
let levelRows = [];
let lastCroquisData = {};
let lastAiPlanBoxes = [];

const themesList = [
    { id: 'emerald', name: 'ثيم الزمرد' },
    { id: 'royal', name: 'ثيم الكاد الذهبي' },
    { id: 'daylight', name: 'الوضع النهاري' }
];
let currentThemeIdx = 0;
let is3DView = false;

// ==================== نظام التشغيل وزر الرجوع الذكي للموبايل ====================
window.addEventListener('DOMContentLoaded', () => {
    // تسجيل الصفحة الرئيسية في الهيستوري عند فتح الموقع لمنع الخروج المفاجئ
    history.replaceState({ view: 'dashboard' }, "", "#dashboard");
    
    runSplashIntro();
    loadSavedState();
    calcFqsOperations();
    calcTanjeebSide();
    updateCroquisAndSave();
    generateAiCadPlan();
    renderTriangles();
    recalcLeveling();
    calcCogo();
    convertFromMeters();
    registerPWA();
});

// التقاط ضغطة زر الرجوع في الموبايل أو المتصفح لمنع الخروج وإرجاع المستخدم للوحة
window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) {
        openTool(e.state.view, true);
    } else {
        openTool('dashboard', true);
    }
});

function openTool(toolName, fromHistory = false) {
    document.querySelectorAll('.tool-view').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(`view-${toolName}`);
    if (target) target.classList.add('active');

    // إذا لم يكن الضغط من زر الرجوع الفعلي، ضيفه لسجل المتصفح
    if (!fromHistory) {
        history.pushState({ view: toolName }, "", "#" + toolName);
    }

    if (toolName === 'map') {
        setTimeout(() => {
            initMapIfNeeded();
            surveyMap.invalidateSize();
        }, 150);
    }
}

// ==================== الإنترو السينمائي وتغيير الثيم ====================
function runSplashIntro() {
    const bar = document.getElementById('introProgress');
    const status = document.getElementById('introStatusText');
    let progress = 0;
    const steps = [
        "جاري تفعيل أداة الفدان والفرش المعماري...",
        "جاري إعداد محرك التجنيب وحساب الضلع المجهول...",
        "تجهيز لوحة الأوتوكاد الذكي 3D — م. أحمد سمير...",
        "اكتمل التحميل — النسخة التجريبية الشاملة جاهزة!"
    ];

    const interval = setInterval(() => {
        progress += 25;
        if (bar) bar.style.width = `${Math.min(progress, 100)}%`;
        if (status && steps[Math.floor(progress / 30)]) {
            status.innerText = steps[Math.floor(progress / 30)];
        }
        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(closeIntroSplash, 600);
        }
    }, 400);
}

function closeIntroSplash() {
    const splash = document.getElementById('splashIntro');
    if (splash) splash.classList.add('hidden');
}

function cycleTheme() {
    currentThemeIdx = (currentThemeIdx + 1) % themesList.length;
    const selected = themesList[currentThemeIdx];
    document.documentElement.setAttribute('data-theme', selected.id);
    document.getElementById('themeNameLabel').innerText = selected.name;
    localStorage.setItem('ds_theme_pref', selected.id);
}

// ==================== تحويل الوحدات (متر/فدان/قيراط/سهم) ====================
function metersToFQS(areaM2) {
    if (!areaM2 || areaM2 <= 0) return { feddan: 0, qirat: 0, sahm: 0, text: "0 فدان ، 0 قيراط ، 0 سهم" };
    const feddanArea = 4200.833333333333;
    const qiratArea = feddanArea / 24;
    const sahmArea = qiratArea / 24;

    let rem = areaM2;
    const feddan = Math.floor(rem / feddanArea);
    rem -= feddan * feddanArea;
    const qirat = Math.floor(rem / qiratArea);
    rem -= qirat * qiratArea;
    const sahm = (rem / sahmArea).toFixed(2);
    
    return { feddan, qirat, sahm, text: `${feddan} فدان ، ${qirat} قيراط ، ${sahm} سهم` };
}

function fqsToMeters(f, q, s) {
    return (f * 4200.833333) + (q * 175.034722) + (s * 7.2931134);
}

// ==================== حاسبة الفدان والقيراط (جمع، طرح، وتثمين) ====================
function calcFqsOperations() {
    const p1F = parseFloat(document.getElementById('p1F')?.value) || 0;
    const p1Q = parseFloat(document.getElementById('p1Q')?.value) || 0;
    const p1S = parseFloat(document.getElementById('p1S')?.value) || 0;

    const p2F = parseFloat(document.getElementById('p2F')?.value) || 0;
    const p2Q = parseFloat(document.getElementById('p2Q')?.value) || 0;
    const p2S = parseFloat(document.getElementById('p2S')?.value) || 0;

    const opType = document.getElementById('calcOperationType')?.value || 'add';
    const priceFed = parseFloat(document.getElementById('pricePerFeddan')?.value) || 600000;

    const m1 = fqsToMeters(p1F, p1Q, p1S);
    const m2 = fqsToMeters(p2F, p2Q, p2S);

    let finalM2 = opType === 'add' ? (m1 + m2) : Math.max(0, m1 - m2);
    const resultFQS = metersToFQS(finalM2);
    const totalPrice = (finalM2 / 4200.833333) * priceFed;

    const outBox = document.getElementById('fqsCalcResultsOutput');
    if(outBox) {
        outBox.innerHTML = `
            <h3 style="color:var(--accent); margin-bottom:12px;"><i class="fa-solid fa-circle-check"></i> نتيجة الحسابات الزراعية</h3>
            <p><b>المساحة بالمتر المربع:</b> ${finalM2.toFixed(2)} م²</p>
            <p style="font-size:1.25rem; color:var(--accent-sec); margin:10px 0;"><b>بالوحدات: ${resultFQS.text}</b></p>
            <hr style="border-color:var(--border-color); margin:15px 0;">
            <p><b>إجمالي التثمين المالي للأرض:</b> <span style="color:var(--green); font-size:1.15rem; font-weight:800;">${totalPrice.toLocaleString('en-US', {maximumFractionDigits:0})} جنيه مصري</span></p>
            <small style="color:var(--text-muted)">حسب سعر الفدان المعتمد (${priceFed.toLocaleString()} ج.م)</small>
        `;
    }
}

// ==================== أداة التجنيب وفصل المساحة (الضلع المجهول) ====================
function calcTanjeebSide() {
    const knownSide = parseFloat(document.getElementById('tanKnownSide')?.value) || 20;
    const targetQirat = parseFloat(document.getElementById('tanTargetQirat')?.value) || 5;
    
    const targetM2 = targetQirat * (4200.833333 / 24);
    const unknownDepth = knownSide > 0 ? (targetM2 / knownSide) : 0;

    const outBox = document.getElementById('tanjeebResultsOutput');
    if(outBox) {
        outBox.innerHTML = `
            <h3 style="color:var(--accent-sec); margin-bottom:12px;"><i class="fa-solid fa-scissors"></i> نتائج التجنيب وفصل المساحة</h3>
            <p><b>المساحة المراد فصلها:</b> ${targetQirat} قيراط (${targetM2.toFixed(2)} م²)</p>
            <p><b>طول الواجهة المعلوم:</b> ${knownSide} متر</p>
            <hr style="border-color:var(--border-color); margin:15px 0;">
            <p style="font-size:1.25rem; color:var(--accent); margin:10px 0;"><b>عمق الضلع المجهول: <span style="color:#fff;">${unknownDepth.toFixed(2)} متر</span></b></p>
        `;
    }
}

function calcTanjeebByMeters() {
    const knownSide = parseFloat(document.getElementById('tanKnownSide')?.value) || 20;
    const targetM2 = parseFloat(document.getElementById('tanTargetM2')?.value) || 0;
    if (targetM2 <= 0) return;

    const unknownDepth = knownSide > 0 ? (targetM2 / knownSide) : 0;
    const fqs = metersToFQS(targetM2);

    const outBox = document.getElementById('tanjeebResultsOutput');
    if(outBox) {
        outBox.innerHTML = `
            <h3 style="color:var(--accent-sec); margin-bottom:12px;"><i class="fa-solid fa-scissors"></i> نتائج التجنيب بالمتر</h3>
            <p><b>المساحة المراد فصلها:</b> ${targetM2} م² (${fqs.text})</p>
            <p><b>طول الواجهة:</b> ${knownSide} متر</p>
            <hr style="border-color:var(--border-color); margin:15px 0;">
            <p style="font-size:1.25rem; color:var(--accent);"><b>العمق الداخلي المطلوب: ${unknownDepth.toFixed(2)} متر</b></p>
        `;
    }
}

// ==================== لوحة الكروكي + الخريطة + الفرز الشرعي ====================
function toggleCroquisCompassMap() {
    const box = document.getElementById('croquisMiniMapBox');
    if (!box) return;
    if (box.style.display === 'none' || box.style.display === '') {
        box.style.display = 'block';
        setTimeout(() => {
            initCroquisCompassMap();
            if(croquisNorthMap) croquisNorthMap.invalidateSize();
        }, 150);
    } else {
        box.style.display = 'none';
    }
}

function initCroquisCompassMap() {
    if (croquisNorthMap) return;
    croquisNorthMap = L.map('croquisNorthMap').setView([28.1099, 30.7503], 16);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] }).addTo(croquisNorthMap);

    croquisNorthMap.on('click', (e) => {
        if (compassPts.length >= 2) resetCompassMiniMap();
        compassPts.push(e.latlng);
        const m = L.circleMarker(e.latlng, { radius: 6, color: '#fbbf24', fillOpacity: 1 }).addTo(croquisNorthMap);
        compassMarkers.push(m);

        if (compassPts.length === 1) {
            document.getElementById('compassMapStatus').innerText = 'اضغط على النقطة الثانية لنهاية الضلع...';
        } else if (compassPts.length === 2) {
            compassLineLayer = L.polyline(compassPts, { color: '#10b981', weight: 4 }).addTo(croquisNorthMap);
            const p1 = compassPts[0], p2 = compassPts[1];
            const dLon = (p2.lng - p1.lng) * Math.PI / 180;
            const lat1 = p1.lat * Math.PI / 180, lat2 = p2.lat * Math.PI / 180;
            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            let brng = Math.atan2(y, x) * 180 / Math.PI;
            brng = (brng + 360) % 360;
            const northTilt = Math.round((brng - 90 + 360) % 360);
            
            const nInput = document.getElementById('northAngleInput');
            if(nInput) nInput.value = northTilt;
            
            document.getElementById('compassMapStatus').innerText = `تم رصد اتجاه الشمال = ${northTilt}° بنجاح!`;
            updateCroquisAndSave();
        }
    });
}

function resetCompassMiniMap() {
    compassPts = [];
    compassMarkers.forEach(m => croquisNorthMap.removeLayer(m));
    compassMarkers = [];
    if (compassLineLayer) croquisNorthMap.removeLayer(compassLineLayer);
    const status = document.getElementById('compassMapStatus');
    if(status) status.innerText = 'انقر النقطة الأولى لبداية الضلع على الخريطة...';
}

function updateCroquisAndSave() {
    const owner = document.getElementById('ownerName')?.value || 'غير محدد';
    const surveyor = document.getElementById('surveyorName')?.value || 'م. أحمد سمير';
    const location = document.getElementById('landLocation')?.value || '-';
    const dateStr = document.getElementById('surveyDate')?.value || '-';

    const N = parseFloat(document.getElementById('cadNorth')?.value) || 0;
    const S = parseFloat(document.getElementById('cadSouth')?.value) || 0;
    const E = parseFloat(document.getElementById('cadEast')?.value) || 0;
    const W = parseFloat(document.getElementById('cadWest')?.value) || 0;
    const D = parseFloat(document.getElementById('cadDiag')?.value) || 0;
    const northAngle = parseFloat(document.getElementById('northAngleInput')?.value) || 0;

    const nbNorth = document.getElementById('neighborNorth')?.value || 'حد بحري';
    const nbSouth = document.getElementById('neighborSouth')?.value || 'حد قبلي';
    const nbEast = document.getElementById('neighborEast')?.value || 'حد شرقي';
    const nbWest = document.getElementById('neighborWest')?.value || 'حد غربي';

    const males = parseInt(document.getElementById('heirsMale')?.value) || 0;
    const females = parseInt(document.getElementById('heirsFemale')?.value) || 0;
    const splitDir = document.getElementById('splitDirection')?.value || 'vertical';

    let totalArea = 0;
    if (D > 0) {
        // Heron
        const s1 = (N + W + D)/2, s2 = (S + E + D)/2;
        const a1 = Math.sqrt(Math.max(0, s1*(s1-N)*(s1-W)*(s1-D)));
        const a2 = Math.sqrt(Math.max(0, s2*(s2-S)*(s2-E)*(s2-D)));
        totalArea = a1 + a2;
    } else {
        // Brahmagupta / Average
        const s = (N + S + E + W) / 2;
        const val = (s - N) * (s - S) * (s - E) * (s - W);
        totalArea = val > 0 ? Math.sqrt(val) : ((N + S) / 2) * ((E + W) / 2);
    }

    const perimeter = N + S + E + W;
    const fqs = metersToFQS(totalArea);

    const badge = document.getElementById('cadTotalAreaBadge');
    if(badge) badge.innerText = `المساحة: ${totalArea.toFixed(2)} م² (${fqs.text})`;

    const totalShares = (males * 2) + (females * 1);
    const singleShareRatio = totalShares > 0 ? (1 / totalShares) : 0;
    const maleRatio = singleShareRatio * 2;
    const femaleRatio = singleShareRatio * 1;

    let parcels = [];
    for (let i = 1; i <= males; i++) {
        parcels.push({ label: `نصيب ذكر (${i})`, fractionText: males === 1 && females === 1 ? 'الثلثان (2/3)' : `2/${totalShares}`, ratio: maleRatio, area: totalArea * maleRatio, color: '#22d3ee' });
    }
    for (let j = 1; j <= females; j++) {
        parcels.push({ label: `نصيب أنثى (${j})`, fractionText: males === 1 && females === 1 ? 'الثلث (1/3)' : `1/${totalShares}`, ratio: femaleRatio, area: totalArea * femaleRatio, color: '#f472b6' });
    }

    lastCroquisData = { owner, surveyor, location, dateStr, N, S, E, W, northAngle, nbNorth, nbSouth, nbEast, nbWest, totalArea, perimeter, fqs, parcels, splitDir };

    drawFullSurveyCroquis(lastCroquisData);
    renderCroquisReport(lastCroquisData, males, females, totalShares);
    saveStateToStorage();
}

function drawFullSurveyCroquis(data) {
    const canvas = document.getElementById('croquisCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const W_CANVAS = canvas.width, H_CANVAS = canvas.height;
    ctx.clearRect(0, 0, W_CANVAS, H_CANVAS);

    ctx.fillStyle = '#040b0e';
    ctx.fillRect(0, 0, W_CANVAS, H_CANVAS);

    ctx.strokeStyle = '#0c222b';
    ctx.lineWidth = 1;
    for (let x = 0; x < W_CANVAS; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H_CANVAS); ctx.stroke(); }
    for (let y = 0; y < H_CANVAS; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W_CANVAS, y); ctx.stroke(); }

    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, W_CANVAS - 20, H_CANVAS - 20);
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1; ctx.strokeRect(15, 15, W_CANVAS - 30, H_CANVAS - 30);

    drawRotatedNorthArrow(ctx, 75, 75, data.northAngle);

    const { N, S, E, W, nbNorth, nbSouth, nbEast, nbWest, parcels, splitDir } = data;
    if (N <= 0 || S <= 0 || E <= 0 || W <= 0) return;

    const drawAreaHeight = H_CANVAS - 145;
    const maxHoriz = Math.max(N, S), maxVert = Math.max(E, W);
    const scale = Math.min((W_CANVAS - 320) / maxHoriz, (drawAreaHeight - 180) / maxVert);
    const cx = W_CANVAS / 2, cy = drawAreaHeight / 2 + 12;

    const pNW = { x: cx - (N * scale) / 2, y: cy - (W * scale) / 2 };
    const pNE = { x: cx + (N * scale) / 2, y: cy - (E * scale) / 2 };
    const pSE = { x: cx + (S * scale) / 2, y: cy + (E * scale) / 2 };
    const pSW = { x: cx - (S * scale) / 2, y: cy + (W * scale) / 2 };

    const lerpPt = (p1, p2, t) => ({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });

    if (parcels.length > 0) {
        let acc = 0;
        parcels.forEach((p) => {
            const t1 = acc, t2 = acc + p.ratio; acc = t2;
            let poly = splitDir === 'vertical' ? [lerpPt(pNE, pNW, t1), lerpPt(pNE, pNW, t2), lerpPt(pSE, pSW, t2), lerpPt(pSE, pSW, t1)] : [lerpPt(pNE, pSE, t1), lerpPt(pNE, pSE, t2), lerpPt(pNW, pSW, t2), lerpPt(pNW, pSW, t1)];

            ctx.beginPath(); ctx.moveTo(poly[0].x, poly[0].y); poly.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y)); ctx.closePath();
            ctx.fillStyle = p.color + '24'; ctx.fill();
            ctx.strokeStyle = p.color; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);

            const midX = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
            const midY = (poly[0].y + poly[1].y + poly[2].y + poly[3].y) / 4;
            ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Cairo'; ctx.textAlign = 'center';
            ctx.fillText(`${p.label} [${p.fractionText}]`, midX, midY - 6);
            ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 12px Cairo'; ctx.fillText(`${p.area.toFixed(1)} م²`, midX, midY + 13);
        });
    }

    ctx.beginPath(); ctx.moveTo(pNW.x, pNW.y); ctx.lineTo(pNE.x, pNE.y); ctx.lineTo(pSE.x, pSE.y); ctx.lineTo(pSW.x, pSW.y); ctx.closePath();
    ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 3.2; ctx.stroke();

    ctx.textAlign = 'center';
    const topMidX = (pNW.x + pNE.x) / 2, topMidY = Math.min(pNW.y, pNE.y);
    ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 14px Cairo'; ctx.fillText(`الضلع الشمالي (فوق): ${N} م`, topMidX, topMidY - 12);
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 13px Cairo'; ctx.fillText(`الحد البحري: ${nbNorth}`, topMidX, topMidY - 32);

    const botMidX = (pSW.x + pSE.x) / 2, botMidY = Math.max(pSW.y, pSE.y);
    ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 14px Cairo'; ctx.fillText(`الضلع الجنوبي (تحت): ${S} م`, botMidX, botMidY + 22);
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 13px Cairo'; ctx.fillText(`الحد القبلي: ${nbSouth}`, botMidX, botMidY + 42);

    const rightMidX = Math.max(pNE.x, pSE.x), rightMidY = (pNE.y + pSE.y) / 2;
    ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 14px Cairo'; ctx.fillText(`الشرقي (يمين): ${E} م`, rightMidX + 78, rightMidY - 8);
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 12px Cairo'; ctx.fillText(`${nbEast}`, rightMidX + 78, rightMidY + 14);

    const leftMidX = Math.min(pNW.x, pSW.x), leftMidY = (pNW.y + pSW.y) / 2;
    ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 14px Cairo'; ctx.fillText(`الغربي (شمال): ${W} م`, leftMidX - 78, leftMidY - 8);
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 12px Cairo'; ctx.fillText(`${nbWest}`, leftMidX - 78, leftMidY + 14);

    const tbY = H_CANVAS - 125, tbH = 110;
    ctx.fillStyle = '#08181f'; ctx.fillRect(15, tbY, W_CANVAS - 30, tbH);
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 2; ctx.strokeRect(15, tbY, W_CANVAS - 30, tbH);

    ctx.beginPath(); ctx.moveTo(290, tbY); ctx.lineTo(290, tbY + tbH); ctx.moveTo(565, tbY); ctx.lineTo(565, tbY + tbH); ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 14px Cairo'; ctx.fillText(`المالك: ${data.owner}`, W_CANVAS - 30, tbY + 30);
    ctx.fillStyle = '#f8fafc'; ctx.font = '13px Cairo'; ctx.fillText(`الموقع: ${data.location}`, W_CANVAS - 30, tbY + 58);
    ctx.fillText(`التاريخ: ${data.dateStr} | زاوية الشمال: ${data.northAngle}°`, W_CANVAS - 30, tbY + 86);

    ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 14px Cairo'; ctx.fillText(`المساحة بالمتر: ${data.totalArea.toFixed(2)} م²`, 550, tbY + 30);
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 13px Cairo'; ctx.fillText(`بالفدان: ${data.fqs.text}`, 550, tbY + 58);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '13px Cairo'; ctx.fillText(`المحيط: ${data.perimeter.toFixed(2)} متر`, 550, tbY + 86);

    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 13px Cairo'; ctx.fillText(`المهندس المسّاح القائم بالرفع:`, 275, tbY + 28);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 15px Cairo'; ctx.fillText(`${data.surveyor}`, 275, tbY + 56);
    ctx.fillStyle = '#10b981'; ctx.font = 'bold 11px Cairo'; ctx.fillText(`المسّاح الرقمي PRO - النسخة التجريبية`, 275, tbY + 86);
}

function drawRotatedNorthArrow(ctx, x, y, angleDeg = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.strokeStyle = '#fbbf24'; ctx.fillStyle = '#10b981'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(-8, 12); ctx.lineTo(0, 5); ctx.lineTo(8, 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 12px Cairo'; ctx.textAlign = 'center'; ctx.fillText('N', 0, -29);
    ctx.restore();
    ctx.fillStyle = '#94a3b8'; ctx.font = '11px Cairo'; ctx.textAlign = 'center'; ctx.fillText(`شمال (${angleDeg}°)`, x, y + 42);
}

function renderCroquisReport(data, males, females, totalShares) {
    const box = document.getElementById('cadShariaResults');
    if(!box) return;
    let shariaNote = males === 1 && females === 1 ? `<p style="color:#10b981; font-weight:700;">تطبيق الشرع الإسلامي: الذكر (2/3) والأنثى (1/3).</p>` : '';
    let cardsHtml = '';
    data.parcels.forEach(p => {
        cardsHtml += `<div class="sharia-card" style="border-right-color:${p.color}"><strong>${p.label}</strong> (${p.fractionText})<br>المساحة: <b>${p.area.toFixed(2)} م²</b><br><small style="color:#fbbf24">${metersToFQS(p.area).text}</small></div>`;
    });
    box.innerHTML = `<h3 style="color:#fbbf24; margin-bottom:8px;">تقرير الكروكي والفرز الشرعي</h3><p><b>المالك:</b> ${data.owner} | <b>المسّاح:</b> ${data.surveyor}</p>${shariaNote}<div class="sharia-grid">${cardsHtml}</div>`;
}

function downloadCroquisImage() {
    const canvas = document.getElementById('croquisCanvas');
    if(!canvas) return;
    const link = document.createElement('a');
    link.download = `كروكي_${lastCroquisData.owner || 'مساحي'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function exportCroquisDXF() {
    const { N, S, E, W } = lastCroquisData;
    if (!N || !S || !E || !W) return;
    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    const addLine = (x1, y1, x2, y2) => { dxf += `0\nLINE\n8\nBOUNDARY\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`; };
    addLine(0, 0, S, 0); addLine(S, 0, N, E); addLine(N, E, 0, W); addLine(0, W, 0, 0);
    dxf += `0\nENDSEC\n0\nEOF`;
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Croquis_DXF.dxf`; a.click();
}

// ==================== زر الـ 3D للأوتوكاد الذكي ====================
function toggleCad3D() {
    is3DView = !is3DView;
    const wrapper = document.getElementById('aiCanvasWrapper');
    const btnSpan = document.querySelector('#btnToggle3D span') || document.querySelector('#btnToggle3D');
    
    if (is3DView) {
        if(wrapper) wrapper.classList.add('cad-3d-mode');
        if(btnSpan) btnSpan.innerText = "العودة للوضع 2D";
    } else {
        if(wrapper) wrapper.classList.remove('cad-3d-mode');
        if(btnSpan) btnSpan.innerText = "تحويل إلى عرض 3D";
    }
}

// ==================== الأوتوكاد الذكي فائق الدقة (أبعاد + أبواب + فرش) ====================
function generateAiCadPlan() {
    const north = parseFloat(document.getElementById('aiNorth')?.value) || 12;
    const south = parseFloat(document.getElementById('aiSouth')?.value) || 12;
    const east = parseFloat(document.getElementById('aiEast')?.value) || 18;
    const west = parseFloat(document.getElementById('aiWest')?.value) || 18;

    const roomsCount = parseInt(document.getElementById('aiRooms')?.value) || 3;
    const bathsCount = parseInt(document.getElementById('aiBaths')?.value) || 2;
    const stairPos = document.getElementById('aiStairPos') ? document.getElementById('aiStairPos').value : 'front';
    const furnish = document.getElementById('aiFurnish') ? document.getElementById('aiFurnish').value === 'yes' : true;

    const avgWidth = (north + south) / 2, avgDepth = (east + west) / 2;
    const totalArea = avgWidth * avgDepth;

    const canvas = document.getElementById('aiCadCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#050b11'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pad = 95;
    const scale = Math.min((canvas.width - pad * 2) / Math.max(north, south), (canvas.height - pad * 2) / Math.max(east, west));
    const startX = (canvas.width - avgWidth * scale) / 2;
    const startY = (canvas.height - avgDepth * scale) / 2;
    const wallThick = 0.25, wallPx = wallThick * scale;

    lastAiPlanBoxes = [];

    function drawDimLine(x1, y1, x2, y2, text) {
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1-4, y1+4); ctx.lineTo(x1+4, y1-4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2-4, y2+4); ctx.lineTo(x2+4, y2-4); ctx.stroke();
        ctx.fillStyle = '#10b981'; ctx.font = '12px Cairo'; ctx.textAlign = 'center';
        ctx.fillText(text, (x1+x2)/2, y1 - 5);
    }

    function drawFurniture(sx, sy, sw, sh, title) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.5;
        const cx = sx + sw/2, cy = sy + sh/2;

        if (title.includes('نوم')) {
            const bedW = Math.min(sw * 0.4, 1.8 * scale);
            const bedH = Math.min(sh * 0.5, 2.1 * scale);
            ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
            ctx.fillRect(cx - bedW/2, sy + wallPx, bedW, bedH);
            ctx.strokeRect(cx - bedW/2, sy + wallPx, bedW, bedH);
            ctx.strokeRect(cx - bedW/2 + 2, sy + wallPx + 2, bedW/2 - 4, 8);
            ctx.strokeRect(cx + 2, sy + wallPx + 2, bedW/2 - 4, 8);
        } else if (title.includes('مطبخ')) {
            ctx.fillStyle = 'rgba(251, 191, 36, 0.15)';
            ctx.fillRect(sx + wallPx, sy + wallPx, sw - wallPx*2, 18);
            ctx.strokeRect(sx + wallPx, sy + wallPx, sw - wallPx*2, 18);
            ctx.beginPath(); ctx.arc(sx + wallPx + 15, sy + wallPx + 9, 3, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.arc(sx + wallPx + 25, sy + wallPx + 9, 3, 0, Math.PI*2); ctx.stroke();
            ctx.strokeRect(sx + sw - wallPx - 25, sy + wallPx + 2, 20, 14);
        } else if (title.includes('حمام')) {
            ctx.strokeRect(sx + wallPx, sy + wallPx, 25, Math.min(sh*0.6, 40));
            ctx.beginPath(); ctx.arc(sx + sw - wallPx - 15, sy + sh - wallPx - 15, 7, 0, Math.PI*2); ctx.stroke();
        } else if (title.includes('ريسبشن')) {
            const sofaW = Math.min(sw * 0.5, 3 * scale);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
            ctx.fillRect(cx - sofaW/2, sy + wallPx + 5, sofaW, 18); ctx.strokeRect(cx - sofaW/2, sy + wallPx + 5, sofaW, 18);
            ctx.fillRect(cx - sofaW/2, sy + wallPx + 5, 18, sofaW*0.8); ctx.strokeRect(cx - sofaW/2, sy + wallPx + 5, 18, sofaW*0.8);
            ctx.strokeRect(cx - 10, cy - 10, 20, 20);
        }
        ctx.restore();
    }

    function drawRoom(rx, ry, rw, rh, title) {
        const sx = startX + rx * scale, sy = startY + ry * scale, sw = rw * scale, sh = rh * scale;
        lastAiPlanBoxes.push({ rx, ry, rw, rh, title });
        
        ctx.fillStyle = 'rgba(34,211,238,0.04)'; ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.strokeRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.strokeRect(sx + wallPx, sy + wallPx, sw - wallPx*2, sh - wallPx*2);

        if (!title.includes('سلم')) {
            const doorW = Math.min(24, sw * 0.2);
            const dx = sx + wallPx + 5, dy = sy + sh - wallPx;
            ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(dx, dy); ctx.lineTo(dx, dy - doorW); ctx.stroke();
            ctx.beginPath(); ctx.arc(dx, dy, doorW, -Math.PI/2, 0); ctx.stroke();
        } else {
            ctx.strokeStyle = '#fbbf24';
            for (let s = 1; s < 7; s++) {
                let stepY = sy + wallPx + s * ((sh - wallPx*2)/7);
                ctx.beginPath(); ctx.moveTo(sx + wallPx + 5, stepY); ctx.lineTo(sx + sw - wallPx - 5, stepY); ctx.stroke();
            }
        }

        if (furnish && !title.includes('سلم') && !title.includes('طرقة')) {
            drawFurniture(sx, sy, sw, sh, title);
        }

        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 13px Cairo'; ctx.textAlign = 'center';
        ctx.fillText(title, sx + sw/2, sy + sh/2 - 2);
        ctx.fillStyle = '#fbbf24'; ctx.font = '11px Arial';
        ctx.fillText(`${(rw-wallThick*2).toFixed(1)}x${(rh-wallThick*2).toFixed(1)}m`, sx + sw/2, sy + sh/2 + 14);
    }

    const frontH = avgDepth * 0.38, midH = avgDepth * 0.24, backH = avgDepth * 0.38;
    const stairW = avgWidth * 0.28, recepW = avgWidth - stairW;

    if (stairPos === 'front') {
        drawRoom(0, 0, stairW, frontH * 0.8, 'سلم ومدخل');
        drawRoom(stairW, 0, recepW, frontH, 'ريسبشن');
    } else {
        drawRoom(0, 0, avgWidth, frontH, 'ريسبشن كبير');
    }

    const hallW = avgWidth * 0.6;
    drawRoom(0, frontH, hallW, midH, 'طرقة');
    drawRoom(hallW, frontH, (avgWidth - hallW)*0.55, midH, 'مطبخ');
    drawRoom(hallW + (avgWidth - hallW)*0.55, frontH, (avgWidth - hallW)*0.45, midH, 'حمام');

    const roomW = avgWidth / roomsCount;
    for (let i = 0; i < roomsCount; i++) {
        drawRoom(i * roomW, frontH + midH, roomW, backH, `غرفة نوم ${i+1}`);
    }

    // الأبعاد الخارجية الشاملة
    drawDimLine(startX, startY - 20, startX + avgWidth*scale, startY - 20, `واجهة ${north}m`);
    drawDimLine(startX, startY + avgDepth*scale + 20, startX + avgWidth*scale, startY + avgDepth*scale + 20, `خلفي ${south}m`);
    
    const badge = document.getElementById('aiCadSummaryBadge');
    if(badge) badge.innerText = `المساحة: ${totalArea.toFixed(1)} م²`;
}

function exportAiPlanDXF() {
    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    lastAiPlanBoxes.forEach(b => {
        dxf += `0\nLINE\n8\nWALLS\n10\n${b.rx}\n20\n${b.ry}\n30\n0\n11\n${b.rx+b.rw}\n21\n${b.ry}\n31\n0\n`;
    });
    dxf += `0\nENDSEC\n0\nEOF`;
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `AutoCAD_Precision.dxf`; a.click();
}

// ==================== أداة القياس بالمثلثات (طريقة هيرون) والإصلاح ====================
function calcHeron(a, b, c) {
    if (a + b <= c || a + c <= b || b + c <= a) return 0;
    const s = (a + b + c) / 2;
    return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

function addTriangle() {
    const a = parseFloat(document.getElementById('triSideA')?.value) || 0;
    const b = parseFloat(document.getElementById('triSideB')?.value) || 0;
    const c = parseFloat(document.getElementById('triSideC')?.value) || 0;
    const area = calcHeron(a, b, c);
    if (area <= 0) { alert("مجموع أي ضلعين يجب أن يكون أكبر من الضلع الثالث!"); return; }
    trianglesList.push({ a, b, c, area });
    saveStateToStorage(); renderTriangles();
}

function deleteTriangle(i) { trianglesList.splice(i, 1); saveStateToStorage(); renderTriangles(); }
function clearTriangles() { trianglesList = []; saveStateToStorage(); renderTriangles(); }

function renderTriangles() {
    const tbody = document.getElementById('trianglesTableBody'); 
    if(!tbody) return;
    tbody.innerHTML = ''; 
    let totalArea = 0;

    trianglesList.forEach((t, i) => {
        totalArea += t.area;
        tbody.innerHTML += `<tr><td>مثلث (${i+1})</td><td>${t.a}</td><td>${t.b}</td><td>${t.c}</td><td><b>${t.area.toFixed(2)} م²</b></td><td><button class="btn-danger" style="padding:4px 8px" onclick="deleteTriangle(${i})"><i class="fa-solid fa-xmark"></i></button></td></tr>`;
    });
    
    const summary = document.getElementById('triTotalSummary');
    if(summary) summary.innerHTML = `<h3 style="color:#22d3ee;">إجمالي المثلثات: ${totalArea.toFixed(2)} م²</h3><p style="color:#fbbf24; font-weight:700;">${metersToFQS(totalArea).text}</p>`;

    const lastTri = trianglesList[trianglesList.length - 1];
    if (lastTri) {
        drawSingleTriangle(lastTri.a, lastTri.b, lastTri.c);
    } else {
        // تفريغ الكانفاس في حالة عدم وجود مثلثات
        const canvas = document.getElementById('triCanvas');
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
}

function drawSingleTriangle(a, b, c) {
    const canvas = document.getElementById('triCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const s = (a + b + c) / 2;
    const area = Math.sqrt(s * (s - a) * (s - b) * (s - c));
    if (area <= 0 || isNaN(area)) return;

    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    const p1 = { x: 0, y: 0 };
    const p2 = { x: c, y: 0 };
    const p3 = { x: b * cosA, y: b * sinA };

    const minX = Math.min(p1.x, p2.x, p3.x), maxX = Math.max(p1.x, p2.x, p3.x);
    const minY = Math.min(p1.y, p2.y, p3.y), maxY = Math.max(p1.y, p2.y, p3.y);

    const pad = 40;
    const widthDiff = (maxX - minX) === 0 ? 1 : (maxX - minX);
    const heightDiff = (maxY - minY) === 0 ? 1 : (maxY - minY);
    const scale = Math.min((canvas.width - pad * 2) / widthDiff, (canvas.height - pad * 2) / heightDiff);

    const toScreen = (pt) => ({
        x: pad + (pt.x - minX) * scale + (canvas.width - widthDiff * scale)/2 - pad,
        y: canvas.height - pad - (pt.y - minY) * scale - (canvas.height - heightDiff * scale)/2 + pad
    });

    const s1 = toScreen(p1), s2 = toScreen(p2), s3 = toScreen(p3);

    ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.lineTo(s3.x, s3.y); ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)'; ctx.fill();
    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.stroke();

    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 14px Cairo'; ctx.textAlign = 'center';
    ctx.fillText(`ضلع C: ${c}م`, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 + 20);
    ctx.fillText(`ضلع B: ${b}م`, (s1.x + s3.x) / 2 - 25, (s1.y + s3.y) / 2 - 10);
    ctx.fillText(`ضلع A: ${a}م`, (s2.x + s3.x) / 2 + 25, (s2.y + s3.y) / 2 - 10);
}

// ==================== أداة الخريطة التفاعلية (Leaflet) ====================
function initMapIfNeeded() {
    if (surveyMap) return;
    surveyMap = L.map('surveyMap').setView([28.1099, 30.7503], 15);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'] }).addTo(surveyMap);
    
    surveyMap.on('click', (e) => {
        mapPoints.push([e.latlng.lat, e.latlng.lng]);
        mapMarkers.push(L.circleMarker(e.latlng, { radius: 6, color: '#fbbf24', fillOpacity: 1 }).addTo(surveyMap));
        updateMapPolygon();
    });
}

function updateMapPolygon() {
    if (mapPolygonLayer) surveyMap.removeLayer(mapPolygonLayer);
    if (mapPoints.length >= 3) {
        let area = 0, R = 6378137;
        for (let i = 0; i < mapPoints.length; i++) {
            const p1 = mapPoints[i], p2 = mapPoints[(i + 1) % mapPoints.length];
            area += (p2[1] * Math.PI / 180 - p1[1] * Math.PI / 180) * (2 + Math.sin(p1[0] * Math.PI / 180) + Math.sin(p2[0] * Math.PI / 180));
        }
        area = Math.abs(area * R * R / 2);
        
        const out = document.getElementById('mapAreaOutput');
        if(out) out.innerText = `المساحة: ${area.toFixed(2)} م² (${metersToFQS(area).text})`;
        
        mapPolygonLayer = L.polygon(mapPoints, { color: '#fbbf24', fillColor: '#10b981', fillOpacity: 0.3 }).addTo(surveyMap);
    }
}

function undoLastMapPoint() { 
    if (mapPoints.length) { 
        mapPoints.pop(); 
        surveyMap.removeLayer(mapMarkers.pop()); 
        updateMapPolygon(); 
    } 
}

function clearMapPolygon() { 
    mapPoints = []; 
    mapMarkers.forEach(m => surveyMap.removeLayer(m)); 
    mapMarkers = []; 
    if (mapPolygonLayer) surveyMap.removeLayer(mapPolygonLayer); 
    const out = document.getElementById('mapAreaOutput');
    if(out) out.innerText = 'تم مسح المضلع.'; 
}

// ==================== دفتر الميزانية الطولية ====================
function addLevelRow() {
    const bs = parseFloat(document.getElementById('lvlBS')?.value);
    const is = parseFloat(document.getElementById('lvlIS')?.value);
    const fs = parseFloat(document.getElementById('lvlFS')?.value);
    
    levelRows.push({ bs: isNaN(bs) ? null : bs, is: isNaN(is) ? null : is, fs: isNaN(fs) ? null : fs });
    
    if(document.getElementById('lvlBS')) document.getElementById('lvlBS').value = ''; 
    if(document.getElementById('lvlIS')) document.getElementById('lvlIS').value = ''; 
    if(document.getElementById('lvlFS')) document.getElementById('lvlFS').value = '';
    
    saveStateToStorage(); recalcLeveling();
}

function resetLevelBook() { levelRows = []; saveStateToStorage(); recalcLeveling(); }

function recalcLeveling() {
    const tbody = document.getElementById('levelTableBody'); 
    if(!tbody) return;
    tbody.innerHTML = '';
    
    let curRL = parseFloat(document.getElementById('bmLevel')?.value) || 10;
    let curHI = null, sumBS = 0, sumFS = 0;
    
    levelRows.forEach((r, i) => {
        let rl = curRL;
        if (i === 0 && r.bs !== null) { curHI = curRL + r.bs; sumBS += r.bs; }
        else {
            if (r.fs !== null && curHI !== null) { rl = curHI - r.fs; curRL = rl; sumFS += r.fs; }
            else if (r.is !== null && curHI !== null) { rl = curHI - r.is; curRL = rl; }
            if (r.bs !== null) { curHI = rl + r.bs; sumBS += r.bs; }
        }
        tbody.innerHTML += `<tr><td>نقطة ${i+1}</td><td>${r.bs ?? '-'}</td><td>${r.is ?? '-'}</td><td>${r.fs ?? '-'}</td><td>${curHI?.toFixed(3) ?? '-'}</td><td><b>${rl.toFixed(3)}</b></td><td>رصدة</td></tr>`;
    });
    
    const chk = document.getElementById('levelCheckSummary');
    if(chk) chk.innerHTML = `<b>التحقيق:</b> مجموع BS - FS = ${(sumBS - sumFS).toFixed(3)} م`;
}

// ==================== حاسبة COGO (الانحرافات) ====================
function calcCogo() {
    const E1 = parseFloat(document.getElementById('cogoE1')?.value) || 0;
    const N1 = parseFloat(document.getElementById('cogoN1')?.value) || 0;
    const E2 = parseFloat(document.getElementById('cogoE2')?.value) || 0;
    const N2 = parseFloat(document.getElementById('cogoN2')?.value) || 0;

    const dE = E2 - E1;
    const dN = N2 - N1;
    const dist = Math.hypot(dE, dN);

    let azimuth = Math.atan2(dE, dN) * (180 / Math.PI);
    if (azimuth < 0) azimuth += 360;

    const out = document.getElementById('cogoResults');
    if(out) {
        out.innerHTML = `
            <h3 style="color:#f43f5e; margin-bottom:10px;">نتائج الانحراف (COGO)</h3>
            <p><b>المسافة:</b> ${dist.toFixed(3)} م</p>
            <p><b>الزاوية (Azimuth):</b> ${azimuth.toFixed(4)}°</p>
        `;
    }
}

// ==================== محول الوحدات المساحية الشامل ====================
function convertFromMeters() {
    const m2 = parseFloat(document.getElementById('convMeters')?.value) || 0;
    const fqs = metersToFQS(m2);
    if(document.getElementById('convFeddan')) document.getElementById('convFeddan').value = fqs.feddan;
    if(document.getElementById('convQirat')) document.getElementById('convQirat').value = fqs.qirat;
    if(document.getElementById('convSahm')) document.getElementById('convSahm').value = fqs.sahm;
    
    const out = document.getElementById('convDetailedOutput');
    if(out) out.innerHTML = `<h3 style="color:#fbbf24">التحويل الفوري</h3><p><b>المتر المربع:</b> ${m2.toFixed(2)} م²</p><p><b>الوحدات:</b> ${fqs.text}</p>`;
}

function convertFromFQS() {
    const f = parseFloat(document.getElementById('convFeddan')?.value) || 0;
    const q = parseFloat(document.getElementById('convQirat')?.value) || 0;
    const s = parseFloat(document.getElementById('convSahm')?.value) || 0;
    const m2 = fqsToMeters(f, q, s);
    if(document.getElementById('convMeters')) document.getElementById('convMeters').value = m2.toFixed(2);
    convertFromMeters();
}

// ==================== الحفظ التلقائي Local Storage وتطبيق PWA ====================
function saveStateToStorage() {
    localStorage.setItem('ds_pro_v6', JSON.stringify({ trianglesList, levelRows }));
}

function loadSavedState() {
    const savedTheme = localStorage.getItem('ds_theme_pref');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        const found = themesList.findIndex(t => t.id === savedTheme);
        if (found !== -1) { 
            currentThemeIdx = found; 
            const lbl = document.getElementById('themeNameLabel');
            if(lbl) lbl.innerText = themesList[found].name; 
        }
    }
    const raw = localStorage.getItem('ds_pro_v6');
    if (raw) {
        try { 
            const d = JSON.parse(raw); 
            if (d.trianglesList) trianglesList = d.trianglesList; 
            if (d.levelRows) levelRows = d.levelRows; 
        } catch(e){}
    } else { 
        trianglesList = [{ a: 30, b: 40, c: 50, area: 600 }]; 
    }
}

function clearSavedData() { 
    if (confirm("هل تريد مسح البيانات وإعادة ضبط البرنامج؟")) { 
        localStorage.clear(); 
        location.reload(); 
    } 
}

let deferredPrompt;
function registerPWA() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
    window.addEventListener('beforeinstallprompt', (e) => { 
        e.preventDefault(); 
        deferredPrompt = e; 
        const btn = document.getElementById('installPwaBtn');
        if(btn) btn.style.display = 'inline-flex'; 
    });
    
    const installBtn = document.getElementById('installPwaBtn');
    if(installBtn) {
        installBtn.addEventListener('click', async () => { 
            if (!deferredPrompt) return; 
            deferredPrompt.prompt(); 
            await deferredPrompt.userChoice; 
            deferredPrompt = null; 
        });
    }
}