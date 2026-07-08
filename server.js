const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json());
// Serve static HTML files from the same directory
app.use(express.static(__dirname));

// Initialize DB if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ appointments: [] }, null, 2));
}

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
            scores: [3, 3, 3, 3, 3], // Default scores
            prompt: ''
        };
        data.appointments.push(newAppointment);
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
        res.status(201).json(newAppointment);
    } catch (err) {
        res.status(500).json({ error: 'Failed to save appointment' });
    }
});

// Update appointment (After hearing)
app.put('/api/appointments/:id', (req, res) => {
    try {
        const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        const index = data.appointments.findIndex(a => a.id === req.params.id);
        
        if (index !== -1) {
            data.appointments[index] = {
                ...data.appointments[index],
                ...req.body,
                updatedAt: new Date().toISOString()
            };
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
            res.json(data.appointments[index]);
        } else {
            res.status(404).json({ error: 'Appointment not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to update appointment' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
