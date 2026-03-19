require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const axios = require('axios');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3050;
const SDP_API_KEY = process.env.SDP_API_KEY;
const EDITOR_BASIC_AUTH_USER = process.env.EDITOR_BASIC_AUTH_USER || '';
const EDITOR_BASIC_AUTH_PASS = process.env.EDITOR_BASIC_AUTH_PASS || '';
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMAGES_DIR = path.join(__dirname, 'images');
const INSTRUCTIONS_FILE = path.join(__dirname, 'instructions.json');
const SDP_API_BASE = 'https://127.0.0.1:8080/api/v3';
const SDP_AGENT = new https.Agent({ rejectUnauthorized: false });
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

app.use(bodyParser.json({ limit: '2mb' }));

function hasEditorAuthConfigured() {
    return Boolean(EDITOR_BASIC_AUTH_USER && EDITOR_BASIC_AUTH_PASS);
}

function sendAuthChallenge(res) {
    res.set('WWW-Authenticate', 'Basic realm="Editor Modal SDP"');
    return res.status(401).send('Autenticacion requerida');
}

function requireAdminAuth(req, res, next) {
    if (!hasEditorAuthConfigured()) {
        return res.status(503).send('Configura EDITOR_BASIC_AUTH_USER y EDITOR_BASIC_AUTH_PASS en el entorno.');
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) {
        return sendAuthChallenge(res);
    }

    let decoded = '';
    try {
        decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
    } catch (error) {
        return sendAuthChallenge(res);
    }

    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) {
        return sendAuthChallenge(res);
    }

    const username = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);

    if (username !== EDITOR_BASIC_AUTH_USER || password !== EDITOR_BASIC_AUTH_PASS) {
        return sendAuthChallenge(res);
    }

    next();
}

function sanitizeText(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeFieldName(value) {
    return String(value || '')
        .trim()
        .replace(/[^\w.-]/g, '');
}

function sanitizeHtmlContent(value) {
    let html = String(value || '').replace(/\0/g, '').trim();

    html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
    html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)(\s|\/|>)[^>]*>/gi, '');
    html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    html = html.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\2/gi, ' $1="#"');
    html = html.replace(/\s(href|src)\s*=\s*(['"])\s*data:text\/html[\s\S]*?\2/gi, ' $1="#"');

    return html;
}

function normalizeImagePath(value) {
    const imagePath = String(value || '').trim().replace(/\\/g, '/');
    if (!imagePath) {
        return '';
    }

    if (imagePath.startsWith('/editor-api/images/')) {
        return imagePath;
    }

    if (imagePath.startsWith('/images/')) {
        return '/editor-api' + imagePath;
    }

    return '';
}

function normalizeStep(step) {
    if (!step || typeof step !== 'object') {
        return null;
    }

    const normalizedStep = {
        title: sanitizeText(step.title),
        content: sanitizeHtmlContent(step.content),
        image: normalizeImagePath(step.image)
    };

    if (!normalizedStep.title && !normalizedStep.content && !normalizedStep.image) {
        return null;
    }

    return normalizedStep;
}

function normalizeSteps(steps) {
    if (!Array.isArray(steps)) {
        return [];
    }

    return steps.map(normalizeStep).filter(Boolean);
}

function normalizeItemConfig(itemId, config) {
    const cleanItemId = String(itemId || '').trim();
    if (!/^\d+$/.test(cleanItemId) || !config || typeof config !== 'object') {
        return null;
    }

    const steps = normalizeSteps(config.steps);
    const label = sanitizeText(config.label);

    if (steps.length === 0 && !label) {
        return null;
    }

    return {
        id: cleanItemId,
        label,
        steps
    };
}

function isTemplateConfigMeaningful(config) {
    return Boolean(
        config.item_field ||
        config.default_steps.length > 0 ||
        Object.keys(config.items).length > 0
    );
}

function normalizeTemplateConfig(config) {
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return null;
    }

    const itemField = sanitizeFieldName(config.item_field);
    const defaultSteps = normalizeSteps(Array.isArray(config.default_steps) ? config.default_steps : config.steps);
    const normalizedItems = {};

    Object.entries(config.items || {}).forEach(([itemId, itemConfig]) => {
        const normalizedItem = normalizeItemConfig(itemId, itemConfig);
        if (normalizedItem && normalizedItem.steps.length > 0) {
            normalizedItems[normalizedItem.id] = {
                label: normalizedItem.label,
                steps: normalizedItem.steps
            };
        }
    });

    const normalized = {
        item_field: itemField,
        default_steps: defaultSteps,
        items: normalizedItems
    };

    return isTemplateConfigMeaningful(normalized) ? normalized : null;
}

function normalizeInstructionsPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    const normalized = {};

    Object.entries(payload).forEach(([templateId, templateConfig]) => {
        const cleanTemplateId = String(templateId || '').trim();
        if (!/^\d+$/.test(cleanTemplateId)) {
            return;
        }

        const normalizedTemplateConfig = normalizeTemplateConfig(templateConfig);
        if (normalizedTemplateConfig) {
            normalized[cleanTemplateId] = normalizedTemplateConfig;
        }
    });

    return normalized;
}

