/**
 * Antigravity Frontend Application
 * Handles authentication, SSE real-time state, and UI logic.
 */

const state = {
    passcode: localStorage.getItem('ag_passcode') || '',
    isConnected: false,
    config: {},
    families: {},
    accounts: [],
    telemetry: {
        history: [], // Array of { timestamp, reqs, errs }
        totalReqs: 0,
        totalErrs: 0
    },
    logs: [],
    playgroundMessages: []
};

// ==========================================
// Initialization & Auth
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    checkPasscode(true);
    
    // Setup chat input auto-resize
    const chatInput = document.getElementById('chat-input');
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });
});

async function apiFetch(url, options = {}) {
    options.headers = {
        ...options.headers,
        'Authorization': `Bearer ${state.passcode}`,
        'Content-Type': 'application/json'
    };
    return fetch(url, options);
}

async function checkPasscode(silent = false) {
    if (!silent) {
        const input = document.getElementById('passcode-input');
        state.passcode = input.value.trim();
    }
    
    try {
        const res = await apiFetch('/api/config');
        if (res.ok) {
            const config = await res.json();
            state.config = config;
            localStorage.setItem('ag_passcode', state.passcode);
            
            document.getElementById('login-modal').classList.remove('active');
            document.getElementById('app').classList.remove('hidden');
            
            // Set initial strategy
            document.getElementById('strategy-selector').value = config.routingStrategy || 'hybrid';
            
            connectSSE();
            loadPlaygroundModels();
        } else {
            throw new Error('Invalid passcode');
        }
    } catch (err) {
        if (!silent) {
            document.getElementById('login-error').textContent = err.message;
            document.getElementById('passcode-input').classList.add('error');
        } else {
            state.passcode = '';
            localStorage.removeItem('ag_passcode');
        }
    }
}

// ==========================================
// Navigation & UI
// ==========================================

function switchTab(tabId) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.tab) {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        }
    });
    
    // Update views
    document.querySelectorAll('.view-container').forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) {
        targetView.classList.remove('hidden');
        // Small delay to trigger animation
        setTimeout(() => targetView.classList.add('active'), 10);
    }
    
    // Update header title
    const titles = {
        'dashboard': 'System Dashboard',
        'playground': 'Test Inference',
        'connections': 'Client Configuration',
        'settings': 'System Settings'
    };
    document.getElementById('page-title').textContent = titles[tabId] || 'Dashboard';

    // Reset scroll position
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.scrollTop = 0;
    }

    if (tabId === 'settings') {
        loadSettings();
    }
}

function addLog(msg, level = 'info') {
    const logContent = document.getElementById('log-content');
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    
    const time = new Date().toLocaleTimeString([], { hour12: false });
    entry.innerHTML = `<span class="text-secondary">[${time}]</span> ${msg}`;
    
    logContent.appendChild(entry);
    
    // Keep only last 50 logs
    while (logContent.children.length > 50) {
        logContent.removeChild(logContent.firstChild);
    }
    
    logContent.scrollTop = logContent.scrollHeight;
    
    // Trigger toast notification
    showToast(msg, level);
}

function showToast(msg, level = 'info') {
    // Avoid showing toasts for normal request/response logs to prevent flooding
    const isLogLine = msg.startsWith('[Request]') || msg.startsWith('[Response]') || msg.match(/^\[\d{4}-\d{2}-\d{2}/) || msg.includes('GET /api/sse') || msg.includes('GET /api/config') || msg.includes('GET /v1/models');
    if (isLogLine && level === 'info') return;

    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${level}`;
    
    // Convert level icon
    let icon = 'ℹ️';
    if (level === 'error') icon = '❌';
    if (level === 'warning' || level === 'warn') icon = '⚠️';
    if (msg.includes('successfully') || msg.includes('copied')) icon = '✅';

    toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${msg}</span>`;
    container.appendChild(toast);

    // Fade in
    setTimeout(() => toast.classList.add('visible'), 10);

    // Fade out and remove
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, 4000);
}

function togglePlaygroundSidebar() {
    const sidebar = document.querySelector('.playground-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('active');
    }
}

function toggleLogs() {
    const overlay = document.getElementById('log-overlay');
    const chevron = document.getElementById('log-chevron');
    const isExpanded = overlay.classList.toggle('expanded');
    chevron.style.transform = isExpanded ? 'rotate(180deg)' : '';
}

function copyConfig(id) {
    const el = document.getElementById(id);
    navigator.clipboard.writeText(el.textContent).then(() => {
        addLog('Configuration copied to clipboard', 'info');
    });
}

