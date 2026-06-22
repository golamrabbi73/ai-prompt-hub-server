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
const reviewsCollection = client.db("promptariumDB").collection("reviews");
const bookmarksCollection = client.db("promptariumDB").collection("bookmarks");
const reportsCollection = client.db("promptariumDB").collection("reports");
const paymentsCollection = client.db("promptariumDB").collection("payments");

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

// PUT /prompts/:id — update a prompt
app.put("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const id = req.params.id;
    const updatedData = req.body;
    const query = { _id: new ObjectId(id) };
    const updateDoc = {
      $set: {
        ...updatedData,
        updatedAt: new Date(),
      },
    };
    const result = await promptsCollection.updateOne(query, updateDoc);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update prompt" });
  }
});

// DELETE /prompts/:id — delete a prompt
app.delete("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
    const result = await promptsCollection.deleteOne(query);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete prompt" });
  }
});

// POST /reviews — add a review
app.post("/reviews", async (req, res) => {
  try {
    const review = req.body;
    const newReview = {
      ...review,
      createdAt: new Date(),
    };
    const result = await reviewsCollection.insertOne(newReview);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to add review" });
  }
});

// GET /reviews/:promptId — get all reviews for a prompt
app.get("/reviews/:promptId", async (req, res) => {
  try {
    const promptId = req.params.promptId;
    const reviews = await reviewsCollection
      .find({ promptId })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch reviews" });
  }
});

// GET /reviews/user/:email — get all reviews by a user
app.get("/reviews/user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const reviews = await reviewsCollection
      .find({ reviewerEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch user reviews" });
  }
});

// DELETE /reviews/:id — delete a review
app.delete("/reviews/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const id = req.params.id;
    const result = await reviewsCollection.deleteOne({
      _id: new ObjectId(id),
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete review" });
  }
});

// POST /bookmarks — toggle bookmark (add if not exists, remove if exists)
app.post("/bookmarks", async (req, res) => {
  try {
    const { userEmail, promptId } = req.body;

    const existing = await bookmarksCollection.findOne({
      userEmail,
      promptId,
    });

    if (existing) {
      await bookmarksCollection.deleteOne({ userEmail, promptId });
      return res.send({ message: "bookmark removed", bookmarked: false });
    }

    const result = await bookmarksCollection.insertOne({
      userEmail,
      promptId,
      createdAt: new Date(),
    });
    res.send({ message: "bookmark added", bookmarked: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to toggle bookmark" });
  }
});

// GET /bookmarks/:email — get all bookmarks for a user
app.get("/bookmarks/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const bookmarks = await bookmarksCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookmarks);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch bookmarks" });
  }
});

// GET /bookmarks/check/:email/:promptId — check if a prompt is bookmarked
app.get("/bookmarks/check/:email/:promptId", async (req, res) => {
  try {
    const { email, promptId } = req.params;
    const existing = await bookmarksCollection.findOne({
      userEmail: email,
      promptId,
    });
    res.send({ bookmarked: !!existing });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to check bookmark" });
  }
});

// POST /reports — report a prompt
app.post("/reports", async (req, res) => {
  try {
    const report = req.body;
    const newReport = {
      ...report,
      status: "pending",
      createdAt: new Date(),
    };
    const result = await reportsCollection.insertOne(newReport);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to submit report" });
  }
});

// GET /reports — get all reports (admin only, protected later)
app.get("/reports", async (req, res) => {
  try {
    const reports = await reportsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(reports);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch reports" });
  }
});

// PATCH /reports/:id — update report status (dismiss/warn)
app.patch("/reports/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const id = req.params.id;
    const { status } = req.body;
    const result = await reportsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update report" });
  }
});

// POST /payments — save payment record after successful Stripe payment
app.post("/payments", async (req, res) => {
  try {
    const payment = req.body;
    const newPayment = {
      ...payment,
      createdAt: new Date(),
    };
    const result = await paymentsCollection.insertOne(newPayment);

    // Update user subscription to premium
    await usersCollection.updateOne(
      { email: payment.email },
      { $set: { subscription: "premium" } }
    );

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to save payment" });
  }
});

// GET /payments — get all payments (admin only, protected later)
app.get("/payments", async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(payments);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch payments" });
  }
});

// GET /payments/:email — get payments by user email
app.get("/payments/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const payments = await paymentsCollection
      .find({ email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(payments);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch payments" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});