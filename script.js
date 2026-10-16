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

const themesList = [
    { id: 'emerald', name: 'ثيم الزمرد' },
    { id: 'royal', name: 'ثيم الكاد الذهبي' },
    { id: 'daylight', name: 'الوضع النهاري' }
];
let currentThemeIdx = 0;
let is3DView = false;

// متغيرات الأوتوكاد الذكي
let aiRoomsData = []; 
let aiWallThick = 0.25;

// ==================== نظام التشغيل ====================
window.addEventListener('DOMContentLoaded', () => {
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

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.view) openTool(e.state.view, true);
    else openTool('dashboard', true);
});

function openTool(toolName, fromHistory = false) {
    document.querySelectorAll('.tool-view').forEach(sec => sec.classList.remove('active'));
    const target = document.getElementById(`view-${toolName}`);
    if (target) target.classList.add('active');
    if (!fromHistory) history.pushState({ view: toolName }, "", "#" + toolName);
    if (toolName === 'map') setTimeout(() => { initMapIfNeeded(); surveyMap.invalidateSize(); }, 150);
}

// ... (تخطينا أكواد الإنترو والثيمات والمحول والميزانية لأنها ثابتة كما هي للحفاظ على مساحة الكود) ...
function runSplashIntro() { const splash = document.getElementById('splashIntro'); if (splash) setTimeout(() => splash.classList.add('hidden'), 1500); }
function cycleTheme() { currentThemeIdx = (currentThemeIdx + 1) % themesList.length; document.documentElement.setAttribute('data-theme', themesList[currentThemeIdx].id); document.getElementById('themeNameLabel').innerText = themesList[currentThemeIdx].name; }
function metersToFQS(area) { /* كود التحويل للسهولة */ return { text: `${(area/4200.83).toFixed(2)} فدان`}; }

