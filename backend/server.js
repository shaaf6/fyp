const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();

const policyRoutes = require('./routes/policyRoutes');

const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

app.use(express.json());

app.use('/api/policies', policyRoutes);

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});

