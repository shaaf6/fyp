require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        hashPasswords();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

async function hashPasswords() {
    try {
        const db = mongoose.connection.db;
        const usersCollection = db.collection('user');

        // Get all users with unhashed passwords
        const users = await usersCollection.find({}).toArray();
        console.log(`Found ${users.length} users`);

        for (const user of users) {
            // Check if password needs hashing (doesn't start with $2b$ or $2a$)
            if (user.password && !user.password.startsWith('$2')) {
                console.log(`\nHashing password for: ${user.email}`);
                console.log(`Current password: ${user.password}`);

                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(user.password, salt);

                await usersCollection.updateOne(
                    { _id: user._id },
                    { $set: { password: hashedPassword } }
                );

                console.log(`✅ Password hashed for ${user.email}`);
            } else {
                console.log(`⏭️  Password already hashed for ${user.email}`);
            }
        }

        console.log('\n✅ All passwords hashed!');
        console.log('\nFinal user list:');

        const finalUsers = await usersCollection.find({}).toArray();
        finalUsers.forEach(u => {
            console.log(`- Email: ${u.email}`);
            console.log(`  Role: ${u.role}`);
            console.log(`  Password starts with: ${u.password.substring(0, 10)}...`);
        });

    } catch (err) {
        console.error('❌ Error:', err);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}
