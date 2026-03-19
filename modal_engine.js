/**
 * SERVICE DESK PLUS - CUSTOM MODAL ENGINE
 * Version 3.0 - Template + Item aware
 */

const MODAL_SERVER_URL = window.SDP_MODAL_SERVER_URL || 'https://cc.krispykreme.com.mx/editor-api';

let currentSteps = [];
let currentStepIndex = 0;
let lastSelectionKey = '';
let watchIntervalId = null;

function resolveCurrentTemplateId() {
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = String(urlParams.get('reqTemplate') || '').trim();
    if (fromUrl) return fromUrl;
    const fromGlobal = String(window.templateID || window.templateId || '').trim();
    if (fromGlobal) return fromGlobal;
    return '';
}

function injectStyles() {
    if (document.getElementById('sdpModalStyles')) return;

    const style = document.createElement('style');
    style.id = 'sdpModalStyles';
    style.innerHTML = `
        #sdpCustomModal { position: fixed; z-index: 100000; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; font-family: "Open Sans", Arial, sans-serif; opacity: 0; transition: opacity .3s ease; }
        #sdpCustomModal.show { opacity: 1; }
        .sdp-modal-content { background-color: #fff; border-radius: 4px; width: 90%; max-width: 600px; box-shadow: 0 5px 25px rgba(0,0,0,.3); overflow: hidden; transform: translateY(-20px); transition: transform .3s ease; border: 1px solid #d0d0d0; }
        #sdpCustomModal.show .sdp-modal-content { transform: translateY(0); }
        .sdp-modal-header { padding: 12px 20px; background-color: #f8f9fa; border-bottom: 1px solid #d0d0d0; display: flex; justify-content: space-between; align-items: center; }
        .sdp-modal-title { margin: 0; font-size: 16px; font-weight: 600; color: #333; }
        .sdp-modal-close { color: #888; font-size: 24px; font-weight: bold; cursor: pointer; line-height: 1; }
        .sdp-modal-close:hover { color: #d32f2f; }
        .sdp-modal-body { padding: 25px; color: #444; font-size: 14px; line-height: 1.6; min-height: 150px; }
        .sdp-modal-body h2 { font-size: 18px; color: #00704a; margin-top: 0; font-weight: 600; border-left: 4px solid #00704a; padding-left: 10px; }
        .sdp-image-container { text-align: center; margin: 15px 0; border: 1px solid #eee; padding: 8px; background-color: #fdfdfd; border-radius: 4px; }
        .sdp-modal-body img { max-width: 100%; height: auto; max-height: 320px; display: block; margin: 0 auto; border-radius: 2px; }
        .sdp-modal-footer { padding: 12px 20px; background-color: #f8f9fa; border-top: 1px solid #d0d0d0; display: flex; justify-content: space-between; align-items: center; }
        .sdp-btn { padding: 8px 18px; font-size: 13px; font-weight: 600; border-radius: 3px; cursor: pointer; border: 1px solid transparent; transition: .2s; }
        .sdp-btn-primary { background-color: #00704a; color: white; border-color: #005c3d; }
        .sdp-btn-secondary { background-color: #fff; color: #555; border-color: #ccc; }
    `;
    document.head.appendChild(style);
}

function normalizeTemplateConfig(config) {
    if (!config || typeof config !== 'object') return null;
    return {
        item_field: String(config.item_field || '').trim(),
        default_steps: Array.isArray(config.default_steps) ? config.default_steps : (Array.isArray(config.steps) ? config.steps : []),
        items: config.items && typeof config.items === 'object' ? config.items : {}
    };
}

function showInstructionsModal(steps) {
    if (!Array.isArray(steps) || steps.length === 0) return;
    injectStyles();
    currentSteps = steps;
    currentStepIndex = 0;
    createModalStructure();
    updateModalContent(currentStepIndex);
}

