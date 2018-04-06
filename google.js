/*
* This file is for interacting with google calendar
*/
'use strict';
import { User, Reminder, Meeting, Invite } from './models/models';
/* security.js and routes.js include helper functions related to security and
*   pinging slack API respectively*/
import { encryptGoogleCalAuth, decryptGoogleCalAuth } from './security';
import { getUserInfoByID } from './routes';
import _ from 'underscore';

/* include express and router to handle authentication endpoint */
const express = require('express');
const router = new express.Router();

/* importing google calendar dev authentication */
const keys = require('./client_secret.json').web;
const CLIENT_ID = keys.client_id;
const CLIENT_SECRET = keys.client_secret;
const REDIRECT_URL = "/oauthcb";

/* create global calendar and OAuth2Client
*   - OAuth2Client's credentials are always reset every function call
*/
/* used for google oauth*/
import { google } from 'googleapis';
const calendar = google.calendar({ version: 'v3'});
const OAuth2Client = google.auth.OAuth2;
const oauth2Client = new OAuth2Client(CLIENT_ID,CLIENT_SECRET, keys.redirect_uris[0]);

/* generates authentication URL for a user to grant schedulerbuddy permission
*     to access and write to the user's calendar
*     @param slackID - sets query param state of redirect URL
*     return: URL
*
*     documentation: https://www.npmjs.com/package/googleapis#generating-an-authentication-url
*/
const generateAuthCB = (slackID) => {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // will return a refresh token
    scope: 'https://www.googleapis.com/auth/calendar', // can be a space-delimited string or an array of scopes
    redirect_uri: `${keys.redirect_uris[0]}`,
    state: slackID, // state is a query param passed to redirect_uri,
  })
}
/************************************************************/
/* google calendar authorization callback
*   purpose: endpoint for Google to send authorization tokens
*            store encrypted tokens in mongoDB associated with user
*   @req.query.code: authorization code to request tokens from google
*   @req.query.state: slackID of user who's granting permission to access their calendar
*
*   helper functions: encryptGoogleCalAuth - encryption of tokens
*
*   respond with 401 if google sends us an error;
*   respond with 500 if we are unable to save user to DB
*   respond with 200 upon successfully receiving tokens and updating mongoDB
*/
router.get(REDIRECT_URL, (req, res) => {
  oauth2Client.getToken(req.query.code, (err, tokens) => {
    if(err) {
      console.error('error in retrieving tokens: ',err)
      res.status(401).json(err);
      return;
    }
    User.findOneAndUpdate(
      { slackID: req.query.state },
      { $set: { "googleCalAuth": encryptGoogleCalAuth(tokens) } },
      { new: true }
    ).then((user) => {
      res.status(200).send('Thanks for allowing schedulerBuddy to access your calendar\nGo back to Slack to schedule meetings and reminders');
    }).catch((err) => {
      console.error('error in updating user: ',err);
      res.status(500).send(err);
    })
  });
});


/************************************************************/
/* GOOGLE CALENDAR API FUNCTIONS */

/** getEvents - returns promise based on success of querying for events on
*                a specified date
*   @param slackID: ID associated with slack user who made meeting request
*   @param startDate: day to query about events.  A real copy is passed since
*                     we modify it using setHours
*
*   returns a Promise
*       - on resolve, a list of available times between MIN_HR and MAX_HR for user to meet
*       - on reject, an error from
*/
const getEvents = async (slackID, startDate) => {
    /* time range to search for events */
    const MIN_HR = 7;
    const MAX_HR = 23;
    try{
      /* query for user in mongoDB using slackID */
      let user = await User.findOne({ slackID }).exec();
      /* set authentication using user's decrypted tokens */
      oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));

      return new Promise((resolve, reject) => {
        calendar.events.list({
          // use oauth2Client for authentication, and send object with calendarID,
          //      time interval
          // see query structure at https://developers.google.com/calendar/v3/reference/freebusy/query
          auth: oauth2Client,
          calendarId: 'primary',
          timeMin: new Date(startDate.setHours(MIN_HR)).toISOString(),
          timeMax: new Date(startDate.setHours(MAX_HR)).toISOString(),
        }, (err, data) => {
          if (err) {
            /* reject error from calendar api */
            console.log('The API returned an error: ' + err);
            reject(err)
          }
          /* NOTE: because getAvail is called before getEvents, we know events
          *        will always have at least one event.  If we wanted to make the
          *        query time more efficient, we would take out freebusy query
          *        and handle availablity within getEvents
          */

          /* parse events from data returned by google calendar API */
          const events = data.data.items;
          /* create an array of hours of events on startDate */
          const conflictHrs = events.map(event => new Date(event.start.dateTime).getHours());
          /* filter out time slots from conflictHrs */
          const filteredHrs = _.range(MIN_HR,MAX_HR).filter(hr => !conflictHrs.includes(hr));
          /* return array of datestrings of options */
          resolve(filteredHrs.map(hr => new Date(new Date(startDate).setHours(hr)).toLocaleString()));
        })
      })
    } catch(err) {
      console.error('caught error in getEvents: ', err);
      return new Promise((resolve, reject) => reject(err));
    }
}


