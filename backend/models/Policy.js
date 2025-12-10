const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required: true
    },
    prev: {
        type: String,
        default: ''
    },
    alert: {
        type: Number,
        default: 0,
        enum: [0, 1]
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: 'policy' });

module.exports = mongoose.model('Policy', policySchema);
