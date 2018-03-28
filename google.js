/*
* This file is for interacting with google calendar
*/

'use strict';
import { google } from 'googleapis';
const OAuth2Client = google.auth.OAuth2;
// const keys = require('./client_secret.json').installed;
const express = require('express');
const router = new express.Router();
import crypto from 'crypto';

import { User } from './models/models';

const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = "/oauthcb";

const oauth2Client = new OAuth2Client(CLIENT_ID,
  CLIENT_SECRET, REDIRECT_URL);
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
    redirect_uri: `http://localhost:3000/${REDIRECT_URL}`,
    state: slackID, // state is a query param passed to redirect_uri,
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
      console.log(req.query.code);
      let user = await User.findOneAndUpdate(
        { slackID: req.query.state },
        { $set: { "googleCalAuth": req.query.code } },
        { new: true }
      );
      console.log(user);
      res.status(200).send('Thanks for connecting your calendar!  You can go back to Slack and talk to @buddy');
    } catch (err) {
      console.log('error in updating user: ', err);
      res.status(500).send(err);
    }
});

const getEvents = async (slackID) => {
  try {
    console.log('inside getEvents');
    console.log(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL)
    let user = await User.findOne({ slackID: slackID });
    console.log(user);
    oauth2Client.setCredentials(user.googleCalAuth);
    const calendar = google.calendar({version: 'v3', oauth2Client})
    calendar.events.list({
      calendarId: 'primary',
      timeMin: (new Date()).toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    }, (err, data) => {
      if (err) return console.log('The API returned an error: ' + err);
      const events = data.data.items;
      if (events.length) {
        console.log('Upcoming 10 events:');
        const temp = events.map((event, i) => {
        const start = event.start.dateTime || event.start.date;
          console.log(`${start} - ${event.summary}`);
          return `${start} - ${event.summary}`;
        });
        // return temp;
      } else {
        console.log('No upcoming events found.');
        // return 'No upcoming events found.';
      }
    });
  } catch(err) {

  }
}

router.get('/listEvents/:slackID',  async (req, res) => {
  try {

  } catch(err) {
    res.status(500).json(err);
  }
});
// TODO set reminder
// TODO set meeting

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
  generateAuthCB: generateAuthCB,
  getEvents: getEvents
};
