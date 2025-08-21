// ==UserScript==
// @name         Alist Poster Wall v9.5 Refined
// @namespace    http://tampermonkey.net/
// @version      9.5
// @description  v9.5 "Refined" - Adds mobile/touchscreen compatibility by disabling hover effects, and provides clearer feedback on 401 authentication errors (e.g., expired token).
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Poster Wall] Script v9.5 (Refined) is running!');

    // --- 全局常量和配置 ---
    const API_FS_LINK_ENDPOINT = '/api/fs/link';
    const COVER_FILENAME = '000-Cover.jpg';
    const CACHE_KEY_PREFIX = 'alist_poster_cache_v9.4_'; // 缓存键保持v9.4以兼容
    const MAX_CONCURRENT_SCANS = 4;

    // --- 全局状态和元素引用 ---
    let galleryState = {};
    let intersectionObserver = null;
    const elements = {
        galleryContainer: null,
        galleryGrid: null,
        galleryCloseBtn: null,
        galleryTitle: null,
        activationButtonContainer: null,
        isButtonInjected: false
    };

    // --- 样式注入 (无变化) ---
    GM_addStyle(`
        /* --- 激活按钮样式 (无变化) --- */
        .poster-wall-btn-container { width: 100%; padding: 10px 1.5rem; box-sizing: border-box; margin-bottom: 10px; }
        .poster-wall-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 12px; font-size: 1rem; font-weight: 600; color: #fff; background: linear-gradient(135deg, #1890ff, #3875f6); border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px -5px rgba(24, 144, 255, 0.6); }
        .poster-wall-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px -5px rgba(24, 144, 255, 0.8); }
        .poster-wall-btn svg { margin-right: 8px; }

        /* --- 海报墙主视图样式 (无变化) --- */
        .poster-wall-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #0d1117; z-index: 9999; display: none; overflow-y: auto; }
        #poster-wall-background { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; background: linear-gradient(135deg, #434343, #000000); background-size: 400% 400%; animation: move-nebula 20s ease infinite; }
        @keyframes move-nebula { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        .poster-wall-header { position: sticky; top: 0; z-index: 100; padding: 25px 3vw; background: linear-gradient(to bottom, rgba(13, 17, 23, 0.8), transparent); backdrop-filter: blur(8px); text-align: center; margin-bottom: 20px; }
        .poster-wall-title { font-size: 2.5rem; color: #fff; font-weight: 700; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
        .poster-wall-grid { padding: 0 3vw 30px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 40px; }
        .poster-wall-close-btn { position: fixed; top: 20px; right: 25px; width: 40px; height: 40px; background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 50%; cursor: pointer; font-size: 24px; line-height: 40px; text-align: center; transition: all 0.2s ease; z-index: 101; }
        .poster-wall-close-btn:hover { transform: scale(1.1) rotate(90deg); }
        body.poster-wall-is-active { overflow: hidden; }

        /* --- 卡片样式 (无变化) --- */
        :root { --ease-out-spring: cubic-bezier(0.22, 1, 0.36, 1); --angle: 0deg; }
        @property --angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
        .poster-card-container { aspect-ratio: 2 / 3; position: relative; border-radius: 15px; overflow: hidden; transform-style: preserve-3d; will-change: transform; transition: transform 0.6s var(--ease-out-spring), box-shadow 0.6s var(--ease-out-spring); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.4); transform: translateZ(0); transform-origin: center; }
        .poster-card-container:hover { box-shadow: 0 20px 45px -10px rgba(0,0,0,0.6); }
        .poster-card-container.is-skeleton { background-color: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .poster-card-container::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 300%; height: 300%; background: conic-gradient(from var(--angle), transparent 0%, #DA70D6, #9400D3, #FF00FF, #9400D3, #DA70D6, transparent 40%); animation: rotate-glow 2.5s linear infinite paused; opacity: 0; transition: opacity 0.4s ease; }
        .poster-card-container.is-interactive::before { animation-play-state: running; opacity: 1; }
        @keyframes rotate-glow { from { --angle: 0deg; } to { --angle: -360deg; } }
        .poster-card { position: absolute; inset: 3px; border-radius: 12px; overflow: hidden; background: #0d1117; }
        .poster-card-glare { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 12px; background: radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.3) 0%, transparent 50%); opacity: 0; transition: opacity 0.4s ease; pointer-events: none; z-index: 3; }
        .poster-card-container.is-interactive .poster-card-glare { opacity: 1; }
        .poster-card-info { position: absolute; bottom: 0; left: 0; right: 0; z-index: 2; padding: 15px; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); color: white !important; text-shadow: 0 2px 4px black; display: flex; flex-direction: column; align-items: flex-start; }
        .info-title { font-size: 1em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
        .info-author { font-size: 0.75em; font-weight: 400; color: rgba(255, 255, 255, 0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; margin-top: 2px; }
        .poster-card-img { width: 100%; height: 100%; object-fit: cover !important; opacity: 0; transition: opacity 1.2s ease; }
        .poster-card-img.is-loaded { opacity: 1; }
        .no-cover-content { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; }
        .fallback-icon { font-size: 4em; color: rgba(255, 255, 255, 0.2); }
        .fallback-text { margin-top: 15px; padding: 0 15px; color: rgba(255, 255, 255, 0.6); text-align: center; }
        .fallback-text small { font-size: 0.8em; color: #ffb8b8; margin-top: 5px; display: block; }
    `);

    // --- 辅助函数 ---
    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    function initializeState() { /* ... no change ... */ }

    // [v9.5] 新增: 检测触摸设备
    function isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }

    // [v9.5] 修改: 增加触摸设备判断
    function addInteractiveEffects(containerElement) {
        // 如果是触摸设备，则不添加复杂的鼠标悬停效果以提高性能和兼容性
        if (isTouchDevice()) {
            return;
        }

        const MAX_TILT = 15; let animationFrameId = null;
        containerElement.addEventListener('mousemove', (e) => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            animationFrameId = requestAnimationFrame(() => {
                const rect = containerElement.getBoundingClientRect();
                const x = e.clientX - rect.left; const y = e.clientY - rect.top;
                const rotateY = (x / rect.width - 0.5) * 2 * MAX_TILT;
                const rotateX = (0.5 - y / rect.height) * 2 * MAX_TILT;
                containerElement.style.transform = `scale(1.05) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
                containerElement.style.setProperty('--mouse-x', `${x}px`);
                containerElement.style.setProperty('--mouse-y', `${y}px`);
            });
        });
        containerElement.addEventListener('mouseenter', () => { containerElement.classList.add('is-interactive'); });
        containerElement.addEventListener('mouseleave', () => {
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            containerElement.classList.remove('is-interactive');
            containerElement.style.transform = `scale(1) rotateX(0deg) rotateY(0deg)`;
        });
    }

    // --- UI 创建和管理 (无变化) ---
    function createGalleryView() { /* ... no change ... */ }

    // --- 核心逻辑 (大部分无变化) ---
    function createActivationButton() { /* ... no change ... */ }
    function openGallery() { /* ... no change ... */ }
    function closeGallery() { /* ... no change ... */ }
    function buildAndLaunchPosters() { /* ... no change ... */ }
    function setupLazyLoading() { /* ... no change ... */ }
    function processQueue() { /* ... no change ... */ }
    function transitionState(task, action) { /* ... no change ... */ }

    // [v9.5] 修改: 增加401错误检测
    async function scanAndProcessFolder(task) {
        galleryState.activeScans++;
        const { signal } = galleryState.controller;
        try {
            const cacheKey = `${CACHE_KEY_PREFIX}${task.path}`;
            const cachedData = JSON.parse(sessionStorage.getItem(cacheKey));
            if (cachedData) {
                if (cachedData.noCover) { transitionState(task, 'NO_COVER_FOUND'); } else {
                    const blob = await (await fetch(cachedData.signedUrl, { signal })).blob();
                    task.imageBlobUrl = URL.createObjectURL(blob);
                    transitionState(task, 'PROCESS_SUCCESS');
                } return;
            }
            const coverPath = `${task.path.endsWith('/') ? task.path : task.path + '/'}${COVER_FILENAME}`;
            const linkResp = await fetch(API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: coverPath }), signal });
            
            if (!linkResp.ok) {
                // 如果是401错误，可能是token过期
                if (linkResp.status === 401) {
                    console.error(`[Poster Wall] Authentication failed (401) for path: ${coverPath}. Token might be expired.`);
                    task.errorType = 'auth'; // 在task对象上附加错误类型
                }
                sessionStorage.setItem(cacheKey, JSON.stringify({ noCover: true }));
                transitionState(task, 'NO_COVER_FOUND');
                return;
            }

            const linkData = await linkResp.json(); const signedUrl = linkData?.data?.url; if (!signedUrl) throw new Error("Signed URL is null.");
            const imageBlob = await (await fetch(signedUrl, { signal })).blob();
            task.imageBlobUrl = URL.createObjectURL(imageBlob);
            sessionStorage.setItem(cacheKey, JSON.stringify({ signedUrl }));
            transitionState(task, 'PROCESS_SUCCESS');
        } catch (error) { if (error.name !== 'AbortError') { console.error(`[Poster Wall] Process failed for ${task.path}:`, error); transitionState(task, 'PROCESS_ERROR'); }
        } finally { galleryState.activeScans--; processQueue(); }
    }
    
    // [v9.5] 修改: 渲染时检查错误类型
    function renderPosterCard(task, isFallback) {
        const { el: containerElement, originalElement } = task;
        if (!containerElement || !document.body.contains(containerElement)) return;

        const nameElement = originalElement.querySelector('.name, .hope-text');
        const folderName = nameElement ? nameElement.textContent.trim() : 'Unknown';
        
        containerElement.classList.remove('is-skeleton');
        
        const card = document.createElement('div');
        card.className = 'poster-card';
        
        const glare = document.createElement('div');
        glare.className = 'poster-card-glare';

        if (isFallback) {
            let fallbackHTML = `<div class="fallback-icon">🗀</div><div class="fallback-text">${folderName}`;
            // 检查是否有特定的错误类型
            if (task.errorType === 'auth') {
                fallbackHTML += `<small>认证失败, Token可能已过期</small>`;
            }
            fallbackHTML += `</div>`;
            card.innerHTML = `<div class="no-cover-content">${fallbackHTML}</div>`;
        } else {
            const img = document.createElement('img');
            img.className = 'poster-card-img';
            
            const info = document.createElement('div');
            info.className = 'poster-card-info';

            // --- Title Parsing Logic (no change) ---
            const titleRegex = /^\[([^\]]+)\]\s*([^(\[]+)/;
            const match = folderName.match(titleRegex);

            if (match) {
                const author = match[1].trim();
                const title = match[2].trim();
                info.innerHTML = `<span class="info-title" title="${title}">${title}</span><span class="info-author" title="${author}">作者: ${author}</span>`;
            } else {
                info.innerHTML = `<span class="info-title" title="${folderName}">${folderName}</span>`;
            }
            // --- End of Logic ---

            card.append(img, info);

            if (task.imageBlobUrl) {
                img.src = task.imageBlobUrl;
                img.onload = () => {
                    img.classList.add('is-loaded');
                    URL.revokeObjectURL(img.src);
                };
            }
        }
        
        containerElement.append(card, glare);
        addInteractiveEffects(containerElement);
    }
    
    function initialize() { /* ... no change ... */ }

    // --- Re-pasting unchanged functions for completeness ---
    initializeState = function() {
        if (galleryState.controller) galleryState.controller.abort();
        if (intersectionObserver) { intersectionObserver.disconnect(); intersectionObserver = null; }
        galleryState = { isActive: false, cards: new Map(), visibleSet: new Set(), activeScans: 0, controller: new AbortController() };
        if (elements.galleryGrid) elements.galleryGrid.innerHTML = '';
    };
    createGalleryView = function() {
        if (document.getElementById('poster-wall-container')) return;
        const container = document.createElement('div'); container.id = 'poster-wall-container'; container.className = 'poster-wall-container';
        const background = document.createElement('div'); background.id = 'poster-wall-background';
        const header = document.createElement('div'); header.className = 'poster-wall-header';
        const title = document.createElement('h1'); title.className = 'poster-wall-title'; elements.galleryTitle = title; header.appendChild(title);
        const grid = document.createElement('div'); grid.className = 'poster-wall-grid'; elements.galleryGrid = grid;
        const closeBtn = document.createElement('button'); closeBtn.className = 'poster-wall-close-btn'; closeBtn.innerHTML = '&times;'; closeBtn.onclick = closeGallery; elements.galleryCloseBtn = closeBtn;
        container.append(background, closeBtn, header, grid); document.body.appendChild(container); elements.galleryContainer = container;
    };
    createActivationButton = function() {
        if (elements.isButtonInjected) return;
        const navBar = document.querySelector('.nav.hope-breadcrumb'); const objBox = document.querySelector('.obj-box'); if (!navBar || !objBox) return;
        if (!elements.activationButtonContainer) {
            elements.activationButtonContainer = document.createElement('div'); elements.activationButtonContainer.className = 'poster-wall-btn-container';
            const button = document.createElement('button'); button.className = 'poster-wall-btn'; button.innerHTML = `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"></path></svg> 海报墙模式`;
            button.onclick = openGallery; elements.activationButtonContainer.appendChild(button);
        }
        navBar.parentNode.insertBefore(elements.activationButtonContainer, objBox); elements.isButtonInjected = true;
    };
    openGallery = function() {
        const breadcrumbItems = document.querySelectorAll('.hope-breadcrumb__list .hope-breadcrumb__item'); const lastItem = breadcrumbItems[breadcrumbItems.length - 1]?.querySelector('.hope-breadcrumb__link');
        elements.galleryTitle.textContent = lastItem ? lastItem.textContent : 'Gallery';
        document.body.classList.add('poster-wall-is-active'); document.querySelector('.obj-box').style.display = 'none'; elements.galleryContainer.style.display = 'block'; elements.galleryContainer.scrollTop = 0;
        initializeState(); galleryState.isActive = true; buildAndLaunchPosters();
    };
    closeGallery = function() {
        document.body.classList.remove('poster-wall-is-active'); elements.galleryContainer.style.display = 'none'; document.querySelector('.obj-box').style.display = ''; initializeState();
    };
    buildAndLaunchPosters = function() {
        setupLazyLoading();
        const items = document.querySelectorAll('.obj-box .grid-item, .obj-box .list-item');
        items.forEach(item => {
            const linkElement = item.querySelector('a[href]') || item; if (!linkElement.href) return;
            const path = decodeURIComponent(new URL(linkElement.href).pathname);
            const isFolder = !!item.querySelector('svg [d^="M496 152a56"], svg [d^="M464 128H272l-54.63-54.63c-6-6-14.14-9.37-22.63-9.37H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48z"]');
            if (isFolder) {
                const skeletonCard = document.createElement('a'); skeletonCard.className = 'poster-card-container is-skeleton'; skeletonCard.dataset.path = path; skeletonCard.href = linkElement.href;
                elements.galleryGrid.appendChild(skeletonCard);
                const task = { id: path, state: 'idle', el: skeletonCard, path: path, originalElement: item };
                galleryState.cards.set(path, task); intersectionObserver.observe(skeletonCard);
            }
        });
        processQueue();
    };
    setupLazyLoading = function() {
        if (intersectionObserver) intersectionObserver.disconnect();
        intersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const path = entry.target.dataset.path; if (!path) return;
                const task = galleryState.cards.get(path);
                if (entry.isIntersecting && task && task.state === 'idle') { galleryState.visibleSet.add(path); } else { galleryState.visibleSet.delete(path); }
            });
            processQueue();
        }, { root: elements.galleryContainer, rootMargin: '100% 0px' });
    };
    processQueue = function() {
        const sortedVisible = Array.from(galleryState.visibleSet).map(path => galleryState.cards.get(path)).filter(task => task && task.state === 'idle');
        for (const task of sortedVisible) { if (galleryState.activeScans >= MAX_CONCURRENT_SCANS) break; transitionState(task, 'SCAN'); }
    };
    transitionState = function(task, action) {
        if (!task || !task.el) return;
        switch (task.state) {
            case 'idle': if (action === 'SCAN') { task.state = 'scanning'; scanAndProcessFolder(task); } break;
            case 'scanning':
                if (action === 'PROCESS_SUCCESS') { task.state = 'done'; renderPosterCard(task, false); }
                else if (action === 'NO_COVER_FOUND' || action === 'PROCESS_ERROR') { task.state = 'done_no_cover'; renderPosterCard(task, true); }
                break;
        }
    };
    initialize = function() {
        createGalleryView();
        const debouncedButtonCreation = debounce(() => {
            if (document.querySelector('.obj-box')) { createActivationButton(); }
            else { elements.isButtonInjected = false; }
        }, 200);
        const rootElement = document.getElementById('root');
        if (rootElement) {
            const observer = new MutationObserver(debouncedButtonCreation);
            observer.observe(rootElement, { childList: true, subtree: true });
        }
        debouncedButtonCreation();
    };

    // --- 启动脚本 ---
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initialize); } else { initialize(); }
})();
