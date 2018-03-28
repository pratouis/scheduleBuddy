/*
* HTTP Cloud Function.
*
* @param {Object} req Cloud Function request context.
* @param {Object} res Cloud Function response context.
*/
exports.scheduleBuddy = function scheduleBuddy(req, res) {
    // response = "This is a sample response from your webhook!" //Default response from the webhook to show it's working
    // response = req;
    console.log('hi hello friend');
    console.log('request: ', req);
    response = "I've successfully updated your calendar!"

    res.setHeader('Content-Type', 'application/json'); //Requires application/json MIME type
    // res.send(req);
    
    res.send(JSON.stringify({
        "speech": response, "displayText": response
        //"speech" is the spoken version of the response, "displayText" is the visual version
    }));
};