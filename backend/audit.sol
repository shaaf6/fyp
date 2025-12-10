
pragma solidity ^0.8.19;

contract PolicyAudit {
    struct AuditEntry {
        string policyName;
        string userEmail;
        uint256 timestamp;
    }

   
    mapping(string => AuditEntry[]) private audits;

   
    event PolicyChanged(
        string indexed policyName,
        string userEmail,
        uint256 timestamp
    );


    function recordChange(string calldata policyName, string calldata userEmail) external {
        audits[policyName].push(AuditEntry({
            policyName: policyName,
            userEmail: userEmail,
            timestamp: block.timestamp
        }));

        emit PolicyChanged(policyName, userEmail, block.timestamp);
    }

    
    function getAuditCount(string calldata policyName) external view returns (uint256) {
        return audits[policyName].length;
    }

  
    function getAuditEntry(string calldata policyName, uint256 index) external view returns (
        string memory policyNameOut,
        string memory userEmail,
        uint256 timestamp
    ) {
        require(index < audits[policyName].length, "index out of bounds");
        AuditEntry storage entry = audits[policyName][index];
        return (entry.policyName, entry.userEmail, entry.timestamp);
    }
}
