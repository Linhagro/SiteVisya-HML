// assets/abas/logistica/js/rotas_embed.js
// Módulo enxuto de logística para a aba Montagem de Carga

(function () {
  console.log("[LOGISTICA_EMBED] init");

  // ================== CONFIG API BASE ==================
  const API_BASE =
    window.API_BASE ||
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";

  function getAuthHeaders() {
    try {
      const token =
        (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (!token) return {};
      return {
        Authorization: "Bearer " + token
      };
    } catch (e) {
      console.warn(
        "[LOGISTICA_EMBED] erro ao ler authToken do sessionStorage:",
        e
      );
      return {};
    }
  }

  async function apiFetch(path, options = {}) {
    const url = API_BASE + path;
    const resp = await fetch(url, {
      method: options.method || "GET",
      headers: {
        ...(options.headers || {}),
        ...(getAuthHeaders() || {})
      },
      body: options.body === undefined ? undefined : options.body
    });
    return resp;
  }

  // ================== LOADER LOCAL ==================
  let loaderTimer = null;

  function showLoader() {
    const overlay = document.getElementById("loaderOverlay");
    if (!overlay) return;
    if (loaderTimer) clearTimeout(loaderTimer);
    loaderTimer = setTimeout(() => {
      overlay.setAttribute("aria-hidden", "false");
      overlay.style.display = "flex";
    }, 60);
  }

  function hideLoader() {
    const overlay = document.getElementById("loaderOverlay");
    if (!overlay) return;
    if (loaderTimer) {
      clearTimeout(loaderTimer);
      loaderTimer = null;
    }
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.display = "none";
  }

  // ================== MAPA ==================
  const map = L.map("map", {
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    wheelDebounceTime: 20,
    wheelPxPerZoomLevel: 80,
    attributionControl: false
  }).setView([-19.5, -40.3], 7);

  const tileLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
    {
      maxZoom: 20,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    }
  );
  tileLayer.addTo(map);

  map.doubleClickZoom.disable();

  // Marker default vazio
  L.Marker.prototype.options.icon = L.divIcon({
    className: "",
    html: "",
    iconSize: null
  });

  // TOMTOM TRAFFIC FLOW
  const TOMTOM_API_KEY = "l22aGTuKjY30e1lAcUqAup3XZ8pYzCOb";

  const trafficLayer = L.tileLayer(
    "https://api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=" +
      TOMTOM_API_KEY,
    {
      opacity: 0.7,
      attribution: "© TomTom"
    }
  );

  function setTrafficVisible(on) {
    if (on) {
      trafficLayer.addTo(map);
    } else {
      map.removeLayer(trafficLayer);
    }
  }

  // ================== ESTADO ==================
  let cachePedidos = [];
  let cacheClientes = [];
  let cacheCarteira = [];
  let origemAtual = "pedidos"; // pedidos | clientes | carteira

  let clientesFiltrados = [];
  let paginaClientes = 0;
  const TAM_PAGINA = 30;
  let carregandoPagina = false;

  const idsSelecionados = new Set();
  const markersClientes = {};
  let rotaPolyline = null;

  // ================== DOM ==================
  const selectOrigem = document.getElementById("selectOrigem");
  const inputBusca = document.getElementById("inputBusca");
  const listaClientesDiv = document.getElementById("listaClientes");
  const contadorClientesSpan = document.getElementById("contadorClientes");
  const contadorSelecionadosSpan = document.getElementById(
    "contadorSelecionados"
  );
  const btnAtualizar = document.getElementById("btnAtualizar");
  const btnLimparRota = document.getElementById("btnLimparRota");
  const toggleTraffic = document.getElementById("toggleTraffic");

  // ================== HELPERS ==================
  function normalizarLat(valor) {
    if (valor == null) return null;
    if (typeof valor === "number") {
      return Number.isFinite(valor) && valor >= -90 && valor <= 90 ? valor : null;
    }
    const s = String(valor).trim();
    if (!s) return null;
    if (s.includes("e") || s.includes("E")) return null;
    const n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n) || n < -90 || n > 90) return null;
    return n;
  }

  function normalizarLng(valor) {
    if (valor == null) return null;
    if (typeof valor === "number") {
      return Number.isFinite(valor) && valor >= -180 && valor <= 180
        ? valor
        : null;
    }
    const s = String(valor).trim();
    if (!s) return null;
    if (s.includes("e") || s.includes("E")) return null;
    const n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n) || n < -180 || n > 180) return null;
    return n;
  }

  function montarEnderecoPadrao(item) {
    const partes = [];
    if (item.logradouro) {
      let log = item.logradouro;
      if (item.numero) log += ", " + item.numero;
      partes.push(log);
    }
    const linha2 = [];
    if (item.bairro) linha2.push(item.bairro);
    if (item.cidade) linha2.push(item.cidade);
    if (item.uf) linha2.push(item.uf);
    if (linha2.length) partes.push(linha2.join(" - "));
    if (item.cep) partes.push("CEP " + item.cep);
    return partes.join(" | ");
  }

  function limparMapa() {
    Object.values(markersClientes).forEach(m => {
      if (map.hasLayer(m)) map.removeLayer(m);
    });
    Object.keys(markersClientes).forEach(k => delete markersClientes[k]);

    if (rotaPolyline && map.hasLayer(rotaPolyline)) {
      map.removeLayer(rotaPolyline);
      rotaPolyline = null;
    }
  }

  function atualizarContadores() {
    contadorClientesSpan.textContent =
      (clientesFiltrados ? clientesFiltrados.length : 0) + " clientes";
    contadorSelecionadosSpan.textContent =
      idsSelecionados.size + " selecionados";
  }

  // ================== RENDER LISTA ==================
  function limparListaVisual() {
    listaClientesDiv.innerHTML = "";
    paginaClientes = 0;
    carregandoPagina = false;
  }

  function criarItemCliente(c) {
    const div = document.createElement("div");
    div.className = "cliente-item";
    div.dataset.id = c.id;

    const label = document.createElement("label");
    label.className = "checkbox-wrapper";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = c.id;

    const checkmark = document.createElement("div");
    checkmark.className = "checkmark";
    checkmark.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M20 6L9 17L4 12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;

    label.appendChild(checkbox);
    label.appendChild(checkmark);

    const textos = document.createElement("div");
    textos.className = "cliente-textos";

    const spanNome = document.createElement("span");
    spanNome.className = "nome";
    spanNome.textContent =
      c.origemTipo === "pedido"
        ? `${c.codigo} - ${c.nome}`
        : `${c.codigo} - ${c.nome}`;

    const spanBadge = document.createElement("span");
    spanBadge.className = "badge";
    spanBadge.textContent = c.endereco || "";

    textos.appendChild(spanNome);
    textos.appendChild(spanBadge);

    const latValida = normalizarLat(c.lat) != null;
    const lngValida = normalizarLng(c.lng) != null;
    const semLocalizacao = !latValida || !lngValida;

    if (semLocalizacao) {
      const alerta = document.createElement("span");
      alerta.className = "badge alerta";
      alerta.textContent = "endereço não localizado";
      textos.appendChild(alerta);

      checkbox.disabled = true;
      label.classList.add("checkbox-desabilitado");
      div.classList.add("cliente-sem-localizacao");
    }

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        idsSelecionados.add(c.id);
        div.classList.add("selecionado");
      } else {
        idsSelecionados.delete(c.id);
        div.classList.remove("selecionado");
      }
      atualizarContadores();
      desenharRotaBasica();
      if (window.atualizarResumoMontagemCarga) {
        window.atualizarResumoMontagemCarga();
      }
    });

    div.appendChild(label);
    div.appendChild(textos);
    return div;
  }

  function renderPaginaClientes() {
    if (!clientesFiltrados || clientesFiltrados.length === 0) {
      limparListaVisual();
      atualizarContadores();
      return;
    }

    const inicio = paginaClientes * TAM_PAGINA;
    if (inicio >= clientesFiltrados.length) return;

    const fim = Math.min(
      inicio + TAM_PAGINA,
      clientesFiltrados.length
    );

    const frag = document.createDocumentFragment();
    for (let i = inicio; i < fim; i++) {
      const c = clientesFiltrados[i];
      const item = criarItemCliente(c);
      if (idsSelecionados.has(c.id)) {
        const cb = item.querySelector("input[type=checkbox]");
        if (cb && !cb.disabled) {
          cb.checked = true;
          item.classList.add("selecionado");
        }
      }
      frag.appendChild(item);
    }

    listaClientesDiv.appendChild(frag);
    paginaClientes += 1;
    atualizarContadores();
  }

  function renderClientes(clientes) {
    clientesFiltrados = clientes || [];
    limparListaVisual();
    renderPaginaClientes();
  }

  function configurarInfiniteScroll() {
    listaClientesDiv.addEventListener("scroll", () => {
      if (carregandoPagina) return;
      const bottom =
        listaClientesDiv.scrollTop + listaClientesDiv.clientHeight;
      const limite = listaClientesDiv.scrollHeight - 40;
      if (bottom >= limite) {
        const inicio = paginaClientes * TAM_PAGINA;
        if (!clientesFiltrados || inicio >= clientesFiltrados.length) return;
        carregandoPagina = true;
        setTimeout(() => {
          renderPaginaClientes();
          carregandoPagina = false;
        }, 0);
      }
    });
  }

  // ================== CARREGAMENTO ORIGENS ==================
  function getCacheAtual() {
    if (origemAtual === "pedidos") return cachePedidos;
    if (origemAtual === "clientes") return cacheClientes;
    if (origemAtual === "carteira") return cacheCarteira;
    return [];
  }

  async function carregarPedidosPendentes() {
    showLoader();
    try {
      let path = "/pedidos-pendentes";
      console.log("[LOGISTICA_EMBED] GET", API_BASE + path);
      const resp = await apiFetch(path);
      if (!resp.ok) {
        console.error("[LOGISTICA_EMBED] HTTP", resp.status);
        cachePedidos = [];
        renderClientes([]);
        return;
      }
      const data = await resp.json();
      cachePedidos = (data.pedidos || []).map(p => {
        const endereco = montarEnderecoPadrao(p);
        return {
          id: p.NUNOTA,
          codigo: p.NUNOTA,
          nome: p.NOME_CLIENTE,
          endereco,
          origemTipo: "pedido",
          nunota: p.NUNOTA,
          numnota: p.NUMNOTA,
          codparc: p.CODPARC,
          codvend: p.CODVEND,
          nomevendedor: p.NOMEVENDEDOR,
          codemp: p.CODEMP,
          logradouro: p.logradouro,
          numero: p.numero,
          bairro: p.bairro,
          cidade: p.cidade,
          uf: p.uf,
          cep: p.cep,
          lat: normalizarLat(p.lat),
          lng: normalizarLng(p.lng)
        };
      });

      idsSelecionados.clear();
      limparMapa();
      renderClientes(cachePedidos);
    } catch (e) {
      console.error("[LOGISTICA_EMBED] erro carregarPedidosPendentes:", e);
      cachePedidos = [];
      renderClientes([]);
    } finally {
      hideLoader();
    }
  }

  async function carregarClientes() {
    showLoader();
    try {
      const path = "/logistica/clientes";
      console.log("[LOGISTICA_EMBED] GET", API_BASE + path);
      const resp = await apiFetch(path);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      cacheClientes = (data.clientes || []).map(r => {
        const endereco = montarEnderecoPadrao(r);
        return {
          id: r.id,
          codigo: r.codigo,
          nome: r.nomecliente || r.nome,
          endereco,
          origemTipo: "clientes",
          codparc: r.codparc,
          codvend: r.codvend,
          nomevendedor: r.nomevendedor,
          codemp: r.codemp,
          logradouro: r.logradouro,
          numero: r.numero,
          bairro: r.bairro,
          cidade: r.cidade,
          uf: r.uf,
          cep: r.cep,
          lat: normalizarLat(r.lat),
          lng: normalizarLng(r.lng)
        };
      });

      idsSelecionados.clear();
      limparMapa();
      renderClientes(cacheClientes);
    } catch (e) {
      console.error("[LOGISTICA_EMBED] erro carregarClientes:", e);
      cacheClientes = [];
      renderClientes([]);
    } finally {
      hideLoader();
    }
  }

  async function carregarCarteira() {
    // se precisar de filtro de vendedor, pode extender depois
    showLoader();
    try {
      const path = "/carteira";
      console.log("[LOGISTICA_EMBED] GET", API_BASE + path);
      const resp = await apiFetch(path);
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      cacheCarteira = (data.carteira || []).map(c => {
        const endereco = montarEnderecoPadrao(c);
        return {
          id: c.codparc,
          codigo: c.codparc,
          nome: c.nomecliente,
          endereco,
          origemTipo: "carteira",
          codparc: c.codparc,
          codvend: c.codvend,
          nomevendedor: c.nomevendedor,
          codemp: c.codemp,
          logradouro: c.logradouro,
          numero: c.numero,
          bairro: c.bairro,
          cidade: c.cidade,
          uf: c.uf,
          cep: c.cep,
          lat: normalizarLat(c.lat),
          lng: normalizarLng(c.lng)
        };
      });

      idsSelecionados.clear();
      limparMapa();
      renderClientes(cacheCarteira);
    } catch (e) {
      console.error("[LOGISTICA_EMBED] erro carregarCarteira:", e);
      cacheCarteira = [];
      renderClientes([]);
    } finally {
      hideLoader();
    }
  }

  function carregarOrigemAtual() {
    if (origemAtual === "pedidos") {
      carregarPedidosPendentes();
    } else if (origemAtual === "clientes") {
      carregarClientes();
    } else if (origemAtual === "carteira") {
      carregarCarteira();
    }
  }

  // ================== FILTRO ==================
  function aplicarFiltro() {
    const termo = (inputBusca.value || "").trim().toLowerCase();
    const base = getCacheAtual();
    if (!termo) {
      renderClientes(base);
      return;
    }
    const filtrados = base.filter(c => {
      const nome = (c.nome || "").toLowerCase();
      const cod = String(c.codigo || "").toLowerCase();
      const end = (c.endereco || "").toLowerCase();
      return (
        nome.includes(termo) || cod.includes(termo) || end.includes(termo)
      );
    });
    renderClientes(filtrados);
  }

  // ================== ROTA BÁSICA ==================
  function desenharRotaBasica() {
    limparMapa();

    const base = getCacheAtual();
    const selecionados = base.filter(c => idsSelecionados.has(c.id));

    const pontosValidos = [];
    selecionados.forEach(c => {
      const lat = normalizarLat(c.lat);
      const lng = normalizarLng(c.lng);
      if (lat == null || lng == null) return;
      pontosValidos.push({ c, lat, lng });
    });

    if (pontosValidos.length === 0) {
      map.setView([-19.5, -40.3], 7);
      return;
    }

    const latlngs = [];

    pontosValidos.forEach((p, idx) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6,
        color: "#2563eb",
        fillColor: "#60a5fa",
        fillOpacity: 0.9
      }).bindPopup(`${p.c.codigo} - ${p.c.nome}`);
      markersClientes[p.c.id] = marker;
      marker.addTo(map);
      latlngs.push([p.lat, p.lng]);
    });

    if (latlngs.length >= 2) {
      rotaPolyline = L.polyline(latlngs, {
        color: "#22c55e",
        weight: 3,
        opacity: 0.9
      }).addTo(map);
    }

    const bounds = L.latLngBounds(latlngs);
    map.fitBounds(bounds, { padding: [30, 30] });
  }

  // ================== EVENTOS ==================
  if (selectOrigem) {
    selectOrigem.addEventListener("change", () => {
      origemAtual = selectOrigem.value || "pedidos";
      idsSelecionados.clear();
      limparMapa();
      carregarOrigemAtual();
      if (window.atualizarResumoMontagemCarga) {
        window.atualizarResumoMontagemCarga();
      }
    });
  }

  if (btnAtualizar) {
    btnAtualizar.addEventListener("click", () => {
      idsSelecionados.clear();
      limparMapa();
      carregarOrigemAtual();
      if (window.atualizarResumoMontagemCarga) {
        window.atualizarResumoMontagemCarga();
      }
    });
  }

  if (inputBusca) {
    inputBusca.addEventListener("input", () => {
      aplicarFiltro();
    });
  }

  if (btnLimparRota) {
    btnLimparRota.addEventListener("click", () => {
      idsSelecionados.clear();
      desenharRotaBasica();
      renderClientes(getCacheAtual());
      if (window.atualizarResumoMontagemCarga) {
        window.atualizarResumoMontagemCarga();
      }
    });
  }

  if (toggleTraffic) {
    toggleTraffic.addEventListener("change", e => {
      const on = !!e.target.checked;
      setTrafficVisible(on);
    });
  }

  configurarInfiniteScroll();
  carregarOrigemAtual();

  // Exporta API mínima para montagem_carga.js
  window.LogisticaEmbed = {
    getCacheAtual,
    getIdsSelecionados: () => new Set(idsSelecionados)
  };
})();