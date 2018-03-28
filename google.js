/*
* This file is for interacting with google calendar
*/

'use strict';
import { google } from 'googleapis';
const OAuth2Client = google.auth.OAuth2;
const keys = require('./client_secret2.json').web;
const express = require('express');
const router = new express.Router();
import crypto from 'crypto';

import { User } from './models/models';

const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = "/oauthcb";

const oauth2Client = new OAuth2Client(CLIENT_ID,
  CLIENT_SECRET, keys.redirect_uris[0]);

/*
* documentation: https://www.npmjs.com/package/googleapis#generating-an-authentication-url
*/
const generateAuthCB = (slackID) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // will return a refresh token
    scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
    redirect_uri: `${keys.redirect_uris[0]}`,
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

/* buffer must be 16 for hex, and key must fit */
const buffers = {
    iv: crypto.pseudoRandomBytes(16),
    key: new Buffer(process.env.ENCRYPTION_KEY),
}

const encryptGoogleCalAuth = (tokens) => {
  console.log(tokens)
  const { access_token, refresh_token, expiry_date } = tokens;
  console.log(access_token, refresh_token, expiry_date)
  let text = ""
  try {
    text = JSON.stringify(tokens);
    let cipher = crypto.createCipheriv("aes128", buffers.key, buffers.iv);
    let result = cipher.update(text, "utf8", "hex");
    result += cipher.final("hex");
    return result;
  }catch (err) {
    console.error(err)
    return text;
  }

}

const decryptGoogleCalAuth = (text) => {
  let decipher = crypto.createDecipheriv("aes128", buffers.key, buffers.iv);
  let result = decipher.update(text, "hex");
  result += decipher.final();
  console.log(result)
  return JSON.parse(result);
}

router.get(REDIRECT_URL, (req, res) => {
  console.log('inside router')
  console.log(req.query);
  oauth2Client.getToken(req.query.code, (err, token) => {
    if(err) {
      console.error('error in retrieving token: ',err)
      res.status(500).json(err);
    }
    console.log(token)
    const encryptTokens = token;
    // const encryptTokens = encryptGoogleCalAuth(token);
    User.findOneAndUpdate(
      { slackID: req.query.state },
      { $set: { "googleCalAuth": encryptTokens } },
      { new: true }
    ).then((user) => {
      console.log('updated user? ',user);
      res.status(200).json(token);
    }).catch((err) => {
      console.error('error in updating user: ',err);
      res.status(500).send(err);
    })
  });
  // if (err) return callback(err);
  //     oAuth2Client.setCredentials(token);)
  // .then((tokens) => console.log('tokens from getToken: ',tokens))
  // .catch(err => console.log('error in getToken: ',err))
  // TODO import express BODY PARSER

      // let slackID = req.query.state;
      // console.log('query: ', req.query);
      // oauth2Client.getToken(req.query.code, (err, token) => {
      //   if(err){
      //     console.error('error in retrieving token: ', err);
      //     res.status(500).send(err);
      //     return;
      //   }
      //   console.log(token);
      //   const encryptTokens = encryptGoogleCalAuth(res);
      //   console.log(assert.equal(tokens,decryptGoogleCalAuth(encryptTokens)));
      //   User.findOneAndUpdate(
      //     { slackID: req.query.state },
      //     { $set: { "googleCalAuth": encryptTokens } },
      //     { new: true }
      //   ).then((user) => {
      //     console.log('updated user? ',user);
      //     res.status(200).json(token);
      //   }).catch((err) => {
      //     console.error('error in updating user: ',err);
      //     res.status(500).send(err);
      //   })
      // });
      // console.log(res.data);
      // const encryptTokens = encryptGoogleCalAuth(res);
      // console.log(assert.equal(tokens,decryptGoogleCalAuth(encryptTokens)));
      // let user = await User.findOneAndUpdate(
      //   { slackID: req.query.state },
      //   { $set: { "googleCalAuth": encryptTokens } },
      //   { new: true }
      // );
      // console.log(user);
      // res.status(200).json(res);
      // res.status(200).send('Thanks for connecting your calendar!  You can go back to Slack and talk to @buddy');
    // } catch (err) {
    //   console.log('error in updating user: ', err);
    //   res.status(500).send(err);
    // }
});

// const testEncryption


const getEvents = (slackID) => {
    User.findOne({ slackID: slackID }, function(err, user) {
      if(err){
        console.error(err);
        return;
      }else{
        // let tokens = decryptGoogleCalAuth(user.googleCalAuth);
        let tokens = JSON.parse(user.googleCalAuth);
        console.log(tokens);
        oauth2Client.setCredentials(tokens);
        const calendar = google.calendar({version: 'v3', auth: oauth2Client})
        console.log(calendar);
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
        })
      }
    })

}



module.exports = {
  googleRoutes: router,
  generateAuthCB: generateAuthCB,
  getEvents: getEvents
};
