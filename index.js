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

// GET /prompts — search + filter + sort + pagination (server-side)
app.get("/prompts", async (req, res) => {
  try {
    const {
      search = "",
      category = "",
      aiTool = "",
      difficulty = "",
      sort = "latest",
      page = 1,
      limit = 9,
    } = req.query;

    // Build filter query
    const query = {
      status: "approved",
      visibility: "public",
    };

    // Search by title, tags, or aiTool
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { aiTool: { $regex: search, $options: "i" } },
      ];
    }

    if (category) query.category = category;
    if (aiTool) query.aiTool = aiTool;
    if (difficulty) query.difficulty = difficulty;

    // Sort
    let sortOption = {};
    if (sort === "latest") sortOption = { createdAt: -1 };
    if (sort === "mostCopied") sortOption = { copyCount: -1 };
    if (sort === "mostPopular") sortOption = { averageRating: -1 };

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const total = await promptsCollection.countDocuments(query);
    const prompts = await promptsCollection
      .find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .toArray();

    res.send({
      prompts,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompts" });
  }
});

// GET /prompts/:id — fetch a single prompt by id
app.get("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const prompt = await promptsCollection.findOne(query);
    if (!prompt) {
      return res.status(404).send({ message: "prompt not found" });
    }
    res.send(prompt);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompt" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});