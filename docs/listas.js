// Listas usadas pelo formulário e pelo painel.
// Se mudar alguma opção aqui, mude também no banco (arquivo banco/01_estrutura.sql),
// porque o banco só aceita os valores da lista.
window.SERVIR_LISTAS = {
  CIDADES: ["Três Rios", "Paraíba do Sul", "Levy Gasparian", "Mathias Barbosa (MG)", "Petrópolis", "Itaipava", "Areal", "Posse", "Nova Friburgo", "Miguel Pereira", "Paty do Alferes", "Vassouras", "Valença", "Barra do Piraí", "Barra Mansa", "Volta Redonda", "Pinheiral"],
  ESC: ["Fundamental", "Médio incompleto", "Médio completo", "Técnico", "Superior cursando", "Superior completo", "Pós-graduação"],
  EXP: ["Nenhuma", "Até 1 ano", "1 a 3 anos", "Mais de 3 anos"],
  EXP_PTS: [0, 8, 14, 20],
  EXCEL: ["Não uso", "Básico", "Intermediário", "Avançado"],
  CNH: ["Não tenho", "Tenho CNH", "CNH e carro", "CNH e moto"],
  TURNOS: ["Manhã", "Tarde", "Noite", "Escala/fins de semana"],
  INICIO: ["Imediato", "Até 15 dias", "Até 30 dias"],
  SALARIO: ["Até R$ 2.000", "R$ 2.001 a 3.000", "R$ 3.001 a 4.500", "R$ 4.501 a 6.000", "Acima de R$ 6.000", "Prefiro informar na entrevista"],
  STATUS: ["Novo", "Em análise", "Entrevista agendada", "Aprovado", "Contratado", "Banco de talentos", "Não selecionado"],
  REQ_TXT: {
    escala: "Disponível para escala/fins de semana",
    excelInt: "Excel intermediário ou avançado",
    excelAv: "Excel avançado",
    lider: "Já liderou equipe",
    cnh: "Tem CNH"
  },
  VAGAS_PADRAO: [
    { v: "promotor", t: "Promotor de vendas" }, { v: "financeiro", t: "Financeiro" }, { v: "supvendas", t: "Supervisor de vendas" },
    { v: "supcob", t: "Supervisor de atendimento e cobrança" }, { v: "comercial", t: "Comercial" }, { v: "rh", t: "RH" }, { v: "analista", t: "Analista" }
  ]
};
