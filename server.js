const http = require("http");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");
const cookie = require("cookie");
const uploadersJson = require("./uploaders.json");
const securityJson  = require("./security.json");
const {google} = require('googleapis');
const { Readable } = require('stream');

let validateAuthToken = [];

const indexHtmlFile =   fs.readFileSync(path.join(__dirname, "statick", "index.htm"));
const scriptJsFile  =   fs.readFileSync(path.join(__dirname, "statick", "script.js"));
const loginHtmlFile =   fs.readFileSync(path.join(__dirname, "statick", "login.htm"));

const server = http.createServer((req, res) => {
    if (req.method === "GET") {
        switch (req.url) {
            case '/':           return res.end(loginHtmlFile);
            default:            return guarded(req, res);
        }
    }
    if (req.method === "POST") {
        switch (req.url) {
            case '/api/login':  return login(req, res);
        }
    }
    return res.end("Error 404");
});

const io = new Server(server);

io.use((socket, next) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie || '');
    console.log(socket.handshake.headers.cookie );
    
    const creds = getCredentials(cookies.token);
    if (!creds) {
        next(new Error("No auth"));
    } else {
        socket.credentials = creds;
        next();
    }
});

function getCredentials(token = '') {
    if (!token || !validateAuthToken.includes(token)) return null;
    const [userId, login] = token.split(".");
    if (!userId || !login) return null;
    return { userId, login };
}

function guarded(req, res) {
    const cookies = cookie.parse(req.headers.cookie || '');
    const creds = getCredentials(cookies.token);
    if (!creds) {
        res.writeHead(302, { "Location": "/" });
        return res.end();
    }
    if (req.method === "GET") {
        switch (req.url) {
            case "/dashboard": return res.end(indexHtmlFile);
            case "/script.js": return res.end(scriptJsFile);
        }
    }
}

async function login(req, res) {
    let data = "";
    req.on("data", (chunk) => {
        data += chunk;
    });
    
    req.on("end", async () => {
        try {
            const parsedData = JSON.parse(data);
            
            if (uploadersJson[parsedData.login] !== undefined && uploadersJson[parsedData.login] === parsedData.password) {
                const token = parsedData.login + "." + [...Array(200)].map(() => Math.random().toString(36)[2]).join(''); 
                validateAuthToken.push(token);
                
                res.writeHead(200, {
                    'Set-Cookie': cookie.serialize('token', String(token), {
                        httpOnly: true,  
                        maxAge: 60 * 2,  
                        sameSite: 'lax'
                    }),
                    'Content-Type': 'application/json'
                });
                
                res.end(JSON.stringify({
                    token: token
                }));
            } else {
                res.writeHead(401, {'Content-Type': 'text/plain'});
                res.end('Invalid login or password');
            }
        } catch (error) {
            console.error("Error parsing JSON:", error);
            res.writeHead(400, {'Content-Type': 'text/plain'});
            res.end('Invalid JSON');
        }
    });
}

async function uploadData(name, fileData) {
    const auth = new google.auth.GoogleAuth({
        credentials: securityJson,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const bufferStream = new Readable();
    bufferStream.push(fileData);
    bufferStream.push(null);

    const response = await drive.files.create({
        requestBody: {
            name: name,
            mimeType: 'application/octet-stream',
            parents: ['1DAdMJLu3tzg45oqmm4lptxi-grQcnSi6'],
        },
        media: {
            mimeType: 'application/octet-stream',
            body: bufferStream,
        },
    });

    return response;
}


io.on('connection', (socket) => {
    socket.on('upload_file', async (data, callback) => {
        const { fileName, fileData } = data;

        try {
            const response = await uploadData(fileName, Buffer.from(fileData));
            console.log('File uploaded:', response.data.name);
            callback({
                status: 200,
                text: "File was uploaded: " + response.data.name,
            });
        } catch (err) {
            console.error('File upload error:', err);
            callback({
                text: err.message,
            });
        }
    });

    socket.on('disconnect', () => {
        const tokenIndex = validateAuthToken.indexOf(socket.userToken);
        if (tokenIndex > -1) {
            validateAuthToken.splice(tokenIndex, 1);
            console.log(`Token ${socket.userToken} removed`);
        }
    });
});

server.listen(3000);