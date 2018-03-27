//this is functional for any reminder querys at the moment. 
//note: change sessionId, and 'tomorrow' should be the <text query>
var apiai = require('apiai');

var app = apiai(process.env.APIAI_CLIENT_TOKEN);

var request = app.textRequest('tomorrow', {
    sessionId: '1'
});

request.on('response', function (response) {
    console.log(response);
});

request.on('error', function (error) {
    console.log(error);
});

request.end();