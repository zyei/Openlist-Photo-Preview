// ==UserScript==
// @name         Alist Ultimate Media Experience v10.0
// @namespace    http://tampermonkey.net/
// @version      10.0
// @description  v10.0 "Fusion" - A seamless integration of Poster Wall and Immersive Gallery. Click on a poster to directly launch a beautiful, high-performance gallery for that folder. Features a unified, elegant light/dark theme and a new golden glow effect.
// @author       Your Name & AI
// @license      MIT
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Alist Ultimate Media] Script v10.0 (Fusion) is running!');

    // --- 全局常量与配置 ---

    // -- 海报墙模块配置 --
    const POSTER_API_FS_LINK_ENDPOINT = '/api/fs/link';
    const POSTER_COVER_FILENAME = '000-Cover.jpg';
    const POSTER_CACHE_KEY_PREFIX = 'alist_poster_cache_v10.0_';
    const POSTER_MAX_CONCURRENT_SCANS = 4;

    // -- 沉浸式画廊模块配置 --
    const GALLERY_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', 'avif', '.svg', '.JPG', '.jxl', '.JXL'];
    const GALLERY_TRIGGER_IMAGE_COUNT = 5; // 点击海报启动画廊所需的最小图片数
    const GALLERY_API_LIST_ENDPOINT = '/api/fs/list';
    const GALLERY_API_LINK_ENDPOINT = '/api/fs/link';
    const GALLERY_API_GET_ENDPOINT = '/api/fs/get';
    const GALLERY_LARGE_FILE_THRESHOLD_MB = 15;
    const GALLERY_MAX_CONCURRENT_DOWNLOADS = 3;
    const GALLERY_LOAD_RETRY_COUNT = 2;
    const GALLERY_CONTAINER_ID = 'immersive-gallery-container';


    // --- 全局状态与元素引用 ---

    // -- 海报墙状态 --
    let posterWallState = {};
    let posterIntersectionObserver = null;
    const posterElements = {
        galleryContainer: null,
        galleryGrid: null,
        galleryCloseBtn: null,
        galleryTitle: null,
        activationButtonContainer: null,
        isButtonInjected: false
    };

    // -- 沉浸式画廊状态 --
    let galleryImageList = [];
    let galleryLoadObserver = null;
    let galleryAnimationObserver = null;
    let immersiveGalleryState = { isActive: false, controller: null, hideControlsTimeout: null, clickHandler: null, progressScrollHandler: null };
    let originalViewport = '';


    // --- [v10.0] 统一的样式注入 ---
    GM_addStyle(`
        /* --- 全局 --- */
        :root { --ease-out-spring: cubic-bezier(0.22, 1, 0.36, 1); --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1); --angle: 0deg; }
        @property --angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }

        /* --- 海报墙激活按钮 (无变化) --- */
        .poster-wall-btn-container { width: 100%; padding: 10px 1.5rem; box-sizing: border-box; margin-bottom: 10px; }
        .poster-wall-btn { display: flex; align-items: center; justify-content: center; width: 100%; padding: 12px; font-size: 1rem; font-weight: 600; color: #fff; background: linear-gradient(135deg, #1890ff, #3875f6); border: none; border-radius: 8px; cursor: pointer; transition: all 0.3s ease; box-shadow: 0 4px 15px -5px rgba(24, 144, 255, 0.6); }
        .poster-wall-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px -5px rgba(24, 144, 255, 0.8); }
        .poster-wall-btn svg { margin-right: 8px; }

        /* --- [v10.0] 海报墙主视图样式 (已更新背景) --- */
        .poster-wall-container { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: #f0f2f5; z-index: 9998; display: none; overflow-y: auto; }
        html[data-theme="dark"] .poster-wall-container { background-color: #1a202c; }
        .poster-wall-container::before, .poster-wall-container::after { content: ''; position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -2; pointer-events: none; background-repeat: no-repeat; transform-origin: center center;}
        .poster-wall-container::before { background: radial-gradient(circle at 10% 10%, rgba(220, 210, 255, 0.6), transparent 50%); animation: shimmer1 30s ease-in-out infinite alternate; }
        .poster-wall-container::after { background: radial-gradient(circle at 90% 90%, rgba(210, 255, 245, 0.6), transparent 50%); animation: shimmer2 25s ease-in-out infinite alternate; }
        @keyframes shimmer1 { from { transform: translate(-15%, -15%) scale(1.5); } to { transform: translate(15%, 15%) scale(1.5); } }
        @keyframes shimmer2 { from { transform: translate(15%, 15%) scale(1.5); } to { transform: translate(-15%, -15%) scale(1.5); } }

        .poster-wall-header { position: sticky; top: 0; z-index: 100; padding: 25px 3vw; background: linear-gradient(to bottom, rgba(255, 255, 255, 0.5), transparent); backdrop-filter: blur(8px); text-align: center; margin-bottom: 20px; }
        html[data-theme="dark"] .poster-wall-header { background: linear-gradient(to bottom, rgba(26, 32, 44, 0.5), transparent); }
        .poster-wall-title { font-size: 2.5rem; color: #333; font-weight: 700; text-shadow: 0 1px 2px rgba(0,0,0,0.1); }
        html[data-theme="dark"] .poster-wall-title { color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.5); }
        .poster-wall-grid { padding: 0 3vw 30px; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 40px; }
        .poster-wall-close-btn { position: fixed; top: 20px; right: 25px; width: 40px; height: 40px; background: rgba(0,0,0,0.1); color: #333; border: none; border-radius: 50%; cursor: pointer; font-size: 24px; line-height: 40px; text-align: center; transition: all 0.2s ease; z-index: 101; }
        html[data-theme="dark"] .poster-wall-close-btn { background: rgba(255,255,255,0.1); color: #fff; }
        .poster-wall-close-btn:hover { transform: scale(1.1) rotate(90deg); }
        body.poster-wall-is-active { overflow: hidden; }

        /* --- [v10.0] 海报墙卡片样式 (已更新辉光颜色) --- */
        .poster-card-container { aspect-ratio: 2 / 3; position: relative; border-radius: 15px; overflow: hidden; transform-style: preserve-3d; will-change: transform; transition: transform 0.6s var(--ease-out-spring), box-shadow 0.6s var(--ease-out-spring); box-shadow: 0 10px 30px -10px rgba(0,0,0,0.2); transform: translateZ(0); transform-origin: center; cursor: pointer; }
        .poster-card-container:hover { box-shadow: 0 20px 45px -10px rgba(0,0,0,0.3); }
        .poster-card-container.is-skeleton { background-color: rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.1); animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        html[data-theme="dark"] .poster-card-container.is-skeleton { background-color: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .poster-card-container::before { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 300%; height: 300%; background: conic-gradient(from var(--angle), transparent 0%, #FFD700, #FDB813, #FFA500, #FDB813, #FFD700, transparent 40%); animation: rotate-glow 2.5s linear infinite paused; opacity: 0; transition: opacity 0.4s ease; }
        .poster-card-container.is-interactive::before { animation-play-state: running; opacity: 1; }
        @keyframes rotate-glow { from { --angle: 0deg; } to { --angle: -360deg; } }
        .poster-card { position: absolute; inset: 3px; border-radius: 12px; overflow: hidden; background: #e2e8f0; }
        html[data-theme="dark"] .poster-card { background: #0d1117; }
        .poster-card-glare { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 12px; background: radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.8), transparent 50%); opacity: 0; transition: opacity 0.4s ease; pointer-events: none; z-index: 3; }
        html[data-theme="dark"] .poster-card-glare { background: radial-gradient(circle at var(--mouse-x) var(--mouse-y), rgba(255, 255, 255, 0.3), transparent 50%); }
        .poster-card-container.is-interactive .poster-card-glare { opacity: 1; }
        .poster-card-info { position: absolute; bottom: 0; left: 0; right: 0; z-index: 2; padding: 15px; background: linear-gradient(to top, rgba(0,0,0,0.9), transparent); color: white !important; text-shadow: 0 2px 4px black; display: flex; flex-direction: column; align-items: flex-start; }
        .info-title { font-size: 1em; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; }
        .info-author { font-size: 0.75em; font-weight: 400; color: rgba(255, 255, 255, 0.7); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; margin-top: 2px; }
        .poster-card-img { width: 100%; height: 100%; object-fit: cover !important; opacity: 0; transition: opacity 1.2s ease; }
        .poster-card-img.is-loaded { opacity: 1; }
        .no-cover-content { display: flex; flex-direction: column; justify-content: center; align-items: center; width: 100%; height: 100%; }
        .fallback-icon { font-size: 4em; color: rgba(0, 0, 0, 0.1); }
        html[data-theme="dark"] .fallback-icon { color: rgba(255, 255, 255, 0.2); }
        .fallback-text { margin-top: 15px; padding: 0 15px; color: rgba(0, 0, 0, 0.5); text-align: center; }
        html[data-theme="dark"] .fallback-text { color: rgba(255, 255, 255, 0.6); }
        .fallback-text small { font-size: 0.8em; color: #e53e3e; margin-top: 5px; display: block; }
        html[data-theme="dark"] .fallback-text small { color: #ffb8b8; }

        /* --- 沉浸式画廊样式 --- */
        body.gallery-is-active { overflow: hidden; }
        body.gallery-is-active > #root { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
        #${GALLERY_CONTAINER_ID} { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999; overflow: hidden; opacity: 0; transition: opacity 0.5s ease-in-out; background-color: #f0f2f5; }
        html[data-theme="dark"] #${GALLERY_CONTAINER_ID} { background-color: #1a202c; }
        #${GALLERY_CONTAINER_ID} .gallery-scroll-container { width: 100%; height: 100%; overflow-y: auto; scroll-behavior: smooth; scrollbar-width: none; &::-webkit-scrollbar { display: none; } }
        .gallery-back-btn, .gallery-toolbar, .gallery-progress-bar { --safe-area-top: env(safe-area-inset-top, 0px); --safe-area-left: env(safe-area-inset-left, 0px); --safe-area-right: env(safe-area-inset-right, 0px); --safe-area-bottom: env(safe-area-inset-bottom, 0px); }
        .gallery-back-btn { top: calc(20px + var(--safe-area-top)); left: calc(20px + var(--safe-area-left)); }
        .gallery-toolbar { top: calc(20px + var(--safe-area-top)); right: calc(20px + var(--safe-area-right)); }
        .gallery-progress-bar { bottom: calc(10px + var(--safe-area-bottom)); left: calc(10px + var(--safe-area-left)); right: calc(10px + var(--safe-area-right)); }
        #${GALLERY_CONTAINER_ID}::before, #${GALLERY_CONTAINER_ID}::after { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -2; pointer-events: none; background-repeat: no-repeat; transform-origin: center center;}
        #${GALLERY_CONTAINER_ID}::before { background: radial-gradient(circle at 10% 10%, rgba(220, 210, 255, 0.6), transparent 50%); animation: shimmer1 30s ease-in-out infinite alternate; }
        #${GALLERY_CONTAINER_ID}::after { background: radial-gradient(circle at 90% 90%, rgba(210, 255, 245, 0.6), transparent 50%); animation: shimmer2 25s ease-in-out infinite alternate; }
        #${GALLERY_CONTAINER_ID}.gallery-active { opacity: 1; }
        .gallery-back-btn, .gallery-toolbar, .gallery-progress-bar { transition: opacity 0.4s var(--ease-out-quart), visibility 0.4s var(--ease-out-quart), transform 0.4s var(--ease-out-quart) !important; z-index: 10001; }
        .gallery-back-btn, .gallery-toolbar { opacity: 0; visibility: hidden; transform: translateY(-20px); }
        .gallery-progress-bar { opacity: 0; visibility: hidden; transform: translateY(20px); }
        .gallery-back-btn.visible, .gallery-toolbar.visible, .gallery-progress-bar.visible { opacity: 1; visibility: visible; transform: translateY(0); }
        .gallery-back-btn{position:fixed;width:44px;height:44px;border-radius:50%;display:flex;justify-content:center;align-items:center;cursor:pointer; background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1) translateY(0) !important}
        html[data-theme="dark"] .gallery-back-btn { background:rgba(30,30,30,.5); border:1px solid rgba(255,255,255,.1); color: #eee; }
        .gallery-toolbar{position:fixed;display:flex;gap:10px;padding:8px;border-radius:22px; background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;}
        html[data-theme="dark"] .gallery-toolbar { background:rgba(30,30,30,.5); border:1px solid rgba(255,255,255,.1); color: #eee; }
        .toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s, color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#1890ff;color:#fff !important}
        html[data-theme="dark"] .toolbar-btn { color: #eee; } html[data-theme="dark"] .toolbar-btn:hover { background:rgba(255,255,255,.1); } html[data-theme="dark"] .toolbar-btn.active { background:#1890ff; }
        .gallery-image-list { display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 10vh 0; }
        .gallery-card { width: 90%; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; position: relative; background-color: rgba(255,255,255,0.1); opacity: 0; transform: translateY(20px); will-change: opacity, transform; transition: opacity 0.8s var(--ease-out-quart), transform 0.8s var(--ease-out-quart), aspect-ratio 0.4s ease-out; aspect-ratio: 3 / 4; min-height: 200px; }
        html[data-theme="dark"] .gallery-card { box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
        .gallery-card.is-visible { opacity: 1; transform: translateY(0); }
        .card-placeholder { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; background-color: rgba(255,255,255,0.2); transition: opacity 1.2s var(--ease-out-quart); }
        html[data-theme="dark"] .card-placeholder { background-color: rgba(0,0,0,0.1); }
        .gallery-image-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .gallery-image { display: block; width: 100%; height: 100%; object-fit: contain; opacity: 0; will-change: opacity; transition: opacity 1.2s var(--ease-out-quart); }
        .gallery-image.loaded { opacity: 1; }
        .progress-indicator { position: absolute; width: 80px; height: 80px; display: flex; justify-content: center; align-items: center; opacity: 0; transform: scale(0.8); transition: all 0.3s ease; pointer-events: none; z-index: 5; }
        .progress-indicator.visible { opacity: 1; transform: scale(1); }
        .progress-indicator svg { transform: rotate(-90deg); } .progress-circle-bg { fill: none; stroke: rgba(0,0,0,0.1); }
        .progress-circle-bar { fill: none; stroke: #1890ff; stroke-linecap: round; transition: stroke-dashoffset 0.2s linear; }
        .progress-text { position: absolute; font-size: 16px; font-weight: 500; color: rgba(0,0,0,0.6); font-family: monospace; }
        html[data-theme="dark"] .progress-text { color: rgba(255,255,255,0.6); }
        .gallery-image-list.mode-standard .gallery-card { max-width: 1000px; } .gallery-image-list.mode-webtoon { gap: 0; } .gallery-image-list.mode-webtoon .gallery-card { width: 100%; max-width: 100%; border-radius: 0; box-shadow: none; background: transparent; } .gallery-image-list.mode-webtoon .gallery-image { object-fit: cover; } .gallery-image-list.mode-webtoon .card-filename { display: none; } .gallery-image-list.mode-full-width .gallery-card { width: 95vw; max-width: 95vw; }
        .card-filename{position:absolute;bottom:0;left:0;width:100%;padding:20px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff;font-size:16px;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 1px 3px black; z-index: 4;}.gallery-card:hover .card-filename{opacity:1}
        .gallery-global-loader { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 10002; color: #1890ff; }
        .gallery-progress-bar { position: fixed; width: auto; height: 50px; display: flex; align-items: center; padding: 0 20px; box-sizing: border-box; background: rgba(0,0,0,0.3); border-radius: 25px; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }
        .progress-track { flex-grow: 1; height: 6px; background-color: rgba(255,255,255,0.3); border-radius: 3px; position: relative; cursor: pointer; }
        .progress-thumb { position: absolute; top: -7px; height: 20px; width: 20px; background-color: #fff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.3); transform: translateX(-50%); }
        .progress-label { color: white; text-shadow: 0 1px 2px black; font-size: 14px; margin-left: 15px; font-variant-numeric: tabular-nums; }
    `);

    // --- 辅助函数 ---
    function debounce(func, wait) { let t; return function(...a) { clearTimeout(t); t = setTimeout(() => func.apply(this, a), wait); }; }
    function isTouchDevice() { return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); }

    // ===================================================================
    // ==================== 海报墙模块 (POSTER WALL) =====================
    // ===================================================================

    function initializePosterWallState() {
        if (posterWallState.controller) posterWallState.controller.abort();
        if (posterIntersectionObserver) { posterIntersectionObserver.disconnect(); posterIntersectionObserver = null; }
        posterWallState = { isActive: false, cards: new Map(), visibleSet: new Set(), activeScans: 0, controller: new AbortController() };
        if (posterElements.galleryGrid) posterElements.galleryGrid.innerHTML = '';
    }

    function addPosterCardInteractiveEffects(containerElement) {
        if (isTouchDevice()) return;
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

    function createPosterWallView() {
        if (document.getElementById('poster-wall-container')) return;
        const container = document.createElement('div'); container.id = 'poster-wall-container'; container.className = 'poster-wall-container';
        const header = document.createElement('div'); header.className = 'poster-wall-header';
        const title = document.createElement('h1'); title.className = 'poster-wall-title'; posterElements.galleryTitle = title; header.appendChild(title);
        const grid = document.createElement('div'); grid.className = 'poster-wall-grid'; posterElements.galleryGrid = grid;
        const closeBtn = document.createElement('button'); closeBtn.className = 'poster-wall-close-btn'; closeBtn.innerHTML = '&times;'; closeBtn.onclick = closePosterWall; posterElements.galleryCloseBtn = closeBtn;
        container.append(closeBtn, header, grid); document.body.appendChild(container); posterElements.galleryContainer = container;
    }

    function createPosterWallActivationButton() {
        if (posterElements.isButtonInjected) return;
        const navBar = document.querySelector('.nav.hope-breadcrumb'); const objBox = document.querySelector('.obj-box'); if (!navBar || !objBox) return;
        if (!posterElements.activationButtonContainer) {
            posterElements.activationButtonContainer = document.createElement('div'); posterElements.activationButtonContainer.className = 'poster-wall-btn-container';
            const button = document.createElement('button'); button.className = 'poster-wall-btn'; button.innerHTML = `<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"></path></svg> 海报墙模式`;
            button.onclick = openPosterWall; posterElements.activationButtonContainer.appendChild(button);
        }
        navBar.parentNode.insertBefore(posterElements.activationButtonContainer, objBox); posterElements.isButtonInjected = true;
    }

    function openPosterWall() {
        const breadcrumbItems = document.querySelectorAll('.hope-breadcrumb__list .hope-breadcrumb__item'); const lastItem = breadcrumbItems[breadcrumbItems.length - 1]?.querySelector('.hope-breadcrumb__link');
        posterElements.galleryTitle.textContent = lastItem ? lastItem.textContent : 'Gallery';
        document.body.classList.add('poster-wall-is-active'); document.querySelector('.obj-box').style.display = 'none'; posterElements.galleryContainer.style.display = 'block'; posterElements.galleryContainer.scrollTop = 0;
        initializePosterWallState(); posterWallState.isActive = true; buildAndLaunchPosters();
    }

    function closePosterWall() {
        document.body.classList.remove('poster-wall-is-active'); posterElements.galleryContainer.style.display = 'none'; document.querySelector('.obj-box').style.display = ''; initializePosterWallState();
    }

    function buildAndLaunchPosters() {
        setupPosterLazyLoading();
        const items = document.querySelectorAll('.obj-box .grid-item, .obj-box .list-item');
        items.forEach(item => {
            const linkElement = item.querySelector('a[href]') || item; if (!linkElement.href) return;
            const path = decodeURIComponent(new URL(linkElement.href).pathname);
            const isFolder = !!item.querySelector('svg [d^="M496 152a56"], svg [d^="M464 128H272l-54.63-54.63c-6-6-14.14-9.37-22.63-9.37H48C21.49 64 0 85.49 0 112v288c0 26.51 21.49 48 48 48h416c26.51 0 48-21.49 48-48V176c0-26.51-21.49-48-48-48z"]');
            if (isFolder) {
                // [v10.0] 使用 div 替代 a 标签，并添加点击事件
                const cardContainer = document.createElement('div');
                cardContainer.className = 'poster-card-container is-skeleton';
                cardContainer.dataset.path = path;
                cardContainer.dataset.href = linkElement.href; // 存储原始链接以备后用
                cardContainer.onclick = (e) => {
                    e.preventDefault();
                    launchGalleryForPath(path, linkElement.href);
                };
                posterElements.galleryGrid.appendChild(cardContainer);
                const task = { id: path, state: 'idle', el: cardContainer, path: path, originalElement: item };
                posterWallState.cards.set(path, task); posterIntersectionObserver.observe(cardContainer);
            }
        });
        processPosterQueue();
    }

    function setupPosterLazyLoading() {
        if (posterIntersectionObserver) posterIntersectionObserver.disconnect();
        posterIntersectionObserver = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                const path = entry.target.dataset.path; if (!path) return;
                const task = posterWallState.cards.get(path);
                if (entry.isIntersecting && task && task.state === 'idle') { posterWallState.visibleSet.add(path); } else { posterWallState.visibleSet.delete(path); }
            });
            processPosterQueue();
        }, { root: posterElements.galleryContainer, rootMargin: '100% 0px' });
    }

    function processPosterQueue() {
        const sortedVisible = Array.from(posterWallState.visibleSet).map(path => posterWallState.cards.get(path)).filter(task => task && task.state === 'idle');
        for (const task of sortedVisible) { if (posterWallState.activeScans >= POSTER_MAX_CONCURRENT_SCANS) break; transitionPosterState(task, 'SCAN'); }
    }

    function transitionPosterState(task, action) {
        if (!task || !task.el) return;
        switch (task.state) {
            case 'idle': if (action === 'SCAN') { task.state = 'scanning'; scanAndProcessPosterFolder(task); } break;
            case 'scanning':
                if (action === 'PROCESS_SUCCESS') { task.state = 'done'; renderPosterCard(task, false); }
                else if (action === 'NO_COVER_FOUND' || action === 'PROCESS_ERROR') { task.state = 'done_no_cover'; renderPosterCard(task, true); }
                break;
        }
    }

    async function scanAndProcessPosterFolder(task) {
        posterWallState.activeScans++;
        const { signal } = posterWallState.controller;
        try {
            const cacheKey = `${POSTER_CACHE_KEY_PREFIX}${task.path}`;
            const cachedData = JSON.parse(sessionStorage.getItem(cacheKey));
            if (cachedData) {
                if (cachedData.noCover) { transitionPosterState(task, 'NO_COVER_FOUND'); } else {
                    const blob = await (await fetch(cachedData.signedUrl, { signal })).blob();
                    task.imageBlobUrl = URL.createObjectURL(blob);
                    transitionPosterState(task, 'PROCESS_SUCCESS');
                } return;
            }
            const coverPath = `${task.path.endsWith('/') ? task.path : task.path + '/'}${POSTER_COVER_FILENAME}`;
            const linkResp = await fetch(POSTER_API_FS_LINK_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: localStorage.getItem('token') }, body: JSON.stringify({ path: coverPath }), signal });
            if (!linkResp.ok) {
                if (linkResp.status === 401) { task.errorType = 'auth'; }
                sessionStorage.setItem(cacheKey, JSON.stringify({ noCover: true })); transitionPosterState(task, 'NO_COVER_FOUND'); return;
            }
            const linkData = await linkResp.json(); const signedUrl = linkData?.data?.url; if (!signedUrl) throw new Error("Signed URL is null.");
            const imageBlob = await (await fetch(signedUrl, { signal })).blob();
            task.imageBlobUrl = URL.createObjectURL(imageBlob);
            sessionStorage.setItem(cacheKey, JSON.stringify({ signedUrl }));
            transitionPosterState(task, 'PROCESS_SUCCESS');
        } catch (error) { if (error.name !== 'AbortError') { console.error(`[Poster Wall] Process failed for ${task.path}:`, error); transitionPosterState(task, 'PROCESS_ERROR'); }
        } finally { posterWallState.activeScans--; processPosterQueue(); }
    }

    function renderPosterCard(task, isFallback) {
        const { el: containerElement, originalElement } = task;
        if (!containerElement || !document.body.contains(containerElement)) return;
        const nameElement = originalElement.querySelector('.name, .hope-text');
        const folderName = nameElement ? nameElement.textContent.trim() : 'Unknown';
        containerElement.classList.remove('is-skeleton');
        const card = document.createElement('div'); card.className = 'poster-card';
        const glare = document.createElement('div'); glare.className = 'poster-card-glare';
        if (isFallback) {
            let fallbackHTML = `<div class="fallback-icon">🗀</div><div class="fallback-text">${folderName}`;
            if (task.errorType === 'auth') { fallbackHTML += `<small>认证失败, Token可能已过期</small>`; }
            fallbackHTML += `</div>`;
            card.innerHTML = `<div class="no-cover-content">${fallbackHTML}</div>`;
        } else {
            const img = document.createElement('img'); img.className = 'poster-card-img';
            const info = document.createElement('div'); info.className = 'poster-card-info';
            const titleRegex = /^\[([^\]]+)\]\s*([^(\[]+)/; const match = folderName.match(titleRegex);
            if (match) {
                const author = match[1].trim(); const title = match[2].trim();
                info.innerHTML = `<span class="info-title" title="${title}">${title}</span><span class="info-author" title="${author}">作者: ${author}</span>`;
            } else { info.innerHTML = `<span class="info-title" title="${folderName}">${folderName}</span>`; }
            card.append(img, info);
            if (task.imageBlobUrl) { img.src = task.imageBlobUrl; img.onload = () => { img.classList.add('is-loaded'); URL.revokeObjectURL(img.src); }; }
        }
        containerElement.append(card, glare);
        addPosterCardInteractiveEffects(containerElement);
    }


    // ===================================================================
    // ================= 沉浸式画廊模块 (IMMERSIVE GALLERY) ==============
    // ===================================================================

    const GALLERY_ICONS = { BACK: `<line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline>`, STANDARD_MODE: `<rect x="2" y="3" width="20" height="18" rx="2"></rect>`, WEBTOON_MODE: `<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>`, FULLWIDTH_MODE: `<path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"></path>`, LOADER: `<path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"></path><path d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.75s" repeatCount="indefinite"></animateTransform></path>`, };
    const GALLERY_TEMPLATES = { PLACEHOLDER: `<div class="card-placeholder"><div class="progress-indicator"><svg width="80" height="80" viewBox="0 0 80 80"><circle class="progress-circle-bg" stroke-width="6" cx="40" cy="40" r="35"></circle><circle class="progress-circle-bar" stroke-width="6" cx="40" cy="40" r="35"></circle></svg><span class="progress-text">0%</span></div></div>`, };
    const galleryDownloadManager = {
        queue:[],activeDownloads:0,token:null,
        initialize(t){this.token=t,this.queue=[],this.activeDownloads=0},
        schedule(t){this.queue.some(e=>e.card===t)|| (this.queue.push({card:t,priority:9999}),this.processQueue())},
        reprioritizeQueue(){const t=window.innerHeight,e=[];document.querySelectorAll(".gallery-card[data-path]").forEach(n=>{const o=n.getBoundingClientRect();o.top<t&&o.bottom>0&&e.push({card:n,priority:o.top})}),e.sort((n,o)=>n.priority-o.priority),this.queue=e,this.processQueue()},
        async processQueue(){if(document.querySelector('.gallery-card[data-is-large="true"][data-loading="true"]'))return;for(const t of this.queue)if(!(this.activeDownloads>=GALLERY_MAX_CONCURRENT_DOWNLOADS)){const e=t.card;e.dataset.path&&!e.dataset.loading&&(this.queue=this.queue.filter(n=>n.card!==e),this.loadImageForCard(e,e.dataset.path))}},
        async loadImageForCard(t,e){const{signal:n}=immersiveGalleryState.controller;t.dataset.loading="true",this.activeDownloads++;try{if(!t.dataset.size){const o=await fetch(GALLERY_API_GET_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Authorization:this.token},body:JSON.stringify({path:e}),signal:n});if(!o.ok)throw new Error(`API Get failed: ${o.status}`);const a=(await o.json()).data;t.dataset.size=a.size}const r=parseInt(t.dataset.size,10),i=r/1048576>GALLERY_LARGE_FILE_THRESHOLD_MB;if(t.dataset.isLarge=i,i&&this.activeDownloads>1)return t.dataset.loading="false",this.activeDownloads--,void this.schedule(t);let s=null;for(let l=1;l<=GALLERY_LOAD_RETRY_COUNT+1;l++)try{await this.fetchAndDecodeImage(t,e,r),s=null;break}catch(c){if(s=c,"AbortError"===c.name)break;console.warn(`[Gallery] Attempt ${l} failed for ${e}:`,c),l<=GALLERY_LOAD_RETRY_COUNT&&await new Promise(d=>setTimeout(d,500*l))}if(s)throw s;t.removeAttribute("data-path")}catch(u){"AbortError"!==u.name? (console.error(`[Gallery] Failed for ${e}.`,u),t.querySelector(".card-placeholder")&&(t.querySelector(".card-placeholder").textContent="加载失败")):console.log(`[Gallery] Cancelled for ${e}.`)}finally{const m=t.querySelector(".progress-indicator");m&&m.classList.remove("visible"),t.dataset.loading="false",this.activeDownloads--,this.processQueue()}},
        async fetchAndDecodeImage(t,e,n){const{signal:o}=immersiveGalleryState.controller,a=t.querySelector(".progress-indicator"),r=a.querySelector(".progress-circle-bar"),i=a.querySelector(".progress-text");if(!a||!r||!i)throw new Error("Progress elements not found.");const s=r.r.baseVal.value,l=2*Math.PI*s,c=d=>{r.style.strokeDashoffset=l-d/100*l,i.textContent=`${Math.floor(d)}%`};a.classList.add("visible"),c(0);const u=await fetch(GALLERY_API_LINK_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",Authorization:this.token},body:JSON.stringify({path:e}),signal:o});if(!u.ok)throw new Error(`API Link failed: ${u.status}`);const g=(await u.json()).data.url;if(!g)throw new Error("Signed URL not found.");const p=await fetch(g,{signal:o});if(!p.body)throw new Error("Response body not readable.");const h=p.body.getReader();let w=0,v=[];for(;;){const{done:y,value:b}=await h.read();if(y)break;v.push(b),w+=b.length,c(w/n*100)}const f=new Blob(v);await this.performVisualLoad(t,f)},
        async performVisualLoad(t,e){let n;try{n=typeof createImageBitmap!="undefined"?await createImageBitmap(e):await new Promise((o,a)=>{const r=URL.createObjectURL(e),i=new Image;i.onload=async()=>{await i.decode(),o(i)},i.onerror=a,i.src=r,setTimeout(()=>URL.revokeObjectURL(r),1e3)})}catch(r){throw console.error("Image decoding failed:",r),r}t.style.aspectRatio=`${n.width} / ${n.height}`;const i=document.createElement("div");i.className="gallery-image-wrapper";const s=document.createElement("canvas");s.className="gallery-image",s.width=n.width,s.height=n.height,s.getContext("2d").drawImage(n,0,0),"function"==typeof n.close&&n.close(),i.appendChild(s),t.appendChild(i);const l=t.querySelector(".card-placeholder");l&&(l.style.opacity="0"),requestAnimationFrame(()=>{s.classList.add("loaded")})}
    };

    // [v10.0] 新的画廊启动函数，由海报墙点击触发
    async function launchGalleryForPath(path, fallbackHref) {
        const token = localStorage.getItem('token');
        if (!token) {
            alert('无法获取认证Token，请刷新页面后重试。');
            window.location.href = fallbackHref;
            return;
        }

        const loader = document.createElement('div');
        loader.className = 'gallery-global-loader';
        loader.innerHTML = `<svg width="48" height="48" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${GALLERY_ICONS.LOADER}</svg>`;
        document.body.appendChild(loader);

        try {
            const listResp = await fetch(GALLERY_API_LIST_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: token },
                body: JSON.stringify({ path: path, page: 1, per_page: 0 }) // per_page: 0 获取全部
            });
            if (!listResp.ok) throw new Error(`Failed to list files: ${listResp.status}`);

            const listData = await listResp.json();
            const files = listData.data.content || [];
            galleryImageList = files.map(file => {
                const isImage = !file.is_dir && GALLERY_IMAGE_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext.toLowerCase()));
                return isImage ? { name: file.name, path: `${path.endsWith('/') ? path : path + '/'}${file.name}` } : null;
            }).filter(Boolean);

            if (galleryImageList.length < GALLERY_TRIGGER_IMAGE_COUNT) {
                console.log(`[Gallery] Not enough images (${galleryImageList.length}) to start gallery. Navigating to folder.`);
                window.location.href = fallbackHref;
                return;
            }

            await launchGallery();

        } catch (error) {
            console.error('[Gallery] Failed to launch gallery:', error);
            alert('启动画廊失败，将跳转至普通文件夹视图。');
            window.location.href = fallbackHref;
        } finally {
            loader.remove();
        }
    }

    async function launchGallery() {
        if (immersiveGalleryState.isActive) return;
        immersiveGalleryState.isActive = true; immersiveGalleryState.controller = new AbortController();
        updateViewportMeta(true);
        document.body.classList.add('gallery-is-active');
        const galleryContainer = document.createElement("div"); galleryContainer.id = GALLERY_CONTAINER_ID; document.body.appendChild(galleryContainer);

        galleryContainer.innerHTML = `
            <div class="gallery-scroll-container">
                <button class="gallery-back-btn" title="返回 (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${GALLERY_ICONS.BACK}</svg></button>
                <div class="gallery-toolbar"><button class="toolbar-btn active" data-mode="mode-standard" title="标准模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GALLERY_ICONS.STANDARD_MODE}</svg></button><button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GALLERY_ICONS.WEBTOON_MODE}</svg></button><button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${GALLERY_ICONS.FULLWIDTH_MODE}</svg></button></div>
                <div class="gallery-image-list mode-standard"></div>
                <div class="gallery-progress-bar"><div class="progress-track"><div class="progress-thumb"></div></div><div class="progress-label">0 / 0</div></div>
            </div>`;

        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        await preloadAllGalleryMetadata();

        galleryImageList.forEach(image => {
            const card = document.createElement("div"); card.className = "gallery-card"; card.dataset.path = image.path;
            if (image.size) card.dataset.size = image.size;
            card.style.aspectRatio = image.aspectRatio || '3 / 4';
            card.innerHTML = `${GALLERY_TEMPLATES.PLACEHOLDER}<div class="card-filename">${image.name}</div>`;
            imageListContainer.appendChild(card);
        });
        requestAnimationFrame(() => galleryContainer.classList.add("gallery-active"));
        setupGalleryEventListeners();
    }

    async function preloadAllGalleryMetadata() {
        const token = localStorage.getItem('token'); const CONCURRENT_LIMIT = 5; let promises = []; let executing = [];
        for (const image of galleryImageList) {
            const p = (async () => {
                try {
                    const res = await fetch(GALLERY_API_GET_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify({ path: image.path }), signal: immersiveGalleryState.controller.signal });
                    const data = await res.json();
                    image.size = data.data.size;
                    image.aspectRatio = data.data.width && data.data.height ? `${data.data.width} / ${data.data.height}` : '3 / 4';
                } catch (e) { console.warn(`Metadata preload failed for ${image.path}`); image.aspectRatio = '3 / 4'; }
            })();
            promises.push(p);
            if (CONCURRENT_LIMIT <= galleryImageList.length) { const e = p.finally(() => executing.splice(executing.indexOf(e), 1)); executing.push(e); if (executing.length >= CONCURRENT_LIMIT) await Promise.race(executing); }
        }
        await Promise.all(promises);
    }

    function setupGalleryEventListeners() {
        const container = document.getElementById(GALLERY_CONTAINER_ID); if (!container) return;
        const scrollContainer = container.querySelector('.gallery-scroll-container');
        const uiControls = [container.querySelector(".gallery-back-btn"), container.querySelector(".gallery-toolbar"), container.querySelector(".gallery-progress-bar")];
        const toggleControls = (event) => {
            if (event.target.closest('.gallery-back-btn, .gallery-toolbar, .gallery-progress-bar')) return;
            const y = event.clientY; const viewHeight = window.innerHeight;
            if (y < viewHeight / 4) { uiControls[0].classList.toggle('visible'); uiControls[1].classList.toggle('visible'); uiControls[2].classList.remove('visible'); }
            else if (y > viewHeight * 3 / 4) { uiControls[2].classList.toggle('visible'); uiControls[0].classList.remove('visible'); uiControls[1].classList.remove('visible'); }
            else { const isVisible = !uiControls[0].classList.contains('visible'); uiControls.forEach(el => el.classList.toggle('visible', isVisible)); }
            resetHideTimer();
        };
        const resetHideTimer = () => { clearTimeout(immersiveGalleryState.hideControlsTimeout); immersiveGalleryState.hideControlsTimeout = setTimeout(() => { uiControls.forEach(el => el.classList.remove('visible')); }, 3000); };
        immersiveGalleryState.clickHandler = toggleControls; container.addEventListener('click', immersiveGalleryState.clickHandler);
        setTimeout(() => { uiControls.forEach(el => el.classList.add('visible')); resetHideTimer(); }, 500);
        container.querySelector(".gallery-back-btn").addEventListener("click", closeGallery);
        document.addEventListener("keydown", handleGalleryKeyPress);
        setupGalleryProgressBar(scrollContainer);
        const toolbar = container.querySelector(".gallery-toolbar"), imageListContainer = container.querySelector(".gallery-image-list");
        if (toolbar && imageListContainer) {
            toolbar.addEventListener("click", e => {
                const button = e.target.closest(".toolbar-btn"); if (!button) return;
                const mode = button.dataset.mode;
                ["mode-standard", "mode-webtoon", "mode-full-width"].forEach(m => imageListContainer.classList.remove(m));
                imageListContainer.classList.add(mode);
                toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active"));
                button.classList.add("active");
                setupGalleryLazyLoading(true, mode === 'mode-webtoon' ? '300%' : '100%');
            });
        }
        setupGalleryLazyLoading(false);
    }

    function setupGalleryLazyLoading(isResuming = false, rootMargin = '100%') {
        const token = localStorage.getItem('token'); if (!token) return;
        const scrollContainer = document.querySelector(".gallery-scroll-container"); if (!scrollContainer) return;
        if (!isResuming) {
            galleryDownloadManager.initialize(token);
            if (!scrollContainer.reprioritizeListener) {
                const debouncedReprioritize = debounce(() => galleryDownloadManager.reprioritizeQueue(), 150);
                scrollContainer.addEventListener('scroll', debouncedReprioritize, { passive: true });
                scrollContainer.reprioritizeListener = debouncedReprioritize;
            }
        }
        if (galleryLoadObserver) galleryLoadObserver.disconnect(); if (galleryAnimationObserver) galleryAnimationObserver.disconnect();
        galleryLoadObserver = new IntersectionObserver((entries) => { entries.forEach(entry => { if (entry.isIntersecting && entry.target.dataset.path) { entry.target.classList.add('is-visible'); galleryDownloadManager.schedule(entry.target); galleryLoadObserver.unobserve(entry.target); } }); }, { root: scrollContainer, rootMargin });
        document.querySelectorAll('.gallery-card[data-path]').forEach(card => galleryLoadObserver.observe(card));
        if (!isResuming) setTimeout(() => galleryDownloadManager.reprioritizeQueue(), 100);
    }

    function setupGalleryProgressBar(scrollContainer) {
        const track = scrollContainer.querySelector('.progress-track'), thumb = scrollContainer.querySelector('.progress-thumb'), label = scrollContainer.querySelector('.progress-label'); if (!track || !thumb || !label) return;
        const updateProgress = () => {
            const scrollableHeight = scrollContainer.scrollHeight - scrollContainer.clientHeight;
            if (scrollableHeight <= 0) { thumb.style.left = '0%'; label.textContent = galleryImageList.length > 0 ? `1 / ${galleryImageList.length}` : `0 / 0`; return; }
            const progress = scrollContainer.scrollTop / scrollableHeight;
            const currentIndex = Math.min(galleryImageList.length, Math.max(1, Math.floor(progress * galleryImageList.length) + 1));
            thumb.style.left = `${progress * 100}%`; label.textContent = `${currentIndex} / ${galleryImageList.length}`;
        };
        immersiveGalleryState.progressScrollHandler = updateProgress; scrollContainer.addEventListener('scroll', updateProgress, { passive: true });
        let isDragging = false; const getEventX = (e) => e.clientX || (e.touches && e.touches[0].clientX);
        const startDrag = (e) => { isDragging = true; seek(e); document.body.style.userSelect = 'none'; scrollContainer.style.pointerEvents = 'none'; };
        const endDrag = () => { isDragging = false; document.body.style.userSelect = ''; scrollContainer.style.pointerEvents = ''; };
        const drag = (e) => { if (isDragging) seek(e); };
        const seek = (e) => { const rect = track.getBoundingClientRect(); const clientX = getEventX(e); if (clientX === undefined) return; const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)); scrollContainer.scrollTop = percent * (scrollContainer.scrollHeight - scrollContainer.clientHeight); };
        track.addEventListener('mousedown', startDrag); document.addEventListener('mousemove', drag); document.addEventListener('mouseup', endDrag);
        track.addEventListener('touchstart', startDrag, { passive: true }); document.addEventListener('touchmove', drag, { passive: true }); document.addEventListener('touchend', endDrag);
        updateProgress();
    }

    function closeGallery() {
        if (!immersiveGalleryState.isActive) return; if (immersiveGalleryState.controller) immersiveGalleryState.controller.abort();
        const sc = document.querySelector(".gallery-scroll-container");
        if (sc) {
            if(immersiveGalleryState.clickHandler) sc.removeEventListener('click', immersiveGalleryState.clickHandler);
            if(immersiveGalleryState.progressScrollHandler) sc.removeEventListener('scroll', immersiveGalleryState.progressScrollHandler);
            if(sc.reprioritizeListener) sc.removeEventListener('scroll', sc.reprioritizeListener);
        }
        updateViewportMeta(false); clearTimeout(immersiveGalleryState.hideControlsTimeout);
        galleryDownloadManager.queue = []; immersiveGalleryState.isActive = false;
        const gc = document.getElementById(GALLERY_CONTAINER_ID);
        if (gc) { gc.classList.remove("gallery-active"); gc.addEventListener("transitionend", () => { gc.remove(); document.body.classList.remove('gallery-is-active'); }, { once: true }); }
        document.removeEventListener("keydown", handleGalleryKeyPress);
        if (galleryLoadObserver) galleryLoadObserver.disconnect(); if (galleryAnimationObserver) galleryAnimationObserver.disconnect();
    }

    function handleGalleryKeyPress(e) { if (e.key === "Escape") closeGallery(); }
    function updateViewportMeta(enableEdgeToEdge) {
        let viewport = document.querySelector('meta[name="viewport"]');
        if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.appendChild(viewport); }
        if (enableEdgeToEdge) { originalViewport = viewport.content; viewport.content = `${originalViewport}, viewport-fit=cover`; }
        else if (originalViewport) { viewport.content = originalViewport; }
    }


    // ===================================================================
    // ====================== 脚本初始化与主逻辑 =======================
    // ===================================================================

    function initialize() {
        createPosterWallView();
        const debouncedButtonCreation = debounce(() => {
            if (document.querySelector('.obj-box')) { createPosterWallActivationButton(); }
            else { posterElements.isButtonInjected = false; }
        }, 200);
        const rootElement = document.getElementById('root');
        if (rootElement) {
            const observer = new MutationObserver(debouncedButtonCreation);
            observer.observe(rootElement, { childList: true, subtree: true });
        }
        debouncedButtonCreation();
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initialize); } else { initialize(); }

})();
