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

// ── Middlewares ───────────────────────────────────────────────────────────────

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).send({ message: "unauthorized access" });
    req.decoded = decoded;
    next();
  });
};

const verifyAdmin = async (req, res, next) => {
  try {
    const email = req.decoded?.email;
    const user = await usersCollection.findOne({ email });
    if (user?.role !== "Admin") {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  } catch (error) {
    res.status(500).send({ message: "failed to verify admin" });
  }
};

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Prompt marketplace server is running 🚀");
});

// ── JWT ───────────────────────────────────────────────────────────────────────
app.post("/jwt", (req, res) => {
  const userInfo = req.body;
  const token = jwt.sign(userInfo, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.send({ token });
});

// ── Users ─────────────────────────────────────────────────────────────────────

app.post("/users", async (req, res) => {
  try {
    const user = req.body;
    const existingUser = await usersCollection.findOne({ email: user.email });
    if (existingUser)
      return res.send({ message: "user already exists", insertedId: null });
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

app.get("/users/top-creators", async (req, res) => {
  try {
    const creators = await promptsCollection
      .aggregate([
        { $match: { status: "approved" } },
        {
          $group: {
            _id: "$creatorEmail",
            totalPrompts: { $sum: 1 },
            totalCopies: { $sum: "$copyCount" },
          },
        },
        { $sort: { totalPrompts: -1 } },
        { $limit: 6 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "email",
            as: "userInfo",
          },
        },
        { $unwind: "$userInfo" },
        {
          $project: {
            email: "$_id",
            totalPrompts: 1,
            totalCopies: 1,
            name: "$userInfo.name",
            photoURL: "$userInfo.photoURL",
            role: "$userInfo.role",
          },
        },
      ])
      .toArray();
    res.send(creators);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch top creators" });
  }
});

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const users = await usersCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(users);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch users" });
  }
});

app.get("/users/:email", verifyToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.params.email });
    if (!user) return res.status(404).send({ message: "user not found" });
    res.send(user);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch user" });
  }
});

app.patch("/users/:email/role", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const result = await usersCollection.updateOne(
      { email: req.params.email },
      { $set: { role, updatedAt: new Date() } }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update user role" });
  }
});

app.delete("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await usersCollection.deleteOne({
      email: req.params.email,
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete user" });
  }
});

// ── Prompts ───────────────────────────────────────────────────────────────────

app.post("/prompts", verifyToken, async (req, res) => {
  try {
    const prompt = req.body;
    const user = await usersCollection.findOne({ email: prompt.creatorEmail });
    if (user?.subscription !== "premium" && user?.role === "User") {
      const count = await promptsCollection.countDocuments({
        creatorEmail: prompt.creatorEmail,
      });
      if (count >= 3) {
        return res.status(403).send({
          message: "Free users can only add 3 prompts. Upgrade to Premium.",
        });
      }
    }
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

app.get("/prompts/featured", async (req, res) => {
  try {
    const prompts = await promptsCollection
      .find({ status: "approved", visibility: "public" })
      .sort({ copyCount: -1 })
      .limit(6)
      .toArray();
    res.send(prompts);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch featured prompts" });
  }
});

// ✅ FIX 1: visibility filter সরানো হয়েছে — public + private দুটোই দেখাবে
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

    const query = { status: "approved" };

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

app.get("/prompts/admin/all", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const prompts = await promptsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(prompts);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch all prompts" });
  }
});

app.delete("/prompts/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await promptsCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete prompt" });
  }
});

app.get("/prompts/user/:email", verifyToken, async (req, res) => {
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

app.patch("/prompts/:id/copy", verifyToken, async (req, res) => {
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

app.patch("/prompts/:id/status", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const { status, feedback } = req.body;
    const result = await promptsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      {
        $set: {
          status,
          ...(feedback && { rejectionFeedback: feedback }),
          updatedAt: new Date(),
        },
      }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to update prompt status" });
  }
});

app.get("/prompts/:id/analytics", verifyToken, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const prompt = await promptsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!prompt) return res.status(404).send({ message: "prompt not found" });

    const [bookmarkCount, reviewCount, reviews] = await Promise.all([
      bookmarksCollection.countDocuments({ promptId: req.params.id }),
      reviewsCollection.countDocuments({ promptId: req.params.id }),
      reviewsCollection.find({ promptId: req.params.id }).toArray(),
    ]);

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    res.send({
      title: prompt.title,
      copyCount: prompt.copyCount || 0,
      bookmarkCount,
      reviewCount,
      avgRating,
      status: prompt.status,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompt analytics" });
  }
});

app.get("/prompts/:id", async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const prompt = await promptsCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!prompt) return res.status(404).send({ message: "prompt not found" });
    res.send(prompt);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch prompt" });
  }
});

app.put("/prompts/:id", verifyToken, async (req, res) => {
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

app.delete("/prompts/:id", verifyToken, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await promptsCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete prompt" });
  }
});

// ── Reviews ───────────────────────────────────────────────────────────────────

