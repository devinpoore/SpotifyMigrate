// NPM dependencies
var express = require("express");
var request = require("request");
var axios = require("axios");
var cors = require("cors");
var env = require("dotenv");

// Native Node modules
var querystring = require("querystring");

// Configure environment variable handling
env.config();

// Instantiate express server
var app = express();
// Configuring express server
app.use(cors());


app.use(express.json({ limit: 5242880 }));
app.use(express.urlencoded({ limit: 5242880, extended: false }));

const PORT = process.env.PORT || 3500;

//------------------------------------------------------------------------------

//
app.get("/login/:auth", function(req, res) {
    const callback = "http://localhost:3500/callback/" + req.params.auth;
    var redirect_uri = process.env.REDIRECT_URI || callback;
    
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

    res.redirect(query);
});

//
app.get("/callback/:auth", function (req, res) {
    const callback = "http://localhost:3500/callback/" + req.params.auth;
    var redirect_uri = process.env.REDIRECT_URI || callback;
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
        let access_token = body.access_token
        console.log(`${req.params.auth}:\n${access_token}\n`);
        let uri = process.env.FRONTEND_URI || 'http://localhost:3000'
        // send requestedData back with redirect
        // insert another parameter here to indicate which auth you're redirecting from
        res.redirect(uri + '?auth=' + req.params.auth + '&access_token=' + access_token);
    });
});

// SPOTIFY API DATA ROUTES
// --------------------------------------------------------------------------

