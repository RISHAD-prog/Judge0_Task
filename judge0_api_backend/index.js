const express = require('express')
const app = express()
const port = process.env.PORT || 8000;
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { spawn } = require("child_process");
const fs = require('fs');
const { v4: uuidv4 } = require("uuid")
app.use(cors());
app.use(express.json());

const verifyJwt = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send("unauthorized action");
    }

    const token = authorization.split(' ')[1];
    jwt.verify(token, process.env.USER_ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ error: true, message: 'access forbidden' });
        }
        req.decoded = decoded;
        next();
    })
}

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.vv6xnmz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        await client.connect();

        const userCollection = client.db("judge0").collection("users");

        app.post('/registration', async (req, res) => {
            const user = req.body;
            const query = { email: user?.email };
            const existingUser = await userCollection.findOne(query);
            if (existingUser && existingUser.email === query.email) {
                return res.send("user is already there");
            }
            else {
                const result = await userCollection.insertOne(user);
                return res.send(result);
            }
        });

        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.USER_ACCESS_TOKEN, { expiresIn: "1h" });
            res.send({ token });
        })

        app.post('/execute', verifyJwt, async (req, res) => {
            const codeSnippet = req.body.code;
            const codeLanguage = req.body.language;

            console.log(codeSnippet);
        })

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('judge0 is sitting');
})

app.listen(port, () => {
    console.log(`judge0 api is running on port ${port}`);
});