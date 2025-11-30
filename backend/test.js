const { ethers } = require('ethers');
require('dotenv').config();

async function testConnection() {
    try {
        console.log('🔍 Testing contract connection...\n');

        const rpcUrl = process.env.RPC_URL;
        const privateKey = process.env.PRIVATE_KEY;
        const contractAddress = process.env.POLICY_REGISTRY_ADDRESS;

        console.log('✓ RPC URL:', rpcUrl);
        console.log('✓ Contract Address:', contractAddress);
        console.log('✓ Private Key:', privateKey.substring(0, 10) + '...');

        // Create provider and wallet
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);

        console.log('\n📡 Wallet connected:');
        console.log('✓ Wallet Address:', wallet.address);

        // Test provider connection
        const blockNumber = await provider.getBlockNumber();
        console.log('✓ Latest Block:', blockNumber);

        // Contract ABI from verified contract
        const abi = [{ "inputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }], "name": "addPolicy", "outputs": [], "stateMutability": "nonpayable", "type": "function" }, { "inputs": [], "name": "getAllPolicies", "outputs": [{ "components": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "uint256", "name": "createdAt", "type": "uint256" }, { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }], "internalType": "struct PolicyRegistry.Policy[]", "name": "", "type": "tuple[]" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "", "type": "string" }], "name": "policies", "outputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "uint256", "name": "createdAt", "type": "uint256" }, { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }], "name": "policyNames", "outputs": [{ "internalType": "string", "name": "", "type": "string" }], "stateMutability": "view", "type": "function" }, { "inputs": [{ "internalType": "string", "name": "name", "type": "string" }, { "internalType": "bytes32", "name": "newHash", "type": "bytes32" }], "name": "updatePolicyHash", "outputs": [], "stateMutability": "nonpayable", "type": "function" }];

        const contract = new ethers.Contract(contractAddress, abi, wallet);

        console.log('\n📋 Testing getAllPolicies()...');
        const policies = await contract.getAllPolicies();
        console.log('✓ Found', policies.length, 'policies');

        if (policies.length > 0) {
            console.log('\nPolicies:');
            policies.forEach((p, i) => {
                console.log(`  ${i + 1}. Name: ${p.name}, Hash: ${p.policyHash.substring(0, 10)}...`);
            });
        }

        console.log('\n✅ Connection successful! Everything is working correctly.');

    } catch (err) {
        console.error('❌ Error:', err.message);
        console.error(err);
        process.exit(1);
    }
}

testConnection();