function readInstructionsFile() {
    if (!fs.existsSync(INSTRUCTIONS_FILE)) {
        return {};
    }

    try {
        const rawData = fs.readFileSync(INSTRUCTIONS_FILE, 'utf8');
        if (!rawData.trim()) {
            return {};
        }

        const parsedData = JSON.parse(rawData);
        return normalizeInstructionsPayload(parsedData) || {};
    } catch (error) {
        console.error('Error leyendo instructions.json:', error.message);
        return {};
    }
}

function isTrue(value) {
    return value === true || value === 'true';
}

async function fetchSdp(relativePath, inputData) {
    const url = new URL(`${SDP_API_BASE}${relativePath}`);
    if (inputData) {
        url.searchParams.set('input_data', JSON.stringify(inputData));
    }

    const response = await axios.get(url.toString(), {
        headers: { authtoken: SDP_API_KEY },
        httpsAgent: SDP_AGENT
    });

    return response.data;
}

function extractFieldNamesFromLayouts(layouts) {
    const seen = new Set();
    const fields = [];

    (layouts || []).forEach(layout => {
        (layout.sections || []).forEach(section => {
            (section.fields || []).forEach(field => {
                const fieldName = sanitizeFieldName(field.name);
                if (!fieldName || seen.has(fieldName)) {
                    return;
                }

                seen.add(fieldName);
                fields.push({
                    name: fieldName,
                    layout_name: sanitizeText(layout.name || '')
                });
            });
        });
    });

    return fields;
}

function mapTemplateDetails(template) {
    const allFields = extractFieldNamesFromLayouts(template.layouts || []);
    const udfFields = allFields.filter(field => /^udf_\d+$/i.test(field.name));

    return {
        id: String(template.id || ''),
        name: sanitizeText(template.name),
        is_service_template: Boolean(template.is_service_template),
        fields: allFields,
        udf_fields: udfFields,
        request: template.request || {}
    };
}

