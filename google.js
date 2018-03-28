'use strict';

const {google} = require('googleapis');
const OAuth2Client = google.auth.OAuth2;

const keys = require('./client_secret.json').installed;

const express = require('express')
const app = express();
const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = keys.redirect_uris[0];

const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline', // will return a refresh token
  scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
  redirect_uri: `http://localhost:3000${REDIRECT_URL}`,
});

let auth = ''

app.get('/', (req, res) => {
  if (!auth) {
    res.redirect(url);
  } else {
    res.send("Your code is " + auth);
  }
})

app.get(REDIRECT_URL, (req, res) => {
  console.log(req.query)
  auth = req.query.code;
  res.redirect('/')
});

app.listen(3000)

function getAccessToken (oauth2Client, callback) {


  console.log('Visit the url: ', url);
  rl.question('Enter the code here:', code => {
    // request access token
    oauth2Client.getToken(code, (err, tokens) => {
      if (err) {
        return callback(err);
      }

      oauth2Client.setCredentials(tokens);
      callback();
    });
  });
}
