// backend/migrateDates.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import Tournament from "./models/tournament.js";

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected successfully.");
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    process.exit(1);
  }
};

const migrateDates = async () => {
  await connectDB();

  const DRY_RUN = process.env.DRY_RUN === "true"; // Set DRY_RUN=true to test without changing
  console.log(DRY_RUN ? "DRY RUN MODE: No changes will be made" : "LIVE MODE: Changes will be applied");

  try {
    // Find tournaments where:
    // - Old 'date' field exists
    // - AND (dateFrom missing OR dateTo missing)
    const filter = {
      date: { $exists: true, $ne: null },
      $or: [
        { dateFrom: { $exists: false } },
        { dateTo: { $exists: false } },
        { dateFrom: null },
        { dateTo: null },
      ],
    };

    const tournaments = await Tournament.find(filter).select("tournamentName date dateFrom dateTo");

    if (tournaments.length === 0) {
      console.log("No tournaments need migration. Already up to date!");
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log(`Found ${tournaments.length} tournaments needing migration:\n`);

    for (const tournament of tournaments) {
      const oldDate = tournament.date;
      const newDateFrom = tournament.dateFrom || oldDate;
      const newDateTo = tournament.dateTo || oldDate;

      console.log(`Tournament: ${tournament.tournamentName || tournament._id}`);
      console.log(`   Old date: ${oldDate}`);
      console.log(`   → dateFrom: ${tournament.dateFrom ? "exists" : "missing"} → ${newDateFrom}`);
      console.log(`   → dateTo:   ${tournament.dateTo ? "exists" : "missing"} → ${newDateTo}`);

      if (!DRY_RUN) {
        await Tournament.updateOne(
          { _id: tournament._id },
          {
            $set: {
              dateFrom: newDateFrom,
              dateTo: newDateTo,
            },
            $unset: { date: "" }, // Remove old field
          }
        );
        console.log("   Updated & old 'date' field removed\n");
      } else {
        console.log("   (Skipped in dry-run mode)\n");
      }
    }

    console.log(DRY_RUN 
      ? "Dry run complete. No changes made." 
      : "Migration completed successfully! Old 'date' fields removed."
    );

    await mongoose.disconnect();
    console.log("MongoDB disconnected.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
};

// Run the migration
migrateDates();