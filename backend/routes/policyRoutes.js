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

// POST / - Add policy to MongoDB and Blockchain
router.post('/', async (req, res) => {
    try {
        const { name, policyText } = req.body;

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

        return res.status(201).json({
            message: "Policy added to Database and Blockchain",
            txHash: receipt.hash,
            name,
            policyHash
        });
    } catch (err) {
        console.error(err);
        // If blockchain fails, we might want to rollback DB, but for simplicity we'll leave it or user can retry.
        // Ideally: await Policy.deleteOne({ name });
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
        const { policyText } = req.body;

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

        return res.json({
            message: "Policy updated in Database and Blockchain",
            txHash: receipt.hash,
            name,
            newHash
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
