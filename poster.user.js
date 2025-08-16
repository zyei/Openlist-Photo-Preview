// ==UserScript==
// @name         Alist Poster Wall v4.2 Idempotent
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  v4.2 "Idempotent" introduces a robust state-syncing mechanism to prevent duplicate poster generation when navigating, fixing critical layout and state-corruption bugs.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Poster Wall] Script v4.2 (Idempotent) is running!');

    const API_FS_LIST_ENDPOINT = '/api/fs/list';
    const API_FS_LINK_ENDPOINT = '/api/fs/link';
    const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.jxl']);
    const CACHE_KEY_PREFIX = 'alist_poster_cache_v4.2_';
    const MAX_CONCURRENT_SCANS = 5;

    let intersectionObserver = null;
    let galleryState = {};

    // --- 样式 (与 v4.0/4.1 一致) ---
    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1); }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css {
            position: relative; z-index: 1; background-color: #f8f9fa;
            --c1: #f0f8ff; --c2: #fff0f5; --c3: #f5fffa; --c4: #fffacd;
            background-image: linear-gradient(135deg, var(--c1), var(--c2), var(--c3), var(--c4));
            background-size: 400% 400%; animation: pearlescentAnimation 30s ease infinite;
        }
        @keyframes pearlescentAnimation { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            background-image: radial-gradient(ellipse at 70% 20%, rgba(255, 255, 255, 0.45) 0%, transparent 50%);
            background-repeat: no-repeat; background-size: 200% 200%;
            animation: metallicLusterAnimation 18s ease-in-out infinite alternate;
            pointer-events: none; z-index: -1;
        }
        @keyframes metallicLusterAnimation { 0% { background-position: -50% -50%; } 100% { background-position: 150% 150%; } }
        .poster-mode-active .hope-c-PJLV-ifZgGH-css::after {
            content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39sbGxvb29xcXGTk5NpaWmRkZGtra2YmJikpKSnp6e6urqioqK7u7vBwcGRs20AAAAuSURBVDjL7dBEAQAgEMCwA/9/mB8jUr83AST9S7y9cwAAAAAAAAAAAAAAAAAA4G4A0x8AASs0GAAAAABJRU5ErkJggg==');
            background-repeat: repeat; opacity: 0.3; pointer-events: none; z-index: -1;
        }
        #root.poster-mode-active > .hope-c-PJLV-iicyfOA-css { max-width: 100% !important; }
        .poster-mode-active .hope-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important; gap: 30px !important; padding: 20px 3vw !important; }
        .grid-item.native-hidden { visibility: hidden !important; height: 0; overflow: hidden; }
        .poster-card-container { aspect-ratio: 2 / 3; position: relative; transition: transform 0.6s var(--ease-in-out-cubic); }
        .grid-item.is-skeleton { background-color: #e2e8f0; border-radius: 8px; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        html[data-theme="dark"] .grid-item.is-skeleton { background-color: #4a5568; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .poster-card { display: block; width: 100%; height: 100%; border-radius: 8px; overflow: hidden; background-color: #f0f2f5; box-shadow: 0 8px 25px -5px rgba(0,0,0,0.15); transition: box-shadow 0.3s var(--ease-out-quart); position: relative; }
        html[data-theme="dark"] .poster-card { background-color: #2d3748; }
        .poster-card:hover { box-shadow: 0 15px 30px -5px rgba(0,0,0,0.25); z-index: 10; }
        .poster-card-img { width: 100%; height: 100%; object-fit: cover !important; opacity: 0; transition: opacity 0.8s var(--ease-out-quart); }
        .poster-card-img.loaded { opacity: 1; }
        .poster-card-info { position: absolute; bottom: 0; left: 0; right: 0; padding: 25px 15px 15px; background: linear-gradient(to top, rgba(0,0,0,0.85), transparent); color: white !important; font-size: 1em; font-weight: 600; text-shadow: 0 2px 4px black; border-radius: 0 0 inherit; z-index: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    `);

    // --- Web Worker 代码 (不变) ---
    const workerCode = `self.onmessage=async e=>{let{id:a,signedUrl:t}=e.data;try{let c=await fetch(t,{priority:"low"});if(!c.ok)throw new Error("Fetch failed");let s=await c.blob(),i=await createImageBitmap(s),l=new OffscreenCanvas(20,20),r=l.getContext("2d");r.drawImage(i,0,0,20,20);let o=r.getImageData(0,0,20,20).data,n={};for(let d=0;d<o.length;d+=4)if(o[d+3]>=128){let p=\`\${o[d]},\${o[d+1]},\${o[d+2]}\`;n[p]=(n[p]||0)+1}let m=Object.keys(n).reduce((g,h)=>n[g]>n[h]?g:h);self.postMessage({id:a,imageBitmap:i,dominantColor:m},[i])}catch(u){self.postMessage({id:a,error:u.message})}}`;
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });

    // --- 核心逻辑 ---
    function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); }; }

    function initializeState() {
        if (galleryState.controller) galleryState.controller.abort();
        if (intersectionObserver) intersectionObserver.disconnect();
        galleryState = {
            isActive: false, cards: new Map(), // 使用 Map 以路径为 key，提高查找效率
            visibleSet: new Set(), activeScans: 0,
            worker: galleryState.worker || null, controller: new AbortController(),
        };
    }

    function ensureWorkerIsReady() { if (!galleryState.worker) { galleryState.worker = new Worker(URL.createObjectURL(workerBlob)); galleryState.worker.onmessage = handleWorkerMessage; } }
    function isGridViewActive() { return !!document.querySelector('.obj-box .hope-grid'); }
    function togglePosterMode(isActive) { document.querySelector('#root')?.classList.toggle('poster-mode-active', isActive); }

    // [v4.2] 核心改动：Idempotent Scan/Sync function
    function syncAndScanFolders() {
        if (!isGridViewActive()) {
            if (galleryState.isActive) { // 只有在激活状态才需要清理
                togglePosterMode(false);
                document.querySelectorAll('.poster-card-container').forEach(c => c.remove());
                document.querySelectorAll('.grid-item[data-poster-processed]').forEach(item => {
                    item.classList.remove('native-hidden');
                    item.removeAttribute('data-poster-processed');
                });
                initializeState(); // 完全退出时重置
            }
            return;
        }

        if (!galleryState.isActive) { // 首次进入
            galleryState.isActive = true;
            ensureWorkerIsReady();
            setupLazyLoading();
        }
        togglePosterMode(true);

        const currentItems = new Set(document.querySelectorAll('.obj-box .grid-item'));

        // Cleanup: 移除不再存在于 DOM 中的卡片
        for (const [path, task] of galleryState.cards.entries()) {
            if (!currentItems.has(task.el)) {
                task.el.posterContainer?.remove();
                galleryState.cards.delete(path);
            }
        }

        // Addition: 为新的、未处理的文件夹卡片创建任务
        currentItems.forEach(item => {
            if (item.dataset.posterProcessed) return; // 跳过已处理的

            const path = decodeURIComponent(new URL(item.href).pathname);
            if (galleryState.cards.has(path)) return; // 跳过已在内存中的

            const isFolder = item.querySelector('svg [d^="M496 152a56"]');
            const task = {
                id: path, // 使用路径作为唯一ID
                state: isFolder ? 'idle' : 'done_file', // 文件视为另一种完成状态
                el: item,
                path
            };

            galleryState.cards.set(path, task);
            if (isFolder) {
                intersectionObserver.observe(item);
            } else {
                item.dataset.posterProcessed = "true"; // 标记文件为已处理
            }
        });

        requestIdleCallback(processScanQueue);
    }

    function processScanQueue() {
        if (galleryState.activeScans >= MAX_CONCURRENT_SCANS) return;
        let nextTask = Array.from(galleryState.visibleSet).map(path => galleryState.cards.get(path)).find(task => task && task.state === 'idle');
        if (!nextTask) nextTask = Array.from(galleryState.cards.values()).find(t => t && t.state === 'idle');
        if (nextTask) transitionState(nextTask, 'SCAN');
    }

    async function scanFolder(task) {
        galleryState.activeScans++;
        const { signal } = galleryState.controller;
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${task.path}`;
            const cachedCover = sessionStorage.getItem(cacheKey);
            if (cachedCover) { transitionState(task, 'SCAN_SUCCESS', { signedUrl: cachedCover === 'null' ? null : cachedCover }); return; }
            const listResp = await fetch(API_FS_LIST_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: task.path, page: 1, per_page: 10 }), signal });
            const listData = await listResp.json();
            const firstImage = listData?.data?.content?.find(f => IMAGE_EXTENSIONS.has(('.' + f.name.split('.').pop()).toLowerCase()));
            if (firstImage) {
                const fullPath = `${task.path.endsWith('/') ? task.path : task.path + '/'}${firstImage.name}`;
                const linkResp = await fetch(API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: fullPath }), signal });
                const linkData = await linkResp.json();
                const signedUrl = linkData?.data?.url;
                if (signedUrl) { sessionStorage.setItem(cacheKey, signedUrl); transitionState(task, 'SCAN_SUCCESS', { signedUrl }); }
                else throw new Error("Signed URL not found.");
            } else { sessionStorage.setItem(cacheKey, 'null'); transitionState(task, 'NO_IMAGES_FOUND'); }
        } catch (error) {
            if (error.name !== 'AbortError') { console.error(`[Poster Wall] Scan failed for ${task.path}:`, error); transitionState(task, 'SCAN_ERROR'); }
        } finally { galleryState.activeScans--; requestIdleCallback(processScanQueue); }
    }

    function handleWorkerMessage({ data: { id, imageBitmap, dominantColor, error } }) {
        const task = galleryState.cards.get(id); if (!task) return;
        if (error) { transitionState(task, 'WORKER_ERROR'); return; }
        task.imageBitmap = imageBitmap; task.dominantColor = dominantColor;
        transitionState(task, 'WORKER_SUCCESS');
    }

    function setupLazyLoading() {
        if (intersectionObserver) intersectionObserver.disconnect();
        intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const path = decodeURIComponent(new URL(entry.target.href).pathname);
                const task = galleryState.cards.get(path);
                if (!task) return;
                if (entry.isIntersecting) {
                    galleryState.visibleSet.add(path);
                    if (task.state === 'idle') requestIdleCallback(processScanQueue);
                } else { galleryState.visibleSet.delete(path); }
            });
        }, { root: null, rootMargin: '100% 0px' });
    }

    function transitionState(task, action, payload = {}) {
        if (!task || !task.el) return;
        const card = task.el;
        switch (task.state) {
            case 'idle':
                if (action === 'SCAN') { task.state = 'scanning'; card.classList.add('is-skeleton'); scanFolder(task); }
                break;
            case 'scanning':
                if (action === 'SCAN_SUCCESS') {
                    if (payload.signedUrl) { task.state = 'pending_worker'; task.signedUrl = payload.signedUrl; galleryState.worker.postMessage({ id: task.id, signedUrl: task.signedUrl }); }
                    else { task.state = 'done'; card.classList.remove('is-skeleton'); card.dataset.posterProcessed = "true"; }
                } else if (action === 'NO_IMAGES_FOUND' || action === 'SCAN_ERROR') { task.state = 'done'; card.classList.remove('is-skeleton'); card.dataset.posterProcessed = "true"; }
                break;
            case 'pending_worker':
                if (action === 'WORKER_SUCCESS') { task.state = 'transforming'; animateCardTransformation(task); }
                else if (action === 'WORKER_ERROR') { task.state = 'done'; card.classList.remove('is-skeleton'); card.dataset.posterProcessed = "true"; }
                break;
        }
    }

    function animateCardTransformation(task) {
        const { el: originalElement, dominantColor, signedUrl } = task;
        const folderName = originalElement.querySelector('p[class*="hope-text"]').textContent;
        const container = document.createElement('div'); container.className = 'poster-card-container';
        const cardLink = document.createElement('a'); cardLink.className = 'poster-card'; cardLink.href = originalElement.href;
        cardLink.innerHTML = `<img class="poster-card-img" src="${signedUrl}"><div class="poster-card-info">${folderName}</div>`;
        container.appendChild(cardLink);
        const first = originalElement.getBoundingClientRect();
        originalElement.classList.add('native-hidden');
        originalElement.parentElement.insertBefore(container, originalElement);
        originalElement.posterContainer = container; // Link for cleanup
        cardLink.style.boxShadow = `0 15px 30px -5px rgba(${dominantColor}, 0.4), 0 8px 15px -5px rgba(${dominantColor}, 0.2)`;
        const last = container.getBoundingClientRect();
        const deltaX = first.left - last.left, deltaY = first.top - last.top;
        const deltaW = first.width / last.width, deltaH = first.height / last.height;
        container.style.transformOrigin = 'top left';
        container.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})`;
        requestAnimationFrame(() => { container.style.transform = 'none'; });
        const img = cardLink.querySelector('.poster-card-img');
        img.onload = () => img.classList.add('loaded');
        task.state = 'done';
        originalElement.dataset.posterProcessed = "true"; // [v4.2] Mark as processed
    }

    function initialize() {
        initializeState();
        const rootObserver = new MutationObserver((_, obs) => {
            const mainContentArea = document.querySelector(".obj-box");
            if (mainContentArea) {
                const debouncedSync = debounce(syncAndScanFolders, 300);
                const observer = new MutationObserver(debouncedSync);
                observer.observe(mainContentArea, { childList: true, subtree: true });
                syncAndScanFolders(); // Initial scan
                obs.disconnect();
            }
        });
        rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    initialize();

})();
