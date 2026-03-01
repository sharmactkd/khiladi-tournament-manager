import mongoose from "mongoose";

const visitorSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // e.g. "global"
    count: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.Visitor || mongoose.model("Visitor", visitorSchema);