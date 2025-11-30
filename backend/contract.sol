// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PolicyRegistry {
    struct Policy {
        string name;
        uint256 createdAt;
        bytes32 policyHash;
    }

   
    mapping(string => Policy) public policies;

    
    string[] public policyNames;

    
    function addPolicy(string calldata name, bytes32 policyHash) external {
        require(bytes(name).length > 0, "empty name");
        require(policies[name].createdAt == 0, "already exists");

        policies[name] = Policy({
            name: name,
            createdAt: block.timestamp,
            policyHash: policyHash
        });

        policyNames.push(name);
    }

    
    function updatePolicyHash(string calldata name, bytes32 newHash) external {
        require(policies[name].createdAt != 0, "not found");

        policies[name].policyHash = newHash;
    }

    
    function getAllPolicies() external view returns (Policy[] memory) {
        Policy[] memory list = new Policy[](policyNames.length);

        for (uint256 i = 0; i < policyNames.length; i++) {
            list[i] = policies[policyNames[i]];
        }

        return list;
    }
}

