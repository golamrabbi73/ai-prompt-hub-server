const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { connectDB } = require("./config/db");
const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
connectDB();
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});