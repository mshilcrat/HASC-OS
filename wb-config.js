// wb-config.js
// Shared connection for the HASC RM Compliance Workbook.
// This is the PUBLIC (anon) key — safe to be here. Real protection is
// handled by Supabase Row Level Security + each user's login.
window.HASC_CONFIG = {
  SUPABASE_URL: "https://xqcykvgsesavtuautivq.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY3lrdmdzZXNhdnR1YXV0aXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzc1ODUsImV4cCI6MjA5MTkxMzU4NX0.A6FkxttGZMGaPxqr1orOWlpoO_zZSeqbp5W3L7s6U5w"
};

/* HASC live updates: re-fetch + re-render whenever watched tables change */
(function(){
    var WATCH = ['resi_individuals','resi_ledger_accounts','resi_ledger_entries','cl_submissions','cl_tasks','cl_done','certificates','training_sessions','profiles','cl_homes'];
    function reload(){
          try{ if(typeof window.sbLoadLedgers==='function'){ Promise.resolve(window.sbLoadLedgers()).then(function(){ if(typeof window.renderLedgers==='function') window.renderLedgers(); }); } }catch(e){}
          var fns = ['loadIndividuals','renderLedgers','renderChecklists','loadChecklistSummary','renderTraining','renderDashboard','renderDayHabCounts','renderIndividuals'];
          fns.forEach(function(n){ try{ if(typeof window[n]==='function') window[n](); }catch(e){} });
    }
    var t = setInterval(function(){
          var sb = window.__hascClient;
          if(!sb || typeof sb.channel!=='function') return;
          clearInterval(t);
          window.__hascLive = WATCH.map(function(tbl){
                  return sb.channel('hasc-live-'+tbl).on('postgres_changes', { event:'*', schema:'public', table:tbl }, function(){ reload(); }).subscribe();
          });
    }, 300);
})();

/* HASC save fix: main app Individuals drawer "Save & Send Live Update" now writes to Supabase */
(function(){
    var wrapT = setInterval(function(){
          if (typeof window.openIndividual === 'function' && !window.__hascOpenWrapped) {
                  window.__hascOpenWrapped = true;
                  var orig = window.openIndividual;
                  window.openIndividual = function(r){ try{ window.__hascOpenId = r && r.id; }catch(e){} return orig.apply(this, arguments); };
                  clearInterval(wrapT);
          }
    }, 300);
    document.addEventListener('click', function(ev){
          var btn = ev.target.closest ? ev.target.closest('button') : null;
          if (!btn || !/Save & Send Live Update/.test(btn.textContent)) return;
          var sb = window.__hascClient; if (!sb) return;
          var id = window.__hascOpenId; if (!id) return;
          function selByLabel(lbl){
                  var s = [].slice.call(document.querySelectorAll('select')).find(function(x){
                            return (x.previousElementSibling && x.previousElementSibling.textContent || '').trim().toLowerCase().indexOf(lbl) > -1;
                  });
                  return s ? s.value : undefined;
          }
          var statusSel = [].slice.call(document.querySelectorAll('select')).find(function(x){
                  return [].slice.call(x.options).some(function(o){ return /Staying Home Sick|At Residence|Early Return/.test(o.value); });
          });
          var status = statusSel ? statusSel.value : undefined;
          var home = selByLabel('residence');
          var dh = selByLabel('day hab participant');
          var svc = selByLabel('day hab service');
          var nameInput = [].slice.call(document.querySelectorAll('input')).find(function(i){
                  return i.previousElementSibling && /name/i.test(i.previousElementSibling.textContent || '');
          });
          var patch = {};
          if (status !== undefined) patch.status = status;
          if (home !== undefined) patch.home_name = home;
          if (dh !== undefined) patch.day_hab_participant = (dh === 'yes' || dh === true);
          if (svc !== undefined) patch.day_hab_service = svc;
          if (nameInput) patch.name = nameInput.value;
          patch.last_shared = new Date().toISOString();
          Promise.resolve(sb.from('resi_individuals').update(patch).eq('id', id)).catch(function(e){ console.warn('HASC save failed', e); });
    }, true);
})();


