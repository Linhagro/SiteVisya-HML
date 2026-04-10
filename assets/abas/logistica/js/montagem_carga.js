// assets/abas/logistica/js/montagem_carga.js
// Controla resumo da carga e integração com o viewer 3D

(function () {
  console.log("[MONTAGEM_CARGA] init");

  const btnVoltar = document.getElementById("btnVoltar");
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

  if (!resumoQtdPedidos || !btnGerarMontagem) {
    console.warn("[MONTAGEM_CARGA] elementos principais não encontrados");
    return;
  }

  if (btnVoltar) {
    btnVoltar.addEventListener("click", () => {
      // ajuste o destino conforme seu shell
      window.history.back();
    });
  }

  function getDadosSelecionados() {
    if (!window.LogisticaEmbed) {
      return { selecionados: [], cache: [] };
    }
    const cache = window.LogisticaEmbed.getCacheAtual
      ? window.LogisticaEmbed.getCacheAtual()
      : [];
    const idsSel = window.LogisticaEmbed.getIdsSelecionados
      ? window.LogisticaEmbed.getIdsSelecionados()
      : new Set();

    const selecionados = cache.filter(c => idsSel.has(c.id));
    return { selecionados, cache };
  }

  function calcularResumoCarga() {
    const { selecionados } = getDadosSelecionados();

    const qtdPedidos = selecionados.length;

    let volumeTotal = 0;
    let pesoTotal = 0;

    selecionados.forEach(p => {
      const vol = p.volume || 0.5; // m³ fictício por enquanto
      const peso = p.peso || 100; // kg fictício por enquanto
      volumeTotal += vol;
      pesoTotal += peso;
    });

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

    btnVisualizar3D.disabled = qtdPedidos === 0;
  }

  // Expor função global para rotas_embed.js chamar quando seleção muda
  window.atualizarResumoMontagemCarga = function () {
    try {
      calcularResumoCarga();
    } catch (e) {
      console.error("[MONTAGEM_CARGA] erro ao atualizar resumo:", e);
    }
  };

  [inputComprimento, inputLargura, inputAltura, inputPesoMaximo].forEach(el => {
    if (!el) return;
    el.addEventListener("change", calcularResumoCarga);
    el.addEventListener("blur", calcularResumoCarga);
  });

  function montarPayloadCarga3D() {
    const { selecionados } = getDadosSelecionados();

    const comprimento = parseFloat(inputComprimento.value || "0");
    const largura = parseFloat(inputLargura.value || "0");
    const altura = parseFloat(inputAltura.value || "0");
    const pesoMaximo = parseFloat(inputPesoMaximo.value || "0");

    const boxes = selecionados.map((p, idx) => ({
      id: p.id,
      label: p.nome || `Pedido ${p.id}`,
      length: 1.0,
      width: 1.0,
      height: 1.0,
      weight: p.peso || 100,
      orderIndex: idx
    }));

    return {
      vehicle: {
        length: comprimento,
        width: largura,
        height: altura,
        maxWeight: pesoMaximo
      },
      boxes
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
        payload
      },
      "*"
    );
  }

  if (btnGerarMontagem) {
    btnGerarMontagem.addEventListener("click", () => {
      calcularResumoCarga();
      enviarCargaParaViewer3D();
    });
  }

  if (btnVisualizar3D) {
    btnVisualizar3D.addEventListener("click", () => {
      if (iframeViewer3D) {
        iframeViewer3D.scrollIntoView({
          behavior: "smooth",
          block: "center"
        });
      }
    });
  }

  // Chamada inicial
  setTimeout(calcularResumoCarga, 500);
})();