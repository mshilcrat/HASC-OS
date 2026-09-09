/* HASC Mark 4 finishing patch: Shabbos iframe organization + persistent rail apps. */
(function(){
  'use strict';

  function isDesktopIndex(){
    var p=(location.pathname||'/').toLowerCase();
    return p==='/' || p==='/index.html' || /\/index\.html$/.test(p);
  }
  if(!isDesktopIndex() || window.top!==window) return;

  var DEFAULT_APPS=['checklists','ledgers'];
  var CORE_ALWAYS=['dashboard'];
  var profile=null;
  var sb=null;
  var prefs=null;
  var saving=false;

  function getProfile(){profile=window.__hascProfile||profile;sb=window.__hascClient||sb;return profile;}
  function currentPrefs(){var p=getProfile();if(!p)return DEFAULT_APPS.slice();if(Array.isArray(p.apps))return p.apps.slice();return DEFAULT_APPS.slice();}
  function shouldManageRail(){return !!getProfile();}
  function isResidenceManager(){var p=getProfile();return !!(p&&String(p.role||'').toLowerCase()==='residence_manager');}
  function isAreaCoordinator(){var p=getProfile();return !!(p&&String(p.role||'').toLowerCase()==='area_coordinator');}
  function isAdmin(){var p=getProfile();return !!(p&&String(p.role||'').toLowerCase()==='admin');}
  function applyRail(){if(!shouldManageRail())return;prefs=prefs||currentPrefs();var p=getProfile(),admin=!!(p&&String(p.role||'').toLowerCase()==='admin');document.querySelectorAll('#navRail .navbtn[data-view]').forEach(function(b){var key=b.getAttribute('data-view');var show=(CORE_ALWAYS.indexOf(key)>=0||prefs.indexOf(key)>=0||(key==='system'&&admin));b.style.display=show?'':'none';});var sys=document.querySelector('#navRail .navbtn[data-view="system"]');if(sys&&!admin)sys.style.display='none';var appsLauncher=document.getElementById('appsLauncher');if(appsLauncher)appsLauncher.style.display=admin?'':'none';}
  function syncMenu(){if(!shouldManageRail())return;prefs=prefs||currentPrefs();var pin=document.getElementById('appsPin');if(!pin)return;if(!pin.querySelector('input[data-app="individuals"]')){var row=document.createElement('label');row.className='approw';row.innerHTML='<span class="approw-l"><span class="cfgp" style="--acc:var(--indigo)">👤</span>Individuals</span><input type="checkbox" data-app="individuals">';pin.insertBefore(row,pin.firstChild);}pin.querySelectorAll('input[data-app]').forEach(function(cb){cb.checked=prefs.indexOf(cb.getAttribute('data-app'))>=0;if(!cb.__hascPersist){cb.__hascPersist=true;cb.addEventListener('change',function(){setTimeout(function(){var chosen=[];pin.querySelectorAll('input[data-app]:checked').forEach(function(x){chosen.push(x.getAttribute('data-app'));});prefs=chosen;savePrefs();applyRail();},0);});}});}
  async function savePrefs(){if(saving)return;var p=getProfile();if(!p||!sb||!p.email)return;saving=true;try{var r=await sb.from('profiles').update({apps:prefs}).eq('email',p.email);if(r.error)throw r.error;p.apps=prefs.slice();window.__hascProfile=p;try{sessionStorage.setItem('hasc_apps',JSON.stringify(prefs));}catch(e){}}catch(e){console.error('HASC rail preference save failed',e);}finally{saving=false;}}

  function hideDepartmentSelector(){var sel=document.querySelector('.myres-picks select:not(#heroHomeFilter)');if(sel)sel.style.display='none';}
  function fixDashboardOverlap(){var houses=document.getElementById('houses');if(!houses)return;var panel=houses.closest('.panel');if(!panel)return;houses.style.height='auto';houses.style.minHeight='0';houses.style.position='relative';houses.style.overflow='visible';houses.style.alignContent='start';panel.style.height='auto';panel.style.overflow='visible';panel.style.position='relative';panel.style.flex='0 0 auto';var ph=panel.querySelector('.ph');var needed=(houses.scrollHeight||0)+(ph?ph.offsetHeight:0)+22;if(needed>0)panel.style.minHeight=needed+'px';}

  function patchChecklistRealtimeRender(){
    if(typeof window.renderChecklists!=='function'||window.renderChecklists.__hascNoIframeReload)return;
    var original=window.renderChecklists;
    function safeRenderChecklists(){
      var host=document.getElementById('view-checklists');
      if(host&&host.querySelector('#checklistsFrame'))return;
      return original.apply(this,arguments);
    }
    safeRenderChecklists.__hascNoIframeReload=true;
    safeRenderChecklists.__hascOriginal=original;
    window.renderChecklists=safeRenderChecklists;
  }

  function getShabbosFrame(){return document.getElementById('shabbosFrame');}
  function enforceRestrictedShabbosView(){if(!isResidenceManager()&&!isAreaCoordinator())return;var f=getShabbosFrame();if(!f)return;var codes=document.getElementById('sbCodes'),records=document.getElementById('sbRecords');if(codes){codes.style.display='none';codes.classList.remove('primary');}if(records)records.classList.add('primary');var head=document.querySelector('#view-shabbos .viewhead p');if(head)head.textContent=isResidenceManager()?'Review signed Shabbos policy documents for your residence.':'Review staff Shabbos policy sign-off records.';if(!/shabbos_signoff\.html/i.test(f.src))f.src='Shabbos/shabbos_signoff.html#admin';}

  function injectAdminSingleQR(d,f){
    if(!isAdmin()||!/qr_code_generator\.html/i.test(f.src)||d.getElementById('hascSingleQrPanel'))return;
    var wrap=d.querySelector('.wrap'),bulk=d.querySelector('.wrap > .panel'),homes=d.getElementById('qrHomes'),base=d.getElementById('qrBase');
    if(!wrap||!bulk||!homes||!base||typeof f.contentWindow.qrcode!=='function')return;
    var panel=d.createElement('div');panel.className='panel';panel.id='hascSingleQrPanel';
    panel.innerHTML='<h2>Single Residence QR Code</h2><p class="rec" style="margin-top:-4px">View or print one active residence code without changing it.</p><div class="field"><label>Residence</label><select id="hascSingleQrSelect"><option value="">Select a residence…</option></select></div><div id="hascSingleQrOut" style="text-align:center;margin-top:18px"></div><div class="row" id="hascSingleQrActions" style="display:none"><button class="btn btn-ghost" id="hascSingleQrPrint">Print this code</button></div>';
    wrap.insertBefore(panel,bulk);
    var sel=d.getElementById('hascSingleQrSelect'),out=d.getElementById('hascSingleQrOut'),actions=d.getElementById('hascSingleQrActions');
    homes.value.split('\n').map(function(s){return s.trim();}).filter(Boolean).forEach(function(name){var o=d.createElement('option');o.value=name;o.textContent=name;sel.appendChild(o);});
    function esc(s){return String(s||'').replace(/[&<>\"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]||c;});}
    function cleanBase(b){return String(b||'').trim().replace(/[?#].*$/,'').replace(/\/+$/,'');}
    function render(){var name=sel.value;if(!name){out.innerHTML='';actions.style.display='none';return;}var url=cleanBase(base.value)+'/?home='+encodeURIComponent(name);var qr=f.contentWindow.qrcode(0,'M');qr.addData(url);qr.make();out.innerHTML='<div class="qrcard" style="display:inline-block"><div class="qname">'+esc(name)+'</div>'+qr.createSvgTag(6,0)+'</div>';actions.style.display='flex';}
    sel.addEventListener('change',render);base.addEventListener('input',render);
    d.getElementById('hascSingleQrPrint').addEventListener('click',function(){if(!sel.value)return;var w=window.open('','_blank');if(!w)return;w.document.write('<!doctype html><html><head><title>'+esc(sel.value)+'</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:40px}.qrcard{display:inline-block}.qname{font-size:22px;font-weight:700;margin-bottom:12px}svg{width:320px;height:320px}</style></head><body>'+out.innerHTML+'</body></html>');w.document.close();w.focus();setTimeout(function(){w.print();},250);});
  }

  function patchShabbosFrame(){var f=getShabbosFrame();if(!f)return;try{var d=f.contentDocument;if(!d||!d.body)return;var hdr=d.querySelector('header.top');if(hdr)hdr.style.display='none';var wrap=d.querySelector('.wrap');if(wrap){wrap.style.maxWidth='1100px';wrap.style.paddingTop='1px';}var read=d.getElementById('tabRead');if(read)read.style.display='none';if(/qr_code_generator\.html/i.test(f.src)){if(!d.getElementById('hascHideQrUrl')){var s=d.createElement('style');s.id='hascHideQrUrl';s.textContent='.qrcard .qurl{display:none!important}';d.head.appendChild(s);}injectAdminSingleQR(d,f);var actions=d.querySelector('.row.actions');if(actions&&!d.getElementById('hascPrintPolicy')){var btn=d.createElement('button');btn.id='hascPrintPolicy';btn.className='btn btn-ghost';btn.textContent='Print Shabbos Policy';btn.onclick=function(){var w=window.open('/Shabbos/shabbos_signoff.html#admin','_blank');if(!w)return;var tries=0;var t=setInterval(function(){tries++;try{if(w.document&&w.document.readyState==='complete'){clearInterval(t);var h=w.document.querySelector('header.top');if(h)h.style.display='none';var bar=w.document.getElementById('adminBar');if(bar)bar.style.display='none';var sign=w.document.getElementById('signbox');if(sign)sign.style.display='none';var prog=w.document.getElementById('progWrap');if(prog)prog.style.display='none';var records=w.document.getElementById('recordsView');if(records)records.style.display='none';var gate=w.document.getElementById('gate');if(gate)gate.style.display='none';var readView=w.document.getElementById('readView');if(readView)readView.style.display='block';w.focus();w.print();}}catch(e){}if(tries>40)clearInterval(t);},150);};actions.appendChild(btn);}}if(/shabbos_signoff\.html/i.test(f.src)){var rec=d.querySelector('#recordsView .records .rec');if(rec&&shouldManageRail())rec.textContent='Your residence sign-off records.';}}catch(e){console.warn('HASC Shabbos iframe patch failed',e);}}
  function wireShabbos(){enforceRestrictedShabbosView();var f=getShabbosFrame();if(f&&!f.__hascLoad){f.__hascLoad=true;f.addEventListener('load',function(){setTimeout(function(){enforceRestrictedShabbosView();patchShabbosFrame();},50);});}patchShabbosFrame();}
  function patchStaffFrame(){var f=document.getElementById('staffFrame');if(!f)return;f.style.height='calc(100vh - 90px)';f.style.borderRadius='0';try{var d=f.contentDocument;if(!d||!d.body)return;var wrap=d.querySelector('.wrap');if(wrap)wrap.style.padding='14px 18px 24px';var rail=d.querySelector('.rail');if(rail)rail.style.padding='10px 8px';}catch(e){console.warn('HASC Staff iframe fit failed',e);}}
  function wireStaff(){var f=document.getElementById('staffFrame');if(f&&!f.__hascFit){f.__hascFit=true;f.addEventListener('load',function(){setTimeout(patchStaffFrame,50);});}patchStaffFrame();}
  function wireOvertime(){var v=document.getElementById('view-ot');if(!v)return;var f=v.querySelector('#otFrame');if(!f){v.innerHTML='<iframe id="otFrame" src="/Overtime/overtime.html" style="display:block;width:100%;height:calc(100vh - 90px);border:0;border-radius:0;background:#f0f2f5"></iframe>';}else{f.style.height='calc(100vh - 90px)';f.style.borderRadius='0';}}
  function tick(){getProfile();patchChecklistRealtimeRender();if(profile){if(!prefs)prefs=currentPrefs();applyRail();syncMenu();}hideDepartmentSelector();fixDashboardOverlap();wireShabbos();wireStaff();wireOvertime();}
  document.addEventListener('click',function(e){var t=e.target&&e.target.closest?e.target.closest('#appsLauncher,button[data-view="shabbos"],button[data-view="staff"],button[data-view="ot"],#sbCodes,#sbRecords'):null;if(!t)return;setTimeout(function(){syncMenu();wireShabbos();wireStaff();wireOvertime();},80);setTimeout(function(){syncMenu();wireShabbos();wireStaff();wireOvertime();},400);},true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',tick);else tick();setTimeout(tick,400);setTimeout(tick,1200);setInterval(tick,2000);
})();

/* Keep the active checklist management module after realtime writes such as task deletion. */
(function(){
  'use strict';
  function patch(){
    var f=document.getElementById('checklistsFrame');
    if(!f)return;
    try{
      var w=f.contentWindow,d=f.contentDocument;
      if(!w||!d||typeof w.__hascChecklistRefresh!=='function'||w.__hascChecklistRefresh.__hascPreserveModule)return;
      var original=w.__hascChecklistRefresh;
      var wrapped=async function(){
        var shellWasChecklists=!!document.querySelector('#view-checklists.view.active');
        var active=d.querySelector('.modulebtn[data-module].active');
        var moduleId=(active&&active.dataset&&active.dataset.module)||((w.location.hash||'').replace(/^#/,'')||'insights');
        try{return await original.apply(this,arguments);}
        finally{
          if(typeof w.activateModule==='function')w.activateModule(moduleId);
          try{if(moduleId&&w.location.hash.slice(1)!==moduleId)w.history.replaceState(null,'','#'+moduleId);}catch(e){}
          if(shellWasChecklists&&typeof window.switchView==='function')window.switchView('checklists');
        }
      };
      wrapped.__hascPreserveModule=true;
      wrapped.__hascOriginal=original;
      w.__hascChecklistRefresh=wrapped;
    }catch(e){console.warn('HASC checklist module-state patch failed',e);}
  }
  setInterval(patch,500);
})();

/* Add Task must create a task only for the residence selected in the checklist builder. */
(function(){
  'use strict';
  function toast(d,msg){var t=d.querySelector('.toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2600);}
  function patch(){
    var f=document.getElementById('checklistsFrame');
    if(!f)return;
    try{
      var w=f.contentWindow,d=f.contentDocument,btn=d&&d.getElementById('addTask');
      var client=w&&w.__hascClient;
      if(!btn||!client||btn.__hascScopedAdd)return;
      btn.__hascScopedAdd=true;
      btn.onclick=async function(e){
        if(e)e.preventDefault();
        var homeEl=d.getElementById('builderHome'),nameEl=d.getElementById('newTask'),freqEl=d.getElementById('newFreq');
        var home=homeEl&&homeEl.value,name=nameEl&&nameEl.value?nameEl.value.trim():'',freq=freqEl&&freqEl.value;
        if(!home||!name||!freq)return;
        btn.disabled=true;
        try{
          var r=await client.rpc('create_scoped_checklist_task',{p_home:home,p_frequency:freq,p_task_name:name});
          if(r.error)throw r.error;
          if(nameEl)nameEl.value='';
          if(typeof w.__hascChecklistRefresh==='function')await w.__hascChecklistRefresh();
          toast(d,'Task added to '+home+' only.');
        }catch(err){
          console.error('Scoped checklist task add failed',err);
          toast(d,'Could not add the task. No residence changes were saved.');
        }finally{btn.disabled=false;}
      };
    }catch(e){console.warn('HASC scoped checklist add patch failed',e);}
  }
  setInterval(patch,400);
})();