const express = require('express');
const axios = require('axios');
const { ethers } = require('ethers');
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

// Middleware to verify system admin role
const isSystemAdmin = (req, res, next) => {
    if (req.user.role !== 'system_admin') {
        return res.status(403).json({ error: 'Access denied. System admin role required.' });
    }
    next();
};

// Helper function to record audit entry on blockchain
async function recordAuditEntry(policyName, userEmail = "system_admin@system.com") {
    try {
        const rpcUrl = process.env.RPC_URL;
        const privateKey = process.env.PRIVATE_KEY;
        const auditContractAddress = process.env.AUDIT_CONTRACT_ADDRESS;

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);

        const auditAbi = [{ "inputs": [{ "internalType": "string", "name": "policyName", "type": "string" }, { "internalType": "string", "name": "userEmail", "type": "string" }], "name": "recordChange", "outputs": [], "stateMutability": "nonpayable", "type": "function" }];

        const auditContract = new ethers.Contract(auditContractAddress, auditAbi, wallet);

        console.log(`📝 Recording audit entry for policy: ${policyName}, user: ${userEmail}`);
        const tx = await auditContract.recordChange(policyName, userEmail);
        console.log(`📝 Audit transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`✅ Audit entry recorded in block: ${receipt.blockNumber}`);

        return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
    } catch (err) {
        console.error("❌ Audit recording failed:", err.message);
        throw err;
    }
}

// Audit Contract Helper
function getAuditContract() {
    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const auditContractAddress = process.env.AUDIT_CONTRACT_ADDRESS;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const auditAbi = [
        {
            "anonymous": false,
            "inputs": [
                { "indexed": true, "internalType": "string", "name": "policyName", "type": "string" },
                { "indexed": false, "internalType": "string", "name": "userEmail", "type": "string" },
                { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
            ],
            "name": "PolicyChanged",
            "type": "event"
        },
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

    return new ethers.Contract(auditContractAddress, auditAbi, wallet);
}

// GET /api/sysadmin/policies - Get all policies (KYC & AML)
router.get('/policies', verifyToken, isSystemAdmin, async (req, res) => {
    try {
        const policies = await Policy.find({
            $or: [
                { name: /^kyc$/i },
                { name: /^aml$/i }
            ]
        }).sort({ createdAt: -1 });
        res.json(policies);
    } catch (err) {
        console.error('Error fetching policies:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/sysadmin/audit-logs - Get audit logs for KYC and AML policies
router.get('/audit-logs', verifyToken, isSystemAdmin, async (req, res) => {
    try {
        const auditContract = getAuditContract();
        const allAuditLogs = [];

        // Fetch audit logs for KYC and AML (try both uppercase and lowercase)
        const policyNames = ['KYC', 'AML', 'kyc', 'aml'];

        for (const policyName of policyNames) {
            try {
                const count = await auditContract.getAuditCount(policyName);
                const numEntries = Number(count);

                for (let i = 0; i < numEntries; i++) {
                    const entry = await auditContract.getAuditEntry(policyName, i);

                    // Check if this entry already exists (avoid duplicates)
                    const isDuplicate = allAuditLogs.some(log =>
                        log.policyName.toLowerCase() === entry[0].toLowerCase() &&
                        log.userEmail === entry[1] &&
                        log.timestamp === Number(entry[2])
                    );

                    if (!isDuplicate) {
                        allAuditLogs.push({
                            policyName: entry[0],
                            userEmail: entry[1],
                            timestamp: Number(entry[2]),
                            date: new Date(Number(entry[2]) * 1000).toLocaleString()
                        });
                    }
                }
            } catch (policyErr) {
                console.log(`No audit logs for ${policyName}`);
            }
        }

        // Sort by timestamp descending (newest first)
        allAuditLogs.sort((a, b) => b.timestamp - a.timestamp);

        res.json(allAuditLogs);
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sysadmin/policies/:id - Update policy description (saves previous to 'prev')
router.put('/policies/:id', verifyToken, isSystemAdmin, async (req, res) => {
    console.log(`🔵 ROUTE HIT: PUT /api/sysadmin/policies/${req.params.id}`);
    console.log(`🔵 Request body:`, req.body);
    console.log(`🔵 User:`, req.user.email);

    try {
        const { id } = req.params;
        const { description } = req.body;

        console.log(`📝 Updating policy ${id}`);
        console.log(`📝 New description length: ${description?.length || 0}`);

        if (!description) {
            return res.status(400).json({ error: 'Description is required' });
        }

        const policy = await Policy.findById(id);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        console.log(`📝 Found policy: ${policy.name}`);

        // Save current description to prev field
        policy.prev = policy.description;
        policy.description = description;
        await policy.save();

        console.log(`✅ Policy saved to database`);

        // Update blockchain hash
        try {
            const rpcUrl = process.env.RPC_URL;
            const privateKey = process.env.PRIVATE_KEY;
            const contractAddress = process.env.POLICY_REGISTRY_ADDRESS;

            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);

            const abi = [
                { "inputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "bytes32", "name": "newHash", "type": "bytes32" }], "name": "updatePolicyHash", "outputs": [], "stateMutability": "nonpayable", "type": "function" }
            ];

            const contract = new ethers.Contract(contractAddress, abi, wallet);
            const newHash = ethers.keccak256(ethers.toUtf8Bytes(description));

            console.log(`🔗 Updating blockchain hash for ${policy.name}`);
            const tx = await contract.updatePolicyHash(policy.name, newHash);
            console.log(`🔗 Hash update transaction sent: ${tx.hash}`);
            await tx.wait();
            console.log(`✅ Blockchain hash updated successfully`);
        } catch (blockchainErr) {
            console.error('⚠️ Failed to update blockchain hash:', blockchainErr.message);
        }

        // Record audit entry on blockchain (use actual user email)
        try {
            const policyNameUpper = policy.name.toUpperCase();
            const userEmail = req.user.email;
            console.log(`📝 Recording audit for: ${policyNameUpper} by ${userEmail}`);
            await recordAuditEntry(policyNameUpper, userEmail);
            console.log(`✅ Audit log recorded on blockchain for ${policyNameUpper}`);
        } catch (auditErr) {
            console.error('⚠️ Failed to record audit log:', auditErr.message);
            console.error(auditErr);
            // Don't fail the update if audit fails
        }

        res.json({
            message: 'Policy updated successfully',
            policy
        });
    } catch (err) {
        console.error('Error updating policy:', err);
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/sysadmin/policies/:id/alert - Toggle alert for a policy
router.put('/policies/:id/alert', verifyToken, isSystemAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { alert } = req.body;

        if (alert !== 0 && alert !== 1) {
            return res.status(400).json({ error: 'Alert must be 0 or 1' });
        }

        const policy = await Policy.findById(id);
        if (!policy) {
            return res.status(404).json({ error: 'Policy not found' });
        }

        policy.alert = alert;
        await policy.save();

        res.json({
            message: 'Policy alert updated successfully',
            policy
        });
    } catch (err) {
        console.error('Error updating policy alert:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sysadmin/chatbot - Chat about policy updates
// POST /api/sysadmin/chatbot - Chat about policy updates
router.post('/chatbot', verifyToken, isSystemAdmin, async (req, res) => {
    try {
        const { message, policyContext, conversationHistory } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

        const systemPrompt = policyContext
            ? `You are a compliance policy assistant. The user is working on updating a policy. Current policy context:\n\nPolicy Name: ${policyContext.name}\nCurrent Description: ${policyContext.description}\n\nHelp the user with questions about policy updates, compliance requirements, and best practices. Provide complete, detailed explanations. If your response is very long, structure it with clear sections and bullet points for readability.`
            : 'You are a compliance policy assistant. Help users with policy-related questions. Provide complete, detailed explanations. If your response is very long, structure it with clear sections and bullet points for readability.';

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

        // Log if response was truncated
        if (finishReason === 'length') {
            console.warn('⚠️ AI response was truncated due to max_tokens limit');
        }

        res.json({
            response: aiResponse,
            finish_reason: finishReason
        });
    } catch (err) {
        console.error('Error with chatbot:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/sysadmin/scraper/run - Run scraper
router.post('/scraper/run', verifyToken, isSystemAdmin, async (req, res) => {
    try {
        // Placeholder for scraper logic
        // You can implement your scraping logic here

        // Simulating scraper results
        const scraperResults = {
            timestamp: new Date().toISOString(),
            status: 'success',
            results: [
                {
                    source: 'Regulatory Website 1',
                    updates: 'No new updates found',
                    lastChecked: new Date().toISOString()
                },
                {
                    source: 'Compliance Portal',
                    updates: 'New KYC guidelines available',
                    lastChecked: new Date().toISOString()
                },
                {
                    source: 'AML Database',
                    updates: 'Updated sanctions list detected',
                    lastChecked: new Date().toISOString()
                }
            ],
            summary: {
                totalSources: 3,
                updatesFound: 2,
                noUpdates: 1
            }
        };

        res.json(scraperResults);
    } catch (err) {
        console.error('Error running scraper:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