/** getAvail - returns promise based on whether user has conflicts with datetime
*     @param user - mongoDB user object
*     @param startDate - start of event
*     @param endDate - end of event
*
*     returns Promise
*        - rejects if error from freebusy
*        - resolves with boolean based on response from freebusy.query
*     helper functions: decryptGoogleCalAuth
*     uses global variables oauth2Client and calendar
*/

// TODO: change getAvail to a better name across entire project
const getAvail = (user, startDate, endDate) => {
  return new Promise( (resolve, reject) => {
      // set credentials using decrypted user tokens
      oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
      /* though freebusy is poorly documented (https://developers.google.com/calendar/v3/reference/freebusy)
      *   it can be used to determine if a user has an event scheduled during
      *   a specified time interval.
      */
      calendar.freebusy.query({
        // use oauth2Client for authentication, and send object with calendarID,
        //      time interval and timezone
        // see query structure at https://developers.google.com/calendar/v3/reference/freebusy/query
        auth: oauth2Client,
        resource: {
          items: [{'id': user.email}],
          timeMin: startDate,
          timeMax: endDate,
         'timeZone': 'America/Los_Angeles',
        }
      }, (err, res) => {
        if(err){
          console.error('error in freebusy.query: ',err);
          reject(err);
        }else {
          // return true if the length of the busy object is 0, false otherwise
          resolve(!!!res.data.calendars[user.email].busy.length);
        }
      })
  });
}

/** setReminder - creates reminder on google calendar and in mongoDB
*   @param slackID - ID associated with slack user who is creating reminder
*   @param payload - parameters returned from dialogFlow
*
*   returns Promise
*     - rejects with err if
*           - unable to find user by slackID
*           - unsuccessful save to google calendar
*           - unsuccessful save to mongodb
*     - resolves if succesfully saves to google calendar and mongodb
*/
const setReminder = async (slackID, payload) => {
      try {
        // format date to proper JS Date object syntax
        let date = new Date(payload[1].replace(/-/g, '/'));
        // find user using slackID
        let user = await User.findOne({ slackID }).exec();
        // throw an error if user is not found
        if(!user) throw 'no user found in mongoDB';
        // set credentials for oauth2Client connection using user's decrypted credentials
        oauth2Client.setCredentials(decryptGoogleCalAuth(user.googleCalAuth));
        // rename second parameter for readability
        let task = payload[0];

        return new Promise((resolve, reject) => {
          // insert event into main (primary) calendar with authentication credentials,
          // resource is the event structure
          // see event structure at https://developers.google.com/calendar/v3/reference/events
          calendar.events.insert({
            auth: oauth2Client,
            calendarId: 'primary',
            resource: {
              'summary': task,
              'start': {
                'date': date.toLocaleDateString(),
                'timeZone': 'America/Los_Angeles'
              },
              'end': {
                'date': date.toLocaleDateString(),
                'timeZone': 'America/Los_Angeles'
              }
            },
          }, (err, gEvent) => {
            if(err) {
              reject(err);
            } else {
              // create reminder document with eventID matching the ID returned from google
              const newReminder = new Reminder({
                eventID: gEvent.data.id,
                day: date.toISOString(),
                subject: task,
                userID: user._id
              });
              newReminder.save()
              .then((rem) => resolve({ success: true }))
              .catch(err => console.log(err));
            }
          });
        })
      } catch(err) {
        console.error(err);
        return new Promise ((resolve, reject) => reject(err));
      }
}


