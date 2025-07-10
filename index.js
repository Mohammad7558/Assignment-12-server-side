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
    app.get('/sessions', async (req, res) => {
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

    //----------------------Tutor related API end -------------------------//


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