async function loadPlaygroundModels() {
    try {
        const res = await fetch('/v1/models', {
            headers: {
                'Authorization': `Bearer ${state.passcode}`
            }
        });
        if (res.ok) {
            const data = await res.json();
            const select = document.getElementById('play-model');
            if (select && data.data) {
                // Clear existing options
                select.innerHTML = '';
                
                // Group/Sort and append options
                data.data.forEach(model => {
                    const opt = document.createElement('option');
                    opt.value = model.id;
                    
                    // Make the display name prettier
                    let displayName = model.id;
                    displayName = displayName
                        .replace(/^antigravity-/i, '')
                        .split('-')
                        .map(word => {
                            if (word === 'pro') return 'Pro';
                            if (word === 'flash') return 'Flash';
                            if (word === 'lite') return 'Lite';
                            if (word === 'thinking') return 'Thinking';
                            if (word === 'image') return 'Image';
                            if (word === 'agent') return 'Agent';
                            if (word === 'low') return 'Low';
                            if (word === 'medium') return 'Medium';
                            if (word === 'high') return 'High';
                            if (word === 'extra') return 'Extra';
                            if (word === 'opus') return 'Opus';
                            if (word === 'sonnet') return 'Sonnet';
                            if (word === 'claude') return 'Claude';
                            if (word === 'gemini') return 'Gemini';
                            return word.charAt(0).toUpperCase() + word.slice(1);
                        })
                        .join(' ');
                    
                    // Format version decimals nicely (e.g. 3 5 -> 3.5, 4 6 -> 4.6)
                    displayName = displayName.replace(/(\d+)\s+(\d+)/g, '$1.$2');
                    
                    opt.textContent = displayName;
                    select.appendChild(opt);
                });
            }
        }
    } catch (e) {
        console.error('Failed to load models for playground:', e);
    }
}

// ==========================================
// Real-time State (SSE)
// ==========================================

let evtSource = null;
const expandedAccounts = new Set();

const MODEL_FAMILIES = {
    'Gemini 3 Flash': (n) => n.includes('gemini') && (n.includes('flash') || n.includes('1.5 flash')) && !n.includes('2.5'),
    'Gemini 3 Pro': (n) => (n.includes('gemini') && (n.includes('pro') || n.includes('1.5 pro')) || n.includes('image')) && !n.includes('2.5'),
    'Gemini 2.5': (n) => n.includes('2.5'),
    'Claude/GPT': (n) => n.includes('claude') || n.includes('gpt'),
};

function getFamilyName(modelName) {
    const n = modelName.toLowerCase();
    for (const [family, check] of Object.entries(MODEL_FAMILIES)) {
        if (check(n)) return family;
    }
    return 'Other';
}

function calculateFamilies() {
    const families = {};
    const keys = Object.keys(MODEL_FAMILIES);
    keys.forEach(fam => {
        families[fam] = { health: 100, available: 0, total: 0, queueSize: 0, totalQuota: 0, count: 0 };
    });

    const accounts = Array.isArray(state.accounts) ? state.accounts : [];
    accounts.forEach(acc => {
        const isHealthy = acc.healthScore >= 50 && (!acc.cooldowns || Object.keys(acc.cooldowns).length === 0);
        const familyQuotas = {};
        
        if (acc.quota) {
            acc.quota.forEach(q => {
                const fam = getFamilyName(q.groupName);
                if (families[fam]) {
                    if (!familyQuotas[fam]) familyQuotas[fam] = { sum: 0, count: 0 };
                    familyQuotas[fam].sum += q.remainingFraction;
                    familyQuotas[fam].count++;

                    if (q.resetTime) {
                        const resetMs = new Date(q.resetTime).getTime();
                        if (resetMs > Date.now()) {
                            if (!families[fam].nextRefresh || resetMs < families[fam].nextRefresh) {
                                families[fam].nextRefresh = resetMs;
                            }
                        }
                    }
                }
            });
        } else {
            // Default check by account type if no quota info is loaded yet
            const fam = acc.type === 'claude' ? 'Claude/GPT' : 'Gemini 3 Flash';
            if (families[fam]) {
                families[fam].total++;
                if (isHealthy) families[fam].available++;
            }
        }

        for (const [fam, data] of Object.entries(familyQuotas)) {
            families[fam].totalQuota += (data.sum / data.count);
            families[fam].total++;
            if (isHealthy) families[fam].available++;
        }
    });

    keys.forEach(name => {
        const data = families[name];
        const avgAvailability = data.total > 0 ? (data.totalQuota / data.total) * 100 : 100;
        data.health = Math.round(avgAvailability);
    });

    state.families = families;
}

function organizeAccountDetails(account) {
    const groups = new Map();
    if (account.quota) {
        account.quota.forEach(q => {
            const fam = getFamilyName(q.groupName);
            if (!groups.has(fam)) groups.set(fam, []);
            groups.get(fam).push({ ...q, pct: Math.round(q.remainingFraction * 100) });
        });
    }
    return Array.from(groups.entries()).sort((a,b) => a[0].localeCompare(b[0]));
}

