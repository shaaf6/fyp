const { ethers } = require('ethers');
require('dotenv').config();


const CONTRACT_ABI = [
    {
        "inputs": [
            { "internalType": "string", "name": "name", "type": "string" },
            { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }
        ],
        "name": "addPolicy",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "string", "name": "name", "type": "string" },
            { "internalType": "bytes32", "name": "newHash", "type": "bytes32" }
        ],
        "name": "updatePolicyHash",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "getAllPolicies",
        "outputs": [
            {
                "components": [
                    { "internalType": "string", "name": "name", "type": "string" },
                    { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
                    { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }
                ],
                "internalType": "struct PolicyRegistry.Policy[]",
                "name": "",
                "type": "tuple[]"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            { "internalType": "string", "name": "", "type": "string" }
        ],
        "name": "policies",
        "outputs": [
            { "internalType": "string", "name": "name", "type": "string" },
            { "internalType": "uint256", "name": "createdAt", "type": "uint256" },
            { "internalType": "bytes32", "name": "policyHash", "type": "bytes32" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
];


const SEPOLIA_RPC_URL = 'https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161';


const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);


const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);


const contract = new ethers.Contract(
    process.env.POLICY_REGISTRY_ADDRESS,
    CONTRACT_ABI,
    signer
);

module.exports = {
    provider,
    signer,
    contract
};
