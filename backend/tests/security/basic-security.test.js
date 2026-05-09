import request from "supertest";
import express from "express";

describe("Basic security checks", () => {
  test("test runner works", async () => {
    const app = express();

    app.get("/health", (req, res) => {
      res.status(200).json({ status: "OK" });
    });

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("OK");
  });
});