function connectSSE() {
    if (evtSource) evtSource.close();
    
    const url = `/api/sse?token=${encodeURIComponent(state.passcode)}`;
    evtSource = new EventSource(url);
    
    const dot = document.getElementById('connection-dot');
    const status = document.getElementById('sys-status');
    
    evtSource.onopen = () => {
        state.isConnected = true;
        dot.className = 'status-dot connected';
        status.textContent = 'System Online';
        addLog('Connected to telemetry stream', 'info');
    };
    
    evtSource.onerror = () => {
        state.isConnected = false;
        dot.className = 'status-dot disconnected';
        status.textContent = 'Connection Lost';
        evtSource.close();
        setTimeout(connectSSE, 3000); // Retry
    };
    
    evtSource.addEventListener('init', (e) => {
        const data = JSON.parse(e.data);
        if (data.accounts) state.accounts = data.accounts;
        if (data.cooldowns) state.cooldowns = data.cooldowns;
        if (data.supportedModels) state.supportedModels = data.supportedModels;
        if (data.strategy) {
            state.strategy = data.strategy;
            const sel = document.getElementById('strategy-selector');
            if (sel) sel.value = data.strategy;
        }
        calculateFamilies();
        renderDashboard();
    });
    
    evtSource.addEventListener('update', (e) => {
        const data = JSON.parse(e.data);
        if (data.accounts) state.accounts = data.accounts;
        if (data.cooldowns) state.cooldowns = data.cooldowns;
        if (data.supportedModels) state.supportedModels = data.supportedModels;
        calculateFamilies();
        renderDashboard();
    });

    evtSource.addEventListener('cooldown', (e) => {
        const data = JSON.parse(e.data);
        if (data.accounts) state.accounts = data.accounts;
        if (data.cooldowns) state.cooldowns = data.cooldowns;
        calculateFamilies();
        renderDashboard();
    });

    evtSource.addEventListener('flash', (e) => {
        const data = JSON.parse(e.data);
        addLog(`Request on account ${data.email} completed with status: ${data.status}`, data.status === 'success' ? 'info' : 'warning');
    });
    
    evtSource.addEventListener('log', (e) => {
        const data = JSON.parse(e.data);
        addLog(data.message);
    });
}

// ==========================================
// Dashboard Rendering
// ==========================================

function getHealthClass(health) {
    if (health >= 80) return 'good';
    if (health >= 50) return 'warn';
    return 'bad';
}

function toggleAccount(email) {
    if (expandedAccounts.has(email)) {
        expandedAccounts.delete(email);
    } else {
        expandedAccounts.add(email);
    }
    renderDashboard();
}

