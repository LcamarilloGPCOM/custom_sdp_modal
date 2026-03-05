/**
 * SERVICE DESK PLUS - CUSTOM MODAL ENGINE (Krispy Kreme Edition)
 * Versión: 2.0 - Profesional & Responsiva
 */

const MODAL_SERVER_URL = 'https://cc.krispykreme.com.mx/editor-api'; 

let currentSteps = [];
let currentStepIndex = 0;

/**
 * Inyecta estilos CSS con la identidad visual de ServiceDesk Plus
 */
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

/**
 * Carga las instrucciones desde la API y lanza el modal
 */
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
                console.log('SDP-Modal: No hay configuración para la plantilla ' + templateId);
            }
        })
        .catch(err => console.error('SDP-Modal: Error de conexión:', err));
}

/**
 * Crea el esqueleto HTML profesional
 */
function createModalStructure() {
    if (document.getElementById('sdpCustomModal')) return;

    const modalHTML = `
        <div id="sdpCustomModal">
            <div class="sdp-modal-content">
                <div class="sdp-modal-header">
                    <h3 class="sdp-modal-title">Guía de Ayuda al Usuario</h3>
                    <span class="sdp-modal-close" onclick="closeCustomModal()">&times;</span>
                </div>
                <div class="sdp-modal-body" id="modalDynamicContent">
                    </div>
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

/**
 * Actualiza el contenido (Texto e Imagen) del paso actual
 */
function updateModalContent(index) {
    const step = currentSteps[index];
    const container = document.getElementById('modalDynamicContent');
    
    let imageHTML = '';
    if (step.image) {
        let cleanPath = step.image.startsWith('/') ? step.image : '/' + step.image;
        // Normalización de ruta para servir desde el puerto 3050 correctamente
        const finalImgUrl = `${MODAL_SERVER_URL}${cleanPath.replace('/custom_modal', '').replace('/editor-api', '')}`;
        imageHTML = `<div class="sdp-image-container"><img src="${finalImgUrl}" alt="Instrucción"></div>`;
    }

    container.innerHTML = `
        <h2>${step.title}</h2>
        ${imageHTML}
        <div style="margin-top:15px;">${step.content}</div>
    `;

    // Actualizar Pie de página
    document.getElementById('stepCountText').innerText = `Paso ${index + 1} de ${currentSteps.length}`;
    
    // Control de Botones
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

/**
 * Cierra el modal con animación de salida
 */
function closeCustomModal() {
    const modal = document.getElementById('sdpCustomModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
}
// AUTO-DETECCIÓN DE PLANTILLA EN SDP (Versión reforzada)
(function() {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('reqTemplate'); 

    if (templateId) {
        console.log("SDP-Modal: Detectada plantilla " + templateId + ". Esperando a SDP...");
        
        // Usamos un intervalo para verificar si el cuerpo de la página ya existe
        const checkExist = setInterval(function() {
           if (document.body) {
              clearInterval(checkExist);
              // Damos 3 segundos extra para que SDP cargue sus scripts internos
              setTimeout(() => {
                  console.log("SDP-Modal: Lanzando modal ahora.");
                  showInstructionsModal(templateId);
              }, 500); 
           }
        }, 100);
    }
})();