// ==================== المحرك الهندسي الجديد للأوتوكاد الذكي (AutoCAD AI v7.0) ====================
function generateAiCadPlan() {
    const north = parseFloat(document.getElementById('aiNorth')?.value) || 12;
    const south = parseFloat(document.getElementById('aiSouth')?.value) || 12;
    const east = parseFloat(document.getElementById('aiEast')?.value) || 18;
    const west = parseFloat(document.getElementById('aiWest')?.value) || 18;

    const roomsCount = parseInt(document.getElementById('aiRooms')?.value) || 3;
    const bathsCount = parseInt(document.getElementById('aiBaths')?.value) || 1;
    const furnish = document.getElementById('aiFurnish') ? document.getElementById('aiFurnish').value === 'yes' : true;
    aiWallThick = 0.25;

    const avgWidth = (north + south) / 2, avgDepth = (east + west) / 2;
    const totalArea = avgWidth * avgDepth;

    const canvas = document.getElementById('aiCadCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // خلفية لوحة الكاد
    ctx.fillStyle = '#050b11'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const pad = 120; // مساحة أكبر عشان خطوط الأبعاد والبرواز
    const scale = Math.min((canvas.width - pad * 2) / avgWidth, (canvas.height - pad * 2) / avgDepth);
    const startX = (canvas.width - avgWidth * scale) / 2;
    const startY = (canvas.height - avgDepth * scale) / 2;
    const wPx = aiWallThick * scale;

    aiRoomsData = [];

    // ============= دوال الرسم الهندسية =============

    function drawDimLine(x1, y1, x2, y2, text, offset = 0, isVertical = false) {
        ctx.save();
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1;
        
        let tx1 = x1, ty1 = y1, tx2 = x2, ty2 = y2;
        if(isVertical) { tx1 += offset; tx2 += offset; } else { ty1 += offset; ty2 += offset; }
        
        // خط البعد
        ctx.beginPath(); ctx.moveTo(tx1, ty1); ctx.lineTo(tx2, ty2); ctx.stroke();
        
        // علامات الأوتوكاد المائلة (Ticks)
        ctx.beginPath();
        ctx.moveTo(tx1 - 4, ty1 + 4); ctx.lineTo(tx1 + 4, ty1 - 4);
        ctx.moveTo(tx2 - 4, ty2 + 4); ctx.lineTo(tx2 + 4, ty2 - 4);
        ctx.stroke();

        ctx.fillStyle = '#10b981'; ctx.font = '13px Arial'; ctx.textAlign = 'center';
        if(isVertical) {
            ctx.translate((tx1+tx2)/2 - 8, (ty1+ty2)/2);
            ctx.rotate(-Math.PI/2);
            ctx.fillText(text, 0, 0);
        } else {
            ctx.fillText(text, (tx1+tx2)/2, ty1 - 8);
        }
        ctx.restore();
    }

    function drawDoor(sx, sy, doorW, isVertical = false, reverse = false) {
        ctx.save();
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
        // رسم الباب كخط وقوس
        ctx.beginPath();
        if(isVertical) {
            const dir = reverse ? -1 : 1;
            ctx.moveTo(sx, sy); ctx.lineTo(sx + doorW*dir, sy);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(sx, sy, doorW, reverse?Math.PI:0, reverse?Math.PI*1.5:Math.PI/2, !reverse); ctx.stroke();
        } else {
            const dir = reverse ? -1 : 1;
            ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - doorW*dir);
            ctx.stroke();
            ctx.beginPath(); ctx.arc(sx, sy, doorW, reverse?Math.PI/2:-Math.PI/2, reverse?Math.PI:0, !reverse); ctx.stroke();
        }
        ctx.restore();
    }

    function drawArchitecturalFurniture(sx, sy, sw, sh, title) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
        const cx = sx + sw/2, cy = sy + sh/2;

        if (title.includes('نوم')) {
            // سرير دبل مع لحاف ومخدتين وكومودينو
            const bedW = Math.min(sw * 0.45, 1.8 * scale), bedH = Math.min(sh * 0.6, 2.1 * scale);
            const bx = cx - bedW/2, by = sy + wPx;
            ctx.fillStyle = 'rgba(34, 211, 238, 0.1)'; ctx.fillRect(bx, by, bedW, bedH); ctx.strokeRect(bx, by, bedW, bedH);
            ctx.strokeRect(bx + 4, by + 4, bedW/2 - 6, 12); // مخدة 1
            ctx.strokeRect(bx + bedW/2 + 2, by + 4, bedW/2 - 6, 12); // مخدة 2
            ctx.beginPath(); ctx.moveTo(bx, by + 25); ctx.lineTo(bx + bedW, by + 25); ctx.stroke(); // خط اللحاف
            // 2 كومودينو
            ctx.strokeRect(bx - 12, by, 10, 10); ctx.strokeRect(bx + bedW + 2, by, 10, 10);
            // دولاب الملابس
            ctx.strokeRect(sx + wPx, sy + sh - wPx - 15, sw * 0.6, 15);
            ctx.beginPath(); ctx.moveTo(sx + wPx, sy + sh - wPx - 15); ctx.lineTo(sx + wPx + sw * 0.6, sy + sh - wPx); ctx.stroke();
            
        } else if (title.includes('مطبخ')) {
            // رخامة مطبخ حرف L
            ctx.fillStyle = 'rgba(251, 191, 36, 0.1)';
            const cWidth = 18;
            ctx.fillRect(sx + wPx, sy + wPx, sw - wPx*2, cWidth); ctx.strokeRect(sx + wPx, sy + wPx, sw - wPx*2, cWidth); // ضلع علوي
            ctx.fillRect(sx + wPx, sy + wPx, cWidth, sh*0.6); ctx.strokeRect(sx + wPx, sy + wPx, cWidth, sh*0.6); // ضلع جانبي
            // حوض غسيل
            ctx.strokeRect(cx - 15, sy + wPx + 2, 30, 14); ctx.beginPath(); ctx.arc(cx, sy + wPx + 9, 3, 0, Math.PI*2); ctx.stroke();
            // بوتاجاز 4 شعلات
            const stoveX = sx + sw - wPx - 25;
            ctx.strokeRect(stoveX, sy + wPx + 1, 22, 16);
            [4,18].forEach(dx => [5,13].forEach(dy => { ctx.beginPath(); ctx.arc(stoveX+dx, sy+wPx+dy, 2, 0, Math.PI*2); ctx.stroke(); }));
            // ثلاجة
            ctx.strokeRect(sx + wPx + 2, sy + sh*0.6 + 2, 20, 20); ctx.fillText("Ref.", sx+wPx+12, sy+sh*0.6+15);

        } else if (title.includes('حمام')) {
            // بانيو وتواليت وحوض
            ctx.fillStyle = 'rgba(34, 211, 238, 0.1)';
            ctx.fillRect(sx + wPx, sy + wPx, 25, sh*0.5); ctx.strokeRect(sx + wPx, sy + wPx, 25, sh*0.5); // بانيو
            ctx.beginPath(); ctx.arc(sx + wPx + 12, sy + wPx + 12, 3, 0, Math.PI*2); ctx.stroke(); // صرف البانيو
            ctx.strokeRect(sx + sw - wPx - 18, sy + wPx, 18, 12); // حوض غسيل
            ctx.beginPath(); ctx.ellipse(sx + sw - wPx - 10, sy + sh - wPx - 15, 6, 8, 0, 0, Math.PI*2); ctx.stroke(); // قاعدة WC
            
        } else if (title.includes('ريسبشن') || title.includes('مجلس')) {
            // طقم أنتريه كامل
            const sofaW = Math.min(sw * 0.45, 3 * scale);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
            ctx.fillRect(cx - sofaW/2, cy - 20, sofaW, 18); ctx.strokeRect(cx - sofaW/2, cy - 20, sofaW, 18); // كنبة 3 مقاعد
            ctx.fillRect(cx - sofaW/2 - 25, cy + 5, 20, 25); ctx.strokeRect(cx - sofaW/2 - 25, cy + 5, 20, 25); // فوتيه يسار
            ctx.fillRect(cx + sofaW/2 + 5, cy + 5, 20, 25); ctx.strokeRect(cx + sofaW/2 + 5, cy + 5, 20, 25); // فوتيه يمين
            ctx.strokeRect(cx - 15, cy + 5, 30, 20); // ترابيزة المنتصف
            ctx.strokeRect(sx + wPx, cy - 15, 12, 40); ctx.fillText("TV", sx + wPx + 6, cy + 5); // وحدة تلفزيون
        }
        ctx.restore();
    }

    function buildArchitecturalRoom(rx, ry, rw, rh, title) {
        const sx = startX + rx * scale, sy = startY + ry * scale;
        const sw = rw * scale, sh = rh * scale;
        const netW = rw - aiWallThick*2, netH = rh - aiWallThick*2;
        
        aiRoomsData.push({ rx, ry, rw, rh, title });
        
        // رسم الحوائط بسمك مزدوج
        ctx.fillStyle = title.includes('منور') ? 'rgba(244,63,94,0.08)' : 'rgba(34,211,238,0.04)'; 
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2.5; ctx.strokeRect(sx, sy, sw, sh); // حائط خارجي
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 1; ctx.strokeRect(sx + wPx, sy + wPx, sw - wPx*2, sh - wPx*2); // حائط داخلي

        if (title.includes('منور')) {
            // رسم خطوط المنور (X)
            ctx.strokeStyle = '#f43f5e'; ctx.beginPath();
            ctx.moveTo(sx, sy); ctx.lineTo(sx+sw, sy+sh); ctx.moveTo(sx+sw, sy); ctx.lineTo(sx, sy+sh); ctx.stroke();
        } else if (title.includes('سلم')) {
            // رسم فانوس السلم والدرج
            ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1;
            const steps = 8;
            for(let i=1; i<steps; i++) {
                let sY = sy + wPx + i*((sh - wPx*2)/steps);
                ctx.beginPath(); ctx.moveTo(sx+wPx+5, sY); ctx.lineTo(sx+sw-wPx-5, sY); ctx.stroke();
            }
        } else {
            // تحديد موقع الباب هندسياً (في الركن مع محاكي 10 سم)
            const doorW = Math.min(22, sw * 0.2);
            if (title.includes('ريسبشن')) {
                drawDoor(sx + wPx + 10, sy + sh - wPx, doorW, false, false); // باب مدخل الشقة
            } else if (title.includes('مطبخ') || title.includes('حمام') || title.includes('نوم')) {
                drawDoor(sx + wPx + 5, sy + wPx, doorW, true, true); // أبواب الغرف تفتح للداخل
            }

            if(furnish && !title.includes('طرقة')) drawArchitecturalFurniture(sx, sy, sw, sh, title);
        }

        // كتابة اسم الفراغ والـ Net Area
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 14px Cairo'; ctx.textAlign = 'center';
        ctx.fillText(title, sx + sw/2, sy + sh/2 - 5);
        if(!title.includes('منور')) {
            ctx.fillStyle = '#fbbf24'; ctx.font = '12px Arial';
            ctx.fillText(`${netW.toFixed(2)}x${netH.toFixed(2)}m`, sx + sw/2, sy + sh/2 + 12);
        }
    }

    // ================= خوارزمية التوزيع المعماري (Zoning Algorithm) =================
    const frontH = avgDepth * 0.35;
    const midH = avgDepth * 0.25;
    const backH = avgDepth - frontH - midH;

    // 1. منطقة الاستقبال (الواجهة)
    const stairW = avgWidth * 0.28;
    buildArchitecturalRoom(0, 0, stairW, frontH, 'سلم رئيسي');
    buildArchitecturalRoom(stairW, 0, avgWidth - stairW, frontH, 'ريسبشن واستقبال');

    // 2. منطقة الخدمات (طرقة + مطبخ + حمام + منور)
    // فصلنا الحمام تماماً عن المطبخ، كل واحد بيفتح على الطرقة، والاتنين بيشتركوا في منور واحد في الضهر للسباكة
    const hallW = avgWidth * 0.5;
    buildArchitecturalRoom(0, frontH, hallW, midH, 'طرقة توزيع');
    
    const serviceAreaW = avgWidth - hallW;
    const kitchW = serviceAreaW * 0.45;
    const bathW = serviceAreaW * 0.35;
    const shaftW = serviceAreaW * 0.2;
    
    buildArchitecturalRoom(hallW, frontH, kitchW, midH, 'مطبخ');
    buildArchitecturalRoom(hallW + kitchW, frontH, bathW, midH, 'حمام رئيسي');
    buildArchitecturalRoom(hallW + kitchW + bathW, frontH, shaftW, midH, 'منور');

    // 3. منطقة الغرف الخاصة (الخلفية)
    const roomW = avgWidth / roomsCount;
    for(let i=0; i<roomsCount; i++) {
        buildArchitecturalRoom(i*roomW, frontH + midH, roomW, backH, `غرفة نوم (${i+1})`);
    }

    // ================= رسم خطوط الأبعاد الخارجية (External Dimensions) =================
    const extDimYTop = startY - 25;
    const extDimYBot = startY + avgDepth*scale + 25;
    const extDimXRight = startX + avgWidth*scale + 25;
    const extDimXLeft = startX - 25;

    // خطوط طولية لكل غرفة
    let accX = 0;
    for(let i=0; i<roomsCount; i++) {
        drawDimLine(startX + accX*scale, extDimYBot, startX + (accX+roomW)*scale, extDimYBot, `${roomW.toFixed(2)}m`);
        accX += roomW;
    }
    // خط بُعد كلي
    drawDimLine(startX, extDimYBot + 25, startX + avgWidth*scale, extDimYBot + 25, `طول الضلع الخلفي: ${south}m`);
    drawDimLine(startX, extDimYTop, startX + avgWidth*scale, extDimYTop, `واجهة الشارع: ${north}m`);
    
    drawDimLine(extDimXRight, startY, extDimXRight, startY + avgDepth*scale, `الضلع الأيمن: ${east}m`, 0, true);
    drawDimLine(extDimXLeft, startY, extDimXLeft, startY + avgDepth*scale, `الضلع الأيسر: ${west}m`, 0, true);

    const badge = document.getElementById('aiCadSummaryBadge');
    if(badge) badge.innerText = `مساحة التصميم: ${totalArea.toFixed(1)} م²`;
}

