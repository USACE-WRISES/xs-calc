// app.scenarios.js
// Left dock: scenario manager for cross-section state (session-only).
// - Labeling: "Scenarios", header button "Add"
// - Rename uses pencil icon; delete uses "X" icon; duplicate uses overlapping-squares icon
// - Row buttons act on THAT scenario row (not just the active one)
// - Persistence: sessionStorage (clears when tab/window closes)
// - Pencil icon restored to 18px but slightly shortened so both tip and end are clearly visible.
//
// Depends on app.core.js + app.ui.js for reading/applying UI state and compute().
// (Also interacts with the Designer UI & helpers in app.ui.js.)

(function () {
  // ---------- Persistence (session only) ----------
  const SS_KEY = 'xsScenarios.session.v1';
  const STORAGE = window.sessionStorage; // clears on tab/window close

  // ---------- Styles ----------
  const CSS = `
    :root { --dockW: 252px; }
    @media (min-width: 1080px){
      main{ margin-left: calc(var(--dockW) + 24px) !important; }
      #scenarioDock{
        position: fixed; left: 20px; top: 68px; bottom: 20px; width: var(--dockW);
        overflow: auto; background: var(--card); border:1px solid var(--border);
        border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:10px;
      }
    }
    #scenarioDock .hdr{ display:flex; align-items:center; justify-content:space-between; }
    #scenarioDock .hdr h3{ margin:0; font-size:1rem; }
    #scenarioDock .hdr .btns{ display:flex; gap:8px; }
    #scenarioDock button{ padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:#fff; cursor:pointer; }
    #scenarioDock button:hover{ background:#f9f9f9; }
    #scenarioDock ul{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:6px; }
    #scenarioDock li{
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:8px 10px; border:1px solid var(--border); border-radius:10px; background:#fff; cursor:pointer;
    }
    #scenarioDock li.active{ border-color:#0b57d0; box-shadow:0 0 0 2px rgba(11,87,208,.10) inset; }
    #scenarioDock .name{ flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    #scenarioDock .rowBtns{ display:flex; gap:6px; }

    /* Icon-only tiny buttons (lighter strokes for subtle look) */
    #scenarioDock .iconTiny{
      width:28px; height:28px; padding:0; display:inline-flex; align-items:center; justify-content:center;
      border:1px solid var(--border); border-radius:8px; background:#fff; line-height:1;
      font-weight:500; color:#444; user-select:none;
    }
    #scenarioDock .iconTiny:hover{ background:#f5f7ff; }
    #scenarioDock .iconTiny svg{ width:18px; height:18px; display:block; }
    #scenarioDock .iconTiny svg *{
      fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round;
    }

    #scenarioDock .ghost{ color:#999; font-size:.92rem; }
  `;

  // ---------- Utilities ----------
  const $ = (sel) => document.querySelector(sel);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const nowISO = () => new Date().toISOString();

  // ---------- UI <-> Scenario bridges (Setup, XS, HCS, Designer) ----------
  function readSetupFromUI() {
    const val = (id) => document.getElementById(id)?.value ?? '';
    const num = (id) => { const v = parseFloat(val(id)); return Number.isFinite(v) ? v : null; };
    const bool = (id) => !!document.getElementById(id)?.checked;
    const plotMode = (document.querySelector('input[name="plotMode"]:checked') || {}).value || 'off';
    return {
      units: val('units'),
      slope: num('slope'),
      nLOB: num('nLOB'),
      nMC:  num('nMC'),
      nROB: num('nROB'),
      depth: num('depth'),
      specifyQ: bool('specifyQ'),
      discharge: num('discharge'),
      hvnOn: bool('hvnToggle'),
      N_LOB: parseInt(document.getElementById('N_LOB')?.value || '1', 10),
      N_CHAN: parseInt(document.getElementById('N_CHAN')?.value || '1', 10),
      N_ROB: parseInt(document.getElementById('N_ROB')?.value || '1', 10),
      plotMode
    };
  }
  function applySetupToUI(s) {
    if (!s) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el != null && v != null) el.value = v; };
    const setChk = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };
    setVal('units', s.units);
    setVal('slope', s.slope ?? '');
    setVal('nLOB', s.nLOB ?? '');
    setVal('nMC',  s.nMC  ?? '');
    setVal('nROB', s.nROB ?? '');
    setChk('specifyQ', !!s.specifyQ);
    if (typeof window.updateQModeUI === 'function') window.updateQModeUI(!!s.specifyQ);
    setVal('depth', s.depth ?? '');
    setVal('discharge', s.discharge ?? '');
    setChk('hvnToggle', !!s.hvnOn);
    if (typeof window.updateHVnUI === 'function') window.updateHVnUI(!!s.hvnOn);
    setVal('N_LOB', String(s.N_LOB ?? 1));
    setVal('N_CHAN', String(s.N_CHAN ?? 1));
    setVal('N_ROB', String(s.N_ROB ?? 1));
    const pm = String(s.plotMode || 'off');
    const pmRadio = document.querySelector(`input[name="plotMode"][value="${pm}"]`);
    if (pmRadio) pmRadio.checked = true;
    if (typeof window.updateSliceOptionStates === 'function') window.updateSliceOptionStates();
    if (typeof window.updateXsLockFromAutoToggle === 'function') window.updateXsLockFromAutoToggle();
  }

  function readXsFromUI() {
    const rows = (typeof window.getPointsWithStagesRaw === 'function') ? window.getPointsWithStagesRaw() : [];
    return rows.map(r => ({ x: r.x, z: r.z, tag: r.tag || '', n: Number.isFinite(r.n) ? r.n : null }));
  }
  function applyXsToUI(rows) {
    const tbody = document.querySelector('#xsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (Array.isArray(rows)) {
      rows.forEach(r => {
        const st  = Number.isFinite(+r.x) ? r.x : '';
        const el  = Number.isFinite(+r.z) ? r.z : '';
        const tag = (r.tag === 'LB' || r.tag === 'RB') ? r.tag : '';
        const nv  = Number.isFinite(+r.n) ? r.n : '';
        if (typeof window.addRow === 'function') window.addRow(st, el, tag, nv);
      });
    }
    if (typeof window.ensureTrailingBlankRow === 'function') window.ensureTrailingBlankRow();
    if (typeof window.renumberIDs === 'function') window.renumberIDs();
    if (typeof window.clearCellSelection === 'function') window.clearCellSelection();
  }

  // ---- HCS: FIX — use real globals (not window.*) ----
  function readHcsFromUI() {
    // The following are declared as top-level `let` in app.ui.js (not window props). :contentReference[oaicite:2]{index=2}
    const ia = (typeof ineffectiveAreas !== 'undefined' && Array.isArray(ineffectiveAreas)) ? clone(ineffectiveAreas) : [];
    const obs = (typeof obstructions     !== 'undefined' && Array.isArray(obstructions))     ? clone(obstructions)     : [];
    const lev = (typeof levees           !== 'undefined' && levees)                          ? clone(levees)           : { left:{enabled:false}, right:{enabled:false} };
    return { ineffectiveAreas: ia, obstructions: obs, levees: lev };
  }
  function applyHcsToUI(hcs) {
    if (!hcs) return;
    // Assign back to the real variables that app.ui.js uses and renders. :contentReference[oaicite:3]{index=3}
    if ('ineffectiveAreas' in hcs) { try { ineffectiveAreas = clone(hcs.ineffectiveAreas || []); } catch(_){} }
    if ('obstructions'     in hcs) { try { obstructions     = clone(hcs.obstructions     || []); } catch(_){} }
    if ('levees'           in hcs) { try { levees           = clone(hcs.levees           || { left:{enabled:false}, right:{enabled:false} }); } catch(_){} }
    if (typeof window.renderIFATable === 'function') window.renderIFATable();
    if (typeof window.renderObsTable === 'function') window.renderObsTable();
    if (typeof window.renderLevTable === 'function') window.renderLevTable();
  }

  // ---- Designer <-> Scenario bridge ----
  // Uses the exact ids present in index.html under the "Designer" tab. :contentReference[oaicite:4]{index=4}
  function readDesignerFromUI() {
    const val = (id) => document.getElementById(id)?.value ?? '';
    const num = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const v = parseFloat(el.value);
      return Number.isFinite(v) ? v : null;
    };
    const bool = (id) => !!document.getElementById(id)?.checked;

    return {
      mergeMode: (document.getElementById('des-mergeMode')?.value || 'replace'),
      autoApply: bool('designerAutoApply'),
      numStages: parseInt(val('des-numStages') || '1', 10),

      stage1: {
        Width:            num('des-s1-Width'),
        Depth:            num('des-s1-Depth'),
        mbanks:           num('des-s1-mbanks'),
        ybed:             num('des-s1-ybed'),
        thalweg_shift:    num('des-s1-thalweg_shift'),
        Mtieout_L:        num('des-s1-Mtieout_L'),
        Mtieout_R:        num('des-s1-Mtieout_R'),
        Roundness:        num('des-s1-Roundness')
      },

      stage2: {
        D2stg:            num('des-s2-D2stg'),
        Mbanks_2stg:      num('des-s2-Mbanks_2stg'),
        Wbench_L:         num('des-s2-Wbench_L'),
        Wbench_R:         num('des-s2-Wbench_R'),
        Ybench_L:         num('des-s2-Ybench_L'),
        Ybench_R:         num('des-s2-Ybench_R'),
        Mtieout_2stg_L:   num('des-s2-Mtieout_2stg_L'),
        Mtieout_2stg_R:   num('des-s2-Mtieout_2stg_R')
      },

      stage3: {
        D3stg:            num('des-s3-D3stg'),
        Mbanks_3stg:      num('des-s3-Mbanks_3stg'),
        W3rdstage_L:      num('des-s3-W3rdstage_L'),
        W3rdstage_R:      num('des-s3-W3rdstage_R'),
        y3rdStage_L:      num('des-s3-y3rdStage_L'),
        y3rdStage_R:      num('des-s3-y3rdStage_R'),
        Mtieout_3stg_L:   num('des-s3-Mtieout_3stg_L'),
        Mtieout_3stg_R:   num('des-s3-Mtieout_3stg_R')
      },

      advanced: {
        Left_BKF_Height_Multiplier:          num('des-adv-Left_BKF_Height_Multiplier'),
        Right_BKF_Height_Multiplier:         num('des-adv-Right_BKF_Height_Multiplier'),
        Left_Mbanks_BKF_Multiplier:          num('des-adv-Left_Mbanks_BKF_Multiplier'),
        Right_Mbanks_BKF_Multiplier:         num('des-adv-Right_Mbanks_BKF_Multiplier'),
        Left_BKF_Bottom_Slope_Multiplier:    num('des-adv-Left_BKF_Bottom_Slope_Multiplier'),
        Right_BKF_Bottom_Slope_Multiplier:   num('des-adv-Right_BKF_Bottom_Slope_Multiplier'),
        X_datum:                              num('des-adv-X_datum'),
        Y_datum:                              num('des-adv-Y_datum')
      },

      // Optional (not always present in current HTML; read safely)
      isInnerBerm: !!document.getElementById('des-isInnerBerm')?.checked,
      innerBerm: {
        WIB:    num('des-ib-WIB'),
        DmaxIB: num('des-ib-DmaxIB')
      }
    };
  }

  function applyDesignerToUI(d) {
    if (!d) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el != null && v != null) el.value = v; };
    const setValNum = (id, v) => { const el = document.getElementById(id); if (el) el.value = (v == null ? '' : v); };
    const setChk = (id, on) => { const el = document.getElementById(id); if (el) el.checked = !!on; };

    // High-level
    setVal('des-numStages', String(d.numStages || 1));

    // Stage 1
    setValNum('des-s1-Width', d.stage1?.Width);
    setValNum('des-s1-Depth', d.stage1?.Depth);
    setValNum('des-s1-mbanks', d.stage1?.mbanks);
    setValNum('des-s1-ybed', d.stage1?.ybed);
    setValNum('des-s1-thalweg_shift', d.stage1?.thalweg_shift);
    setValNum('des-s1-Mtieout_L', d.stage1?.Mtieout_L);
    setValNum('des-s1-Mtieout_R', d.stage1?.Mtieout_R);
    setValNum('des-s1-Roundness', d.stage1?.Roundness);

    // Stage 2
    setValNum('des-s2-D2stg', d.stage2?.D2stg);
    setValNum('des-s2-Mbanks_2stg', d.stage2?.Mbanks_2stg);
    setValNum('des-s2-Wbench_L', d.stage2?.Wbench_L);
    setValNum('des-s2-Wbench_R', d.stage2?.Wbench_R);
    setValNum('des-s2-Ybench_L', d.stage2?.Ybench_L);
    setValNum('des-s2-Ybench_R', d.stage2?.Ybench_R);
    setValNum('des-s2-Mtieout_2stg_L', d.stage2?.Mtieout_2stg_L);
    setValNum('des-s2-Mtieout_2stg_R', d.stage2?.Mtieout_2stg_R);

    // Stage 3
    setValNum('des-s3-D3stg', d.stage3?.D3stg);
    setValNum('des-s3-Mbanks_3stg', d.stage3?.Mbanks_3stg);
    setValNum('des-s3-W3rdstage_L', d.stage3?.W3rdstage_L);
    setValNum('des-s3-W3rdstage_R', d.stage3?.W3rdstage_R);
    setValNum('des-s3-y3rdStage_L', d.stage3?.y3rdStage_L);
    setValNum('des-s3-y3rdStage_R', d.stage3?.y3rdStage_R);
    setValNum('des-s3-Mtieout_3stg_L', d.stage3?.Mtieout_3stg_L);
    setValNum('des-s3-Mtieout_3stg_R', d.stage3?.Mtieout_3stg_R);

    // Advanced
    setValNum('des-adv-Left_BKF_Height_Multiplier', d.advanced?.Left_BKF_Height_Multiplier);
    setValNum('des-adv-Right_BKF_Height_Multiplier', d.advanced?.Right_BKF_Height_Multiplier);
    setValNum('des-adv-Left_Mbanks_BKF_Multiplier', d.advanced?.Left_Mbanks_BKF_Multiplier);
    setValNum('des-adv-Right_Mbanks_BKF_Multiplier', d.advanced?.Right_Mbanks_BKF_Multiplier);
    setValNum('des-adv-Left_BKF_Bottom_Slope_Multiplier', d.advanced?.Left_BKF_Bottom_Slope_Multiplier);
    setValNum('des-adv-Right_BKF_Bottom_Slope_Multiplier', d.advanced?.Right_BKF_Bottom_Slope_Multiplier);
    setValNum('des-adv-X_datum', d.advanced?.X_datum);
    setValNum('des-adv-Y_datum', d.advanced?.Y_datum);

    // Optional Inner Berm (only if these exist in DOM)
    if (document.getElementById('des-isInnerBerm')) setChk('des-isInnerBerm', !!d.isInnerBerm);
    if (document.getElementById('des-ib-WIB'))     setValNum('des-ib-WIB', d.innerBerm?.WIB);
    if (document.getElementById('des-ib-DmaxIB'))  setValNum('des-ib-DmaxIB', d.innerBerm?.DmaxIB);

    // Merge/Replace UI + hidden value (keep UI and runtime mode in sync)
    const mode = (d.mergeMode === 'merge') ? 'merge' : 'replace';
    const rReplace = document.getElementById('mergeReplace');
    const rMerge   = document.getElementById('mergeMerge');
    const hidden   = document.getElementById('des-mergeMode');
    if (hidden) hidden.value = mode;
    if (rReplace && rMerge) {
      rReplace.checked = (mode === 'replace');
      rMerge.checked   = (mode === 'merge');
    }
    // Keep Designer runtime in sync for preview without firing change handlers
    if (typeof window !== 'undefined') {
      window.__designerMergeMode = mode; // used by preview overlay
    }

    // Auto-apply: set the checkbox without firing change (we don’t want to re-write XS on scenario switch)
    setChk('designerAutoApply', !!d.autoApply);
    if (typeof window.updateXsLockFromAutoToggle === 'function') window.updateXsLockFromAutoToggle();

    // Let the Designer panel update enabled/disabled states & preview:
    if (typeof window.refreshDesignPreview === 'function') window.refreshDesignPreview();
  }

  function captureScenarioFromUI(scen) {
    return {
      id: scen?.id || crypto.randomUUID(),
      name: scen?.name || 'Scenario',
      setup: readSetupFromUI(),
      xs: readXsFromUI(),
      hcs: readHcsFromUI(),     // <-- fixed to capture real HCS data
      designer: readDesignerFromUI(),
      updatedAt: nowISO()
    };
  }
  function applyScenarioToUI(scen) {
    if (!scen) return;
    applySetupToUI(scen.setup);
    // Designer first so auto-apply doesn’t clobber XS on switch
    applyDesignerToUI(scen.designer);
    applyHcsToUI(scen.hcs);    // <-- fixed to apply to real HCS vars + re-render
    applyXsToUI(scen.xs);
    if (typeof window.compute === 'function') window.compute();
  }

  // ---------- Store (in-memory + sessionStorage) ----------
  const Store = {
    scenarios: [],
    activeId: null,

    load() {
      try {
        const json = STORAGE.getItem(SS_KEY);
        if (!json) return false;
        const data = JSON.parse(json);
        if (!data || !Array.isArray(data.scenarios) || !data.scenarios.length) return false;
        this.scenarios = data.scenarios;
        this.activeId = data.activeId || this.scenarios[0].id;
        return true;
      } catch {
        return false;
      }
    },
    save() {
      try { STORAGE.setItem(SS_KEY, JSON.stringify({ scenarios: this.scenarios, activeId: this.activeId })); }
      catch { /* ignore */ }
    },
    active() { return this.scenarios.find(s => s.id === this.activeId) || null; },
    setActive(id) { this.activeId = id; this.save(); renderDock(); },

    upsert(s) {
      const i = this.scenarios.findIndex(x => x.id === s.id);
      if (i >= 0) this.scenarios[i] = s; else this.scenarios.push(s);
      this.save();
    },
    addLikeCurrent() {
      const base = this.active() || this.scenarios[0] || null;
      const snap = captureScenarioFromUI(base);
      snap.id = crypto.randomUUID();
      snap.name = nextScenarioName();
      this.scenarios.push(snap);
      this.activeId = snap.id;
      this.save();
      renderDock();
      applyScenarioToUI(snap);
    },
    removeById(id) {
      const idx = this.scenarios.findIndex(s => s.id === id);
      if (idx < 0) return;
      const wasActive = (this.activeId === id);
      this.scenarios.splice(idx, 1);

      if (!this.scenarios.length) {
        // Keep at least one
        const fresh = captureScenarioFromUI({ name:'Scenario 1' });
        this.scenarios.push(fresh);
        this.activeId = fresh.id;
        applyScenarioToUI(fresh);
      } else if (wasActive) {
        const next = this.scenarios[Math.max(0, idx - 1)];
        this.activeId = next.id;
        applyScenarioToUI(next);
      }
      this.save();
      renderDock();
    },
    rename(id, newName) {
      const s = this.scenarios.find(it => it.id === id);
      if (s) { s.name = String(newName || '').trim() || s.name; this.save(); renderDock(); }
    },
    duplicateFromId(id) {
      const src = this.scenarios.find(it => it.id === id);
      if (!src) return;

      // If duplicating the *active* one, capture latest UI first so we copy fresh state
      if (this.activeId === id) {
        const snapActive = captureScenarioFromUI(src);
        this.upsert(snapActive);
      }

      const copy = clone(src);
      copy.id = crypto.randomUUID();
      copy.name = nextScenarioName();
      copy.updatedAt = nowISO();

      this.scenarios.push(copy);
      this.activeId = copy.id;
      this.save();
      renderDock();
      applyScenarioToUI(copy);
    }
  };

  function nextScenarioName() {
    const base = 'Scenario ';
    let n = Store.scenarios.length + 1;
    const names = new Set(Store.scenarios.map(s => s.name));
    while (names.has(base + n)) n++;
    return base + n;
  }

  // ---------- Icons ----------
  function pencilSvg() {
    // 18px box, slightly shortened so tip & eraser remain visible.
    const el = document.createElement('span');
    el.innerHTML = `
      <svg class="ico-pencil" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
        <g transform="translate(12,12) scale(0.88) translate(-12,-12)">
          <path d="M3 17.5V21h3.5L19.5 8c.8-.8.8-2.1 0-2.9l-.6-.6c-.8-.8-2.1-.8-2.9 0L3 17.5Z"></path>
          <path d="M14.5 5.5l4 4"></path>
        </g>
      </svg>`;
    return el.firstElementChild;
  }
  function duplicateSvg(){
    // Two overlapping rounded squares
    const el = document.createElement('span');
    el.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
        <rect x="5" y="5" width="10" height="10" rx="2" ry="2"></rect>
        <rect x="9" y="9" width="10" height="10" rx="2" ry="2"></rect>
      </svg>`;
    return el.firstElementChild;
  }
  function xSvg() {
    const el = document.createElement('span');
    el.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
        <line x1="6" y1="6" x2="18" y2="18"></line>
        <line x1="18" y1="6" x2="6" y2="18"></line>
      </svg>`;
    return el.firstElementChild;
  }

  // ---------- Dock UI ----------
  function renderDock() {
    const list = document.getElementById('scenarioList');
    if (!list) return;
    list.innerHTML = '';
    if (!Store.scenarios.length) return;

    for (const s of Store.scenarios) {
      const li = document.createElement('li');
      li.dataset.id = s.id;
      if (s.id === Store.activeId) li.classList.add('active');

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = s.name;

      const btns = document.createElement('div');
      btns.className = 'rowBtns';

      const btnRen = document.createElement('button');
      btnRen.className = 'iconTiny';
      btnRen.title = 'Rename scenario';
      btnRen.setAttribute('aria-label', 'Rename scenario');
      btnRen.appendChild(pencilSvg());

      const btnDup = document.createElement('button');
      btnDup.className = 'iconTiny';
      btnDup.title = 'Duplicate scenario';
      btnDup.setAttribute('aria-label', 'Duplicate scenario');
      btnDup.appendChild(duplicateSvg());

      const btnDel = document.createElement('button');
      btnDel.className = 'iconTiny';
      btnDel.title = 'Delete scenario';
      btnDel.setAttribute('aria-label', 'Delete scenario');
      btnDel.appendChild(xSvg());

      // Order: Edit (pencil), Duplicate, Delete (X)
      btns.appendChild(btnRen);
      btns.appendChild(btnDup);
      btns.appendChild(btnDel);

      li.appendChild(name);
      li.appendChild(btns);
      list.appendChild(li);

      // Rename (dblclick on name or click pencil)
      function doRename() {
        const nn = prompt('Rename scenario', s.name);
        if (nn != null) Store.rename(s.id, nn);
      }
      name.addEventListener('dblclick', doRename);
      btnRen.addEventListener('click', (e) => { e.stopPropagation(); doRename(); });

      // Duplicate THIS scenario row
      btnDup.addEventListener('click', (e) => {
        e.stopPropagation();
        Store.duplicateFromId(s.id);
      });

      // Delete THIS scenario row
      btnDel.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${s.name}"?`)) Store.removeById(s.id);
      });

      // Activate on row click (not on inner buttons)
      li.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        if (s.id === Store.activeId) return;
        if (Store.activeId) {
          const snap = captureScenarioFromUI(Store.active());
          Store.upsert(snap);
        }
        Store.setActive(s.id);
        applyScenarioToUI(Store.active());
      });
    }
  }

  function ensureDock() {
    if (document.getElementById('scenarioDock')) return;
    // Style
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    // Dock
    const dock = document.createElement('aside');
    dock.id = 'scenarioDock';
    dock.innerHTML = `
      <div class="hdr">
        <h3>Scenarios</h3>
        <div class="btns">
          <button id="scenarioAdd">Add</button>
        </div>
      </div>
      <ul id="scenarioList" role="listbox" aria-label="Scenarios"></ul>
      <div class="ghost">Changes are auto‑saved to each scenario.</div>
    `;
    document.body.appendChild(dock);

    document.getElementById('scenarioAdd').addEventListener('click', () => Store.addLikeCurrent());
  }

  // ---------- Autosave (debounced) ----------
  let saveTimer = null;
  function debouncedAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!Store.activeId) return;
      const snap = captureScenarioFromUI(Store.active());
      Store.upsert(snap);
    }, 200);
  }
  function wrapComputeForAutosave() {
    const orig = window.compute;
    if (typeof orig === 'function') {
      window.compute = function () {
        const r = orig.apply(this, arguments);
        debouncedAutosave();
        return r;
      };
    }
  }

  // ---------- Boot ----------
  function initScenarios() {
    ensureDock();

    // Always reset any stored scenarios so a page refresh starts clean
    try { STORAGE.removeItem(SS_KEY); } catch (_) { /* ignore */ }

    // Load from session or seed from current UI as "Scenario 1"
    if (!Store.load()) {
      const first = captureScenarioFromUI({ name: 'Scenario 1' });
      Store.scenarios = [first];
      Store.activeId = first.id;
      Store.save();
    }
    renderDock();
    applyScenarioToUI(Store.active());

    // Persist active scenario after each compute() run
    wrapComputeForAutosave();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScenarios);
  } else {
    initScenarios();
  }

  // Optional debug
  window.__Scenarios = Store;
})();
