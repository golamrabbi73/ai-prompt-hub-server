const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { client, connectDB } = require("./config/db");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

connectDB();

// Collections
const usersCollection = client.db("promptariumDB").collection("users");
const promptsCollection = client.db("promptariumDB").collection("prompts");

// Health check
app.get("/", (req, res) => {
  res.send("Prompt marketplace server is running 🚀");
});

// JWT
app.post("/jwt", (req, res) => {
  const userInfo = req.body;
  const token = jwt.sign(userInfo, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.send({ token });
});

// Users
app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const existingUser = await usersCollection.findOne({ email: user.email });
    if (existingUser) {
      return res.send({ message: "user already exists", insertedId: null });
    }
    const newUser = {
      ...user,
      role: "User",
      subscription: "free",
      createdAt: new Date(),
    };
    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to create user" });
  }
});

// Prompts

// POST /prompts route — add a new prompt
app.post("/prompts", async (req, res) => {
  try {
    const prompt = req.body;
    const newPrompt = {
      ...prompt,
      copyCount: 0,
      status: "pending",
      createdAt: new Date(),
    };
    const result = await promptsCollection.insertOne(newPrompt);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to add prompt" });
  }
});

// GET /prompts — fetch all approved public prompts (basic, no filter yet)
app.get("/prompts", async (req, res) => {
  try {
    const prompts = await promptsCollection
      .find({ status: "approved", visibility: "public" })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(prompts);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompts" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});