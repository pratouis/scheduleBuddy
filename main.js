//this is functional for any reminder querys at the moment. 
//note: change sessionId, and 'tomorrow' should be the <text query>
var apiai = require('apiai');

var app = apiai(process.env.APIAI_CLIENT_TOKEN);

var request = app.textRequest('nap', {
    sessionId: '1'
});

request.on('response', function (response) {
    console.log(response);
    console.log('what to send back: ', response.result.fulfillment.speech);
    console.log('this conversation is not yet complete: ', response.result.parameters);
    console.log('this conversation is not yet complete: ', response.result.actionIncomplete);
});

request.on('error', function (error) {
    console.log(error);
});

request.end();