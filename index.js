// ================ IMPORTS & CONFIGURATION ================
const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

// Middleware
app.use(cors({
  origin: [
    "http://localhost:5173",   // dev local
    "http://127.0.0.1:5173",   // alt local
    "https://the-last-dance-1227f.web.app", // deployed frontend
  ],
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

// MongoDB Atlas connection URI
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@my-user.d2otqer.mongodb.net/?retryWrites=true&w=majority&appName=my-user`;


// Stripe payment integration
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// MongoDB Client Configuration
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ================ DATABASE OPERATIONS ================
async function run() {
  try {
    // Connect to MongoDB
    // await client.connect();

    // ===== DATABASE COLLECTIONS =====
    const db = client.db('Study-DB');
    const userCollections = db.collection('users');
    const sessionCollections = db.collection('sessions');
    const materialsCollections = db.collection('materials');
    const bookedSessionsCollections = db.collection('booked-sessions');
    const reviewCollections = db.collection('reviews');
    const studentsCreateNotesCollections = db.collection('create-note');
    const paymentCollections = db.collection('payments');


    // ================ API ROUTES ================

    // server.js or jwtRoutes.js

    app.post('/jwt', async (req, res) => {
      const { email } = req.body;
      try {
        const user = await userCollections.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: 'User not found' });
        }

        const token = jwt.sign(
          {
            email: user.email,
            role: user.role
          },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: '7d' }
        );
        res.cookie('token', token, {
          httpOnly: true,
          secure: true,
          sameSite: 'none'
        });

        res.send({ success: true });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Add this to your backend routes
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = await userCollections.findOne({ email });
      res.send(!!user);
    });

    const verifyToken = async (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }

      try {
        // Verify token
        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        // Get user from database
        const user = await userCollections.findOne({ email: decoded.email });
        if (!user) {
          return res.status(401).send({ message: 'User not found' });
        }

        // Attach user to request
        req.user = user;
        next();
      } catch (err) {
        return res.status(401).send({ message: 'Invalid or expired token' });
      }
    };

    // Role verification middlewares
    const verifyAdmin = (req, res, next) => {
      if (req.user?.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden: Admin access required' });
      }
      next();
    };

    const verifyTutor = (req, res, next) => {
      if (req.user?.role !== 'tutor') {
        return res.status(403).send({ message: 'Forbidden: Tutor access required' });
      }
      next();
    };

    const verifyStudent = (req, res, next) => {
      if (req.user?.role !== 'student') {
        return res.status(403).send({ message: 'Forbidden: Student access required' });
      }
      next();
    };


    // server.js / routes/authRoutes.js
    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: false,
        sameSite: 'strict'
      });
      res.send({ message: 'Logged out successfully' });
    });


    // ################ USER RELATED APIs ################
    // ----- User Registration -----
    app.post('/users', async (req, res) => {
      const email = req.body.email;
      const existingUser = await userCollections.findOne({ email });
      if (existingUser) {
        return res.status(200).send({ message: 'User already exists' })
      };
      const user = req.body;
      const result = await userCollections.insertOne(user);
      res.send(result);
    });

    // ----- Get User Role -----
    app.get('/users/:email/role', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.status(400).send({ message: 'Email is required' })
      }
      const user = await userCollections.findOne({ email });
      if (!user) {
        return res.status(404).send({ message: 'User Not Found' })
      }
      res.send({ role: user.role || 'student' })
    });


    // ----- Get All Sessions (Public) -----
    app.get('/sessions', async (req, res) => {
      const result = await sessionCollections.find().toArray();
      res.send(result)
    });


    // ################ TUTOR RELATED APIs ################
    // ----- Create New Session -----
    app.post('/session', verifyToken, verifyTutor, async (req, res) => {
      const session = req.body;
      const result = await sessionCollections.insertOne(session);
      res.send(result);
    });

    // ----- Get Approved Sessions (Limited for Homepage) -----
    app.get('/approved', async (req, res) => {
      const now = new Date();
      const result = await sessionCollections
        .find({ status: 'approved' })
        .sort({ registrationStartDate: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    // ----- Get Session Details by ID -----
    app.get('/session/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const session = await sessionCollections.findOne({ _id: new ObjectId(id) });
        if (!session) {
          return res.status(404).send({ message: 'Session not found' });
        }
        res.send(session);
      } catch (err) {
        res.status(500).send({ message: 'Invalid ID format' });
      }
    });

    // ----- Get Sessions by Tutor Email -----
    app.get('/current-user', verifyToken, verifyTutor, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ message: "Email is required in query" });
      }
      try {
        const sessions = await sessionCollections.find({ tutorEmail: email }).toArray();
        res.send(sessions);
      } catch (error) {
        console.error("Error fetching sessions by email:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // ----- Request Session Approval Again -----
    app.patch('/sessions/request-again/:id', verifyToken, verifyTutor, async (req, res) => {
      const sessionId = req.params.id;
      if (!ObjectId.isValid(sessionId)) {
        return res.status(400).send({ error: 'Invalid session ID' });
      }
      try {
        const filter = { _id: new ObjectId(sessionId) };
        const session = await sessionCollections.findOne(filter);
        if (!session) {
          return res.status(404).send({ error: 'Session not found' });
        }
        if (session.status !== 'rejected') {
          return res.status(400).send({ error: 'Only rejected sessions can request again' });
        }
        const updateDoc = {
          $set: { status: 'pending' },
        };
        const result = await sessionCollections.updateOne(filter, updateDoc);
        if (result.modifiedCount > 0) {
          res.send({ message: 'Session request sent again', modifiedCount: result.modifiedCount });
        } else {
          res.status(500).send({ error: 'Failed to update session status' });
        }
      } catch (error) {
        console.error('Error in request-again:', error);
        res.status(500).send({ error: 'Server error' });
      }
    });

    // ----- Upload Study Materials -----
    app.post('/materials', verifyToken, verifyTutor, async (req, res) => {
      const material = req.body;
      const result = await materialsCollections.insertOne(material);
      res.send(result);
    });

    // ----- Get Approved Sessions by Tutor -----
    app.get("/tutor-approved-sessions", verifyToken, verifyTutor, async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: "Email is required" });

      const sessions = await sessionCollections
        .find({ tutorEmail: email, status: "approved" })
        .toArray();

      res.send(sessions);
    });

    // ----- Get Materials (Filter by Session or Tutor) -----
    app.get('/materials', verifyToken, async (req, res) => {
      const { sessionId, email } = req.query;

      if (!sessionId && !email) {
        return res.status(400).send({ error: "Either sessionId or tutor email is required" });
      }

      try {
        const query = {};
        if (sessionId) query.sessionId = sessionId;
        if (email) query.tutorEmail = email;

        const materials = await materialsCollections.find(query).toArray();
        res.send(materials);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch materials" });
      }
    });

    // ----- Update Material -----
    app.patch('/materials/:id', verifyToken, verifyTutor, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid ID" });
      try {
        const result = await materialsCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );
        if (result.modifiedCount > 0) {
          res.send({ message: "Material updated successfully" });
        } else {
          res.status(404).send({ error: "Material not found or no changes made" });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to update material" });
      }
    });

    // ----- Delete Material -----
    app.delete('/materials/:id', verifyToken, verifyTutor, async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid ID" });

      try {
        const result = await materialsCollections.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.send({ message: "Material deleted successfully" });
        } else {
          res.status(404).send({ error: "Material not found" });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to delete material" });
      }
    });

    // ################ PAYMENT RELATED APIs ################
    // ----- Create Stripe Payment Intent -----
    app.post("/stripe/create-payment-intent", async (req, res) => {
      const { price } = req.body;

      // Validate price
      if (!price || price < 1) {
        return res.status(400).send({ error: "Invalid price" });
      }

      try {
        // Create payment intent (amount in cents)
        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(price * 100),
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        console.error("Stripe error:", error);
        res.status(500).send({ error: "Payment creation failed" });
      }
    });

    // ################ BOOKED SESSIONS APIs ################
    // ----- Book a Session -----
    app.post('/booked-sessions', verifyToken, verifyStudent, async (req, res) => {
      const bookedData = req.body;
      const { sessionId, studentEmail, price, paymentIntentId } = bookedData;

      // Get session details
      const session = await sessionCollections.findOne({ _id: new ObjectId(sessionId) });

      if (!session) {
        return res.status(404).send({ message: "Session not found" });
      }

      // Check if already booked
      const alreadyBooked = await bookedSessionsCollections.findOne({
        sessionId,
        studentEmail,
      });

      if (alreadyBooked) {
        return res.status(409).send({ message: "Session already booked by this user" });
      }

      // Handle paid sessions
      if (session.sessionType === 'paid' && price > 0) {
        if (!paymentIntentId) {
          return res.status(400).send({ message: "Payment verification required for paid sessions" });
        }

        // Verify Stripe payment
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (paymentIntent.status !== 'succeeded') {
            return res.status(402).send({ message: "Payment not completed" });
          }

          // Record payment
          await paymentCollections.insertOne({
            sessionId,
            studentEmail,
            amount: price,
            paymentIntentId,
            paymentDate: new Date(),
            status: 'completed'
          });
        } catch (error) {
          console.error("Payment verification failed:", error);
          return res.status(500).send({ message: "Payment verification failed" });
        }
      }

      // Complete booking
      const completeBookedData = {
        ...bookedData,
        classStartDate: session.classStartDate,
        classEndDate: session.classEndDate,
        duration: session.duration,
        paymentStatus: session.sessionType === 'paid' ? 'paid' : 'free'
      };

      const result = await bookedSessionsCollections.insertOne(completeBookedData);
      res.send(result);
    });

    // ----- Check if Session is Booked -----
    app.get('/booked-sessions/check', verifyToken, async (req, res) => {
      const { sessionId, email } = req.query;
      const exists = await bookedSessionsCollections.findOne({
        sessionId,
        studentEmail: email,
      });
      res.send({ booked: !!exists });
    });

    // ----- Submit Review -----
    app.post('/reviews', verifyToken, verifyStudent, async (req, res) => {
      const review = req.body;

      // Check for existing review
      const existingReview = await reviewCollections.findOne({
        sessionId: review.sessionId,
        studentEmail: review.studentEmail
      });

      if (existingReview) {
        return res.status(400).send({
          success: false,
          message: "You have already reviewed this session. You can edit your existing review."
        });
      }

      review.createdAt = new Date();
      review.updatedAt = new Date();

      const result = await reviewCollections.insertOne(review);
      res.send({
        success: true,
        insertedId: result.insertedId
      });
    });

    // ----- Get Reviews for Session -----
    app.get('/reviews', async (req, res) => {
      const sessionId = req.query.sessionId;
      if (!sessionId) {
        return res.status(400).send({ message: "sessionId is required" });
      }

      const reviews = await reviewCollections.find({ sessionId }).toArray();
      res.send(reviews);
    });

    // ----- Update Review -----
    app.patch('/reviews/:id', verifyToken, verifyStudent, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid review ID" });
      }

      updatedData.updatedAt = new Date();

      const result = await reviewCollections.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );

      if (result.modifiedCount === 0) {
        return res.status(404).send({ message: "Review not found" });
      }

      res.send({
        success: true,
        modifiedCount: result.modifiedCount
      });
    });

    app.delete('/reviews/:id', verifyToken, verifyStudent, async (req, res) => {
      const id = req.params.id;

      // Validate review ID format
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          success: false,
          message: "Invalid review ID format"
        });
      }

      try {
        // First find the review to verify ownership
        const review = await reviewCollections.findOne({
          _id: new ObjectId(id)
        });

        // Check if review exists
        if (!review) {
          return res.status(404).send({
            success: false,
            message: "Review not found"
          });
        }

        // Verify the requesting user is the review author
        if (review.studentEmail !== req.user.email) {
          return res.status(403).send({
            success: false,
            message: "Unauthorized - You can only delete your own reviews"
          });
        }

        // Delete the review
        const result = await reviewCollections.deleteOne({
          _id: new ObjectId(id)
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({
            success: false,
            message: "Review not found or already deleted"
          });
        }

        res.send({
          success: true,
          deletedCount: result.deletedCount,
          message: "Review deleted successfully"
        });

      } catch (error) {
        console.error("Error deleting review:", error);
        res.status(500).send({
          success: false,
          message: "Internal server error while deleting review",
          error: error.message
        });
      }
    });

    // ----- Get Booked Session by ID -----
    app.get('/booked-sessions/:id', verifyToken, verifyStudent, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid ID format' });
        }

        const session = await bookedSessionsCollections.findOne({ _id: new ObjectId(id) });
        if (!session) {
          return res.status(404).send({ message: 'Session not found' });
        }
        res.send(session);
      } catch (error) {
        console.error('Error fetching booked session:', error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // ----- Get All Booked Sessions for Student -----
    app.get('/booked-sessions', verifyToken, verifyStudent, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ message: 'Email is required' });
        }

        const sessions = await bookedSessionsCollections.find({ studentEmail: email }).toArray();
        res.send(sessions);
      } catch (error) {
        console.error('Error fetching booked sessions:', error);
        res.status(500).send({ message: 'Server error' });
      }
    });

    // ################ STUDENT RELATED APIs ################
    // ----- Create Study Notes -----
    app.post('/create-notes', verifyToken, verifyStudent, async (req, res) => {
      const notes = req.body;
      const result = await studentsCreateNotesCollections.insertOne(notes);
      res.send(result)
    });

    // ----- Get Notes by Student Email -----
    app.get('/notes', verifyToken, verifyStudent, async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.status(400).send({ message: 'Email is required' });
        }

        const notes = await studentsCreateNotesCollections.find({ email }).sort({ createdAt: -1 }).toArray();
        res.send(notes);
      } catch (error) {
        console.error('Error fetching notes:', error);
        res.status(500).send({ message: 'Failed to fetch notes' });
      }
    });

    // ----- Update Note -----
    app.patch('/notes/:id', verifyToken, verifyStudent, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid note ID' });
        }

        const updatedData = req.body;
        updatedData.updatedAt = new Date();

        const result = await studentsCreateNotesCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: updatedData }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Note not found or no changes made' });
        }

        res.send({ success: true, message: 'Note updated successfully' });
      } catch (error) {
        console.error('Error updating note:', error);
        res.status(500).send({ message: 'Failed to update note' });
      }
    });

    // ----- Delete Note -----
    app.delete('/notes/:id', verifyToken, verifyStudent, async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid note ID' });
        }

        const result = await studentsCreateNotesCollections.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Note not found' });
        }

        res.send({ success: true, message: 'Note deleted successfully' });
      } catch (error) {
        console.error('Error deleting note:', error);
        res.status(500).send({ message: 'Failed to delete note' });
      }
    });

    // ################ ADMIN RELATED APIs ################
    // ----- Get All Users -----
    app.get('/all-users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result)
    });

    // ----- Search Users -----
    app.get('/search-users', verifyToken, verifyAdmin, async (req, res) => {
      const { query } = req.query;

      try {
        const users = await userCollections.find({
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { email: { $regex: query, $options: 'i' } }
          ]
        }).toArray();

        res.send(users);
      } catch (error) {
        res.status(500).send({ message: 'Error searching users' });
      }
    });

    // ----- Update User Role -----
    app.patch('/update-user-role/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { role, currentUserEmail } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid user ID' });
      }

      try {
        // Prevent self-role change
        const userToUpdate = await userCollections.findOne({ _id: new ObjectId(id) });
        if (userToUpdate.email === currentUserEmail && role !== 'admin') {
          return res.status(403).send({
            message: 'You cannot remove your own admin privileges'
          });
        }

        const result = await userCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'User not found or no changes made' });
        }

        res.send({ success: true, message: 'User role updated successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Error updating user role' });
      }
    });

    // ----- Get All Sessions (Admin View) -----
    app.get('/admin/sessions', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const sessions = await sessionCollections.find().toArray();
        res.send(sessions);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching sessions' });
      }
    });

    // ----- Approve Session (Admin) -----
    app.patch('/admin/sessions/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { sessionType, price } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid session ID' });
      }

      try {
        const updateDoc = {
          $set: {
            status: 'approved',
            sessionType,
            price: sessionType === 'free' ? 0 : price
          }
        };

        const result = await sessionCollections.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Session not found or no changes made' });
        }

        res.send({ success: true, message: 'Session approved successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Error approving session' });
      }
    });

    // ----- Reject Session (Admin) -----
    app.patch('/admin/sessions/:id/reject', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { rejectionReason, feedback } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid session ID' });
      }

      if (!rejectionReason) {
        return res.status(400).send({ message: 'Rejection reason is required' });
      }

      try {
        const updateData = {
          status: 'rejected',
          rejectionReason,
          updatedAt: new Date()
        };

        if (feedback) {
          updateData.feedback = feedback;
        }

        const result = await sessionCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Session not found or no changes made' });
        }

        res.send({
          success: true,
          message: 'Session rejected successfully',
          updatedSession: await sessionCollections.findOne({ _id: new ObjectId(id) })
        });
      } catch (error) {
        console.error('Error rejecting session:', error);
        res.status(500).send({ message: 'Error rejecting session' });
      }
    });

    // ----- Update Session (Admin) -----
    app.patch('/admin/sessions/:id/update', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const updateData = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid session ID' });
      }

      try {
        const result = await sessionCollections.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Session not found or no changes made' });
        }

        res.send({ success: true, message: 'Session updated successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Error updating session' });
      }
    });

    // ----- Delete Session (Admin) -----
    app.delete('/admin/sessions/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid session ID' });
      }

      try {
        const result = await sessionCollections.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Session not found' });
        }

        res.send({ success: true, message: 'Session deleted successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Error deleting session' });
      }
    });

    // ----- Get All Materials (Admin View) -----
    app.get('/admin/materials', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const materials = await materialsCollections.find().toArray();
        res.send(materials);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching materials' });
      }
    });

    // ----- Delete Material (Admin) ----- 
    app.delete('/admin/materials/:id', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: 'Invalid material ID' });
      }

      try {
        const result = await materialsCollections.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Material not found' });
        }

        res.send({ success: true, message: 'Material deleted successfully' });
      } catch (error) {
        res.status(500).send({ message: 'Error deleting material' });
      }
    });

    // ----- Get Rejected Sessions for Tutor -----
    app.get('/tutor-rejected-sessions', verifyToken, verifyTutor, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const sessions = await sessionCollections
          .find({
            tutorEmail: email,
            status: "rejected"
          })
          .sort({ updatedAt: -1 })
          .toArray();

        res.send(sessions);
      } catch (error) {
        console.error("Error fetching rejected sessions:", error);
        res.status(500).send({
          message: "Error fetching rejected sessions",
          error: error.message
        });
      }
    });

    // ################ TUTOR PROFILE APIs ################
    // ----- Get All Tutors -----
    app.get('/all-tutor', async (req, res) => {
      const result = await userCollections.find({ role: 'tutor' }).toArray();
      res.send(result)
    });

    // ----- Get Tutor by ID -----
    app.get('/tutor/:id', async (req, res) => {
      const id = req.params.id;
      try {
        const tutor = await userCollections.findOne({ _id: new ObjectId(id), role: 'tutor' });
        if (!tutor) {
          return res.status(404).send({ message: 'Tutor not found' });
        }
        res.send(tutor);
      } catch (err) {
        res.status(500).send({ message: 'Invalid ID format' });
      }
    });

    // ----- Get Sessions by Tutor ID -----
    app.get('/tutor-sessions/:id', async (req, res) => {
      const id = req.params.id;
      try {
        // Get tutor's email first
        const tutor = await userCollections.findOne({ _id: new ObjectId(id) });
        if (!tutor) {
          return res.status(404).send({ message: 'Tutor not found' });
        }

        // Get approved sessions
        const sessions = await sessionCollections.find({
          tutorEmail: tutor.email,
          status: 'approved'
        }).toArray();

        res.send(sessions);
      } catch (err) {
        res.status(500).send({ message: 'Server error' });
      }
    });

    app.get('/api/session/:sessionId/bookings-count', async (req, res) => {
      const sessionId = req.params.sessionId;
      try {
        const totalBookings = await bookedSessionsCollections.countDocuments({ sessionId });
        const paidCount = await bookedSessionsCollections.countDocuments({
          sessionId,
          paymentStatus: 'paid'
        });
        res.send({
          sessionId,
          totalBookings,
          paidCount
        });
      } catch (error) {
        res.status(500).send({ error: "Failed to count bookings" });
      }
    })

    //-------------------------------------------------------------//

    // Add these to your existing backend code (server.js)

    // ----- Get Dashboard Stats -----
    app.get('/admin/stats', verifyToken, verifyAdmin, async (req, res) => {
      try {
        console.log('Attempting to fetch admin stats...'); // Debug log

        const results = await Promise.all([
          userCollections.countDocuments(),
          userCollections.countDocuments({ role: 'tutor' }),
          userCollections.countDocuments({ role: 'student' }),
          sessionCollections.countDocuments(),
          sessionCollections.countDocuments({ status: 'approved' }),
          sessionCollections.countDocuments({ status: 'pending' }),
          sessionCollections.countDocuments({ status: 'rejected' }),
          bookedSessionsCollections.countDocuments(),
          paymentCollections.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]).toArray() // Changed to toArray()
        ]);

        console.log('Query results:', results); // Debug log

        const [
          totalUsers,
          totalTutors,
          totalStudents,
          totalSessions,
          totalApprovedSessions,
          totalPendingSessions,
          totalRejectedSessions,
          totalBookings,
          revenueResult
        ] = results;

        const totalRevenue = revenueResult[0]?.total || 0;

        res.send({
          totalUsers,
          totalTutors,
          totalStudents,
          totalSessions,
          totalApprovedSessions,
          totalPendingSessions,
          totalRejectedSessions,
          totalBookings,
          totalRevenue
        });
      } catch (error) {
        console.error('Detailed stats error:', error); // Detailed error logging
        res.status(500).send({
          message: 'Error fetching dashboard stats',
          error: error.message // Include error message in response
        });
      }
    });

    // ----- Get Recent Activities -----
    app.get('/admin/recent-activities', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 10;

        const recentSessions = await sessionCollections.find()
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();

        const recentBookings = await bookedSessionsCollections.find()
          .sort({ bookingDate: -1 })
          .limit(limit)
          .toArray();

        const recentPayments = await paymentCollections.find()
          .sort({ paymentDate: -1 })
          .limit(limit)
          .toArray();

        res.send({
          recentSessions,
          recentBookings,
          recentPayments
        });
      } catch (error) {
        res.status(500).send({ message: 'Error fetching recent activities' });
      }
    });


    // ################ STUDENT DASHBOARD APIs ################

    // ----- Get Student Dashboard Stats -----
    app.get('/student/dashboard-stats', verifyToken, verifyStudent, async (req, res) => {
      try {
        const studentEmail = req.user.email;

        // Get all booked sessions for the student
        const bookedSessions = await bookedSessionsCollections.find({
          studentEmail
        }).toArray();

        const bookedSessionIds = bookedSessions.map(bs => bs.sessionId);

        // Get session details for booked sessions
        const sessions = await sessionCollections.find({
          _id: { $in: bookedSessionIds.map(id => new ObjectId(id)) }
        }).toArray();

        // Calculate stats
        const totalBookedSessions = bookedSessions.length;

        const currentDate = new Date();

        // Ongoing sessions (current date is between start and end date)
        const ongoingSessions = sessions.filter(session => {
          const startDate = new Date(session.classStartDate);
          const endDate = new Date(session.classEndDate);
          return currentDate >= startDate && currentDate <= endDate;
        });

        // Completed sessions
        const completedSessions = sessions.filter(session => {
          const endDate = new Date(session.classEndDate);
          return currentDate > endDate;
        });

        // Upcoming sessions
        const upcomingSessions = sessions.filter(session => {
          const startDate = new Date(session.classStartDate);
          return currentDate < startDate;
        });

        // Calculate upcoming deadlines (sessions starting within 7 days)
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);

        const upcomingDeadlines = upcomingSessions.filter(session => {
          const startDate = new Date(session.classStartDate);
          return startDate <= nextWeek;
        }).length;

        // Get student's notes count
        const totalNotes = await studentsCreateNotesCollections.countDocuments({
          email: studentEmail
        });

        // Get student's reviews count
        const totalReviews = await reviewCollections.countDocuments({
          studentEmail
        });

        res.send({
          totalBookedSessions,
          ongoingSessionsCount: ongoingSessions.length,
          completedSessionsCount: completedSessions.length,
          upcomingSessionsCount: upcomingSessions.length,
          upcomingDeadlines,
          totalNotes,
          totalReviews
        });

      } catch (error) {
        console.error('Error fetching student dashboard stats:', error);
        res.status(500).send({ message: 'Error fetching dashboard stats' });
      }
    });

    // ----- Get Student's Ongoing Sessions with Progress -----
    app.get('/student/ongoing-sessions', verifyToken, verifyStudent, async (req, res) => {
      try {
        const studentEmail = req.user.email;
        const currentDate = new Date();

        // Get booked sessions
        const bookedSessions = await bookedSessionsCollections.find({
          studentEmail
        }).toArray();

        const bookedSessionIds = bookedSessions.map(bs => bs.sessionId);

        // Get ongoing session details
        const ongoingSessions = await sessionCollections.find({
          _id: { $in: bookedSessionIds.map(id => new ObjectId(id)) },
          classStartDate: { $lte: currentDate },
          classEndDate: { $gte: currentDate }
        }).toArray();

        // Calculate progress for each session
        const sessionsWithProgress = ongoingSessions.map(session => {
          const startDate = new Date(session.classStartDate);
          const endDate = new Date(session.classEndDate);
          const totalDuration = endDate - startDate;
          const elapsedDuration = currentDate - startDate;
          const progress = Math.max(0, Math.min(100, Math.round((elapsedDuration / totalDuration) * 100)));

          return {
            ...session,
            progress,
            bookedSession: bookedSessions.find(bs => bs.sessionId === session._id.toString())
          };
        });

        res.send(sessionsWithProgress);

      } catch (error) {
        console.error('Error fetching ongoing sessions:', error);
        res.status(500).send({ message: 'Error fetching ongoing sessions' });
      }
    });

    // ----- Get Upcoming Sessions/Assignments -----
    app.get('/student/upcoming-sessions', verifyToken, verifyStudent, async (req, res) => {
      try {
        const studentEmail = req.user.email;
        const currentDate = new Date();

        // Get booked sessions
        const bookedSessions = await bookedSessionsCollections.find({
          studentEmail
        }).toArray();

        const bookedSessionIds = bookedSessions.map(bs => bs.sessionId);

        // Get upcoming session details
        const upcomingSessions = await sessionCollections.find({
          _id: { $in: bookedSessionIds.map(id => new ObjectId(id)) },
          classStartDate: { $gt: currentDate }
        }).sort({ classStartDate: 1 }).limit(5).toArray();

        // Add priority based on how soon they start
        const sessionsWithPriority = upcomingSessions.map(session => {
          const startDate = new Date(session.classStartDate);
          const daysUntilStart = Math.ceil((startDate - currentDate) / (1000 * 60 * 60 * 24));

          let priority = 'low';
          let dueText = '';

          if (daysUntilStart <= 1) {
            priority = 'high';
            dueText = daysUntilStart === 0 ? 'Today' : 'Tomorrow';
          } else if (daysUntilStart <= 3) {
            priority = 'medium';
            dueText = `In ${daysUntilStart} days`;
          } else {
            priority = 'low';
            dueText = `In ${daysUntilStart} days`;
          }

          return {
            ...session,
            priority,
            dueText,
            daysUntilStart
          };
        });

        res.send(sessionsWithPriority);

      } catch (error) {
        console.error('Error fetching upcoming sessions:', error);
        res.status(500).send({ message: 'Error fetching upcoming sessions' });
      }
    });

    // ----- Get Recent Performance/Grades -----
    app.get('/student/recent-performance', verifyToken, verifyStudent, async (req, res) => {
      try {
        const studentEmail = req.user.email;

        // Get student's reviews (as performance indicator)
        const reviews = await reviewCollections.find({
          studentEmail
        }).sort({ createdAt: -1 }).limit(10).toArray();

        // Get session details for reviews
        const sessionIds = reviews.map(review => review.sessionId);
        const sessions = await sessionCollections.find({
          _id: { $in: sessionIds.map(id => new ObjectId(id)) }
        }).toArray();

        // Combine reviews with session data
        const performanceData = reviews.map(review => {
          const session = sessions.find(s => s._id.toString() === review.sessionId);

          // Convert rating to grade-like format
          let grade = 'C';
          if (review.rating >= 5) grade = 'A+';
          else if (review.rating >= 4.5) grade = 'A';
          else if (review.rating >= 4) grade = 'A-';
          else if (review.rating >= 3.5) grade = 'B+';
          else if (review.rating >= 3) grade = 'B';
          else if (review.rating >= 2.5) grade = 'B-';
          else if (review.rating >= 2) grade = 'C+';

          return {
            id: review._id,
            sessionTitle: session?.title || 'Unknown Session',
            tutorName: session?.tutorName || 'Unknown Tutor',
            rating: review.rating,
            grade,
            feedback: review.feedback,
            createdAt: review.createdAt
          };
        });

        res.send(performanceData);

      } catch (error) {
        console.error('Error fetching recent performance:', error);
        res.status(500).send({ message: 'Error fetching recent performance' });
      }
    });

    // ----- Get Student's Recent Notes -----
    app.get('/student/recent-notes', verifyToken, verifyStudent, async (req, res) => {
      try {
        const email = req.user.email;
        const limit = parseInt(req.query.limit) || 5;

        const recentNotes = await studentsCreateNotesCollections
          .find({ email })
          .sort({ createdAt: -1 })
          .limit(limit)
          .toArray();

        res.send(recentNotes);
      } catch (error) {
        console.error('Error fetching recent notes:', error);
        res.status(500).send({ message: 'Error fetching recent notes' });
      }
    });

    // ----- Get Study Materials for Student's Booked Sessions -----
    app.get('/student/study-materials', verifyToken, verifyStudent, async (req, res) => {
      try {
        const studentEmail = req.user.email;

        // Get booked sessions
        const bookedSessions = await bookedSessionsCollections.find({
          studentEmail
        }).toArray();

        const bookedSessionIds = bookedSessions.map(bs => bs.sessionId);

        // Get materials for booked sessions
        const materials = await materialsCollections.find({
          sessionId: { $in: bookedSessionIds }
        }).sort({ uploadDate: -1 }).limit(10).toArray();

        // Get session details for materials
        const sessionIds = [...new Set(materials.map(m => m.sessionId))];
        const sessions = await sessionCollections.find({
          _id: { $in: sessionIds.map(id => new ObjectId(id)) }
        }).toArray();

        // Add session info to materials
        const materialsWithSession = materials.map(material => {
          const session = sessions.find(s => s._id.toString() === material.sessionId);
          return {
            ...material,
            sessionTitle: session?.title || 'Unknown Session'
          };
        });

        res.send(materialsWithSession);

      } catch (error) {
        console.error('Error fetching study materials:', error);
        res.status(500).send({ message: 'Error fetching study materials' });
      }
    });

    // In your backend (server.js)
    app.get('/api/tutor/stats', verifyToken, verifyTutor, async (req, res) => {
      try {
        const email = req.query.email;

        // Get basic counts
        const totalStudents = await bookedSessionsCollections.distinct('studentEmail', { tutorEmail: email });
        const activeCourses = await sessionCollections.countDocuments({
          tutorEmail: email,
          status: 'approved'
        });

        // Calculate hours taught
        const sessions = await bookedSessionsCollections.find({ tutorEmail: email }).toArray();
        const hoursTaught = sessions.reduce((sum, session) => sum + (session.duration || 0), 0);

        // Calculate earnings
        const payments = await paymentCollections.aggregate([
          { $match: { tutorEmail: email, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]).toArray();

        const earnings = payments[0]?.total || 0;

        // Growth calculations (simplified - would need historical data for real implementation)
        const studentGrowth = Math.floor(Math.random() * 20) + 5;
        const courseGrowth = Math.floor(Math.random() * 15) + 5;
        const hoursGrowth = Math.floor(Math.random() * 25) + 10;
        const earningsGrowth = Math.floor(Math.random() * 30) - 5; // Can be negative

        res.send({
          totalStudents: totalStudents.length,
          activeCourses,
          hoursTaught,
          earnings,
          studentGrowth,
          courseGrowth,
          hoursGrowth,
          earningsGrowth
        });
      } catch (error) {
        res.status(500).send({ message: 'Error fetching tutor stats' });
      }
    });

    app.get('/api/tutor/upcoming-sessions', verifyToken, verifyTutor, async (req, res) => {
      try {
        const email = req.query.email;
        const now = new Date();

        const sessions = await bookedSessionsCollections.find({
          tutorEmail: email,
          startTime: { $gte: now }
        })
          .sort({ startTime: 1 })
          .limit(5)
          .toArray();

        res.send(sessions);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching upcoming sessions' });
      }
    });

    app.get('/api/tutor/recent-students', verifyToken, verifyTutor, async (req, res) => {
      try {
        const email = req.query.email;

        const students = await bookedSessionsCollections.aggregate([
          { $match: { tutorEmail: email } },
          { $sort: { bookingDate: -1 } },
          {
            $group: {
              _id: "$studentEmail",
              name: { $first: "$studentName" },
              email: { $first: "$studentEmail" },
              lastSessionDate: { $max: "$startTime" }
            }
          },
          { $limit: 5 }
        ]).toArray();

        res.send(students);
      } catch (error) {
        res.status(500).send({ message: 'Error fetching recent students' });
      }
    });


    //---------------------------------------------------------------//


    // ================ DATABASE HEALTH CHECK ================
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Client will remain connected (commented out close for persistent connection)
    // await client.close();
  }
}
run().catch(console.dir);

// ================ SERVER SETUP ================
app.get('/', (req, res) => {
  res.send('the last dance')
});

app.listen(port, () => {
  console.log(`server is running on port ${port}`)
});