/* HASC Recent Activity feed: pull trainings + checklists, render live */
(function(){
  var ICON_TRAINING = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 10L12 5 2 10l10 5 10-5z\"/><path d=\"M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5\"/></svg>";
  var ICON_CHECKLIST = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 11l3 3L22 4\"/><path d=\"M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11\"/></svg>";
  function esc(t){ return String(t==null?'':t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function rel(ts){
    if(!ts) return '';
    var d=new Date(ts), s=Math.floor((Date.now()-d.getTime())/1000);
    if(s<60) return 'just now';
    var m=Math.floor(s/60); if(m<60) return m+'m ago';
    var h=Math.floor(m/60); if(h<24) return h+'h ago';
    var dy=Math.floor(h/24); return dy+'d ago';
  }
  async function loadActivityAll(limit){
    var sb=window.__hascClient; if(!sb) return [];
    var out=[];
    try{
      var c=await sb.from('certificates').select('id,individual_name,dsp_name,residence,completed_at,is_archived').order('completed_at',{ascending:false}).limit(limit);
      (c.data||[]).filter(function(x){return !x.is_archived;}).forEach(function(x){
        out.push({ type:'training', ts:x.completed_at, title:(x.individual_name||'Individual')+' — training certified', by:x.dsp_name||'', where:x.residence||'' });
      });
    }catch(e){}
    try{
      var s=await sb.from('cl_submissions').select('id,home_name,submitted_by,submitted_at,frequency,tasks_done,tasks_total').order('submitted_at',{ascending:false}).limit(limit);
      (s.data||[]).forEach(function(x){
        var freq=x.frequency||'daily';
        var prog=(x.tasks_done!=null&&x.tasks_total!=null)?(' ('+x.tasks_done+'/'+x.tasks_total+')'):'';
        out.push({ type:'checklist', ts:x.submitted_at, title:freq.charAt(0).toUpperCase()+freq.slice(1)+' checklist submitted'+prog, by:x.submitted_by||'', where:x.home_name||'' });
      });
    }catch(e){}
    out.sort(function(a,b){ return new Date(b.ts||0)-new Date(a.ts||0); });
    return out.slice(0,limit);
  }
  function iconFor(type){ return type==='checklist' ? ICON_CHECKLIST : ICON_TRAINING; }
  function colorFor(type){ return type==='checklist' ? 'var(--green)' : 'var(--gold)'; }
  function rowHtml(a){
    var by=a.by?(' \u00b7 '+esc(a.by)):'';
    var where=a.where?(' \u00b7 '+esc(a.where)):'';
    var col=colorFor(a.type);
    var icoStyle=' style="background:'+col+';box-shadow:0 8px 18px -9px '+col+'"';
    return '<div class="act"><div class="actico"'+icoStyle+'>'+iconFor(a.type)+'</div><div style="flex:1"><div><b>'+esc(a.title)+'</b></div><div class="when" style="color:var(--muted);font-size:12px">'+rel(a.ts)+where+by+'</div></div></div>';
  }
  async function renderRA(){
    var el=document.getElementById('recentActivity'); if(!el) return;
    try{
      var items=await loadActivityAll(8);
      el.innerHTML=items.length?items.map(rowHtml).join(''):'<div class="lst-empty">No recent activity yet.</div>';
    }catch(e){}
  }
  window.renderRA=renderRA;
  window.loadActivityAll=loadActivityAll;
  function wireViewAll(){
    var b=document.getElementById('activityViewAll'); if(!b) return;
    b.onclick=async function(){
      var items=await loadActivityAll(50);
      var body=items.length?items.map(rowHtml).join(''):'<div class="lst-empty">No recent activity yet.</div>';
      if(window.openDrawer) window.openDrawer('Recent Activity', items.length+' recent events', body);
    };
  }
  var t=setInterval(function(){
    var sb=window.__hascClient;
    if(!sb||typeof sb.channel!=='function') return;
    clearInterval(t);
    renderRA(); wireViewAll();
    ['certificates','cl_submissions','cl_done'].forEach(function(tbl){
      sb.channel('hasc-ra-'+tbl).on('postgres_changes',{event:'*',schema:'public',table:tbl},function(){ renderRA(); }).subscribe();
    });
  },300);
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){ renderRA(); wireViewAll(); });
  else { renderRA(); wireViewAll(); }
  /* win the load-order race vs index.html's one-time re-render */
  setTimeout(function(){ renderRA(); wireViewAll(); }, 1200);
  setTimeout(function(){ renderRA(); wireViewAll(); }, 2600);
  setInterval(function(){ renderRA(); wireViewAll(); }, 60000);
})();


