// ==UserScript==
// @name         Margonem DataScrapper
// @namespace    http://tampermonkey.net/
// @author       Ronnie Radke
// @version      4.0
// @description  Full datascrapper do testów
// @match        https://*.margonem.pl/
// @exclude      https://www.margonem.pl/
// @exclude      https://pomoc.margonem.pl/
// @exclude      https://forum.margonem.pl/
// @exclude      https://public-api.margonem.pl/
// @run-at       document-end
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    if (window.self !== window.top) return;

    const winRef = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
    const SERVER_BASE_URL = 'https://margoscrapper.onrender.com';

    let lastExtractedBattleId = null;
    let lastExtractedShopId = null;

    const style = document.createElement('style');
    style.textContent = `
        #margo-debug-window {
            position: fixed;
            width: 520px;
            height: 360px;
            min-width: 340px;
            min-height: 220px;
            background: rgba(18, 18, 18, 0.95);
            border: 2px solid #bb86fc;
            border-radius: 8px;
            color: #e0e0e0;
            font-family: Arial, sans-serif;
            z-index: 999999;
            box-shadow: 0 4px 15px rgba(0,0,0,0.7);
            display: flex;
            flex-direction: column;
            user-select: text;
            -webkit-user-select: text;
            overflow: hidden;
        }
        #margo-debug-header {
            background: #1e1e1e;
            padding: 10px 12px;
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #333;
            font-weight: bold;
            font-size: 14px;
            color: #bb86fc;
            user-select: none;
            -webkit-user-select: none;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
            gap: 8px;
        }
        .margo-header-buttons {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .margo-hdr-btn {
            background: #2d2d2d;
            border: 1px solid #444;
            color: #bb86fc;
            font-size: 11px;
            padding: 3px 7px;
            border-radius: 3px;
            cursor: pointer;
            font-weight: bold;
        }
        .margo-hdr-btn:hover {
            background: #bb86fc;
            color: #121212;
        }
        #margo-debug-open-graphs {
            border-color: #03dac6;
            color: #03dac6;
        }
        #margo-debug-open-graphs:hover {
            background: #03dac6;
            color: #121212;
        }
        #margo-debug-close {
            background: none;
            border: none;
            color: #e0e0e0;
            font-size: 16px;
            cursor: pointer;
            font-weight: bold;
        }
        #margo-debug-close:hover {
            color: #ff4444;
        }
        #margo-debug-content {
            flex: 1;
            padding: 10px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            gap: 8px;
        }
        .margo-latest-summary {
            background: #181818;
            border: 1px solid #2e2e2e;
            border-radius: 4px;
            padding: 7px 9px;
            flex-shrink: 0;
        }
        .margo-latest-title {
            font-size: 11px;
            font-weight: bold;
            color: #bb86fc;
            margin-bottom: 5px;
        }
        .margo-latest-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;
            font-size: 11px;
            font-family: monospace;
        }
        .margo-latest-list li {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            padding: 2px 4px;
            background: #212121;
            border-radius: 3px;
        }
        .margo-latest-label {
            color: #9cdcfe;
        }
        .margo-latest-val {
            color: #03dac6;
            text-align: right;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .margo-status-viewer {
            flex: 1;
            background: #1e1e1e;
            border: 1px solid #2c2c2c;
            color: #e0e0e0;
            padding: 8px;
            font-family: monospace;
            font-size: 11px;
            overflow-y: auto;
            overflow-x: auto;
            border-radius: 4px;
            user-select: text;
            -webkit-user-select: text;
            line-height: 1.4;
            white-space: pre-wrap;
        }
        #margo-tools-float-btn {
            position: fixed;
            top: 0px;
            left: 0px;
            width: 42px;
            height: 42px;
            background: linear-gradient(to bottom, #2d2d2d, #1a1a1a);
            border: 2px solid #bb86fc;
            border-radius: 6px;
            cursor: pointer;
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.5);
            transition: transform 0.1s ease, border-color 0.2s ease;
        }
        #margo-tools-float-btn:hover {
            border-color: #03dac6;
            transform: scale(1.05);
        }
        #margo-tools-float-btn .icon-inner {
            width: 24px;
            height: 24px;
            background: radial-gradient(circle, #bb86fc 0%, #3700b3 100%);
            border-radius: 50%;
        }
    `;
    document.head.appendChild(style);

    const floatBtn = document.createElement('div');
    floatBtn.id = 'margo-tools-float-btn';
    floatBtn.title = 'MargoTools - Status';

    const iconInner = document.createElement('div');
    iconInner.className = 'icon-inner';
    floatBtn.appendChild(iconInner);
    document.body.appendChild(floatBtn);

    const savedX = localStorage.getItem('margo_debug_pos_x');
    const savedY = localStorage.getItem('margo_debug_pos_y');
    const savedW = localStorage.getItem('margo_debug_width');
    const savedH = localStorage.getItem('margo_debug_height');
    const savedIsOpen = localStorage.getItem('margo_debug_is_open');

    const win = document.createElement('div');
    win.id = 'margo-debug-window';
    win.style.left = savedX !== null ? savedX + 'px' : '100px';
    win.style.top = savedY !== null ? savedY + 'px' : '100px';
    if (savedW !== null) win.style.width = savedW + 'px';
    if (savedH !== null) win.style.height = savedH + 'px';
    win.style.display = savedIsOpen === 'true' ? 'flex' : 'none';

    const headerEl = document.createElement('div');
    headerEl.id = 'margo-debug-header';

    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'MargoTools - Status';

    const headerButtons = document.createElement('div');
    headerButtons.className = 'margo-header-buttons';

    const openGraphsBtn = document.createElement('button');
    openGraphsBtn.id = 'margo-debug-open-graphs';
    openGraphsBtn.className = 'margo-hdr-btn';
    openGraphsBtn.textContent = 'Grafy';
    openGraphsBtn.title = 'Otwórz wizualizator grafów i bazę';
    openGraphsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (winRef.MargoGraphEngine && typeof winRef.MargoGraphEngine.openDialogGraph === 'function') {
            winRef.MargoGraphEngine.openDialogGraph();
        } else {
            updateStatus('Wizualizator grafów nie jest jeszcze załadowany.', true);
        }
    });

    const resetPosBtn = document.createElement('button');
    resetPosBtn.id = 'margo-debug-reset-pos';
    resetPosBtn.className = 'margo-hdr-btn';
    resetPosBtn.textContent = 'Reset poz.';
    resetPosBtn.title = 'Przywróć domyślną pozycję okna';

    const closeBtn = document.createElement('button');
    closeBtn.id = 'margo-debug-close';
    closeBtn.textContent = '×';

    headerButtons.appendChild(openGraphsBtn);
    headerButtons.appendChild(resetPosBtn);
    headerButtons.appendChild(closeBtn);
    headerEl.appendChild(headerTitle);
    headerEl.appendChild(headerButtons);
    win.appendChild(headerEl);

    const contentEl = document.createElement('div');
    contentEl.id = 'margo-debug-content';

    const summaryBox = document.createElement('div');
    summaryBox.className = 'margo-latest-summary';

    const summaryTitle = document.createElement('div');
    summaryTitle.className = 'margo-latest-title';
    summaryTitle.textContent = 'Ostatnie logi';
    summaryBox.appendChild(summaryTitle);

    const ul = document.createElement('ul');
    ul.className = 'margo-latest-list';

    const latestRowEls = {};
    const fixedRows = [
        { key: 'map', label: 'Ostatnia mapa', init: 'brak' },
        { key: 'npcs', label: 'Załadowane NPC', init: '0' },
        { key: 'gateways', label: 'Załadowane gateways', init: '0' },
        { key: 'battle', label: 'Ostatnia walka', init: 'brak' },
        { key: 'shop', label: 'Ostatni sklep', init: 'brak' },
        { key: 'dialog', label: 'Ostatni dialog', init: 'brak' },
        { key: 'quest', label: 'Ostatnie questy', init: 'brak' }
    ];

    fixedRows.forEach(r => {
        const li = document.createElement('li');
        const lSpan = document.createElement('span');
        lSpan.className = 'margo-latest-label';
        lSpan.textContent = r.label;

        const vSpan = document.createElement('span');
        vSpan.className = 'margo-latest-val';
        vSpan.textContent = r.init;
        latestRowEls[r.key] = vSpan;

        li.appendChild(lSpan);
        li.appendChild(vSpan);
        ul.appendChild(li);
    });

    summaryBox.appendChild(ul);
    contentEl.appendChild(summaryBox);

    const statusEl = document.createElement('div');
    statusEl.className = 'margo-status-viewer';
    statusEl.id = 'view-status';
    statusEl.textContent = 'Inicjalizowanie skryptu...';
    statusEl.addEventListener('mousedown', (e) => e.stopPropagation());
    statusEl.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    contentEl.appendChild(statusEl);

    win.appendChild(contentEl);
    document.body.appendChild(win);

    function setLatestEntry(key, valueText) {
        if (latestRowEls[key]) {
            latestRowEls[key].textContent = valueText;
        }
    }

    let statusLogText = 'Skrypt uruchomiony pomyślnie.';
    function updateStatus(msg, isError = false) {
        const timeStr = new Date().toLocaleTimeString();
        statusLogText = `[${timeStr}] ${msg}\n` + statusLogText;
        const el = document.getElementById('view-status');
        if (el) {
            el.style.color = isError ? '#ff4444' : '#03dac6';
            el.textContent = statusLogText;
        }
        if (isError) console.error('[MargoTools Error]:', msg);
    }

    floatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = win.style.display === 'none';
        win.style.display = isOpen ? 'flex' : 'none';
        localStorage.setItem('margo_debug_is_open', isOpen ? 'true' : 'false');
    });

    closeBtn.addEventListener('click', () => {
        win.style.display = 'none';
        localStorage.setItem('margo_debug_is_open', 'false');
    });

    resetPosBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        win.style.left = '100px';
        win.style.top = '100px';
        win.style.width = '520px';
        win.style.height = '360px';
        localStorage.removeItem('margo_debug_pos_x');
        localStorage.removeItem('margo_debug_pos_y');
        localStorage.removeItem('margo_debug_width');
        localStorage.removeItem('margo_debug_height');
    });

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    headerEl.addEventListener('mousedown', (e) => {
        if (e.target.closest('button')) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = win.offsetLeft;
        startTop = win.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        const maxLeft = window.innerWidth - 100;
        const maxTop = window.innerHeight - 50;

        if (newLeft < -win.offsetWidth + 100) newLeft = -win.offsetWidth + 100;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop < 0) newTop = 0;
        if (newTop > maxTop) newTop = maxTop;

        win.style.left = newLeft + 'px';
        win.style.top = newTop + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            localStorage.setItem('margo_debug_pos_x', parseInt(win.style.left, 10));
            localStorage.setItem('margo_debug_pos_y', parseInt(win.style.top, 10));
        }
    });

    async function sendToServer(endpoint, payload) {
        try {
            await fetch(`${SERVER_BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            updateStatus(`Wysłano poprawnie do /${endpoint}`);
        } catch (err) {
            updateStatus(`Błąd połączenia z serwerem (${endpoint}): ${err.message}`, true);
        }
    }

    const MargoTools = {
        MapExtractor: {
            lastMapId: null,
            _getEngine() {
                try { return winRef.Engine ? winRef.Engine : null; } catch (e) { return null; }
            },
            _extractCollisionsString() {
                try {
                    const engine = this._getEngine();
                    if (!engine || !engine.map) return '';
                    const colModule = engine.map.col;
                    const width = engine.map.d ? engine.map.d.x : 0;
                    const height = engine.map.d ? engine.map.d.y : 0;
                    if (!colModule || typeof colModule.check !== 'function' || !width || !height) return '';

                    const rows = [];
                    for (let t = 0; t < (width * height); t++) {
                        const cx = t % width;
                        const cy = Math.floor(t / width);
                        const checkVal = colModule.check(cx, cy);
                        const prefix = (cx === 0 && t > 0) ? '\n' : '';
                        rows.push(prefix + checkVal);
                    }
                    return rows.join('');
                } catch (e) { return ''; }
            },
            async extractWithRetry(retries = 3, delay = 400) {
                for (let i = 0; i < retries; i++) {
                    try {
                        const data = this._extractRaw();
                        if (data && data.npcs.length > 0) return data;
                    } catch (e) {}
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                return this._extractRaw();
            },
            _extractRaw() {
                const engine = this._getEngine();
                if (!engine || !engine.map || !engine.map.d || !engine.map.d.id) return null;
                const mapD = engine.map.d;
                const gm = engine.map.getGateways ? engine.map.getGateways() : null;
                const gatewaysList = (gm && typeof gm.getList === 'function') ? gm.getList() : [];
                const townNames = (gm && gm.townnames) ? gm.townnames : {};

                const gateways = gatewaysList.map(gw => {
                    const d = gw.d || {};
                    const targetId = d.key || d.id || d.mapid || 0;
                    return {
                        x: gw.rx !== undefined ? gw.rx : (d.x || 0),
                        y: gw.ry !== undefined ? gw.ry : (d.y || 0),
                        target_map_id: targetId,
                        target_map_name: townNames[targetId] || 'Nieznana',
                        gateway_key: d.key !== undefined ? d.key : 0,
                        lvl: d.lvl !== undefined ? d.lvl : 0
                    };
                });

                let npcsArray = [];
                if (engine.npcs) {
                    const rawNpcs = typeof engine.npcs.check === 'function' ? engine.npcs.check() : null;
                    if (rawNpcs) {
                        npcsArray = Array.isArray(rawNpcs) ? rawNpcs : Object.values(rawNpcs);
                    } else if (typeof engine.npcs.getList === 'function') {
                        npcsArray = engine.npcs.getList();
                    }
                }

                const npcs = npcsArray.map(npc => {
                    const data = (npc && npc.d) ? npc.d : (npc || {});
                    return {
                        npc_id: data.id || npc.id || 0,
                        nick: data.nick || npc.nick || 'Brak',
                        x: data.x !== undefined ? data.x : (npc.x !== undefined ? npc.x : 0),
                        y: data.y !== undefined ? data.y : (npc.y !== undefined ? npc.y : 0),
                        type: data.type !== undefined ? data.type : (npc.type !== undefined ? npc.type : 0),
                        lvl: data.lvl !== undefined ? data.lvl : (npc.lvl !== undefined ? npc.lvl : 0),
                        icon: data.icon || npc.icon || '',
                        actions: data.actions !== undefined ? data.actions : (npc.actions !== undefined ? npc.actions : 0),
                        tpl: data.tpl !== undefined ? data.tpl : (npc.tpl !== undefined ? npc.tpl : 0),
                        grp: data.grp !== undefined ? data.grp : (npc.grp !== undefined ? npc.grp : 0),
                        wt: data.wt !== undefined ? data.wt : (npc.wt !== undefined ? npc.wt : 0)
                    };
                }).filter(n => n.npc_id !== 0);

                return {
                    map: {
                        id: mapD.id,
                        name: mapD.name,
                        file: mapD.file,
                        bg: mapD.bg,
                        width: mapD.x,
                        height: mapD.y,
                        pvp: mapD.pvp !== undefined ? mapD.pvp : 0,
                        water: mapD.water || '',
                        params: mapD.params || {},
                        collisions: this._extractCollisionsString()
                    },
                    gateways,
                    npcs
                };
            },
            init() {
                setInterval(async () => {
                    try {
                        const engine = this._getEngine();
                        if (!engine || !engine.map || !engine.map.d || !engine.map.d.id) return;
                        const currentMapId = engine.map.d.id;
                        if (currentMapId !== this.lastMapId) {
                            this.lastMapId = currentMapId;
                            updateStatus(`Wykryto zmianę mapy na ID: ${currentMapId}`);
                            const data = await this.extractWithRetry(4, 500);
                            if (data) {
                                setLatestEntry('map', `${data.map.name || 'Mapa'} (#${data.map.id})`);
                                setLatestEntry('npcs', `${data.npcs.length}`);
                                setLatestEntry('gateways', `${data.gateways.length}`);

                                const mapId = data.map.id;
                                const mapName = data.map.name || '';

                                sendToServer('save_map', data.map);
                                sendToServer('save_gateways', {
                                    map_id: mapId,
                                    map_name: mapName,
                                    gateways: data.gateways
                                });
                                sendToServer('save_map_npcs', {
                                    map_id: mapId,
                                    map_name: mapName,
                                    npcs: data.npcs
                                });
                            }
                        }
                    } catch (e) {
                        updateStatus(`Błąd w pętli mapy: ${e.message}`, true);
                    }
                }, 500);
            }
        },
        BattleAddon: {
            init() {
                setInterval(() => {
                    try {
                        if (winRef.Engine && winRef.Engine.battle && winRef.Engine.battle.warriorsList) {
                            const warriors = winRef.Engine.battle.warriorsList;
                            const enemyKeys = Object.keys(warriors).filter(id => {
                                const w = warriors[id];
                                return w && winRef.Engine.hero && w.team !== winRef.Engine.hero.d.team;
                            });

                            if (enemyKeys.length > 0) {
                                const currentBattleSignature = enemyKeys.join('_');
                                if (currentBattleSignature !== lastExtractedBattleId) {
                                    lastExtractedBattleId = currentBattleSignature;

                                    const battleDataList = [];
                                    for (const id of enemyKeys) {
                                        const w = warriors[id];
                                        const isNpc = w.npc === 1 || Number(w.id) < 0;
                                        if (!isNpc) continue;

                                        battleDataList.push({
                                            id: w.id,
                                            originalId: w.originalId || w.id,
                                            name: w.name,
                                            lvl: w.lvl,
                                            prof: w.prof,
                                            gender: w.gender || 'x',
                                            team: w.team,
                                            wt: w.wt !== undefined ? w.wt : 0,
                                            icon: w.icon || '',
                                            hp: {
                                                max: w.hp ? w.hp.max : 0,
                                                cur: w.hp ? w.hp.cur : 0,
                                                hpp: w.hp ? w.hp.hpp : 100
                                            },
                                            stats: {
                                                ac: w.ac ? w.ac.cur : 0,
                                                act: w.act ? w.act.cur : 0,
                                                resfire: w.resfire ? w.resfire.cur : 0,
                                                resfrost: w.resfrost ? w.resfrost.cur : 0,
                                                reslight: w.reslight ? w.reslight.cur : 0
                                            }
                                        });
                                    }

                                    setLatestEntry('battle', `${battleDataList.length} NPC`);
                                    updateStatus(`Wykryto walkę! Przeciwników: ${battleDataList.length}`);
                                    sendToServer('save_battle_npcs', { enemies: battleDataList });
                                }
                            } else {
                                lastExtractedBattleId = null;
                            }
                        }
                    } catch (err) {}
                }, 500);
            }
        },
        ShopScrapper: {
            init() {
                setInterval(() => {
                    try {
                        if (winRef.Engine && winRef.Engine.shop && typeof winRef.Engine.shop.getData === 'function') {
                            const shopData = winRef.Engine.shop.getData();
                            if (shopData && shopData.id) {
                                const currentShopId = shopData.id;
                                if (currentShopId !== lastExtractedShopId) {
                                    lastExtractedShopId = currentShopId;

                                    setLatestEntry('shop', `${shopData.name || 'Sklep'} (#${currentShopId})`);
                                    updateStatus(`Wykryto otwarcie sklepu o ID: ${currentShopId}`);
                                    sendToServer('save_shop', shopData);
                                }
                            } else {
                                lastExtractedShopId = null;
                            }
                        }
                    } catch (err) {}
                }, 500);
            }
        },
        DialogScrapper: {
            currentNpcId: null,
            lastNodeId: 'root',
            lastSentSignature: '',
            activeTree: {
                npc_id: null,
                npc_name: null,
                start_node_id: 'root',
                nodes: {},
                edges: []
            },
            parsePayload(raw) {
                if (!raw || typeof raw !== 'object') return null;
                const npc = raw.npc || raw.d?.npc || {};
                const npcId = npc.id ?? raw.npcId ?? raw.id ?? null;
                if (!npcId) return null;

                const npcName = npc.nick || npc.name || `NPC ${npcId}`;
                const nodeId = String(raw.nodeId ?? raw.id ?? raw.stepId ?? this.lastNodeId ?? 'root');
                const content = String(raw.text ?? raw.content ?? raw.msg ?? '').trim();
                const type = String(raw.type ?? 'dialog');

                const rawOptions = Array.isArray(raw.options) ? raw.options : (Array.isArray(raw.answers) ? raw.answers : []);
                const options = rawOptions.map((opt, idx) => {
                    const nextId = opt.nextNodeId ?? opt.next_node_id ?? opt.targetId ?? opt.to ?? null;
                    return {
                        action_code: String(opt.action ?? opt.code ?? idx + 1),
                        label: String(opt.label ?? opt.text ?? opt.name ?? 'Opcja').trim(),
                        next_node_id: nextId !== null && nextId !== undefined ? String(nextId) : null
                    };
                });

                return {
                    npcId: String(npcId),
                    npcName,
                    nodeId,
                    type,
                    content,
                    options,
                    additional_actions: raw.additional_actions || null
                };
            },
            recordStep(parsed) {
                if (!parsed) return;

                if (this.currentNpcId !== parsed.npcId) {
                    this.currentNpcId = parsed.npcId;
                    this.activeTree = {
                        npc_id: parsed.npcId,
                        npc_name: parsed.npcName,
                        start_node_id: parsed.nodeId,
                        nodes: {},
                        edges: []
                    };
                }

                const prevNodeId = this.lastNodeId;
                this.lastNodeId = parsed.nodeId;

                this.activeTree.nodes[parsed.nodeId] = {
                    node: {
                        id: parsed.nodeId,
                        type: parsed.type,
                        content: parsed.content,
                        additional_actions: parsed.additional_actions
                    },
                    options: parsed.options
                };

                parsed.options.forEach(opt => {
                    if (opt.next_node_id) {
                        const exists = this.activeTree.edges.some(
                            e => e.from === parsed.nodeId && e.to === opt.next_node_id && e.label === opt.label
                        );
                        if (!exists) {
                            this.activeTree.edges.push({
                                from: parsed.nodeId,
                                to: opt.next_node_id,
                                label: `[${opt.action_code}] ${opt.label}`
                            });
                        }
                    }
                });

                if (prevNodeId && prevNodeId !== parsed.nodeId && this.activeTree.nodes[prevNodeId]) {
                    const linkedFromPrev = this.activeTree.edges.some(e => e.from === prevNodeId && e.to === parsed.nodeId);
                    if (!linkedFromPrev) {
                        this.activeTree.edges.push({
                            from: prevNodeId,
                            to: parsed.nodeId,
                            label: 'krok'
                        });
                    }
                }

                const sig = JSON.stringify(this.activeTree);
                if (sig === this.lastSentSignature) return;
                this.lastSentSignature = sig;

                setLatestEntry('dialog', `${parsed.npcName} (#${parsed.npcId})`);
                updateStatus(`Zaktualizowano dialog NPC: ${parsed.npcName} (węzły: ${Object.keys(this.activeTree.nodes).length})`);

                if (winRef.MargoGraphEngine && typeof winRef.MargoGraphEngine.updateData === 'function') {
                    winRef.MargoGraphEngine.updateData('dialog', {
                        [this.currentNpcId]: JSON.parse(sig)
                    });
                }

                sendToServer('save_dialog_tree', {
                    npc_key: this.currentNpcId,
                    dialog_tree: this.activeTree
                });
            },
            init() {
                const timer = setInterval(() => {
                    const dlg = winRef.Engine?.dialog;
                    if (!dlg) return;
                    clearInterval(timer);

                    const origShow = typeof dlg.show === 'function' ? dlg.show.bind(dlg) : null;
                    if (origShow) {
                        dlg.show = (...args) => {
                            const res = origShow(...args);
                            const parsed = this.parsePayload(args[0] || dlg.data || dlg);
                            if (parsed) this.recordStep(parsed);
                            return res;
                        };
                    }

                    const origUpdate = typeof dlg.update === 'function' ? dlg.update.bind(dlg) : null;
                    if (origUpdate) {
                        dlg.update = (...args) => {
                            const res = origUpdate(...args);
                            const parsed = this.parsePayload(args[0] || dlg.data || dlg);
                            if (parsed) this.recordStep(parsed);
                            return res;
                        };
                    }
                }, 500);
            }
        },
        QuestScrapper: {
            lastSentQuestsHash: '',
            extractQuestsMap() {
                const qMod = winRef.Engine?.quests;
                if (!qMod) return null;

                const rawList = typeof qMod.getList === 'function'
                    ? qMod.getList()
                    : (qMod.quests || qMod.data || null);

                if (!rawList) return null;

                const entries = Array.isArray(rawList)
                    ? rawList.map((item, idx) => [item?.id ?? idx, item])
                    : Object.entries(rawList);

                const questsOut = {};
                for (const [key, q] of entries) {
                    if (!q || typeof q !== 'object') continue;
                    const qId = String(q.id ?? key);
                    if (!qId) continue;

                    const rawStages = Array.isArray(q.stages)
                        ? q.stages
                        : (Array.isArray(q.stages?.list) ? q.stages.list : []);

                    questsOut[qId] = {
                        id: qId,
                        name: q.name || q.title || `Quest ${qId}`,
                        status: q.status || (q.done ? 'finished' : 'active'),
                        requirements: q.requirements || {},
                        stages: {
                            list: rawStages.map((st, idx) => ({
                                step: st.step ?? idx + 1,
                                description: st.description || st.desc || st.text || '',
                                missions: Array.isArray(st.missions) ? st.missions : [],
                                targets: Array.isArray(st.targets) ? st.targets : [],
                                related_items: Array.isArray(st.related_items) ? st.related_items : [],
                                ui_effects: Array.isArray(st.ui_effects) ? st.ui_effects : []
                            }))
                        }
                    };
                }

                return Object.keys(questsOut).length > 0 ? questsOut : null;
            },
            init() {
                setInterval(() => {
                    try {
                        const questsMap = this.extractQuestsMap();
                        if (!questsMap) return;

                        const serialized = JSON.stringify(questsMap);
                        if (serialized === this.lastSentQuestsHash) return;
                        this.lastSentQuestsHash = serialized;

                        const count = Object.keys(questsMap).length;
                        setLatestEntry('quest', `${count} questów`);
                        updateStatus(`Zaktualizowano listę questów (${count})`);

                        if (winRef.MargoGraphEngine && typeof winRef.MargoGraphEngine.updateData === 'function') {
                            winRef.MargoGraphEngine.updateData('quest', questsMap);
                        }

                        sendToServer('save_quests', { quests: questsMap });
                    } catch (err) {}
                }, 1000);
            }
        },
        start() {
            try {
                this.MapExtractor.init();
                this.BattleAddon.init();
                this.ShopScrapper.init();
                this.DialogScrapper.init();
                this.QuestScrapper.init();
                updateStatus('Wszystkie moduły (mapy, przejścia, NPC, walki, sklepy, dialogi, questy) zainicjowane.');
            } catch (e) {
                updateStatus(`Krytyczny błąd startu: ${e.message}`, true);
            }
        }
    };

    MargoTools.start();
})();