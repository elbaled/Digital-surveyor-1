// ==================== المتغيرات العامة وحفظ الحالة ====================
let surveyMap = null;
let mapPoints = [];
let mapPolygonLayer = null;
let mapMarkers = [];

let trianglesList = [];
let levelRows = [];
let lastCalculatedCad = {};

// تحميل البيانات المحفوظة عند فتح الموقع
window.addEventListener('DOMContentLoaded', () => {
    loadSavedState();
    updateCadAndSave();
    renderTriangles();
    recalcLeveling();
    calcCogo();
    convertFromMeters();
    registerPWA();
});

// ==================== التنقل بين الأيقونات وإخفاء الخريطة ====================
function openTool(toolName) {
    document.querySelectorAll('.tool-view').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(`view-${toolName}`);
    if (target) target.classList.add('active');

    // حفظ آخر أداة مفتوحة
    localStorage.setItem('ds_active_tool', toolName);

    // تهيئة الخريطة فقط عند الضغط على أيقونة الخريطة
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
    const qiratArea = feddanArea / 24; // 175.034722
    const sahmArea = qiratArea / 24;   // 7.2931134

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

// ==================== 1. أداة الكاد (4 أضلاع) وتقسيم الورثة الشرعي ====================
function updateCadAndSave() {
    const N = parseFloat(document.getElementById('cadNorth').value) || 0;
    const S = parseFloat(document.getElementById('cadSouth').value) || 0;
    const E = parseFloat(document.getElementById('cadEast').value) || 0;
    const W = parseFloat(document.getElementById('cadWest').value) || 0;
    const D = parseFloat(document.getElementById('cadDiag').value) || 0;

    const males = parseInt(document.getElementById('heirsMale').value) || 0;
    const females = parseInt(document.getElementById('heirsFemale').value) || 0;
    const splitDir = document.getElementById('splitDirection').value;

    // حساب المساحة الرباعية بدقة
    let totalArea = 0;
    if (D > 0) {
        // بمعلومية القطر (مجموع مثلثين بهيرون)
        const a1 = calcHeron(N, W, D);
        const a2 = calcHeron(S, E, D);
        totalArea = a1 + a2;
    } else {
        // معادلة المساحة الرباعية الدائرية (براهماغوبتا) أو متوسط الأضلاع المتقابلة
        const s = (N + S + E + W) / 2;
        const val = (s - N) * (s - S) * (s - E) * (s - W);
        totalArea = val > 0 ? Math.sqrt(val) : ((N + S) / 2) * ((E + W) / 2);
    }

    const perimeter = N + S + E + W;
    const fqs = metersToFQS(totalArea);

    document.getElementById('cadTotalAreaBadge').innerText =
        `المساحة الكلية: ${totalArea.toFixed(2)} م² (${fqs.text})`;

    // حساب أنصبة الورثة بالشرع الإسلامي (للذكر مثل حظ الأنثيين)
    // الذكر = 2 سهم، الأنثى = 1 سهم
    const totalShares = (males * 2) + (females * 1);
    const singleShareRatio = totalShares > 0 ? (1 / totalShares) : 0;
    const maleShareRatio = singleShareRatio * 2;
    const femaleShareRatio = singleShareRatio * 1;

    const maleArea = totalArea * maleShareRatio;
    const femaleArea = totalArea * femaleShareRatio;

    // تجهيز قائمة القطع المفرزة للرسم على الكاد
    let parcels = [];
    for (let i = 1; i <= males; i++) {
        parcels.push({
            label: `ذكر (${i})`,
            ratio: maleShareRatio,
            area: maleArea,
            color: '#38bdf8'
        });
    }
    for (let j = 1; j <= females; j++) {
        parcels.push({
            label: `أنثى (${j})`,
            ratio: femaleShareRatio,
            area: femaleArea,
            color: '#f472b6'
        });
    }

    lastCalculatedCad = { N, S, E, W, totalArea, perimeter, parcels, splitDir };
    drawCadQuad(N, S, E, W, parcels, splitDir);
    renderShariaSummary(totalArea, perimeter, fqs, males, females, totalShares, maleArea, femaleArea, parcels, N, S, E, W, splitDir);
    saveStateToStorage();
}

function drawCadQuad(N, S, E, W, parcels, splitDir) {
    const canvas = document.getElementById('cadCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // رسم شبكة خلفية هندسية (CAD Grid)
    ctx.strokeStyle = '#162032';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 25) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 25) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    if (N <= 0 || S <= 0 || E <= 0 || W <= 0) return;

    // حساب إحداثيات الأركان الأربعة متمركزة في الكانفاس
    const maxHoriz = Math.max(N, S);
    const maxVert = Math.max(E, W);
    const pad = 75;
    const scale = Math.min((canvas.width - pad * 2) / maxHoriz, (canvas.height - pad * 2) / maxVert);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    const avgH = (E + W) / 2;
    // الأركان الأربعة: TopLeft (NW), TopRight (NE), BottomRight (SE), BottomLeft (SW)
    const pNW = { x: centerX - (N * scale) / 2, y: centerY - (W * scale) / 2 };
    const pNE = { x: centerX + (N * scale) / 2, y: centerY - (E * scale) / 2 };
    const pSE = { x: centerX + (S * scale) / 2, y: centerY + (E * scale) / 2 };
    const pSW = { x: centerX - (S * scale) / 2, y: centerY + (W * scale) / 2 };

    // دالة مساعدة للاستيفاء الخطي بين نقطتين
    const lerpPt = (p1, p2, t) => ({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
    });

    // رسم تقسيمات الورثة داخل المضلع الرباعي
    if (parcels.length > 0) {
        let acc = 0;
        parcels.forEach((p, idx) => {
            const t1 = acc;
            const t2 = acc + p.ratio;
            acc = t2;

            let poly = [];
            if (splitDir === 'vertical') {
                // التقسيم على الضلع العلوي والسفلي (من اليمين لليسار)
                const top1 = lerpPt(pNE, pNW, t1);
                const top2 = lerpPt(pNE, pNW, t2);
                const bot2 = lerpPt(pSE, pSW, t2);
                const bot1 = lerpPt(pSE, pSW, t1);
                poly = [top1, top2, bot2, bot1];
            } else {
                // التقسيم على الضلع الشرقي والغربي (من فوق لتحت)
                const right1 = lerpPt(pNE, pSE, t1);
                const right2 = lerpPt(pNE, pSE, t2);
                const left2 = lerpPt(pNW, pSW, t2);
                const left1 = lerpPt(pNW, pSW, t1);
                poly = [right1, right2, left2, left1];
            }

            // تلوين خفيف للقطعة
            ctx.beginPath();
            ctx.moveTo(poly[0].x, poly[0].y);
            poly.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
            ctx.closePath();
            ctx.fillStyle = p.color + '22';
            ctx.fill();

            // خط الفرز المتقطع
            ctx.strokeStyle = p.color;
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.8;
            ctx.stroke();
            ctx.setLineDash([]);

            // كتابة اسم الوريث ومساحته في منتصف القطعة
            const cx = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
            const cy = (poly[0].y + poly[1].y + poly[2].y + poly[3].y) / 4;
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px Cairo';
            ctx.textAlign = 'center';
            ctx.fillText(p.label, cx, cy - 6);
            ctx.fillStyle = '#f59e0b';
            ctx.font = '12px Cairo';
            ctx.fillText(`${p.area.toFixed(1)} م²`, cx, cy + 12);
        });
    }

    // رسم الإطار الخارجي للأضلاع الأربعة
    ctx.beginPath();
    ctx.moveTo(pNW.x, pNW.y);
    ctx.lineTo(pNE.x, pNE.y);
    ctx.lineTo(pSE.x, pSE.y);
    ctx.lineTo(pSW.x, pSW.y);
    ctx.closePath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.stroke();

    // كتابة أطوال الأضلاع الأربعة (فوق، تحت، يمين، شمال)
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Cairo';
    ctx.textAlign = 'center';

    // الضلع الشمالي (فوق)
    ctx.fillText(`الشمالي (فوق): ${N} م`, (pNW.x + pNE.x) / 2, Math.min(pNW.y, pNE.y) - 16);
    // الضلع الجنوبي (تحت)
    ctx.fillText(`الجنوبي (تحت): ${S} م`, (pSW.x + pSE.x) / 2, Math.max(pSW.y, pSE.y) + 26);
    // الضلع الشرقي (يمين)
    ctx.fillText(`الشرقي (يمين): ${E} م`, Math.max(pNE.x, pSE.x) + 60, (pNE.y + pSE.y) / 2);
    // الضلع الغربي (شمال)
    ctx.fillText(`الغربي (شمال): ${W} م`, Math.min(pNW.x, pSW.x) - 60, (pNW.y + pSW.y) / 2);
}

