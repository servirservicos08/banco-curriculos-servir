// Cálculo da nota de compatibilidade (0 a 100) — mesma regra aprovada na especificação.
(function (raiz) {
  "use strict";
  function criar(L) {
    var REQ = {
      escala: function (c) { return (c.turnos || []).indexOf("Escala/fins de semana") > -1; },
      excelInt: function (c) { return L.EXCEL.indexOf(c.excel) >= 2; },
      excelAv: function (c) { return c.excel === "Avançado"; },
      lider: function (c) { return !!c.liderou; },
      cnh: function (c) { return !!c.cnh && c.cnh !== "Não tenho"; }
    };
    function nota(c, v) {
      var parts = [], max = 100;
      var cidades = v.cidades || [];
      parts.push(["Escolheu essa vaga no cadastro", (c.vagas || []).indexOf(v.id) > -1 ? 30 : 0, 30]);
      parts.push(["Cidade atendida pela vaga", (cidades.length === 0 || cidades.indexOf(c.cidade) > -1) ? 20 : 0, 20]);
      var ie = L.EXP.indexOf(c.experiencia);
      parts.push(["Experiência: " + c.experiencia, ie > -1 ? L.EXP_PTS[ie] : 0, 20]);
      parts.push(["Escolaridade mínima (" + v.esc_min + ")", L.ESC.indexOf(c.escolaridade) >= L.ESC.indexOf(v.esc_min) ? 10 : 0, 10]);
      if (v.turno) parts.push(["Turno da vaga: " + v.turno, (c.turnos || []).indexOf(v.turno) > -1 ? 10 : 0, 10]);
      else max = 90;
      parts.push([L.REQ_TXT[v.req] || v.req, REQ[v.req] && REQ[v.req](c) ? 10 : 0, 10]);
      var pts = parts.reduce(function (s, p) { return s + p[1]; }, 0);
      return { total: Math.round(pts / max * 100), pts: pts, max: max, parts: parts, vaga: v };
    }
    function melhor(c, vagas) {
      var best = null;
      (c.vagas || []).forEach(function (id) {
        var v = vagas.filter(function (x) { return x.id === id; })[0];
        if (!v) return;
        var n = nota(c, v);
        if (!best || n.total > best.total) best = n;
      });
      return best || (vagas.length ? nota(c, vagas[0]) : null);
    }
    function faixa(t) { return t >= 80 ? ["s-forte", "Forte"] : t >= 60 ? ["s-bom", "Bom"] : ["s-baixo", "Baixo"]; }
    return { nota: nota, melhor: melhor, faixa: faixa };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = criar;
  else raiz.SERVIR_NOTA = criar(raiz.SERVIR_LISTAS);
})(this);