function createModalStructure() {
    if (document.getElementById('sdpCustomModal')) document.getElementById('sdpCustomModal').remove();

    document.body.insertAdjacentHTML('beforeend', `
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
    `);

    setTimeout(() => {
        const modal = document.getElementById('sdpCustomModal');
        if (modal) modal.classList.add('show');
    }, 10);
}

function updateModalContent(index) {
    const step = currentSteps[index];
    const container = document.getElementById('modalDynamicContent');
    if (!container || !step) return;

    const cleanPath = step.image ? (step.image.startsWith('/') ? step.image : '/' + step.image) : '';
    const finalImgUrl = cleanPath ? `${MODAL_SERVER_URL}${cleanPath.replace('/custom_modal', '').replace('/editor-api', '')}` : '';
    container.innerHTML = `
        <h2>${escapeHtml(step.title)}</h2>
        ${finalImgUrl ? `<div class="sdp-image-container"><img src="${finalImgUrl}" alt="Instruccion"></div>` : ''}
        <div style="margin-top:15px;">${sanitizeRichHtml(step.content)}</div>
    `;

    document.getElementById('stepCountText').innerText = `Paso ${index + 1} de ${currentSteps.length}`;
    document.getElementById('prevBtn').style.display = index === 0 ? 'none' : 'inline-block';
    document.getElementById('nextBtn').style.display = index === currentSteps.length - 1 ? 'none' : 'inline-block';
    document.getElementById('finishBtn').style.display = index === currentSteps.length - 1 ? 'inline-block' : 'none';
}

function resolveFieldElement(fieldName) {
    if (!fieldName) return null;
    const variants = Array.from(new Set([
        String(fieldName || '').trim(),
        String(fieldName || '').trim().toLowerCase(),
        String(fieldName || '').trim().toUpperCase()
    ].filter(Boolean)));
    const selectors = [];
    variants.forEach(variant => {
        selectors.push(
            `[name="${variant}"]`,
            `#${cssEscape(variant)}`,
            `[id$="${variant}"]`,
            `[data-name="${variant}"]`,
            `[data-columnname="${variant}"]`,
            `[data-field="${variant}"]`,
            `[data-fafrkey="${variant}"]`,
            `[fafr-name="${variant}"]`,
            `[data-atm="${variant}"]`
        );
    });
    for (let i = 0; i < selectors.length; i += 1) {
        const found = document.querySelector(selectors[i]);
        if (found) return found;
    }
    return null;
}

function readSelectionFromWindow() {
    const cached = window.__sdpSelectedItem;
    if (!cached || typeof cached !== 'object') return { key: '', id: '', text: '' };
    const id = String(cached.id || '').trim();
    const text = String(cached.name || cached.text || '').trim();
    if (!id && !text) return { key: '', id: '', text: '' };
    return { key: `${id}::${text}`.trim(), id, text };
}

function readSelect2Text(fieldEl) {
    if (!fieldEl) return '';
    const controlHolder = fieldEl.closest('.control-holder');
    if (controlHolder) {
        const chosen = controlHolder.querySelector('.select2-chosen');
        if (chosen && chosen.textContent) return String(chosen.textContent).trim();
    }
    const siblingContainer = fieldEl.parentElement && fieldEl.parentElement.querySelector('.select2-chosen');
    if (siblingContainer && siblingContainer.textContent) return String(siblingContainer.textContent).trim();
    return '';
}

function readFieldSelection(fieldEl) {
    if (!fieldEl) return readSelectionFromWindow();
    if (fieldEl.tagName === 'SELECT') {
        const id = String(fieldEl.value || '').trim();
        const option = fieldEl.options[fieldEl.selectedIndex];
        const text = option ? String(option.text || '').trim() : id;
        return { key: `${id}::${text}`.trim(), id, text };
    }

    let id = String(fieldEl.value || fieldEl.getAttribute('value') || '').trim();
    let text = String(fieldEl.getAttribute('data-display-value') || fieldEl.dataset && fieldEl.dataset.displayValue || '').trim() || id;
    const select2Text = readSelect2Text(fieldEl);
    if (select2Text) text = select2Text;
    const cachedSelection = readSelectionFromWindow();
    if (cachedSelection.id && !id) id = cachedSelection.id;
    if (cachedSelection.text && (!text || text === id)) text = cachedSelection.text;
    return { key: `${id}::${text}`.trim(), id, text };
}