function renderShariaSummary(totalArea, perimeter, fqs, males, females, totalShares, maleArea, femaleArea, parcels, N, S, E, W, splitDir) {
    const box = document.getElementById('cadShariaResults');

    let shareExplanation = '';
    if (males === 1 && females === 1) {
        shareExplanation = `<span style="color:#10b981;">(تطبيق مباشر: الذكر يأخذ <b>الثلثين 2/3 = 66.67%</b>، والأنثى تأخذ <b>الثلث 1/3 = 33.33%</b>)</span>`;
    } else if (totalShares > 0) {
        shareExplanation = `إجمالي الأسهم الشرعية = <b>${totalShares} أسهم</b> (الذكر = سهمان، والأنثى = سهم واحد).`;
    }

    let cardsHtml = '';
    parcels.forEach(p => {
        const frontLength = splitDir === 'vertical'
            ? `واجهة شمالية: ${(N * p.ratio).toFixed(2)} م | جنوبية: ${(S * p.ratio).toFixed(2)} م`
            : `ضلع شرقي: ${(E * p.ratio).toFixed(2)} م | غربي: ${(W * p.ratio).toFixed(2)} م`;

        cardsHtml += `
            <div class="sharia-card" style="border-right-color:${p.color}">
                <strong>${p.label}</strong> — النسبة: ${(p.ratio * 100).toFixed(2)}%<br>
                المساحة: <b>${p.area.toFixed(2)} م²</b><br>
                <small style="color:#94a3b8">${metersToFQS(p.area).text}</small><br>
                <small style="color:#38bdf8">${frontLength}</small>
            </div>
        `;
    });

    box.innerHTML = `
        <h3 style="color:#f59e0b; margin-bottom:8px;">تقرير الكروكي والفرز الشرعي</h3>
        <p><b>المساحة الإجمالية:</b> ${totalArea.toFixed(2)} م² | <b>بالوحدات المصرية:</b> ${fqs.text} | <b>المحيط:</b> ${perimeter.toFixed(2)} م</p>
        <p style="margin-top:6px;">${shareExplanation}</p>
        <div class="sharia-grid">${cardsHtml}</div>
    `;
}