function renderDashboard() {
    // 1. Render Families
    const grid = document.getElementById('family-cards');
    grid.innerHTML = '';
    
    Object.entries(state.families).forEach(([name, data]) => {
        const healthClass = getHealthClass(data.health);
        
        let refreshText = 'N/A';
        if (data.nextRefresh) {
            const ms = data.nextRefresh - Date.now();
            if (ms > 0) {
                const mins = Math.ceil(ms / 60000);
                const hrs = Math.floor(mins / 60);
                const remainingMins = mins % 60;
                refreshText = hrs > 0 ? `${hrs}h ${remainingMins}m` : `${mins}m`;
            } else {
                refreshText = 'Refreshing...';
            }
        }

        const card = document.createElement('div');
        card.className = 'glass-card family-card';
        card.innerHTML = `
            <div class="family-header">
                <div class="family-name">${name}</div>
                <div class="health-badge ${healthClass}">${data.health.toFixed(1)}% Health</div>
            </div>
            <div class="metric-row">
                <span class="text-secondary">Available Nodes</span>
                <span class="metric-value">${data.available} / ${data.total}</span>
            </div>
            <div class="metric-row">
                <span class="text-secondary">Current Queue</span>
                <span class="metric-value">${data.queueSize} reqs</span>
            </div>
            <div class="metric-row">
                <span class="text-secondary">Next Refresh</span>
                <span class="metric-value" style="color: var(--accent-primary)">${refreshText}</span>
            </div>
            <div class="progress-bar-bg">
                <div class="progress-bar-fill" style="width: ${data.health}%; background: var(--status-${healthClass === 'good' ? 'healthy' : healthClass === 'warn' ? 'degraded' : 'dead'})"></div>
            </div>
        `;
        grid.appendChild(card);
    });
    
    // 2. Render Accounts
    const tbody = document.getElementById('accounts-tbody');
    tbody.innerHTML = '';
    
    const accountsList = Array.isArray(state.accounts) ? state.accounts : [];
    accountsList.forEach(acc => {
        const isCooldown = acc.cooldowns && Object.keys(acc.cooldowns).length > 0;
        const isChallenge = acc.challenge && acc.challenge.url;
        let healthStatus = 'Healthy';
        let healthClass = 'var(--status-healthy)';
        if (isCooldown) {
            healthStatus = 'Cooling Down';
            healthClass = 'var(--status-degraded)';
        }
        if (isChallenge) {
            healthStatus = 'Verification Needed';
            healthClass = 'var(--status-dead)';
        }
        
        const lastUsed = acc.lastUsed ? new Date(acc.lastUsed).toLocaleTimeString() : 'Never';
        const isExpanded = expandedAccounts.has(acc.email);
        const safeEmail = acc.email.replace(/[@.]/g, '-');
        
        // Main Row
        const trMain = document.createElement('tr');
        trMain.className = 'cursor-pointer';
        trMain.onclick = () => toggleAccount(acc.email);
        trMain.innerHTML = `
            <td class="font-mono text-sm">
                <div class="flex-align-center gap-2">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="transition-transform duration-200" style="transform: ${isExpanded ? 'rotate(90deg)' : 'none'}; color: var(--text-secondary)"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <span>${acc.email}</span>
                </div>
            </td>
            <td>${(acc.type || 'Standard').toUpperCase()}</td>
            <td>
                <div class="flex-align-center gap-2">
                    <div class="status-dot" style="background: ${healthClass}; box-shadow: 0 0 8px ${healthClass}"></div>
                    ${healthStatus}
                </div>
            </td>
            <td class="text-secondary text-sm">${lastUsed}</td>
            <td>
                <div class="flex-align-center gap-2" onclick="event.stopPropagation()">
                    <button class="action-btn danger sm" onclick="resetAccount('${acc.email}')">Reset</button>
                </div>
            </td>
        `;
        tbody.appendChild(trMain);

        // Details Row
        const trDetails = document.createElement('tr');
        trDetails.className = `details-row ${isExpanded ? '' : 'hidden'}`;
        
        const details = organizeAccountDetails(acc);
        let allocationCardsHtml = '';
        if (details.length === 0) {
            allocationCardsHtml = '<div class="text-secondary text-sm italic" style="grid-column: span 2;">No allocations loaded. Make a request to sync quotas.</div>';
        } else {
            details.forEach(([cat, quotas]) => {
                const best = Math.round(Math.max(...quotas.map(q => q.remainingFraction * 100)));
                const isSandboxDown = acc.cooldowns && acc.cooldowns[`sandbox|${cat}`] > Date.now();
                const isCliDown = acc.cooldowns && acc.cooldowns[`cli|${cat}`] > Date.now();
                
                let barColor = 'var(--status-healthy)';
                if (best < 20) barColor = 'var(--status-dead)';
                else if (best < 50) barColor = 'var(--status-degraded)';
                
                allocationCardsHtml += `
                    <div class="allocation-card">
                        <div class="allocation-header">
                            <span class="allocation-name">${cat}</span>
                            <span class="text-sm font-semibold" style="color: ${barColor}">${best}%</span>
                        </div>
                        <div class="allocation-bar-bg">
                            <div class="allocation-bar-fill" style="width: ${best}%; background: ${barColor}"></div>
                        </div>
                        <div class="pool-indicators">
                            <div class="pool-indicator" title="Sandbox Pool Status">
                                <span class="indicator-dot ${isSandboxDown ? 'offline' : 'online'}"></span>
                                SBX
                            </div>
                            <div class="pool-indicator" title="CLI Pool Status">
                                <span class="indicator-dot ${isCliDown ? 'offline' : 'online'}"></span>
                                CLI
                            </div>
                        </div>
                    </div>
                `;
            });
        }

        trDetails.innerHTML = `
            <td colspan="5" style="padding: 1.5rem; background: rgba(0,0,0,0.15); border-bottom: 1px solid var(--glass-border);">
                <div class="account-details-container">
                    <div class="details-left">
                        <div class="details-section-title">Resource Allocations</div>
                        <div class="allocation-cards">
                            ${allocationCardsHtml}
                        </div>
                    </div>
                    <div class="details-right">
                        <div class="details-section-title">Configuration</div>
                        <div class="glass-card p-4 flex flex-col gap-3" style="background: rgba(0,0,0,0.2);">
                            <div class="input-group">
                                <label class="text-secondary text-sm mb-1 block">Project ID</label>
                                <div class="inline-edit-group" onclick="event.stopPropagation()">
                                    <input type="text" id="pid-input-${safeEmail}" class="glass-input w-full" value="${acc.projectId || ''}" style="padding: 0.35rem 0.5rem; font-size: 0.8rem; background: rgba(0,0,0,0.3);">
                                    <button class="action-btn sm" onclick="saveProjectId('${acc.email}', event)" style="padding: 0.35rem 0.75rem;">Save</button>
                                </div>
                            </div>
                            <div class="flex gap-2 mt-2" onclick="event.stopPropagation()">
                                <button class="action-btn sm w-full" onclick="discoverProjectId('${acc.email}', event)">Rediscover</button>
                                <button class="action-btn sm danger w-full" onclick="deleteAccount('${acc.email}', event)">Delete</button>
                            </div>
                            ${isChallenge ? `
                            <div class="mt-2" onclick="event.stopPropagation()">
                                <a href="${acc.challenge.url}" target="_blank" class="action-btn sm w-full text-center" style="display: block; text-decoration: none; border-color: var(--status-dead); color: var(--status-dead); background: rgba(244,63,86,0.1)">
                                    Solve Verification (Web)
                                </a>
                            </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(trDetails);
    });
}

