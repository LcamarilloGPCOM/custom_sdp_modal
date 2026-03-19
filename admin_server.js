require('dotenv').config(); // <--- 1. CARGAR DOTENV AL PRINCIPIO
const http = require('http');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const axios = require('axios');
const https = require('https');
const app = express();
const PORT = process.env.PORT || 3050;
const SDP_API_KEY = process.env.SDP_API_KEY

app.use(cors());
app.use(bodyParser.json());
app.use('/', express.static(__dirname + '/public'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './images'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- CONFIGURACIÓN SSL ---
/*const httpsOptions = {
    key: fs.readFileSync('krispykreme.key'),       // <--- NOMBRE DE TU LLAVE PRIVADA
    cert: fs.readFileSync('krispykreme.crt'),      // <--- NOMBRE DE TU CERTIFICADO
    ca: [ fs.readFileSync('ca_bundle.crt') ]       // <--- NOMBRE DE TU INTERMEDIO (si tienes)
};
*/
// --- RUTAS API ---
app.get('/api/dashboard', async (req, res) => {
    try {
        let localData = {};
        if (fs.existsSync('instructions.json')) {
            localData = JSON.parse(fs.readFileSync('instructions.json', 'utf8'));
        }

        // Conexión local a SDP (segura y rápida)
        const baseUrl = 'https://127.0.0.1:8080/api/v3/request_templates';
        const agent = new https.Agent({ rejectUnauthorized: false });
        const finalUrl = baseUrl + '?input_data={"list_info":{"row_count":100}}';

        const response = await axios.get(finalUrl, {
            headers: { 'authtoken': SDP_API_KEY },
            httpsAgent: agent
        });

        const sdpTemplates = response.data.request_templates || [];
        const dashboardData = sdpTemplates.map(tpl => ({
            id: tpl.id,
            name: tpl.name,
            is_service: tpl.is_service_template,
            has_config: !!localData[tpl.id]
        }));
        res.json(dashboardData);
    } catch (error) {
        console.error('Error SDP:', error.message);
        res.status(500).json({ error: 'Error conectando a SDP' });
    }
});

// En lugar de servir la raíz, solo sirve la carpeta de imágenes
app.use('/images', express.static(__dirname + '/images'));

app.get('/api/instructions', (req, res) => {
    fs.readFile('instructions.json', 'utf8', (err, data) => res.json(err ? {} : JSON.parse(data)));
});

app.post('/api/instructions', (req, res) => {
    fs.writeFile('instructions.json', JSON.stringify(req.body, null, 2), err => {
        if (err) return res.status(500).send('Error');
        res.send('Guardado');
    });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
    if(req.file) res.json({ path: '/editor-api/images/' + req.file.filename });
    else res.status(400).send('No image');
});

app.listen(PORT, '127.0.0.1', () => {
    console.log(`Editor en Producción corriendo en el puerto ${PORT}`);
});
