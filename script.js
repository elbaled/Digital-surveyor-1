// ==================== المتغيرات العامة ====================
let surveyMap = null;
let mapPoints = [];
let mapPolygonLayer = null;
let mapMarkers = [];

let trianglesList = [];
let levelRows = [];
let lastCroquisData = {};
let lastAiPlanBoxes = [];

window.addEventListener('DOMContentLoaded', () => {
    loadSavedState();
    updateCroquisAndSave();
    generateAiCadPlan();
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

// ==================== 1. لوحة الكروكي المساحي + الجيران + المالك + الفرز الشرعي ====================
function updateCroquisAndSave() {
    const owner = document.getElementById('ownerName').value || 'غير محدد';
    const surveyor = document.getElementById('surveyorName').value || 'غير محدد';
    const location = document.getElementById('landLocation').value || '-';
    const dateStr = document.getElementById('surveyDate').value || '-';

    const N = parseFloat(document.getElementById('cadNorth').value) || 0;
    const S = parseFloat(document.getElementById('cadSouth').value) || 0;
    const E = parseFloat(document.getElementById('cadEast').value) || 0;
    const W = parseFloat(document.getElementById('cadWest').value) || 0;
    const D = parseFloat(document.getElementById('cadDiag').value) || 0;

    const nbNorth = document.getElementById('neighborNorth').value || 'حد بحري';
    const nbSouth = document.getElementById('neighborSouth').value || 'حد قبلي';
    const nbEast = document.getElementById('neighborEast').value || 'حد شرقي';
    const nbWest = document.getElementById('neighborWest').value || 'حد غربي';

    const males = parseInt(document.getElementById('heirsMale').value) || 0;
    const females = parseInt(document.getElementById('heirsFemale').value) || 0;
    const splitDir = document.getElementById('splitDirection').value;

    // حساب المساحة الرباعية بدقة
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

    // حساب أنصبة الورثة بالشرع الإسلامي (للذكر مثل حظ الأنثيين: الذكر = 2 سهم، الأنثى = 1 سهم)
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
            color: '#38bdf8'
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
        N, S, E, W, nbNorth, nbSouth, nbEast, nbWest,
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

    // خلفية لوحة الكروكي
    ctx.fillStyle = '#070b12';
    ctx.fillRect(0, 0, W_CANVAS, H_CANVAS);

    // شبكة أوتوكاد خفيفة
    ctx.strokeStyle = '#111c2d';
    ctx.lineWidth = 1;
    for (let x = 0; x < W_CANVAS; x += 25) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H_CANVAS); ctx.stroke();
    }
    for (let y = 0; y < H_CANVAS; y += 25) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W_CANVAS, y); ctx.stroke();
    }

    // برواز خارجي للوحة الكروكي
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, W_CANVAS - 20, H_CANVAS - 20);

    // رسم سهم الشمال أعلى يسار اللوحة
    drawNorthArrow(ctx, 65, 65);

    const { N, S, E, W, nbNorth, nbSouth, nbEast, nbWest, parcels, splitDir } = data;
    if (N <= 0 || S <= 0 || E <= 0 || W <= 0) return;

    // منطقة الرسم فوق الخرطوشة
    const drawAreaHeight = H_CANVAS - 145;
    const maxHoriz = Math.max(N, S);
    const maxVert = Math.max(E, W);
    const padX = 150;
    const padY = 85;

    const scale = Math.min(
        (W_CANVAS - padX * 2) / maxHoriz,
        (drawAreaHeight - padY * 2) / maxVert
    );

    const cx = W_CANVAS / 2;
    const cy = drawAreaHeight / 2 + 10;

    // الأركان الأربعة للأرض
    const pNW = { x: cx - (N * scale) / 2, y: cy - (W * scale) / 2 };
    const pNE = { x: cx + (N * scale) / 2, y: cy - (E * scale) / 2 };
    const pSE = { x: cx + (S * scale) / 2, y: cy + (E * scale) / 2 };
    const pSW = { x: cx - (S * scale) / 2, y: cy + (W * scale) / 2 };

    const lerpPt = (p1, p2, t) => ({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
    });

    // رسم تقسيمات الورثة إن وجدت
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
            ctx.lineWidth = 1.8;
            ctx.stroke();
            ctx.setLineDash([]);

            const midX = (poly[0].x + poly[1].x + poly[2].x + poly[3].x) / 4;
            const midY = (poly[0].y + poly[1].y + poly[2].y + poly[3].y) / 4;

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 13px Cairo';
            ctx.textAlign = 'center';
            ctx.fillText(`${p.label} [${p.fractionText}]`, midX, midY - 6);
            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 12px Cairo';
            ctx.fillText(`${p.area.toFixed(1)} م²`, midX, midY + 13);
        });
    }

    // رسم حدود الأرض الأربعة الخارجية
    ctx.beginPath();
    ctx.moveTo(pNW.x, pNW.y);
    ctx.lineTo(pNE.x, pNE.y);
    ctx.lineTo(pSE.x, pSE.y);
    ctx.lineTo(pSW.x, pSW.y);
    ctx.closePath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.2;
    ctx.stroke();

    // كتابة أطوال الأضلاع الأربعة + أسماء الجيران على كل ضلع
    ctx.textAlign = 'center';

    // 1. الضلع الشمالي (فوق) + الجار البحري
    const topMidX = (pNW.x + pNE.x) / 2;
    const topMidY = Math.min(pNW.y, pNE.y);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الضلع الشمالي (فوق): ${N} م`, topMidX, topMidY - 12);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px Cairo';
    ctx.fillText(`الحد البحري: ${nbNorth}`, topMidX, topMidY - 32);

    // 2. الضلع الجنوبي (تحت) + الجار القبلي
    const botMidX = (pSW.x + pSE.x) / 2;
    const botMidY = Math.max(pSW.y, pSE.y);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الضلع الجنوبي (تحت): ${S} م`, botMidX, botMidY + 22);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px Cairo';
    ctx.fillText(`الحد القبلي: ${nbSouth}`, botMidX, botMidY + 42);

    // 3. الضلع الشرقي (يمين) + الجار الشرقي
    const rightMidX = Math.max(pNE.x, pSE.x);
    const rightMidY = (pNE.y + pSE.y) / 2;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الشرقي (يمين): ${E} م`, rightMidX + 75, rightMidY - 8);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px Cairo';
    ctx.fillText(`${nbEast}`, rightMidX + 75, rightMidY + 14);

    // 4. الضلع الغربي (شمال) + الجار الغربي
    const leftMidX = Math.min(pNW.x, pSW.x);
    const leftMidY = (pNW.y + pSW.y) / 2;
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`الغربي (شمال): ${W} م`, leftMidX - 75, leftMidY - 8);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 12px Cairo';
    ctx.fillText(`${nbWest}`, leftMidX - 75, leftMidY + 14);

    // ==================== رسم الخرطوشة الهندسية أسفل اللوحة (Title Block) ====================
    const tbY = H_CANVAS - 125;
    const tbH = 115;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(10, tbY, W_CANVAS - 20, tbH);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, tbY, W_CANVAS - 20, tbH);

    // خطوط تقسيم الخرطوشة
    ctx.beginPath();
    ctx.moveTo(280, tbY); ctx.lineTo(280, tbY + tbH);
    ctx.moveTo(550, tbY); ctx.lineTo(550, tbY + tbH);
    ctx.stroke();

    ctx.textAlign = 'right';
    // القسم الأيمن: المالك والموقع
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`المالك: ${data.owner}`, W_CANVAS - 25, tbY + 30);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '13px Cairo';
    ctx.fillText(`الموقع: ${data.location}`, W_CANVAS - 25, tbY + 60);
    ctx.fillText(`التاريخ: ${data.dateStr}`, W_CANVAS - 25, tbY + 90);

    // القسم الأوسط: المساحة الكلية والأطوال
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`المساحة بالمتر: ${data.totalArea.toFixed(2)} م²`, 535, tbY + 30);
    ctx.fillStyle = '#10b981';
    ctx.fillText(`بالفدان: ${data.fqs.text}`, 535, tbY + 60);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`المحيط الكلي: ${data.perimeter.toFixed(2)} متر طولي`, 535, tbY + 90);

    // القسم الأيسر: المهندس المساح والختم
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px Cairo';
    ctx.fillText(`المهندس المسّاح:`, 265, tbY + 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px Cairo';
    ctx.fillText(`${data.surveyor}`, 265, tbY + 60);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Cairo';
    ctx.fillText(`منصة المسّاح الرقمي PRO`, 265, tbY + 90);
}

function drawNorthArrow(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x - 7, y + 10);
    ctx.lineTo(x, y + 4);
    ctx.lineTo(x + 7, y + 10);
    ctx.closePath();
    ctx.fill();

    ctx.font = 'bold 13px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText('N شمال', x, y - 28);
    ctx.restore();
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
                <small style="color:#f59e0b">${metersToFQS(p.area).text}</small><br>
                <small style="color:#38bdf8">${sideInfo}</small>
            </div>
        `;
    });

    box.innerHTML = `
        <h3 style="color:#f59e0b; margin-bottom:8px;">بيانات الكروكي المساحي والفرز الشرعي</h3>
        <p><b>المالك:</b> ${data.owner} | <b>المهندس المسّاح:</b> ${data.surveyor} | <b>الموقع:</b> ${data.location}</p>
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

// ==================== 2. الرسم بالكاد بمساعدة الذكاء الاصطناعي (AutoCAD AI) ====================
function generateAiCadPlan() {
    const north = parseFloat(document.getElementById('aiNorth').value) || 12;
    const south = parseFloat(document.getElementById('aiSouth').value) || 12;
    const east = parseFloat(document.getElementById('aiEast').value) || 20;
    const west = parseFloat(document.getElementById('aiWest').value) || 20;

    const roomsCount = parseInt(document.getElementById('aiRooms').value) || 3;
    const bathsCount = parseInt(document.getElementById('aiBaths').value) || 2;
    const stairPos = document.getElementById('aiStairPos').value;
    const hasShaft = document.getElementById('aiShaft').value === 'yes';

    const avgWidth = (north + south) / 2;
    const avgDepth = (east + west) / 2;
    const totalArea = avgWidth * avgDepth;

    document.getElementById('aiCadSummaryBadge').innerText =
        `المساحة: ${totalArea.toFixed(1)} م² (الأضلاع: ${north}×${south}×${east}×${west} م)`;

    const canvas = document.getElementById('aiCadCanvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // خلفية الكاد المعماري
    ctx.fillStyle = '#060a10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#111c2d';
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    const pad = 75;
    const scale = Math.min(
        (canvas.width - pad * 2) / Math.max(north, south),
        (canvas.height - pad * 2) / Math.max(east, west)
    );

    const startX = (canvas.width - avgWidth * scale) / 2;
    const startY = (canvas.height - avgDepth * scale) / 2;

    lastAiPlanBoxes = [];

    // دالة لرسم فراغ معماري بحوائط مزدوجة وأبعاد
    function drawRoomBox(rx, ry, rw, rh, title, strokeCol = '#38bdf8', fillCol = 'rgba(56,189,248,0.08)') {
        const sx = startX + rx * scale;
        const sy = startY + ry * scale;
        const sw = rw * scale;
        const sh = rh * scale;

        lastAiPlanBoxes.push({ rx, ry, rw, rh, title });

        ctx.fillStyle = fillCol;
        ctx.fillRect(sx, sy, sw, sh);

        // حائط خارجي وداخلي (Double Wall CAD Style)
        ctx.strokeStyle = strokeCol;
        ctx.lineWidth = 3;
        ctx.strokeRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 3, sy + 3, sw - 6, sh - 6);

        // قوس الباب المعماري
        ctx.beginPath();
        ctx.strokeStyle = '#f59e0b';
        ctx.arc(sx + 10, sy + sh - 10, 14, -Math.PI / 2, 0);
        ctx.stroke();

        // اسم الغرفة وأبعادها
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px Cairo';
        ctx.textAlign = 'center';
        ctx.fillText(title, sx + sw / 2, sy + sh / 2 - 5);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '12px Cairo';
        ctx.fillText(`${rw.toFixed(1)}م × ${rh.toFixed(1)}م`, sx + sw / 2, sy + sh / 2 + 14);
    }

    // تقسيم ذكي للمسقط المعماري بناءً على الأضلاع الأربعة
    const frontZoneH = avgDepth * 0.38;
    const midZoneH = avgDepth * 0.24;
    const backZoneH = avgDepth * 0.38;

    // 1. المنطقة الأمامية (الريسبشن + السلم أو الغرفة الأمامية)
    const stairW = avgWidth * 0.28;
    const recepW = avgWidth - stairW;
    if (stairPos === 'front') {
        drawRoomBox(0, 0, stairW, frontZoneH * 0.75, 'سلم ومدخل', '#a855f7', 'rgba(168,85,247,0.12)');
        drawRoomBox(stairW, 0, recepW, frontZoneH, 'ريسبشن واستقبال', '#10b981', 'rgba(16,185,129,0.1)');
    } else {
        drawRoomBox(0, 0, avgWidth * 0.65, frontZoneH, 'ريسبشن كبير', '#10b981', 'rgba(16,185,129,0.1)');
        drawRoomBox(avgWidth * 0.65, 0, avgWidth * 0.35, frontZoneH, 'غرفة معيشة / مكتب', '#38bdf8');
    }

    // 2. المنطقة الوسطى (مطبخ + حمامات + صالة توزيع + منور)
    const serviceW = avgWidth * 0.38;
    const hallW = avgWidth - serviceW;
    drawRoomBox(0, frontZoneH, hallW, midZoneH, 'طرقة وصالة توزيع', '#94a3b8', 'rgba(148,163,184,0.06)');

    const kitchenW = serviceW * 0.55;
    const bathW = serviceW * 0.45;
    drawRoomBox(hallW, frontZoneH, kitchenW, midZoneH, 'مطبخ', '#f59e0b', 'rgba(245,158,11,0.1)');
    drawRoomBox(hallW + kitchenW, frontZoneH, bathW, midZoneH, bathsCount > 1 ? `حمام (${bathsCount})` : 'حمام رئيسي', '#06b6d4');

    if (hasShaft) {
        drawRoomBox(hallW + kitchenW, frontZoneH, bathW * 0.45, midZoneH * 0.45, 'منور', '#ef4444', 'rgba(239,68,68,0.15)');
    }

    // 3. المنطقة الخلفية (توزيع غرف النوم بالتساوي)
    const singleRoomW = avgWidth / roomsCount;
    for (let i = 0; i < roomsCount; i++) {
        drawRoomBox(i * singleRoomW, frontZoneH + midZoneH, singleRoomW, backZoneH, `غرفة نوم (${i + 1})`, '#38bdf8');
    }

    // كتابة الأضلاع الأربعة الخارجية على الرسمة المعمارية
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 14px Cairo';
    ctx.textAlign = 'center';
    ctx.fillText(`الضلع العلوي (الواجهة): ${north} م`, startX + (avgWidth * scale) / 2, startY - 18);
    ctx.fillText(`الضلع السفلي (الخلفي): ${south} م`, startX + (avgWidth * scale) / 2, startY + (avgDepth * scale) + 28);
    ctx.fillText(`الأيمن: ${east} م`, startX + (avgWidth * scale) + 48, startY + (avgDepth * scale) / 2);
    ctx.fillText(`الأيسر: ${west} م`, startX - 48, startY + (avgDepth * scale) / 2);

    document.getElementById('aiCadReport').innerHTML = `
        <h3 style="color:#06b6d4; margin-bottom:8px;">تقرير المساعد الذكي للتصميم المعماري (AutoCAD AI)</h3>
        <p>تم توليد المسقط الهندسي بناءً على الأضلاع الأربعة: <b>شمالي ${north}م × جنوبي ${south}م × شرقي ${east}م × غربي ${west}م</b> بإجمالي مساحة <b>${totalArea.toFixed(1)} م²</b>.</p>
        <p style="margin-top:6px; color:#cbd5e1;">يشمل التصميم: ريسبشن على الواجهة، ${roomsCount} غرف نوم، ${bathsCount} حمام، مطبخ، وصالة توزيع ${hasShaft ? 'مع منور خدمة وتهوية' : ''}.</p>
    `;
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
    a.download = `AutoCAD_AI_Plan.dxf`;
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
        <h3 style="color:#38bdf8;">إجمالي مساحة المثلثات (${trianglesList.length} مثلث)</h3>
        <p style="font-size:1.2rem; margin:8px 0;"><b>${totalArea.toFixed(2)} متر مربع</b></p>
        <p style="color:#f59e0b; font-weight:700;">${fqs.text}</p>
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
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = '#f59e0b';
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
        <h3 style="color:#ec4899; margin-bottom:10px;">نتائج الرصد والحساب (Inverse COGO)</h3>
        <p><b>فرق الشرقيات ($\Delta E$):</b> ${dE.toFixed(3)} م</p>
        <p><b>فرق الشماليات ($\Delta N$):</b> ${dN.toFixed(3)} م</p>
        <p style="font-size:1.15rem; color:#f59e0b; margin:8px 0;"><b>المسافة الأفقية: ${dist.toFixed(3)} متر</b></p>
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
        <h3 style="color:#eab308; margin-bottom:10px;">ملخص التحويل المساحي</h3>
        <p><b>بالمتر المربع:</b> ${m2.toFixed(2)} م²</p>
        <p><b>بالفدان والقيراط والسهم:</b> ${fqs.text}</p>
        <p><b>بالهكتار:</b> ${(m2 / 10000).toFixed(4)} هكتار</p>
        <p><b>بالقصبة المربعة:</b> ${(m2 / 12.6025).toFixed(2)} قصبة</p>
    `;
}