function normalizeValue(value) {
    return String(value || '').trim().toLowerCase();
}

function resolveStepsForItem(templateConfig, selection) {
    if (selection.id && templateConfig.items[selection.id] && Array.isArray(templateConfig.items[selection.id].steps)) {
        return templateConfig.items[selection.id].steps;
    }

    const normalizedText = normalizeValue(selection.text);
    if (normalizedText) {
        const match = Object.values(templateConfig.items).find(itemConfig => normalizeValue(itemConfig.label) === normalizedText);
        if (match && Array.isArray(match.steps)) return match.steps;
    }

    return Array.isArray(templateConfig.default_steps) ? templateConfig.default_steps : [];
}

function startWatchingItemField(templateId, templateConfig) {
    if (watchIntervalId) clearInterval(watchIntervalId);
    lastSelectionKey = '';

    watchIntervalId = setInterval(() => {
        const fieldEl = resolveFieldElement(templateConfig.item_field);
        const selection = readFieldSelection(fieldEl);
        if (!selection.key || selection.key === '::' || selection.key === lastSelectionKey) return;

        const steps = resolveStepsForItem(templateConfig, selection).filter(isMeaningfulStep);
        if (!steps.length) return;

        lastSelectionKey = selection.key;
        window.__sdpSelectedItem = { id: selection.id, name: selection.text };
        console.log(`SDP-Modal: Mostrando modal para item ${selection.id || selection.text} en plantilla ${templateId}.`);
        showInstructionsModal(steps);
    }, 800);
}

function initModalFlow(templateId) {
    injectStyles();
    fetch(`${MODAL_SERVER_URL}/api/instructions`)
        .then(response => response.json())
        .then(data => {
            const templateConfig = normalizeTemplateConfig(data[templateId]);
            if (!templateConfig) {
                console.log('SDP-Modal: No hay configuracion para la plantilla ' + templateId);
                return;
            }

            const defaultSteps = templateConfig.default_steps.filter(isMeaningfulStep);
            const hasItemSpecificConfig = Object.keys(templateConfig.items).length > 0 && templateConfig.item_field;

            if (hasItemSpecificConfig) {
                console.log(`SDP-Modal: Observando campo ${templateConfig.item_field} para la plantilla ${templateId}.`);
                startWatchingItemField(templateId, templateConfig);
                return;
            }

            if (defaultSteps.length > 0) showInstructionsModal(defaultSteps);
        })
        .catch(err => console.error('SDP-Modal: Error de conexion:', err));
}

function isMeaningfulStep(step) {
    return Boolean((step.title || '').trim() || (step.content || '').trim() || (step.image || '').trim());
}

function nextStep() {
    if (currentStepIndex < currentSteps.length - 1) {
        currentStepIndex += 1;
        updateModalContent(currentStepIndex);
    }
}

function prevStep() {
    if (currentStepIndex > 0) {
        currentStepIndex -= 1;
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
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function sanitizeRichHtml(html) {
    return String(html || '')
        .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|style|iframe|object|embed|link|meta)(\s|\/|>)[^>]*>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"')
        .replace(/\s(href|src)\s*=\s*(['"])\s*data:text\/html[\s\S]*?\2/gi, ' $1="#"');
}

function cssEscape(value) {
    return String(value || '').replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
}

(function () {
    const templateId = resolveCurrentTemplateId();
    if (!templateId) return;

    console.log('SDP-Modal: Detectada plantilla ' + templateId + '. Esperando a SDP...');
    const checkExist = setInterval(() => {
        if (!document.body) return;
        clearInterval(checkExist);
        setTimeout(() => initModalFlow(templateId), 500);
    }, 100);
})();