// تصدير الرسمة والأضلاع الأربعة وتقسيم الورثة إلى ملف أوتوكاد DXF
function exportToDXF() {
    const { N, S, E, W } = lastCalculatedCad;
    if (!N || !S || !E || !W) return;

    const pNW = { x: 0, y: W };
    const pNE = { x: N, y: E };
    const pSE = { x: S, y: 0 };
    const pSW = { x: 0, y: 0 };

    let dxf = `0\nSECTION\n2\nENTITIES\n`;
    const addLine = (x1, y1, x2, y2, layer = "BOUNDARY") => {
        dxf += `0\nLINE\n8\n${layer}\n10\n${x1.toFixed(3)}\n20\n${y1.toFixed(3)}\n30\n0.0\n11\n${x2.toFixed(3)}\n21\n${y2.toFixed(3)}\n31\n0.0\n`;
    };

    // الأضلاع الأربعة الخارجية
    addLine(pSW.x, pSW.y, pSE.x, pSE.y, "OUTER_BORDER");
    addLine(pSE.x, pSE.y, pNE.x, pNE.y, "OUTER_BORDER");
    addLine(pNE.x, pNE.y, pNW.x, pNW.y, "OUTER_BORDER");
    addLine(pNW.x, pNW.y, pSW.x, pSW.y, "OUTER_BORDER");

    dxf += `0\nENDSEC\n0\nEOF`;

    const blob = new Blob([dxf], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Croquis_4Sides_Sharia.dxf`;
    a.click();
}

// ==================== 2. أداة القياس بالمثلثات (طريقة هيرون) ====================
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
        <h3 style="color:#38bdf8;">إجمالي مساحة المثلثات (${trianglesList.length} مثلث)</h3>
        <p style="font-size:1.2rem; margin:8px 0;"><b>${totalArea.toFixed(2)} متر مربع</b></p>
        <p style="color:#f59e0b; font-weight:700;">${fqs.text}</p>
    `;

    // رسم آخر مثلث على الكانفاس
    const lastTri = trianglesList[trianglesList.length - 1] || { a: 30, b: 40, c: 50 };
    drawSingleTriangle(lastTri.a, lastTri.b, lastTri.c);
}

function drawSingleTriangle(a, b, c) {
    const canvas = document.getElementById('triCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (calcHeron(a, b, c) <= 0) return;

    // حساب إحداثيات المثلث بقانون جيب التمام
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
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`${c} م`, (s1.x + s2.x) / 2, (s1.y + s2.y) / 2 + 22);
    ctx.fillText(`${b} م`, (s1.x + s3.x) / 2 - 25, (s1.y + s3.y) / 2 - 8);
    ctx.fillText(`${a} م`, (s2.x + s3.x) / 2 + 20, (s2.y + s3.y) / 2 - 8);
}

// ==================== 3. أداة الخريطة التفاعلية ====================
function initMapIfNeeded() {
    if (surveyMap) return;
    surveyMap = L.map('surveyMap').setView([28.1099, 30.7503], 15); // المنيا افتراضياً

    L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3']
    }).addTo(surveyMap);

    surveyMap.on('click', (e) => {
        mapPoints.push([e.latlng.lat, e.latlng.lng]);
        const marker = L.circleMarker(e.latlng, { radius: 6, color: '#f59e0b', fillOpacity: 1 }).addTo(surveyMap);
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

    mapPolygonLayer = L.polygon(mapPoints, { color: '#f59e0b', fillColor: '#38bdf8', fillOpacity: 0.3 }).addTo(surveyMap);

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

// ==================== 4. دفتر الميزانية الطولية ====================
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

// ==================== 5. حاسبة الانحرافات COGO ====================
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
        <h3 style="color:#ec4899; margin-bottom:10px;">نتائج الرصد والحساب (Inverse COGO)</h3>
        <p><b>فرق الشرقيات ($\Delta E$):</b> ${dE.toFixed(3)} م</p>
        <p><b>فرق الشماليات ($\Delta N$):</b> ${dN.toFixed(3)} م</p>
        <p style="font-size:1.15rem; color:#f59e0b; margin:8px 0;"><b>المسافة الأفقية: ${dist.toFixed(3)} متر</b></p>
        <p><b>الانحراف الدائري (Azimuth):</b> ${azimuth.toFixed(4)}°</p>
    `;
}

// ==================== 6. محول الوحدات المساحية ====================
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
        <h3 style="color:#eab308; margin-bottom:10px;">ملخص التحويل المساحي</h3>
        <p><b>بالمتر المربع:</b> ${m2.toFixed(2)} م²</p>
        <p><b>بالفدان والقيراط والسهم:</b> ${fqs.text}</p>
        <p><b>بالهكتار:</b> ${(m2 / 10000).toFixed(4)} هكتار</p>
        <p><b>بالقصبة المربعة:</b> ${(m2 / 12.6025).toFixed(2)} قصبة</p>
    `;
}

// ==================== الحفظ التلقائي والتثبيت من كروم (PWA) ====================
function saveStateToStorage() {
    const state = {
        cadNorth: document.getElementById('cadNorth').value,
        cadSouth: document.getElementById('cadSouth').value,
        cadEast: document.getElementById('cadEast').value,
        cadWest: document.getElementById('cadWest').value,
        heirsMale: document.getElementById('heirsMale').value,
        heirsFemale: document.getElementById('heirsFemale').value,
        trianglesList,
        levelRows
    };
    localStorage.setItem('digital_surveyor_data', JSON.stringify(state));
}

function loadSavedState() {
    const raw = localStorage.getItem('digital_surveyor_data');
    if (raw) {
        try {
            const data = JSON.parse(raw);
            if (data.cadNorth) document.getElementById('cadNorth').value = data.cadNorth;
            if (data.cadSouth) document.getElementById('cadSouth').value = data.cadSouth;
            if (data.cadEast) document.getElementById('cadEast').value = data.cadEast;
            if (data.cadWest) document.getElementById('cadWest').value = data.cadWest;
            if (data.heirsMale !== undefined) document.getElementById('heirsMale').value = data.heirsMale;
            if (data.heirsFemale !== undefined) document.getElementById('heirsFemale').value = data.heirsFemale;
            if (Array.isArray(data.trianglesList)) trianglesList = data.trianglesList;
            if (Array.isArray(data.levelRows)) levelRows = data.levelRows;
        } catch (e) {}
    } else {
        // مثلث افتراضي للتجربة عند الفتح لأول مرة
        trianglesList = [{ a: 30, b: 40, c: 50, area: 600 }];
    }
}

function clearSavedData() {
    if (confirm("هل تريد مسح جميع البيانات المحفوظة وإعادة ضبط الأدوات؟")) {
        localStorage.removeItem('digital_surveyor_data');
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
