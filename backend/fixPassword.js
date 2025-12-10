require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

async function fixPassword() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('29octopber', salt);

        // Use the correct collection name 'user'
        const result = await mongoose.connection.db.collection('user').updateOne(
            { username: 'shaaf' },
            { $set: { password: hash } }
        );

        console.log('Password updated!', result);
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
}

fixPassword();