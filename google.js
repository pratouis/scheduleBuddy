'use strict';
import { google } from 'googleapis';
const OAuth2Client = google.auth.OAuth2;
const keys = require('./client_secret.json').installed;
const express = require('express');
const router = new express.Router();
import crypto from 'crypto';

import { User } from './models/models';

const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = keys.redirect_uris[0];

const oauth2Client = new OAuth2Client(process.env.GOOGLE_CAL_CLIENT_ID,
  process.env.GOOGLE_CAL_SECRET, "/oauthcb");
// const url = oauth2Client.generateAuthUrl({
//   access_type: 'offline', // will return a refresh token
//   scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
//   redirect_uri: `http://localhost:3000${REDIRECT_URL}`,
// });


/*
* documentation: https://www.npmjs.com/package/googleapis#generating-an-authentication-url
*/
const generateAuthCB = (slackID) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // will return a refresh token
    scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
    redirect_uri: `http://localhost:3000${REDIRECT_URL}`,
    state: slackID, // state is a query param passed to redirect_uri
  })
}

/*
*
*/
const hashCal = (gCalAUTH) => {
  const hash = crypto.createHash('md5');
  hash.update(gCalAUTH);
  return hash.digest('hex');
}

router.get(REDIRECT_URL, async (req, res) => {
  console.log('inside router')
  // TODO import express BODY PARSER
    try {
      // let slackID = req.query.state;
      let user = await User.findOneAndUpdate(
        { slackID: req.query.state },
        { "googleCalAuth": req.query.code },
        { returnNewDocument: true }
      );
      console.log(user);
      res.status(200).send('Thanks for connecting your calendar!  You can go back to Slack and talk to @buddy');
    } catch (err) {
      console.log('error in updating user: ', err);
      res.status(500).send(err);
    }
});

// app.get('/', (req, res) => {
//   if (!auth) {
//     res.redirect(url);
//   } else {
//     res.send("Your code is " + auth);
//   }
// })
//
// app.get(REDIRECT_URL, (req, res) => {
//   console.log(req.query)
//   auth = req.query.code;
//   res.redirect('/')
// });



// function getAccessToken (oauth2Client, callback) {
//   // generate consent page url
//
//   debugger;
//   console.log('Visit the url: ', url);
//   rl.question('Enter the code here:', code => {
//     // request access token
//     oauth2Client.getToken(code, (err, tokens) => {
//       if (err) {
//         return callback(err);
//       }
//       // set tokens to the client
//       // TODO: tokens should be set by OAuth2 client.
//       oauth2Client.setCredentials(tokens);
//       callback();
//     });
//   });
// }

module.exports = {
  googleRoutes: router,
  generateAuthCB: generateAuthCB
};