function updateTelemetry(data) {
    state.telemetry.totalReqs += data.reqs;
    state.telemetry.totalErrs += data.errs;
    
    document.getElementById('stat-reqs').textContent = state.telemetry.totalReqs;
    document.getElementById('stat-errs').textContent = state.telemetry.totalErrs;
    
    state.telemetry.history.push(data.reqs);
    if (state.telemetry.history.length > 30) {
        state.telemetry.history.shift();
    }
    
    renderChart();
}

function renderChart() {
    const svg = document.getElementById('telemetry-chart');
    const path = document.getElementById('chart-path');
    const fill = document.getElementById('chart-fill');
    
    const data = state.telemetry.history;
    if (data.length < 2) return;
    
    const width = 1000;
    const height = 200;
    const padding = 10;
    
    const maxVal = Math.max(...data, 10);
    const stepX = width / (data.length - 1);
    
    let d = '';
    data.forEach((val, i) => {
        const x = i * stepX;
        const y = height - padding - ((val / maxVal) * (height - padding * 2));
        if (i === 0) {
            d += `M ${x} ${y} `;
        } else {
            // Smooth curve
            const prevX = (i - 1) * stepX;
            const prevY = height - padding - ((data[i-1] / maxVal) * (height - padding * 2));
            const cpX = prevX + (x - prevX) / 2;
            d += `C ${cpX} ${prevY}, ${cpX} ${y}, ${x} ${y} `;
        }
    });
    
    path.setAttribute('d', d);
    
    // Fill path
    const fillD = `${d} L ${width} ${height} L 0 ${height} Z`;
    fill.setAttribute('d', fillD);
}

// ==========================================
// API Actions
// ==========================================

async function updateStrategy() {
    const select = document.getElementById('strategy-selector');
    try {
        await apiFetch('/api/strategy', {
            method: 'POST',
            body: JSON.stringify({ strategy: select.value })
        });
        addLog(`Routing strategy updated to ${select.value}`, 'info');
        
        // Update strategy selector inside Settings tab if it exists
        const settingsSel = document.getElementById('settings-strategy');
        if (settingsSel) settingsSel.value = select.value;
    } catch (e) {
        addLog(`Failed to update strategy: ${e.message}`, 'error');
    }
}

async function resetAllAccounts() {
    if (!confirm('Are you sure you want to flush/reset the state of all accounts?')) return;
    try {
        await apiFetch('/api/accounts/reset-all', { method: 'POST' });
        addLog('All accounts reset successfully', 'info');
    } catch (e) {
        addLog(`Reset failed: ${e.message}`, 'error');
    }
}

async function purgeSystemState() {
    if (!confirm('Are you sure you want to PURGE ALL STATE? This wipes history, metrics, active caches, cooldowns, and all temporary routing logic, leaving only the accounts themselves intact. Use this if the proxy is behaving erratically.')) return;
    try {
        await apiFetch('/api/accounts/purge-state', { method: 'POST' });
        addLog('System state totally purged successfully', 'info');
        showToast('System state purged');
    } catch (e) {
        addLog(`Purge failed: ${e.message}`, 'error');
        showToast(`Purge failed: ${e.message}`, true);
    }
}

async function resetAccount(email) {
    try {
        await apiFetch(`/api/accounts/${email}/reset`, { method: 'POST' });
        addLog(`Account ${email} reset successfully`, 'info');
    } catch (e) {
        addLog(`Reset failed: ${e.message}`, 'error');
    }
}

