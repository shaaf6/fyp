require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        resetPasswords();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

async function resetPasswords() {
    try {
        const db = mongoose.connection.db;
        const usersCollection = db.collection('user');

        const newPassword = '1'; // Set all passwords to "1"
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        console.log(`\nSetting password "${newPassword}" for all users...`);
        console.log(`Hashed: ${hashedPassword}\n`);

        // Update all users
        const users = await usersCollection.find({}).toArray();

        for (const user of users) {
            await usersCollection.updateOne(
                { _id: user._id },
                { $set: { password: hashedPassword } }
            );
            console.log(`✅ Updated password for ${user.email}`);
        }

        console.log('\n✅ All passwords set to "1"');
        console.log('\nYou can now login with:');

        const finalUsers = await usersCollection.find({}).toArray();
        finalUsers.forEach(u => {
            console.log(`- Email: ${u.email}, Password: 1, Role: ${u.role}`);
        });

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}
