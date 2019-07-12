// requiring my node module dependencies
var express = require("express");
var request = require("request");
var querystring = require("querystring");
var path = require("path");

// environment variable handling
require("dotenv").config();
var keys = require("./keys.js");

// instantiating an express server object
var app = express();

const PORT = process.env.PORT || 3500;

var redirect_uri = process.env.REDIRECT_URI || "https://localhost:3500/callback";

app.get("/", function(req, res) {
    res.sendFile(path.join(__dirname, "index.html"));
});

var scopes = [
    "user-top-read",
    "user-read-recently-played",
    "user-library-read",
    "user-library-modify",
    "user-read-private",
    "user-read-birthdate",
    "user-read-email",
    "user-follow-read",
    "user-follow-modify",
    "playlist-read-private",
    "playlist-modify-private",
    "playlist-read-collaborative",
    "playlist-modify-public"
].join(" ");

var query = "https://accounts.spotify.com/authorize?" + querystring.stringify({
    response_type: "code",
    client_id: keys.spotify.id,
    scope: scopes,
    redirect_uri: redirect_uri
});

console.log(query);

app.get("/login", function(req, res) {
    res.redirect(query);
});

app.get("/callback", function (req, res) {
    console.log(req);
    let code = req.query.code || null;
    let authOptions = {
        url: 'https://accounts.spotify.com/api/token',
        form: {
            code: code,
            redirect_uri: redirect_uri,
            grant_type: 'authorization_code'
        },
        headers: {
            'Authorization': 'Basic ' + (Buffer.from(
                keys.spotify.id + ':' + keys.spotify.secret
            ).toString('base64'))
        },
        json: true
    };
    request.post(authOptions, function (error, response, body) {
        var access_token = body.access_token
        let uri = process.env.FRONTEND_URI || 'https://localhost:3500'
        res.redirect(uri + '?access_token=' + access_token)
    });
});

app.listen(PORT, function() {
    console.log("Server listening on PORT: " + PORT);
});