/**
 * SERVICE DESK PLUS - CUSTOM MODAL ENGINE
 * Version 2.1 - Hardened
 */

const MODAL_SERVER_URL = window.SDP_MODAL_SERVER_URL || 'https://cc.krispykreme.com.mx/editor-api';

let currentSteps = [];
let currentStepIndex = 0;

function injectStyles() {
    if (document.getElementById('sdpModalStyles')) return;

    const style = document.createElement('style');
    style.id = 'sdpModalStyles';
    style.innerHTML = `
        #sdpCustomModal {
            position: fixed; z-index: 100000; left: 0; top: 0;
            width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.6);
            display: flex; align-items: center; justify-content: center;
            font-family: "Open Sans", Arial, sans-serif; opacity: 0;
            transition: opacity 0.3s ease;
        }
        #sdpCustomModal.show { opacity: 1; }
        .sdp-modal-content {
            background-color: #ffffff; border-radius: 4px; width: 90%;
            max-width: 600px; box-shadow: 0 5px 25px rgba(0,0,0,0.3);
            overflow: hidden; transform: translateY(-20px);
            transition: transform 0.3s ease; border: 1px solid #d0d0d0;
        }
        #sdpCustomModal.show .sdp-modal-content { transform: translateY(0); }
        .sdp-modal-header {
            padding: 12px 20px; background-color: #f8f9fa;
            border-bottom: 1px solid #d0d0d0; display: flex;
            justify-content: space-between; align-items: center;
        }
        .sdp-modal-title { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
        .sdp-modal-close { color: #888; font-size: 24px; font-weight: bold; cursor: pointer; line-height: 1; }
        .sdp-modal-close:hover { color: #d32f2f; }
        .sdp-modal-body { padding: 25px; color: #444; font-size: 14px; line-height: 1.6; min-height: 150px; }
        .sdp-modal-body h2 { font-size: 18px; color: #00704a; margin-top: 0; font-weight: 600; border-left: 4px solid #00704a; padding-left: 10px; }
        .sdp-image-container { text-align: center; margin: 15px 0; border: 1px solid #eee; padding: 8px; background-color: #fdfdfd; border-radius: 4px; }
        .sdp-modal-body img { max-width: 100%; height: auto; max-height: 320px; display: block; margin: 0 auto; border-radius: 2px; }
        .sdp-modal-footer { padding: 12px 20px; background-color: #f8f9fa; border-top: 1px solid #d0d0d0; display: flex; justify-content: space-between; align-items: center; }
        .sdp-btn { padding: 8px 18px; font-size: 13px; font-weight: 600; border-radius: 3px; cursor: pointer; border: 1px solid transparent; transition: 0.2s; }
        .sdp-btn-primary { background-color: #00704a; color: white; border-color: #005c3d; }
        .sdp-btn-primary:hover { background-color: #005c3d; }
        .sdp-btn-secondary { background-color: #ffffff; color: #555; border-color: #ccc; }
        .sdp-btn-secondary:hover { background-color: #f0f0f0; border-color: #bbb; }
        #stepCountText { font-size: 12px; color: #777; font-weight: 600; }
    `;
    document.head.appendChild(style);
}

function showInstructionsModal(templateId) {
    injectStyles();
    fetch(`${MODAL_SERVER_URL}/api/instructions`)
        .then(response => response.json())
        .then(data => {
            if (data[templateId] && data[templateId].steps && data[templateId].steps.length > 0) {
                currentSteps = data[templateId].steps;
                currentStepIndex = 0;
                createModalStructure();
                updateModalContent(currentStepIndex);
            } else {
                console.log('SDP-Modal: No hay configuracion para la plantilla ' + templateId);
            }
        })
        .catch(err => console.error('SDP-Modal: Error de conexion:', err));
}

function createModalStructure() {
    if (document.getElementById('sdpCustomModal')) return;

    const modalHTML = `
        <div id="sdpCustomModal">
            <div class="sdp-modal-content">
                <div class="sdp-modal-header">
                    <h3 class="sdp-modal-title">Guia de Ayuda al Usuario</h3>
                    <span class="sdp-modal-close" onclick="closeCustomModal()">&times;</span>
                </div>
                <div class="sdp-modal-body" id="modalDynamicContent"></div>
                <div class="sdp-modal-footer">
                    <span id="stepCountText">Paso 1 de 1</span>
                    <div class="sdp-modal-actions">
                        <button id="prevBtn" class="sdp-btn sdp-btn-secondary" onclick="prevStep()">Anterior</button>
                        <button id="nextBtn" class="sdp-btn sdp-btn-primary" onclick="nextStep()">Siguiente</button>
                        <button id="finishBtn" class="sdp-btn sdp-btn-primary" style="display:none;" onclick="closeCustomModal()">Entendido, ir al formulario</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setTimeout(() => document.getElementById('sdpCustomModal').classList.add('show'), 10);
}

function updateModalContent(index) {
    const step = currentSteps[index];
    const container = document.getElementById('modalDynamicContent');

    let imageHTML = '';
    if (step.image) {
        const cleanPath = step.image.startsWith('/') ? step.image : '/' + step.image;
        const finalImgUrl = `${MODAL_SERVER_URL}${cleanPath.replace('/custom_modal', '').replace('/editor-api', '')}`;
        imageHTML = `<div class="sdp-image-container"><img src="${finalImgUrl}" alt="Instruccion"></div>`;
    }

    container.innerHTML = `
        <h2>${escapeHtml(step.title)}</h2>
        ${imageHTML}
        <div style="margin-top:15px;">${sanitizeRichHtml(step.content)}</div>
    `;

    document.getElementById('stepCountText').innerText = `Paso ${index + 1} de ${currentSteps.length}`;

    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const finishBtn = document.getElementById('finishBtn');

    prevBtn.style.display = index === 0 ? 'none' : 'inline-block';

    if (index === currentSteps.length - 1) {
        nextBtn.style.display = 'none';
        finishBtn.style.display = 'inline-block';
    } else {
        nextBtn.style.display = 'inline-block';
        finishBtn.style.display = 'none';
    }
}

function nextStep() {
    if (currentStepIndex < currentSteps.length - 1) {
        currentStepIndex++;
        updateModalContent(currentStepIndex);
    }
}

function prevStep() {
    if (currentStepIndex > 0) {
        currentStepIndex--;
        updateModalContent(currentStepIndex);
    }
}

function closeCustomModal() {
    const modal = document.getElementById('sdpCustomModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function sanitizeRichHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|style|iframe|object|embed|link|meta)(\s|\/|>)[^>]*>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
        .replace(/\s(href|src)\s*=\s*(['"])\s*data:text\/html[\s\S]*?\2/gi, ' $1="#"');
}

(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('reqTemplate');

    if (templateId) {
        console.log('SDP-Modal: Detectada plantilla ' + templateId + '. Esperando a SDP...');

        const checkExist = setInterval(function() {
            if (document.body) {
                clearInterval(checkExist);
                setTimeout(() => {
                    console.log('SDP-Modal: Lanzando modal ahora.');
                    showInstructionsModal(templateId);
                }, 500);
            }
        }, 100);
    }
})();
