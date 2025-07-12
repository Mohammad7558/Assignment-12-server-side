const express = require('express');
const app = express();
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@my-user.d2otqer.mongodb.net/?retryWrites=true&w=majority&appName=my-user`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    // --------Db Collection start ---------//
    const db = client.db('Study-DB');
    const userCollections = db.collection('users');
    const sessionCollections = db.collection('sessions');
    const materialsCollections = db.collection('materials');
    const bookedSessionsCollections = db.collection('booked-sessions');
    const reviewCollections = db.collection('reviews');
    const studentsCreateNotesCollections = db.collection('create-note');
    // --------Db Collection end ---------//


    //----------------------User related API start-------------------------//

    //------- upload user Data in Db -------//
    app.post('/users', async (req, res) => {
      const email = req.body.email;
      const existingUser = await userCollections.findOne({ email });
      if (existingUser) {
        return res.status(200).send({ message: 'User already exists' })
      };
      const user = req.body;
      const result = await userCollections.insertOne(user);
      res.send(result);
    })

    //------- GET ROLE user Data in Db -------//
    app.get('/users/:email/role', async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.status(400).send({ message: 'Email is required' })
      }
      const user = await userCollections.findOne({ email });
      if (!user) {
        return res.status(404).send({ message: 'User Not Found' })
      }
      res.send({ role: user.role || 'student' })
    })

    //-------- get all session ----------//
    app.get('/sessions', async (req, res) => {
      const result = await sessionCollections.find().toArray();
      res.send(result)
    })

    //----------------------User related API end -------------------------//


    //----------------------Tutor related API start -------------------------//

    // ---------- add session API ----------//
    app.post('/session', async (req, res) => {
      const session = req.body;
      const result = await sessionCollections.insertOne(session);
      res.send(result);
    })

    // ---------- get 6 card session API ----------//
    app.get('/approved', async (req, res) => {
      const now = new Date();
      const result = await sessionCollections
        .find({ status: 'approved' })
        .sort({ registrationStartDate: 1 })
        .limit(6)
        .toArray();
      res.send(result);
    });


    // ---------- show card details session API ----------//
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

    // get sessions data by email //
    app.get('/current-user', async (req, res) => {
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

    // req again API//
    app.patch('/sessions/request-again/:id', async (req, res) => {
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

    // upload materials
    app.post('/materials', async (req, res) => {
      const material = req.body;
      const result = await materialsCollections.insertOne(material);
      res.send(result);
    });

    // tutor approved sessions by email
    app.get("/tutor-approved-sessions", async (req, res) => {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: "Email is required" });

      const sessions = await sessionCollections
        .find({ tutorEmail: email, status: "approved" })
        .toArray();

      res.send(sessions);
    });

    // get all materials uploaded by a tutor 
    // Updated GET /materials endpoint
    app.get('/materials', async (req, res) => {
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

    // UPDATE a material by ID
    app.patch('/materials/:id', async (req, res) => {
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


    // DELETE a material by ID
    app.delete('/materials/:id', async (req, res) => {
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
    //----------------------Tutor related API end -------------------------//



    //----------------------payment related API start -------------------------//


    //----------------------payment related API end -------------------------//


    //----------------------booked session related API start -------------------------//
    app.post('/booked-sessions', async (req, res) => {
      const bookedData = req.body;
      const { sessionId, studentEmail } = bookedData;
      const alreadyBooked = await bookedSessionsCollections.findOne({
        sessionId,
        studentEmail,
      });

      if (alreadyBooked) {
        return res.status(409).send({ message: "Session already booked by this user" });
      }
      const result = await bookedSessionsCollections.insertOne(bookedData);
      res.send(result);
    });


    // ✅ GET /booked-sessions/check
    app.get('/booked-sessions/check', async (req, res) => {
      const { sessionId, email } = req.query;
      const exists = await bookedSessionsCollections.findOne({
        sessionId,
        studentEmail: email,
      });
      res.send({ booked: !!exists });
    });

    // review Session 
    app.post('/reviews', async (req, res) => {
      const review = req.body;

      // Check if user already has a review for this session
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

    app.get('/reviews', async (req, res) => {
      const sessionId = req.query.sessionId;
      if (!sessionId) {
        return res.status(400).send({ message: "sessionId is required" });
      }

      const reviews = await reviewCollections.find({ sessionId }).toArray();
      res.send(reviews);
    });

    app.patch('/reviews/:id', async (req, res) => {
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


    // get student booked all sessions
    app.get('/booked-sessions/:id', async (req, res) => {
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

    // Get all booked sessions for a student
    app.get('/booked-sessions', async (req, res) => {
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

    //----------------------booked session related API end -------------------------//

    //----------------------student related API Start STAR --------------------------//
    app.post('/create-notes', async (req, res) => {
      const notes = req.body;
      const result = await studentsCreateNotesCollections.insertOne(notes);
      res.send(result)
    })

    app.get('/notes', async (req, res) => {
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

    // Update a note
    app.patch('/notes/:id', async (req, res) => {
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

    // Delete a note
    app.delete('/notes/:id', async (req, res) => {
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

    // view materials for student they booked sessions

    //----------------------student related API Start END --------------------------//


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('the last dance')
})

app.listen(port, () => {
  console.log(`server is running on port ${port}`)
})