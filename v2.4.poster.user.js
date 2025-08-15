// ==UserScript==
// @name         Alist 海报墙 (Poster Wall) v2.6
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  通过劫持并增强Alist(Hope UI)的“网格视图”，将包含图片的子文件夹渲染为电影海报卡片。
// @author       Your Name & AI
// @match        *://127.0.0.1:5244/*
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjNGY0NmU1IiBkPSJNMjAgMkg0Yy0xLjEgMC0yIC45LTIgMnYxNmMwIDEuMS45IDIgMiAyaDE2YzEuMSAwIDItLjkgMi0yVjRjMC0xLjEtLjktMi0yLTJtMCAxOEg0VjRoMTZ6TTUgMTdoMTR2LTNsLTMuMzYtNC40OS0zLjE0IDQuMDItMy55Ni01LjAzTDUgMTd6Ii8+PC9zdmc+
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Poster Wall] Script v2.6 (Phoenix Reborn) is running!');

    const API_FS_LIST_ENDPOINT = '/api/fs/list';
    const API_FS_LINK_ENDPOINT = '/api/fs/link';
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.JPG', '.jxl', '.JXL'];
    const CACHE_KEY_PREFIX = 'alist_poster_cache_v2.6_';
    const MAX_CONCURRENT_SCANS = 5;

    let folderScanQueue = [];
    let isScanning = false;

    GM_addStyle(`
        /* --- 核心布局重塑 --- */
        #root.poster-mode-active > .hope-c-PJLV-iicyfOA-css {
            max-width: 100% !important;
        }
        .poster-mode-active .hope-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)) !important;
            gap: 30px !important;
            padding: 20px 3vw !important;
        }

        /* --- 隐藏原生卡片，为我们的新卡片腾出空间 --- */
        .poster-mode-active .grid-item.native-hidden {
            display: none !important;
        }

        /* --- 全新的、独立的 poster-card 样式 --- */
        .poster-card-container {
            aspect-ratio: 2 / 3;
            position: relative;
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.5s ease, transform 0.5s ease;
        }
        .poster-card-container.loaded {
            opacity: 1;
            transform: translateY(0);
        }

        .poster-card {
            display: block;
            width: 100%;
            height: 100%;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 8px 25px -5px rgba(0,0,0,0.15);
            background-color: #f0f2f5;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        html[data-theme="dark"] .poster-card {
            background-color: #2d3748;
        }
        .poster-card:hover {
            transform: scale(1.05);
            box-shadow: 0 15px 30px -5px rgba(0,0,0,0.25);
            z-index: 10;
        }

        .poster-card-img {
            width: 100%;
            height: 100%;
            object-fit: cover !important; /* 强制铺满 */
        }

        .poster-card-info {
            position: absolute; bottom: 0; left: 0; right: 0;
            padding: 25px 15px 15px;
            background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
            color: white !important;
            font-size: 1em; font-weight: 600;
            text-shadow: 0 2px 4px black;
            border-radius: 0 0 inherit;
            z-index: 1;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
    `);

    function isGridViewActive() {
        return !!document.querySelector('.obj-box .hope-grid');
    }

    function togglePosterMode(isActive) {
        const root = document.querySelector('#root');
        if (root) root.classList.toggle('poster-mode-active', isActive);
    }

    function startFolderScan() {
        if (!isGridViewActive()) {
            togglePosterMode(false);
            return;
        }
        togglePosterMode(true);

        const allItems = document.querySelectorAll('.obj-box .grid-item');

        allItems.forEach(item => {
            const isFolder = item.querySelector('svg [d^="M496 152a56"]');
            if (isFolder && !item.dataset.posterScanned) {
                const path = decodeURIComponent(new URL(item.href).pathname);
                folderScanQueue.push({ element: item, path: path });
                item.dataset.posterScanned = 'true';
            }
        });

        processScanQueue();
    }

    function processScanQueue() {
        if (isScanning || folderScanQueue.length === 0) return;
        isScanning = true;
        const itemsToScan = folderScanQueue.splice(0, MAX_CONCURRENT_SCANS);
        const promises = itemsToScan.map(item => getFolderCover(item.path)
            .then(coverUrl => {
                if (coverUrl) {
                    // 替换为新卡片
                    replaceWithPosterCard(item.element, coverUrl);
                }
            })
        );
        Promise.allSettled(promises).then(() => {
            isScanning = false;
            setTimeout(processScanQueue, 200);
        });
    }

    async function getFolderCover(folderPath) {
        const cacheKey = `${CACHE_KEY_PREFIX}${folderPath}`;
        const cachedCover = sessionStorage.getItem(cacheKey);
        if (cachedCover) return cachedCover === 'null' ? null : cachedCover;

        try {
            const listResp = await fetch(API_FS_LIST_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: folderPath, password: "", page: 1, per_page: 50, refresh: false }), });
            if (!listResp.ok) throw new Error('List API failed');
            const listData = await listResp.json();
            const firstImage = listData?.data?.content?.find(f => IMAGE_EXTENSIONS.some(ext => f.name.toLowerCase().endsWith(ext.toLowerCase())));

            if (firstImage) {
                const fullPath = `${folderPath.endsWith('/') ? folderPath : folderPath + '/'}${firstImage.name}`;
                const linkResp = await fetch(API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: fullPath, password: "" }), });
                const linkData = await linkResp.json();
                const signedUrl = linkData?.data?.url;
                if (signedUrl) {
                    sessionStorage.setItem(cacheKey, signedUrl);
                    return signedUrl;
                }
            }
            sessionStorage.setItem(cacheKey, 'null');
            return null;
        } catch (error) {
            console.error(`[Poster Wall] Scan failed for ${folderPath}:`, error);
            return null;
        }
    }

    /**
     * 【全新】用我们自己的卡片替换原生卡片
     * @param {HTMLElement} originalElement 原生的网格卡片元素
     * @param {string} coverUrl 封面图URL
     */
    function replaceWithPosterCard(originalElement, coverUrl) {
        const folderName = originalElement.querySelector('p[class*="hope-text"]').textContent;
        const href = originalElement.href;

        // 创建一个容器来占位，并实现入场动画
        const container = document.createElement('div');
        container.className = 'poster-card-container';

        // 创建我们的卡片链接
        const cardLink = document.createElement('a');
        cardLink.className = 'poster-card';
        cardLink.href = href;

        cardLink.innerHTML = `
            <img class="poster-card-img" src="${coverUrl}" alt="${folderName}" />
            <div class="poster-card-info">
                ${folderName}
            </div>
        `;

        container.appendChild(cardLink);

        // 替换操作
        originalElement.classList.add('native-hidden'); // 隐藏原生卡片
        originalElement.parentElement.insertBefore(container, originalElement);

        // 图片加载完成后添加入场动画类
        const img = cardLink.querySelector('.poster-card-img');
        img.onload = () => {
            container.classList.add('loaded');
        };
        img.onerror = () => {
            // 加载失败，可以移除我们的卡片，并显示回原生卡片
            container.remove();
            originalElement.classList.remove('native-hidden');
        };
    }

    const observer = new MutationObserver(() => {
        setTimeout(startFolderScan, 300);
    });

    const rootObserver = new MutationObserver((_, obs) => {
        const mainContentArea = document.querySelector(".obj-box");
        if (mainContentArea) {
            observer.observe(mainContentArea, { childList: true, subtree: true });
            startFolderScan();
            obs.disconnect();
        }
    });

    rootObserver.observe(document.body, { childList: true, subtree: true });

})();
