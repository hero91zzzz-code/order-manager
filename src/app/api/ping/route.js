import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    // Supabase에 가벼운 쿼리 — 활성 유지용
    await supabase.from('order_sheets').select('id').limit(1);
    return Response.json({
      ok: true,
      time: new Date().toISOString(),
      message: 'Supabase 활성 유지 ping 성공'
    });
  } catch (e) {
    console.error('ping 실패:', e.message);
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
