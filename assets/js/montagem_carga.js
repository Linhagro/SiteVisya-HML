// montagem_carga.js
// Tela de Montagem de Carga reutilizando o módulo de rotas

(function () {
  console.log("[MONTAGEM_CARGA] init");

  // Elementos principais
  const btnVoltarDashboard = document.getElementById("btnVoltarDashboard");
  const btnAtualizarPedidos = document.getElementById("btnAtualizarPedidos");
  const selectOrigem = document.getElementById("selectOrigem");
  const inputBuscaClientes = document.getElementById("inputBuscaClientes");

  const resumoQtdPedidos = document.getElementById("resumoQtdPedidos");
  const resumoVolume = document.getElementById("resumoVolume");
  const resumoPeso = document.getElementById("resumoPeso");
  const resumoOcupacao = document.getElementById("resumoOcupacao");

  const inputComprimento = document.getElementById("inputComprimento");
  const inputLargura = document.getElementById("inputLargura");
  const inputAltura = document.getElementById("inputAltura");
  const inputPesoMaximo = document.getElementById("inputPesoMaximo");

  const btnGerarMontagem = document.getElementById("btnGerarMontagem");
  const btnVisualizar3D = document.getElementById("btnVisualizar3D");
  const iframeViewer3D = document.getElementById("iframeViewer3D");

  if (!btnGerarMontagem) {
    console.warn("[MONTAGEM_CARGA] Elementos não encontrados, abortando init");
    return;
  }

  // --- INTEGRAÇÃO COM ROTAS.JS ---

  // Aqui assumimos que o rotas.js expõe:
  // - getCacheAtual() : retorna lista de pontos (pedidos/clientes)
  // - idsSelecionados (Set) com os IDs selecionados
  // - atualizarContadorSelecionados() + renderClientes() já estão rodando

  // Se rotas.js não expuser nada no window, dá para adaptar depois.
  const apiRotas = window.RotasAPI || {};

  // Fallback local para getCacheAtual, se o rotas.js deixou global
  const getCacheAtual =
    apiRotas.getCacheAtual ||
    (typeof window.getCacheAtual === "function" ? window.getCacheAtual : null);

  const getIdsSelecionados =
    apiRotas.getIdsSelecionados ||
    (() => (window.idsSelecionados ? window.idsSelecionados : new Set()));

  if (!getCacheAtual) {
    console.warn(
      "[MONTAGEM_CARGA] getCacheAtual não encontrado. Verificar integração com rotas.js."
    );
  }

  // Inicialização de origem: força "pedidos"
  if (selectOrigem) {
    selectOrigem.value = "pedidos";
    selectOrigem.addEventListener("change", () => {
      const origem = selectOrigem.value;
      if (apiRotas.setOrigemAtual) {
        apiRotas.setOrigemAtual(origem);
      } else if (window.setOrigemAtual) {
        window.setOrigemAtual(origem);
      }

      // Dispara recarga
      carregarOrigemAtual();
    });
  }

  if (btnAtualizarPedidos) {
    btnAtualizarPedidos.addEventListener("click", () => {
      carregarOrigemAtual();
    });
  }

  if (btnVoltarDashboard) {
    btnVoltarDashboard.addEventListener("click", () => {
      // Ajusta para sua navegação real
      window.location.href = "inicio.html";
    });
  }

  if (inputBuscaClientes) {
    inputBuscaClientes.addEventListener("input", () => {
      const termo = inputBuscaClientes.value || "";
      filtrarClientesPorBusca(termo);
    });
  }

  function carregarOrigemAtual() {
    const origem = selectOrigem ? selectOrigem.value : "pedidos";
    console.log("[MONTAGEM_CARGA] carregar origem", origem);

    if (apiRotas.carregarOrigem) {
      apiRotas.carregarOrigem(origem);
      return;
    }

    // Fallback usando funções globais do rotas.js, se existirem
    if (origem === "pedidos" && window.carregarPedidosPendentes) {
      window.carregarPedidosPendentes();
    } else if (origem === "clientes" && window.carregarClientesNormais) {
      window.carregarClientesNormais();
    } else if (origem === "carteira" && window.carregarCarteiraClientes) {
      window.carregarCarteiraClientes();
    } else {
      console.warn(
        "[MONTAGEM_CARGA] Nenhuma função de carga encontrada para origem",
        origem
      );
    }
  }

  function filtrarClientesPorBusca(termo) {
    if (!getCacheAtual || !window.renderClientes) return;
    const todos = getCacheAtual() || [];
    const t = termo.trim().toLowerCase();

    if (!t) {
      window.renderClientes(todos);
      return;
    }

    const filtrados = todos.filter((c) => {
      const nome = (c.nome || "").toLowerCase();
      const codigo = (String(c.codigo) || "").toLowerCase();
      const endereco = (c.endereco || "").toLowerCase();
      return (
        nome.includes(t) || codigo.includes(t) || endereco.includes(t)
      );
    });

    window.renderClientes(filtrados);
  }

  // --- MONTAGEM DE CARGA (RESUMO) ---

  function calcularResumoCarga() {
    const cache = getCacheAtual ? getCacheAtual() : [];
    const idsSel = getIdsSelecionados();

    const selecionados = cache.filter((c) => idsSel.has(c.id));

    const qtdPedidos = selecionados.length;

    // Por enquanto volume/peso fake, só para ter número:
    // volumePorPedido = 0.5 m³, pesoPorPedido = 100 kg
    let volumeTotal = 0;
    let pesoTotal = 0;

    for (const p of selecionados) {
      const vol = p.volume || 0.5;
      const peso = p.peso || 100;
      volumeTotal += vol;
      pesoTotal += peso;
    }

    const comprimento = parseFloat(inputComprimento.value || "0");
    const largura = parseFloat(inputLargura.value || "0");
    const altura = parseFloat(inputAltura.value || "0");
    const pesoMaximo = parseFloat(inputPesoMaximo.value || "0");

    const volumeVeiculo =
      comprimento > 0 && largura > 0 && altura > 0
        ? comprimento * largura * altura
        : 0;

    const ocupacaoVolume =
      volumeVeiculo > 0 ? (volumeTotal / volumeVeiculo) * 100 : 0;

    const ocupacaoPeso =
      pesoMaximo > 0 ? (pesoTotal / pesoMaximo) * 100 : 0;

    const ocupacao = Math.max(ocupacaoVolume, ocupacaoPeso);

    resumoQtdPedidos.textContent = qtdPedidos;
    resumoVolume.textContent = volumeTotal.toFixed(2) + " m³";
    resumoPeso.textContent = pesoTotal.toFixed(0) + " kg";
    resumoOcupacao.textContent = ocupacao.toFixed(0) + "%";

    // habilita ou não o botão de 3D
    btnVisualizar3D.disabled = qtdPedidos === 0;
  }

  // Dispara cálculo quando mudar veículo
  [inputComprimento, inputLargura, inputAltura, inputPesoMaximo].forEach(
    (el) => {
      if (!el) return;
      el.addEventListener("change", calcularResumoCarga);
      el.addEventListener("blur", calcularResumoCarga);
    }
  );

  // Hook para ser chamado pelo rotas.js quando seleção mudar
  // Se quiser, podemos integrar direto no rotas.js depois.
  window.atualizarResumoMontagemCarga = function () {
    try {
      calcularResumoCarga();
    } catch (e) {
      console.error("[MONTAGEM_CARGA] erro ao atualizar resumo", e);
    }
  };

  // --- BOTÕES DE AÇÃO ---

  btnGerarMontagem.addEventListener("click", () => {
    console.log("[MONTAGEM_CARGA] Gerar montagem de carga");
    calcularResumoCarga();

    // Aqui depois vamos gerar a lista de caixas/paletes por pedido
    // e enviar para o iframe do viewer 3D via postMessage.
    enviarCargaParaViewer3D();
  });

  btnVisualizar3D.addEventListener("click", () => {
    // por enquanto só garante que o iframe receba o foco
    if (iframeViewer3D) {
      iframeViewer3D.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  function montarPayloadCarga3D() {
    const cache = getCacheAtual ? getCacheAtual() : [];
    const idsSel = getIdsSelecionados();
    const selecionados = cache.filter((c) => idsSel.has(c.id));

    const comprimento = parseFloat(inputComprimento.value || "0");
    const largura = parseFloat(inputLargura.value || "0");
    const altura = parseFloat(inputAltura.value || "0");
    const pesoMaximo = parseFloat(inputPesoMaximo.value || "0");

    // Por enquanto, monta caixas genéricas por pedido.
    const boxes = selecionados.map((p, idx) => ({
      id: p.id,
      label: p.nome || `Pedido ${p.id}`,
      // valores fictícios, depois ligamos nos dados reais
      length: 1.0,
      width: 1.0,
      height: 1.0,
      weight: 100,
      orderIndex: idx,
    }));

    return {
      vehicle: {
        length: comprimento,
        width: largura,
        height: altura,
        maxWeight: pesoMaximo,
      },
      boxes,
    };
  }

  function enviarCargaParaViewer3D() {
    if (!iframeViewer3D || !iframeViewer3D.contentWindow) {
      console.warn("[MONTAGEM_CARGA] iframeViewer3D não disponível");
      return;
    }

    const payload = montarPayloadCarga3D();

    iframeViewer3D.contentWindow.postMessage(
      {
        type: "LOAD_CARGA",
        payload,
      },
      "*"
    );
  }

  // Carregamento inicial
  carregarOrigemAtual();

  // Pequeno delay para garantir que rotas.js já desenhou a lista
  setTimeout(calcularResumoCarga, 1000);
})();