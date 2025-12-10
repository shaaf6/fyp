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
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

// Middleware to verify compliance officer role
const isComplianceOfficer = (req, res, next) => {
    if (req.user.role !== 'compliance_officer') {
        return res.status(403).json({ error: 'Access denied. Compliance officer role required.' });
    }
    next();
};

// GET /api/compliance/policies - Get KYC and AML policies
router.get('/policies', verifyToken, isComplianceOfficer, async (req, res) => {
    try {
        const policies = await Policy.find({
            name: { $in: [/^kyc$/i, /^aml$/i] }
        });
        res.json(policies);
    } catch (err) {
        console.error('Error fetching policies:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/compliance/audit-logs - Get audit logs from blockchain
router.get('/audit-logs', verifyToken, isComplianceOfficer, async (req, res) => {
    try {
        const { ethers } = require('ethers');

        const rpcUrl = process.env.RPC_URL;
        const privateKey = process.env.PRIVATE_KEY;
        const auditContractAddress = process.env.AUDIT_CONTRACT_ADDRESS;

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);

        const auditAbi = [
            {
                "inputs": [{ "internalType": "string", "name": "policyName", "type": "string" }],
                "name": "getAuditCount",
                "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    { "internalType": "string", "name": "policyName", "type": "string" },
                    { "internalType": "uint256", "name": "index", "type": "uint256" }
                ],
                "name": "getAuditEntry",
                "outputs": [
                    { "internalType": "string", "name": "policyNameOut", "type": "string" },
                    { "internalType": "string", "name": "userEmail", "type": "string" },
                    { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];

        const auditContract = new ethers.Contract(auditContractAddress, auditAbi, wallet);

        const policyNames = ['KYC', 'AML'];
        const allLogs = [];

        for (const policyName of policyNames) {
            const count = await auditContract.getAuditCount(policyName);
            const numericCount = Number(count);

            for (let i = 0; i < numericCount; i++) {
                const entry = await auditContract.getAuditEntry(policyName, i);
                allLogs.push({
                    policyName: entry[0],
                    userEmail: entry[1],
                    timestamp: Number(entry[2]),
                    date: new Date(Number(entry[2]) * 1000).toISOString()
                });
            }
        }

        allLogs.sort((a, b) => b.timestamp - a.timestamp);

        res.json(allLogs);
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/compliance/policies/:id/alert - Toggle alert for a policy
router.put('/policies/:id/alert', verifyToken, isComplianceOfficer, async (req, res) => {
    try {
        const { id } = req.params;
        const { alert, reason } = req.body;

        const policy = await Policy.findById(id);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        policy.alert = alert;
        await policy.save();

        console.log(`🚨 Alert ${alert === 1 ? 'SET' : 'CLEARED'} for policy ${policy.name} by ${req.user.email}${reason ? ' - Reason: ' + reason : ''}`);

        res.json({
            message: `Alert ${alert === 1 ? 'set' : 'cleared'} successfully`,
            policy
        });
    } catch (err) {
        console.error('Error updating alert:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/compliance/chatbot - Chat with AI about policies
router.post('/chatbot', verifyToken, isComplianceOfficer, async (req, res) => {
    try {
        const { message, conversationHistory = [], policyContext } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

        let systemPrompt = 'You are a compliance officer assistant. Help users understand financial policies (KYC, AML) and their compliance implications. Explain concepts clearly and provide actionable guidance.';

        if (policyContext) {
            systemPrompt = `You are a compliance officer assistant. The user is reviewing a policy:

Policy Name: ${policyContext.name}
Policy Description: ${policyContext.description}

Help the user understand this policy, its compliance requirements, and answer questions about implementation, risks, and best practices. Be specific and practical in your guidance.`;
        }

        // Keep last 6 messages for context
        const recentHistory = conversationHistory.slice(-6);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...recentHistory,
            { role: 'user', content: message }
        ];

        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: 'deepseek-chat',
            messages: messages,
            temperature: 0.5,
            max_tokens: 3000
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
        console.error('Chatbot error:', err.response?.data || err.message);
        res.status(500).json({ error: err.response?.data?.error?.message || err.message });
    }
});

module.exports = router;
