import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const maxDuration = 60;
const SYSTEM_PROMPT = `You are DevAI Studio, an expert coding agent. Reply in Arabic unless the user requests English. Work incrementally and preserve existing behavior. When asked to create or modify project files, return a valid JSON object only with shape {"message":"brief Arabic explanation","files":[{"path":"relative/path","content":"complete file content"}],"actions":["short change summary"]}. Include only files that should be created or changed; each content must be complete. Never claim external services are connected unless configured. Prefer secure defaults. For ordinary questions, return JSON with message and files: []. Never include markdown fences around JSON.`;
export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'لم يتم إعداد مفتاح الذكاء الاصطناعي. انسخ .env.example إلى .env.local وأضف OPENAI_API_KEY ثم أعد تشغيل الخادم.' }, { status: 503 });
  try {
    const body = await req.json();
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return NextResponse.json({ error: 'اكتب طلبك أولًا.' }, { status: 400 });
    if (prompt.length > 12000) return NextResponse.json({ error: 'الطلب طويل جدًا. اختصره إلى 12000 حرف.' }, { status: 413 });
    const files = Array.isArray(body.files) ? body.files.slice(0, 30).map((f: {path?: string; content?: string}) => ({ path: String(f.path || '').slice(0, 180), content: String(f.content || '').slice(0, 18000) })) : [];
    const messages = Array.isArray(body.history) ? body.history.slice(-10).map((m: {role?: string; content?: string}) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) })) : [];
    const userContext = `User request:\n${prompt}\n\nCurrent project files (edit only what is needed):\n${JSON.stringify(files)}`;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages, { role: 'user', content: userContext }] }),
      signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) {
      const info = await response.json().catch(() => ({}));
      const status = response.status === 401 ? 401 : response.status === 429 ? 429 : 502;
      return NextResponse.json({ error: response.status === 401 ? 'مفتاح API غير صالح.' : response.status === 429 ? 'تم تجاوز حد الاستخدام أو الرصيد المتاح لدى مزود الذكاء الاصطناعي.' : `تعذر إكمال طلب الذكاء الاصطناعي (${response.status}).`, detail: info?.error?.message }, { status });
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return NextResponse.json({ error: 'وصل رد فارغ من النموذج.' }, { status: 502 });
    let result;
    try { result = JSON.parse(content); } catch { return NextResponse.json({ error: 'رد النموذج لم يكن بصيغة JSON صالحة.' }, { status: 502 }); }
    if (!Array.isArray(result.files)) result.files = [];
    result.files = result.files.filter((f: {path?: unknown; content?: unknown}) => typeof f.path === 'string' && typeof f.content === 'string' && !f.path.startsWith('/') && !f.path.split('/').includes('..')).slice(0, 30);
    return NextResponse.json(result);
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';
    return NextResponse.json({ error: isTimeout ? 'استغرق الطلب وقتًا أطول من المسموح. جرّب طلبًا أصغر.' : 'تعذر الاتصال بالخادم أو بمزود الذكاء الاصطناعي.' }, { status: isTimeout ? 504 : 500 });
  }
}