// ==================== الحفظ التلقائي (LocalStorage) ====================
function saveStateToStorage() {
    const state = {
        ownerName: document.getElementById('ownerName').value,
        surveyorName: document.getElementById('surveyorName').value,
        landLocation: document.getElementById('landLocation').value,
        cadNorth: document.getElementById('cadNorth').value,
        cadSouth: document.getElementById('cadSouth').value,
        cadEast: document.getElementById('cadEast').value,
        cadWest: document.getElementById('cadWest').value,
        neighborNorth: document.getElementById('neighborNorth').value,
        neighborSouth: document.getElementById('neighborSouth').value,
        neighborEast: document.getElementById('neighborEast').value,
        neighborWest: document.getElementById('neighborWest').value,
        heirsMale: document.getElementById('heirsMale').value,
        heirsFemale: document.getElementById('heirsFemale').value,
        trianglesList,
        levelRows
    };
    localStorage.setItem('digital_surveyor_pro_v3', JSON.stringify(state));
}

function loadSavedState() {
    const raw = localStorage.getItem('digital_surveyor_pro_v3');
    if (raw) {
        try {
            const d = JSON.parse(raw);
            const fields = [
                'ownerName', 'surveyorName', 'landLocation',
                'cadNorth', 'cadSouth', 'cadEast', 'cadWest',
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
        localStorage.removeItem('digital_surveyor_pro_v3');
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