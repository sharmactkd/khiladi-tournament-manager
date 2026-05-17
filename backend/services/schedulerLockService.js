import os from "os";
import SchedulerLock from "../models/schedulerLock.js";

const INSTANCE_ID = `${os.hostname()}_${process.pid}`;

export const acquireSchedulerLock = async ({
  key,
  ttlMs = 5 * 60 * 1000,
  metadata = {},
}) => {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  const lock = await SchedulerLock.findOneAndUpdate(
    {
      key,
      $or: [{ lockedUntil: { $lte: now } }, { lockedUntil: { $exists: false } }],
    },
    {
      $set: {
        lockedUntil,
        lockedBy: INSTANCE_ID,
        metadata,
      },
    },
    {
      new: true,
      upsert: true,
    }
  );

  return lock?.lockedBy === INSTANCE_ID;
};

export const releaseSchedulerLock = async ({ key }) => {
  await SchedulerLock.updateOne(
    {
      key,
      lockedBy: INSTANCE_ID,
    },
    {
      $set: {
        lockedUntil: new Date(0),
      },
    }
  );
};