require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        checkPolicies();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

async function checkPolicies() {
    try {
        const db = mongoose.connection.db;
        const policiesCollection = db.collection('policy');

        const policies = await policiesCollection.find({}).toArray();

        console.log(`\nFound ${policies.length} policies in database:\n`);

        if (policies.length === 0) {
            console.log('⚠️  No policies found in the database!');
            console.log('You need to create KYC and AML policies first.');
        } else {
            policies.forEach((policy, index) => {
                console.log(`${index + 1}. Policy Name: "${policy.name}"`);
                console.log(`   Description: ${policy.description?.substring(0, 100)}...`);
                console.log(`   Alert: ${policy.alert || 0}`);
                console.log(`   Created: ${policy.createdAt}`);
                console.log('');
            });
        }

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.connection.close();
        console.log('🔌 Database connection closed');
        process.exit(0);
    }
}
