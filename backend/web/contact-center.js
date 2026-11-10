'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const i18n = window.OpsCoreI18n;
  const state = { status:null, languages:[], conversationId:null, channel:null, voicePc:null, voiceStream:null, voiceDc:null, selectedHandoff:null, selectedAssignedConversation:null, seenTranscripts:new Set() };
  const knownHandoffLabels = {
    customer_requested_human:'Customer requested a human', low_confidence:'Low confidence', high_risk:'High risk',
    policy_refusal:'Policy refusal / restriction', unresolved:'Unresolved issue', repeated_failure:'Repeated failure',
    model_requested:'AI requested review', voice_review_required:'Voice review required', other:'Other'
  };
  const actorKeys = { customer:'roles.customer', human:'roles.human', assistant:'roles.ai', ai:'roles.ai' };
  const safeActor = actor => ['customer','human','assistant'].includes(actor) ? actor : 'assistant';
  const tx = (key, params={}, fallback=key) => i18n?.t ? i18n.t(key, params, fallback) : fallback;

  function setTranslation(element, key, params={}, fallback='') {
    if (!element) return;
    element.dataset.i18nDynamicKey = key;
    element.dataset.i18nParams = JSON.stringify(params || {});
    if (typeof fallback === 'string' && fallback) element.dataset.i18nFallback = fallback;
    else delete element.dataset.i18nFallback;
    element.textContent = tx(key, params, fallback || key);
  }
  function setLiteral(element, value) {
    if (!element) return;
    delete element.dataset.i18nDynamicKey;
    delete element.dataset.i18nParams;
    delete element.dataset.i18nFallback;
    element.textContent = String(value ?? '');
  }
  function setStatusKey(key, params={}, good=false, fallback='') {
    setTranslation($('setupHint'), key, params, fallback);
    $('setupHint').style.color = good ? 'var(--green)' : 'var(--yellow)';
  }
  function setStatusLiteral(text, good=false) {
    setLiteral($('setupHint'), text);
    $('setupHint').style.color = good ? 'var(--green)' : 'var(--yellow)';
  }
  async function api(path, options={}) {
    const response = await fetch(path, { credentials:'same-origin', cache:'no-store', ...options,
      headers:{ ...(options.body ? {'content-type':'application/json'} : {}), ...(options.headers || {}) } });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('SERVER_RESPONSE_INVALID'); }
    if (!response.ok) throw new Error(payload?.error?.code || `HTTP_${response.status}`);
    return payload;
  }
  function report(error, target='setupHint') {
    const code = typeof error === 'string' ? error : (error?.message || 'REQUEST_FAILED');
    const reason = tx(`errors.${String(code).trim()}`, {}, code);
    setTranslation($(target), 'messages.actionNotCompleted', {reason}, `Action not completed: ${reason}.`);
    if (target === 'setupHint') $('setupHint').style.color = 'var(--yellow)';
  }
  function addMessage(role, text, meta='') {
    if (!text) return;
    const actor = safeActor(role);
    const wrap = document.createElement('div');
    wrap.className = `message ${actor}`;
    const roleLabel = document.createElement('span'); roleLabel.className='role';
    setTranslation(roleLabel, actorKeys[actor] || 'roles.ai', {}, actor === 'customer' ? 'Customer' : actor === 'human' ? 'Human agent' : 'AI assistant');
    const body = document.createElement('div'); body.textContent=String(text);
    wrap.append(roleLabel, body);
    if(meta){ const small=document.createElement('small');small.textContent=meta;small.style.cssText='display:block;color:#9dafc8;margin-top:5px;font-size:.65rem';wrap.appendChild(small); }
    $('chatLog').appendChild(wrap); $('chatLog').scrollTop=$('chatLog').scrollHeight;
  }
  function updateLiveControls() {
    const started = Boolean(state.conversationId);
    $('requestHuman').disabled=!started;
    $('chatInput').disabled=!started || state.channel!=='web_chat';
    $('sendMessage').disabled=!started || state.channel!=='web_chat';
    $('startChat').disabled=!$('consent').checked || !state.status?.enabled || !state.status?.encryptionConfigured;
    $('startVoice').disabled=!$('consent').checked || !state.status?.realtimeBrowserVoiceConfigured;
    $('stopVoice').disabled=!state.voicePc;
  }
  async function loadStatus() {
    try {
      if (i18n?.ready) await i18n.ready;
      const [status, languageData] = await Promise.all([
        api('/api/v1/contact-center/status'), api('/api/v1/contact-center/languages')
      ]);
      state.status=status; state.languages=Array.isArray(languageData.languages) ? languageData.languages : [];
      $('languageRows').textContent=String(languageData.sourceRows ?? state.languages.length);
      $('uniqueLanguages').textContent=String(languageData.uniqueLanguageCodes ?? new Set(state.languages.map(x=>x.code)).size);
      $('qualifiedLanguages').textContent=String(languageData.qualifiedForProduction ?? 0);
      setTranslation($('statusBadge'), status.enabled && status.encryptionConfigured ? 'status.configured' : 'status.setupIncomplete', {}, status.enabled && status.encryptionConfigured ? 'Guarded mode configured' : 'Setup incomplete');
      $('statusBadge').className='badge '+(status.enabled && status.encryptionConfigured?'good':'bad');
      setTranslation($('languageWarning'), 'messages.qualificationNotice', {}, 'No language is production-qualified until text, ASR, TTS, accent and escalation tests pass.');
      const unique=state.languages.filter(x=>x && typeof x.code==='string' && x.duplicateOf===null);
      const previousLanguage=$('languageSelect').value;
      $('languageSelect').replaceChildren(...unique.map(x=>{
        const option=document.createElement('option'); option.value=x.code; option.textContent=`${x.name} (${x.code})`; return option;
      }));
      $('languageSelect').value=unique.some(x=>x.code===previousLanguage) ? previousLanguage : (unique.some(x=>x.code==='en') ? 'en' : (unique[0]?.code || ''));
      const missing=[];
      if(!status.enabled) missing.push('OPSC_CONTACT_CENTER_ENABLED=true');
      if(!status.encryptionConfigured) missing.push('32-byte OPSC_CONTACT_CENTER_ENCRYPTION_KEY');
      if(!status.textAssistantConfigured) missing.push('AI_PROVIDER=openai, OPENAI_API_KEY and OPENAI_CONTACT_CENTER_MODEL (or OPENAI_MODEL)');
      if(!status.realtimeBrowserVoiceConfigured) missing.push('OPENAI_REALTIME_MODEL for live browser voice');
      if(missing.length) setStatusKey('messages.configNeeded', {missing:missing.join('; ')}, false, `Configuration still needed: ${missing.join('; ')}.`);
      else setStatusKey('messages.configOk', {}, true, 'Configuration exists. Provider connectivity and language quality still need live acceptance tests.');
      await refreshQueue();
    } catch(e) {
      setTranslation($('statusBadge'), 'status.apiUnavailable', {}, 'Sign-in / API unavailable');
      $('statusBadge').className='badge bad';
      report(e);
      setTranslation($('languageWarning'), 'messages.apiUnavailable', {}, 'The Contact Center API could not be loaded. Sign in to the OpsCore console, then reload this page.');
    }
    updateLiveControls();
  }
  async function createConversation(channel) {
    if(!$('consent').checked) throw new Error('CONTACT_CENTER_CONSENT_REQUIRED');
    const output=await api('/api/v1/contact-center/conversations',{method:'POST',body:JSON.stringify({channel,languageCode:$('languageSelect').value,consentAccepted:true})});
    state.conversationId=output.id;state.channel=channel;state.seenTranscripts.clear();
    setLiteral($('conversationTitle'), String(output.id));
    setLiteral($('conversationMeta'), `${output.languageName} (${output.languageCode}) · ${channel}`);
    $('chatLog').replaceChildren();
    $('chatInput').value='';
    updateLiveControls();
    setStatusKey('messages.conversationCreated', {}, true, 'Secure conversation created. Language quality is not yet production-qualified.');
    await refreshQueue();
    return output;
  }
  async function startChat() {
    stopVoice();
    try { await createConversation('web_chat');$('chatInput').focus(); }
    catch(e){report(e);}
  }
  async function sendText(event) {
    event.preventDefault();
    const content=$('chatInput').value.trim();
    if(!content||!state.conversationId||state.channel!=='web_chat') return;
    const clientMessageId=`web:${crypto.randomUUID()}`;
    $('chatInput').value='';$('sendMessage').disabled=true;
    addMessage('customer',content);
    try {
      const out=await api(`/api/v1/contact-center/conversations/${encodeURIComponent(state.conversationId)}/messages`,{method:'POST',body:JSON.stringify({content,clientMessageId})});
      if(out.reply) addMessage('assistant',out.reply,`${out.confidence===null ? '—' : Math.round(out.confidence*100)+'%'} · ${out.riskLevel||'—'}`);
      if(out.handoff) {
        const reason = tx(`handoffReasons.${out.handoff.reasonCode}`, {}, out.handoff.reasonCode);
        setStatusKey('messages.handoffQueued', {reason}, true, `Human handoff queued (${reason}). This is a queue request, not a live connection.`);
      } else if(out.suggestedNextStep) {
        setStatusKey('messages.suggestedNextStep', {step:out.suggestedNextStep}, false, `Suggested next step only (not executed): ${out.suggestedNextStep}`);
      }
      if(out.handoff) { $('chatInput').disabled=true; $('sendMessage').disabled=true; }
      await refreshQueue();
    } catch(e){report(e);addMessage('assistant',tx('messages.aiResponseFailed',{},'The AI response was not completed. No action was executed. You can request a human representative.'));}
    finally { updateLiveControls(); }
  }
  async function requestHuman() {
    if(!state.conversationId) return;
    try {
      const out=await api(`/api/v1/contact-center/conversations/${encodeURIComponent(state.conversationId)}/handoff`,{method:'POST',body:JSON.stringify({detail:'Customer requested a human representative.',priority:'high'})});
      const reason = tx(`handoffReasons.${out.reasonCode}`, {}, out.reasonCode);
      setStatusKey('messages.handoffQueuedQueueOnly', {reason}, true, `Human handoff queued (${reason}). The queue does not prove an agent is connected.`);
      $('chatInput').disabled=true;$('sendMessage').disabled=true;
      if(state.voicePc) stopVoice();
      await refreshQueue();
    } catch(e){report(e);}
  }
  async function sendVoiceTranscript(actorType, content, eventId) {
    const cleaned=String(content||'').trim(); if(!cleaned||!state.conversationId) return;
    const unique=`${actorType}|${cleaned}`;
    if(state.seenTranscripts.has(unique)) return;
    state.seenTranscripts.add(unique);
    addMessage(actorType,cleaned);
    try {
      const out=await api(`/api/v1/contact-center/conversations/${encodeURIComponent(state.conversationId)}/transcript`,{method:'POST',body:JSON.stringify({actorType,content:cleaned,clientMessageId:`rtc:${String(eventId||crypto.randomUUID()).slice(0,96)}`})});
      if(out.handoff){
        setStatusKey('messages.voiceHandoffStopped', {reason:tx('handoffReasons.voice_review_required',{},'Voice review required')}, true, 'Human handoff queued. The browser AI session is stopping; live telephony transfer is not configured.');
        stopVoice();await refreshQueue();
      }
    } catch(e){ if(!String(e.message).includes('CONTACT_CENTER_DUPLICATE_MESSAGE')) report(e); }
  }
  async function startVoice() {
    try {
      if(!window.RTCPeerConnection||!navigator.mediaDevices?.getUserMedia) throw new Error('BROWSER_REALTIME_VOICE_UNSUPPORTED');
      await createConversation('browser_voice');
      setStatusKey('messages.voiceCredentialRequest', {}, true, 'Requesting a short-lived voice credential…');
      const session=await api(`/api/v1/contact-center/conversations/${encodeURIComponent(state.conversationId)}/realtime-session`,{method:'POST',body:'{}'});
      const pc=new RTCPeerConnection();state.voicePc=pc;
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});state.voiceStream=stream;
      for(const track of stream.getTracks()) pc.addTrack(track,stream);
      pc.ontrack=event=>{ $('remoteAudio').srcObject=event.streams[0]; $('remoteAudio').play().catch(()=>{}); };
      const dc=pc.createDataChannel('oai-events');state.voiceDc=dc;
      dc.addEventListener('message',event=>{
        let msg;try{msg=JSON.parse(event.data);}catch{return;}
        if(msg.type==='conversation.item.input_audio_transcription.completed') sendVoiceTranscript('customer',msg.transcript,msg.event_id||msg.item_id).catch(()=>{});
        if(['response.audio_transcript.done','response.output_audio_transcript.done'].includes(msg.type)) sendVoiceTranscript('assistant',msg.transcript,msg.event_id||msg.item_id).catch(()=>{});
        if(msg.type==='error') setStatusKey('messages.voiceRealtimeError', {}, false, 'Realtime provider reported an error. Stop the voice session and retry after checking provider configuration.');
      });
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      const response=await fetch(session.signalingEndpoint,{method:'POST',headers:{Authorization:`Bearer ${session.clientSecret}`,'Content-Type':'application/sdp'},body:pc.localDescription.sdp,cache:'no-store'});
      const answer=await response.text();
      if(!response.ok) throw new Error('CONTACT_CENTER_REALTIME_CONNECT_FAILED');
      await pc.setRemoteDescription({type:'answer',sdp:answer});
      setTranslation($('voiceState'),'messages.voiceCredentialActive',{languageCode:session.languageCode},`${session.languageCode} · temporary provider credential`);
      $('stopVoice').disabled=false;
      setStatusKey('messages.voiceActive', {}, true, 'Voice session is active. Press “Request human” at any time; this creates a queue item, not a PSTN transfer.');
    } catch(e){stopVoice();report(e);}
    finally {updateLiveControls();}
  }
  function stopVoice() {
    try {state.voiceDc?.close();}catch{}
    try {state.voicePc?.getSenders?.().forEach(x=>x.track?.stop());state.voicePc?.close();}catch{}
    try {state.voiceStream?.getTracks?.().forEach(t=>t.stop());}catch{}
    state.voicePc=null;state.voiceDc=null;state.voiceStream=null;
    $('remoteAudio').srcObject=null;
    setTranslation($('voiceState'),'customer.voiceOff',{},'Voice is off.');
    updateLiveControls();
  }
  async function refreshQueue() {
    try {
      const result=await api('/api/v1/contact-center/handoffs?status=open&limit=50');
      const items=Array.isArray(result.items)?result.items:[];$('queueCount').textContent=String(items.length);
      $('handoffQueue').replaceChildren();
      if(!items.length){
        const empty=document.createElement('div');empty.className='empty';
        setTranslation(empty,'queue.empty',{},'No active human handoffs for this organization.');
        $('handoffQueue').appendChild(empty);return;
      }
      items.forEach(item=>{
        const card=document.createElement('article');card.className='queue-item';
        const head=document.createElement('div');head.className='queue-head';
        const title=document.createElement('strong');
        const idLabel=document.createElement('span');idLabel.textContent=String(item.conversationId || '');
        const separator=document.createTextNode(' · ');
        const reasonLabel=document.createElement('span');
        const reasonKey = `handoffReasons.${String(item.reasonCode || '')}`;
        setTranslation(reasonLabel, reasonKey, {}, knownHandoffLabels[item.reasonCode] || String(item.reasonCode || 'Other'));
        title.append(idLabel,separator,reasonLabel);
        const priority=document.createElement('span');priority.className=`severity ${['low','medium','high','urgent','critical'].includes(item.priority) ? item.priority : 'medium'}`;priority.textContent=String(item.priority || '').toUpperCase();head.append(title,priority);
        const info=document.createElement('p');
        const dateLabel = item.createdAt ? new Date(item.createdAt).toLocaleString(i18n?.currentLocale || 'en') : '';
        info.textContent=[item.channel,item.languageCode,item.status,dateLabel].filter(Boolean).join(' · ');
        const actions=document.createElement('div');actions.className='queue-actions';
        const open=document.createElement('button');open.className='secondary';
        setTranslation(open,item.assignedTo?'queue.openAssignment':'queue.claimAndReview',{},item.assignedTo?'Open assignment':'Claim and review');
        open.addEventListener('click',()=>openHandoff(item));actions.appendChild(open);
        card.append(head,info,actions);$('handoffQueue').appendChild(card);
      });
    } catch(e) {
      $('queueCount').textContent='—'; $('handoffQueue').replaceChildren();
      const el=document.createElement('div');el.className='empty';setTranslation(el,'messages.queueUnavailable',{reason:e.message},`Queue unavailable: ${e.message}`);$('handoffQueue').appendChild(el);
    }
  }
  async function openHandoff(item) {
    try {
      let current=item;
      if(item.status==='queued') current=await api(`/api/v1/contact-center/handoffs/${encodeURIComponent(item.id)}/claim`,{method:'POST',body:'{}'});
      if(current.status!=='claimed'&&item.status!=='claimed') throw new Error('HANDOFF_NOT_CLAIMED');
      state.selectedHandoff=item.id;state.selectedAssignedConversation=item.conversationId;
      const conversation=await api(`/api/v1/contact-center/conversations/${encodeURIComponent(item.conversationId)}`);
      setLiteral($('agentConversationTitle'),String(item.conversationId || ''));
      const reason=tx(`handoffReasons.${String(item.reasonCode || '')}`,{},String(item.reasonCode || ''));
      setLiteral($('agentConversationMeta'),`${conversation.languageName || ''} · ${reason}`);
      $('agentWork').hidden=false;$('agentTranscript').replaceChildren();
      (Array.isArray(conversation.messages)?conversation.messages:[]).forEach(m=>{
        const actor=safeActor(m.actorType);
        const d=document.createElement('div');d.className=`message ${actor}`;
        const label=document.createElement('span');label.className='role';setTranslation(label,actorKeys[actor] || 'roles.ai',{},m.actorType);
        const text=document.createElement('div');text.textContent=String(m.content ?? '');d.append(label,text);$('agentTranscript').appendChild(d);
      });
      $('agentTranscript').scrollTop=$('agentTranscript').scrollHeight;
      await refreshQueue();
    } catch(e){report(e,'setupHint');}
  }
  async function humanReply(event) {
    event.preventDefault();const content=$('agentReply').value.trim();if(!content||!state.selectedAssignedConversation)return;
    try {
      await api(`/api/v1/contact-center/conversations/${encodeURIComponent(state.selectedAssignedConversation)}/human-reply`,{method:'POST',body:JSON.stringify({content,clientMessageId:`human:${crypto.randomUUID()}`})});
      $('agentReply').value='';const d=document.createElement('div');d.className='message human';
      const l=document.createElement('span');l.className='role';setTranslation(l,'roles.human',{},'Human agent');
      const txNode=document.createElement('div');txNode.textContent=content;d.append(l,txNode);$('agentTranscript').appendChild(d);$('agentTranscript').scrollTop=$('agentTranscript').scrollHeight;
    } catch(e){report(e);}
  }
  async function resolveHandoff() {
    if(!state.selectedHandoff)return;
    try {await api(`/api/v1/contact-center/handoffs/${encodeURIComponent(state.selectedHandoff)}/resolve`,{method:'POST',body:JSON.stringify({note:tx('queue.resolveNote',{},'Resolved by assigned human operator.')})});$('agentWork').hidden=true;state.selectedHandoff=null;state.selectedAssignedConversation=null;await refreshQueue();}
    catch(e){report(e);}
  }
  $('consent').addEventListener('change',updateLiveControls);
  $('startChat').addEventListener('click',startChat);
  $('startVoice').addEventListener('click',startVoice);
  $('stopVoice').addEventListener('click',stopVoice);
  $('chatForm').addEventListener('submit',sendText);
  $('requestHuman').addEventListener('click',requestHuman);
  $('refreshQueue').addEventListener('click',refreshQueue);
  $('agentReplyForm').addEventListener('submit',humanReply);
  $('resolveHandoff').addEventListener('click',resolveHandoff);
  window.addEventListener('beforeunload',stopVoice);
  window.addEventListener('opscore:localechange', () => { updateLiveControls(); });
  loadStatus();
})();
