// app.clipboard.js
// Excel-compatible copy/cut/paste for the Cross-Section table.
// Requires: app.ui.js to be loaded first (so it can use its selection & helpers).

(function(){
  const XS_TABLE_ID = 'xsTable';

  // ---------- helpers ----------
  function isGridContext(){
    const grid = document.getElementById(XS_TABLE_ID);
    if(!grid) return false;
    if(typeof selectedCells !== 'undefined' && selectedCells && selectedCells.size > 0) return true;
    const el = document.activeElement;
    return !!(el && (el.id === XS_TABLE_ID || grid.contains(el)));
  }
  function getActiveEditingInputSafe(){
    try { return (typeof getActiveEditingInput === 'function') ? getActiveEditingInput() : null; }
    catch { return null; }
  }
  function looksStage(s){
    const t = String(s||'').trim().toUpperCase();
    return t === 'LB' || t === 'RB';
  }
  function looksNumber(s){
    const t = String(s||'').trim();
    if(!t) return false;
    const s1 = t.replace(/,/g,''); // allow thousands separators
    return Number.isFinite(parseFloat(s1));
  }
  function normalizeNum(s){
    let t = String(s ?? '').trim();
    if(!t) return '';
    t = t.replace(/,/g,''); // strip thousands separators
    const v = parseFloat(t);
    return Number.isFinite(v) ? String(v) : String(s);
  }

  function getSelectionBounds(){
    if(!selectedCells || selectedCells.size===0) return null;
    const rows = getRows();
    let rMin=Infinity,rMax=-1,cMin=Infinity,cMax=-1;
    selectedCells.forEach(td=>{
      if(!isEditableCell(td)) return;
      const tr = td.closest('tr');
      const r = rows.indexOf(tr);
      const c = cellColIndex(td);
      if(r>=0 && c>=0){
        if(r<rMin) rMin=r; if(r>rMax) rMax=r;
        if(c<cMin) cMin=c; if(c>cMax) cMax=c;
      }
    });
    return (rMin===Infinity) ? null : {rMin,rMax,cMin,cMax};
  }

  function readCellValue(td){
    const inp = td?.querySelector('input');
    return inp ? String(inp.value ?? '') : '';
  }

  function buildCopyMatrix(){
    const rows = getRows();
    if(!rows.length) return [];
    const b = getSelectionBounds();
    const mat = [];
    if(b){
      for(let r=b.rMin; r<=b.rMax; r++){
        const row=[];
        for(let c=b.cMin; c<=b.cMax; c++){
          const td = getCellByRowCol(r,c);
          row.push(readCellValue(td));
        }
        mat.push(row);
      }
    }else{
      // Copy all used rows; visible editable columns only
      const used = rows.filter(tr=>{
        const s = tr.querySelector('.station')?.value?.trim() || '';
        const e = tr.querySelector('.elevation')?.value?.trim() || '';
        const n = tr.querySelector('.nval')?.value?.trim() || '';
        return s!=='' || e!=='' || n!=='';
      });
      if(!used.length) return [];
      const colCount = editableCellsInRow(used[0]).length; // station, elevation, (n if visible)
      used.forEach(tr=>{
        const cols = editableCellsInRow(tr);
        const row=[];
        for(let i=0;i<colCount;i++) row.push(readCellValue(cols[i] || null));
        mat.push(row);
      });
    }
    return mat;
  }

  function matrixToTSV(mat){
    return mat.map(row => row.map(v => String(v ?? '')).join('\t')).join('\n');
  }

  function parseClipboard(text){
    const t = String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
    const lines = t.split('\n');
    const notTrailingEmpty = (i) => !(i===lines.length-1 && lines[i].trim()==='');
    const delim = t.indexOf('\t')>=0 ? '\t' : ',';
    return lines.filter((_,i)=>notTrailingEmpty(i)).map(line => line.split(delim));
  }

  function maybeDropHeader(mat){
    if(!mat || !mat.length) return mat;
    const first = mat[0];
    const a = first[0] ?? '', b = first[1] ?? '';
    // If the first two tokens are neither numbers nor LB/RB, treat first row as header.
    if(!looksNumber(a) && !looksStage(a) && !looksNumber(b) && !looksStage(b)){
      return mat.slice(1);
    }
    return mat;
  }

  function writeIntoCell(rowIdx, colIdx, raw){
    const td = getCellByRowCol(rowIdx, colIdx);
    if(td){
      const inp = td.querySelector('input');
      if(inp){
        inp.value = normalizeNum(raw);
      }
    }else{
      // If 'n' column is hidden (HVn OFF) and target is the 3rd editable column (index 2), write to .nval directly.
      if(colIdx === 2){
        const tr = getRows()[rowIdx];
        const nv = tr?.querySelector('input.nval');
        if(nv) nv.value = normalizeNum(raw);
      }
    }
  }

  function applyMatrixAt(startTd, mat){
    if(!startTd || !mat || !mat.length) return;

    const rowsArr = getRows();
    const rStart = rowsArr.indexOf(startTd.closest('tr'));
    const cStart = cellColIndex(startTd);
    if(rStart < 0 || cStart < 0) return;

    mat = maybeDropHeader(mat);

    for(let i=0;i<mat.length;i++){
      const targetRow = rStart + i;
      // Ensure row exists (keep one trailing blank row at least)
      while(targetRow >= getRows().length - 1){
        addRow('','','','');
      }
      const tr = getRows()[targetRow];
      let stageTag = null;

      const rowTokens = mat[i] || [];
      for(let j=0;j<rowTokens.length;j++){
        const token = rowTokens[j];
        if(token == null) continue;
        const t = String(token).trim();
        if(looksStage(t)){ stageTag = t.toUpperCase(); continue; }
        writeIntoCell(targetRow, cStart + j, t);
      }

      if(stageTag){
        const sel = tr.querySelector('.stagetag');
        if(sel){ sel.value = stageTag; enforceUniqueStageTag(sel); }
      }
    }

    ensureTrailingBlankRow();
    renumberIDs();
    clearCellSelection();
    compute();
  }

  function isXsLocked(){
    const auto = document.getElementById('designerAutoApply');
    return !!(auto && auto.checked);
  }

  // ---------- COPY ----------
  document.addEventListener('copy', (e)=>{
    if(getActiveEditingInputSafe()) return; // allow copying text inside an input normally
    if(!isGridContext()) return;
    const mat = buildCopyMatrix();
    if(!mat.length) return;
    const tsv = matrixToTSV(mat);
    try { e.clipboardData.setData('text/plain', tsv); } catch(_){}
    try { e.clipboardData.setData('text/tab-separated-values', tsv); } catch(_){}
    e.preventDefault();
  });

  // ---------- CUT ----------
  document.addEventListener('cut', (e)=>{
    if(getActiveEditingInputSafe()) return;
    if(!isGridContext()) return;
    const mat = buildCopyMatrix();
    if(!mat.length) return;
    const tsv = matrixToTSV(mat);
    try { e.clipboardData.setData('text/plain', tsv); } catch(_){}
    try { e.clipboardData.setData('text/tab-separated-values', tsv); } catch(_){}
    e.preventDefault();
    // Clear selected cells after cutting
    if(typeof clearSelectedCells === 'function') clearSelectedCells();
  });

  // ---------- PASTE ----------
  document.addEventListener('paste', (e)=>{
    if(getActiveEditingInputSafe()) return; // let browser paste into the focused input
    if(!isGridContext()) return;

    if(isXsLocked()){
      alert('Turn off “Update XS Data” in the Designer tab before pasting into the Cross‑Section table.');
      e.preventDefault();
      return;
    }

    const txt = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if(!txt) return;

    const mat = parseClipboard(txt);
    const start = (typeof singleSelectedCell === 'function' && singleSelectedCell())
               || (typeof firstSelectedCell === 'function' && firstSelectedCell())
               || getCellByRowCol(0,0);

    if(!start) return;
    e.preventDefault();
    applyMatrixAt(start, mat);
    if(typeof focusGrid === 'function') focusGrid();
  });

  // ---------- SELECT ALL (Ctrl/Cmd + A) ----------
  document.addEventListener('keydown', (e)=>{
    if(!((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='a')) return;
    if(getActiveEditingInputSafe()) return;
    if(!isGridContext()) return;
    e.preventDefault();
    if(typeof clearCellSelection === 'function') clearCellSelection();
    getRows().forEach(tr => addRowCellsToSelection(tr));
    if(typeof focusGrid === 'function') focusGrid();
  });
})();
