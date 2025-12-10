const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user._id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Middleware to check if user is owner
const isOwner = (req, res, next) => {
    if (req.user.role !== 'owner') {
        return res.status(403).json({ error: 'Access denied. Owner role required.' });
    }
    next();
};

// Get all users (owner only)
router.get('/users', verifyToken, isOwner, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create user (owner only)
router.post('/users', verifyToken, isOwner, async (req, res) => {
    try {
        const { email, password, role } = req.body;

        if (!email || !password || !role) {
            return res.status(400).json({ error: 'Email, password, and role are required' });
        }

        // Prevent creating another owner
        if (role === 'owner') {
            return res.status(403).json({ error: 'Cannot create another owner account' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        const user = new User({ email, password, role });
        await user.save();

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user._id,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user (owner only)
router.put('/users/:id', verifyToken, isOwner, async (req, res) => {
    try {
        const { id } = req.params;
        const { email, password, role } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent user from editing their own role
        if (user._id.toString() === req.user.userId && role && role !== user.role) {
            return res.status(403).json({ error: 'Cannot change your own role' });
        }

        // Prevent changing role to owner
        if (role === 'owner') {
            return res.status(403).json({ error: 'Cannot change role to owner' });
        }

        if (email) user.email = email;
        if (role) user.role = role;
        if (password) user.password = password; // Will be hashed by pre-save hook

        await user.save();

        res.json({
            message: 'User updated successfully',
            user: {
                id: user._id,
                email: user.email,
                role: user.role
            }
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user (owner only)
router.delete('/users/:id', verifyToken, isOwner, async (req, res) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prevent deleting yourself
        if (user._id.toString() === req.user.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await User.findByIdAndDelete(id);

        res.json({ message: 'User deleted successfully' });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get current user info
router.get('/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
