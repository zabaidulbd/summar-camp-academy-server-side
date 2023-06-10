const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const stripe = require('stripe')(process.env.PAYMENT_SECRET)
const port = process.env.PORT || 5000;

// middleware..........
app.use(cors());
app.use(express.json());


// verifying jwt web token [Todo: Do not finish verify......]

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'access denied' });
    }
    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'access denied' })
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.oswrsby.mongodb.net/?retryWrites=true&w=majority`;

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

        const usersCollection = client.db("twelveDb").collection("users");
        const classesCollection = client.db("twelveDb").collection("classes");
        const selectedClassesCollection = client.db("twelveDb").collection("selectedClasses");
        const paymentCollection = client.db("twelveDb").collection("payments");


        // JWT.....

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })

        })


        // users api.....


        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);

        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existUser = await usersCollection.findOne(query)
            if (existUser) {
                return res.send({ message: 'user already exists' })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result)

        });


        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })


        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })



        app.patch('/users/admin/:id', async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result)
        });



        app.patch('/users/instructor/:id', async (req, res) => {

            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)
        });


        // class api..........


        app.get('/classes', async (req, res) => {
            const result = await classesCollection.find().toArray();
            res.send(result);

        })


        app.post('/classes', async (req, res) => {
            const singleClass = req.body;
            const result = await classesCollection.insertOne(singleClass);
            res.send(result);
        });



        app.patch('/classes/approve/:id', async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approve'
                },
            };
            const result = await classesCollection.updateOne(query, updateDoc);
            res.send(result)
        });


        app.patch('/classes/deny/:id', async (req, res) => {

            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'deny'
                },
            };
            const result = await classesCollection.updateOne(query, updateDoc);
            res.send(result)
        });



        // selected class api........


        app.get('/selectedclasses', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([])
            }
            const query = { email: email };
            const result = await selectedClassesCollection.find(query).toArray();
            res.send(result);

        });


        app.post('/selectedclasses', async (req, res) => {
            const selectedClass = req.body;
            const result = await selectedClassesCollection.insertOne(selectedClass);
            res.send(result);
        });


        app.delete('/selectedclasses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassesCollection.deleteOne(query);
            res.send(result)
        })

        // payment.........

        //payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })


        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);

            const query = { _id: { $in: payment.classItems.map(id => new ObjectId(id)) } }
            const deleteResult = await selectedClassesCollection.deleteOne(query)

            res.send({ insertResult, deleteResult });
        })






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
    res.send('assignment twelve server is running')
})

app.listen(port, () => {
    console.log(`assignment twelve server running on port ${port}`)
})