async function fetchAllActiveItems() {
    const items = [];
    let startIndex = 1;
    let hasMoreRows = true;

    while (hasMoreRows) {
        const payload = {
            list_info: {
                row_count: 500,
                start_index: startIndex,
                sort_field: 'id',
                sort_order: 'asc',
                get_total_count: true
            }
        };

        const data = await fetchSdp('/items', payload);
        const pageItems = Array.isArray(data.items) ? data.items : [];

        pageItems.forEach(item => {
            if (item.deleted) {
                return;
            }

            const id = String(item.id || '').trim();
            if (!/^\d+$/.test(id)) {
                return;
            }

            items.push({
                id,
                name: sanitizeText(item.name),
                description: sanitizeText(item.description),
                subcategory: item.subcategory
                    ? {
                        id: String(item.subcategory.id || '').trim(),
                        name: sanitizeText(item.subcategory.name)
                    }
                    : null
            });
        });

        hasMoreRows = isTrue(data.list_info && data.list_info.has_more_rows);
        if (!hasMoreRows || pageItems.length === 0) {
            break;
        }

        startIndex += pageItems.length;
    }

    return items.sort((a, b) => {
        const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        return byName !== 0 ? byName : Number(a.id) - Number(b.id);
    });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGES_DIR),
    filename: (req, file, cb) => {
        const safeOriginalName = path.basename(file.originalname).replace(/[^\w.-]/g, '_');
        cb(null, `${Date.now()}-${safeOriginalName}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
    fileFilter: (req, file, cb) => {
        const extension = path.extname(file.originalname || '').toLowerCase();
        const isAllowedMime = ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype);
        const isAllowedExtension = ALLOWED_IMAGE_EXTENSIONS.has(extension);

        if (isAllowedMime && isAllowedExtension) {
            return cb(null, true);
        }

        cb(new Error('Solo se permiten imagenes JPG, PNG, GIF o WEBP de hasta 5 MB.'));
    }
});

app.get('/', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'editor.html'));
});

app.get('/editor.html', requireAdminAuth, (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'editor.html'));
});

app.get('/modal_engine.js', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'modal_engine.js'));
});

app.get('/modal_styles.css', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'modal_styles.css'));
});

app.get('/api/admin/dashboard', requireAdminAuth, async (req, res) => {
    try {
        const localData = readInstructionsFile();
        const data = await fetchSdp('/request_templates', {
            list_info: { row_count: 500 }
        });

        const sdpTemplates = Array.isArray(data.request_templates) ? data.request_templates : [];
        const dashboardData = sdpTemplates.map(tpl => ({
            id: tpl.id,
            name: tpl.name,
            is_service: tpl.is_service_template,
            has_config: Boolean(localData[String(tpl.id)])
        }));

        res.json(dashboardData);
    } catch (error) {
        console.error('Error SDP dashboard:', error.message);
        res.status(500).json({ error: 'Error conectando a SDP' });
    }
});

app.get('/api/admin/items', requireAdminAuth, async (req, res) => {
    try {
        const items = await fetchAllActiveItems();
        res.json(items);
    } catch (error) {
        console.error('Error SDP items:', error.message);
        res.status(500).json({ error: 'No se pudieron obtener los articulos desde SDP.' });
    }
});

app.get('/api/admin/templates/:templateId/details', requireAdminAuth, async (req, res) => {
    try {
        const templateId = String(req.params.templateId || '').trim();
        if (!/^\d+$/.test(templateId)) {
            return res.status(400).json({ error: 'Template ID invalido.' });
        }

        const data = await fetchSdp(`/request_templates/${templateId}`);
        if (!data.request_template) {
            return res.status(404).json({ error: 'Template no encontrado.' });
        }

        res.json(mapTemplateDetails(data.request_template));
    } catch (error) {
        console.error('Error SDP template details:', error.message);
        res.status(500).json({ error: 'No se pudo obtener el detalle de la plantilla.' });
    }
});

app.use('/images', express.static(IMAGES_DIR));

app.get('/api/instructions', (req, res) => {
    res.json(readInstructionsFile());
});

app.get('/api/admin/instructions', requireAdminAuth, (req, res) => {
    res.json(readInstructionsFile());
});

app.post('/api/admin/instructions', requireAdminAuth, (req, res) => {
    const normalizedInstructions = normalizeInstructionsPayload(req.body);
    if (!normalizedInstructions) {
        return res.status(400).json({ error: 'Payload de instrucciones invalido.' });
    }

    fs.writeFile(INSTRUCTIONS_FILE, JSON.stringify(normalizedInstructions, null, 2), err => {
        if (err) {
            console.error('Error guardando instructions.json:', err.message);
            return res.status(500).json({ error: 'No se pudo guardar el archivo.' });
        }

        res.json({ message: 'Guardado' });
    });
});

app.post('/api/admin/upload', requireAdminAuth, upload.single('image'), (req, res) => {
    if (req.file) {
        return res.json({ path: '/editor-api/images/' + req.file.filename });
    }

    res.status(400).json({ error: 'No image' });
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'La imagen excede el limite de 5 MB.' });
        }

        return res.status(400).json({ error: err.message });
    }

    if (err && err.message) {
        return res.status(400).json({ error: err.message });
    }

    next(err);
});

app.listen(PORT, '127.0.0.1', () => {
    if (!hasEditorAuthConfigured()) {
        console.warn('Editor sin autenticacion: configura EDITOR_BASIC_AUTH_USER y EDITOR_BASIC_AUTH_PASS.');
    }

    console.log(`Editor en Produccion corriendo en el puerto ${PORT}`);
});
