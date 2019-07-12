var urlQuery = "https://accounts.spotify.com/authorize?client_id=5972adad168c4c24843f1fe191ec51ce&response_type=code&redirect_uri=https://www.spotifymigrate.com&scope=user-read-private%20user-read-recently-played%20user-read-email"


$.ajax({
    url: urlQuery,
    method: "GET"
}).then(function (response) {
    console.log(response);
});