const createInvite = (inviteeID, eventID, hostID) => {
  const invite = new Invite({
    eventID,
    inviteeID,
    hostID,
    status: 'pending'
  });
  invite.save().catch(err => console.error(err));
}


/**  createMeeting - creates a meeting on google calendar and in mongoDB
*   @param payload - object passed from interactive message including meeting details
*
*   returns promise
*       - rejects with error if
*           - user no longer available
*           - no emails associated with slack accounts
*           - unsuccessful save in google calendar
*           - unsuccessful save in mongoDB
*       - resolves with saved meeting details if successful saves in google calendar and mongoDB
*/
const createMeeting = async (payload) => {
    try {
      // destructure payload
      /* slackID - ID associated with slack user
      * invitees - array of slack IDs to be invited
      * startDate - start date string of meeting
      * endDate - end date string of meeting
      */
      let { slackID, invitees, startDate, endDate } = payload;
      // convert startDate and endDate to date objects
      startDate = new Date(startDate);
      endDate = new Date(endDate);
      // find user in mongoDB by slackID
      let user = await User.findOne({ slackID }).exec();
      // throw error if user not found in DB
      if(!user) throw 'no user found in mongoDB';
      // Note: availablity sets credentials of global variable oauth2Client
      //    so we do not need to do so here.  This is a poor security feature
      let availability = await getAvail(user, startDate, endDate);
      if(!availability) throw `user <@${slackID}> not available as of ${new Date(Date.now()).toLocaleString()}`;
      // Note: for future, storing mongoDB userIDs to send invites out to each user
      let userIDs = [];
      // NOTE: to be changed in future
      // crafting title since AI is inconsistent with getting subject
      let title = `meeting hosted by ${user.name} with `;
      // getting emails, names, and mongoDB userID of each slack user
      let emails = await Promise.all(invitees.map( async (invitee, index) => {
        // get user using slackID
        let _user = await User.findOne({ slackID: invitee }).exec();
        if(!_user){
          // if user doesn't exist, create user in mongodB
          //    using information fetched from slack's API
          const user_info = await getUserInfoByID(invitee);
          _user = await User.findOrCreate(invitee, user_info.email, user_info.name);
        }
        // push mongoDB ID into userID array
        userIDs.push(_user._id);
        // concat user's name with title
        title += index === invitees.length ? `and ${_user.name}` : `${_user.name}, `;
        // return object with key 'email' and value of user.email as required
        //    by google calendar API events https://developers.google.com/calendar/v3/reference/events
        return { email: _user.email };
      }));

      // throw an error if no emails found from invitees slackIDs
      if(!emails) throw `no emails found! invitees: ${invitees.toString()}`;


      return new Promise((resolve, reject) => {
        // insert event into main (primary) calendar with authentication credentials,
        // resource is the event structure
        // see event structure at https://developers.google.com/calendar/v3/reference/events
        calendar.events.insert({
          auth: oauth2Client,
          calendarId: 'primary',
          resource: {
            'summary': title,
            'start' : {
              'dateTime': startDate.toISOString(),
              'timeZone': 'America/Los_Angeles'
            },
            'end' : {
              'dateTime': endDate.toISOString(),
              'timeZone': 'America/Los_Angeles'
            },
            'attendees': emails
          }
        }, (err, gEvent) => {
          if(err) {
            reject(err);
          } else {
            // create meeting model with eventID matching event returned from google
            const newMeeting = new Meeting({
              eventID: gEvent.data.id,
              subject: title,
              time: {
                start: startDate,
                end: endDate,
              },
              status: 'confirmed',
              userID: user._id,
              invitees: userIDs
            });
            // save meeting in MONGODB
            newMeeting.save()
            .then((meeting) => {
              // Note: for future use, returning this information to send out
              //        invites and confirmations to invitees
              resolve({ invitees: userIDs,
                hostID: user._id,
                eventID: gEvent.data.id,
                meetingID: meeting._id,
                eventLink: gEvent.data.htmlLink,
              });
            })
            .catch(err => {
              console.error('error in mongodb: ', err);
              reject(err)
            });
          }
        })

      })
    } catch(err) {
      console.error(err);
      return new Promise( (resolove, reject) => reject(err));
    }
}


/* export functions and router */
module.exports = {
  googleRoutes: router,
  generateAuthCB: generateAuthCB,
  getEvents: getEvents,
  setReminder: setReminder,
  createMeeting: createMeeting,
  getAvail: getAvail,
};
