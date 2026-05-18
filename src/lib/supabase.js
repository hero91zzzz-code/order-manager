import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const PHOTO_BUCKET = 'order-photos';

// 사진 업로드 (base64 → Storage)
export async function uploadPhoto(base64DataUrl, sheetId, itemIndex) {
  try {
    const matches = base64DataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid base64 data');
    const mimeType = matches[1];
    const base64Data = matches[2];
    const ext = mimeType.includes('png') ? 'png' : 'jpg';
    const fileName = `${sheetId}/item-${itemIndex}-${Date.now()}.${ext}`;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    const { data, error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(fileName, blob, { contentType: mimeType, upsert: false });

    if (error) throw error;
    const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(fileName);
    return urlData.publicUrl;
  } catch (e) {
    console.error('uploadPhoto error', e);
    throw e;
  }
}

// 사진 삭제 (URL → 파일 경로 추출 후 삭제)
export async function deletePhoto(photoUrl) {
  if (!photoUrl) return;
  try {
    const url = new URL(photoUrl);
    const parts = url.pathname.split(`/${PHOTO_BUCKET}/`);
    if (parts.length < 2) return;
    const filePath = parts[1];
    await supabase.storage.from(PHOTO_BUCKET).remove([filePath]);
  } catch (e) {
    console.error('deletePhoto error', e);
  }
}

// 주문서 목록 불러오기
export async function fetchOrderSheets() {
  const { data, error } = await supabase
    .from('order_sheets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(row => ({
    id: row.id,
    client: row.client,
    orderDate: row.order_date,
    note: row.note,
    items: row.items || [],
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

// 주문서 저장 (insert or update)
export async function saveOrderSheet(sheet) {
  const row = {
    id: sheet.id,
    client: sheet.client,
    order_date: sheet.orderDate,
    note: sheet.note,
    items: sheet.items,
    created_at: sheet.createdAt,
    updated_at: sheet.updatedAt,
  };
  const { error } = await supabase.from('order_sheets').upsert(row);
  if (error) throw error;
}

// 주문서 삭제 (사진까지 같이)
export async function deleteOrderSheet(sheetId) {
  const { data: existing, error: fetchErr } = await supabase
    .from('order_sheets').select('items').eq('id', sheetId).single();
  if (!fetchErr && existing && existing.items) {
    for (const item of existing.items) {
      if (item.photo) await deletePhoto(item.photo);
    }
  }
  const { error } = await supabase.from('order_sheets').delete().eq('id', sheetId);
  if (error) throw error;
}
