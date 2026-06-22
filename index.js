require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Stripe = require("stripe");
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const jwt = require("jsonwebtoken");
const { client, connectDB } = require("./config/db");

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

connectDB();

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
  const token = jwt.sign(userInfo, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.send({ token });
});

// Users
app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const existingUser = await usersCollection.findOne({ email: user.email });
    if (existingUser) return res.send({ message: "user already exists", insertedId: null });
    const newUser = { ...user, role: "User", subscription: "free", createdAt: new Date() };
    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to create user" });
  }
});

// GET /users/top-creators — specific route before any /:param
app.get("/users/top-creators", async (req, res) => {
  try {
    const creators = await promptsCollection.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$creatorEmail", totalPrompts: { $sum: 1 }, totalCopies: { $sum: "$copyCount" } } },
      { $sort: { totalPrompts: -1 } },
      { $limit: 6 },
      { $lookup: { from: "users", localField: "_id", foreignField: "email", as: "userInfo" } },
      { $unwind: "$userInfo" },
      { $project: { email: "$_id", totalPrompts: 1, totalCopies: 1, name: "$userInfo.name", photoURL: "$userInfo.photoURL", role: "$userInfo.role" } },
    ]).toArray();
    res.send(creators);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch top creators" });
  }
});

// GET /users/:email — single user info
app.get("/users/:email", async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.params.email });
    if (!user) return res.status(404).send({ message: "user not found" });
    res.send(user);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch user" });
  }
});

// Prompts
app.post("/prompts", async (req, res) => {
  try {
    const prompt = req.body;
    const newPrompt = { ...prompt, copyCount: 0, status: "pending", createdAt: new Date() };
    const result = await promptsCollection.insertOne(newPrompt);
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to add prompt" });
  }
});

app.get("/prompts", async (req, res) => {
  try {
    const { search = "", category = "", aiTool = "", difficulty = "", sort = "latest", page = 1, limit = 9 } = req.query;
    const query = { status: "approved", visibility: "public" };
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
    let sortOption = {};
    if (sort === "latest") sortOption = { createdAt: -1 };
    if (sort === "mostCopied") sortOption = { copyCount: -1 };
    if (sort === "mostPopular") sortOption = { averageRating: -1 };
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    const total = await promptsCollection.countDocuments(query);
    const prompts = await promptsCollection.find(query).sort(sortOption).skip(skip).limit(limitNum).toArray();
    res.send({ prompts, total, page: pageNum, totalPages: Math.ceil(total / limitNum) });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompts" });
  }
});

// /prompts/:id/copy BEFORE /prompts/:id
app.patch("/prompts/:id/copy", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await promptsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $inc: { copyCount: 1 } }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update copy count" });
  }
});

// GET /prompts/user/:email — all prompts by a specific creator (any status)
app.get("/prompts/user/:email", async (req, res) => {
  try {
    const prompts = await promptsCollection
      .find({ creatorEmail: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(prompts);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch user prompts" });
  }
});

app.get("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const prompt = await promptsCollection.findOne({ _id: new ObjectId(req.params.id) });
    if (!prompt) return res.status(404).send({ message: "prompt not found" });
    res.send(prompt);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompt" });
  }
});

app.put("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await promptsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update prompt" });
  }
});

app.delete("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await promptsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete prompt" });
  }
});

// Reviews
app.post("/reviews", async (req, res) => {
  try {
    const result = await reviewsCollection.insertOne({ ...req.body, createdAt: new Date() });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to add review" });
  }
});

// /reviews/latest BEFORE /reviews/:promptId
app.get("/reviews/latest", async (req, res) => {
  try {
    const reviews = await reviewsCollection.find().sort({ createdAt: -1 }).limit(6).toArray();
    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch latest reviews" });
  }
});

// prompt title in user review
app.get("/reviews/user/:email", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const reviews = await reviewsCollection
      .find({ reviewerEmail: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();

    if (reviews.length === 0) return res.send([]);

    const promptIds = reviews
      .filter((r) => ObjectId.isValid(r.promptId))
      .map((r) => new ObjectId(r.promptId));

    const prompts = await promptsCollection
      .find({ _id: { $in: promptIds } })
      .toArray();

    const result = reviews.map((review) => {
      const prompt = prompts.find(
        (p) => p._id.toString() === review.promptId
      );
      return { ...review, promptTitle: prompt?.title || "Deleted Prompt" };
    });

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch user reviews" });
  }
});

