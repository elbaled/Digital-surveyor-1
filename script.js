// ==================== المتغيرات العامة ====================
let surveyMap = null;
let mapPoints = [];
let mapPolygonLayer = null;
let mapMarkers = [];

// خريطة تحديد اتجاه الشمال الاختيارية داخل الكروكي
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

// ==================== تشغيل الموقع والإنترو ====================
window.addEventListener('DOMContentLoaded', () => {
    runSplashIntro();
    loadSavedState();
    updateCroquisAndSave();
    generateAiCadPlan();
    renderTriangles();
    recalcLeveling();
    calcCogo();
    convertFromMeters();
    registerPWA();
});

function runSplashIntro() {
    const bar = document.getElementById('introProgress');
    const status = document.getElementById('introStatusText');
    let progress = 0;
    const steps = [
        "جاري تهيئة محرك الرسم الهندسي (AutoCAD AI)...",
        "جاري تحميل خرائط الأقمار الصناعية وبوصلة الشمال...",
        "تجهيز أدوات الفرز الشرعي للمواريث — م. أحمد سمير...",
        "اكتمل التحميل — النسخة التجريبية جاهزة!"
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
    }, 450);
}

function closeIntroSplash() {
    const splash = document.getElementById('splashIntro');
    if (splash) splash.classList.add('hidden');
}

// ==================== تغيير ألوان الموقع (Themes) ====================
function cycleTheme() {
    currentThemeIdx = (currentThemeIdx + 1) % themesList.length;
    const selected = themesList[currentThemeIdx];
    document.documentElement.setAttribute('data-theme', selected.id);
    document.getElementById('themeNameLabel').innerText = selected.name;
    localStorage.setItem('ds_theme_pref', selected.id);
}

// ==================== التنقل بين الأيقونات ====================
function openTool(toolName) {
    document.querySelectorAll('.tool-view').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(`view-${toolName}`);
    if (target) target.classList.add('active');

    if (toolName === 'map') {
        setTimeout(() => {
            initMapIfNeeded();
            surveyMap.invalidateSize();
        }, 150);
    }
}

// ==================== تحويل المتر المربع إلى (فدان / قيراط / سهم) ====================
function metersToFQS(areaM2) {
    if (!areaM2 || areaM2 <= 0) return { feddan: 0, qirat: 0, sahm: 0, text: "0 فدان، 0 قيراط، 0 سهم" };
    const feddanArea = 4200.833333333333;
    const qiratArea = feddanArea / 24;
    const sahmArea = qiratArea / 24;

    let rem = areaM2;
    const feddan = Math.floor(rem / feddanArea);
    rem -= feddan * feddanArea;

    const qirat = Math.floor(rem / qiratArea);
    rem -= qirat * qiratArea;

    const sahm = (rem / sahmArea).toFixed(2);
    return {
        feddan,
        qirat,
        sahm,
        text: `${feddan} فدان ، ${qirat} قيراط ، ${sahm} سهم`
    };
}

// ==================== خريطة تحديد اتجاه الشمال الاختيارية داخل الكروكي ====================
function toggleCroquisCompassMap() {
    const box = document.getElementById('croquisMiniMapBox');
    if (box.style.display === 'none') {
        box.style.display = 'block';
        setTimeout(() => {
            initCroquisCompassMap();
            croquisNorthMap.invalidateSize();
        }, 150);
    } else {
        box.style.display = 'none';
    }
}

function initCroquisCompassMap() {
    if (croquisNorthMap) return;
    croquisNorthMap = L.map('croquisNorthMap').setView([28.1099, 30.7503], 16);

    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(croquisNorthMap);

    croquisNorthMap.on('click', (e) => {
        if (compassPts.length >= 2) resetCompassMiniMap();
        compassPts.push(e.latlng);
        const m = L.circleMarker(e.latlng, { radius: 6, color: '#fbbf24', fillOpacity: 1 }).addTo(croquisNorthMap);
        compassMarkers.push(m);

        if (compassPts.length === 1) {
            document.getElementById('compassMapStatus').innerText = 'تم تحديد النقطة (1) — اضغط الآن على النقطة (2) لنهاية الضلع البحري...';
        } else if (compassPts.length === 2) {
            compassLineLayer = L.polyline(compassPts, { color: '#10b981', weight: 4 }).addTo(croquisNorthMap);
            // حساب انحراف الضلع واستنتاج اتجاه الشمال الحقيقي بالنسبة للوحة الكروكي
            const p1 = compassPts[0];
            const p2 = compassPts[1];
            const dLon = (p2.lng - p1.lng) * Math.PI / 180;
            const lat1 = p1.lat * Math.PI / 180;
            const lat2 = p2.lat * Math.PI / 180;

            const y = Math.sin(dLon) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
            let brng = Math.atan2(y, x) * 180 / Math.PI;
            brng = (brng + 360) % 360;

            // زاوية دوران سهم الشمال على اللوحة
            const northTilt = Math.round((brng - 90 + 360) % 360);
            document.getElementById('northAngleInput').value = northTilt;
            document.getElementById('compassMapStatus').innerText =
                `تم رصد اتجاه الشمال من الخريطة بنجاح! زاوية الشمال = ${northTilt}°`;
            updateCroquisAndSave();
        }
    });
}

function resetCompassMiniMap() {
    compassPts = [];
    compassMarkers.forEach(m => croquisNorthMap.removeLayer(m));
    compassMarkers = [];
    if (compassLineLayer) croquisNorthMap.removeLayer(compassLineLayer);
    document.getElementById('compassMapStatus').innerText = 'انقر النقطة الأولى لبداية الضلع على الخريطة...';
}

