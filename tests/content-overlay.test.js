'use strict';
// The upstream automatic-feed/row geometry tests are replaced by the explicit
// click contract. Provider, credential, Markdown and queue suites remain intact.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const core = require('../extension/feed-core.js');
const layout = require('../extension/overlay-layout.js');
const ui = require('../extension/ui-i18n.js');

function fixture({postCount=2,connectError=null,historyAck=true}={}) {
  const writes = [], nodes = [], timeouts = new Map(), frames = new Map(), intervals = [];
  const intersectionObservers = [], mutationObservers = [], resizeObservers = [];
  const copied=[];let copyFailure=false;
  let nextTimer = 0, now = 1800000000000, postExtractions = 0;
  const events = () => {
    const listeners = new Map();
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
      removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(item => item !== fn)); },
      emit(type, detail = {}) { for (const fn of listeners.get(type) || []) fn({ type, target:this, stopPropagation(){}, preventDefault(){}, ...detail }); }
    };
  };
  const record = (node, operation) => { if (node.original) writes.push(`${node.label || node.tagName}: ${operation}`); };
  class Element {
    constructor(tag, label) {
      this.tagName = tag.toUpperCase(); this.label = label; this.original = false;
      this.childNodes = []; this.parentNode = null; this.attributes = new Map();
      this._text = ''; this._hidden = false; this.rect = { top: 0, bottom: 180, left: 0, right: 320, width: 320, height: 180 };
      Object.assign(this, events());
      const values = Object.create(null);
      this.style = new Proxy({
        setProperty: (key, value) => { record(this, `style.${key}`); values[key] = String(value); },
        removeProperty: key => { record(this, `style.${key}`); delete values[key]; },
        getPropertyValue: key => values[key] || ''
      }, {
        get(target, key) { return key in target ? target[key] : values[key] || ''; },
        set: (target, key, value) => { record(this, `style.${String(key)}`); values[key] = String(value); return true; }
      });
      this.classList = {
        add: (...names) => this.className = [...new Set([...this.className.split(/\s+/), ...names])].filter(Boolean).join(' '),
        remove: (...names) => this.className = this.className.split(/\s+/).filter(name => !names.includes(name)).join(' '),
        contains: name => this.className.split(/\s+/).includes(name),
        toggle: (name, force) => { const add = force === undefined ? !this.classList.contains(name) : force; add ? this.classList.add(name) : this.classList.remove(name); return add; }
      };
      this.dataset = new Proxy({}, {
        get: (_, name) => this.getAttribute(`data-${String(name).replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}`),
        set: (_, name, value) => { this.setAttribute(`data-${String(name).replace(/[A-Z]/g, value => `-${value.toLowerCase()}`)}`, value); return true; }
      });
      nodes.push(this);
    }
    get children() { return this.childNodes.filter(node => node instanceof Element); }
    get parentElement() { return this.parentNode instanceof Element ? this.parentNode : null; }
    get isConnected() { return this === document.body || this === document.head || Boolean(this.parentNode?.isConnected || this.host?.isConnected); }
    get className() { return this.attributes.get('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get id() { return this.attributes.get('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get lang() { return this.getAttribute('lang') || ''; }
    set lang(value) { this.setAttribute('lang',value); }
    get hidden() { return this._hidden; }
    set hidden(value) { record(this, 'hidden'); this._hidden = Boolean(value); }
    get textContent() { return this._text + this.childNodes.map(node => node.textContent || '').join(''); }
    set textContent(value) { record(this, 'textContent'); this._text = String(value); this.childNodes = []; }
    get scrollHeight() { return 180; }
    get offsetHeight() { return Number.parseFloat(this.style.height) || 180; }
    get offsetWidth() { return Number.parseFloat(this.style.width) || 320; }
    get clientHeight() { return this.offsetHeight; }
    get clientWidth() { return this.offsetWidth; }
    setAttribute(name, value) { record(this, `attribute ${name}`); this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { record(this, `remove attribute ${name}`); this.attributes.delete(name); }
    toggleAttribute(name, force) { const add = force ?? !this.hasAttribute(name); add ? this.setAttribute(name, '') : this.removeAttribute(name); return add; }
    append(...children) {
      record(this, 'append');
      for (let child of children) {
        if (typeof child === 'string') child = { textContent: child, parentNode: null };
        if (child.parentNode) child.remove();
        child.parentNode = this; this.childNodes.push(child);
      }
    }
    focus() { document.activeElement=this; }
    insertBefore(child, reference) { if(child.parentNode)child.remove();child.parentNode=this;const index=this.childNodes.indexOf(reference);this.childNodes.splice(index<0?this.childNodes.length:index,0,child); }
    appendChild(child) { this.append(child); return child; }
    prepend(...children) { record(this, 'prepend'); for (const child of [...children].reverse()) { if (child.parentNode) child.remove(); child.parentNode = this; this.childNodes.unshift(child); } }
    replaceChildren(...children) { record(this, 'replaceChildren'); for (const child of this.childNodes) child.parentNode = null; this.childNodes = []; this._text = ''; this.append(...children); }
    remove() { if (this.parentNode) { record(this.parentNode, 'removeChild'); this.parentNode.childNodes = this.parentNode.childNodes.filter(node => node !== this); this.parentNode = null; } }
    attachShadow() { record(this, 'attachShadow'); const shadow = new Element('#shadow-root'); shadow.host = this; this.testShadow = shadow; return shadow; }
    contains(node) { return node === this || this.childNodes.some(child => child.contains?.(node)) || this.testShadow?.contains(node) || false; }
    getBoundingClientRect() {
      if (this.original) return { ...this.rect };
      const left = Number.parseFloat(this.style.left) || 0, top = Number.parseFloat(this.style.top) || 0;
      const width = this.offsetWidth, height = this.offsetHeight;
      return { left, top, width, height, right: left + width, bottom: top + height };
    }
    querySelectorAll(selector) { return descendants(this).filter(node => matches(node, selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    matches(selector) { return matches(this, selector); }
    closest(selector) { let current = this; while (current) { if (current.matches?.(selector)) return current; current = current.parentElement; } return null; }
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  function matches(node, selector) {
    if(selector.includes(','))return selector.split(',').some(part=>matches(node,part.trim()));
    if (selector === 'article[data-testid="tweet"]') return node.tagName === 'ARTICLE' && node.getAttribute('data-testid') === 'tweet';
    const testId = selector.match(/^\[data-testid=["']([^"']+)["']\]$/)?.[1];
    if (testId) return node.getAttribute('data-testid') === testId;
    const attribute = selector.match(/^\[([\w-]+)=["']([^"']+)["']\]$/);
    if(attribute)return node.getAttribute(attribute[1])===attribute[2];
    if(selector==='dialog[open]')return node.tagName==='DIALOG'&&node.hasAttribute('open');
    if(selector==='a[href]')return node.tagName==='A'&&(node.hasAttribute('href')||typeof node.href==='string');
    if (selector.startsWith('#')) return node.id === selector.slice(1);
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    return node.tagName.toLowerCase() === selector;
  }
  const document = { ...events(), hidden: false, visibilityState: 'visible' };
  document.body = new Element('body', 'body'); document.head = new Element('head', 'head');
  document.documentElement = new Element('html', 'html');
  document.documentElement.append(document.head,document.body);
  document.documentElement.lang='zh-CN';
  document.createElement = tag => new Element(tag);
  document.createElementNS = (_namespace, tag) => new Element(tag);
  document.createTextNode = text => ({ textContent: text, parentNode: null,
    remove() {if(this.parentNode){this.parentNode.childNodes=this.parentNode.childNodes.filter(child=>child!==this);this.parentNode=null;}}
  });
  document.querySelectorAll = selector => [...document.body.querySelectorAll(selector), ...document.head.querySelectorAll(selector)];
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.getElementById = id => document.querySelector(`#${id}`);
  const navigation = new Element('header', 'left navigation');
  const primary = new Element('div', 'center feed'); primary.setAttribute('data-testid', 'primaryColumn');
  primary.rect = {left:270,right:870,top:0,bottom:960,width:600,height:960};
  const sidebar = new Element('aside', 'right sidebar'); sidebar.setAttribute('data-testid', 'sidebarColumn');
  sidebar.rect = {left:900,right:1250,top:0,bottom:960,width:350,height:960};
  document.body.append(navigation, primary, sidebar);
  const articles = Array.from({length:postCount},(_,index)=>index).map(index => {
    const article = new Element('article', `post ${index + 1}`); article.setAttribute('data-testid', 'tweet');
    article.rect = { left: 270, right: 870, top: 90 + index * 280, bottom: 370 + index * 280, width: 600, height: 280 };
    article.postData = { id: String(100 + index), url: `https://x.com/test/status/${100 + index}`, text: `Original post ${index}`, author: '@test', images: [], quotedContext: '' };
    article.append(new Element('div', `post ${index + 1} body`)); primary.append(article); return article;
  });
  const originals = [navigation, primary, sidebar, ...articles, ...articles.flatMap(article => article.children)];
  for (const node of originals) node.original = true;
  // Appending the extension's own top-level root is permitted; other writes to
  // the page's body/head are tracked explicitly below.
  const bodyClass = document.body.classList;
  for (const name of ['add', 'remove', 'toggle']) document.body.classList[name] = (...args) => { writes.push(`body: classList.${name}`); return bodyClass === document.body.classList ? undefined : bodyClass[name](...args); };
  const runtimeEvent = () => { const listeners = []; return { addListener(fn) { listeners.push(fn); }, emit(message) { for (const fn of listeners) fn(message); } }; };
  let connectFailure=connectError,sendFailure=null,runtimeFailure=null,connectAttempts=0,reloads=0;
  // Chrome does not notify the initiating end when disconnect() is called.
  // A BFCache round trip must therefore recover without that local callback.
  const makePort=()=>({ onMessage: runtimeEvent(), onDisconnect: runtimeEvent(), sent: [], closed:false, disconnectCalls:0,
    postMessage(message) { if(this.closed)throw new Error('Attempting to use a disconnected port object');if(sendFailure)throw sendFailure;this.sent.push(message);if(historyAck&&message.type==='HISTORY_VISIT')this.onMessage.emit({type:'HISTORY_ACK',batchId:message.batchId,ok:true,epoch:message.historyEpoch}); },
    disconnect() { this.closed=true;this.disconnectCalls++; }
  });
  let port=makePort();
  const runtimeMessages=[],nativeHooks={install:0,run:0,messageListeners:0};
  const window = events();
  const location = { hash: '', pathname: '/home', href: 'https://x.com/home',reload(){reloads++;} };
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    document, window, location, URL, URLSearchParams, AbortController, crypto, Date: ClockDate,
    innerWidth: 1440, innerHeight: 960,
    XGrokCore: { ...core, extractPost: article => {postExtractions++;return article.postData ? ({ ...article.postData }) : null;} }, GrokFirstOverlayLayout: layout,
    chrome: { runtime: { id: 'test-extension', connect: () => {connectAttempts++;if(connectFailure)throw connectFailure;return port;}, getURL: asset => `chrome-extension://test-extension/${asset}`,
      onMessage:{addListener(){nativeHooks.messageListeners++;}},
      async sendMessage(message){runtimeMessages.push(message);if(runtimeFailure)throw runtimeFailure;return {ok:true};}
    } },
    navigator:{language:'zh-CN',languages:['zh-CN'],clipboard:{async writeText(value){if(copyFailure)throw new Error('Clipboard unavailable');copied.push(value);}}},
    // Obsolete globals may survive on an existing page after an upgrade. They
    // are traps only: the API-only content script must never call either one.
    GrokFirstFeedNative:{install(){nativeHooks.install++;throw new Error('Native bridge must not install');}},
    XGrokNative:{run(){nativeHooks.run++;throw new Error('Native generation must not run');}},
    getComputedStyle: element => ({ position: 'static', display: 'block', overflow: 'visible', width: `${element.rect.width}px`,backgroundColor:'rgba(0, 0, 0, 0)',...element.computed }),
    setTimeout(fn, delay) { const id = ++nextTimer; timeouts.set(id, { fn, delay, at:now+delay }); return id; }, clearTimeout: id => timeouts.delete(id),
    setInterval(fn, delay) { intervals.push({ fn, delay }); return intervals.length; }, clearInterval() {},
    requestAnimationFrame(fn) { const id = ++nextTimer; frames.set(id, fn); return id; }, cancelAnimationFrame: id => frames.delete(id),
    IntersectionObserver: class { constructor(callback) { this.callback = callback; this.observed = new Set(); intersectionObservers.push(this); } observe(node) { this.observed.add(node); } unobserve(node) { this.observed.delete(node); } disconnect() { this.observed.clear(); } },
    MutationObserver: class { constructor(callback) { this.callback = callback;this.observations=[];mutationObservers.push(this); } observe(target,options) {this.observations.push({target,options});} disconnect() {this.observations=[];} },
    ResizeObserver: class { constructor(callback) { this.callback = callback; this.observed = new Set(); resizeObservers.push(this); } observe(node) { this.observed.add(node); } unobserve(node) { this.observed.delete(node); } disconnect() { this.observed.clear(); } }
  });
  window.visualViewport = { ...events(), width: 1440, height: 960, offsetLeft: 0, offsetTop: 0 };
  Object.defineProperty(document.documentElement, 'clientWidth', { get: () => context.innerWidth });
  Object.defineProperty(document.documentElement, 'clientHeight', { get: () => context.innerHeight });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/ui-i18n.js'), 'utf8'), context, { filename: 'ui-i18n.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/marked.umd.js'), 'utf8'), context, { filename: 'marked.umd.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/markdown-renderer.js'), 'utf8'), context, { filename: 'markdown-renderer.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8'), context, { filename: 'content.js' });
  const harness = {
    context, document, window, location, get port(){return port;}, nodes, writes, originals, articles, primary, sidebar, runtimeMessages,nativeHooks,copied,
    failClipboard(value=true){copyFailure=value;},
    failConnect(error){connectFailure=error;},
    failPortSend(error){sendFailure=error;},
    failRuntimeSend(error){runtimeFailure=error;},
    connectionAttempts(){return connectAttempts;},
    reloadCount(){return reloads;},
    replacePort(){const previous=port;port=makePort();return previous;},
    runTimeouts(maxDelay=3000){for(const [id,timer] of [...timeouts])if(timer.delay<=maxDelay){timeouts.delete(id);timer.fn();}harness.flush();},
    pendingTimeouts(){return [...timeouts.values()].map(timer=>timer.delay);},
    configure(overrides = {}) { port.onMessage.emit({ type: 'CONFIG', settings: { ...core.DEFAULT_SETTINGS, provider: 'api', dwellMs: 0, ...overrides }, ready: true, used: 0 }); harness.flush(); },
    flush() {
      for (let pass = 0; pass < 8; pass++) {
        const timers = [...timeouts].filter(([, timer]) => timer.delay<=160&&timer.at<=now); const pendingFrames = [...frames];
        if (!timers.length && !pendingFrames.length) break;
        for (const [id, timer] of timers) { timeouts.delete(id); timer.fn(); }
        for (const [id, fn] of pendingFrames) { frames.delete(id); fn(now); }
      }
    },
    mutationObservers,resizeObservers,
    extractionCount() {return postExtractions;},
    open(index=0) { harness.flush();const host=articles[index].querySelector('sidelens-trigger');assert.ok(host,'A trigger exists on the post');host.testShadow.querySelector('button').emit('click');harness.flush(); },
    mutate(records=[{type:'childList',target:primary}]) {
      for(const observer of mutationObservers) {
        const observed=records.filter(change=>observer.observations.some(({target,options})=>
          (target===change.target||(options.subtree&&target.contains(change.target)))&&
          (change.type==='attributes'?options.attributes&&(!options.attributeFilter||options.attributeFilter.includes(change.attributeName)):
            change.type==='characterData'?options.characterData:options.childList)));
        if(observed.length)observer.callback(observed);
      }
      harness.flush();
    },
    intersect() { for (const observer of intersectionObservers) observer.callback(articles.filter(article => article.isConnected).map(target => ({ target, isIntersecting: true }))); harness.flush(); },
    tick(ms = 0) { now += ms; for (const interval of intervals) if (interval.delay === 100) interval.fn(); harness.flush(); },
    elapse(ms) { now+=ms;for(const [id,timer] of [...timeouts])if(timer.at<=now){timeouts.delete(id);timer.fn();}harness.flush(); },
    scroll(delta) { for (const article of articles) { article.rect.top -= delta; article.rect.bottom -= delta; } window.emit('scroll'); document.emit('scroll'); harness.flush(); },
    resize(width) { context.innerWidth = width; window.visualViewport.width = width; window.emit('resize'); for (const observer of resizeObservers) observer.callback([]); harness.flush(); },
    cards() { return nodes.filter(node => node.tagName === 'GROK-FIRST-CARD' && node.isConnected); },
    displayedCards() { return harness.cards().filter(node => { let cursor = node; while (cursor) { if (cursor.hidden) return false; cursor = cursor.parentNode || cursor.host; } return true; }); },
    clearWrites() { writes.length = 0; }
  };
  return harness;
}


const analyzeMessages=page=>page.port.sent.filter(message=>message.type==='ANALYZE');
function complete(page,index=0,extra={}) {
  const request=analyzeMessages(page)[index];assert.ok(request);
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{text:'**Evidence checked.**',sources:[{url:'https://example.com/report',title:'Original report'}],provider:'api',searched:true,completedAt:1800000000000,usage:{total_tokens:42},usageComplete:true,...extra}});page.flush();return request;
}
test('load, scroll, visibility, resizing, hydration and timers never extract posts, record visits or analyze',()=>{
  const page=fixture({postCount:4});page.configure();page.intersect();page.tick(60000);page.scroll(200);page.resize(800);page.mutate();
  assert.equal(page.extractionCount(),0);
  assert.equal(page.port.sent.some(message=>['ANALYZE','GENERATE_COMMENTS','HISTORY_VISIT'].includes(message.type)),false);
  assert.equal(page.cards().length,0);
  assert.equal(page.document.getElementById('grokfirst-overlay').hidden,true);
  assert.equal(page.nodes.filter(node=>node.tagName==='SIDELENS-TRIGGER'&&node.isConnected).length,4);
});
test('click extracts only the chosen post and opens one fixed right-side drawer',()=>{
  const page=fixture({postCount:4});page.configure();page.open(1);
  assert.equal(page.extractionCount(),1);assert.equal(analyzeMessages(page).length,1);assert.equal(analyzeMessages(page)[0].post.id,'101');
  assert.equal(analyzeMessages(page)[0].force,false);assert.equal(page.displayedCards().length,1);
  assert.equal(page.cards()[0].style.left,'1000px');assert.equal(page.cards()[0].style.width,'440px');
  assert.equal(page.cards()[0].testShadow.querySelector('.post-context').textContent.includes('Original post 1'),true);
});
test('repeated clicks while queued or streaming cannot duplicate analysis',()=>{
  const page=fixture({postCount:1});page.configure();page.open();page.open();
  const request=analyzeMessages(page)[0];page.port.onMessage.emit({type:'START',requestId:request.requestId});page.open();
  assert.equal(analyzeMessages(page).length,1);
});
test('completed result, sources, token metadata and generation time survive closing and reopening',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);
  const card=page.cards()[0];page.nodes.find(node=>node.className==='rail-collapse').emit('click');page.flush();assert.equal(page.displayedCards().length,0);
  page.open();assert.equal(analyzeMessages(page).length,1);assert.equal(page.displayedCards().length,1);
  assert.match(card.testShadow.querySelector('.answer').textContent,/Evidence checked/);
  assert.match(card.testShadow.querySelector('.cache-meta').textContent,/生成于/);
  assert.equal(card.testShadow.querySelector('.sources').children[0].href,'https://example.com/report');
  assert.match(card.testShadow.querySelector('.token-usage').textContent,/42/);
});
test('force refresh explicitly bypasses cached analysis and clears stale sources and comments',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);
  const retry=page.cards()[0].testShadow.querySelector('.retry');assert.equal(retry.textContent,'重新分析');retry.emit('click');page.flush();
  assert.equal(analyzeMessages(page).length,2);assert.equal(analyzeMessages(page)[1].force,true);
  assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'');assert.equal(page.cards()[0].testShadow.querySelector('.sources').children.length,0);
});
test('cached worker results clearly identify reuse and original generation time',()=>{
  const page=fixture({postCount:1});page.configure();page.open();const request=analyzeMessages(page)[0];
  page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,cached:true,result:{text:'Cached finding',provider:'api',searched:true,completedAt:1800000000000,usage:{total_tokens:75},usageComplete:true}});page.flush();
  assert.match(page.cards()[0].testShadow.querySelector('.cache-meta').textContent,/缓存/);assert.equal(analyzeMessages(page).length,1);
});
test('selecting a second post changes the drawer without mixing sources or cancelling an accepted first request',()=>{
  const page=fixture({postCount:2});page.configure();page.open(0);const first=analyzeMessages(page)[0];page.port.onMessage.emit({type:'START',requestId:first.requestId});page.open(1);
  assert.equal(page.displayedCards().length,1);assert.equal(analyzeMessages(page).length,2);
  complete(page,0,{text:'First result'});complete(page,1,{text:'Second result'});
  assert.match(page.displayedCards()[0].testShadow.querySelector('.answer').textContent,/Second result/);
  page.open(0);assert.match(page.displayedCards()[0].testShadow.querySelector('.answer').textContent,/First result/);assert.equal(analyzeMessages(page).length,2);
});
test('scrolling the original article offscreen never hides or abandons the selected drawer',()=>{
  const page=fixture({postCount:1});page.configure();page.open();const request=analyzeMessages(page)[0];page.port.onMessage.emit({type:'START',requestId:request.requestId});page.scroll(2000);
  assert.equal(page.displayedCards().length,1);assert.equal(page.port.sent.some(message=>message.type==='CANCEL_IF_QUEUED'),false);
  complete(page);assert.match(page.displayedCards()[0].testShadow.querySelector('.answer').textContent,/Evidence checked/);
});
test('virtualization preserves the active result and does not send another request',()=>{
  const page=fixture({postCount:1});page.configure();page.open();const request=analyzeMessages(page)[0];page.port.onMessage.emit({type:'START',requestId:request.requestId});page.articles[0].remove();page.mutate();complete(page);
  assert.equal(page.displayedCards().length,1);assert.match(page.displayedCards()[0].testShadow.querySelector('.answer').textContent,/Evidence checked/);assert.equal(analyzeMessages(page).length,1);
});
test('a recycled X article extracts its current post only when clicked',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);
  page.articles[0].postData={...page.articles[0].postData,id:'999',url:'https://x.com/test/status/999',text:'Replacement post'};page.mutate();
  assert.equal(page.extractionCount(),1);page.open();assert.equal(analyzeMessages(page).length,2);assert.equal(analyzeMessages(page)[1].post.id,'999');
  assert.match(page.displayedCards()[0].testShadow.querySelector('.post-context').textContent,/Replacement post/);
});
test('small viewports retain an accessible drawer within the viewport',()=>{
  const page=fixture({postCount:1});page.resize(360);page.configure();page.open();
  assert.equal(analyzeMessages(page).length,1);const card=page.displayedCards()[0];assert.equal(card.style.left,'0px');assert.equal(card.style.width,'360px');
});
test('Escape closes the drawer, restores trigger focus and never creates work',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);page.document.emit('keydown',{key:'Escape'});page.flush();
  assert.equal(page.displayedCards().length,0);assert.equal(page.document.activeElement.tagName,'BUTTON');assert.equal(analyzeMessages(page).length,1);
});
test('missing credentials show actionable settings guidance only after a click',async()=>{
  const page=fixture({postCount:1});page.port.onMessage.emit({type:'CONFIG',settings:{...core.DEFAULT_SETTINGS,provider:'api'},ready:false});page.flush();page.open();
  assert.equal(analyzeMessages(page).length,0);assert.equal(page.displayedCards().length,1);
  const action=page.cards()[0].testShadow.querySelector('.status-settings');assert.ok(action);action.emit('click');await new Promise(resolve=>setImmediate(resolve));assert.equal(page.runtimeMessages.some(message=>message.type==='OPEN_SETTINGS'),true);
});
test('successful configuration never replays a previously unconfigured click without another explicit action',()=>{
  const page=fixture({postCount:1});page.port.onMessage.emit({type:'CONFIG',settings:{...core.DEFAULT_SETTINGS,provider:'api'},ready:false});page.flush();page.open();page.configure();assert.equal(analyzeMessages(page).length,0);
  page.cards()[0].testShadow.querySelector('.retry').emit('click');assert.equal(analyzeMessages(page).length,1);assert.equal(analyzeMessages(page)[0].force,false);
});
test('paused mode hides buttons, refuses clicks and re-enabling does not analyze',()=>{
  const page=fixture({postCount:1});page.configure({enabled:false});page.open();assert.equal(analyzeMessages(page).length,0);page.configure();assert.equal(analyzeMessages(page).length,0);
});
test('only explicitly opened posts are recorded in history',()=>{
  const page=fixture({postCount:4});page.configure();assert.equal(page.port.sent.some(message=>message.type==='HISTORY_VISIT'),false);page.open(2);
  const visit=page.port.sent.find(message=>message.type==='HISTORY_VISIT');assert.deepEqual(Array.from(visit.posts,post=>post.id),['102']);
});
test('streamed Markdown and hostile HTML remain safe inside the drawer',()=>{
  const page=fixture({postCount:1});page.configure();page.open();const request=analyzeMessages(page)[0];
  page.port.onMessage.emit({type:'START',requestId:request.requestId});page.port.onMessage.emit({type:'UPDATE',requestId:request.requestId,phase:'verify',text:'**Finding** <img src=x onerror=alert(1)> [bad](javascript:alert(1))'});page.flush();
  const answer=page.cards()[0].testShadow.querySelector('.answer');assert.ok(answer.querySelector('strong'));assert.equal(answer.querySelector('img'),null);assert.equal(answer.querySelector('script'),null);assert.equal(answer.querySelector('a'),null);assert.match(answer.textContent,/onerror/);
});
test('unsafe sources and duplicate citations never become active source links',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page,0,{sources:[{url:'javascript:alert(1)'},{url:'https://a:b@example.com/'},{url:'https://example.com/report',title:'Report'},{url:'https://example.com/report',title:'Duplicate'}]});
  const links=page.cards()[0].testShadow.querySelector('.sources').children;assert.equal(links.length,1);assert.equal(links[0].rel,'noopener noreferrer');
});
test('changing model or language clears stale results without automatically analyzing',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);page.configure({language:'ja'});assert.equal(analyzeMessages(page).length,1);assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'');page.open();assert.equal(analyzeMessages(page).length,2);
});
test('changing OAuth identity rejects late results from the previous account',()=>{
  const page=fixture({postCount:1});const configure=id=>{page.port.onMessage.emit({type:'CONFIG',settings:{...core.DEFAULT_SETTINGS,provider:'oauth'},ready:true,credentialIdentity:id,oauthStatus:{state:'connected',connected:true,modelAvailable:true}});page.flush();};configure('first');page.open();const request=analyzeMessages(page)[0];configure('second');page.port.onMessage.emit({type:'RESULT',requestId:request.requestId,result:{text:'Old private result'}});page.flush();
  assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'');assert.equal(analyzeMessages(page).length,1);
});
test('an interrupted stream preserves partial findings and offers an explicit retry',()=>{
  const page=fixture({postCount:1});page.configure();page.open();const request=analyzeMessages(page)[0];page.port.onMessage.emit({type:'ERROR',requestId:request.requestId,code:'API_STREAM_INTERRUPTED',partialResult:{text:'Partial finding',verificationStatus:'incomplete',verificationFailure:{stage:'verify',code:'CONNECTION'}}});page.flush();
  assert.match(page.cards()[0].testShadow.querySelector('.answer').textContent,/Partial finding/);assert.equal(page.cards()[0].testShadow.querySelector('.retry').hidden,false);assert.equal(analyzeMessages(page).length,1);
});
test('analysis results have no comment-generation control or request path',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);
  assert.equal(page.cards()[0].testShadow.querySelector('.generate-comments'),null);
  assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
});
test('idle worker sleep retains completed results and only an explicit retry wakes a generation',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);page.port.onDisconnect.emit();page.tick(60000);assert.equal(page.connectionAttempts(),1);assert.match(page.cards()[0].testShadow.querySelector('.answer').textContent,/Evidence checked/);
  page.replacePort();page.cards()[0].testShadow.querySelector('.retry').emit('click');assert.equal(page.connectionAttempts(),2);assert.equal(analyzeMessages(page).length,0);page.configure();assert.equal(analyzeMessages(page).length,1);assert.equal(analyzeMessages(page)[0].force,true);
});
test('scripted page clicks cannot start analysis, refresh or comment generation',()=>{
  const page=fixture({postCount:1});page.configure();page.flush();page.articles[0].querySelector('sidelens-trigger').testShadow.querySelector('button').emit('click',{isTrusted:false});assert.equal(analyzeMessages(page).length,0);
  page.open();complete(page);const ui=page.cards()[0].testShadow;ui.querySelector('.retry').emit('click',{isTrusted:false});assert.equal(analyzeMessages(page).length,1);assert.equal(page.port.sent.some(message=>message.type==='GENERATE_COMMENTS'),false);
});
test('an expired in-memory result is rechecked through the worker cache after the next click',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);page.tick(86400001);assert.equal(analyzeMessages(page).length,1);page.open();assert.equal(analyzeMessages(page).length,2);assert.equal(analyzeMessages(page)[1].force,false);
});
test('credential task revisions clear completed API findings without automatically generating again',()=>{
  const page=fixture({postCount:1});const config=revision=>{page.port.onMessage.emit({type:'CONFIG',settings:{...core.DEFAULT_SETTINGS,provider:'api'},ready:true,taskRevision:revision});page.flush();};config(0);page.open();complete(page);config(1);assert.equal(page.cards()[0].testShadow.querySelector('.answer').textContent,'');assert.equal(analyzeMessages(page).length,1);
});
test('clicking outside closes the drawer without consuming the page event or starting work',()=>{
  const page=fixture({postCount:1});page.configure();page.open();complete(page);let prevented=false;
  page.document.emit('pointerdown',{target:page.primary,composedPath:()=>[page.primary,page.document.body],preventDefault(){prevented=true;}});page.flush();
  assert.equal(page.displayedCards().length,0);assert.equal(prevented,false);assert.equal(analyzeMessages(page).length,1);
});
test('clicks inside the drawer or on another trigger preserve the active drawer',()=>{
  const page=fixture({postCount:2});page.configure();page.open();complete(page);
  const card=page.cards()[0],overlay=page.document.getElementById('grokfirst-overlay');
  page.document.emit('pointerdown',{target:card,composedPath:()=>[card,overlay,page.document.body]});page.flush();assert.equal(page.displayedCards().length,1);
  const trigger=page.articles[1].querySelector('sidelens-trigger');page.document.emit('pointerdown',{target:trigger,composedPath:()=>[trigger,page.articles[1],page.document.body]});page.flush();assert.equal(page.displayedCards().length,1);page.open(1);assert.equal(analyzeMessages(page).length,2);
});
test('22px triggers align to native actions and end above the first line of post text',()=>{
  const page=fixture({postCount:1}),article=page.articles[0],action=page.document.createElement('button'),body=page.document.createElement('div');
  action.setAttribute('aria-label','Grok actions');action.original=true;action.rect={left:810,right:840,top:96,bottom:126,width:30,height:30};
  body.setAttribute('data-testid','tweetText');body.original=true;body.rect={left:330,right:850,top:125,bottom:180,width:520,height:55};article.append(action,body);page.configure();
  const host=article.querySelector('sidelens-trigger');assert.equal(host.style.left,'512px');assert.ok(Number.parseFloat(host.style.top)+22<=body.rect.top-article.rect.top-2);assert.equal(page.extractionCount(),0);
});
