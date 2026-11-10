/*!
 * giscus client.ts @ 3d6430237108ca4ee3eb6a1a20595201c09c72d5
 * https://github.com/giscus/giscus/blob/3d6430237108ca4ee3eb6a1a20595201c09c72d5/client.ts
 * The widget stays on giscus.app, and only its iframe can send widget messages.
 *
 * MIT License
 *
 * Copyright (c) 2021 Sage M. Abdullah
 * Copyright (c) 2018 Jeremy Danyow
 * Copyright (c) 2018 Chris Veness
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(function() {
    const GISCUS_SESSION_KEY = 'giscus-session';
    const script = document.currentScript;
    const giscusOrigin = 'https://giscus.app';
    function formatError(message) {
        return `[giscus] An error occurred. Error message: "${message}".`;
    }
    function getMetaContent(property, og = false) {
        const ogSelector = og ? `meta[property='og:${property}'],` : '';
        const element = document.querySelector(ogSelector + `meta[name='${property}']`);
        return element ? element.content : '';
    }
    const url = new URL(location.href);
    let session = url.searchParams.get('giscus') || '';
    const savedSession = localStorage.getItem(GISCUS_SESSION_KEY);
    url.searchParams.delete('giscus');
    url.hash = '';
    const cleanedLocation = url.toString();
    if (session) {
        localStorage.setItem(GISCUS_SESSION_KEY, JSON.stringify(session));
        history.replaceState(undefined, document.title, cleanedLocation);
    } else if (savedSession) {
        try {
            session = JSON.parse(savedSession);
        } catch (e) {
            localStorage.removeItem(GISCUS_SESSION_KEY);
            console.warn(`${formatError(e?.message)} Session has been cleared.`);
        }
    }
    const attributes = script.dataset;
    const params = {};
    params.origin = cleanedLocation;
    params.session = session;
    params.theme = attributes.theme;
    params.reactionsEnabled = attributes.reactionsEnabled || '1';
    params.emitMetadata = attributes.emitMetadata || '0';
    params.inputPosition = attributes.inputPosition || 'bottom';
    params.repo = attributes.repo;
    params.repoId = attributes.repoId;
    params.category = attributes.category || '';
    params.categoryId = attributes.categoryId;
    params.strict = attributes.strict || '0';
    params.description = getMetaContent('description', true);
    params.backLink = getMetaContent('giscus:backlink') || cleanedLocation;
    switch(attributes.mapping){
        case 'url':
            params.term = cleanedLocation;
            break;
        case 'title':
            params.term = document.title;
            break;
        case 'og:title':
            params.term = getMetaContent('title', true);
            break;
        case 'specific':
            params.term = attributes.term;
            break;
        case 'number':
            params.number = attributes.term;
            break;
        case 'pathname':
        default:
            params.term = location.pathname.length < 2 ? 'index' : location.pathname.substring(1).replace(/\.\w+$/, '');
            break;
    }
    const existingContainer = document.querySelector('.giscus');
    const id = existingContainer && existingContainer.id;
    if (id) {
        params.origin = `${cleanedLocation}#${id}`;
    }
    const locale = attributes.lang ? `/${attributes.lang}` : '';
    const src = `${giscusOrigin}${locale}/widget?${new URLSearchParams(params)}`;
    const loading = attributes.loading === 'lazy' ? 'lazy' : undefined;
    const iframeElement = document.createElement('iframe');
    const iframeAttributes = {
        class: 'giscus-frame giscus-frame--loading',
        title: 'Comments',
        scrolling: 'no',
        allow: 'clipboard-write',
        src,
        loading
    };
    Object.entries(iframeAttributes).forEach(([key, value])=>value && iframeElement.setAttribute(key, value));
    iframeElement.style.opacity = '0';
    iframeElement.addEventListener('load', ()=>{
        iframeElement.style.removeProperty('opacity');
        iframeElement.classList.remove('giscus-frame--loading');
    });
    const style = document.getElementById('giscus-css') || document.createElement('link');
    style.id = 'giscus-css';
    style.rel = 'stylesheet';
    style.href = `${giscusOrigin}/default.css`;
    document.head.prepend(style);
    if (!existingContainer) {
        const iframeContainer = document.createElement('div');
        iframeContainer.setAttribute('class', 'giscus');
        iframeContainer.appendChild(iframeElement);
        script.insertAdjacentElement('afterend', iframeContainer);
    } else {
        while(existingContainer.firstChild)existingContainer.firstChild.remove();
        existingContainer.appendChild(iframeElement);
    }
    const suggestion = `Please consider reporting this error at https://github.com/giscus/giscus/issues/new.`;
    function signOut() {
        delete params.session;
        const src = `${giscusOrigin}${locale}/widget?${new URLSearchParams(params)}`;
        iframeElement.src = src;
    }
    window.addEventListener('message', (event)=>{
        if (event.origin !== giscusOrigin || event.source !== iframeElement.contentWindow) return;
        const { data } = event;
        if (!(data && typeof data === 'object' && data.giscus)) return;
        if (data.giscus.resizeHeight) {
            iframeElement.style.height = `${data.giscus.resizeHeight}px`;
        }
        if (data.giscus.signOut) {
            localStorage.removeItem(GISCUS_SESSION_KEY);
            console.log(`[giscus] User has logged out. Session has been cleared.`);
            signOut();
            return;
        }
        if (!data.giscus.error) return;
        const message = data.giscus.error;
        if (message.includes('Bad credentials') || message.includes('Invalid state value') || message.includes('State has expired')) {
            if (localStorage.getItem(GISCUS_SESSION_KEY) !== null) {
                localStorage.removeItem(GISCUS_SESSION_KEY);
                console.warn(`${formatError(message)} Session has been cleared.`);
                signOut();
            } else if (!savedSession) {
                console.error(`${formatError(message)} No session is stored initially. ${suggestion}`);
            }
        } else if (message.includes('Discussion not found')) {
            console.warn(`[giscus] ${message}. A new discussion will be created if a comment/reaction is submitted.`);
        } else if (message.includes('API rate limit exceeded')) {
            console.warn(formatError(message));
        } else {
            console.error(`${formatError(message)} ${suggestion}`);
        }
    });
})();
