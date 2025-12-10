const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const Policy = require('../models/Policy');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Contains: userId, email, role
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Middleware to verify risk manager role
const isRiskManager = (req, res, next) => {
    if (req.user.role !== 'risk_manager') {
        return res.status(403).json({ error: 'Access denied. Risk manager role required.' });
    }
    next();
};

// GET /api/riskmgr/policies - Get all policies with integrity analysis
router.get('/policies', verifyToken, isRiskManager, async (req, res) => {
    try {
        const policies = await Policy.find({
            name: { $in: [/^kyc$/i, /^aml$/i] }
        });

        // Analyze integrity for each policy
        const policiesWithIntegrity = policies.map(policy => {
            const hasHistory = policy.prev && policy.prev.trim().length > 0;
            const currentLength = policy.description.length;
            const prevLength = hasHistory ? policy.prev.length : 0;

            // Calculate change percentage
            let changePercentage = 0;
            if (hasHistory && prevLength > 0) {
                changePercentage = Math.abs(((currentLength - prevLength) / prevLength) * 100);
            }

            // Determine integrity status
            let integrityStatus = 'good';
            let integrityMessage = 'Policy looks stable';

            if (!hasHistory) {
                integrityStatus = 'new';
                integrityMessage = 'No previous version available';
            } else if (changePercentage > 50) {
                integrityStatus = 'warning';
                integrityMessage = 'Significant changes detected (>50%)';
            } else if (changePercentage > 30) {
                integrityStatus = 'caution';
                integrityMessage = 'Moderate changes detected (>30%)';
            }

            return {
                _id: policy._id,
                name: policy.name,
                description: policy.description,
                prev: policy.prev,
                alert: policy.alert,
                createdAt: policy.createdAt,
                hasHistory,
                changePercentage: hasHistory ? changePercentage.toFixed(2) : 'N/A',
                integrityStatus,
                integrityMessage
            };
        });

        res.json(policiesWithIntegrity);
    } catch (err) {
        console.error('Error fetching policies:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/riskmgr/analyze-integrity - Analyze policy integrity with AI
router.post('/analyze-integrity', verifyToken, isRiskManager, async (req, res) => {
    try {
        const { policyId } = req.body;

        if (!policyId) {
            return res.status(400).json({ error: 'Policy ID is required' });
        }

        const policy = await Policy.findById(policyId);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        if (!policy.prev || policy.prev.trim().length === 0) {
            return res.json({
                analysis: 'No previous version available for comparison',
                recommendation: 'This is the first version of the policy',
                severity: 'info'
            });
        }

        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

        const prompt = `You are a compliance risk analyst. Compare these two versions of a ${policy.name.toUpperCase()} policy and analyze the integrity:

PREVIOUS VERSION:
${policy.prev}

CURRENT VERSION:
${policy.description}

Provide a detailed analysis covering:
1. Key changes between versions
2. Risk assessment (low/medium/high)
3. Whether changes align with compliance standards
4. Any missing critical elements
5. Recommendation (approve/review/reject)

Be specific and highlight any drastic changes or inconsistencies.`;

        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: 'You are a compliance risk analyst specializing in policy review and integrity checks.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2000
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const analysis = response.data.choices[0].message.content;

        res.json({
            analysis,
            policyName: policy.name,
            changeDate: policy.updatedAt || policy.createdAt
        });
    } catch (err) {
        console.error('Error analyzing integrity:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/riskmgr/policies/:id/alert - Set alert flag for a policy
router.put('/policies/:id/alert', verifyToken, isRiskManager, async (req, res) => {
    try {
        const { id } = req.params;
        const { alert, reason } = req.body;

        if (alert !== 0 && alert !== 1) {
            return res.status(400).json({ error: 'Alert must be 0 or 1' });
        }

        const policy = await Policy.findById(id);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        policy.alert = alert;
        await policy.save();

        console.log(`🚨 Alert ${alert === 1 ? 'SET' : 'CLEARED'} for policy ${policy.name} by ${req.user.email}${reason ? ` - Reason: ${reason}` : ''}`);

        res.json({
            message: `Alert ${alert === 1 ? 'set' : 'cleared'} successfully`,
            policy
        });
    } catch (err) {
        console.error('Error setting alert:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/riskmgr/chatbot - AI chatbot for policy analysis
router.post('/chatbot', verifyToken, isRiskManager, async (req, res) => {
    try {
        const { message, policyContext, conversationHistory } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

        let systemPrompt = 'You are a compliance risk analyst assistant. Help users analyze policy changes, assess risks, and provide recommendations for policy integrity and compliance.';

        if (policyContext) {
            systemPrompt = `You are a compliance risk analyst assistant. The user is analyzing a policy.

Policy Name: ${policyContext.name}
Current Version: ${policyContext.description}
${policyContext.prev ? `Previous Version: ${policyContext.prev}` : 'No previous version available'}

Help the user assess policy integrity, identify risks, analyze changes, and provide recommendations. Be specific and highlight any concerns.`;
        }

        // Build messages array with conversation history
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add conversation history (last 6 messages for context)
        if (conversationHistory && conversationHistory.length > 0) {
            const recentHistory = conversationHistory.slice(-6);
            messages.push(...recentHistory);
        }

        // Add current message
        messages.push({ role: 'user', content: message });

        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: 'deepseek-chat',
            messages: messages,
            temperature: 0.7,
            max_tokens: 4000
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = response.data.choices[0].message.content;
        const finishReason = response.data.choices[0].finish_reason;

        res.json({
            response: aiResponse,
            finish_reason: finishReason
        });
    } catch (err) {
        console.error('Error with chatbot:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
