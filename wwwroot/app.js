// ============================================================
//  SimpleInject v2.0 — App Logic
// ============================================================
(() => {
    'use strict';

    // ── State ──────────────────────────────────────────────
    let processes = [];
    let selectedProcess = null;
    let selectedDll = null;
    let favorites = JSON.parse(localStorage.getItem('si_favorites') || '[]');
    let recentDlls = JSON.parse(localStorage.getItem('si_recentDlls') || '[]');
    let settings = {
        theme: localStorage.getItem('si_theme') || 'theme-amber',
        autoRefresh: localStorage.getItem('si_autoRefresh') !== 'false',
        showTitles: localStorage.getItem('si_showTitles') !== 'false',
        rememberDll: localStorage.getItem('si_rememberDll') !== 'false',
    };

    // ── Script library ─────────────────────────────────────
    const scriptLibrary = [
        { name: 'Hello World', tag: 'basic', code: 'print("Hello from SimpleInject!")' },
        { name: 'Print All Players', tag: 'players', code: 'for _, player in pairs(game.Players:GetPlayers()) do\n    print(player.Name)\nend' },
        { name: 'Workspace Info', tag: 'debug', code: 'for _, obj in pairs(workspace:GetChildren()) do\n    print(obj.ClassName .. ": " .. obj.Name)\nend' },
        { name: 'Server Time', tag: 'util', code: 'print("Server time: " .. tostring(workspace.DistributedGameTime))' },
        { name: 'Camera Info', tag: 'debug', code: 'local cam = workspace.CurrentCamera\nprint("FOV: " .. cam.FieldOfView)\nprint("Type: " .. tostring(cam.CameraType))' },
    ];

    // ── DOM Elements ───────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ── Initialization ─────────────────────────────────────
    function init() {
        applyTheme(settings.theme);
        applySettings();
        setupTabs();
        setupTitlebar();
        setupProcessList();
        setupDllSelection();
        setupInject();
        setupSettings();
        setupScriptEditor();
        setupScriptLibrary();
        setupKeyboardShortcuts();
        renderRecentDlls();

        // Restore last DLL
        if (settings.rememberDll) {
            const lastDll = localStorage.getItem('si_lastDll');
            if (lastDll) setDll(lastDll);
        }

        // Load processes
        if (settings.autoRefresh) {
            requestProcesses();
        }
    }

    // ── Theme System ───────────────────────────────────────
    function applyTheme(theme) {
        document.documentElement.className = theme;
        settings.theme = theme;
        localStorage.setItem('si_theme', theme);

        // Update active swatch
        $$('.theme-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.theme === theme);
        });
    }

    // ── Settings ───────────────────────────────────────────
    function applySettings() {
        const autoRefresh = $('#setting-autorefresh');
        const showTitles = $('#setting-showtitles');
        const rememberDll = $('#setting-rememberdll');
        if (autoRefresh) autoRefresh.checked = settings.autoRefresh;
        if (showTitles) showTitles.checked = settings.showTitles;
        if (rememberDll) rememberDll.checked = settings.rememberDll;
    }

    function saveSetting(key, value) {
        settings[key] = value;
        localStorage.setItem('si_' + key, value.toString());
    }

    function setupSettings() {
        const overlay = $('#settings-overlay');
        const btnOpen = $('#btn-settings');
        const btnClose = $('#btn-close-settings');

        btnOpen?.addEventListener('click', () => overlay.classList.add('open'));
        btnClose?.addEventListener('click', () => overlay.classList.remove('open'));
        overlay?.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('open');
        });

        // Theme swatches
        $$('.theme-swatch').forEach(swatch => {
            swatch.addEventListener('click', () => applyTheme(swatch.dataset.theme));
        });

        // Toggles
        $('#setting-autorefresh')?.addEventListener('change', (e) => saveSetting('autoRefresh', e.target.checked));
        $('#setting-showtitles')?.addEventListener('change', (e) => {
            saveSetting('showTitles', e.target.checked);
            renderProcessList();
        });
        $('#setting-rememberdll')?.addEventListener('change', (e) => saveSetting('rememberDll', e.target.checked));
    }

    // ── Tabs ───────────────────────────────────────────────
    function setupTabs() {
        $$('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                $$('.tab').forEach(t => t.classList.remove('active'));
                $$('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                const content = $(`#content-${tab.dataset.tab}`);
                if (content) content.classList.add('active');
            });
        });
    }

    // ── Titlebar ───────────────────────────────────────────
    function setupTitlebar() {
        $('#btn-minimize')?.addEventListener('click', () => sendMessage({ type: 'minimize' }));
        $('#btn-close')?.addEventListener('click', () => sendMessage({ type: 'close' }));

        $('#titlebar')?.addEventListener('mousedown', (e) => {
            if (e.target.closest('.titlebar-controls')) return;
            sendMessage({ type: 'dragWindow' });
        });
    }

    // ── Process List ───────────────────────────────────────
    function setupProcessList() {
        $('#btn-refresh')?.addEventListener('click', () => {
            const btn = $('#btn-refresh');
            btn.classList.add('spinning');
            setTimeout(() => btn.classList.remove('spinning'), 600);
            requestProcesses();
        });

        $('#process-search')?.addEventListener('input', renderProcessList);

        $('#btn-clear-process')?.addEventListener('click', () => {
            selectedProcess = null;
            $('#selected-process').style.display = 'none';
            renderProcessList();
            updateInjectButton();
        });

        $('#btn-fav-process')?.addEventListener('click', () => {
            if (!selectedProcess) return;
            const name = selectedProcess.Name;
            if (favorites.includes(name)) {
                favorites = favorites.filter(f => f !== name);
            } else {
                favorites.push(name);
            }
            localStorage.setItem('si_favorites', JSON.stringify(favorites));
            renderProcessList();
        });

        // Delegate clicks on process items
        $('#process-list')?.addEventListener('click', (e) => {
            const item = e.target.closest('.process-item');
            if (!item) return;
            const pid = parseInt(item.dataset.pid);
            const proc = processes.find(p => p.Id === pid);
            if (proc) {
                selectedProcess = proc;
                $('#selected-process').style.display = 'flex';
                $('#selected-name').textContent = proc.Name;
                $('#selected-pid').textContent = `PID: ${proc.Id}`;
                renderProcessList();
                updateInjectButton();
            }
        });
    }

    function requestProcesses() {
        sendMessage({ type: 'getProcesses' });
    }

    function renderProcessList() {
        const container = $('#process-list');
        const searchEl = $('#process-search');
        const countEl = $('#process-count');
        if (!container) return;

        const search = (searchEl?.value || '').toLowerCase();
        let filtered = processes.filter(p =>
            p.Name.toLowerCase().includes(search) ||
            (p.WindowTitle && p.WindowTitle.toLowerCase().includes(search)) ||
            p.Id.toString().includes(search)
        );

        // Sort: favorites first, then alphabetical
        filtered.sort((a, b) => {
            const aFav = favorites.includes(a.Name) ? 0 : 1;
            const bFav = favorites.includes(b.Name) ? 0 : 1;
            if (aFav !== bFav) return aFav - bFav;
            return a.Name.localeCompare(b.Name, undefined, { sensitivity: 'base' });
        });

        if (countEl) countEl.textContent = filtered.length;

        if (filtered.length === 0) {
            container.innerHTML = `<div class="process-placeholder">${processes.length === 0 ? '<div class="spinner"></div><span>Loading...</span>' : '<span>No matching processes</span>'}</div>`;
            return;
        }

        const html = filtered.map(p => {
            const isSelected = selectedProcess && selectedProcess.Id === p.Id;
            const isFav = favorites.includes(p.Name);
            const showTitle = settings.showTitles && p.WindowTitle;
            const windowTitle = showTitle ? `<span class="process-window" title="${escapeHtml(p.WindowTitle)}">${escapeHtml(p.WindowTitle)}</span>` : '';
            const icon = p.IconBase64
                ? `<img class="process-icon" src="${p.IconBase64}" alt="" draggable="false">`
                : `<div class="process-icon-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3"/></svg></div>`;
            return `<div class="process-item${isSelected ? ' selected' : ''}${isFav ? ' favorite' : ''}" data-pid="${p.Id}">
                ${icon}
                <span class="process-name">${escapeHtml(p.Name)}</span>
                ${windowTitle}
                <span class="process-pid">${p.Id}</span>
            </div>`;
        }).join('');

        container.innerHTML = html;
    }

    // ── DLL Selection ──────────────────────────────────────
    function setupDllSelection() {
        $('#btn-browse')?.addEventListener('click', () => {
            sendMessage({ type: 'browseDll' });
        });
    }

    function setDll(path) {
        selectedDll = path;
        const display = $('#dll-path-display');
        const text = $('#dll-path-text');
        const info = $('#dll-info');

        if (display) display.classList.add('has-file');
        if (text) text.textContent = path.split('\\').pop();

        if (info) {
            info.style.display = 'block';
            const filename = $('#dll-filename');
            const fullpath = $('#dll-fullpath');
            if (filename) filename.textContent = path.split('\\').pop();
            if (fullpath) fullpath.textContent = path;
        }

        // Save to recent
        addRecentDll(path);
        if (settings.rememberDll) {
            localStorage.setItem('si_lastDll', path);
        }

        updateInjectButton();
    }

    function addRecentDll(path) {
        recentDlls = recentDlls.filter(d => d !== path);
        recentDlls.unshift(path);
        if (recentDlls.length > 5) recentDlls = recentDlls.slice(0, 5);
        localStorage.setItem('si_recentDlls', JSON.stringify(recentDlls));
        renderRecentDlls();
    }

    function renderRecentDlls() {
        const container = $('#recent-dlls');
        const list = $('#recent-list');
        if (!container || !list) return;

        if (recentDlls.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        list.innerHTML = recentDlls.map(dll => {
            const name = dll.split('\\').pop();
            return `<div class="recent-item" data-path="${escapeHtml(dll)}" title="${escapeHtml(dll)}">${escapeHtml(name)}</div>`;
        }).join('');

        list.querySelectorAll('.recent-item').forEach(item => {
            item.addEventListener('click', () => setDll(item.dataset.path));
        });
    }

    // ── Inject ─────────────────────────────────────────────
    function setupInject() {
        $('#btn-inject')?.addEventListener('click', () => {
            if (!selectedProcess || !selectedDll) return;
            const btn = $('#btn-inject');
            btn.classList.add('loading');
            btn.disabled = true;

            sendMessage({
                type: 'inject',
                processId: selectedProcess.Id,
                dllPath: selectedDll
            });
        });
    }

    function updateInjectButton() {
        const btn = $('#btn-inject');
        const hint = $('#inject-hint');
        if (!btn) return;

        const ready = selectedProcess && selectedDll;
        btn.disabled = !ready;
        btn.classList.remove('loading');

        if (hint) {
            if (ready) {
                hint.textContent = `Ready to inject into ${selectedProcess.Name}`;
                hint.style.color = 'var(--accent)';
            } else if (!selectedProcess && !selectedDll) {
                hint.textContent = 'Select a process and DLL to continue';
                hint.style.color = '';
            } else if (!selectedProcess) {
                hint.textContent = 'Select a target process';
                hint.style.color = '';
            } else {
                hint.textContent = 'Choose a DLL file';
                hint.style.color = '';
            }
        }
    }

    // ── Script Editor ──────────────────────────────────────
    function setupScriptEditor() {
        const editor = $('#script-editor');
        const lineNums = $('#line-numbers');

        if (editor && lineNums) {
            const updateLines = () => {
                const lines = editor.value.split('\n').length;
                lineNums.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
                // Enable execute button if there's content
                const execBtn = $('#btn-execute');
                if (execBtn) execBtn.disabled = !editor.value.trim();
            };

            editor.addEventListener('input', updateLines);
            editor.addEventListener('scroll', () => { lineNums.scrollTop = editor.scrollTop; });

            // Tab key support
            editor.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = editor.selectionStart;
                    const end = editor.selectionEnd;
                    editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
                    editor.selectionStart = editor.selectionEnd = start + 4;
                    updateLines();
                }
            });
        }

        $('#btn-clear-script')?.addEventListener('click', () => {
            if (editor) {
                editor.value = '';
                if (lineNums) lineNums.textContent = '1';
                const execBtn = $('#btn-execute');
                if (execBtn) execBtn.disabled = true;
            }
        });

        $('#btn-execute')?.addEventListener('click', () => {
            if (!editor?.value.trim()) return;
            addScriptOutput('info', `Executing script (${editor.value.split('\n').length} lines)...`);
            sendMessage({ type: 'executeScript', script: editor.value });
        });

        // Refresh for script tab
        $('#btn-refresh-scripts')?.addEventListener('click', () => {
            checkForGameProcess();
        });

        checkForGameProcess();
    }

    function checkForGameProcess() {
        const select = $('#target-select');
        if (!select) return;

        // Check if any game processes are running
        const gameProcesses = processes.filter(p =>
            p.Name.toLowerCase().includes('roblox') ||
            p.Name.toLowerCase().includes('robloxplayer') ||
            p.Name.toLowerCase().includes('eurotrucks2') ||
            p.Name.toLowerCase().includes('hl2')
        );

        if (gameProcesses.length > 0) {
            select.innerHTML = gameProcesses.map(p => 
                `<option value="${p.Id}">${escapeHtml(p.Name)} (PID: ${p.Id})</option>`
            ).join('');
        } else {
            select.innerHTML = `<option value="">No game instance detected</option>`;
        }
    }

    function addScriptOutput(type, message) {
        const container = $('#script-output');
        if (!container) return;

        const empty = container.querySelector('.log-empty');
        if (empty) empty.remove();

        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<div class="log-dot"></div><span class="log-time">${time}</span><span class="log-message">${escapeHtml(message)}</span>`;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }

    function setupScriptLibrary() {
        const container = $('#script-library');
        if (!container) return;

        container.innerHTML = scriptLibrary.map((script, i) => `
            <div class="script-item" data-index="${i}">
                <span class="script-item-name">${script.name}</span>
                <span class="script-item-tag">${script.tag}</span>
            </div>
        `).join('');

        container.querySelectorAll('.script-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = parseInt(item.dataset.index);
                const script = scriptLibrary[idx];
                const editor = $('#script-editor');
                if (editor && script) {
                    editor.value = script.code;
                    const lineNums = $('#line-numbers');
                    if (lineNums) {
                        const lines = editor.value.split('\n').length;
                        lineNums.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
                    }
                    const execBtn = $('#btn-execute');
                    if (execBtn) execBtn.disabled = false;

                    // Switch to script tab if not already there
                    const scriptTab = $('#tab-scripts');
                    if (scriptTab && !scriptTab.classList.contains('active')) {
                        scriptTab.click();
                    }
                }
            });
        });
    }

    // ── Keyboard Shortcuts ─────────────────────────────────
    function setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+R — Refresh
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                requestProcesses();
            }
            // Escape — Close settings
            if (e.key === 'Escape') {
                $('#settings-overlay')?.classList.remove('open');
            }
            // Ctrl+, — Open settings
            if (e.ctrlKey && e.key === ',') {
                e.preventDefault();
                $('#settings-overlay')?.classList.add('open');
            }
        });
    }

    // ── Log ────────────────────────────────────────────────
    function addLog(type, message) {
        const container = $('#log-container');
        if (!container) return;

        const empty = container.querySelector('.log-empty');
        if (empty) empty.remove();

        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `<div class="log-dot"></div><span class="log-time">${time}</span><span class="log-message">${escapeHtml(message)}</span>`;
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
    }

    function setupLogClear() {
        $('#btn-clear-log')?.addEventListener('click', () => {
            const container = $('#log-container');
            if (container) container.innerHTML = '<div class="log-empty">No logs yet</div>';
        });
    }
    setupLogClear();

    // ── Toast ──────────────────────────────────────────────
    function showToast(message, type = 'info') {
        const container = $('#toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<div class="toast-dot"></div><span>${escapeHtml(message)}</span>`;
        container.appendChild(toast);

        setTimeout(() => { toast.classList.add('toast-out'); }, 3000);
        setTimeout(() => { toast.remove(); }, 3400);
    }

    // ── Message Passing ────────────────────────────────────
    function sendMessage(msg) {
        if (window.chrome?.webview) {
            window.chrome.webview.postMessage(msg);
        }
    }

    // Handle messages from C#
    if (window.chrome?.webview) {
        window.chrome.webview.addEventListener('message', (e) => {
            const msg = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
            handleMessage(msg);
        });
    }

    function handleMessage(msg) {
        switch (msg.type) {
            case 'processes':
                processes = msg.data || [];
                renderProcessList();
                checkForGameProcess();
                break;

            case 'dllSelected':
                if (msg.path) setDll(msg.path);
                break;

            case 'injectResult':
                const btn = $('#btn-inject');
                if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
                updateInjectButton();

                if (msg.success) {
                    addLog('success', msg.message);
                    showToast(msg.message, 'success');
                } else {
                    addLog('error', msg.message);
                    showToast(msg.message, 'error');
                }
                break;

            case 'scriptResult':
                if (msg.success) {
                    addScriptOutput('success', msg.message || 'Script executed successfully');
                } else {
                    addScriptOutput('error', msg.message || 'Script execution failed');
                }
                break;

            case 'error':
                addLog('error', msg.message);
                showToast(msg.message, 'error');
                break;
        }
    }

    // ── Utilities ──────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ── Start ──────────────────────────────────────────────
    init();
})();
