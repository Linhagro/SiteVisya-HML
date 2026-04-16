// assets/rotas/js/viewer3d.js
import * as THREE from './three/three.module.js';
import { OrbitControls } from './three/OrbitControls.js';

console.log('[VIEWER3D] módulo carregado (three ES module + OrbitControls)');

let scene, camera, renderer, controls;
let carga = null;
let volumesMesh = [];
let currentCenter = new THREE.Vector3(0, 0, 0);

const canvasContainer = document.getElementById('viewer3dCanvas');
const infoCaminhao = document.getElementById('infoCaminhao');
const infoResumoCarga = document.getElementById('infoResumoCarga');
const listaVolumesEl = document.getElementById('listaVolumes');
const selectCaminhao = document.getElementById('selectCaminhao');

const btnResetCamera = document.getElementById('btnResetCamera');
const btnImprimirLayout = document.getElementById('btnImprimirLayout');
const filtroPedidoInput = document.getElementById('filtroPedido');

function showToast(msg) {
  const toast = document.getElementById('viewer3dToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

function obterCargaDoOpener() {
  try {
    if (window.opener && window.opener.__VISYA_CARGA_ATUAL__) {
      return window.opener.__VISYA_CARGA_ATUAL__;
    }
  } catch (e) {
    console.warn('[VIEWER3D] Erro ao acessar window.opener:', e);
  }
  return null;
}

function initThree() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020617);

  const width = canvasContainer.clientWidth || window.innerWidth;
  const height = canvasContainer.clientHeight || window.innerHeight;

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  canvasContainer.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambient);

  const dir1 = new THREE.DirectionalLight(0xffffff, 0.8);
  dir1.position.set(10, 15, 8);
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dir2.position.set(-8, 10, -6);
  scene.add(dir2);

  const floorGeom = new THREE.PlaneGeometry(50, 50);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x020617,
    metalness: 0.2,
    roughness: 0.8
  });
  const floor = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.autoRotate = false;
  controls.target.set(0, 1.2, 0);
  controls.update();

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (!camera || !renderer) return;
  const width = canvasContainer.clientWidth || window.innerWidth;
  const height = canvasContainer.clientHeight || window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function clearScene() {
  const toRemove = [];
  scene.traverse((obj) => {
    if (obj.isMesh && obj !== null) {
      toRemove.push(obj);
    }
  });
  toRemove.forEach((m) => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose && mat.dispose());
      } else {
        m.material.dispose && m.material.dispose();
      }
    }
  });
  volumesMesh = [];
}

function criarBau(caminhao) {
  if (!caminhao) return;

  const comprimento = caminhao.comprimentoM || 6;
  const altura = caminhao.alturaM || 2.4;
  const largura = caminhao.larguraM || 2.4;

  const bauGeom = new THREE.BoxGeometry(comprimento, altura, largura);
  const bauMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.2,
    roughness: 0.8,
    transparent: true,
    opacity: 0.18
  });
  const bau = new THREE.Mesh(bauGeom, bauMat);

  // baú: x:0..comprimento, y:0..altura, z:0..largura
  bau.position.set(comprimento / 2, altura / 2, largura / 2);
  scene.add(bau);

  const edges = new THREE.EdgesGeometry(bauGeom);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b });
  const wire = new THREE.LineSegments(edges, lineMat);
  wire.position.copy(bau.position);
  scene.add(wire);

  if (infoCaminhao) {
    infoCaminhao.textContent = `${caminhao.descricao || caminhao.id} • ${comprimento.toFixed(
      2
    )}m x ${largura.toFixed(2)}m x ${altura.toFixed(2)}m`;
  }
}

function criarVolumes(volumes) {
  volumesMesh.forEach((m) => scene.remove(m));
  volumesMesh = [];

  if (!volumes || !volumes.length) return;

  let pesoTotal = 0;
  let volumeTotal = 0;

  volumes.forEach((v) => {
    const largura = v.larguraM || 0.5;
    const altura = v.alturaM || 0.5;
    const profundidade = v.profundidadeM || 0.5;

    const geom = new THREE.BoxGeometry(profundidade, altura, largura);
    const mat = new THREE.MeshStandardMaterial({
      color: v.cor || 0x22c55e,
      metalness: 0.1,
      roughness: 0.6
    });
    const mesh = new THREE.Mesh(geom, mat);

    // v.x, v.y, v.z no sistema 0..comprimento / 0..largura / 0..altura
    mesh.position.set(v.x || 0, v.y || altura / 2, v.z || 0);

    mesh.userData.volumeData = v;
    scene.add(mesh);
    volumesMesh.push(mesh);

    pesoTotal += v.pesoKg || 0;
    volumeTotal += v.volumeM3 || profundidade * largura * altura;
  });

  if (infoResumoCarga) {
    infoResumoCarga.textContent = `Itens: ${
      volumes.length
    } • Peso total aprox: ${pesoTotal.toFixed(
      1
    )} kg • Volume total aprox: ${volumeTotal.toFixed(3)} m³`;
  }
}