// ==================== 1. لوحة الكروكي المساحي + الجيران + المالك + الفرز الشرعي ====================
function updateCroquisAndSave() {
    const owner = document.getElementById('ownerName').value || 'غير محدد';
    const surveyor = document.getElementById('surveyorName').value || 'م. أحمد سمير';
    const location = document.getElementById('landLocation').value || '-';
    const dateStr = document.getElementById('surveyDate').value || '-';

    const N = parseFloat(document.getElementById('cadNorth').value) || 0;
    const S = parseFloat(document.getElementById('cadSouth').value) || 0;
    const E = parseFloat(document.getElementById('cadEast').value) || 0;
    const W = parseFloat(document.getElementById('cadWest').value) || 0;
    const D = parseFloat(document.getElementById('cadDiag').value) || 0;
    const northAngle = parseFloat(document.getElementById('northAngleInput').value) || 0;

    const nbNorth = document.getElementById('neighborNorth').value || 'حد بحري';
    const nbSouth = document.getElementById('neighborSouth').value || 'حد قبلي';
    const nbEast = document.getElementById('neighborEast').value || 'حد شرقي';
    const nbWest = document.getElementById('neighborWest').value || 'حد غربي';

    const males = parseInt(document.getElementById('heirsMale').value) || 0;
    const females = parseInt(document.getElementById('heirsFemale').value) || 0;
    const splitDir = document.getElementById('splitDirection').value;

    let totalArea = 0;
    if (D > 0) {
        totalArea = calcHeron(N, W, D) + calcHeron(S, E, D);
    } else {
        const s = (N + S + E + W) / 2;
        const val = (s - N) * (s - S) * (s - E) * (s - W);
        totalArea = val > 0 ? Math.sqrt(val) : ((N + S) / 2) * ((E + W) / 2);
    }

    const perimeter = N + S + E + W;
    const fqs = metersToFQS(totalArea);

    document.getElementById('cadTotalAreaBadge').innerText =
        `المساحة: ${totalArea.toFixed(2)} م² (${fqs.text})`;

    const totalShares = (males * 2) + (females * 1);
    const singleShareRatio = totalShares > 0 ? (1 / totalShares) : 0;
    const maleRatio = singleShareRatio * 2;
    const femaleRatio = singleShareRatio * 1;

    let parcels = [];
    for (let i = 1; i <= males; i++) {
        parcels.push({
            label: `نصيب ذكر (${i})`,
            fractionText: males === 1 && females === 1 ? 'الثلثان (2/3)' : `2/${totalShares}`,
            ratio: maleRatio,
            area: totalArea * maleRatio,
            color: '#22d3ee'
        });
    }
    for (let j = 1; j <= females; j++) {
        parcels.push({
            label: `نصيب أنثى (${j})`,
            fractionText: males === 1 && females === 1 ? 'الثلث (1/3)' : `1/${totalShares}`,
            ratio: femaleRatio,
            area: totalArea * femaleRatio,
            color: '#f472b6'
        });
    }

    lastCroquisData = {
        owner, surveyor, location, dateStr,
        N, S, E, W, northAngle, nbNorth, nbSouth, nbEast, nbWest,
        totalArea, perimeter, fqs, parcels, splitDir
    };

    drawFullSurveyCroquis(lastCroquisData);
    renderCroquisReport(lastCroquisData, males, females, totalShares);
    saveStateToStorage();
}

