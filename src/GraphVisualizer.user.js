// ==UserScript==
// @name         Margonem Graph Visualizer
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Widok danych ze scrappera
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
    const DIALOGS_STORAGE_KEY = 'margo_dialog_trees_v1';
    const QUESTS_STORAGE_KEY = 'margo_quests_tree_v2';
    const GRAPH_POSITIONS_KEY = 'margo_graph_manual_positions_v1';

    let modalEl = null;
    let currentMode = 'dialog'; // 'dialog' | 'quest' | 'db'
    let currentCollection = 'maps'; // 'maps' | 'battle_npcs' | 'shops' | 'dialog_trees' | 'quests'
    let currentEntityId = null;
    let selectedNodeId = null;
    let searchQuery = '';
    let sidebarCollapsed = false;
    let inspectorJsonOpen = false;
    let dataSourceLabel = 'Lokalnie';
    let isLoadingRemote = false;

    let panOffset = { x: 40, y: 40 };
    let zoomScale = 1;
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let activeDragNode = null;

    let remoteData = {
        dialogsList: [],
        dialogsMap: {},
        questsMap: {},
        collections: {
            maps: [],
            battle_npcs: [],
            shops: [],
            dialog_trees: [],
            quests: []
        }
    };

    let externalData = {
        dialogs: null,
        quests: null
    };

    let expandedCardSections = new Set();
    let currentRenderedGraph = null;
    let currentDbDoc = null;

    function loadManualPositions() {
        try {
            return JSON.parse(localStorage.getItem(GRAPH_POSITIONS_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function saveManualPosition(mode, entityId, nodeId, pos) {
        try {
            const all = loadManualPositions();
            const key = `${mode}:${entityId}`;
            if (!all[key]) all[key] = {};
            all[key][nodeId] = pos;
            localStorage.setItem(GRAPH_POSITIONS_KEY, JSON.stringify(all));
        } catch (e) {}
    }

    function clearManualPositions(mode, entityId) {
        try {
            const all = loadManualPositions();
            delete all[`${mode}:${entityId}`];
            localStorage.setItem(GRAPH_POSITIONS_KEY, JSON.stringify(all));
        } catch (e) {}
    }

    function getLocalDialogs() {
        const merged = {};
        try {
            const fromStorage = JSON.parse(localStorage.getItem(DIALOGS_STORAGE_KEY) || '{}');
            if (fromStorage && typeof fromStorage === 'object') Object.assign(merged, fromStorage);
        } catch (e) {}
        if (externalData.dialogs && typeof externalData.dialogs === 'object') {
            Object.assign(merged, externalData.dialogs);
        }
        return merged;
    }

    function getLocalQuests() {
        const merged = {};
        try {
            const fromStorage = JSON.parse(localStorage.getItem(QUESTS_STORAGE_KEY) || '{}');
            if (fromStorage && typeof fromStorage === 'object') Object.assign(merged, fromStorage);
        } catch (e) {}
        if (externalData.quests && typeof externalData.quests === 'object') {
            Object.assign(merged, externalData.quests);
        }
        return merged;
    }

    function getActiveDialogsMap() {
        const local = getLocalDialogs();
        const remote = remoteData.dialogsMap || {};
        return Object.keys(remote).length > 0 ? { ...local, ...remote } : local;
    }

    function getActiveQuestsMap() {
        const local = getLocalQuests();
        const remote = remoteData.questsMap || {};
        return Object.keys(remote).length > 0 ? { ...local, ...remote } : local;
    }

    function getCatalogItems() {
        if (currentMode === 'db') {
            return Array.isArray(remoteData.collections[currentCollection])
                ? remoteData.collections[currentCollection]
                : [];
        }

        if (currentMode === 'dialog') {
            const localMap = getLocalDialogs();
            const remoteList = Array.isArray(remoteData.dialogsList) ? remoteData.dialogsList : [];
            const remoteMap = remoteData.dialogsMap || {};
            const mapById = new Map();

            Object.keys(localMap).forEach(id => {
                const tree = localMap[id];
                mapById.set(String(id), {
                    id: String(id),
                    name: tree?.npc_name || `NPC ${id}`,
                    meta: `węzły: ${Object.keys(tree?.nodes || {}).length}`
                });
            });

            remoteList.forEach(item => {
                if (item?.npc_id !== undefined) {
                    const id = String(item.npc_id);
                    const prev = mapById.get(id);
                    mapById.set(id, {
                        id,
                        name: item.npc_name || prev?.name || `NPC ${id}`,
                        meta: prev?.meta || 'DB'
                    });
                }
            });

            Object.keys(remoteMap).forEach(id => {
                const key = String(id);
                const tree = remoteMap[key];
                const prev = mapById.get(key);
                mapById.set(key, {
                    id: key,
                    name: tree?.npc_name || prev?.name || `NPC ${key}`,
                    meta: `węzły: ${Object.keys(tree?.nodes || {}).length}`
                });
            });

            return Array.from(mapById.values());
        }

        const questsMap = getActiveQuestsMap();
        return Object.keys(questsMap).map(id => {
            const q = questsMap[id] || {};
            const stagesCount = Array.isArray(q.stages?.list) ? q.stages.list.length : 0;
            return {
                id: String(id),
                name: q.name || `Quest ${id}`,
                meta: `${q.status || 'active'} · etapy: ${stagesCount}`
            };
        });
    }

    async function fetchJsonWithTimeout(url, timeoutMs = 15000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } finally {
            clearTimeout(timer);
        }
    }

    async function fetchDialogsFromServer(preferredNpcId = null) {
        isLoadingRemote = true;
        updateStatusBadge('Ładowanie...');
        try {
            const listResp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/dialog_trees`);
            const list = Array.isArray(listResp?.dialogs) ? listResp.dialogs : [];
            remoteData.dialogsList = list;

            const targetId = preferredNpcId || currentEntityId || (list[0]?.npc_id ? String(list[0].npc_id) : null);
            if (targetId) {
                const treeResp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/dialog_tree/${encodeURIComponent(targetId)}`);
                if (treeResp?.dialog_tree && typeof treeResp.dialog_tree === 'object') {
                    remoteData.dialogsMap[String(targetId)] = treeResp.dialog_tree;
                }
            }
            dataSourceLabel = 'MongoDB';
            updateStatusBadge('MongoDB');
            return true;
        } catch (e) {
            dataSourceLabel = 'Lokalnie';
            updateStatusBadge('Lokalnie');
            return false;
        } finally {
            isLoadingRemote = false;
        }
    }

    async function fetchSingleDialogTree(npcId) {
        if (!npcId) return false;
        isLoadingRemote = true;
        updateStatusBadge('Pobieranie...');
        try {
            const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/dialog_tree/${encodeURIComponent(String(npcId))}`);
            if (resp?.dialog_tree && typeof resp.dialog_tree === 'object') {
                remoteData.dialogsMap[String(npcId)] = resp.dialog_tree;
                dataSourceLabel = 'MongoDB';
                updateStatusBadge('MongoDB');
                return true;
            }
            return false;
        } catch (e) {
            dataSourceLabel = 'Lokalnie';
            updateStatusBadge('Lokalnie');
            return false;
        } finally {
            isLoadingRemote = false;
        }
    }

    async function fetchQuestsFromServer() {
        isLoadingRemote = true;
        updateStatusBadge('Ładowanie...');
        try {
            const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/quests`);
            if (resp?.quests && typeof resp.quests === 'object') {
                remoteData.questsMap = resp.quests;
                dataSourceLabel = 'MongoDB';
                updateStatusBadge('MongoDB');
                return true;
            }
            return false;
        } catch (e) {
            dataSourceLabel = 'Lokalnie';
            updateStatusBadge('Lokalnie');
            return false;
        } finally {
            isLoadingRemote = false;
        }
    }

    async function fetchCollectionList(col) {
        isLoadingRemote = true;
        updateStatusBadge('Ładowanie...');
        try {
            let items = [];
            if (col === 'maps') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/maps`);
                items = (resp?.maps || []).map(m => ({ id: String(m.id), name: m.name || `Mapa ${m.id}`, meta: 'maps' }));
            } else if (col === 'battle_npcs') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/battle_npcs`);
                const rawList = Array.isArray(resp?.data) ? resp.data : [];
                items = (resp?.enemies || []).map(x => ({
                    id: String(x.id),
                    name: x.name || `Przeciwnik ${x.id}`,
                    meta: 'battle_npcs',
                    doc: rawList.find(d => String(d.id ?? d.originalId) === String(x.id)) || x
                }));
            } else if (col === 'shops') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/shops`);
                items = (resp?.shops || []).map(s => ({ id: String(s.id), name: s.name || `Sklep ${s.id}`, meta: 'shops' }));
            } else if (col === 'dialog_trees') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/dialog_trees`);
                items = (resp?.dialogs || []).map(d => ({ id: String(d.npc_id), name: d.npc_name || `NPC ${d.npc_id}`, meta: 'dialog_trees' }));
            } else if (col === 'quests') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/quests`);
                const qMap = resp?.quests || {};
                items = Object.keys(qMap).map(k => ({
                    id: String(k),
                    name: qMap[k]?.name || `Quest ${k}`,
                    meta: 'quests',
                    doc: qMap[k]
                }));
            } else if (col === 'gateways') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/gateways`);
                const list = Array.isArray(resp?.gateways) ? resp.gateways : [];
                items = list.map((g, idx) => ({
                    id: String(g._id ?? `${g.map_id}_${idx}`),
                    name: `${g.map_name || g.map_id} → ${g.target_map_name || g.target_map_id} (${g.x},${g.y})`,
                    meta: `map_id: ${g.map_id}`,
                    doc: g
                }));
            } else if (col === 'map_npcs') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/map_npcs`);
                const list = Array.isArray(resp?.npcs) ? resp.npcs : [];
                items = list.map((n, idx) => ({
                    id: String(n._id ?? `${n.map_id}_${n.npc_id}_${idx}`),
                    name: `${n.nick || 'NPC'} · ${n.map_name || n.map_id} (${n.x},${n.y})`,
                    meta: `id: ${n.npc_id}`,
                    doc: n
                }));
            }
            remoteData.collections[col] = items;
            dataSourceLabel = 'MongoDB';
            updateStatusBadge('MongoDB');
            return true;
        } catch (e) {
            dataSourceLabel = 'Lokalnie';
            updateStatusBadge('Lokalnie');
            return false;
        } finally {
            isLoadingRemote = false;
        }
    }

    async function fetchCollectionDocument(col, id) {
        if (!id) return null;
        const cached = (remoteData.collections[col] || []).find(x => String(x.id) === String(id));
        if (cached && cached.doc) return cached.doc;

        isLoadingRemote = true;
        updateStatusBadge('Pobieranie...');
        try {
            if (col === 'maps') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/map/${encodeURIComponent(String(id))}`);
                return resp?.map || null;
            }
            if (col === 'shops') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/shop/${encodeURIComponent(String(id))}`);
                return resp?.shop || null;
            }
            if (col === 'dialog_trees') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/dialog_tree/${encodeURIComponent(String(id))}`);
                return resp?.dialog_tree || null;
            }
            if (col === 'quests') {
                const resp = await fetchJsonWithTimeout(`${SERVER_BASE_URL}/quest/${encodeURIComponent(String(id))}`);
                return resp?.quest || null;
            }
            return cached || null;
        } catch (e) {
            return cached || null;
        } finally {
            isLoadingRemote = false;
            updateStatusBadge(dataSourceLabel);
        }
    }

    function updateStatusBadge(text) {
        const badge = document.getElementById('margo-gv-source-badge');
        if (!badge) return;
        badge.textContent = text;
        badge.style.color = text === 'MongoDB' ? '#03dac6' : (text.includes('...') ? '#ffab40' : '#b0bec5');
    }

    function buildVisualDialogGraph(npcId) {
        const dialogs = getActiveDialogsMap();
        const tree = dialogs[String(npcId)];
        if (!tree || !tree.nodes) return null;

        const manualMap = loadManualPositions()[`dialog:${npcId}`] || {};
        const nodesMap = {};
        const edges = [];

        Object.keys(tree.nodes).forEach(nodeId => {
            const entry = tree.nodes[nodeId];
            const n = entry.node || {};
            const options = Array.isArray(entry.options) ? entry.options : [];
            const sections = [];
            const highlights = [];

            const addActions = n.additional_actions || {};
            if (addActions.give_items && Array.isArray(addActions.give_items.items)) {
                highlights.push('ITEM');
                sections.push({
                    key: `${nodeId}:give_items`,
                    title: `Przedmioty (${addActions.give_items.items.length})${addActions.give_items.quest_id ? ` · Quest #${addActions.give_items.quest_id}` : ''}`,
                    accent: '#ffb74d',
                    items: addActions.give_items.items.map(it => ({
                        primary: `${it.name || 'Przedmiot'} (tpl: ${it.tpl ?? '?'}) ×${it.amount ?? 1}`,
                        detail: it.quest_ids?.length ? `questy: ${it.quest_ids.join(', ')}` : ''
                    }))
                });
            }

            if (addActions.ui_effect) {
                highlights.push('SRAJ');
                const effList = Array.isArray(addActions.ui_effect) ? addActions.ui_effect : [addActions.ui_effect];
                sections.push({
                    key: `${nodeId}:ui_effect`,
                    title: `Skrypty / UI sraj (${effList.length})`,
                    accent: '#f06292',
                    items: effList.map(eff => ({
                        primary: `sraj #${eff.sraj_id} · ${eff.trigger || 'UI_EFFECT'}`,
                        code: eff.js_script || (eff.appear ? JSON.stringify(eff.appear, null, 2) : '')
                    }))
                });
            }

            nodesMap[nodeId] = {
                id: nodeId,
                badge: nodeId === (tree.start_node_id || 'root') ? `START (${nodeId})` : nodeId,
                isStart: nodeId === (tree.start_node_id || 'root'),
                typeLabel: n.type || 'dialog',
                highlights,
                content: n.content || '',
                sections,
                raw: entry,
                locations: [],
                links: options.map((opt, idx) => {
                    if (opt.next_node_id && tree.nodes[opt.next_node_id]) {
                        edges.push({
                            fromNodeId: nodeId,
                            fromLinkIndex: idx,
                            toNodeId: opt.next_node_id,
                            label: `[${opt.action_code}] → ${opt.next_node_id}`
                        });
                    }
                    return {
                        index: idx,
                        leftText: `${opt.action_code}: ${opt.label}`,
                        rightText: opt.next_node_id ? `→ ${opt.next_node_id}` : 'koniec',
                        active: Boolean(opt.next_node_id)
                    };
                }),
                position: manualMap[nodeId] ? { ...manualMap[nodeId] } : null
            };
        });

        applyAutoLayout(nodesMap, edges, tree.start_node_id || 'root');

        return {
            title: `${tree.npc_name || 'NPC'} (#${npcId})`,
            nodes: nodesMap,
            edges
        };
    }

    function buildVisualQuestGraph(questId) {
        const quests = getActiveQuestsMap();
        const q = quests[String(questId)];
        if (!q) return null;

        const manualMap = loadManualPositions()[`quest:${questId}`] || {};
        const stages = Array.isArray(q.stages?.list) ? q.stages.list : [];
        const nodesMap = {};
        const edges = [];

        const req = q.requirements || {};
        const reqItems = [
            { primary: `Poziom: ${req.lvlMin ?? 0} – ${req.lvlMax || '∞'}` },
            { primary: `Profesja (maska): ${req.prof ?? 0}` }
        ];
        if (Array.isArray(req.finished) && req.finished.length > 0) {
            reqItems.push({
                primary: `Wymagane ukończone (${req.finished.length})`,
                detail: req.finished.join(', ')
            });
        }

        const rootId = 'quest_meta';
        nodesMap[rootId] = {
            id: rootId,
            badge: `QUEST #${q.id}`,
            isStart: true,
            typeLabel: q.status || 'active',
            highlights: [],
            content: q.name || 'Nieznany quest',
            sections: [
                {
                    key: `${rootId}:requirements`,
                    title: `Wymagania zadania (${reqItems.length})`,
                    accent: '#bb86fc',
                    items: reqItems
                }
            ],
            raw: { id: q.id, name: q.name, status: q.status, requirements: q.requirements },
            locations: [],
            links: stages.length > 0
                ? [{ index: 0, leftText: 'Rozpoczęcie zadania', rightText: '→ Etap 1', active: true }]
                : [],
            position: manualMap[rootId] ? { ...manualMap[rootId] } : null
        };

        if (stages.length > 0) {
            edges.push({
                fromNodeId: rootId,
                fromLinkIndex: 0,
                toNodeId: 'stage_1',
                label: 'start'
            });
        }

        stages.forEach((st, idx) => {
            const stepNum = st.step ?? (idx + 1);
            const nodeId = `stage_${stepNum}`;
            const nextStage = stages[idx + 1];
            const nextNodeId = nextStage ? `stage_${nextStage.step ?? (idx + 2)}` : null;

            const sections = [];
            const highlights = [];
            const stageCoords = [];

            const missions = Array.isArray(st.missions) ? st.missions : [];
            if (missions.length > 0) {
                sections.push({
                    key: `${nodeId}:missions`,
                    title: `Misje (${missions.length})`,
                    accent: '#4fc3f7',
                    items: missions.map(m => ({
                        primary: `${m.title || 'Cel'}: ${(m.names || []).join(', ') || '—'} (${m.current ?? 0}/${m.total ?? 1})`,
                        detail: `type: ${m.mission_type} · ${m.done ? 'ukończono' : 'w trakcie'}`
                    }))
                });
            }

            const targets = Array.isArray(st.targets) ? st.targets : [];
            if (targets.length > 0) {
                highlights.push(`CEL:${targets.length}`);
                sections.push({
                    key: `${nodeId}:targets`,
                    title: `Lista targetów (${targets.length})`,
                    accent: '#03dac6',
                    items: targets.map(t => {
                        const locs = Array.isArray(t.locations)
                            ? t.locations.map(l => {
                                const line = `${l.map_name} [${l.map_id ?? '?'}] (${l.x ?? '?'},${l.y ?? '?'})`;
                                stageCoords.push(`${t.npc?.name || 'Cel'}: ${line}`);
                                return line;
                            }).join('; ')
                            : '';
                        return {
                            primary: `[${t.type || 'TARGET'}] ${t.npc?.name || 'Cel'} (ID: ${t.npc?.id ?? '?'})`,
                            detail: locs || `postęp: ${t.amount?.current ?? 0}/${t.amount?.total ?? 1}`
                        };
                    })
                });
            }

            const relItems = Array.isArray(st.related_items) ? st.related_items : [];
            if (relItems.length > 0) {
                sections.push({
                    key: `${nodeId}:items`,
                    title: `Powiązane przedmioty (${relItems.length})`,
                    accent: '#ffb74d',
                    items: relItems.map(it => ({
                        primary: `${it.name || 'Przedmiot'} (tpl: ${it.tpl ?? '?'}) ×${it.amount ?? 1}`,
                        detail: it.quest_ids?.length ? `questy: ${it.quest_ids.join(', ')}` : ''
                    }))
                });
            }

            const uiEffects = Array.isArray(st.ui_effects) ? st.ui_effects : [];
            if (uiEffects.length > 0) {
                highlights.push(`SRAJ:${uiEffects.length}`);
                sections.push({
                    key: `${nodeId}:sraj`,
                    title: `Skrypty / animacje sraj (${uiEffects.length})`,
                    accent: '#f06292',
                    items: uiEffects.map(eff => ({
                        primary: `sraj #${eff.sraj_id} · ${eff.trigger || 'UI_EFFECT'}`,
                        detail: eff.related_item_tpls?.length ? `tpls: ${eff.related_item_tpls.join(', ')}` : '',
                        code: eff.js_script || (eff.appear ? JSON.stringify(eff.appear, null, 2) : '')
                    }))
                });
            }

            if (nextNodeId) {
                edges.push({
                    fromNodeId: nodeId,
                    fromLinkIndex: 0,
                    toNodeId: nextNodeId,
                    label: `${stepNum} → ${nextStage.step ?? (idx + 2)}`
                });
            }

            nodesMap[nodeId] = {
                id: nodeId,
                badge: `ETAP ${stepNum}`,
                isStart: false,
                typeLabel: `cele: ${targets.length} · sraj: ${uiEffects.length}`,
                highlights,
                content: st.description || '(brak opisu etapu)',
                sections,
                raw: st,
                locations: stageCoords,
                links: [
                    {
                        index: 0,
                        leftText: nextNodeId ? 'Przejście do kolejnego etapu' : 'Koniec zarejestrowanych etapów',
                        rightText: nextNodeId ? `→ Etap ${nextStage.step ?? (idx + 2)}` : 'koniec',
                        active: Boolean(nextNodeId)
                    }
                ],
                position: manualMap[nodeId] ? { ...manualMap[nodeId] } : null
            };
        });

        applyAutoLayout(nodesMap, edges, rootId);

        return {
            title: `${q.name || 'Quest'} (#${q.id})`,
            nodes: nodesMap,
            edges
        };
    }

    function applyAutoLayout(nodesMap, edges, rootId) {
        const nodeIds = Object.keys(nodesMap);
        if (nodeIds.length === 0) return;

        const startId = nodesMap[rootId] ? rootId : nodeIds[0];
        const depthByNode = { [startId]: 0 };
        const queue = [startId];

        while (queue.length > 0) {
            const curr = queue.shift();
            const currDepth = depthByNode[curr] ?? 0;

            edges.forEach(e => {
                if (e.fromNodeId === curr && nodesMap[e.toNodeId] && depthByNode[e.toNodeId] === undefined) {
                    depthByNode[e.toNodeId] = currDepth + 1;
                    queue.push(e.toNodeId);
                }
            });
        }

        const maxDepth = Math.max(0, ...Object.values(depthByNode));
        nodeIds.forEach(id => {
            if (depthByNode[id] === undefined) {
                depthByNode[id] = maxDepth + 1;
            }
        });

        const columns = {};
        nodeIds.forEach(id => {
            const d = depthByNode[id];
            if (!columns[d]) columns[d] = [];
            columns[d].push(id);
        });

        Object.keys(columns).forEach(dStr => {
            const colDepth = Number(dStr);
            columns[dStr].forEach((nId, rowIdx) => {
                if (!nodesMap[nId].position) {
                    nodesMap[nId].position = {
                        x: 60 + colDepth * 360,
                        y: 60 + rowIdx * 270
                    };
                }
            });
        });
    }

    function applyCameraTransform() {
        const stage = document.getElementById('margo-gv-stage');
        if (stage) {
            stage.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomScale})`;
        }
    }

    function fitViewToGraph() {
        const viewport = document.getElementById('margo-gv-viewport');
        const nodesLayer = document.getElementById('margo-gv-nodes');
        if (!viewport || !nodesLayer) return;

        const cards = Array.from(nodesLayer.querySelectorAll('[data-gv-node-id]'));
        if (cards.length === 0) {
            panOffset = { x: 40, y: 40 };
            zoomScale = 1;
            applyCameraTransform();
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        cards.forEach(card => {
            const x = card.offsetLeft;
            const y = card.offsetTop;
            const w = card.offsetWidth || 300;
            const h = card.offsetHeight || 180;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x + w > maxX) maxX = x + w;
            if (y + h > maxY) maxY = y + h;
        });

        const pad = 48;
        const graphW = Math.max(100, maxX - minX);
        const graphH = Math.max(100, maxY - minY);
        const viewW = Math.max(200, viewport.clientWidth - pad * 2);
        const viewH = Math.max(200, viewport.clientHeight - pad * 2);

        const nextScale = Math.min(1.4, Math.max(0.4, Math.min(viewW / graphW, viewH / graphH)));
        zoomScale = Number(nextScale.toFixed(2));
        panOffset = {
            x: Math.round(pad - minX * zoomScale),
            y: Math.round(pad - minY * zoomScale)
        };
        applyCameraTransform();
    }

    const GV_SIZE_STORAGE_KEY = 'margo_gv_window_size_v1';
    let gvResizeState = null;

    function applySavedGraphWindowSize(modal) {
        try {
            const raw = JSON.parse(localStorage.getItem(GV_SIZE_STORAGE_KEY) || 'null');
            if (!raw || typeof raw !== 'object') return;
            if (typeof raw.width === 'number' && raw.width >= 520) {
                modal.style.inset = 'auto';
                modal.style.left = `${Math.max(12, raw.left ?? 28)}px`;
                modal.style.top = `${Math.max(12, raw.top ?? 28)}px`;
                modal.style.width = `${Math.min(window.innerWidth - 24, raw.width)}px`;
            }
            if (typeof raw.height === 'number' && raw.height >= 360) {
                modal.style.inset = 'auto';
                modal.style.left = `${Math.max(12, raw.left ?? 28)}px`;
                modal.style.top = `${Math.max(12, raw.top ?? 28)}px`;
                modal.style.height = `${Math.min(window.innerHeight - 24, raw.height)}px`;
            }
        } catch (e) {}
    }

    function attachGraphResizeHandles(modal) {
        modal.style.minWidth = '520px';
        modal.style.minHeight = '360px';
        applySavedGraphWindowSize(modal);

        const handles = [
            { dir: 'e', style: 'top: 44px; right: 0; width: 7px; height: calc(100% - 52px); cursor: ew-resize;' },
            { dir: 's', style: 'bottom: 0; left: 8px; width: calc(100% - 16px); height: 7px; cursor: ns-resize;' },
            { dir: 'se', style: 'bottom: 0; right: 0; width: 16px; height: 16px; cursor: nwse-resize; background: linear-gradient(135deg, transparent 50%, #03dac6 50%); border-bottom-right-radius: 6px;' }
        ];

        handles.forEach(h => {
            const el = document.createElement('div');
            el.dataset.gvResizeDir = h.dir;
            el.style.cssText = `position: absolute; z-index: 10; ${h.style}`;
            el.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();

                const rect = modal.getBoundingClientRect();
                modal.style.inset = 'auto';
                modal.style.left = `${rect.left}px`;
                modal.style.top = `${rect.top}px`;
                modal.style.width = `${rect.width}px`;
                modal.style.height = `${rect.height}px`;

                gvResizeState = {
                    dir: h.dir,
                    startX: e.clientX,
                    startY: e.clientY,
                    startW: rect.width,
                    startH: rect.height,
                    left: rect.left,
                    top: rect.top
                };
            });
            modal.appendChild(el);
        });

        window.addEventListener('mousemove', (e) => {
            if (!gvResizeState) return;
            const dx = e.clientX - gvResizeState.startX;
            const dy = e.clientY - gvResizeState.startY;

            if (gvResizeState.dir.includes('e')) {
                const nextW = Math.max(520, Math.min(window.innerWidth - gvResizeState.left - 12, gvResizeState.startW + dx));
                modal.style.width = `${nextW}px`;
            }
            if (gvResizeState.dir.includes('s')) {
                const nextH = Math.max(360, Math.min(window.innerHeight - gvResizeState.top - 12, gvResizeState.startH + dy));
                modal.style.height = `${nextH}px`;
            }
        });

        window.addEventListener('mouseup', () => {
            if (!gvResizeState) return;
            gvResizeState = null;
            const rect = modal.getBoundingClientRect();
            try {
                localStorage.setItem(GV_SIZE_STORAGE_KEY, JSON.stringify({
                    left: Math.round(rect.left),
                    top: Math.round(rect.top),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height)
                }));
            } catch (e) {}
            if (currentMode !== 'db') requestAnimationFrame(updateSvgEdges);
        });
    }

    function ensureModal() {
        if (modalEl) return modalEl;

        const modal = document.createElement('div');
        modal.id = 'margo-graph-visualizer-modal';
        modal.style.cssText = `
            position: fixed;
            inset: 28px;
            background: #10131a;
            border: 2px solid #03dac6;
            border-radius: 8px;
            z-index: 1000005;
            display: none;
            flex-direction: column;
            box-shadow: 0 14px 44px rgba(0, 0, 0, 0.88);
            font-family: Arial, sans-serif;
            color: #e0e0e0;
            overflow: hidden;
        `;
        modal.addEventListener('mousedown', e => e.stopPropagation());
        modal.addEventListener('wheel', e => e.stopPropagation(), { passive: false });

        const topBar = document.createElement('div');
        topBar.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 44px;
            padding: 0 12px;
            background: #181c26;
            border-bottom: 1px solid #2a3142;
            gap: 10px;
            flex-shrink: 0;
        `;

        const leftTop = document.createElement('div');
        leftTop.style.cssText = 'display: flex; align-items: center; gap: 6px; min-width: 0; flex: 1;';

        const toggleSidebarBtn = document.createElement('button');
        toggleSidebarBtn.type = 'button';
        toggleSidebarBtn.textContent = '☰';
        toggleSidebarBtn.title = 'Zwiń/rozwiń panel boczny';
        toggleSidebarBtn.style.cssText = 'background: #222836; border: 1px solid #3c465c; color: #e0e0e0; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; flex-shrink: 0;';
        toggleSidebarBtn.addEventListener('click', () => {
            sidebarCollapsed = !sidebarCollapsed;
            const sidebar = document.getElementById('margo-gv-sidebar');
            if (sidebar) sidebar.style.display = sidebarCollapsed ? 'none' : 'flex';
        });

        const modeDialogBtn = document.createElement('button');
        modeDialogBtn.type = 'button';
        modeDialogBtn.id = 'margo-gv-mode-dialog';
        modeDialogBtn.textContent = 'Dialogi';
        modeDialogBtn.style.cssText = 'padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; border: 1px solid #03dac6; flex-shrink: 0;';
        modeDialogBtn.addEventListener('click', () => switchMode('dialog'));

        const modeQuestBtn = document.createElement('button');
        modeQuestBtn.type = 'button';
        modeQuestBtn.id = 'margo-gv-mode-quest';
        modeQuestBtn.textContent = 'Questy';
        modeQuestBtn.style.cssText = 'padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; border: 1px solid #bb86fc; flex-shrink: 0;';
        modeQuestBtn.addEventListener('click', () => switchMode('quest'));

        const modeDbBtn = document.createElement('button');
        modeDbBtn.type = 'button';
        modeDbBtn.id = 'margo-gv-mode-db';
        modeDbBtn.textContent = 'Baza JSON';
        modeDbBtn.style.cssText = 'padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; border: 1px solid #ffb74d; flex-shrink: 0;';
        modeDbBtn.addEventListener('click', () => switchMode('db'));

        const titleEl = document.createElement('span');
        titleEl.id = 'margo-gv-title';
        titleEl.style.cssText = 'font-weight: bold; font-size: 13px; color: #03dac6; margin-left: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
        titleEl.textContent = 'Wizualizator Grafu';

        leftTop.appendChild(toggleSidebarBtn);
        leftTop.appendChild(modeDialogBtn);
        leftTop.appendChild(modeQuestBtn);
        leftTop.appendChild(modeDbBtn);
        leftTop.appendChild(titleEl);

        const rightTop = document.createElement('div');
        rightTop.style.cssText = 'display: flex; align-items: center; gap: 6px; flex-shrink: 0;';

        const refreshDbBtn = document.createElement('button');
        refreshDbBtn.type = 'button';
        refreshDbBtn.textContent = 'Odśwież';
        refreshDbBtn.style.cssText = 'background: #1f332e; border: 1px solid #03dac6; color: #03dac6; padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; flex-shrink: 0;';
        refreshDbBtn.addEventListener('click', async () => {
            if (currentMode === 'dialog') await fetchDialogsFromServer(currentEntityId);
            else if (currentMode === 'quest') await fetchQuestsFromServer();
            else await fetchCollectionList(currentCollection);
            renderSidebarList();
            renderActiveView();
        });

        const copyActiveBtn = document.createElement('button');
        copyActiveBtn.type = 'button';
        copyActiveBtn.textContent = 'Kopiuj JSON';
        copyActiveBtn.style.cssText = 'background: #222836; border: 1px solid #3c465c; color: #ffb74d; padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;';
        copyActiveBtn.addEventListener('click', () => {
            const payload = currentMode === 'db' ? currentDbDoc : currentRenderedGraph;
            if (!payload) return alert('Brak danych do skopiowania.');
            navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
            copyActiveBtn.textContent = 'Skopiowano!';
            setTimeout(() => { copyActiveBtn.textContent = 'Kopiuj JSON'; }, 900);
        });

        const fitBtn = document.createElement('button');
        fitBtn.type = 'button';
        fitBtn.id = 'margo-gv-fit-btn';
        fitBtn.textContent = 'Dopasuj';
        fitBtn.style.cssText = 'background: #222836; border: 1px solid #3c465c; color: #03dac6; padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;';
        fitBtn.addEventListener('click', fitViewToGraph);

        const autoLayoutBtn = document.createElement('button');
        autoLayoutBtn.type = 'button';
        autoLayoutBtn.id = 'margo-gv-autolayout-btn';
        autoLayoutBtn.textContent = 'Auto-układ';
        autoLayoutBtn.style.cssText = 'background: #2d2d2d; border: 1px solid #444; color: #bb86fc; padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold; flex-shrink: 0;';
        autoLayoutBtn.addEventListener('click', () => {
            if (!currentEntityId || currentMode === 'db') return;
            clearManualPositions(currentMode, currentEntityId);
            renderGraph();
        });

        const resetViewBtn = document.createElement('button');
        resetViewBtn.type = 'button';
        resetViewBtn.id = 'margo-gv-reset-btn';
        resetViewBtn.textContent = 'Reset';
        resetViewBtn.style.cssText = 'background: #2d2d2d; border: 1px solid #444; color: #e0e0e0; padding: 4px 9px; border-radius: 4px; cursor: pointer; font-size: 11px; flex-shrink: 0;';
        resetViewBtn.addEventListener('click', () => {
            panOffset = { x: 40, y: 40 };
            zoomScale = 1;
            applyCameraTransform();
        });

        const sourceBadge = document.createElement('span');
        sourceBadge.id = 'margo-gv-source-badge';
        sourceBadge.style.cssText = 'font-size: 11px; color: #b0bec5; padding: 3px 8px; background: #121620; border: 1px solid #2a3142; border-radius: 4px; white-space: nowrap; flex-shrink: 0;';
        sourceBadge.textContent = dataSourceLabel;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '×';
        closeBtn.style.cssText = 'background: #ff5656; border: none; color: #fff; width: 26px; height: 26px; border-radius: 4px; cursor: pointer; font-size: 16px; font-weight: bold; line-height: 1; flex-shrink: 0;';
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });

        rightTop.appendChild(refreshDbBtn);
        rightTop.appendChild(copyActiveBtn);
        rightTop.appendChild(fitBtn);
        rightTop.appendChild(autoLayoutBtn);
        rightTop.appendChild(resetViewBtn);
        rightTop.appendChild(sourceBadge);
        rightTop.appendChild(closeBtn);

        topBar.appendChild(leftTop);
        topBar.appendChild(rightTop);

        const bodyRow = document.createElement('div');
        bodyRow.style.cssText = 'display: flex; flex: 1; min-height: 0; overflow: hidden;';

        const sidebar = document.createElement('aside');
        sidebar.id = 'margo-gv-sidebar';
        sidebar.style.cssText = `
            width: 280px;
            min-width: 280px;
            background: #141822;
            border-right: 1px solid #2a3142;
            display: ${sidebarCollapsed ? 'none' : 'flex'};
            flex-direction: column;
            overflow: hidden;
        `;

        const searchBoxWrap = document.createElement('div');
        searchBoxWrap.style.cssText = 'padding: 8px; border-bottom: 1px solid #262e40; background: #181d29; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;';

        const colSelect = document.createElement('select');
        colSelect.id = 'margo-gv-col-select';
        colSelect.style.cssText = 'display: none; width: 100%; background: #0f131b; color: #ffb74d; border: 1px solid #3c465c; border-radius: 4px; padding: 5px 7px; font-size: 11px; font-weight: bold;';
        [
            { val: 'maps', label: 'Kolekcja: maps (Mapy)' },
            { val: 'gateways', label: 'Kolekcja: gateways (Przejścia)' },
            { val: 'map_npcs', label: 'Kolekcja: map_npcs (NPC na mapach)' },
            { val: 'battle_npcs', label: 'Kolekcja: battle_npcs (Walki)' },
            { val: 'shops', label: 'Kolekcja: shops (Sklepy)' },
            { val: 'dialog_trees', label: 'Kolekcja: dialog_trees (Dialogi)' },
            { val: 'quests', label: 'Kolekcja: quests (Questy)' }
        ].forEach(c => {
            const o = document.createElement('option');
            o.value = c.val;
            o.textContent = c.label;
            colSelect.appendChild(o);
        });
        colSelect.addEventListener('change', async () => {
            currentCollection = colSelect.value;
            currentEntityId = null;
            currentDbDoc = null;
            await fetchCollectionList(currentCollection);
            renderSidebarList();
            await renderDbDocument();
        });

        const searchInput = document.createElement('input');
        searchInput.id = 'margo-gv-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = 'Szukaj po nazwie lub ID...';
        searchInput.style.cssText = `
            width: 100%;
            box-sizing: border-box;
            background: #0f131b;
            color: #e6ecf8;
            border: 1px solid #35415c;
            border-radius: 4px;
            padding: 6px 8px;
            font-size: 12px;
            outline: none;
        `;
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.trim().toLowerCase();
            renderSidebarList();
        });

        searchBoxWrap.appendChild(colSelect);
        searchBoxWrap.appendChild(searchInput);

        const catalogListEl = document.createElement('div');
        catalogListEl.id = 'margo-gv-catalog-list';
        catalogListEl.style.cssText = 'flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 4px; min-height: 120px;';
        catalogListEl.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

        const inspectorEl = document.createElement('div');
        inspectorEl.id = 'margo-gv-inspector';
        inspectorEl.style.cssText = 'border-top: 1px solid #2a3142; background: #10141d; padding: 8px; max-height: 44%; overflow-y: auto; flex-shrink: 0; font-size: 11px;';
        inspectorEl.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

        sidebar.appendChild(searchBoxWrap);
        sidebar.appendChild(catalogListEl);
        sidebar.appendChild(inspectorEl);

        const viewport = document.createElement('div');
        viewport.id = 'margo-gv-viewport';
        viewport.style.cssText = `
            position: relative;
            flex: 1;
            overflow: hidden;
            cursor: grab;
            background-image: radial-gradient(#262d3d 1px, transparent 1px);
            background-size: 20px 20px;
        `;

        const stage = document.createElement('div');
        stage.id = 'margo-gv-stage';
        stage.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 4800px;
            height: 3200px;
            transform-origin: 0 0;
        `;

        const svgLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgLayer.id = 'margo-gv-svg';
        svgLayer.setAttribute('width', '4800');
        svgLayer.setAttribute('height', '3200');
        svgLayer.style.cssText = 'position: absolute; top: 0; left: 0; width: 4800px; height: 3200px; pointer-events: none; overflow: visible;';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'margo-gv-arrow');
        marker.setAttribute('markerWidth', '8');
        marker.setAttribute('markerHeight', '8');
        marker.setAttribute('refX', '6');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrowPath.setAttribute('d', 'M0,0 L0,6 L7,3 z');
        arrowPath.setAttribute('fill', '#03dac6');
        marker.appendChild(arrowPath);
        defs.appendChild(marker);
        svgLayer.appendChild(defs);

        const nodesLayer = document.createElement('div');
        nodesLayer.id = 'margo-gv-nodes';
        nodesLayer.style.cssText = 'position: relative; width: 100%; height: 100%;';

        const dbViewer = document.createElement('pre');
        dbViewer.id = 'margo-gv-db-viewer';
        dbViewer.style.cssText = `
            display: none;
            position: absolute;
            inset: 14px;
            margin: 0;
            padding: 12px;
            background: #0d1118;
            border: 1px solid #2b354b;
            border-radius: 6px;
            color: #03dac6;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.45;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
            user-select: text;
        `;
        dbViewer.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

        stage.appendChild(svgLayer);
        stage.appendChild(nodesLayer);
        viewport.appendChild(stage);
        viewport.appendChild(dbViewer);

        viewport.addEventListener('mousedown', (e) => {
            if (currentMode === 'db' || e.button !== 0) return;
            if (e.target.closest('[data-gv-node-id]') || e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            isPanning = true;
            viewport.style.cursor = 'grabbing';
            panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
            setSelectedNode(null);
        });

        window.addEventListener('mousemove', (e) => {
            if (activeDragNode) {
                const stageRect = document.getElementById('margo-gv-stage')?.getBoundingClientRect();
                if (!stageRect) return;
                const mouseStageX = (e.clientX - stageRect.left) / zoomScale;
                const mouseStageY = (e.clientY - stageRect.top) / zoomScale;

                const nextX = Math.max(0, Math.round(mouseStageX - activeDragNode.dragOffset.x));
                const nextY = Math.max(0, Math.round(mouseStageY - activeDragNode.dragOffset.y));

                activeDragNode.card.style.left = `${nextX}px`;
                activeDragNode.card.style.top = `${nextY}px`;
                activeDragNode.nodeData.position = { x: nextX, y: nextY };
                updateSvgEdges();
                return;
            }

            if (!isPanning) return;
            panOffset.x = e.clientX - panStart.x;
            panOffset.y = e.clientY - panStart.y;
            applyCameraTransform();
        }, true);

        window.addEventListener('mouseup', () => {
            if (activeDragNode) {
                if (currentEntityId && activeDragNode.nodeData?.position) {
                    saveManualPosition(
                        currentMode,
                        currentEntityId,
                        activeDragNode.nodeData.id,
                        activeDragNode.nodeData.position
                    );
                }
                activeDragNode = null;
            }
            if (isPanning) {
                isPanning = false;
                viewport.style.cursor = 'grab';
            }
        }, true);

        viewport.addEventListener('wheel', (e) => {
            if (currentMode === 'db') return;
            e.preventDefault();
            e.stopPropagation();

            const rect = viewport.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const prevScale = zoomScale;
            const step = e.deltaY < 0 ? 0.1 : -0.1;
            const nextScale = Math.min(1.8, Math.max(0.35, Number((prevScale + step).toFixed(2))));
            if (nextScale === prevScale) return;

            const stageX = (mouseX - panOffset.x) / prevScale;
            const stageY = (mouseY - panOffset.y) / prevScale;

            zoomScale = nextScale;
            panOffset.x = Math.round(mouseX - stageX * nextScale);
            panOffset.y = Math.round(mouseY - stageY * nextScale);

            applyCameraTransform();
        }, { passive: false });

        bodyRow.appendChild(sidebar);
        bodyRow.appendChild(viewport);

        modal.appendChild(topBar);
        modal.appendChild(bodyRow);

        attachGraphResizeHandles(modal);
        document.body.appendChild(modal);

        modalEl = modal;
        return modal;
    }

    function updateModeToolbarVisibility() {
        const colSelect = document.getElementById('margo-gv-col-select');
        const stage = document.getElementById('margo-gv-stage');
        const dbViewer = document.getElementById('margo-gv-db-viewer');
        const fitBtn = document.getElementById('margo-gv-fit-btn');
        const autoBtn = document.getElementById('margo-gv-autolayout-btn');
        const resetBtn = document.getElementById('margo-gv-reset-btn');
        const inspector = document.getElementById('margo-gv-inspector');

        const isDb = currentMode === 'db';
        if (colSelect) colSelect.style.display = isDb ? 'block' : 'none';
        if (stage) stage.style.display = isDb ? 'none' : 'block';
        if (dbViewer) dbViewer.style.display = isDb ? 'block' : 'none';
        if (fitBtn) fitBtn.style.display = isDb ? 'none' : 'inline-block';
        if (autoBtn) autoBtn.style.display = isDb ? 'none' : 'inline-block';
        if (resetBtn) resetBtn.style.display = isDb ? 'none' : 'inline-block';
        if (inspector) inspector.style.display = isDb ? 'none' : 'block';
    }

    function renderSidebarList() {
        const listEl = document.getElementById('margo-gv-catalog-list');
        const searchEl = document.getElementById('margo-gv-search-input');
        if (!listEl) return;

        if (searchEl) {
            searchEl.placeholder = currentMode === 'db'
                ? `Szukaj w ${currentCollection}...`
                : (currentMode === 'dialog' ? 'Szukaj NPC po nazwie lub ID...' : 'Szukaj questa po nazwie lub ID...');
        }

        const items = getCatalogItems().filter(it => {
            if (!searchQuery) return true;
            return String(it.name || '').toLowerCase().includes(searchQuery) || String(it.id || '').toLowerCase().includes(searchQuery);
        });

        if (items.length > 0 && (!currentEntityId || !items.some(i => String(i.id) === String(currentEntityId)))) {
            currentEntityId = String(items[0].id);
        }

        listEl.innerHTML = '';
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'color: #7b879e; font-size: 11px; padding: 10px 6px; text-align: center;';
            empty.textContent = searchQuery ? 'Brak dopasowań.' : 'Brak pozycji na liście.';
            listEl.appendChild(empty);
            return;
        }

        items.forEach(item => {
            const active = String(item.id) === String(currentEntityId);
            const row = document.createElement('button');
            row.type = 'button';
            const accent = currentMode === 'db' ? '#ffb74d' : (currentMode === 'dialog' ? '#03dac6' : '#bb86fc');
            row.style.cssText = `
                width: 100%;
                text-align: left;
                padding: 6px 8px;
                border-radius: 4px;
                cursor: pointer;
                background: ${active ? '#22304a' : '#181e2c'};
                border: 1px solid ${active ? accent : '#283145'};
                color: #e6ecf8;
                display: flex;
                flex-direction: column;
                gap: 2px;
            `;

            const nameLine = document.createElement('div');
            nameLine.style.cssText = 'font-size: 11px; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
            nameLine.textContent = item.name;

            const metaLine = document.createElement('div');
            metaLine.style.cssText = 'font-size: 10px; color: #9aa7c2; display: flex; justify-content: space-between;';
            metaLine.innerHTML = `<span>ID: ${item.id}</span><span>${item.meta || ''}</span>`;

            row.appendChild(nameLine);
            row.appendChild(metaLine);

            row.addEventListener('click', async () => {
                currentEntityId = String(item.id);
                selectedNodeId = null;
                panOffset = { x: 40, y: 40 };
                zoomScale = 1;
                renderSidebarList();
                if (currentMode === 'dialog') {
                    await fetchSingleDialogTree(currentEntityId);
                    renderGraph();
                } else if (currentMode === 'quest') {
                    renderGraph();
                } else {
                    await renderDbDocument();
                }
            });

            listEl.appendChild(row);
        });
    }

    async function renderDbDocument() {
        const dbViewer = document.getElementById('margo-gv-db-viewer');
        const titleEl = document.getElementById('margo-gv-title');
        if (!dbViewer || !titleEl) return;

        if (!currentEntityId) {
            currentDbDoc = null;
            titleEl.textContent = `Baza (${currentCollection}) · brak rekordu`;
            dbViewer.textContent = isLoadingRemote ? 'Ładowanie listy z MongoDB...' : 'Brak dokumentów w wybranej kolekcji.';
            return;
        }

        titleEl.textContent = `Baza (${currentCollection}) · ID: ${currentEntityId}`;
        dbViewer.textContent = 'Ładowanie dokumentu...';
        const doc = await fetchCollectionDocument(currentCollection, currentEntityId);
        currentDbDoc = doc;
        dbViewer.textContent = doc ? JSON.stringify(doc, null, 2) : 'Nie znaleziono dokumentu.';
    }

    function renderInspector() {
        const insp = document.getElementById('margo-gv-inspector');
        if (!insp) return;

        const graph = currentRenderedGraph;
        const node = selectedNodeId && graph?.nodes?.[selectedNodeId] ? graph.nodes[selectedNodeId] : null;

        if (!node) {
            insp.innerHTML = `<div style="color:#7b879e; font-style:italic;">Kliknij węzeł na grafie, aby zobaczyć szczegóły, koordynaty i JSON.</div>`;
            return;
        }

        insp.innerHTML = '';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; gap:6px;';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:bold; color:#03dac6; font-size:11px;';
        title.textContent = `${node.badge} · ${node.typeLabel}`;

        const copyJsonBtn = document.createElement('button');
        copyJsonBtn.type = 'button';
        copyJsonBtn.textContent = 'Kopiuj JSON';
        copyJsonBtn.style.cssText = 'background:#222836; border:1px solid #3c465c; color:#bb86fc; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:10px;';
        copyJsonBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(JSON.stringify(node.raw, null, 2));
            copyJsonBtn.textContent = 'Skopiowano!';
            setTimeout(() => { copyJsonBtn.textContent = 'Kopiuj JSON'; }, 900);
        });

        head.appendChild(title);
        head.appendChild(copyJsonBtn);
        insp.appendChild(head);

        if (node.content) {
            const desc = document.createElement('div');
            desc.style.cssText = 'color:#dce3f0; line-height:1.35; margin-bottom:6px; word-break:break-word;';
            desc.textContent = node.content;
            insp.appendChild(desc);
        }

        if (Array.isArray(node.locations) && node.locations.length > 0) {
            const locBox = document.createElement('div');
            locBox.style.cssText = 'background:#161c29; border:1px solid #2b354b; border-radius:4px; padding:5px 6px; margin-bottom:6px;';
            locBox.innerHTML = `<div style="font-size:10px; font-weight:bold; color:#03dac6; margin-bottom:3px;">Lokacje (${node.locations.length}):</div>` +
                node.locations.map(l => `<div style="font-size:10px; color:#b8c4dc;">• ${l}</div>`).join('');
            insp.appendChild(locBox);
        }

        const toggleRawBtn = document.createElement('button');
        toggleRawBtn.type = 'button';
        toggleRawBtn.textContent = inspectorJsonOpen ? 'Ukryj JSON ▲' : 'Pokaż JSON ▼';
        toggleRawBtn.style.cssText = 'background:#181e2c; border:1px solid #2c3549; color:#9aa7c2; padding:2px 6px; border-radius:3px; cursor:pointer; font-size:10px;';

        const pre = document.createElement('pre');
        pre.style.cssText = `display:${inspectorJsonOpen ? 'block' : 'none'}; margin:5px 0 0; padding:6px; background:#0b0e14; color:#ce9178; font-size:9px; white-space:pre-wrap; word-break:break-all; border-radius:4px;`;
        pre.textContent = JSON.stringify(node.raw, null, 2);

        toggleRawBtn.addEventListener('click', () => {
            inspectorJsonOpen = !inspectorJsonOpen;
            pre.style.display = inspectorJsonOpen ? 'block' : 'none';
            toggleRawBtn.textContent = inspectorJsonOpen ? 'Ukryj JSON ▲' : 'Pokaż JSON ▼';
        });

        insp.appendChild(toggleRawBtn);
        insp.appendChild(pre);
    }

    function setSelectedNode(nodeId) {
        selectedNodeId = nodeId;
        highlightSelection();
        renderInspector();
    }

    function updateModeButtons() {
        const dBtn = document.getElementById('margo-gv-mode-dialog');
        const qBtn = document.getElementById('margo-gv-mode-quest');
        const dbBtn = document.getElementById('margo-gv-mode-db');
        if (!dBtn || !qBtn || !dbBtn) return;

        dBtn.style.background = currentMode === 'dialog' ? '#03dac6' : '#222836';
        dBtn.style.color = currentMode === 'dialog' ? '#121212' : '#03dac6';

        qBtn.style.background = currentMode === 'quest' ? '#bb86fc' : '#222836';
        qBtn.style.color = currentMode === 'quest' ? '#121212' : '#bb86fc';

        dbBtn.style.background = currentMode === 'db' ? '#ffb74d' : '#222836';
        dbBtn.style.color = currentMode === 'db' ? '#121212' : '#ffb74d';
    }

    async function switchMode(mode, entityId = null) {
        currentMode = ['quest', 'db'].includes(mode) ? mode : 'dialog';
        selectedNodeId = null;
        panOffset = { x: 40, y: 40 };
        zoomScale = 1;
        updateModeButtons();
        updateModeToolbarVisibility();
        renderSidebarList();
        await renderActiveView();

        if (currentMode === 'dialog') {
            await fetchDialogsFromServer(entityId || currentEntityId);
        } else if (currentMode === 'quest') {
            await fetchQuestsFromServer();
        } else {
            await fetchCollectionList(currentCollection);
        }

        renderSidebarList();
        await renderActiveView();
    }

    async function renderActiveView() {
        if (currentMode === 'db') {
            await renderDbDocument();
        } else {
            renderGraph();
        }
    }

    function openGraph(mode = 'dialog', entityId = null) {
        const modal = ensureModal();
        modal.style.display = 'flex';
        if (entityId) currentEntityId = String(entityId);
        switchMode(mode, entityId);
    }

    function updateSvgEdges() {
        const graph = currentRenderedGraph;
        const svg = document.getElementById('margo-gv-svg');
        const nodesLayer = document.getElementById('margo-gv-nodes');
        if (!graph || !svg || !nodesLayer) return;

        Array.from(svg.querySelectorAll('path.margo-gv-edge, text.margo-gv-edge-label')).forEach(el => el.remove());

        (graph.edges || []).forEach(edge => {
            const fromCard = nodesLayer.querySelector(`[data-gv-node-id="${edge.fromNodeId}"]`);
            const toCard = nodesLayer.querySelector(`[data-gv-node-id="${edge.toNodeId}"]`);
            if (!fromCard || !toCard) return;

            const linkRow = fromCard.querySelector(`[data-gv-link-idx="${edge.fromLinkIndex}"]`);
            const fromX = fromCard.offsetLeft + fromCard.offsetWidth;
            const fromY = linkRow
                ? (fromCard.offsetTop + linkRow.offsetTop + linkRow.offsetHeight / 2)
                : (fromCard.offsetTop + 40);

            const toX = toCard.offsetLeft;
            const toY = toCard.offsetTop + 26;

            const isLoopEdge = toX <= fromX + 20;
            const dx = Math.max(60, Math.abs(toX - fromX) * 0.5);
            const pathData = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('margo-gv-edge');
            path.dataset.fromId = edge.fromNodeId;
            path.dataset.toId = edge.toNodeId;
            path.dataset.isLoop = isLoopEdge ? '1' : '0';
            path.setAttribute('d', pathData);
            path.setAttribute('fill', 'none');
            path.setAttribute('stroke', isLoopEdge ? '#ffab40' : '#03dac6');
            path.setAttribute('stroke-width', '2');
            if (isLoopEdge) path.setAttribute('stroke-dasharray', '5,4');
            path.setAttribute('marker-end', 'url(#margo-gv-arrow)');

            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.classList.add('margo-gv-edge-label');
            label.dataset.fromId = edge.fromNodeId;
            label.dataset.toId = edge.toNodeId;
            label.setAttribute('x', String((fromX + toX) / 2));
            label.setAttribute('y', String((fromY + toY) / 2 - 6));
            label.setAttribute('fill', isLoopEdge ? '#ffab40' : '#bb86fc');
            label.setAttribute('font-size', '11');
            label.setAttribute('text-anchor', 'middle');
            label.textContent = edge.label || '';

            svg.appendChild(path);
            svg.appendChild(label);
        });

        highlightSelection();
    }

    function highlightSelection() {
        const svg = document.getElementById('margo-gv-svg');
        const nodesLayer = document.getElementById('margo-gv-nodes');
        if (!svg || !nodesLayer) return;

        const connectedIds = new Set();
        if (selectedNodeId) {
            connectedIds.add(selectedNodeId);
            (currentRenderedGraph?.edges || []).forEach(e => {
                if (e.fromNodeId === selectedNodeId) connectedIds.add(e.toNodeId);
                if (e.toNodeId === selectedNodeId) connectedIds.add(e.fromNodeId);
            });
        }

        nodesLayer.querySelectorAll('[data-gv-node-id]').forEach(card => {
            const id = card.dataset.gvNodeId;
            if (!selectedNodeId) {
                card.style.opacity = '1';
                card.style.boxShadow = '0 6px 18px rgba(0, 0, 0, 0.45)';
            } else if (id === selectedNodeId) {
                card.style.opacity = '1';
                card.style.boxShadow = '0 0 0 2px #ffab40, 0 8px 22px rgba(0, 0, 0, 0.65)';
            } else if (connectedIds.has(id)) {
                card.style.opacity = '1';
                card.style.boxShadow = '0 0 0 1px #03dac6, 0 6px 18px rgba(0, 0, 0, 0.5)';
            } else {
                card.style.opacity = '0.38';
                card.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.35)';
            }
        });

        svg.querySelectorAll('path.margo-gv-edge').forEach(path => {
            const isLoop = path.dataset.isLoop === '1';
            const active = selectedNodeId &&
                (path.dataset.fromId === selectedNodeId || path.dataset.toId === selectedNodeId);
            path.setAttribute('stroke', active ? '#ff5252' : (isLoop ? '#ffab40' : '#03dac6'));
            path.setAttribute('stroke-width', active ? '3' : '2');
            path.setAttribute('opacity', !selectedNodeId || active ? '1' : '0.25');
        });
    }

    function createCollapsibleContent(nodeId, text) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding: 8px 10px; font-size: 11px; color: #dce3f0; line-height: 1.38; border-bottom: 1px solid #2b354b;';

        const content = String(text || '').trim();
        if (!content) {
            wrapper.style.color = '#8c98b0';
            wrapper.style.fontStyle = 'italic';
            wrapper.textContent = '(brak treści)';
            return wrapper;
        }

        const LIMIT = 140;
        if (content.length <= LIMIT) {
            wrapper.textContent = content;
            return wrapper;
        }

        const sectionKey = `${currentMode}:${currentEntityId}:${nodeId}:content`;
        let isOpen = expandedCardSections.has(sectionKey);

        const textEl = document.createElement('div');
        textEl.textContent = isOpen ? content : `${content.slice(0, LIMIT)}…`;

        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.textContent = isOpen ? 'Zwiń treść ▲' : `Rozwiń pełny tekst (${content.length} zn.) ▼`;
        toggleBtn.style.cssText = 'margin-top: 5px; background: #161c29; border: 1px solid #35415c; color: #03dac6; font-size: 10px; padding: 2px 6px; border-radius: 3px; cursor: pointer;';

        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            isOpen = !isOpen;
            if (isOpen) expandedCardSections.add(sectionKey);
            else expandedCardSections.delete(sectionKey);

            textEl.textContent = isOpen ? content : `${content.slice(0, LIMIT)}…`;
            toggleBtn.textContent = isOpen ? 'Zwiń treść ▲' : `Rozwiń pełny tekst (${content.length} zn.) ▼`;
            requestAnimationFrame(updateSvgEdges);
        });

        wrapper.appendChild(textEl);
        wrapper.appendChild(toggleBtn);
        return wrapper;
    }

    function createCollapsibleSection(section) {
        const fullKey = `${currentMode}:${currentEntityId}:${section.key}`;
        let isOpen = expandedCardSections.has(fullKey);

        const box = document.createElement('div');
        box.style.cssText = 'border-bottom: 1px solid #2b354b; background: #161c29;';

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 5px 10px;
            cursor: pointer;
            font-size: 10px;
            font-weight: bold;
            color: ${section.accent || '#03dac6'};
            user-select: none;
        `;

        const titleSpan = document.createElement('span');
        titleSpan.textContent = section.title;

        const arrowSpan = document.createElement('span');
        arrowSpan.textContent = isOpen ? '▼' : '▶';

        header.appendChild(titleSpan);
        header.appendChild(arrowSpan);

        const body = document.createElement('div');
        body.style.cssText = `
            display: ${isOpen ? 'flex' : 'none'};
            flex-direction: column;
            gap: 5px;
            padding: 6px 10px 8px;
            max-height: 190px;
            overflow-y: auto;
            background: #121722;
        `;
        body.addEventListener('wheel', e => e.stopPropagation(), { passive: true });

        (section.items || []).forEach(item => {
            const row = document.createElement('div');
            row.style.cssText = 'font-size: 10px; color: #dce3f0; background: #1b2232; padding: 4px 6px; border-radius: 3px; border: 1px solid #293349;';

            const primaryEl = document.createElement('div');
            primaryEl.style.fontWeight = 'bold';
            primaryEl.textContent = item.primary || '';
            row.appendChild(primaryEl);

            if (item.detail) {
                const detailEl = document.createElement('div');
                detailEl.style.cssText = 'color: #9aa7c2; margin-top: 2px; word-break: break-word;';
                detailEl.textContent = item.detail;
                row.appendChild(detailEl);
            }

            if (item.code) {
                const codeEl = document.createElement('pre');
                codeEl.style.cssText = 'margin: 4px 0 0; padding: 4px; background: #0d111a; color: #ce9178; font-size: 9px; white-space: pre-wrap; word-break: break-all; border-radius: 3px;';
                codeEl.textContent = item.code;
                row.appendChild(codeEl);
            }

            body.appendChild(row);
        });

        header.addEventListener('click', (e) => {
            e.stopPropagation();
            isOpen = !isOpen;
            if (isOpen) expandedCardSections.add(fullKey);
            else expandedCardSections.delete(fullKey);

            body.style.display = isOpen ? 'flex' : 'none';
            arrowSpan.textContent = isOpen ? '▼' : '▶';
            requestAnimationFrame(updateSvgEdges);
        });

        box.appendChild(header);
        box.appendChild(body);
        return box;
    }

    function renderGraph() {
        const nodesLayer = document.getElementById('margo-gv-nodes');
        const titleEl = document.getElementById('margo-gv-title');
        if (!nodesLayer || !titleEl) return;

        nodesLayer.innerHTML = '';
        applyCameraTransform();

        if (!currentEntityId) {
            currentRenderedGraph = null;
            titleEl.textContent = isLoadingRemote
                ? 'Pobieranie danych...'
                : (currentMode === 'dialog' ? 'Brak dialogów' : 'Brak questów');
            renderInspector();
            return;
        }

        const graph = currentMode === 'dialog'
            ? buildVisualDialogGraph(currentEntityId)
            : buildVisualQuestGraph(currentEntityId);

        currentRenderedGraph = graph;
        if (!graph) {
            titleEl.textContent = isLoadingRemote ? 'Ładowanie grafu...' : 'Brak danych dla wybranej pozycji';
            renderInspector();
            return;
        }

        titleEl.textContent = `${graph.title} · węzły: ${Object.keys(graph.nodes).length}`;

        Object.keys(graph.nodes).forEach(nodeId => {
            const n = graph.nodes[nodeId];
            const pos = n.position || { x: 60, y: 60 };

            const card = document.createElement('div');
            card.dataset.gvNodeId = nodeId;
            card.style.cssText = `
                position: absolute;
                left: ${pos.x}px;
                top: ${pos.y}px;
                width: 310px;
                background: #1b2232;
                border: 1px solid ${n.isStart ? '#bb86fc' : '#3a4661'};
                border-radius: 6px;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
                overflow: hidden;
                user-select: none;
                transition: opacity 0.15s ease;
            `;

            card.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                setSelectedNode(nodeId);
            });

            const cardHeader = document.createElement('div');
            cardHeader.style.cssText = `
                padding: 7px 10px;
                background: #252f45;
                border-bottom: 1px solid #35415c;
                cursor: move;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                font-weight: bold;
                color: #fff;
            `;

            const idBadge = document.createElement('span');
            idBadge.textContent = n.badge;
            idBadge.style.color = n.isStart ? '#bb86fc' : '#03dac6';

            const rightBadges = document.createElement('div');
            rightBadges.style.cssText = 'display: flex; align-items: center; gap: 4px;';

            (n.highlights || []).forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.textContent = tag;
                tagEl.style.cssText = 'font-size: 9px; color: #121212; background: #ffab40; padding: 1px 5px; border-radius: 3px; font-weight: bold;';
                rightBadges.appendChild(tagEl);
            });

            const typeBadge = document.createElement('span');
            typeBadge.textContent = n.typeLabel;
            typeBadge.style.cssText = 'font-size: 10px; color: #a7b4cc; background: #161c29; padding: 2px 6px; border-radius: 3px;';
            rightBadges.appendChild(typeBadge);

            cardHeader.appendChild(idBadge);
            cardHeader.appendChild(rightBadges);

            cardHeader.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                setSelectedNode(nodeId);
                const stageRect = document.getElementById('margo-gv-stage').getBoundingClientRect();
                const mouseStageX = (e.clientX - stageRect.left) / zoomScale;
                const mouseStageY = (e.clientY - stageRect.top) / zoomScale;
                activeDragNode = {
                    card,
                    nodeData: n,
                    dragOffset: {
                        x: mouseStageX - card.offsetLeft,
                        y: mouseStageY - card.offsetTop
                    }
                };
            });

            card.appendChild(cardHeader);
            card.appendChild(createCollapsibleContent(nodeId, n.content));

            (n.sections || []).forEach(sec => {
                card.appendChild(createCollapsibleSection(sec));
            });

            const linksBox = document.createElement('div');
            linksBox.style.cssText = 'padding: 6px 8px; display: flex; flex-direction: column; gap: 4px;';

            if (!n.links || n.links.length === 0) {
                const emptyOpt = document.createElement('div');
                emptyOpt.style.cssText = 'font-size: 10px; color: #8c98b0; font-style: italic;';
                emptyOpt.textContent = 'Koniec gałęzi';
                linksBox.appendChild(emptyOpt);
            } else {
                n.links.forEach(link => {
                    const row = document.createElement('div');
                    row.dataset.gvLinkIdx = String(link.index);
                    row.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 6px;
                        padding: 4px 6px;
                        border-radius: 4px;
                        background: ${link.active ? '#23314d' : '#181e2c'};
                        border: 1px solid ${link.active ? '#03dac6' : '#2c3549'};
                        font-size: 10px;
                    `;

                    const labelSpan = document.createElement('span');
                    labelSpan.style.cssText = 'color: #e6ecf8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    labelSpan.textContent = link.leftText;

                    const linkSpan = document.createElement('span');
                    linkSpan.style.cssText = `flex-shrink: 0; font-weight: bold; color: ${link.active ? '#03dac6' : '#7b879e'};`;
                    linkSpan.textContent = link.rightText;

                    row.appendChild(labelSpan);
                    row.appendChild(linkSpan);
                    linksBox.appendChild(row);
                });
            }

            card.appendChild(linksBox);
            nodesLayer.appendChild(card);
        });

        renderInspector();
        requestAnimationFrame(updateSvgEdges);
    }

    function refreshIfOpen(mode = null) {
        if (!modalEl || modalEl.style.display !== 'flex') return;
        if (mode && mode !== currentMode) return;
        renderSidebarList();
        renderGraph();
    }

    winRef.MargoGraphEngine = {
        openDialogGraph(npcId = null, dialogsMap = null) {
            if (dialogsMap) externalData.dialogs = dialogsMap;
            openGraph('dialog', npcId);
        },
        openQuestGraph(questId = null, questsMap = null) {
            if (questsMap) externalData.quests = questsMap;
            openGraph('quest', questId);
        },
        openDbBrowser(collection = 'maps', entityId = null) {
            if (collection) currentCollection = collection;
            openGraph('db', entityId);
        },
        updateData(type, dataMap) {
            if (type === 'dialog') {
                externalData.dialogs = dataMap;
                if (dataMap && typeof dataMap === 'object') {
                    Object.assign(remoteData.dialogsMap, dataMap);
                }
                refreshIfOpen('dialog');
            } else if (type === 'quest') {
                externalData.quests = dataMap;
                if (dataMap && typeof dataMap === 'object') {
                    Object.assign(remoteData.questsMap, dataMap);
                }
                refreshIfOpen('quest');
            }
        }
    };
})();