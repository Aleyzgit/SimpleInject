// ============================================================
//  SimpleInject — UI Logic
// ============================================================

(() => {
    'use strict';

    // --- State ---
    let processes = [];
    let selectedProcess = null;
    let dllPath = '';
    let isInjecting = false;

    // --- DOM refs ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const btnMinimize    = $('#btn-minimize');
    const btnClose       = $('#btn-close');
    const titlebar       = $('#titlebar');

    const processSearch  = $('#process-search');
    const processList    = $('#process-list');
    const processCount   = $('#process-count');
    const btnRefresh     = $('#btn-refresh');
    const selectedBar    = $('#selected-process');
    const selectedName   = $('#selected-name');
    const selectedPid    = $('#selected-pid');
    const btnClearProc   = $('#btn-clear-process');

    const btnBrowse      = $('#btn-browse');
    const dllPathDisplay = $('#dll-path-display');
    const dllPathText    = $('#dll-path-text');
    const dllInfo        = $('#dll-info');
    const dllFilename    = $('#dll-filename');
    const dllFullpath    = $('#dll-fullpath');

    const btnInject      = $('#btn-inject');
    const injectHint     = $('#inject-hint');

    const logContainer   = $('#log-container');
    const btnClearLog    = $('#btn-clear-log');
    const toastContainer = $('#toast-container');

    // ============================================================
    //  WebView2 Communication
    // ============================================================

    function sendMessage(action, data = {}) {
        window.chrome.webview.postMessage({ action, ...data });
    }

    // Listen for messages from C#
    window.chrome.webview.addEventListener('message', (event) => {
        const msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        handleBackendMessage(msg);
    });

    function handleBackendMessage(msg) {
        switch (msg.action) {
            case 'processList':
                onProcessListReceived(msg.data.processes);
                break;
            case 'dllSelected':
                onDllSelected(msg.data.path);
                break;
            case 'injectResult':
                onInjectResult(msg.data.success, msg.data.message);
                break;
            case 'error':
                showToast(msg.data.message, 'error');
                addLog(msg.data.message, 'error');
                break;
        }
    }

    // ============================================================
    //  Title Bar
    // ============================================================

    btnMinimize.addEventListener('click', () => sendMessage('minimize'));
    btnClose.addEventListener('click', () => sendMessage('close'));

    // Drag — forward mousedown on titlebar to C#
    titlebar.addEventListener('mousedown', (e) => {
        // Only drag on the titlebar itself, not on buttons
        if (e.target.closest('.titlebar-btn')) return;
        sendMessage('dragStart');
    });

    // ============================================================
    //  Process List
    // ============================================================

    function requestProcesses() {
        btnRefresh.classList.add('spinning');
        sendMessage('getProcesses');
    }

    function onProcessListReceived(list) {
        btnRefresh.classList.remove('spinning');
        processes = list || [];
        renderProcessList();
    }

    function renderProcessList(filter = '') {
        const term = filter.toLowerCase().trim();
        const filtered = term
            ? processes.filter(p =>
                p.Name.toLowerCase().includes(term) ||
                p.Id.toString().includes(term) ||
                (p.WindowTitle && p.WindowTitle.toLowerCase().includes(term))
              )
            : processes;

        processCount.textContent = filtered.length;

        if (filtered.length === 0) {
            processList.innerHTML = `
                <div class="process-placeholder">
                    <span>${processes.length === 0 ? 'No processes loaded' : 'No matching processes'}</span>
                </div>`;
            return;
        }

        // Virtual-ish rendering: only render visible + buffer
        const html = filtered.map(p => {
            const isSelected = selectedProcess && selectedProcess.Id === p.Id;
            const windowTitle = p.WindowTitle ? `<span class="process-window" title="${escapeHtml(p.WindowTitle)}">${escapeHtml(p.WindowTitle)}</span>` : '';
            const icon = p.IconBase64
                ? `<img class="process-icon" src="${p.IconBase64}" alt="" draggable="false">`
                : `<div class="process-icon process-icon-fallback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="3"/></svg></div>`;
            return `
                <div class="process-item${isSelected ? ' selected' : ''}" data-pid="${p.Id}" data-name="${escapeHtml(p.Name)}">
                    ${icon}
                    <span class="process-name">${escapeHtml(p.Name)}</span>
                    ${windowTitle}
                    <span class="process-pid">${p.Id}</span>
                </div>`;
        }).join('');

        processList.innerHTML = html;
    }

    // Search
    processSearch.addEventListener('input', (e) => {
        renderProcessList(e.target.value);
    });

    // Select process
    processList.addEventListener('click', (e) => {
        const item = e.target.closest('.process-item');
        if (!item) return;

        const pid = parseInt(item.dataset.pid);
        const name = item.dataset.name;

        selectedProcess = { Id: pid, Name: name };

        // Update UI
        selectedBar.style.display = 'flex';
        selectedName.textContent = name;
        selectedPid.textContent = `PID: ${pid}`;

        // Highlight in list
        processList.querySelectorAll('.process-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');

        updateInjectButton();
        addLog(`Selected process: ${name} (PID: ${pid})`, 'info');
    });

    // Clear selection
    btnClearProc.addEventListener('click', () => {
        selectedProcess = null;
        selectedBar.style.display = 'none';
        processList.querySelectorAll('.process-item').forEach(el => el.classList.remove('selected'));
        updateInjectButton();
    });

    // Refresh
    btnRefresh.addEventListener('click', requestProcesses);

    // ============================================================
    //  DLL Selection
    // ============================================================

    btnBrowse.addEventListener('click', () => {
        sendMessage('browseDll');
    });

    function onDllSelected(path) {
        dllPath = path;
        const filename = path.split('\\').pop().split('/').pop();

        dllPathText.textContent = filename;
        dllPathDisplay.classList.add('has-file');

        dllInfo.style.display = 'block';
        dllFilename.textContent = filename;
        dllFullpath.textContent = path;
        dllFullpath.title = path;

        updateInjectButton();
        addLog(`DLL selected: ${filename}`, 'info');
    }

    // ============================================================
    //  Injection
    // ============================================================

    btnInject.addEventListener('click', () => {
        if (!selectedProcess || !dllPath || isInjecting) return;

        isInjecting = true;
        btnInject.classList.add('loading');
        btnInject.disabled = true;
        injectHint.textContent = 'Injecting...';

        addLog(`Injecting into ${selectedProcess.Name} (PID: ${selectedProcess.Id})...`, 'info');

        sendMessage('inject', {
            pid: selectedProcess.Id,
            dllPath: dllPath
        });
    });

    function onInjectResult(success, message) {
        isInjecting = false;
        btnInject.classList.remove('loading');
        updateInjectButton();

        if (success) {
            addLog(message, 'success');
            showToast(message, 'success');
            injectHint.textContent = 'Injection successful!';
            injectHint.style.color = 'var(--success)';

            // Pulse the inject button green briefly
            btnInject.style.background = 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)';
            btnInject.style.boxShadow = '0 4px 16px rgba(34, 197, 94, 0.3)';
            setTimeout(() => {
                btnInject.style.background = '';
                btnInject.style.boxShadow = '';
                injectHint.style.color = '';
                injectHint.textContent = 'Ready to inject';
            }, 2000);
        } else {
            addLog(message, 'error');
            showToast(message, 'error');
            injectHint.textContent = 'Injection failed';
            injectHint.style.color = 'var(--error)';
            setTimeout(() => {
                injectHint.style.color = '';
                updateInjectButton();
            }, 3000);
        }
    }

    function updateInjectButton() {
        const ready = selectedProcess && dllPath && !isInjecting;
        btnInject.disabled = !ready;

        if (ready) {
            injectHint.textContent = `Ready — ${selectedProcess.Name} ← ${dllPath.split('\\').pop()}`;
        } else if (!selectedProcess && !dllPath) {
            injectHint.textContent = 'Select a process and DLL to continue';
        } else if (!selectedProcess) {
            injectHint.textContent = 'Select a target process';
        } else if (!dllPath) {
            injectHint.textContent = 'Choose a DLL file to inject';
        }
    }

    // ============================================================
    //  Log
    // ============================================================

    function addLog(message, type = 'info') {
        // Remove "empty" placeholder
        const empty = logContainer.querySelector('.log-empty');
        if (empty) empty.remove();

        const now = new Date();
        const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        entry.innerHTML = `
            <div class="log-dot"></div>
            <span class="log-time">${time}</span>
            <span class="log-message">${escapeHtml(message)}</span>
        `;

        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    btnClearLog.addEventListener('click', () => {
        logContainer.innerHTML = '<div class="log-empty">No logs yet</div>';
    });

    // ============================================================
    //  Toast
    // ============================================================

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-dot"></div>
            <span>${escapeHtml(message)}</span>
        `;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3500);
    }

    // ============================================================
    //  Utilities
    // ============================================================

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function pad(n) {
        return n.toString().padStart(2, '0');
    }

    // ============================================================
    //  Init
    // ============================================================

    // Load processes on startup
    requestProcesses();

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+I to inject
        if (e.ctrlKey && e.key === 'i') {
            e.preventDefault();
            if (!btnInject.disabled) btnInject.click();
        }
        // Ctrl+R to refresh processes
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            requestProcesses();
        }
        // Ctrl+O to browse DLL
        if (e.ctrlKey && e.key === 'o') {
            e.preventDefault();
            btnBrowse.click();
        }
        // Escape to clear search
        if (e.key === 'Escape') {
            processSearch.value = '';
            renderProcessList();
            processSearch.blur();
        }
    });

})();
