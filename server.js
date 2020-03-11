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

//
app.get("/migration-data/:token", async (req, res) => {
    const toClientData = await gatherData(req.params.token);
    res.json(toClientData);
})

// 
const gatherData = async (token) => {
    const migrationData = {};

    //
    const spotifyAPI_GetTracks = async (offset = 0, trackArray = []) => {
        try {
            const trackData = await axios.get(
                `https://api.spotify.com/v1/me/tracks?limit=50&offset=${offset}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );            

            const rawTrackData = trackData.data;
            
            if (rawTrackData.items) {
                for (const track of rawTrackData.items) {
                    const newTrackObj = {
                        name: track.track.name,
                        album: track.track.album.name,
                        artist: track.track.artists[0].name,
                        id: track.track.id
                    }
                    trackArray.push(newTrackObj);
                }
            }
            // TODO: Change this to rawTrackData.Total for production
            if (201 > trackArray.length) {
                return spotifyAPI_GetTracks(offset+=50, trackArray);
            }

            return trackArray;

        } catch (apiError) {
            console.log(apiError);
        }
    }

    //
    const spotifyAPI_GetAlbums = async (offset=0, albumArray=[]) => {
        try {
            const albumData = await axios.get(
                `https://api.spotify.com/v1/me/albums?limit=50&offset=${offset}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            
            const rawAlbumData = albumData.data;

            if (rawAlbumData.items) {
                for (const album of rawAlbumData.items) {
                    const newAlbumObj = {
                        name: album.album.name,
                        artist: album.album.artists[0].name,
                        id: album.album.id,
                        coverURL: album.album.images[1] ? album.album.images[1].url :
                                  album.album.images[0] ? album.album.images[0].url : ""
                    }
                    albumArray.push(newAlbumObj);
                }
            }

            if (rawAlbumData.total > albumArray.length) {
                return spotifyAPI_GetAlbums(offset+=50, albumArray);
            }

            return albumArray;

        } catch (apiError) {
            console.log(apiError);
        }
    }

    //
    const spotifyAPI_GetPlaylists = async (offset=0, playlistArray=[]) => {
        try {
            const playlistData = await axios.get(
                `https://api.spotify.com/v1/me/playlists?limit=50&offset=${offset}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const rawPlaylistData = playlistData.data;

            if (rawPlaylistData.items) {
                for (const playlist of rawPlaylistData.items) {
                    const newPlaylistObj = {
                        name: playlist.name,
                        public: playlist.public,
                        collab: playlist.collaborative,
                        description: playlist.description,
                        tracksInfo: playlist.tracks,
                        coverURL: playlist.images[0] ? playlist.images[0].url : ""
                        // cover art details - this is a whole other thing
                    }
                    playlistArray.push(newPlaylistObj);
                }
            }

            if (rawPlaylistData.total > playlistArray.length) {
                return spotifyAPI_GetPlaylists(offset+=50, playlistArray);
            }

            return playlistArray;
        } catch (apiError) {
            console.log(apiError);
        }
    }

    //
    const spotifyAPI_GetArtists = async (after="", followingArray=[]) => {
        try {
            const followingData = await axios.get(
                `https://api.spotify.com/v1/me/following?type=artist&limit=50${after}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            const rawFollowingData = followingData.data;

            if (rawFollowingData.artists.items) {
                for (const artist of rawFollowingData.artists.items) {
                    const newFollowingObj = {
                        name: artist.name,
                        id: artist.id,
                        pictureURL: artist.images[1] ? artist.images[1].url :
                                    artist.images[0] ? artist.images[0].url : ""
                    }
                    followingArray.push(newFollowingObj);
                }
            }

            if (rawFollowingData.total > followingArray.length) {
                let afterID = rawFollowingData.cursors.after;
                return spotifyAPI_GetPlaylists(`&after=${afterID}`, playlistArray);
            }

            return followingArray;
        } catch (apiError) {
            console.log(apiError);
        }
    }
    
    if (token) {

        const trackData = await spotifyAPI_GetTracks();
        migrationData["savedTracks"] = trackData;

        const albumData = await spotifyAPI_GetAlbums();
        migrationData["savedAlbums"] = albumData;

        const playlistData = await spotifyAPI_GetPlaylists();
        migrationData["playlists"] = playlistData;

        const followingData = await spotifyAPI_GetArtists();
        migrationData["following"] = followingData;
    }

    return migrationData;

    // const endpoints = [
    //     { key: "user", endpoint: "" },
    //     // { key: "recentlyPlayed", endpoint: "/player/recently-played?limit=50" },
    //     { key: "savedTracks", endpoint: "/tracks?limit=50" },
    //     // { key: "savedAlbums", endpoint: "/albums" },
    //     // { key: "playlists", endpoint: "/playlists" }
    //     // { key: "following", endpoint: "/following?type=artist&limit=50" }
    // ];

    // // Nesting a function inside another is called CLOSURE. It's helpful in this situation because it allows me to localize the instantiation
    // // of the migrateData object, rather than trying to manage it globally and I know it will always be in scope when spotifyAPI_Get is called
    // const spotifyAPI_Get = async (endpoint, key) => {
    //     // let offset = 0;
    //     try {
    //         const apiData = await axios.get(`https://api.spotify.com/v1/me${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
            
    //         // Check to see if there's more data to pull
    //         // not applicable to user data
    //         // applicable to tracks, albums, followed artists/users
            
    //         // build full data object to be added to migrationData            
    //         // structure data appropriately

    //         // const rawData = apiData.data;
    //         // const structuredData = await structureData(rawData, key);
    //         // change this assignment to structuredData
    //         migrationData[key] = apiData.data;
    //     } catch (apiError) {
    //         console.log(apiError.data);
    //     }
    // };

    // const structureData = (rawData, key) => {
    //     switch(key) {
    //         case "recentlyPlayed":
    //             structureRecentlyPlayed();
    //             break;
    //     }
    // }


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

        //     const followingData = await axios.get("https://api.spotify.com/v1/me/following", { headers: { Authorization: `Bearer ${token}` } });
        //     migrationData["following"] = followingData.data;
        // } catch (err) {
        //     console.log(err);
        // }
}

app.listen(PORT, function() {
    console.log("Server listening on PORT: " + PORT);
});