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

  function getProfile(){
    profile=window.__hascProfile||profile;
    sb=window.__hascClient||sb;
    return profile;
  }
  function currentPrefs(){
    var p=getProfile();
    if(!p) return DEFAULT_APPS.slice();
    if(Array.isArray(p.apps)) return p.apps.slice();
    return DEFAULT_APPS.slice();
  }
  function shouldManageRail(){
    var p=getProfile();
    return !!p && String(p.role||'').toLowerCase()!=='admin';
  }
  function applyRail(){
    if(!shouldManageRail()) return;
    prefs=prefs||currentPrefs();
    document.querySelectorAll('#navRail .navbtn[data-view]').forEach(function(b){
      var key=b.getAttribute('data-view');
      b.style.display=(CORE_ALWAYS.indexOf(key)>=0 || prefs.indexOf(key)>=0)?'':'none';
    });
    var sys=document.querySelector('#navRail .navbtn[data-view="system"]');
    if(sys) sys.style.display='none';
  }
  function syncMenu(){
    if(!shouldManageRail()) return;
    prefs=prefs||currentPrefs();
    var pin=document.getElementById('appsPin');
    if(!pin) return;

    /* Individuals is a real rail app but is missing from the original app catalog. */
    if(!pin.querySelector('input[data-app="individuals"]')){
      var row=document.createElement('label');
      row.className='approw';
      row.innerHTML='<span class="approw-l"><span class="cfgp" style="--acc:var(--indigo)">👤</span>Individuals</span><input type="checkbox" data-app="individuals">';
      pin.insertBefore(row,pin.firstChild);
    }

    pin.querySelectorAll('input[data-app]').forEach(function(cb){
      cb.checked=prefs.indexOf(cb.getAttribute('data-app'))>=0;
      if(!cb.__hascPersist){
        cb.__hascPersist=true;
        cb.addEventListener('change',function(){
          setTimeout(function(){
            var chosen=[];
            pin.querySelectorAll('input[data-app]:checked').forEach(function(x){chosen.push(x.getAttribute('data-app'));});
            prefs=chosen;
            savePrefs();
            applyRail();
          },0);
        });
      }
    });
  }
  async function savePrefs(){
    if(saving) return;
    var p=getProfile();
    if(!p||!sb||!p.email) return;
    saving=true;
    try{
      var r=await sb.from('profiles').update({apps:prefs}).eq('email',p.email);
      if(r.error) throw r.error;
      p.apps=prefs.slice();
      window.__hascProfile=p;
      try{sessionStorage.setItem('hasc_apps',JSON.stringify(prefs));}catch(e){}
    }catch(e){
      console.error('HASC rail preference save failed',e);
    }finally{saving=false;}
  }

  function getShabbosFrame(){return document.getElementById('shabbosFrame');}
  function patchShabbosFrame(){
    var f=getShabbosFrame();
    if(!f) return;
    try{
      var d=f.contentDocument;
      if(!d||!d.body) return;
      if(d.__hascPatched) return;
      d.__hascPatched=true;

      /* The Mark 4 shell already supplies the header. */
      var hdr=d.querySelector('header.top');
      if(hdr) hdr.style.display='none';
      var wrap=d.querySelector('.wrap');
      if(wrap){wrap.style.maxWidth='1100px';wrap.style.paddingTop='1px';}

      /* Management view does not need a Read & Sign tab. The staff sign-off flow remains untouched. */
      var read=d.getElementById('tabRead');
      if(read) read.style.display='none';

      /* Residence QR generator: keep one-residence-at-a-time organization and place policy printing beneath it. */
      if(/qr_code_generator\.html/i.test(f.src)){
        var actions=d.querySelector('.row.actions');
        if(actions && !d.getElementById('hascPrintPolicy')){
          var btn=d.createElement('button');
          btn.id='hascPrintPolicy';
          btn.className='btn btn-ghost';
          btn.textContent='Print Shabbos Policy';
          btn.onclick=function(){
            var w=window.open('/Shabbos/shabbos_signoff.html#admin','_blank');
            if(!w) return;
            var tries=0;
            var t=setInterval(function(){
              tries++;
              try{
                if(w.document && w.document.readyState==='complete'){
                  clearInterval(t);
                  var h=w.document.querySelector('header.top'); if(h)h.style.display='none';
                  var bar=w.document.getElementById('adminBar'); if(bar)bar.style.display='none';
                  var sign=w.document.getElementById('signbox'); if(sign)sign.style.display='none';
                  var prog=w.document.getElementById('progWrap'); if(prog)prog.style.display='none';
                  var records=w.document.getElementById('recordsView'); if(records)records.style.display='none';
                  var gate=w.document.getElementById('gate'); if(gate)gate.style.display='none';
                  var readView=w.document.getElementById('readView'); if(readView)readView.style.display='block';
                  w.focus(); w.print();
                }
              }catch(e){}
              if(tries>40) clearInterval(t);
            },150);
          };
          actions.appendChild(btn);
        }
      }

      /* Sign-off record visibility is enforced by Supabase RLS; label the view clearly for RMs. */
      if(/shabbos_signoff\.html/i.test(f.src)){
        var rec=d.querySelector('#recordsView .records .rec');
        if(rec && shouldManageRail()) rec.textContent='Your residence sign-off records.';
      }
    }catch(e){console.warn('HASC Shabbos iframe patch failed',e);}
  }
  function wireShabbos(){
    var f=getShabbosFrame();
    if(f && !f.__hascLoad){f.__hascLoad=true;f.addEventListener('load',function(){setTimeout(patchShabbosFrame,50);});}
    patchShabbosFrame();
  }

  function tick(){
    getProfile();
    if(profile){
      if(!prefs) prefs=currentPrefs();
      applyRail();
      syncMenu();
    }
    wireShabbos();
  }

  document.addEventListener('click',function(e){
    var t=e.target&&e.target.closest?e.target.closest('#appsLauncher,button[data-view="shabbos"],#sbCodes,#sbRecords'):null;
    if(!t) return;
    setTimeout(function(){syncMenu();wireShabbos();},80);
    setTimeout(function(){syncMenu();wireShabbos();},400);
  },true);

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',tick); else tick();
  setTimeout(tick,400);
  setTimeout(tick,1200);
  setInterval(tick,2000);
})();
