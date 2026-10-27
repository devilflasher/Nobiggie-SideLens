(function () {
  'use strict';
  if (globalThis.__grokFirstLoaded) return;
  globalThis.__grokFirstLoaded = true;
  const workerNonce = new URLSearchParams(location.hash.slice(1)).get('xgrok-worker');
  // Old releases left marked worker pages behind. They must never start a new
  // request after upgrading to the API-only release.
  if (workerNonce) return;

  const Core = XGrokCore, UI = GrokFirstUI;
  let xUILanguage = UI.normalizeLanguage(document.documentElement.getAttribute('lang') || navigator.language || 'en');
  let uiLanguage = UI.resolveLanguage('auto',xUILanguage);
  const t = (key, vars) => UI.t(key, uiLanguage, vars);
  let settings = Core.DEFAULT_SETTINGS, providerReady = false, connected = false, port, used = 0, collapsed = true;
  let lastPath = location.pathname, scanTimer, reconnectTimer, handshakeTimer, needsPageRefresh = false;
  let hasConfig=false,workerSleeping=false,awaitingConfig=false,reconnectFailures=0,xModalBlocked=false,pageSuspended=false;
  let oauthState={},credentialIdentity='',taskRevision;
  let draftComposer, activeEntry = null, lastTrigger = null, lastSentAppearance;
  const followups=globalThis.SideLensFollowup?.create({send:message=>post(message),canSend:()=>usableConnection()&&settings.enabled,render:(target,text)=>GrokFirstMarkdown.render(target,text),language:()=>uiLanguage,wake:(entry,action)=>afterWake(entry,'followup',action),cancelWake:entry=>wakeActions.delete(wakeKey(entry,'followup'))});
  const triggers = new Map();
  const wakeActions=new Map(),wakeControls=new Map();
  const entries = new Map(), detachedEntries = new Set(), requests = new Map();
  // X virtualizes the timeline. Keep live subscriptions and a bounded set of
  // recent cards when their native article is temporarily removed or recycled.
  const allEntries=()=>[...entries.values(),...detachedEntries];
  const historySeen = new Set(),historyPending=new Map();
  let historyEnabled = true, historyEpoch = 0, historyLoaded = false,historyRetryAt=0;
  // Results stay in an isolated drawer; native posts receive only a trigger.
  const overlay = document.createElement('grok-first-overlay');
  overlay.id = 'grokfirst-overlay';
  overlay.dataset.version=chrome.runtime.getManifest?.()?.version||'development';
  const overlayShadow = overlay.attachShadow({mode:'open'});
  const overlayStyle = document.createElement('style');
  const symbolURL=chrome.runtime.getURL('assets/superx-symbol.svg');
  overlayStyle.textContent = `
    :host{all:initial;position:fixed;inset:0;display:block;overflow:hidden;pointer-events:none;z-index:2;contain:layout style paint;isolation:isolate;}
    :host([hidden]){display:none!important;}
    .rail{position:absolute;box-sizing:border-box;pointer-events:auto;background:var(--gf-bg,#000);}
    /* Keep this edge above the opaque header and rows. The rail itself must not
       create a stacking context, so the line remains continuous at the corner. */
    .rail::after{content:'';position:absolute;top:0;bottom:0;right:0;width:0;border-right:1px solid var(--gf-border,#2f3336);z-index:3;pointer-events:none;}
    .rail-head{position:absolute;z-index:2;display:flex;align-items:center;gap:6px;min-width:0;box-sizing:border-box;padding:0 12px;overflow:hidden;background:var(--gf-bg,#000);color:var(--gf-fg,#e7e9ea);border-bottom:1px solid var(--gf-border,#2f3336);font:700 17px/20px var(--gf-font,system-ui);pointer-events:auto;}
    .rail-head strong{display:flex;align-items:center;gap:7px;flex:1;min-width:0;overflow:hidden;white-space:nowrap;}.rail-brand-name{min-width:0;overflow:hidden;text-overflow:ellipsis;}.brand-symbol{display:block;flex:none;width:20px;height:20px;background-color:currentColor;-webkit-mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask-mode:alpha;}.rail-head button,.rail-expand{display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:32px;font:400 13px/20px var(--gf-font,system-ui);padding:0 8px;border:0;background:transparent;color:var(--gf-accent,#1d9bf0);cursor:pointer;flex-shrink:0;}.rail-head button:hover,.rail-language:hover,.rail-expand:hover{background:rgba(127,127,127,.12);}.rail-head button:focus-visible,.rail-language:focus-visible,.rail-expand:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:-2px;}
    .rail-language-control{position:relative;width:104px;max-width:35%;min-width:0;flex-shrink:1;height:32px;}.rail-language{appearance:none;box-sizing:border-box;width:100%;height:32px;font:400 13px/20px var(--gf-font,system-ui);color:var(--gf-fg,#e7e9ea);color-scheme:var(--gf-scheme,dark);background:transparent;border:0;min-width:0;padding:0 26px 0 8px;text-align:right;text-align-last:right;cursor:pointer;}.rail-language option{text-align:start;text-align-last:auto;background:var(--gf-bg,#000);color:var(--gf-fg,#e7e9ea);}.language-chevron{position:absolute;top:50%;right:8px;transform:translateY(-50%);width:12px;height:12px;color:var(--gf-muted,#71767b);pointer-events:none;}.rail-head[data-compact=true] strong{display:none;}.rail-head[data-compact=true] .rail-language-control{flex:1;max-width:none;}
    .rail-head .rail-collapse,.rail-expand{width:32px;padding:0;}.rail-collapse svg,.rail-expand svg{width:18px;height:18px;display:block;}.rail-expand{position:absolute;z-index:2;box-sizing:border-box;border:1px solid var(--gf-border,#2f3336);background:var(--gf-bg,#000);pointer-events:auto;}
    .rail-expand-mark{display:flex;align-items:center;justify-content:center;width:20px;height:20px;color:var(--gf-fg,#e7e9ea);}
    .rail-head .rail-settings,.rail-head .rail-history{width:32px;padding:0;}.rail-settings svg,.rail-history svg{width:18px;height:18px;display:block;}
    .rail[hidden],.rail-head[hidden],.rail-expand[hidden]{display:none!important;}
    .rail-separators{position:absolute;z-index:2;overflow:hidden;pointer-events:none;}
    .rail-separators[hidden]{display:none!important;}
    .rail-separator{position:absolute;left:0;right:0;pointer-events:none;background:var(--gf-border,#2f3336);}
    grok-first-card{position:absolute;z-index:1;display:block;box-sizing:border-box;pointer-events:auto;overflow:hidden;}
    grok-first-card[hidden]{display:none!important;}
  `;
  overlayStyle.textContent += `
    :host{z-index:1000;--gf-bg:#f2eedf;--gf-fg:#181811;--gf-muted:#6a655a;--gf-border:#27251e;--gf-accent:#cf1f2b;--gf-font:'Noto Sans SC','Microsoft YaHei',sans-serif;--gf-size:14px;--gf-leading:1.85;--gf-scheme:light;}
    .rail{border-left:3px solid var(--gf-fg,#181811);box-shadow:-8px 0 0 var(--gf-fg,#181811);background:var(--gf-bg,#f2eedf);}
    .rail-head{padding:0 18px;gap:8px;background:var(--sl-surface,#f8f5e9);border-bottom:3px solid var(--gf-fg,#181811);font-size:22px;}
    .rail-head strong{font-family:Arial,sans-serif;color:var(--gf-fg,#181811);letter-spacing:-.8px;}.brand-symbol{width:24px;height:24px;}
    .rail-language-control{width:90px;}.rail-language{font-size:12px;color:var(--gf-accent,#cf1f2b);}
    .rail-head button{color:var(--gf-fg,#181811);border:2px solid var(--gf-fg,#181811);height:30px;width:30px;}
    .rail-head button:hover{background:var(--sl-soft,#e6dfcc);}.rail-expand,.rail-separators{display:none!important;}
    .drawer-footer{position:absolute;box-sizing:border-box;height:40px;display:flex;align-items:center;padding:0 20px;border-top:1px solid var(--gf-border,#27251e);background:var(--sl-surface,#f8f5e9);color:var(--gf-muted,#6a655a);font:10px/1.4 monospace;letter-spacing:1.2px;pointer-events:auto;}
    .drawer-footer{height:56px;justify-content:space-between;gap:8px;padding:0 12px;letter-spacing:.5px;}
    .footer-brand{font-size:9px;min-width:0;white-space:nowrap;}
    .community-link{display:flex;align-items:center;gap:7px;flex-shrink:0;min-height:36px;padding:2px 8px 2px 3px;border:1px solid var(--gf-border);background:var(--sl-surface);color:var(--gf-fg);font:600 12px/1.4 var(--gf-font);text-decoration:none;box-shadow:2px 2px 0 var(--sl-ink);}
    .community-link:hover,.community-link:focus-visible{outline:2px solid #2ddbaa;outline-offset:2px;}
    .community-logo{display:block;width:30px;height:30px;object-fit:contain;background:#000;animation:community-wave 5s ease-in-out infinite;}
    .community-arrow{color:var(--gf-accent);font-size:16px;}
    @keyframes community-wave{0%,70%,100%{transform:rotate(0)}78%{transform:rotate(-8deg)}86%{transform:rotate(7deg)}94%{transform:rotate(-3deg)}}
    @media(prefers-reduced-motion:reduce){.community-logo{animation:none;}}
  `;
  overlayShadow.append(overlayStyle);
  const rail=node('aside','rail');
  const railHeader=node('header','rail-head'),railBrand=node('strong','rail-brand'),brandMark=node('span','brand-symbol');
  brandMark.setAttribute('aria-hidden','true');railBrand.append(brandMark,node('span','rail-brand-name','SideLens'));railHeader.append(railBrand);
  const railLanguage=node('select','rail-language');
  for(const item of Core.LANGUAGES){const option=node('option','',item.value==='auto'?t('lang.auto').split(' · ')[0]:item.label);option.value=item.value;railLanguage.append(option);}
  railLanguage.value=settings.language;railLanguage.addEventListener('change',()=>{railLanguage.disabled=true;postControl({type:'SET_LANGUAGE',language:railLanguage.value});});
  const railOptions=node('button','rail-settings');railOptions.append(gear());railOptions.addEventListener('click',()=>openSettings());
  const railHistory=node('button','rail-history');railHistory.type='button';
  const historyIcon=document.createElementNS('http://www.w3.org/2000/svg','svg');historyIcon.setAttribute('viewBox','0 0 24 24');historyIcon.setAttribute('fill','none');historyIcon.setAttribute('stroke','currentColor');historyIcon.setAttribute('stroke-width','1.7');historyIcon.setAttribute('aria-hidden','true');
  const historyPath=document.createElementNS('http://www.w3.org/2000/svg','path');historyPath.setAttribute('d','M3 11a9 9 0 1 1 2.6 7.3M3 4v7h7M12 7v5l3 2');historyPath.setAttribute('stroke-linecap','round');historyPath.setAttribute('stroke-linejoin','round');historyIcon.append(historyPath);railHistory.append(historyIcon);railHistory.addEventListener('click',()=>openHistory());
  const railLanguageControl=node('div','rail-language-control'),languageChevron=chevron('down');languageChevron.classList.add('language-chevron');railLanguageControl.append(railLanguage,languageChevron);
  const railCollapse=node('button','rail-collapse');railCollapse.append(chevron('right'));railCollapse.setAttribute('aria-label','收起 SideLens');railCollapse.setAttribute('aria-expanded','true');railCollapse.title='收起右栏，停止新的分析，保留正在生成的结果';railCollapse.addEventListener('click',()=>setCollapsed(true,true));
  const railExpand=node('button','rail-expand'),expandMark=node('span','rail-expand-mark');
  expandMark.setAttribute('aria-hidden','true');expandMark.append(node('span','brand-symbol'));railExpand.append(expandMark);railExpand.setAttribute('aria-label','展开 SideLens');railExpand.setAttribute('aria-expanded','false');railExpand.title='展开 SideLens';railExpand.hidden=true;railExpand.addEventListener('click',()=>setCollapsed(false,true));
  const railSeparators=node('div','rail-separators');railSeparators.setAttribute('aria-hidden','true');
  railHeader.append(railLanguageControl,railHistory,railOptions,railCollapse);overlayShadow.append(rail,railHeader,railExpand,railSeparators);
  const drawerFooter=node('footer','drawer-footer');drawerFooter.append(node('span','footer-brand','NOBIGGIE / SIDELENS'));
  const community=node('a','community-link');community.href='https://nobiggie.xyz/chat';community.target='_blank';community.rel='noopener noreferrer';
  const communityLogo=node('img','community-logo');communityLogo.src=chrome.runtime.getURL('assets/nb-logo.png');communityLogo.alt='NoBiggie';
  const communityLabel=node('span','','加入社区群聊');community.append(communityLogo,communityLabel,node('span','community-arrow','↗'));drawerFooter.append(community);
  overlayShadow.append(drawerFooter);
  syncAppearance();
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-label','SideLens');
  refreshHeaderLanguage();
  document.body.append(overlay);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!collapsed){setCollapsed(true,true);lastTrigger?.focus();}},true);
  document.addEventListener('pointerdown',event=>{
    if(collapsed||overlay.hidden)return;
    const path=event.composedPath?.()||[];
    if(path.includes(overlay)||path.some(node=>node.tagName==='SIDELENS-TRIGGER')||event.target?.closest?.('sidelens-trigger'))return;
    setCollapsed(true,true);
  },true);
  let layoutFrame = null;
  const mutations = new MutationObserver(changes=>{
    changes=changes.filter(change=>change.target!==overlay&&!overlay.contains(change.target)&&!change.target?.closest?.('sidelens-trigger, superx-draft-action, superx-draft-panel, [data-testid="GrokDrawer"], [data-testid="grokDrawer"]'));
    if(!changes.length)return;
    if(changes.some(change=>change.target===document.body||change.target===document.documentElement))syncAppearance();
    syncXModalVisibility();
    scheduleLayout();
    if(changes.some(change=>change.type!=='attributes'||
        !['class','style','hidden','aria-hidden'].includes(change.attributeName)||affectsDisplayedPostBody(change.target)))scheduleScan();
  });
  mutations.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','src','alt','lang','datetime','data-testid','class','style','hidden','aria-hidden','role','aria-modal','open','inert']});
  const themeObserver=new MutationObserver(changes=>{
    syncAppearance();syncUILanguage();draftComposer?.refresh();scheduleLayout();
    if(changes.some(change=>change.target===document.documentElement&&['class','style','hidden','aria-hidden'].includes(change.attributeName)))scheduleScan();
  });
  themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:['class','style','lang','hidden','aria-hidden']});
  if(document.head)themeObserver.observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','media','disabled']});
  window.addEventListener('scroll',onFeedScroll,{passive:true,capture:true});
  window.addEventListener('resize',()=>{scheduleLayout();},{passive:true});
  window.visualViewport?.addEventListener('resize',scheduleLayout,{passive:true});
  window.visualViewport?.addEventListener('scroll',onFeedScroll,{passive:true});
  for(const event of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(event,()=>{syncXModalVisibility();scheduleLayout();tick();});
  draftComposer=globalThis.SuperXDraftComposer?.create({
    core:Core,t,render:(target,text)=>GrokFirstMarkdown.render(target,text),send:message=>post(message),
    wake:()=>{if(!connected)connect();configureDraft();},onLayout:scheduleLayout,openSettings,errorKey,symbolURL
  });
  connect();
  scheduleScan();

  // A message, rather than an idle open port, keeps the MV3 worker alive during generation.
  setInterval(()=>{if((requests.size||draftComposer?.activeCount) && connected)post({type:'PING'});},15000);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {
      wakeActions.clear();
      // Switching tabs only pauses new work. Keep the port and subscriptions
      // so accepted answers, comments and their retries can finish in place.
      pauseUnseenRailQueue({preserveStarted:true});
    }
    else {if(!connected&&!needsPageRefresh)connect();scheduleScan();tick();}
    scheduleLayout();
  });
  window.addEventListener('pagehide',()=>{
    pageSuspended=true;
    post({type:'CANCEL_ALL'});
    // disconnect() does not fire onDisconnect on this end. Detach locally
    // before BFCache freezes the document and reject any late messages.
    connectionLost();
    clearTimeout(reconnectTimer);reconnectTimer=undefined;
  });
  window.addEventListener('pageshow',event=>{
    if(!event.persisted&&!pageSuspended)return;
    pageSuspended=false;
    if(!document.hidden&&!needsPageRefresh)connect();
    scheduleScan();scheduleLayout();tick();
  });

  function invalidContext(error) {
    try {return needsPageRefresh || !chrome.runtime.id || /extension context invalidated/i.test(String(error?.message || ''));}
    catch {return true;}
  }
  function scheduleReconnect() {
    if(pageSuspended || needsPageRefresh || reconnectTimer)return;
    const delay=Math.min(30000,3000*2**Math.min(reconnectFailures++,4));
    reconnectTimer=setTimeout(()=>{reconnectTimer=undefined;if(!document.hidden)connect();},delay);
  }
  function syncAppearance(){
    const theme=globalThis.SideLensAppearance?.sync(overlay);
    if(theme)for(const host of triggers.values())globalThis.SideLensAppearance.apply(host,theme);
    if(theme&&connected&&theme!==lastSentAppearance&&post({type:'SET_APPEARANCE',theme}))lastSentAppearance=theme;
  }
  function connectionLost(error,sourcePort=port) {
    if(sourcePort && sourcePort!==port)return;
    needsPageRefresh=invalidContext(error);
    // Chrome may suspend an idle MV3 worker. A closed idle port is not an API
    // failure and must not overwrite completed reading or restart paid work.
    const idle=hasConfig&&!awaitingConfig&&!needsPageRefresh&&!error&&!requests.size&&!followups?.activeCount&&!draftComposer?.activeCount&&!wakeActions.size&&!wakeControls.size;
    connected=false;awaitingConfig=false;workerSleeping=idle;lastSentAppearance=undefined;
    resetPendingState();
    clearTimeout(handshakeTimer);handshakeTimer=undefined;
    if(!idle)providerReady=false;
    const interruptionKey=needsPageRefresh?'status.refreshRequired':pageSuspended?'status.cancelled':'status.connectionLost';
    draftComposer?.connectionLost(interruptionKey);followups?.disconnect();
    const previousPort=port;port=undefined;
    try {previousPort?.disconnect();}catch{/* The old context may already be gone. */}
    railLanguage.disabled=!idle;
    for(const entry of allEntries()) {
      clearRetries(entry);
      const interrupted=['queued','running','retry-wait'].includes(entry.status)||wakeActions.has(wakeKey(entry,'analysis'));
      if(interrupted){entry.status='error';entry.ui.retry.hidden=false;status(entry,interruptionKey);}
      if(['queued','running','retry-wait'].includes(entry.commentStatus)||wakeActions.has(wakeKey(entry,'comments'))){entry.commentStatus='error';entry.commentError=interruptionKey;}
      if(needsPageRefresh){
        if(entry.status==='done'&&!entry.connectionStatus)entry.connectionStatus={key:entry.statusKey,vars:entry.statusVars};
        status(entry,'status.refreshRequired');
      }
      refreshCard(entry);refreshComments(entry);
    }
    wakeActions.clear();wakeControls.clear();
    requests.clear();refreshHeaderLanguage();configureDraft();scheduleLayout();
    if(needsPageRefresh){clearTimeout(reconnectTimer);reconnectTimer=undefined;}
    else if(!idle)scheduleReconnect();
  }
  function post(message) {
    if(pageSuspended&&message.type!=='CANCEL_ALL')return false;
    if(!connected){if(invalidContext())connectionLost();else if(!workerSleeping)scheduleReconnect();return false;}
    try {port.postMessage(message);return true;}catch(error){connectionLost(error);return false;}
  }
  function postControl(message) {
    if(pageSuspended||needsPageRefresh)return false;
    if(workerSleeping||awaitingConfig){
      // These are user preferences, not API tasks. Retain the latest value
      // while waking; dispatch it before new analysis uses the old preference.
      wakeControls.set(message.type,message);
      if(!connected)connect();
      return true;
    }
    return post(message);
  }
  function wakeKey(entry,task){return entry.post.id+':'+task;}
  function afterWake(entry,task,action) {
    if(!workerSleeping&&!awaitingConfig)return false;
    if(!providerReady||needsPageRefresh)return false;
    const key=wakeKey(entry,task),identity=Core.apiPostIdentity(entry.post,task==='comments'?undefined:settings),path=location.pathname;
    if(!wakeActions.has(key))wakeActions.set(key,()=>{
      if(entries.get(entry.article)!==entry&&!detachedEntries.has(entry)||path!==location.pathname||
          Core.apiPostIdentity(entry.post,task==='comments'?undefined:settings)!==identity||
          document.hidden||collapsed)return;
      action();
    });
    refreshCard(entry);
    if(!connected)connect();
    return true;
  }
  function usableConnection(){return !pageSuspended&&!needsPageRefresh&&providerReady&&(connected||workerSleeping||awaitingConfig);}
  function configureDraft(){
    draftComposer?.configure({settings,ready:providerReady,connected,hasConfig,awaitingConfig,refreshRequired:needsPageRefresh,
      taskRevision,restoring:settings.provider==='oauth'&&oauthState.state==='restoring',
      needsProvider:needsProvider(),identity:JSON.stringify([settings.provider,credentialIdentity,Core.providerModel(settings),Core.providerEffort(settings),settings.buildTransport,settings.buildPort,settings.webSearch,settings.xSearch,settings.explanationMode])});
  }
  let buildErrorCode='';
  function needsProvider(){
    if(settings.provider==='oauth'){
      if(oauthState.connected&&oauthState.modelAvailable===false)return 'oauth.modelUnavailable';
      if(oauthState.state==='restoring'||oauthState.state==='refreshing')return 'oauth.refreshing';
      if(['starting','authorizing','awaiting_authorization'].includes(oauthState.state))return 'oauth.authorizing';
      if(oauthState.state==='reauth_required')return 'oauth.reauthRequired';
      return oauthState.errorCode?errorKey(oauthState.errorCode):'oauth.needsLogin';
    }
    return settings.provider==='build'?(buildErrorCode.startsWith('BUILD_')?errorKey(buildErrorCode):'build.unknown'):'status.needsKey';
  }
  async function openSettings() {
    const message={type:'OPEN_SETTINGS',focus:settings.provider==='oauth'?'oauth':settings.provider==='build'?'build':'api-key'};
    // Settings can add or replace a Key. Restore the feed subscription so its
    // updated CONFIG can reach a tab that previously had no usable credential.
    if(workerSleeping)connect();
    try {
      const result=await chrome.runtime.sendMessage(message);
      if(result?.ok)return;
    }catch(error){if(invalidContext(error)){connectionLost(error);return;}}
    // Older workers only accept this action over their feed port.
    if(!post(message))connectionLost();
  }
  async function openHistory() {
    try { const result=await chrome.runtime.sendMessage({type:'OPEN_HISTORY'});if(result?.ok)return; }
    catch(error){if(invalidContext(error)){connectionLost(error);return;}}
    if(workerSleeping)connect();
    postControl({type:'OPEN_HISTORY'});
  }
  function refreshHeaderLanguage() {
    communityLabel.textContent=uiLanguage.startsWith('zh')?'加入社区群聊':'Join community chat';
    const direction=uiLanguage==='ar'?'rtl':'ltr';
    rail.setAttribute('lang',uiLanguage);rail.setAttribute('dir',direction);
    railHeader.setAttribute('lang',uiLanguage);railHeader.setAttribute('dir',direction);
    rail.setAttribute('aria-label',t('aria.rail'));railLanguage.setAttribute('aria-label',t('aria.outputLanguage'));
    const auto=Array.from(railLanguage.children).find(option=>option.value==='auto');if(auto)auto.textContent=t('lang.auto').split(' · ')[0];railLanguage.title=t(settings.language==='auto'?'lang.auto':'aria.outputLanguage');
    railOptions.setAttribute('aria-label',t('common.settings'));railOptions.title=t(needsPageRefresh?'status.refreshRequired':!providerReady?(settings.provider==='oauth'?'oauth.login':settings.provider==='build'?'popup.setupBuild':'common.enterKey'):'common.settings');
    railHistory.setAttribute('aria-label',t('common.history'));railHistory.title=t('common.history');
    railCollapse.setAttribute('aria-label',t('common.collapse'));railCollapse.title=t('tooltip.collapse');
    railExpand.setAttribute('aria-label',t('common.expand'));railExpand.title=t('tooltip.expand');
    railHeader.title=settings.provider==='oauth'?t('oauth.modeLabel',{count:settings.apiConcurrency}):settings.provider==='build'?t('popup.buildLabel',{transport:settings.buildTransport.toUpperCase()}):t('tooltip.apiMode',{count:settings.apiConcurrency});
  }
  function syncUILanguage() {
    const observed=UI.normalizeLanguage(document.documentElement.getAttribute('lang') || navigator.language || 'en');
    if(observed!==xUILanguage){xUILanguage=observed;post({type:'UI_LANGUAGE',language:xUILanguage});}
    const language=UI.resolveLanguage(settings.interfaceLanguage,xUILanguage);
    if(language===uiLanguage)return;
    uiLanguage=language;refreshHeaderLanguage();draftComposer?.refresh();
    for(const entry of allEntries()){refreshCard(entry);refreshComments(entry);}
  }
  function renderStatusText(entry,key,vars={}) {
    const target=entry.ui.status;
    if(key.startsWith('oauth.')){
      const button=node('button','status-settings',t('common.settings'));button.type='button';button.addEventListener('click',()=>openSettings());
      target.replaceChildren(document.createTextNode(t(key,{model:settings.oauthModel,...vars})+' '),button);return;
    }
    if(key==='status.refreshRequired') {
      const marker='\uFFFC',parts=t('status.refreshRequiredAction',{refresh:marker}).split(marker),button=node('button','status-settings',t('common.refreshPage'));
      button.type='button';button.addEventListener('click',()=>location.reload());
      target.replaceChildren(document.createTextNode(parts[0]),button,document.createTextNode(parts.slice(1).join(marker)));return;
    }
    if(key.startsWith('build.')){
      const button=node('button','status-settings',t('popup.setupBuild'));button.type='button';button.addEventListener('click',()=>openSettings());
      target.replaceChildren(document.createTextNode(t(key,vars)+' '),button);return;
    }
    if(key!=='status.needsKey'){target.replaceChildren(document.createTextNode(t(key,vars)));return;}
    // Keep the translated sentence intact while making its Settings word an
    // actual keyboard-accessible control. The marker never becomes page text.
    const marker='\uFFFC',template=t('status.needsKeyAction',{settings:marker});
    const parts=template.split(marker),button=node('button','status-settings',t('common.settings'));
    button.type='button';button.title=t('common.enterKey');
    button.addEventListener('click',()=>openSettings());
    target.replaceChildren(document.createTextNode(parts[0]),button,document.createTextNode(parts.slice(1).join(marker)));
  }
  function status(entry,key,vars={}) {entry.statusKey=key;entry.statusVars=vars;renderStatusText(entry,key,vars);syncLoading(entry);refreshVerificationFailure(entry);}
  function note(entry,key) {entry.noteKey=key;entry.ui.note.textContent=key?t(key):'';}
  const verificationFailureKeys={OUTPUT_LIMIT:'verification.outputLimit',INCOMPLETE:'verification.incomplete',CONNECTION:'verification.connection',TIMEOUT:'verification.timeout',LANGUAGE_MISMATCH:'verification.languageMismatch',RATE_LIMIT:'verification.rateLimit',ACCESS:'verification.access',SERVER:'verification.server',UNKNOWN:'verification.unknown'};
  function partialResultNote(result) {
    // Older cached responses may have retained an explanation after their
    // second stage failed. A current fact check is one response, with no
    // previous-answer narrative to show beneath its partial output.
    return result?.apiVerification==='only'?'':'note.preserved';
  }
  function readerResult(value) {
    const result=value&&typeof value==='object'?value:{};
    const output=Core.readerOutput(result.text,{final:true});
    const invalid=output.kind!=='content';
    return {invalid,result:invalid?{...result,text:'',sources:[],verificationStart:undefined,
      verificationStatus:'incomplete',verificationFailure:isCapacityFailure(undefined,result.verificationFailure)?result.verificationFailure:{stage:'verify',code:'INCOMPLETE'}}:{...result,text:output.text}};
  }
  function setVerificationFailure(entry,value,incomplete) {
    const valid=value?.stage==='verify'&&typeof value.code==='string'&&Object.hasOwn(verificationFailureKeys,value.code),code=valid?value.code:'UNKNOWN';
    const failure={stage:'verify',code};
    if(valid) {
      if(['max_output_tokens','content_filter'].includes(value.reason))failure.reason=value.reason;
      if(['API_INCOMPLETE','API_STREAM_INTERRUPTED','API_STREAM_ERROR','API_LANGUAGE_MISMATCH','API_CAPACITY','RATE_LIMIT','API_ERROR','CANCELED','TIMEOUT'].includes(value.errorCode))failure.errorCode=value.errorCode;
      if(Number.isSafeInteger(value.httpStatus)&&value.httpStatus>=100&&value.httpStatus<=599)failure.httpStatus=value.httpStatus;
      const providerCode=Core.apiFailureProviderCode(value.providerCode);
      if(providerCode)failure.providerCode=providerCode;
    }
    entry.verificationFailure=incomplete?failure:null;
    refreshVerificationFailure(entry);
  }
  function refreshVerificationFailure(entry) {
    const failure=entry.verificationFailure;
    const failureKey=isCapacityFailure(undefined,failure)?'error.apiCapacity':verificationFailureKeys[failure?.code];
    entry.ui.status.title=failure?t(failureKey):'';
    const requestDiagnostics=Core.sanitizedRequestDiagnostics(entry.requestDiagnostics),commentRequestDiagnostics=Core.sanitizedRequestDiagnostics(entry.commentRequestDiagnostics);
    if(failure||requestDiagnostics||commentRequestDiagnostics) {
      // Structured provider traces pass the same bounded sanitizer used by
      // the worker. No request body, credentials or arbitrary fields enter UI.
      const diagnostic={...failure,...(requestDiagnostics?{requestDiagnostics}:{}),...(commentRequestDiagnostics?{commentRequestDiagnostics}:{})};
      entry.ui.diagnosticText.textContent=(failure?t(failureKey)+'\n':'')+JSON.stringify(diagnostic,null,2);
      entry.ui.diagnostics.hidden=false;entry.verificationDiagnostics=true;
    } else if(entry.verificationDiagnostics) {
      entry.ui.diagnosticText.textContent='';entry.ui.diagnostics.hidden=true;entry.verificationDiagnostics=false;
    }
  }
  function syncLoading(entry) {
    const active=['queued','running'].includes(entry.status);
    const verifying=active&&['verification_queued','verify','verification'].includes(entry.phase);
    const loading=active&&!entry.latestText&&!verifying;
    entry.ui.status.classList.toggle('shimmer',loading||verifying);
    entry.ui.thinking.hidden=!loading;entry.ui.thinkingLabel.textContent=t('status.thinking');
    entry.ui.verificationThinking.hidden=!verifying||Boolean(entry.verificationStarted);
    entry.ui.verificationThinkingLabel.textContent=t('status.thinking');
    entry.ui.analysisDivider.hidden=!entry.answerSplit||!(verifying||entry.verificationRendered?.trim());
    entry.ui.box.setAttribute('aria-busy',String(active||entry.status==='retry-wait'));
  }
  function errorKey(code,failure) {
    if(code==='MODEL_UNSUPPORTED')return 'error.modelUnsupported';
    if(code==='MEDIA_INPUT_LIMIT')return 'error.mediaLimit';
    if(code==='BUILD_IMAGE_UNSUPPORTED')return 'build.imageUnsupported';
    if(code==='BUILD_IMAGE_UNAVAILABLE')return 'build.imageUnavailable';
    if(code==='BUILD_IMAGE_LIMIT')return 'build.imageLimit';
    if(typeof code==='string'&&code.startsWith('OAUTH_'))return ({
      OAUTH_LOGIN_REQUIRED:'oauth.needsLogin',OAUTH_REAUTH_REQUIRED:'oauth.reauthRequired',OAUTH_ACCOUNT_CHANGED:'oauth.reauthRequired',OAUTH_REFRESH_UNCERTAIN:'oauth.reauthRequired',
      OAUTH_ACCESS_DENIED:'oauth.denied',OAUTH_DEVICE_EXPIRED:'oauth.expired',OAUTH_CANCELLED:'oauth.canceled',
      OAUTH_MODEL_UNAVAILABLE:'oauth.modelUnavailable',OAUTH_STORAGE_ERROR:'oauth.storageError',OAUTH_CATALOG_UNAVAILABLE:'oauth.catalogUnavailable',OAUTH_AUTH_UNAVAILABLE:'oauth.networkError'
    })[code]||'oauth.unavailable';
    if(isCapacityFailure(code,failure))return 'error.apiCapacity';
    if(code?.startsWith('BUILD_'))return ({BUILD_LOGIN_REQUIRED:'build.login',BUILD_CANCEL_UNCONFIRMED:'build.cancelUnconfirmed',BUILD_CONNECTION_REQUIRED:'build.codeRequired',BUILD_AUTH_FAILED:'build.codeInvalid',BUILD_UNAVAILABLE:'build.missing',BUILD_DISCONNECTED:'build.missing',BUILD_NATIVE_MISSING:'build.missing',BUILD_VERSION_UNSUPPORTED:'build.unsupported',BUILD_MODEL_UNSUPPORTED:'build.unsupported',BUILD_EFFORT_UNSUPPORTED:'build.unsupported'})[code]||'build.unavailable';
    const http=failure?.httpStatus,provider=Core.apiFailureProviderCode(failure?.providerCode);
    if(code==='API_ERROR'){
      if(http===401||['invalid_api_key','authentication_error','unauthenticated'].includes(provider))return settings.provider==='oauth'?'oauth.reauthRequired':'error.apiKeyRejected';
      if(http===402||['insufficient_quota','insufficient_credits','spending_limit','usage_limit_exceeded'].includes(provider))return settings.provider==='oauth'?'oauth.usageError':'error.apiUsage';
      if(http===403||['permission_error','permission_denied','forbidden'].includes(provider))return settings.provider==='oauth'?'oauth.permissionError':'error.apiAccess';
      if(http===429||failure?.code==='RATE_LIMIT')return 'status.rateLimited';
      if(failure?.code==='CONNECTION')return 'error.apiConnection';
      if(http>=500||failure?.code==='SERVER')return 'error.apiServer';
      if(http>=400&&http<500||failure?.code==='ACCESS')return 'error.apiRequest';
      return 'error.apiFailed';
    }
    if(['API_STREAM_INTERRUPTED','API_STREAM_ERROR'].includes(code))return 'error.apiConnection';
    if(code==='TIMEOUT')return 'error.apiTimeout';
    if(code==='API_INCOMPLETE')return failure?.code==='OUTPUT_LIMIT'?'error.apiOutputLimit':'error.apiIncomplete';
    return ({RATE_LIMIT:'status.rateLimited',NEEDS_KEY:'status.needsKey',KEY_MIGRATION_REQUIRED:'status.needsKey',
      CANCELLED:'status.cancelled',RAIL_COLLAPSED:'status.disabled',URL_SEARCH_REQUIRED:'error.urlSearchRequired',API_LANGUAGE_MISMATCH:'error.outputLanguageMismatch'})[code]||'status.failed';
  }
  function requestSnapshot(entry,requestId,task='analysis') {
    return {requestId,task,entry,postSnapshot:entry.post,apiIdentity:Core.apiPostIdentity(entry.post,task==='comments'?undefined:settings),path:location.pathname,provider:settings.provider,
      language:settings.language,apiModel:settings.provider==='oauth'?settings.oauthModel:settings.provider==='build'?settings.buildModel:settings.apiModel,
      verifyPrompt:settings.verifyPrompt,commentsPrompt:settings.commentsPrompt};
  }
  function isAccountLimit(failure) {return settings.provider==='api'&&(failure?.httpStatus===402||['spending_limit','insufficient_credits','insufficient_quota','usage_limit_exceeded'].includes(Core.apiFailureProviderCode(failure?.providerCode)));}
  function isCapacityFailure(code,failure) {return code==='API_CAPACITY'||failure?.errorCode==='API_CAPACITY';}
  function retryPhase(entry,task,phase,message={}) {
    const key=task==='comments'?'commentRetry':'analysisRetry';
    const attempt=message.retryAttempt??message.retryAttempts;
    const max=Core.AUTO_RETRY_LIMIT;
    entry[key]=Number.isInteger(attempt)&&attempt>0&&attempt<=max&&
      (phase!=='exhausted'||attempt===max)&&!['CANCELLED','CANCELED'].includes(message.code)?{phase,attempt,max}:null;
    refreshRetries(entry);
  }
  function clearRetries(entry) {entry.analysisRetry=null;entry.commentRetry=null;entry.keepRetryAnswer=false;refreshRetries(entry);}
  function refreshRetries(entry) {
    if(!entry.ui)return;
    for(const [state,label] of [[entry.analysisRetry,entry.ui.retryStatus],[entry.commentRetry,entry.ui.commentRetryStatus]]){
      label.hidden=!state;
      if(state)label.textContent=(state.phase==='queued'?t('status.queued')+' · ':'')+
        t(state.phase==='waiting'?'retry.waiting':state.phase==='exhausted'?'retry.exhausted':'retry.running',
          {seconds:Core.AUTO_RETRY_DELAY_MS/1000,attempt:state.attempt,max:state.max});
      else label.textContent='';
    }
  }
  function setCollapsed(value,persist=false) {
    collapsed=Boolean(value);
    if(collapsed) {


      for(const entry of allEntries()){entry.pending=false;entry.since=0;}
      for(const [id,request] of requests)if(request.task==='comments'?['queued','retry-wait'].includes(request.entry.commentStatus):['queued','retry-wait'].includes(request.entry.status)) {
        post({type:'CANCEL',requestId:id});requests.delete(id);
        if(request.task==='comments'){request.entry.commentRetry=null;request.entry.commentStatus='error';request.entry.commentError='status.disabled';refreshComments(request.entry);}
        else {request.entry.analysisRetry=null;request.entry.status='new';refreshCard(request.entry);}
      }
    }
    if(persist)postControl({type:'SET_RAIL_COLLAPSED',collapsed});
    scheduleLayout();if(!collapsed)tick();
  }
  function connect() {
    if(pageSuspended||needsPageRefresh||connected)return;
    clearTimeout(reconnectTimer);reconnectTimer=undefined;
    try {
      const nextPort=chrome.runtime.connect({name:'GROKFIRST_FEED'});port=nextPort;connected=true;workerSleeping=false;awaitingConfig=true;configureDraft();
      nextPort.onMessage.addListener(message=>{if(port===nextPort)handleMessage(message);});
      nextPort.onDisconnect.addListener(()=>{
        // Chrome exposes expected lifecycle disconnects through lastError.
        // Read it synchronously even for a stale port to avoid Unchecked logs.
        void chrome.runtime.lastError;
        if(port===nextPort)connectionLost(undefined,nextPort);
      });
      handshakeTimer=setTimeout(()=>{if(port===nextPort&&awaitingConfig)connectionLost(new Error('Background configuration timed out'),nextPort);},8000);
      post({type:'UI_LANGUAGE',language:xUILanguage});
    } catch(error){connectionLost(error);}
  }
  function handleMessage(message) {
    if(followups?.handle(message))return;
    if(message.type==='HISTORY_CONFIG') {configureHistory(message.enabled,message.epoch);return;}
    if(message.type==='HISTORY_ACK') {
      const batch=historyPending.get(message.batchId);if(!batch)return;
      historyPending.delete(message.batchId);
      if(batch.epoch!==historyEpoch||message.epoch!==historyEpoch)return;
      if(message.ok!==true){for(const id of batch.ids)historySeen.delete(id);historyRetryAt=Date.now()+5000;}
      return;
    }
    if(message.type==='RAIL_VISIBILITY'){setCollapsed(message.collapsed);return;}
    if(message.type==='CONFIG') {
      syncAppearance();
      hasConfig=true;awaitingConfig=true;workerSleeping=false;reconnectFailures=0;
      clearTimeout(handshakeTimer);handshakeTimer=undefined;
      const nextSettings=Core.normalizeSettings(message.settings),previousOptions={...settings},nextOptions={...nextSettings};
      // Editing prompts affects new requests. Interface language only relabels
      // controls; accepted jobs and visible answers retain their task snapshot.
      // An archived explanation draft can survive upgrades, but never changes
      // current fact-check jobs or their visible results.
      for(const field of ['explainPrompt','verifyPrompt','draftPrompt','postDraftPrompt','replyDraftPrompt','commentsPrompt','interfaceLanguage','dwellMs','analysisDefaultsVersion','oauthRemember']){delete previousOptions[field];delete nextOptions[field];}
      // A waking worker can report OAuth restoration before decrypting the
      // saved identity. Unknown is not a new account: keep retained results
      // terminal until an authoritative identity arrives, with calls blocked.
      const pendingOAuthIdentity=nextSettings.provider==='oauth'&&settings.provider==='oauth'&&message.oauthStatus?.state==='restoring'&&!message.credentialIdentity;
      const nextCredentialIdentity=pendingOAuthIdentity?credentialIdentity:message.credentialIdentity||'';
      const credentialsReplaced=nextSettings.provider!=='oauth'&&nextSettings.provider===settings.provider&&Number.isSafeInteger(taskRevision)&&Number.isSafeInteger(message.taskRevision)&&message.taskRevision>taskRevision;
      const accountChanged=credentialIdentity!==nextCredentialIdentity||credentialsReplaced;
      const allChanged=accountChanged||JSON.stringify(previousOptions)!==JSON.stringify(nextOptions);
      const identity=value=>JSON.stringify([value.provider,value.apiModel,value.apiReasoningEffort,value.oauthModel,value.oauthReasoningEffort,value.buildModel,value.buildReasoningEffort,value.buildTransport,value.buildPort,value.language,value.webSearch,value.xSearch,value.apiVerification,value.explanationMode]);
      const previous=identity(settings);
      const wasReady=providerReady;
      settings=nextSettings;
      credentialIdentity=nextCredentialIdentity;oauthState=message.oauthStatus||{};
      taskRevision=Number.isSafeInteger(message.taskRevision)?message.taskRevision:undefined;
      configureHistory(message.historyEnabled,message.historyEpoch);
      providerReady=Boolean(message.ready)&&!pendingOAuthIdentity;used=message.used || 0;
      buildErrorCode=typeof message.buildStatus?.errorCode==='string'?message.buildStatus.errorCode:'';
      syncUILanguage();
      for(const entry of allEntries())if(entry.connectionStatus){
        if(entry.status==='done'&&entry.connectionStatus.key)status(entry,entry.connectionStatus.key,entry.connectionStatus.vars);
        delete entry.connectionStatus;
      }
      if(!Core.LANGUAGES.some(item=>item.value===settings.language)&&!Array.from(railLanguage.children).some(item=>item.value===settings.language)){const option=node('option','',settings.language);option.value=settings.language;railLanguage.append(option);}
      railLanguage.value=settings.language;railLanguage.disabled=false;
      refreshHeaderLanguage();
      const changed=accountChanged||previous!==identity(settings);
      // Per-answer failures never freeze other posts, including legacy
      // worker pause flags restored from an older browser session.
      if(allChanged || !settings.enabled || (wasReady&&!providerReady)) {
        resetPendingState();
        // Security and task-configuration changes cancel every old task.
        // Repeated paused snapshots must not cancel explicit draft checks;
        // actual setting changes are tracked by the worker's taskRevision.
        if(changed||accountChanged||wasReady&&!providerReady)post({type:'CANCEL_ALL'});
        else for(const requestId of requests.keys())post({type:'CANCEL',requestId});
        requests.clear();
        for(const entry of allEntries()) {
          clearRetries(entry);
          if(changed||['queued','running','retry-wait'].includes(entry.status)){entry.status='new';entry.pending=false;entry.since=0;entry.result=null;entry.cached=false;entry.analysisUsage=null;entry.requestDiagnostics=undefined;setVerificationFailure(entry,null,false);renderAnswer(entry,'',true);renderSources(entry,[]);note(entry,'');entry.ui.retry.hidden=true;}
          if(changed||['queued','running','retry-wait'].includes(entry.commentStatus)){entry.commentStatus='idle';entry.comments=[];entry.commentUsage=null;entry.commentRequestDiagnostics=undefined;refreshComments(entry);}
        }
      }
      if(typeof message.collapsed==='boolean'&&activeEntry)setCollapsed(message.collapsed);
      awaitingConfig=false;
      for(const [type,control] of wakeControls){
        wakeControls.delete(type);
        if(type==='SET_LANGUAGE'&&control.language===settings.language)continue;
        if(type==='SET_LANGUAGE')awaitingConfig=true;
        if(!post(control))return;
      }
      for(const entry of allEntries())refreshCard(entry);
      scheduleLayout();configureDraft();
      // SET_LANGUAGE is acknowledged by a new CONFIG. Wait for that snapshot
      // so a waking feed cannot bill for an obsolete answer language.
      if(awaitingConfig){railLanguage.disabled=true;handshakeTimer=setTimeout(()=>connectionLost(new Error('Language configuration timed out')),8000);return;}
      const actions=[...wakeActions.values()];wakeActions.clear();
      if(providerReady)for(const action of actions){if(!connected||awaitingConfig)break;action();}
      for(const entry of allEntries())refreshCard(entry);
      scheduleScan();return;
    }
    if(message.type==='FATAL'){
      providerReady=false;requests.clear();
      draftComposer?.connectionLost('status.failed');configureDraft();
      for(const entry of allEntries()){
        clearRetries(entry);entry.status='error';status(entry,'status.failed');entry.ui.retry.hidden=false;
        if(['queued','running','retry-wait'].includes(entry.commentStatus)){entry.commentStatus='error';entry.commentError='status.failed';refreshComments(entry);}
        refreshCard(entry);
      }
      scheduleLayout();return;
    }
    if(draftComposer?.handleMessage(message)){scheduleLayout();return;}
    const request=requests.get(message.requestId);
    if(!request) return;
    const {entry}=request;
    const unchanged=Core.apiPostIdentity(entry.post,request.task==='comments'?undefined:settings)===request.apiIdentity;
    if(!unchanged || request.path!==lastPath || request.path!==location.pathname&&!hasBlockingXModal()){finishRequest(message);return;}
    if(request.railCancellation&&['ERROR','COMMENT_ERROR'].includes(message.type)&&message.code==='CANCELLED') {
      // The worker confirms that this job never started. A delayed START or
      // RESULT, on the other hand, still belongs to the paid request we retain.
      requests.delete(message.requestId);
      if(request.task==='comments')entry.commentRetry=null;else entry.analysisRetry=null;
      if(request.task==='comments'){entry.commentStatus='error';entry.commentError='status.cancelled';entry.commentUsage=null;refreshComments(entry);}
      else {entry.status='new';entry.pending=false;entry.analysisUsage=null;refreshCard(entry);}
      scheduleLayout();tick();return;
    }
    // Monotonic across retry waits and re-queuing: this logical task has begun,
    // even if a later QUEUED snapshot no longer looks like running work.
    if(['START','UPDATE','RETRY_WAIT','COMMENT_START','COMMENT_RETRY_WAIT'].includes(message.type))request.started=true;
    if(request.task==='comments') {
      if(message.type==='COMMENT_QUEUED'){entry.commentStatus='queued';retryPhase(entry,'comments','queued',message);}
      if(message.type==='COMMENT_START'){request.railCancellation=false;entry.commentStatus='running';retryPhase(entry,'comments','running',message);}
      if(message.type==='COMMENT_RESULT'){
        entry.commentRetry=null;
        captureUsage(entry,'comments',message,request,Boolean(message.cached),true);
        const values=message.comments;
        if(Array.isArray(values)&&values.length===3&&values.every(text=>typeof text==='string'&&text.trim()&&Array.from(text).length<=280)&&new Set(values).size===3){entry.comments=values;entry.commentStatus='done';}
        else {entry.commentStatus='error';entry.commentError='status.failed';}
      }
      if(['COMMENT_ERROR','COMMENT_RETRY_WAIT'].includes(message.type)){captureUsage(entry,'comments',message,request,false);entry.commentStatus=message.type==='COMMENT_RETRY_WAIT'?'retry-wait':'error';entry.commentError=errorKey(message.code,message.verificationFailure);entry.commentRequestDiagnostics=Core.sanitizedRequestDiagnostics(message.requestDiagnostics);retryPhase(entry,'comments',message.type==='COMMENT_RETRY_WAIT'?'waiting':'exhausted',message);}
      refreshComments(entry);refreshVerificationFailure(entry);
      if(message.type==='COMMENT_RESULT'&&entry.commentStatus==='done'&&entry.ui.box.scrollTo) {
        const end=Math.max(entry.ui.comments.offsetTop+entry.ui.comments.offsetHeight,entry.ui.tokenUsage.offsetTop+entry.ui.tokenUsage.offsetHeight);
        const top=Math.max(0,end-entry.ui.box.clientHeight+16);
        entry.ui.box.scrollTo({top,behavior:globalThis.matchMedia?.('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});
      }
      finishRequest(message);scheduleLayout();if(message.type==='COMMENT_RESULT')tick();return;
    }
    if(message.type==='QUEUED'){entry.status='queued';if(message.retryAttempt)retryPhase(entry,'analysis','queued',message);else if(entry.analysisRetry)entry.analysisRetry.phase='queued';status(entry,'status.queued');}
    if(message.type==='START'){request.railCancellation=false;request.scrollCancellation=false;entry.since=0;entry.status='running';used=Math.max(used,message.used||0);status(entry,'status.verifying');retryPhase(entry,'analysis','running',message);}
    if(message.type==='UPDATE'){
      request.railCancellation=false;request.scrollCancellation=false;entry.since=0;
      captureUsage(entry,'analysis',message,request,false);
      entry.status='running';
      // Progress without a text snapshot leaves accepted prose intact. An
      // explicit empty snapshot retracts obsolete text, including a tool-only
      // fragment that an older worker may have exposed before classification.
      const suppliedText=typeof message.text==='string';
      const readerText=suppliedText?Core.readerOutput(message.text).text:undefined;
      const verifying=['verification_queued','verify','verification'].includes(message.phase);
      if(verifying&&!['verification_queued','verify','verification'].includes(entry.phase)) {
        entry.verificationBase=entry.latestText||'';entry.verificationStarted=false;entry.verificationStart=undefined;
      }
      if(message.phase==='verification_queued'&&suppliedText)entry.verificationBase=readerText;
      if(validVerificationBoundary(readerText,message.verificationStart)) {
        entry.verificationStart=message.verificationStart;
        entry.verificationBase=readerText.slice(0,message.verificationStart-2);
      }
      if(verifying&&message.phase!=='verification_queued'&&suppliedText) {
        // API progress identifies the actual check text separately from the
        // preserved explanation.
        const checkText=typeof message.verificationText==='string'?Core.readerOutput(message.verificationText).text:
          readerText.startsWith(entry.verificationBase||'')?
            readerText.slice((entry.verificationBase||'').length):readerText;
        entry.verificationStarted=Boolean(readerText.trim()&&checkText.trim());
      }
      entry.phase=request.phase=message.phase;
      const phases={starting:'status.verifying',explain:'status.explaining',verification_queued:'status.verificationQueued',verify:'status.verifying',inline:'status.inline'};
      status(entry,phases[message.phase]||'status.verifying');
      if(suppliedText&&!(entry.keepRetryAnswer&&!readerText.trim())){renderAnswer(entry,readerText);if(readerText.trim())entry.keepRetryAnswer=false;}
      else if(verifying&&entry.latestText)renderAnswer(entry,entry.latestText);
      if(message.sources)renderSources(entry,message.sources);
      if(message.warning)note(entry,['explain','verification_queued'].includes(message.phase)?'note.checkIncomplete':'note.possibleErrors');
    }
    if(message.type==='RESULT') {
      entry.analysisRetry=null;entry.keepRetryAnswer=false;
      const {result,invalid}=readerResult(message.result);
      captureUsage(entry,'analysis',result,request,Boolean(message.cached),true);
      entry.status=invalid?'error':'done';entry.result=result;entry.verificationStart=result.verificationStart;
      if(invalid)entry.errorCode='API_INCOMPLETE';
      renderAnswer(entry,result.text,true);renderSources(entry,result.sources||[]);
      const incomplete=['incomplete','failed'].includes(result.verificationStatus);
      if(incomplete)retryPhase(entry,'analysis','exhausted',message);
      entry.requestDiagnostics=Core.sanitizedRequestDiagnostics(result.requestDiagnostics||message.requestDiagnostics);
      setVerificationFailure(entry,result.verificationFailure,incomplete);
      const sourceKey=isCapacityFailure(undefined,entry.verificationFailure)?'error.apiCapacity':incomplete?'status.incomplete':result.searched?'status.searched':'status.unverified';
      entry.cached=!invalid&&Boolean(message.cached);status(entry,sourceKey);
      note(entry,invalid?'':incomplete?partialResultNote(result):'note.possibleErrors');entry.ui.retry.hidden=false;
      if(isAccountLimit(entry.verificationFailure))note(entry,'note.accountLimit');
      finishRequest(message);
    }
    if(['ERROR','RETRY_WAIT'].includes(message.type)) {
      const retryWaiting=message.type==='RETRY_WAIT';
      const retained=message.partialResult?readerResult(message.partialResult):null;
      const partialResult=retained?.result;
      captureUsage(entry,'analysis',{...partialResult,...message},request,false);
      const partialVerification=partialResult&&(['incomplete','failed'].includes(partialResult.verificationStatus)||partialResult.verificationFailure);
      const failure=message.verificationFailure||partialResult?.verificationFailure;
      entry.requestDiagnostics=Core.sanitizedRequestDiagnostics(message.requestDiagnostics||partialResult?.requestDiagnostics);
      setVerificationFailure(entry,failure,Boolean(failure||partialVerification));
      entry.status=retryWaiting?'retry-wait':'error';entry.phase='';entry.errorCode=message.code;status(entry,isCapacityFailure(message.code,entry.verificationFailure)?'error.apiCapacity':partialVerification?'status.incomplete':errorKey(message.code,entry.verificationFailure));note(entry,'');entry.ui.retry.hidden=retryWaiting;
      if(['API_LANGUAGE_MISMATCH','BUILD_LANGUAGE_MISMATCH'].includes(message.code)){entry.cached=false;entry.result=null;renderAnswer(entry,'',true);renderSources(entry,[]);}
      if(partialResult){entry.verificationStart=partialResult.verificationStart;renderAnswer(entry,partialResult.text,true);renderSources(entry,partialResult.sources||[]);note(entry,retained.invalid?'':partialResultNote(partialResult));}
      entry.keepRetryAnswer=retryWaiting&&Boolean(entry.latestText?.trim());
      retryPhase(entry,'analysis',retryWaiting?'waiting':'exhausted',message);
      if(!entry.verificationFailure&&!entry.requestDiagnostics&&!entry.commentRequestDiagnostics) {
        entry.ui.diagnostics.hidden=!message.diagnostics&&!message.error;
        entry.ui.diagnosticText.textContent=JSON.stringify({code:message.code,error:message.error,...message.diagnostics,...(message.usage?{usage:message.usage}:{})},null,2).slice(0,4000);
      }
      if(['NEEDS_KEY','KEY_MIGRATION_REQUIRED','BUILD_CONNECTION_REQUIRED','BUILD_CANCEL_UNCONFIRMED','BUILD_NATIVE_MISSING','BUILD_PERMISSION_REQUIRED','BUILD_LOGIN_REQUIRED','BUILD_VERSION_UNSUPPORTED','BUILD_CONFIG_UNSUPPORTED','BUILD_TOOL_POLICY'].includes(message.code)){
        providerReady=false;
        for(const pending of allEntries())refreshCard(pending);
      }
      if(isAccountLimit(entry.verificationFailure))note(entry,'note.accountLimit');
      finishRequest(message);
    }
    refreshCard(entry);scheduleLayout();
    if(['RESULT','ERROR'].includes(message.type))tick();
  }
  // API launch spacing belongs to the shared background scheduler; this page
  // accepts explicit work without waiting for earlier answers to finish.
  function finishRequest(message) { if(!['RESULT','ERROR','COMMENT_RESULT','COMMENT_ERROR'].includes(message.type))return;requests.delete(message.requestId);pruneDetachedEntries(); }
  function affectsDisplayedPostBody(target) {
    // X can keep both bodies mounted and switch visibility through their own
    // or ancestor attributes. Media and metric styling do not change the body.
    const ownBody=body=>{
      const article=body?.closest?.('article[data-testid="tweet"]');
      if(!article)return false;
      for(let cursor=body.parentElement;cursor&&cursor!==article;cursor=cursor.parentElement) {
        const testId=cursor.getAttribute?.('data-testid')||'',tag=String(cursor.tagName||'').toLowerCase();
        if(tag==='article'||/^(?:quoteTweet|quotedTweet|quoted-post|card\.wrapper)$/i.test(testId)||
            (tag!=='a'&&cursor.getAttribute?.('role')==='link'))return false;
      }
      return true;
    };
    const containingBody=target?.closest?.('[data-testid="tweetText"]');
    if(containingBody&&ownBody(containingBody))return true;
    return Array.from(target?.querySelectorAll?.('[data-testid="tweetText"]')||[]).some(ownBody);
  }
  function scheduleScan(){if(scanTimer)return;scanTimer=setTimeout(()=>{scanTimer=null;scan();},0);}
  function supportedPage(){return !/^\/(?:messages|i\/(?:chat|grok|flow|premium|settings))\b/.test(location.pathname);}
  function hasBlockingXModal() {
    // X can change its SPA route before its portal mounts, or retain the old
    // dialog while navigating back. Either signal keeps the feed rail out.
    if(/^\/(?:i\/)?compose\/(?:post|tweet)(?:\/|$)/i.test(location.pathname)||/\/status\/\d+\/(?:photo|video)\/\d+(?:\/|$)/i.test(location.pathname))return true;
    const fullscreen=document.fullscreenElement||document.webkitFullscreenElement;
    if(fullscreen&&fullscreen!==overlay&&!overlay.contains(fullscreen))return true;
    const rendered=element=>{
      if(!element.isConnected||element===overlay||overlay.contains(element))return false;
      for(let node=element;node;node=node.parentElement){
        const local=node!==document.body&&node!==document.documentElement;
        if(node.hidden||local&&(node.getAttribute('aria-hidden')==='true'||node.hasAttribute('inert')))return false;
        const style=getComputedStyle(node);
        if(style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.contentVisibility==='hidden'||Number.parseFloat(style.opacity)===0)return false;
      }
      const rect=element.getBoundingClientRect();
      if(rect.width>0&&rect.height>0&&rect.right>0&&rect.bottom>0&&rect.left<innerWidth&&rect.top<innerHeight)return true;
      // Semantic portal wrappers may use display:contents and own no box.
      return getComputedStyle(element).display==='contents'&&Array.from(element.children).some(rendered);
    };
    return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [aria-modal="true"], dialog[open], [data-testid="sheetDialog"], [data-testid="swipe-to-dismiss"]')).some(rendered);
  }
  function syncXModalVisibility() {
    const blocked=hasBlockingXModal();
    if(blocked!==xModalBlocked){
      xModalBlocked=blocked;
      // Hide the host immediately, before the next layout frame, so none of
      // its pointer-enabled children can cover a newly opened X dialog.
      if(blocked){overlay.hidden=true;pauseUnseenRailQueue();}
      scheduleLayout();
    }
    return blocked;
  }
  function scheduleLayout(){if(layoutFrame!==null)return;layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;positionCards();});}
  function currentRailBounds() {
    const width=document.documentElement.clientWidth||innerWidth;
    return {hidden:!activeEntry||collapsed||syncXModalVisibility(),left:Math.max(0,width-440),top:0,width:Math.min(440,width),height:innerHeight};
  }
  function pauseUnseenRailQueue({preserveStarted=false}={}) {
    // No room for the result means no new paid work. Preserve requests whose
    // START has arrived, and only cancel work that is still waiting to begin.

    for(const entry of allEntries()){entry.pending=false;entry.since=0;}
    for(const [id,request] of requests)if(request.task==='comments'?['queued','retry-wait'].includes(request.entry.commentStatus):['queued','retry-wait'].includes(request.entry.status)) {
      if(request.railCancellation||preserveStarted&&request.started)continue;
      request.railCancellation=true;
      // Leave the request attached until cancellation is acknowledged. It may
      // already be running while the START message is still crossing the port.
      post({type:'CANCEL_IF_QUEUED',requestId:id,...(preserveStarted?{preserveStarted:true}:{})});
    }
  }
  function positionCards() {
    const blocked=syncXModalVisibility();
    overlay.hidden=document.hidden||!settings.enabled||!supportedPage()||blocked||collapsed||!activeEntry;
    rail.hidden=railHeader.hidden=drawerFooter.hidden=overlay.hidden;
    railExpand.hidden=railSeparators.hidden=true;
    for(const entry of allEntries())entry.card.hidden=overlay.hidden||entry!==activeEntry;
    for(const [article,host] of triggers){host.hidden=!settings.enabled||!supportedPage()||blocked;if(!host.hidden)positionTrigger(article,host);}
    if(overlay.hidden)return;
    const bounds=currentRailBounds(),headHeight=68,footerHeight=56;
    for(const [element,geometry] of [[rail,bounds],[railHeader,{...bounds,height:headHeight}],
        [activeEntry.card,{...bounds,top:headHeight,height:Math.max(0,bounds.height-headHeight-footerHeight)}],
        [drawerFooter,{...bounds,top:bounds.height-footerHeight,height:footerHeight}]]) {
      for(const name of ['left','top','width','height'])element.style[name]=geometry[name]+'px';
    }
    activeEntry.ui.box.style.top='0px';activeEntry.ui.box.style.height='100%';
  }
  function discardEntry(entry) {
    entry.followup?.reset();
    for(const [id,request] of requests)if(request.entry===entry){post({type:'CANCEL',requestId:id});requests.delete(id);}
    if(entry.answerFrame!==undefined)cancelAnimationFrame(entry.answerFrame);
    detachedEntries.delete(entry);entry.card.remove();
    if(activeEntry===entry){activeEntry=null;setCollapsed(true);}
  }
  function removeEntry(article,entry,preserve=true) {

    if(entry.answerFrame!==undefined)cancelAnimationFrame(entry.answerFrame);
    entry.answerFrame=undefined;if(activeEntry!==entry)entry.card.remove();entries.delete(article);
    if(!preserve||entry.path!==location.pathname){discardEntry(entry);return;}
    entry.pending=false;entry.since=0;detachedEntries.add(entry);
    // START can be in transit. A conditional cancellation must leave both the
    // subscription and its concurrency lease intact if work has already begun.
    for(const [id,request] of requests)if(request.entry===entry&&
        (request.task==='comments'?['queued','retry-wait'].includes(entry.commentStatus):['queued','retry-wait'].includes(entry.status))&&!request.railCancellation){
      request.railCancellation=true;post({type:'CANCEL_IF_QUEUED',requestId:id});
    }
    pruneDetachedEntries();
  }
  function pruneDetachedEntries() {
    const active=new Set([...requests.values()].map(request=>request.entry));
    const completed=[...detachedEntries].filter(entry=>!active.has(entry));
    for(const entry of completed.filter(item=>item!==activeEntry).slice(0,Math.max(0,completed.length-100)))discardEntry(entry);
  }
  function mountTrigger(article) {
    const existing=triggers.get(article);
    if(existing?.isConnected)return;
    const host=node('sidelens-trigger'),shadow=host.attachShadow({mode:'open'}),css=node('style');
    css.textContent=`:host{all:initial;display:inline-flex;width:22px;height:22px;vertical-align:middle;margin:0;}:host([hidden]){display:none!important;}button{all:initial;display:grid;place-items:center;width:22px;height:22px;box-sizing:border-box;background:var(--sl-trigger-bg,#f8f5e9);color:var(--sl-trigger-fg,#bc1723);border:1px solid var(--sl-trigger-border,#575044);border-radius:3px;cursor:pointer;padding:3px;}button:hover{background:var(--gf-accent,#cf1f2b);}.trigger-glyph{display:block;width:14px;height:14px;background-color:var(--sl-trigger-fg,#bc1723);mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;-webkit-mask:url(${JSON.stringify(symbolURL)}) center/contain no-repeat;mask-mode:alpha;}button:hover .trigger-glyph{background-color:var(--sl-button,#fff9ed);}button:focus-visible{outline:2px solid var(--gf-accent,#cf1f2b);outline-offset:2px;}`;
    globalThis.SideLensAppearance?.apply(host,globalThis.SideLensAppearance.detect(document));
    const button=node('button');button.type='button';button.title='SideLens';button.setAttribute('aria-label','SideLens · '+t('common.verification'));button.setAttribute('aria-haspopup','dialog');
    const glyph=node('span','trigger-glyph');glyph.setAttribute('aria-hidden','true');button.append(glyph);
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();if(event.isTrusted===false)return;openPost(article,button);});
    for(const type of ['pointerdown','keydown'])host.addEventListener(type,event=>event.stopPropagation());
    shadow.append(css,button);
    if(getComputedStyle(article).position==='static')article.style.position='relative';
    host.style.position='absolute';host.style.zIndex='1';
    article.append(host);triggers.set(article,host);positionTrigger(article,host);
  }
  function positionTrigger(article,host) {
    const rect=article.getBoundingClientRect();
    const action=Array.from(article.querySelectorAll('[data-testid="GrokButton"], [data-testid="GrokShareButton"], [aria-label="Grok actions"], button[aria-label*="Grok"], [data-testid="caret"]')).find(node=>node.closest('article[data-testid="tweet"]')===article);
    const anchor=action?.getBoundingClientRect();
    const header=article.querySelector('[data-testid="User-Name"]')?.getBoundingClientRect();
    let top=anchor?anchor.top-rect.top+(anchor.height-22)/2:header?header.top-rect.top:8;
    const body=article.querySelector('[data-testid="tweetText"]')?.getBoundingClientRect();
    if(body?.height>0&&body.top>rect.top)top=Math.min(top,body.top-rect.top-24);
    host.style.top=Math.max(0,top)+'px';
    host.style.left=Math.max(0,anchor?anchor.left-rect.left-28:rect.width-96)+'px';
  }
  function openPost(article,button) {
    if(!settings.enabled||!supportedPage()||syncXModalVisibility())return;
    const data=Core.extractPost(article);if(!data)return;
    let entry=entries.get(article);
    const identity=Core.apiPostIdentity(data,settings);
    if(entry&&Core.apiPostIdentity(entry.post,settings)!==identity){removeEntry(article,entry);entry=null;}
    if(!entry){
      entry=[...detachedEntries].reverse().find(item=>Core.apiPostIdentity(item.post,settings)===identity);
      if(entry){detachedEntries.delete(entry);entry.article=article;entry.post=data;}
      else {entry={article,path:location.pathname,post:data,status:'new',since:0,result:null,commentStatus:'idle',comments:[]};Object.assign(entry,createCard(entry));}
      entries.set(article,entry);overlayShadow.append(entry.card);
    } else entry.post=data;
    if(entry.status==='done'&&entry.result?.completedAt&&Date.now()-entry.result.completedAt>=86400000){
      entry.status='new';entry.result=null;entry.cached=false;entry.analysisUsage=null;clearComments(entry);renderAnswer(entry,'',true);renderSources(entry,[]);
    }
    activeEntry=entry;lastTrigger=button;entry.path=location.pathname;
    setCollapsed(false,true);refreshCard(entry);positionCards();
    entry.card.focus();
    recordHistory();
    if(entry.status==='new')submit(entry,false);
  }
  function scan() {
    if(location.pathname!==lastPath){
      lastPath=location.pathname;historySeen.clear();historyPending.clear();
      // An explicit request can finish while the user navigates within X.
      draftComposer?.reset();
    }
    for(const [article,host] of triggers)if(!article.isConnected){host.remove();triggers.delete(article);}
    for(const [article,entry] of entries)if(!article.isConnected)removeEntry(article,entry);
    if(supportedPage()&&!syncXModalVisibility())for(const article of document.querySelectorAll('article[data-testid="tweet"]')) {
      if(!article.parentElement?.closest('article[data-testid="tweet"]'))mountTrigger(article);
    }
    scheduleLayout();
  }
  function refreshCard(entry) {
    entry.ui.box.setAttribute('aria-label',t('aria.result'));
    entry.ui.retry.textContent=entry.status==='new'?t('sidelens.analyze'):t('sidelens.refresh');
    entry.ui.diagnosticLabel.textContent=t('common.diagnostics');
    if(entry.status==='new') {
      status(entry,!connected&&!workerSleeping?(needsPageRefresh?'status.refreshRequired':'status.connectionLost'):!providerReady?needsProvider():entry.pending?'status.queued':'status.waiting');
      note(entry,'');
      entry.ui.retry.hidden=!providerReady;
    }
    else if(entry.statusKey)status(entry,entry.statusKey,entry.statusVars);
    if(entry.noteKey)entry.ui.note.textContent=t(entry.noteKey);
    entry.ui.cacheMeta.hidden=!entry.result?.completedAt;
    if(entry.result?.completedAt)entry.ui.cacheMeta.textContent=(entry.cached?t('status.cached')+' · ':'')+t('sidelens.generated')+' '+new Date(entry.result.completedAt).toLocaleString(uiLanguage);
    entry.ui.original.href=entry.post.url;entry.ui.original.textContent=entry.post.author||t('common.source');
    entry.ui.postText.textContent=entry.post.text||t('sidelens.mediaPost');
    entry.ui.retry.disabled=!usableConnection()||!settings.enabled||['queued','running','retry-wait'].includes(entry.status)||wakeActions.has(wakeKey(entry,'analysis'));
    if(!providerReady)entry.ui.retry.hidden=true;
    else if(['done','error'].includes(entry.status))entry.ui.retry.hidden=false;
    refreshComments(entry);refreshRetries(entry);syncLoading(entry);refreshUsage(entry);
    entry.followup?.refresh();if(!entry.result)entry.followup?.reset();if(entry.status==='done')entry.followup?.setAnalysis(entry.result);
  }
  function onFeedScroll() { scheduleLayout(); }
  function resetPendingState() {

    for(const entry of allEntries()){entry.since=0;entry.pending=false;}
  }
  // No visibility, scroll, timer or CONFIG event may create an analysis.
  function tick() { if(location.pathname!==lastPath)scheduleScan(); }
  function configureHistory(enabled,epoch) {
    const nextEpoch=Number.isSafeInteger(epoch)?epoch:historyEpoch;
    if(nextEpoch!==historyEpoch){historyPending.clear();historyRetryAt=0;}
    historyEnabled=enabled!==false;historyEpoch=nextEpoch;historyLoaded=true;
    if(!historyEnabled){historySeen.clear();historyPending.clear();historyRetryAt=0;}
  }
  function recordHistory() {
    if(xModalBlocked)return;
    // Record visibility independently of paid work, without polling writes for
    // stationary posts. A clear does not immediately re-add the current view.
    if(!historyLoaded||!historyEnabled||!settings.enabled||document.hidden||!supportedPage()){historySeen.clear();historyPending.clear();return;}
    if(location.pathname!==lastPath)return;
    for(const [batchId,batch] of historyPending)if(Date.now()-batch.sentAt>=10000){historyPending.delete(batchId);for(const id of batch.ids)historySeen.delete(id);historyRetryAt=Date.now()+5000;}
    if(Date.now()<historyRetryAt)return;
    const displayed=new Map();
    if(activeEntry)displayed.set(activeEntry.post.id,activeEntry.post);
    for(const id of historySeen)if(!displayed.has(id))historySeen.delete(id);
    const unseen=[...displayed.values()].filter(item=>!historySeen.has(item.id));
    if(!unseen.length)return;
    if(!connected){if(workerSleeping)connect();return;}
    if(awaitingConfig)return;
    for(let index=0;index<unseen.length;index+=30){
      const posts=unseen.slice(index,index+30),batchId=crypto.randomUUID(),ids=posts.map(item=>item.id);
      historyPending.set(batchId,{ids,epoch:historyEpoch,sentAt:Date.now()});for(const id of ids)historySeen.add(id);
      if(!post({type:'HISTORY_VISIT',posts,historyEpoch,batchId})){historyPending.delete(batchId);for(const id of ids)historySeen.delete(id);historyRetryAt=Date.now()+5000;return;}
    }
  }
  function submit(entry,force) {
    if(afterWake(entry,'analysis',()=>submit(entry,force)))return;
    if(!settings.enabled||!connected||!providerReady||currentRailBounds().hidden)return;
    if(awaitingConfig)return;
    if([...requests.values()].some(r=>r.entry===entry&&r.task==='analysis'))return;
    if(force&&!clearComments(entry))return;
    entry.followup?.reset();
    // Cancelling a comment can synchronously invalidate the shared port.
    if(!connected||!providerReady)return;
    entry.analysisRetry=null;entry.keepRetryAnswer=false;
    const requestId=crypto.randomUUID();
    entry.pending=false;entry.since=0;entry.status='queued';entry.phase='';entry.verificationBase='';entry.verificationStarted=false;entry.verificationStart=undefined;entry.result=null;entry.cached=false;entry.requestDiagnostics=undefined;setVerificationFailure(entry,null,false);status(entry,'status.queued');entry.ui.retry.hidden=true;
    if(force||!entry.ui.answer.textContent)renderAnswer(entry,'',true);
    renderSources(entry,[]);note(entry,'');entry.ui.diagnostics.hidden=true;entry.ui.diagnosticText.textContent='';
    requests.set(requestId,{...requestSnapshot(entry,requestId),force:force===true});
    entry.analysisUsage=null;captureUsage(entry,'analysis',{},requests.get(requestId),false,true);refreshUsage(entry);
    post({type:'ANALYZE',requestId,post:entry.post,force});scheduleLayout();
  }
  function clearComments(entry) {
    for(const [id,request] of requests)if(request.entry===entry&&request.task==='comments'){
      if(!post({type:'CANCEL',requestId:id}))return false;
      requests.delete(id);
    }
    entry.comments=[];entry.commentUsage=null;entry.commentRequestDiagnostics=undefined;entry.commentStatus='idle';entry.commentRetry=null;entry.commentError='';entry.copyStatusKey='';entry.ui.copyStatus.textContent='';refreshComments(entry);refreshVerificationFailure(entry);
    return true;
  }
  function refreshComments(entry) {
    const ui=entry.ui;if(!ui)return;
    const loading=['queued','running','retry-wait'].includes(entry.commentStatus);
    ui.comments.setAttribute('aria-label',t('aria.comments'));ui.comments.setAttribute('aria-busy',String(loading));
    ui.commentHeading.textContent=t('common.comments');ui.commentHint.textContent=t('comments.copyHint');ui.commentHeading.hidden=ui.commentHint.hidden=!entry.comments.length;
    if(entry.copyStatusKey)ui.copyStatus.textContent=t(entry.copyStatusKey);
    ui.commentStatus.hidden=!loading&&entry.commentStatus!=='error';
    ui.commentStatus.textContent=loading?t(entry.commentStatus==='running'?'comments.loading':'comments.pending'):t(entry.commentError||'status.failed');
    ui.commentStatus.classList.toggle('shimmer',loading);
    for(const item of ui.comments.children){item.setAttribute('aria-label',t('common.copy')+': '+item.textContent);item.title=t('common.copy');}
    ui.comments.hidden=!entry.comments.length;
    refreshUsage(entry);refreshRetries(entry);
    // Locale changes update controls only; the suggested text remains in the
    // selected output language and keeps its own direction.
    if(ui.comments.children.length===entry.comments.length&&entry.comments.every((text,i)=>ui.comments.children[i].dataset.text===text))return;
    ui.comments.replaceChildren();
    for(const text of entry.comments){const button=node('button','comment-copy',text);button.dataset.text=text;button.setAttribute('dir','auto');button.setAttribute('aria-label',t('common.copy')+': '+text);button.title=t('common.copy');
      button.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text);entry.copyStatusKey='common.copied';}catch{entry.copyStatusKey='common.copyFailed';}ui.copyStatus.textContent=t(entry.copyStatusKey);});ui.comments.append(button);}
  }
  function tokenCount(value) {return Number.isSafeInteger(value)&&value>=0?value:null;}
  function safeModel(value) {return typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,119}$/.test(value)?value:'';}
  function usageFields(value) {
    const usage={};
    for(const key of ['total_tokens','input_tokens','output_tokens'])if(tokenCount(value?.[key])!==null)usage[key]=value[key];
    return usage;
  }
  function usageTotal(usage) {
    if(tokenCount(usage.total_tokens)!==null)return usage.total_tokens;
    return tokenCount(usage.input_tokens)!==null&&tokenCount(usage.output_tokens)!==null?tokenCount(usage.input_tokens+usage.output_tokens):null;
  }
  function captureUsage(entry,task,metadata,request,cached,replace=false) {
    const key=task==='comments'?'commentUsage':'analysisUsage',previous=replace?{}:entry[key]||{};
    const record={...previous,requestedModel:safeModel(request.apiModel),cached};
    if(replace||metadata.usage!==undefined)record.usage=usageFields(metadata.usage);
    if(replace||metadata.usageByStage!==undefined) {
      record.byStage={};
      for(const stage of ['url','inline','explain','verify','comments'])if(metadata.usageByStage?.[stage]&&typeof metadata.usageByStage[stage]==='object')record.byStage[stage]=usageFields(metadata.usageByStage[stage]);
    }
    if(replace||metadata.model!==undefined)record.model=safeModel(metadata.model);
    if(replace||metadata.modelByStage!==undefined) {
      record.models=[];
      for(const stage of ['url','inline','explain','verify','comments']){const model=safeModel(metadata.modelByStage?.[stage]);if(model&&!record.models.includes(model))record.models.push(model);}
    }
    if(typeof metadata.usageComplete==='boolean')record.complete=metadata.usageComplete;
    else if(replace)record.complete=undefined;
    entry[key]=record;
  }
  function refreshUsage(entry) {
    const label=entry.ui?.tokenUsage;if(!label)return;
    const records=[['analysis',entry.analysisUsage,entry.status],['comments',entry.commentUsage,entry.commentStatus]].filter(([,record])=>record);
    const formatter=new Intl.NumberFormat(uiLanguage),countText=count=>formatter.format(count);
    const lines=[t('usage.scope')];let total=0,known=false,incomplete=false,pending=false;
    for(const [task,record,state] of records) {
      const active=['queued','running','retry-wait'].includes(state);pending||=active;
      const stages=Object.values(record.byStage||{}),values=stages.length?stages:[record.usage||{}];
      const totals=values.map(usageTotal),available=totals.filter(value=>value!==null);
      const subtotal=tokenCount(available.reduce((sum,value)=>sum+value,0));
      const complete=record.complete!==false&&available.length===values.length&&subtotal!==null&&!active;
      if(available.length&&subtotal!==null){known=true;total+=subtotal;}
      incomplete||=!complete;
      lines.push(t(task==='analysis'?'usage.analysis':'usage.comments')+': '+(available.length&&subtotal!==null?t(complete?'usage.total':'usage.known',{count:countText(subtotal)}):t(active?'usage.pending':'usage.unavailable')));
      const models=[...new Set([record.model,...record.models||[]].filter(Boolean))];
      if(models.length)lines.push(t('usage.model',{model:models.join(', ')}));
      else {lines.push(t('usage.unknownModel'));if(record.requestedModel)lines.push(t('usage.requested',{model:record.requestedModel}));}
      for(const [field,key] of [['input_tokens','usage.input'],['output_tokens','usage.output']]) {
        const counts=values.map(value=>tokenCount(value[field]));
        if(counts.every(value=>value!==null)){const sum=counts.reduce((a,b)=>a+b,0);if(tokenCount(sum)!==null)lines.push(t(key,{count:countText(sum)}));}
      }
      if(record.cached)lines.push(t('usage.cached'));
    }
    label.hidden=!entry.latestText&&!entry.comments.length&&!known;
    // Completed provenance belongs with the usage details rather than a
    // repeated heading. Keep progress, onboarding and incomplete/error states
    // visible even when the row also owns a reported token subtotal.
    const completedMetadata=entry.status==='done'&&['status.searched','status.unverified'].includes(entry.statusKey);
    entry.ui.status.hidden=completedMetadata&&!label.hidden;
    if(completedMetadata)lines.push(t(entry.statusKey));
    const text=known&&tokenCount(total)!==null?t(incomplete?'usage.known':'usage.total',{count:countText(total)}):t(pending?'usage.pending':'usage.unavailable');
    if(label.textContent!==text)label.textContent=text;
    if(incomplete&&known)lines.push(t('usage.partial'));
    const title=lines.join('\n'),aria=text+'\n'+title;
    if(label.title!==title)label.title=title;
    if(label.getAttribute('aria-label')!==aria)label.setAttribute('aria-label',aria);
  }
  function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;}
  function chevron(direction){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    path.setAttribute('d',direction==='left'?'M15 5l-7 7 7 7':direction==='right'?'M9 5l7 7-7 7':'M5 9l7 7 7-7');
    path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','2');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
  }
  function gear(){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),path=document.createElementNS(ns,'path');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
    const points=Array.from({length:48},(_,index)=>{const angle=(index/48)*Math.PI*2-Math.PI/2,radius=[7.2,7.2,9.2,9.2,7.2,7.2][index%6];return `${(12+Math.cos(angle)*radius).toFixed(2)} ${(12+Math.sin(angle)*radius).toFixed(2)}`;});
    path.setAttribute('d','M'+points.join('L')+'Z M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0');
    path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');svg.append(path);return svg;
  }
  function waitingIndicator(className='thinking') {
    const indicator=node('div',className),dots=node('span','dots'),label=node('span');dots.setAttribute('aria-hidden','true');
    for(let index=0;index<9;index++){const dot=node('span','dot');dot.style.setProperty('--dot',index);dots.append(dot);}
    indicator.append(dots,label);indicator.hidden=true;return {indicator,label};
  }
  function createCard(entry) {
    const card=document.createElement('grok-first-card'),shadow=card.attachShadow({mode:'open'});
    card.tabIndex=0;
    const css=node('style');css.textContent=`
      :host{all:initial;font-family:var(--gf-font,system-ui);color:var(--gf-fg,#e7e9ea);font-size:var(--gf-size,15px);line-height:var(--gf-leading,1.4);cursor:auto;color-scheme:var(--gf-scheme,dark);}
      :host([hidden]){display:none!important;}:host(:focus-visible){outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:-2px;}*{box-sizing:border-box;min-width:0;}.card{position:absolute;left:0;right:0;max-width:100%;overflow-x:hidden;overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--gf-muted,#71767b) var(--gf-bg,#000);background:var(--gf-bg,#000);padding:12px 16px;}
      button{font:inherit;color:var(--gf-accent,#1d9bf0);border:0;background:transparent;cursor:pointer;padding:2px 0}button:hover{text-decoration:underline;}button:disabled{color:var(--gf-muted,#71767b);cursor:default;text-decoration:none}button:focus-visible,a:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:2px}
      .status{color:var(--gf-muted,#71767b);font-size:12px;margin-bottom:10px;overflow-wrap:anywhere}.status[hidden]{display:none}.answer{white-space:normal;overflow-wrap:anywhere;}
      .status-settings{font:inherit;padding:0;vertical-align:baseline}
      .answer p{margin:0 0 12px}.answer h1,.answer h2,.answer h3,.answer h4,.answer h5,.answer h6{font-size:1em;font-weight:700;line-height:1.4;margin:16px 0 8px}.answer h1{font-size:1.15em}.answer h2{font-size:1.08em}.answer>:first-child{margin-top:0}.answer>:last-child{margin-bottom:0}
      .answer ul,.answer ol{margin:8px 0 12px;padding-inline-start:24px}.answer li{margin:4px 0}.answer li>p{margin:4px 0}.answer li>ul,.answer li>ol{margin:4px 0}.answer blockquote{margin:12px 0;padding-inline-start:12px;border-inline-start:2px solid var(--gf-border,#2f3336);color:var(--gf-muted,#71767b)}.answer blockquote>:last-child{margin-bottom:0}
      .answer code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.9em;white-space:pre-wrap;overflow-wrap:anywhere;background:rgba(127,127,127,.13);padding:1px 4px}.answer pre{max-width:100%;margin:12px 0;padding:10px;border:1px solid var(--gf-border,#2f3336);white-space:pre-wrap;overflow-wrap:anywhere}.answer pre code{display:block;font-size:.85em;background:transparent;padding:0;white-space:pre-wrap;overflow-wrap:anywhere}.answer hr{border:0;border-top:1px solid var(--gf-border,#2f3336);margin:16px 0}
      .answer .analysis-section>:first-child{margin-top:0}.answer .analysis-section>:last-child{margin-bottom:0}.answer .analysis-divider{margin:16px 0}.answer .analysis-divider[hidden],.answer .verification-answer[hidden]{display:none}
      .answer table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse;font-size:.9em;margin:12px 0}.answer th,.answer td{border:1px solid var(--gf-border,#2f3336);padding:6px;text-align:start;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.answer th{font-weight:700}.answer .md-align-left{text-align:left}.answer .md-align-center{text-align:center}.answer .md-align-right{text-align:right}.answer .markdown-literal{white-space:pre-wrap}
      a{color:var(--gf-accent,#1d9bf0);text-decoration:none;overflow-wrap:anywhere;word-break:break-word;}a:hover{text-decoration:underline}.sources{font-size:13px;display:grid;grid-template-columns:minmax(0,1fr);gap:4px;margin-top:12px}.sources:empty{display:none}.note{color:var(--gf-muted,#71767b);font-size:12px;margin-top:12px;overflow-wrap:anywhere;}.note:empty{display:none}
      .actions{display:none;flex-wrap:wrap;gap:12px;margin-top:12px;font-size:13px}.actions:has(button:not([hidden])){display:flex}.actions button[hidden]{display:none}
      .retry-status{color:var(--gf-muted,#71767b);font-size:12px;overflow-wrap:anywhere;margin-top:10px}.retry-status[hidden]{display:none}
      .thinking{display:flex;align-items:center;gap:10px;color:var(--gf-muted,#71767b);font-size:13px;margin:12px 0}.thinking[hidden]{display:none}.dots{display:grid;grid-template-columns:repeat(3,3px);gap:3px;flex:none}.dot{width:3px;height:3px;background:currentColor;border-radius:50%;animation:gf-dot 1.2s ease-in-out infinite;animation-delay:calc(var(--dot)*.09s)}
      .shimmer{background-image:linear-gradient(to right,#64696d 0%,#b6b9bc 20%,#595d62 40%,#64696d 100%);background-size:9em 100%;background-clip:text;-webkit-background-clip:text;color:transparent;animation:gf-shimmer .7s linear infinite}
      @keyframes gf-shimmer{0%{background-position-x:-2em}100%{background-position-x:7em}}@keyframes gf-dot{0%,100%{opacity:.28}50%{opacity:1}}
      .comments{display:grid;gap:0;margin-top:12px;border-top:1px solid var(--gf-border,#2f3336)}.comments[hidden],.comment-status[hidden]{display:none}.comments .comment-copy{display:block;width:100%;padding:10px 0;text-align:start;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--gf-fg,#e7e9ea);font-size:14px;border-bottom:1px solid var(--gf-border,#2f3336)}.comments .comment-copy:hover{background:rgba(127,127,127,.1);text-decoration:none}.comment-heading{font-size:13px;font-weight:700;margin-top:16px}.comment-hint{font-size:12px;color:var(--gf-muted,#71767b);margin-top:4px}.comment-heading[hidden],.comment-hint[hidden]{display:none}.comment-status,.copy-status{font-size:12px;color:var(--gf-muted,#71767b);overflow-wrap:anywhere;margin-top:10px}.copy-status:empty{display:none}
      @media(prefers-reduced-motion:reduce){.dot{animation:none;opacity:.7}.shimmer{animation:none;background:none;color:var(--gf-muted,#71767b)}}
      .diagnostics{font-size:12px;color:var(--gf-muted,#71767b);margin-top:12px}.diagnostics[hidden]{display:none}.diagnostics summary{cursor:pointer}.diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}
      .token-usage{display:block;color:var(--gf-muted,#71767b);font-size:12px;margin-bottom:10px;overflow-wrap:anywhere;cursor:help}.token-usage[hidden]{display:none}.token-usage:focus-visible{outline:2px solid var(--gf-accent,#1d9bf0);outline-offset:2px}
    `;
    css.textContent += `
      .card{padding:22px 22px 32px;background:var(--gf-bg,#f2eedf);scrollbar-color:#938977 var(--gf-bg,#f2eedf);}
      .post-context{padding:16px;border:2px solid var(--gf-fg,#181811);box-shadow:4px 4px 0 var(--gf-fg,#181811);background:var(--sl-surface,#f8f5e9);margin-bottom:22px;}
      .post-context a{font:600 13px/1.6 var(--gf-font);letter-spacing:.5px;}.post-context p{font-size:14px;line-height:1.7;color:var(--sl-secondary,#565044);margin:8px 0 0;white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;}
      .eyebrow{font:10px/1.5 monospace;letter-spacing:2px;color:var(--gf-accent,#cf1f2b);margin-bottom:10px;}
      .cache-meta{font:400 12px/1.6 var(--gf-font);color:var(--gf-muted,#6a655a);margin:0 0 14px;}.cache-meta[hidden]{display:none;}
      .answer{font-size:14px;line-height:1.85;font-weight:400;letter-spacing:0;}
      .answer strong{font-weight:600;}.answer .md-body-emphasis>strong{font-weight:400;}
      .answer h1,.answer h2,.answer h3,.answer h4,.answer h5,.answer h6{font-size:16px;line-height:1.55;font-weight:600;color:var(--gf-fg,#181811);letter-spacing:0;}
      .answer h1{font-size:18px;}.answer h2{padding-bottom:7px;border-bottom:2px solid var(--gf-fg,#181811);}
      .answer h3{display:table;max-width:100%;padding:5px 9px;background:var(--sl-ink,#181811);color:#fff9ed;font-size:14px;}
      .answer h3 a{color:inherit;}.answer blockquote{padding:12px 14px;border-left:3px solid var(--gf-accent,#bc1723);background:var(--sl-soft,#eae4d4);color:var(--sl-secondary,#565044);}
      .answer blockquote p:last-child{margin-bottom:0;}.answer hr{border-top:1px solid var(--gf-muted,#a79e89);margin:20px 0;}
      .answer table{font-size:13px;line-height:1.75;border:2px solid var(--gf-fg,#181811);}
      .answer th{background:var(--sl-ink,#181811);color:#fff9ed;font-weight:600;}.answer th a{color:inherit;}
      .answer th,.answer td{padding:9px 8px;border-color:var(--gf-muted,#a79e89);}.answer tbody tr:nth-child(even){background:var(--sl-soft,#eae4d4);}
      .actions{gap:8px;margin-top:24px;padding-top:18px;border-top:1px solid var(--gf-border,#27251e);}
      .actions button{padding:9px 12px;border:2px solid var(--gf-fg,#181811);background:var(--sl-surface,#f8f5e9);color:var(--gf-accent,#cf1f2b);border-radius:0;font:700 12px/1.5 var(--gf-font);}
      .actions .retry{background:var(--gf-accent,#cf1f2b);color:var(--sl-button,#fff9ed);border-color:var(--gf-fg,#181811);box-shadow:3px 3px 0 var(--gf-fg,#181811);}.actions button:hover{filter:brightness(1.12);text-decoration:none;}.actions button:disabled{opacity:.45;}
      .sources a{padding:8px 10px;border:1px solid var(--gf-border,#27251e);background:var(--sl-surface,#f8f5e9);font-size:12px;}
      .status,.note,.token-usage,.comment-hint{color:var(--gf-muted,#6a655a);}.token-usage{font:400 12px/1.6 var(--gf-font);}
      .shimmer{background-image:linear-gradient(90deg,#81796b,var(--gf-accent,#cf1f2b),#81796b);}.comment-copy:hover{background:var(--sl-soft,#eee5d2)!important;}
      .followup{margin-top:24px;padding-top:18px;border-top:2px solid var(--gf-border);}.followup[hidden]{display:none;}
      .followup-heading{margin:0 0 12px;font-size:15px;line-height:1.5;font-weight:600;color:var(--gf-fg);}
      .followup-form{display:grid;gap:8px;}.followup-input{width:100%;box-sizing:border-box;resize:vertical;min-height:76px;max-height:240px;padding:10px 12px;border:1px solid var(--gf-border);border-radius:0;background:var(--sl-surface);color:var(--gf-fg);font:400 14px/1.85 var(--gf-font);}
      .followup-input::placeholder{color:var(--gf-muted);}.followup-input:focus-visible{outline:2px solid var(--gf-accent);outline-offset:2px;}
      .followup-submit{justify-self:end;padding:8px 14px;border:2px solid var(--gf-border);background:var(--gf-accent);color:var(--sl-button,#fff9ed);font:600 13px/1.5 var(--gf-font);box-shadow:2px 2px 0 var(--sl-ink);}
      .followup-submit:hover{text-decoration:none;filter:brightness(1.08);}.followup-submit:disabled{opacity:.5;cursor:default;}
      .followup-status,.followup-usage{margin:9px 0;color:var(--gf-muted);font:400 12px/1.65 var(--gf-font);}.followup-status:empty{display:none;}
      .followup-suggestions{display:grid;gap:8px;margin-top:12px;}.followup-suggestion{display:block;width:100%;padding:10px 12px;text-align:start;border:1px solid var(--gf-border);background:var(--sl-surface);color:var(--gf-fg);font:400 13px/1.7 var(--gf-font);overflow-wrap:anywhere;}
      .followup-suggestion:hover{border-color:var(--gf-accent);background:var(--sl-soft);text-decoration:none;}.followup-suggestions-retry{font-size:12px;}
      .followup-turn{margin:0 0 14px;overflow-wrap:anywhere;}.followup-user{padding:10px 12px;border-left:3px solid var(--gf-accent);background:var(--sl-soft);white-space:pre-wrap;}.followup-assistant{padding-bottom:12px;border-bottom:1px solid var(--gf-border);}
      .reply-draft{margin-top:22px;padding-top:18px;border-top:1px solid var(--gf-border);}.reply-draft[hidden]{display:none;}.reply-heading{font:600 15px/1.5 var(--gf-font);margin:0 0 8px;color:var(--gf-fg);}
      .reply-hint,.reply-status{color:var(--gf-muted);font:400 12px/1.65 var(--gf-font);margin:0 0 12px;}.reply-status{margin-top:12px;}.reply-status:empty{display:none;}
      .reply-controls{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px;}.reply-field{display:grid;gap:5px;min-width:0;font:400 12px/1.5 var(--gf-font);color:var(--gf-muted);}.reply-field select{width:100%;min-width:0;box-sizing:border-box;padding:8px 5px;border:1px solid var(--gf-border);border-radius:0;background:var(--sl-surface);color:var(--gf-fg);font:400 12px/1.5 var(--gf-font);color-scheme:var(--gf-scheme);}
      .reply-generate,.reply-copy{padding:8px 12px;border:1px solid var(--gf-border);background:var(--sl-surface);color:var(--gf-accent);font:600 13px/1.5 var(--gf-font);}.reply-generate:hover,.reply-copy:hover{background:var(--sl-soft);text-decoration:none;}.reply-generate:disabled,.reply-copy:disabled{opacity:.45;cursor:default;}
      .reply-output{width:100%;box-sizing:border-box;min-height:200px;max-height:520px;padding:12px;border:1px solid var(--gf-border);border-radius:0;resize:vertical;background:var(--sl-surface);color:var(--gf-fg);font:400 14px/1.85 var(--gf-font);}.reply-output[hidden]{display:none;}.reply-field select:focus-visible,.reply-output:focus-visible{outline:2px solid var(--gf-accent);outline-offset:2px;}
      .reply-actions{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;}.reply-count{font:400 12px/1.6 var(--gf-font);color:var(--gf-muted);}.reply-count[hidden],.reply-copy[hidden]{display:none;}
    `;
    const box=node('section','card');box.setAttribute('aria-label',t('aria.result'));
    const status=node('div','status'),answer=node('div','answer'),sources=node('div','sources'),note=node('div','note'),actions=node('div','actions');status.setAttribute('role','status');
    answer.setAttribute('dir','auto');
    const explanationAnswer=node('div','analysis-section explanation-answer'),verificationAnswer=node('div','analysis-section verification-answer'),analysisDivider=node('hr','analysis-divider');analysisDivider.hidden=true;
    const {indicator:thinking,label:thinkingLabel}=waitingIndicator();
    const {indicator:verificationThinking,label:verificationThinkingLabel}=waitingIndicator('thinking verification-thinking');
    verificationThinkingLabel.classList.add('shimmer');
    const diagnostics=node('details','diagnostics'),diagnosticText=node('pre'),diagnosticLabel=node('summary','',t('common.diagnostics'));diagnostics.hidden=true;diagnostics.append(diagnosticLabel,diagnosticText);
    const retry=node('button','retry',t('common.retry'));retry.hidden=true;retry.addEventListener('click',event=>{if(event.isTrusted===false)return;if(retry.disabled||[...requests.values()].some(r=>r.entry===entry&&r.task==='analysis'))return;for(const pending of allEntries())if(pending.status==='new')refreshCard(pending);submit(entry,entry.status!=='new');});
    const comments=node('div','comments'),commentStatus=node('div','comment-status'),copyStatus=node('div','copy-status');commentStatus.hidden=true;comments.hidden=true;commentStatus.setAttribute('role','status');copyStatus.setAttribute('role','status');
    const commentHeading=node('div','comment-heading'),commentHint=node('div','comment-hint');commentHeading.hidden=commentHint.hidden=true;
    const retryStatus=node('div','retry-status analysis-retry-status'),commentRetryStatus=node('div','retry-status comment-retry-status');
    for(const label of [retryStatus,commentRetryStatus]){label.hidden=true;label.setAttribute('role','status');label.setAttribute('aria-live','polite');}
    const tokenUsage=node('span','token-usage');tokenUsage.hidden=true;tokenUsage.tabIndex=0;
    const context=node('div','post-context'),original=node('a'),postText=node('p'),eyebrow=node('div','eyebrow','POST / FACT CHECK');
    original.target='_blank';original.rel='noopener noreferrer';context.append(original,postText);
    const cacheMeta=node('p','cache-meta');cacheMeta.hidden=true;
    if(followups)entry.followup=followups.attach(entry);
    actions.append(retry);box.append(eyebrow,context,cacheMeta,tokenUsage,status,thinking,answer,verificationThinking,sources,note,diagnostics,retryStatus,actions,commentStatus,commentRetryStatus,commentHeading,commentHint,comments,copyStatus);if(entry.followup){box.insertBefore(entry.followup.section,actions);box.insertBefore(entry.followup.reply.section,commentStatus);}shadow.append(css,box);
    // Card controls belong to the overlay, separate from X's navigation handlers.
    for(const type of ['click','pointerdown','keydown'])card.addEventListener(type,event=>event.stopPropagation());
    card.addEventListener('scroll',scheduleLayout,{passive:true});
    return {card,ui:{box,original,postText,cacheMeta,status,thinking,thinkingLabel,verificationThinking,verificationThinkingLabel,answer,explanationAnswer,verificationAnswer,analysisDivider,sources,note,retry,retryStatus,commentRetryStatus,comments,commentStatus,commentHeading,commentHint,copyStatus,diagnostics,diagnosticLabel,diagnosticText,tokenUsage}};
  }
  function validVerificationBoundary(text,start) {
    return typeof text==='string'&&Number.isSafeInteger(start)&&start>2&&start<=text.length&&text.slice(start-2,start)==='\n\n'&&Boolean(text.slice(0,start-2).trim());
  }
  function renderAnswerContent(entry) {
    const text=entry.latestText,ui=entry.ui;
    const verifying=['queued','running','retry-wait'].includes(entry.status)&&['verification_queued','verify','verification'].includes(entry.phase);
    let start=validVerificationBoundary(text,entry.verificationStart)?entry.verificationStart:undefined;
    // The live stage snapshot also supports an older background worker during
    // reload. Cached text without metadata is never split by guessed headings.
    const base=entry.verificationBase;
    if(start===undefined&&base?.trim()&&text.startsWith(base+'\n\n'))start=base.length+2;
    const pending=start===undefined&&verifying&&base?.trim()&&text===base;
    const explanation=start===undefined?text:text.slice(0,start-2),check=start===undefined?'':text.slice(start);
    if(explanation.trim()&&(pending||(start!==undefined&&(check.trim()||verifying)))) {
      if(!entry.answerSplit)ui.answer.replaceChildren(ui.explanationAnswer,ui.analysisDivider,ui.verificationAnswer);
      entry.answerSplit=true;
      // Once explanation is complete, retain its DOM while verification streams.
      if(entry.explanationRendered!==explanation){renderText(ui.explanationAnswer,explanation);entry.explanationRendered=explanation;}
      if(entry.verificationRendered!==check){renderText(ui.verificationAnswer,check);entry.verificationRendered=check;}
      ui.verificationAnswer.hidden=!check.trim();
    } else {
      entry.answerSplit=false;entry.explanationRendered=entry.verificationRendered=undefined;
      renderText(ui.answer,text);
    }
    syncLoading(entry);
  }
  function renderAnswer(entry,text,immediate=false) {
    entry.latestText=typeof text==='string'?text:'';
    if(!entry.latestText){entry.verificationStart=undefined;entry.verificationBase='';}
    syncLoading(entry);
    if(immediate){if(entry.answerFrame!==undefined)cancelAnimationFrame(entry.answerFrame);entry.answerFrame=undefined;renderAnswerContent(entry);renderSources(entry);return;}
    if(entry.answerFrame!==undefined)return;
    entry.answerFrame=requestAnimationFrame(()=>{entry.answerFrame=undefined;if(!entry.card.isConnected)return;renderAnswerContent(entry);renderSources(entry);scheduleLayout();});
  }
  function renderText(target,text) {
    GrokFirstMarkdown.render(target,text);
  }
  function sourceUrl(value) {
    try {const url=new URL(value);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url:null;}catch{return null;}
  }
  function sourceLabel(source,url) {
    const title=typeof source.title==='string'?source.title.trim():'';
    const numbered=/^[\s\[\](){}【】#.*]*\d+[\s\[\](){}【】#.*]*$/.test(title);
    if(title&&!numbered&&!sourceUrl(title))return title.slice(0,200);
    // Never invent a publication title or fetch a page just to label a link.
    let path=url.pathname==='/'?'':url.pathname;
    try {path=decodeURIComponent(path);}catch{}
    return (url.hostname+path+url.search+url.hash).slice(0,200);
  }
  function renderSources(entry,sources) {
    if(sources!==undefined)entry.sourceList=Array.isArray(sources)?sources:[];
    const target=entry.ui.sources;target.replaceChildren();
    const seen=new Set(Array.from(entry.ui.answer.querySelectorAll('a')).map(link=>sourceUrl(link.href)?.href).filter(Boolean));
    let count=0;
    for(const source of entry.sourceList||[]) {
      const url=sourceUrl(source?.url);if(!url||seen.has(url.href))continue;
      seen.add(url.href);
      const link=node('a','',sourceLabel(source,url));link.href=url.href;link.title=url.href;link.target='_blank';link.rel='noopener noreferrer';target.append(link);
      if(++count===12)break;
    }
  }
})();
