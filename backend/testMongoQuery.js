require('dotenv').config();
const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    name: String,
    description: String,
    alert: Number,
    createdAt: Date
}, { collection: 'policy' });

const Policy = mongoose.model('Policy', policySchema);

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        testQuery();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

async function testQuery() {
    try {
        console.log('\n1. Testing with $or and regex:');
        const policies1 = await Policy.find({
            $or: [
                { name: /^kyc$/i },
                { name: /^aml$/i }
            ]
        });
        console.log(`   Found ${policies1.length} policies`);
        policies1.forEach(p => console.log(`   - ${p.name}`));

        console.log('\n2. Testing with exact lowercase match:');
        const policies2 = await Policy.find({
            name: { $in: ['kyc', 'aml'] }
        });
        console.log(`   Found ${policies2.length} policies`);
        policies2.forEach(p => console.log(`   - ${p.name}`));

        console.log('\n3. Testing all policies:');
        const allPolicies = await Policy.find({});
        console.log(`   Found ${allPolicies.length} total policies`);
        allPolicies.forEach(p => console.log(`   - ${p.name}`));

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}
