// ==UserScript==
// @name         Margonem DataScrapper
// @namespace    http://tampermonkey.net/
// @author       Ronnie Radke
// @version      4.1
// @description  Full Scrapper
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

    async function sendToServer(endpoint, payload, silentStatus = false) {
        try {
            const res = await fetch(`${SERVER_BASE_URL}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            if (!silentStatus) {
                updateStatus(`Wysłano poprawnie do /${endpoint}`);
            }
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
            STORAGE_KEY: 'margo_dialog_trees_v1',
            dialogTrees: {},
            npcSessionState: {},

            sanitizeTree(tree) {
                if (!tree || typeof tree !== 'object') return tree;
                delete tree.edges;
                if (tree.nodes && typeof tree.nodes === 'object') {
                    Object.values(tree.nodes).forEach(entry => {
                        if (entry && typeof entry === 'object') {
                            delete entry.outgoing_connections;
                            if (entry.node) delete entry.node._manualPos;
                        }
                    });
                }
                return tree;
            },
            loadState() {
                try {
                    this.dialogTrees = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '{}');
                    Object.keys(this.dialogTrees).forEach(npcId => this.sanitizeTree(this.dialogTrees[npcId]));
                } catch (e) {
                    this.dialogTrees = {};
                }
            },
            saveState() {
                try {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.dialogTrees));
                    if (winRef.MargoGraphEngine && typeof winRef.MargoGraphEngine.updateData === 'function') {
                        winRef.MargoGraphEngine.updateData('dialog', this.dialogTrees);
                    }
                } catch (e) {}
            },
            parseTalkQuery(query) {
                if (!query || typeof query !== 'string') return { npcId: null, actionCode: null };
                const idMatch = query.match(/[?&]id=([^&]+)/);
                const cMatch = query.match(/[?&]c=([^&]+)/);
                return {
                    npcId: idMatch ? String(decodeURIComponent(idMatch[1])).trim() : null,
                    actionCode: cMatch ? String(decodeURIComponent(cMatch[1])).trim() : null
                };
            },
            cleanText(text, heroNick) {
                const str = String(text ?? '');
                if (!heroNick) return str;
                return str.replaceAll(heroNick, '[NICK_POSTACI]');
            },
            detectNodeType(text, options) {
                const joined = `${text || ''} ${(options || []).map(o => o.label).join(' ')}`.toLowerCase();
                if (joined.includes('sklep') || joined.includes('kup') || joined.includes('handl')) return 'shop';
                if (joined.includes('przen') || joined.includes('teleport') || joined.includes('udaj się')) return 'teleportation';
                if (joined.includes('wylecz') || joined.includes('ulecz') || joined.includes('odpocz')) return 'hotel';
                return 'special';
            },
            extractDialogPayload(query, response, heroNick) {
                if (!response || !response.d) return null;
                if (!query || !String(query).includes('talk')) return null;

                const d = response.d;
                const parsedQuery = this.parseTalkQuery(query);
                const npcId = String(d[2] || parsedQuery.npcId || '').trim();
                const npcName = String(d[1] || '').trim();
                const npcText = this.cleanText(d[4] ?? '', heroNick).trim();

                const rawItems = [];
                for (let i = 7; i < d.length; i++) {
                    if (d[i] !== undefined) rawItems.push(d[i]);
                }

                const filtered = rawItems.filter(item => !/^[1-9]$/.test(String(item).trim()));
                const options = [];
                for (let j = 0; j < filtered.length; j += 2) {
                    const first = filtered[j];
                    const second = filtered[j + 1];
                    if (first !== undefined && second !== undefined) {
                        const firstStr = String(first);
                        const secondStr = String(second);
                        const isFirstText = firstStr.length > 5 || firstStr.includes(' ');
                        const optionText = this.cleanText(isFirstText ? firstStr : secondStr, heroNick).trim();
                        const actionCode = (isFirstText ? secondStr : firstStr).trim();

                        options.push({
                            label: optionText,
                            action_code: actionCode,
                            next_node_id: null,
                            additional_action: null,
                            additional_actions: {},
                            cooldown: 0,
                            rules: {}
                        });
                    }
                }

                return {
                    query: String(query),
                    queryActionCode: parsedQuery.actionCode,
                    npcId,
                    npcName,
                    npcText,
                    options
                };
            },
            ensureNpcTree(npcId, npcName) {
                const key = String(npcId);
                if (!this.dialogTrees[key]) {
                    this.dialogTrees[key] = {
                        npc_id: key,
                        npc_name: npcName || `NPC ${key}`,
                        start_node_id: 'root',
                        nodes: {}
                    };
                } else {
                    if (npcName) this.dialogTrees[key].npc_name = npcName;
                    if (!this.dialogTrees[key].nodes) this.dialogTrees[key].nodes = {};
                }
                return this.dialogTrees[key];
            },
            ensureNpcSession(npcId) {
                const key = String(npcId);
                if (!this.npcSessionState[key]) {
                    this.npcSessionState[key] = {
                        currentNodeId: 'root',
                        pendingActionCode: null
                    };
                }
                return this.npcSessionState[key];
            },
            createNodeSchema(nodeId, content, options, additionalActions = {}) {
                return {
                    node: {
                        id: nodeId,
                        type: this.detectNodeType(content, options),
                        content: content || '',
                        action_data: {
                            focus: {
                                type: 'npc',
                                npcId: null,
                                locationId: null,
                                mapId: null,
                                x: null,
                                y: null
                            },
                            minigame: {
                                type: 'random',
                                difficulty: 1
                            }
                        },
                        additional_actions: additionalActions || {}
                    },
                    options: (options || []).map(opt => ({
                        label: opt.label,
                        action_code: opt.action_code,
                        next_node_id: null,
                        additional_action: null,
                        additional_actions: {},
                        cooldown: 0,
                        rules: {}
                    }))
                };
            },
            extractAdditionalActions(response) {
                const additional = {};
                if (!response || typeof response !== 'object') return additional;

                const questIdFromTracking = response.tracking?.questId !== undefined ? response.tracking.questId : null;
                const questIdFromQuestsData = Array.isArray(response.questsData?.quests?.list) && response.questsData.quests.list[0]?.id !== undefined
                    ? response.questsData.quests.list[0].id
                    : null;
                const resolvedQuestId = questIdFromTracking ?? questIdFromQuestsData;

                if (response.item && typeof response.item === 'object') {
                    const itemsByTpl = new Map();
                    Object.values(response.item).forEach(it => {
                        if (!it || typeof it !== 'object') return;
                        const tpl = it.tpl ?? null;
                        const key = tpl !== null ? `tpl_${tpl}` : `id_${it.id ?? Math.random()}`;
                        const statStr = String(it.stat || '');
                        const questMatch = statStr.match(/quest=([^;]+)/);
                        const questIdsFromStat = questMatch
                            ? questMatch[1].split(',').map(v => Number(v.trim())).filter(v => !Number.isNaN(v))
                            : [];

                        if (!itemsByTpl.has(key)) {
                            itemsByTpl.set(key, {
                                tpl,
                                name: it.name || 'Nieznany przedmiot',
                                icon: it.icon || '',
                                amount: 1,
                                quest_ids: questIdsFromStat
                            });
                        } else {
                            itemsByTpl.get(key).amount += 1;
                        }
                    });

                    const itemsList = Array.from(itemsByTpl.values());
                    if (itemsList.length > 0) {
                        const statQuestIds = itemsList.flatMap(i => i.quest_ids || []);
                        const itemQuestId = resolvedQuestId ?? (statQuestIds.length > 0 ? statQuestIds[0] : null);
                        additional.give_items = {
                            quest_id: itemQuestId,
                            linked_sraj_ids: [],
                            items: itemsList
                        };
                    }
                }

                const srajList = Array.isArray(response.sraj) ? response.sraj : [];
                const tplList = Array.isArray(response.sraj_tpl) ? response.sraj_tpl : [];
                if (srajList.length > 0 || tplList.length > 0) {
                    const tplById = new Map();
                    tplList.forEach(t => {
                        if (t && t.id !== undefined) tplById.set(String(t.id), t);
                    });

                    const idsToProcess = srajList.length > 0
                        ? srajList.map(s => String(s.id))
                        : tplList.map(t => String(t.id));

                    const effects = idsToProcess.map(id => {
                        const tplEntry = tplById.get(id) || {};
                        let parsedAppear = tplEntry.appear ?? null;
                        let jsScript = null;

                        if (typeof parsedAppear === 'string') {
                            try {
                                const obj = JSON.parse(parsedAppear);
                                if (obj && typeof obj === 'object') {
                                    jsScript = obj.jsScript || null;
                                    parsedAppear = obj;
                                }
                            } catch (e) {}
                        }

                        const triggerName = typeof jsScript === 'string' && jsScript.includes('clickEqColumnShow')
                            ? 'SHOW_EQ_COLUMN'
                            : 'UI_EFFECT';

                        return {
                            sraj_id: Number.isNaN(Number(id)) ? id : Number(id),
                            quest_id: resolvedQuestId,
                            trigger: triggerName,
                            js_script: jsScript,
                            appear: parsedAppear,
                            cancel: tplEntry.cancel ?? null,
                            related_item_tpls: []
                        };
                    });

                    if (effects.length > 0) {
                        additional.ui_effect = effects.length === 1 ? effects[0] : effects;
                    }
                }

                const srajIds = Array.isArray(additional.ui_effect)
                    ? additional.ui_effect.map(e => e.sraj_id)
                    : (additional.ui_effect ? [additional.ui_effect.sraj_id] : []);
                const itemTpls = additional.give_items ? additional.give_items.items.map(i => i.tpl).filter(Boolean) : [];

                if (additional.give_items && srajIds.length > 0) {
                    additional.give_items.linked_sraj_ids = srajIds;
                }
                if (additional.ui_effect) {
                    const applyLinks = (eff) => {
                        if (itemTpls.length > 0) {
                            eff.related_item_tpls = Array.from(new Set([...(eff.related_item_tpls || []), ...itemTpls]));
                        }
                        if (!eff.quest_id && additional.give_items?.quest_id) {
                            eff.quest_id = additional.give_items.quest_id;
                        }
                    };
                    if (Array.isArray(additional.ui_effect)) additional.ui_effect.forEach(applyLinks);
                    else applyLinks(additional.ui_effect);
                }

                return additional;
            },
            buildNodeFingerprint(content, options) {
                const cleanContent = String(content || '').trim();
                const optsSig = (options || [])
                    .map(o => `${String(o.action_code || '').trim()}::${String(o.label || '').trim()}`)
                    .join('|');
                return `${cleanContent}###${optsSig}`;
            },
            findExistingEquivalentNode(tree, content, options, preferredNodeId) {
                if (!tree || !tree.nodes) return null;
                if (tree.nodes[preferredNodeId]) return preferredNodeId;
                const targetFp = this.buildNodeFingerprint(content, options);
                if (!targetFp || targetFp === '###') return null;

                if (tree.nodes.root) {
                    const rootEntry = tree.nodes.root;
                    if (this.buildNodeFingerprint(rootEntry.node?.content, rootEntry.options) === targetFp) {
                        return 'root';
                    }
                }

                for (const existingId of Object.keys(tree.nodes)) {
                    const entry = tree.nodes[existingId];
                    if (this.buildNodeFingerprint(entry.node?.content, entry.options) === targetFp) {
                        return existingId;
                    }
                }
                return null;
            },
            findParentNodeForAction(tree, session, targetNodeId, actionCode) {
                if (!actionCode) return null;
                if (session.currentNodeId && tree.nodes[session.currentNodeId] && session.currentNodeId !== targetNodeId) {
                    const currEntry = tree.nodes[session.currentNodeId];
                    if ((currEntry.options || []).some(o => o.action_code === actionCode)) {
                        return currEntry;
                    }
                }
                for (const k of Object.keys(tree.nodes).reverse()) {
                    if (k === targetNodeId) continue;
                    const candidate = tree.nodes[k];
                    if ((candidate.options || []).some(o => o.action_code === actionCode)) {
                        return candidate;
                    }
                }
                return null;
            },
            recordOutgoingChoice(query) {
                const parsed = this.parseTalkQuery(query);
                if (!parsed.npcId || !parsed.actionCode) return;
                const session = this.ensureNpcSession(parsed.npcId);
                session.pendingActionCode = parsed.actionCode;
            },
            recordStep(query, response) {
                let heroNick = '';
                try {
                    if (winRef.Engine && winRef.Engine.hero && winRef.Engine.hero.d) {
                        heroNick = winRef.Engine.hero.d.nick || '';
                    }
                } catch (e) {}

                const payload = this.extractDialogPayload(query, response, heroNick);
                if (!payload || !payload.npcId) return false;

                const npcKey = payload.npcId;
                const tree = this.ensureNpcTree(npcKey, payload.npcName);
                const session = this.ensureNpcSession(npcKey);
                const actionUsed = payload.queryActionCode || session.pendingActionCode || null;

                const isEmptyEndPacket = !payload.npcText && payload.options.length === 0;
                if (isEmptyEndPacket) {
                    if (actionUsed && session.currentNodeId && tree.nodes[session.currentNodeId]) {
                        const prevNode = tree.nodes[session.currentNodeId];
                        const matchingOpt = (prevNode.options || []).find(o => o.action_code === actionUsed);
                        if (matchingOpt) matchingOpt.next_node_id = null;
                    }
                    session.pendingActionCode = null;
                    session.currentNodeId = 'root';
                    this.saveState();
                    sendToServer('save_dialog_tree', {
                        npc_key: npcKey,
                        dialog_tree: this.sanitizeTree(JSON.parse(JSON.stringify(tree)))
                    });
                    return true;
                }

                const candidateId = actionUsed ? `c_${actionUsed}` : 'root';
                const nodeId = this.findExistingEquivalentNode(tree, payload.npcText, payload.options, candidateId) || candidateId;
                const detectedActions = this.extractAdditionalActions(response);

                if (!tree.nodes[nodeId]) {
                    tree.nodes[nodeId] = this.createNodeSchema(nodeId, payload.npcText, payload.options, detectedActions);
                } else {
                    tree.nodes[nodeId].node.content = payload.npcText;
                    tree.nodes[nodeId].node.type = this.detectNodeType(payload.npcText, payload.options);

                    const prevOptionsMap = new Map((tree.nodes[nodeId].options || []).map(o => [o.action_code, o]));
                    tree.nodes[nodeId].options = payload.options.map(opt => {
                        const oldOpt = prevOptionsMap.get(opt.action_code);
                        return {
                            label: opt.label,
                            action_code: opt.action_code,
                            next_node_id: oldOpt ? oldOpt.next_node_id : null,
                            additional_action: oldOpt ? oldOpt.additional_action : null,
                            additional_actions: oldOpt ? oldOpt.additional_actions : {},
                            cooldown: oldOpt ? oldOpt.cooldown : 0,
                            rules: oldOpt ? oldOpt.rules : {}
                        };
                    });

                    if (Object.keys(detectedActions).length > 0) {
                        tree.nodes[nodeId].node.additional_actions = {
                            ...(tree.nodes[nodeId].node.additional_actions || {}),
                            ...detectedActions
                        };
                    }
                }

                if (actionUsed) {
                    const parentEntry = this.findParentNodeForAction(tree, session, nodeId, actionUsed);
                    if (parentEntry) {
                        const matchedOption = (parentEntry.options || []).find(o => o.action_code === actionUsed);
                        if (matchedOption) matchedOption.next_node_id = nodeId;
                    }
                }

                session.currentNodeId = nodeId;
                session.pendingActionCode = null;

                setLatestEntry('dialog', `${tree.npc_name} (#${npcKey})`);
                updateStatus(`Zapisano dialog NPC: ${tree.npc_name} (nody: ${Object.keys(tree.nodes).length})`);

                this.saveState();
                sendToServer('save_dialog_tree', {
                    npc_key: npcKey,
                    dialog_tree: this.sanitizeTree(JSON.parse(JSON.stringify(tree)))
                });
                return true;
            },
            init() {
                this.loadState();
            }
        },
        QuestScrapper: {
            STORAGE_KEY: 'margo_quests_tree_v2',
            PENDING_KEY: 'margo_quests_pending_trackers',
            questsTree: {},
            pendingTrackers: {},
            skippedIncompleteQuestIds: new Set(),

            loadState() {
                try {
                    const legacyTree = localStorage.getItem('margo_quests_tree');
                    const currentTree = localStorage.getItem(this.STORAGE_KEY);
                    this.questsTree = JSON.parse(currentTree || legacyTree || '{}');
                    this.pendingTrackers = JSON.parse(localStorage.getItem(this.PENDING_KEY) || '{}');
                } catch (e) {
                    this.questsTree = {};
                    this.pendingTrackers = {};
                }
            },
            saveState() {
                try {
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.questsTree));
                    localStorage.setItem(this.PENDING_KEY, JSON.stringify(this.pendingTrackers));
                    if (winRef.MargoGraphEngine && typeof winRef.MargoGraphEngine.updateData === 'function') {
                        winRef.MargoGraphEngine.updateData('quest', this.questsTree);
                    }
                } catch (e) {}
            },
            ensureQuestEntry(qId, baseData = {}) {
                const key = String(qId);
                if (!this.questsTree[key]) {
                    this.questsTree[key] = {
                        id: Number.isNaN(Number(qId)) ? qId : Number(qId),
                        name: baseData.name || 'Nieznany quest',
                        status: baseData.status || 'active',
                        markerId: baseData.markerId !== undefined ? baseData.markerId : 0,
                        requirements: baseData.requirements || {
                            finished: [],
                            lvlMax: 0,
                            lvlMin: 0,
                            other: false,
                            prof: 0
                        },
                        properties: baseData.properties || {},
                        stages: { list: [] }
                    };
                } else {
                    const entry = this.questsTree[key];
                    if (baseData.name) entry.name = baseData.name;
                    if (baseData.status) entry.status = baseData.status;
                    if (baseData.properties) entry.properties = { ...entry.properties, ...baseData.properties };
                    if (baseData.requirements) entry.requirements = { ...entry.requirements, ...baseData.requirements };
                    if (baseData.markerId !== undefined) entry.markerId = baseData.markerId;
                    if (!entry.stages || !Array.isArray(entry.stages.list)) {
                        entry.stages = { list: [] };
                    }
                }
                return this.questsTree[key];
            },
            normalizeMissions(q) {
                const rawList =
                    (q.missions && Array.isArray(q.missions.list) && q.missions.list) ||
                    (Array.isArray(q.missions) && q.missions) ||
                    [];

                return rawList.map((m, idx) => ({
                    index: idx + 1,
                    mission_type: m.type ?? m.mission_type ?? 0,
                    title: m.title || (m.type === 2 ? 'Zabij' : 'Misja'),
                    names: Array.isArray(m.names) ? m.names : (m.name ? [m.name] : []),
                    current: m.amount?.value ?? m.amount?.cur ?? m.cur ?? 0,
                    total: m.amount?.total ?? m.total ?? 1,
                    done: Boolean(m.isDone ?? m.done ?? m.completed ?? false)
                }));
            },
            normalizeTargets(list) {
                if (!Array.isArray(list)) return [];
                return list.map((m, idx) => {
                    const npcData = m.data || {};
                    const positions = Array.isArray(m.pos)
                        ? m.pos.map(p => ({
                            map_id: p.town ?? p.mapId ?? null,
                            map_name: p.name || 'Nieznana lokacja',
                            x: p.x ?? null,
                            y: p.y ?? null
                        }))
                        : [];

                    return {
                        target_id: m.id ?? idx + 1,
                        type: m.type || 'KILL',
                        npc: {
                            id: npcData.id ?? null,
                            name: npcData.name || 'Nieznany cel',
                            entity_type: npcData.type || 'NPC_TPL'
                        },
                        amount: {
                            current: m.progress?.amount ?? 0,
                            total: m.progress?.total ?? 1
                        },
                        locations: positions
                    };
                });
            },
            buildTargetsSummary(targets) {
                const safeTargets = Array.isArray(targets) ? targets : [];
                const uniqueNpcs = [];
                const seenNpcIds = new Set();
                const uniqueLocations = [];
                const seenLocKeys = new Set();

                safeTargets.forEach(t => {
                    const npcKey = `${t.npc?.id ?? ''}_${t.npc?.name ?? ''}`;
                    if (t.npc?.name && !seenNpcIds.has(npcKey)) {
                        seenNpcIds.add(npcKey);
                        uniqueNpcs.push({ id: t.npc.id, name: t.npc.name });
                    }
                    (t.locations || []).forEach(loc => {
                        const locKey = `${loc.map_id ?? ''}_${loc.map_name}_${loc.x ?? ''}_${loc.y ?? ''}`;
                        if (!seenLocKeys.has(locKey)) {
                            seenLocKeys.add(locKey);
                            uniqueLocations.push(loc);
                        }
                    });
                });

                return {
                    targets_count: safeTargets.length,
                    npcs_count: uniqueNpcs.length,
                    npcs: uniqueNpcs,
                    locations: uniqueLocations
                };
            },
            hasRecordedStartStage(questEntry) {
                if (!questEntry?.stages?.list || !Array.isArray(questEntry.stages.list)) return false;
                const step1 = questEntry.stages.list.find(s => Number(s.step) === 1);
                if (!step1) return false;
                const hasDesc = Boolean(String(step1.description || '').trim());
                const hasMissions = Array.isArray(step1.missions) && step1.missions.length > 0;
                return hasDesc || hasMissions;
            },
            canProcessQuestData(qId, rawQuestObj) {
                const key = String(qId);
                if (this.skippedIncompleteQuestIds.has(key)) return false;

                const existing = this.questsTree?.[key];
                if (existing && this.hasRecordedStartStage(existing)) return true;

                const desc = String(rawQuestObj?.description ?? rawQuestObj?.desc ?? '').trim();
                const missions = this.normalizeMissions(rawQuestObj || {});
                const isCreateAction = String(rawQuestObj?.action || '').toUpperCase() === 'CREATE';
                const isStarter = String(rawQuestObj?.status || '').toLowerCase() === 'starter';

                if (isCreateAction || isStarter || desc.length > 0 || missions.length > 0) return true;

                if (String(rawQuestObj?.status || '').toLowerCase() === 'active' && !existing) {
                    this.skippedIncompleteQuestIds.add(key);
                    return false;
                }
                return true;
            },
            extractRelatedItems(res, questId = null) {
                const itemsByTpl = new Map();
                if (res?.item && typeof res.item === 'object') {
                    Object.values(res.item).forEach(it => {
                        if (!it || typeof it !== 'object') return;
                        const tpl = it.tpl ?? null;
                        const key = tpl !== null ? `tpl_${tpl}` : `id_${it.id ?? Math.random()}`;
                        const statStr = String(it.stat || '');
                        const questMatch = statStr.match(/quest=([^;]+)/);
                        const questIdsFromStat = questMatch
                            ? questMatch[1].split(',').map(v => Number(v.trim())).filter(v => !Number.isNaN(v))
                            : [];

                        if (questId !== null && questIdsFromStat.length > 0 && !questIdsFromStat.includes(Number(questId))) {
                            return;
                        }

                        if (!itemsByTpl.has(key)) {
                            itemsByTpl.set(key, {
                                tpl,
                                name: it.name || 'Nieznany przedmiot',
                                icon: it.icon || '',
                                amount: 1,
                                quest_ids: questIdsFromStat
                            });
                        } else {
                            itemsByTpl.get(key).amount += 1;
                        }
                    });
                }

                if (Array.isArray(res?.tracking?.list)) {
                    res.tracking.list.forEach(entry => {
                        if (entry?.data?.type === 'ITEM' && entry?.data?.id !== undefined) {
                            const tpl = entry.data.id;
                            const key = `tpl_${tpl}`;
                            if (!itemsByTpl.has(key)) {
                                itemsByTpl.set(key, {
                                    tpl,
                                    name: entry.data.name || 'Nieznany przedmiot',
                                    icon: '',
                                    amount: entry.progress?.amount ?? 1,
                                    quest_ids: res.tracking.questId !== undefined ? [res.tracking.questId] : []
                                });
                            }
                        }
                    });
                }

                return Array.from(itemsByTpl.values());
            },
            extractUiEffects(res, questId = null, relatedItems = []) {
                const srajList = Array.isArray(res?.sraj) ? res.sraj : [];
                const tplList = Array.isArray(res?.sraj_tpl) ? res.sraj_tpl : [];
                if (srajList.length === 0 && tplList.length === 0) return [];

                const tplById = new Map();
                tplList.forEach(t => {
                    if (t && t.id !== undefined) tplById.set(String(t.id), t);
                });

                const ids = srajList.length > 0 ? srajList.map(s => String(s.id)) : tplList.map(t => String(t.id));
                const trackingTpls = Array.isArray(res?.tracking?.list)
                    ? res.tracking.list.filter(m => m?.data?.type === 'ITEM' && m?.data?.id !== undefined).map(m => m.data.id)
                    : [];
                const itemTplsFromList = relatedItems.map(i => i.tpl).filter(Boolean);
                const relatedTpls = Array.from(new Set([...trackingTpls, ...itemTplsFromList]));

                return ids.map(id => {
                    const tplEntry = tplById.get(id) || {};
                    let parsedAppear = tplEntry.appear ?? null;
                    let jsScript = null;

                    if (typeof parsedAppear === 'string') {
                        try {
                            const parsed = JSON.parse(parsedAppear);
                            if (parsed && typeof parsed === 'object') {
                                jsScript = parsed.jsScript || null;
                                parsedAppear = parsed;
                            }
                        } catch (e) {}
                    }

                    const trigger = typeof jsScript === 'string' && jsScript.includes('clickEqColumnShow')
                        ? 'SHOW_EQ_COLUMN'
                        : 'UI_EFFECT';

                    return {
                        sraj_id: Number.isNaN(Number(id)) ? id : Number(id),
                        quest_id: res?.tracking?.questId ?? questId ?? null,
                        trigger,
                        js_script: jsScript,
                        appear: parsedAppear,
                        cancel: tplEntry.cancel ?? null,
                        related_item_tpls: relatedTpls
                    };
                });
            },
            attachUiEffectsToStage(stage, uiEffects) {
                if (!stage || !Array.isArray(uiEffects) || uiEffects.length === 0) return false;
                stage.ui_effects = Array.isArray(stage.ui_effects) ? stage.ui_effects : [];
                const existingIds = new Set(stage.ui_effects.map(e => String(e.sraj_id)));
                let added = false;

                uiEffects.forEach(eff => {
                    const key = String(eff.sraj_id);
                    if (!existingIds.has(key)) {
                        stage.ui_effects.push(eff);
                        existingIds.add(key);
                        added = true;
                    } else {
                        stage.ui_effects = stage.ui_effects.map(existing => {
                            if (String(existing.sraj_id) !== key) return existing;
                            return {
                                ...existing,
                                quest_id: existing.quest_id ?? eff.quest_id,
                                related_item_tpls: Array.from(new Set([...(existing.related_item_tpls || []), ...(eff.related_item_tpls || [])]))
                            };
                        });
                    }
                });

                return added;
            },
            attachTargetsToStage(questId, targets, extra = {}) {
                const qId = String(questId);
                if (this.skippedIncompleteQuestIds.has(qId)) return false;

                const existing = this.questsTree?.[qId];
                if (!existing || !this.hasRecordedStartStage(existing)) {
                    this.pendingTrackers[qId] = targets;
                    return false;
                }

                const stagesList = existing.stages.list;
                const currentStage = stagesList[stagesList.length - 1];
                currentStage.targets = targets;
                currentStage.targetsSummary = this.buildTargetsSummary(targets);

                if (Array.isArray(extra.relatedItems) && extra.relatedItems.length > 0) {
                    currentStage.related_items = extra.relatedItems;
                }
                if (Array.isArray(extra.uiEffects) && extra.uiEffects.length > 0) {
                    this.attachUiEffectsToStage(currentStage, extra.uiEffects);
                }

                return true;
            },
            findTrackerPayload(obj, depth = 0) {
                if (!obj || typeof obj !== 'object' || depth > 5) return null;
                if (obj.action === 'SHOW' && obj.questId && Array.isArray(obj.list)) return obj;
                if (obj.questId && Array.isArray(obj.list) && obj.list.some(item => item && (item.pos || item.data || item.progress))) return obj;

                for (const key of Object.keys(obj)) {
                    const val = obj[key];
                    if (val && typeof val === 'object') {
                        const found = this.findTrackerPayload(val, depth + 1);
                        if (found) return found;
                    }
                }
                return null;
            },
            extractQuestItems(res) {
                const candidates = [
                    res?.quests?.list,
                    res?.questsData?.quests?.list,
                    res?.qlines?.quests?.list,
                    Array.isArray(res?.qlines) ? res.qlines : null,
                    Array.isArray(res?.list) && !res?.questId ? res.list : null,
                    (res?.id && (res?.name || res?.description || res?.missions)) ? [res] : null
                ];
                for (const list of candidates) {
                    if (Array.isArray(list) && list.length > 0) return list;
                }
                return [];
            },
            getOrCreateStage(questObj, desc, missions) {
                const stages = questObj.stages.list;
                const cleanDesc = (desc || '').trim();
                const missionSig = JSON.stringify(missions.map(m => [m.mission_type, m.title, m.names, m.total]));

                const exactMatch = stages.find(s => s.description === cleanDesc && s._sig === missionSig);
                if (exactMatch) {
                    exactMatch.missions = missions;
                    if (!exactMatch.targetsSummary) exactMatch.targetsSummary = this.buildTargetsSummary(exactMatch.targets || []);
                    if (!Array.isArray(exactMatch.ui_effects)) exactMatch.ui_effects = [];
                    return exactMatch;
                }

                const lastStage = stages[stages.length - 1];
                if (lastStage && lastStage.description === '' && cleanDesc !== '') {
                    lastStage.description = cleanDesc;
                    lastStage.missions = missions;
                    lastStage._sig = missionSig;
                    if (!lastStage.targetsSummary) lastStage.targetsSummary = this.buildTargetsSummary(lastStage.targets || []);
                    if (!Array.isArray(lastStage.ui_effects)) lastStage.ui_effects = [];
                    return lastStage;
                }

                if (!lastStage || lastStage.description !== cleanDesc || lastStage._sig !== missionSig) {
                    const newStage = {
                        step: stages.length + 1,
                        description: cleanDesc,
                        missions,
                        targetsSummary: { targets_count: 0, npcs_count: 0, npcs: [], locations: [] },
                        targets: [],
                        ui_effects: [],
                        _sig: missionSig
                    };
                    stages.push(newStage);
                    return newStage;
                }

                return lastStage;
            },
            parsePacket(res) {
                if (!res || typeof res !== 'object') return false;
                let changed = false;

                const trackerPayload = this.findTrackerPayload(res);
                const trackerQuestId = trackerPayload?.questId ?? res?.tracking?.questId ?? null;
                const relatedItems = this.extractRelatedItems(res, trackerQuestId);
                const uiEffects = this.extractUiEffects(res, trackerQuestId, relatedItems);

                const qList = this.extractQuestItems(res);
                if (qList.length > 0) {
                    qList.forEach(q => {
                        if (!q || !q.id) return;
                        const qId = String(q.id);
                        if (!this.canProcessQuestData(qId, q)) return;

                        const questEntry = this.ensureQuestEntry(qId, q);
                        const qDesc = q.description ?? q.desc ?? '';
                        const missionsList = this.normalizeMissions(q);
                        const targetStage = this.getOrCreateStage(questEntry, qDesc, missionsList);

                        if (this.pendingTrackers[qId] && this.pendingTrackers[qId].length > 0) {
                            targetStage.targets = this.pendingTrackers[qId];
                            targetStage.targetsSummary = this.buildTargetsSummary(this.pendingTrackers[qId]);
                            delete this.pendingTrackers[qId];
                        }

                        const questItems = this.extractRelatedItems(res, q.id);
                        if (questItems.length > 0) targetStage.related_items = questItems;

                        const stageEffects = this.extractUiEffects(res, q.id, questItems.length > 0 ? questItems : relatedItems);
                        if (stageEffects.length > 0) this.attachUiEffectsToStage(targetStage, stageEffects);

                        changed = true;
                    });
                }

                if (trackerPayload) {
                    const qId = String(trackerPayload.questId);
                    const mappedTargets = this.normalizeTargets(trackerPayload.list);
                    if (this.attachTargetsToStage(qId, mappedTargets, { relatedItems, uiEffects })) {
                        changed = true;
                    }
                } else if (uiEffects.length > 0 && trackerQuestId) {
                    const qId = String(trackerQuestId);
                    const questObj = this.questsTree[qId];
                    if (questObj && this.hasRecordedStartStage(questObj) && Array.isArray(questObj.stages?.list) && questObj.stages.list.length > 0) {
                        const lastStage = questObj.stages.list[questObj.stages.list.length - 1];
                        if (this.attachUiEffectsToStage(lastStage, uiEffects)) {
                            changed = true;
                        }
                    }
                }

                if (changed) {
                    const count = Object.keys(this.questsTree).length;
                    setLatestEntry('quest', `${count} questów`);
                    updateStatus(`Zaktualizowano questy (łącznie: ${count})`);
                    this.saveState();
                    sendToServer('save_quests', { quests: this.questsTree });
                }

                return changed;
            },
            init() {
                this.loadState();
            }
        },
        initNetworkHook() {
            const checkG = setInterval(() => {
                if (winRef._g && !winRef._g.__margo_all_in_one_hooked) {
                    winRef._g.__margo_all_in_one_hooked = true;
                    clearInterval(checkG);

                    const original_g = winRef._g;

                    winRef._g = function(query, callback) {
                        try {
                            if (query && typeof query === 'string' && query.includes('talk')) {
                                MargoTools.DialogScrapper.recordOutgoingChoice(query);
                            }
                        } catch (e) {}

                        const wrappedCallback = function(response) {
                            try {
                                if (response && typeof response === 'object') {
                                    if (query && typeof query === 'string' && query.includes('talk') && response.d) {
                                        MargoTools.DialogScrapper.recordStep(query, response);
                                    }

                                    const hasQuestPayload = Boolean(
                                        response.questsData ||
                                        response.qlines ||
                                        response.quests ||
                                        MargoTools.QuestScrapper.findTrackerPayload(response) ||
                                        Array.isArray(response.sraj) ||
                                        Array.isArray(response.sraj_tpl) ||
                                        (typeof query === 'string' && (query.includes('quest') || query.includes('qlines') || query.includes('tracker')))
                                    );
                                    if (hasQuestPayload) {
                                        MargoTools.QuestScrapper.parsePacket(response);
                                    }
                                }
                            } catch (err) {
                                updateStatus(`Błąd w hooku _g: ${err.message}`, true);
                            }

                            if (typeof callback === 'function') return callback(response);
                        };

                        return original_g.call(this, query, wrappedCallback);
                    };
                }
            }, 500);
        },
        start() {
            try {
                this.MapExtractor.init();
                this.BattleAddon.init();
                this.ShopScrapper.init();
                this.DialogScrapper.init();
                this.QuestScrapper.init();
                this.initNetworkHook();
                updateStatus('Wszystkie moduły (mapy, przejścia, NPC, walki, sklepy, dialogi, questy) zainicjowane.');
            } catch (e) {
                updateStatus(`Krytyczny błąd startu: ${e.message}`, true);
            }
        }
    };

    MargoTools.start();
})();