// ==UserScript==
// @name         Alist Poster Wall v3.1 Genesis
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  The definitive poster wall for Alist, architected with a state-machine, FLIP animations, dominant color extraction, and a fully off-thread data pipeline.
// @author       Your Name & AI
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Poster Wall] Script v3.1 (Genesis) is running!');

    const API_FS_LIST_ENDPOINT = '/api/fs/list';
    const API_FS_LINK_ENDPOINT = '/api/fs/link';
    const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.jxl']);
    const CACHE_KEY_PREFIX = 'alist_poster_cache_v3.1_';
    const MAX_CONCURRENT_SCANS = 5;

    let intersectionObserver = null;
    let galleryState = {};
    const initialGalleryState = () => ({
        isActive: false,
        cards: [],
        visibleSet: new Set(),
        activeScans: 0,
        worker: null,
    });

    GM_addStyle(`
        :root { --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); --ease-in-out-cubic: cubic-bezier(0.645, 0.045, 0.355, 1); }
        #root.poster-mode-active > .hope-c-PJLV-iicyfOA-css { max-width: 100% !important; }
        .poster-mode-active .hope-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important; gap: 30px !important; padding: 20px 3vw !important; }
        .grid-item.native-hidden { display: none !important; }

        .poster-card-container {
            aspect-ratio: 2 / 3;
            position: relative;
            will-change: transform;
        }

        .grid-item.is-skeleton {
            background-color: #e2e8f0;
            border-radius: 8px;
            animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        html[data-theme="dark"] .grid-item.is-skeleton { background-color: #4a5568; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }

        .poster-card {
            display: block; width: 100%; height: 100%;
            border-radius: 8px; overflow: hidden;
            background-color: #f0f2f5;
            box-shadow: 0 8px 25px -5px rgba(0,0,0,0.15);
            transition: box-shadow 0.3s var(--ease-out-quart);
            position: relative;
        }
        html[data-theme="dark"] .poster-card { background-color: #2d3748; }
        .poster-card:hover {
            box-shadow: 0 15px 30px -5px rgba(0,0,0,0.25);
            z-index: 10;
        }

        .poster-card-img {
            width: 100%; height: 100%;
            object-fit: cover !important;
            opacity: 0;
            transition: opacity 0.8s var(--ease-out-quart);
        }
        .poster-card-img.loaded { opacity: 1; }

        .poster-card-info {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 25px 15px 15px;
            background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
            color: white !important;
            font-size: 1em; font-weight: 600;
            text-shadow: 0 2px 4px black;
            border-radius: 0 0 inherit; z-index: 1;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
    `);

    const workerCode = `
        self.onmessage = async (event) => {
            const { id, signedUrl } = event.data;
            try {
                const response = await fetch(signedUrl, { priority: "low" });
                if (!response.ok) throw new Error('Fetch failed');
                const blob = await response.blob();
                const imageBitmap = await createImageBitmap(blob);

                const canvas = new OffscreenCanvas(20, 20);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imageBitmap, 0, 0, 20, 20);
                const imageData = ctx.getImageData(0, 0, 20, 20).data;
                const colorMap = {};
                for (let i = 0; i < imageData.length; i += 4) {
                    if (imageData[i + 3] < 128) continue;
                    const rgb = \`\${imageData[i]},\${imageData[i+1]},\${imageData[i+2]}\`;
                    colorMap[rgb] = (colorMap[rgb] || 0) + 1;
                }
                const dominantColor = Object.keys(colorMap).reduce((a, b) => colorMap[a] > colorMap[b] ? a : b);

                self.postMessage({ id, imageBitmap, dominantColor }, [imageBitmap]);
            } catch (error) {
                self.postMessage({ id, error: error.message });
            }
        };
    `;
    const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
    function createWorker() { return new Worker(URL.createObjectURL(workerBlob)); }

    function isGridViewActive() { return !!document.querySelector('.obj-box .hope-grid'); }
    function togglePosterMode(isActive) { const root = document.querySelector('#root'); if (root) root.classList.toggle('poster-mode-active', isActive); }

    function startFolderScan() {
        if (!isGridViewActive()) {
            togglePosterMode(false);
            document.querySelectorAll('.poster-card-container').forEach(c => c.remove());
            document.querySelectorAll('.grid-item.native-hidden').forEach(c => c.classList.remove('native-hidden'));
            return;
        }
        togglePosterMode(true);
        const allItems = document.querySelectorAll('.obj-box .grid-item');
        allItems.forEach((item, index) => {
            if (galleryState.cards[index]) return;
            const isFolder = item.querySelector('svg [d^="M496 152a56"]');
            const path = decodeURIComponent(new URL(item.href).pathname);
            galleryState.cards[index] = {
                id: index,
                state: isFolder ? 'idle' : 'done',
                el: item,
                path
            };
        });
        setupLazyLoading();
    }

    function processScanQueue() {
        if (galleryState.activeScans >= MAX_CONCURRENT_SCANS) return;
        let nextTask = Array.from(galleryState.visibleSet).map(id => galleryState.cards[id]).find(task => task && task.state === 'idle');
        if (!nextTask) nextTask = galleryState.cards.find(t => t && t.state === 'idle');
        if (nextTask) transitionState(nextTask, 'SCAN');
    }

    async function scanFolder(task) {
        galleryState.activeScans++;
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${task.path}`;
            const cachedCover = sessionStorage.getItem(cacheKey);
            if (cachedCover) {
                transitionState(task, 'SCAN_SUCCESS', { signedUrl: cachedCover === 'null' ? null : cachedCover });
                return;
            }

            const listResp = await fetch(API_FS_LIST_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: task.path, password: "", page: 1, per_page: 10, refresh: false }) });
            const listData = await listResp.json();
            const firstImage = listData?.data?.content?.find(f => IMAGE_EXTENSIONS.has(('.' + f.name.split('.').pop()).toLowerCase()));

            if (firstImage) {
                const fullPath = `${task.path.endsWith('/') ? task.path : task.path + '/'}${firstImage.name}`;
                const linkResp = await fetch(API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: fullPath, password: "" }) });
                const linkData = await linkResp.json();
                const signedUrl = linkData?.data?.url;
                if (signedUrl) {
                    sessionStorage.setItem(cacheKey, signedUrl);
                    transitionState(task, 'SCAN_SUCCESS', { signedUrl });
                } else throw new Error("Signed URL not found.");
            } else {
                sessionStorage.setItem(cacheKey, 'null');
                transitionState(task, 'NO_IMAGES_FOUND');
            }
        } catch (error) {
            console.error(`[Poster Wall] Scan failed for ${task.path}:`, error);
            transitionState(task, 'SCAN_ERROR');
        } finally {
            galleryState.activeScans--;
            requestIdleCallback(processScanQueue);
        }
    }

    function handleWorkerMessage({ data: { id, imageBitmap, dominantColor, error } }) {
        const task = galleryState.cards[id];
        if (!task) return;
        if (error) {
            transitionState(task, 'WORKER_ERROR');
            return;
        }
        task.imageBitmap = imageBitmap;
        task.dominantColor = dominantColor;
        transitionState(task, 'WORKER_SUCCESS');
    }

    function setupLazyLoading() {
        if (intersectionObserver) intersectionObserver.disconnect();
        intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const id = parseInt(entry.target.dataset.id);
                if (entry.isIntersecting) {
                    galleryState.visibleSet.add(id);
                    const task = galleryState.cards[id];
                    if (task && task.state === 'idle') {
                        requestIdleCallback(processScanQueue);
                    }
                } else {
                    galleryState.visibleSet.delete(id);
                }
            });
        }, { root: null, rootMargin: '100% 0px' });

        galleryState.cards.forEach(task => {
            if (task) {
                task.el.dataset.id = task.id;
                intersectionObserver.observe(task.el);
            }
        });
        requestIdleCallback(processScanQueue);
    }

    function transitionState(task, action, payload = {}) {
        const card = task.el;
        switch (task.state) {
            case 'idle':
                if (action === 'SCAN') {
                    task.state = 'scanning';
                    card.classList.add('is-skeleton');
                    scanFolder(task);
                }
                break;
            case 'scanning':
                if (action === 'SCAN_SUCCESS') {
                    if (payload.signedUrl) {
                        task.state = 'pending_worker';
                        task.signedUrl = payload.signedUrl;
                        galleryState.worker.postMessage({ id: task.id, signedUrl: task.signedUrl });
                    } else {
                         task.state = 'done';
                         card.classList.remove('is-skeleton');
                    }
                } else if (action === 'NO_IMAGES_FOUND' || action === 'SCAN_ERROR') {
                    task.state = 'done';
                    card.classList.remove('is-skeleton');
                }
                break;
            case 'pending_worker':
                if (action === 'WORKER_SUCCESS') {
                    task.state = 'transforming';
                    animateCardTransformation(task);
                } else if (action === 'WORKER_ERROR') {
                    task.state = 'done';
                    card.classList.remove('is-skeleton');
                }
                break;
        }
    }

    function animateCardTransformation(task) {
        const { el: originalElement, imageBitmap, dominantColor, signedUrl } = task;
        const folderName = originalElement.querySelector('p[class*="hope-text"]').textContent;

        const container = document.createElement('div');
        container.className = 'poster-card-container';
        const cardLink = document.createElement('a');
        cardLink.className = 'poster-card';
        cardLink.href = originalElement.href;
        cardLink.innerHTML = `<img class="poster-card-img" src="${signedUrl}"><div class="poster-card-info">${folderName}</div>`;
        container.appendChild(cardLink);

        const first = originalElement.getBoundingClientRect();

        originalElement.classList.add('native-hidden');
        originalElement.parentElement.insertBefore(container, originalElement);

        cardLink.style.boxShadow = `0 15px 30px -5px rgba(${dominantColor}, 0.4), 0 8px 15px -5px rgba(${dominantColor}, 0.2)`;

        const last = container.getBoundingClientRect();

        const deltaX = first.left - last.left;
        const deltaY = first.top - last.top;
        const deltaW = first.width / last.width;
        const deltaH = first.height / last.height;

        // --- CORE FIX ---
        const EASE = { quart: 'cubic-bezier(0.165, 0.84, 0.44, 1)', cubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)' };
        container.animate([
            { transformOrigin: 'top left', transform: `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})` },
            { transformOrigin: 'top left', transform: 'none' }
        ], { duration: 600, easing: EASE.cubic });
        // --- END FIX ---

        const img = cardLink.querySelector('.poster-card-img');
        img.onload = () => img.classList.add('loaded');
        task.state = 'done';
    }

    function initialize() {
        galleryState = initialGalleryState();
        galleryState.worker = createWorker();
        galleryState.worker.onmessage = handleWorkerMessage;

        const rootObserver = new MutationObserver((_, obs) => {
            const mainContentArea = document.querySelector(".obj-box");
            if (mainContentArea) {
                const observer = new MutationObserver(startFolderScan);
                observer.observe(mainContentArea, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
                startFolderScan();
                obs.disconnect();
            }
        });
        rootObserver.observe(document.body, { childList: true, subtree: true });
    }

    initialize();

})();