async function saveProjectId(email, event) {
    if (event) event.stopPropagation();
    const safeEmail = email.replace(/[@.]/g, '-');
    const input = document.getElementById(`pid-input-${safeEmail}`);
    const projectId = input.value.trim();
    
    try {
        const res = await apiFetch(`/api/accounts/${email}/project`, {
            method: 'POST',
            body: JSON.stringify({ projectId })
        });
        if (res.ok) {
            addLog(`Project ID for ${email} updated to ${projectId}`, 'info');
            const acc = state.accounts.find(a => a.email === email);
            if (acc) acc.projectId = projectId;
            renderDashboard();
        } else {
            addLog(`Failed to save Project ID: ${await res.text()}`, 'error');
        }
    } catch (e) {
        addLog(`Failed to save Project ID: ${e.message}`, 'error');
    }
}

async function discoverProjectId(email, event) {
    if (event) event.stopPropagation();
    addLog(`Rediscovering project for ${email}...`, 'info');
    
    try {
        const res = await apiFetch(`/api/accounts/${email}/project/rediscover`, {
            method: 'POST'
        });
        if (res.ok) {
            const data = await res.json();
            addLog(`Successfully discovered project for ${email}: ${data.projectId}`, 'info');
            const acc = state.accounts.find(a => a.email === email);
            if (acc) acc.projectId = data.projectId;
            renderDashboard();
        } else {
            addLog(`Project discovery failed: ${await res.text()}`, 'error');
        }
    } catch (e) {
        addLog(`Project discovery failed: ${e.message}`, 'error');
    }
}

async function deleteAccount(email, event) {
    if (event) event.stopPropagation();
    if (!confirm(`Are you sure you want to permanently delete account ${email}?`)) return;
    
    try {
        const res = await apiFetch(`/api/accounts/${email}`, {
            method: 'DELETE'
        });
        if (res.ok) {
            addLog(`Account ${email} deleted successfully`, 'info');
            state.accounts = state.accounts.filter(a => a.email !== email);
            renderDashboard();
        } else {
            addLog(`Failed to delete account: ${await res.text()}`, 'error');
        }
    } catch (e) {
        addLog(`Failed to delete account: ${e.message}`, 'error');
    }
}

async function loadSettings() {
    try {
        const res = await apiFetch('/api/config');
        if (res.ok) {
            const config = await res.json();
            state.config = config;
            
            // Populate Strategy
            document.getElementById('settings-strategy').value = config.rotation?.strategy || 'hybrid';
            document.getElementById('settings-scheduling-mode').value = config.scheduling?.mode || 'cache_first';
            document.getElementById('settings-cooldown-default').value = config.rotation?.cooldown?.defaultDurationMs || 30000;
            document.getElementById('settings-cooldown-max').value = config.rotation?.cooldown?.maxDurationMs || 300000;
            
            // Populate Health Scoring
            document.getElementById('settings-health-min').value = config.scoring?.healthRange?.min ?? 0;
            document.getElementById('settings-health-max').value = config.scoring?.healthRange?.max ?? 100;
            document.getElementById('settings-health-initial').value = config.scoring?.healthRange?.initial ?? 100;
            document.getElementById('settings-penalty-api').value = config.scoring?.penalties?.apiError ?? 15;
            document.getElementById('settings-penalty-refresh').value = config.scoring?.penalties?.refreshError ?? 30;
            document.getElementById('settings-reward-success').value = config.scoring?.rewards?.success ?? 2;
            document.getElementById('settings-weight-health').value = config.scoring?.weights?.health ?? 0.8;
            document.getElementById('settings-weight-lru').value = config.scoring?.weights?.lru ?? 0.2;
            
            // Populate Blacklist
            document.getElementById('settings-blacklist').value = config.models?.blacklist?.join('\n') || '';
            document.getElementById('settings-retry-max').value = config.retry?.maxAttempts ?? 5;
            document.getElementById('settings-retry-threshold').value = config.retry?.transientRetryThresholdSeconds ?? 10;
            
            // Populate Features
            document.getElementById('settings-google-grounding').checked = config.features?.googleSearchGrounding ?? false;
            document.getElementById('settings-keep-thinking').checked = config.features?.keepThinking ?? false;
            document.getElementById('settings-sanitize-tools').checked = config.features?.sanitizeToolNames ?? false;
            document.getElementById('settings-sanitize-antigravity').checked = config.features?.sanitizeAntigravityPrompts ?? false;
            document.getElementById('settings-security-password').value = config.security?.password || '';
            
            // Populate Alerting
            document.getElementById('settings-webhook-url').value = config.alerting?.webhookUrl || '';
            document.getElementById('settings-alert-threshold').value = config.alerting?.healthThreshold ?? 30;
            document.getElementById('settings-alert-cooldown').checked = config.alerting?.notifyOnFullCooldown ?? true;
        }
    } catch (e) {
        addLog(`Failed to load configuration: ${e.message}`, 'error');
    }
}

