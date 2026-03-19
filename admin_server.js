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
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

app.use(bodyParser.json({ limit: '1mb' }));

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

    return imagePath.startsWith('/editor-api/images/') ? imagePath : '';
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

function normalizeInstructionsPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    const normalized = {};

    Object.entries(payload).forEach(([templateId, config]) => {
        const cleanTemplateId = String(templateId || '').trim();
        if (!/^\d+$/.test(cleanTemplateId)) {
            return;
        }

        const steps = Array.isArray(config && config.steps)
            ? config.steps.map(normalizeStep).filter(Boolean)
            : [];

        if (steps.length > 0) {
            normalized[cleanTemplateId] = { steps };
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
        const baseUrl = 'https://127.0.0.1:8080/api/v3/request_templates';
        const agent = new https.Agent({ rejectUnauthorized: false });
        const finalUrl = `${baseUrl}?input_data={"list_info":{"row_count":500}}`;

        const response = await axios.get(finalUrl, {
            headers: { authtoken: SDP_API_KEY },
            httpsAgent: agent
        });

        const sdpTemplates = response.data.request_templates || [];
        const dashboardData = sdpTemplates.map(tpl => ({
            id: tpl.id,
            name: tpl.name,
            is_service: tpl.is_service_template,
            has_config: Boolean(localData[tpl.id])
        }));

        res.json(dashboardData);
    } catch (error) {
        console.error('Error SDP:', error.message);
        res.status(500).json({ error: 'Error conectando a SDP' });
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
