const axios = require('axios');

async function testUpdate() {
    try {
        console.log('🧪 Testing policy update...');

        const response = await axios.put(
            'http://localhost:3000/api/sysadmin/policies/692c0b97af880f8dfdde1eb1',
            { description: 'BLOCKCHAIN TEST FROM SCRIPT' },
            { headers: { 'Content-Type': 'application/json' } }
        );

        console.log('✅ Update successful:');
        console.log(JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.error('❌ Update failed:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testUpdate();
