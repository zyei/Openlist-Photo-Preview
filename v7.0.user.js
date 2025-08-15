// ==UserScript==
// @name         Alist 沉浸式图廊 (Immersive Gallery) v7.0 Symphony
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  为 Alist/OpenList 提供一个拥有极致动画效果的图片浏览模式，实现了动态比例变换、色彩绽放、伪渐进式加载和Webtoon阅读模式。
// @author       Your Name & AI
// @include      /^https?://127\.0\.0\.1:5244/.*$/
// @include      /^https?://192\.168\.\d{1,3}\.\d{1,3}:5244/.*$/
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBmaWxsPSIjOGFjNmZmIiBkPSJNMjIgMTZWNGEyIDIgMCAwIDAtMi0ySDhNMyA2djEyYTIgMiAwIDAgMCAyIDJoMTJhMiAyIDAgMCAwIDItMlY4bC00LTRINWExIDEgMCAwIDEgMC0yaDEwVjRoNFYybC00IDRIM2EyIDIgMCAwIDAtMiAydjE0YTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY2aC0ydjEwaC04bC0yLTItMiAySDV2LTRoN2wtMy0zSDVhMSAxIDAgMCAxIDAtMmgzLjE3MmwzIDNIMTlWNkwzIDZtMi0yaDEwbDMgM0g1YTEgMSAwIDAgMSAwLTJtNSA5YTEuNSAxLjUgMCAxIDEgMC0zYTEuNSAxLjUgMCAwIDEgMCAzWiIvPjwvc3ZnPg==
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    console.log('[Alist Gallery] Script v7.0 (Symphony) is running!');

    // --- 配置项 ---
    const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.avif', '.svg', '.JPG', '.jxl', '.JXL'];
    const TRIGGER_IMAGE_COUNT = 5;
    const GALLERY_BUTTON_ID = 'immersive-gallery-trigger-btn';
    const GALLERY_CONTAINER_ID = 'immersive-gallery-container';
    const API_ENDPOINT = '/api/fs/link';

    let imageList = [];
    let intersectionObserver = null;
    let galleryState = { isActive: false, lastScrollY: 0 };

    // --- v7.0 最终样式 ---
    GM_addStyle(`
        /* --- 修复退出Bug的CSS覆盖方案 --- */
        body.gallery-is-active { overflow: hidden; }
        body.gallery-is-active > #root { position: fixed; top: 0; left: 0; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }

        /* --- 动态浅色背景 + 磨砂质感噪点 --- */
        #${GALLERY_CONTAINER_ID} {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 9999; overflow-y: auto; opacity: 0;
            transition: opacity 0.5s ease-in-out;
            --gradient-color-1: #e0c3fc; --gradient-color-2: #8ec5fc; --gradient-color-3: #f0f2f5;
            background: linear-gradient(135deg, var(--gradient-color-1), var(--gradient-color-2), var(--gradient-color-3));
            background-size: 400% 400%;
            animation: gradientAnimation 25s ease infinite;
        }
        #${GALLERY_CONTAINER_ID}::after {
            content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            pointer-events: none;
            background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAMAAAAp4XiDAAAAUVBMVEWFhYWDg4N3d3dtbW17e3t1dXWBgYGHh4d5eXlzc3OLi4ubm5uVlZWPj4+NjY19fX2JiYl/f39sbGxvb29xcXGTk5NpaWmRkZGtra2YmJikpKSnp6e6urqioqK7u7vBwcGRs20AAAAuSURBVDjL7dBEAQAgEMCwA/9/mB8jUr83AST9S7y9cwAAAAAAAAAAAAAAAAAA4G4A0x8AASs0GAAAAABJRU5ErkJggg==');
            background-repeat: repeat;
            opacity: 0.25;
            animation: grain 8s steps(10) infinite;
        }
        @keyframes gradientAnimation { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
        @keyframes grain { 0%, 100% { transform: translate(0, 0); } 10% { transform: translate(-5%, -10%); } 20% { transform: translate(-15%, 5%); } 30% { transform: translate(7%, -25%); } 40% { transform: translate(-5%, 25%); } 50% { transform: translate(-15%, 10%); } 60% { transform: translate(15%, 0%); } 70% { transform: translate(0%, 15%); } 80% { transform: translate(3%, 35%); } 90% { transform: translate(-10%, 10%); } }
        #${GALLERY_CONTAINER_ID}.gallery-active { opacity: 1; }

        /* --- 控件与按钮样式 (浅色适配) --- */
        #${GALLERY_BUTTON_ID}{position:fixed;bottom:25px;right:25px;width:55px;height:55px;background:white;color:#333;border-radius:50%;border:none;cursor:pointer;z-index:9998;display:flex;justify-content:center;align-items:center;box-shadow:0 6px 20px rgba(0,0,0,.15);transition:transform .2s cubic-bezier(.34,1.56,.64,1),box-shadow .2s;opacity:0;transform:scale(0);animation:fadeIn .5s .2s forwards}#${GALLERY_BUTTON_ID}:hover{transform:scale(1.15);box-shadow:0 8px 25px rgba(0,0,0,.2)}@keyframes fadeIn{to{opacity:1;transform:scale(1)}}#${GALLERY_BUTTON_ID} svg{width:28px;height:28px;color:#8ec5fc;}
        .gallery-back-btn,.gallery-toolbar{background:rgba(255,255,255,.5);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);border:1px solid rgba(0,0,0,.08);color:#333;transition:all .3s ease}.gallery-back-btn{position:fixed;top:20px;left:20px;width:44px;height:44px;border-radius:50%;z-index:10001;display:flex;justify-content:center;align-items:center;cursor:pointer}.gallery-back-btn:hover{background:rgba(255,255,255,.7);transform:scale(1.1)}.gallery-toolbar{position:fixed;top:20px;right:20px;z-index:10001;display:flex;gap:10px;padding:8px;border-radius:22px;opacity:0;visibility:hidden;transform:translateY(-20px)}#${GALLERY_CONTAINER_ID}:hover .gallery-toolbar{opacity:1;visibility:visible;transform:translateY(0)}.toolbar-btn{width:36px;height:36px;border:none;background:transparent;color:#333;cursor:pointer;border-radius:50%;display:flex;justify-content:center;align-items:center;transition:background-color .2s, color .2s}.toolbar-btn:hover{background:rgba(0,0,0,.05)}.toolbar-btn.active{background:#8ec5fc;color:#fff !important}

        /* --- 图像卡片与占位符 --- */
        .gallery-image-list { display: flex; flex-direction: column; align-items: center; gap: 40px; padding: 10vh 0; transition: gap 0.4s ease; }
        .gallery-card {
            width: 90%;
            border-radius: 16px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
            overflow: hidden;
            position: relative;
            background-color: rgba(255,255,255,0.2);
            opacity: 0; transform: translateY(60px) scale(0.9);
            transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), aspect-ratio 0.6s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.4s ease;
            aspect-ratio: 3 / 4;
            min-height: 300px;
        }
        .gallery-card.is-visible { opacity: 1; transform: translateY(0) scale(1); }
        .card-placeholder {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            backdrop-filter: blur(40px) saturate(150%);
            -webkit-backdrop-filter: blur(40px) saturate(150%);
            display: flex; justify-content: center; align-items: center;
            color: rgba(0,0,0,0.4); font-family: sans-serif; font-size: 1.2em;
            transition: opacity 0.8s ease-out;
        }

        /* --- 色彩绽放效果 --- */
        .thumbnail-bg {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            background-size: cover;
            background-position: center;
            /* 使用 clip-path 实现圆角矩形扩散 */
            clip-path: inset(50% 50% 50% 50% round 16px);
            transition: clip-path 0.8s cubic-bezier(0.25, 1, 0.5, 1);
            transform: scale(1.1); /* 初始放大，让边缘更模糊 */
        }
        .thumbnail-bg.reveal {
            clip-path: inset(0% 0% 0% 0% round 16px);
        }

        /* --- 伪渐进式加载 --- */
        .gallery-image-wrapper { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
        .gallery-image {
            display: block; width: 100%; height: 100%;
            opacity: 0;
            filter: blur(20px);
            transform: scale(1.1);
            /* 动画时间延长 */
            transition: opacity 1.2s ease-out, filter 1.2s ease-out, transform 1.2s ease-out;
            object-fit: contain;
        }
        .gallery-image.loaded { opacity: 1; filter: blur(0px); transform: scale(1); }

        /* --- 新的三种模式 --- */
        .gallery-image-list.mode-standard .gallery-card { max-width: 1000px; }
        .gallery-image-list.mode-webtoon { gap: 0; }
        .gallery-image-list.mode-webtoon .gallery-card { width: 100%; max-width: 100%; border-radius: 0; box-shadow: none; background: transparent; }
        .gallery-image-list.mode-webtoon .gallery-image { object-fit: cover; }
        .gallery-image-list.mode-webtoon .card-filename, .gallery-image-list.mode-webtoon .thumbnail-bg { display: none; }
        .gallery-image-list.mode-full-width .gallery-card { width: 95vw; max-width: 95vw; }

        .card-filename{position:absolute;bottom:0;left:0;width:100%;padding:20px;box-sizing:border-box;background:linear-gradient(to top,rgba(0,0,0,.7),transparent);color:#fff;font-size:16px;opacity:0;transition:opacity .3s;pointer-events:none;text-shadow:0 1px 3px black}.gallery-card:hover .card-filename{opacity:1}
    `);

    function scanForImages(){const links=Array.from(document.querySelectorAll("a.list-item")),foundImages=links.map(link=>{const nameElement=link.querySelector("p.name");if(!nameElement)return null;const text=nameElement.textContent.trim(),isImage=IMAGE_EXTENSIONS.some(ext=>text.toLowerCase().endsWith(ext.toLowerCase())),rawPath=decodeURIComponent(new URL(link.href).pathname);return isImage?{name:text,path:rawPath}:null}).filter(Boolean),btn=document.getElementById(GALLERY_BUTTON_ID);foundImages.length>=TRIGGER_IMAGE_COUNT?(imageList=foundImages,btn||createGalleryTriggerButton()):(imageList=[],btn&&btn.remove())}
    function createGalleryTriggerButton(){const button=document.createElement("button");button.id=GALLERY_BUTTON_ID,button.title="进入沉浸式图廊",button.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,button.addEventListener("click",launchGallery),document.body.appendChild(button)}

    function launchGallery() {
        if (galleryState.isActive) return;
        galleryState.isActive = true;
        galleryState.lastScrollY = window.scrollY;
        document.body.classList.add('gallery-is-active');
        const galleryContainer = document.createElement("div");
        galleryContainer.id = GALLERY_CONTAINER_ID;
        document.body.appendChild(galleryContainer);
        galleryContainer.innerHTML = `<button class="gallery-back-btn" title="返回 (Esc)"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg></button><div class="gallery-toolbar"><button class="toolbar-btn active" data-mode="mode-standard" title="标准模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="2" /></svg></button><button class="toolbar-btn" data-mode="mode-webtoon" title="Webtoon模式"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg></button><button class="toolbar-btn" data-mode="mode-full-width" title="全屏宽度"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12H2m4-4-4 4 4 4M18 8l4 4-4 4"/></svg></button></div><div class="gallery-image-list mode-standard"></div>`;
        const imageListContainer = galleryContainer.querySelector(".gallery-image-list");
        imageList.forEach(image => {
            const card = document.createElement("div");
            card.className = "gallery-card";
            card.dataset.path = image.path;
            card.innerHTML = `<div class="card-placeholder"></div><div class="card-filename">${image.name}</div>`;
            imageListContainer.appendChild(card);
        });
        requestAnimationFrame(() => galleryContainer.classList.add("gallery-active"));
        setupEventListeners();
        setupLazyLoading();
    }

    function closeGallery(){if(!galleryState.isActive)return;galleryState.isActive=!1;const galleryContainer=document.getElementById(GALLERY_CONTAINER_ID);galleryContainer&&(galleryContainer.classList.remove("gallery-active"),galleryContainer.addEventListener("transitionend",()=>{galleryContainer.remove();document.body.classList.remove('gallery-is-active'),window.scrollTo(0,galleryState.lastScrollY)},{once:!0})),document.removeEventListener("keydown",handleKeyPress),intersectionObserver&&(intersectionObserver.disconnect(),intersectionObserver=null)}

    function setupEventListeners() {
        document.querySelector(".gallery-back-btn").addEventListener("click", closeGallery);
        document.addEventListener("keydown", handleKeyPress);
        const toolbar = document.querySelector(".gallery-toolbar"), imageListContainer = document.querySelector(".gallery-image-list");
        if (toolbar && imageListContainer) {
            toolbar.addEventListener("click", e => {
                const button = e.target.closest(".toolbar-btn");
                if (button) {
                    const mode = button.dataset.mode;
                    ["mode-standard", "mode-webtoon", "mode-full-width"].forEach(m => imageListContainer.classList.remove(m));
                    imageListContainer.classList.add(mode);
                    toolbar.querySelectorAll(".toolbar-btn").forEach(btn => btn.classList.remove("active"));
                    button.classList.add("active");
                }
            });
        }
    }

    function handleKeyPress(e){"Escape"===e.key&&closeGallery()}

    function setupLazyLoading() {
        const token = localStorage.getItem('token');
        if (!token) console.warn('[Alist Gallery] Token not found.');

        const cards = document.querySelectorAll('.gallery-card');

        intersectionObserver = new IntersectionObserver(async (entries, observer) => {
            // 一次性处理所有进入视口的 entry，实现一次最多三张的加载
            const entriesToLoad = entries.filter(e => e.isIntersecting);

            for (const entry of entriesToLoad) {
                const card = entry.target;
                const path = card.dataset.path;
                if (!path) continue;

                observer.unobserve(card);
                card.removeAttribute('data-path');
                card.classList.add('is-visible');

                const placeholder = card.querySelector('.card-placeholder');

                try {
                    const response = await fetch(API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token }, body: JSON.stringify({ path, password: "" }) });
                    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
                    const data = await response.json();
                    const signedUrl = data?.data?.url;
                    if (!signedUrl) throw new Error("Signed URL not found.");

                    // --- VISUAL SYMPHONY LOGIC ---
                    const tempImg = new Image();
                    tempImg.src = signedUrl;
                    tempImg.onload = () => {
                        // 1. 动态调整比例
                        card.style.aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;

                        // 2. 客户端生成缩略图并实现色彩绽放
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');
                        canvas.width = 100; // 缩略图宽度
                        canvas.height = canvas.width / (tempImg.naturalWidth / tempImg.naturalHeight);
                        ctx.drawImage(tempImg, 0, 0, canvas.width, canvas.height);
                        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.2); // 低质量JPEG

                        const thumbBg = document.createElement('div');
                        thumbBg.className = 'thumbnail-bg';
                        thumbBg.style.backgroundImage = `url(${thumbnailUrl})`;
                        card.prepend(thumbBg);

                        // 触发绽放动画
                        requestAnimationFrame(() => thumbBg.classList.add('reveal'));

                        // 3. 伪渐进式加载完整图片
                        const imageWrapper = document.createElement('div');
                        imageWrapper.className = 'gallery-image-wrapper';
                        const finalImage = new Image();
                        finalImage.src = signedUrl;
                        finalImage.className = 'gallery-image';
                        imageWrapper.appendChild(finalImage);

                        finalImage.onload = () => {
                            if (placeholder) {
                                placeholder.style.opacity = '0';
                                setTimeout(() => placeholder.remove(), 800);
                            }
                            card.appendChild(imageWrapper);
                            requestAnimationFrame(() => requestAnimationFrame(() => finalImage.classList.add('loaded')));
                        };
                        finalImage.onerror = () => { if (placeholder) placeholder.textContent = '加载失败'; };
                    };
                    tempImg.onerror = () => { if (placeholder) placeholder.textContent = '尺寸获取失败'; };
                } catch (error) {
                    console.error(`[Alist Gallery] Error for path ${path}:`, error);
                    if (placeholder) placeholder.textContent = '获取链接失败';
                }
            }
        }, {
            root: null,
            rootMargin: '100% 0px', // 上下各预加载一个屏幕的高度，确保滚动流畅
            threshold: 0.01
        });

        cards.forEach(card => intersectionObserver.observe(card));
    }

    // --- 初始化与监听 ---
    const observer = new MutationObserver(() => {
        setTimeout(() => {
            if (document.querySelector('.list.viselect-container')) {
                scanForImages();
            } else {
                const btn = document.getElementById(GALLERY_BUTTON_ID);
                if (btn) btn.remove();
            }
        }, 500);
    });
    const rootObserver = new MutationObserver((_, obs) => {
        const mainContentArea = document.querySelector(".obj-box");
        if (mainContentArea) {
            observer.observe(mainContentArea, { childList: true, subtree: true });
            scanForImages();
            obs.disconnect();
        }
    });
    rootObserver.observe(document.body, { childList: true, subtree: true });

})();