// دالة تصدير لوحة الأوتوكاد كصورة (PNG Image with Blueprint Frame)
function printCadAsImage() {
    const canvas = document.getElementById('aiCadCanvas');
    if(!canvas) return;
    
    // هنعمل كانفاس جديد مؤقت عشان نرسم برواز وشكل استشاري حوالين الرسمة قبل حفظها
    const tempCanvas = document.createElement('canvas');
    const ctx = tempCanvas.getContext('2d');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height + 60; // مكان لاسم المهندس تحت
    
    ctx.fillStyle = '#050b11'; ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    ctx.drawImage(canvas, 0, 0); // رسم اللوحة الأصلية

    // رسم خرطوشة سريعة للمهندس أحمد سمير أسفل الصورة
    ctx.fillStyle = '#10b981'; ctx.fillRect(10, tempCanvas.height - 50, tempCanvas.width - 20, 40);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 16px Cairo'; ctx.textAlign = 'right';
    ctx.fillText(`إعداد وتصميم: م. أحمد سمير (المسّاح الرقمي PRO)`, tempCanvas.width - 30, tempCanvas.height - 25);
    ctx.textAlign = 'left';
    ctx.fillText(`تاريخ: ${new Date().toLocaleDateString('ar-EG')}`, 30, tempCanvas.height - 25);

    const link = document.createElement('a');
    link.download = `Architectural_Design_EngAhmedSamir.png`;
    link.href = tempCanvas.toDataURL('image/png');
    link.click();
}

// ... باقي الأكواد للتجنيب والمثلث والخريطة تفضل زي ما هي بدون تغيير للحفاظ على المساحة
// (لو محتاج بقية الدوال العادية زي المثلث والميزانية ضيفهم من الكود القديم هنا)