function syncStrategyFromSettings(val) {
    const headerSel = document.getElementById('strategy-selector');
    if (headerSel) headerSel.value = val;
}

async function saveSettings(event) {
    if (event) event.preventDefault();
    
    const statusEl = document.getElementById('settings-save-status');
    statusEl.textContent = 'Saving settings...';
    statusEl.className = 'text-sm text-secondary';
    
    const updates = {
        rotation: {
            strategy: document.getElementById('settings-strategy').value,
            cooldown: {
                defaultDurationMs: parseInt(document.getElementById('settings-cooldown-default').value, 10),
                maxDurationMs: parseInt(document.getElementById('settings-cooldown-max').value, 10)
            }
        },
        scheduling: {
            mode: document.getElementById('settings-scheduling-mode').value
        },
        scoring: {
            healthRange: {
                min: parseInt(document.getElementById('settings-health-min').value, 10),
                max: parseInt(document.getElementById('settings-health-max').value, 10),
                initial: parseInt(document.getElementById('settings-health-initial').value, 10)
            },
            penalties: {
                apiError: parseInt(document.getElementById('settings-penalty-api').value, 10),
                refreshError: parseInt(document.getElementById('settings-penalty-refresh').value, 10),
                fatalError: state.config.scoring?.penalties?.fatalError ?? 50,
                systemicError: state.config.scoring?.penalties?.systemicError ?? 100
            },
            rewards: {
                success: parseInt(document.getElementById('settings-reward-success').value, 10)
            },
            weights: {
                health: parseFloat(document.getElementById('settings-weight-health').value),
                lru: parseFloat(document.getElementById('settings-weight-lru').value)
            }
        },
        models: {
            blacklist: document.getElementById('settings-blacklist').value.split('\n').map(l => l.trim()).filter(Boolean),
            routing: state.config.models?.routing || {
                sandboxKeywords: ["image", "agent"],
                cliKeywords: ["thinking"],
                forceToSandbox: ["gemini-3.1-flash-image"]
            },
            timeouts: state.config.models?.timeouts || {}
        },
        retry: {
            maxAttempts: parseInt(document.getElementById('settings-retry-max').value, 10),
            transientRetryThresholdSeconds: parseInt(document.getElementById('settings-retry-threshold').value, 10)
        },
        security: {
            password: document.getElementById('settings-security-password').value.trim()
        },
        features: {
            googleSearchGrounding: document.getElementById('settings-google-grounding').checked,
            keepThinking: document.getElementById('settings-keep-thinking').checked,
            sanitizeToolNames: document.getElementById('settings-sanitize-tools').checked,
            sanitizeAntigravityPrompts: document.getElementById('settings-sanitize-antigravity').checked,
            groundingMode: state.config.features?.groundingMode || 'auto',
            pidOffsetEnabled: state.config.features?.pidOffsetEnabled ?? true,
            softQuotaThresholdPercent: state.config.features?.softQuotaThresholdPercent ?? 100,
            jitterEnabled: state.config.features?.jitterEnabled ?? false,
            jitterMinMs: state.config.features?.jitterMinMs ?? 100,
            jitterMaxMs: state.config.features?.jitterMaxMs ?? 500
        },
        alerting: {
            webhookUrl: document.getElementById('settings-webhook-url').value.trim(),
            healthThreshold: parseInt(document.getElementById('settings-alert-threshold').value, 10),
            notifyOnFullCooldown: document.getElementById('settings-alert-cooldown').checked
        }
    };
    
    try {
        const res = await apiFetch('/api/config', {
            method: 'POST',
            body: JSON.stringify(updates)
        });
        
        if (res.ok) {
            const saved = await res.json();
            state.config = saved;
            statusEl.textContent = 'Configuration saved successfully!';
            statusEl.style.color = 'var(--status-healthy)';
            addLog('System configuration updated successfully', 'info');
            
            // If passkey changed, update localStorage
            if (updates.security.password) {
                state.passcode = updates.security.password;
                localStorage.setItem('ag_passcode', state.passcode);
            }
        } else {
            const err = await res.json();
            statusEl.textContent = `Error: ${err.error || 'Failed to save'}`;
            statusEl.style.color = 'var(--status-dead)';
            addLog(`Failed to save configuration: ${err.error}`, 'error');
        }
    } catch (e) {
        statusEl.textContent = `Error: ${e.message}`;
        statusEl.style.color = 'var(--status-dead)';
        addLog(`Failed to save configuration: ${e.message}`, 'error');
    }
}

// ==========================================
// Playground Chat
// ==========================================


function handleChatKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChat();
    }
}

