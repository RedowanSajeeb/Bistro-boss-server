const express = require("express");
const app = express();
const cors = require("cors");
const stripe = require("stripe")(process.env.Payment_Security_Key);

require("dotenv").config();
const jwt = require("jsonwebtoken");

const port = process.env.PORT || 3000;

// middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authentication = req.headers.authentication;
  if (!authentication) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }

  const token = authentication.split(" ")[1];

  // verify a token symmetric
  jwt.verify(token, process.env.ACCESS_TOKEN_JWT, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }

    req.decoded = decoded;
    next();
  });
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.SECRET_User}:${process.env.SECRET_KEY}@bistro.b2prnxq.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    const bistroUsersCollection = client.db("Bistro").collection("Users");
    const bistroMenuCollection = client.db("Bistro").collection("menu");
    const bistroReviewsCollection = client.db("Bistro").collection("reviews");
    const bistroCartsCollection = client.db("Bistro").collection("Carts");

    // jwt authentication is required for authentication to work correctly!
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_JWT, {
        expiresIn: "2h",
      });
      res.send({ token });
    });

    // users collection relationships
    // -----------------------------

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await bistroUsersCollection.findOne(query);

      if (user?.role !== "@Admin") {
        return res.status(403).send({ error: true, message: "FORBIDDEN user" });
      }
      next();
    };

    // jwt suquery

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await bistroUsersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };

      const existingUser = await bistroUsersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exists in the database" });
      }

      const result = await bistroUsersCollection.insertOne(user);
      res.send(result);
    });

    // app.get("/users/admin/:email", verifyJWT, async (req, res) => {
    //   const email = req.query.email;

    //   if (req.decoded.email !== email) {
    //     res.send({ admin: false });
    //   }

    //   const query = { email: email };
    //   const user = await bistroUsersCollection.findOne(query);

    //   const result = { admin: user?.role === "@Admin" };

    //   res.send(result);
    // });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      } else {
        try {
          const query = { email: email };
          const user = await bistroUsersCollection.findOne(query);
          const result = { admin: user?.role === "@Admin" };
          res.send(result);
        } catch (error) {
          res
            .status(500)
            .send({ error: true, message: "Internal server error" });
        }
      }
    });

    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };

      const updateDoc = {
        $set: {
          role: "@Admin",
        },
      };
      const result = await bistroUsersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/users/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bistroUsersCollection.deleteOne(query);
      res.send(result);
    });

    // menu  collection api version
    app.get("/menu", async (req, res) => {
      const result = await bistroMenuCollection.find().toArray();
      res.send(result);
    });

    app.post("/menu", verifyJWT, verifyAdmin, async (req, res) => {
      const newItms = req.body;
      const result = await bistroMenuCollection.insertOne(newItms);

      res.send(result);
    });

    app.delete("/menu/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bistroMenuCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      const result = await bistroReviewsCollection.find().toArray();
      res.send(result);
    });

    // Carts->render->render-section-bistroCartsCollection
    // --------------------------------------------------------

    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }

      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(401)
          .send({ error: true, message: "unauthorized access" });
      }

      const query = { email: email };
      const result = await bistroCartsCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/carts", async (req, res) => {
      const itms = req.body;
      const result = await bistroCartsCollection.insertOne(itms);
      res.send(result);
    });

    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bistroCartsCollection.deleteOne(query);
      res.send(result);
    });

    //Create Payment Intent for stripe!!

    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;

      const amount = price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        // automatic_payment_methods: {
        //   enabled: true,
        // },
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Welcome to the bistro boos is awesome!");
});

app.listen(port, (req, res) => {
  console.log(`bistro boos server listening on port ${port}`);
});
