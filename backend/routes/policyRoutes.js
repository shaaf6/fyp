const express = require('express');
const { ethers } = require('ethers');
const axios = require('axios');
const Policy = require('../models/Policy');

const router = express.Router();

function getContract() {
    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const contractAddress = process.env.POLICY_REGISTRY_ADDRESS;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const abi = [{ "inputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }], "name": "addPolicy", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "getAllPolicies", "outputs": [{ "components": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "uint256", "name": "createdAt", "type": "uint256" }, { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }], "internalType": "struct PolicyRegistry.Policy[]", "name": "", "type": "tuple[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "", "type": "string" }], "name": "policies", "outputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "uint256", "name": "createdAt", "type": "uint256" }, { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "policyNames", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "bytes32", "name": "newHash", "type": "bytes32" }], "name": "updatePolicyHash", "outputs": [], "stateMutability": "nonpayable", "type": "function" }];

    return new ethers.Contract(contractAddress, abi, wallet);
}

// Audit Contract
function getAuditContract() {
    const rpcUrl = process.env.RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;
    const auditContractAddress = process.env.AUDIT_CONTRACT_ADDRESS;

    console.log("Audit Contract Address:", auditContractAddress);

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);

    const auditAbi = [{ "anonymous": false, "inputs": [{ "indexed": true, "internalType": "string", "name": "policyName", "type": "string" }, { "indexed": false, "internalType": "string", "name": "userEmail", "type": "string" }, { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }], "name": "PolicyChanged", "type": "event" }, { "inputs": [{ "internalType": "string", "name": "policyName", "type": "string" }], "name": "getAuditCount", "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "policyName", "type": "string" }, { "internalType": "uint256", "name": "index", "type": "uint256" }], "name": "getAuditEntry", "outputs": [{ "internalType": "string", "name": "policyNameOut", "type": "string" }, { "internalType": "string", "name": "userEmail", "type": "string" }, { "internalType": "uint256", "name": "timestamp", "type": "uint256" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "policyName", "type": "string" }, { "internalType": "string", "name": "userEmail", "type": "string" }], "name": "recordChange", "outputs": [], "stateMutability": "nonpayable", "type": "function" }];

    return new ethers.Contract(auditContractAddress, auditAbi, wallet);
}

// Helper function to record audit entry
async function recordAuditEntry(policyName, userEmail = "admin@example.com") {
    try {
        const auditContract = getAuditContract();
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

// POST / - Add policy to MongoDB and Blockchain
router.post('/', async (req, res) => {
    try {
        const { name, policyText, userEmail } = req.body;

        if (!name || !policyText) {
            return res.status(400).json({ error: 'name and policyText are required' });
        }

        // 1. Save to MongoDB
        try {
            const newPolicy = new Policy({
                name: name,
                description: policyText
            });
            await newPolicy.save();
        } catch (dbError) {
            console.error("MongoDB Error:", dbError);
            if (dbError.code === 11000) {
                return res.status(400).json({ error: 'Policy with this name already exists in database' });
            }
            throw dbError;
        }

        // 2. Save to Blockchain
        const contract = getContract();
        const policyHash = ethers.keccak256(ethers.toUtf8Bytes(policyText));

        console.log(`Sending transaction to blockchain for policy: ${name}`);
        const tx = await contract.addPolicy(name, policyHash);
        console.log(`Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

        // 3. Record audit entry
        const email = userEmail || "admin@example.com";
        const auditResult = await recordAuditEntry(name, email);

        return res.status(201).json({
            message: "Policy added to Database and Blockchain",
            txHash: receipt.hash,
            name,
            policyHash,
            audit: {
                txHash: auditResult.txHash,
                recordedBy: email
            }
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

// GET /integrity/:name - Check if database policy matches blockchain hash
router.get('/integrity/:name', async (req, res) => {
    try {
        const { name } = req.params;

        // 1. Get policy from MongoDB
        const dbPolicy = await Policy.findOne({ name: name });
        if (!dbPolicy) {
            return res.status(404).json({ error: 'Policy not found in database' });
        }

        // 2. Get policy from Blockchain
        const contract = getContract();
        const blockchainPolicy = await contract.policies(name);

        if (!blockchainPolicy || blockchainPolicy.createdAt === 0n) {
            return res.status(404).json({ error: 'Policy not found on blockchain' });
        }

        // 3. Calculate hash of current DB policy
        const dbPolicyHash = ethers.keccak256(ethers.toUtf8Bytes(dbPolicy.description));
        const blockchainHash = blockchainPolicy.policyHash;

        // 4. Compare hashes
        const isIntact = dbPolicyHash === blockchainHash;

        console.log(`🔍 Integrity check for "${name}":`);
        console.log(`   DB Hash:         ${dbPolicyHash}`);
        console.log(`   Blockchain Hash: ${blockchainHash}`);
        console.log(`   Match: ${isIntact ? '✅ YES' : '❌ NO'}`);

        return res.json({
            policyName: name,
            integrityStatus: isIntact ? 'VALID' : 'TAMPERED',
            message: isIntact
                ? '✅ Database policy matches blockchain hash. No tampering detected.'
                : '❌ WARNING: Database policy has been modified! Hash mismatch detected.',
            dbHash: dbPolicyHash,
            blockchainHash: blockchainHash,
            dbLastUpdated: dbPolicy.createdAt
        });

    } catch (err) {
        console.error("❌ Integrity check failed:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /integrity - Check integrity of ALL policies
router.get('/integrity', async (req, res) => {
    try {
        // Get all policies from blockchain
        const contract = getContract();
        const blockchainPolicies = await contract.getAllPolicies();

        const results = [];

        for (const bcPolicy of blockchainPolicies) {
            const name = bcPolicy.name;

            // Get from DB
            const dbPolicy = await Policy.findOne({ name: name });

            if (!dbPolicy) {
                results.push({
                    policyName: name,
                    integrityStatus: 'MISSING_IN_DB',
                    message: '⚠️ Policy exists on blockchain but not in database'
                });
                continue;
            }

            // Calculate and compare hashes
            const dbPolicyHash = ethers.keccak256(ethers.toUtf8Bytes(dbPolicy.description));
            const blockchainHash = bcPolicy.policyHash;
            const isIntact = dbPolicyHash === blockchainHash;

            results.push({
                policyName: name,
                integrityStatus: isIntact ? 'VALID' : 'TAMPERED',
                message: isIntact
                    ? '✅ No tampering detected'
                    : '❌ Hash mismatch - possible tampering',
                dbHash: dbPolicyHash,
                blockchainHash: blockchainHash
            });
        }

        const validCount = results.filter(r => r.integrityStatus === 'VALID').length;
        const tamperedCount = results.filter(r => r.integrityStatus === 'TAMPERED').length;

        return res.json({
            summary: {
                total: results.length,
                valid: validCount,
                tampered: tamperedCount,
                overallStatus: tamperedCount === 0 ? 'ALL_VALID' : 'INTEGRITY_ISSUES_DETECTED'
            },
            policies: results
        });

    } catch (err) {
        console.error("❌ Integrity check failed:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// POST /compare - Compare submitted policy with DB version using DeepSeek
router.post('/compare', async (req, res) => {
    try {
        const { name, policyText } = req.body;
        const apiKey = process.env.apikey;

        if (!name || !policyText) {
            return res.status(400).json({ error: 'name and policyText are required' });
        }

        // Fetch from MongoDB
        const existingPolicy = await Policy.findOne({ name: name });

        if (!existingPolicy) {
            return res.status(404).json({ message: 'Policy not found in database' });
        }

        // Call DeepSeek
        const prompt = `
        Compare the following two policy texts.
        
        Original Policy (from database):
        ${existingPolicy.description}
        
        New Policy (submitted):
        ${policyText}
        
        If they are the same (ignoring minor whitespace), say "No change needed".
        If they are different, explain the differences clearly.
        `;

        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "You are a helpful assistant that compares policy documents." },
                { role: "user", content: prompt }
            ],
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const analysis = response.data?.choices?.[0]?.message?.content || 'No analysis returned';

        return res.json({
            name,
            analysis
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

// PUT /:name - Update MongoDB and Blockchain
router.put('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const { policyText, userEmail } = req.body;

        if (!policyText) {
            return res.status(400).json({ error: 'policyText is required' });
        }

        // 1. Update MongoDB
        const updatedPolicy = await Policy.findOneAndUpdate(
            { name: name },
            { description: policyText },
            { new: true }
        );

        if (!updatedPolicy) {
            return res.status(404).json({ error: 'Policy not found in database' });
        }

        // 2. Update Blockchain
        const contract = getContract();
        const newHash = ethers.keccak256(ethers.toUtf8Bytes(policyText));

        console.log(`Updating policy hash on blockchain for: ${name}`);
        const tx = await contract.updatePolicyHash(name, newHash);
        const receipt = await tx.wait();

        // 3. Record audit entry
        const email = userEmail || "admin@example.com";
        const auditResult = await recordAuditEntry(name, email);

        return res.json({
            message: "Policy updated in Database and Blockchain",
            txHash: receipt.hash,
            name,
            newHash,
            audit: {
                txHash: auditResult.txHash,
                recordedBy: email
            }
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// POST /explain/:name - Explain a specific policy using AI
router.post('/explain/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const apiKey = process.env.apikey;

        // Fetch policy from MongoDB
        const policy = await Policy.findOne({ name: name });

        if (!policy) {
            return res.status(404).json({ error: 'Policy not found in database' });
        }

        // Ask DeepSeek to explain the policy
        const prompt = `
        Please explain the following ${name.toUpperCase()} policy in simple, easy-to-understand terms. 
        Break it down into key points and explain what it means for compliance.
        
        Policy:
        ${policy.description}
        `;

        const response = await axios.post('https://api.deepseek.com/chat/completions', {
            model: "deepseek-chat",
            messages: [
                { role: "system", content: "You are a helpful assistant that explains financial compliance policies in simple terms." },
                { role: "user", content: prompt }
            ],
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const explanation = response.data?.choices?.[0]?.message?.content || 'No explanation returned';

        return res.json({
            policyName: policy.name,
            policyText: policy.description,
            explanation: explanation
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: err.message });
    }
});

// GET /audit/:name - Get all audit logs for a specific policy
router.get('/audit/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const auditContract = getAuditContract();

        // Get the count of audit entries for this policy
        const count = await auditContract.getAuditCount(name);
        const auditCount = Number(count);

        console.log(`📋 Found ${auditCount} audit entries for policy: ${name}`);

        if (auditCount === 0) {
            return res.json({
                policyName: name,
                totalEntries: 0,
                auditLogs: []
            });
        }

        // Fetch all audit entries
        const auditLogs = [];
        for (let i = 0; i < auditCount; i++) {
            const entry = await auditContract.getAuditEntry(name, i);
            auditLogs.push({
                policyName: entry.policyNameOut,
                userEmail: entry.userEmail,
                timestamp: new Date(Number(entry.timestamp) * 1000).toISOString()
            });
        }

        return res.json({
            policyName: name,
            totalEntries: auditCount,
            auditLogs: auditLogs
        });

    } catch (err) {
        console.error("❌ Error fetching audit logs:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

// GET /audit - Get all audit logs for all policies
router.get('/audit', async (req, res) => {
    try {
        const contract = getContract();
        const auditContract = getAuditContract();

        // Get all policy names from the policy registry
        const policies = await contract.getAllPolicies();

        console.log(`📋 Fetching audit logs for ${policies.length} policies`);

        const allAuditLogs = [];

        for (const policy of policies) {
            const policyName = policy.name;
            const count = await auditContract.getAuditCount(policyName);
            const auditCount = Number(count);

            for (let i = 0; i < auditCount; i++) {
                const entry = await auditContract.getAuditEntry(policyName, i);
                allAuditLogs.push({
                    policyName: entry.policyNameOut,
                    userEmail: entry.userEmail,
                    timestamp: new Date(Number(entry.timestamp) * 1000).toISOString()
                });
            }
        }

        // Sort by timestamp (newest first)
        allAuditLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        return res.json({
            totalEntries: allAuditLogs.length,
            auditLogs: allAuditLogs
        });

    } catch (err) {
        console.error("❌ Error fetching all audit logs:", err.message);
        return res.status(500).json({ error: err.message });
    }
});

router.get('/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const contract = getContract();
        const policy = await contract.policies(name);

        if (!policy || policy.createdAt === 0n) {
            return res.status(404).json({ error: 'policy not found' });
        }

        return res.json({
            name: policy.name,
            createdAt: policy.createdAt.toString(),
            policyHash: policy.policyHash
        });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const contract = getContract();
        const list = await contract.getAllPolicies();

        const policies = list.map(p => ({
            name: p.name,
            createdAt: new Date(Number(p.createdAt)).toISOString(),
            policyHash: p.policyHash
        }));

        // Existing DeepSeek explanation logic
        const userPrompt = `Explain the following policies in simple terms:\n${policies.map(p => `${p.name}: hash ${p.policyHash}`).join('\n')}`;

        let explanation = 'No explanation available';
        try {
            const response = await axios.post(
                'https://api.deepseek.com/chat/completions',
                {
                    model: 'deepseek-chat',
                    messages: [
                        { role: 'system', content: 'You are a helpful assistant.' },
                        { role: 'user', content: userPrompt }
                    ],
                    stream: false
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.apikey}`
                    }
                }
            );
            explanation = response.data?.choices?.[0]?.message?.content || 'No explanation returned';
        } catch (apiErr) {
            console.error("DeepSeek API Error:", apiErr.message);
            explanation = "Could not fetch explanation from AI.";
        }

        res.json({ policies, explanation });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).json({ error_msg: err.response?.data || err.message });
    }
});

module.exports = router;
