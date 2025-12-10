require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB Atlas');
        migrateUsers();
    })
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

async function migrateUsers() {
    try {
        const db = mongoose.connection.db;
        const usersCollection = db.collection('user');

        // Step 1: Drop the old username index
        try {
            await usersCollection.dropIndex('username_1');
            console.log('✅ Dropped old username index');
        } catch (err) {
            console.log('⚠️  Username index might not exist or already dropped');
        }

        // Get all users
        const users = await usersCollection.find({}).toArray();
        console.log(`Found ${users.length} users to migrate`);

        for (const user of users) {
            const updates = {};
            const unsets = {};
            let needsUpdate = false;

            // Rename username to email if it exists
            if (user.username && !user.email) {
                updates.email = user.username;
                unsets.username = "";
                needsUpdate = true;
                console.log(`Renaming username to email for: ${user.username}`);
            }

            // Hash password if it's not already hashed (check if it's very short or doesn't start with $2b$)
            if (user.password && !user.password.startsWith('$2b$')) {
                const salt = await bcrypt.genSalt(10);
                updates.password = await bcrypt.hash(user.password, salt);
                needsUpdate = true;
                console.log(`Hashing password for: ${user.username || user.email}`);
            }

            // Apply updates
            if (needsUpdate) {
                const updateQuery = Object.keys(unsets).length > 0
                    ? { $set: updates, $unset: unsets }
                    : { $set: updates };

                await usersCollection.updateOne(
                    { _id: user._id },
                    updateQuery
                );
                console.log(`✅ Updated user: ${user.username || user.email}`);
            }
        }

        // Step 2: Create unique index on email
        try {
            await usersCollection.createIndex({ email: 1 }, { unique: true });
            console.log('✅ Created unique index on email field');
        } catch (err) {
            console.log('⚠️  Email index might already exist');
        }

        console.log('\n✅ Migration completed successfully!');
        console.log('You can now login with your email addresses.');

        // Display updated users
        const updatedUsers = await usersCollection.find({}).toArray();
        console.log('\nUpdated users:');
        updatedUsers.forEach(u => {
            console.log(`- Email: ${u.email}, Role: ${u.role}`);
        });
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Database connection closed');
        process.exit(0);
    }
}
