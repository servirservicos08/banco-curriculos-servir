// Painel do RH — Banco de Currículos Servir
(function () {
  "use strict";
  var L = window.SERVIR_LISTAS, N = window.SERVIR_NOTA, CFG = window.SERVIR_CONFIG || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var root = $("#root"), drawerRoot = $("#drawer-root");
  var PAINEL_URL = location.origin + location.pathname;
  var DIA = 864e5;

  // ---------------- utilidades ----------------
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmtTel(d) { d = String(d || "").replace(/\D/g, "").slice(0, 11); if (d.length < 8) return d; return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7); }
  function fmtData(iso) { if (!iso) return ""; return new Date(iso).toLocaleDateString("pt-BR"); }
  function primeiroNome(n) { return String(n || "").trim().split(/\s+/)[0]; }
  function opts(arr, sel, first) { return (first != null ? '<option value="">' + esc(first) + "</option>" : "") + arr.map(function (a) { return "<option" + (a === sel ? " selected" : "") + ">" + esc(a) + "</option>"; }).join(""); }
  var toastT;
  function toast(m) { var t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 3800); }
  function falhou(err, msg) { console.error(err); toast(msg || "Não foi possível concluir. Confira a internet e tente de novo."); }
  function vencido(c) { return Date.now() - new Date(c.atualizado_em).getTime() > 365 * DIA; }
  function admin() { return state.me && state.me.perfil === "Administrador"; }

  // ---------------- estado ----------------
  var state = {
    me: null, vagas: [], cands: [], users: [], tab: "cands",
    f: { vaga: "", min: 0, cidade: "", cidint: "", esc: "", exp: "", lider: "", excel: "", cnh: "", turno: "", inicio: "", status: "", periodo: "", busca: "" },
    aberto: null, timer: null
  };
  function vagaById(id) { for (var i = 0; i < state.vagas.length; i++) if (state.vagas[i].id === id) return state.vagas[i]; return null; }
  function candById(id) { for (var i = 0; i < state.cands.length; i++) if (state.cands[i].id === id) return state.cands[i]; return null; }
  function notaAtual(c) { var v = state.f.vaga ? vagaById(state.f.vaga) : null; return v ? N.nota(c, v) : N.melhor(c, state.vagas); }
  function duplicados() { var m = {}; state.cands.forEach(function (c) { m[c.whatsapp] = (m[c.whatsapp] || 0) + 1; }); return m; }

  // ---------------- conexão ----------------
  var configurado = CFG.SUPABASE_URL && CFG.SUPABASE_URL.indexOf("COLE_AQUI") < 0 && window.supabase;
  if (!configurado) {
    root.innerHTML = '<div class="banner erro">O painel ainda não foi configurado. Preencha o arquivo config.js com os dados do Supabase.</div>';
    return;
  }
  var recuperacao = /type=recovery/.test(location.hash);
  var erroLink = /error_code=([^&]+)/.exec(location.hash);
  var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "servir-painel" }
  });
  sb.auth.onAuthStateChange(function (ev) { if (ev === "PASSWORD_RECOVERY") { recuperacao = true; telaAcesso("nova"); } });

  sb.auth.getSession().then(function (r) {
    if (erroLink) { history.replaceState(null, "", PAINEL_URL); telaAcesso("entrar", "O link do e-mail expirou ou já foi usado. Peça um novo em \"Esqueci minha senha\".", "erro"); return; }
    if (recuperacao) { telaAcesso("nova"); return; }
    if (location.hash) history.replaceState(null, "", PAINEL_URL);
    if (r.data && r.data.session) entrar(r.data.session); else telaAcesso("entrar");
  });

  function fetchTodos(tabela, ordem) {
    var todos = [], passo = 1000;
    function pagina(de) {
      return sb.from(tabela).select("*").order(ordem, { ascending: false }).range(de, de + passo - 1).then(function (r) {
        if (r.error) throw r.error;
        todos = todos.concat(r.data);
        return r.data.length === passo ? pagina(de + passo) : todos;
      });
    }
    return pagina(0);
  }
  function carregar() {
    return Promise.all([
      sb.from("vagas").select("*").order("ordem").then(function (r) { if (r.error) throw r.error; state.vagas = r.data; }),
      sb.from("usuarios").select("*").order("nome").then(function (r) { if (r.error) throw r.error; state.users = r.data; }),
      fetchTodos("candidatos", "criado_em").then(function (d) { state.cands = d; })
    ]);
  }

  function entrar(session) {
    root.innerHTML = '<div class="loading">Carregando os cadastros…</div>';
    var email = String(session.user.email || "").toLowerCase();
    sb.from("usuarios").select("*").eq("email", email).maybeSingle().then(function (r) {
      if (r.error || !r.data || !r.data.ativo) {
        sb.auth.signOut();
        telaAcesso("entrar", "Seu acesso ao painel não está liberado. Peça ao Administrador para liberar o e-mail " + email + ".", "erro");
        return;
      }
      state.me = r.data;
      return carregar().then(function () {
        renderRH();
        clearInterval(state.timer);
        state.timer = setInterval(atualizarSilencioso, 120000);
      });
    }).catch(function (e) { falhou(e); root.innerHTML = '<div class="banner erro">Não foi possível carregar o painel. Confira a internet e reabra o programa.</div>'; });
  }
  function atualizarSilencioso() {
    if (state.aberto) return;
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    var antes = state.cands.length;
    carregar().then(function () {
      if (state.cands.length > antes) toast((state.cands.length - antes) + " novo(s) cadastro(s) chegaram.");
      renderRH();
    }).catch(function (e) { console.warn(e); });
  }

  // ---------------- telas de acesso ----------------
  function telaAcesso(modo, msg, tipo) {
    $("#user-pill").innerHTML = "";
    clearInterval(state.timer);
    var aviso = msg ? '<div class="banner ' + (tipo || "ok") + '">' + esc(msg) + "</div>" : "";
    var html = "";
    if (modo === "entrar") {
      html = '<form class="login" id="acesso"><div><div class="brand-sub">Acesso restrito</div><h1>Entrar no painel</h1></div>' + aviso +
        '<div><label class="lbl" for="a-email">E-mail</label><input type="email" id="a-email" autocomplete="username" required></div>' +
        '<div><label class="lbl" for="a-senha">Senha</label><input type="password" id="a-senha" autocomplete="current-password" required></div>' +
        '<button class="btn btn-primary" type="submit" id="a-btn">Entrar</button>' +
        '<div class="row" style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><button type="button" class="link-btn" data-modo="primeiro">Primeiro acesso</button><button type="button" class="link-btn" data-modo="esqueci">Esqueci minha senha</button></div></form>';
    } else if (modo === "primeiro") {
      html = '<form class="login" id="acesso"><div><div class="brand-sub">Primeiro acesso</div><h1>Criar minha senha</h1></div>' + aviso +
        '<p class="hint" style="margin:0">Use o e-mail que o Administrador liberou. Você vai receber um e-mail para confirmar.</p>' +
        '<div><label class="lbl" for="a-email">E-mail</label><input type="email" id="a-email" autocomplete="username" required></div>' +
        '<div><label class="lbl" for="a-senha">Nova senha (mínimo 8 caracteres)</label><input type="password" id="a-senha" autocomplete="new-password" minlength="8" required></div>' +
        '<div><label class="lbl" for="a-senha2">Repita a senha</label><input type="password" id="a-senha2" autocomplete="new-password" required></div>' +
        '<button class="btn btn-primary" type="submit" id="a-btn">Criar senha</button><button type="button" class="link-btn" data-modo="entrar">Voltar para Entrar</button></form>';
    } else if (modo === "esqueci") {
      html = '<form class="login" id="acesso"><div><div class="brand-sub">Recuperar acesso</div><h1>Esqueci minha senha</h1></div>' + aviso +
        '<div><label class="lbl" for="a-email">E-mail</label><input type="email" id="a-email" autocomplete="username" required></div>' +
        '<button class="btn btn-primary" type="submit" id="a-btn">Enviar link por e-mail</button><button type="button" class="link-btn" data-modo="entrar">Voltar para Entrar</button></form>';
    } else {
      html = '<form class="login" id="acesso"><div><div class="brand-sub">Recuperar acesso</div><h1>Criar nova senha</h1></div>' + aviso +
        '<div><label class="lbl" for="a-senha">Nova senha (mínimo 8 caracteres)</label><input type="password" id="a-senha" autocomplete="new-password" minlength="8" required></div>' +
        '<div><label class="lbl" for="a-senha2">Repita a senha</label><input type="password" id="a-senha2" autocomplete="new-password" required></div>' +
        '<button class="btn btn-primary" type="submit" id="a-btn">Salvar nova senha</button></form>';
    }
    root.innerHTML = html;
    root.querySelectorAll("[data-modo]").forEach(function (b) { b.addEventListener("click", function () { telaAcesso(b.dataset.modo); }); });
    var form = $("#acesso"), btn = $("#a-btn");
    function ocupado(s) { btn.disabled = s; }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("#a-email") ? $("#a-email").value.trim().toLowerCase() : "";
      var senha = $("#a-senha") ? $("#a-senha").value : "";
      var senha2 = $("#a-senha2") ? $("#a-senha2").value : "";
      if ((modo === "primeiro" || modo === "nova") && (senha.length < 8 || senha !== senha2)) { toast(senha.length < 8 ? "A senha precisa ter pelo menos 8 caracteres." : "As duas senhas não são iguais."); return; }
      ocupado(true);
      if (modo === "entrar") {
        sb.auth.signInWithPassword({ email: email, password: senha }).then(function (r) {
          ocupado(false);
          if (r.error) {
            var m = /confirm/i.test(r.error.message) ? "Confirme seu e-mail primeiro: abra o link que enviamos para " + email + "." : "E-mail ou senha incorretos.";
            telaAcesso("entrar", m, "erro"); return;
          }
          entrar(r.data.session);
        });
      } else if (modo === "primeiro") {
        sb.rpc("email_autorizado", { p_email: email }).then(function (r) {
          if (r.error) throw r.error;
          if (!r.data) { ocupado(false); telaAcesso("primeiro", "Este e-mail ainda não foi liberado. Peça ao Administrador para cadastrar você na aba Usuários.", "erro"); return; }
          return sb.auth.signUp({ email: email, password: senha, options: { emailRedirectTo: PAINEL_URL } }).then(function (s) {
            ocupado(false);
            if (s.error) throw s.error;
            if (s.data && s.data.user && s.data.user.identities && s.data.user.identities.length === 0) {
              telaAcesso("entrar", "Este e-mail já tem senha criada. Entre normalmente ou use \"Esqueci minha senha\".", "warn"); return;
            }
            telaAcesso("entrar", "Pronto! Enviamos um e-mail para " + email + ". Abra o link para confirmar e depois entre aqui.", "ok");
          });
        }).catch(function (err) { ocupado(false); falhou(err, "Não foi possível criar a senha agora. Tente de novo em alguns minutos."); });
      } else if (modo === "esqueci") {
        sb.auth.resetPasswordForEmail(email, { redirectTo: PAINEL_URL }).then(function (r) {
          ocupado(false);
          if (r.error) { falhou(r.error, "Não foi possível enviar agora. Tente de novo em alguns minutos."); return; }
          telaAcesso("entrar", "Se este e-mail tiver acesso, enviamos um link para criar uma nova senha.", "ok");
        });
      } else {
        sb.auth.updateUser({ password: senha }).then(function (r) {
          ocupado(false);
          if (r.error) { falhou(r.error, "Não foi possível salvar. Peça um novo link em \"Esqueci minha senha\"."); return; }
          recuperacao = false;
          history.replaceState(null, "", PAINEL_URL);
          toast("Senha alterada.");
          sb.auth.getSession().then(function (s) { if (s.data.session) entrar(s.data.session); else telaAcesso("entrar"); });
        });
      }
    });
    var first = form.querySelector("input"); if (first) first.focus();
  }

  // ---------------- estrutura do painel ----------------
  function renderRH() {
    $("#user-pill").innerHTML = "<span>Conectado: <b>" + esc(state.me.nome) + "</b> · " + esc(state.me.perfil) + '</span><button class="btn btn-small" id="atualizar" type="button">Atualizar</button><button class="btn btn-small" id="sair" type="button">Sair</button>';
    $("#sair").onclick = function () { clearInterval(state.timer); sb.auth.signOut().then(function () { state.me = null; telaAcesso("entrar"); }); };
    $("#atualizar").onclick = function () { carregar().then(function () { renderRH(); toast("Lista atualizada."); }).catch(function (e) { falhou(e); }); };

    var nNovos = state.cands.filter(function (c) { return c.status === "Novo"; }).length;
    var tabs = [["cands", "Candidatos", nNovos ? nNovos + " novos" : ""], ["board", "Quadro de seleção", ""], ["vagas", "Vagas", ""], ["resumo", "Resumo", ""]];
    if (admin()) tabs.push(["users", "Usuários", ""]);
    if (!admin() && state.tab === "users") state.tab = "cands";
    var venc = state.cands.filter(vencido);
    root.innerHTML =
      (admin() && venc.length ? '<div class="banner warn" id="ret" style="margin-bottom:14px"><span><b>' + venc.length + "</b> cadastro(s) estão há mais de 12 meses sem atualização. Pela LGPD, devem ser excluídos.</span>" +
        '<span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-small" id="ret-ver">Ver lista</button><button type="button" class="btn btn-small btn-danger" id="ret-exc">Excluir todos</button></span></div>' : "") +
      '<div class="tabs" role="tablist">' + tabs.map(function (t) {
        return '<button role="tab" type="button" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' + t[1] + (t[2] ? '<span class="count">' + t[2] + "</span>" : "") + "</button>";
      }).join("") + "</div><div id=\"tab-body\"></div>";
    root.querySelectorAll("[data-tab]").forEach(function (b) { b.addEventListener("click", function () { state.tab = b.dataset.tab; renderRH(); }); });
    if ($("#ret-ver")) {
      $("#ret-ver").onclick = function () { limparFiltros(); state.f.periodo = "vencidos"; state.tab = "cands"; renderRH(); };
      $("#ret-exc").onclick = function () {
        var box = $("#ret");
        box.innerHTML = "<span>Excluir <b>" + venc.length + "</b> cadastro(s) e os currículos anexados? Não dá para desfazer.</span>" +
          '<span style="display:flex;gap:8px"><button type="button" class="btn btn-small btn-danger" id="ret-sim">Sim, excluir</button><button type="button" class="btn btn-small" id="ret-nao">Cancelar</button></span>';
        $("#ret-nao").onclick = renderRH;
        $("#ret-sim").onclick = function () {
          this.disabled = true;
          excluirVarios(venc).then(function (n) { toast(n + " cadastro(s) excluídos."); return carregar(); }).then(renderRH).catch(function (e) { falhou(e); renderRH(); });
        };
      };
    }
    ({ cands: renderCands, board: renderBoard, vagas: renderVagas, resumo: renderResumo, users: renderUsers })[state.tab]();
  }

  function excluirCandidato(c) {
    var p = c.curriculo_path ? sb.storage.from("curriculos").remove([c.curriculo_path]).then(function (r) { if (r.error) console.warn(r.error); }) : Promise.resolve();
    return p.then(function () { return sb.from("candidatos").delete().eq("id", c.id); }).then(function (r) { if (r.error) throw r.error; });
  }
  function excluirVarios(lista) {
    var i = 0;
    function prox() { if (i >= lista.length) return Promise.resolve(i); return excluirCandidato(lista[i++]).then(prox); }
    return prox();
  }

  // ---------------- Candidatos ----------------
  function limparFiltros() { Object.keys(state.f).forEach(function (k) { state.f[k] = k === "min" ? 0 : ""; }); }
  function filtrar() {
    var f = state.f, agora = Date.now();
    return state.cands.filter(function (c) {
      if (f.vaga && c.vagas.indexOf(f.vaga) < 0) return false;
      if (f.cidade && c.cidade !== f.cidade) return false;
      if (f.cidint && (c.cidades_interesse || []).indexOf(f.cidint) < 0) return false;
      if (f.esc && L.ESC.indexOf(c.escolaridade) < L.ESC.indexOf(f.esc)) return false;
      if (f.exp && L.EXP.indexOf(c.experiencia) < L.EXP.indexOf(f.exp)) return false;
      if (f.lider && String(c.liderou) !== f.lider) return false;
      if (f.excel && L.EXCEL.indexOf(c.excel) < L.EXCEL.indexOf(f.excel)) return false;
      if (f.cnh === "sim" && c.cnh === "Não tenho") return false;
      if (f.turno && c.turnos.indexOf(f.turno) < 0) return false;
      if (f.inicio && L.INICIO.indexOf(c.inicio) > L.INICIO.indexOf(f.inicio)) return false;
      if (f.status && c.status !== f.status) return false;
      if (f.periodo === "vencidos" && !vencido(c)) return false;
      if (f.periodo && f.periodo !== "vencidos" && agora - new Date(c.criado_em).getTime() > Number(f.periodo) * DIA) return false;
      if (f.busca) { var q = f.busca.toLowerCase(); if ((c.nome + " " + c.bairro + " " + c.whatsapp).toLowerCase().indexOf(q) < 0) return false; }
      var n = notaAtual(c);
      if (n && n.total < f.min) return false;
      return true;
    }).sort(function (a, b) { return (notaAtual(b) || { total: 0 }).total - (notaAtual(a) || { total: 0 }).total; });
  }

  function renderCands() {
    var f = state.f, body = $("#tab-body");
    var vagaOpts = '<option value="">Todas (mostra a melhor nota)</option>' + state.vagas.map(function (v) { return '<option value="' + esc(v.id) + '"' + (f.vaga === v.id ? " selected" : "") + ">" + esc(v.nome) + (v.aberta ? "" : " (fechada)") + "</option>"; }).join("");
    var per = [["", "Qualquer data"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["90", "Últimos 90 dias"], ["vencidos", "Mais de 12 meses sem atualização"]];
    body.innerHTML =
      '<div class="layout">' +
      '<details class="filters" open><summary>Filtros <span id="fcount" style="font-size:13px;color:var(--muted);font-family:var(--font-body)"></span></summary><div class="fbody">' +
      '<div><label for="fl-busca">Buscar nome, bairro ou telefone</label><input type="text" id="fl-busca" data-f="busca" value="' + esc(f.busca) + '"></div>' +
      '<div><label for="fl-vaga">Vaga</label><select id="fl-vaga" data-f="vaga">' + vagaOpts + "</select></div>" +
      '<div><label for="fl-min">Nota mínima</label><div class="range-row"><input type="range" id="fl-min" data-f="min" min="0" max="100" step="5" value="' + f.min + '"><output id="fl-min-out">' + f.min + "</output></div></div>" +
      '<div><label for="fl-cidint">Quer trabalhar em</label><select id="fl-cidint" data-f="cidint">' + opts(L.CIDADES, f.cidint, "Qualquer cidade") + "</select></div>" +
      '<div><label for="fl-cidade">Cidade onde mora</label><select id="fl-cidade" data-f="cidade">' + opts(L.CIDADES, f.cidade, "Todas") + "</select></div>" +
      '<div><label for="fl-status">Etapa</label><select id="fl-status" data-f="status">' + opts(L.STATUS, f.status, "Todas") + "</select></div>" +
      '<div><label for="fl-periodo">Data do cadastro</label><select id="fl-periodo" data-f="periodo">' + per.map(function (p) { return '<option value="' + p[0] + '"' + (f.periodo === p[0] ? " selected" : "") + ">" + p[1] + "</option>"; }).join("") + "</select></div>" +
      '<div><label for="fl-esc">Escolaridade mínima</label><select id="fl-esc" data-f="esc">' + opts(L.ESC, f.esc, "Qualquer") + "</select></div>" +
      '<div><label for="fl-exp">Experiência mínima</label><select id="fl-exp" data-f="exp">' + opts(L.EXP.slice(1), f.exp, "Qualquer") + "</select></div>" +
      '<div><label for="fl-lider">Já liderou equipe</label><select id="fl-lider" data-f="lider"><option value="">Tanto faz</option><option value="true"' + (f.lider === "true" ? " selected" : "") + '>Sim</option><option value="false"' + (f.lider === "false" ? " selected" : "") + ">Não</option></select></div>" +
      '<div><label for="fl-excel">Excel mínimo</label><select id="fl-excel" data-f="excel">' + opts(L.EXCEL.slice(1), f.excel, "Qualquer") + "</select></div>" +
      '<div><label for="fl-cnh">CNH</label><select id="fl-cnh" data-f="cnh"><option value="">Tanto faz</option><option value="sim"' + (f.cnh === "sim" ? " selected" : "") + ">Tem CNH</option></select></div>" +
      '<div><label for="fl-turno">Turno disponível</label><select id="fl-turno" data-f="turno">' + opts(L.TURNOS, f.turno, "Qualquer") + "</select></div>" +
      '<div><label for="fl-inicio">Pode começar até</label><select id="fl-inicio" data-f="inicio">' + opts(L.INICIO, f.inicio, "Qualquer prazo") + "</select></div>" +
      '<button type="button" class="btn btn-small" id="limpar">Limpar filtros</button>' +
      "</div></details>" +
      '<section style="min-width:0"><div class="list-tools"><span class="res" id="res"></span>' +
      '<div class="legend"><span style="--c:var(--good)">80+ forte</span><span style="--c:var(--warn)">60 a 79 bom</span><span style="--c:var(--low)">abaixo de 60</span></div>' +
      (admin() ? '<button type="button" class="btn btn-small" id="exportar">Exportar para Excel</button>' : "") + "</div>" +
      '<div class="cards" id="cards"></div></section></div>';

    body.querySelectorAll("[data-f]").forEach(function (el) {
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", function () {
        state.f[el.dataset.f] = el.dataset.f === "min" ? Number(el.value) : el.value;
        if (el.dataset.f === "min") $("#fl-min-out").textContent = el.value;
        listar();
      });
    });
    $("#limpar").onclick = function () { limparFiltros(); renderCands(); };
    if ($("#exportar")) $("#exportar").onclick = exportar;
    if (window.matchMedia("(max-width: 860px)").matches) body.querySelector(".filters").open = false;
    listar();
  }

  function listar() {
    var lista = filtrar(), dup = duplicados();
    var ativos = Object.keys(state.f).filter(function (k) { return k === "min" ? state.f.min > 0 : !!state.f[k]; }).length;
    $("#fcount").textContent = ativos ? ativos + " ativo" + (ativos > 1 ? "s" : "") : "";
    $("#res").textContent = lista.length + " de " + state.cands.length + " candidatos";
    var el = $("#cards");
    if (!state.cands.length) { el.innerHTML = '<div class="empty">Ainda não há cadastros. Assim que alguém preencher o formulário do site, aparece aqui.</div>'; return; }
    if (!lista.length) { el.innerHTML = '<div class="empty">Nenhum candidato com esses filtros. Tente baixar a nota mínima ou limpar algum filtro.</div>'; return; }
    el.innerHTML = lista.map(function (c) {
      var n = notaAtual(c), fx = N.faixa(n.total);
      return '<article class="cand">' +
        '<div class="score ' + fx[0] + '" title="Nota para ' + esc(n.vaga.nome) + '"><div><b>' + n.total + "</b><small>" + fx[1] + "</small></div></div>" +
        '<div style="min-width:0"><h3>' + esc(c.nome) + "</h3>" +
        '<div class="meta">' + (c.idade ? "<span>" + c.idade + " anos</span>" : "") + '<span>' + esc(c.cidade) + " · " + esc(c.bairro) + "</span><span>" + esc(c.escolaridade) + "</span><span>Exp.: " + esc(c.experiencia) + "</span><span>Cadastro " + fmtData(c.criado_em) + "</span></div>" +
        '<div class="tags">' + c.vagas.map(function (id) { var v = vagaById(id); return '<span class="tag vaga">' + esc(v ? v.nome : id) + "</span>"; }).join("") +
        (state.f.vaga ? "" : '<span class="tag">nota para ' + esc(n.vaga.nome) + "</span>") +
        (dup[c.whatsapp] > 1 ? '<span class="tag dup">Cadastro repetido</span>' : "") +
        (vencido(c) ? '<span class="tag velho">Mais de 12 meses</span>' : "") +
        (c.curriculo_path ? '<span class="tag">Com currículo</span>' : "") + "</div>" +
        ((c.cidades_interesse || []).length ? '<div class="meta" style="margin-top:6px"><span>Quer trabalhar em: ' + esc(c.cidades_interesse.join(", ")) + "</span></div>" : "") + "</div>" +
        '<div class="actions"><span class="status' + (c.status === "Novo" ? " st-novo" : "") + '">' + esc(c.status) + "</span>" +
        '<button type="button" class="btn btn-small btn-primary" data-open="' + c.id + '">Ver ficha</button></div></article>';
    }).join("");
    el.querySelectorAll("[data-open]").forEach(function (b) { b.addEventListener("click", function () { abrirFicha(b.dataset.open); }); });
  }

  function exportar() {
    if (!window.XLSX) { toast("Não foi possível carregar o gerador de Excel. Confira a internet."); return; }
    var lista = filtrar();
    var linhas = lista.map(function (c) {
      var n = notaAtual(c);
      return {
        "Nota": n.total, "Nota calculada para": n.vaga.nome, "Nome": c.nome, "Idade": c.idade || "", "WhatsApp": fmtTel(c.whatsapp), "E-mail": c.email || "",
        "Cidade": c.cidade, "Bairro": c.bairro, "Vagas escolhidas": c.vagas.map(function (id) { var v = vagaById(id); return v ? v.nome : id; }).join(", "),
        "Experiência": c.experiencia, "Quer trabalhar em": (c.cidades_interesse || []).join(", "), "Primeiro emprego": c.primeiro_emprego ? "Sim" : "Não",
        "Emprego 1": textoExp(c, 0), "Emprego 2": textoExp(c, 1), "Emprego 3": textoExp(c, 2), "Último cargo": c.ultimo_cargo || "", "Liderou equipe": c.liderou ? "Sim" : "Não",
        "Escolaridade": c.escolaridade, "Curso": c.curso || "", "Excel": c.excel, "CNH": c.cnh, "Turnos": c.turnos.join(", "),
        "Pode começar": c.inicio, "Pretensão salarial": c.pretensao, "Etapa": c.status, "Cadastro em": fmtData(c.criado_em),
        "Currículo anexado": c.curriculo_path ? "Sim" : "Não"
      };
    });
    var ws = XLSX.utils.json_to_sheet(linhas), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Candidatos");
    var d = new Date();
    XLSX.writeFile(wb, "candidatos-servir-" + d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + ".xlsx");
    toast(linhas.length + " candidatos exportados.");
  }

  // ---------------- Experiências ----------------
  var MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  function mesAno(s) { if (!s) return ""; var p = String(s).split("-"); return MES[Number(p[1]) - 1] + "/" + p[0]; }
  function duracao(x) {
    if (!x.entrada) return "";
    var a = x.entrada.split("-").map(Number), hoje = new Date();
    var b = x.atual || !x.saida ? [hoje.getFullYear(), hoje.getMonth() + 1] : x.saida.split("-").map(Number);
    var m = (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1; if (m < 1) m = 1;
    var anos = Math.floor(m / 12), meses = m % 12, t = [];
    if (anos) t.push(anos + (anos === 1 ? " ano" : " anos")); if (meses) t.push(meses + (meses === 1 ? " mês" : " meses"));
    return t.join(" e ");
  }
  function reais(v) { return v ? "R$ " + Number(v).toLocaleString("pt-BR") : ""; }
  function textoExp(c, i) {
    var x = (c.experiencias || [])[i]; if (!x) return "";
    return x.cargo + " - " + x.empresa + " (" + mesAno(x.entrada) + " a " + (x.atual ? "atual" : mesAno(x.saida)) + ", " + duracao(x) + ")" + (x.salario ? " - " + reais(x.salario) : "");
  }
  function listaExps(c) {
    if (c.primeiro_emprego) return "Primeiro emprego (sem experiência)";
    var xs = c.experiencias || [];
    if (!xs.length) return esc(c.ultimo_cargo || "Não informado");
    return '<ul class="exp-list">' + xs.map(function (x) {
      return "<li><b>" + esc(x.cargo) + "</b> · " + esc(x.empresa) + '<div class="t">' + mesAno(x.entrada) + " a " + (x.atual ? "atual" : mesAno(x.saida)) + " · " + duracao(x) + (x.salario ? " · " + reais(x.salario) : "") + "</div></li>";
    }).join("") + "</ul>";
  }

  // ---------------- Ficha ----------------
  function msgWA(c, v) { return "Olá, " + primeiroNome(c.nome) + "! Aqui é da equipe Servir. Recebemos seu cadastro para a vaga de " + v.nome + " e gostamos do seu perfil. Podemos conversar? Qual o melhor horário para você?"; }

  function abrirFicha(id) {
    var c = candById(id); if (!c) return;
    state.aberto = id;
    var vagaSel = notaAtual(c).vaga.id, hist = null, obs = null, confirmando = false;
    document.addEventListener("keydown", escFecha);

    function carregarExtras() {
      return Promise.all([
        sb.from("historico").select("*").eq("candidato_id", id).order("em", { ascending: false }),
        sb.from("observacoes").select("*").eq("candidato_id", id).order("em", { ascending: true })
      ]).then(function (rs) {
        if (rs[0].error) throw rs[0].error; if (rs[1].error) throw rs[1].error;
        hist = rs[0].data; obs = rs[1].data; desenhar();
      }).catch(function (e) { falhou(e, "Não foi possível carregar o histórico."); });
    }

    function desenhar() {
      c = candById(id) || c;
      var v = vagaById(vagaSel) || state.vagas[0], nn = N.nota(c, v), fx = N.faixa(nn.total);
      var msgAtual = $("#fi-msg") ? $("#fi-msg").value : msgWA(c, v);
      var antigo = drawerRoot.querySelector(".drawer"), rolagem = antigo ? antigo.scrollTop : 0;
      setTimeout(function () { var d = drawerRoot.querySelector(".drawer"); if (d) d.scrollTop = rolagem; }, 0);
      drawerRoot.innerHTML = '<div class="backdrop" data-close></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="ficha-nome">' +
        '<div class="drawer-head"><div><div class="brand-sub">Ficha do candidato</div><h2 id="ficha-nome">' + esc(c.nome) + '</h2><div class="hint">Cadastrado em ' + fmtData(c.criado_em) + "</div></div>" +
        '<button class="close" type="button" data-close aria-label="Fechar ficha">✕</button></div>' +

        '<div class="box"><div class="row"><h3>Nota de compatibilidade</h3><div class="score ' + fx[0] + '"><div><b>' + nn.total + "</b><small>" + fx[1] + "</small></div></div></div>" +
        '<div><label class="lbl" for="fi-vaga" style="font-size:13px;color:var(--muted)">Calcular para a vaga</label><select id="fi-vaga">' + state.vagas.map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === vagaSel ? " selected" : "") + ">" + esc(x.nome) + "</option>"; }).join("") + "</select></div>" +
        '<table class="breakdown">' + nn.parts.map(function (p) { return '<tr class="' + (p[1] ? "" : "zero") + '"><td>' + esc(p[0]) + "</td><td>" + p[1] + " de " + p[2] + "</td></tr>"; }).join("") +
        '<tr class="total"><td>Total' + (nn.max === 90 ? " (vaga sem turno: calculado sobre 90)" : "") + "</td><td>" + nn.pts + " de " + nn.max + " → " + nn.total + "</td></tr></table></div>" +

        '<div class="box"><h3>Contato</h3>' +
        '<div class="row"><span>WhatsApp: <b class="wa-num">' + esc(fmtTel(c.whatsapp)) + "</b></span>" + (c.email ? '<span class="wa-num">' + esc(c.email) + "</span>" : "") + "</div>" +
        '<div><label class="lbl" for="fi-msg" style="font-size:13px;color:var(--muted)">Mensagem (pode editar)</label><textarea id="fi-msg">' + esc(msgAtual) + "</textarea></div>" +
        '<div class="row" style="justify-content:flex-start"><a class="btn btn-wa" id="fi-wa" target="_blank" rel="noopener" href="#">Chamar no WhatsApp</a><button class="btn" type="button" id="fi-copy">Copiar mensagem</button></div></div>' +

        '<div class="box"><h3>Dados do cadastro</h3><dl class="dl">' +
        "<dt>Vagas escolhidas</dt><dd>" + c.vagas.map(function (x) { var vv = vagaById(x); return esc(vv ? vv.nome : x); }).join(", ") + "</dd>" +
        "<dt>Idade</dt><dd>" + (c.idade ? c.idade + " anos" : "Não informada") + "</dd>" +
        "<dt>Quer trabalhar em</dt><dd>" + esc((c.cidades_interesse || []).join(", ") || "Não informado") + "</dd>" +
        "<dt>Cidade e bairro</dt><dd>" + esc(c.cidade) + " · " + esc(c.bairro) + "</dd>" +
        "<dt>Experiência</dt><dd>" + esc(c.experiencia) + "</dd>" +
        "<dt>Empregos</dt><dd>" + listaExps(c) + "</dd>" +
        "<dt>Liderou equipe</dt><dd>" + (c.liderou ? "Sim" : "Não") + "</dd>" +
        "<dt>Escolaridade</dt><dd>" + esc(c.escolaridade) + (c.curso ? " · " + esc(c.curso) : "") + "</dd>" +
        "<dt>Excel</dt><dd>" + esc(c.excel) + "</dd>" +
        "<dt>CNH e veículo</dt><dd>" + esc(c.cnh) + "</dd>" +
        "<dt>Turnos</dt><dd>" + esc(c.turnos.join(", ")) + "</dd>" +
        "<dt>Pode começar</dt><dd>" + esc(c.inicio) + "</dd>" +
        "<dt>Pretensão salarial</dt><dd>" + esc(c.pretensao) + "</dd>" +
        "<dt>Currículo</dt><dd>" + (c.curriculo_path ? '<button type="button" class="btn btn-small" id="fi-cv">Abrir currículo</button>' : "Não enviou") + "</dd>" +
        "<dt>Aceite LGPD</dt><dd>" + fmtData(c.aceite_em) + "</dd>" +
        "</dl></div>" +

        '<div class="box"><h3>Etapa da seleção</h3><select id="fi-status">' + opts(L.STATUS, c.status) + "</select>" +
        (hist ? '<ul class="hist">' + hist.map(function (h) { return "<li><b>" + esc(h.status) + "</b> · " + esc(h.por) + " · " + fmtData(h.em) + "</li>"; }).join("") + "</ul>" : '<div class="hint">Carregando histórico…</div>') + "</div>" +

        '<div class="box"><h3>Observações</h3>' +
        (obs ? (obs.length ? '<ul class="hist">' + obs.map(function (o) { return "<li><b>" + esc(o.por) + "</b> · " + fmtData(o.em) + "<br>" + esc(o.texto) + "</li>"; }).join("") + "</ul>" : '<div class="hint">Nenhuma observação ainda.</div>') : '<div class="hint">Carregando…</div>') +
        '<textarea id="fi-obs" maxlength="2000" placeholder="Ex.: Entrevista boa, disponível para começar em novembro."></textarea>' +
        '<div><button type="button" class="btn btn-small btn-primary" id="fi-obs-add">Salvar observação</button></div></div>' +

        (admin() ? '<div class="box"><h3>Excluir dados (LGPD)</h3>' +
          (confirmando ? '<div class="confirm-box"><span>Excluir o cadastro de <b>' + esc(c.nome) + "</b>, o currículo e todo o histórico? Não dá para desfazer.</span>" +
            '<div class="row"><button type="button" class="btn btn-small btn-danger" id="fi-del-sim">Sim, excluir</button><button type="button" class="btn btn-small" id="fi-del-nao">Cancelar</button></div></div>'
            : '<div class="hint" style="margin:0">Use quando o candidato pedir a exclusão pelo e-mail do RH.</div><div><button type="button" class="btn btn-small btn-danger" id="fi-del">Excluir cadastro</button></div>') + "</div>" : "") +
        "</aside>";
      ligar(v);
    }

    function ligar(v) {
      drawerRoot.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", fecharFicha); });
      var msg = $("#fi-msg"), wa = $("#fi-wa");
      function upd() { wa.href = "https://wa.me/55" + c.whatsapp + "?text=" + encodeURIComponent(msg.value); }
      upd(); msg.addEventListener("input", upd);
      $("#fi-copy").onclick = function () {
        var txt = msg.value;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast("Mensagem copiada."); }, function () { msg.select(); toast("Selecionei a mensagem: use Ctrl+C."); });
        else { msg.select(); toast("Selecionei a mensagem: use Ctrl+C."); }
      };
      $("#fi-vaga").onchange = function (e) { vagaSel = e.target.value; $("#fi-msg").value = msgWA(c, vagaById(vagaSel)); desenhar(); };
      $("#fi-status").onchange = function (e) {
        var novo = e.target.value; e.target.disabled = true;
        sb.from("candidatos").update({ status: novo }).eq("id", id).select().single().then(function (r) {
          if (r.error) throw r.error;
          var i = state.cands.indexOf(candById(id)); if (i > -1) state.cands[i] = r.data;
          toast(primeiroNome(c.nome) + " foi para " + novo + ".");
          return carregarExtras();
        }).catch(function (err) { falhou(err, "Não foi possível mudar a etapa."); desenhar(); });
      };
      $("#fi-obs-add").onclick = function () {
        var t = $("#fi-obs").value.trim(); if (!t) { toast("Escreva a observação antes de salvar."); return; }
        this.disabled = true;
        sb.from("observacoes").insert({ candidato_id: id, texto: t }).then(function (r) {
          if (r.error) throw r.error; toast("Observação salva."); return carregarExtras();
        }).catch(function (err) { falhou(err, "Não foi possível salvar a observação."); desenhar(); });
      };
      if ($("#fi-cv")) $("#fi-cv").onclick = function () {
        sb.storage.from("curriculos").createSignedUrl(c.curriculo_path, 600).then(function (r) {
          if (r.error) throw r.error; window.open(r.data.signedUrl, "_blank", "noopener");
        }).catch(function (err) { falhou(err, "Não foi possível abrir o currículo."); });
      };
      if ($("#fi-del")) $("#fi-del").onclick = function () { confirmando = true; desenhar(); };
      if ($("#fi-del-nao")) $("#fi-del-nao").onclick = function () { confirmando = false; desenhar(); };
      if ($("#fi-del-sim")) $("#fi-del-sim").onclick = function () {
        this.disabled = true;
        excluirCandidato(c).then(function () {
          state.cands = state.cands.filter(function (x) { return x.id !== id; });
          toast("Cadastro excluído."); fecharFicha();
        }).catch(function (err) { falhou(err, "Não foi possível excluir."); confirmando = false; desenhar(); });
      };
    }

    desenhar();
    carregarExtras();
    var cl = drawerRoot.querySelector(".close"); if (cl) cl.focus({ preventScroll: true });
  }
  function escFecha(e) { if (e.key === "Escape") fecharFicha(); }
  function fecharFicha() { drawerRoot.innerHTML = ""; state.aberto = null; document.removeEventListener("keydown", escFecha); if (state.me) renderRH(); }

  // ---------------- Quadro ----------------
  function renderBoard() {
    var body = $("#tab-body"), vf = state.f.vaga;
    body.innerHTML =
      '<div class="list-tools"><span class="res">Arraste o candidato para mudar a etapa, ou clique para abrir a ficha.</span>' +
      '<div style="min-width:220px"><label class="lbl" for="bd-vaga" style="font-size:13px;color:var(--muted);margin-bottom:3px">Vaga</label><select id="bd-vaga"><option value="">Todas</option>' + state.vagas.map(function (v) { return '<option value="' + esc(v.id) + '"' + (vf === v.id ? " selected" : "") + ">" + esc(v.nome) + "</option>"; }).join("") + "</select></div></div>" +
      '<div class="board-wrap"><div class="board">' + L.STATUS.map(function (st) {
        var cs = state.cands.filter(function (c) { return c.status === st && (!vf || c.vagas.indexOf(vf) > -1); }).sort(function (a, b) { return notaAtual(b).total - notaAtual(a).total; });
        return '<div class="col" data-col="' + esc(st) + '"><h3>' + esc(st) + "<span>" + cs.length + "</span></h3>" + cs.map(function (c) {
          var n = notaAtual(c), fx = N.faixa(n.total);
          return '<div class="kcard" draggable="true" data-id="' + c.id + '" tabindex="0" role="button" aria-label="Abrir ficha de ' + esc(c.nome) + '"><b>' + esc(c.nome) + '</b><span class="kscore ' + fx[0] + '">' + n.total + '</span><span class="k-sub">' + esc(n.vaga.nome) + " · " + esc(c.cidade) + "</span></div>";
        }).join("") + "</div>";
      }).join("") + "</div></div>";
    $("#bd-vaga").onchange = function (e) { state.f.vaga = e.target.value; renderBoard(); };
    body.querySelectorAll(".kcard").forEach(function (k) {
      k.addEventListener("dragstart", function (e) { e.dataTransfer.setData("text/plain", k.dataset.id); });
      k.addEventListener("click", function () { abrirFicha(k.dataset.id); });
      k.addEventListener("keydown", function (e) { if (e.key === "Enter") abrirFicha(k.dataset.id); });
    });
    body.querySelectorAll(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", function (e) {
        e.preventDefault(); col.classList.remove("over");
        var id = e.dataTransfer.getData("text/plain"), c = candById(id), novo = col.dataset.col;
        if (!c || c.status === novo) return;
        sb.from("candidatos").update({ status: novo }).eq("id", id).select().single().then(function (r) {
          if (r.error) throw r.error;
          state.cands[state.cands.indexOf(c)] = r.data;
          toast(primeiroNome(c.nome) + " foi para " + novo + "."); renderBoard();
        }).catch(function (err) { falhou(err, "Não foi possível mudar a etapa."); });
      });
    });
  }

  // ---------------- Vagas ----------------
  function salvarVaga(v, campos, msg) {
    return sb.from("vagas").update(campos).eq("id", v.id).select().single().then(function (r) {
      if (r.error) throw r.error;
      state.vagas[state.vagas.indexOf(v)] = r.data;
      if (msg) toast(msg);
      return r.data;
    }).catch(function (err) { falhou(err, "Não foi possível salvar a vaga."); renderVagas(); });
  }
  function renderVagas() {
    var body = $("#tab-body"), dis = admin() ? "" : " disabled";
    body.innerHTML =
      '<h2 class="section-title">Vagas e critérios</h2>' +
      '<p class="hint" style="margin:-6px 0 16px;max-width:70ch">Vaga fechada some do formulário do site. Mudou um critério, a nota de todos os candidatos é recalculada na hora.' + (admin() ? "" : " Só o perfil Administrador pode editar.") + "</p>" +
      '<div class="vaga-grid">' + state.vagas.map(function (v) {
        var insc = state.cands.filter(function (c) { return c.vagas.indexOf(v.id) > -1; }).length;
        var cid = v.cidades || [];
        return '<div class="box" data-vaga="' + esc(v.id) + '"><div class="row"><h3>' + esc(v.nome) + '</h3><label class="toggle"><input type="checkbox" data-k="aberta"' + (v.aberta ? " checked" : "") + dis + "> Aberta</label></div>" +
          '<div class="hint" style="margin:0">' + insc + " candidato" + (insc === 1 ? "" : "s") + " escolheram esta vaga</div>" +
          '<div class="kv"><div><label for="v-esc-' + v.id + '">Escolaridade mínima</label><select id="v-esc-' + v.id + '" data-k="esc_min"' + dis + ">" + opts(L.ESC, v.esc_min) + "</select></div>" +
          '<div><label for="v-turno-' + v.id + '">Turno da vaga</label><select id="v-turno-' + v.id + '" data-k="turno"' + dis + ">" + opts(L.TURNOS, v.turno || "", "Não definido (confirma na entrevista)") + "</select></div>" +
          "<div><label>Requisito específico (+10)</label><div>" + esc(L.REQ_TXT[v.req]) + "</div></div></div>" +
          '<details class="cities"><summary>Cidades: ' + (cid.length ? cid.length + " selecionadas" : "todas as 17") + "</summary>" +
          '<div class="city-list">' + L.CIDADES.map(function (cd) { return '<label><input type="checkbox" data-city="' + esc(cd) + '"' + (cid.length === 0 || cid.indexOf(cd) > -1 ? " checked" : "") + dis + "> " + esc(cd) + "</label>"; }).join("") + "</div></details></div>";
      }).join("") + "</div>" +
      '<h2 class="section-title" style="margin-top:28px">Como a nota é calculada</h2>' +
      '<div class="box" style="max-width:560px"><table class="weights"><tr><th>Critério</th><th>Pontos</th></tr>' +
      "<tr><td>Escolheu essa vaga no cadastro</td><td>30</td></tr><tr><td>Mora em cidade atendida pela vaga</td><td>20</td></tr>" +
      "<tr><td>Experiência (nenhuma 0, até 1 ano 8, 1 a 3 anos 14, mais de 3 anos 20)</td><td>até 20</td></tr>" +
      "<tr><td>Atinge a escolaridade mínima</td><td>10</td></tr><tr><td>Turno bate com o da vaga (só quando definido)</td><td>10</td></tr>" +
      "<tr><td>Requisito específico da vaga</td><td>10</td></tr><tr><td><b>Total</b></td><td><b>100</b></td></tr></table>" +
      '<div class="hint">Vaga sem turno definido: a nota é calculada sobre 90 e convertida para 100.</div></div>';
    if (!admin()) return;
    body.querySelectorAll("[data-vaga]").forEach(function (box) {
      var vid = box.dataset.vaga;
      box.querySelectorAll("[data-k]").forEach(function (el) {
        el.addEventListener("change", function () {
          var v = vagaById(vid), campos = {};
          campos[el.dataset.k] = el.type === "checkbox" ? el.checked : (el.value || null);
          salvarVaga(v, campos, "Vaga " + v.nome + " atualizada.");
        });
      });
      var tCid;
      box.querySelectorAll("[data-city]").forEach(function (el) {
        el.addEventListener("change", function () {
          var marc = Array.prototype.map.call(box.querySelectorAll("[data-city]:checked"), function (x) { return x.dataset.city; });
          if (!marc.length) { el.checked = true; toast("Deixe pelo menos uma cidade marcada."); return; }
          var lista = marc.length === L.CIDADES.length ? [] : marc;
          box.querySelector("details summary").textContent = "Cidades: " + (lista.length ? lista.length + " selecionadas" : "todas as 17");
          clearTimeout(tCid);
          tCid = setTimeout(function () { var v = vagaById(vid); salvarVaga(v, { cidades: lista }, "Cidades de " + v.nome + " salvas."); }, 700);
        });
      });
    });
  }

  // ---------------- Resumo ----------------
  function bars(rows) {
    if (!rows.length) return '<div class="hint">Sem dados ainda.</div>';
    var mx = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return '<div class="bars">' + rows.map(function (r) { return '<div class="bar-row"><span>' + esc(r[0]) + '</span><div class="track"><div style="width:' + (r[1] / mx * 100) + '%"></div></div><span class="n">' + r[1] + "</span></div>"; }).join("") + "</div>";
  }
  function renderResumo() {
    var cs = state.cands, agora = Date.now();
    var semana = cs.filter(function (c) { return agora - new Date(c.criado_em).getTime() <= 7 * DIA; }).length;
    var fortes = cs.filter(function (c) { var n = N.melhor(c, state.vagas); return n && n.total >= 80; }).length;
    var meses = {};
    cs.forEach(function (c) { var d = new Date(c.criado_em), m = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); meses[m] = (meses[m] || 0) + 1; });
    var nm = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    $("#tab-body").innerHTML =
      '<div class="stats">' +
      '<div class="stat"><b>' + cs.length + "</b><span>cadastros no banco</span></div>" +
      '<div class="stat"><b>' + semana + "</b><span>nos últimos 7 dias</span></div>" +
      '<div class="stat"><b>' + fortes + "</b><span>com perfil forte (80+)</span></div>" +
      '<div class="stat"><b>' + cs.filter(function (c) { return c.status === "Novo"; }).length + "</b><span>aguardando análise</span></div></div>" +
      '<div class="two"><div class="box"><h3>Candidatos por vaga</h3>' + bars(state.vagas.map(function (v) { return [v.nome, cs.filter(function (c) { return c.vagas.indexOf(v.id) > -1; }).length]; })) + "</div>" +
      '<div class="box"><h3>Candidatos por etapa</h3>' + bars(L.STATUS.map(function (s) { return [s, cs.filter(function (c) { return c.status === s; }).length]; })) + "</div>" +
      '<div class="box"><h3>Cadastros por mês</h3>' + bars(Object.keys(meses).sort().slice(-12).map(function (m) { return [nm[Number(m.slice(5)) - 1] + "/" + m.slice(0, 4), meses[m]]; })) + "</div>" +
      '<div class="box"><h3>Candidatos por cidade</h3>' + bars(L.CIDADES.map(function (cd) { return [cd, cs.filter(function (c) { return c.cidade === cd; }).length]; }).filter(function (r) { return r[1] > 0; }).sort(function (a, b) { return b[1] - a[1]; })) + "</div></div>";
  }

  // ---------------- Usuários ----------------
  function renderUsers() {
    var body = $("#tab-body");
    body.innerHTML =
      '<h2 class="section-title">Quem acessa o painel</h2>' +
      '<p class="hint" style="margin:-6px 0 16px;max-width:72ch">Cadastre a pessoa aqui e avise que ela deve abrir o painel e clicar em <b>Primeiro acesso</b> para criar a própria senha. Quem sai da equipe é bloqueado aqui.</p>' +
      '<div class="box"><div class="tbl-wrap"><table class="users"><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Acesso</th></tr>' +
      state.users.map(function (u, i) {
        var eu = u.email === state.me.email;
        return "<tr><td>" + esc(u.nome) + '</td><td class="wa-num">' + esc(u.email) + '</td><td><select data-perfil="' + i + '"' + (eu ? " disabled" : "") + ">" + opts(["Administrador", "Avaliador"], u.perfil) + '</select></td><td><label class="toggle"><input type="checkbox" data-u="' + i + '"' + (u.ativo ? " checked" : "") + (eu ? " disabled" : "") + "> " + (u.ativo ? "Liberado" : "Bloqueado") + "</label></td></tr>";
      }).join("") + "</table></div>" +
      '<form class="add-user" id="add-user"><div><label class="lbl" for="u-nome" style="font-size:13px">Nome</label><input type="text" id="u-nome" maxlength="120"></div>' +
      '<div><label class="lbl" for="u-email" style="font-size:13px">E-mail</label><input type="email" id="u-email"></div>' +
      '<div><label class="lbl" for="u-perfil" style="font-size:13px">Perfil</label><select id="u-perfil"><option>Avaliador</option><option>Administrador</option></select></div>' +
      '<button class="btn btn-primary" type="submit" id="u-btn">Adicionar</button></form>' +
      '<div class="hint">Administrador: tudo, inclusive exportar, editar vagas, cadastrar pessoas e excluir dados (LGPD). Avaliador: vê candidatos, muda etapas, anota e chama no WhatsApp.</div></div>';
    function salvarUser(u, campos, msg) {
      sb.from("usuarios").update(campos).eq("email", u.email).select().single().then(function (r) {
        if (r.error) throw r.error; state.users[state.users.indexOf(u)] = r.data; toast(msg); renderUsers();
      }).catch(function (err) { falhou(err, "Não foi possível salvar."); renderUsers(); });
    }
    body.querySelectorAll("[data-u]").forEach(function (el) {
      el.onchange = function () { var u = state.users[Number(el.dataset.u)]; salvarUser(u, { ativo: el.checked }, primeiroNome(u.nome) + (el.checked ? " liberado(a)." : " bloqueado(a).")); };
    });
    body.querySelectorAll("[data-perfil]").forEach(function (el) {
      el.onchange = function () { var u = state.users[Number(el.dataset.perfil)]; salvarUser(u, { perfil: el.value }, "Perfil de " + primeiroNome(u.nome) + " alterado."); };
    });
    $("#add-user").onsubmit = function (e) {
      e.preventDefault();
      var nome = $("#u-nome").value.trim(), em = $("#u-email").value.trim().toLowerCase();
      if (nome.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { toast("Preencha nome e um e-mail válido."); return; }
      if (state.users.some(function (u) { return u.email === em; })) { toast("Este e-mail já está na lista."); return; }
      $("#u-btn").disabled = true;
      sb.from("usuarios").insert({ nome: nome, email: em, perfil: $("#u-perfil").value }).select().single().then(function (r) {
        if (r.error) throw r.error;
        state.users.push(r.data); renderUsers();
        toast("Acesso liberado. Avise " + primeiroNome(nome) + " para clicar em Primeiro acesso.");
      }).catch(function (err) { falhou(err, "Não foi possível adicionar."); renderUsers(); });
    };
  }
})();
