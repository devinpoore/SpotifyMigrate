// requiring my node module dependencies
var express = require("express");
var request = require("request");
var querystring = require("querystring");
var path = require("path");

var axios = require("axios");

var cors = require("cors");

// environment variable handling
require("dotenv").config();
var keys = require("./keys.js");

// instantiating an express server object
var app = express();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const PORT = process.env.PORT || 3500;

var redirect_uri = process.env.REDIRECT_URI || "http://localhost:3500/callback";

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
    client_id: process.env.SPOTIFY_ID,
    scope: scopes,
    redirect_uri: redirect_uri
});

// console.log(query);

const requestedData = {};

// TODO: Add relevant params and build object with info about what data to request from Spotify
app.get("/login", function(req, res) {
    // populate requestedData with params
    res.redirect(query);
});

var access_token = "";

app.get("/callback", function (req, res) {
    // console.log(req.query.code);
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
                process.env.SPOTIFY_ID + ':' + process.env.SPOTIFY_SECRET
            ).toString('base64'))
        },
        json: true
    };
    request.post(authOptions, function (error, response, body) {
        access_token = body.access_token
        console.log(access_token);
        let uri = process.env.FRONTEND_URI || 'http://localhost:3000'
        // send requestedData back with redirect
        res.redirect(uri + '?access_token=' + access_token)
    });
});

// SPOTIFY API DATA ROUTES
// --------------------------------------------------------------------------

// app.get("/recently-played/:token", (req, res) => {
//     const token = req.params.token;
//     axios.get("https://api.spotify.com/v1/me/player/recently-played", { headers: { Authorization: `Bearer ${token}` } }).then(response => {
//         console.log(response.data);
//         res.json(response.data);
//     });
// });

app.get("/migration-data/:token", async (req, res) => {
    const toClientData = await gatherData(req.params.token);
    res.json(toClientData);
})

//
// const spotifyAPI_Get = async (endpoint, key, token) => {
//     const apiData = await axios.get(`https://api.spotify.com/v1/me${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
//     migrationData[key] = apiData.data;
// }

// 
const gatherData = async (token) => {
    const migrationData = {};

    const endpoints = [
        { key: "user", endpoint: "" },
        { key: "recentlyPlayed", endpoint: "/player/recently-played" },
        { key: "savedTracks", endpoint: "/tracks" },
        { key: "savedAlbums", endpoint: "/albums" },
        { key: "playlists", endpoint: "/playlists" }
        // { key: "following", endpoint: "/following" }
    ];

    // Nesting a function inside another is called CLOSURE. It's helpful in this situation because it allows me to localize the instantiation
    // of the migrateData object, rather than trying to manage it globally and I know it will always be in scope when spotifyAPI_Get is called
    const spotifyAPI_Get = async (endpoint, key) => {
        try {
            const apiData = await axios.get(`https://api.spotify.com/v1/me${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
            migrationData[key] = apiData.data;
        } catch (apiError) {
            console.log(apiError.data);
        }
    };

    if (token) {
        for (endpointObj of endpoints) {
            const { key, endpoint } = endpointObj;
            await spotifyAPI_Get(endpoint, key);
        }
    }

    return migrationData;

        // await axios.get("https://api.spotify.com/v1/me/player/recently-played", { headers: { Authorization: `Bearer ${token}` } }).then(response => {
        //     migrationData["recentlyPlayed"] = response.data;
        // });

        // TODO: Is this strategy more efficient???

        // TODO: These are returning 20 results only - that's okay for api funtionality prototyping, but will eventually need to be refactored into
        //       functions that iterate to grab all available data
        // try {            
        //     const userData = await axios.get("https://api.spotify.com/v1/me", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["user"] = userData.data;
    
        //     const recentlyPlayedData = await axios.get("https://api.spotify.com/v1/me/player/recently-played", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["recentlyPlayed"] = recentlyPlayedData.data;
    
        //     const savedTracksData = await axios.get("https://api.spotify.com/v1/me/tracks", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["savedTracks"] = savedTracksData.data;
    
        //     const savedAlbumsData = await axios.get("https://api.spotify.com/v1/me/albums", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["savedAlbums"] = savedAlbumsData.data;            
            
        //     const playlistsData = await axios.get("https://api.spotify.com/v1/me/playlists", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["playlists"] = playlistsData.data;

        //     TODO: Fix the bug on this request
        //     const followingData = await axios.get("https://api.spotify.com/v1/me/following", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["following"] = followingData.data;
        // } catch (err) {
        //     console.log(err);
        // }
}

app.listen(PORT, function() {
    console.log("Server listening on PORT: " + PORT);
});