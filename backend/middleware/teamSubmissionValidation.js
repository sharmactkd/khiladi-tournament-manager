// FILE: backend/middleware/teamSubmissionValidation.js

const MAX_PLAYERS_PER_SUBMISSION = 300;

const allowedPlayerKeys = new Set([
  "_id",
  "id",
  "entryId",
  "sourcePlayerId",
  "title",
  "name",
  "fathersName",
  "school",
  "schoolName",
  "class",
  "team",
  "coach",
  "coachContact",
  "manager",
  "managerContact",
  "gender",
  "dob",
  "weight",
  "event",
  "subEvent",
  "ageCategory",
  "weightCategory",
  "medal",
]);

const allowedGender = new Set(["", "m", "male", "boy", "boys", "f", "female", "girl", "girls"]);
const allowedMedal = new Set(["", "g", "gold", "s", "silver", "b", "bronze"]);
const allowedEvent = new Set(["", "kyorugi", "poomsae", "freshers"]);

const cleanString = (value) => String(value ?? "").trim();

const isValidDateLike = (value) => {
  if (!value) return true;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
};

const validateLength = (value, max) => cleanString(value).length <= max;

export const validateTeamSubmissionPayload = (req, res, next) => {
  const { teamName, players } = req.body || {};

  if (!validateLength(teamName, 80) || !cleanString(teamName)) {
    return res.status(400).json({ message: "Team name is required and must be under 80 characters" });
  }

  if (!Array.isArray(players)) {
    return res.status(400).json({ message: "players must be an array" });
  }

  if (players.length < 1) {
    return res.status(400).json({ message: "At least one player is required" });
  }

  if (players.length > MAX_PLAYERS_PER_SUBMISSION) {
    return res.status(400).json({
      message: `Maximum ${MAX_PLAYERS_PER_SUBMISSION} players allowed per submission`,
    });
  }

  for (let i = 0; i < players.length; i += 1) {
    const player = players[i];

    if (!player || typeof player !== "object" || Array.isArray(player)) {
      return res.status(400).json({ message: `Invalid player at row ${i + 1}` });
    }

    const unknownKeys = Object.keys(player).filter((key) => !allowedPlayerKeys.has(key));
    if (unknownKeys.length > 0) {
      return res.status(400).json({
        message: `Unknown fields found in player row ${i + 1}: ${unknownKeys.join(", ")}`,
      });
    }

    if (!validateLength(player.name, 80)) {
      return res.status(400).json({ message: `Player name too long at row ${i + 1}` });
    }

    if (!validateLength(player.team, 80)) {
      return res.status(400).json({ message: `Team name too long at row ${i + 1}` });
    }

    if (!validateLength(player.fathersName, 80)) {
      return res.status(400).json({ message: `Father's name too long at row ${i + 1}` });
    }

    if (!validateLength(player.school ?? player.schoolName, 120)) {
      return res.status(400).json({ message: `School name too long at row ${i + 1}` });
    }

    if (!validateLength(player.class, 30)) {
      return res.status(400).json({ message: `Class value too long at row ${i + 1}` });
    }

    if (!validateLength(player.coach, 80) || !validateLength(player.manager, 80)) {
      return res.status(400).json({ message: `Coach/manager name too long at row ${i + 1}` });
    }

    if (!validateLength(player.coachContact, 20) || !validateLength(player.managerContact, 20)) {
      return res.status(400).json({ message: `Contact value too long at row ${i + 1}` });
    }

    if (!validateLength(player.ageCategory, 50) || !validateLength(player.weightCategory, 50)) {
      return res.status(400).json({ message: `Category value too long at row ${i + 1}` });
    }

    const gender = cleanString(player.gender).toLowerCase();
    if (!allowedGender.has(gender)) {
      return res.status(400).json({ message: `Invalid gender at row ${i + 1}` });
    }

    const medal = cleanString(player.medal).toLowerCase();
    if (!allowedMedal.has(medal)) {
      return res.status(400).json({ message: `Invalid medal at row ${i + 1}` });
    }

    const event = cleanString(player.event).toLowerCase();
    if (!allowedEvent.has(event)) {
      return res.status(400).json({ message: `Invalid event at row ${i + 1}` });
    }

    if (!isValidDateLike(player.dob)) {
      return res.status(400).json({ message: `Invalid DOB at row ${i + 1}` });
    }

    if (player.weight !== undefined && player.weight !== null && player.weight !== "") {
      const weight = Number(String(player.weight).replace(/[^\d.]/g, ""));
      if (!Number.isFinite(weight) || weight < 0 || weight > 300) {
        return res.status(400).json({ message: `Invalid weight at row ${i + 1}` });
      }
    }
  }

  next();
};