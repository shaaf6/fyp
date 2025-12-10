const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const policyRoutes = require('./routes/policyRoutes');
const authRoutes = require('./routes/authRoutes');
const systemAdminRoutes = require('./routes/systemAdminRoutes');
const riskManagerRoutes = require('./routes/riskManagerRoutes');
const complianceOfficerRoutes = require('./routes/complianceOfficerRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/policies', policyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sysadmin', systemAdminRoutes);
app.use('/api/riskmgr', riskManagerRoutes);
app.use('/api/compliance', complianceOfficerRoutes);

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