/* === HASC Widget Dashboard (widgets-dashboard) — additive, self-contained === */
(function(){
  var GCOLS=4, ROWPX=40, GAP=16;
  function boot(){
    var nav=document.querySelector('nav.nav');
    var board=document.querySelector('.board');
    if(!nav||!board||!board.querySelector('.panel')){ return setTimeout(boot,400); }
    if(document.querySelector('.pw-grid')) return;
    function css(t){var s=document.createElement('style');s.textContent=t;document.head.appendChild(s);}
    css(':root{--formsc:#0EA5C4;--maintc:#8A6D3B;--widgetsc:#E07A5F;}');
    var formsSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h8"></path><path d="M8 9h3"></path></svg>';
    var maintSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18l3 3 6.4-6.3a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-.6-.6-2.3z"></path></svg>';
    var gridSVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"></rect><rect x="14" y="3" width="7" height="7" rx="1.5"></rect><rect x="3" y="14" width="7" height="7" rx="1.5"></rect><rect x="14" y="14" width="7" height="7" rx="1.5"></rect></svg>';
    function navBtn(view,color,svg,label){var b=document.createElement('button');b.className='navbtn';b.setAttribute('data-view',view);b.innerHTML='<span class="navico" style="--acc:var('+color+')">'+svg+'</span>'+label;return b;}
    var BADGE={};
    if(!nav.querySelector('[data-view="forms"]')){
      var forms=navBtn('forms','--formsc',formsSVG,'Forms');
      var maint=navBtn('maintenance','--maintc',maintSVG,'Maintenance');
      var org=null;[].slice.call(nav.children).forEach(function(c){if((c.textContent||'').trim().indexOf('Org Training')>=0)org=c;});
      if(org){nav.insertBefore(forms,org.nextSibling);nav.insertBefore(maint,forms.nextSibling);}else{nav.appendChild(forms);nav.appendChild(maint);}
      BADGE['Forms']=forms.querySelector('.navico').outerHTML;BADGE['Maintenance']=maint.querySelector('.navico').outerHTML;
    }
    nav.querySelectorAll('.navbtn').forEach(function(el){var t=(el.textContent||'').trim().replace(/NEW$/,'').trim();var ic=el.querySelector('.navico');if(t&&ic&&!BADGE[t])BADGE[t]=ic.outerHTML;});
    var HIDE=['focus board','departures & returns',"today's checklist progress"];
    var allPanels=[].slice.call(document.querySelectorAll('.panel'));
    allPanels.forEach(function(p){var h=(p.querySelector('.ph,h1,h2,h3')||{}).textContent||'';if(HIDE.some(function(k){return h.toLowerCase().indexOf(k)>=0;}))p.dataset.pwHidden='1';});
    var visible=allPanels.filter(function(p){return !p.dataset.pwHidden && getComputedStyle(p).display!=='none';});
    var grid=document.createElement('div');grid.className='pw-grid';board.parentNode.insertBefore(grid,board);board.style.display='none';
    document.querySelectorAll('.panel[data-pw-hidden="1"]').forEach(function(p){p.style.display='none';});
    css('.pw-grid{display:grid;grid-template-columns:repeat('+GCOLS+',minmax(0,1fr));grid-auto-rows:'+ROWPX+'px;gap:'+GAP+'px;padding:16px;align-items:start;}'
      +'.pw-grid>*{margin:0!important;overflow:hidden!important;}'
      +'body.pw-edit .pw-grid>*{outline:2px dashed #14b8a6;outline-offset:2px;border-radius:14px;}'
      +'.pw-chips{position:absolute;top:14px;right:14px;display:none;gap:4px;z-index:5;}body.pw-edit .pw-chips{display:flex;}'
      +'.pw-chip{width:26px;height:24px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;font:600 12px system-ui;cursor:pointer;color:#334155;}.pw-chip.on{background:#14b8a6;color:#fff;border-color:#14b8a6;}'
      +'.pw-x{position:absolute;top:-9px;left:-9px;width:22px;height:22px;border-radius:50%;background:#ef4444;color:#fff;border:none;font:700 13px system-ui;cursor:pointer;display:none;z-index:6;}body.pw-edit .pw-x{display:block;}'
      +'.pw-appwidget{background:#fff;border-radius:14px;box-shadow:var(--shadow);padding:16px;position:relative;}'
      +'.pw-appwidget .pw-aw-head{display:flex;align-items:center;gap:10px;font:700 15px system-ui;color:var(--ink);}'
      +'.pw-appwidget .pw-open{margin-top:12px;display:inline-block;color:var(--teal-ink);font:600 13px system-ui;cursor:pointer;}'
      +'.pw-hot{outline:3px solid #14b8a6!important;background:rgba(20,184,166,.08);border-radius:14px;}'
      +'.pw-toolbar{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;display:flex;gap:8px;background:#0f172a;padding:8px;border-radius:12px;box-shadow:0 6px 20px rgba(0,0,0,.3);}'
      +'.pw-toolbar button{border:none;border-radius:8px;padding:8px 14px;font:600 13px system-ui;cursor:pointer;background:#334155;color:#fff;}.pw-toolbar button.pri{background:#14b8a6;}'
      +'.pw-gback{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:100000;display:none;align-items:center;justify-content:center;}'
      +'.pw-gal{background:#fff;border-radius:16px;padding:22px;width:min(680px,92vw);max-height:80vh;overflow:auto;}'
      +'.pw-gal h3{margin:0 0 14px;font:700 18px system-ui;color:var(--ink);}'
      +'.pw-gtiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}'
      +'.pw-gtile{border:1px solid var(--line);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:8px;cursor:pointer;font:600 14px system-ui;color:var(--ink);}'
      +'.pw-gtile:hover{border-color:#14b8a6;background:#f0fdfa;}');
    var W=[];var drag=null;
    function rowsFor(p,w){var colW=(grid.clientWidth-32-(GCOLS-1)*GAP)/GCOLS;var target=colW*w+(w-1)*GAP;var pw=p.style.width,pgc=p.style.gridColumn,pgr=p.style.gridRow;p.style.gridColumn='';p.style.gridRow='';p.style.width=target+'px';var h=p.scrollHeight;p.style.width=pw;p.style.gridColumn=pgc;p.style.gridRow=pgr;return Math.max(2,Math.ceil((h+GAP)/(ROWPX+GAP)));}
    function autoPack(){var occ={};function fits(cs,rs,w,h){for(var c=cs;c<cs+w;c++)for(var r=rs;r<rs+h;r++)if(occ[c+','+r])return false;return true;}function mark(cs,rs,w,h){for(var c=cs;c<cs+w;c++)for(var r=rs;r<rs+h;r++)occ[c+','+r]=1;}W.forEach(function(it){it.h=rowsFor(it.p,it.w);var pl=false;for(var r=1;r<400&&!pl;r++)for(var c=1;c<=GCOLS-it.w+1&&!pl;c++){if(fits(c,r,it.w,it.h)){it.cs=c;it.rs=r;mark(c,r,it.w,it.h);pl=true;}}});}
    function applyLayout(){W.forEach(function(it){it.p.style.gridColumn=it.cs+' / span '+it.w;it.p.style.gridRow=it.rs+' / span '+it.h;});}
    function s2s(s){return s==='S'?1:s==='M'?2:4;}function sp2s(w){return w===1?'S':w===2?'M':'L';}
    function addWidget(p,w){grid.appendChild(p);p.style.position='relative';var it={p:p,w:w||2,cs:1,rs:1,h:2};W.push(it);
      var chips=document.createElement('div');chips.className='pw-chips';['S','M','L'].forEach(function(s){var b=document.createElement('button');b.className='pw-chip';b.textContent=s;if(sp2s(it.w)===s)b.classList.add('on');b.onclick=function(e){e.stopPropagation();it.w=s2s(s);autoPack();applyLayout();chips.querySelectorAll('.pw-chip').forEach(function(x){x.classList.remove('on');});b.classList.add('on');};chips.appendChild(b);});p.appendChild(chips);
      var x=document.createElement('button');x.className='pw-x';x.textContent='\u00d7';x.onclick=function(e){e.stopPropagation();W=W.filter(function(z){return z!==it;});p.remove();autoPack();applyLayout();};p.appendChild(x);
      p.draggable=true;p.addEventListener('dragstart',function(e){if(!document.body.classList.contains('pw-edit')){e.preventDefault();return;}drag=it;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text','x');});return it;}
    visible.forEach(function(p){addWidget(p,2);});
    function cellFromPointer(x,y){var r=grid.getBoundingClientRect();var colW=(r.width-32-(GCOLS-1)*GAP)/GCOLS;var c=Math.floor((x-r.left-16)/(colW+GAP))+1;c=Math.max(1,Math.min(GCOLS,c));var rr=Math.floor((y-r.top-16)/(ROWPX+GAP))+1;return{c:c,r:Math.max(1,rr)};}
    grid.addEventListener('dragover',function(e){if(!drag)return;e.preventDefault();var cell=cellFromPointer(e.clientX,e.clientY);drag.p.classList.add('pw-hot');drag.__pc=Math.min(cell.c,GCOLS-drag.w+1);drag.__pr=cell.r;});
    grid.addEventListener('drop',function(e){if(!drag)return;e.preventDefault();drag.p.classList.remove('pw-hot');drag.cs=drag.__pc||drag.cs;drag.rs=drag.__pr||drag.rs;var fixed=drag,occ={};function mk(it){for(var c=it.cs;c<it.cs+it.w;c++)for(var r=it.rs;r<it.rs+it.h;r++)occ[c+','+r]=1;}function ft(cs,rs,w,h){for(var c=cs;c<cs+w;c++)for(var r=rs;r<rs+h;r++)if(occ[c+','+r])return false;return true;}mk(fixed);W.filter(function(z){return z!==fixed;}).forEach(function(it){for(var r=1;r<400;r++){var d=false;for(var c=1;c<=GCOLS-it.w+1;c++){if(ft(c,r,it.w,it.h)){it.cs=c;it.rs=r;mk(it);d=true;break;}}if(d)break;}});applyLayout();drag=null;});
    autoPack();applyLayout();
    window.addEventListener('resize',function(){autoPack();applyLayout();});
    var tb=document.createElement('div');tb.className='pw-toolbar';var addBtn=document.createElement('button');addBtn.className='pri';addBtn.textContent='+ Add widget';var editBtn=document.createElement('button');editBtn.textContent='Edit widgets';tb.appendChild(addBtn);tb.appendChild(editBtn);document.body.appendChild(tb);
    editBtn.onclick=function(){var on=document.body.classList.toggle('pw-edit');editBtn.textContent=on?'Done':'Edit widgets';};
    var APPS=['Individuals','Checklists','Ledgers','Residential Day Planner','Training','OT Dashboard','Life Plan Tracker','Staff','Org Training','Forms','Maintenance'];
    var gb=document.createElement('div');gb.className='pw-gback';var gal=document.createElement('div');gal.className='pw-gal';gal.innerHTML='<h3>Add a widget</h3>';var tiles=document.createElement('div');tiles.className='pw-gtiles';gal.appendChild(tiles);gb.appendChild(gal);document.body.appendChild(gb);
    gb.onclick=function(e){if(e.target===gb)gb.style.display='none';};
    function badgeNode(name){var h=BADGE[name];if(!h)return null;var t=document.createElement('div');t.innerHTML=h.trim();return t.firstChild;}
    APPS.forEach(function(name){var t=document.createElement('div');t.className='pw-gtile';var b=badgeNode(name);if(b)t.appendChild(b);var lbl=document.createElement('span');lbl.textContent=name;t.appendChild(lbl);
      t.onclick=function(){gb.style.display='none';var p=document.createElement('div');p.className='pw-appwidget';var head=document.createElement('div');head.className='pw-aw-head';var hb=badgeNode(name);if(hb)head.appendChild(hb);head.appendChild(document.createTextNode(name));var open=document.createElement('div');open.className='pw-open';open.textContent='Open '+name+' \u2192';p.appendChild(head);p.appendChild(open);var it=addWidget(p,2);if(!document.body.classList.contains('pw-edit'))editBtn.click();autoPack();applyLayout();p.classList.add('pw-hot');setTimeout(function(){p.classList.remove('pw-hot');},900);};
      tiles.appendChild(t);});
    addBtn.onclick=function(){gb.style.display='flex';};
    if(!nav.querySelector('[data-view="widgets"]')){var wb=navBtn('widgets','--widgetsc',gridSVG,'Widgets');var mm=nav.querySelector('[data-view="maintenance"]');if(mm&&mm.nextSibling)nav.insertBefore(wb,mm.nextSibling);else nav.appendChild(wb);wb.addEventListener('click',function(e){e.preventDefault();if(!document.body.classList.contains('pw-edit'))editBtn.click();gb.style.display='flex';});}
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,600);});}else{setTimeout(boot,600);}
})();