function drawFullSurveyCroquis(data) {
    const canvas = document.getElementById('croquisCanvas');
    const ctx = canvas.getContext('2d');
    const W_CANVAS = canvas.width;
    const H_CANVAS = canvas.height;
    ctx.clearRect(0, 0, W_CANVAS, H_CANVAS);

    ctx.fillStyle = '#040b0e';
    ctx.fillRect(0, 0, W_CANVAS, H_CANVAS);

    // شبكة هندسية دقيقة
    ctx.strokeStyle = '#0c222b';
    ctx.lineWidth = 1;
    for (let x = 0; x < W_CANVAS; x += 25) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H_CANVAS); ctx.stroke();
    }
    for (let y = 0; y < H_CANVAS; y += 25) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W_CANVAS, y); ctx.stroke();
    }

    // الإطار المزدوج للوحة الكروكي
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, W_CANVAS - 20, H_CANVAS - 20);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.strokeRect(15, 15, W_CANVAS - 30, H_CANVAS - 30);

    // رسم سهم الشمال بزاوية الخريطة أو الزاوية المدخلة
    drawRotatedNorthArrow(ctx, 75, 75, data.northAngle);

    const { N, S, E, W, nbNorth, nbSouth, nbEast, nbWest, parcels, splitDir } = data;
    if (N <= 0 || S <= 0 || E <= 0 || W <= 0) return;

    const drawAreaHeight = H_CANVAS - 145;
    const maxHoriz = Math.max(N, S);
    const maxVert = Math.max(E, W);
    const padX = 160;
    const padY = 90;

    const scale = Math.min(
        (W_CANVAS - padX * 2) / maxHoriz,
        (drawAreaHeight - padY * 2) / maxVert
    );

    const cx = W_CANVAS / 2;
    const cy = drawAreaHeight / 2 + 12;

    const pNW = { x: cx - (N * scale) / 2, y: cy - (W * scale) / 2 };
    const pNE = { x: cx + (N * scale) / 2, y: cy - (E * scale) / 2 };
    const pSE = { x: cx + (S * scale) / 2, y: cy + (E * scale) / 2 };
    const pSW = { x: cx - (S * scale) / 2, y: cy + (W * scale) / 2 };

    const lerpPt = (p1, p2, t) => ({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
    });

    if (parcels.length > 0) {
        let acc = 0;
        parcels.forEach((p) => {
            const t1 = acc;
            const t2 = acc + p.ratio;
            acc = t2;

            let poly = [];
            if (splitDir === 'vertical') {
                poly = [
                    lerpPt(pNE, pNW, t1),
                    lerpPt(pNE, pNW, t2),
                    lerpPt(pSE, pSW, t2),
                    lerpPt(pSE, pSW, t1)
                ];
            } else {
                poly = [
                    lerpPt(pNE, pSE, t1),
                    lerpPt(pNE, pSE, t2),
                    lerpPt(pNW, pSW, t2),
                    lerpPt(pNW, pSW, t1)
                ];
            }

            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);
            poly.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
            ctx.closePath();
            ctx.fillStyle = p.color + '24';
            ctx.fill();

            ctx.strokeStyle = p.color;
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.setLineDash([]);

            const midX = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
            const midY = (poly[0].y + poly[1].y + poly[2].y + poly[3].y) / 4;

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px Cairo';
            ctx.textAlign = 'center';
            ctx.fillText(`${p.label} [${p.fractionText}]`, midX, midY - 6);
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 12px Cairo';
            ctx.fillText(`${p.area.toFixed(1)} م²`, midX, midY + 13);
        });
    }

    // حدود الأرض الأربعة
    ctx.beginPath();
    ctx.moveTo(pNW.x, pNW.y);
    ctx.lineTo(pNE.x, pNE.y);
    ctx.lineTo(pSE.x, pSE.y);
    ctx.lineTo(pSW.x, pSW.y);
    ctx.closePath();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // دوائر أركان الحديد المساحية
    [pNW, pNE, pSE, pSW].forEach((pt, i) => {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#f43f5e';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    });

    ctx.textAlign = 'center';
    const topMidX = (pNW.x + pNE.x) / 2;
    const topMidY = Math.min(pNW.y, pNE.y);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الضلع الشمالي (فوق): ${N} م`, topMidX, topMidY - 12);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px Cairo';
    ctx.fillText(`الحد البحري: ${nbNorth}`, topMidX, topMidY - 32);

    const botMidX = (pSW.x + pSE.x) / 2;
    const botMidY = Math.max(pSW.y, pSE.y);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الضلع الجنوبي (تحت): ${S} م`, botMidX, botMidY + 22);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px Cairo';
    ctx.fillText(`الحد القبلي: ${nbSouth}`, botMidX, botMidY + 42);

    const rightMidX = Math.max(pNE.x, pSE.x);
    const rightMidY = (pNE.y + pSE.y) / 2;
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الشرقي (يمين): ${E} م`, rightMidX + 78, rightMidY - 8);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px Cairo';
    ctx.fillText(`${nbEast}`, rightMidX + 78, rightMidY + 14);

    const leftMidX = Math.min(pNW.x, pSW.x);
    const leftMidY = (pNW.y + pSW.y) / 2;
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الغربي (شمال): ${W} م`, leftMidX - 78, leftMidY - 8);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px Cairo';
    ctx.fillText(`${nbWest}`, leftMidX - 78, leftMidY + 14);

    // الخرطوشة الهندسية أسفل اللوحة
    const tbY = H_CANVAS - 125;
    const tbH = 110;
    ctx.fillStyle = '#08181f';
    ctx.fillRect(15, tbY, W_CANVAS - 30, tbH);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(15, tbY, W_CANVAS - 30, tbH);

    ctx.beginPath();
    ctx.moveTo(290, tbY); ctx.lineTo(290, tbY + tbH);
    ctx.moveTo(565, tbY); ctx.lineTo(565, tbY + tbH);
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`المالك: ${data.owner}`, W_CANVAS - 30, tbY + 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '13px Cairo';
    ctx.fillText(`الموقع: ${data.location}`, W_CANVAS - 30, tbY + 58);
    ctx.fillText(`التاريخ: ${data.dateStr} | زاوية الشمال: ${data.northAngle}°`, W_CANVAS - 30, tbY + 86);

    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`المساحة بالمتر: ${data.totalArea.toFixed(2)} م²`, 550, tbY + 30);
    ctx.fillStyle = '#10b981';
    ctx.fillText(`بالفدان: ${data.fqs.text}`, 550, tbY + 58);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`المحيط الكلي: ${data.perimeter.toFixed(2)} متر طولي`, 550, tbY + 86);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 13px Cairo';
    ctx.fillText(`المهندس المسّاح القائم بالرفع:`, 275, tbY + 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Cairo';
    ctx.fillText(`${data.surveyor}`, 275, tbY + 56);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 11px Cairo';
    ctx.fillText(`المسّاح الرقمي PRO - النسخة التجريبية`, 275, tbY + 86);
}

function drawRotatedNorthArrow(ctx, x, y, angleDeg = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((angleDeg * Math.PI) / 180);

    ctx.strokeStyle = '#fbbf24';
    ctx.fillStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-8, 12);
    ctx.lineTo(0, 5);
    ctx.lineTo(8, 12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 12px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText('N', 0, -29);
    ctx.restore();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText(`شمال (${angleDeg}°)`, x, y + 42);
}

function renderCroquisReport(data, males, females, totalShares) {
    const box = document.getElementById('cadShariaResults');

    let shariaNote = '';
    if (males === 1 && females === 1) {
        shariaNote = `<p style="color:#10b981; font-weight:700;">تطبيق الشرع الإسلامي (للذكر مثل حظ الأنثيين): الذكر يأخذ <b>الثلثين (2/3 = 66.67%)</b>، والأنثى تأخذ <b>الثلث (1/3 = 33.33%)</b>.</p>`;
    } else if (totalShares > 0) {
        shariaNote = `<p style="color:#10b981;">إجمالي الأسهم الشرعية = <b>${totalShares} سهم</b> (الذكر = سهمان، والأنثى = سهم واحد).</p>`;
    }

    let cardsHtml = '';
    data.parcels.forEach(p => {
        const sideInfo = data.splitDir === 'vertical'
            ? `واجهة بحرية: ${(data.N * p.ratio).toFixed(2)} م | قبلية: ${(data.S * p.ratio).toFixed(2)} م`
            : `ضلع شرقي: ${(data.E * p.ratio).toFixed(2)} م | غربي: ${(data.W * p.ratio).toFixed(2)} م`;

        cardsHtml += `
            <div class="sharia-card" style="border-right-color:${p.color}">
                <strong>${p.label}</strong> (${p.fractionText})<br>
                المساحة: <b>${p.area.toFixed(2)} م²</b><br>
                <small style="color:#fbbf24">${metersToFQS(p.area).text}</small><br>
                <small style="color:#22d3ee">${sideInfo}</small>
            </div>
        `;
    });

    box.innerHTML = `
        <h3 style="color:#fbbf24; margin-bottom:8px;">تقرير الكروكي المساحي والفرز الشرعي</h3>
        <p><b>المالك:</b> ${data.owner} | <b>المهندس المسّاح:</b> ${data.surveyor} | <b>زاوية الشمال:</b> ${data.northAngle}°</p>
        <p style="margin:6px 0;"><b>الحدود الأربعة:</b> بحري: (${data.nbNorth}) | قبلي: (${data.nbSouth}) | شرقي: (${data.nbEast}) | غربي: (${data.nbWest})</p>
        ${shariaNote}
        <div class="sharia-grid">${cardsHtml}</div>
    `;
}

