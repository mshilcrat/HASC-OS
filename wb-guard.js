(function(){
  if(!window.supabase || !window.HASC_CONFIG) return;
  var sb = window.supabase.createClient(window.HASC_CONFIG.SUPABASE_URL, window.HASC_CONFIG.SUPABASE_ANON_KEY);
  window.__hascClient = sb;
  sb.auth.getSession().then(function(res){
    var session = res && res.data ? res.data.session : null;
    if(!session){ location.replace("/wb-login.html"); return; }
    var uid = session.user.id;
    var p=location.pathname; if(p==="/"||/\/(index\.html)?$/.test(p)){ return; }
    return sb.from("profiles").select("role,residences,department").eq("email", session.user.email).single().then(function(p){
      var row = p && p.data ? p.data : {};
      var role = row.role || "";
      var department = row.department || "";
      sessionStorage.setItem("hasc_role", role); var acEmail=((session&&session.user&&session.user.email)||"").toLowerCase(); sessionStorage.setItem("hasc_email", acEmail); var AC_EMAILS=["arosenzweig@hasccenter.org","ssinger@hasccenter.org","llebovits@hasccenter.org","slieber@hasccenter.org"]; var isAC=(role==="area_coordinator")||(AC_EMAILS.indexOf(acEmail)>=0);
      sessionStorage.setItem("hasc_homes", JSON.stringify(row.residences || []));
      sessionStorage.setItem("hasc_department", department);
      var path = location.pathname;
      if(department === "Day Hab"){
        if(path.indexOf("/Day Hab/") === -1){ location.replace("/Day Hab/index.html"); }
        return;
      }
      var adminPages = ["wb-hub-mark2.html","wb-today-mark2.html","wb-insights-mark2.html","wb-documents-mark2.html","wb-checklists-mark2.html","wb-inbox-mark2.html"];
      if(role === "admin"){
        var allowed = adminPages.some(function(pg){ return path.indexOf(pg) !== -1; });
        if(!allowed){ location.replace("/checklists/wb-hub-mark2.html"); }
      } else {
        if(isAC){ var acPages=["wb-hub-AC-mark2.html","wb-today-mark2.html","wb-insights-mark2.html","wb-documents-mark2.html","wb-checklists-mark2.html","wb-checkoff.html"]; var acOnAllowed=acPages.some(function(pg){ return path.indexOf(pg)!==-1; }); if(path.indexOf("wb-hub-mark2.html")!==-1 || !acOnAllowed){ location.replace("/checklists/wb-hub-AC-mark2.html"); } } else { if(path.indexOf("wb-checkoff.html") === -1){ location.replace("/checklists/wb-checkoff.html"); } }
      }
    });
  }).catch(function(){ location.replace("/wb-login.html"); });
})();


/* Identity paint: show the logged-in user's name + role from their profile */
(function(){
  var want=null;
  function tc(x){return String(x||'').replace(/_/g,' ').replace(/\b\w/g,function(m){return m.toUpperCase();});}
  function setTxt(id,val){var el=document.getElementById(id);if(el&&val&&el.textContent!==val){el.textContent=val;}}
  function paint(){
    if(!want)return;
    var hm=document.querySelector('.hmeta');
    if(hm){var html='<b>'+tc(want.role)+'</b> '+want.name;if(hm.innerHTML!==html){hm.innerHTML=html;}}
    setTxt('meName',want.name);setTxt('meRole',tc(want.role));setTxt('helloName',want.first);
  }
  function getClient(){
    if(window.__hascClient)return window.__hascClient;
    if(window.supabase&&window.supabase.createClient&&window.HASC_CONFIG){
      try{return window.supabase.createClient(window.HASC_CONFIG.SUPABASE_URL||'https://xqcykvgsesavtuautivq.supabase.co', window.HASC_CONFIG.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxY3lrdmdzZXNhdnR1YXV0aXZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMzc1ODUsImV4cCI6MjA5MTkxMzU4NX0.A6FkxttGZMGaPxqr1orOWlpoO_zZSeqbp5W3L7s6U5w');}catch(e){}
    }
    return null;
  }
  async function resolve(){
    try{
      var c=getClient(); if(!c||!c.auth)return;
      var ses=await c.auth.getSession();var sn=ses&&ses.data&&ses.data.session;
      if(!sn||!sn.user||!sn.user.email)return;
      var r=await c.from('profiles').select('full_name,role').eq('email',sn.user.email).limit(1);
      if(r.error)return;var row=r.data&&r.data[0];if(!row)return;
      var nm=row.full_name||sn.user.email;var first=String(nm).trim().split(/\s+/)[0];
      want={name:nm,role:row.role||'',first:first};paint();
    }catch(e){}
  }
  var t=0,waitLib=setInterval(function(){t++;if(getClient()){clearInterval(waitLib);resolve();}else if(t>40){clearInterval(waitLib);}},250);
  var n=0,iv=setInterval(function(){n++;paint();if(n>40||(want&&n>8&&document.getElementById('meName')&&document.getElementById('meName').textContent===want.name)){clearInterval(iv);}},500);
})();
