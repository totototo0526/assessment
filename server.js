const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const yaml = require('js-yaml');

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
// Serve static HTML files from the same directory
app.use(express.static(__dirname));

// Ensure DB and Templates exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ appointments: [] }, null, 2));
}

const TEMPLATES_DIR = path.join(__dirname, 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
    fs.mkdirSync(TEMPLATES_DIR);
}

// Get available templates
app.get('/api/templates', (req, res) => {
    try {
        const files = fs.readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        const templates = files.map(file => {
            const fileContents = fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8');
            const data = yaml.load(fileContents);
            return {
                id: file,
                name: data.name || file,
                description: data.description || '',
                questions: data.questions || []
            };
        });
        res.json(templates);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to read templates' });
    }
});

// Create or update template
app.post('/api/templates', (req, res) => {
    try {
        const { filename, content } = req.body;
        if (!filename || !content) {
            return res.status(400).json({ error: 'Filename and content are required' });
        }
        
        // Basic validation: ensure it's valid YAML
        try {
            yaml.load(content);
        } catch (e) {
            return res.status(400).json({ error: 'Invalid YAML format: ' + e.message });
        }

        const safeFilename = filename.endsWith('.yml') || filename.endsWith('.yaml') ? filename : filename + '.yml';
        const filePath = path.join(TEMPLATES_DIR, path.basename(safeFilename));
        
        fs.writeFileSync(filePath, content, 'utf8');
        res.status(201).json({ message: 'Template saved successfully', filename: safeFilename });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save template' });
    }
});

// Delete template
app.delete('/api/templates/:id', (req, res) => {
    try {
        const safeFilename = path.basename(req.params.id);
        const filePath = path.join(TEMPLATES_DIR, safeFilename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({ message: 'Template deleted successfully' });
        } else {
            res.status(404).json({ error: 'Template not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete template' });
    }
});

// Get all appointments
app.get('/api/appointments', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        res.json(data.appointments);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read database' });
    }
});

// Get single appointment
app.get('/api/appointments/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const appointment = data.appointments.find(a => a.id === req.params.id);
        if (appointment) {
            res.json(appointment);
        } else {
            res.status(404).json({ error: 'Appointment not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to read database' });
    }
});

// Create new appointment (Pre-input)
app.post('/api/appointments', (req, res) => {
    try {
        const templateId = req.body.templateId || 'default.yml';
        let questions = [];
        let templateMetadata = {};
        
        // Load the template to embed questions and metadata
        try {
            const templateContent = fs.readFileSync(path.join(TEMPLATES_DIR, templateId), 'utf8');
            const templateData = yaml.load(templateContent);
            if (templateData) {
                questions = templateData.questions || [];
                // Save everything except questions as metadata
                const { questions: _, ...rest } = templateData;
                templateMetadata = rest;
            }
        } catch (e) {
            console.error("Template not found or invalid", e);
        }

        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const newAppointment = {
            id: Date.now().toString(),
            createdAt: new Date().toISOString(),
            status: 'pending', // pending, completed
            companyName: req.body.companyName || '',
            targetName: req.body.targetName || '',
            systemName: req.body.systemName || '',
            sysHistory: req.body.sysHistory || '',
            sysUsage: req.body.sysUsage || '',
            templateId: templateId,
            templateMetadata: templateMetadata,
            questions: questions,
            scores: new Array(questions.length > 0 ? questions.length : 5).fill(3), // Default scores
            prompt: ''
        };
        data.appointments.push(newAppointment);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        res.status(201).json(newAppointment);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to save appointment' });
    }
});

// Update appointment (After hearing)
app.put('/api/appointments/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const index = data.appointments.findIndex(a => a.id === req.params.id);
        
        if (index !== -1) {
            let updatedAppt = {
                ...data.appointments[index],
                ...req.body,
                updatedAt: new Date().toISOString()
            };

            // If templateId changed, we must reload the questions
            if (req.body.templateId && req.body.templateId !== data.appointments[index].templateId) {
                try {
                    const templateContent = fs.readFileSync(path.join(TEMPLATES_DIR, req.body.templateId), 'utf8');
                    const templateData = yaml.load(templateContent);
                    if (templateData) {
                        updatedAppt.questions = templateData.questions || [];
                        const { questions: _, ...rest } = templateData;
                        updatedAppt.templateMetadata = rest;
                        updatedAppt.scores = new Array(updatedAppt.questions.length > 0 ? updatedAppt.questions.length : 5).fill(3);
                    }
                } catch (e) {
                    console.error("Template not found or invalid during update", e);
                }
            }

            data.appointments[index] = updatedAppt;
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            res.json(data.appointments[index]);
        } else {
            res.status(404).json({ error: 'Appointment not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

// Delete appointment
app.delete('/api/appointments/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const index = data.appointments.findIndex(a => a.id === req.params.id);
        
        if (index !== -1) {
            data.appointments.splice(index, 1);
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            res.json({ message: 'Appointment deleted successfully' });
        } else {
            res.status(404).json({ error: 'Appointment not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete appointment' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
