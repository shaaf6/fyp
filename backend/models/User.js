const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        required: true,
        enum: ['owner', 'risk_manager', 'compliance_officer', 'system_admin'],
        default: 'compliance_officer'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, { collection: 'user' });

// Hash password before saving
userSchema.pre('save', async function () {
    // Skip if password hasn't been modified
    if (!this.isModified('password')) {
        return;
    }

    // Hash the password
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw error;
    }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
