require('dotenv').config();
const axios = require('axios');

async function testAPI() {
    try {
        console.log('Testing policies endpoint...\n');

        // Wait a bit for server to be ready
        await new Promise(resolve => setTimeout(resolve, 1000));

        const response = await axios.get('http://localhost:3000/api/sysadmin/policies');

        console.log(`✅ Status: ${response.status}`);
        console.log(`✅ Found ${response.data.length} policies\n`);

        if (response.data.length > 0) {
            response.data.forEach((policy, index) => {
                console.log(`${index + 1}. ${policy.name}`);
                console.log(`   Alert: ${policy.alert}`);
                console.log(`   Description: ${policy.description.substring(0, 100)}...`);
                console.log('');
            });
        } else {
            console.log('⚠️  No policies returned from API');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.response?.data || err.message);
        process.exit(1);
    }
}

testAPI();