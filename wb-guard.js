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
