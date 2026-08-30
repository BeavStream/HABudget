
(function(){
  "use strict";

  var MONTHS = ["Januari","Februari","Mars","April","Maj","Juni","Juli","Augusti","September","Oktober","November","December"];
  var EXPENSE_CATS = ["Livsmedel","Restaurang/Café","Kläder & skor","Hälsa/Tandvård","Bensin/Drivmedel",
    "Kollektivtrafik/Parkering","Nöje/Fritid","Barn","Presenter","Hushållsartiklar","Möbler/Underhåll","Semester/Resor","Arbetsresa/utlägg","Övrigt"];
  var PERSON_HUES = ["#2F6F5A","#8A5A1E","#4A5FA0","#A5392A","#6E4A96","#2E7D8C"];

  // ---------- lock screen ----------
  var DEFAULT_LOCK_HASH = "339a8706b910c6b8782608465bb44d9838738a49d1cb26557411eb474deb2494";
  var LOCK_KEY = "hb-lock-until";
  var LOCK_DAYS = 30;
  function isUnlocked(){
    try { var v = localStorage.getItem(LOCK_KEY); return !!v && parseInt(v,10) > Date.now(); }
    catch(e){ return false; }
  }
  function setUnlocked(){
    try { localStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_DAYS*24*60*60*1000)); } catch(e){}
  }
  function sha256Hex(text){
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", bytes).then(function(buf){
      return Array.prototype.map.call(new Uint8Array(buf), function(b){ return b.toString(16).padStart(2,"0"); }).join("");
    });
  }
  function renderLockScreen(errorMsg){
    var app = document.getElementById('app');
    app.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;">' +
        '<form id="lock-form" class="card" style="max-width:340px;width:100%;padding:28px 24px;">' +
          '<div style="font-family:var(--font-display);font-weight:700;font-size:22px;margin-bottom:4px;">Koll på Berget</div>' +
          '<p style="font-size:13px;color:var(--text-muted);margin:0 0 18px;">Ange lösenordet för att fortsätta.</p>' +
          '<div class="field" style="margin-bottom:14px;">' +
            '<label style="font-size:12px;color:var(--text-muted);">Lösenord</label>' +
            '<input id="lock-pw" type="password" autocomplete="current-password" style="width:100%;">' +
          '</div>' +
          '<button type="submit" class="btn primary" style="width:100%;box-sizing:border-box;">Lås upp</button>' +
          '<div id="lock-error" style="color:var(--danger);font-size:12.5px;margin-top:10px;min-height:16px;">' + esc(errorMsg||"") + '</div>' +
          '<p style="font-size:11px;color:var(--text-muted);margin:16px 0 0;">Lösenordet sparas i den här webbläsaren i ' + LOCK_DAYS + ' dagar.</p>' +
        '</form>' +
      '</div>';
    var form = document.getElementById('lock-form');
    var pwInp = document.getElementById('lock-pw');
    pwInp.focus();
    form.addEventListener('submit', function(ev){
      ev.preventDefault();
      var val = pwInp.value;
      if (!window.crypto || !window.crypto.subtle) { renderLockScreen("Den här webbläsaren stöds tyvärr inte."); return; }
      sha256Hex(val).then(function(hash){
        if (hash === state.lockHash) { setUnlocked(); bootApp(); }
        else { renderLockScreen("Fel lösenord, försök igen."); }
      });
    });
  }

  var state = { people: [], incomes: [], fixedCosts: [], fixedOverrides: [], loans: [], expenses: [], goals: [],
    trackingStart: "", lockHash: DEFAULT_LOCK_HASH };
  var ui = loadUi();
  applyTheme();
  var mobileNavOpen = false; // transient - not persisted, always starts closed
  var canPublish = false;
  var publishChecked = false;
  var unlockedYet = false; // becomes true once the user has passed the lock screen

  function detectTheme(){
    try { return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? "dark" : "light"; }
    catch(e){ return "light"; }
  }
  function applyTheme(){
    try { document.body.dataset.appTheme = (ui.theme === "dark") ? "dark" : "light"; } catch(e){}
  }
  function loadUi(){
    var d = { view:"oversikt", person:"Hushåll", month: monthKeyFromDate(new Date()), year: String(new Date().getFullYear()), periodMode:"month",
      exportPeriod:"all", exportYear: String(new Date().getFullYear()), exportMonth: monthKeyFromDate(new Date()), editing:null, modal:null, theme: detectTheme() };
    try {
      var raw = localStorage.getItem('hb-ui');
      if (raw) { var p = JSON.parse(raw); for (var k in p) d[k] = p[k]; }
    } catch(e){}
    d.modal = null;
    if (!d.person) d.person = "Hushåll";
    if (d.theme !== "light" && d.theme !== "dark") d.theme = detectTheme();
    // Alltid starta på dagens verkliga månad - man kan navigera bort under sessionen,
    // men nästa gång appen öppnas på nytt ska den peka på "nu", inte senast tittade månad.
    d.month = monthKeyFromDate(new Date());
    return d;
  }
  function saveUi(){ try { localStorage.setItem('hb-ui', JSON.stringify(ui)); } catch(e){} }

  function uid(){ return Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }
  function monthKeyFromDate(d){ return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0"); }
  function monthLabel(key){ var p = key.split("-"); return MONTHS[parseInt(p[1],10)-1] + " " + p[0]; }
  function shiftMonth(key, delta){
    var p = key.split("-"); var y = parseInt(p[0],10); var m = parseInt(p[1],10)-1;
    var d = new Date(y, m+delta, 1); return monthKeyFromDate(d);
  }
  function yearMonths(year){
    var out = [];
    for (var m=1; m<=12; m++) out.push(year + "-" + String(m).padStart(2,"0"));
    return out;
  }
  function yearMonthsElapsed(year){
    var y = parseInt(year,10);
    var now = new Date();
    var curY = now.getFullYear(), curM = now.getMonth()+1;
    var maxM = y < curY ? 12 : (y === curY ? curM : 0);
    var out = [];
    for (var m=1; m<=maxM; m++) out.push(year + "-" + String(m).padStart(2,"0"));
    return out;
  }
  function todayStr(){ var d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function fmtKr(n){
    n = n || 0;
    var rounded = Math.round(n * 100) / 100;
    var opts = (Math.round(rounded) === rounded) ? {minimumFractionDigits:0, maximumFractionDigits:0} : {minimumFractionDigits:2, maximumFractionDigits:2};
    return rounded.toLocaleString('sv-SE', opts) + " kr";
  }
  function fmtPct(n){ return (Math.round((n||0)*1000)/10) + " %"; }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  var HOUSEHOLD_VIEW = "Hushåll";
  function personColor(name){
    if (name === HOUSEHOLD_VIEW) return "#5B6B60";
    var idx = 0, list = state.people || [];
    var i = list.indexOf(name);
    idx = i >= 0 ? i : Math.abs(hashStr(name||"")) ;
    return PERSON_HUES[idx % PERSON_HUES.length];
  }
  function hashStr(s){ var h=0; for (var i=0;i<s.length;i++){ h = (h<<5)-h + s.charCodeAt(i); h|=0; } return h; }
  function initials(name){ if(!name) return "?"; if (name === HOUSEHOLD_VIEW) return "H"; var parts = name.trim().split(/\s+/); return (parts[0][0]+(parts[1]?parts[1][0]:"")).toUpperCase(); }
  function currentAuthor(){ return (state.people||[]).indexOf(ui.person) >= 0 ? ui.person : ((state.people||[])[0] || ""); }
  function activeFilter(){ return ui.person === HOUSEHOLD_VIEW ? null : ui.person; }
  function filterByPerson(arr){ var f = activeFilter(); return f ? (arr||[]).filter(function(x){ return x.person === f; }) : (arr||[]); }

  function sum(arr, fn){ return arr.reduce(function(a,x){ return a + (fn(x)||0); }, 0); }

  // ---------- derived data ----------
  function activeInMonth(startdatum, mk){
    var floor = state.trackingStart ? state.trackingStart.slice(0,7) : null;
    var itemStart = startdatum ? startdatum.slice(0,7) : null;
    var effectiveStart = itemStart && (!floor || itemStart > floor) ? itemStart : floor;
    return !effectiveStart || mk >= effectiveStart;
  }
  function incomeTotalInMonth(mk, list){ return sum((list || state.incomes || []).filter(function(x){ return x.manad===mk; }), function(x){ return x.belopp; }); }
  function incomeTotalInYear(year, list){
    var items = list || state.incomes || [];
    return sum(items.filter(function(x){ return (x.manad||"").slice(0,4)===String(year); }), function(x){ return x.belopp; });
  }
  function monthlyFixed(list){ return sum(list || state.fixedCosts, function(x){ return x.belopp; }); }
  function findOverride(itemId, mk){ return (state.fixedOverrides||[]).filter(function(o){ return o.itemId===itemId && o.manad===mk; })[0] || null; }
  function fixedEffectiveAmount(item, mk){
    var ov = findOverride(item.id, mk);
    if (ov) return ov.belopp;
    if (!activeInMonth(item.startdatum, mk)) return 0;
    return item.belopp;
  }
  function fixedTotalInMonth(mk, list){ return sum(list || state.fixedCosts, function(item){ return fixedEffectiveAmount(item, mk); }); }
  function monthlyLoanBase(mk, list){ return sum(list || state.loans, function(x){ return activeInMonth(x.startdatum, mk) ? x.ordinarie : 0; }); }
  function loanTotalInYear(year, list){
    var items = list || state.loans || [];
    var total = 0;
    yearMonthsElapsed(year).forEach(function(mk){ total += sum(items, function(l){ return activeInMonth(l.startdatum, mk) ? l.ordinarie : 0; }); });
    return total;
  }
  function loanExtraInMonth(mk, list){
    var t = 0;
    (list || state.loans || []).forEach(function(l){
      (l.historik||[]).forEach(function(h){ if (h.datum && h.datum.slice(0,7) === mk) t += h.belopp; });
    });
    return t;
  }
  function expensesInMonth(mk){ return (state.expenses||[]).filter(function(e){ return e.datum && e.datum.slice(0,7) === mk; }); }
  function expensesInYear(year){ return (state.expenses||[]).filter(function(e){ return e.datum && e.datum.slice(0,4) === String(year); }); }
  function loanExtraInYear(year, list){
    var t = 0;
    (list || state.loans || []).forEach(function(l){
      (l.historik||[]).forEach(function(h){ if (h.datum && h.datum.slice(0,4) === String(year)) t += h.belopp; });
    });
    return t;
  }
  function fixedTotalInYear(year, list){
    var items = list || state.fixedCosts || [];
    var total = 0;
    yearMonthsElapsed(year).forEach(function(mk){ total += sum(items, function(item){ return fixedEffectiveAmount(item, mk); }); });
    return total;
  }
  function totalDebt(list){ return sum(list || state.loans, function(x){ return x.nuvarande; }); }
  function monthsBetween(d1, d2){
    var a = new Date(d1), b = new Date(d2);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    var m = (b.getFullYear()-a.getFullYear())*12 + (b.getMonth()-a.getMonth());
    if (b.getDate() < a.getDate()) m -= 1;
    return m;
  }
  function loanAmortizationEstimate(loan){
    // Manual override wins over everything: if the exact total interest is known
    // (e.g. copied straight from Klarna), use it directly instead of estimating it.
    if (loan.rantaOverride > 0) {
      var paidSoFarM = Math.max(0, loan.ursprungligt - loan.nuvarande);
      var progressM = loan.ursprungligt > 0 ? Math.min(1, paidSoFarM / loan.ursprungligt) : 0;
      return {
        interestSoFar: loan.rantaOverride * progressM,
        monthsSoFar: loan.startdatum ? Math.max(0, monthsBetween(loan.startdatum, todayStr()) || 0) : null,
        interestRemaining: loan.rantaOverride * (1 - progressM),
        monthsRemaining: loan.slutdatum ? Math.max(0, monthsBetween(todayStr(), loan.slutdatum) || 0) : null,
        totalInterest: loan.rantaOverride,
        method: "override"
      };
    }
    // Prefer start/end date if both are set: total interest = (installments over the
    // whole term) minus principal - this matches how lenders like Klarna disclose cost
    // of credit far better than re-deriving it from a rate/compounding assumption.
    if (loan.startdatum && loan.slutdatum) {
      var totalMonths = monthsBetween(loan.startdatum, loan.slutdatum);
      if (totalMonths && totalMonths > 0 && loan.ordinarie > 0) {
        var lastPayment = loan.sistaBetalning > 0 ? loan.sistaBetalning : loan.ordinarie;
        var totalPayments = totalMonths > 1 ? (loan.ordinarie * (totalMonths - 1) + lastPayment) : lastPayment;
        var totalInterestD = Math.max(0, totalPayments - loan.ursprungligt);
        var paidSoFar = Math.max(0, loan.ursprungligt - loan.nuvarande);
        var progress = loan.ursprungligt > 0 ? Math.min(1, paidSoFar / loan.ursprungligt) : 0;
        var monthsElapsed = monthsBetween(loan.startdatum, todayStr());
        var monthsRemainingD = Math.max(0, monthsBetween(todayStr(), loan.slutdatum) || 0);
        return {
          interestSoFar: totalInterestD * progress,
          monthsSoFar: monthsElapsed != null ? Math.max(0, monthsElapsed) : null,
          interestRemaining: totalInterestD * (1 - progress),
          monthsRemaining: monthsRemainingD,
          totalInterest: totalInterestD,
          method: "dates"
        };
      }
    }
    // Fallback: simulate standard monthly amortization from the interest rate alone.
    var rate = (loan.ranta || 0) / 100 / 12;
    var M = loan.ordinarie;
    var target = loan.nuvarande;
    if (!(M > 0)) return null;
    if (rate > 0 && M <= target * rate) return null;
    var maxMonths = 1200;
    var balance = loan.ursprungligt;
    var interestSoFar = 0, monthsSoFar = 0;
    while (balance > target + 0.005 && monthsSoFar < maxMonths) {
      var interest = balance * rate;
      var principal = M - interest;
      if (principal <= 0) return null;
      interestSoFar += interest;
      balance -= principal;
      monthsSoFar++;
    }
    var balance2 = target, interestRemaining = 0, monthsRemaining = 0;
    while (balance2 > 0.5 && monthsRemaining < maxMonths) {
      var interest2 = balance2 * rate;
      var principal2 = M - interest2;
      if (principal2 <= 0) return null;
      interestRemaining += interest2;
      balance2 -= principal2;
      monthsRemaining++;
    }
    return {
      interestSoFar: interestSoFar,
      monthsSoFar: monthsSoFar,
      interestRemaining: interestRemaining,
      monthsRemaining: monthsRemaining,
      totalInterest: interestSoFar + interestRemaining,
      method: "rate"
    };
  }
  function totalSaved(list){ return sum(list || state.goals, function(x){ return x.sparat; }); }

  // ---------- export ----------
  function csvField(v){
    v = String(v==null?"":v);
    if (/[;"\n]/.test(v)) return '"' + v.replace(/"/g,'""') + '"';
    return v;
  }
  function csvRow(arr){ return arr.map(csvField).join(";"); }
  function exportPeriodLabel(period){
    if (period.mode === "year") return period.year;
    if (period.mode === "month") return monthLabel(period.month);
    return "Allt";
  }
  function periodExpensesFor(period){
    if (period.mode === "year") return expensesInYear(period.year);
    if (period.mode === "month") return expensesInMonth(period.month);
    return state.expenses || [];
  }
  function inPeriod(datum, period){
    if (!datum) return false;
    if (period.mode === "year") return datum.slice(0,4) === String(period.year);
    if (period.mode === "month") return datum.slice(0,7) === period.month;
    return true;
  }
  function buildExportRows(period){
    period = period || { mode: "all" };
    var rows = [];
    rows.push(["KOLL PÅ BERGET – EXPORT" + (period.mode==="all" ? "" : " (" + exportPeriodLabel(period) + ")")]);
    rows.push(["Exporterad", new Date().toLocaleString('sv-SE')]);
    rows.push([]);

    if (period.mode !== "all") {
      var pMonths = period.mode==="year" ? yearMonthsElapsed(period.year).length : 1;
      var pIncome = period.mode==="year" ? incomeTotalInYear(period.year) : incomeTotalInMonth(period.month);
      var pFixed = period.mode==="year" ? fixedTotalInYear(period.year) : fixedTotalInMonth(period.month);
      var pLoan = period.mode==="year" ? loanTotalInYear(period.year) + loanExtraInYear(period.year) : monthlyLoanBase(period.month) + loanExtraInMonth(period.month);
      var pExpenses = periodExpensesFor(period);
      var pVariable = sum(pExpenses, function(x){ return x.belopp; });
      var pSurplus = pIncome - (pFixed + pLoan + pVariable);
      rows.push(["SAMMANFATTNING – " + exportPeriodLabel(period) + (period.mode==="year" ? " (" + pMonths + " av 12 månader hittills, ingen prognos för resten)" : "")]);
      rows.push(["Inkomster", pIncome]);
      rows.push(["Fasta kostnader", pFixed]);
      rows.push(["Lån & amortering", pLoan]);
      rows.push(["Rörliga kostnader", pVariable]);
      rows.push([pSurplus>=0 ? "Överskott" : "Underskott", pSurplus]);
      rows.push([]);
    }

    rows.push(["HUSHÅLLSMEDLEMMAR"]);
    rows.push(["Namn"]);
    (state.people||[]).forEach(function(p){ rows.push([p]); });
    rows.push([]);
    rows.push(["INSTÄLLNINGAR"]);
    rows.push(["Räkna data från"]);
    rows.push([state.trackingStart||""]);
    rows.push([]);
    rows.push(["INKOMSTER" + (period.mode==="all" ? "" : " (" + exportPeriodLabel(period) + ")")]);
    rows.push(["Person","Källa","Månad","Belopp"]);
    var incRows = (state.incomes||[]).filter(function(x){ return period.mode==="all" || inPeriod(x.manad + "-01", period); }).slice().sort(function(a,b){ return (a.manad||"").localeCompare(b.manad||""); });
    incRows.forEach(function(x){ rows.push([x.person, x.kategori, x.manad, x.belopp]); });
    rows.push(["Summa","","", sum(incRows, function(x){ return x.belopp; })]);
    rows.push([]);
    rows.push(["FASTA KOSTNADER (grundbelopp, nuvarande)"]);
    rows.push(["Kategori","Person","Grundbelopp/mån","Spending-budget"]);
    (state.fixedCosts||[]).forEach(function(x){ rows.push([x.kategori, x.person||"", x.belopp, x.isSpendingBudget?"Ja":""]); });
    rows.push(["Summa grundbelopp","", monthlyFixed(), ""]);
    rows.push([]);
    rows.push(["FASTA KOSTNADER - MÅNADSJUSTERINGAR" + (period.mode==="all" ? "" : " (" + exportPeriodLabel(period) + ")")]);
    rows.push(["Kategori","Månad","Justerat belopp"]);
    (state.fixedOverrides||[]).filter(function(o){ return period.mode==="all" || inPeriod(o.manad + "-01", period); }).slice().sort(function(a,b){ return (a.manad||"").localeCompare(b.manad||""); }).forEach(function(o){
      var item = findItem("fixedCosts", o.itemId);
      rows.push([item ? item.kategori : "(borttagen post)", o.manad, o.belopp]);
    });
    rows.push([]);
    rows.push(["LÅN & SKULDER (nuvarande saldo)"]);
    rows.push(["Namn","Person","Ursprungligt belopp","Ränta (%)","Nuvarande skuld","Ordinarie betalning/mån","Startdatum","Slutdatum","Sista betalning (om annan)","Ränta enligt Klarna (om känd)","Ränta betald hittills (uppsk.)","Total räntekostnad (uppsk.)"]);
    (state.loans||[]).forEach(function(l){
      var a = loanAmortizationEstimate(l);
      rows.push([l.namn, l.person||"", l.ursprungligt, l.ranta, l.nuvarande, l.ordinarie, l.startdatum||"", l.slutdatum||"", l.sistaBetalning||"", l.rantaOverride||"", a?Math.round(a.interestSoFar*100)/100:"", a?Math.round(a.totalInterest*100)/100:""]);
    });
    rows.push([]);
    rows.push(["EXTRA AMORTERINGAR" + (period.mode==="all" ? "" : " (" + exportPeriodLabel(period) + ")")]);
    rows.push(["Lån","Datum","Person","Belopp"]);
    (state.loans||[]).forEach(function(l){ (l.historik||[]).filter(function(h){ return period.mode==="all" || inPeriod(h.datum, period); }).forEach(function(h){ rows.push([l.namn, h.datum, h.person, h.belopp]); }); });
    rows.push([]);
    rows.push(["RÖRLIGA KOSTNADER" + (period.mode==="all" ? "" : " (" + exportPeriodLabel(period) + ")")]);
    rows.push(["Datum","Kategori","Person","Konto","Kommentar","Belopp","Skapad"]);
    periodExpensesFor(period).slice().sort(function(a,b){ return (a.datum||"").localeCompare(b.datum||""); }).forEach(function(e){
      rows.push([e.datum, e.kategori, e.person, e.konto==="gemensamt"?"Gemensamt konto":e.konto==="spending"?"Spending":"Eget konto", e.kommentar||"", e.belopp, e.createdAt||""]);
    });
    rows.push([]);
    rows.push(["SPARANDE & MÅL (nuvarande läge)"]);
    rows.push(["Namn","Person","Målbelopp","Sparat","Sparande/mån","Kommentar"]);
    (state.goals||[]).forEach(function(g){ rows.push([g.namn, g.person||"", g.mal||"", g.sparat, g.manadsSparande||"", g.kommentar||""]); });
    rows.push([]);
    rows.push(["SPARANDE - INSÄTTNINGAR" + (period.mode==="all" ? "" : " (" + exportPeriodLabel(period) + ")")]);
    rows.push(["Sparmål","Datum","Person","Kommentar","Belopp"]);
    (state.goals||[]).forEach(function(g){ (g.historik||[]).filter(function(h){ return period.mode==="all" || inPeriod(h.datum, period); }).forEach(function(h){ rows.push([g.namn, h.datum, h.person, h.kommentar||"", h.belopp]); }); });
    return rows;
  }
  function buildExportContent(period){ return buildExportRows(period).map(csvRow).join("\r\n"); }

  // ---------- import ----------
  function parseCsvLine(line){
    var fields = [];
    var i = 0, n = line.length;
    while (true) {
      var field = "";
      if (line.charAt(i) === '"') {
        i++;
        while (i < n) {
          var c = line.charAt(i);
          if (c === '"') {
            if (line.charAt(i+1) === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += c; i++; }
        }
      } else {
        while (i < n && line.charAt(i) !== ';') { field += line.charAt(i); i++; }
      }
      fields.push(field);
      if (line.charAt(i) === ';') { i++; continue; }
      break;
    }
    return fields;
  }
  function parseImportText(text){
    var rows = text.split(/\r\n|\r|\n/).map(parseCsvLine);
    function isBlank(r){ return r.length <= 1 && (r[0]||"") === ""; }
    var result = { people: [], incomes: [], fixedCosts: [], fixedOverrides: [], loans: [], expenses: [], goals: [] };
    function addPerson(p){ if (p && result.people.indexOf(p) === -1) result.people.push(p); }
    var loanByName = {}, goalByName = {}, fixedByKategori = {};
    var i = 0;
    while (i < rows.length) {
      var r = rows[i];
      if (isBlank(r)) { i++; continue; }
      var head = r[0] || "";
      if (head.indexOf("HUSHÅLLSMEDLEMMAR") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          if (rows[i][0]) addPerson(rows[i][0]);
          i++;
        }
      } else if (head.indexOf("INSTÄLLNINGAR") === 0) {
        i += 2;
        if (i < rows.length && !isBlank(rows[i])) { result.trackingStart = rows[i][0] || ""; i++; }
        while (i < rows.length && !isBlank(rows[i])) { i++; }
      } else if (head.indexOf("INKOMSTER") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          if (row[0] !== "Summa" && row[0]) {
            var belopp = parseFloat(row[3])||0;
            result.incomes.push({ id: uid(), person: row[0], kategori: row[1]||"", manad: row[2]||"", belopp: belopp });
            addPerson(row[0]);
          }
          i++;
        }
      } else if (head.indexOf("FASTA KOSTNADER (grundbelopp") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          if (row[0] !== "Summa grundbelopp" && row[0]) {
            var fc = { id: uid(), kategori: row[0], belopp: parseFloat(row[2])||0, person: row[1]||"" };
            if ((row[3]||"") === "Ja") fc.isSpendingBudget = true;
            result.fixedCosts.push(fc);
            fixedByKategori[row[0]] = fc;
            addPerson(row[1]);
          }
          i++;
        }
      } else if (head.indexOf("FASTA KOSTNADER - MÅNADSJUSTERINGAR") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          var fc2 = fixedByKategori[row[0]];
          if (fc2) result.fixedOverrides.push({ id: uid(), itemId: fc2.id, manad: row[1]||"", belopp: parseFloat(row[2])||0 });
          i++;
        }
      } else if (head.indexOf("LÅN & SKULDER") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          if (row[0]) {
            var loan = {
              id: uid(), namn: row[0], person: row[1]||"",
              ursprungligt: parseFloat(row[2])||0, ranta: parseFloat(row[3])||0,
              nuvarande: parseFloat(row[4])||0, ordinarie: parseFloat(row[5])||0,
              startdatum: row[6]||"", slutdatum: row[7]||"",
              sistaBetalning: parseFloat(row[8])||0, rantaOverride: parseFloat(row[9])||0,
              historik: []
            };
            result.loans.push(loan);
            loanByName[row[0]] = loan;
            addPerson(row[1]);
          }
          i++;
        }
      } else if (head.indexOf("EXTRA AMORTERINGAR") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          var loanObj = loanByName[row[0]];
          if (loanObj) loanObj.historik.push({ id: uid(), datum: row[1]||"", belopp: parseFloat(row[3])||0, person: row[2]||"" });
          i++;
        }
      } else if (head.indexOf("RÖRLIGA KOSTNADER") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          if (row[0]) {
            var kontoLabel = row[3]||"";
            var konto = kontoLabel === "Gemensamt konto" ? "gemensamt" : kontoLabel === "Spending" ? "spending" : "eget";
            result.expenses.push({ id: uid(), datum: row[0], kategori: row[1]||"", person: row[2]||"", konto: konto, kommentar: row[4]||"", belopp: parseFloat(row[5])||0, createdAt: row[6] || new Date().toISOString() });
            addPerson(row[2]);
          }
          i++;
        }
      } else if (head.indexOf("SPARANDE & MÅL") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          if (row[0]) {
            var goal = { id: uid(), namn: row[0], person: row[1]||"", mal: parseFloat(row[2])||0, sparat: parseFloat(row[3])||0, manadsSparande: parseFloat(row[4])||0, kommentar: row[5]||"", historik: [] };
            result.goals.push(goal);
            goalByName[row[0]] = goal;
            addPerson(row[1]);
          }
          i++;
        }
      } else if (head.indexOf("SPARANDE - INSÄTTNINGAR") === 0) {
        i += 2;
        while (i < rows.length && !isBlank(rows[i])) {
          var row = rows[i];
          var goalObj = goalByName[row[0]];
          if (goalObj) goalObj.historik.push({ id: uid(), datum: row[1]||"", belopp: parseFloat(row[4])||0, person: row[2]||"", kommentar: row[3]||"" });
          i++;
        }
      } else {
        i++;
      }
    }
    return result;
  }
  function importSummary(r){
    return r.people.length + " hushållsmedlemmar, " + r.incomes.length + " inkomster, " + r.fixedCosts.length + " fasta kostnader, " + r.loans.length + " lån, " +
      r.expenses.length + " rörliga kostnader, " + r.goals.length + " sparmål" +
      (r.trackingStart !== undefined ? (", startmånad " + (r.trackingStart || "(ingen)")) : "");
  }

  function currentExportPeriod(){
    if (ui.exportPeriod === "year") return { mode:"year", year: ui.exportYear };
    if (ui.exportPeriod === "month") return { mode:"month", month: ui.exportMonth };
    return { mode:"all" };
  }
  function exportView(){
    var period = ui.exportPeriod || "all";
    var yearOpts = "";
    var thisYear = new Date().getFullYear();
    for (var y = thisYear; y >= thisYear - 9; y--) {
      yearOpts += '<option value="' + y + '"' + (String(y)===ui.exportYear?' selected':'') + '>' + y + '</option>';
    }
    var periodCard = '<div class="card form-card"><h3>Period</h3>' +
      '<div class="form-grid">' +
        field('Vad vill du exportera?', '<select id="export-period-select">' +
          '<option value="all"' + (period==="all"?' selected':'') + '>Allt (all tid)</option>' +
          '<option value="year"' + (period==="year"?' selected':'') + '>Ett helt år</option>' +
          '<option value="month"' + (period==="month"?' selected':'') + '>En enskild månad</option>' +
        '</select>') +
        (period==="year" ? field('År', '<select id="export-year-select">' + yearOpts + '</select>') : '') +
        (period==="month" ? field('Månad', '<input id="export-month-select" type="month" value="' + esc(ui.exportMonth) + '">') : '') +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0;">Bra för en årlig "slutrapport": välj "Ett helt år" så får du en sammanfattning överst plus alla rörliga kostnader och extra amorteringar som hör till just det året. Inkomster, fasta kostnader, lån och sparmål visas alltid som de ser ut just nu (de har ingen historik bakåt i tiden).</p></div>';

    var content = buildExportContent(currentExportPeriod());

    return '<div class="topbar"><div><h1>Export &amp; Import</h1><p class="lede">Kopiera data för backup, eller återställ från en tidigare kopierad backup.</p></div></div>' +
      periodCard +
      '<div class="card form-card"><h3>Kopiera data (export)</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0 0 10px;">' +
      'Klicka i rutan (allt markeras automatiskt) och kopiera med Ctrl+C (Cmd+C på Mac), klistra sedan in i Excel, Google Kalkylark eller en anteckning. Semikolon-separerat så kolumnerna hamnar rätt.</p>' +
      '<textarea id="export-textarea" readonly style="width:100%;min-height:220px;font-family:var(--font-mono);font-size:12px;line-height:1.5;resize:vertical;">' + esc(content) + '</textarea>' +
      '<div class="form-actions"><button class="btn primary" type="button" id="export-copy">Kopiera allt</button></div>' +
      '<div id="export-status" style="font-size:13px;color:var(--text-muted);min-height:18px;margin-top:8px;"></div></div>' +
      '<div class="card form-card"><h3>Återställ från backup (import)</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0 0 10px;">' +
      'Om något raderas av misstag: klistra in en tidigare kopierad exporttext här och klicka "Importera". Fungerar bäst med en export av typen "Allt (all tid)" – annars kan vissa uppgifter (t.ex. fasta kostnader eller lån utanför perioden) saknas. Importen ersätter all nuvarande data i appen – ni får bekräfta innan något skrivs över.</p>' +
      '<textarea id="import-textarea" placeholder="Klistra in en tidigare kopierad export här…" style="width:100%;min-height:180px;font-family:var(--font-mono);font-size:12px;line-height:1.5;resize:vertical;"></textarea>' +
      '<div class="form-actions"><button class="btn ghost" type="button" id="import-open" style="color:var(--danger);">Importera</button></div>' +
      '<div id="import-status" style="font-size:13px;color:var(--text-muted);min-height:18px;margin-top:8px;"></div></div>';
  }

  // ---------- persistence (live sync via WebSocket to the local server) ----------
  var ws = null;
  var wsRetryDelay = 1000;
  var wsPingTimer = null;
  var receivingRemote = false; // true while applying a state message from the server, to avoid feedback loops
  var pendingState = null; // last edit we tried to send but haven't had confirmed by the server yet

  function wsUrl(){
    var proto = location.protocol === "https:" ? "wss:" : "ws:";
    var base = location.pathname.replace(/\/+$/, "");
    return proto + "//" + location.host + base + "/ws";
  }
  function activeElementIsFormField(){
    // A render() rebuilds the whole page from scratch, which would wipe out anything
    // the user is mid-typing (e.g. an amount not submitted yet). Connection-status
    // updates arrive asynchronously at any time, so they must never force a render
    // while the user has a field focused - only actions the user themselves triggers
    // (submitting, clicking) are allowed to do that.
    var el = document.activeElement;
    return !!(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT"));
  }
  function connectWs(){
    try { ws = new WebSocket(wsUrl()); } catch(e){ scheduleReconnect(); return; }
    ws.addEventListener('open', function(){
      wsRetryDelay = 1000;
      // Some proxies (e.g. remote-access tunnels) close idle WebSocket connections
      // after a period of inactivity. A small periodic ping keeps the connection
      // classified as active so it doesn't get dropped just from sitting open.
      clearInterval(wsPingTimer);
      wsPingTimer = setInterval(function(){
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
      }, 25000);
      // A local edit made while disconnected (or one whose send never got confirmed
      // before the connection dropped) must not be silently lost - resend it now
      // rather than waiting for the server's next message to (maybe) overwrite it.
      if (pendingState) ws.send(JSON.stringify({ type: "state", state: pendingState }));
    });
    ws.addEventListener('message', function(ev){
      var msg;
      try { msg = JSON.parse(ev.data); } catch(e){ return; }
      if (msg.type === "state" && msg.state) {
        // If we have an unconfirmed local edit newer than what the server just sent,
        // the server hasn't seen it yet (e.g. it arrived from before a reconnect) -
        // keep our version and resend it instead of overwriting it with stale data.
        if (pendingState && (!msg.state.updatedAt || pendingState.updatedAt > msg.state.updatedAt)) {
          canPublish = true;
          publishChecked = true;
          if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "state", state: pendingState }));
          return;
        }
        pendingState = null;
        receivingRemote = true;
        state = msg.state;
        state.fixedOverrides = state.fixedOverrides || [];
        state.trackingStart = state.trackingStart || "";
        state.lockHash = state.lockHash || DEFAULT_LOCK_HASH;
        receivingRemote = false;
        canPublish = true;
        publishChecked = true;
        if (unlockedYet && !activeElementIsFormField()) render();
      }
    });
    ws.addEventListener('close', function(){
      clearInterval(wsPingTimer);
      canPublish = false;
      publishChecked = true;
      if (unlockedYet && !activeElementIsFormField()) render();
      scheduleReconnect();
    });
    ws.addEventListener('error', function(){ try { ws.close(); } catch(e){} });
  }
  function scheduleReconnect(){
    setTimeout(connectWs, wsRetryDelay);
    wsRetryDelay = Math.min(wsRetryDelay * 1.5, 15000);
  }

  function persist(){
    if (receivingRemote) return; // never echo back a state we just received
    state.updatedAt = new Date().toISOString();
    state.updatedBy = currentAuthor() || null;
    render();
    pendingState = state;
    try { localStorage.setItem('hb-state', JSON.stringify(state)); } catch(e){}
    if (canPublish && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "state", state: state }));
    }
  }

  // ---------- rendering ----------
  var NAV = [
    {id:"oversikt", label:"Översikt"},
    {id:"inkomster", label:"Inkomster"},
    {id:"fasta", label:"Fasta kostnader"},
    {id:"rorliga", label:"Rörliga kostnader"},
    {id:"lan", label:"Lån & skulder"},
    {id:"sparande", label:"Sparande & mål"},
    {id:"export", label:"Export/Import"},
    {id:"hushall", label:"Hushåll"}
  ];

  function render(){
    var app = document.getElementById('app');
    app.innerHTML =
      '<div class="shell">' +
        renderNav() +
        '<main class="main">' + renderBanner() + renderView() + '</main>' +
      '</div>' + renderModal();
    bindEvents();
    var af = app.querySelector('.modal-card input, .modal-card [autofocus]');
    if (af) af.focus();
  }

  function renderModal(){
    var mo = ui.modal;
    if (!mo) return "";
    var body = "";
    if (mo.type === "fixedMonth") {
      var fitem = findItem("fixedCosts", mo.itemId);
      if (!fitem) { ui.modal = null; return ""; }
      body = '<h3>Justera denna manad</h3><p class="sub">' + esc(fitem.kategori) + ' - ' + esc(monthLabel(ui.month)) + ' (grundbelopp: ' + fmtKr(fitem.belopp) + ')</p>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Belopp</label><input id="modal-belopp" type="number" min="0" step="0.01" value="' + mo.belopp + '" autofocus style="width:100%;"></div>' +
        '<div class="modal-actions"><button class="btn ghost" data-modal-cancel="1">Avbryt</button><button class="btn primary" data-modal-save="fixedMonth">Spara</button></div>';
    } else if (mo.type === "loanExtra") {
      var litem = findItem("loans", mo.loanId);
      if (!litem) { ui.modal = null; return ""; }
      body = '<h3>Extra amortering</h3><p class="sub">' + esc(litem.namn) + '</p>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Belopp (kr)</label><input id="modal-extra" type="number" min="0" step="0.01" value="" autofocus style="width:100%;"></div>' +
        '<div class="modal-actions"><button class="btn ghost" data-modal-cancel="1">Avbryt</button><button class="btn primary" data-modal-save="loanExtra">Lagg till</button></div>';
    } else if (mo.type === "goalExtra") {
      var gitem = findItem("goals", mo.goalId);
      if (!gitem) { ui.modal = null; return ""; }
      body = '<h3>Extra insättning</h3><p class="sub">' + esc(gitem.namn) + ' - nuvarande sparat: ' + fmtKr(gitem.sparat) + '</p>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Belopp (kr)</label><input id="modal-goal-extra" type="number" min="0" step="0.01" value="" autofocus style="width:100%;"></div>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Kommentar (valfritt)</label><input id="modal-goal-kommentar" placeholder="T.ex. vilket bolag/fond" style="width:100%;"></div>' +
        '<div class="modal-actions"><button class="btn ghost" data-modal-cancel="1">Avbryt</button><button class="btn primary" data-modal-save="goalExtra">Lagg till</button></div>';
    } else if (mo.type === "changePassword") {
      body = '<h3>Byt lösenord</h3><p class="sub">Ändrar lösenordet för hela appen, för alla enheter (från nästa gång de behöver logga in).</p>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Nuvarande lösenord</label><input id="modal-pw-current" type="password" autocomplete="current-password" autofocus style="width:100%;"></div>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Nytt lösenord</label><input id="modal-pw-new" type="password" autocomplete="new-password" style="width:100%;"></div>' +
        '<div class="field"><label style="font-size:12px;color:var(--text-muted);">Bekräfta nytt lösenord</label><input id="modal-pw-confirm" type="password" autocomplete="new-password" style="width:100%;"></div>' +
        '<div id="modal-pw-error" style="color:var(--danger);font-size:12.5px;margin:2px 0 0;min-height:16px;"></div>' +
        '<div class="modal-actions"><button class="btn ghost" data-modal-cancel="1">Avbryt</button><button class="btn primary" data-modal-save="changePassword">Byt lösenord</button></div>';
    } else if (mo.type === "confirmReset") {
      body = '<h3>Rensa all data?</h3><p class="sub">Inkomster, kostnader, lan och sparmal tas bort. Namnen i hushallet paverkas inte. Det gar inte att angra.</p>' +
        '<div class="modal-actions"><button class="btn ghost" data-modal-cancel="1">Avbryt</button><button class="btn primary" style="background:var(--danger);" data-modal-save="confirmReset">Rensa allt</button></div>';
    } else if (mo.type === "confirmImport") {
      var summary = importSummary(mo.parsed);
      body = '<h3>Importera och ersätta all data?</h3><p class="sub">Hittade: ' + esc(summary) + '. Detta ersätter all nuvarande data i appen (inkomster, fasta kostnader, lån, rörliga kostnader och sparmål). Det går inte att ångra.</p>' +
        '<div class="modal-actions"><button class="btn ghost" data-modal-cancel="1">Avbryt</button><button class="btn primary" style="background:var(--danger);" data-modal-save="confirmImport">Importera och ersätt</button></div>';
    } else { return ""; }
    return '<div class="modal-backdrop" data-modal-backdrop="1"><div class="modal-card">' + body + '</div></div>';
  }

  function renderBanner(){
    if (!publishChecked) return "";
    if (canPublish) return "";
    return '<div class="banner local">Ingen kontakt med servern just nu – ändringar sparas bara i den här webbläsaren tills anslutningen är tillbaka.</div>';
  }

  function renderNav(){
    var items = NAV.map(function(n){
      return '<button class="' + (ui.view===n.id?'active':'') + '" data-nav="' + n.id + '"><span class="dot"></span>' + n.label + '</button>';
    }).join("");
    var people = state.people || [];
    var opts = people.concat([HOUSEHOLD_VIEW]).map(function(p){
      return '<option value="' + esc(p) + '"' + (p===ui.person?' selected':'') + '>' + esc(p===HOUSEHOLD_VIEW?"Hushåll (alla)":p) + '</option>';
    }).join("");
    var personLabel = ui.person===HOUSEHOLD_VIEW ? "Hushåll (alla)" : ui.person;
    return '<nav class="nav' + (mobileNavOpen ? ' nav-open' : '') + '">' +
      '<div class="nav-bar">' +
        '<div class="brand">Koll på Berget<span class="sub">Budget &amp; Ekonomi</span></div>' +
        '<button class="nav-mobile-toggle" data-nav-toggle="1" type="button" aria-label="Meny" aria-expanded="' + (mobileNavOpen?'true':'false') + '">' +
          '<span class="avatar" style="width:24px;height:24px;font-size:11px;background:' + personColor(ui.person) + '">' + esc(initials(ui.person)) + '</span>' +
          '<span class="name">' + esc(personLabel) + '</span>' +
          '<span class="hamburger"><span></span><span></span><span></span></span>' +
        '</button>' +
      '</div>' +
      '<div class="nav-collapsible">' +
        '<ul class="navlist" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:2px;">' + items + '</ul>' +
        '<div class="nav-foot">' +
          '<div class="profile"><div class="avatar" style="background:' + personColor(ui.person) + '">' + esc(initials(ui.person)) + '</div>' +
          '<select id="person-select">' + opts + '</select></div>' +
          '<div class="theme-row"><span>' + (ui.theme==="dark"?'Mörkt läge':'Ljust läge') + '</span>' +
            '<button type="button" class="theme-switch" id="theme-toggle" data-state="' + (ui.theme==="dark"?'dark':'light') + '" aria-label="Växla mellan ljust och mörkt läge" aria-pressed="' + (ui.theme==="dark") + '"><span class="thumb"></span></button>' +
          '</div>' +
          '<div class="sync-pill ' + (canPublish?'live':'local') + '">' + (canPublish ? 'Delas live' : (publishChecked ? 'Endast denna enhet' : 'Ansluter…')) + '</div>' +
        '</div>' +
      '</div>' +
    '</nav>';
  }

  function renderView(){
    switch(ui.view){
      case "inkomster": return inkomsterView();
      case "fasta": return fastaView();
      case "rorliga": return rorligaView();
      case "lan": return lanView();
      case "sparande": return sparandeView();
      case "export": return exportView();
      case "hushall": return hushallView();
      default: return oversiktView();
    }
  }

  function monthPicker(){
    return '<div class="month-picker">' +
      '<button data-month-nav="-1" aria-label="Föregående månad">‹</button>' +
      '<span class="label">' + monthLabel(ui.month) + '</span>' +
      '<button data-month-nav="1" aria-label="Nästa månad">›</button>' +
    '</div>';
  }
  function periodPicker(){
    var isYear = ui.periodMode === "year";
    var toggle = '<div class="period-toggle">' +
      '<button class="' + (isYear?'':'active') + '" data-period-mode="month">Månad</button>' +
      '<button class="' + (isYear?'active':'') + '" data-period-mode="year">År</button>' +
    '</div>';
    var nav = isYear
      ? '<div class="month-picker">' +
          '<button data-year-nav="-1" aria-label="Föregående år">‹</button>' +
          '<span class="label">' + esc(ui.year) + '</span>' +
          '<button data-year-nav="1" aria-label="Nästa år">›</button>' +
        '</div>'
      : monthPicker();
    return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">' + toggle + nav + '</div>';
  }

  function oversiktView(){
    var isYear = ui.periodMode === "year";
    var mk = ui.month;
    var yr = ui.year;
    var filter = activeFilter();
    var fIncomes = filterByPerson(state.incomes);
    var fFixed = filterByPerson(state.fixedCosts);
    var fLoans = filterByPerson(state.loans);
    var fGoals = filterByPerson(state.goals);
    var periodExpenses = filterByPerson(isYear ? expensesInYear(yr) : expensesInMonth(mk));
    var periodLabel = isYear ? yr : monthLabel(mk);

    var monthsSoFar = isYear ? yearMonthsElapsed(yr).length : 1;
    var income = isYear ? incomeTotalInYear(yr, fIncomes) : incomeTotalInMonth(mk, fIncomes);
    var fixed = isYear ? fixedTotalInYear(yr, fFixed) : fixedTotalInMonth(mk, fFixed);
    var loan = isYear
      ? loanTotalInYear(yr, fLoans) + loanExtraInYear(yr, fLoans)
      : monthlyLoanBase(mk, fLoans) + loanExtraInMonth(mk, fLoans);
    var variable = sum(periodExpenses, function(x){ return x.belopp; });
    var totalExp = fixed + loan + variable;
    var surplus = income - totalExp;
    var rate = income > 0 ? surplus/income : 0;

    var byPersonMap = {};
    periodExpenses.forEach(function(e){ byPersonMap[e.person] = (byPersonMap[e.person]||0) + e.belopp; });
    var personRows = Object.keys(byPersonMap).sort(function(a,b){return byPersonMap[b]-byPersonMap[a];}).map(function(p){
      return '<div class="kv"><span class="rowchip"><span class="dot" style="background:' + personColor(p) + '"></span>' + esc(p) + '</span><b>' + fmtKr(byPersonMap[p]) + '</b></div>';
    }).join("") || '<div class="empty">Inga rörliga kostnader registrerade ' + (isYear?'':'denna månad') + (isYear?'under ' + esc(yr):'') + '.</div>';

    var recent = filterByPerson(state.expenses).slice().sort(function(a,b){ return (b.createdAt||"").localeCompare(a.createdAt||""); }).slice(0,8);
    var recentRows = recent.map(function(e){
      return '<div class="activity-row"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:' + personColor(e.person) + '"></span>' +
        '<span>' + esc(e.kategori) + (e.kommentar ? ' · <span class="meta">' + esc(e.kommentar) + '</span>' : '') + '</span>' +
        '<span class="meta">' + esc(e.person) + ' · ' + esc(e.datum) + '</span>' +
        '<span class="amt">' + fmtKr(e.belopp) + '</span></div>';
    }).join("") || '<div class="empty">Inga registreringar ännu. Lägg till en rörlig kostnad för att komma igång.</div>';

    var yearNote = isYear ? (monthsSoFar===0 ? ' Inga månader av ' + esc(yr) + ' har passerat än.' : ' Summorna är vad som faktiskt skett hittills (' + monthsSoFar + ' av 12 månader) – inget gissas fram för resten av året.') : '';
    var lede = (filter ? ('Visar bara ' + esc(filter) + '. ') : '') + (isYear ? ('Så ser hushållets ekonomi ut för ' + esc(yr) + ' hittills.' + yearNote) : 'Så ser hushållets ekonomi ut för den valda månaden.');
    return '<div class="topbar"><div><h1>Översikt</h1><p class="lede">' + lede + '</p></div>' + periodPicker() + '</div>' +
      '<div class="stat-grid">' +
        stat("Inkomster", income, "positive", isYear ? (monthsSoFar + " mån hittills") : "per månad") +
        stat("Fasta kostnader", fixed, "", isYear ? (monthsSoFar + " mån hittills") : "per månad") +
        stat("Lån & amortering", loan, "", periodLabel) +
        stat("Rörliga kostnader", variable, "", periodLabel) +
        stat(surplus>=0 ? "Överskott" : "Underskott", Math.abs(surplus), surplus>=0?"positive":"negative", fmtPct(rate) + " sparkvot") +
      '</div>' +
      '<div class="section" style="display:grid;grid-template-columns:1fr 1.4fr;gap:16px;align-items:start;">' +
        '<div class="card" style="padding:16px 18px;"><h3 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Rörligt per person – ' + esc(periodLabel) + '</h3>' + personRows + '</div>' +
        '<div class="card"><h3 style="margin:0;padding:14px 18px 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Senaste registreringar</h3><div class="activity">' + recentRows + '</div></div>' +
      '</div>' +
      '<div class="section"><h2>Skulder &amp; sparande just nu</h2><div class="stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">' +
        stat("Total skuld", totalDebt(fLoans), "", filter ? filter : "alla lån") +
        stat("Totalt sparat", totalSaved(fGoals), "positive", filter ? filter : "alla sparmål") +
      '</div></div>';
  }

  function stat(label, value, cls, sub){
    return '<div class="card stat ' + cls + '"><span class="k">' + esc(label) + '</span><span class="v tabular">' + fmtKr(value) + '</span><span class="sub">' + esc(sub) + '</span></div>';
  }

  function incomeForm(edit){
    var it = edit ? findItem("incomes", edit.id) : null;
    var opts = (state.people||[]).map(function(p){ return '<option ' + ((it?it.person===p:p===currentAuthor())?'selected':'') + '>' + esc(p) + '</option>'; }).join("");
    return '<form class="card form-card" data-form="income" data-id="' + (it?it.id:'') + '">' +
      '<h3>' + (it?'Ändra inkomst':'Lägg till inkomst') + '</h3>' +
      '<div class="form-grid">' +
        field('Person', '<select name="person">' + opts + '</select>') +
        field('Källa', '<input name="kategori" placeholder="Lön, barnbidrag, CSN…" value="' + (it?esc(it.kategori):'') + '" required>') +
        field('Månad', '<input name="manad" type="month" value="' + (it?it.manad:ui.month) + '" required>') +
        field('Belopp', '<input name="belopp" type="number" min="0" step="0.01" value="' + (it?it.belopp:'') + '" required>') +
      '</div>' + formActions(it) + '</form>';
  }
  function inkomsterView(){
    var mk = ui.month;
    var filter = activeFilter();
    var it = ui.editing && ui.editing.type==="income" ? findItem("incomes", ui.editing.id) : null;
    var items = filterByPerson((state.incomes || []).filter(function(x){ return x.manad===mk; }));
    items = items.slice().sort(function(a,b){ return (a.kategori||"").localeCompare(b.kategori||""); });
    var rows = items.map(function(x){
      return '<tr><td>' + esc(x.kategori) + '</td>' +
        '<td><span class="rowchip"><span class="dot" style="background:' + personColor(x.person) + '"></span>' + esc(x.person||"") + '</span></td>' +
        '<td class="num tabular">' + fmtKr(x.belopp) + '</td>' +
        '<td class="num">' +
          '<button class="icon-btn" data-edit="income" data-id="' + x.id + '">Ändra</button> ' +
          '<button class="icon-btn danger" data-del="income" data-id="' + x.id + '">Ta bort</button>' +
        '</td></tr>';
    }).join("");
    var total = sum(items, function(x){ return x.belopp; });
    var table = items.length
      ? '<div class="table-wrap"><table><thead><tr><th>Källa</th><th>Person</th><th class="num">' + esc(monthLabel(mk)) + '</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody><tfoot><tr><td colspan="2">Summa denna manad' + (filter ? ' (' + esc(filter) + ')' : '') + '</td><td class="num">' + fmtKr(total) + '</td><td></td></tr></tfoot></table></div>'
      : '<div class="card empty">' + (filter ? 'Inga inkomster for ' + esc(filter) + ' i ' + monthLabel(mk).toLowerCase() + ' annu.' : 'Inga inkomster registrerade for ' + monthLabel(mk).toLowerCase() + ' annu - lagg till en ovan.') + '</div>';

    var lede = filter
      ? ('Visar bara ' + esc(filter) + '. Byt till "Hushåll (alla)" i menyn for allas inkomster.')
      : 'Logga vad som faktiskt kom in varje manad - ingen automatik, ingen gissning.';
    return '<div class="topbar"><div><h1>Inkomster</h1><p class="lede">' + lede + '</p></div>' + monthPicker() + '</div>' +
      incomeForm(it) + table;
  }

  function fixedForm(edit){
    var it = edit ? findItem("fixedCosts", edit.id) : null;
    var personOpts = (state.people||[]).map(function(p){ return '<option ' + ((it?it.person===p:p===currentAuthor())?'selected':'') + '>' + esc(p) + '</option>'; }).join("");
    return '<form class="card form-card" data-form="fixed" data-id="' + (it?it.id:'') + '">' +
      '<h3>' + (it?'Ändra fast kostnad':'Lägg till fast kostnad') + '</h3>' +
      '<div class="form-grid">' +
        field('Kategori', '<input name="kategori" placeholder="Hyra, försäkring, abonnemang, spendingpengar…" value="' + (it?esc(it.kategori):'') + '" required>') +
        field('Grundbelopp/man', '<input name="belopp" type="number" min="0" step="0.01" value="' + (it?it.belopp:'') + '" required>') +
        field('Person', '<select name="person">' + personOpts + '</select>') +
      '</div>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;margin-top:10px;font-size:12.5px;color:var(--text-muted);cursor:pointer;">' +
        '<input type="checkbox" name="isSpendingBudget" style="width:auto;height:auto;padding:0;border:none;margin-top:2px;"' + (it&&it.isSpendingBudget?' checked':'') + '>' +
        '<span>Det här är en spending-budget – jämförs mot kostnader taggade "Spending" i Rörliga kostnader, så ni ser vad som är kvar.</span>' +
      '</label>' +
      formActions(it) + '</form>';
  }
  function field(label, html){ return '<div class="field"><label>' + esc(label) + '</label>' + html + '</div>'; }
  function formActions(it){
    return '<div class="form-actions"><button type="submit" class="btn primary">' + (it?'Spara ändring':'Lägg till') + '</button>' +
      (it ? '<button type="button" class="btn ghost" data-cancel-edit="1">Avbryt</button>' : '') + '</div>';
  }
  function findItem(key, id){ return (state[key]||[]).filter(function(x){ return x.id===id; })[0] || null; }

  function fastaView(){
    var mk = ui.month;
    var filter = activeFilter();
    var it = ui.editing && ui.editing.type==="fixed" ? findItem("fixedCosts", ui.editing.id) : null;
    var items = filterByPerson(state.fixedCosts || []);
    var anyOverride = items.some(function(x){ return fixedEffectiveAmount(x, mk) !== x.belopp; });
    var rows = items.map(function(x){
      var eff = fixedEffectiveAmount(x, mk);
      var overridden = eff !== x.belopp;
      return '<tr><td>' + esc(x.kategori) + (x.isSpendingBudget ? ' <span class="rowchip" style="color:var(--warn);display:inline-flex;"><span class="dot" style="background:var(--warn);"></span>Spending-budget</span>' : '') + '</td>' +
        '<td><span class="rowchip"><span class="dot" style="background:' + personColor(x.person) + '"></span>' + esc(x.person||"") + '</span></td>' +
        '<td class="num">' + fmtKr(x.belopp) + '</td>' +
        '<td class="num tabular" style="' + (overridden ? 'font-weight:600;color:var(--accent-strong);' : '') + '">' + fmtKr(eff) + (overridden ? ' *' : '') + '</td>' +
        '<td class="num">' +
          '<button class="icon-btn" data-fixed-month="' + x.id + '">Justera denna manad</button> ' +
          '<button class="icon-btn" data-edit="fixed" data-id="' + x.id + '">Andra grundbelopp</button> ' +
          '<button class="icon-btn danger" data-del="fixed" data-id="' + x.id + '">Ta bort</button>' +
        '</td></tr>';
    }).join("");
    var total = fixedTotalInMonth(mk, items);
    var table = items.length
      ? '<div class="table-wrap"><table><thead><tr><th>Kategori</th><th>Person</th><th class="num">Grundbelopp</th><th class="num">' + esc(monthLabel(mk)) + '</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody><tfoot><tr><td colspan="3">Summa fasta kostnader denna manad' + (filter ? ' (' + esc(filter) + ')' : '') + '</td><td class="num">' + fmtKr(total) + '</td><td></td></tr></tfoot></table></div>' +
        (anyOverride ? '<p style="font-size:12px;color:var(--text-muted);margin:8px 2px 0;">* justerat for ' + monthLabel(mk).toLowerCase() + ', skiljer sig fran grundbeloppet.</p>' : '')
      : '<div class="card empty">' + (filter ? 'Inga fasta kostnader for ' + esc(filter) + ' annu.' : 'Inga fasta kostnader annu - lagg till en ovan.') + '</div>';

    var lede = filter
      ? ('Visar bara ' + esc(filter) + '. Byt till "Hushåll (alla)" i menyn för allas fasta kostnader.')
      : 'Grundbeloppet gäller varje månad automatiskt. Skiljer en kostnad sig en enskild månad (t.ex. el) – justera bara den månaden, grundbeloppet påverkas inte.';
    return '<div class="topbar"><div><h1>Fasta kostnader</h1><p class="lede">' + lede + '</p></div>' + monthPicker() + '</div>' +
      fixedForm(it) + table;
  }

  function spendingBudgetSection(mk, filter){
    var flagged = (state.fixedCosts||[]).filter(function(x){ return x.isSpendingBudget; });
    var people = [];
    flagged.forEach(function(x){ if (people.indexOf(x.person) === -1) people.push(x.person); });
    people = people.filter(function(p){ return !filter || p === filter; });
    if (!people.length) return "";
    var cards = people.map(function(p){
      var budget = sum(flagged.filter(function(x){ return x.person === p; }), function(x){ return fixedEffectiveAmount(x, mk); });
      var spent = sum(expensesInMonth(mk).filter(function(e){ return e.konto === "spending" && e.person === p; }), function(e){ return e.belopp; });
      var left = budget - spent;
      var over = left < 0;
      var pct = budget > 0 ? Math.min(100, Math.round(spent/budget*100)) : 0;
      return '<div class="card goal-card">' +
        '<h4>' + esc(p) + '</h4>' +
        '<span class="rowchip" style="margin-bottom:6px;"><span class="dot" style="background:' + personColor(p) + '"></span>Spending – ' + esc(monthLabel(mk)) + '</span>' +
        '<div class="progress"><div style="width:' + pct + '%;' + (over?'background:var(--danger);':'') + '"></div></div>' +
        '<div class="kv"><span>Kvar</span><b style="' + (over?'color:var(--danger);':'color:var(--accent-strong);') + '">' + fmtKr(left) + '</b></div>' +
        '<div class="kv"><span>Spenderat</span><b>' + fmtKr(spent) + ' av ' + fmtKr(budget) + '</b></div>' +
      '</div>';
    }).join("");
    return '<div class="section"><h2>Spending-budget</h2><div class="loan-grid">' + cards + '</div></div>';
  }

  function rorligaView(){
    var mk = ui.month;
    var filter = activeFilter();
    var items = expensesInMonth(mk).filter(function(e){ return !filter || e.person === filter; }).slice().sort(function(a,b){ return b.datum.localeCompare(a.datum); });
    var total = sum(items, function(x){ return x.belopp; });
    var byCat = {};
    items.forEach(function(e){ byCat[e.kategori] = (byCat[e.kategori]||0) + e.belopp; });
    var catRows = Object.keys(byCat).sort(function(a,b){return byCat[b]-byCat[a];}).map(function(c){
      return '<div class="kv"><span>' + esc(c) + '</span><b>' + fmtKr(byCat[c]) + '</b></div>';
    }).join("") || '<div class="empty">Inga kostnader denna månad.</div>';
    var byKonto = {};
    items.forEach(function(e){ var k = e.konto==="gemensamt" ? "Gemensamt konto" : e.konto==="spending" ? "Spending" : "Eget konto"; byKonto[k] = (byKonto[k]||0) + e.belopp; });
    var kontoRows = Object.keys(byKonto).sort().map(function(k){
      return '<div class="kv"><span>' + esc(k) + '</span><b>' + fmtKr(byKonto[k]) + '</b></div>';
    }).join("");

    var it = ui.editing && ui.editing.type==="expense" ? findItem("expenses", ui.editing.id) : null;
    var catOptions = EXPENSE_CATS.map(function(c){ return '<option ' + (it&&it.kategori===c?'selected':'') + '>' + esc(c) + '</option>'; }).join("");
    var personOptions = (state.people||[]).map(function(p){ return '<option ' + ((it?it.person===p:p===currentAuthor())?'selected':'') + '>' + esc(p) + '</option>'; }).join("");
    var kontoVal = it ? (it.konto || "eget") : "eget";
    var kontoOptions = ['eget','gemensamt','spending'].map(function(v){
      var label = v==="eget" ? "Eget konto" : v==="gemensamt" ? "Gemensamt konto" : "Spending";
      return '<option value="' + v + '"' + (kontoVal===v?' selected':'') + '>' + label + '</option>';
    }).join("");
    var form = '<form class="card form-card" data-form="expense" data-id="' + (it?it.id:'') + '">' +
      '<h3>' + (it?'Ändra kostnad':'Lägg till kostnad') + '</h3>' +
      '<div class="form-grid">' +
        field('Datum', '<input name="datum" type="date" value="' + (it?it.datum:todayStr()) + '" required>') +
        field('Kategori', '<select name="kategori">' + catOptions + '</select>') +
        field('Belopp', '<input name="belopp" type="number" min="0" step="0.01" value="' + (it?it.belopp:'') + '" required>') +
        field('Person', '<select name="person">' + personOptions + '</select>') +
        field('Konto', '<select name="konto">' + kontoOptions + '</select>') +
        field('Kommentar', '<input name="kommentar" placeholder="Valfritt" value="' + (it?esc(it.kommentar||""):'') + '">') +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0;">Betalade du med pengar som redan låg på det gemensamma kontot (t.ex. en tidigare överföring)? Välj "Gemensamt konto" så syns det separat nedan. Betalade du med dina egna spendingpengar? Välj "Spending" så dras det av från spending-budgeten nedan. Annars "Eget konto" som vanligt.</p>' +
      formActions(it) + '</form>';

    var rows = items.map(function(e){
      var kontoChip = e.konto==="gemensamt"
        ? '<span class="rowchip" style="color:var(--accent-strong);"><span class="dot" style="background:var(--accent);"></span>Gemensamt</span>'
        : e.konto==="spending"
        ? '<span class="rowchip" style="color:var(--warn);"><span class="dot" style="background:var(--warn);"></span>Spending</span>'
        : '<span style="color:var(--text-muted);font-size:12.5px;">Eget</span>';
      return '<tr><td>' + esc(e.datum) + '</td><td>' + esc(e.kategori) + '</td>' +
        '<td><span class="rowchip"><span class="dot" style="background:' + personColor(e.person) + '"></span>' + esc(e.person) + '</span></td>' +
        '<td>' + kontoChip + '</td>' +
        '<td>' + esc(e.kommentar||"") + '</td><td class="num">' + fmtKr(e.belopp) + '</td>' +
        '<td class="num"><button class="icon-btn" data-dup="expense" data-id="' + e.id + '" title="Kopiera till idag, justera beloppet">Duplicera</button> ' +
        '<button class="icon-btn" data-edit="expense" data-id="' + e.id + '">Ändra</button> ' +
        '<button class="icon-btn danger" data-del="expense" data-id="' + e.id + '">Ta bort</button></td></tr>';
    }).join("");
    var table = items.length
      ? '<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Kategori</th><th>Person</th><th>Konto</th><th>Kommentar</th><th class="num">Belopp</th><th></th></tr></thead>' +
        '<tbody>' + rows + '</tbody><tfoot><tr><td colspan="5">Summa denna månad' + (filter ? ' (' + esc(filter) + ')' : '') + '</td><td class="num">' + fmtKr(total) + '</td><td></td></tr></tfoot></table></div>'
      : '<div class="card empty">Inga rörliga kostnader' + (filter ? ' för ' + esc(filter) : '') + ' registrerade för ' + monthLabel(mk).toLowerCase() + ' ännu.</div>';

    var lede = filter ? ('Visar bara ' + esc(filter) + '. Byt till "Hushåll (alla)" i menyn för allas kostnader.') : 'Logga utgifter löpande – båda ser samma lista.';
    return '<div class="topbar"><div><h1>Rörliga kostnader</h1><p class="lede">' + lede + '</p></div>' + monthPicker() + '</div>' +
      form +
      '<div class="section" style="display:grid;grid-template-columns:1fr 2fr;gap:16px;align-items:start;">' +
        '<div class="card" style="padding:16px 18px;">' +
          '<h3 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Per kategori</h3>' + catRows +
          (items.length ? '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);">' +
            '<h3 style="margin:0 0 10px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--text-muted);">Per konto</h3>' + kontoRows +
          '</div>' : '') +
        '</div>' +
        table +
      '</div>' +
      spendingBudgetSection(mk, filter);
  }

  function lanView(){
    var filter = activeFilter();
    var it = ui.editing && ui.editing.type==="loan" ? findItem("loans", ui.editing.id) : null;
    var loanPersonOpts = (state.people||[]).map(function(p){ return '<option ' + ((it?it.person===p:p===currentAuthor())?'selected':'') + '>' + esc(p) + '</option>'; }).join("");
    var form = '<form class="card form-card" data-form="loan" data-id="' + (it?it.id:'') + '">' +
      '<h3>' + (it?'Ändra lån':'Lägg till lån') + '</h3>' +
      '<div class="form-grid">' +
        field('Namn', '<input name="namn" placeholder="Billån, CSN…" value="' + (it?esc(it.namn):'') + '" required>') +
        field('Person', '<select name="person">' + loanPersonOpts + '</select>') +
        field('Ursprungligt belopp', '<input name="ursprungligt" type="number" min="0" step="0.01" value="' + (it?it.ursprungligt:'') + '" required>') +
        field('Ränta (%)', '<input name="ranta" type="number" min="0" step="0.01" value="' + (it?it.ranta:'') + '">') +
        field('Nuvarande skuld', '<input name="nuvarande" type="number" min="0" step="0.01" value="' + (it?it.nuvarande:'') + '" required>') +
        field('Ordinarie betalning/mån', '<input name="ordinarie" type="number" min="0" step="0.01" value="' + (it?it.ordinarie:'') + '" required>') +
        field('Startdatum (valfritt)', '<input name="startdatum" type="date" value="' + (it&&it.startdatum?it.startdatum:'') + '">') +
        field('Slutdatum (valfritt)', '<input name="slutdatum" type="date" value="' + (it&&it.slutdatum?it.slutdatum:'') + '">') +
        field('Sista betalning (om annan)', '<input name="sistaBetalning" type="number" min="0" step="0.01" placeholder="Lämna tomt om samma som ordinarie" value="' + (it&&it.sistaBetalning?it.sistaBetalning:'') + '">') +
        field('Total räntekostnad enligt Klarna (om känd)', '<input name="rantaOverride" type="number" min="0" step="0.01" placeholder="Skriv in Klarnas egen siffra för exakt match" value="' + (it&&it.rantaOverride?it.rantaOverride:'') + '">') +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0;">Vet du den exakta totala räntekostnaden (t.ex. från Klarna-appen)? Fyll i den i sista fältet så används den direkt – garanterat rätt, ingen uträkning behövs. Annars räknas den fram från start-/slutdatum om de är ifyllda, eller från räntesatsen. "Ursprungligt belopp" ska vara ren köpeskilling utan ränta.</p>' +
      formActions(it) + '</form>';

    var cards = filterByPerson(state.loans||[]).map(function(l){
      var paid = Math.max(0, l.ursprungligt - l.nuvarande);
      var pct = l.ursprungligt > 0 ? Math.min(100, Math.round(paid/l.ursprungligt*100)) : 0;
      var hist = (l.historik||[]).slice().sort(function(a,b){return b.datum.localeCompare(a.datum);}).slice(0,4).map(function(h){
        return '<div class="kv"><span>' + esc(h.datum) + ' · ' + esc(h.person||"") + '</span><b>+' + fmtKr(h.belopp) + '</b></div>';
      }).join("");
      var amort = loanAmortizationEstimate(l);
      var amortLabel = amort && amort.method === "override" ? "Ränta (enligt Klarna)" :
        amort && amort.method === "dates" ? "Ränta (baserat på start-/slutdatum)" : "Ränta (uppskattning från räntesats)";
      var amortHtml = amort
        ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">' +
          '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">' + amortLabel + '</span>' +
          '<div class="kv"><span>Ränta betald hittills</span><b>' + fmtKr(amort.interestSoFar) + '</b></div>' +
          '<div class="kv"><span>Ränta kvar att betala</span><b>' + fmtKr(amort.interestRemaining) + '</b></div>' +
          '<div class="kv"><span>Total räntekostnad</span><b>' + fmtKr(amort.totalInterest) + '</b></div>' +
          '<div class="kv"><span>Beräknat slutbetald om</span><b>' + amort.monthsRemaining + ' mån</b></div>' +
          (l.slutdatum ? '<div class="kv"><span>Slutdatum</span><b>' + esc(l.slutdatum) + '</b></div>' : '') +
          (l.sistaBetalning > 0 ? '<div class="kv"><span>Sista betalning</span><b>' + fmtKr(l.sistaBetalning) + '</b></div>' : '') +
          '</div>'
        : '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;color:var(--text-muted);">Räntekostnad kan inte beräknas – kontrollera att ordinarie betalning täcker räntan, eller fyll i start-/slutdatum.</div>';
      return '<div class="card loan-card">' +
        '<h4>' + esc(l.namn) + '</h4>' +
        (l.person ? '<span class="rowchip" style="margin-bottom:6px;"><span class="dot" style="background:' + personColor(l.person) + '"></span>' + esc(l.person) + '</span>' : '') +
        '<div class="progress"><div style="width:' + pct + '%"></div></div>' +
        '<div class="kv"><span>Betalt av ursprungligt</span><b>' + pct + ' %</b></div>' +
        '<div class="kv"><span>Nuvarande skuld</span><b>' + fmtKr(l.nuvarande) + '</b></div>' +
        '<div class="kv"><span>Ursprungligt belopp</span><b>' + fmtKr(l.ursprungligt) + '</b></div>' +
        '<div class="kv"><span>Ränta</span><b>' + (l.ranta||0) + ' %</b></div>' +
        '<div class="kv"><span>Ordinarie betalning/mån</span><b>' + fmtKr(l.ordinarie) + '</b></div>' +
        amortHtml +
        (hist ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Extra amorteringar</span>' + hist + '</div>' : '') +
        '<div class="mini-actions">' +
          '<button class="btn small primary" data-extra="' + l.id + '">+ Extra amortering</button>' +
          '<button class="btn small ghost" data-edit="loan" data-id="' + l.id + '">Ändra</button>' +
          '<button class="btn small ghost" data-del="loan" data-id="' + l.id + '">Ta bort</button>' +
        '</div>' +
      '</div>';
    }).join("") || ('<div class="card empty">' + (filter ? 'Inga lån för ' + esc(filter) + ' ännu.' : 'Inga lån registrerade ännu.') + '</div>');

    var lede = filter
      ? ('Visar bara ' + esc(filter) + '. Byt till "Hushåll (alla)" i menyn för alla lån.')
      : 'Håll koll på skuld, ordinarie betalning och extra amorteringar. Räntesiffrorna är en uppskattning baserad på jämn månadsbetalning – kan skilja sig något från exakta belopp i t.ex. Klarna-appen.';
    return '<div class="topbar"><div><h1>Lån &amp; skulder</h1><p class="lede">' + lede + '</p></div></div>' +
      form + '<div class="loan-grid">' + cards + '</div>';
  }

  function sparandeView(){
    var filter = activeFilter();
    var it = ui.editing && ui.editing.type==="goal" ? findItem("goals", ui.editing.id) : null;
    var goalPersonOpts = (state.people||[]).map(function(p){ return '<option ' + ((it?it.person===p:p===currentAuthor())?'selected':'') + '>' + esc(p) + '</option>'; }).join("");
    var form = '<form class="card form-card" data-form="goal" data-id="' + (it?it.id:'') + '">' +
      '<h3>' + (it?'Ändra sparmål':'Lägg till sparmål') + '</h3>' +
      '<div class="form-grid">' +
        field('Namn', '<input name="namn" placeholder="Buffert, semester, aktier…" value="' + (it?esc(it.namn):'') + '" required>') +
        field('Person', '<select name="person">' + goalPersonOpts + '</select>') +
        field('Målbelopp (valfritt)', '<input name="mal" type="number" min="0" step="0.01" placeholder="Lämna tomt om inget mål" value="' + (it&&it.mal?it.mal:'') + '">') +
        field('Nuvarande sparat', '<input name="sparat" type="number" min="0" step="0.01" value="' + (it?it.sparat:'') + '">') +
        field('Sparande/mån (valfritt)', '<input name="manadsSparande" type="number" min="0" step="0.01" placeholder="Lämna tomt om oregelbundet" value="' + (it&&it.manadsSparande?it.manadsSparande:'') + '">') +
        field('Kommentar', '<input name="kommentar" placeholder="Valfritt" value="' + (it?esc(it.kommentar||""):'') + '">') +
      '</div>' +
      '<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0;">Sparar ni oregelbundet (t.ex. aktier) utan ett bestämt mål eller fast månadsbelopp – lämna "Målbelopp" och "Sparande/mån" tomma. Använd sedan "+ Extra insättning" på kortet varje gång ni lägger in pengar.</p>' +
      formActions(it) + '</form>';

    var cards = filterByPerson(state.goals||[]).map(function(g){
      var hasMal = g.mal > 0;
      var pct = hasMal ? Math.min(100, Math.round(g.sparat/g.mal*100)) : 0;
      var kvar = Math.max(0, g.mal - g.sparat);
      var months = hasMal && g.manadsSparande > 0 ? Math.ceil(kvar/g.manadsSparande) : null;
      var hist = (g.historik||[]).slice().sort(function(a,b){return b.datum.localeCompare(a.datum);}).slice(0,4).map(function(h){
        return '<div class="kv"><span>' + esc(h.datum) + (h.kommentar?' · '+esc(h.kommentar):'') + '</span><b>+' + fmtKr(h.belopp) + '</b></div>';
      }).join("");
      return '<div class="card goal-card">' +
        '<h4>' + esc(g.namn) + '</h4>' +
        (g.person ? '<span class="rowchip" style="margin-bottom:6px;"><span class="dot" style="background:' + personColor(g.person) + '"></span>' + esc(g.person) + '</span>' : '') +
        (g.kommentar ? '<p style="font-size:12.5px;color:var(--text-muted);margin:2px 0 6px;">' + esc(g.kommentar) + '</p>' : '') +
        (hasMal ? '<div class="progress"><div style="width:' + pct + '%"></div></div>' : '') +
        (hasMal
          ? '<div class="kv"><span>Sparat</span><b>' + fmtKr(g.sparat) + ' av ' + fmtKr(g.mal) + '</b></div>'
          : '<div class="kv"><span>Sparat totalt</span><b>' + fmtKr(g.sparat) + '</b></div>') +
        (g.manadsSparande > 0 ? '<div class="kv"><span>Sparande/mån</span><b>' + fmtKr(g.manadsSparande) + '</b></div>' : '') +
        (hasMal ? '<div class="kv"><span>Tid kvar</span><b>' + (months!=null ? (months + ' mån') : '–') + '</b></div>' : '') +
        (hist ? '<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);"><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Senaste insättningar</span>' + hist + '</div>' : '') +
        '<div class="mini-actions">' +
          '<button class="btn small primary" data-goal-extra="' + g.id + '">+ Extra insättning</button>' +
          '<button class="btn small ghost" data-edit="goal" data-id="' + g.id + '">Ändra</button>' +
          '<button class="btn small ghost" data-del="goal" data-id="' + g.id + '">Ta bort</button>' +
        '</div>' +
      '</div>';
    }).join("") || ('<div class="card empty">' + (filter ? 'Inga sparmål för ' + esc(filter) + ' ännu.' : 'Inga sparmål ännu.') + '</div>');

    var lede = filter ? ('Visar bara ' + esc(filter) + '. Byt till "Hushåll (alla)" i menyn för alla sparmål.') : 'Sätt mål och se hur nära ni är, eller logga oregelbundet sparande (t.ex. aktier) utan mål.';
    return '<div class="topbar"><div><h1>Sparande &amp; mål</h1><p class="lede">' + lede + '</p></div></div>' +
      form + '<div class="goal-grid">' + cards + '</div>';
  }

  function hushallView(){
    var rows = (state.people||[]).map(function(p, i){
      return '<div class="settings-row"><span class="avatar" style="background:' + personColor(p) + '">' + esc(initials(p)) + '</span>' +
        '<input data-person-idx="' + i + '" value="' + esc(p) + '" style="flex:1;">' +
        '<button class="icon-btn danger" data-remove-person="' + i + '">Ta bort</button></div>';
    }).join("");
    return '<div class="topbar"><div><h1>Hushåll</h1><p class="lede">Vem ska kunna registrera inkomster och kostnader?</p></div></div>' +
      '<div class="card form-card"><h3>Medlemmar</h3><div class="settings-list">' + rows + '</div>' +
      '<div class="form-actions"><button class="btn ghost small" id="add-person">+ Lägg till person</button></div></div>' +
      '<div class="card form-card"><h3>Startmånad</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0 0 10px;">' +
      'Räkna ingenting före det här datumet, oavsett vad en enskild post råkar ha för eget startdatum (t.ex. ett lån som egentligen togs år 2023). Lämna tomt om ni vill att varje post ska styras av sitt eget datum istället.</p>' +
      '<div class="form-grid" style="max-width:220px;">' + field('Räkna data från', '<input id="tracking-start" type="date" value="' + esc(state.trackingStart||"") + '">') + '</div></div>' +
      '<div class="card form-card"><h3>Om åtkomst</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0 0 10px;">' +
      'Appen körs lokalt på er Home Assistant-maskin – det är er vanliga HA-inloggning som avgör vem som kommer åt den, samma sätt som resten av Home Assistant. ' +
      'Profilvalet ovan i menyn styr bara vilket namn som sätts på det ni registrerar, inte vem som får skriva. ' +
      'Om ändringar bara sparas i webbläsaren (se meddelande högst upp) har appen tappat kontakten med servern på din Home Assistant-maskin – kolla att den är igång och att du är ansluten till samma nätverk.</p></div>' +
      '<div class="card form-card"><h3>Nollställ</h3><p style="font-size:13px;color:var(--text-muted);line-height:1.6;margin:0 0 10px;">' +
      'Testar ni bara runt just nu? Här kan ni rensa bort alla inkomster, kostnader, lån och sparmål och börja helt om – utan att behöva be Claude om det. Namnen på hushållsmedlemmarna påverkas inte.</p>' +
      '<div class="form-actions"><button class="btn ghost small" id="reset-data" style="color:var(--danger);">Rensa all data</button></div></div>';
  }

  // ---------- events ----------
  function bindEvents(){
    var app = document.getElementById('app');

    app.querySelectorAll('[data-nav]').forEach(function(btn){
      btn.addEventListener('click', function(){ ui.view = btn.getAttribute('data-nav'); ui.editing=null; mobileNavOpen = false; saveUi(); render(); });
    });
    var navToggle = document.querySelector('[data-nav-toggle]');
    if (navToggle) navToggle.addEventListener('click', function(){ mobileNavOpen = !mobileNavOpen; render(); });
    app.querySelectorAll('[data-month-nav]').forEach(function(btn){
      btn.addEventListener('click', function(){ ui.month = shiftMonth(ui.month, parseInt(btn.getAttribute('data-month-nav'),10)); saveUi(); render(); });
    });
    app.querySelectorAll('[data-year-nav]').forEach(function(btn){
      btn.addEventListener('click', function(){ ui.year = String(parseInt(ui.year,10) + parseInt(btn.getAttribute('data-year-nav'),10)); saveUi(); render(); });
    });
    app.querySelectorAll('[data-period-mode]').forEach(function(btn){
      btn.addEventListener('click', function(){ ui.periodMode = btn.getAttribute('data-period-mode'); saveUi(); render(); });
    });
    var personSel = document.getElementById('person-select');
    if (personSel) personSel.addEventListener('change', function(){ ui.person = personSel.value; saveUi(); render(); });

    app.querySelectorAll('[data-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){
        ui.editing = { type: btn.getAttribute('data-edit'), id: btn.getAttribute('data-id') };
        saveUi(); render();
        var f = app.querySelector('[data-form]'); if (f) f.scrollIntoView({behavior:'smooth', block:'center'});
      });
    });
    app.querySelectorAll('[data-cancel-edit]').forEach(function(btn){
      btn.addEventListener('click', function(){ ui.editing = null; saveUi(); render(); });
    });
    app.querySelectorAll('[data-del]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var type = btn.getAttribute('data-del'), id = btn.getAttribute('data-id');
        var map = {income:"incomes", fixed:"fixedCosts", loan:"loans", goal:"goals", expense:"expenses"};
        var key = map[type];
        state[key] = state[key].filter(function(x){ return x.id !== id; });
        if (type === "fixed") state.fixedOverrides = (state.fixedOverrides||[]).filter(function(o){ return o.itemId !== id; });
        if (ui.editing && ui.editing.id===id) ui.editing = null;
        persist();
      });
    });
    app.querySelectorAll('[data-fixed-month]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var item = findItem("fixedCosts", btn.getAttribute('data-fixed-month'));
        if (!item) return;
        var current = fixedEffectiveAmount(item, ui.month);
        ui.modal = { type: "fixedMonth", itemId: item.id, belopp: current };
        render();
      });
    });
    app.querySelectorAll('[data-dup]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var type = btn.getAttribute('data-dup'), id = btn.getAttribute('data-id');
        if (type === "expense") {
          var src = findItem("expenses", id);
          if (!src) return;
          var copy = { id: uid(), datum: todayStr(), kategori: src.kategori, belopp: src.belopp, person: src.person, konto: src.konto||"eget", kommentar: src.kommentar||"", createdAt: new Date().toISOString() };
          state.expenses.push(copy);
          ui.month = monthKeyFromDate(new Date());
          ui.editing = { type: "expense", id: copy.id };
          saveUi();
          persist();
        }
      });
    });
    app.querySelectorAll('[data-extra]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var loan = findItem("loans", btn.getAttribute('data-extra'));
        if (!loan) return;
        ui.modal = { type: "loanExtra", loanId: loan.id };
        render();
      });
    });
    app.querySelectorAll('[data-goal-extra]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var goal = findItem("goals", btn.getAttribute('data-goal-extra'));
        if (!goal) return;
        ui.modal = { type: "goalExtra", goalId: goal.id };
        render();
      });
    });

    var exportTa = document.getElementById('export-textarea');
    if (exportTa) {
      exportTa.addEventListener('focus', function(){ exportTa.select(); });
      exportTa.addEventListener('click', function(){ exportTa.select(); });
    }
    var exportCopyBtn = document.getElementById('export-copy');
    if (exportCopyBtn) exportCopyBtn.addEventListener('click', function(){
      var statusEl = document.getElementById('export-status');
      function setStatus(t){ if (statusEl) statusEl.textContent = t; }
      var ta = document.getElementById('export-textarea');
      if (!ta) return;
      ta.select();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(ta.value).then(function(){
          setStatus('Kopierat! Klistra in var du vill (Ctrl+V eller Cmd+V).');
        }).catch(function(){
          setStatus('Kunde inte kopiera automatiskt – texten är markerad, tryck Ctrl+C (eller Cmd+C) för att kopiera manuellt.');
        });
      } else {
        setStatus('Texten är markerad – tryck Ctrl+C (eller Cmd+C) för att kopiera.');
      }
    });
    var importOpenBtn = document.getElementById('import-open');
    if (importOpenBtn) importOpenBtn.addEventListener('click', function(){
      var statusEl = document.getElementById('import-status');
      function setStatus(t){ if (statusEl) statusEl.textContent = t; }
      var ta = document.getElementById('import-textarea');
      var text = ta ? ta.value.trim() : '';
      if (!text) { setStatus('Klistra in en exporttext först.'); return; }
      var parsed = parseImportText(text);
      var total = parsed.incomes.length + parsed.fixedCosts.length + parsed.loans.length + parsed.expenses.length + parsed.goals.length;
      if (total === 0) { setStatus('Kunde inte tolka texten – kontrollera att du klistrat in en export från den här appen.'); return; }
      ui.modal = { type: "confirmImport", parsed: parsed };
      render();
    });
    var exportPeriodSel = document.getElementById('export-period-select');
    if (exportPeriodSel) exportPeriodSel.addEventListener('change', function(){ ui.exportPeriod = exportPeriodSel.value; saveUi(); render(); });
    var exportYearSel = document.getElementById('export-year-select');
    if (exportYearSel) exportYearSel.addEventListener('change', function(){ ui.exportYear = exportYearSel.value; saveUi(); render(); });
    var exportMonthSel = document.getElementById('export-month-select');
    if (exportMonthSel) exportMonthSel.addEventListener('change', function(){ ui.exportMonth = exportMonthSel.value; saveUi(); render(); });

    var resetBtn = document.getElementById('reset-data');
    if (resetBtn) resetBtn.addEventListener('click', function(){
      ui.modal = { type: "confirmReset" };
      render();
    });

    var lockNowBtn = document.getElementById('lock-now');
    if (lockNowBtn) lockNowBtn.addEventListener('click', function(){
      try { localStorage.removeItem(LOCK_KEY); } catch(e){}
      renderLockScreen();
    });

    var changePwBtn = document.getElementById('change-password');
    if (changePwBtn) changePwBtn.addEventListener('click', function(){
      ui.modal = { type: "changePassword" };
      render();
    });

    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) themeToggle.addEventListener('click', function(){
      ui.theme = ui.theme === "dark" ? "light" : "dark";
      applyTheme();
      saveUi();
      render();
    });

    var trackingStartInp = document.getElementById('tracking-start');
    if (trackingStartInp) trackingStartInp.addEventListener('change', function(){
      state.trackingStart = trackingStartInp.value || "";
      persist();
    });

    app.querySelectorAll('[data-modal-cancel]').forEach(function(btn){
      btn.addEventListener('click', function(){ ui.modal = null; render(); });
    });
    app.querySelectorAll('[data-modal-backdrop]').forEach(function(bd){
      bd.addEventListener('click', function(ev){ if (ev.target === bd) { ui.modal = null; render(); } });
    });
    app.querySelectorAll('[data-modal-save]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var kind = btn.getAttribute('data-modal-save');
        var mo = ui.modal;
        if (!mo) return;
        if (kind === "fixedMonth") {
          var fitem = findItem("fixedCosts", mo.itemId);
          var fInp = document.getElementById('modal-belopp');
          var famt = fInp ? parseFloat(String(fInp.value).replace(',', '.')) : NaN;
          if (fitem && !isNaN(famt) && famt >= 0) {
            var mk1 = ui.month;
            state.fixedOverrides = (state.fixedOverrides||[]).filter(function(o){ return !(o.itemId===fitem.id && o.manad===mk1); });
            if (famt !== fitem.belopp) state.fixedOverrides.push({ id: uid(), itemId: fitem.id, manad: mk1, belopp: famt });
            ui.modal = null;
            persist();
          }
        } else if (kind === "loanExtra") {
          var loan = findItem("loans", mo.loanId);
          var eInp = document.getElementById('modal-extra');
          var eamt = eInp ? parseFloat(String(eInp.value).replace(',', '.')) : NaN;
          if (loan && !isNaN(eamt) && eamt > 0) {
            loan.nuvarande = Math.max(0, loan.nuvarande - eamt);
            loan.historik = loan.historik || [];
            loan.historik.push({ id: uid(), datum: todayStr(), belopp: eamt, person: currentAuthor() });
            ui.modal = null;
            persist();
          }
        } else if (kind === "goalExtra") {
          var goal = findItem("goals", mo.goalId);
          var gInp = document.getElementById('modal-goal-extra');
          var gamt = gInp ? parseFloat(String(gInp.value).replace(',', '.')) : NaN;
          var gkInp = document.getElementById('modal-goal-kommentar');
          var gkommentar = gkInp ? gkInp.value.trim() : '';
          if (goal && !isNaN(gamt) && gamt > 0) {
            goal.sparat = (goal.sparat || 0) + gamt;
            goal.historik = goal.historik || [];
            goal.historik.push({ id: uid(), datum: todayStr(), belopp: gamt, person: currentAuthor(), kommentar: gkommentar });
            ui.modal = null;
            persist();
          }
        } else if (kind === "changePassword") {
          var curInp = document.getElementById('modal-pw-current');
          var newInp = document.getElementById('modal-pw-new');
          var confInp = document.getElementById('modal-pw-confirm');
          var pwErrDiv = document.getElementById('modal-pw-error');
          var curVal = curInp ? curInp.value : '';
          var newVal = newInp ? newInp.value : '';
          var confVal = confInp ? confInp.value : '';
          if (!newVal) { if (pwErrDiv) pwErrDiv.textContent = 'Skriv in ett nytt lösenord.'; return; }
          if (newVal !== confVal) { if (pwErrDiv) pwErrDiv.textContent = 'De nya lösenorden matchar inte.'; return; }
          if (!window.crypto || !window.crypto.subtle) { if (pwErrDiv) pwErrDiv.textContent = 'Den här webbläsaren stöds tyvärr inte.'; return; }
          sha256Hex(curVal).then(function(curHash){
            if (curHash !== state.lockHash) { if (pwErrDiv) pwErrDiv.textContent = 'Fel nuvarande lösenord.'; return; }
            sha256Hex(newVal).then(function(newHash){
              state.lockHash = newHash;
              setUnlocked();
              ui.modal = null;
              persist();
            });
          });
        } else if (kind === "confirmReset") {
          state.incomes = [];
          state.fixedCosts = [];
          state.fixedOverrides = [];
          state.loans = [];
          state.expenses = [];
          state.goals = [];
          ui.editing = null; ui.modal = null; saveUi();
          persist();
        } else if (kind === "confirmImport") {
          var parsed = mo.parsed;
          if (parsed) {
            state.people = (state.people || []).slice();
            parsed.people.forEach(function(p){ if (state.people.indexOf(p) === -1) state.people.push(p); });
            state.incomes = parsed.incomes;
            state.fixedCosts = parsed.fixedCosts;
            state.fixedOverrides = parsed.fixedOverrides;
            state.loans = parsed.loans;
            state.expenses = parsed.expenses;
            state.goals = parsed.goals;
            if (parsed.trackingStart !== undefined) state.trackingStart = parsed.trackingStart;
            ui.editing = null; ui.modal = null; saveUi();
            persist();
          }
        }
      });
    });

    var addPersonBtn = document.getElementById('add-person');
    if (addPersonBtn) addPersonBtn.addEventListener('click', function(){
      state.people = state.people || [];
      state.people.push("Person " + (state.people.length+1));
      persist();
    });
    app.querySelectorAll('[data-person-idx]').forEach(function(inp){
      inp.addEventListener('change', function(){
        var i = parseInt(inp.getAttribute('data-person-idx'),10);
        var oldName = state.people[i];
        var newName = inp.value.trim() || oldName;
        state.people[i] = newName;
        [state.incomes, state.expenses, state.fixedCosts, state.loans, state.goals].forEach(function(arr){
          (arr||[]).forEach(function(x){ if (x.person === oldName) x.person = newName; });
        });
        if (ui.person === oldName) ui.person = newName;
        saveUi(); persist();
      });
    });
    app.querySelectorAll('[data-remove-person]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var i = parseInt(btn.getAttribute('data-remove-person'),10);
        if (state.people.length <= 1) return;
        state.people.splice(i,1);
        if (!state.people.includes(ui.person)) ui.person = state.people[0];
        saveUi(); persist();
      });
    });

    app.querySelectorAll('form[data-form]').forEach(function(form){
      form.addEventListener('submit', function(ev){
        ev.preventDefault();
        var type = form.getAttribute('data-form');
        var id = form.getAttribute('data-id');
        var fd = new FormData(form);
        var map = {income:"incomes", fixed:"fixedCosts", loan:"loans", goal:"goals", expense:"expenses"};
        var key = map[type];
        var existing = id ? findItem(key, id) : null;
        var obj = existing || { id: uid() };
        fd.forEach(function(val, name){
          var numeric = ["belopp","brutto","ursprungligt","ranta","nuvarande","ordinarie","sistaBetalning","rantaOverride","mal","sparat","manadsSparande"];
          obj[name] = numeric.indexOf(name) >= 0 ? parseFloat(val)||0 : val;
        });
        if (type === "expense") obj.createdAt = obj.createdAt || new Date().toISOString();
        if (type === "fixed") obj.isSpendingBudget = fd.has('isSpendingBudget');
        if (type === "loan" && !existing) obj.historik = [];
        if (!existing) state[key].push(obj);
        ui.editing = null; saveUi();
        persist();
      });
    });
  }

  // ---------- boot ----------
  (function loadCachedStateIfAny(){
    // Use a locally-cached copy as a starting point (avoids a blank flash) until
    // the server sends the real, current state over the WebSocket.
    try {
      var s = localStorage.getItem('hb-state');
      if (s) {
        var cached = JSON.parse(s);
        cached.fixedOverrides = cached.fixedOverrides || [];
        cached.trackingStart = cached.trackingStart || "";
        cached.lockHash = cached.lockHash || DEFAULT_LOCK_HASH;
        state = cached;
      }
    } catch(e){}
  })();

  function bootApp(){
    unlockedYet = true;
    render();
  }

  // No separate app-level password: Home Assistant's own login already gates who
  // can reach this page at all (via ingress), so the extra lock screen would just
  // be redundant - and it needs window.crypto.subtle, which browsers disable on
  // plain http:// local addresses, breaking it outright on a typical home network.
  connectWs();
  bootApp();
})();
