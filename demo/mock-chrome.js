/* Preview only. The production manifest never loads this file or makes these simulated requests. */
(()=>{
  const query=new URLSearchParams(location.search);
  if(query.get('lang'))document.documentElement.lang=GrokFirstUI.normalizeLanguage(query.get('lang'));
  const keyState=query.get('security')==='migration'?'migration':query.get('security')==='missing'?'missing':'ready';
  const provider=['api','build','oauth'].includes(query.get('provider'))?query.get('provider'):XGrokCore.DEFAULT_SETTINGS.provider;
  const config={settings:XGrokCore.normalizeSettings({provider,apiVerification:'only',language:query.get('formatting')==='1'?'zh-CN':'auto',interfaceLanguage:query.get('interface')||'auto'}),ready:provider==='build'?query.get('permission')!=='denied'&&query.get('build')==='ready':keyState==='ready',keyState,buildStatus:provider==='build'?{installed:query.get('build')!=='missing',permission:query.get('permission')==='denied'?'denied':'granted',...(query.get('permission')==='denied'?{errorCode:'BUILD_PERMISSION_REQUIRED'}:{}),available:query.get('build')==='ready',authenticated:query.get('build')==='ready'?true:undefined}:undefined,used:0,collapsed:false};
  function readDemoCache(){try{return JSON.parse(localStorage.getItem('sidelens-demo-cache')||'[]').filter(([,value])=>Date.now()-value.completedAt<86400000);}catch{return [];}}
  function cachePreview(key,result){analysisCache.set(key,result);try{localStorage.setItem('sidelens-demo-cache',JSON.stringify([...analysisCache].slice(-160)));}catch{}}
  const listeners=[],pending=new Map(),analysisCache=new Map(readDemoCache());let calls=0,commentCalls=0,cancelled=0,verificationPreview=false,citationsPreview=false,urlBoundaryPreview=false,markdownPreview=query.get('formatting')==='1',verificationFailurePreview='';
  const simulatedVerificationFailures={
    OUTPUT_LIMIT:{code:'OUTPUT_LIMIT',stage:'verify',errorCode:'API_INCOMPLETE',reason:'max_output_tokens'},
    CONNECTION:{code:'CONNECTION',stage:'verify',errorCode:'API_STREAM_INTERRUPTED'},
    LANGUAGE_MISMATCH:{code:'LANGUAGE_MISMATCH',stage:'verify',errorCode:'API_LANGUAGE_MISMATCH'}
  };
  const emit=message=>listeners.forEach(fn=>fn(message));
  const log=()=>{document.getElementById('log').textContent=`模拟分析 ${calls} 次 · 评论 ${commentCalls} 次 · 取消 ${cancelled} 次 · ${provider==='oauth'?'The X Subscription':provider==='build'?'Grok Build':'Grok API Key'} · 未连接真实提供方`;};
  const configure=()=>emit({type:'CONFIG',...config});
  if(provider==='oauth'){config.oauthStatus={state:query.get('oauth')==='ready'?'connected':'disconnected',connected:query.get('oauth')==='ready',modelAvailable:query.get('oauth')==='ready'};config.ready=config.oauthStatus.connected;}
  function openPreviewSettings(focus) {
    const destination=new URL('/demo/options.html',location.origin);destination.searchParams.set('lang',document.documentElement.lang);
    destination.searchParams.set('provider',provider);destination.searchParams.set('focus',provider==='oauth'?'oauth':focus==='build'||provider==='build'?'build':'api-key');
    if(keyState==='migration')destination.searchParams.set('security','migration');
    location.assign(destination.href);
  }
  function finish(entry){pending.delete(entry.requestId);}
  function cancel(id){const entry=pending.get(id);if(!entry)return;entry.timers.forEach(clearTimeout);pending.delete(id);cancelled++;log();}
  function cancelAll(){[...pending.keys()].forEach(cancel);}
  const drafts={
    'zh-CN':['完整上下文或许能帮助我们理解这条观点。','我想先看看这条主张的原始来源。','这里最值得讨论的是哪一个假设？'],
    'zh-TW':['完整脈絡或許能幫助我們理解這個觀點。','我想先看看這項主張的原始來源。','這裡最值得討論的是哪個假設？'],
    en:['The full context could help clarify this point.','I would like to see the original source first.','Which assumption matters most here?'],
    ja:['全体の文脈を確認すると理解が深まりそうです。','まずは元の情報源を見てみたいです。','ここで最も重要な前提は何でしょうか？'],
    ko:['전체 맥락을 보면 더 잘 이해할 수 있을 것 같습니다.','먼저 원래 출처를 보고 싶습니다.','여기서 가장 중요한 가정은 무엇일까요?'],
    es:['El contexto completo podría aclarar esta idea.','Me gustaría consultar primero la fuente original.','¿Qué supuesto resulta más importante aquí?'],
    fr:['Le contexte complet pourrait éclairer cette idée.','Je voudrais consulter la source originale.','Quelle hypothèse compte le plus ici ?'],
    de:['Der vollständige Kontext könnte diesen Punkt klären.','Ich würde gern zuerst die ursprüngliche Quelle sehen.','Welche Annahme ist hier am wichtigsten?'],
    pt:['O contexto completo pode esclarecer essa ideia.','Gostaria de consultar primeiro a fonte original.','Qual hipótese é mais importante aqui?'],
    ar:['قد يساعد السياق الكامل على توضيح هذه الفكرة.','أود الاطلاع على المصدر الأصلي أولاً.','ما الافتراض الأهم هنا؟'],
    ru:['Полный контекст мог бы прояснить эту мысль.','Хотелось бы сначала увидеть первоисточник.','Какое предположение здесь важнее всего?'],
    hi:['पूरा संदर्भ इस विचार को समझने में मदद कर सकता है।','मैं पहले मूल स्रोत देखना चाहूँगा।','यहाँ सबसे महत्वपूर्ण धारणा कौन सी है?']
  };
  function begin(entry){
    const {requestId,message,comments,language,provider,verificationFailureDemo}=entry;
    if(comments){
      entry.timers.push(setTimeout(()=>{entry.started=true;emit({type:'COMMENT_START',requestId});},80));
      entry.timers.push(setTimeout(()=>{emit({type:'COMMENT_RESULT',requestId,comments:[...(drafts[GrokFirstUI.normalizeLanguage(language)]||drafts.en)],cached:false,usage:{input_tokens:180,output_tokens:90,total_tokens:270},model:entry.apiModel,usageComplete:true});finish(entry);},850));
      return;
    }
    const sample={
      'zh-CN':'**证据不足。** 图表未注明数据来源、样本与评测条件，不能据此判断结论是否适用于其他任务。\n\n需要原始报告、可复现方法和独立测试结果。\n\n*本地模拟核查，未联网检索或调用 Grok。*',
      en:'**Insufficient evidence.** The chart omits its data source, sample and evaluation conditions, so the finding cannot be generalized to other tasks.\n\nThe original report, reproducible methods and independent test results are needed.\n\n*Simulated Fact Check; no search or Grok request was made.*',
      ja:'**証拠が不十分です。** 図表にはデータの出典、標本、評価条件がなく、他の課題にも結論が当てはまるとは判断できません。\n\n元の報告、再現可能な方法、独立した試験結果が必要です。\n\n*ローカルの表示例です。検索や Grok へのリクエストは行っていません。*'
    };
    const citationUrls=['https://developer.chrome.com/docs/extensions','https://developer.chrome.com/docs/extensions/develop','https://developer.chrome.com/docs/extensions/mv3','https://developer.chrome.com/docs/extensions/reference','https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts'];
    const sources=urlBoundaryPreview?[{url:'https://t.co/dZ1jiqrxX',title:'1'}]:citationsPreview?[...citationUrls.map((url,index)=>({url,title:String(index+1)})),{url:'https://developer.chrome.com/docs/extensions/reference/api/runtime',title:'6'}]:markdownPreview?[{url:'https://developer.chrome.com/docs/extensions',title:language==='zh-CN'?'Chrome 官方扩展文档':'Chrome extensions documentation'}]:[];
    const citationNames=['扩展概览','开发文档','Manifest V3','API 参考','内容脚本'];
    const citationText='**引用呈现示例。** 正文已提供的出处不再重复列出编号：\n\n'+citationUrls.map((url,index)=>'['+citationNames[index]+']('+url+')').join('\n')+'\n\n额外来源保留页面名称。*本地模拟，未调用 Grok。*';
    const boundaryText='**证据不足。** 附带的链接（https://t.co/dZ1jiqrxX），无法在本地演示中核实，其后的正文保持普通文字。\n\n*只有网址可点击；未联网检索或调用 Grok。*';
    const markdownText="## 先看结论\n\n**需要区分功能介绍与实际验证。** 下方仅演示排版：标题、重点、引用和表格按内容选择使用，不强制每条分析都套同一个模板。\n\n### 功能对比\n\n| 项目 | 适合的任务 | 需要确认 |\n| --- | --- | --- |\n| 工具 A | 整理资料 | 来源与时间 |\n| 工具 B | 处理文档 | 权限与费用 |\n\n> 引用区用于放置需要辨别的原话或关键证据，不把作者的说法直接当作已核实结论。\n\n### 使用前检查\n\n- **先看官方说明**，确认当前版本。\n- 区分免费试用、订阅额度与按量计费。\n- 缺少依据的内容保留不确定性。\n\n---\n\n**这是一段被模型整段加粗的较长文本示例。为了避免正文满屏黑重、影响连续阅读，它仍然按常规字重展示，短句重点与真正的标题则保留加粗。**\n\n查看 [Chrome 官方扩展说明](https://developer.chrome.com/docs/extensions)。本页为本地模拟排版，未调用 Grok。";
    const text=markdownPreview?markdownText:urlBoundaryPreview?boundaryText:citationsPreview?citationText:message.post.id==='10004'?'Render test: <img src=x onerror=alert(1)>\nThis is literal text and cannot execute.':sample[language]||sample.en;
    const usage=message.post.id==='10001'?{input_tokens:850,output_tokens:384,total_tokens:1234}:{input_tokens:125,output_tokens:48,total_tokens:173};
    const resultFor=output=>({completedAt:Date.now(),text:output,sources,provider,apiVerification:'only',searched:false,verified:false,verificationStatus:'unverified',warning:'Local preview only; no sources were searched.',usage,usageByStage:{verify:{...usage}},model:entry.apiModel,usageComplete:true});
    if(verificationFailureDemo) {
      const partial=text.split('\n\n')[0];
      entry.timers.push(
        setTimeout(()=>{entry.started=true;emit({type:'START',requestId,used:config.used});},80),
        setTimeout(()=>emit({type:'UPDATE',requestId,text:'',phase:'verify',apiVerification:'only'}),180),
        setTimeout(()=>emit({type:'UPDATE',requestId,text:partial,phase:'verify',apiVerification:'only'}),650),
        setTimeout(()=>{
          const result={...resultFor(partial),verificationStatus:'incomplete',verificationFailure:{...simulatedVerificationFailures[verificationFailureDemo]},warning:'Local preview only: Fact Check was interrupted; available partial findings are retained.',usageComplete:verificationFailureDemo!=='CONNECTION'};
          if(entry.cacheKey)cachePreview(entry.cacheKey,result);
          emit({type:'RESULT',requestId,result,cached:false});finish(entry);
        },1300)
      );return;
    }
    if(verificationPreview) {
      entry.verificationDemoStage=1;entry.checkText=text;entry.demoResult=resultFor;
      entry.timers.push(
        setTimeout(()=>{entry.started=true;emit({type:'START',requestId,used:config.used});},80),
        setTimeout(()=>emit({type:'UPDATE',requestId,text:'',phase:'verify',apiVerification:'only'}),180)
      );return;
    }
    entry.timers.push(
      setTimeout(()=>{entry.started=true;emit({type:'START',requestId,used:config.used});},80),
      setTimeout(()=>emit({type:'UPDATE',requestId,text:'',phase:'verify',apiVerification:'only'}),180),
      setTimeout(()=>emit({type:'UPDATE',requestId,text:text.slice(0,70),phase:'verify',apiVerification:'only',...(citationsPreview||urlBoundaryPreview||markdownPreview?{sources}:{})}),380),
      setTimeout(()=>emit({type:'UPDATE',requestId,text,phase:'verify',apiVerification:'only'}),900),
      setTimeout(()=>{const result=resultFor(text);if(entry.cacheKey)cachePreview(entry.cacheKey,result);emit({type:'RESULT',requestId,result,cached:false});finish(entry);},1300)
    );
  }
  window.chrome={runtime:{
    id:'superx-demo',getManifest:()=>({version:'0.9.5-demo'}),getURL:asset=>`/extension/${asset}`,
    async sendMessage(message){if(message.type==='GET_UI_LANGUAGE')return{ok:true,language:document.documentElement.lang};if(message.type==='OPEN_SETTINGS'){if(query.get('connection')==='expired')throw new Error('Extension context invalidated');openPreviewSettings(message.focus);}if(message.type==='OPEN_HISTORY')location.assign(`/demo/history.html?lang=${encodeURIComponent(document.documentElement.lang)}`);return{ok:true};},
    connect:()=>{
      setTimeout(configure,20);
      return {onMessage:{addListener:fn=>listeners.push(fn)},onDisconnect:{addListener:()=>{}},disconnect:()=>{},postMessage:message=>{
        if(query.get('connection')==='expired'&&message.type==='GENERATE_COMMENTS')throw new Error('Extension context invalidated');
        if(message.type==='PING'){emit({type:'PONG'});return;}
        if(message.type==='HISTORY_VISIT'){emit({type:'HISTORY_ACK',batchId:message.batchId,ok:true,epoch:message.historyEpoch});return;}
        if(message.type==='CANCEL'){cancel(message.requestId);return;}
        if(message.type==='CANCEL_IF_QUEUED'){
          if(pending.get(message.requestId)?.started)return;
          cancel(message.requestId);emit({type:'ERROR',requestId:message.requestId,code:'CANCELLED',error:'未开始的分析已暂停。'});return;
        }
        if(message.type==='CANCEL_ALL'){cancelAll();return;}
        if(message.type==='OPEN_SETTINGS'){
          openPreviewSettings(message.focus);return;
        }
        if(message.type==='SET_APPEARANCE'){localStorage.setItem('sidelens-appearance',message.theme);return;}
        if(message.type==='SET_ENABLED'){config.settings.enabled=message.enabled;configure();return;}
        if(message.type==='SET_LANGUAGE'){config.settings.language=message.language;configure();return;}
        if(message.type==='SET_RAIL_COLLAPSED'){
          config.collapsed=Boolean(message.collapsed);
          if(config.collapsed)for(const [id,entry] of pending)if(!entry.started){cancel(id);emit({type:entry.comments?'COMMENT_ERROR':'ERROR',requestId:id,code:'RAIL_COLLAPSED',error:'右栏已收起'});}
          emit({type:'RAIL_VISIBILITY',collapsed:config.collapsed});return;
        }
        if(message.type==='FOLLOW_UP'){
          if(config.collapsed)return;
          (window.sidelensFollowupCalls||=[]).push(structuredClone(message));
          const entry={requestId:message.requestId,timers:[],started:false};pending.set(entry.requestId,entry);
          emit({type:'QUEUED',requestId:entry.requestId});
          const suggestions=['这条结论最需要补充哪一项原始证据？','这些信息在哪些情况下可能不再适用？','能把已证实和仍待验证的内容整理成对比表吗？'];
          const answer='### 进一步核查\n\n**先核对来源和适用条件。** 这段回答演示连续追问，保留原帖、初次分析及此前对话。\n\n| 维度 | 下一步核对 |\n| --- | --- |\n| 证据 | 原始报告与发布时间 |\n| 口径 | 样本和比较条件 |\n\n*本地模拟回答，未调用 Grok。*';
          entry.timers.push(setTimeout(()=>{entry.started=true;emit({type:'START',requestId:entry.requestId});},30));
          entry.timers.push(setTimeout(()=>{
            const draftReply='这条信息值得关注，不过判断结论还需要看原始来源、发布时间和比较条件。结合前面的分析与讨论，我更想知道哪些结论已有证据支持，哪些还只是推测。';
            const result={text:message.mode==='reply'?draftReply:message.mode==='suggestions'?JSON.stringify(suggestions):answer,...(message.mode==='suggestions'?{suggestions}:{}),sources:[],verificationStatus:'unverified',usage:{total_tokens:210},completedAt:Date.now()};
            emit({type:'RESULT',requestId:entry.requestId,result,cached:false});finish(entry);
          },300));return;
        }
        if(!['ANALYZE','GENERATE_COMMENTS'].includes(message.type)||config.collapsed)return;
        const comments=message.type==='GENERATE_COMMENTS';
        const cacheKey=!comments?JSON.stringify([XGrokCore.apiPostIdentity(message.post,config.settings),config.settings,...(verificationFailurePreview?[verificationFailurePreview]:[]),...(markdownPreview?['typography-demo-v2']:[])]):'';
        if(cacheKey&&!message.force&&analysisCache.has(cacheKey)){emit({type:'RESULT',requestId:message.requestId,result:analysisCache.get(cacheKey),cached:true});return;}
        if(comments)commentCalls++;else{calls++;config.used++;}
        log();
        const entry={requestId:message.requestId,message,comments,provider,apiModel:provider==='oauth'?config.settings.oauthModel:provider==='build'?config.settings.buildModel:config.settings.apiModel,apiVerification:config.settings.apiVerification,verificationFailureDemo:comments?'':verificationFailurePreview,language:XGrokCore.resolvePostLanguage(config.settings.language,message.post),cacheKey,timers:[],started:false};
        pending.set(entry.requestId,entry);if(!comments)emit({type:'QUEUED',requestId:entry.requestId});
        begin(entry);
      }};
    }
  }};
  document.getElementById('toggle').onclick=()=>{config.settings.enabled=!config.settings.enabled;configure();};
  document.getElementById('markdown-demo').onclick=()=>{
    cancelAll();markdownPreview=true;citationsPreview=false;verificationPreview=false;urlBoundaryPreview=false;verificationFailurePreview='';analysisCache.clear();localStorage.removeItem('sidelens-demo-cache');
    config.settings=XGrokCore.normalizeSettings({...config.settings,language:'zh-CN',explanationMode:'preset',enabled:true});configure();
    document.getElementById('message').textContent='模拟 Markdown：标题、粗体、列表、引用、代码和表格直接排版，出处不重复。不调用 Grok。';
  };
  document.getElementById('sources-demo').onclick=()=>{
    cancelAll();citationsPreview=true;verificationPreview=false;urlBoundaryPreview=false;markdownPreview=false;verificationFailurePreview='';analysisCache.clear();localStorage.removeItem('sidelens-demo-cache');
    config.settings=XGrokCore.normalizeSettings({...config.settings,language:'zh-CN',explanationMode:'preset',enabled:true});configure();
    document.getElementById('message').textContent='模拟引用：正文五个出处不重复列编号，额外来源显示网址名称。不调用 Grok。';
  };
  document.getElementById('url-boundary-demo').onclick=()=>{
    cancelAll();urlBoundaryPreview=true;citationsPreview=false;verificationPreview=false;markdownPreview=false;verificationFailurePreview='';analysisCache.clear();localStorage.removeItem('sidelens-demo-cache');
    config.settings=XGrokCore.normalizeSettings({...config.settings,language:'zh-CN',explanationMode:'preset',enabled:true});configure();
    document.getElementById('message').textContent='模拟链接边界：中文右括号和后文保持普通正文，出处不重复。不调用 Grok。';
  };
  document.getElementById('verify-wait').onclick=()=>{
    cancelAll();verificationPreview=true;citationsPreview=false;urlBoundaryPreview=false;markdownPreview=false;verificationFailurePreview='';analysisCache.clear();localStorage.removeItem('sidelens-demo-cache');config.settings=XGrokCore.normalizeSettings({...config.settings,provider:'api',explanationMode:'preset',apiVerification:'only',enabled:true});configure();
    document.getElementById('message').textContent='Fact Check 等待演示：点击「推进模拟 Fact Check」显示首字，再点击一次完成。仅模拟 UI，不调用 Grok。';
  };
  document.getElementById('verify-advance').onclick=()=>{
    for(const entry of [...pending.values()]) {
      if(!entry.verificationDemoStage)continue;
      entry.timers.forEach(clearTimeout);
      if(entry.verificationDemoStage===1){entry.verificationDemoStage=2;emit({type:'UPDATE',requestId:entry.requestId,phase:'verify',text:entry.checkText.slice(0,70),apiVerification:'only'});}
      else {emit({type:'RESULT',requestId:entry.requestId,result:entry.demoResult(entry.checkText)});finish(entry);}
    }
  };
  function restartFailurePreview(code) {
    cancelAll();verificationFailurePreview=code;verificationPreview=false;citationsPreview=false;urlBoundaryPreview=false;markdownPreview=false;analysisCache.clear();localStorage.removeItem('sidelens-demo-cache');
    // These explicit demo controls reset completed cards through the existing
    // configuration channel. No product setting or real API is involved.
    config.settings=XGrokCore.normalizeSettings({...config.settings,apiVerification:'only',explanationMode:'preset',enabled:false});configure();
    config.settings=XGrokCore.normalizeSettings({...config.settings,enabled:true});configure();
  }
  document.getElementById('verify-failure-demo').onclick=()=>{
    const code=document.getElementById('verify-failure-reason').value;
    if(!Object.hasOwn(simulatedVerificationFailures,code))return;
    restartFailurePreview(code);
    document.getElementById('message').textContent=`仅模拟 Fact Check 失败：${code}。部分核查结果保留；悬停状态可看原因，展开诊断可看详情。不调用 API。`;
  };
  document.getElementById('verify-failure-reset').onclick=()=>{
    restartFailurePreview('');
    document.getElementById('message').textContent='已恢复普通本地演示，不模拟 Fact Check 失败。不调用 API。';
  };
  document.getElementById('theme').onclick=()=>{document.body.className=document.body.className==='theme-light'?'theme-dim':document.body.className==='theme-dim'?'':'theme-light';};
  document.getElementById('locale').onclick=()=>{const language=document.documentElement.lang==='zh-CN'?'en':document.documentElement.lang==='en'?'ja':'zh-CN';document.documentElement.lang=language;emit({type:'UI_LANGUAGE',language});document.getElementById('message').textContent='仅切换 X 界面语言；生成中的回答与输出语言设置继续保留。';};
  document.getElementById('recycle').onclick=()=>{const article=document.querySelector('article'),a=article.querySelector('a[href*="/status/"]');a.href=a.getAttribute('href').endsWith('10001')?'/SuperXDemo/status/10011':'/SuperXDemo/status/10001';article.querySelector('time').setAttribute('datetime','2026-10-06T10:00:00Z');document.getElementById('message').textContent='仅更新帖子链接/时间属性，卡片应重新匹配。';};
  document.getElementById('route').onclick=()=>{history.pushState({},'',location.pathname==='/demo/index.html'?'/home':'/demo/index.html');document.querySelector('.feedtitle').textContent=location.pathname==='/home'?'为你推荐 · SPA 路由验证':'为你推荐';};
  document.getElementById('translate').onclick=()=>{
    // Use existing original/translation nodes, like X's visibility-only path.
    // The toggle itself changes only classes, not text nodes or lang attributes.
    const body=document.querySelector('article .post-text');
    const translated=body.classList.toggle('translated');
    document.getElementById('translate').classList.toggle('translated',translated);
  };
})();