app.get("/reviews/:promptId", async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find({ promptId: req.params.promptId })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch reviews" });
  }
});

app.delete("/reviews/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await reviewsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete review" });
  }
});

// Bookmarks
app.post("/bookmarks", async (req, res) => {
  try {
    const { userEmail, promptId } = req.body;
    const existing = await bookmarksCollection.findOne({ userEmail, promptId });
    if (existing) {
      await bookmarksCollection.deleteOne({ userEmail, promptId });
      return res.send({ message: "bookmark removed", bookmarked: false });
    }
    const result = await bookmarksCollection.insertOne({ userEmail, promptId, createdAt: new Date() });
    res.send({ message: "bookmark added", bookmarked: true, result });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to toggle bookmark" });
  }
});

// /bookmarks/check/:email/:promptId BEFORE /bookmarks/:email
app.get("/bookmarks/check/:email/:promptId", async (req, res) => {
  try {
    const { email, promptId } = req.params;
    const existing = await bookmarksCollection.findOne({ userEmail: email, promptId });
    res.send({ bookmarked: !!existing });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to check bookmark" });
  }
});

// GET /bookmarks/full/:email — bookmarked prompts with full prompt details
app.get("/bookmarks/full/:email", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const bookmarks = await bookmarksCollection
      .find({ userEmail: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();

    if (bookmarks.length === 0) return res.send([]);

    const promptIds = bookmarks.map((b) => new ObjectId(b.promptId));
    const prompts = await promptsCollection
      .find({ _id: { $in: promptIds } })
      .toArray();

    // attach bookmarkedAt to each prompt, preserving bookmark order
    const result = bookmarks
      .map((b) => {
        const prompt = prompts.find((p) => p._id.toString() === b.promptId);
        return prompt ? { ...prompt, bookmarkedAt: b.createdAt } : null;
      })
      .filter(Boolean);

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch saved prompts" });
  }
});

app.get("/bookmarks/:email", async (req, res) => {
  try {
    const bookmarks = await bookmarksCollection
      .find({ userEmail: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookmarks);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch bookmarks" });
  }
});

// Reports
app.post("/reports", async (req, res) => {
  try {
    const result = await reportsCollection.insertOne({ ...req.body, status: "pending", createdAt: new Date() });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to submit report" });
  }
});

app.get("/reports", async (req, res) => {
  try {
    const reports = await reportsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(reports);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch reports" });
  }
});

app.patch("/reports/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await reportsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: req.body.status, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update report" });
  }
});

// POST /create-payment-intent
app.post("/create-payment-intent", async (req, res) => {
  try {
    const { price } = req.body;
    const amount = Math.round(price * 100); // dollars to cents

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "usd",
      payment_method_types: ["card"],
    });

    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Payment intent creation failed" });
  }
});

// Payments
app.post("/payments", async (req, res) => {
  try {
    const result = await paymentsCollection.insertOne({ ...req.body, createdAt: new Date() });
    await usersCollection.updateOne({ email: req.body.email }, { $set: { subscription: "premium" } });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to save payment" });
  }
});

app.get("/payments", async (req, res) => {
  try {
    const payments = await paymentsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(payments);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch payments" });
  }
});

app.get("/payments/:email", async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find({ email: req.params.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(payments);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch payments" });
  }
});

// GET /creator/stats/:email
app.get("/creator/stats/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const prompts = await promptsCollection
      .find({ creatorEmail: email })
      .toArray();

    const totalPrompts = prompts.length;
    const approvedPrompts = prompts.filter(
      (p) => p.status === "approved"
    ).length;
    const totalCopies = prompts.reduce(
      (sum, p) => sum + (p.copyCount || 0), 0
    );

    const reviews = await reviewsCollection
      .find({
        promptId: { $in: prompts.map((p) => p._id.toString()) },
      })
      .toArray();

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    res.send({ totalPrompts, approvedPrompts, totalCopies, avgRating });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch creator stats" });
  }
});

// Analytics
app.get("/analytics/stats", async (req, res) => {
  try {
    const [totalPrompts, totalUsers, totalReviews, copiesResult] = await Promise.all([
      promptsCollection.countDocuments({ status: "approved" }),
      usersCollection.countDocuments(),
      reviewsCollection.countDocuments(),
      promptsCollection.aggregate([{ $group: { _id: null, total: { $sum: "$copyCount" } } }]).toArray(),
    ]);
    res.send({ totalPrompts, totalUsers, totalReviews, totalCopies: copiesResult[0]?.total || 0 });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch stats" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});