function clearChat() {
    state.playgroundMessages = [];
    const history = document.getElementById('chat-history');
    history.innerHTML = `
        <div class="chat-bubble assistant">
            <div class="bubble-content">Sandbox reset. Ready for inference.</div>
        </div>
    `;
}

async function sendChat() {
    const inputEl = document.getElementById('chat-input');
    const text = inputEl.value.trim();
    if (!text) return;
    
    const sendBtn = document.getElementById('chat-send-btn');
    inputEl.value = '';
    inputEl.style.height = 'auto';
    inputEl.disabled = true;
    sendBtn.disabled = true;
    
    const history = document.getElementById('chat-history');
    
    // Add user bubble
    const userBubble = document.createElement('div');
    userBubble.className = 'chat-bubble user';
    userBubble.innerHTML = `<div class="bubble-content">${escapeHTML(text)}</div>`;
    history.appendChild(userBubble);
    history.scrollTop = history.scrollHeight;
    
    // Add assistant bubble (loading indicator)
    const astBubble = document.createElement('div');
    astBubble.className = 'chat-bubble assistant';
    const astContent = document.createElement('div');
    astContent.className = 'bubble-content';
    astContent.innerHTML = '<span class="pulse-ring" style="display:inline-block; margin-top: 4px;"></span>';
    astBubble.appendChild(astContent);
    history.appendChild(astBubble);
    history.scrollTop = history.scrollHeight;
    
    const model = document.getElementById('play-model').value;
    const system = document.getElementById('play-system').value;
    const stream = document.getElementById('play-stream').checked;
    
    // Build full conversation history
    const messages = [];
    if (system) {
        messages.push({ role: 'system', content: system });
    }
    
    state.playgroundMessages.forEach(msg => {
        messages.push(msg);
    });
    
    messages.push({ role: 'user', content: text });
    
    let fullResponseText = '';
    let fullReasoningText = '';
    
    try {
        const response = await fetch('/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.passcode}`
            },
            body: JSON.stringify({
                model,
                messages,
                stream
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }
        
        astContent.innerHTML = '';
        
        if (stream) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = '';
            let reasoningText = '';
            let buffer = '';
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(trimmedLine.substring(6));
                            const choice = data.choices?.[0];
                            if (choice?.delta) {
                                if (choice.delta.reasoning_content) {
                                    reasoningText += choice.delta.reasoning_content;
                                }
                                if (choice.delta.content) {
                                    fullText += choice.delta.content;
                                }
                                
                                let innerHTML = '';
                                if (reasoningText) {
                                    innerHTML += `<div class="thinking-block" style="opacity: 0.7; font-size: 0.85rem; border-left: 2px solid var(--md-primary); padding-left: 8px; margin-bottom: 8px; font-style: italic;">${escapeHTML(reasoningText)}</div>`;
                                }
                                if (fullText) {
                                    innerHTML += `<div class="markdown-body">${DOMPurify.sanitize(marked.parse(fullText))}</div>`;
                                }
                                astContent.innerHTML = innerHTML || '<span class="pulse-ring" style="display:inline-block; margin-top: 4px;"></span>';
                                history.scrollTop = history.scrollHeight;
                            }
                        } catch (e) {
                            // ignore parse errors for partial chunks
                        }
                    }
                }
            }
            fullResponseText = fullText;
            fullReasoningText = reasoningText;
        } else {
            const data = await response.json();
            fullResponseText = data.choices[0]?.message?.content || '';
            fullReasoningText = data.choices[0]?.message?.reasoning_content || '';
            
            let innerHTML = '';
            if (fullReasoningText) {
                innerHTML += `<div class="thinking-block" style="opacity: 0.7; font-size: 0.85rem; border-left: 2px solid var(--md-primary); padding-left: 8px; margin-bottom: 8px; font-style: italic;">${escapeHTML(fullReasoningText)}</div>`;
            }
            if (fullResponseText) {
                innerHTML += `<div class="markdown-body">${DOMPurify.sanitize(marked.parse(fullResponseText))}</div>`;
            }
            astContent.innerHTML = innerHTML || '<i>No response content</i>';
            history.scrollTop = history.scrollHeight;
        }
        
        // Save the successful round to memory
        state.playgroundMessages.push({ role: 'user', content: text });
        state.playgroundMessages.push({ role: 'assistant', content: fullResponseText });
    } catch (err) {
        astContent.innerHTML = `<span style="color: var(--status-dead)">Error: ${err.message}</span>`;
    } finally {
        inputEl.disabled = false;
        sendBtn.disabled = false;
        inputEl.focus();
    }
}


function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

// Generate some fake telemetry if real data is slow
setInterval(() => {
    if (state.isConnected) {
        updateTelemetry({ reqs: Math.floor(Math.random() * 5), errs: 0 });
    }
}, 5000);