function downloadCroquisImage() {
    const canvas = document.getElementById('croquisCanvas');
    const link = document.createElement('a');
    link.download = `كروكي_${lastCroquisData.owner || 'مساحي'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function exportCroquisDXF() {
    const { N, S, E, W } = lastCroquisData;
    if (!N || !S || !E || !W) return;

    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    const addLine = (x1, y1, x2, y2, layer = "BOUNDARY") => {
        dxf += `0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0\n`;
    };

    addLine(0, 0, S, 0, "LAND_BORDER");
    addLine(S, 0, N, E, "LAND_BORDER");
    addLine(N, E, 0, W, "LAND_BORDER");
    addLine(0, W, 0, 0, "LAND_BORDER");

    dxf += `0\nENDSEC\n0\nEOF`;
    const blob = new Blob([dxf], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Survey_Croquis_4Sides.dxf`;
    a.click();
}

// ==================== 2. الأوتوكاد الذكي فائق الدقة الهندسية (High-Precision AutoCAD AI) ====================
function generateAiCadPlan() {
    const north = parseFloat(document.getElementById('aiNorth').value) || 12;
    const south = parseFloat(document.getElementById('aiSouth').value) || 12;
    const east = parseFloat(document.getElementById('aiEast').value) || 18;
    const west = parseFloat(document.getElementById('aiWest').value) || 18;

    const roomsCount = parseInt(document.getElementById('aiRooms').value) || 3;
    const bathsCount = parseInt(document.getElementById('aiBaths').value) || 2;
    const wallThick = parseFloat(document.getElementById('aiWallThickness').value) || 0.25;
    const showAxes = document.getElementById('aiShowAxes').value === 'yes';
    const stairPos = document.getElementById('aiStairPos').value;
    const hasShaft = document.getElementById('aiShaft').value === 'yes';

    const avgWidth = (north + south) / 2;
    const avgDepth = (east + west) / 2;
    const totalArea = avgWidth * avgDepth;
    const netArea = (avgWidth - wallThick * 2) * (avgDepth - wallThick * 2);

    document.getElementById('aiCadSummaryBadge').innerText =
        `المساحة الكلية: ${totalArea.toFixed(1)} م² | الصافية: ${netArea.toFixed(1)} م² (سمك الحائط ${wallThick * 100}سم)`;

    const canvas = document.getElementById('aiCadCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // خلفية الأوتوكاد الاحترافية
    ctx.fillStyle = '#050b11';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // شبكة المليمتر والوحدات الهندسية
    ctx.strokeStyle = '#0d1b26';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const pad = 95;
    const scale = Math.min(
        (canvas.width - pad * 2) / Math.max(north, south),
        (canvas.height - pad * 2) / Math.max(east, west)
    );

    const startX = (canvas.width - avgWidth * scale) / 2;
    const startY = (canvas.height - avgDepth * scale) / 2;
    const wallPx = Math.max(4, wallThick * scale);

    lastAiPlanBoxes = [];

    // 1. رسم المحاور الهندسية (Axes Grid: A, B, C & 1, 2, 3, 4)
    if (showAxes) {
        const xAxes = [0, avgWidth * 0.32, avgWidth * 0.66, avgWidth];
        const xLabels = ['A', 'B', 'C', 'D'];
        xAxes.forEach((ax, i) => {
            const sx = startX + ax * scale;
            ctx.save();
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
            ctx.setLineDash([8, 4, 2, 4]);
            ctx.beginPath();
            ctx.moveTo(sx, startY - 38);
            ctx.lineTo(sx, startY + avgDepth * scale + 20);
            ctx.stroke();

            // دائرة المحور العلوية
            ctx.setLineDash([]);
            ctx.strokeStyle = '#f43f5e';
            ctx.fillStyle = '#050b11';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(sx, startY - 48, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#f43f5e';
            ctx.font = 'bold 11px Cairo';
            ctx.textAlign = 'center';
            ctx.fillText(xLabels[i], sx, startY - 44);
            ctx.restore();
        });

        const yAxes = [0, avgDepth * 0.38, avgDepth * 0.62, avgDepth];
        const yLabels = ['1', '2', '3', '4'];
        yAxes.forEach((ay, i) => {
            const sy = startY + ay * scale;
            ctx.save();
            ctx.strokeStyle = 'rgba(244, 63, 94, 0.35)';
            ctx.setLineDash([8, 4, 2, 4]);
            ctx.beginPath();
            ctx.moveTo(startX - 38, sy);
            ctx.lineTo(startX + avgWidth * scale + 20, sy);
            ctx.stroke();

            ctx.setLineDash([]);
            ctx.strokeStyle = '#f43f5e';
            ctx.fillStyle = '#050b11';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(startX - 48, sy, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#f43f5e';
            ctx.font = 'bold 11px Cairo';
            ctx.textAlign = 'center';
            ctx.fillText(yLabels[i], startX - 48, sy + 4);
            ctx.restore();
        });
    }

    // دالة رسم الغرف بحوائط مزدوجة دقيقة وشبابيك وأبواب
    function drawPrecisionRoom(rx, ry, rw, rh, title, layerColor = '#22d3ee', isStair = false, isShaft = false) {
        const sx = startX + rx * scale;
        const sy = startY + ry * scale;
        const sw = rw * scale;
        const sh = rh * scale;

        lastAiPlanBoxes.push({ rx, ry, rw, rh, title });

        ctx.fillStyle = isShaft ? 'rgba(244,63,94,0.12)' : 'rgba(34,211,238,0.05)';
        ctx.fillRect(sx, sy, sw, sh);

        // الحائط الخارجي والداخلي بسمك هندسي
        ctx.strokeStyle = layerColor;
        ctx.lineWidth = 2.4;
        ctx.strokeRect(sx, sy, sw, sh);

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + wallPx, sy + wallPx, sw - wallPx * 2, sh - wallPx * 2);

        if (isShaft) {
            // علامة المنور الهندسية (X)
            ctx.beginPath();
            ctx.strokeStyle = '#f43f5e';
            ctx.moveTo(sx, sy); ctx.lineTo(sx + sw, sy + sh);
            ctx.moveTo(sx + sw, sy); ctx.lineTo(sx, sy + sh);
            ctx.stroke();
        } else if (isStair) {
            // رسم درجات السلم الهندسية (قلبتين وصدفة)
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.2;
            const steps = 8;
            for (let s = 1; s < steps; s++) {
                const stepY = sy + wallPx + (s * (sh - wallPx * 2)) / steps;
                ctx.beginPath();
                ctx.moveTo(sx + wallPx + 6, stepY);
                ctx.lineTo(sx + sw - wallPx - 6, stepY);
                ctx.stroke();
            }
        } else {
            // رسم رمز الباب بزاوية 90 درجة وقوس الفتح
            const doorW = Math.min(22, sw * 0.22);
            const dx = sx + wallPx + 8;
            const dy = sy + sh - wallPx;
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(dx, dy);
            ctx.lineTo(dx, dy - doorW);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(dx, dy, doorW, -Math.PI / 2, 0);
            ctx.stroke();
        }

        // كتابة اسم الغرفة والأبعاد الصافية والمحورية
        const netW = Math.max(0.5, rw - wallThick);
        const netH = Math.max(0.5, rh - wallThick);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 12px Cairo';
        ctx.textAlign = 'center';
        ctx.fillText(title, sx + sw / 2, sy + sh / 2 - 4);
        if (!isShaft) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = '11px Cairo';
            ctx.fillText(`${netW.toFixed(2)}م × ${netH.toFixed(2)}م`, sx + sw / 2, sy + sh / 2 + 12);
        }
    }

    const frontH = avgDepth * 0.38;
    const midH = avgDepth * 0.24;
    const backH = avgDepth * 0.38;

    // توزيع المنطقة الأمامية
    const stairW = avgWidth * 0.28;
    const recepW = avgWidth - stairW;
    if (stairPos === 'front') {
        drawPrecisionRoom(0, 0, stairW, frontH * 0.82, 'سلم ومدخل', '#a855f7', true, false);
        drawPrecisionRoom(stairW, 0, recepW, frontH, 'ريسبشن واستقبال', '#10b981');
    } else {
        drawPrecisionRoom(0, 0, avgWidth * 0.66, frontH, 'ريسبشن واستقبال', '#10b981');
        drawPrecisionRoom(avgWidth * 0.66, 0, avgWidth * 0.34, frontH, 'مجلس / مكتب', '#22d3ee');
    }

    // توزيع المنطقة الوسطى
    const serviceW = avgWidth * 0.40;
    const hallW = avgWidth - serviceW;
    drawPrecisionRoom(0, frontH, hallW, midH, 'صالة توزيع ومعيشة', '#94a3b8');

    const kitchW = serviceW * 0.52;
    const bathW = serviceW * 0.48;
    drawPrecisionRoom(hallW, frontH, kitchW, midH, 'مطبخ', '#fbbf24');
    drawPrecisionRoom(hallW + kitchW, frontH, bathW, midH, bathsCount > 1 ? `حمام (${bathsCount})` : 'حمام', '#22d3ee');

    if (hasShaft) {
        drawPrecisionRoom(hallW + kitchW + bathW * 0.55, frontH, bathW * 0.45, midH * 0.48, 'منور', '#f43f5e', false, true);
    }

    // توزيع غرف النوم الخلفية
    const roomW = avgWidth / roomsCount;
    for (let i = 0; i < roomsCount; i++) {
        drawPrecisionRoom(i * roomW, frontH + midH, roomW, backH, `غرفة نوم (${i + 1})`, '#22d3ee');
    }

    // رسم الأعمدة الخرسانية المسلحة في التقاطعات
    if (showAxes) {
        const colX = [0, avgWidth * 0.32, avgWidth * 0.66, avgWidth];
        const colY = [0, frontH, frontH + midH, avgDepth];
        ctx.fillStyle = '#f43f5e';
        colX.forEach(cx => {
            colY.forEach(cy => {
                const px = startX + cx * scale - 4;
                const py = startY + cy * scale - 4;
                ctx.fillRect(px, py, 8, 8);
            });
        });
    }

    // رسم خطوط الأبعاد الهندسية الخارجية للأضلاع الأربعة (Dimension Lines)
    drawCadDimensionLine(ctx, startX, startY + avgDepth * scale + 28, startX + avgWidth * scale, startY + avgDepth * scale + 28, `الضلع الجنوبي (تحت): ${south} م`);
    drawCadDimensionLine(ctx, startX, startY - 22, startX + avgWidth * scale, startY - 22, `الضلع الشمالي (الواجهة): ${north} م`);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText(`الشرقي (يمين): ${east} م`, startX + avgWidth * scale + 55, startY + (avgDepth * scale) / 2);
    ctx.fillText(`الغربي (شمال): ${west} م`, startX - 55, startY + (avgDepth * scale) / 2);

    document.getElementById('aiCadReport').innerHTML = `
        <h3 style="color:#fbbf24; margin-bottom:8px;">التقرير الهندسي الدقيق — AutoCAD AI (م. أحمد سمير)</h3>
        <p><b>الأبعاد الخارجية للأضلاع الأربعة:</b> شمالي ${north}م × جنوبي ${south}م × شرقي ${east}م × غربي ${west}م | <b>المساحة الكلية:</b> ${totalArea.toFixed(2)} م² | <b>المساحة الصافية:</b> ${netArea.toFixed(2)} م².</p>
        <p style="margin-top:6px; color:#cbd5e1;">تم توقيع المحاور الإنشائية (A-D / 1-4)، الأعمدة الخرسانية المسلحة (16 عمود)، سمك الحوائط (${wallThick * 100} سم)، وتوزيع ${roomsCount} غرف نوم + ${bathsCount} حمام + مطبخ + ريسبشن.</p>
    `;
}

function drawCadDimensionLine(ctx, x1, y1, x2, y2, text) {
    ctx.save();
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // شرطات الأوتوكاد المائلة (Architectural Ticks)
    ctx.beginPath();
    ctx.moveTo(x1 - 4, y1 + 4); ctx.lineTo(x1 + 4, y1 - 4);
    ctx.moveTo(x2 - 4, y2 + 4); ctx.lineTo(x2 + 4, y2 - 4);
    ctx.stroke();

    ctx.font = 'bold 12px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText(text, (x1 + x2) / 2, y1 - 6);
    ctx.restore();
}

function exportAiPlanDXF() {
    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    const addRect = (x, y, w, h, layer = "WALLS") => {
        const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
        for (let i = 0; i < 4; i++) {
            const p1 = pts[i], p2 = pts[(i + 1) % 4];
            dxf += `0\nLINE\n8\n${layer}\n10\n${p1[0].toFixed(2)}\n20\n${p1[1].toFixed(2)}\n30\n0\n11\n${p2[0].toFixed(2)}\n21\n${p2[1].toFixed(2)}\n31\n0\n`;
        }
    };
    lastAiPlanBoxes.forEach(b => addRect(b.rx, b.ry, b.rw, b.rh, "AI_CAD_WALLS"));
    dxf += `0\nENDSEC\n0\nEOF`;

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `AutoCAD_Precision_Eng_AhmedSamir.dxf`;
    a.click();
}

// ==================== 3. أداة القياس بالمثلثات (طريقة هيرون) ====================
function calcHeron(a, b, c) {
    if (a + b <= c || a + c <= b || b + c <= a) return 0;
    const s = (a + b + c) / 2;
    return Math.sqrt(s * (s - a) * (s - b) * (s - c));
}

function addTriangle() {
    const a = parseFloat(document.getElementById('triSideA').value) || 0;
    const b = parseFloat(document.getElementById('triSideB').value) || 0;
    const c = parseFloat(document.getElementById('triSideC').value) || 0;

    const area = calcHeron(a, b, c);
    if (area <= 0) {
        alert("تنبيه هندسي: مجموع أي ضلعين في المثلث يجب أن يكون أكبر من الضلع الثالث!");
        return;
    }

    trianglesList.push({ a, b, c, area });
    saveStateToStorage();
    renderTriangles();
}

function deleteTriangle(index) {
    trianglesList.splice(index, 1);
    saveStateToStorage();
    renderTriangles();
}

function clearTriangles() {
    trianglesList = [];
    saveStateToStorage();
    renderTriangles();
}

function renderTriangles() {
    const tbody = document.getElementById('trianglesTableBody');
    tbody.innerHTML = '';
    let totalArea = 0;

    trianglesList.forEach((t, i) => {
        totalArea += t.area;
        tbody.innerHTML += `
            <tr>
                <td>مثلث (${i + 1})</td>
                <td>${t.a} م</td>
                <td>${t.b} م</td>
                <td>${t.c} م</td>
                <td><b>${t.area.toFixed(2)} م²</b></td>
                <td><button class="btn-danger" style="padding:4px 10px" onclick="deleteTriangle(${i})"><i class="fa-solid fa-xmark"></i></button></td>
            </tr>
        `;
    });

    const fqs = metersToFQS(totalArea);
    document.getElementById('triTotalSummary').innerHTML = `
        <h3 style="color:#22d3ee;">إجمالي مساحة المثلثات (${trianglesList.length} مثلث)</h3>
        <p style="font-size:1.2rem; margin:8px 0;"><b>${totalArea.toFixed(2)} متر مربع</b></p>
        <p style="color:#fbbf24; font-weight:700;">${fqs.text}</p>
    `;

    const lastTri = trianglesList[trianglesList.length - 1] || { a: 30, b: 40, c: 50 };
    drawSingleTriangle(lastTri.a, lastTri.b, lastTri.c);
}

function drawSingleTriangle(a, b, c) {
    const canvas = document.getElementById('triCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (calcHeron(a, b, c) <= 0) return;

    const cosA = (b * b + c * c - a * a) / (2 * b * c);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    const p1 = { x: 0, y: 0 };
    const p2 = { x: c, y: 0 };
    const p3 = { x: b * cosA, y: b * sinA };

    const minX = Math.min(p1.x, p2.x, p3.x);
    const maxX = Math.max(p1.x, p2.x, p3.x);
    const minY = Math.min(p1.y, p2.y, p3.y);
    const maxY = Math.max(p1.y, p2.y, p3.y);

    const pad = 55;
    const scale = Math.min((canvas.width - pad * 2) / (maxX - minX || 1), (canvas.height - pad * 2) / (maxY - minY || 1));

    const toScreen = (pt) => ({
        x: pad + (pt.x - minX) * scale + 60,
        y: canvas.height - pad - (pt.y - minY) * scale
    });

    const s1 = toScreen(p1), s2 = toScreen(p2), s3 = toScreen(p3);

    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.lineTo(s3.x, s3.y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16, 185, 129, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`ضلع C: ${c} م`, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 + 22);
    ctx.fillText(`ضلع B: ${b} م`, (s1.x + s3.x) / 2 - 35, (s1.y + s3.y) / 2 - 8);
    ctx.fillText(`ضلع A: ${a} م`, (s2.x + s3.x) / 2 + 35, (s2.y + s3.y) / 2 - 8);
}

// ==================== 4. أداة الخريطة التفاعلية ====================
function initMapIfNeeded() {
    if (surveyMap) return;
    surveyMap = L.map('surveyMap').setView([28.1099, 30.7503], 15);

    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(surveyMap);

    surveyMap.on('click', (e) => {
        mapPoints.push([e.latlng.lat, e.latlng.lng]);
        const marker = L.circleMarker(e.latlng, { radius: 6, color: '#fbbf24', fillOpacity: 1 }).addTo(surveyMap);
        mapMarkers.push(marker);
        updateMapPolygon();
    });
}

function updateMapPolygon() {
    if (mapPolygonLayer) surveyMap.removeLayer(mapPolygonLayer);
    if (mapPoints.length < 2) {
        document.getElementById('mapAreaOutput').innerText = `تم توقيع نقطة واحدة — أضف المزيد من النقاط...`;
        return;
    }

    mapPolygonLayer = L.polygon(mapPoints, { color: '#fbbf24', fillColor: '#10b981', fillOpacity: 0.3 }).addTo(surveyMap);

    if (mapPoints.length >= 3) {
        const areaM2 = calcSphericalPolygonArea(mapPoints);
        const fqs = metersToFQS(areaM2);
        document.getElementById('mapAreaOutput').innerText =
            `المساحة: ${areaM2.toFixed(2)} م²  |  (${fqs.text})`;
    }
}

function undoLastMapPoint() {
    if (mapPoints.length === 0) return;
    mapPoints.pop();
    const m = mapMarkers.pop();
    if (m) surveyMap.removeLayer(m);
    updateMapPolygon();
}

function clearMapPolygon() {
    mapPoints = [];
    mapMarkers.forEach(m => surveyMap.removeLayer(m));
    mapMarkers = [];
    if (mapPolygonLayer) surveyMap.removeLayer(mapPolygonLayer);
    document.getElementById('mapAreaOutput').innerText = 'تم مسح المضلع. انقر على الخريطة للبدء من جديد.';
}

function calcSphericalPolygonArea(latLngs) {
    const R = 6378137;
    let area = 0;
    const len = latLngs.length;
    for (let i = 0; i < len; i++) {
        const p1 = latLngs[i];
        const p2 = latLngs[(i + 1) % len];
        const x1 = p1[1] * Math.PI / 180;
        const y1 = p1[0] * Math.PI / 180;
        const x2 = p2[1] * Math.PI / 180;
        const y2 = p2[0] * Math.PI / 180;
        area += (x2 - x1) * (2 + Math.sin(y1) + Math.sin(y2));
    }
    return Math.abs(area * R * R / 2.0);
}

// ==================== 5. دفتر الميزانية الطولية ====================
function addLevelRow() {
    const bs = parseFloat(document.getElementById('lvlBS').value);
    const is = parseFloat(document.getElementById('lvlIS').value);
    const fs = parseFloat(document.getElementById('lvlFS').value);

    levelRows.push({
        bs: isNaN(bs) ? null : bs,
        is: isNaN(is) ? null : is,
        fs: isNaN(fs) ? null : fs
    });

    document.getElementById('lvlBS').value = '';
    document.getElementById('lvlIS').value = '';
    document.getElementById('lvlFS').value = '';

    saveStateToStorage();
    recalcLeveling();
}

function resetLevelBook() {
    levelRows = [];
    saveStateToStorage();
    recalcLeveling();
}

function recalcLeveling() {
    const tbody = document.getElementById('levelTableBody');
    tbody.innerHTML = '';

    let currentRL = parseFloat(document.getElementById('bmLevel').value) || 10.000;
    let currentHI = null;
    let sumBS = 0, sumFS = 0;
    const firstRL = currentRL;

    levelRows.forEach((row, idx) => {
        let rl = currentRL;
        let note = '';

        if (idx === 0 && row.bs !== null) {
            currentHI = firstRL + row.bs;
            sumBS += row.bs;
            note = 'روبير (BM)';
        } else {
            if (row.fs !== null && currentHI !== null) {
                rl = currentHI - row.fs;
                currentRL = rl;
                sumFS += row.fs;
                note = row.bs !== null ? 'نقطة دوران (TP)' : 'نقطة نهائية';
            } else if (row.is !== null && currentHI !== null) {
                rl = currentHI - row.is;
                currentRL = rl;
                note = 'نقطة متوسطة';
            }
            if (row.bs !== null) {
                currentHI = rl + row.bs;
                sumBS += row.bs;
            }
        }

        tbody.innerHTML += `
            <tr>
                <td>نقطة ${idx + 1}</td>
                <td>${row.bs !== null ? row.bs.toFixed(3) : '-'}</td>
                <td>${row.is !== null ? row.is.toFixed(3) : '-'}</td>
                <td>${row.fs !== null ? row.fs.toFixed(3) : '-'}</td>
                <td>${currentHI !== null ? currentHI.toFixed(3) : '-'}</td>
                <td><b>${rl.toFixed(3)}</b></td>
                <td>${note}</td>
            </tr>
        `;
    });

    const diffBSFS = sumBS - sumFS;
    const diffRL = currentRL - firstRL;
    document.getElementById('levelCheckSummary').innerHTML = `
        <b>التحقيق الحسابي:</b> مجموع المؤخرات - مجموع المقدمات = <b>${diffBSFS.toFixed(3)} م</b> |
        آخر منسوب - أول منسوب = <b>${diffRL.toFixed(3)} م</b>
    `;
}

// ==================== 6. حاسبة الانحرافات COGO ====================
function calcCogo() {
    const E1 = parseFloat(document.getElementById('cogoE1').value) || 0;
    const N1 = parseFloat(document.getElementById('cogoN1').value) || 0;
    const E2 = parseFloat(document.getElementById('cogoE2').value) || 0;
    const N2 = parseFloat(document.getElementById('cogoN2').value) || 0;

    const dE = E2 - E1;
    const dN = N2 - N1;
    const dist = Math.hypot(dE, dN);

    let azimuth = Math.atan2(dE, dN) * (180 / Math.PI);
    if (azimuth < 0) azimuth += 360;

    document.getElementById('cogoResults').innerHTML = `
        <h3 style="color:#f43f5e; margin-bottom:10px;">نتائج الرصد والحساب (Inverse COGO)</h3>
        <p><b>فرق الشرقيات ($\Delta E$):</b> ${dE.toFixed(3)} م</p>
        <p><b>فرق الشماليات ($\Delta N$):</b> ${dN.toFixed(3)} م</p>
        <p style="font-size:1.15rem; color:#fbbf24; margin:8px 0;"><b>المسافة الأفقية: ${dist.toFixed(3)} متر</b></p>
        <p><b>الانحراف الدائري (Azimuth):</b> ${azimuth.toFixed(4)}°</p>
    `;
}

// ==================== 7. محول الوحدات المساحية ====================
function convertFromMeters() {
    const m2 = parseFloat(document.getElementById('convMeters').value) || 0;
    const fqs = metersToFQS(m2);
    document.getElementById('convFeddan').value = fqs.feddan;
    document.getElementById('convQirat').value = fqs.qirat;
    document.getElementById('convSahm').value = fqs.sahm;
    renderConverterSummary(m2, fqs);
}

function convertFromFQS() {
    const f = parseFloat(document.getElementById('convFeddan').value) || 0;
    const q = parseFloat(document.getElementById('convQirat').value) || 0;
    const s = parseFloat(document.getElementById('convSahm').value) || 0;

    const m2 = (f * 4200.833333) + (q * 175.034722) + (s * 7.2931134);
    document.getElementById('convMeters').value = m2.toFixed(2);
    renderConverterSummary(m2, metersToFQS(m2));
}

function renderConverterSummary(m2, fqs) {
    document.getElementById('convDetailedOutput').innerHTML = `
        <h3 style="color:#fbbf24; margin-bottom:10px;">ملخص التحويل المساحي</h3>
        <p><b>بالمتر المربع:</b> ${m2.toFixed(2)} م²</p>
        <p><b>بالفدان والقيراط والسهم:</b> ${fqs.text}</p>
        <p><b>بالهكتار:</b> ${(m2 / 10000).toFixed(4)} هكتار</p>
        <p><b>بالقصبة المربعة:</b> ${(m2 / 12.6025).toFixed(2)} قصبة</p>
    `;
}

// ==================== الحفظ التلقائي ====================
function saveStateToStorage() {
    const state = {
        ownerName: document.getElementById('ownerName').value,
        surveyorName: document.getElementById('surveyorName').value,
        landLocation: document.getElementById('landLocation').value,
        cadNorth: document.getElementById('cadNorth').value,
        cadSouth: document.getElementById('cadSouth').value,
        cadEast: document.getElementById('cadEast').value,
        cadWest: document.getElementById('cadWest').value,
        northAngleInput: document.getElementById('northAngleInput').value,
        neighborNorth: document.getElementById('neighborNorth').value,
        neighborSouth: document.getElementById('neighborSouth').value,
        neighborEast: document.getElementById('neighborEast').value,
        neighborWest: document.getElementById('neighborWest').value,
        heirsMale: document.getElementById('heirsMale').value,
        heirsFemale: document.getElementById('heirsFemale').value,
        trianglesList,
        levelRows
    };
    localStorage.setItem('digital_surveyor_pro_v4', JSON.stringify(state));
}

function loadSavedState() {
    const savedTheme = localStorage.getItem('ds_theme_pref');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        const found = themesList.findIndex(t => t.id === savedTheme);
        if (found !== -1) {
            currentThemeIdx = found;
            document.getElementById('themeNameLabel').innerText = themesList[found].name;
        }
    }

    const raw = localStorage.getItem('digital_surveyor_pro_v4');
    if (raw) {
        try {
            const d = JSON.parse(raw);
            const fields = [
                'ownerName', 'surveyorName', 'landLocation',
                'cadNorth', 'cadSouth', 'cadEast', 'cadWest', 'northAngleInput',
                'neighborNorth', 'neighborSouth', 'neighborEast', 'neighborWest',
                'heirsMale', 'heirsFemale'
            ];
            fields.forEach(f => {
                if (d[f] !== undefined && document.getElementById(f)) {
                    document.getElementById(f).value = d[f];
                }
            });
            if (Array.isArray(d.trianglesList)) trianglesList = d.trianglesList;
            if (Array.isArray(d.levelRows)) levelRows = d.levelRows;
        } catch (e) {}
    } else {
        trianglesList = [{ a: 30, b: 40, c: 50, area: 600 }];
    }
}

function clearSavedData() {
    if (confirm("هل تريد مسح جميع البيانات المحفوظة وإعادة ضبط البرنامج؟")) {
        localStorage.removeItem('digital_surveyor_pro_v4');
        location.reload();
    }
}

let deferredPrompt;
function registerPWA() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    const installBtn = document.getElementById('installPwaBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        installBtn.style.display = 'inline-flex';
    });
    installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        installBtn.style.display = 'none';
    });
}