const express = require('express')
const app = express()
const port = process.env.PORT || 8000;
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const fs = require('fs');
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
    },
    maxPoolSize: 20,
});

async function run() {
    try {
        await client.connect();

        const userCollection = client.db("judge0").collection("users");
        const codeCollection = client.db("judge0").collection("codes");
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
            try {
                const { codeSnippet, language } = req.body;
                const codeExecutionDetails = req.body;
                let executionResult = "";
                let errorOccurred = false;
                const codeExecutionId = uuidv4();
                const codeExecutionPath = `${__dirname}/code-execution/${codeExecutionId}`;


                try {
                    fs.mkdirSync(codeExecutionPath);
                } catch (error) {
                    res.status(500).json({ error: 'Failed to create code execution directory' });
                    return;
                }
                console.log(codeExecutionPath);
                let codeFilePath;

                switch (language) {
                    case 'JavaScript':
                        codeFilePath = `${codeExecutionPath}/code.js`;
                        break;
                    case 'python':
                        codeFilePath = `${codeExecutionPath}/code.py`;
                        break;
                    case 'c++':
                        codeFilePath = `${codeExecutionPath}/code.cpp`;
                        break;
                    case 'c':
                        codeFilePath = `${codeExecutionPath}/code.c`;
                        break;
                    default:
                        res.status(422).json({ error: 'Unsupported code language' });
                        return;
                }

                if (codeFilePath) {
                    console.log(codeFilePath);
                    try {
                        fs.writeFileSync(codeFilePath, codeSnippet);
                    } catch (error) {
                        res.status(500).json({ error: 'Failed to write code file' });
                        return;
                    }
                } else {
                    res.status(500).json({ error: 'Code file path is not defined' });
                    return;
                }

                let dockerCommandToExecute;

                switch (language) {
                    case 'JavaScript':
                        dockerCommandToExecute = `docker run --rm -v ${codeExecutionPath}:/app/sandbox/code-execution judge0-image:2.0 node /app/sandbox/code-execution/code.js`;
                        break;
                    case 'python':
                        dockerCommandToExecute = `docker run --rm -v ${codeExecutionPath}:/app/sandbox/code-execution judge0-image:2.0 python3 /app/sandbox/code-execution/code.py`;
                        break;
                    case 'c++':
                        dockerCommandToExecute = `docker run --rm -v ${codeExecutionPath}:/app/sandbox/code-execution judge0-image:2.0 sh -c "g++ /app/sandbox/code-execution/code.cpp -o /app/sandbox/code-execution/code && /app/sandbox/code-execution/code"`;

                        break;
                    case 'c':
                        dockerCommandToExecute = `docker run --rm -v ${codeExecutionPath}:/app/sandbox/code-execution judge0-image:2.0 "gcc /app/sandbox/code-execution/code.c -o /app/sandbox/code-execution/code && /app/sandbox/code-execution code"`;
                        break;
                    default:
                        res.status(422).json({ error: 'Unsupported code language' });
                        return;
                }

                console.log(dockerCommandToExecute);
                let childProcess = spawn(dockerCommandToExecute, [], { shell: true });

                let outputChunks = [];

                childProcess.stdout.on('data', (data) => {
                    outputChunks.push(data);
                });

                childProcess.stderr.on('data', (data) => {
                    errorOccurred = true;
                    console.error(data.toString());
                });

                childProcess.on('close', async (code) => {
                    if (errorOccurred) {
                        res.status(500).json({ error: 'Code execution failed' });
                        return;
                    }
                    if (code === 0) {

                        const executionResult = Buffer.concat(outputChunks).toString();
                        console.log(executionResult);

                        const update = {
                            $set: {
                                output: executionResult,
                            },
                        };

                        try {
                            const result = await codeCollection.insertOne(codeExecutionDetails, update);
                            res.send({ Output: executionResult });
                        } catch (error) {
                            console.error(error);
                            res.status(500).json({ error: 'Failed to store code execution details' });
                        }
                    } else {
                        console.error(executionResult);
                        res.status(500).json({ error: 'Code execution failed' });
                    }
                });
            } catch (error) {
                console.error(error);
                res.status(400).json({ error: error.message });
            }
        });
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