function recenterCamera() {
  const box = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  const dist = maxDim * 2.2 || 10;

  camera.position.set(center.x + dist, center.y + dist, center.z + dist);
  camera.lookAt(center);

  currentCenter.copy(center);

  if (controls) {
    controls.target.copy(center);
    controls.update();
  }
}

function renderListaVolumes(volumes) {
  if (!listaVolumesEl) return;
  listaVolumesEl.innerHTML = '';

  if (!volumes || !volumes.length) {
    const empty = document.createElement('div');
    empty.className = 'v3d-volume-sub';
    empty.textContent = 'Nenhum item para exibir.';
    listaVolumesEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  volumes.forEach((v) => {
    const card = document.createElement('div');
    card.className = 'v3d-volume-item';
    card.dataset.id = v.id;
    card.dataset.pedido = v.pedido;

    const header = document.createElement('div');
    header.className = 'v3d-volume-header';

    const title = document.createElement('div');
    title.className = 'v3d-volume-title';
    const cod = v.codprod || v.descrprod || 'Volume agregado';
    title.textContent = `Ped ${v.pedido} • ${cod}`;

    const chip = document.createElement('div');
    chip.className = 'v3d-volume-chip';
    chip.textContent = `${(v.volumeM3 || 0).toFixed(3)} m³`;

    header.appendChild(title);
    header.appendChild(chip);

    const sub1 = document.createElement('div');
    sub1.className = 'v3d-volume-sub';
    sub1.textContent = v.descrprod || (v.codprod ? `Produto ${v.codprod}` : 'Volume agregado');

    const sub2 = document.createElement('div');
    sub2.className = 'v3d-volume-sub';
    sub2.textContent = `Peso: ${(v.pesoKg || 0).toFixed(
      1
    )} kg • Dimensões: ${(v.profundidadeM || 0).toFixed(
      2
    )} x ${(v.larguraM || 0).toFixed(2)} x ${(v.alturaM || 0).toFixed(
      2
    )} m`;

    card.appendChild(header);
    card.appendChild(sub1);
    card.appendChild(sub2);

    card.addEventListener('mouseenter', () => {
      highlightVolumeCard(v.id, true);
      highlightMesh(v.id, true);
    });

    card.addEventListener('mouseleave', () => {
      highlightVolumeCard(v.id, false);
      highlightMesh(v.id, false);
    });

    card.addEventListener('click', () => {
      focusCameraOnVolume(v.id);
    });

    frag.appendChild(card);
  });

  listaVolumesEl.appendChild(frag);
}

function highlightMesh(volumeId, highlight) {
  volumesMesh.forEach((m) => {
    if (m.userData.volumeData && m.userData.volumeData.id === volumeId) {
      if (highlight) {
        m.material.emissive = new THREE.Color(0xfacc15);
        m.material.emissiveIntensity = 0.5;
        m.scale.set(1.03, 1.03, 1.03);
      } else {
        m.material.emissive = new THREE.Color(0x000000);
        m.material.emissiveIntensity = 0;
        m.scale.set(1, 1, 1);
      }
    }
  });
}

function highlightVolumeCard(volumeId, highlight) {
  if (!listaVolumesEl) return;
  const card = listaVolumesEl.querySelector(
    `.v3d-volume-item[data-id="${volumeId}"]`
  );
  if (!card) return;
  card.dataset.highlight = highlight ? 'true' : 'false';
}

function focusCameraOnVolume(volumeId) {
  const mesh = volumesMesh.find(
    (m) => m.userData.volumeData && m.userData.volumeData.id === volumeId
  );
  if (!mesh) return;

  const targetPos = mesh.position.clone();
  const offset = new THREE.Vector3(4, 3, 5);

  const newCamPos = targetPos.clone().add(offset);
  camera.position.copy(newCamPos);
  camera.lookAt(targetPos);

  if (controls) {
    controls.target.copy(targetPos);
    controls.update();
  }
}

function resetCamera() {
  recenterCamera();
}

function applyFiltroPedido() {
  if (!carga || !carga._volumesAtuais) return;
  const filtro = (filtroPedidoInput.value || '').trim().toLowerCase();
  let volumesFiltrados = carga._volumesAtuais;

  if (filtro) {
    volumesFiltrados = carga._volumesAtuais.filter((v) =>
      String(v.pedido).toLowerCase().includes(filtro)
    );
  }

  renderListaVolumes(volumesFiltrados);
}

function imprimirLayout() {
  if (!carga || !carga._volumesAtuais || !carga._volumesAtuais.length) {
    showToast('Nenhum item para imprimir.');
    return;
  }

  const cam = carga._caminhaoAtual || {};
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;

  const titulo = `Layout de carga – ${cam.descricao || cam.id || ''}`;
  const linhas = carga._volumesAtuais
    .map(
      (v) => `<tr>
            <td>${v.pedido}</td>
            <td>${v.codprod || v.descrprod || 'Volume agregado'}</td>
            <td>${(v.pesoKg || 0).toFixed(1)}</td>
            <td>${(v.volumeM3 || 0).toFixed(3)}</td>
            <td>${(v.profundidadeM || 0).toFixed(2)} x ${(v.larguraM || 0).toFixed(
              2
            )} x ${(v.alturaM || 0).toFixed(2)}</td>
          </tr>`
    )
    .join('');

  const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <title>${titulo}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 12px; }
          h1 { font-size: 16px; margin-bottom: 4px; }
          h2 { font-size: 13px; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ccc; padding: 4px; text-align: left; }
          th { background: #f3f4f6; }
        </style>
      </head>
      <body>
        <h1>${titulo}</h1>
        <h2>Resumo</h2>
        <p>${infoResumoCarga ? infoResumoCarga.textContent : ''}</p>
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Produto</th>
              <th>Peso (kg)</th>
              <th>Volume (m³)</th>
              <th>Dimensões (C x L x A)</th>
            </tr>
          </thead>
          <tbody>
            ${linhas}
          </tbody>
        </table>
        <script>window.print();<\/script>
      </body>
      </html>
    `;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function initCaminhaoSelector() {
  if (!selectCaminhao) return;

  const caminhoes = carga.caminhoes || (carga.caminhao ? [carga.caminhao] : []);
  if (!caminhoes.length) return;

  selectCaminhao.innerHTML = '';
  caminhoes.forEach((cam, idx) => {
    const opt = document.createElement('option');
    opt.value = cam.id != null ? cam.id : idx;
    opt.textContent = cam.descricao || `Caminhão ${idx + 1}`;
    selectCaminhao.appendChild(opt);
  });

  selectCaminhao.addEventListener('change', () => {
    const idSel = selectCaminhao.value;
    renderForCaminhao(idSel);
  });

  const idInicial =
    (carga.caminhao && carga.caminhao.id) || caminhoes[0].id || 0;
  selectCaminhao.value = idInicial;
}

function getCaminhaoById(idSel) {
  const caminhoes = carga.caminhoes || (carga.caminhao ? [carga.caminhao] : []);
  return (
    caminhoes.find((c) => String(c.id) === String(idSel)) ||
    caminhoes[0] ||
    null
  );
}

function getVolumesForCaminhao(idSel) {
  if (carga.alocacao) {
    return (carga.volumes || []).filter(
      (v) => String(carga.alocacao[v.id]) === String(idSel)
    );
  }
  return carga.volumes || [];
}

function renderForCaminhao(idSel) {
  clearScene();

  const cam = getCaminhaoById(idSel);
  const volumes = getVolumesForCaminhao(idSel);

  carga._caminhaoAtual = cam;
  carga._volumesAtuais = volumes;

  criarBau(cam);
  criarVolumes(volumes);
  renderListaVolumes(volumes);

  recenterCamera();
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carga = obterCargaDoOpener();

  if (!carga) {
    showToast(
      'Dados de carga 3D não encontrados. Abra o viewer a partir da tela de rotas.'
    );
    return;
  }

  initThree();
  initCaminhaoSelector();

  const idInicial =
    (carga.caminhao && carga.caminhao.id) ||
    (carga.caminhoes && carga.caminhoes[0] && carga.caminhoes[0].id) ||
    0;

  renderForCaminhao(idInicial);

  animate();

  if (btnResetCamera) {
    btnResetCamera.addEventListener('click', resetCamera);
  }
  if (btnImprimirLayout) {
    btnImprimirLayout.addEventListener('click', imprimirLayout);
  }
  if (filtroPedidoInput) {
    filtroPedidoInput.addEventListener('input', applyFiltroPedido);
  }
});