// index.js
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

const usersCollection = client.db("promptariumDB").collection("users");

app.get("/", (req, res) => {
  res.send("Prompt marketplace server is running 🚀");
});

// Issue a JWT for a logged-in Firebase user.
app.post("/jwt", (req, res) => {
  const userInfo = req.body; // { email }
  const token = jwt.sign(userInfo, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.send({ token });
});

// Create a new user document. Default role is always "User" —
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});