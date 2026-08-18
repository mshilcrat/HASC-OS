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