app.post("/reviews", verifyToken, async (req, res) => {
  try {
    const result = await reviewsCollection.insertOne({
      ...req.body,
      createdAt: new Date(),
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to add review" });
  }
});

app.get("/reviews/latest", async (req, res) => {
  try {
    const reviews = await reviewsCollection
      .find()
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(reviews);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch latest reviews" });
  }
});

app.get("/reviews/user/:email", verifyToken, async (req, res) => {
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

app.delete("/reviews/:id", verifyToken, async (req, res) => {
  try {
    const { ObjectId } = require("mongodb");
    const result = await reviewsCollection.deleteOne({
      _id: new ObjectId(req.params.id),
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to delete review" });
  }
});

// ── Bookmarks ─────────────────────────────────────────────────────────────────

app.post("/bookmarks", verifyToken, async (req, res) => {
  try {
    const { userEmail, promptId } = req.body;
    const existing = await bookmarksCollection.findOne({ userEmail, promptId });
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

app.get("/bookmarks/check/:email/:promptId", verifyToken, async (req, res) => {
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

app.get("/bookmarks/full/:email", verifyToken, async (req, res) => {
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

app.get("/bookmarks/:email", verifyToken, async (req, res) => {
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

// ── Reports ───────────────────────────────────────────────────────────────────

app.post("/reports", verifyToken, async (req, res) => {
  try {
    const result = await reportsCollection.insertOne({
      ...req.body,
      status: "pending",
      createdAt: new Date(),
    });
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to submit report" });
  }
});

app.get("/reports", verifyToken, verifyAdmin, async (req, res) => {
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

app.patch("/reports/:id", verifyToken, verifyAdmin, async (req, res) => {
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

// ── Payments ──────────────────────────────────────────────────────────────────

app.post("/create-payment-intent", async (req, res) => {
  try {
    const { price } = req.body;
    const amount = Math.round(price * 100);
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

app.post("/payments", verifyToken, async (req, res) => {
  try {
    const result = await paymentsCollection.insertOne({
      ...req.body,
      createdAt: new Date(),
    });
    await usersCollection.updateOne(
      { email: req.body.email },
      { $set: { subscription: "premium" } }
    );
    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to save payment" });
  }
});

app.get("/payments", verifyToken, verifyAdmin, async (req, res) => {
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

app.get("/payments/:email", verifyToken, async (req, res) => {
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

// ── Analytics ─────────────────────────────────────────────────────────────────

app.get("/analytics/stats", async (req, res) => {
  try {
    const [totalPrompts, totalUsers, totalReviews, copiesResult] =
      await Promise.all([
        promptsCollection.countDocuments({ status: "approved" }),
        usersCollection.countDocuments(),
        reviewsCollection.countDocuments(),
        promptsCollection
          .aggregate([
            { $group: { _id: null, total: { $sum: "$copyCount" } } },
          ])
          .toArray(),
      ]);
    res.send({
      totalPrompts,
      totalUsers,
      totalReviews,
      totalCopies: copiesResult[0]?.total || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch stats" });
  }
});

app.get("/creator/stats/:email", verifyToken, async (req, res) => {
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
      (sum, p) => sum + (p.copyCount || 0),
      0
    );
    const totalBookmarks = await bookmarksCollection.countDocuments({
      promptId: { $in: prompts.map((p) => p._id.toString()) },
    });
    const reviews = await reviewsCollection
      .find({
        promptId: { $in: prompts.map((p) => p._id.toString()) },
      })
      .toArray();
    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;
    res.send({
      totalPrompts,
      approvedPrompts,
      totalCopies,
      totalBookmarks,
      avgRating,
      promptsData: prompts.map((p) => ({
        title: p.title,
        copyCount: p.copyCount || 0,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to fetch creator stats" });
  }
});

// ✅ FIX 2: totalReviews আর totalCopies যোগ হয়েছে
app.get("/analytics/admin", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const [
      totalUsers,
      totalPrompts,
      pendingPrompts,
      totalReports,
      paymentsAgg,
      promptsByCategory,
      promptsByStatus,
      topAiTools,
      totalReviews,
      copiesAgg,
    ] = await Promise.all([
      usersCollection.countDocuments(),
      promptsCollection.countDocuments(),
      promptsCollection.countDocuments({ status: "pending" }),
      reportsCollection.countDocuments({ status: "pending" }),
      paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: "$amount" },
              totalPayments: { $sum: 1 },
            },
          },
        ])
        .toArray(),
      promptsCollection
        .aggregate([
          { $match: { status: "approved" } },
          { $group: { _id: "$category", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      promptsCollection
        .aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ])
        .toArray(),
      promptsCollection
        .aggregate([
          { $match: { status: "approved" } },
          { $group: { _id: "$aiTool", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 5 },
        ])
        .toArray(),
      reviewsCollection.countDocuments(),
      promptsCollection
        .aggregate([
          { $group: { _id: null, total: { $sum: "$copyCount" } } },
        ])
        .toArray(),
    ]);

    res.send({
      totalUsers,
      totalPrompts,
      pendingPrompts,
      totalReports,
      totalRevenue: paymentsAgg[0]?.totalRevenue || 0,
      totalPayments: paymentsAgg[0]?.totalPayments || 0,
      promptsByCategory,
      promptsByStatus,
      topAiTools,
      totalReviews,
      totalCopies: copiesAgg[0]?.total || 0,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "failed to fetch admin analytics" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});