//
const spotifyAPI_GetUser = async (token) => {
    try {
        const userData = await axios.get(`https://api.spotify.com/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
        return userData.data;
    } catch (apiError) {
        console.log(apiError);
    }
}

// TODO: These 2 routes could be combined using an extra parameter & ternary
//
app.get("/new-user-data/get/:token", async (req, res) => {
    const toClientData = await spotifyAPI_GetUser(req.params.token);
    res.json(toClientData);
});

//
app.get("/migration-data/get/:token", async (req, res) => {
    const toClientData = await gatherData(req.params.token);
    res.json(toClientData);
});

// 
const gatherData = async (token) => {
    const migrationData = {};    
    
    // TODO: Refactor these functions
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
            if (rawTrackData.total > trackArray.length) {
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
                        id: playlist.id,
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
    
    // If a token is provided, call each function above and populate the migrationData object
    if (token) {
        const userData = await spotifyAPI_GetUser(token);
        migrationData["user"] = userData;

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
}

// may need to refactor the playlist POST out into its own route to stay restful
app.put("/migration-data/put/:token/:new_user_id", async (req, res) => {
    const { token, new_user_id } = req.params;
    console.log("Entering into toClientPutData...\n");

    const toClientPutData = await putData(token, new_user_id, req.body);

    console.log("Exiting toClientPutData...\n");
    // console.log(toClientPutData);

    res.json(toClientPutData);
});

//
const putData = async (token, newUserID, data) => {
    const migrateResults = {};
    
    //
    const spotifyAPI_PutTracks = async (trackData, index=0) => {
        try {           
            const recurse = ((trackData.length - 1) - (index + 50)) > 0;
            
            const offset = recurse ? 49 : (trackData.length - index) - 1;
            var tracksThisQuery = "";
            
            for (var i = index; i < (index + offset); i++) {
                tracksThisQuery+=`${trackData[i].id},`
            }            
            tracksThisQuery+=`${trackData[(index + offset)].id}`;

            var putStatus;
            await axios.put(
                `https://api.spotify.com/v1/me/tracks?ids=${tracksThisQuery}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            ).then(response => putStatus = response.status);

            if (recurse) {
                return spotifyAPI_PutTracks(trackData, index+=50);
            }

            return putStatus;

        } catch (apiError) {
            console.log("API ERROR:\n\n", apiError);
        }
    }

    //
    const spotifyAPI_PutAlbums = async (albumData, index=0) => {
        try {           
            const recurse = ((albumData.length - 1) - (index + 50)) > 0;
            
            const offset = recurse ? 49 : (albumData.length - index) - 1;
            var albumsThisQuery = "";
            
            for (var i = index; i < (index + offset); i++) {
                albumsThisQuery+=`${albumData[i].id},`
            }            
            albumsThisQuery+=`${albumData[(index + offset)].id}`;

            var putStatus;
            await axios.put(
                `https://api.spotify.com/v1/me/albums?ids=${albumsThisQuery}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            ).then(response => putStatus = response.status);

            if (recurse) {
                return spotifyAPI_PutAlbums(albumData, index+=50);
            }

            return putStatus;

        } catch (apiError) {
            console.log("API ERROR:\n\n", apiError);
        }
    }

    //
    const spotifyAPI_PutArtists = async (artistData, index=0) => {
        try {           
            const recurse = ((artistData.length - 1) - (index + 50)) > 0;
            
            const offset = recurse ? 49 : (artistData.length - index) - 1;
            var artistsThisQuery = "";
            
            for (var i = index; i < (index + offset); i++) {
                artistsThisQuery+=`${artistData[i].id},`
            }            
            artistsThisQuery+=`${artistData[(index + offset)].id}`;

            var putStatus;
            await axios.put(
                `https://api.spotify.com/v1/me/following?type=artist&ids=${artistsThisQuery}`,
                {},
                { headers: { Authorization: `Bearer ${token}` } }
            ).then(response => {
                console.log(response);
                return putStatus = response.status;
            });

            if (recurse) {
                return spotifyAPI_PutArtists(artistData, index+=50);
            }

            return putStatus;

        } catch (apiError) {
            console.log("API ERROR:\n\n", apiError);
        }
    }

    //
    const spotifyAPI_PostPlaylists = async (playlistData) => {
        const playlistPostResults = {};

        const buildPostError = (axiosErrorRes, originalPlaylistID="") => {
            const errObj = {
                status: axiosErrorRes.response.status,
                text: axiosErrorRes.response.statusText,
                message: axiosErrorRes.response.data.error.message,
                originalID: originalPlaylistID
            };
            return errObj;
        }

        //
        const spotifyAPI_GetPlaylistTracks = async (trackQuery, offset=0, trackArray=[]) => {
            try {

                // TODO: add fields to get more specific json response
                const trackData = await axios.get(
                    `${trackQuery}?limit=50&offset=${offset}`,
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const rawTrackData = trackData.data;

                if (rawTrackData.items) {
                    for (const track of rawTrackData.items) {
                        trackArray.push(track.track.uri)
                    }
                }

                if (rawTrackData.total > trackArray.length) {
                    return spotifyAPI_GetPlaylistTracks(trackQuery, offset+=50, trackArray);
                }

                return trackArray;

            } catch (apiError) {
                // tailor the error handling here too
                console.log(apiError);
            }
        }
        
        //
        const spotifyAPI_PostPlaylistTracks = async (originID, playlistTrackArray, id, index=0) => {
            try {

                // Incrementing through the playlistTrackArray by 40 rather than 50 like the functions above
                // because this POST method requires a comma separated list of track URIs rather than IDs -
                // URIs contain extra characters so I want to stay safely within the bounds of the HTTP URL
                // limit. - DP, 3.16.20
                
                const recurse = ((playlistTrackArray.length - 1) - (index + 40)) > 0; // if true, we need to recurse

                const offset = recurse ? 39 : (playlistTrackArray.length - index) - 1;
                var tracksThisQuery = "";

                for (var i = index; i < (index + offset); i++) {
                    tracksThisQuery += `${playlistTrackArray[i]},`
                }
                tracksThisQuery += `${playlistTrackArray[(index + offset)]}`;

                var postStatus;

                await axios.post(
                    `https://api.spotify.com/v1/playlists/${id}/tracks?uris=${tracksThisQuery}`,
                    {},
                    { headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }}
                ).then(response => {
                    const postSuccessObj = {
                        status: response.status,
                        text: response.statusText,
                        data: response.data
                    }
                    console.log(postSuccessObj);
                    postStatus = postSuccessObj;
                });

                if (recurse) {
                    return spotifyAPI_PostPlaylistTracks(playlistTrackArray, id, index += 40);
                }

                return postStatus;

            } catch (apiError) {

                var deletionData;

                await axios.delete(
                    `https://api.spotify.com/v1/playlists/${id}/followers`,
                    { headers: { Authorization: `Bearer ${token}` }}
                ).then(delRes => {
                    console.log(delRes.status);
                    deletionData = delRes;
                });

                const error = buildPostError(apiError);
                error.originalID = originID;
                error.playlistRemoved = deletionData.status === 200 ? true : false;

                return error;
            }
        }

        //
        const buildPlaylist = async (playlistObj) => {
            try {
                const postRes = await axios.post(
                    `https://api.spotify.com/v1/users/${newUserID}/playlists`,
                    {
                        name: playlistObj.name,
                        public: playlistObj.public,
                        collaborative: playlistObj.collab,
                        description: playlistObj.description
                    },
                    {headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/json"
                    }}
                );
    
                const playlistID = postRes.data.id;
                console.log(`Playlist ID: ${playlistID}\n`);
        
                console.log("Entering getPlaylistTracks...\n");
                const playlistTracks = await spotifyAPI_GetPlaylistTracks(playlistObj.tracksInfo.href);
                console.log("Exiting getPlaylistTracks...\n");
        
                // if getting the tracks was a success, then post
        
                console.log("Entering postPlaylistTracks...\n");
                const postTracksStatus = await spotifyAPI_PostPlaylistTracks(playlistObj.id, playlistTracks, playlistID);
                console.log("Exiting postPlaylistTracks...\n");
        
                // if the response code is bad, remove the playlist
    
                playlistPostResults[playlistID] = postTracksStatus;
    
            } catch (apiError) {
                console.log(apiError);
            }    
        }
        
        for (playlist of playlistData) {
            await buildPlaylist(playlist);
        }

        // await buildPlaylist(playlistData[50]);

        return playlistPostResults;
    }
    
    const { user, savedTracks, savedAlbums, following, playlists } = data;

    if (token) {
        const putTracksStatus = await spotifyAPI_PutTracks(savedTracks);
        migrateResults["putTracks"] = putTracksStatus;

        const putAlbumsStatus = await spotifyAPI_PutAlbums(savedAlbums);
        migrateResults["putAlbums"] = putAlbumsStatus;

        const putArtistsStatus = await spotifyAPI_PutArtists(following);
        migrateResults["putArtists"] = putArtistsStatus;
        
        const postPlaylistsStatus = await spotifyAPI_PostPlaylists(playlists);
        migrateResults["postPlaylists"] = postPlaylistsStatus;
    }

    return migrateResults;
}

//
app.listen(PORT, function() {
    console.log(`\nServer listening on PORT: ${PORT}\n`);
});