'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, ArrowLeft, Trash2, Edit3, X, Camera, Lock, Eye, Calendar, Clock, CheckCircle2, Circle, AlertCircle, FileText, Download } from 'lucide-react';
import { fetchOrderSheets, saveOrderSheet, deleteOrderSheet, uploadPhoto, deletePhoto } from '@/lib/supabase';

const EDIT_PASSWORD = '1519!';
const VIEW_PASSWORD = '1519';
const MAX_ITEMS = 10;

export default function OrderManager() {
  const [authMode, setAuthMode] = useState(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [orderSheets, setOrderSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('createdAt');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState('list');
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [editingSheet, setEditingSheet] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    loadSheets();
    try {
      const session = sessionStorage.getItem('auth_mode');
      if (session === 'edit' || session === 'view') setAuthMode(session);
    } catch {}
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const loadSheets = async () => {
    try {
      setLoading(true);
      const data = await fetchOrderSheets();
      setOrderSheets(data);
    } catch (e) {
      console.error(e);
      setOrderSheets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = () => {
    if (passwordInput === EDIT_PASSWORD) {
      setAuthMode('edit');
      try { sessionStorage.setItem('auth_mode', 'edit'); } catch {}
      setAuthError(''); setPasswordInput('');
    } else if (passwordInput === VIEW_PASSWORD) {
      setAuthMode('view');
      try { sessionStorage.setItem('auth_mode', 'view'); } catch {}
      setAuthError(''); setPasswordInput('');
    } else {
      setAuthError('비밀번호가 올바르지 않습니다');
    }
  };

  const logout = () => {
    setAuthMode(null);
    try { sessionStorage.removeItem('auth_mode'); } catch {}
    setView('list'); setSelectedSheet(null); setEditingSheet(null);
  };

  const saveSheet = async (sheet) => {
    try {
      // 사진 처리: base64인 사진들을 Storage에 업로드하고 URL로 교체
      const processedItems = [];
      for (let i = 0; i < sheet.items.length; i++) {
        const item = { ...sheet.items[i] };
        if (item.photo && item.photo.startsWith('data:')) {
          try {
            item.photo = await uploadPhoto(item.photo, sheet.id, i);
          } catch (e) {
            console.error('사진 업로드 실패', e);
            alert('사진 업로드에 실패했습니다. 네트워크를 확인해주세요.');
            return false;
          }
        }
        processedItems.push(item);
      }
      const sheetToSave = { ...sheet, items: processedItems };
      await saveOrderSheet(sheetToSave);
      await loadSheets();
      showToast(editingSheet ? '수정 완료' : '저장 완료');
      return true;
    } catch (e) {
      console.error(e);
      alert('저장 실패: ' + (e.message || '알 수 없는 오류'));
      return false;
    }
  };

  const deleteSheet = async (id) => {
    if (!confirm('이 주문서를 삭제하시겠습니까?')) return;
    try {
      await deleteOrderSheet(id);
      await loadSheets();
      setView('list'); setSelectedSheet(null);
      showToast('삭제되었습니다');
    } catch (e) { console.error(e); alert('삭제 실패'); }
  };

  // 주문서 전체 상태 계산 (모든 품목이 완료면 done, 아니면 progress)
  const getSheetStatus = (sheet) => {
    if (!sheet.items || sheet.items.length === 0) return 'progress';
    return sheet.items.every(it => it.status === 'done') ? 'done' : 'progress';
  };

  // 주문서의 최단 기한 (진행중인 품목 중)
  const getSheetEarliestDeadline = (sheet) => {
    if (!sheet.items) return '9999-12-31';
    const active = sheet.items.filter(it => it.status !== 'done' && it.deadline);
    if (active.length === 0) return '9999-12-31';
    return active.reduce((min, it) => (it.deadline < min ? it.deadline : min), active[0].deadline);
  };

  const deleteAllCompleted = async () => {
    const completed = orderSheets.filter(s => getSheetStatus(s) === 'done');
    if (completed.length === 0) { alert('완료된 주문서가 없습니다.'); return; }
    if (!confirm(`완료된 주문서 ${completed.length}건을 모두 삭제하시겠습니까?`)) return;
    try {
      for (const s of completed) await deleteOrderSheet(s.id);
      await loadSheets();
      showToast(`${completed.length}건 삭제 완료`);
    } catch (e) { console.error(e); alert('일괄 삭제 중 오류'); }
  };

  const sortedSheets = [...orderSheets]
    .filter(s => {
      const status = getSheetStatus(s);
      if (statusFilter === 'progress' && status !== 'progress') return false;
      if (statusFilter === 'done' && status !== 'done') return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if ((s.client || '').toLowerCase().includes(q)) return true;
      return (s.items || []).some(it =>
        (it.content || '').toLowerCase().includes(q) ||
        (it.notes || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'client') return (a.client || '').localeCompare(b.client || '', 'ko');
      if (sortBy === 'createdAt') return (a.createdAt || 0) - (b.createdAt || 0);
      if (sortBy === 'deadline') {
        const sa = getSheetStatus(a), sb = getSheetStatus(b);
        if (sa === 'done' && sb !== 'done') return 1;
        if (sa !== 'done' && sb === 'done') return -1;
        return getSheetEarliestDeadline(a).localeCompare(getSheetEarliestDeadline(b));
      }
      return 0;
    });

  const progressCount = orderSheets.filter(s => getSheetStatus(s) === 'progress').length;
  const doneCount = orderSheets.filter(s => getSheetStatus(s) === 'done').length;

  // 거래처별 그룹핑 (sortBy === 'client'이고 폴더 진입 전)
  const isClientGroupMode = sortBy === 'client' && !selectedClient;
  const clientGroups = isClientGroupMode
    ? Object.values(
        orderSheets
          .filter(s => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (s.client || '').toLowerCase().includes(q);
          })
          .reduce((acc, s) => {
            const key = s.client || '(거래처 없음)';
            if (!acc[key]) acc[key] = { client: key, sheets: [] };
            acc[key].sheets.push(s);
            return acc;
          }, {})
      ).sort((a, b) => a.client.localeCompare(b.client, 'ko'))
    : [];

  // 폴더 진입 시: 해당 거래처 주문서만, 그 외엔 일반 정렬
  const displaySheets = selectedClient
    ? sortedSheets.filter(s => s.client === selectedClient)
    : sortedSheets;

  // ===== 로그인 =====
  if (!authMode) {
    return (
      <div className="auth-screen">
        <style>{styles}</style>
        <div className="auth-card">
          <div className="auth-icon"><Lock size={26} strokeWidth={1.6} /></div>
          <h1 className="auth-title">거래 관리</h1>
          <p className="auth-subtitle">접속 비밀번호를 입력하세요</p>
          <input type="password" className="auth-input" placeholder="비밀번호"
            value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()} autoFocus />
          {authError && <div className="auth-error"><AlertCircle size={14} /> {authError}</div>}
          <button className="auth-btn" onClick={handleAuth}>접속</button>
        </div>
      </div>
    );
  }

  // ===== 상세 (주문서 보기) =====
  if (view === 'detail' && selectedSheet) {
    return (
      <SheetDetail sheet={selectedSheet} authMode={authMode} toast={toast}
        onBack={() => { setView('list'); setSelectedSheet(null); }}
        onEdit={() => { setEditingSheet(selectedSheet); setView('form'); }}
        onDelete={() => deleteSheet(selectedSheet.id)}
        onToggleItemStatus={async (itemIdx) => {
          const newSheet = { ...selectedSheet, items: [...selectedSheet.items] };
          newSheet.items[itemIdx] = {
            ...newSheet.items[itemIdx],
            status: newSheet.items[itemIdx].status === 'done' ? 'progress' : 'done'
          };
          newSheet.updatedAt = Date.now();
          await saveSheet(newSheet);
          setSelectedSheet(newSheet);
        }}
        onUpdateField={async (itemIdx, fieldName, newValue) => {
          const newSheet = { ...selectedSheet, items: [...selectedSheet.items] };
          newSheet.items[itemIdx] = {
            ...newSheet.items[itemIdx],
            [fieldName]: newValue
          };
          newSheet.updatedAt = Date.now();
          await saveSheet(newSheet);
          setSelectedSheet(newSheet);
        }}
      />
    );
  }

  // ===== 폼 =====
  if (view === 'form' && authMode === 'edit') {
    const existingClients = [...new Set(orderSheets.map(s => s.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
    return (
      <>
        <SheetForm initial={editingSheet} existingClients={existingClients}
          onCancel={() => { setView(editingSheet ? 'detail' : 'list'); setEditingSheet(null); }}
          onSave={async (sheet) => {
            const ok = await saveSheet(sheet);
            if (ok) {
              if (selectedSheet && selectedSheet.id === sheet.id) {
                setSelectedSheet(sheet); setView('detail');
              } else { setView('list'); }
              setEditingSheet(null);
            }
          }} />
        {toast && <div className="toast">{toast}</div>}
      </>
    );
  }

  // ===== 목록 =====
  return (
    <div className="app">
      <style>{styles}</style>
      <header className="header">
        <div className="header-brand">
          <div className="brand-mark">거</div>
          <div>
            <div className="brand-title">거래 관리</div>
            <div className="brand-mode">
              {authMode === 'edit' ? <><Edit3 size={10} /> 관리자</> : <><Eye size={10} /> 보기 전용</>}
            </div>
          </div>
        </div>
        <button className="text-btn" onClick={logout}>로그아웃</button>
      </header>

      {authMode === 'edit' && (
        <div className="add-btn-wrap">
          <button className="add-btn" onClick={() => { setEditingSheet(null); setView('form'); }}>
            <Plus size={18} /> 주문서 등록
          </button>
        </div>
      )}

      <div className="stats-row">
        <div className="stat"><div className="stat-num">{progressCount}</div><div className="stat-label">진행중</div></div>
        <div className="stat"><div className="stat-num">{doneCount}</div><div className="stat-label">완료</div></div>
        <div className="stat"><div className="stat-num">{orderSheets.length}</div><div className="stat-label">전체</div></div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input className="search-input" placeholder="거래처 / 품목 / 비고 검색"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          {searchQuery && <button className="clear-search" onClick={() => setSearchQuery('')}><X size={14} /></button>}
        </div>
        <div className="filter-row">
          <button className={`chip ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>전체</button>
          <button className={`chip ${statusFilter === 'progress' ? 'active' : ''}`} onClick={() => setStatusFilter('progress')}>진행중</button>
          <button className={`chip ${statusFilter === 'done' ? 'active' : ''}`} onClick={() => setStatusFilter('done')}>완료</button>
        </div>
        <div className="sort-row">
          <span className="sort-label">정렬</span>
          <button className={`sort-btn ${sortBy === 'client' ? 'active' : ''}`} onClick={() => setSortBy('client')}>거래처명</button>
          <button className={`sort-btn ${sortBy === 'createdAt' ? 'active' : ''}`} onClick={() => setSortBy('createdAt')}>주문날짜</button>
          <button className={`sort-btn ${sortBy === 'deadline' ? 'active' : ''}`} onClick={() => setSortBy('deadline')}>기한</button>
        </div>
        {authMode === 'edit' && doneCount > 0 && (
          <button className="bulk-delete" onClick={deleteAllCompleted}>
            <Trash2 size={13} /> 완료된 주문서 {doneCount}건 일괄 삭제
          </button>
        )}
      </div>

      <div className="list-body">
        {selectedClient && (
          <div className="folder-header">
            <button className="folder-back" onClick={() => setSelectedClient(null)}>
              <ArrowLeft size={16} /> 거래처 목록
            </button>
            <div className="folder-title">
              <span className="folder-icon">📁</span>
              <span>{selectedClient}</span>
              <span className="folder-count">{displaySheets.length}건</span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="empty"><div className="spinner" /></div>
        ) : isClientGroupMode ? (
          // === 거래처별 그룹 (폴더 모드) ===
          clientGroups.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div className="empty-title">{orderSheets.length === 0 ? '아직 등록된 주문서가 없습니다' : '검색 결과가 없습니다'}</div>
            </div>
          ) : (
            clientGroups.map(group => {
              const sheetCount = group.sheets.length;
              const progressing = group.sheets.filter(s => getSheetStatus(s) === 'progress').length;
              const earliestDeadlineAll = group.sheets
                .map(s => getSheetEarliestDeadline(s))
                .filter(d => d !== '9999-12-31')
                .sort()[0];
              const daysLeft = earliestDeadlineAll
                ? Math.ceil((new Date(earliestDeadlineAll) - new Date(new Date().toDateString())) / 86400000) : null;
              return (
                <button key={group.client} className="folder-card"
                  onClick={() => setSelectedClient(group.client)}>
                  <div className="folder-card-icon">📁</div>
                  <div className="folder-card-info">
                    <div className="folder-card-name">{group.client}</div>
                    <div className="folder-card-meta">
                      <span>주문서 {sheetCount}건</span>
                      {progressing > 0 && <span className="folder-progressing">· 진행중 {progressing}</span>}
                      {earliestDeadlineAll && (
                        <span className="folder-deadline">
                          · <Clock size={11} /> 최단 {earliestDeadlineAll}
                          {daysLeft !== null && (
                            <span className={`days-tag ${daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'soon' : ''}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)}일↑` : daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )
        ) : displaySheets.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📋</div>
            <div className="empty-title">{orderSheets.length === 0 ? '아직 등록된 주문서가 없습니다' : '검색 결과가 없습니다'}</div>
            {authMode === 'edit' && orderSheets.length === 0 && <div className="empty-sub">위쪽 "주문서 등록" 버튼으로 추가하세요</div>}
          </div>
        ) : (
          displaySheets.map(s => {
            const status = getSheetStatus(s);
            const earliestDeadline = getSheetEarliestDeadline(s);
            const daysLeft = earliestDeadline && earliestDeadline !== '9999-12-31'
              ? Math.ceil((new Date(earliestDeadline) - new Date(new Date().toDateString())) / 86400000) : null;
            const itemCount = (s.items || []).length;
            const doneItems = (s.items || []).filter(it => it.status === 'done').length;
            const photoCount = (s.items || []).filter(it => it.photo).length;
            return (
              <button key={s.id} className={`sheet-card ${status === 'done' ? 'done' : ''}`}
                onClick={() => { setSelectedSheet(s); setView('detail'); }}>
                <div className="card-top">
                  <div className="card-client">{s.client}</div>
                  <div className={`status-dot ${status === 'done' ? 'done' : 'progress'}`}>
                    {status === 'done' ? '완료' : `${doneItems}/${itemCount}`}
                  </div>
                </div>
                <div className="card-summary">
                  <FileText size={12} /> 품목 {itemCount}개
                  {photoCount > 0 && <><span className="card-sep">·</span><Camera size={12} /> {photoCount}장</>}
                </div>
                {s.items && s.items[0] && (
                  <div className="card-preview">
                    {s.items[0].content}{s.items.length > 1 ? ` 외 ${s.items.length - 1}건` : ''}
                  </div>
                )}
                <div className="card-bottom">
                  <span className="card-meta"><Calendar size={11} /> {s.orderDate || '-'}</span>
                  {earliestDeadline !== '9999-12-31' && (
                    <span className="card-meta">
                      <Clock size={11} /> {earliestDeadline}
                      {daysLeft !== null && status !== 'done' && (
                        <span className={`days-tag ${daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'soon' : ''}`}>
                          {daysLeft < 0 ? `${Math.abs(daysLeft)}일↑` : daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ExcelJS 동적 로딩
let _excelJSPromise = null;
function loadExcelJS() {
  if (typeof window !== 'undefined' && window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (_excelJSPromise) return _excelJSPromise;
  _excelJSPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
    script.onload = () => resolve(window.ExcelJS);
    script.onerror = () => reject(new Error('ExcelJS 로딩 실패'));
    document.head.appendChild(script);
  });
  return _excelJSPromise;
}

// ============ 인라인 편집 가능한 필드 ============
function InlineField({ label, value, placeholder, editable, isEditing, draft, onStartEdit, onChangeDraft, onSave, onCancel, multiline, cellStyle }) {
  if (isEditing) {
    const InputTag = multiline ? 'textarea' : 'input';
    return (
      <div className="inline-edit">
        <InputTag
          className={multiline ? 'inline-textarea' : 'inline-input'}
          value={draft}
          onChange={(e) => onChangeDraft(e.target.value)}
          placeholder={placeholder}
          autoFocus
          onKeyDown={(e) => {
            if (!multiline && e.key === 'Enter') onSave();
            if (e.key === 'Escape') onCancel();
          }}
        />
        <div className="inline-edit-actions">
          <button className="inline-cancel" onClick={onCancel}>취소</button>
          <button className="inline-save" onClick={onSave}>저장</button>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`inline-display ${editable ? 'editable' : ''} ${cellStyle ? 'cell-' + cellStyle : ''}`}
      onClick={() => editable && onStartEdit()}
    >
      {value ? (
        <div className="inline-value">
          {label && <span className="inline-label">{label}</span>}
          <span className="inline-text">{value}</span>
        </div>
      ) : (
        <div className="inline-empty">{placeholder}</div>
      )}
    </div>
  );
}

// ============ 상세 (주문서 표시) ============
function SheetDetail({ sheet, authMode, toast, onBack, onEdit, onDelete, onToggleItemStatus, onUpdateField }) {
  const [zoomPhoto, setZoomPhoto] = useState(null);
  const [exporting, setExporting] = useState(false);
  // 인라인 편집 상태: { idx, field } | null
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState('');

  const startEdit = (idx, field) => {
    setDraft(sheet.items[idx][field] || '');
    setEditing({ idx, field });
  };
  const saveEdit = async () => {
    if (!editing) return;
    await onUpdateField(editing.idx, editing.field, draft.trim());
    setEditing(null);
    setDraft('');
  };
  const cancelEdit = () => {
    setEditing(null);
    setDraft('');
  };
  const isEditing = (idx, field) => editing && editing.idx === idx && editing.field === field;

  const exportToExcel = async () => {
    try {
      setExporting(true);
      const ExcelJS = await loadExcelJS();
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('주문서', {
        pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true }
      });

      // 컬럼 너비 설정
      ws.columns = [
        { width: 6 },   // A: 번호
        { width: 28 },  // B: 이미지
        { width: 10 },  // C: 수량
        { width: 12 },  // D: 단가
        { width: 26 },  // E: 비고
      ];

      // 제목
      ws.mergeCells('A1:E2');
      const titleCell = ws.getCell('A1');
      titleCell.value = '주문서';
      titleCell.font = { name: '맑은 고딕', size: 22, bold: true };
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

      // 날짜
      ws.mergeCells('A3:E3');
      const dateCell = ws.getCell('A3');
      dateCell.value = sheet.orderDate || '';
      dateCell.font = { name: '맑은 고딕', size: 14, bold: true };
      dateCell.alignment = { vertical: 'middle', horizontal: 'right' };

      // 거래처
      let currentRow = 4;
      if (sheet.client) {
        ws.mergeCells(`A${currentRow}:E${currentRow}`);
        const clientCell = ws.getCell(`A${currentRow}`);
        clientCell.value = `거래처: ${sheet.client}`;
        clientCell.font = { name: '맑은 고딕', size: 12, bold: true };
        clientCell.alignment = { vertical: 'middle', horizontal: 'left' };
        currentRow++;
      }

      // 안내 메시지 (있을 때만)
      if (sheet.note && sheet.note.trim()) {
        ws.mergeCells(`A${currentRow}:E${currentRow}`);
        const noteCell = ws.getCell(`A${currentRow}`);
        noteCell.value = sheet.note;
        noteCell.font = { name: '맑은 고딕', size: 11, bold: true };
        noteCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        ws.getRow(currentRow).height = 30;
        currentRow++;
      }

      // 헤더
      const headerRow = currentRow;
      ws.getRow(headerRow).values = ['번호', '이미지', '수량', '단가', '비고'];
      ws.getRow(headerRow).height = 22;
      ['A', 'B', 'C', 'D', 'E'].forEach(col => {
        const cell = ws.getCell(`${col}${headerRow}`);
        cell.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' }
        };
      });
      currentRow++;

      // 품목 행들
      for (let i = 0; i < (sheet.items || []).length; i++) {
        const item = sheet.items[i];
        const row = currentRow;
        ws.getRow(row).height = 140;

        // 번호
        const noCell = ws.getCell(`A${row}`);
        noCell.value = i + 1;
        noCell.font = { name: '맑은 고딕', size: 12, bold: true };
        noCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // 이미지 (B 컬럼) - URL 또는 base64 모두 처리
        if (item.photo) {
          try {
            let base64, ext;
            if (item.photo.startsWith('data:')) {
              // base64 형식
              base64 = item.photo.split(',')[1];
              ext = item.photo.includes('image/png') ? 'png' : 'jpeg';
            } else {
              // URL 형식 - fetch해서 base64로 변환
              const response = await fetch(item.photo);
              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();
              const bytes = new Uint8Array(arrayBuffer);
              let binary = '';
              for (let j = 0; j < bytes.byteLength; j++) {
                binary += String.fromCharCode(bytes[j]);
              }
              base64 = btoa(binary);
              ext = blob.type.includes('png') ? 'png' : 'jpeg';
            }
            const imageId = wb.addImage({ base64, extension: ext });
            ws.addImage(imageId, {
              tl: { col: 1.1, row: row - 1 + 0.1 },
              br: { col: 1.9, row: row - 1 + 0.9 },
              editAs: 'oneCell'
            });
          } catch (e) { console.error('이미지 삽입 실패', e); }
        }

        // 수량
        const qtyCell = ws.getCell(`C${row}`);
        qtyCell.value = item.quantity || '';
        qtyCell.font = { name: '맑은 고딕', size: 11 };
        qtyCell.alignment = { vertical: 'middle', horizontal: 'center' };

        // 단가
        const priceCell = ws.getCell(`D${row}`);
        priceCell.value = item.price || '';
        priceCell.font = { name: '맑은 고딕', size: 11, color: { argb: 'FFCC0000' } };
        priceCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // 비고
        const notesCell = ws.getCell(`E${row}`);
        notesCell.value = item.notes || '';
        notesCell.font = { name: '맑은 고딕', size: 11, bold: true, color: { argb: 'FFCC0000' } };
        notesCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

        // 테두리
        ['A', 'B', 'C', 'D', 'E'].forEach(col => {
          ws.getCell(`${col}${row}`).border = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
          };
        });

        currentRow++;
      }

      // 파일 저장
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sheet.client || '주문서'}_${sheet.orderDate || ''}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('엑셀 추출에 실패했습니다: ' + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="app">
      <style>{styles}</style>
      <header className="header">
        <button className="icon-btn" onClick={onBack}><ArrowLeft size={20} /></button>
        <div className="header-title">주문서</div>
        <div className="header-actions">
          <button className="icon-btn" onClick={exportToExcel} disabled={exporting} title="엑셀 다운로드">
            <Download size={18} />
          </button>
          {authMode === 'edit' && (
            <>
              <button className="icon-btn" onClick={onEdit}><Edit3 size={18} /></button>
              <button className="icon-btn danger" onClick={onDelete}><Trash2 size={18} /></button>
            </>
          )}
        </div>
      </header>

      <div className="sheet-detail-body">
        <div className="sheet-header">
          <h1 className="sheet-title">주문서</h1>
          <div className="sheet-date">{sheet.orderDate}</div>
        </div>

        <div className="sheet-client-row">
          <span className="sheet-client-label">거래처</span>
          <span className="sheet-client-name">{sheet.client}</span>
        </div>

        {sheet.note && sheet.note.trim() && (
          <div className="sheet-note">
            {sheet.note}
          </div>
        )}

        <div className="items-table">
          <div className="items-header">
            <div className="th-no">번호</div>
            <div className="th-image">이미지</div>
            <div className="th-info">품목</div>
            <div className="th-price">단가</div>
            <div className="th-notes">비고</div>
          </div>

          {(sheet.items || []).map((item, idx) => {
            const daysLeft = item.deadline ? Math.ceil((new Date(item.deadline) - new Date(new Date().toDateString())) / 86400000) : null;
            return (
              <div key={idx} className={`item-row ${item.status === 'done' ? 'done' : ''}`}>
                <div className="td-no">{idx + 1}</div>
                <div className="td-image" onClick={() => item.photo && setZoomPhoto(item.photo)}>
                  {item.photo ? (
                    <img src={item.photo} alt={`품목 ${idx + 1}`} />
                  ) : (
                    <div className="no-image">사진 없음</div>
                  )}
                </div>

                {/* 품목 정보 (품목명 + 수량 + 기한 + 상태 토글) */}
                <div className="td-info">
                  <div className="item-content">{item.content}</div>

                  {/* 수량 (인라인 편집) */}
                  <InlineField
                    label="수량"
                    value={item.quantity}
                    placeholder={authMode === 'edit' ? '+ 수량 추가' : '—'}
                    editable={authMode === 'edit'}
                    isEditing={isEditing(idx, 'quantity')}
                    draft={draft}
                    onStartEdit={() => startEdit(idx, 'quantity')}
                    onChangeDraft={setDraft}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    multiline={false}
                  />

                  <div className="item-meta-row">
                    {item.deadline && (
                      <span className={`item-deadline ${daysLeft !== null && item.status !== 'done' ? (daysLeft < 0 ? 'overdue' : daysLeft <= 3 ? 'soon' : '') : ''}`}>
                        <Clock size={11} /> {item.deadline}
                        {daysLeft !== null && item.status !== 'done' && (
                          <span className="dday">
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}일↑` : daysLeft === 0 ? '오늘' : `D-${daysLeft}`}
                          </span>
                        )}
                      </span>
                    )}
                    <button
                      className={`item-status-toggle ${item.status === 'done' ? 'done' : 'progress'}`}
                      onClick={() => onToggleItemStatus(idx)}
                      disabled={authMode !== 'edit'}
                    >
                      {item.status === 'done' ? <><CheckCircle2 size={12} /> 완료</> : <><Circle size={12} /> 진행중</>}
                    </button>
                  </div>
                </div>

                {/* 단가 (인라인 편집) */}
                <div className="td-price">
                  <InlineField
                    value={item.price}
                    placeholder={authMode === 'edit' ? '+ 단가' : '—'}
                    editable={authMode === 'edit'}
                    isEditing={isEditing(idx, 'price')}
                    draft={draft}
                    onStartEdit={() => startEdit(idx, 'price')}
                    onChangeDraft={setDraft}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    multiline={false}
                    cellStyle="price"
                  />
                </div>

                {/* 비고 (인라인 편집) */}
                <div className="td-notes">
                  <InlineField
                    value={item.notes}
                    placeholder={authMode === 'edit' ? '+ 비고 추가' : '—'}
                    editable={authMode === 'edit'}
                    isEditing={isEditing(idx, 'notes')}
                    draft={draft}
                    onStartEdit={() => startEdit(idx, 'notes')}
                    onChangeDraft={setDraft}
                    onSave={saveEdit}
                    onCancel={cancelEdit}
                    multiline={true}
                    cellStyle="notes"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {zoomPhoto && (
        <div className="zoom-overlay" onClick={() => setZoomPhoto(null)}>
          <button className="zoom-close" onClick={() => setZoomPhoto(null)}>
            <X size={22} />
          </button>
          <img src={zoomPhoto} alt="확대" className="zoom-image" onClick={(e) => e.stopPropagation()} />
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ============ 폼 (주문서 작성) ============
function SheetForm({ initial, existingClients = [], onCancel, onSave }) {
  const today = new Date().toISOString().slice(0, 10);
  const [client, setClient] = useState(initial?.client || '');
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [orderDate, setOrderDate] = useState(initial?.orderDate || today);
  const [note, setNote] = useState(initial?.note || '');
  const [items, setItems] = useState(
    initial?.items && initial.items.length > 0
      ? initial.items
      : [{ content: '', quantity: '', price: '', notes: '', photo: '', deadline: '', status: 'progress' }]
  );
  const [saving, setSaving] = useState(false);

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  // 첫 번째 품목의 기한이 바뀌면, 기한이 비어있던 나머지 품목도 자동으로 채움
  const updateFirstDeadline = (newDeadline) => {
    setItems(prev => {
      const next = [...prev];
      const oldFirst = next[0]?.deadline || '';
      next[0] = { ...next[0], deadline: newDeadline };
      // 나머지: 비어있거나, 이전 첫번째 기한과 같았던 경우 자동 동기화
      for (let i = 1; i < next.length; i++) {
        if (!next[i].deadline || next[i].deadline === oldFirst) {
          next[i] = { ...next[i], deadline: newDeadline };
        }
      }
      return next;
    });
  };

  const addItem = () => {
    if (items.length >= MAX_ITEMS) {
      alert(`품목은 최대 ${MAX_ITEMS}개까지 추가 가능합니다`);
      return;
    }
    // 새 품목 기한은 첫 번째 품목의 기한으로 기본 채움
    const defaultDeadline = items[0]?.deadline || '';
    setItems(prev => [...prev, { content: '', quantity: '', price: '', notes: '', photo: '', deadline: defaultDeadline, status: 'progress' }]);
  };

  const removeItem = (idx) => {
    if (items.length === 1) {
      alert('품목은 최소 1개 이상이어야 합니다');
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const compressImage = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = h * (MAX / w); w = MAX; } else { w = w * (MAX / h); h = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleSubmit = async () => {
    if (!client.trim()) { alert('거래처명을 입력하세요'); return; }
    const validItems = items.filter(it => it.content.trim());
    if (validItems.length === 0) { alert('품목을 1개 이상 입력하세요'); return; }
    setSaving(true);
    await onSave({
      id: initial?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      client: client.trim(),
      orderDate,
      note: note.trim(),
      items: items.map(it => ({
        content: it.content.trim(),
        quantity: (it.quantity || '').trim(),
        price: (it.price || '').trim(),
        notes: (it.notes || '').trim(),
        photo: it.photo || '',
        deadline: it.deadline || '',
        status: it.status || 'progress',
      })),
      createdAt: initial?.createdAt || Date.now(),
      updatedAt: Date.now(),
    });
    setSaving(false);
  };

  return (
    <div className="app">
      <style>{styles}</style>
      <header className="header">
        <button className="icon-btn" onClick={onCancel}><ArrowLeft size={20} /></button>
        <div className="header-title">{initial ? '주문서 수정' : '새 주문서'}</div>
        <button className="text-btn primary" onClick={handleSubmit} disabled={saving}>
          {saving ? '저장중' : '저장'}
        </button>
      </header>

      <div className="form-body">
        <div className="field">
          <label className="field-label">거래처명 <span className="req">*</span></label>
          <div className="client-input-wrap">
            <input className="field-input" value={client}
              onChange={(e) => { setClient(e.target.value); setClientPickerOpen(true); }}
              onFocus={() => setClientPickerOpen(true)}
              onBlur={() => setTimeout(() => setClientPickerOpen(false), 150)}
              placeholder="예: 한국상사" autoComplete="off" />
            {existingClients.length > 0 && (
              <button type="button" className="client-toggle"
                onMouseDown={(e) => { e.preventDefault(); setClientPickerOpen(!clientPickerOpen); }}>
                목록
              </button>
            )}
            {clientPickerOpen && existingClients.length > 0 && (
              <div className="client-dropdown">
                {existingClients
                  .filter(c => !client.trim() || c.toLowerCase().includes(client.trim().toLowerCase()))
                  .map(c => (
                    <button key={c} type="button" className="client-option"
                      onMouseDown={(e) => { e.preventDefault(); setClient(c); setClientPickerOpen(false); }}>
                      {c}
                    </button>
                  ))}
                {existingClients.filter(c => !client.trim() || c.toLowerCase().includes(client.trim().toLowerCase())).length === 0 && (
                  <div className="client-empty">일치하는 거래처 없음 · 새로 입력하세요</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label className="field-label">주문 날짜</label>
          <input type="date" className="field-input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label">안내 메시지 (선택)</label>
          <textarea className="field-textarea" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="예: 노란색 부분은 이번주 꼭 부탁드립니다" rows={2} />
        </div>

        <div className="items-section">
          <div className="items-section-header">
            <span className="items-section-title">품목 ({items.length}/{MAX_ITEMS})</span>
            <span className="items-section-hint">첫 품목 기한이 자동으로 적용됩니다</span>
          </div>

          {items.map((item, idx) => (
            <ItemForm
              key={idx}
              index={idx}
              item={item}
              isFirst={idx === 0}
              onChange={(patch) => {
                if (idx === 0 && 'deadline' in patch) {
                  updateFirstDeadline(patch.deadline);
                } else {
                  updateItem(idx, patch);
                }
              }}
              onRemove={() => removeItem(idx)}
              compressImage={compressImage}
            />
          ))}

          {items.length < MAX_ITEMS && (
            <button type="button" className="add-item-btn" onClick={addItem}>
              <Plus size={16} /> 품목 추가 ({items.length}/{MAX_ITEMS})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ 품목 입력 ============
function ItemForm({ index, item, isFirst, onChange, onRemove, compressImage }) {
  const fileRef = useRef(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoProcessing(true);
    try {
      const compressed = await compressImage(file);
      onChange({ photo: compressed });
    } catch (err) { console.error(err); alert('사진 처리 실패'); }
    finally { setPhotoProcessing(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="item-form">
      <div className="item-form-header">
        <div className="item-no">{index + 1}</div>
        <button type="button" className="item-remove" onClick={onRemove}>
          <X size={16} />
        </button>
      </div>

      <div className="item-form-body">
        <div className="item-photo-area">
          {item.photo ? (
            <div className="item-photo-preview">
              <img src={item.photo} alt={`품목 ${index + 1}`} />
              <button type="button" className="photo-remove" onClick={() => onChange({ photo: '' })}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button type="button" className="item-photo-upload" onClick={() => fileRef.current?.click()} disabled={photoProcessing}>
              <Camera size={18} />
              <span>{photoProcessing ? '처리중' : '사진'}</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
        </div>

        <div className="item-fields">
          <div className="field-mini">
            <label className="field-mini-label">품목 <span className="req">*</span></label>
            <input className="field-mini-input" value={item.content}
              onChange={(e) => onChange({ content: e.target.value })}
              placeholder="예: 360도 바가지 모양 아루" />
          </div>

          <div className="field-mini">
            <label className="field-mini-label">수량</label>
            <input className="field-mini-input" value={item.quantity}
              onChange={(e) => onChange({ quantity: e.target.value })}
              placeholder="예: 50" />
          </div>

          <div className="field-mini">
            <label className="field-mini-label">단가</label>
            <input className="field-mini-input" value={item.price || ''}
              onChange={(e) => onChange({ price: e.target.value })}
              placeholder="예: 제이메탈, 1티, 0.6티 등" />
          </div>

          <div className="field-mini">
            <label className="field-mini-label">
              기한 {isFirst && <span className="auto-tag">자동 동기화</span>}
            </label>
            <input type="date" className="field-mini-input" value={item.deadline}
              onChange={(e) => onChange({ deadline: e.target.value })} />
          </div>

          <div className="field-mini">
            <label className="field-mini-label">비고</label>
            <textarea className="field-mini-textarea" value={item.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="특이사항, 메모 등" rows={2} />
          </div>

          <div className="status-toggle small">
            <button type="button" className={`toggle-btn ${item.status !== 'done' ? 'active' : ''}`}
              onClick={() => onChange({ status: 'progress' })}>
              <Circle size={12} /> 진행중
            </button>
            <button type="button" className={`toggle-btn done ${item.status === 'done' ? 'active' : ''}`}
              onClick={() => onChange({ status: 'done' })}>
              <CheckCircle2 size={12} /> 완료
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  .app, .auth-screen {
    font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    background: #f6f5f1; min-height: 100vh; color: #1a1a1a;
    max-width: 720px; margin: 0 auto; position: relative; padding-bottom: 40px;
  }
  .auth-screen { padding-bottom: 0; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .auth-card { background: #fff; border-radius: 24px; padding: 40px 28px 32px; width: 100%; max-width: 380px;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 20px 50px -20px rgba(0,0,0,0.15);
    border: 1px solid rgba(0,0,0,0.04); }
  .auth-icon { width: 56px; height: 56px; background: #1a1a1a; color: #fff; border-radius: 16px;
    display: flex; align-items: center; justify-content: center; margin: 0 auto 18px; }
  .auth-title { font-size: 26px; font-weight: 700; text-align: center; margin: 0 0 6px; letter-spacing: -0.02em; }
  .auth-subtitle { text-align: center; color: #888; margin: 0 0 24px; font-size: 14px; }
  .auth-input { width: 100%; padding: 14px 16px; border: 1.5px solid #eaeaea; border-radius: 12px;
    font-size: 16px; outline: none; background: #fafafa; font-family: inherit; transition: border-color 0.15s; }
  .auth-input:focus { border-color: #1a1a1a; background: #fff; }
  .auth-error { color: #d4352a; font-size: 13px; margin-top: 8px; display: flex; align-items: center; gap: 5px; }
  .auth-btn { width: 100%; margin-top: 14px; padding: 14px; background: #1a1a1a; color: #fff;
    border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; }
  .auth-btn:active { transform: scale(0.98); }
  .auth-hint { margin-top: 24px; padding-top: 20px; border-top: 1px dashed #e8e8e8; font-size: 13px; color: #666; }
  .hint-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .hint-tag { font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; letter-spacing: 0.04em; }
  .hint-tag.edit { background: #1a1a1a; color: #fff; }
  .hint-tag.view { background: #ebe9e0; color: #5a5a5a; }
  .hint-row code { font-family: 'SF Mono', Menlo, monospace; background: #f5f4ee; padding: 2px 7px; border-radius: 4px; font-size: 12px; }
  .auth-hint-note { margin-top: 10px; font-size: 11px; color: #aaa; line-height: 1.4; }

  .header { display: flex; align-items: center; gap: 8px; padding: 14px 16px; background: #f6f5f1;
    position: sticky; top: 0; z-index: 10; border-bottom: 1px solid rgba(0,0,0,0.05); }
  .header-brand { display: flex; align-items: center; gap: 10px; flex: 1; }
  .brand-mark { width: 36px; height: 36px; background: #1a1a1a; color: #fff; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; }
  .brand-title { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
  .brand-mode { font-size: 11px; color: #888; display: flex; align-items: center; gap: 3px; margin-top: 1px; }
  .header-title { flex: 1; font-size: 16px; font-weight: 600; }
  .header-actions { display: flex; gap: 4px; }
  .icon-btn { background: transparent; border: none; width: 40px; height: 40px; border-radius: 10px;
    display: flex; align-items: center; justify-content: center; cursor: pointer; color: #1a1a1a; transition: background 0.15s; }
  .icon-btn:hover { background: rgba(0,0,0,0.05); }
  .icon-btn.danger { color: #c93030; }
  .icon-btn.danger:hover { background: rgba(201,48,48,0.08); }
  .text-btn { background: transparent; border: none; padding: 8px 12px; font-size: 14px; color: #555;
    cursor: pointer; border-radius: 8px; font-family: inherit; }
  .text-btn:hover { background: rgba(0,0,0,0.04); }
  .text-btn.primary { background: #1a1a1a; color: #fff; font-weight: 600; padding: 9px 18px; }
  .text-btn.primary:disabled { opacity: 0.5; }

  .add-btn-wrap { padding: 8px 16px 4px; }
  .add-btn { width: 100%; padding: 13px; background: #1a1a1a; color: #fff; border: none;
    border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 6px;
    font-family: inherit; transition: transform 0.1s; }
  .add-btn:active { transform: scale(0.99); }

  .stats-row { display: flex; padding: 4px 16px 12px; gap: 8px; }
  .stat { flex: 1; background: #fff; border-radius: 14px; padding: 12px 14px; border: 1px solid rgba(0,0,0,0.04); }
  .stat-num { font-size: 22px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; }
  .stat-label { font-size: 11px; color: #888; margin-top: 2px; }

  .toolbar { padding: 4px 16px 12px; }
  .search-wrap { position: relative; margin-bottom: 12px; }
  .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #999; }
  .search-input { width: 100%; padding: 11px 36px 11px 36px; border: 1px solid rgba(0,0,0,0.07);
    border-radius: 11px; font-size: 14px; background: #fff; outline: none; font-family: inherit; }
  .search-input:focus { border-color: #1a1a1a; }
  .clear-search { position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: rgba(0,0,0,0.06); border: none; width: 22px; height: 22px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; cursor: pointer; color: #666; }

  .filter-row { display: flex; gap: 6px; margin-bottom: 10px; }
  .chip { flex: 1; background: #fff; border: 1px solid rgba(0,0,0,0.07); padding: 8px 12px;
    border-radius: 9px; font-size: 13px; cursor: pointer; color: #555; font-family: inherit; transition: all 0.15s; }
  .chip.active { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }

  .sort-row { display: flex; gap: 6px; align-items: center; }
  .sort-label { font-size: 11px; color: #888; font-weight: 600; letter-spacing: 0.04em; margin-right: 2px; }
  .sort-btn { background: transparent; border: 1px solid transparent; padding: 6px 11px;
    border-radius: 8px; font-size: 13px; cursor: pointer; color: #666; font-family: inherit; }
  .sort-btn.active { background: #fff; color: #1a1a1a; font-weight: 600; border-color: rgba(0,0,0,0.08); }

  .bulk-delete { margin-top: 10px; width: 100%; background: #fff; border: 1px dashed #d4352a;
    color: #d4352a; padding: 9px; border-radius: 10px; font-size: 13px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 5px; font-family: inherit; }
  .bulk-delete:hover { background: #fdf4f3; }

  .list-body { padding: 4px 16px 16px; }

  .folder-header { background: #fff; border: 1px solid rgba(0,0,0,0.06); border-radius: 12px;
    padding: 10px 12px; margin-bottom: 10px; }
  .folder-back { background: transparent; border: none; color: #666; font-size: 12px;
    cursor: pointer; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;
    border-radius: 6px; font-family: inherit; margin-bottom: 4px; }
  .folder-back:hover { background: rgba(0,0,0,0.04); }
  .folder-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; }
  .folder-icon { font-size: 20px; }
  .folder-count { font-size: 12px; font-weight: 500; color: #888; margin-left: auto; }

  .folder-card { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: #fff; border: 1px solid rgba(0,0,0,0.04); border-radius: 14px;
    padding: 14px 15px; margin-bottom: 8px; cursor: pointer; font-family: inherit;
    transition: transform 0.1s, box-shadow 0.15s; }
  .folder-card:hover { box-shadow: 0 4px 12px -4px rgba(0,0,0,0.08); }
  .folder-card:active { transform: scale(0.99); }
  .folder-card-icon { font-size: 32px; flex-shrink: 0; }
  .folder-card-info { flex: 1; min-width: 0; }
  .folder-card-name { font-size: 17px; font-weight: 700; letter-spacing: -0.02em;
    margin-bottom: 3px; color: #1a1a1a; }
  .folder-card-meta { font-size: 12px; color: #888; display: flex; align-items: center;
    gap: 4px; flex-wrap: wrap; }
  .folder-progressing { color: #8b6914; font-weight: 600; }
  .folder-deadline { display: inline-flex; align-items: center; gap: 3px; }

  .sheet-card { display: block; width: 100%; text-align: left; background: #fff;
    border: 1px solid rgba(0,0,0,0.04); border-radius: 14px; padding: 14px 15px; margin-bottom: 8px;
    cursor: pointer; font-family: inherit; transition: transform 0.1s, box-shadow 0.15s; }
  .sheet-card:hover { box-shadow: 0 4px 12px -4px rgba(0,0,0,0.08); }
  .sheet-card:active { transform: scale(0.99); }
  .sheet-card.done { opacity: 0.65; }
  .card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 6px; }
  .card-client { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; flex: 1; }
  .status-dot { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 5px;
    letter-spacing: 0.03em; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .status-dot.progress { background: #f0ebd8; color: #8b6914; }
  .status-dot.done { background: #e8f0e8; color: #4a7048; }
  .card-summary { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #888; margin-bottom: 5px; }
  .card-sep { margin: 0 3px; }
  .card-preview { font-size: 13.5px; color: #555; line-height: 1.45; margin-bottom: 9px;
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  .card-bottom { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .card-meta { display: flex; align-items: center; gap: 3px; font-size: 11.5px; color: #888; }
  .days-tag { margin-left: 4px; padding: 1px 5px; border-radius: 4px; font-size: 10px;
    font-weight: 700; background: #ebe9e0; color: #5a5a5a; }
  .days-tag.soon { background: #fef0d8; color: #a05a0a; }
  .days-tag.overdue { background: #fbe3e0; color: #a82820; }

  .empty { text-align: center; padding: 80px 24px; color: #999; }
  .empty-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-title { font-size: 15px; font-weight: 600; color: #666; }
  .empty-sub { font-size: 13px; margin-top: 6px; color: #aaa; }
  .spinner { width: 32px; height: 32px; border: 2.5px solid #eaeaea; border-top-color: #1a1a1a;
    border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* === 주문서 상세 (표 형식) === */
  .sheet-detail-body { padding: 12px 14px 40px; }
  .sheet-header { text-align: center; padding: 10px 0 14px; border-bottom: 2px solid #1a1a1a; margin-bottom: 14px; }
  .sheet-title { font-size: 28px; font-weight: 700; margin: 0; letter-spacing: 0.15em; }
  .sheet-date { font-size: 14px; color: #555; margin-top: 6px; font-variant-numeric: tabular-nums; }

  .sheet-client-row { display: flex; align-items: baseline; gap: 12px;
    background: #fff; border: 1px solid rgba(0,0,0,0.06); border-radius: 10px;
    padding: 12px 14px; margin-bottom: 12px; }
  .sheet-client-label { font-size: 11px; font-weight: 700; color: #888; letter-spacing: 0.06em; }
  .sheet-client-name { font-size: 17px; font-weight: 700; }

  .sheet-note { background: #fef9c3; border: 1px solid #fde047; padding: 11px 14px;
    border-radius: 8px; font-size: 14px; color: #1a1a1a; margin-bottom: 14px;
    white-space: pre-wrap; line-height: 1.5; font-weight: 500; text-align: center; }

  .items-table { background: #fff; border: 1.5px solid #1a1a1a; border-radius: 6px; overflow: hidden; }
  .items-header { display: grid; grid-template-columns: 36px 1fr 140px 100px 160px;
    background: #1a1a1a; color: #fff; font-size: 12px; font-weight: 700; }
  .th-no, .th-image, .th-info, .th-price, .th-notes {
    padding: 9px 8px; text-align: center; border-right: 1px solid rgba(255,255,255,0.15); }
  .th-notes { border-right: none; }
  .item-row { display: grid; grid-template-columns: 36px 1fr 140px 100px 160px;
    border-top: 1px solid #1a1a1a; min-height: 320px; }
  .item-row:first-of-type { border-top: none; }
  .item-row.done { background: #fafaf7; opacity: 0.7; }
  .td-no, .td-image, .td-info, .td-price, .td-notes {
    padding: 10px 8px; border-right: 1px solid #1a1a1a; }
  .td-notes { border-right: none; }
  .td-no { display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .td-image { display: flex; align-items: center; justify-content: center; padding: 10px; cursor: zoom-in;
    background: #fafaf7; min-height: 320px; }
  .td-image img { max-width: 100%; max-height: 100%; width: auto; height: auto;
    object-fit: contain; border-radius: 4px; display: block; }
  .no-image { font-size: 12px; color: #aaa; text-align: center; padding: 40px 4px; }

  /* === 인라인 편집 공통 === */
  .inline-display { width: 100%; min-height: 28px; padding: 4px;
    border-radius: 6px; transition: background 0.15s; }
  .inline-display.editable { cursor: pointer; }
  .inline-display.editable:hover { background: rgba(0,0,0,0.04); }
  .inline-value { font-size: 13px; line-height: 1.45; color: #333;
    white-space: pre-wrap; word-break: break-word; }
  .inline-label { font-size: 10px; color: #888; font-weight: 700;
    letter-spacing: 0.04em; margin-right: 4px; }
  .inline-text { color: #1a1a1a; }
  .inline-empty { font-size: 12px; color: #bbb; font-style: italic;
    padding: 4px 0; }
  .inline-display.editable .inline-empty { color: #1a1a1a; opacity: 0.4;
    font-style: normal; font-weight: 500; }

  /* 단가 셀 - 진한 빨강, 가운데 정렬 */
  .inline-display.cell-price { display: flex; align-items: center; justify-content: center;
    min-height: 80px; }
  .inline-display.cell-price .inline-value { text-align: center; color: #c93030;
    font-weight: 600; font-size: 14px; }

  /* 비고 셀 - 빨강, 가운데 */
  .inline-display.cell-notes { display: flex; align-items: center; justify-content: center;
    min-height: 80px; }
  .inline-display.cell-notes .inline-value { text-align: center; color: #c93030;
    font-weight: 500; font-size: 13.5px; line-height: 1.4; }

  .inline-edit { display: flex; flex-direction: column; gap: 5px; height: 100%; }
  .inline-input, .inline-textarea { padding: 7px 9px; border: 1.5px solid #1a1a1a;
    border-radius: 6px; font-size: 13px; font-family: inherit; line-height: 1.4;
    outline: none; background: #fff; width: 100%; box-sizing: border-box; }
  .inline-textarea { resize: none; min-height: 80px; }
  .inline-edit-actions { display: flex; gap: 5px; }
  .inline-cancel, .inline-save { flex: 1; padding: 6px; font-size: 11.5px;
    font-weight: 600; border-radius: 5px; cursor: pointer; font-family: inherit;
    border: 1px solid rgba(0,0,0,0.1); }
  .inline-cancel { background: #fff; color: #666; }
  .inline-cancel:hover { background: #f5f4ee; }
  .inline-save { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  .inline-save:hover { opacity: 0.9; }
  .td-info { display: flex; flex-direction: column; gap: 4px; }
  .item-content { font-size: 14px; font-weight: 600; line-height: 1.35; color: #1a1a1a; }
  .item-quantity { font-size: 13px; color: #333; }
  .qty-label { font-size: 10px; color: #888; font-weight: 700; letter-spacing: 0.04em; margin-right: 4px; }
  .item-notes { font-size: 12.5px; color: #c93030; line-height: 1.4; white-space: pre-wrap; }
  .item-meta-row { display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 4px; flex-wrap: wrap; }
  .item-deadline { display: inline-flex; align-items: center; gap: 3px;
    font-size: 11px; color: #666; }
  .item-deadline.soon { color: #a05a0a; font-weight: 600; }
  .item-deadline.overdue { color: #a82820; font-weight: 600; }
  .item-deadline .dday { margin-left: 3px; padding: 1px 5px; border-radius: 3px;
    background: #ebe9e0; font-weight: 700; font-size: 10px; }
  .item-deadline.soon .dday { background: #fef0d8; color: #a05a0a; }
  .item-deadline.overdue .dday { background: #fbe3e0; color: #a82820; }
  .item-status-toggle { display: inline-flex; align-items: center; gap: 3px;
    font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 4px;
    border: none; cursor: pointer; font-family: inherit; letter-spacing: 0.03em; }
  .item-status-toggle.progress { background: #f0ebd8; color: #8b6914; }
  .item-status-toggle.done { background: #e8f0e8; color: #4a7048; }
  .item-status-toggle:disabled { cursor: default; }

  /* === 폼 === */
  .form-body { padding: 16px 14px 40px; }
  .field { margin-bottom: 14px; }
  .field-label { display: block; font-size: 12px; font-weight: 700; color: #666;
    letter-spacing: 0.04em; margin-bottom: 6px; }
  .req { color: #d4352a; }
  .field-input, .field-textarea { width: 100%; padding: 12px 14px; border: 1px solid rgba(0,0,0,0.08);
    border-radius: 11px; font-size: 15px; background: #fff; outline: none; font-family: inherit;
    transition: border-color 0.15s; }
  .field-input:focus, .field-textarea:focus { border-color: #1a1a1a; }
  .field-textarea { resize: vertical; min-height: 60px; line-height: 1.5; }

  .client-input-wrap { position: relative; }
  .client-toggle { position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    background: #f5f4ee; border: 1px solid rgba(0,0,0,0.06); color: #555;
    padding: 6px 11px; border-radius: 8px; font-size: 12px; cursor: pointer;
    font-family: inherit; font-weight: 600; }
  .client-toggle:hover { background: #ebe9e0; }
  .client-input-wrap .field-input { padding-right: 64px; }
  .client-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0;
    background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 11px;
    box-shadow: 0 10px 30px -8px rgba(0,0,0,0.18); max-height: 240px; overflow-y: auto;
    z-index: 30; padding: 4px; }
  .client-option { display: block; width: 100%; text-align: left; background: transparent;
    border: none; padding: 10px 12px; font-size: 14px; cursor: pointer; border-radius: 7px;
    color: #1a1a1a; font-family: inherit; }
  .client-option:hover { background: #f5f4ee; }
  .client-empty { padding: 14px 12px; font-size: 13px; color: #999; text-align: center; }

  /* === 품목 섹션 === */
  .items-section { margin-top: 22px; }
  .items-section-header { display: flex; align-items: baseline; justify-content: space-between;
    padding-bottom: 8px; margin-bottom: 10px; border-bottom: 1.5px solid #1a1a1a; }
  .items-section-title { font-size: 14px; font-weight: 700; }
  .items-section-hint { font-size: 11px; color: #888; }

  .item-form { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 12px;
    margin-bottom: 10px; overflow: hidden; }
  .item-form-header { display: flex; justify-content: space-between; align-items: center;
    padding: 8px 12px; background: #1a1a1a; color: #fff; }
  .item-no { font-size: 12px; font-weight: 700; letter-spacing: 0.05em; }
  .item-no::before { content: '품목 '; opacity: 0.7; font-weight: 500; }
  .item-remove { background: rgba(255,255,255,0.1); border: none; color: #fff;
    width: 26px; height: 26px; border-radius: 6px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; }
  .item-remove:hover { background: rgba(255,255,255,0.2); }
  .item-form-body { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 12px; }
  .item-photo-area { width: 100%; aspect-ratio: 1 / 1; }
  .item-photo-upload { width: 100%; height: 100%; background: #fafafa;
    border: 1.5px dashed rgba(0,0,0,0.15); border-radius: 10px;
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    color: #888; cursor: pointer; font-family: inherit; font-size: 13px; }
  .item-photo-upload:hover { border-color: #1a1a1a; color: #1a1a1a; }
  .item-photo-upload:disabled { opacity: 0.6; cursor: wait; }
  .item-photo-preview { position: relative; width: 100%; height: 100%;
    border-radius: 10px; overflow: hidden; background: #f0eee5; }
  .item-photo-preview img { width: 100%; height: 100%; object-fit: contain; }
  .photo-remove { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px;
    background: rgba(0,0,0,0.7); color: #fff; border: none; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .item-fields { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .field-mini-row { display: flex; gap: 8px; }
  .field-mini { display: flex; flex-direction: column; }
  .field-mini-label { font-size: 10.5px; font-weight: 700; color: #888;
    letter-spacing: 0.04em; margin-bottom: 3px; display: flex; align-items: center; gap: 5px; }
  .auto-tag { background: #1a1a1a; color: #fff; font-size: 9px; padding: 1px 5px;
    border-radius: 3px; letter-spacing: 0.02em; font-weight: 600; }
  .field-mini-input, .field-mini-textarea { width: 100%; padding: 7px 9px;
    border: 1px solid rgba(0,0,0,0.08); border-radius: 7px; font-size: 13px;
    background: #fff; outline: none; font-family: inherit; }
  .field-mini-input:focus, .field-mini-textarea:focus { border-color: #1a1a1a; }
  .field-mini-textarea { resize: vertical; min-height: 44px; line-height: 1.4; }

  .status-toggle { display: flex; gap: 6px; }
  .status-toggle.small .toggle-btn { padding: 6px 8px; font-size: 11.5px; }
  .toggle-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
    padding: 10px; background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 8px;
    font-size: 13px; color: #666; cursor: pointer; font-family: inherit; }
  .toggle-btn.active { background: #f0ebd8; color: #8b6914; border-color: #d8c98a; font-weight: 600; }
  .toggle-btn.done.active { background: #e8f0e8; color: #4a7048; border-color: #a8c5a5; }

  .add-item-btn { width: 100%; padding: 12px; background: #fff;
    border: 1.5px dashed rgba(0,0,0,0.2); border-radius: 11px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; gap: 5px;
    font-size: 13.5px; color: #555; font-weight: 600; font-family: inherit;
    margin-top: 6px; }
  .add-item-btn:hover { border-color: #1a1a1a; color: #1a1a1a; background: #fafafa; }

  .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
    background: #1a1a1a; color: #fff; padding: 11px 20px; border-radius: 24px;
    font-size: 13.5px; font-weight: 500; z-index: 100; animation: toastIn 0.25s ease;
    box-shadow: 0 8px 24px -6px rgba(0,0,0,0.3); }
  @keyframes toastIn { from { transform: translate(-50%, 12px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }

  .zoom-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.92);
    z-index: 200; display: flex; align-items: center; justify-content: center;
    padding: 20px; animation: zoomFadeIn 0.2s ease; cursor: zoom-out; }
  @keyframes zoomFadeIn { from { opacity: 0; } to { opacity: 1; } }
  .zoom-image { max-width: 100%; max-height: 100%; object-fit: contain;
    border-radius: 6px; cursor: default; }
  .zoom-close { position: absolute; top: 16px; right: 16px;
    width: 44px; height: 44px; border-radius: 50%; border: none;
    background: rgba(255,255,255,0.15); color: #fff; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(8px); }
  .zoom-close:hover { background: rgba(255,255,255,0.25); }

  @media (max-width: 768px) {
    .items-table { overflow-x: auto; }
    .items-header, .item-row {
      grid-template-columns: 32px minmax(180px, 1fr) 120px 90px 140px;
      min-width: 562px;
    }
    .item-row { min-height: 260px; }
    .td-image { min-height: 260px; }
  }
  @media (max-width: 480px) {
    .sheet-title { font-size: 22px; }
    .stat-num { font-size: 20px; }
    .item-form-body { padding: 10px; gap: 8px; }
  }
`;
